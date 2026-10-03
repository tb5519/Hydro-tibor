const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../build/scratch/editor.jsx'), 'utf8');
const code = transformSync(source, { format: 'cjs', loader: 'jsx' }).code;

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
    };
    const window = {
        addEventListener: (name, listener) => listeners.set(name, listener),
        ReduxStore: { dispatch() {}, subscribe() {}, getState: () => ({ scratchGui: { projectTitle: '作品' } }) },
    };
    vm.runInNewContext(code, {
        require(name) { assert(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; },
        window, parent, document: { documentElement: { dataset: {} } }, location: { hash: '#channel=runtime-channel' },
        URLSearchParams, ArrayBuffer, Set, process: { env: {} },
    });
    return { machine, sent, parent,
        init(mode, overrides = {}) {
            return listeners.get('message')({ source: parent,
                data: { channel: 'runtime-channel', type: 'init', mode, project: new ArrayBuffer(0), readOnly: mode !== 'editor' },
                ...overrides });
        },
    };
}

describe('isolated Scratch runtime bridge', () => {
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
});
