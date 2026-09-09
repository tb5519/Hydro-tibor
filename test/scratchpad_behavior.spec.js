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
const sources = {
    ui: compile('components/scratchpad/reducers/ui.ts'),
    records: compile('components/scratchpad/reducers/records.ts'),
    editor: compile('components/scratchpad/reducers/editor.ts'),
    component: compile('components/scratchpad/ScratchpadRecordsContainer.jsx'),
    status: compile('../common/status.ts'),
    constants: compile('constant/record.js'),
};

function load(source, context = {}, storage = new Map()) {
    const execute = (code) => {
        const mod = { exports: {} };
        vm.runInNewContext(code, {
            module: mod, exports: mod.exports,
            UiContext: { pdoc: { config: { type: 'default' } }, canViewRecord: true, ...context },
            UserContext: { _id: 2 },
            window: { LANGS: {} },
            localStorage: {
                getItem: (key) => storage.get(key) || null,
                setItem: (key, value) => storage.set(key, value),
            },
            require(id) {
                if (id === 'vj/components/notification') return { success() {}, error() {} };
                if (id === 'vj/components/react/IconComponent') return () => React.createElement('i');
                if (id === '@hydrooj/common') return execute(sources.status);
                if (id === 'vj/constant/record') return execute(sources.constants);
                if (id === 'vj/utils') return { i18n: (value) => value, mongoId: () => ({ timestamp: 0 }) };
                return require(id);
            },
        });
        return mod.exports;
    };
    return execute(source).default;
}

const record = (id, extra = {}) => ({ _id: id, status: 0, ...extra });
const firstId = '6aa000000000000000000001';
const secondId = '6aa000000000000000000002';
const thirdId = '6aa000000000000000000003';

describe('scratchpad opening and formal submission behavior', () => {
    it('opens both panels even when older saved preferences have them hidden', () => {
        const reducer = load(sources.ui, {}, new Map([
            ['scratchpad/pretest', 'false'], ['scratchpad/records', 'false'],
        ]));
        const state = reducer();
        assert.equal(state.pretest.visible, true);
        assert.equal(state.records.visible, true);
    });

    it('resets the two panels and problem layout on reentry while keeping editor settings and submission state', () => {
        const reducer = load(sources.ui);
        let state = reducer();
        state = reducer(state, { type: 'SCRATCHPAD_UI_TOGGLE_VISIBILITY', payload: { uiElement: 'pretest' } });
        state = reducer(state, { type: 'SCRATCHPAD_UI_TOGGLE_VISIBILITY', payload: { uiElement: 'records' } });
        state = reducer(state, { type: 'SCRATCHPAD_SWITCH_TO_PAGE', payload: 'settings' });
        state = reducer(state, { type: 'SCRATCHPAD_SETTING_UPDATE', payload: { setting: 'fontSize', value: 20 } });
        state = reducer(state, { type: 'SCRATCHPAD_FORMAL_SUBMIT_REGISTER', payload: { rid: firstId } });
        const reopened = reducer(state, { type: 'SCRATCHPAD_UI_OPEN' });
        assert.equal(reopened.pretest.visible, true);
        assert.equal(reopened.records.visible, true);
        assert.equal(reopened.activePage, 'problem');
        assert.equal(reopened.settings.config.fontSize, 20);
        assert.equal(reopened.formalSubmitRids[0], firstId);
    });

    it('preserves IDE and record-view permissions on initial entry and reentry', () => {
        for (const context of [{ ideMode: true }, { canViewRecord: false }]) {
            const reducer = load(sources.ui, context);
            const state = reducer();
            assert.equal(state.pretest.visible, true);
            assert.equal(state.records.visible, false);
            const reopened = reducer({ ...state, records: { ...state.records, visible: true } }, { type: 'SCRATCHPAD_UI_OPEN' });
            assert.equal(reopened.records.visible, false);
        }
        const unsupported = load(sources.ui, { pdoc: { config: { type: 'objective' } } });
        assert.equal(unsupported().pretest.visible, false);
    });

    it('keeps the chosen self-test state through formal submission and advances scrolling only for formal submits', () => {
        const reducer = load(sources.ui);
        for (const visible of [true, false]) {
            const initial = reducer();
            let state = { ...initial, pretest: { ...initial.pretest, visible } };
            state = reducer(state, { type: 'SCRATCHPAD_POST_SUBMIT_PENDING' });
            assert.equal(state.pretest.visible, visible);
            assert.equal(state.records.scrollRevision, 1);
            state = reducer(state, { type: 'SCRATCHPAD_POST_SUBMIT_FULFILLED', payload: { rid: firstId } });
            assert.equal(state.pretest.visible, visible);
            assert.equal(state.records.visible, true);
            assert.equal(state.formalSubmitRids[0], firstId);
            state = reducer(state, { type: 'SCRATCHPAD_POST_PRETEST_PENDING' });
            assert.equal(state.records.scrollRevision, 1);
        }
    });
});

