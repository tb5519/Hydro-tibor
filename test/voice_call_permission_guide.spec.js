const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const file = path.join(__dirname, '../packages/ui-default/components/voice_call/permission_guide.ts');
const code = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(t, { state, delayed = false, reject = false, throws = false } = {}) {
    const dom = new JSDOM('<button id="accept">接听</button><p>平台内容</p>', { url: 'https://onebyone.test/' });
    const { window } = dom;
    const timers = new Map(); let timerId = 0; let cancelled = 0; let retried = 0; let queryCount = 0; let resolveQuery;
    window.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; };
    window.clearTimeout = (id) => timers.delete(id);
    const listeners = new Set();
    const permission = { state: state || 'prompt',
        addEventListener(event, listener) { assert.equal(event, 'change'); listeners.add(listener); },
        removeEventListener(event, listener) { assert.equal(event, 'change'); listeners.delete(listener); } };
    if (state || delayed || reject || throws) {
        Object.defineProperty(window.navigator, 'permissions', { configurable: true, value: { query(request) {
            assert.equal(request.name, 'microphone'); queryCount++;
            if (throws) throw new TypeError('unsupported permission name');
            if (reject) return Promise.reject(new TypeError('unsupported permission name'));
            if (delayed) return new Promise((resolve) => { resolveQuery = resolve; });
            return Promise.resolve(permission);
        } } });
    }
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports });
    const accept = window.document.querySelector('#accept'); accept.focus();
    const guide = module.exports.mountVoicePermissionGuide(window.document, {
        onCancel() { cancelled++; }, onRetry() { retried++; },
    });
    const root = window.document.querySelector('[data-voice-permission-guide]');
    t.after(() => { guide.dispose(); window.close(); });
    return { window, guide, root, accept, timers, permission, listeners,
        get cancelled() { return cancelled; }, get retried() { return retried; }, get queryCount() { return queryCount; },
        el(selector) { return root.querySelector(selector); },
        runTimers() { const queued = [...timers.values()]; timers.clear(); for (const { callback } of queued) callback(); },
        resolvePermission() { resolveQuery?.(permission); },
        changePermission(value) { permission.state = value; for (const listener of [...listeners]) listener(); },
        key(key, shiftKey = false) { window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })); },
    };
}

it('waits briefly for a real microphone request and does not steal native-prompt focus', async (t) => {
    const f = fixture(t, { state: 'prompt' });
    f.guide.begin();
    assert.equal(f.root.hidden, true); assert.equal(f.queryCount, 1);
    assert.equal([...f.timers.values()][0].delay, 500);
    await flush(); f.runTimers();
    assert.equal(f.root.hidden, false); assert.equal(f.root.dataset.state, 'pending');
    assert.match(f.root.textContent, /浏览器上方的麦克风提示/);
    assert.equal(f.window.document.activeElement, f.accept);
    assert.equal(f.el('[data-voice-permission-retry]').hidden, true);
    assert.equal(f.root.getAttribute('role'), 'dialog'); assert.equal(f.root.getAttribute('aria-modal'), 'true');
    assert.equal(f.root.hasAttribute('data-live-share-private'), true);
    assert.ok(f.window.document.getElementById(f.root.getAttribute('aria-labelledby')));
    assert.ok(f.window.document.getElementById(f.root.getAttribute('aria-describedby')));
});

it('already granted permission never flashes a guide even if device setup is slow', async (t) => {
    const f = fixture(t, { state: 'granted' });
    f.guide.begin(); await flush(); f.runTimers();
    assert.equal(f.root.hidden, true); assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 0);
});

it('granting permission automatically removes the visible guide and its listeners', async (t) => {
    const f = fixture(t, { state: 'prompt' });
    f.guide.begin(); await flush(); f.runTimers();
    assert.equal(f.listeners.size, 1); assert.equal(f.root.hidden, false);
    f.changePermission('granted');
    assert.equal(f.root.hidden, true); assert.equal(f.listeners.size, 0); assert.equal(f.timers.size, 0);
    f.changePermission('denied'); assert.equal(f.root.hidden, true);
});

it('known denied permission shows settings help and an explicit retry instead of a fake Allow prompt', async (t) => {
    const f = fixture(t, { state: 'denied' });
    f.guide.begin(); await flush();
    assert.equal(f.root.dataset.state, 'blocked'); assert.equal(f.timers.size, 0);
    assert.match(f.el('.voice-permission-guide__copy').textContent, /地址栏旁的权限图标/);
    assert.equal(f.el('[data-voice-permission-retry]').hidden, false);
    assert.equal(f.window.document.activeElement, f.el('[data-voice-permission-retry]'));
    f.el('[data-voice-permission-retry]').click();
    assert.equal(f.retried, 1); assert.equal(f.root.hidden, true); assert.equal(f.cancelled, 0);
    assert.equal(f.window.document.activeElement, f.accept);
});

