const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const code = buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/components/daily_quiz_learning.ts')],
    bundle: true, write: false, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, require, URL, console, Intl, Date, Error });
const { bindDailyQuizLearning, compareReviewQuestions } = mod.exports;
const question = (id, overrides = {}) => ({
    id: `${id}`, sourceId: `${id}`, index: id, domainId: 'python', domainName: 'Python训练', title: `练习题 ${id}`,
    stem: '下面哪个选项正确？', kind: 'single', tags: ['循环'], options: ['一', '二'], answers: ['A'], selected: ['B'],
    correct: false, points: 1, earnedPoints: 0, analysis: '答案解析。', wrongCount: 1, correctCount: 0,
    answeredAt: '2026-10-19T08:00:00.000Z', lastWrongAt: '2026-10-19T08:00:00.000Z',
    explanation: { count: 0, explainedAt: null, explainedWrongCount: 0, needsReteach: false }, ...overrides,
});
const explained = (count, at, needsReteach = false) => ({ count, explainedAt: at, explainedWrongCount: 1, needsReteach });
const data = (questions = [question(1, { wrongCount: 3 }), question(2), question(3)]) => ({
    explanationUrl: '/manage/daily-quiz/student/11?classroom=python',
    summary: { total: 3, answered: 3, correctCount: 0, wrongCount: 3, unseenCount: 0, accuracy: 0, participationCount: 2, earnedPoints: 0 },
    questions, tags: [], sessions: [],
});
const ok = (value) => ({ ok: true, status: 200, json: async () => value });
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function harness(initial = data(), response = async () => ok({ saved: true, learning: data() })) {
    const dom = new JSDOM('<main></main>', { url: 'https://example.test/manage/daily-quiz', pretendToBeVisual: true });
    const host = dom.window.document.querySelector('main');
    const calls = [];
    dom.window.fetch = (url, options) => { calls.push({ url, options }); return response(url, options); };
    const binding = bindDailyQuizLearning(host, initial);
    const get = (selector) => host.querySelector(selector);
    return { dom, host, get, calls, initial, binding,
        mark: (id) => get(`[data-learning-explanation-key="python:${id}"]`),
        card: (id) => get(`[data-learning-review-key="python:${id}"]`),
        ids: () => [...host.querySelectorAll('[data-learning-review-key]')].map((node) => node.dataset.learningReviewKey),
        click: async (selector) => { assert(get(selector), selector); get(selector).click(); await flush(); },
        close: () => { binding.dispose(); dom.window.close(); },
    };
}

test('review priorities put repeated mistakes after teaching first, ordinary errors next, taught questions last', () => {
    const questions = [
        question(1, { wrongCount: 10, explanation: explained(1, '2026-10-19T09:00Z') }),
        question(2, { wrongCount: 3, lastWrongAt: '2026-10-18T08:00Z' }),
        question(3, { wrongCount: 3, lastWrongAt: '2026-10-19T08:00Z' }),
        question(4, { wrongCount: 2 }),
        question(5, { wrongCount: 1, explanation: explained(2, '2026-10-19T07:00Z', true) }),
        question(6, { wrongCount: 8, explanation: explained(1, '2026-10-19T06:00Z', true) }),
        question(7, { wrongCount: 6, explanation: explained(3, '2026-10-19T06:00Z') }),
    ];
    assert.deepEqual([...questions].sort(compareReviewQuestions).map((q) => q.id), ['5', '6', '3', '2', '4', '7', '1']);
    const h = harness(data(questions));
    try {
        assert.deepEqual(h.ids(), ['python:5', 'python:6', 'python:3', 'python:2', 'python:4', 'python:7', 'python:1']);
        assert.match(h.card(5).textContent, /讲后仍错.*已讲解 2 次，之后仍答错/s);
        assert.match(h.card(7).textContent, /已讲解 3 次/);
        assert.equal(h.mark(7).disabled, true);
        assert.equal(h.mark(5).disabled, false);
        assert.match(h.card(2).textContent, /答错 3 次/);
    } finally { h.close(); }
});

test('equal priorities always use a stable domain and source identity', () => {
    const base = [question(3), question(1), question(2)];
    assert.deepEqual(base.sort(compareReviewQuestions).map((q) => q.id), ['1', '2', '3']);
    base.forEach((item) => { item.explanation = explained(1, '2026-10-19T08:00Z'); });
    assert.deepEqual(base.reverse().sort(compareReviewQuestions).map((q) => q.id), ['1', '2', '3']);
});

