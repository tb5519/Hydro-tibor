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
    total: 3, answered: 0, correctCount: 0, wrongCount: 0, unseenCount: 3, participationCount: 0, earnedPoints: 0, tags: [],
    accuracy: null, lastAnsweredAt: null, detailUrl: `/manage/daily-quiz/student/${uid}`,
    settingsUrl: `/manage/users?uid=${uid}&tab=daily&quizView=settings`, ...overrides,
});
const initial = () => ({
    classroom: '', domains: [{ id: 'python', name: 'Python训练' }, { id: 'cpp', name: 'C++训练' }],
    stats: { students: 6, participants: 2, total: 18, answered: 4, correctCount: 3, wrongCount: 1,
        unseenCount: 14, participationCount: 3, earnedPoints: 3, accuracy: 75 },
    rows: [row(10, { total: 6, unseenCount: 6 }),
        row(11, { name: '小禾', total: 6, answered: 3, correctCount: 2, wrongCount: 1, unseenCount: 3, participationCount: 2 }),
        row(12, { answered: 1, correctCount: 1, unseenCount: 2, participationCount: 1 }), row(13, { total: 0, unseenCount: 0 }),
        row(14, { enabled: false }), row(15, { total: 0, unseenCount: 0 })],
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
const learning = (title) => ({
    summary: { total: 4, answered: 2, correctCount: 1, wrongCount: 1, unseenCount: 2, accuracy: 50, participationCount: 2, earnedPoints: 3 },
    questions: report(title).items,
    tags: [{ domainId: 'python', domainName: 'Python训练', name: '循环', total: 3, answered: 1, correctCount: 0, wrongCount: 1, accuracy: 0 }],
    sessions: [
        { id: '11-2026-10-09', round: 2, day: '2026-10-09', total: 2, answered: 2, correctCount: 1, wrongCount: 1, earnedPoints: 1, completed: true, detailUrl: '/manage/daily-quiz/student/11?session=11-2026-10-09' },
        { id: '11-2026-10-08', round: 1, day: '2026-10-08', total: 2, answered: 1, correctCount: 1, wrongCount: 0, earnedPoints: 1, completed: false, detailUrl: '/manage/daily-quiz/student/11?session=11-2026-10-08' },
        { id: '11-2026-10-10', round: 3, day: '2026-10-10', total: 2, answered: 0, correctCount: 0, wrongCount: 0, earnedPoints: 0, completed: false, detailUrl: '/manage/daily-quiz/student/11?session=11-2026-10-10' },
    ],
});
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const ok = (value) => ({ ok: true, status: 200, json: async () => value });
function harness(data = initial(), fetcher = async () => ok({ learning: learning() })) {
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

test('mastery filters and search keep cumulative totals stable with no calendar or attendance controls', async () => {
    const h = harness();
    try {
        const metrics = h.get('[data-quiz-metrics]').textContent;
        assert.match(metrics, /75%/);
        assert.equal(h.uids()[0], 11);
        assert.equal(h.get('[data-quiz-day]'), null);
        assert(!h.root.textContent.includes('今日待完成'));
        await h.click('[data-quiz-filter="participated"]');
        assert.deepEqual(h.uids(), [11, 12]);
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
        assert.equal(h.root.querySelectorAll('[data-learning-question]').length, 1);
        assert.match(h.get('[data-quiz-detail-panel]').textContent, /学员答案：错误/);
        assert.match(h.get('[data-quiz-detail-panel]').textContent, /正确答案：正确/);
        assert.match(h.get('[data-quiz-detail-panel]').textContent, /题目解析/);
        assert.equal(h.get('.dql-markdown img'), null);
        assert.equal(h.get('a[href^="javascript:"]'), null);
        assert(h.get('.dql-markdown strong'));
        await h.click('[data-learning-view="answered"]');
        assert.equal(h.root.querySelectorAll('[data-learning-question]').length, 2);
        assert.equal(h.root.querySelectorAll('.dql-analysis').length, 1);
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        assert.equal(h.calls.length, 1, 'reopening the learner reuses cumulative details');
    } finally { h.close(); }
});

test('late responses cannot replace the currently expanded learner', async () => {
    const a = deferred(); const b = deferred();
    const h = harness(initial(), (url) => url.endsWith('/11') ? a.promise : b.promise);
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        await h.click('[data-quiz-action="detail"][data-quiz-uid="12"]');
        b.resolve(ok({ learning: learning('学员12记录') })); await flush();
        a.resolve(ok({ learning: learning('学员11记录') })); await flush();
        assert.match(h.get('[data-quiz-detail-panel="12"]').textContent, /学员12记录/);
        assert(!h.root.textContent.includes('学员11记录'));
    } finally { h.close(); }
});

test('changing classroom cancels stale learner and scope responses', async () => {
    const detail = deferred(); const first = deferred(); const second = deferred();
    const h = harness(initial(), (url) => url.includes('/student/') ? detail.promise : url.includes('classroom=python') ? first.promise : second.promise);
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        h.input('[data-quiz-classroom]', 'python', 'change');
        h.input('[data-quiz-classroom]', 'cpp', 'change');
        assert.equal(h.calls[0].options.signal.aborted, true);
        assert.equal(h.calls[1].options.signal.aborted, true);
        second.resolve(ok({ dashboard: { ...initial(), classroom: 'cpp', rows: [row(20, { name: '最新课堂' })] } })); await flush();
        first.resolve(ok({ dashboard: { ...initial(), classroom: 'python' } }));
        detail.resolve(ok({ learning: learning('过期数据') })); await flush();
        assert.equal(h.get('[data-quiz-classroom]').value, 'cpp');
        assert.deepEqual(h.uids(), [20]);
        assert(!h.root.textContent.includes('过期数据'));
        assert.match(h.dom.window.location.search, /classroom=cpp/);
    } finally { h.close(); }
});

test('scope failures retain previous classroom and counts and offer retry', async () => {
    let fails = true;
    const h = harness(initial(), async () => fails ? { ok: false, status: 500 } : ok({ dashboard: { ...initial(), classroom: 'python' } }));
    try {
        h.input('[data-quiz-classroom]', 'python', 'change'); await flush();
        assert.equal(h.get('[data-quiz-classroom]').value, '');
        assert.match(h.get('[data-quiz-feedback]').textContent, /保留上次读取的数据/);
        assert.equal(h.uids().length, 6);
        fails = false;
        await h.click('[data-quiz-action="retry-scope"]');
        assert.equal(h.get('[data-quiz-classroom]').value, 'python');
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
        pending.resolve(ok({ learning: learning('不应呈现') })); await flush();
        assert(!h.root.textContent.includes('不应呈现'));
    } finally { h.close(); }
});


test('practice history is counted by participation and lazily shows each round including wrong and unanswered', async () => {
    const h = harness(initial(), async (url) => url.includes('session=') ? ok({ report: { ...report('第一轮错题'), items: [...report('第一轮错题').items,
        { ...report().items[0], id: 3, title: '未答判断', selected: null, correct: null }] } }) : ok({ learning: learning() }));
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        await h.click('[data-learning-view="sessions"]');
        assert.match(h.get('[data-learning-panel]').textContent, /第 2 次练习/);
        assert(!h.get('[data-learning-panel]').textContent.includes('第 3 次练习'));
        assert.equal(h.calls.length, 1);
        await h.click('[data-learning-action="session"][data-learning-session="11-2026-10-08"]');
        assert.equal(h.calls.length, 2);
        assert.equal(h.root.querySelectorAll('[data-learning-question]').length, 3);
        assert.match(h.get('[data-learning-session-panel]').textContent, /未作答/);
        await h.click('[data-learning-action="session"][data-learning-session="11-2026-10-08"]');
        await h.click('[data-learning-action="session"][data-learning-session="11-2026-10-08"]');
        assert.equal(h.calls.length, 2);
    } finally { h.close(); }
});

