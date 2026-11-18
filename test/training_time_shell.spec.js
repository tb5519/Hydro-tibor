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

function shell(t, { standalone = false } = {}) {
    const dom = new JSDOM('<aside data-class-chat><button class="class-chat__launcher" aria-expanded="false">聊天</button><input id="chat"></aside><iframe data-platform-page src="/d/cpp/p/42"></iframe>', {
        url: standalone ? 'https://school.test/d/cpp/ide' : 'https://school.test/', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    t.after(() => dom.window.close());
    const host = dom.window.document;
    const frame = host.querySelector('iframe');
    const page = standalone ? dom.window : frame.contentWindow;
    let focused = true;
    let now = 0;
    let visible = true;
    Object.defineProperty(page.performance, 'now', { value: () => now });
    page.Date.now = () => now;
    Object.defineProperty(host, 'hasFocus', { value: () => focused });
    Object.defineProperty(host, 'visibilityState', { get: () => visible ? 'visible' : 'hidden' });
    if (!standalone) Object.defineProperty(page.document, 'hasFocus', { value: () => host.activeElement === frame && focused });
    const module = { exports: {} };
    new page.Function('module', 'exports', code)(module, module.exports);
    const calls = [];
    const timeline = [];
    let tick;
    page.setInterval = (fn) => { tick = fn; return 1; };
    page.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        calls.push(request);
        timeline.push({ at: now, request });
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ accepted: true, sessionId: 'lease' }) };
    };
    return { host, frame, page, calls, timeline, bind: (overrides) => module.exports.bindTrainingTime({ ...config, ...overrides }, page),
        tick(ms = 0) { now += ms; tick(); }, jump(ms) { now += ms; },
        visible(value) { visible = value; }, focused(value) { focused = value; } };
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

test('closing shell chat resumes passive reading while browser focus stays on its collapsed launcher', async (t) => {
    const h = shell(t);
    const launcher = h.host.querySelector('.class-chat__launcher');
    const binding = h.bind();
    await settle();
    launcher.setAttribute('aria-expanded', 'true');
    h.host.querySelector('#chat').focus();
    await settle();
    assert.equal(h.calls.at(-1).active, false);
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
    await settle();
    assert.equal(h.host.activeElement, launcher);
    assert.equal(h.calls.filter(call => call.sourceToken).length, 2);
    binding.dispose();
});

test('revealing an initially hidden or lesson-covered question resumes reading without a child focus event', async (t) => {
    const h = shell(t);
    h.frame.style.visibility = 'hidden';
    const binding = h.bind();
    await settle();
    assert.equal(h.calls.length, 0);
    h.frame.style.visibility = 'visible';
    await settle();
    assert.equal(h.calls.at(-1)?.sourceToken, config.sourceToken);
    h.frame.setAttribute('inert', '');
    await settle();
    assert.equal(h.calls.at(-1).active, false);
    h.frame.removeAttribute('inert');
    await settle();
    assert.equal(h.calls.filter(call => call.sourceToken).length, 2);
    binding.dispose();
});

test('a page in the back-forward cache stays paused across shell focus changes until restored', async (t) => {
    const h = shell(t);
    const binding = h.bind();
    await settle();
    h.page.dispatchEvent(new h.page.PageTransitionEvent('pagehide', { persisted: true }));
    const count = h.calls.length;
    h.host.querySelector('#chat').focus();
    h.frame.focus();
    h.tick();
    await settle();
    assert.equal(h.calls.length, count);
    h.page.dispatchEvent(new h.page.PageTransitionEvent('pageshow', { persisted: true }));
    await settle();
    assert.equal(h.calls.at(-1).sourceToken, config.sourceToken);
    binding.dispose();
});

test('shell focus/visibility notifications and frame style changes do not restart an idle reader', async (t) => {
    const h = shell(t);
    const binding = h.bind();
    await settle();
    for (let i = 0; i < 60; i++) {
        h.tick(5000);
        await settle();
    }
    assert.equal(h.calls.at(-1).active, false);
    const count = h.calls.length;
    h.host.defaultView.dispatchEvent(new h.host.defaultView.Event('focus'));
    h.host.dispatchEvent(new h.host.defaultView.Event('visibilitychange'));
    h.frame.style.width = '100%';
    h.tick(5000);
    await settle();
    assert.equal(h.calls.length, count);
    binding.dispose();
});