test('marking is a separate action; duplicate requests are blocked and a success reorders without losing open questions or cache', async () => {
    const pending = deferred();
    const initial = data();
    const h = harness(initial, () => pending.promise);
    try {
        const first = h.card(1).querySelector('details'); first.open = true;
        const next = h.card(2).querySelector('details'); next.open = true;
        assert.equal(h.mark(1).closest('summary'), null);
        assert.equal(h.mark(1).closest('details'), null);
        h.mark(1).focus();
        h.mark(1).click(); h.mark(1).click(); await flush();
        assert.equal(first.open, true, 'marking does not toggle the disclosure');
        assert.equal(h.calls.length, 1);
        assert([...h.host.querySelectorAll('[data-learning-action="mark-explained"]')].every((button) => button.disabled));
        assert.match(h.mark(1).textContent, /正在标记/);
        assert.deepEqual(JSON.parse(h.calls[0].options.body), { operation: 'mark_explained', sourceDomain: 'python', sourceId: 1, wrongCount: 3 });
        assert.equal(h.calls[0].options.credentials, 'same-origin');
        assert.equal(h.calls[0].options.cache, 'no-store');
        const changed = data([question(1, { wrongCount: 3, explanation: explained(1, '2026-10-19T09:00Z') }), question(2), question(3)]);
        pending.resolve(ok({ saved: true, learning: changed })); await flush();
        assert.deepEqual(h.ids(), ['python:2', 'python:3', 'python:1']);
        assert(h.card(1).querySelector('details').open);
        assert(h.card(2).querySelector('details').open);
        assert.equal(h.dom.window.document.activeElement, h.card(2).querySelector('summary'));
        assert.equal(h.mark(1).disabled, true);
        assert.equal(h.mark(2).disabled, false);
        assert.match(h.get('[data-learning-explanation-feedback]').textContent, /第 1 次讲解.*末尾/);
        assert.equal(initial.questions[0].explanation.count, 1, 'parent caches keep the refreshed learning object');
        await h.click('[data-learning-view="answered"]');
        assert.equal(h.get('[data-learning-action="mark-explained"]'), null, 'actions belong only to the review list');
        await h.click('[data-learning-view="review"]');
        assert.equal(h.mark(1).disabled, true, 'switching tabs cannot add another teaching count');
    } finally { h.close(); }
});

test('a fresh post-teaching mistake permits the next teaching count and then returns the question to the end', async () => {
    const repeated = question(1, { wrongCount: 5, explanation: explained(2, '2026-10-18T08:00Z', true) });
    const changed = data([question(1, { wrongCount: 5, explanation: explained(3, '2026-10-19T09:00Z') }), question(2)]);
    const h = harness(data([question(2), repeated]), async () => ok({ saved: true, learning: changed }));
    try {
        assert.equal(h.ids()[0], 'python:1');
        assert.match(h.mark(1).textContent, /再次/);
        h.mark(1).click(); await flush();
        assert.deepEqual(h.ids(), ['python:2', 'python:1']);
        assert.match(h.card(1).textContent, /已讲解 3 次/);
        assert.equal(h.mark(1).disabled, true);
        assert.match(h.get('[data-learning-explanation-feedback]').textContent, /第 3 次讲解/);
    } finally { h.close(); }
});

test('stale-answer conflicts retain the visible list until the teacher explicitly refreshes', async () => {
    const current = data([question(1, { wrongCount: 4 }), question(2)]);
    const h = harness(data(), async (url, options) => options.method === 'POST'
        ? { ok: false, status: 409, json: async () => ({ error: { message: '学员的作答记录已更新，请刷新后再标记讲解' } }) }
        : ok({ learning: current }));
    try {
        const before = h.ids(); h.card(1).querySelector('details').open = true;
        h.mark(1).click(); await flush();
        assert.deepEqual(h.ids(), before);
        assert(h.card(1).querySelector('details').open);
        assert.match(h.get('[data-learning-explanation-feedback]').textContent, /已更新.*刷新/);
        assert.equal(h.mark(1).disabled, true);
        await h.click('[data-learning-action="refresh-explanations"]');
        assert.equal(h.calls.length, 2);
        assert.equal(h.calls[1].options.method, 'GET');
        assert.match(h.card(1).textContent, /答错 4 次/);
        assert(h.card(1).querySelector('details').open);
        assert.equal(h.mark(1).disabled, false);
        assert.match(h.get('[data-learning-explanation-feedback]').textContent, /已刷新/);
    } finally { h.close(); }
});

test('an uncertain network result is not replayed; refresh uses server truth and safely disables an already saved mark', async () => {
    const saved = data([question(1, { wrongCount: 3, explanation: explained(1, '2026-10-19T09:00Z') }), question(2)]);
    const h = harness(data(), async (url, options) => {
        if (options.method === 'POST') throw new TypeError('connection lost');
        return ok({ learning: saved });
    });
    try {
        h.mark(1).click(); await flush();
        assert.equal(h.calls.length, 1);
        assert.match(h.card(1).textContent, /尚未讲解/);
        assert.equal(h.mark(1).disabled, true);
        h.mark(1).click(); await flush(); assert.equal(h.calls.length, 1);
        await h.click('[data-learning-action="refresh-explanations"]');
        assert.match(h.card(1).textContent, /已讲解 1 次/);
        assert.equal(h.mark(1).disabled, true);
        assert.equal(h.calls.filter((call) => call.options.method === 'POST').length, 1);
    } finally { h.close(); }
});

