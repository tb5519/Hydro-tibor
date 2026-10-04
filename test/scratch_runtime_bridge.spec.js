const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../build/scratch/editor.jsx'), 'utf8');
const code = transformSync(source, { format: 'cjs', loader: 'jsx' }).code;
const communityCode = transformSync(fs.readFileSync(path.join(__dirname, '../build/scratch/community-state.js'), 'utf8'), {
    format: 'cjs', loader: 'js',
}).code;
const activityCode = transformSync(fs.readFileSync(path.join(__dirname, '../build/scratch/player-activity.js'), 'utf8'), {
    format: 'cjs', loader: 'js',
}).code;

function bridge() {
    const sent = [];
    const listeners = new Map();
    const machine = new EventEmitter();
    Object.assign(machine, {
        extensionManager: { loadExtensionURL() {} }, runtime: new EventEmitter(),
        stopAll() { this.emit('PROJECT_RUN_STOP'); }, start() {},
        greenFlag() { this.emit('PROJECT_RUN_START'); },
        async loadProject() {},
    });
    const parent = { postMessage: data => sent.push(data) };
    const identity = value => value;
    const document = { documentElement: { dataset: {} },
        addEventListener: (name, listener) => listeners.set(`document:${name}`, listener),
        removeEventListener: (name) => listeners.delete(`document:${name}`),
    };
    const window = {
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: (name) => listeners.delete(name),
        setInterval: () => 1, clearInterval() {}, setTimeout: () => 1,
        performance: { now: () => 1000 },
        document,
        ReduxStore: { dispatch() {}, subscribe() {}, getState: () => ({ scratchGui: { projectTitle: '作品' } }) },
    };
    const communityModule = { exports: {} };
    vm.runInNewContext(communityCode, { module: communityModule, exports: communityModule.exports, window, TextEncoder });
    const activityModule = { exports: {} };
    vm.runInNewContext(activityCode, { module: activityModule, exports: activityModule.exports, window });
    const dependencies = {
        './import-first': {}, react: { createElement: () => ({}) },
        redux: { compose: () => identity }, '../containers/gui.jsx': () => {},
        '../lib/app-state-hoc.jsx': identity, '../lib/error-boundary-hoc.jsx': () => identity,
        '../reducers/vm': { vmInitialState: machine },
        '../reducers/project-title': { setProjectTitle: title => ({ title }) },
        '../reducers/project-changed': { setProjectUnchanged: () => ({}) },
        '../reducers/mode': { setPlayer: () => ({}) }, '../reducers/theme': { setTheme: () => ({}) },
        '../lib/themes': { Theme: { light: { set: () => ({}) } }, ACCENT_BLUE: 'blue' },
        '../lib/tw-embed-fullscreen-hoc.jsx': identity, './app-target': () => {},
        '../lib/onebyone-preset-import': { createPresetBridge: () => ({}) },
        '../lib/onebyone-community-state': communityModule.exports,
        '../lib/onebyone-player-activity': activityModule.exports,
    };
    vm.runInNewContext(code, {
        require(name) { assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; },
        window, parent, document, location: { hash: '#channel=runtime-channel' },
        URLSearchParams, ArrayBuffer, Set, process: { env: {} },
    });
    return { machine, sent, parent,
        input(name = 'keydown', isTrusted = true) {
            listeners.get(`document:${name}`)?.({ isTrusted });
        },
        init(mode, overrides = {}, data = {}) {
            return listeners.get('message')({ source: parent,
                data: { channel: 'runtime-channel', type: 'init', mode, project: new ArrayBuffer(0), readOnly: mode !== 'editor', ...data },
                ...overrides });
        },
        message(type, data = {}, source = parent, channel = 'runtime-channel') {
            return listeners.get('message')({ source, data: { type, channel, ...data } });
        },
    };
}

