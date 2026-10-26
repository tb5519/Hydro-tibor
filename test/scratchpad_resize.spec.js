const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const ReactDOM = require('react-dom/client');

const directory = path.resolve(__dirname, '../packages/ui-default/components/scratchpad');
const compile = (file) => esbuild.transformSync(fs.readFileSync(path.join(directory, file), 'utf8'), {
    loader: 'tsx', format: 'cjs',
}).code;
const containerSource = compile('index.tsx');
const editorSource = compile('ScratchpadEditorContainer.tsx');
// Exercise the installed Monaco observer that automaticLayout delegates to.
const observerSource = esbuild.buildSync({
    entryPoints: [require.resolve('monaco-editor/esm/vs/editor/browser/config/elementSizeObserver.js')],
    bundle: true, write: false, format: 'cjs', platform: 'browser',
}).outputFiles[0].text;

function frameClock(window) {
    const pending = new Map();
    let sequence = 0;
    window.requestAnimationFrame = (callback) => {
        const id = ++sequence;
        pending.set(id, callback);
        return id;
    };
    window.cancelAnimationFrame = (id) => pending.delete(id);
    return {
        pending,
        tick() {
            const callbacks = [...pending.values()];
            pending.clear();
            callbacks.forEach((callback) => callback(sequence * 16));
        },
    };
}