// jsdom uses this path to deliver trusted DOM input. dispatchEvent() remains
// available to simulate script-generated events which must never reset idle.
const { fireAnEvent } = require('jsdom/lib/jsdom/living/helpers/events');
const { implForWrapper } = require('jsdom/lib/generated/idl/utils');

for (const standalone of [false, true]) {
    const surface = standalone ? 'standalone IDE' : 'shell problem';
    test(`clock timeline for ${surface}: address bar, hidden tab, cache, input, idle and laptop sleep`, async (t) => {
        const h = shell(t, { standalone });
        const doc = h.page.document;
        if (!doc.body) { doc.open(); doc.write('<!doctype html><body></body>'); doc.close(); }
        const editor = doc.createElement('textarea');
        doc.body.append(editor);
        const binding = h.bind({ idleSeconds: 30 });
        await settle();
        let time = 0;
        let nextTick = 5000;
        const go = async (at, event) => {
            while (nextTick <= at) {
                h.tick(nextTick - time);
                time = nextTick;
                nextTick += 5000;
                await settle();
            }
            h.jump(at - time);
            time = at;
            event?.();
            await settle();
        };
        const focus = (yes) => {
            h.focused(yes);
            h.host.defaultView.dispatchEvent(new h.host.defaultView.Event(yes ? 'focus' : 'blur'));
        };
        const visible = (yes) => {
            h.visible(yes);
            h.host.dispatchEvent(new h.host.defaultView.Event('visibilitychange'));
        };
        const cache = (name) => h.page.dispatchEvent(new h.page.PageTransitionEvent(name, { persisted: true }));
        const edit = () => fireAnEvent('input', implForWrapper(editor), undefined, { bubbles: true });
        await go(8000, edit);
        await go(12000, () => focus(false));       // tab still visible, caret in address bar
        await go(18000, () => visible(true));     // no foreground until window actually regains focus
        await go(22000, () => focus(true));
        await go(29000, () => visible(false));
        await go(31500, () => focus(false));
        await go(33000, () => visible(true));     // returning tab is still in a background window
        await go(40000, () => focus(true));
        await go(48000, () => cache('pagehide'));
        await go(55000, () => { focus(true); edit(); });
        await go(81000, () => cache('pageshow'));
        await go(85400, edit);
        await go(99400, () => editor.dispatchEvent(new h.page.Event('input', { bubbles: true })));
        await go(118000, edit);                  // session ended at 115.4 s before this real input
        await go(130000);
        h.tick(90000);                           // no timer fired while the laptop slept
        time = 220000;
        nextTick = 225000;
        await settle();
        await go(222000, edit);
        await go(226000, () => binding.dispose());

        const transitions = h.timeline.flatMap(({ at, request }) => {
            if (request.sourceToken) return [['start', at]];
            if (request.active === false) return [[request.discard ? 'discard' : 'stop', at - (request.delayedByMs || 0)]];
            return [];
        });
        assert.deepEqual(transitions, [
            ['start', 0], ['stop', 12000], ['start', 22000], ['stop', 29000],
            ['start', 40000], ['stop', 48000], ['start', 81000], ['stop', 115400],
            ['start', 118000], ['discard', 220000], ['start', 222000], ['stop', 226000],
        ]);
    });
}

test('wheel reading follows the document under the cursor even when keyboard focus is parked in the other document', async (t) => {
    const h = shell(t);
    const doc = h.page.document;
    const input = h.host.querySelector('#chat');
    const binding = h.bind();
    await settle();
    h.jump(1200);
    input.focus();
    h.jump(2200);
    fireAnEvent('wheel', implForWrapper(doc), undefined, { bubbles: true });
    await settle();
    assert.equal(h.host.activeElement, input);
    assert.equal(h.calls.at(-1).sourceToken, config.sourceToken);
    h.jump(1500);
    fireAnEvent('keydown', implForWrapper(input), undefined, { bubbles: true });
    await settle();
    assert.equal(h.calls.at(-1).active, false);
    h.frame.focus();
    h.jump(1100);
    fireAnEvent('wheel', implForWrapper(input), undefined, { bubbles: true });
    await settle();
    assert.equal(h.host.activeElement, h.frame);
    assert.equal(h.calls.at(-1).active, false);
    h.jump(1700);
    fireAnEvent('wheel', implForWrapper(doc), undefined, { bubbles: true });
    await settle();
    assert.equal(h.calls.at(-1).sourceToken, config.sourceToken);
    binding.dispose();
});