describe('isolated Scratch runtime bridge', () => {
    it('forwards trusted user activity only after the player loads, without treating automatic runs as activity', async () => {
        const h = bridge();
        h.input();
        assert.equal(h.sent.length, 0);
        await h.init('player');
        assert.equal(h.sent.filter(item => item.type === 'userActivity').length, 0);
        h.input('keydown', false);
        assert.equal(h.sent.filter(item => item.type === 'userActivity').length, 0);
        h.input();
        assert.deepEqual(JSON.parse(JSON.stringify(h.sent.at(-1))), { channel: 'runtime-channel', type: 'userActivity' });
        const editor = bridge();
        await editor.init('editor');
        editor.input();
        assert.equal(editor.sent.filter(item => item.type === 'userActivity').length, 0);
    });
    it('sends loaded before the first actual project running event and forwards later stops/restarts', async () => {
        const h = bridge();
        h.machine.emit('PROJECT_RUN_START');
        assert.equal(h.sent.length, 0, 'startup/default-project activity is not reported');
        await h.init('player');
        assert.deepEqual(h.sent.map(item => item.type), ['loaded', 'runState']);
        assert.equal(h.sent[1].running, true);
        h.machine.emit('PROJECT_RUN_STOP');
        h.machine.emit('PROJECT_RUN_START');
        assert.deepEqual(h.sent.slice(1).map(item => item.running), [true, false, true]);
        assert(h.sent.every(item => item.channel === 'runtime-channel'));
        assert.deepEqual(Object.keys(h.sent[1]).sort(), ['channel', 'running', 'type']);
    });

    it('does not announce running just because an empty project loaded', async () => {
        const h = bridge();
        h.machine.greenFlag = () => {}; // A project without executable green-flag hats stays idle.
        await h.init('player');
        assert.deepEqual(h.sent.map(item => item.type), ['loaded']);
    });

    it('keeps editable Scratch work untracked and rejects init from another source/channel', async () => {
        const h = bridge();
        await h.init('player', { source: {} });
        await h.init('player', { data: { channel: 'other', type: 'init', mode: 'player' } });
        h.machine.emit('PROJECT_RUN_START');
        assert.equal(h.sent.length, 0);
        await h.init('editor');
        h.machine.emit('PROJECT_RUN_START');
        h.machine.emit('PROJECT_RUN_STOP');
        assert.deepEqual(h.sent.map(item => item.type), ['loaded']);
    });

    it('restores community variables after loading the SB3 and before starting scripts, then protects saved/flush messages by parent and channel', async () => {
        const h = bridge();
        const score = { id: 'score', type: '', value: 0 };
        const names = { id: 'names', type: 'list', value: [] };
        h.machine.loadProject = async () => {
            h.machine.runtime.targets = [{ isStage: true, variables: { score, names } }];
        };
        const order = [];
        h.machine.start = () => order.push(['start', score.value, [...names.value]]);
        h.machine.greenFlag = () => { order.push(['run', score.value, [...names.value]]); h.machine.emit('PROJECT_RUN_START'); };
        await h.init('player', {}, { communityState: { revision: 3, values: [
            { key: '["stage","","score"]', kind: 'variable', value: 15 },
            { key: '["stage","","names"]', kind: 'list', value: ['王五'] },
        ] } });
        assert.deepEqual(order, [['start', 15, ['王五']], ['run', 15, ['王五']]]);
        score.value = 20;
        await h.message('flushCommunityState', {}, {});
        await h.message('flushCommunityState', {}, h.parent, 'wrong');
        assert.equal(h.sent.filter(item => item.type === 'communityStateSync').length, 0);
        await h.message('flushCommunityState');
        const pending = h.sent.at(-1);
        assert.equal(pending.type, 'communityStateSync');
        const ack = { id: pending.id, revision: 4, values: [{ key: '["stage","","score"]', kind: 'variable', value: 30 }] };
        await h.message('communityStateSaved', ack, {});
        await h.message('communityStateSaved', ack, h.parent, 'wrong');
        assert.equal(score.value, 20);
        await h.message('communityStateSaved', ack);
        assert.equal(score.value, 30);
    });

    it('never restores community state or handles state messages in an editable author project', async () => {
        const h = bridge();
        const score = { id: 'score', type: '', value: 0 };
        h.machine.runtime.targets = [{ isStage: true, variables: { score } }];
        await h.init('editor', {}, { communityState: { revision: 3, values: [
            { key: '["stage","","score"]', kind: 'variable', value: 999 },
        ] } });
        assert.equal(score.value, 0);
        score.value = 20;
        await h.message('flushCommunityState');
        assert.equal(h.sent.filter(item => item.type === 'communityStateSync').length, 0);
    });
});