describe('scratchpad live resizing', () => {
    it('coalesces split-pane notifications within a frame without manual layout or tree renders and cancels on exit', async () => {
        const dom = new JSDOM('<div id="scratchpad"></div>', { pretendToBeVisual: true });
        const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
        global.window = dom.window;
        global.document = dom.window.document;
        global.IS_REACT_ACT_ENVIRONMENT = true;
        const frames = frameClock(dom.window);
        const notifications = [];
        const panes = [];
        let renders = 0;
        let manualLayouts = 0;
        const ctx = {};
        const Allotment = (props) => {
            renders++;
            panes.push(props);
            return React.createElement('div', null, props.children);
        };
        Allotment.Pane = ({ children }) => children;
        const mod = { exports: {} };
        vm.runInNewContext(containerSource, {
            module: mod, exports: mod.exports, window: dom.window, UiContext: {},
            require(id) {
                if (id === 'allotment') return { Allotment };
                if (id === 'react-redux') return {
                    useStore: () => ({}), useDispatch: () => () => {},
                    useSelector: (select) => select({ ui: { activePage: 'problem', pretest: { visible: true }, records: { visible: true } } }),
                };
                if (id === 'jquery') return (selector) => ({
                    get: () => dom.window.document.createElement('div'),
                    trigger: (event) => notifications.push([selector, event]),
                });
                if (id === 'vj/context') return { ctx, Service: class {
                    constructor(context, key) { context[key] = this; }
                } };
                if (id === './themes') return { useScratchpadTheme: () => ({ id: 'cloud' }), scratchpadThemeVariables: () => ({}) };
                if (id === './ScratchpadControlArt') return {
                    ScratchpadArtThemeContext: React.createContext(),
                    ScratchpadControlLabel: ({ children }) => children,
                };
                if (id.startsWith('./') || id.startsWith('@vscode/') || id === 'vj/components/react/DomComponent') return () => null;
                return require(id);
            },
        });
        const root = ReactDOM.createRoot(dom.window.document.getElementById('scratchpad'));
        let unmounted = false;
        try {
            await React.act(async () => root.render(React.createElement(mod.exports.default)));
            ctx.scratchpad.editor = { layout: () => manualLayouts++ };
            const initialRenders = renders;
            assert.equal(panes.length, 2);
            await React.act(async () => {
                for (let n = 0; n < 30; n++) panes[n % 2].onChange([400 + n, 800 - n]);
            });
            assert.equal(frames.pending.size, 1);
            assert.equal(notifications.length, 0);
            await React.act(async () => frames.tick());
            assert.deepEqual(notifications, [['#scratchpad', 'vjScratchpadRelayout']]);
            assert.equal(manualLayouts, 0, 'Monaco owns its container layout; split-pane changes must not duplicate it');
            assert.equal(renders, initialRenders, 'resizing must not force React to rerender the whole editor');
            panes[0].onChange([500, 700]);
            await React.act(async () => frames.tick());
            assert.equal(notifications.length, 2, 'continued dragging updates on the next frame, without a 500ms quiet period');
            panes[1].onChange([400, 200, 200]);
            assert.equal(frames.pending.size, 1);
            await React.act(async () => root.unmount());
            unmounted = true;
            assert.equal(frames.pending.size, 0);
            frames.tick();
            assert.equal(notifications.length, 2);
        } finally {
            if (!unmounted) await React.act(async () => root.unmount());
            global.window = previous.window;
            global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act;
            dom.window.close();
        }
    });

    it('enables container observation despite saved settings and disposes the editor without changing the draft', async () => {
        const dom = new JSDOM('');
        const draft = 'print("keep my draft")';
        const configurations = [];
        let created = 0;
        let disposed = 0;
        let failSave = false;
        const saved = [];
        const model = { dispose() {}, getValue: () => draft };
        const editor = {
            getValue: () => `${draft}\n# final keystroke`,
            onDidChangeModelContent: () => ({ dispose() {} }),
            updateOptions: (options) => configurations.push(options),
            dispose: () => disposed++,
        };
        const monaco = {
            Uri: { parse: (value) => value },
            editor: {
                getModel: () => model, setTheme() {},
                create: (element, config) => { created++; configurations.push(config); return editor; },
                ShowLightbulbIconMode: { On: 'on' }, EndOfLinePreference: { LF: 1 },
            },
        };
        const mod = { exports: {} };
        vm.runInNewContext(editorSource, {
            module: mod, exports: mod.exports, window: dom.window,
            UserContext: {}, UiContext: { pdoc: { pid: 'P1000' } },
            require(id) {
                if (id === 'react-redux') return { connect: () => (component) => component };
                if (id === './themes') return {
                    attachScratchpadMonacoTheme: () => () => {}, currentScratchpadTheme: () => ({}), scratchpadMonacoThemeName: () => 'cloud',
                };
                if (id === 'vj/context') return { ctx: { scratchpad: { init() {} } } };
                if (id === 'vj/components/monaco/loader') return { load: async () => ({
                    monaco, customOptions: { automaticLayout: false }, registerAction: async () => {},
                }) };
                return require(id);
            },
        });
        try {
            const component = new mod.exports.default({ value: draft, language: 'python', settings: { automaticLayout: false, fontSize: 18 },
                handleUpdateCode(value) { if (failSave) throw new Error('Storage full'); saved.push(value); },
            });
            component.containerElement = dom.window.document.createElement('div');
            await component.componentDidMount();
            assert.equal(configurations[0].automaticLayout, true);
            await component.componentDidUpdate({ language: 'python' });
            assert.equal(configurations.at(-1).automaticLayout, true);
            assert.equal(configurations.at(-1).fontSize, 18);
            assert.equal(created, 1);
            assert.equal(component.model.getValue(), draft);
            assert.equal(dom.window.dispatchEvent(new dom.window.Event('hydro:daily-quiz-redirect', { cancelable: true })), true);
            assert.deepEqual(saved, [`${draft}\n# final keystroke`], 'flushes the actual editor value before navigation');
            failSave = true;
            assert.equal(dom.window.dispatchEvent(new dom.window.Event('hydro:daily-quiz-redirect', { cancelable: true })), false,
                'keeps the only copy in the editor when storage fails');
            component.componentWillUnmount();
            assert.equal(disposed, 1, 'Monaco disposal releases the automatic container observer');
            assert.equal(dom.window.dispatchEvent(new dom.window.Event('hydro:daily-quiz-redirect', { cancelable: true })), true,
                'unmount removes the draft listener');
        } finally { dom.window.close(); }
    });

    it('the installed Monaco observer follows width and toolbar-height changes per frame and disconnects on exit', () => {
        const dom = new JSDOM('', { pretendToBeVisual: true });
        const frames = frameClock(dom.window);
        let resize;
        let observed;
        let disconnected = false;
        class ResizeObserver {
            constructor(callback) { resize = callback; }
            observe(element) { observed = element; }
            disconnect() { disconnected = true; }
        }
        const mod = { exports: {} };
        vm.runInNewContext(observerSource, {
            module: mod, exports: mod.exports, window: dom.window, document: dom.window.document,
            navigator: dom.window.navigator, ResizeObserver, console, setTimeout, clearTimeout, queueMicrotask,
        });
        const container = dom.window.document.createElement('div');
        const observer = new mod.exports.ElementSizeObserver(container);
        const changes = [];
        observer.onDidChange(() => changes.push([observer.getWidth(), observer.getHeight()]));
        try {
            observer.startObserving();
            assert.strictEqual(observed, container);
            resize([{ contentRect: { width: 700, height: 400 } }]);
            assert.deepEqual(changes, [[700, 400]]);
            resize([{ contentRect: { width: 690, height: 400 } }]);
            resize([{ contentRect: { width: 680, height: 360 } }]);
            assert.equal(changes.length, 1);
            frames.tick();
            assert.deepEqual(changes.at(-1), [680, 360], 'keeps the latest width and toolbar-reduced height');
            frames.tick();
            resize([{ contentRect: { width: 680, height: 320 } }]);
            assert.deepEqual(changes.at(-1), [680, 320], 'image height can change with no split-pane callback');
            observer.dispose();
            assert.equal(disconnected, true);
            const before = changes.length;
            frames.tick();
            assert.equal(changes.length, before);
        } finally { observer.dispose(); dom.window.close(); }
    });

});
