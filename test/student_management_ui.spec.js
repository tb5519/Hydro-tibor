const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { page, render, students, daily, settle } = require('./fixtures/student_management_ui');

function harness(t, overrides, query) {
    const dom = page(2, overrides, query);
    t.after(() => dom.window.close());
    const doc = dom.window.document;
    const $ = (selector) => doc.querySelector(selector);
    const change = (selector, value, event = 'input') => {
        const input = $(selector);
        if (input.type === 'checkbox') input.checked = value; else input.value = value;
        input.dispatchEvent(new dom.window.Event(event, { bubbles: true }));
    };
    const submit = (selector) => $(selector).dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    return { dom, doc, $, change, submit };
}

describe('student management workspace', () => {
    it('restores combined roster filters and active tab from the URL', (t) => {
        const { dom, $, change } = harness(t, {}, 'uid=44&q=amy&domain=C0001&quiz=enabled&tab=daily');
        assert.equal($('[data-student-visible-count]').textContent, '1 位');
        assert.equal($('[data-student-note][data-student-uid="44"]').parentElement.hidden, true);
        assert.equal($('[data-student-note][data-student-uid="45"]').parentElement.hidden, false);
        assert.equal($('[data-student-panel="daily"]').hidden, false);
        change('[data-student-search]', 'nobody');
        assert.equal($('[data-student-empty]').hidden, false);
        assert.equal(new URL(dom.window.location.href).searchParams.get('q'), 'nobody');
        $('[data-student-clear-filters]').click();
        assert.equal($('[data-student-visible-count]').textContent, '2 位');
        assert.equal($('[data-student-editor]').dataset.studentUid, '44', 'filtering never destroys the selected draft');
    });

    it('protects unsaved profile changes on student switches and domain actions', async (t) => {
        const { dom, $, change } = harness(t);
        let requests = 0;
        dom.window.fetch = async () => { requests++; throw new Error('unexpected'); };
        let confirms = 0;
        dom.window.confirm = () => { confirms++; return false; };
        change('[name="displayName"]', '尚未保存');
        $('[data-student-note][data-student-uid="45"]').click();
        $('[data-student-domain-add-open]').click();
        await settle();
        assert.equal(confirms, 2);
        assert.equal(requests, 0);
        assert.equal($('[name="displayName"]').value, '尚未保存');
        assert.equal($('[data-student-domain-dialog]').hidden, true);
    });

    it('switches only the detail panel and carries query and tab state', async (t) => {
        const { dom, $, change } = harness(t);
        change('[data-student-search]', 'amy');
        $('[data-student-tab="learning"]').click();
        let requested;
        dom.window.fetch = async (url) => {
            requested = new URL(url);
            return { ok: true, text: async () => render({ selectedStudent: students[1] }) };
        };
        const roster = $('[data-student-notes]');
        $('[data-student-note][data-student-uid="45"]').click();
        await settle();
        assert.equal(requested.searchParams.get('uid'), '45');
        assert.equal(requested.searchParams.get('q'), 'amy');
        assert.equal(requested.searchParams.get('tab'), 'learning');
        assert.equal($('[data-student-notes]'), roster);
        assert.equal($('[data-student-editor]').dataset.studentUid, '45');
        assert.equal($('[data-student-panel="learning"]').hidden, false);
    });

    it('preserves the current profile when switching receives a sudo page', async (t) => {
        const { dom, $ } = harness(t);
        dom.window.fetch = async () => ({ ok: true, text: async () => '<form>请验证身份</form>' });
        $('[data-student-note][data-student-uid="45"]').click();
        await settle();
        assert.equal($('[data-student-editor]').dataset.studentUid, '44');
        assert.match($('[data-student-list-feedback]').textContent, /身份验证/);
    });

    it('saves profile independently from a dirty daily policy and keeps a later in-flight edit dirty', async (t) => {
        const { dom, $, change, submit } = harness(t);
        change('[data-daily-enabled]', true, 'change');
        change('[name="displayName"]', '保存的名字');
        let finish;
        dom.window.fetch = () => new Promise((resolve) => { finish = resolve; });
        submit('[data-student-profile-form]');
        change('[name="displayName"]', '正在编辑的新名字');
        finish({ ok: true, json: async () => ({ saved: true, uid: 44 }) });
        await settle();
        assert.equal($('[name="displayName"]').value, '正在编辑的新名字');
        assert.equal($('[data-daily-enabled]').checked, true);
        const event = new dom.window.Event('beforeunload', { cancelable: true });
        dom.window.dispatchEvent(event);
        assert.equal(event.defaultPrevented, true);
    });

    it('skips exactly one unload prompt after confirmed sorting and restores cancelled sort choices', (t) => {
        const { dom, $, change } = harness(t);
        const navigationErrors = [];
        dom.virtualConsole.removeAllListeners('jsdomError');
        dom.virtualConsole.on('jsdomError', (error) => navigationErrors.push(error.message));
        change('[name="displayName"]', '未保存');
        dom.window.confirm = () => false;
        change('[data-student-sort-select]', 'login', 'change');
        assert.equal($('[data-student-sort-select]').value, 'submit');
        assert.equal(navigationErrors.length, 0);
        dom.window.confirm = () => true;
        change('[data-student-sort-select]', 'login', 'change');
        assert.equal(navigationErrors.length, 1, 'jsdom observes the confirmed navigation attempt');
        assert.match(navigationErrors[0], /navigation/);
        const accepted = new dom.window.Event('beforeunload', { cancelable: true });
        dom.window.dispatchEvent(accepted);
        assert.equal(accepted.defaultPrevented, false, 'do not ask a second time');
        const subsequent = new dom.window.Event('beforeunload', { cancelable: true });
        dom.window.dispatchEvent(subsequent);
        assert.equal(subsequent.defaultPrevented, true, 'the bypass is consumed once');
        assert.equal($('[name="displayName"]').value, '未保存');
    });

    it('refreshes domain filters from the server after changing student membership', async (t) => {
        const { dom, $, change, submit } = harness(t);
        const changed = { ...students[0], domainIds: ['system', 'S0001', 'C0001'], domainNames: ['Python 训练', 'Scratch 创作', 'C++ 训练'] };
        let requests = 0;
        dom.window.fetch = async (url, options) => {
            requests++;
            return options.method === 'POST'
                ? { ok: true, json: async () => ({ saved: true, uid: 44 }) }
                : { ok: true, text: async () => render({ students: [changed, students[1]], selectedStudent: changed }) };
        };
        $('[data-student-domain-add-open]').click();
        change('[data-student-domain-select]', 'C0001', 'change');
        submit('[data-student-domain-form]');
        await settle();
        assert.equal(requests, 2);
        change('[data-student-domain-filter]', 'C0001', 'change');
        assert.equal($('[data-student-visible-count]').textContent, '2 位');
    });
});

