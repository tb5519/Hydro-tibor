const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const jqueryFactory = require('jquery');
const { JSDOM } = require('jsdom');
const yaml = require('js-yaml');
const React = require('react');
const ReactDOM = require('react-dom/client');

const uiRoot = path.resolve(__dirname, '../packages/ui-default');
const rid = '6aa000000000000000000001';
const compile = (entry) => esbuild.buildSync({
    entryPoints: [path.join(uiRoot, entry)],
    write: false,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'cjs',
}).outputFiles[0].text;
const controllerCode = compile('components/objective/objective.tsx');
const utilitiesCode = compile('utils/base.ts');
const statementHtml = `
    <p>第一题 {{ select(1) }}</p><ul><li>甲</li><li>乙</li></ul>
    <p>第二题 {{ select(2) }}</p><ul><li>真</li><li>假</li></ul>
    <p>第三题 {{ select(3) }}</p><ul><li>是</li><li>否</li></ul>
    <p>第四题 {{ input(4) }}</p>
    <p>第五题 {{ textarea(5) }}</p>
    <p>第六题 {{ multiselect(6) }}</p><ul><li>一</li><li>二</li><li>三</li></ul>`;
const question = (id, result) => ({
    id: String(id),
    result,
    answered: result !== 'unanswered',
    score: result === 'correct' ? 10 : 0,
    maxScore: 10,
});
const complete = (questions = [question(1, 'correct'), ...[2, 3, 4, 5, 6].map((id) => question(id, 'unanswered'))]) => ({
    objective: { rid, state: 'complete', score: questions.reduce((sum, item) => sum + item.score, 0), totalScore: 60, questions },
});
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
};

