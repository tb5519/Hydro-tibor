const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const stylus = require('stylus');
const yaml = require('js-yaml');

process.env.NODE_ENV = 'test';
const React = require('react');
const ReactDOM = require('react-dom/client');
const { act } = React;

const uiRoot = path.resolve(__dirname, '../packages/ui-default');
const code = buildSync({
    entryPoints: [path.join(uiRoot, 'pages/scratch_objective_quiz.page.tsx')], bundle: true, write: false,
    packages: 'external', platform: 'node', format: 'cjs',
    alias: { 'vj/backendlib/markdown-it-katex': path.join(uiRoot, 'backendlib/markdown-it-katex.ts') },
}).outputFiles[0].text;
const template = fs.readFileSync(path.join(uiRoot, 'templates/scratch_objective_quiz.html'), 'utf8');
const env = new nunjucks.Environment({
    getSource(name) {
        return { src: name === 'scratch_objective_quiz.html' ? template
            : '<!doctype html><html class="page--daily_quiz" data-page="daily_quiz"><body>{% block scratch_content %}{% endblock %}</body></html>', path: name };
    },
}, { autoescape: true });
env.addFilter('json', JSON.stringify);

const question = (overrides = {}) => ({
    id: '1:1', paperTitle: 'Scratch 入门', kind: 'single', stem: '点击哪一个按钮开始运行？',
    options: ['绿旗', '停止', '保存'], score: 10, ...overrides,
});
const initial = (overrides = {}) => ({
    title: '认识小猫', revision: 'revision-1', actionUrl: '/d/scratch/scratch/assignment/1/quiz', backUrl: '/d/scratch/scratch/assignment/1',
    items: [question(), question({ id: '1:2', kind: 'multiple' })], completed: false, score: 0, totalScore: 20, readOnly: false, ...overrides,
});
const answerResult = (overrides = {}) => ({ state: initial({ items: [question({ selected: ['A'], correct: true, answers: ['A'] }), question({ id: '1:2' })], score: 10, ...overrides }) });
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function harness(data = initial(), handler = async () => answerResult()) {
    const dom = new JSDOM(env.render('scratch_objective_quiz.html', { UiContext: {scratchObjectiveQuiz: data} }), {
        url: 'https://example.test/daily-quiz', pretendToBeVisual: true,
    });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window;
    global.document = dom.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const mod = { exports: {} };
    const roots = [];
    const calls = [];
    const focuses = [];
    const originalFocus = dom.window.HTMLElement.prototype.focus;
    dom.window.HTMLElement.prototype.focus = function focus(options) {
        focuses.push({ element: this, options });
        return originalFocus.call(this, options);
    };
    let post = handler;
    vm.runInNewContext(code, {
        window: dom.window, document: dom.window.document, URL: dom.window.URL,
        module: mod, exports: mod.exports,
        require(name) {
            if (name === 'vj/misc/Page') {
                return { NamedPage: class {
                    constructor(pageName, callback) { this.name = pageName; this.callback = callback; }
                } };
            }
            if (name === 'react-dom/client') {
                return { createRoot(element) {
                    const root = ReactDOM.createRoot(element);
                    roots.push(root);
                    return root;
                } };
            }
            if (name === 'vj/utils') {
                return { request: { post(url, body, options) {
                    calls.push({ url, body: JSON.parse(JSON.stringify(body)), options });
                    return post(url, body);
                } } };
            }
            return require(name);
        },
    });
    await act(async () => mod.exports.default.callback());
    const query = (selector) => dom.window.document.querySelector(selector);
    return {
        dom, query, calls, focuses, module: mod.exports,
        setPost: (fn) => { post = fn; },
        click: async (selector) => act(async () => { query(selector).click(); await flush(); }),
        submit: async () => act(async () => {
            query('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true, bubbles: true }));
            await flush();
        }),
        cleanup: async () => {
            await act(async () => { for (const root of roots) root.unmount(); });
            dom.window.close();
            global.window = previous.window;
            global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        },
    };
}

describe('Scratch classroom quiz', () => {
    it('shows one question, hides answers, requires a selection and keeps native single choice', async () => {
        const h = await harness();
        try {
            assert.equal(h.query('[role=progressbar]').getAttribute('aria-valuenow'), '0');
            assert.equal(h.query('.sc-quiz__feedback'), null);
            await h.submit();
            assert.equal(h.calls.length, 0);
            assert.match(h.query('[role=alert]').textContent, /先选好答案/);
            await h.click('input[value=A]');
            await h.click('input[value=B]');
            assert.equal(h.query('input[value=A]').checked, false);
            assert.equal(h.query('input[value=B]').checked, true);
        } finally { await h.cleanup(); }
    });
    it('retains multi-selection on failure and prevents duplicate in-flight saves', async () => {
        let reject;
        const h = await harness(initial({ items: [question({ kind: 'multiple' })] }), () => new Promise((resolve, fail) => { reject = fail; }));
        try {
            await h.click('input[value=A]'); await h.click('input[value=C]');
            await h.submit(); await h.submit();
            assert.equal(h.calls.length, 1);
            assert.deepEqual(h.calls[0].body.answers, ['A', 'C']);
            assert.equal(h.calls[0].body.revision, 'revision-1');
            assert.equal(h.query('fieldset').disabled, true);
            await act(async () => { reject(new Error('网络暂时不可用')); await flush(); });
            assert.equal(h.query('input[value=A]').checked, true);
            assert.equal(h.query('input[value=C]').checked, true);
            assert.match(h.query('[role=alert]').textContent, /网络暂时不可用/);
            assert.equal(h.query('button[type=submit]').disabled, false);
        } finally { await h.cleanup(); }
    });
    it('shows wrong feedback with safe explanation until acknowledged, including the last question', async () => {
        const h = await harness(initial({ items: [question()], totalScore: 10 }), async () => answerResult({
            items: [question({ selected: ['B'], correct: false, answers: ['A'], analysis: '**绿旗**开始运行。<script>bad()</script>' })],
            completed: true, score: 0, totalScore: 10,
        }));
        try {
            await h.click('input[value=B]'); await h.submit();
            assert(h.query('.sc-quiz__feedback.is-wrong'));
            assert.equal(h.query('.sc-quiz__analysis strong').textContent, '绿旗');
            assert.equal(h.query('.sc-quiz__analysis script'), null);
            assert.match(h.query('button[type=submit]').textContent, /知道了/);
            assert.equal(h.query('.sc-quiz__complete'), null);
            await h.submit();
            assert(h.query('.sc-quiz__complete'));
            assert.equal(h.calls.length, 1, 'acknowledgement never resubmits an answer');
            assert.match(h.query('.sc-quiz__stats').textContent, /1完成题目0答对题目/);
        } finally { await h.cleanup(); }
    });
    it('locks saved choices and hides empty or correct explanations', async () => {
        for (const correct of [true, false]) {
            const h = await harness(initial({ items: [question({ correct, selected: ['B'], answers: ['A'], analysis: correct ? 'PRIVATE_CORRECT' : '   ' })] }));
            try {
                assert.equal(h.query('fieldset').disabled, true);
                assert.equal(h.query('.sc-quiz__analysis'), null);
                assert.doesNotMatch(h.dom.window.document.body.textContent, /知道了|PRIVATE_CORRECT/);
                assert.equal(h.query('input[value=B]').checked, true);
            } finally { await h.cleanup(); }
        }
    });
    it('lets teachers inspect answered and unanswered questions without submitting', async () => {
        const h = await harness(initial({ readOnly: true, studentName: '小明', items: [question({ correct: true, selected: ['A'], answers: ['A'] }), question({ id: '1:2' })] }));
        try {
            assert.match(h.query('.sc-eyebrow').textContent, /小明/);
            assert.equal(h.query('fieldset').disabled, true);
            assert.equal(h.query('button[type=submit]'), null);
            assert.match(h.query('.sc-quiz__notice').textContent, /还没有作答/);
            await h.click('.sc-quiz__numbers button');
            assert.match(h.query('.sc-quiz__feedback').textContent, /回答正确/);
            await h.submit();
            assert.equal(h.calls.length, 0);
        } finally { await h.cleanup(); }
    });
    it('restores progress and rejects unconfirmed answer responses', async () => {
        const h = await harness(initial({ items: [question({ correct: true, selected: ['A'], answers: ['A'] }), question({ id: '1:2' })] }), async () => ({ state: initial() }));
        try {
            assert.match(h.query('.sc-quiz__meta strong').textContent, /第 2 题/);
            await h.click('input[value=B]'); await h.submit();
            assert.match(h.query('[role=alert]').textContent, /确认保存成功/);
            assert.equal(h.query('input[value=B]').checked, true);
            assert.equal(h.query('[role=progressbar]').getAttribute('aria-valuenow'), '1');
        } finally { await h.cleanup(); }
    });
    it('keeps expired homework available for review without accepting new answers', async () => {
        const h = await harness(initial({ deadline: '2020-01-01T00:00:00Z' }));
        try {
            assert.match(h.query('.sc-quiz__notice').textContent, /作业已截止/);
            assert.equal(h.query('fieldset').disabled, true);
            assert.equal(h.query('button[type=submit]').disabled, true);
            await h.submit();
            assert.equal(h.calls.length, 0);
        } finally { await h.cleanup(); }
    });
    it('scopes mobile styles and respects reduced motion', () => {
        const css = stylus.render(fs.readFileSync(path.join(uiRoot, 'pages/scratch_objective_quiz.page.styl'), 'utf8'));
        assert.match(css, /@media \(max-width: 480px\)/);
        assert.match(css, /prefers-reduced-motion: reduce/);
        assert.match(css, /\.page--scratch_objective_quiz \.scratch-app \.sc-quiz \.sc-quiz__option/);
    });
});