describe('daily quiz teacher configuration and reports', () => {
    it('starts disabled, totals enabled domains, preserves zero-point rewards and exact OR tag counts', (t) => {
        const { $, change } = harness(t);
        assert.equal($('[data-daily-enabled]').checked, false);
        assert.equal($('[data-daily-count="system"]').disabled, false, 'disabled fieldset governs the control');
        assert.equal($('[data-daily-count="system"]').closest('fieldset').disabled, true);
        assert.match($('.student-daily-summary').textContent, /3 道 \/ 天.*2 个课堂.*5 积分/);
        assert.equal($('[data-daily-point="system:0"]').value, '0');
        change('[data-daily-enabled]', true, 'change');
        const tags = [...$('[data-daily-domain="system"]').parentElement.parentElement.querySelectorAll('.student-daily-tag-list input')];
        tags[0].click();
        assert.match($('[data-daily-pool="system"]').textContent, /2 道素材/);
        tags[1].click();
        assert.match($('[data-daily-pool="system"]').textContent, /3 道素材/, 'overlapping tags count each source once');
    });

    it('posts one merged policy, prevents doubles and retries non-JSON failures without discarding edits', async (t) => {
        const { dom, $, change, submit } = harness(t);
        change('[data-daily-enabled]', true, 'change');
        change('[data-daily-point="system:1"]', '7');
        let calls = 0;
        let posted;
        let finish;
        dom.window.fetch = (url, options) => {
            calls++; posted = options.body;
            return new Promise((resolve) => { finish = resolve; });
        };
        submit('[data-student-daily-form]');
        submit('[data-student-daily-form]');
        assert.equal(calls, 1);
        const policy = JSON.parse(posted.get('policy'));
        assert.deepEqual(policy.domains.map((domain) => domain.points), [[0, 7], [2]]);
        assert.equal(posted.get('operation'), 'save_daily_quiz');
        finish({ ok: true, json: async () => { throw new Error('html sudo'); } });
        await settle();
        assert.match($('[data-daily-feedback]').textContent, /验证.*保留/);
        assert.equal($('[data-daily-point="system:1"]').value, '7');
        assert.equal($('[data-daily-save]').disabled, false);
        dom.window.fetch = async () => { calls++; return { ok: true, json: async () => ({ saved: true }) }; };
        submit('[data-student-daily-form]');
        await settle();
        assert.equal(calls, 2);
        assert.equal($('[data-student-note][data-student-uid="44"]').dataset.studentQuizEnabled, 'true');
        assert.match($('[data-daily-feedback]').textContent, /已保存/);
    });

    it('keeps a settings draft while browsing dates and distinguishes unanswered from wrong', async (t) => {
        const { dom, $, change } = harness(t, {}, 'uid=44&tab=daily');
        assert.equal($('[data-student-daily-form]').hidden, true, 'records come first');
        assert.equal($('[data-daily-history]').hidden, false);
        change('[data-daily-enabled]', true, 'change');
        change('[data-daily-point="system:1"]', '9');
        $('[data-quiz-result-filter="wrong"]').click();
        assert.equal(dom.window.document.querySelectorAll('[data-quiz-question]').length, 1);
        assert.equal($('[data-quiz-question]').dataset.quizQuestion, 'q1');
        $('[data-quiz-result-filter="unanswered"]').click();
        assert.equal($('[data-quiz-question]').dataset.quizQuestion, 'q2');
        let requested;
        dom.window.fetch = async (url) => {
            requested = new URL(url);
            return { ok: true, json: async () => ({ selectedDailyQuiz: { report: { ...daily.report, day: '2026-10-07' } } }) };
        };
        change('[data-quiz-day]', '2026-10-07', 'change');
        await settle();
        assert.equal(requested.searchParams.get('quizDay'), '2026-10-07');
        assert.equal($('[data-daily-point="system:1"]').value, '9');
        assert.equal($('[data-daily-enabled]').checked, true);
    });

    it('renders complete Markdown and attachment images while escaping injected HTML', (t) => {
        const { $, doc } = harness(t);
        assert.match($('[data-quiz-question="q1"]').textContent, /学员选择/);
        assert.match($('[data-quiz-question="q1"]').textContent, /正确选项/);
        assert.match($('[data-quiz-question="q1"]').textContent, /使用循环完成/);
        assert.equal(doc.querySelectorAll('[onerror]').length, 0);
        assert.equal($('.student-quiz-content strong').textContent, '题干');
        assert.match($('.student-quiz-content img').getAttribute('src'), /manage\/quiz\/file/);
    });

    it('refreshes completed answers when returning to records and supports manual refresh without losing the settings draft', async (t) => {
        const { dom, $, change } = harness(t, {}, 'uid=44&tab=daily');
        const subtabs = [...$('.student-daily-subtabs').querySelectorAll('button')];
        subtabs[1].click();
        change('[data-daily-enabled]', true, 'change');
        change('[data-daily-point="system:1"]', '9');
        const requests = [];
        dom.window.fetch = (url) => new Promise((resolve) => requests.push({ url, resolve }));
        subtabs[0].click();
        assert.equal(requests.length, 1);
        assert.equal(new URL(requests[0].url).searchParams.get('quizDay'), '2026-10-08');
        assert.equal($('[data-quiz-refresh]').disabled, true);
        $('[data-quiz-refresh]').click();
        assert.equal(requests.length, 1, 'disabled refresh must not issue another request');
        const completed = {
            ...daily.report, answered: 3, correctCount: 2, earnedPoints: 6, completed: true,
            items: daily.report.items.map((item) => item.correct === null ? { ...item, selected: ['A'], correct: true, earnedPoints: 3 } : item),
        };
        requests[0].resolve({ ok: true, json: async () => ({ selectedDailyQuiz: { report: completed } }) });
        await settle();
        assert.match($('.student-daily-history-stats').textContent, /3 \/ 3/);
        assert.match($('[data-quiz-question="q2"]').textContent, /答对/);
        assert.equal($('[data-quiz-refresh]').disabled, false);
        assert.equal($('[data-daily-point="system:1"]').value, '9');
        $('[data-quiz-refresh]').click();
        assert.equal(requests.length, 2);
        requests[1].resolve({ ok: true, json: async () => { throw new Error('Expired authentication'); } });
        await settle();
        assert.equal($('[data-quiz-refresh]').disabled, false, 'a failed refresh can be retried');
        assert.match($('.student-daily-history-stats').textContent, /3 \/ 3/, 'failure preserves the last successful report');
    });

    it('keeps the latest date report when requests arrive out of order and restores the date on failed authentication', async (t) => {
        const { dom, $, change } = harness(t);
        const requests = [];
        dom.window.fetch = () => new Promise((resolve) => requests.push(resolve));
        change('[data-quiz-day]', '2026-10-06', 'change');
        change('[data-quiz-day]', '2026-10-07', 'change');
        requests[1]({ ok: true, json: async () => ({ selectedDailyQuiz: { report: { ...daily.report, day: '2026-10-07' } } }) });
        await settle();
        requests[0]({ ok: true, json: async () => ({ selectedDailyQuiz: { report: { ...daily.report, day: '2026-10-06' } } }) });
        await settle();
        assert.equal($('[data-quiz-day]').value, '2026-10-07');
        assert.equal(new URL(dom.window.location.href).searchParams.get('quizDay'), '2026-10-07');
        change('[data-quiz-day]', '2026-10-05', 'change');
        requests[2]({ ok: true, json: async () => { throw new Error('Unexpected HTML'); } });
        await settle();
        assert.equal($('[data-quiz-day]').value, '2026-10-07');
        assert.match($('[data-daily-history] [role="status"]').textContent, /身份验证/);
        assert.equal($('[data-daily-report]').hasAttribute('aria-busy'), false);
    });

    it('validates integer rewards before sending and preserves independent panels with keyboard tabs', (t) => {
        const { dom, $, change, submit } = harness(t);
        let calls = 0;
        dom.window.fetch = async () => { calls++; throw new Error('unexpected'); };
        change('[data-daily-enabled]', true, 'change');
        change('[data-daily-point="system:0"]', '-1');
        submit('[data-student-daily-form]');
        assert.equal(calls, 0);
        assert.match($('[data-daily-feedback]').textContent, /积分/);
        const tab = $('[data-student-tab="profile"]');
        tab.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
        assert.equal($('[data-student-tab="daily"]').getAttribute('aria-selected'), 'true');
        assert.equal(dom.window.document.activeElement, $('[data-student-tab="daily"]'));
        assert.equal($('[data-daily-point="system:0"]').value, '-1');
    });
});
