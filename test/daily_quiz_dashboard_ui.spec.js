const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const code = buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/components/daily_quiz_dashboard.ts')],
    bundle: true, write: false, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const row = (uid, overrides = {}) => ({
    uid, name: `学员${uid}`, uname: `student_${uid}`, domainNames: ['Python训练'], enabled: true,
    status: 'notStarted', total: 3, answered: 0, correctCount: 0, wrongCount: 0, earnedPoints: 0,
    accuracy: null, lastAnsweredAt: null, detailUrl: `/manage/daily-quiz/student/${uid}?day=2026-10-09`,
    settingsUrl: `/manage/users?uid=${uid}&tab=daily&quizView=settings`, ...overrides,
});
const initial = () => ({
    day: '2026-10-09', today: '2026-10-09', classroom: '', domains: [{ id: 'python', name: 'Python训练' }],
    stats: { assigned: 3, completed: 1, inProgress: 1, notStarted: 1, noQuestions: 1, disabled: 1,
        unrecorded: 1, answered: 4, correctCount: 3, wrongCount: 1, earnedPoints: 3, accuracy: 75 },
    rows: [row(10), row(11, { name: '小禾', status: 'completed', answered: 3, correctCount: 2, wrongCount: 1, earnedPoints: 2 }),
        row(12, { status: 'inProgress', answered: 1, correctCount: 1 }), row(13, { status: 'noQuestions', total: 0 }),
        row(14, { status: 'disabled', total: 0, enabled: false }), row(15, { status: 'unrecorded', total: 0 })],
});
const report = (title = '循环判断') => ({
    day: '2026-10-09', total: 2, answered: 2, correctCount: 1, wrongCount: 1, earnedPoints: 1, completed: true,
    items: [
        { id: 1, index: 1, title, domainName: 'Python训练', kind: 'judge', tags: ['循环'],
            stem: '**循环**能够重复执行代码。 <img src=x onerror=alert(1)> [坏链接](javascript:alert(1))',
            options: ['正确', '错误'], answers: ['A'], selected: ['B'], correct: false, points: 1, earnedPoints: 0,
            analysis: '循环用于重复执行一段代码。' },
        { id: 2, index: 2, title: '加法运算', domainName: 'Python训练', kind: 'single', tags: [],
            stem: '`2 + 3` 等于多少？', options: ['5', '6'], answers: ['A'], selected: ['A'], correct: true,
            points: 1, earnedPoints: 1, analysis: '' },
    ],
});
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const ok = (value) => ({ ok: true, status: 200, json: async () => value });
function harness(data = initial(), fetcher = async () => ok({ report: report() })) {
    const dom = new JSDOM('<main data-daily-quiz-dashboard></main>', { url: 'https://example.test/manage/daily-quiz', pretendToBeVisual: true });
    const root = dom.window.document.querySelector('main');
    root.dataset.initial = JSON.stringify(data);
    const calls = [];
    dom.window.fetch = (url, options) => { calls.push({ url, options }); return fetcher(url, options); };
    const mod = { exports: {} };
    vm.runInNewContext(code, { module: mod, exports: mod.exports, require, URL, console, Intl, Date });
    const binding = mod.exports.bindDailyQuizDashboard(root, dom.window);
    const get = (selector) => root.querySelector(selector);
    return {
        dom, root, get, calls, binding,
        click: async (selector) => { assert(get(selector), selector); get(selector).click(); await flush(); },
        input(selector, value, type = 'input') { get(selector).value = value; get(selector).dispatchEvent(new dom.window.Event(type, { bubbles: true })); },
        uids: () => [...root.querySelectorAll('[data-quiz-student]')].map((node) => Number(node.dataset.quizStudent)),
        close: () => { binding.dispose(); dom.window.close(); },
    };
}

test('filters and search keep day totals stable; no-question/no-record learners are not pending', async () => {
    const h = harness();
    try {
        const metrics = h.get('[data-quiz-metrics]').textContent;
        assert.match(metrics, /75%/);
        assert.equal(h.uids()[0], 12);
        await h.click('[data-quiz-filter="pending"]');
        assert.deepEqual(h.uids(), [12, 10]);
        await h.click('[data-quiz-filter="wrong"]');
        assert.deepEqual(h.uids(), [11]);
        h.input('[data-quiz-search]', 'missing');
        assert.deepEqual(h.uids(), []);
        assert.equal(h.get('[data-quiz-metrics]').textContent, metrics);
        await h.click('[data-quiz-action="clear"]');
        assert.equal(h.uids().length, 6);
        assert.equal(h.calls.length, 0);
    } finally { h.close(); }
});

