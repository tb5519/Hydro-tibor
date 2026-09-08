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
        <div class="problem-content"><div class="typo">${statementHtml}</div></div>
        <div class="section--problem-sidebar"><ol class="menu"></ol></div>
        </body></html>`, { url: 'https://example.test/p/P5983', pretendToBeVisual: true });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window;
    global.document = dom.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const $ = jqueryFactory(dom.window);
    const calls = { post: [], get: [], save: [], dialogs: [], errors: [], info: [] };
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
                get: async () => options.saved,
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
});
