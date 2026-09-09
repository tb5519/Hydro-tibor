const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { JSDOM } = require('jsdom');

const source = transformSync(fs.readFileSync(path.resolve(__dirname,
    '../packages/ui-default/components/scratchpad/ScratchpadToolbarContainer.jsx'), 'utf8'), {
    loader: 'jsx', format: 'cjs',
}).code;

function harness({ replay = true, lang = 'python-old', languageKnown = true } = {}) {
    const actions = [];
    const requests = [];
    let dispatchers;
    const context = {
        pdoc: { config: { type: 'default', langs: ['python3', 'cpp'] } }, canViewRecord: true,
        postSubmitUrl: '/submit',
        ...(replay ? { recordReplay: { rid: '6aa000000000000000000001', lang: 'python-old', langName: 'Python 历史版' } } : {}),
    };
    const mod = { exports: {} };
    const ToolbarButton = ({ children, disabled, onClick, activated, ...props }) => (
        React.createElement('button', { ...props, type: 'button', disabled, onClick }, children)
    );
    const ToolbarItem = ({ children, ...props }) => React.createElement('div', props, children);
    vm.runInNewContext(source, {
        module: mod, exports: mod.exports, UiContext: context,
        window: { LANGS: languageKnown ? { 'python-old': { display: 'Python 旧版' } } : {} },
        setTimeout,
        require: (id) => {
            if (id === 'react-redux') return { connect: (_, dispatchMap) => (component) => {
                dispatchers = dispatchMap((action) => actions.push(action));
                return component;
            } };
            if (id === 'vj/components/react/IconComponent') return () => null;
            if (id === './ScratchpadThemePicker') return () => null;
            if (id === './ToolbarComponent') return {
                default: ToolbarItem, __esModule: true,
                ToolbarItemComponent: ToolbarItem, ToolbarButtonComponent: ToolbarButton,
            };
            if (id === 'vj/utils') return {
                i18n: (value) => value,
                getAvailableLangs: () => ({ python3: { display: 'Python 3' }, cpp: { display: 'C++' } }),
                request: { post: (...args) => { requests.push(args); return Promise.resolve({}); } },
            };
            return require(id);
        },
    });
    const props = {
        editorLang: lang, editorCode: 'print("original")', pretestInput: 'sample',
        pretestVisible: true, recordsVisible: true, formalSubmitCount: 0,
        setEditorLanguage: (value) => actions.push({ type: 'change-language', payload: value }),
        ...dispatchers,
    };
    const toolbar = new mod.exports.default(props);
    return {
        actions, requests, props, dispatchers,
        render() {
            const dom = new JSDOM(renderToStaticMarkup(toolbar.render()));
            return dom.window.document;
        },
        setLanguage(value) { toolbar.props = { ...toolbar.props, editorLang: value }; props.editorLang = value; },
    };
}

describe('imported programming record language', () => {
    it('preserves a disabled historical language and blocks both buttons and dispatch calls', () => {
        const h = harness();
        assert.equal(h.actions.length, 0);
        const document = h.render();
        const select = document.querySelector('select');
        assert.equal(select.value, 'python-old');
        assert.equal(select.disabled, false);
        assert.equal(select.selectedOptions[0].disabled, true);
        assert.match(select.selectedOptions[0].textContent, /Python 旧版（已停用）/);
        assert.match(document.querySelector('[role="status"]').textContent, /原语言已停用，请先切换语言/);
        assert.equal(document.querySelector('[data-global-hotkey="f9"]').disabled, true);
        assert.equal(document.querySelector('[data-global-hotkey="f10"]').disabled, true);
        h.dispatchers.postPretest(h.props);
        h.dispatchers.postSubmit(h.props);
        assert.equal(h.requests.length, 0);
    });

    it('shows the server-provided historical language name when the browser language catalog dropped it', () => {
        const h = harness({ languageKnown: false });
        assert.match(h.render().querySelector('select').selectedOptions[0].textContent, /Python 历史版（已停用）/);
    });

    it('enables normal execution after choosing an allowed language without changing imported code', () => {
        const h = harness();
        h.setLanguage('python3');
        const document = h.render();
        assert.equal(document.querySelector('select').value, 'python3');
        assert.equal(document.querySelector('[role="status"]'), null);
        assert.equal(document.querySelector('[data-global-hotkey="f9"]').disabled, false);
        assert.equal(document.querySelector('[data-global-hotkey="f10"]').disabled, false);
        h.dispatchers.postPretest(h.props);
        h.dispatchers.postSubmit(h.props);
        assert.equal(h.requests.length, 2);
        for (const [, data] of h.requests) {
            assert.equal(data.lang, 'python3');
            assert.equal(data.code, 'print("original")');
        }
    });

    it('does not block an available imported language or change ordinary draft fallback behavior', () => {
        const valid = harness({ lang: 'python3' });
        assert.equal(valid.actions.length, 0);
        assert.equal(valid.render().querySelector('[data-global-hotkey="f10"]').disabled, false);
        const ordinary = harness({ replay: false });
        assert.ok(ordinary.actions.some((action) => action.type === 'SCRATCHPAD_EDITOR_SET_LANG' && action.payload === 'python3'));
    });
});