test('practice ordinals count actual participation chronologically without gaps from unstarted rounds', async () => {
    const data = learning();
    data.sessions[0].round = 5;
    data.sessions[1].round = 2;
    data.sessions[2].round = 6;
    const h = harness(initial(), async (url) => url.includes('session=') ? ok({ report: report() }) : ok({ learning: data }));
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        await h.click('[data-learning-view="sessions"]');
        const newer = '[data-learning-action="session"][data-learning-session="11-2026-10-09"]';
        const older = '[data-learning-action="session"][data-learning-session="11-2026-10-08"]';
        assert.equal(h.get(newer).closest('.dql-session').querySelector('strong').textContent, '第 2 次练习');
        assert.equal(h.get(older).closest('.dql-session').querySelector('strong').textContent, '第 1 次练习');
        assert.equal(h.get(newer).getAttribute('aria-label'), '查看第 2 次练习');
        assert.equal(h.get(older).getAttribute('aria-label'), '查看第 1 次练习');
        assert.equal(h.root.querySelectorAll('.dql-session').length, 2);
        assert(!h.get('[data-learning-panel]').textContent.includes('第 5 次练习'));
        assert(!h.get('[data-learning-panel]').textContent.includes('第 6 次练习'));
        await h.click(newer);
        assert.equal(h.get(newer).getAttribute('aria-label'), '收起第 2 次练习');
        assert.equal(h.get('[data-learning-session-panel]').getAttribute('aria-label'), '第 2 次练习的作答记录');
        await h.click(older);
        assert.equal(h.get('[data-learning-session-panel]').getAttribute('aria-label'), '第 1 次练习的作答记录');
    } finally { h.close(); }
});