test('inline details prioritize wrong answers and render judgment, choices and safe analysis', async () => {
    const h = harness();
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        assert.equal(h.calls.length, 1);
        assert.equal(h.root.querySelectorAll('[data-quiz-question]').length, 1);
        assert.match(h.get('[data-quiz-detail-panel]').textContent, /学员答案：错误/);
        assert.match(h.get('[data-quiz-detail-panel]').textContent, /正确答案：正确/);
        assert.match(h.get('[data-quiz-detail-panel]').textContent, /题目解析/);
        assert.equal(h.get('.dqd-markdown img'), null);
        assert.equal(h.get('a[href^="javascript:"]'), null);
        assert(h.get('.dqd-markdown strong'));
        await h.click('[data-quiz-answer-filter="all"]');
        assert.equal(h.root.querySelectorAll('[data-quiz-question]').length, 2);
        assert.equal(h.root.querySelectorAll('.dqd-analysis').length, 1);
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        assert.equal(h.calls.length, 1, 'reopening the current day reuses the same report');
    } finally { h.close(); }
});

test('late responses cannot replace the currently expanded learner', async () => {
    const a = deferred(); const b = deferred();
    const h = harness(initial(), (url) => url.includes('/11?') ? a.promise : b.promise);
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        await h.click('[data-quiz-action="detail"][data-quiz-uid="12"]');
        b.resolve(ok({ report: report('学员12记录') })); await flush();
        a.resolve(ok({ report: report('学员11记录') })); await flush();
        assert.match(h.get('[data-quiz-detail-panel="12"]').textContent, /学员12记录/);
        assert(!h.root.textContent.includes('学员11记录'));
    } finally { h.close(); }
});

test('changing dates cancels stale report and scope responses', async () => {
    const detail = deferred(); const first = deferred(); const second = deferred();
    const h = harness(initial(), (url) => url.includes('/student/') ? detail.promise : url.includes('2026-10-08') ? first.promise : second.promise);
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        h.input('[data-quiz-day]', '2026-10-08', 'change');
        h.input('[data-quiz-day]', '2026-10-07', 'change');
        assert.equal(h.calls[0].options.signal.aborted, true);
        assert.equal(h.calls[1].options.signal.aborted, true);
        second.resolve(ok({ dashboard: { ...initial(), day: '2026-10-07', rows: [row(20, { name: '最新日期', status: 'unrecorded' })] } })); await flush();
        first.resolve(ok({ dashboard: { ...initial(), day: '2026-10-08' } }));
        detail.resolve(ok({ report: report('过期数据') })); await flush();
        assert.equal(h.get('[data-quiz-day]').value, '2026-10-07');
        assert.deepEqual(h.uids(), [20]);
        assert(!h.root.textContent.includes('过期数据'));
        assert.match(h.dom.window.location.search, /2026-10-07/);
    } finally { h.close(); }
});

test('scope failures retain previous dates and counts and offer retry', async () => {
    let fails = true;
    const h = harness(initial(), async () => fails ? { ok: false, status: 500 } : ok({ dashboard: { ...initial(), day: '2026-10-08' } }));
    try {
        h.input('[data-quiz-day]', '2026-10-08', 'change'); await flush();
        assert.equal(h.get('[data-quiz-day]').value, '2026-10-09');
        assert.match(h.get('[data-quiz-feedback]').textContent, /仍显示 2026-10-09/);
        assert.equal(h.uids().length, 6);
        fails = false;
        await h.click('[data-quiz-action="retry-scope"]');
        assert.equal(h.get('[data-quiz-day]').value, '2026-10-08');
    } finally { h.close(); }
});

test('expired authentication shows an actionable validation link with no false empty result', async () => {
    const h = harness(initial(), async () => ({ ok: true, status: 200, json: async () => { throw new Error('HTML login'); } }));
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        assert.match(h.get('[data-quiz-detail-panel]').textContent, /身份验证/);
        const link = h.get('[data-quiz-detail-panel] a[target="_blank"]');
        assert(link);
        assert.equal(new URL(link.href).origin, 'https://example.test');
        assert(h.get('[data-quiz-action="retry-detail"]'));
    } finally { h.close(); }
});

test('large rosters load in batches and search reaches learners outside the first batch', async () => {
    const data = initial(); data.rows = Array.from({ length: 75 }, (_, index) => row(index + 100));
    const h = harness(data);
    try {
        assert.equal(h.uids().length, 30);
        await h.click('[data-quiz-action="show-more"]');
        assert.equal(h.uids().length, 60);
        h.input('[data-quiz-search]', 'student_174');
        assert.deepEqual(h.uids(), [174]);
    } finally { h.close(); }
});

test('disposing prevents outstanding data from updating a removed dashboard', async () => {
    const pending = deferred();
    const h = harness(initial(), () => pending.promise);
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        h.binding.dispose();
        assert.equal(h.calls[0].options.signal.aborted, true);
        pending.resolve(ok({ report: report('不应呈现') })); await flush();
        assert(!h.root.textContent.includes('不应呈现'));
    } finally { h.close(); }
});