for (const state of ['wrong-again', 'correct-now']) {
    test(`a concurrent ${state} response gives an accurate success notice and refreshes totals`, async () => {
        const next = question(1, { wrongCount: 4, explanation: explained(1, '2026-10-19T09:00Z', state === 'wrong-again'),
            correct: state === 'correct-now', selected: [state === 'correct-now' ? 'A' : 'B'] });
        const changed = data([next, question(2)]);
        if (state === 'correct-now') Object.assign(changed.summary, { answered: 2, correctCount: 1, wrongCount: 1, accuracy: 50 });
        const h = harness(data(), async () => ok({ saved: true, learning: changed }));
        try {
            h.mark(1).click(); await flush();
            const notice = h.get('[data-learning-explanation-feedback]').textContent;
            assert(!notice.includes('末尾'));
            if (state === 'wrong-again') {
                assert.match(notice, /新的答错.*优先/);
                assert.equal(h.ids()[0], 'python:1');
                assert.equal(h.mark(1).disabled, false);
            } else {
                assert.match(notice, /已答对.*移出待复习/);
                assert.equal(h.card(1), null);
                assert.match(h.get('[data-learning-view="review"]').textContent, /1/);
                assert.match(h.get('.dql-overview').textContent, /50%/);
            }
        } finally { h.close(); }
    });
}

test('authentication HTML keeps the list and offers verification and a safe refresh', async () => {
    const h = harness(data(), async () => ({ ok: true, status: 200, json: async () => { throw new Error('HTML'); } }));
    try {
        h.mark(1).click(); await flush();
        assert.equal(h.ids().length, 3);
        assert.match(h.get('[data-learning-explanation-feedback]').textContent, /身份验证/);
        assert(h.get('[data-learning-explanation-feedback] a[target="_blank"]'));
        assert.equal(h.mark(1).disabled, true);
        assert(h.get('[data-learning-action="refresh-explanations"]'));
    } finally { h.close(); }
});

test('no teacher endpoint means no lecture controls, and disposing aborts a mark without late repaint', async () => {
    const student = data(); delete student.explanationUrl;
    const readOnly = harness(student);
    try { assert.equal(readOnly.get('[data-learning-action="mark-explained"]'), null); } finally { readOnly.close(); }
    const pending = deferred();
    const h = harness(data(), () => pending.promise);
    try {
        h.mark(1).click(); await flush();
        const html = h.host.innerHTML;
        h.binding.dispose();
        assert(h.calls[0].options.signal.aborted);
        pending.resolve(ok({ saved: true, learning: data([]) })); await flush();
        assert.equal(h.host.innerHTML, html);
    } finally { h.close(); }
});

test('reordering compensates the next question position instead of scrolling down to the moved card', async () => {
    const changed = data([question(1, { wrongCount: 3, explanation: explained(1, '2026-10-19T09:00Z') }), question(2), question(3)]);
    const h = harness(data(), async () => ok({ saved: true, learning: changed }));
    const scrolls = [];
    h.dom.window.scrollBy = (x, y) => scrolls.push([x, y]);
    h.dom.window.HTMLElement.prototype.getBoundingClientRect = function rect() {
        if (!this.dataset.learningReviewKey) return { top: 0 };
        const index = [...h.host.querySelectorAll('[data-learning-review-key]')].indexOf(this);
        return { top: index * 100 + (h.get('[data-learning-explanation-feedback]').hidden ? 0 : 30) };
    };
    try {
        h.mark(1).focus(); h.mark(1).click(); await flush();
        assert.deepEqual(scrolls, [[0, -70]], 'the same neighboring card stays at the same viewport position');
        assert.equal(h.dom.window.document.activeElement, h.card(2).querySelector('summary'));
    } finally { h.close(); }
});

test('a pending mark does not steal focus when the teacher moves to another question or tab', async () => {
    for (const focusTarget of ['question', 'tab']) {
        const pending = deferred();
        const h = harness(data(), () => pending.promise);
        try {
            h.mark(1).click(); await flush();
            if (focusTarget === 'question') h.card(3).querySelector('summary').focus();
            else await h.click('[data-learning-view="answered"]');
            const changed = data([question(1, { wrongCount: 3, explanation: explained(1, '2026-10-19T09:00Z') }), question(2), question(3)]);
            pending.resolve(ok({ saved: true, learning: changed })); await flush();
            assert.equal(h.dom.window.document.activeElement, focusTarget === 'question'
                ? h.card(3).querySelector('summary') : h.get('[data-learning-view="answered"]'));
        } finally { h.close(); }
    }
});
