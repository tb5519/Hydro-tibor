const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const jsesc = require('jsesc');

const template = fs.readFileSync(path.join(__dirname, '../packages/ui-default/templates/partials/broadcast_dialog.html'), 'utf8');
const env = new nunjucks.Environment(null, { autoescape: true });
env.addFilter('json', JSON.stringify);
env.addFilter('jsesc', (value) => jsesc(value, { isScriptContext: true }));
const broadcast = (overrides = {}) => ({
    scope: 'global', revision: 'a'.repeat(32), title: '新的一周，一起进步',
    content: '<p>同学们好！请在周五前完成本周练习。</p><blockquote>保持好奇，认真思考，每一步都算数。</blockquote>',
    scopeLabel: '全域广播', updatedAt: '2026-09-13T09:00:00.000Z', ...overrides,
});
const studentMessage = (overrides = {}) => broadcast({
    scope: 'student', revision: 'c'.repeat(32), title: '这周的练习安排',
    content: '<p>秦济舟，这周先完成数组练习。<br>遇到问题时记下你的思路，我们一起看。</p>',
    ackUrl: '/d/class-a/student-message/ack', scopeLabel: undefined, ...overrides,
});

function render(items) {
    return env.renderString(template, { UiContext: { broadcasts: items, broadcastAckUrl: '/d/class-a/broadcast/ack' }, handler: { user: { _id: 12 } } });
}

function fixture(items = [broadcast()], native = true) {
    const dom = new JSDOM(`<!doctype html><html><body><button id="before">继续学习</button>${render(items)}</body></html>`, {
        runScripts: 'outside-only', url: 'http://localhost/d/class-a/',
    });
    const { window } = dom;
    const requests = [];
    const messages = [];
    const channels = [];
    window.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    window.BroadcastChannel = class {
        constructor() { channels.push(this); }
        postMessage(data) { messages.push(data); }
        close() { this.closed = true; }
    };
    const get = (selector) => window.document.querySelector(selector);
    const dialog = get('dialog');
    if (native && dialog) {
        dialog.showModal = () => dialog.setAttribute('open', '');
        dialog.close = () => dialog.removeAttribute('open');
    }
    get('#before').focus();
    for (const script of window.document.querySelectorAll('script')) window.eval(script.textContent);
    return {
        window, get, dialog, requests, messages, channels,
        ack: () => get('[data-broadcast-ack]').click(),
        resolve: (body = { acknowledged: true }, overrides = {}) => requests.at(-1).resolve({ ok: true, status: 200, json: async () => body, ...overrides }),
        settle: () => new Promise((resolve) => setImmediate(resolve)),
        dispose: () => window.close(),
    };
}

