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
        dom.window.fetch = async () => {
            requests++;
            throw new Error('unexpected');
        };
        let confirms = 0;
        dom.window.confirm = () => {
            confirms++;
            return false;
        };
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

    it('keeps the roster stable throughout a slow student switch and repeated clicks', async (t) => {
        const { dom, $ } = harness(t);
        const roster = $('[data-student-notes]');
        const note = $('[data-student-note][data-student-uid="45"]');
        const avatar = note.querySelector('img');
        const identity = note.querySelector('[data-student-display-name]');
        roster.scrollTop = 160;
        let requests = 0;
        let finish;
        dom.window.fetch = () => {
            requests++;
            return new Promise((resolve) => { finish = resolve; });
        };
        note.click();
        assert.equal($('[data-student-detail-host]').getAttribute('aria-busy'), 'true');
        assert.equal($('[data-student-list-feedback]').hidden, true, 'loading must not insert a row above the roster');
        note.click();
        assert.equal(requests, 1);
        assert.equal($('[data-student-list-feedback]').hidden, true, 'repeated clicks must not move the roster either');
        roster.scrollTop = 240;
        finish({ ok: true, text: async () => render({ selectedStudent: students[1] }) });
        await settle();
        assert.equal($('[data-student-editor]').dataset.studentUid, '45');
        assert.equal(note.querySelector('img'), avatar, 'unchanged avatars are not reloaded');
        assert.equal(note.querySelector('[data-student-display-name]'), identity);
        assert.equal(roster.scrollTop, 240, 'scrolling while the request is pending is preserved');
        assert.equal(note.getAttribute('aria-expanded'), 'true');
        assert.equal($('[data-student-detail-host]').hasAttribute('aria-busy'), false);
    });

    for (const stacked of [false, true]) {
        it(`scrolls to the detail only when the layout is ${stacked ? 'stacked' : 'side by side'}`, async (t) => {
            const { dom, $ } = harness(t);
            dom.window.innerWidth = stacked ? 1200 : 700;
            $('.student-management__roster').getBoundingClientRect = () => ({ top: 200, bottom: 700, height: 500 });
            const host = $('[data-student-detail-host]');
            host.getBoundingClientRect = () => ({ top: stacked ? 720 : 200 });
            const scrolls = [];
            host.scrollIntoView = (options) => scrolls.push(options);
            dom.window.fetch = async () => ({ ok: true, text: async () => render({ selectedStudent: students[1] }) });
            $('[data-student-note][data-student-uid="45"]').click();
            await settle();
            assert.equal(scrolls.length, stacked ? 1 : 0, 'use the actual content layout rather than viewport width');
        });
    }

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
    it('applies the default reward immediately to every question and saves the displayed total without an extra button', async (t) => {
        const { dom, $, change, submit } = harness(t);
        assert.equal([...dom.window.document.querySelectorAll('button')].some((button) => /应用到本课堂所有题/.test(button.textContent)), false);
        change('[data-daily-enabled]', true, 'change');
        change('[aria-label="Python 训练默认积分"]', '4');
        assert.equal($('[data-daily-point="system:0"]').value, '4');
        assert.equal($('[data-daily-point="system:1"]').value, '4');
        assert.equal($('[data-daily-point="S0001:0"]').value, '2', 'other classrooms retain their own rewards');
        assert.match($('.student-daily-summary').textContent, /最多 10 积分/);
        let posted;
        dom.window.fetch = async (url, options) => {
            posted = JSON.parse(options.body.get('policy'));
            return { ok: true, json: async () => ({ saved: true }) };
        };
        submit('[data-student-daily-form]');
        await settle();
        assert.deepEqual(posted.domains.map((domain) => domain.points), [[4, 4], [2]]);
        assert.match($('[data-daily-feedback]').textContent, /已保存/);
    });

    it('uses the default reward for added questions while retaining deliberate per-question exceptions', async (t) => {
        const { dom, $, change, submit } = harness(t);
        change('[data-daily-enabled]', true, 'change');
        change('[aria-label="Python 训练默认积分"]', '2');
        change('[data-daily-point="system:1"]', '7');
        change('[data-daily-count="system"]', '4');
        assert.deepEqual([0, 1, 2, 3].map((index) => $(`[data-daily-point="system:${index}"]`).value), ['2', '7', '2', '2']);
        assert.match($('.student-daily-summary').textContent, /最多 15 积分/);
        let posted;
        dom.window.fetch = async (url, options) => {
            posted = JSON.parse(options.body.get('policy'));
            return { ok: true, json: async () => ({ saved: true }) };
        };
        submit('[data-student-daily-form]');
        await settle();
        assert.deepEqual(posted.domains[0].points, [2, 7, 2, 2]);
    });

    it('accepts zero as the default for existing and added questions', async (t) => {
        const { dom, $, change, submit } = harness(t);
        change('[data-daily-enabled]', true, 'change');
        change('[aria-label="Python 训练默认积分"]', '0');
        change('[data-daily-count="system"]', '3');
        assert.deepEqual([0, 1, 2].map((index) => $(`[data-daily-point="system:${index}"]`).value), ['0', '0', '0']);
        assert.match($('.student-daily-summary').textContent, /最多 2 积分/);
        let posted;
        dom.window.fetch = async (url, options) => {
            posted = JSON.parse(options.body.get('policy'));
            return { ok: true, json: async () => ({ saved: true }) };
        };
        submit('[data-student-daily-form]');
        await settle();
        assert.deepEqual(posted.domains[0].points, [0, 0, 0]);
    });

    it('does not turn an empty default reward into zero and blocks saving until it is completed', async (t) => {
        const { dom, $, change, submit } = harness(t);
        change('[data-daily-enabled]', true, 'change');
        change('[aria-label="Python 训练默认积分"]', '');
        assert.equal($('[data-daily-point="system:0"]').value, '');
        assert.equal($('[data-daily-point="system:1"]').value, '');
        let calls = 0;
        let posted;
        dom.window.fetch = async (url, options) => {
            calls++;
            posted = JSON.parse(options.body.get('policy'));
            return { ok: true, json: async () => ({ saved: true }) };
        };
        submit('[data-student-daily-form]');
        assert.equal(calls, 0);
        assert.match($('[data-daily-feedback]').textContent, /积分/);
        change('[aria-label="Python 训练默认积分"]', '1');
        submit('[data-student-daily-form]');
        await settle();
        assert.equal(calls, 1);
        assert.deepEqual(posted.domains[0].points, [1, 1]);
    });

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
        dom.window.fetch = async () => {
            calls++;
            return { ok: true, json: async () => ({ saved: true }) };
        };
        submit('[data-student-daily-form]');
        await settle();
        assert.equal(calls, 2);
        assert.equal($('[data-student-note][data-student-uid="44"]').dataset.studentQuizEnabled, 'true');
        assert.match($('[data-daily-feedback]').textContent, /已保存/);
    });

    it('shows assigned question mastery first and keeps settings drafts while reviewing wrong questions and rounds', async (t) => {
        const { dom, $, change, doc } = harness(t, {}, 'uid=44&tab=daily&quizDay=2026-10-08');
        assert.equal($('[data-student-daily-form]').hidden, true, 'mastery comes first');
        assert.equal($('[data-daily-history]').hidden, false);
        assert.equal($('[data-quiz-day]'), null, 'the teacher view is not a daily attendance report');
        assert.equal(new URL(dom.window.location.href).searchParams.has('quizDay'), false);
        assert.match($('.dql-overview').textContent, /2 \/ 3.*1.*1.*50%.*2 次/);
        assert.equal(doc.querySelectorAll('[data-learning-question]').length, 1, 'wrong questions are immediately visible');
        assert.equal($('[data-learning-question]').dataset.learningQuestion, 'q1');
        change('[data-daily-enabled]', true, 'change');
        change('[data-daily-point="system:1"]', '9');
        $('[data-learning-view="answered"]').click();
        assert.equal(doc.querySelectorAll('[data-learning-question]').length, 2, 'unseen questions are not treated as incorrect');
        $('[data-learning-view="tags"]').click();
        assert.match($('.dql-tag').textContent, /循环.*答对 1.*待复习 1.*50%.*未答 1/);
        let requested;
        dom.window.fetch = async (url) => {
            requested = new URL(url);
            return { ok: true, json: async () => ({ report: daily.report }) };
        };
        $('[data-learning-view="sessions"]').click();
        assert.match($('.dql-session').textContent, /第 2 次练习/);
        $('[data-learning-action="session"][data-learning-session="round-2"]').click();
        await settle();
        assert.equal(requested.pathname, '/manage/daily-quiz/student/44/session/round-2');
        assert.equal(doc.querySelectorAll('[data-learning-session-panel="round-2"] [data-learning-question]').length, 3);
        assert.match($('[data-learning-question="q2"]').textContent, /未作答/);
        assert.equal($('[data-daily-point="system:1"]').value, '9');
        assert.equal($('[data-daily-enabled]').checked, true);
    });

    it('shows judgment results as correct or incorrect statements instead of answer letters', (t) => {
        const learning = { ...daily.learning, questions: daily.learning.questions.map((item) => ({
            ...item, kind: 'judge', options: ['正确', '错误'],
        })) };
        const { $ } = harness(t, { selectedDailyQuiz: { ...daily, learning } }, 'uid=44&tab=daily');
        $('[data-learning-view="answered"]').click();
        assert.match($('[data-learning-question="q0"] .dql-answers').textContent, /学员答案：正确.*正确答案：正确/);
        assert.match($('[data-learning-question="q1"] .dql-answers').textContent, /学员答案：错误.*正确答案：正确/);
    });

    it('renders complete Markdown and attachment images while escaping injected HTML', (t) => {
        const { $, doc } = harness(t);
        assert.match($('[data-learning-question="q1"]').textContent, /学员选择/);
        assert.match($('[data-learning-question="q1"]').textContent, /正确选项/);
        assert.match($('[data-learning-question="q1"]').textContent, /使用循环完成/);
        assert.equal(doc.querySelectorAll('[onerror]').length, 0);
        assert.equal($('.dql-markdown strong').textContent, '题干');
        assert.match($('.dql-markdown img').getAttribute('src'), /manage\/quiz\/file/);
    });

    it('refreshes mastery on return and preserves the last good snapshot and settings draft after authentication fails', async (t) => {
        const { dom, $, change } = harness(t, {}, 'uid=44&tab=daily');
        const subtabs = [...$('.student-daily-subtabs').querySelectorAll('button')];
        subtabs[1].click();
        change('[data-daily-enabled]', true, 'change');
        change('[data-daily-point="system:1"]', '9');
        const requests = [];
        dom.window.fetch = (url, options) => new Promise((resolve) => requests.push({ url, options, resolve }));
        subtabs[0].click();
        assert.equal(requests.length, 1);
        assert.equal(new URL(requests[0].url).searchParams.has('quizDay'), false);
        assert.equal(requests[0].options.cache, 'no-store');
        assert.equal($('[data-quiz-refresh]').disabled, true);
        $('[data-quiz-refresh]').click();
        assert.equal(requests.length, 1, 'disabled refresh must not issue another request');
        const learning = { ...daily.learning, summary: { ...daily.learning.summary, answered: 3, correctCount: 2, unseenCount: 0, accuracy: 67 },
            questions: daily.report.items.map((item) => item.correct === null ? { ...item, selected: ['A'], correct: true, earnedPoints: 3 } : item) };
        requests[0].resolve({ ok: true, json: async () => ({ selectedDailyQuiz: { learning } }) });
        await settle();
        assert.match($('.dql-overview').textContent, /3 \/ 3.*67%/);
        assert.equal($('[data-quiz-refresh]').disabled, false);
        assert.equal($('[data-daily-point="system:1"]').value, '9');
        $('[data-quiz-refresh]').click();
        assert.equal(requests.length, 2);
        requests[1].resolve({ ok: true, json: async () => { throw new Error('Expired authentication'); } });
        await settle();
        assert.equal($('[data-quiz-refresh]').disabled, false, 'a failed refresh can be retried');
        assert.match($('.dql-overview').textContent, /3 \/ 3/, 'failure preserves the last successful snapshot');
        assert.match($('[data-daily-history] [role="status"]').textContent, /身份验证/);
        assert.equal($('[data-daily-learning]').hasAttribute('aria-busy'), false);
    });

    it('ignores older mastery refreshes and cancels both overview and round requests when changing students', async (t) => {
        const { dom, $ } = harness(t);
        const requests = [];
        dom.window.fetch = (url, options) => new Promise((resolve) => requests.push({ url, options, resolve }));
        const records = $('.student-daily-subtabs button');
        records.click();
        records.click();
        assert.equal(requests[0].options.signal.aborted, true);
        const latest = { ...daily.learning, summary: { ...daily.learning.summary, participationCount: 9 } };
        requests[1].resolve({ ok: true, json: async () => ({ selectedDailyQuiz: { learning: latest } }) });
        await settle();
        requests[0].resolve({ ok: true, json: async () => ({ selectedDailyQuiz: { learning: daily.learning } }) });
        await settle();
        assert.match($('.dql-overview').textContent, /9 次/);
        $('[data-learning-view="sessions"]').click();
        $('[data-learning-action="session"][data-learning-session="round-2"]').click();
        const round = requests[2];
        records.click();
        const refresh = requests[3];
        dom.window.fetch = async () => ({ ok: true, text: async () => render({ selectedStudent: students[1] }) });
        $('[data-student-note][data-student-uid="45"]').click();
        await settle();
        assert.equal($('[data-student-editor]').dataset.studentUid, '45');
        assert.equal(round.options.signal.aborted, true, 'departed student round fetch is disposed');
        assert.equal(refresh.options.signal.aborted, true, 'departed student mastery fetch is cancelled');
        refresh.resolve({ ok: true, json: async () => ({ selectedDailyQuiz: { learning: latest } }) });
        round.resolve({ ok: true, json: async () => ({ report: daily.report }) });
        await settle();
        assert.match($('.dql-overview').textContent, /2 次/);
        assert.equal($('[data-learning-session-panel]'), null, 'the new student never receives the old round');
    });

    it('validates integer rewards before sending and preserves independent panels with keyboard tabs', (t) => {
        const { dom, $, change, submit } = harness(t);
        let calls = 0;
        dom.window.fetch = async () => {
            calls++;
            throw new Error('unexpected');
        };
        change('[data-daily-enabled]', true, 'change');
        change('[data-daily-point="system:0"]', '-1');
        submit('[data-student-daily-form]');
        assert.equal(calls, 0);
        assert.match($('[data-daily-feedback]').textContent, /积分/);
        const tab = $('[data-student-tab="profile"]');
        tab.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
        assert.equal($('[data-student-tab="message"]').getAttribute('aria-selected'), 'true');
        assert.equal(dom.window.document.activeElement, $('[data-student-tab="message"]'));
        $('[data-student-tab="message"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
        assert.equal($('[data-student-tab="daily"]').getAttribute('aria-selected'), 'true');
        assert.equal($('[data-daily-point="system:0"]').value, '-1');
    });
});
