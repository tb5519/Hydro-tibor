const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');

const code = transformSync(fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/components/training_time.ts'), 'utf8'),
    { loader: 'ts', format: 'cjs' }).code;
const config = { enabled: true, sourceToken: 'problem-grant', startUrl: '/training-time/session', heartbeatUrl: '/training-time/heartbeat' };
const settle = () => new Promise((resolve) => setImmediate(resolve));

function shell(t) {
    const dom = new JSDOM('<input id="chat"><iframe data-platform-page src="/d/cpp/p/42"></iframe>', {
        url: 'https://school.test/', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    t.after(() => dom.window.close());
    const host = dom.window.document;
    const frame = host.querySelector('iframe');
    const page = frame.contentWindow;
    let focused = true;
    Object.defineProperty(host, 'hasFocus', { value: () => focused });
    Object.defineProperty(page.document, 'hasFocus', { value: () => host.activeElement === frame && focused });
    const module = { exports: {} };
    new page.Function('module', 'exports', code)(module, module.exports);
    const calls = [];
    let tick;
    page.setInterval = (fn) => { tick = fn; return 1; };
    page.fetch = async (_url, options) => {
        calls.push(JSON.parse(options.body));
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ accepted: true, sessionId: 'lease' }) };
    };
    return { host, frame, page, calls, bind: () => module.exports.bindTrainingTime(config, page), tick: () => tick(),
        focused(value) { focused = value; } };
}

test('reading in the visible study frame starts before the first click and pauses when the shell chat takes focus', async (t) => {
    const h = shell(t);
    assert.equal(h.host.activeElement, h.host.body);
    assert.equal(h.page.document.hasFocus(), false);
    const binding = h.bind();
    await settle();
    assert.deepEqual(h.calls.map((request) => request.sourceToken), ['problem-grant']);
    h.host.querySelector('#chat').focus();
    h.tick();
    await settle();
    assert.equal(h.calls.at(-1).active, false);
    h.page.dispatchEvent(new h.page.Event('focus'));
    await settle();
    assert.equal(h.calls.length, 2);
    h.frame.focus();
    h.page.dispatchEvent(new h.page.Event('focus'));
    await settle();
    assert.equal(h.calls.at(-1).sourceToken, 'problem-grant');
    binding.dispose();
});

test('an unfocused host, hidden loading frame or frame covered by a lesson viewer cannot start autonomous training', async (t) => {
    const h = shell(t);
    h.focused(false);
    const binding = h.bind();
    await settle();
    h.frame.style.visibility = 'hidden';
    h.focused(true);
    h.page.document.dispatchEvent(new h.page.Event('visibilitychange'));
    await settle();
    h.frame.style.visibility = 'visible';
    h.frame.inert = true;
    h.page.dispatchEvent(new h.page.Event('focus'));
    await settle();
    assert.equal(h.calls.length, 0);
    h.frame.inert = false;
    h.page.dispatchEvent(new h.page.Event('focus'));
    await settle();
    assert.equal(h.calls.length, 1);
    h.focused(false);
    h.tick();
    await settle();
    assert.equal(h.calls.at(-1).active, false);
    binding.dispose();
});