describe('student broadcast acknowledgement dialog', () => {
    it('renders nothing without unread broadcasts', () => {
        assert.equal(render([]).trim(), '');
    });

    it('opens immediately, shows sanitized rich content, and waits for explicit acknowledgement', () => {
        const ui = fixture();
        try {
            assert.ok(ui.dialog.hasAttribute('open'));
            assert.equal(ui.window.document.activeElement, ui.get('[data-broadcast-title]'));
            assert.equal(ui.get('[data-broadcast-title]').textContent, '新的一周，一起进步');
            assert.equal(ui.get('[data-broadcast-content]').hidden, false);
            assert.ok(ui.get('[data-broadcast-content] blockquote'));
            assert.equal(ui.requests.length, 0);
            const cancel = new ui.window.Event('cancel', { cancelable: true });
            ui.dialog.dispatchEvent(cancel);
            assert.equal(cancel.defaultPrevented, true);
            ui.dialog.click();
            assert.ok(ui.dialog.hasAttribute('open'));
            assert.equal(ui.requests.length, 0);
        } finally { ui.dispose(); }
    });

    it('acknowledges the exact version, guards double clicks, and advances global then domain', async () => {
        const ui = fixture([broadcast(), broadcast({ scope: 'domain', scopeLabel: '提高班 · 域广播', revision: 'b'.repeat(32), title: '本周班级安排' })]);
        try {
            ui.ack();
            ui.ack();
            assert.equal(ui.requests.length, 1);
            assert.equal(ui.requests[0].url, '/d/class-a/broadcast/ack');
            assert.deepEqual(JSON.parse(ui.requests[0].options.body), { scope: 'global', revision: 'a'.repeat(32) });
            assert.equal(ui.get('[data-broadcast-ack]').disabled, true);
            assert.match(ui.get('[data-broadcast-progress]').textContent, /1 \/ 2/);
            ui.resolve();
            await ui.settle();
            assert.equal(ui.get('[data-broadcast-title]').textContent, '本周班级安排');
            assert.equal(ui.get('[data-broadcast-content="0"]').hidden, true);
            assert.equal(ui.get('[data-broadcast-content="1"]').hidden, false);
            assert.match(ui.get('[data-broadcast-progress]').textContent, /2 \/ 2/);
            ui.ack();
            assert.deepEqual(JSON.parse(ui.requests[1].options.body), { scope: 'domain', revision: 'b'.repeat(32) });
            ui.resolve();
            await ui.settle();
            assert.equal(ui.dialog.hasAttribute('open'), false);
            assert.equal(ui.window.document.documentElement.style.overflow, '');
            assert.equal(ui.window.document.activeElement, ui.get('#before'));
            assert.equal(ui.channels[0].closed, true);
        } finally { ui.dispose(); }
    });

    it('keeps failed acknowledgements unread and allows retry', async () => {
        const ui = fixture();
        try {
            ui.ack();
            ui.requests[0].reject(new Error('offline'));
            await ui.settle();
            assert.ok(ui.dialog.hasAttribute('open'));
            assert.equal(ui.get('[data-broadcast-error]').hidden, false);
            assert.match(ui.get('[data-broadcast-error]').textContent, /请重试/);
            assert.equal(ui.get('[data-broadcast-ack]').disabled, false);
            assert.equal(ui.messages.length, 0);
            ui.ack();
            assert.equal(ui.requests.length, 2);
            ui.resolve();
            await ui.settle();
            assert.equal(ui.dialog.hasAttribute('open'), false);
        } finally { ui.dispose(); }
    });

    it('does not treat successful HTTP without acknowledgement or expired sessions as read', async () => {
        for (const response of [{ body: {} }, { body: { acknowledged: true }, status: 403, ok: false }, { body: { acknowledged: true }, redirected: true }]) {
            const ui = fixture();
            try {
                ui.ack();
                const { body, ...options } = response;
                ui.resolve(body, options);
                await ui.settle();
                assert.ok(ui.dialog.hasAttribute('open'));
                assert.equal(ui.get('[data-broadcast-error]').hidden, false);
                assert.equal(ui.messages.length, 0);
            } finally { ui.dispose(); }
        }
    });

    it('traps keyboard focus and restores the previous focus when finished', () => {
        const ui = fixture();
        try {
            ui.get('[data-broadcast-ack]').focus();
            const tab = new ui.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
            ui.get('[data-broadcast-ack]').dispatchEvent(tab);
            assert.ok(tab.defaultPrevented);
            assert.equal(ui.window.document.activeElement, ui.get('[data-broadcast-scroll]'));
            ui.get('#before').focus();
            assert.equal(ui.window.document.activeElement, ui.get('[data-broadcast-title]'));
        } finally { ui.dispose(); }
    });

    it('synchronizes only matching account and revision acknowledgements from other tabs', () => {
        const ui = fixture();
        try {
            const key = `global:${'a'.repeat(32)}`;
            ui.channels[0].onmessage({ data: { uid: 99, key } });
            assert.ok(ui.dialog.hasAttribute('open'));
            ui.channels[0].onmessage({ data: { uid: 12, key: `global:${'b'.repeat(32)}` } });
            assert.ok(ui.dialog.hasAttribute('open'));
            ui.channels[0].onmessage({ data: { uid: 12, key } });
            assert.equal(ui.dialog.hasAttribute('open'), false);
            assert.equal(ui.requests.length, 0);
        } finally { ui.dispose(); }
    });

    it('supports a dialog fallback and removes its backdrop after success', async () => {
        const ui = fixture(undefined, false);
        try {
            assert.ok(ui.dialog.classList.contains('student-broadcast--fallback'));
            assert.ok(ui.get('.student-broadcast-backdrop'));
            ui.ack();
            ui.resolve();
            await ui.settle();
            assert.equal(ui.get('.student-broadcast-backdrop'), null);
            assert.equal(ui.dialog.hasAttribute('open'), false);
        } finally { ui.dispose(); }
    });

    it('escapes hostile titles and script boundaries in serialized payloads', () => {
        const title = '</script><script>window.broadcastPwned = true</script>';
        const ui = fixture([broadcast({ title })]);
        try {
            assert.equal(ui.window.broadcastPwned, undefined);
            assert.equal(ui.window.document.querySelectorAll('script').length, 1);
            assert.equal(ui.get('[data-broadcast-title]').textContent, title);
        } finally { ui.dispose(); }
    });

    it('shows only the teacher title, body, and acknowledgement for a personal message', () => {
        const title = '你已经进步很多了';
        const ui = fixture([studentMessage({ title })]);
        try {
            assert.ok(ui.dialog.classList.contains('student-broadcast--personal'));
            assert.equal(ui.get('[data-broadcast-title]').textContent, title);
            assert.equal(ui.get('[data-broadcast-header]').hidden, true);
            assert.equal(ui.get('[data-broadcast-meta]').hidden, true);
            assert.equal(ui.get('[data-broadcast-hint]').hidden, true);
            assert.equal(ui.get('[data-broadcast-footer-copy]').hidden, true);
            assert.equal(ui.get('[data-broadcast-scroll]').getAttribute('aria-label'), '正文');
            assert.equal(ui.get('[data-broadcast-ack]').textContent, '知道了');
            assert.equal(ui.get('[data-broadcast-ack] span'), null);
            assert.ok(ui.get('[data-broadcast-content] br'));
            assert.equal(ui.requests.length, 0);
            const escape = new ui.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
            ui.dialog.dispatchEvent(escape);
            assert.equal(escape.defaultPrevented, true);
            assert.ok(ui.dialog.hasAttribute('open'));
        } finally { ui.dispose(); }
    });

    it('acknowledges personal messages at their own endpoint then restores the broadcast presentation', async () => {
        const ui = fixture([studentMessage(), broadcast()]);
        try {
            ui.ack();
            ui.ack();
            assert.equal(ui.requests.length, 1);
            assert.equal(ui.requests[0].url, '/d/class-a/student-message/ack');
            assert.deepEqual(JSON.parse(ui.requests[0].options.body), { revision: 'c'.repeat(32) });
            assert.equal(ui.dialog.getAttribute('aria-busy'), 'true');
            assert.equal(ui.get('[data-broadcast-content="0"]').hidden, false);
            ui.resolve();
            await ui.settle();
            assert.equal(ui.dialog.classList.contains('student-broadcast--personal'), false);
            assert.equal(ui.dialog.hasAttribute('aria-busy'), false);
            assert.equal(ui.get('[data-broadcast-title]').textContent, broadcast().title);
            assert.equal(ui.get('[data-broadcast-header]').hidden, false);
            assert.equal(ui.get('[data-broadcast-meta]').hidden, false);
            assert.equal(ui.get('[data-broadcast-hint]').hidden, false);
            assert.equal(ui.get('[data-broadcast-footer-copy]').hidden, false);
            assert.equal(ui.get('[data-broadcast-content="0"]').hidden, true);
            assert.equal(ui.get('[data-broadcast-content="1"]').hidden, false);
            assert.deepEqual(JSON.parse(JSON.stringify(ui.messages[0])), { uid: 12, key: `student:${'c'.repeat(32)}` });
            ui.ack();
            assert.equal(ui.requests[1].url, '/d/class-a/broadcast/ack');
            assert.deepEqual(JSON.parse(ui.requests[1].options.body), { scope: 'global', revision: 'a'.repeat(32) });
            ui.resolve();
            await ui.settle();
            assert.equal(ui.dialog.hasAttribute('open'), false);
        } finally { ui.dispose(); }
    });

    it('keeps an unsuccessful personal receipt open and retries the same exact version', async () => {
        const ui = fixture([studentMessage()]);
        try {
            ui.ack();
            ui.resolve({ acknowledged: false });
            await ui.settle();
            assert.ok(ui.dialog.hasAttribute('open'));
            assert.equal(ui.get('[data-broadcast-error]').hidden, false);
            assert.equal(ui.get('[data-broadcast-footer-copy]').hidden, false);
            assert.equal(ui.get('[data-broadcast-hint]').hidden, true);
            assert.equal(ui.dialog.hasAttribute('aria-busy'), false);
            assert.equal(ui.messages.length, 0);
            ui.ack();
            assert.equal(ui.requests[1].url, ui.requests[0].url);
            assert.equal(ui.requests[1].options.body, ui.requests[0].options.body);
            ui.resolve();
            await ui.settle();
            assert.equal(ui.dialog.hasAttribute('open'), false);
        } finally { ui.dispose(); }
    });

    it('never sends a personal receipt to a broadcast endpoint when its endpoint is missing', async () => {
        const ui = fixture([studentMessage({ ackUrl: undefined })]);
        try {
            ui.ack();
            await ui.settle();
            assert.equal(ui.requests.length, 0);
            assert.ok(ui.dialog.hasAttribute('open'));
            assert.equal(ui.get('[data-broadcast-ack]').disabled, false);
            assert.equal(ui.get('[data-broadcast-error]').hidden, false);
        } finally { ui.dispose(); }
    });

    it('separates personal receipts from broadcast receipts and other students across tabs', () => {
        const revision = 'c'.repeat(32);
        const ui = fixture([studentMessage(), broadcast({ revision })]);
        try {
            ui.channels[0].onmessage({ data: { uid: 99, key: `student:${revision}` } });
            assert.equal(ui.get('[data-broadcast-title]').textContent, studentMessage().title);
            ui.channels[0].onmessage({ data: { uid: 12, key: `student:${'d'.repeat(32)}` } });
            assert.equal(ui.get('[data-broadcast-title]').textContent, studentMessage().title);
            ui.channels[0].onmessage({ data: { uid: 12, key: `student:${revision}` } });
            assert.equal(ui.get('[data-broadcast-title]').textContent, broadcast().title);
            assert.ok(ui.dialog.hasAttribute('open'));
            ui.channels[0].onmessage({ data: { uid: 12, key: `student:${revision}` } });
            assert.ok(ui.dialog.hasAttribute('open'));
            ui.channels[0].onmessage({ data: { uid: 12, key: `global:${revision}` } });
            assert.equal(ui.dialog.hasAttribute('open'), false);
            assert.equal(ui.requests.length, 0);
        } finally { ui.dispose(); }
    });

    it('advances after another tab confirms the message while this tab encounters a network failure', async () => {
        const ui = fixture([studentMessage(), broadcast()]);
        try {
            ui.ack();
            ui.channels[0].onmessage({ data: { uid: 12, key: `student:${'c'.repeat(32)}` } });
            assert.equal(ui.get('[data-broadcast-title]').textContent, studentMessage().title);
            ui.requests[0].reject(new Error('offline'));
            await ui.settle();
            assert.equal(ui.get('[data-broadcast-title]').textContent, broadcast().title);
            assert.equal(ui.get('[data-broadcast-error]').hidden, true);
            assert.equal(ui.get('[data-broadcast-ack]').disabled, false);
        } finally { ui.dispose(); }
    });

    it('preserves escaped teacher text and supports the personal dialog fallback', async () => {
        const title = '</script><script>window.studentMessagePwned=true</script>';
        const ui = fixture([studentMessage({ title, content: '<p>&lt;script&gt;alert(1)&lt;/script&gt;<br>&lt;b&gt;认真思考&lt;/b&gt;</p>' })], false);
        try {
            assert.equal(ui.window.studentMessagePwned, undefined);
            assert.equal(ui.window.document.querySelectorAll('script').length, 1);
            assert.equal(ui.get('[data-broadcast-title]').textContent, title);
            assert.equal(ui.get('[data-broadcast-content] b'), null);
            assert.match(ui.get('[data-broadcast-content]').textContent, /<b>认真思考<\/b>/);
            assert.ok(ui.dialog.classList.contains('student-broadcast--fallback'));
            assert.ok(ui.dialog.classList.contains('student-broadcast--personal'));
            ui.ack();
            ui.resolve();
            await ui.settle();
            assert.equal(ui.get('.student-broadcast-backdrop'), null);
            assert.equal(ui.window.document.activeElement, ui.get('#before'));
        } finally { ui.dispose(); }
    });
});

module.exports = { render, broadcast };
