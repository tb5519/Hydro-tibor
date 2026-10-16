const assert = require('node:assert/strict');
const { test } = require('node:test');
const { page, render, students, settle } = require('./fixtures/student_management_ui');
const options = [
    { id: 'py.py3', name: 'Python 3' }, { id: 'cc.cc14', name: 'C++14' },
    { id: 'cc.cc17', name: 'C++17' }, { id: 'java', name: 'Java' },
];
const policy = (mode = 'unrestricted', languages = [], domains = []) => ({ version: 1, mode, languages, domains });
function harness(t, saved = policy()) {
    const dom = page(2, { selectedSubmissionLanguagePolicy: saved, submissionLanguageOptions: options }, 'uid=44&tab=learning');
    t.after(() => dom.window.close());
    const doc = dom.window.document;
    const $ = (s) => doc.querySelector(s);
    const change = (s, value) => {
        const input = $(s);
        if (input.type === 'radio' || input.type === 'checkbox') input.checked = value;
        else input.value = value;
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    };
    const submit = () => $('[data-student-profile-form]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    return { dom, $, change, submit, read: () => JSON.parse($('[name="submissionLanguagePolicy"]').value) };
}

test('default unrestricted policy is clean and every mode exposes its own controls', (t) => {
    const { dom, $, change, read } = harness(t);
    assert.deepEqual(read(), policy());
    assert.equal($('[data-language-global]').hidden, true);
    assert.equal($('[data-language-domains]').hidden, true);
    const clean = new dom.window.Event('beforeunload', { cancelable: true });
    dom.window.dispatchEvent(clean);
    assert.equal(clean.defaultPrevented, false);
    change('[name="studentSubmissionLanguageMode"][value="global"]', true);
    assert.equal($('[data-language-global]').hidden, false);
    assert.match($('[data-language-summary]').textContent, /以后加入的域/);
    change('[name="studentSubmissionLanguageMode"][value="per-domain"]', true);
    assert.equal($('[data-language-global]').hidden, true);
    assert.equal($('[data-language-domains]').hidden, false);
});

test('global language selection is submitted with the existing profile without losing other settings', async (t) => {
    const { dom, $, change, submit, read } = harness(t);
    change('[name="studentSubmissionLanguageMode"][value="global"]', true);
    change('[data-language-picker="global"] input[value="py.py3"]', true);
    change('[data-language-picker="global"] input[value="cc.cc14"]', true);
    let body;
    dom.window.fetch = async (_, request) => { body = request.body; return { ok: true, json: async () => ({ saved: true }) }; };
    submit();
    await settle();
    assert.deepEqual(JSON.parse(body.get('submissionLanguagePolicy')), policy('global', ['py.py3', 'cc.cc14']));
    assert.equal(body.get('cppEditorMode'), 'proficient');
    assert.equal(body.get('studentLevel'), '1');
    assert.equal(body.get('uid'), '44');
    assert.deepEqual(read().domains, []);
    assert.match($('[data-student-feedback]').textContent, /已保存/);
});

test('domain rules restore and serialize independently, with unrestricted domains omitted', (t) => {
    const saved = policy('per-domain', [], [{ domainId: 'system', languages: ['py.py3'] }]);
    const { $, change, read } = harness(t, saved);
    assert.deepEqual(read(), saved);
    assert.equal($('[data-language-domain="system"] [data-language-picker]').hidden, false);
    assert.equal($('[data-language-domain="S0001"] [data-language-picker]').hidden, true);
    change('[data-language-domain="S0001"] [data-language-domain-mode]', 'restricted');
    change('[data-language-domain="S0001"] input[value="cc.cc14"]', true);
    assert.deepEqual(read().domains, [{ domainId: 'system', languages: ['py.py3'] }, { domainId: 'S0001', languages: ['cc.cc14'] }]);
    change('[data-language-domain="system"] [data-language-domain-mode]', 'unrestricted');
    assert.deepEqual(read().domains, [{ domainId: 'S0001', languages: ['cc.cc14'] }]);
    change('[name="studentSubmissionLanguageMode"][value="unrestricted"]', true);
    assert.deepEqual(read(), policy());
});

test('empty restricted selections are blocked with an actionable message and no request', async (t) => {
    const { dom, $, change, submit } = harness(t);
    let requests = 0;
    dom.window.fetch = async () => { requests++; throw new Error('unexpected'); };
    change('[name="studentSubmissionLanguageMode"][value="global"]', true);
    submit();
    await settle();
    assert.equal(requests, 0);
    assert.match($('[data-student-feedback]').textContent, /至少选择一种/);
    change('[name="studentSubmissionLanguageMode"][value="per-domain"]', true);
    change('[data-language-domain="system"] [data-language-domain-mode]', 'restricted');
    submit();
    assert.equal(requests, 0);
    assert.match($('[data-student-feedback]').textContent, /Python 训练/);
});

test('filtering languages keeps selected values and does not mark a saved policy dirty', (t) => {
    const { dom, $, read } = harness(t, policy('global', ['py.py3']));
    const search = $('[data-language-picker="global"] input[type="search"]');
    search.value = 'C++';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.equal($('[data-language-picker="global"] input[value="py.py3"]').closest('label').hidden, true);
    assert.equal($('[data-language-picker="global"] input[value="cc.cc14"]').closest('label').hidden, false);
    assert.deepEqual(read().languages, ['py.py3']);
    const event = new dom.window.Event('beforeunload', { cancelable: true });
    dom.window.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
});

test('an unsaved language rule prevents accidental student switches and new student has independent policy', async (t) => {
    const { dom, $, change, read } = harness(t);
    change('[name="studentSubmissionLanguageMode"][value="global"]', true);
    change('[data-language-picker="global"] input[value="py.py3"]', true);
    let requests = 0;
    dom.window.confirm = () => false;
    dom.window.fetch = async () => { requests++; return { ok: true, text: async () => render({
        selectedStudent: students[1], selectedSubmissionLanguagePolicy: policy('global', ['cc.cc17']), submissionLanguageOptions: options,
    }) }; };
    $('[data-student-note][data-student-uid="45"]').click();
    await settle();
    assert.equal(requests, 0);
    dom.window.confirm = () => true;
    $('[data-student-note][data-student-uid="45"]').click();
    await settle();
    assert.equal(requests, 1);
    assert.deepEqual(read(), policy('global', ['cc.cc17']));
});

test('unavailable saved languages are shown safely and require correction when changing the language rule', (t) => {
    const { $, change, submit } = harness(t, policy('global', ['<bad>']));
    assert.match($('[data-language-picker="global"]').textContent, /暂不可用/);
    assert.equal($('[data-language-picker="global"] bad'), null);
    change('[data-language-picker="global"] input[value="py.py3"]', true);
    submit();
    assert.match($('[data-student-feedback]').textContent, /已不可用/);
});

test('editing a profile preserves unseen domain rules and obsolete saved languages by omitting an unchanged policy', async (t) => {
    for (const saved of [policy('per-domain', [], [
        { domainId: 'system', languages: ['py.py3'] }, { domainId: 'previous-domain', languages: ['cc.cc14'] },
    ]), policy('global', ['removed-compiler'])]) {
        const { dom, change, submit } = harness(t, saved);
        let body;
        dom.window.fetch = async (_, request) => { body = request.body; return { ok: true, json: async () => ({ saved: true }) }; };
        change('[name="displayName"]', '新显示姓名');
        submit();
        await settle();
        assert.equal(body.has('submissionLanguagePolicy'), false);
        assert.equal(body.get('displayName'), '新显示姓名');
    }
});

test('successful saves establish the submitted policy baseline while retaining changes made during the request', async (t) => {
    const { dom, change, submit } = harness(t);
    change('[name="studentSubmissionLanguageMode"][value="global"]', true);
    change('[data-language-picker="global"] input[value="py.py3"]', true);
    const bodies = [];
    let finish;
    dom.window.fetch = async (_, request) => {
        bodies.push(request.body);
        if (bodies.length === 1) await new Promise((resolve) => { finish = resolve; });
        return { ok: true, json: async () => ({ saved: true }) };
    };
    submit();
    change('[data-language-picker="global"] input[value="cc.cc17"]', true);
    finish();
    await settle();
    submit();
    await settle();
    assert.deepEqual(JSON.parse(bodies[1].get('submissionLanguagePolicy')).languages, ['py.py3', 'cc.cc17']);
    change('[name="displayName"]', '再次保存');
    submit();
    await settle();
    assert.equal(bodies[2].has('submissionLanguagePolicy'), false);
});
