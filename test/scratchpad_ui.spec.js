const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const ReactDOM = require('react-dom/client');
const { Provider } = require('react-redux');
const { createStore } = require('redux');

const uiRoot = path.resolve(__dirname, '../packages/ui-default');
const compile = (entry) => esbuild.buildSync({
    entryPoints: [path.join(uiRoot, entry)], bundle: true, write: false,
    packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const sources = Object.fromEntries(['ScratchpadToolbarContainer', 'ScratchpadRecordsContainer', 'DataInputComponent']
    .map((name) => [name, compile(`components/scratchpad/${name}.jsx`)]));
const recordSource = compile('constant/record.js');
const statusModule = { exports: {} };
vm.runInNewContext(compile('../common/status.ts'), { module: statusModule, exports: statusModule.exports });
const { STATUS } = statusModule.exports;
const initialState = () => ({
    ui: { pretest: { visible: true }, records: { visible: true }, formalSubmitRids: [], isPosting: false,
        pretestWaitSec: 0, submitWaitSec: 0 },
    editor: { lang: 'python3', code: 'print(1)' },
    pretest: { input: '1', isRunning: false },
    records: { rows: [], items: {} },
});

async function harness(name, options = {}) {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.test/p/P1002' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window;
    global.document = dom.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const actions = [];
    const posts = [];
    const store = createStore((state = options.state || initialState(), action) => {
        actions.push(action);
        return action.type === 'test/replace' ? action.state : state;
    });
    const execute = (code) => {
        const mod = { exports: {} };
        vm.runInNewContext(code, {
            module: mod, exports: mod.exports, window: dom.window, CustomEvent: dom.window.CustomEvent, setTimeout,
            UiContext: { pdoc: { config: { type: 'default' } }, canViewRecord: true,
                postSubmitUrl: '/submit', getSubmissionsUrl: '/submissions', ...options.context },
            require(id) {
                if (id === 'vj/components/react/IconComponent') return ({ name: icon }) => React.createElement('i', { 'data-icon': icon });
                if (id === 'vj/components/notification') return { error() {} };
                if (id === '@hydrooj/common') return statusModule.exports;
                if (id === 'vj/constant/record') return execute(recordSource);
                if (id === 'vj/utils') {
                    return {
                        getAvailableLangs: () => ({ python3: { display: 'Python 3' }, cpp: { display: 'C++' } }),
                        i18n: (value) => value, mongoId: () => ({ timestamp: 0 }),
                        request: {
                            post: async (...args) => { posts.push(args); return { rid: '6aa000000000000000000001' }; },
                            get: async () => ({ rdocs: [] }),
                        },
                    };
                }
                return require(id);
            },
        });
        return mod.exports;
    };
    const Component = execute(sources[name]).default;
    const root = ReactDOM.createRoot(dom.window.document.getElementById('root'));
    const render = () => root.render(React.createElement(Provider, { store }, React.createElement(Component, options.props)));
    await React.act(async () => render());
    const click = async (selector) => {
        const element = dom.window.document.querySelector(selector);
        assert.ok(element, selector);
        await React.act(async () => element.click());
    };
    return {
        document: dom.window.document, actions, posts, click,
        async replace(state) { await React.act(async () => store.dispatch({ type: 'test/replace', state })); },
        async close() {
            await React.act(async () => root.unmount());
            dom.window.close();
            global.window = previous.window;
            global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        },
    };
}

describe('scratchpad controls and result presentation', () => {
    it('preserves panel toggles, hotkeys, formal submission registration and native disabled controls', async () => {
        const h = await harness('ScratchpadToolbarContainer');
        try {
            assert.equal(h.document.querySelector('[data-global-hotkey="alt+p"]').getAttribute('aria-pressed'), 'true');
            assert.equal(h.document.querySelector('.select').getAttribute('aria-label'), 'Language');
            await h.click('[data-global-hotkey="alt+p"]');
            assert.ok(h.actions.some((action) => action.type === 'SCRATCHPAD_UI_TOGGLE_VISIBILITY' && action.payload.uiElement === 'pretest'));
            await h.click('[data-global-hotkey="f9"]');
            assert.equal(h.posts[0][1].pretest, true);
            await h.click('[data-global-hotkey="f10"]');
            assert.equal(h.posts[1][1].source, 'scratchpad');
            assert.equal(h.posts[1][1].pretest, undefined);
            assert.ok(h.actions.some((action) => action.type === 'SCRATCHPAD_FORMAL_SUBMIT_REGISTER'));
            const disabledState = initialState();
            disabledState.ui.isPosting = true;
            await h.replace(disabledState);
            assert.equal(h.document.querySelector('[data-global-hotkey="f10"]').disabled, true);
            assert.equal(h.document.querySelector('.select').disabled, true);
            await h.click('[data-global-hotkey="f10"]');
            await h.click('[data-global-hotkey="f9"]');
            assert.equal(h.posts.length, 2);
            assert.ok(h.document.querySelector('[name="problem-sidebar__quit-scratchpad"][data-global-hotkey="alt+q"]'));
        } finally { await h.close(); }
    });

    it('keeps IDE mode run and pretest controls without formal submit or exit', async () => {
        const h = await harness('ScratchpadToolbarContainer', { context: { ideMode: true } });
        try {
            assert.ok(h.document.querySelector('[data-global-hotkey="f9"]'));
            assert.ok(h.document.querySelector('[data-global-hotkey="alt+p"]'));
            assert.equal(h.document.querySelector('[data-global-hotkey="f10"]'), null);
            assert.equal(h.document.querySelector('[data-global-hotkey="alt+q"]'), null);
        } finally { await h.close(); }
    });

    it('identifies the reviewed student and offers no teacher submission or self-test controls', async () => {
        const h = await harness('ScratchpadToolbarContainer', { context: { homeworkReview: { uid: 23, name: '小明' } } });
        try {
            assert.match(h.document.querySelector('.scratchpad__review-label').textContent, /小明 的作答.*只读/);
            assert.equal(h.document.querySelector('.select').disabled, true);
            for (const hotkey of ['f9', 'f10', 'alt+p']) {
                assert.equal(h.document.querySelector(`[data-global-hotkey="${hotkey}"]`), null);
            }
            assert.equal(h.posts.length, 0);
            assert.ok(h.document.querySelector('[data-global-hotkey="alt+r"]'));
            assert.equal(h.document.querySelector('[data-homework-review-copy]'), null);
        } finally { await h.close(); }
    });

    it('offers copying a reviewed submission without automatically submitting or running code', async () => {
        const h = await harness('ScratchpadToolbarContainer', { context: {
            homeworkReview: { uid: 23, name: '小明', rid: '6aa000000000000000000001', ownAnswerUrl: '/d/class-a/p/P1002' },
        } });
        try {
            const button = h.document.querySelector('[data-homework-review-copy]');
            assert.ok(button);
            assert.equal(button.disabled, false);
            assert.equal(button.type, 'button');
            assert.match(button.textContent, /复制到我的作答/);
            assert.match(button.title, /替换你的本题草稿/);
            await h.click('[data-homework-review-copy]');
            assert.equal(h.posts.length, 0);
            assert.equal(h.actions.some((action) => action.type.startsWith('SCRATCHPAD_POST_')), false);
            assert.equal(h.document.querySelector('[data-global-hotkey="f10"]'), null);
            assert.equal(h.document.querySelector('[data-global-hotkey="f9"]'), null);
        } finally { await h.close(); }
    });

    it('disables copying when the reviewed problem cannot be opened for independent work', async () => {
        const h = await harness('ScratchpadToolbarContainer', { context: {
            homeworkReview: { uid: 23, name: '小明', rid: '6aa000000000000000000001', ownAnswerUrl: '' },
        } });
        try {
            const button = h.document.querySelector('[data-homework-review-copy]');
            assert.ok(button);
            assert.equal(button.disabled, true);
            assert.match(button.title, /没有这道题的独立作答权限/);
            await h.click('[data-homework-review-copy]');
            assert.equal(h.posts.length, 0);
        } finally { await h.close(); }
    });

    it('shows mixed case statuses with their own colors, omits zero counts and labels record columns', async () => {
        const state = initialState();
        state.records = { rows: ['one'], items: { one: {
            _id: '6aa000000000000000000001', status: STATUS.STATUS_WRONG_ANSWER, memory: 4000, time: 120,
            testCases: [{ status: STATUS.STATUS_ACCEPTED }, { status: STATUS.STATUS_WRONG_ANSWER }],
        } } };
        const h = await harness('ScratchpadRecordsContainer', { state });
        try {
            assert.equal(h.document.querySelector('.icol--stat.pass').textContent, 'AC: 1');
            assert.equal(h.document.querySelector('.icol--stat.fail').textContent, 'WA: 1');
            assert.equal(h.document.querySelectorAll('.icol--stat').length, 2);
            assert.equal(h.document.querySelectorAll('th[scope="col"]').length, 4);
            state.records.items.one.contest = '000000000000000000000000';
            await h.replace({ ...state });
            assert.equal(h.document.querySelector('tbody tr'), null);
            assert.match(h.document.querySelector('[role="status"]').textContent, /暂无评测记录/);
        } finally { await h.close(); }
    });

    it('labels test output and keeps an empty output neutral and read only', async () => {
        const h = await harness('DataInputComponent', { props: { html: true, title: '输出', value: '' } });
        try {
            assert.equal(h.document.querySelector('[role="log"]').getAttribute('aria-label'), '输出');
            assert.ok(h.document.querySelector('.scratchpad__data-placeholder'));
            assert.equal(h.document.querySelector('[contenteditable]'), null);
        } finally { await h.close(); }
    });
});