describe('homework submission review isolation', () => {
    it('loads the reviewed student code and ignores teacher drafts and edits', () => {
        const storage = new Map([['2/system/3@homework', 'teacher draft']]);
        const reducer = load(sources.editor, {
            pdoc: { domainId: 'system', docId: 3 }, tdoc: { _id: 'homework' }, codeLang: 'cpp',
            homeworkReview: { uid: 23, code: 'print("student")', lang: 'python' },
        }, storage);
        const state = reducer();
        assert.equal(state.code, 'print("student")');
        assert.equal(state.lang, 'python');
        assert.strictEqual(reducer(state, { type: 'SCRATCHPAD_EDITOR_UPDATE_CODE', payload: 'overwrite' }), state);
        assert.strictEqual(reducer(state, { type: 'SCRATCHPAD_EDITOR_SET_LANG', payload: 'cpp' }), state);
        assert.equal(storage.size, 1);
        assert.equal(storage.get('2/system/3@homework'), 'teacher draft');
        const empty = load(sources.editor, { homeworkReview: { uid: 24 }, codeTemplate: 'teacher template' }, storage);
        assert.equal(empty().code, '');
    });

    it('shows only the authorized record and never opens a self-test panel', () => {
        const reviewedRecord = record(secondId, { uid: 23, score: 75 });
        const context = { homeworkReview: { uid: 23, record: reviewedRecord } };
        const ui = load(sources.ui, context);
        assert.equal(ui().pretest.visible, false);
        assert.equal(ui().records.visible, true);
        assert.equal(ui(ui(), { type: 'SCRATCHPAD_UI_OPEN' }).pretest.visible, false);
        const reducer = load(sources.records, context);
        const state = reducer();
        assert.equal(state.rows.join(), secondId);
        assert.equal(state.items[secondId].uid, 23);
        assert.strictEqual(reducer(state, {
            type: 'SCRATCHPAD_RECORDS_LOAD_SUBMISSIONS_FULFILLED', payload: { rdocs: [record(thirdId)] },
        }), state);
        assert.strictEqual(reducer(state, { type: 'SCRATCHPAD_RECORDS_PUSH', payload: { rdoc: record(firstId) } }), state);
    });
});

describe('scratchpad latest record visibility', () => {
    it('orders loaded and pushed records by newest submission, even when messages arrive out of order', () => {
        const reducer = load(sources.records);
        let state = reducer(undefined, {
            type: 'SCRATCHPAD_RECORDS_LOAD_SUBMISSIONS_FULFILLED', payload: { rdocs: [record(firstId), record(thirdId)] },
        });
        assert.equal(state.rows.join(','), `${thirdId},${firstId}`);
        state = reducer(state, { type: 'SCRATCHPAD_RECORDS_PUSH', payload: { rdoc: record(secondId) } });
        assert.equal(state.rows.join(','), `${thirdId},${secondId},${firstId}`);
        state = reducer(state, { type: 'SCRATCHPAD_RECORDS_PUSH', payload: { rdoc: record(firstId, { score: 100 }) } });
        assert.equal(state.rows.join(','), `${thirdId},${secondId},${firstId}`);
        assert.equal(state.items[firstId].score, 100);
    });

    it('scrolls to new formal submissions but does not move while judging, self-testing or receiving older records', async () => {
        const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
        const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
        global.window = dom.window;
        global.document = dom.window.document;
        global.IS_REACT_ACT_ENVIRONMENT = true;
        const ui = load(sources.ui);
        const records = load(sources.records);
        const store = createStore((state, action) => ({ ui: ui(state?.ui, action), records: records(state?.records, action) }));
        store.dispatch({ type: 'SCRATCHPAD_RECORDS_PUSH', payload: { rdoc: record(secondId) } });
        const Component = load(sources.component);
        const root = ReactDOM.createRoot(dom.window.document.getElementById('root'));
        const dispatch = async (action) => React.act(async () => { store.dispatch(action); });
        try {
            await React.act(async () => root.render(React.createElement(Provider, { store }, React.createElement(Component))));
            const scroller = dom.window.document.querySelector('.scratchpad__records-scroll');
            scroller.scrollTop = 140;
            await dispatch({ type: 'SCRATCHPAD_POST_SUBMIT_PENDING' });
            assert.equal(scroller.scrollTop, 0);
            scroller.scrollTop = 90;
            await dispatch({ type: 'SCRATCHPAD_RECORDS_PUSH', payload: { rdoc: record(thirdId) } });
            assert.equal(scroller.scrollTop, 0);
            scroller.scrollTop = 70;
            await dispatch({ type: 'SCRATCHPAD_RECORDS_PUSH', payload: { rdoc: record(thirdId, { score: 75 }) } });
            assert.equal(scroller.scrollTop, 70);
            await dispatch({ type: 'SCRATCHPAD_RECORDS_PUSH', payload: { rdoc: record(firstId) } });
            assert.equal(scroller.scrollTop, 70);
            await dispatch({ type: 'SCRATCHPAD_POST_PRETEST_PENDING' });
            await dispatch({ type: 'SCRATCHPAD_RECORDS_PUSH', payload: { rdoc: record('6aa000000000000000000004', {
                contest: '000000000000000000000000',
            }) } });
            assert.equal(scroller.scrollTop, 70);
            assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 3);
        } finally {
            await React.act(async () => root.unmount());
            dom.window.close();
            global.window = previous.window;
            global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        }
    });
});
