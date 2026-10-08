const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { page, render, students, daily, settle } = require('./fixtures/student_management_ui');

function harness(t, query = 'uid=44&tab=daily&quizView=settings') {
    const dom = page(2, {}, query);
    t.after(() => dom.window.close());
    const doc = dom.window.document;
    const $ = (selector) => doc.querySelector(selector);
    const change = (selector, value, event = 'input') => {
        const input = $(selector);
        if (input.type === 'checkbox') input.checked = value; else input.value = value;
        input.dispatchEvent(new dom.window.Event(event, { bubbles: true }));
    };
    const refresh = () => $('[data-daily-catalog-refresh]').click();
    const settings = () => [...doc.querySelectorAll('.student-daily-subtabs button')].find((button) => button.textContent === '问答设置').click();
    const tag = (name, domain = 'Python 训练') => $(`input[aria-label="${domain}知识点：${name}"]`);
    return { dom, doc, $, change, refresh, settings, tag };
}
const response = (name, other = {}) => ({ ok: true, json: async () => ({ selectedDailyQuiz: {
    ...daily, ...other,
    domains: [{ ...daily.domains[0], tags: [{ name, count: 1 }], availableCount: 1, questionTags: [[name]] }, daily.domains[1]],
} }) });

describe('daily quiz knowledge tag catalog refresh', () => {
    it('saves every selected knowledge tag when the selection exceeds 20', async (t) => {
        const h = harness(t);
        h.change('[data-daily-enabled]', true, 'change');
        const names = Array.from({ length: 32 }, (_, index) => `知识点${index + 1}`);
        h.dom.window.fetch = async () => ({ ok: true, json: async () => ({ selectedDailyQuiz: {
            ...daily, domains: [{ ...daily.domains[0], availableCount: names.length,
                tags: names.map((name) => ({ name, count: 1 })), questionTags: names.map((name) => [name]) }, daily.domains[1]],
        } }) });
        h.refresh();
        await settle();
        for (const name of names) h.tag(name).click();
        assert.match(h.$('[data-daily-pool="system"]').textContent, /32 道素材/);
        let saved;
        h.dom.window.fetch = async (url, options) => {
            saved = JSON.parse(options.body.get('policy'));
            return { ok: true, json: async () => ({ saved: true }) };
        };
        h.$('[data-student-daily-form]').dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await settle();
        assert.deepEqual(saved.domains[0].tags, names);
        assert.equal(h.$('[data-daily-save]').disabled, false);
        const event = new h.dom.window.Event('beforeunload', { cancelable: true });
        h.dom.window.dispatchEvent(event);
        assert.equal(event.defaultPrevented, false, 'a successful large selection is no longer an unsaved edit');
    });

    it('refreshes tags, counts and selected missing tags without replacing any unsaved settings or focused controls', async (t) => {
        const h = harness(t);
        h.change('[data-daily-enabled]', true, 'change');
        h.change('[data-daily-count="system"]', '4');
        h.change('[aria-label="Python 训练默认积分"]', '7');
        h.change('[data-daily-point="system:1"]', '0');
        h.change('[data-daily-cooldown]', '5');
        h.tag('循环').click();
        const savedInput = h.tag('循环');
        savedInput.focus();
        const tagList = savedInput.closest('.student-daily-tag-list');
        tagList.scrollTop = 48;
        const card = savedInput.closest('details');
        card.open = true;
        let fetchOptions;
        h.dom.window.fetch = async (url, options) => {
            fetchOptions = options;
            return response('新知识点');
        };
        h.refresh();
        await settle();
        assert.equal(fetchOptions.cache, 'no-store');
        assert.equal(h.tag('循环'), savedInput, 'selected labels keep the same nodes and focus');
        assert.equal(h.doc.activeElement, savedInput, 'updates in another classroom must not steal focus');
        assert.equal(tagList.scrollTop, 48);
        assert.equal(card.open, true);
        assert.equal(savedInput.checked, true);
        assert.equal(savedInput.parentElement.querySelector('small').textContent, '0');
        assert(h.tag('新知识点'));
        assert.equal(h.tag('变量'), null, 'unused removed tags disappear');
        assert.match(card.querySelector('summary').textContent, /1 道可用素材/);
        assert.match(h.$('[data-daily-pool="system"]').textContent, /0 道素材/);
        assert.equal(h.$('[data-daily-enabled]').checked, true);
        assert.equal(h.$('[data-daily-count="system"]').value, '4');
        assert.equal(h.$('[data-daily-cooldown]').value, '5');
        assert.deepEqual([0, 1, 2, 3].map((i) => h.$(`[data-daily-point="system:${i}"]`).value), ['7', '0', '7', '7']);
        let saved;
        h.dom.window.fetch = async (url, options) => {
            saved = JSON.parse(options.body.get('policy'));
            return { ok: true, json: async () => ({ saved: true }) };
        };
        h.$('[data-student-daily-form]').dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await settle();
        assert.equal(saved.enabled, true);
        assert.equal(saved.cooldownRounds, 5);
        assert.equal(saved.domains[0].count, 4);
        assert.deepEqual(saved.domains[0].points, [7, 0, 7, 7]);
        assert.deepEqual(saved.domains[0].tags, ['循环']);
    });

    it('loads a fresh catalog when opening settings and keeps catalog updates out of the dirty policy', async (t) => {
        const h = harness(t, 'uid=44&tab=daily');
        let request;
        h.dom.window.fetch = async (url, options) => {
            request = { url: new URL(url), options };
            return response('新建的选择题标签');
        };
        h.settings();
        await settle();
        assert.equal(request.url.searchParams.get('uid'), '44');
        assert.equal(request.options.headers.Accept, 'application/json');
        assert(h.tag('新建的选择题标签'));
        const event = new h.dom.window.Event('beforeunload', { cancelable: true });
        h.dom.window.dispatchEvent(event);
        assert.equal(event.defaultPrevented, false, 'refreshing a catalog must not mark settings as edited');
    });

    it('refreshes when the daily tab reopens the already selected settings pane', async (t) => {
        const h = harness(t, 'uid=44&tab=profile&quizView=settings');
        h.dom.window.fetch = async () => response('返回设置后的标签');
        h.$('[data-student-tab="daily"]').click();
        await settle();
        assert(h.tag('返回设置后的标签'));
    });

    it('automatically refreshes on return to the tab while avoiding duplicate focus requests', async (t) => {
        const h = harness(t);
        let visibility = 'hidden';
        Object.defineProperty(h.doc, 'visibilityState', { get: () => visibility, configurable: true });
        const requests = [];
        h.dom.window.fetch = (url, options) => new Promise((resolve) => requests.push({ url, options, resolve }));
        h.doc.dispatchEvent(new h.dom.window.Event('visibilitychange'));
        assert.equal(requests.length, 0);
        visibility = 'visible';
        h.doc.dispatchEvent(new h.dom.window.Event('visibilitychange'));
        h.dom.window.dispatchEvent(new h.dom.window.Event('focus'));
        assert.equal(requests.length, 1);
        requests[0].resolve(response('刚录入的标签'));
        await settle();
        assert(h.tag('刚录入的标签'));
    });

    it('keeps the latest catalog when requests finish out of order', async (t) => {
        const h = harness(t);
        const requests = [];
        h.dom.window.fetch = (url, options) => new Promise((resolve) => requests.push({ options, resolve }));
        h.settings();
        h.settings();
        assert.equal(requests.length, 2);
        assert.equal(requests[0].options.signal.aborted, true);
        requests[1].resolve(response('新的目录'));
        await settle();
        requests[0].resolve(response('过期目录'));
        await settle();
        assert(h.tag('新的目录'));
        assert.equal(h.tag('过期目录'), null);
        assert.equal(h.$('[data-daily-catalog-refresh]').disabled, false);
    });

    it('cancels a departed student request and never writes its response into the new student', async (t) => {
        const h = harness(t);
        let catalog;
        h.dom.window.fetch = (url, options) => options.headers.Accept === 'text/html'
            ? Promise.resolve({ ok: true, text: async () => render({ selectedStudent: students[1] }) })
            : new Promise((resolve) => { catalog = { options, resolve }; });
        h.refresh();
        h.$('[data-student-note][data-student-uid="45"]').click();
        await settle();
        assert.equal(h.$('[data-student-editor]').dataset.studentUid, '45');
        assert.equal(catalog.options.signal.aborted, true);
        catalog.resolve(response('上一位学员的目录'));
        await settle();
        assert.equal(h.tag('上一位学员的目录'), null);
        assert(h.tag('循环'));
    });

    it('preserves the last catalog and all edits on authentication failures and allows retry', async (t) => {
        const h = harness(t);
        h.change('[data-daily-enabled]', true, 'change');
        h.change('[data-daily-point="system:1"]', '9');
        h.tag('变量').click();
        h.dom.window.fetch = async () => ({ ok: true, json: async () => { throw new Error('html'); } });
        h.refresh();
        await settle();
        assert.match(h.$('[data-daily-catalog-status]').textContent, /身份验证.*保留/);
        assert.equal(h.$('[data-daily-catalog-refresh]').disabled, false);
        assert.equal(h.tag('变量').checked, true);
        assert.equal(h.$('[data-daily-point="system:1"]').value, '9');
        h.dom.window.fetch = async () => response('恢复后新标签');
        h.refresh();
        await settle();
        assert(h.tag('恢复后新标签'));
        assert.equal(h.tag('变量').checked, true);
        assert.equal(h.$('[data-daily-point="system:1"]').value, '9');
    });
});
