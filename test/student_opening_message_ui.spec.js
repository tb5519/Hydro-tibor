const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { page, render, students, settle } = require('./fixtures/student_management_ui');

const receipt = { title: '下次见面前', content: '请准备好你的作品。\n我们一起看看新的想法。',
    enabled: true, revision: '12345678901234567890123456789012', updatedAt: '2026-10-10T01:00:00.000Z' };
function harness(t, message = {}, query = 'uid=44&tab=message') {
    const dom = page(2, { selectedOpeningMessage: message }, query);
    t.after(() => dom.window.close());
    const doc = dom.window.document;
    const $ = (selector) => doc.querySelector(selector);
    const change = (selector, value) => {
        const node = $(selector);
        if (node.type === 'checkbox') node.checked = value; else node.value = value;
        node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const submit = () => $('[data-student-message-form]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    return { dom, doc, $, change, submit };
}

describe('student opening message editor', () => {
    it('restores the fourth tab, hides profile controls, and supports keyboard traversal', (t) => {
        const { dom, $ } = harness(t);
        assert.equal($('[data-student-panel="message"]').hidden, false);
        assert.equal($('[data-student-profile-form]').hidden, true);
        assert.equal($('[data-student-extra="profile"]').hidden, true);
        const message = $('[data-student-tab="message"]');
        message.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        assert.equal($('[data-student-tab="profile"]').getAttribute('aria-selected'), 'true');
        assert.equal($('[data-student-profile-form]').hidden, false);
        $('[data-student-tab="profile"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        assert.equal(message.getAttribute('aria-selected'), 'true');
        assert.equal(new URL(dom.window.location.href).searchParams.get('tab'), 'message');
    });

    it('starts without a preset headline and safely previews only teacher title, body, and acknowledgement', (t) => {
        const { doc, $, change } = harness(t);
        assert.equal($('[data-message-title]').value, '');
        assert.equal($('[data-message-content]').value, '');
        assert.equal($('[data-message-preview]').disabled, true);
        assert.equal($('[data-message-status]').textContent, '尚未设置');
        change('[data-message-title]', '<b>这周的作品</b>');
        change('[data-message-content]', '第一行\n<img src=x onerror=alert(1)>\n第三行');
        $('[data-message-preview]').click();
        const dialog = $('[data-message-dialog]');
        assert.equal(dialog.hasAttribute('open'), true);
        assert.equal($('[data-message-preview-title]').textContent, '<b>这周的作品</b>');
        assert.equal($('[data-message-preview-content]').textContent, '第一行\n<img src=x onerror=alert(1)>\n第三行');
        assert.equal(dialog.querySelector('img, b'), null, 'teacher text is not executed as HTML');
        assert.deepEqual([...dialog.querySelectorAll('button')].map((node) => node.textContent), ['知道了']);
        assert.equal(doc.activeElement, $('[data-message-preview-close]'));
        $('[data-message-preview-close]').click();
        assert.equal(dialog.hasAttribute('open'), false);
        assert.equal(doc.activeElement, $('[data-message-preview]'));
        assert.equal(doc.body.classList.contains('student-message-preview-open'), false);
    });

    it('requires title and content only for an enabled message, keeping disabled drafts editable', async (t) => {
        const { dom, $, change, submit } = harness(t);
        let calls = 0;
        dom.window.fetch = async (_, options) => {
            calls++;
            const body = JSON.parse(options.body);
            return { ok: true, json: async () => ({ saved: true, selectedOpeningMessage: { ...receipt,
                title: body.title, content: body.content, enabled: body.enabled === '1' } }) };
        };
        change('[data-message-enabled]', true);
        submit();
        await settle();
        assert.equal(calls, 0);
        assert.equal($('[data-message-title]').required, true);
        change('[data-message-enabled]', false);
        submit();
        await settle();
        assert.equal(calls, 1, 'blank disabled settings can be saved');
    });

    it('saves the selected student with its revision and retains edits made during the request', async (t) => {
        const { dom, $, change, submit } = harness(t, receipt);
        change('[data-message-title]', '保存的标题');
        let request;
        let finish;
        dom.window.fetch = (url, options) => {
            request = { url: new URL(url), body: JSON.parse(options.body) };
            return new Promise((resolve) => { finish = resolve; });
        };
        submit();
        assert.equal($('[data-message-save]').disabled, true);
        change('[data-message-title]', '正在编辑的新标题');
        finish({ ok: true, json: async () => ({ saved: true, selectedOpeningMessage: { ...receipt,
            title: '保存的标题', revision: 'abcdefabcdefabcdefabcdefabcdefab' } }) });
        await settle();
        assert.equal(request.url.searchParams.get('uid'), '44');
        assert.deepEqual(request.body, { operation: 'save_opening_message', uid: 44, title: '保存的标题', content: receipt.content,
            enabled: '1', revision: receipt.revision });
        assert.equal($('[data-message-title]').value, '正在编辑的新标题');
        assert.match($('[data-message-feedback]').textContent, /之后的修改还未保存/);
        const event = new dom.window.Event('beforeunload', { cancelable: true });
        dom.window.dispatchEvent(event);
        assert.equal(event.defaultPrevented, true);
    });

    it('protects unsaved message text and blocks student switches while saving', async (t) => {
        const { dom, $, change, submit } = harness(t, receipt);
        let calls = 0;
        let finish;
        dom.window.fetch = () => {
            calls++;
            return new Promise((resolve) => { finish = resolve; });
        };
        let confirms = 0;
        dom.window.confirm = () => { confirms++; return false; };
        change('[data-message-content]', '还未保存的内容');
        $('[data-student-note][data-student-uid="45"]').click();
        await settle();
        assert.equal(calls, 0);
        assert.equal(confirms, 1);
        submit();
        $('[data-student-note][data-student-uid="45"]').click();
        assert.equal(calls, 1);
        assert.equal(confirms, 1, 'saving cannot be discarded even with confirmation');
        assert.match($('[data-student-list-feedback]').textContent, /正在保存/);
        finish({ ok: true, json: async () => ({ saved: true, selectedOpeningMessage: { ...receipt,
            content: '还未保存的内容', acknowledgedAt: '2026-10-10T01:12:00Z' } }) });
        await settle();
        assert.equal($('[data-student-editor]').dataset.studentUid, '44');
        assert.match($('[data-message-status]').textContent, /学员已确认/);
    });

    for (const response of [
        { ok: true, json: async () => { throw new Error('HTML sudo page'); } },
        { ok: true, json: async () => ({ url: '/user/sudo' }) },
        { ok: false, status: 403, json: async () => ({ error: { name: 'ValidationError', params: ['revision', null, '消息已经被另一位老师修改，请刷新后重试。'] } }) },
    ]) {
        it('preserves the message draft when validation or identity verification fails', async (t) => {
            const { dom, $, change, submit } = harness(t, receipt);
            change('[data-message-content]', '需要保留的文字');
            dom.window.fetch = async () => response;
            submit();
            await settle();
            assert.equal($('[data-message-content]').value, '需要保留的文字');
            assert.equal($('[data-message-save]').disabled, false);
            assert.match($('[data-message-feedback]').textContent, /身份验证|消息已经被另一位老师修改/);
            assert.equal($('[data-message-feedback]').classList.contains('is-error'), true);
            const event = new dom.window.Event('beforeunload', { cancelable: true });
            dom.window.dispatchEvent(event);
            assert.equal(event.defaultPrevented, true);
        });
    }

    it('carries the message tab to another student and disposes the old editor and preview', async (t) => {
        const { dom, doc, $ } = harness(t, receipt);
        $('[data-message-preview]').click();
        const oldDialog = $('[data-message-dialog]');
        // The browser's native dialog makes the background inert; close it before changing students.
        $('[data-message-preview-close]').click();
        dom.window.fetch = async () => ({ ok: true, text: async () => render({ selectedStudent: students[1],
            selectedOpeningMessage: { ...receipt, title: '另一位孩子的消息', acknowledgedAt: '2026-10-10T01:12:00Z' } }) });
        $('[data-student-note][data-student-uid="45"]').click();
        await settle();
        assert.equal($('[data-message-title]').value, '另一位孩子的消息');
        assert.equal($('[data-student-panel="message"]').hidden, false);
        assert.equal($('[data-student-profile-form]').hidden, true);
        assert.equal(oldDialog.isConnected, false);
        assert.equal(doc.body.classList.contains('student-message-preview-open'), false);
        assert.match($('[data-message-status]').textContent, /学员已确认/);
        $('[data-message-preview]').click();
        assert.equal($('[data-message-preview-title]').textContent, '另一位孩子的消息');
    });
});
