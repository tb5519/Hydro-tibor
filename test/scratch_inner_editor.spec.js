const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vmModule = require('node:vm');
const { execFileSync } = require('node:child_process');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

async function harness() {
    const listeners = {};
    const sent = [];
    const calls = [];
    const subscribers = [];
    const state = { scratchGui: { projectTitle: '默认作品' } };
    const defaultProject = new Uint8Array([1, 2, 3]).buffer;
    let props;
    const project = {
        extensionManager: { loadExtensionURL: async () => {} },
        renderer: {
            requestSnapshot: (callback) => { calls.push('snapshot'); callback('data:image/png;base64,preview'); },
            draw: () => calls.push('draw'),
        },
        stopAll: () => calls.push('stop'),
        quit: () => calls.push('quit'),
        loadProject: async (data) => calls.push(['load', [...new Uint8Array(data)]]),
        start: () => calls.push('start'),
        greenFlag: () => calls.push('greenFlag'),
        saveProjectSb3: async () => ({ arrayBuffer: async () => defaultProject.slice(0) }),
        on: (event, callback) => { listeners[event] = callback; },
        runtime: { on: (event, callback) => { listeners[`runtime:${event}`] = callback; } },
    };
    const store = {
        getState: () => state,
        subscribe: (callback) => subscribers.push(callback),
        dispatch(action) {
            if (action.type === 'title') state.scratchGui.projectTitle = action.title;
            subscribers.forEach((callback) => callback());
        },
    };
    const parent = { postMessage: (message) => sent.push(message) };
    const window = {
        ReduxStore: store,
        addEventListener: (event, callback) => { listeners[event] = callback; },
    };
    const dependencies = {
        './import-first': {},
        react: { createElement: (_, value) => value },
        redux: { compose: (...fns) => (value) => fns.reduceRight((next, fn) => fn(next), value) },
        '../containers/gui.jsx': () => {},
        '../lib/app-state-hoc.jsx': (value) => value,
        '../lib/error-boundary-hoc.jsx': () => (value) => value,
        '../lib/tw-embed-fullscreen-hoc.jsx': (value) => value,
        '../reducers/vm': { vmInitialState: project },
        '../reducers/project-title': { setProjectTitle: (title) => ({ type: 'title', title }) },
        '../reducers/project-changed': { setProjectUnchanged: () => ({ type: 'unchanged' }) },
        '../reducers/mode': { setPlayer: (player) => ({ type: 'player', player }) },
        '../reducers/theme': { setTheme: () => ({ type: 'theme' }) },
        '../lib/themes': { Theme: { light: { set: () => ({}) } }, ACCENT_BLUE: 'blue' },
        './app-target': (value) => { props = value; },
    };
    const code = transformSync(fs.readFileSync(path.resolve(__dirname, '../build/scratch/editor.jsx'), 'utf8'), {
        loader: 'jsx', format: 'cjs',
    }).code;
    vmModule.runInNewContext(code, {
        require: (name) => dependencies[name],
        window, parent, URLSearchParams, ArrayBuffer, Uint8Array, Promise,
        location: { hash: '#channel=local-test' },
        process: { env: { ROOT: '/scratch-editor/' } },
        document: {
            documentElement: { dataset: {} },
            createElement: () => ({
                getContext: () => ({ fillRect: () => {}, drawImage: () => {} }),
                toDataURL: () => 'data:image/png;base64,cover',
            }),
        },
        Image: class {
            constructor() { this.naturalWidth = 480; this.naturalHeight = 360; }
            set src(_) { this.onload(); }
        },
        setTimeout: (callback, delay) => { if (delay === 80) queueMicrotask(callback); return 1; },
        clearTimeout: () => {},
    });
    await props.onProjectLoaded();
    const message = (type, data = {}, source = parent) => listeners.message({
        source, data: { type, channel: 'local-test', ...data },
    });
    return { message, sent, calls, store, listeners, props };
}

