const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Provider } = require('react-redux');
const { createStore } = require('redux');
const { JSDOM } = require('jsdom');

const uiRoot = path.resolve(__dirname, '../packages/ui-default');
const compile = (entry) => esbuild.buildSync({
    entryPoints: [path.join(uiRoot, entry)], bundle: true, write: false,
    packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const common = { exports: {} };
vm.runInNewContext(compile('../common/status.ts'), { module: common, exports: common.exports });
const { STATUS } = common.exports;
function load(entry) {
    const mod = { exports: {} };
    vm.runInNewContext(compile(entry), {
        module: mod, exports: mod.exports,
        require(id) {
            if (id === '@hydrooj/common') return common.exports;
            if (id === 'vj/utils') return { i18n: (text) => text === 'Output' ? '输出' : text };
            if (id === 'vj/components/react/IconComponent') return () => null;
            if (id === 'allotment') return { Allotment: ({ children }) => React.createElement('div', null, children) };
            return require(id);
        },
    });
    return mod.exports.default;
}
const reducer = load('components/scratchpad/reducers/pretest.ts');
const Pretest = load('components/scratchpad/ScratchpadPretestContainer.jsx');
const pending = (state) => reducer(state, { type: 'SCRATCHPAD_POST_PRETEST_PENDING' });
const registered = (state, rid = 'new') => reducer(state, { type: 'SCRATCHPAD_POST_PRETEST_FULFILLED', payload: { rid } });
const push = (state, rdoc) => reducer(state, { type: 'SCRATCHPAD_RECORDS_PUSH', payload: { rdoc } });
const judged = (extra = {}) => ({ _id: 'new', status: STATUS.STATUS_ACCEPTED, time: 5.722, memory: 17888,
    compilerTexts: [], testCases: [{ message: 'Hello Tom!\n' }], ...extra });
const completed = () => push(registered(pending()), judged());
const render = (state) => {
    const store = createStore(() => ({ pretest: state }));
    return new JSDOM(renderToStaticMarkup(React.createElement(Provider, { store }, React.createElement(Pretest))));
};

describe('scratchpad self-test output and quiet metadata', () => {
    it('separates structured timing and status from actual output, preserving all program output lines', () => {
        const text = 'Accepted 5.722ms 17888KiB\nHello Tom!\n';
        const state = push(registered(pending()), judged({ testCases: [{ message: text }] }));
        assert.equal(state.output, text);
        assert.equal(state.summary.status, 'Accepted');
        assert.equal(state.summary.time, 5.722);
        assert.equal(state.summary.memory, 17888);
        assert.equal(Object.hasOwn(state, 'isRunning'), false);
    });

    it('places parenthesized metadata next to Output, leaving output accessible and read only', () => {
        const dom = render(completed());
        try {
            const output = dom.window.document.querySelector('[role="log"]');
            const label = output.previousElementSibling;
            assert.equal(label.textContent, '输出（Accepted · 5.722 ms · 17888 KiB）');
            assert.equal(label.querySelector('.scratchpad__data-metadata').getAttribute('role'), 'status');
            assert.equal(output.textContent, 'Hello Tom!\n');
            assert.equal(output.getAttribute('aria-label'), '输出');
            assert.equal(output.querySelector('[contenteditable]'), null);
        } finally { dom.window.close(); }
    });

    it('retains compiler diagnostics and escapes output HTML while rendering ANSI safely', () => {
        const state = push(registered(pending()), judged({ status: STATUS.STATUS_COMPILE_ERROR,
            compilerTexts: ['line 1: syntax error', '<script>alert(1)</script>'],
            testCases: [{ message: '\u001B[31merror detail\u001B[0m' }], memory: undefined, time: undefined }));
        assert.equal(state.summary.status, 'Compile Error');
        assert.match(state.output, /^line 1: syntax error\n<script>/);
        const dom = render(state);
        try {
            const output = dom.window.document.querySelector('[role="log"]');
            assert.equal(output.querySelector('script'), null);
            assert.match(output.textContent, /<script>alert\(1\)<\/script>/);
            assert.match(output.textContent, /error detail/);
            assert.equal(output.previousElementSibling.textContent, '输出（Compile Error）');
        } finally { dom.window.close(); }
    });

    it('clears previous output and measurements on rerun, ignoring results from the old record', () => {
        const running = pending(completed());
        assert.equal(running.output, '');
        assert.equal(running.rid, '');
        assert.equal(running.summary.time, undefined);
        const buffered = push(running, judged());
        assert.equal(buffered.output, '');
        const confirmed = registered(buffered, 'next');
        assert.equal(confirmed.rid, 'next');
        assert.equal(confirmed.output, '');
        assert.equal(push(confirmed, judged()), confirmed);
    });

    it('handles judge results before the HTTP response and normalizes serialized record IDs', () => {
        let state = pending();
        state = push(state, judged({ _id: { $oid: 'new' } }));
        state = push(state, judged({ _id: 'unrelated', testCases: [{ message: 'other student output' }] }));
        assert.equal(state.output, '');
        state = reducer(state, { type: 'SCRATCHPAD_POST_PRETEST_FULFILLED', payload: { data: { rid: { $oid: 'new' } } } });
        assert.equal(state.rid, 'new');
        assert.equal(state.output, 'Hello Tom!\n');
        assert.equal(Object.hasOwn(state, 'isRunning'), false);
        assert.equal(Object.keys(state.earlyRecords).length, 0);
    });

    it('bounds early results and safely ignores events with no record', () => {
        let state = pending();
        assert.equal(push(state, undefined), state);
        assert.equal(push(state, {}), state);
        for (let index = 0; index < 30; index++) state = push(state, judged({ _id: `rid-${index}` }));
        assert.equal(Object.keys(state.earlyRecords).length, 16);
        assert.equal(state.output, '');
    });

    it('shows pending status without stale or undefined timing when updates omit detail fields', () => {
        let state = registered(pending());
        for (const status of [STATUS.STATUS_WAITING, STATUS.STATUS_FETCHED, STATUS.STATUS_COMPILING, STATUS.STATUS_JUDGING]) {
            state = push(state, { _id: 'new', status, time: 0, memory: 0 });
            assert.equal(Object.hasOwn(state, 'isRunning'), false);
            assert.equal(state.output, '');
            assert.equal(state.summary.time, undefined);
            const dom = render(state);
            try {
                assert.doesNotMatch(dom.window.document.body.textContent, /undefined|NaN|0 ms|0 KiB/);
            } finally { dom.window.close(); }
        }
    });

    it('distinguishes an empty completed output from a never-run placeholder, including zero resource use', () => {
        const state = push(registered(pending()), judged({ time: 0, memory: 0, testCases: [] }));
        const dom = render(state);
        const idle = render(reducer());
        try {
            assert.equal(dom.window.document.querySelector('[role="log"]').textContent, '');
            assert.equal(dom.window.document.querySelector('.scratchpad__data-placeholder'), null);
            assert.match(dom.window.document.querySelector('.scratchpad__data-metadata').textContent, /0 ms · 0 KiB/);
            assert.ok(idle.window.document.querySelector('.scratchpad__data-placeholder'));
        } finally { dom.window.close(); idle.window.close(); }
    });

    it('discards invalid measurements and handles rejected or malformed submissions without adding a run lock', () => {
        const judgedState = push(registered(pending()), judged({ time: Number.NaN, memory: -1 }));
        assert.equal(judgedState.summary.time, undefined);
        assert.equal(judgedState.summary.memory, undefined);
        const rejected = reducer(pending(judgedState), { type: 'SCRATCHPAD_POST_PRETEST_REJECTED', payload: new Error('offline') });
        assert.equal(Object.hasOwn(rejected, 'isRunning'), false);
        assert.equal(rejected.output, '');
        assert.equal(rejected.summary.status, '提交失败');
        const malformed = reducer(pending(), { type: 'SCRATCHPAD_POST_PRETEST_FULFILLED', payload: {} });
        assert.equal(Object.hasOwn(malformed, 'isRunning'), false);
        assert.equal(malformed.summary.status, '未能获取自测结果');
    });
});