it('unsupported or rejected permission queries keep conditional wording and never request a device', async (t) => {
    for (const options of [{}, { reject: true }, { throws: true }]) {
        const f = fixture(t, options);
        f.guide.begin(); await flush(); f.runTimers();
        assert.equal(f.root.dataset.state, 'pending');
        assert.match(f.el('.voice-permission-guide__copy').textContent, /如果浏览器弹出/);
        f.el('[data-voice-permission-cancel]').click();
        assert.equal(f.cancelled, 1); assert.equal(f.retried, 0); assert.equal(f.root.hidden, true);
    }
});

it('microphone success before the timer or a late permission query cannot reopen the guide', async (t) => {
    const f = fixture(t, { delayed: true });
    f.guide.begin(); f.guide.microphoneGranted(); f.runTimers();
    f.resolvePermission(); await flush();
    assert.equal(f.root.hidden, true); assert.equal(f.listeners.size, 0);
    f.guide.begin(); f.runTimers(); assert.equal(f.root.hidden, false);
    f.guide.microphoneGranted(); f.resolvePermission(); await flush();
    assert.equal(f.root.hidden, true); assert.equal(f.listeners.size, 0);
});

it('playback assistance points to a real page button and its click only requests retry', (t) => {
    const f = fixture(t);
    f.guide.playbackBlocked();
    assert.equal(f.root.dataset.state, 'playback');
    assert.equal(f.el('.voice-permission-guide__browser-arrow').hasAttribute('hidden'), true);
    assert.equal(f.el('.voice-permission-guide__playback-arrow').hidden, false);
    assert.equal(f.el('[data-voice-permission-retry]').textContent, '点击开启声音');
    assert.doesNotMatch(f.el('.voice-permission-guide__copy').textContent, /麦克风|地址栏|允许/);
    f.el('[data-voice-permission-retry]').click();
    assert.equal(f.retried, 1); assert.equal(f.cancelled, 0); assert.equal(f.root.hidden, true);
});

it('Escape cancels exactly once, clears a pending request and restores only guide-owned focus', async (t) => {
    const f = fixture(t, { state: 'prompt' });
    f.guide.begin(); await flush(); f.runTimers();
    f.key('Tab'); assert.equal(f.window.document.activeElement, f.el('[data-voice-permission-cancel]'));
    f.key('Escape'); f.key('Escape');
    assert.equal(f.cancelled, 1); assert.equal(f.root.hidden, true); assert.equal(f.listeners.size, 0);
    assert.equal(f.window.document.activeElement, f.accept);
    f.changePermission('granted'); f.runTimers(); assert.equal(f.root.hidden, true);
});

it('keyboard navigation remains within visible guide actions without showing hidden retry', (t) => {
    const f = fixture(t);
    f.guide.begin(); f.runTimers();
    f.key('Tab', true); assert.equal(f.window.document.activeElement, f.el('[data-voice-permission-cancel]'));
    f.key('Tab'); assert.equal(f.window.document.activeElement, f.el('[data-voice-permission-cancel]'));
    f.guide.blocked();
    f.key('Tab'); assert.equal(f.window.document.activeElement, f.el('[data-voice-permission-cancel]'));
    f.key('Tab'); assert.equal(f.window.document.activeElement, f.el('[data-voice-permission-retry]'));
    f.key('Tab', true); assert.equal(f.window.document.activeElement, f.el('[data-voice-permission-cancel]'));
});

it('replacing a request detaches its old permission listener and ignores obsolete results', async (t) => {
    const f = fixture(t, { state: 'prompt' });
    f.guide.begin(); await flush(); assert.equal(f.listeners.size, 1);
    const oldChange = [...f.listeners][0];
    f.guide.hide(); f.guide.begin(); await flush();
    assert.equal(f.listeners.size, 1); f.runTimers();
    f.permission.state = 'denied'; oldChange();
    assert.equal(f.root.dataset.state, 'pending');
    f.changePermission('granted'); assert.equal(f.root.hidden, true);
});

it('disposal is idempotent and stops late queries, timers and keyboard callbacks', async (t) => {
    const f = fixture(t, { delayed: true });
    f.guide.begin(); f.guide.dispose(); f.guide.dispose();
    assert.equal(f.root.isConnected, false); assert.equal(f.timers.size, 0);
    f.resolvePermission(); await flush(); f.runTimers(); f.key('Escape');
    f.guide.begin(); f.guide.blocked(); f.guide.playbackBlocked();
    assert.equal(f.root.isConnected, false); assert.equal(f.listeners.size, 0);
    assert.equal(f.cancelled, 0); assert.equal(f.retried, 0); assert.equal(f.timers.size, 0);
});