test('switching learners disposes pending practice fetch and cannot mix answers', async () => {
    const pending = deferred();
    const h = harness(initial(), async (url) => url.includes('session=') ? pending.promise : ok({ learning: learning() }));
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        await h.click('[data-learning-view="sessions"]');
        await h.click('[data-learning-action="session"][data-learning-session="11-2026-10-08"]');
        const call = h.calls.at(-1);
        await h.click('[data-quiz-action="detail"][data-quiz-uid="12"]');
        assert.equal(call.options.signal.aborted, true);
        pending.resolve(ok({ report: report('上个学员的历史答案') })); await flush();
        assert(!h.root.textContent.includes('上个学员的历史答案'));
    } finally { h.close(); }
});

test('a knowledge-point shortcut finds only that classroom and tag, and can return to all mistakes', async () => {
    const data = learning();
    data.questions[0].domainId = 'python';
    data.questions.push({ ...data.questions[0], id: 3, domainId: 'cpp', domainName: 'C++训练', title: '其他课堂同名知识点' });
    data.summary.answered = 3; data.summary.wrongCount = 2;
    const h = harness(initial(), async () => ok({ learning: data }));
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        assert.equal(h.root.querySelectorAll('[data-learning-question]').length, 2);
        await h.click('[data-learning-view="tags"]');
        await h.click('[data-learning-action="tag-review"]');
        assert.equal(h.root.querySelectorAll('[data-learning-question]').length, 1);
        assert(!h.get('[data-learning-panel]').textContent.includes('其他课堂同名知识点'));
        await h.click('[data-learning-action="clear-tag"]');
        assert.equal(h.root.querySelectorAll('[data-learning-question]').length, 2);
    } finally { h.close(); }
});

test('practice fetch failure retains the mastery summary and allows retry', async () => {
    let fail = true;
    const h = harness(initial(), async (url) => url.includes('session=')
        ? fail ? { ok: false, status: 500 } : ok({ report: report('重试成功记录') }) : ok({ learning: learning() }));
    try {
        await h.click('[data-quiz-action="detail"][data-quiz-uid="11"]');
        const summary = h.get('.dql-overview').textContent;
        await h.click('[data-learning-view="sessions"]');
        await h.click('[data-learning-action="session"][data-learning-session="11-2026-10-08"]');
        assert.match(h.get('[data-learning-session-panel]').textContent, /暂时无法读取/);
        assert.equal(h.get('.dql-overview').textContent, summary);
        fail = false;
        await h.click('[data-learning-action="retry-session"]');
        assert.match(h.get('[data-learning-session-panel]').textContent, /重试成功记录/);
    } finally { h.close(); }
});