async function harness(options = {}) {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div class="outer-loader-container"></div>
        <button id="other-submit" type="button">其他递交</button>
        <nav class="nav" style="position: fixed"></nav>
        <div class="problem-content"><div class="typo">${options.statementHtml || statementHtml}</div></div>
        <div class="section--problem-sidebar"><ol class="menu"></ol></div>
        </body></html>`, { url: options.url || 'https://example.test/p/P5983', pretendToBeVisual: true });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window;
    global.document = dom.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const $ = jqueryFactory(dom.window);
    const calls = { post: [], get: [], load: [], save: [], dialogs: [], errors: [], info: [], scroll: [] };
    dom.window.scrollTo = (settings) => calls.scroll.push(settings);
    dom.window.matchMedia = () => ({ matches: !!options.reducedMotion });
    const roots = [];
    class InfoDialog {
        constructor(config) {
            this.config = config;
            this.$dom = $('<div class="dialog"><div class="dialog__content"></div></div>');
            this.$dom.find('.dialog__content').append(config.$body, config.$action);
            calls.dialogs.push(this);
        }

        open() {
            $('body').append(this.$dom);
            return new Promise((resolve) => { this.resolve = resolve; });
        }

        close() {
            this.$dom.remove();
            this.resolve?.();
        }
    }
    const globals = { window: dom.window, document: dom.window.document, setTimeout, clearTimeout };
    const execute = (code, mocks) => {
        const mod = { exports: {} };
        vm.runInNewContext(code, {
            ...globals,
            module: mod,
            exports: mod.exports,
            require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id),
            UserContext: { _id: 11 },
            UiContext: {
                pdoc: { domainId: 'system', docId: 5983 },
                postSubmitUrl: '/p/5983/submit',
                objectiveSubmitFeedbackUrl: '/record/{rid}/objective',
                ...options.context,
            },
        });
        return mod.exports;
    };
    const utilities = execute(utilitiesCode, { jquery: $ });
    const controller = execute(controllerCode, {
        jquery: $,
        'react-dom/client': {
            ...ReactDOM,
            createRoot(element) {
                const root = ReactDOM.createRoot(element);
                roots.push(root);
                return root;
            },
        },
        'vj/components/dialog': { InfoDialog, confirm: async () => true },
        'vj/components/notification': {
            info: (message) => calls.info.push(message),
            error: (message) => calls.errors.push(message),
        },
        'vj/utils': {
            ...utilities,
            delay: options.delay || (() => Promise.resolve()),
            request: {
                async post(...args) {
                    calls.post.push(args);
                    return options.post ? options.post(...args) : { rid };
                },
                async get(...args) {
                    calls.get.push(args);
                    return options.get ? options.get(...args) : complete();
                },
            },
        },
        'vj/utils/db': {
            openDB: options.storageUnavailable ? Promise.reject(new Error('Storage unavailable')) : Promise.resolve({
                get: async (...args) => { calls.load.push(args); return options.saved; },
                put: async (...args) => { calls.save.push(args); },
            }),
        },
    });
    await React.act(async () => { await controller.loadObjective(); });
    const flush = () => React.act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    async function event(selector, type = 'click') {
        const element = dom.window.document.querySelector(selector);
        assert.ok(element, `Missing element: ${selector}`);
        await React.act(async () => { $(element).trigger(type); });
        await flush();
    }
    async function answer(id, value, checked = true) {
        const choice = [...dom.window.document.querySelectorAll(`[name="${id}"]`)]
            .find((input) => ['radio', 'checkbox'].includes(input.type) && input.value === value);
        const selector = choice ? `[name="${id}"][value="${choice.value}"]` : `[name="${id}"]`;
        const input = dom.window.document.querySelector(selector);
        if (input.type === 'radio' || input.type === 'checkbox') input.checked = checked;
        else input.value = value;
        await event(selector, 'input');
    }
    return {
        dom,
        doc: dom.window.document,
        calls,
        controller,
        answer,
        event,
        flush,
        submit: () => event('.objective-submit'),
        nav: (id) => dom.window.document.querySelector(`.objective-nav-item[href="#p${id}"]`),
        async close() {
            await React.act(async () => {
                for (const root of roots) root.unmount();
                for (const dialog of calls.dialogs) dialog.close();
            });
            dom.window.close();
            global.window = previous.window;
            global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        },
    };
}

describe('objective answer submission UI', { concurrency: false }, () => {
    it('anchors the start of complete question stems, including images, code and free answers', async (t) => {
        const h = await harness({ statementHtml: `
            <h1>试卷标题</h1><p>试卷说明，不是题干。</p><h2>一、选择题</h2>
            <p data-stem="1">第 1 题 多行题干<br>第二行 {{ select(1) }}</p><ul><li>甲</li><li>乙</li></ul>
            <p data-stem="2">第 2 题 图片题干</p><p><img src="diagram.png" alt="题目插图"></p>
            <p>{{ select(2) }}</p><ul><li>正确</li><li>错误</li></ul>
            <h3 id="original-heading" data-stem="3">第 3 题 代码题干</h3><pre><code>print(1)</code></pre>
            <p>根据程序选择所有正确选项。{{ multiselect(3) }}</p><ul><li>一</li><li>二</li></ul>
            <h2>二、填空题</h2><p data-stem="4">第 4 题 填写结果</p><pre><code>1 + 1</code></pre><p>{{ input(4) }}</p>
            <p data-stem="5">第 5 题 请说明原因</p><p>这一段也属于本题。{{ textarea(5) }}</p>
            <p data-stem="6">没有题号的独立题干</p><p><img src="another.png" alt="另一幅图"></p>
            <p>{{ select(6) }}</p><ul><li>一</li><li>二</li></ul>
            <p data-stem="7">第 7 题 同段的两处填空：{{ input(7-1) }} 和 {{ input(7-2) }}</p>` });
        t.after(() => h.close());
        for (const id of ['1', '2', '3', '4', '5', '6', '7-1', '7-2']) {
            const anchor = h.doc.getElementById(`p${id}`);
            assert.ok(anchor, `Question ${id} has an anchor`);
            assert.equal(anchor.parentElement.dataset.stem, id.split('-')[0]);
            assert.equal(h.doc.querySelectorAll(`[id="p${id}"]`).length, 1);
            assert.equal(anchor.closest('.objective-options, .objective-free-answer'), null);
        }
        assert.equal(h.doc.getElementById('original-heading').tagName, 'H3');
        assert.equal(h.doc.querySelectorAll('.objective-input').length, 12);
    });

    it('scrolls the clicked number below the current fixed navigation and keeps homework review context', async () => {
        for (const readOnly of [false, true]) {
            const h = await harness({
                context: readOnly ? { homeworkReview: { uid: 23, name: '学员' } } : {},
                url: `https://example.test/p/P5983?tid=homework${readOnly ? '&reviewUid=23' : ''}`,
                reducedMotion: readOnly,
            });
            try {
                const nav = h.doc.querySelector('.nav');
                nav.getBoundingClientRect = () => ({ bottom: 60 });
                Object.defineProperty(h.dom.window, 'scrollY', { value: 200, configurable: true });
                h.doc.getElementById('p2').getBoundingClientRect = () => ({ top: 500 });
                let globalAnchorClicks = 0;
                h.doc.body.addEventListener('click', () => { globalAnchorClicks++; });
                const clickNumber = new h.dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
                await React.act(async () => { h.nav(2).querySelector('.id').dispatchEvent(clickNumber); });
                assert.equal(clickNumber.defaultPrevented, true);
                assert.equal(h.calls.scroll.length, 1);
                assert.equal(h.calls.scroll[0].top, 624);
                assert.equal(h.calls.scroll[0].behavior, readOnly ? 'auto' : 'smooth');
                assert.equal(h.dom.window.location.search, `?tid=homework${readOnly ? '&reviewUid=23' : ''}`);
                assert.equal(h.dom.window.location.hash, '#p2');
                assert.equal(globalAnchorClicks, 0, 'Do not run the global anchor animation a second time');
                nav.getBoundingClientRect = () => ({ bottom: 80 });
                await React.act(async () => {
                    h.nav(2).dispatchEvent(new h.dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
                });
                assert.equal(h.calls.scroll[1].top, 604, 'A resized navigation gets a fresh offset');
                assert.equal(h.dom.window.history.length, 2, 'Repeated navigation does not duplicate history');
            } finally {
                await h.close();
            }
        }
    });

    it('submits only the objective button and presents student score and total without navigation', async (t) => {
        const h = await harness();
        t.after(() => h.close());
        await h.answer(1, 'A');
        await h.event('#other-submit');
        assert.equal(h.calls.post.length, 0);
        await h.submit();
        assert.equal(h.calls.post.length, 1);
        assert.equal(h.calls.post[0][0], '/p/5983/submit');
        assert.deepEqual(yaml.load(h.calls.post[0][1].code), { 1: 'A' });
        assert.equal(h.calls.post[0][1].lang, '_');
        assert.equal(h.dom.window.location.href, 'https://example.test/p/P5983');
        assert.equal(h.calls.dialogs.length, 1);
        assert.equal(h.doc.querySelector('.objective-result__score strong').textContent, '10');
        assert.match(h.doc.querySelector('.objective-result__total').textContent, /总分 60 分/);
        assert.ok(h.doc.querySelector('[role="dialog"][aria-modal="true"][aria-label="客观题成绩"]'));
        assert.equal(h.doc.querySelector('.objective-submit').disabled, false);
        assert.ok(h.doc.querySelector('.objective-nav-card .objective-submit'));
        assert.equal(h.doc.querySelector('.problem-content .objective-submit'), null);
        assert.equal(h.doc.querySelector('.objective-nav-result-score strong').textContent, '10');
    });

    it('locks answers while submitting and polling, preventing duplicate requests', async (t) => {
        const post = deferred();
        const pause = deferred();
        let poll = 0;
        const h = await harness({
            post: () => post.promise,
            get: () => ++poll === 1 ? { objective: { rid, state: 'pending' } } : complete(),
            delay: () => pause.promise,
        });
        t.after(() => h.close());
        await h.answer(1, 'A');
        await h.submit();
        await h.submit();
        assert.equal(h.calls.post.length, 1);
        assert.equal(h.doc.querySelector('.objective-submit').disabled, true);
        assert.ok([...h.doc.querySelectorAll('.objective-input')].every((input) => input.disabled));
        await React.act(async () => { post.resolve({ rid: { $oid: rid } }); });
        await h.flush();
        assert.equal(h.calls.get.length, 1);
        assert.equal(h.doc.querySelector('.objective-submit').disabled, true);
        assert.equal(h.calls.dialogs.length, 0);
        await h.submit();
        assert.equal(h.calls.post.length, 1);
        await React.act(async () => { pause.resolve(); });
        await h.flush();
        assert.equal(h.calls.get.length, 2);
        assert.equal(h.calls.dialogs.length, 1);
        assert.ok([...h.doc.querySelectorAll('.objective-input')].every((input) => !input.disabled));
    });

    it('marks correct and wrong answer cards and selected options, leaving unanswered and unselected options neutral', async (t) => {
        const h = await harness({ get: () => complete([
            question(1, 'correct'), question(2, 'incorrect'), question(3, 'unanswered'),
            question(4, 'correct'), question(5, 'incorrect'), question(6, 'correct'),
        ]) });
        t.after(() => h.close());
        await h.answer(1, 'A');
        await h.answer(2, 'B');
        await h.answer(4, '42');
        await h.answer(5, 'my explanation');
        await h.answer(6, 'C');
        await h.answer(6, 'A');
        await h.submit();
        assert.deepEqual(yaml.load(h.calls.post[0][1].code), { 1: 'A', 2: 'B', 4: '42', 5: 'my explanation', 6: ['A', 'C'] });
        for (const id of [1, 4, 6]) assert.ok(h.nav(id).classList.contains('is-correct'));
        for (const id of [2, 5]) assert.ok(h.nav(id).classList.contains('is-incorrect'));
        assert.equal(h.nav(3).className, 'objective-nav-item');
        assert.match(h.nav(3).getAttribute('aria-label'), /未答/);
        assert.ok(h.doc.querySelector('.objective_1 input[value="A"]').closest('label').classList.contains('is-correct'));
        assert.ok(h.doc.querySelector('.objective_2 input[value="B"]').closest('label').classList.contains('is-incorrect'));
        assert.equal(h.doc.querySelectorAll('.objective_6.is-correct').length, 2);
        assert.ok(h.doc.querySelector('.objective_4').classList.contains('is-correct'));
        assert.ok(h.doc.querySelector('.objective_5').classList.contains('is-incorrect'));
        for (const input of h.doc.querySelectorAll('.objective-option input:not(:checked)')) {
            assert.equal(input.closest('label').hasAttribute('data-objective-result'), false);
        }
        assert.match(h.doc.querySelector('.objective-nav-legend').textContent, /正确.*错误.*未答/);
        assert.equal(h.doc.querySelector('.objective-result__score strong').textContent, '30');
    });

    it('clears the changed question result while preserving unchanged results and saved answers', async (t) => {
        const h = await harness({ get: () => complete([question(1, 'correct'), question(2, 'incorrect')]) });
        t.after(() => h.close());
        await h.answer(1, 'A');
        await h.answer(2, 'B');
        await h.submit();
        await h.answer(1, 'B');
        assert.equal(h.nav(1).className, 'objective-nav-item is-answered');
        assert.equal(h.doc.querySelectorAll('.objective_1.is-correct, .objective_1.is-incorrect').length, 0);
        assert.ok(h.nav(2).classList.contains('is-incorrect'));
        assert.deepEqual(JSON.parse(h.calls.save.at(-1)[1].value), { 1: 'B', 2: 'B' });
    });

    it('retries a failed result poll with the existing record instead of submitting twice', async (t) => {
        let poll = 0;
        const h = await harness({ get: () => {
            if (++poll === 1) throw new Error('temporary network failure');
            return complete();
        } });
        t.after(() => h.close());
        await h.answer(1, 'A');
        await h.submit();
        assert.equal(h.calls.post.length, 1);
        assert.equal(h.doc.querySelector('.objective-submit').value, '查看成绩');
        assert.equal(h.calls.dialogs.length, 0);
        assert.equal(h.calls.errors.length, 1);
        await h.submit();
        assert.equal(h.calls.post.length, 1);
        assert.equal(h.calls.get.length, 2);
        assert.ok(h.calls.get.every(([url]) => url === `/record/${rid}/objective`));
        assert.equal(h.calls.dialogs.length, 1);
    });

    it('does not show scores or grading colors when contest results are hidden', async (t) => {
        const h = await harness({ get: () => ({ objective: { rid, state: 'hidden' } }) });
        t.after(() => h.close());
        await h.answer(1, 'A');
        await h.submit();
        assert.equal(h.calls.dialogs.length, 0);
        assert.equal(h.doc.querySelectorAll('.is-correct, .is-incorrect').length, 0);
        assert.equal(h.nav(1).className, 'objective-nav-item is-answered');
        assert.match(h.doc.querySelector('[role="status"]').textContent, /暂不公开成绩/);
        assert.equal(h.calls.info.length, 1);
    });

    it('rejects mismatched record feedback without applying someone else’s result', async (t) => {
        const h = await harness({ get: () => ({ objective: { ...complete().objective, rid: '6aa000000000000000000002' } }) });
        t.after(() => h.close());
        await h.answer(1, 'A');
        await h.submit();
        assert.equal(h.calls.dialogs.length, 0);
        assert.equal(h.doc.querySelectorAll('.is-correct, .is-incorrect').length, 0);
        assert.equal(h.doc.querySelector('.objective-submit').value, '查看成绩');
        assert.equal(h.calls.errors.length, 1);
    });

    for (const [scenario, options] of [
        ['corrupted', { saved: { value: '{invalid' } }],
        ['unavailable', { storageUnavailable: true }],
    ]) {
        it(`continues after ${scenario} local drafts and treats blank free text as unanswered`, async (t) => {
            const h = await harness(options);
            t.after(() => h.close());
            assert.equal(h.doc.querySelectorAll('.objective-submit').length, 1);
            await h.answer(4, '   ');
            await h.answer(5, '\n\t');
            assert.equal(h.nav(4).className, 'objective-nav-item');
            assert.equal(h.nav(5).className, 'objective-nav-item');
            await h.answer(1, 'A');
            await h.submit();
            assert.equal(h.calls.post.length, 1);
            assert.equal(h.calls.dialogs.length, 1);
        });
    }

    it('restores a valid draft including checkbox selections without duplicating controls on repeated initialization', async (t) => {
        const h = await harness({ saved: { value: JSON.stringify({ 1: 'B', 4: '42', 5: 'draft', 6: ['A', 'C'] }) } });
        t.after(() => h.close());
        await React.act(async () => { await h.controller.loadObjective(); });
        assert.equal(h.doc.querySelectorAll('.objective-submit').length, 1);
        assert.equal(h.doc.querySelectorAll('#problem-navigation').length, 1);
        assert.equal(h.doc.querySelectorAll('.objective-nav-item').length, 6);
        assert.equal(h.doc.querySelector('[name="1"][value="B"]').checked, true);
        assert.equal(h.doc.querySelector('[name="4"]').value, '42');
        assert.equal(h.doc.querySelector('[name="5"]').value, 'draft');
        assert.equal(h.doc.querySelectorAll('[name="6"]:checked').length, 2);
        await h.answer(6, 'C', false);
        await h.submit();
        assert.equal(h.calls.post.length, 1);
        assert.deepEqual(yaml.load(h.calls.post[0][1].code), { 1: 'B', 4: '42', 5: 'draft', 6: ['A'] });
    });

    it('restores submitted answers, correct and wrong colors, and the sidebar score without reopening the result dialog', async (t) => {
        const h = await harness({ context: { objectiveInitialSubmission: {
            answers: { 1: 'A', 2: 'B', 4: '42', 6: ['C', 'A'] },
            feedback: complete([question(1, 'correct'), question(2, 'incorrect'), question(4, 'correct'), question(6, 'correct')]).objective,
        } } });
        t.after(() => h.close());
        assert.equal(h.doc.querySelector('[name="1"][value="A"]').checked, true);
        assert.equal(h.doc.querySelector('[name="4"]').value, '42');
        assert.equal(h.doc.querySelectorAll('[name="6"]:checked').length, 2);
        assert.ok(h.nav(1).classList.contains('is-correct'));
        assert.ok(h.nav(2).classList.contains('is-incorrect'));
        assert.ok(h.nav(6).classList.contains('is-correct'));
        assert.equal(h.doc.querySelector('.objective-nav-result-score strong').textContent, '30');
        assert.equal(h.calls.dialogs.length, 0);
        assert.equal(h.calls.get.length, 0);
        assert.equal(h.calls.post.length, 0);
    });

    it('prefers a changed local draft and grades only answers still matching the submitted record', async (t) => {
        const h = await harness({
            saved: { value: JSON.stringify({ 1: 'B', 2: 'B', 6: ['C', 'A'] }) },
            context: { objectiveInitialSubmission: {
                answers: { 1: 'A', 2: 'B', 6: ['A', 'C'] },
                feedback: complete([question(1, 'correct'), question(2, 'incorrect'), question(6, 'correct')]).objective,
            } },
        });
        t.after(() => h.close());
        assert.equal(h.doc.querySelector('[name="1"][value="B"]').checked, true);
        assert.equal(h.nav(1).className, 'objective-nav-item is-answered');
        assert.ok(h.nav(2).classList.contains('is-incorrect'));
        assert.ok(h.nav(6).classList.contains('is-correct'));
        assert.equal(h.doc.querySelector('.objective-nav-result-score strong').textContent, '20');
        assert.match(h.doc.querySelector('.objective-draft-note').textContent, /答案已修改/);
    });

    it('keeps cleared answers empty after reloading even though the last graded submission exists', async () => {
        const context = { objectiveInitialSubmission: { answers: { 1: 'A' }, feedback: complete().objective } };
        const first = await harness({ context });
        let saved;
        try {
            await first.event('.objective-clear');
            saved = first.calls.save.at(-1)[1];
            assert.deepEqual(JSON.parse(saved.value), {});
            assert.equal(first.doc.querySelectorAll('.objective-input:checked').length, 0);
        } finally { await first.close(); }
        const second = await harness({ context, saved });
        try {
            assert.equal(second.doc.querySelectorAll('.objective-input:checked').length, 0);
            assert.equal(second.doc.querySelectorAll('.is-correct, .is-incorrect').length, 0);
            assert.equal(second.doc.querySelector('.objective-nav-result-score strong').textContent, '10');
        } finally { await second.close(); }
    });

    it('silently resumes an initial pending submission and updates the sidebar when grading finishes', async (t) => {
        const result = deferred();
        const h = await harness({
            get: () => result.promise,
            context: { objectiveInitialSubmission: { answers: { 1: 'A' }, feedback: { rid, state: 'pending' } } },
        });
        t.after(() => h.close());
        assert.equal(h.calls.get.length, 1);
        assert.equal(h.doc.querySelector('.objective-submit').disabled, true);
        await React.act(async () => { result.resolve(complete()); });
        await h.flush();
        assert.ok(h.nav(1).classList.contains('is-correct'));
        assert.equal(h.doc.querySelector('.objective-nav-result-score strong').textContent, '10');
        assert.equal(h.calls.dialogs.length, 0);
        assert.equal(h.calls.post.length, 0);
        assert.equal(h.calls.info.length, 0);
    });

    it('never restores private scores or colors for a hidden initial result', async (t) => {
        const h = await harness({ context: { objectiveInitialSubmission: {
            answers: { 1: 'A' }, feedback: { rid, state: 'hidden' },
        } } });
        t.after(() => h.close());
        assert.equal(h.nav(1).className, 'objective-nav-item is-answered');
        assert.equal(h.doc.querySelector('.objective-nav-result-score strong').textContent, '—');
        assert.equal(h.doc.querySelectorAll('.is-correct, .is-incorrect').length, 0);
        assert.equal(h.calls.dialogs.length, 0);
    });

    it('shows a target learner’s submitted answers read-only and ignores the administrator’s local draft', async (t) => {
        const h = await harness({
            saved: { value: JSON.stringify({ 1: 'B', 4: 'teacher draft' }) },
            context: {
                homeworkReview: { uid: 22, name: '目标学员', rid },
                objectiveInitialSubmission: {
                    answers: { 1: 'A', 2: 'B', 4: 'student answer' },
                    feedback: complete([question(1, 'correct'), question(2, 'incorrect')]).objective,
                },
            },
        });
        t.after(() => h.close());
        assert.equal(h.doc.querySelector('[name="1"][value="A"]').checked, true);
        assert.equal(h.doc.querySelector('[name="4"]').value, 'student answer');
        assert.ok([...h.doc.querySelectorAll('.objective-input')].every((input) => input.disabled));
        assert.equal(h.doc.querySelector('.objective-submit'), null);
        assert.equal(h.doc.querySelector('.objective-clear'), null);
        assert.ok(h.nav(1).classList.contains('is-correct'));
        assert.ok(h.nav(2).classList.contains('is-incorrect'));
        assert.equal(h.doc.querySelector('.objective-nav-result-score strong').textContent, '10');
        assert.equal(h.calls.load.length, 0);
        assert.equal(h.calls.save.length, 0);
        assert.equal(h.calls.post.length, 0);
        assert.equal(h.calls.dialogs.length, 0);
    });
});