describe('native Scratch editor modes', () => {
    it('loads a player directly into the stage, starts it, and never grants export', async () => {
        const editor = await harness();
        assert.equal(editor.props.showOpenFilePicker, null);
        assert.equal(editor.props.showSaveFilePicker, null);
        assert(editor.props.isEmbedded && editor.props.isPlayerOnly);
        await editor.message('init', { mode: 'player', readOnly: false, title: '播放作品' });
        assert.deepEqual(editor.calls.filter((call) => typeof call === 'string'), ['stop', 'start', 'greenFlag']);
        assert.equal(editor.sent.filter((message) => message.type === 'loaded').length, 1);
        await editor.message('export', { id: 'not-allowed' });
        assert(!editor.sent.some((message) => message.type === 'exported'));
        editor.store.dispatch({ type: 'title', title: '不能改名' });
        assert(!editor.sent.some((message) => message.type === 'titleChanged'));
    });

    it('reuses one thumbnail frame without running scripts and resets missing projects to the default', async () => {
        const editor = await harness();
        await editor.message('init', { mode: 'thumbnail', id: 'first', project: new Uint8Array([9]).buffer });
        await editor.message('preview', { id: 'empty' });
        await editor.message('preview', { id: 'third', project: new Uint8Array([8]).buffer });
        assert.deepEqual(editor.calls.filter((call) => Array.isArray(call)), [
            ['load', [9]], ['load', [1, 2, 3]], ['load', [8]],
        ]);
        assert(!editor.calls.includes('start'));
        assert(!editor.calls.includes('greenFlag'));
        assert.deepEqual(editor.sent.filter((message) => message.type === 'thumbnail').map((message) => [
            message.id, message.thumbnail,
        ]), [['first', 'data:image/png;base64,cover'], ['empty', 'data:image/png;base64,cover'],
            ['third', 'data:image/png;base64,cover']]);
        await editor.message('export', { id: 'not-allowed' });
        assert(!editor.sent.some((message) => message.type === 'exported'));
    });

    it('sends native title edits only after initialization and accepts messages only from its parent', async () => {
        const editor = await harness();
        await editor.message('init', { mode: 'player' }, {});
        assert.equal(editor.calls.length, 0);
        await editor.message('init', { mode: 'editor', readOnly: false, title: '初始名字' });
        assert(!editor.calls.includes('greenFlag'));
        assert(!editor.sent.some((message) => message.type === 'titleChanged' || message.type === 'dirty'));
        editor.store.dispatch({ type: 'title', title: '我的海底探险' });
        editor.store.dispatch({ type: 'unchanged' });
        assert.deepEqual(editor.sent.filter((message) => message.type === 'titleChanged').map((message) => message.title),
            ['我的海底探险']);
        editor.listeners.PROJECT_CHANGED();
        assert.equal(editor.sent.filter((message) => message.type === 'dirty').length, 1);
        editor.listeners['runtime:PROJECT_LOADED']();
        assert.equal(editor.sent.filter((message) => message.type === 'dirty').length, 2,
            'importing a file with the same title must still mark the host work as unsaved');
        await editor.message('preview', { id: 'wrong-mode', project: new Uint8Array([4]).buffer });
        assert(!editor.calls.some((call) => Array.isArray(call)));
    });
});

describe('prepared Scratch local file importer', () => {
    it('always clicks a standard file input even if a nested caller supplies an unavailable native picker', () => {
        const source = execFileSync('tar', ['-xOf', path.resolve(__dirname,
            '../packages/ui-default/public/scratch-editor/source.tar.gz'), 'src/lib/sb-file-uploader-hoc.jsx'],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const mod = { exports: {} };
        const inputs = [];
        const appended = [];
        const dependencies = {
            react: require('react'),
            'prop-types': require('prop-types'),
            'lodash.bindall': (target, names) => names.forEach((name) => { target[name] = target[name].bind(target); }),
            'react-intl': { injectIntl: (value) => value, intlShape: {} },
            'react-redux': { connect: () => (value) => value },
            './log': {},
            './shared-messages': {},
            '../reducers/tw': {},
            '../reducers/project-state': { LoadingStates: [] },
            '../reducers/project-title': {},
            '../reducers/modals': {},
            '../reducers/menus': {},
        };
        vmModule.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, {
            module: mod, exports: mod.exports,
            require: (name) => dependencies[name],
            FileReader: class {},
            document: {
                createElement(tag) {
                    const input = { tag, clicked: false, click() { this.clicked = true; } };
                    inputs.push(input);
                    return input;
                },
                body: { appendChild: (input) => appended.push(input) },
            },
        });
        const Uploader = mod.exports.default(() => null);
        assert.equal(Uploader.defaultProps.showOpenFilePicker, null);
        const uploader = new Uploader({
            showOpenFilePicker: () => { throw new Error('not granted'); },
        });
        uploader.createFileObjects();
        assert.equal(inputs.length, 1);
        assert.equal(inputs[0].tag, 'input');
        assert.equal(inputs[0].type, 'file');
        assert.equal(inputs[0].accept, '.sb,.sb2,.sb3');
        assert.equal(inputs[0].clicked, true);
        assert.equal(appended[0], inputs[0]);
    });
});
