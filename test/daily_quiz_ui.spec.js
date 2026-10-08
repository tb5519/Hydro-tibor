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
    entryPoints: [path.join(uiRoot, 'pages/daily_quiz.page.tsx')], bundle: true, write: false,
    packages: 'external', platform: 'node', format: 'cjs',
    alias: { 'vj/backendlib/markdown-it-katex': path.join(uiRoot, 'backendlib/markdown-it-katex.ts') },
}).outputFiles[0].text;
const template = fs.readFileSync(path.join(uiRoot, 'templates/daily_quiz.html'), 'utf8');
const env = new nunjucks.Environment({
    getSource(name) {
        return { src: name === 'daily_quiz.html' ? template
            : '<!doctype html><html class="page--daily_quiz" data-page="daily_quiz"><body>{% block body %}{% endblock %}</body></html>', path: name };
    },
}, { autoescape: true });
env.addFilter('json', JSON.stringify);

const question = (overrides = {}) => ({
    id: 1, position: 1, total: 2, domainId: 'python', domainName: 'Python 训练', kind: 'single',
    title: '循环基础', stem: '下面哪段代码会输出 **1**？', options: ['`print(1)`', '`print(2)`', '`print(3)`'],
    tags: ['循环', '编程基础'], points: 5, ...overrides,
});
const state = (overrides = {}) => ({
    sessionId: 'session-1', day: '2026-10-08', round: 1, enabled: true, required: true, completed: false,
    total: 2, answered: 0, earnedPoints: 0, possiblePoints: 10, current: question(), shortage: 0, ...overrides,
});
const initial = (overrides = {}) => ({
    state: state(), actionUrl: '/daily-quiz', statusUrl: '/daily-quiz/status', returnUrl: '/d/python/homework?status=ongoing', ...overrides,
});
const feedback = (overrides = {}) => ({
    correct: true, answers: ['A'], selectedAnswers: ['A'], analysis: '使用 `print(1)` 可以输出 **1**。', earnedPoints: 5, ...overrides,
});
const answerResult = (overrides = {}) => ({
    state: state({ answered: 1, earnedPoints: 5, current: question({ feedback: feedback() }), ...overrides }),
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function harness(data = initial(), handler = async () => answerResult()) {
    const dom = new JSDOM(env.render('daily_quiz.html', { dailyQuiz: data }), {
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

describe('daily quiz learner page', () => {
    it('safely serializes the initial snapshot without navigation or hidden answer markup', () => {
        const data = initial({ state: state({ current: question({ title: '"><script>window.bad=true</script>' }) }) });
        const dom = new JSDOM(env.render('daily_quiz.html', { dailyQuiz: data }));
        try {
            assert.deepEqual(JSON.parse(dom.window.document.querySelector('[data-daily-quiz]').dataset.initial), data);
            assert.equal(dom.window.document.querySelector('script'), null);
            assert.equal(dom.window.document.querySelector('nav'), null);
            assert.match(template, /extends "layout\/simple.html"/);
            const translations = yaml.load(fs.readFileSync(path.join(uiRoot, 'locales/zh.yaml'), 'utf8'));
            assert.equal(translations.daily_quiz, '每日问答');
        } finally { dom.window.close(); }
    });

    it('shows one accessible question with progress, tags, safe Markdown, and no unsubmitted solution', async () => {
        const h = await harness(initial({ state: state({ current: question({
            stem: '**题干** <img src=x onerror=alert(1)> [坏链接](javascript:alert(1)) $x^2$',
            answers: ['B'], analysis: 'PRIVATE_UNSUBMITTED_EXPLANATION',
        }) }) }));
        try {
            assert.equal(h.query('[role=progressbar]').getAttribute('aria-valuenow'), '0');
            assert.match(h.query('.daily-quiz__meta').textContent, /单选题.*Python 训练.*循环/s);
            assert.equal(h.dom.window.document.querySelectorAll('input[type=radio]').length, 3);
            const input = h.query('input[value=A]');
            assert.equal(h.dom.window.document.getElementById(input.getAttribute('aria-describedby')).textContent.trim(), 'print(1)');
            assert.equal(h.query('[data-daily-quiz-feedback]'), null);
            assert.doesNotMatch(h.dom.window.document.body.textContent, /PRIVATE_UNSUBMITTED_EXPLANATION|正确答案：/);
            assert.equal(h.query('img[onerror]'), null);
            assert.equal(h.query('a[href^="javascript:"]'), null);
            assert.equal(h.query('.daily-quiz__question strong').textContent, '题干');
            assert(h.query('.katex'));
            assert.equal(h.focuses[0].element, h.query('.daily-quiz__question'));
            assert.equal(h.focuses[0].options.preventScroll, true, 'initial focus must preserve the page top');
        } finally { await h.cleanup(); }
    });

    it('keeps native radio semantics and requires an answer before sending a request', async () => {
        const h = await harness();
        try {
            await h.submit();
            assert.equal(h.calls.length, 0);
            assert.match(h.query('[role=alert]').textContent, /先选择一个答案/);
            assert.equal(h.dom.window.document.activeElement, h.query('input[value=A]'));
            await h.click('input[value=A]');
            await h.click('input[value=B]');
            assert.equal(h.query('input[value=A]').checked, false);
            assert.equal(h.query('input[value=B]').checked, true);
            assert.equal(h.query('[role=alert]'), null);
        } finally { await h.cleanup(); }
    });

    it('shares a pending guard, preserves multi-selection after failure, and retries without duplicate requests', async () => {
        let reject;
        const h = await harness(initial({ state: state({ current: question({ kind: 'multiple' }) }) }),
            () => new Promise((resolve, fail) => { reject = fail; }));
        try {
            await h.click('input[value=A]');
            await h.click('input[value=C]');
            await h.click('button[type=submit]');
            await h.submit();
            assert.equal(h.calls.length, 1);
            assert.deepEqual(h.calls[0].body, { operation: 'answer', sessionId: 'session-1', questionId: 1, answers: ['A', 'C'] });
            assert.equal(h.calls[0].options.timeout, 20000);
            assert.equal(h.query('fieldset').disabled, true);
            assert.equal(h.query('form').getAttribute('aria-busy'), 'true');
            assert.match(h.query('button[type=submit]').textContent, /正在保存/);
            await act(async () => {
                reject(new Error('网络暂时不可用'));
                await flush();
            });
            assert.equal(h.query('fieldset').disabled, false);
            assert.equal(h.query('button[type=submit]').disabled, false);
            assert.equal(h.query('input[value=A]').checked, true);
            assert.equal(h.query('input[value=C]').checked, true);
            assert.match(h.query('[role=alert]').textContent, /当前选择已保留/);
            h.setPost(async () => answerResult({ current: question({ kind: 'multiple', feedback: feedback({
                answers: ['A', 'C'], selectedAnswers: ['A', 'C'],
            }) }) }));
            await h.click('button[type=submit]');
            assert.equal(h.calls.length, 2);
            assert.deepEqual(h.calls[1].body.answers, ['A', 'C']);
            assert.match(h.query('[data-daily-quiz-feedback]').textContent, /答对了.*\+5 积分/s);
            assert(h.query('[data-daily-quiz-feedback]').classList.contains('is-correct'));
            assert(h.query('.daily-quiz__feedback-icon .daily-quiz__checkmark'));
            assert.equal(h.query('.daily-quiz__award').getAttribute('aria-label'), '本题获得 5 积分');
            assert.equal(h.dom.window.location.pathname, '/daily-quiz');
        } finally { await h.cleanup(); }
    });

    it('restores saved feedback after refresh and marks the learner selection separately from the correct answer', async () => {
        const saved = feedback({ correct: false, selectedAnswers: ['B'], earnedPoints: 0,
            analysis: '应选择 **A**。<script>alert(1)</script>' });
        const h = await harness(initial({ state: state({ answered: 1, current: question({ feedback: saved }) }) }));
        try {
            assert.equal(h.query('input[value=B]').checked, true);
            assert.equal(h.query('input[value=A]').checked, false);
            assert.equal(h.query('fieldset').disabled, true);
            assert(h.query('[data-daily-quiz-option=A]').classList.contains('is-correct'));
            assert(h.query('[data-daily-quiz-option=B]').classList.contains('is-incorrect'));
            assert.match(h.query('[data-daily-quiz-feedback]').textContent, /这次没答对.*\+0 积分/s);
            assert(h.query('[data-daily-quiz-feedback]').classList.contains('is-incorrect'));
            assert.match(h.query('.daily-quiz__answer-summary').textContent, /你的选择B正确答案A/);
            assert.equal(h.query('.daily-quiz__checkmark'), null, 'incorrect feedback must not play the success effect');
            assert.equal(h.query('.daily-quiz__analysis strong').textContent, 'A');
            assert.equal(h.query('.daily-quiz__analysis script'), null);
            assert.equal(h.dom.window.document.activeElement, h.query('[data-daily-quiz-feedback]'));
            assert.equal(h.focuses[0].options.preventScroll, true, 'refreshing feedback must preserve the page top');
            assert.equal(h.calls.length, 0, 'refresh must not resubmit or award points again');
        } finally { await h.cleanup(); }
    });

    it('keeps the current feedback when next fails, then opens exactly the next question', async () => {
        const h = await harness(initial({ state: answerResult().state }), async () => { throw new Error('稍后重试'); });
        try {
            await h.submit();
            assert.deepEqual(h.calls[0].body, { operation: 'next', sessionId: 'session-1', questionId: 1 });
            assert(h.query('[data-daily-quiz-feedback]'));
            assert.equal(h.query('input[value=A]').checked, true);
            h.setPost(async () => ({ state: state({ answered: 1, earnedPoints: 5,
                current: question({ id: 2, position: 2, domainName: 'C++ 训练', kind: 'multiple' }) }) }));
            await h.submit();
            assert.match(h.query('.daily-quiz__meta').textContent, /多选题.*C\+\+ 训练.*第 2 题/s);
            assert.equal(h.query('[data-daily-quiz-feedback]'), null);
            assert.equal(h.query('input:checked'), null);
            assert.equal(h.query('[role=progressbar]').getAttribute('aria-valuenow'), '1');
            assert.equal(h.dom.window.document.activeElement, h.query('.daily-quiz__question'));
            assert.equal(h.focuses.at(-1).options.preventScroll, false, 'the next question should remain visible');
        } finally { await h.cleanup(); }
    });

    it('lets an incorrect last answer finish after showing feedback and offers the safe original destination', async () => {
        const last = state({ total: 1, possiblePoints: 5, current: question({ total: 1 }) });
        const done = state({ total: 1, answered: 1, possiblePoints: 5, required: false, completed: true,
            current: question({ total: 1, feedback: feedback({ correct: false, selectedAnswers: ['B'], earnedPoints: 0 }) }) });
        const h = await harness(initial({ state: last }), async () => ({ state: done }));
        try {
            await h.click('input[value=B]');
            await h.submit();
            assert(h.query('[data-daily-quiz-feedback]'));
            assert.equal(h.query('[data-daily-quiz-complete]'), null);
            assert.match(h.query('button[type=submit]').textContent, /完成今日问答/);
            h.setPost(async () => ({ state: { ...done, current: null } }));
            await h.submit();
            assert(h.query('[data-daily-quiz-complete]'));
            assert.equal(h.query('input'), null);
            assert.match(h.query('.daily-quiz__stats').textContent, /1完成题目\+0今日积分/);
            assert.equal(h.query('a.daily-quiz__primary').getAttribute('href'), '/d/python/homework?status=ongoing');
            assert.equal(h.dom.window.document.activeElement, h.query('h1'));
        } finally { await h.cleanup(); }
    });

    it('never treats a missing confirmation or another session as a successful save', async () => {
        const h = await harness(initial(), async () => ({ state: state({ sessionId: 'somebody-else' }) }));
        try {
            await h.click('input[value=C]');
            await h.submit();
            assert.equal(h.query('input[value=C]').checked, true);
            assert.equal(h.query('[data-daily-quiz-feedback]'), null);
            assert.equal(h.query('[role=progressbar]').getAttribute('aria-valuenow'), '0');
            assert.match(h.query('[role=alert]').textContent, /确认保存结果/);
            h.setPost(async () => ({}));
            await h.submit();
            assert.equal(h.query('input[value=C]').checked, true);
            assert.equal(h.query('button[type=submit]').disabled, false);
        } finally { await h.cleanup(); }
    });

    it('handles a zero-question day without trapping the learner and rejects unsafe return destinations', async () => {
        const h = await harness(initial({ state: state({ total: 0, current: null, required: false, completed: true }),
            returnUrl: '//evil.test/phishing' }));
        try {
            assert.match(h.query('h1').textContent, /暂时没有问答/);
            assert.equal(h.query('[role=progressbar]'), null);
            assert.equal(h.query('a.daily-quiz__primary').getAttribute('href'), '/');
            const safe = h.module.safeQuizReturnUrl;
            for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '\n//evil.test']) {
                assert.equal(safe(value, 'https://example.test'), '/');
            }
            assert.equal(safe('/d/python/p/P1?x=1#statement', 'https://example.test'), '/d/python/p/P1?x=1#statement');
        } finally { await h.cleanup(); }
    });

    it('uses brief localized success motion and disables it for reduced-motion preferences', async () => {
        const source = fs.readFileSync(path.join(uiRoot, 'pages/daily_quiz.page.styl'), 'utf8');
        const css = await new Promise((resolve, reject) => stylus(source).render((error, result) => error ? reject(error) : resolve(result)));
        assert.match(css, /\.is-correct \.daily-quiz__feedback-icon\s*\{[^}]*animation: daily-quiz-correct-pop 0?\.42s/);
        assert.match(css, /\.is-correct \.daily-quiz__award\s*\{[^}]*animation: daily-quiz-points/);
        assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.daily-quiz__feedback-icon,[\s\S]*?animation: none/);
        assert.match(css, /\.daily-quiz__feedback\.is-incorrect\s*\{[^}]*background: #fffbf6/);
    });

    it('keeps option rows and form controls scoped above the shared label and button styles', async () => {
        const source = fs.readFileSync(path.join(uiRoot, 'pages/daily_quiz.page.styl'), 'utf8');
        const css = stylus.render(source);
        const h = await harness();
        try {
            const style = h.dom.window.document.createElement('style');
            style.textContent = [
                'label:not(.quick-input-list-label){display:block;margin:0;line-height:1.8}',
                'button{padding:0;border:0;border-radius:0;line-height:1}legend{border:0;padding:0}', css,
            ].join('');
            h.dom.window.document.head.append(style);
            const rules = Array.from(style.sheet.cssRules);
            const optionRule = rules.find((rule) => rule.selectorText === '.page--daily_quiz .daily-quiz .daily-quiz__option');
            assert(optionRule, 'option specificity must exceed the shared label:not(...) rule');
            const option = h.query('[data-daily-quiz-option=A]');
            const optionStyle = h.dom.window.getComputedStyle(option);
            assert.equal(optionStyle.display, 'flex');
            assert.equal(optionStyle.marginBottom, '10px');
            assert.equal(h.dom.window.getComputedStyle(h.query('fieldset')).padding, '0px');
            const buttonRule = rules.find((rule) => rule.selectorText === '.page--daily_quiz .daily-quiz .daily-quiz__primary');
            assert.equal(buttonRule.style.getPropertyValue('border-radius'), '10px');
            const motionRule = rules.find((rule) => rule.conditionText === '(prefers-reduced-motion: reduce)');
            assert(motionRule.cssText.includes('.daily-quiz__feedback.is-correct .daily-quiz__feedback-icon'));
            assert(motionRule.cssText.includes('.daily-quiz__feedback.is-correct .daily-quiz__award'));
            for (const rule of rules.slice(3).filter((item) => item.selectorText)) {
                for (const selector of rule.selectorText.split(',')) {
                    assert(selector.trim().startsWith('.page--daily_quiz'), `unscoped selector: ${selector}`);
                }
            }
        } finally { await h.cleanup(); }
    });
});
