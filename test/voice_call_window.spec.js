const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const file = path.join(__dirname, '../packages/ui-default/components/voice_call/window.ts');
const code = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const guideFile = path.join(__dirname, '../packages/ui-default/components/voice_call/permission_guide.ts');
const snapshot = { type: 'snapshot', callId: 'voice-call-1', status: 'active', teacherUid: 1, teacherName: '唐老师',
    studentUid: 2, studentName: '橙子', createdAt: Date.now(), acceptedAt: Date.now(), ringExpiresAt: Date.now() + 45000, isOwner: true };
function fixture(t, { delayed = false, uid = 1, setup = false, startError = null, mac = false } = {}) {
    const dom = new JSDOM('<div id="voice"></div>', { url: 'https://onebyone.test/' });
    if (mac) Object.defineProperties(dom.window.navigator, {
        platform: { value: 'MacIntel' }, userAgent: { value: 'Version/18 Safari/605' },
    });
    const module = { exports: {} };
    const sent = []; const frames = []; let stopped = 0; let reset = 0; let started = 0; let pending; let callbacks;
    const guideModule = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(guideFile, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module: guideModule, exports: guideModule.exports, window: dom.window, document: dom.window.document });
    const media = { ready: false, start() {
        started++;
        if (setup) callbacks.onSetupState('microphone-pending');
        if (startError) return Promise.reject(startError);
        const complete = () => {
            media.ready = true;
            if (setup) { callbacks.onSetupState('microphone-granted'); callbacks.onSetupState('ready'); }
        };
        if (!delayed) { complete(); return Promise.resolve(); }
        return new Promise((resolve) => { pending = () => { complete(); resolve(); }; });
    }, stop() { stopped++; media.ready = false; if (setup) callbacks.onSetupState('idle'); }, setMuted() {}, setTransmitting() {},
    receive(...args) { frames.push(args); }, resetReceive() { reset++; } };
    vm.runInNewContext(code, { module, exports: module.exports, window: dom.window, document: dom.window.document,
        sessionStorage: dom.window.sessionStorage, require(name) {
            if (name === './permission_guide') return guideModule.exports;
            if (name === './audio') return { microphoneError: (e) => e.message }; return {};
        } });
    const root = dom.window.document.querySelector('#voice');
    const transport = { ready: true, send(payload) { sent.push(payload); return true; } };
    const controller = module.exports.mountVoiceCallWindow(root, { uid, canTeach: uid === 1 }, {
        transport, audioFactory: (settings) => { callbacks = settings; return media; },
    });
    t.after(() => { controller.dispose(); dom.window.close(); });
    return { root, controller, sent, frames, media, document: dom.window.document, window: dom.window,
        callbacks, clearStartError: () => { startError = null; }, resolve: () => pending?.(),
        get started() { return started; }, get stopped() { return stopped; }, get reset() { return reset; } };
}
const tick = () => new Promise((r) => setImmediate(r));
it('never starts a microphone for a different tab, and isolates incoming call audio', async (t) => {
    const f = fixture(t);
    f.controller.receive({ ...snapshot, isOwner: false });
    assert.equal(f.started, 0); assert.equal(f.root.hidden, true);
    f.controller.receive(snapshot); await tick();
    assert.equal(f.started, 1);
    f.controller.receive({ type: 'audio', callId: 'another-call', seq: 1, data: 'secret' });
    assert.equal(f.frames.length, 0);
    f.controller.receive({ type: 'audio', callId: snapshot.callId, streamId: 'stream-a', seq: 50, data: 'voice' });
    f.controller.receive({ type: 'audio', callId: snapshot.callId, streamId: 'stream-b', seq: 0, data: 'new-page' });
    assert.equal(f.reset, 2); assert.equal(f.frames[1][0], 0);
});
it('explicit dial requests microphone first and normal page disposal never hangs up', async (t) => {
    const f = fixture(t, { delayed: true });
    f.controller.dial(2, '橙子');
    assert.equal(f.started, 1); assert.equal(f.sent.length, 0); assert.equal(f.root.hidden, false);
    f.resolve(); await tick();
    assert.equal(f.sent[0].type, 'dial'); assert.equal(f.sent[0].studentUid, 2); assert.match(f.sent[0].requestId, /^[0-9a-f]{32}$/);
    f.controller.receive({ ...snapshot, requestId: f.sent[0].requestId });
    f.controller.dispose();
    assert.ok(f.stopped > 0); assert.equal(f.sent.some((m) => m.type === 'hangup'), false);
});
it('ending while microphone permission is pending never sends a late acceptance', async (t) => {
    const f = fixture(t, { delayed: true });
    f.controller.accept(snapshot.callId);
    f.controller.receive({ type: 'ended', callId: snapshot.callId, reason: '老师已取消' });
    const stopped = f.stopped;
    f.resolve(); await tick();
    assert.equal(f.sent.length, 0); assert.ok(stopped > 0);
    // Real VoiceAudio has a generation guard that stops a late getUserMedia stream.
});
it('ended before the first snapshot stops microphone for both dial and accept', async (t) => {
    for (const action of ['dial', 'accept']) {
        const f = fixture(t);
        action === 'dial' ? f.controller.dial(2) : f.controller.accept(snapshot.callId);
        await tick(); assert.equal(f.media.ready, true);
        f.controller.receive({ type: 'ended', callId: snapshot.callId, requestId: f.sent[0]?.requestId });
        assert.equal(f.media.ready, false);
    }
});
it('cancel before dial acknowledgement immediately releases microphone and rejects late owner snapshot', async (t) => {
    const f = fixture(t);
    f.controller.dial(2); await tick();
    f.controller.hangup(); assert.equal(f.media.ready, false);
    f.controller.dial(3); await tick();
    assert.equal(f.sent.filter((m) => m.type === 'dial').length, 1);
    f.controller.receive({ ...snapshot, requestId: f.sent[0].requestId });
    assert.equal(f.sent.at(-1).type, 'hangup'); assert.equal(f.root.hidden, true);
    f.controller.receive({ ...snapshot, requestId: f.sent[0].requestId });
    assert.equal(f.started, 1, 'late duplicate snapshot cannot restart the microphone');
});
it('offline hangup stops microphone immediately and cancels the call after reconnect', async (t) => {
    const f = fixture(t);
    f.controller.receive(snapshot); await tick();
    f.controller.setConnected(false); f.controller.hangup();
    assert.equal(f.media.ready, false);
    f.controller.setConnected(true); f.controller.receive(snapshot);
    assert.equal(f.sent.at(-1).type, 'hangup'); assert.equal(f.root.hidden, true);
});
it('student hangup while microphone permission is pending cancels ringing remotely and ignores late approval', async (t) => {
    const f = fixture(t, { delayed: true });
    f.controller.accept(snapshot.callId);
    f.controller.hangup();
    assert.equal(f.sent[0].type, 'hangup'); assert.equal(f.sent[0].callId, snapshot.callId);
    f.resolve(); await tick();
    assert.equal(f.sent.some((message) => message.type === 'accept'), false);
    assert.equal(f.root.hidden, true);
    f.controller.receive({ ...snapshot, isOwner: false, status: 'ringing' });
    assert.equal(f.sent.at(-1).type, 'hangup', 'cancel also survives a reconnecting ringing snapshot');
});
it('late ended, error and snapshot from a previous call cannot stop a new dial', async (t) => {
    const f = fixture(t);
    f.controller.dial(2); await tick();
    const oldRequestId = f.sent[0].requestId;
    f.controller.receive({ ...snapshot, requestId: oldRequestId });
    f.controller.hangup(); f.controller.receive({ type: 'ended', callId: snapshot.callId, requestId: oldRequestId });
    f.controller.dial(3); await tick();
    const newRequestId = f.sent.at(-1).requestId;
    assert.notEqual(oldRequestId, newRequestId);
    assert.equal(f.controller.receive({ type: 'ended', callId: snapshot.callId, requestId: oldRequestId }), false);
    assert.equal(f.controller.receive({ type: 'error', requestId: oldRequestId, message: 'Old call error' }), false);
    assert.equal(f.controller.receive({ ...snapshot, requestId: oldRequestId }), false);
    assert.equal(f.media.ready, true); assert.equal(f.root.hidden, false);
    f.controller.receive({ type: 'ended', callId: 'next-call', requestId: newRequestId });
    assert.equal(f.media.ready, false, 'the new dial still responds to its own early ended event');
});
it('permission revocation or connection replacement immediately stops an active microphone', async (t) => {
    const f = fixture(t);
    f.controller.receive(snapshot); await tick(); assert.equal(f.media.ready, true);
    f.controller.receive({ type: 'terminated', reason: '登录已失效' });
    assert.equal(f.media.ready, false); assert.match(f.root.textContent, /登录已失效/);
});

const waitForGuide = () => new Promise((resolve) => setTimeout(resolve, 530));
const visibleGuide = (f) => f.document.querySelector('[data-voice-permission-guide]:not([hidden])');
for (const uid of [1, 2]) it(`Mac user ${uid} can retry a denied microphone exactly once in their own call role`, async t => {
    const f = fixture(t, { uid, setup: true, mac: true, startError: Object.assign(new Error('denied'), { name: 'NotAllowedError' }) });
    if (uid === 1) f.controller.dial(2); else f.controller.accept(snapshot.callId);
    await tick();
    const guide = visibleGuide(f);
    assert.equal(guide.dataset.state, 'blocked');
    assert.equal(guide.querySelector('[data-voice-permission-cancel]').textContent, uid === 1 ? '取消呼叫' : '取消接听');
    assert.match(guide.textContent, /Safari 浏览器 → 设置 → 网站/);
    guide.querySelector('summary').click();
    assert.equal(f.started, 1); assert.equal(f.sent.length, 0);
    f.clearStartError(); guide.querySelector('[data-voice-permission-retry]').click(); await tick();
    assert.equal(f.started, 2); assert.equal(visibleGuide(f), null);
    assert.deepEqual(f.sent.map(message => message.type), [uid === 1 ? 'dial' : 'accept']);
});
it('student acceptance shows the pending guide and granting the microphone removes it before accepting', async (t) => {
    const f = fixture(t, { uid: 2, delayed: true, setup: true });
    f.controller.accept(snapshot.callId);
    await waitForGuide();
    assert.equal(visibleGuide(f)?.dataset.state, 'pending');
    assert.equal(f.sent.length, 0, 'permission guidance does not itself accept the call');
    f.resolve(); await tick();
    assert.equal(visibleGuide(f), null);
    assert.equal(f.sent.at(-1).type, 'accept');
});
it('remembered permission and teacher dialing never flash a student permission overlay', async (t) => {
    const student = fixture(t, { uid: 2, setup: true });
    student.controller.accept(snapshot.callId); await tick();
    const teacher = fixture(t, { delayed: true, setup: true });
    teacher.controller.dial(2); await waitForGuide();
    assert.equal(visibleGuide(student), null); assert.equal(visibleGuide(teacher), null);
});
it('the guide cancel button hangs up while permission is pending and a late grant never accepts', async (t) => {
    const f = fixture(t, { uid: 2, delayed: true, setup: true });
    f.controller.accept(snapshot.callId); await waitForGuide();
    f.document.querySelector('[data-voice-permission-cancel]').click();
    assert.equal(visibleGuide(f), null); assert.equal(f.root.hidden, true);
    assert.equal(f.sent.length, 1); assert.equal(f.sent[0].type, 'hangup'); assert.equal(f.sent[0].callId, snapshot.callId);
    f.resolve(); await tick();
    assert.equal(f.sent.some((message) => message.type === 'accept'), false);
});
for (const reason of ['ended', 'terminated', 'offline', 'dispose']) {
    it(`${reason} removes permission guidance and cannot send a late acceptance`, async (t) => {
        const f = fixture(t, { uid: 2, delayed: true, setup: true });
        f.controller.accept(snapshot.callId); await waitForGuide();
        assert.ok(visibleGuide(f));
        if (reason === 'offline') f.controller.setConnected(false);
        else if (reason === 'dispose') f.controller.dispose();
        else f.controller.receive({ type: reason, callId: snapshot.callId });
        assert.equal(visibleGuide(f), null);
        f.resolve(); await tick();
        assert.equal(f.sent.some((message) => message.type === 'accept'), false);
    });
}
it('microphone denial shows settings guidance and an explicit retry can accept the call', async (t) => {
    const cause = Object.assign(new Error('麦克风被拒绝'), { name: 'NotAllowedError' });
    const f = fixture(t, { uid: 2, setup: true, startError: cause });
    f.controller.accept(snapshot.callId); await tick();
    assert.equal(visibleGuide(f)?.dataset.state, 'blocked');
    assert.equal(f.sent.length, 0);
    f.clearStartError(); f.document.querySelector('[data-voice-permission-retry]').click(); await tick();
    assert.equal(visibleGuide(f), null); assert.equal(f.sent.at(-1).type, 'accept');
});
it('playback blocking points to an in-page enable-sound button instead of microphone settings', async (t) => {
    const cause = Object.assign(new Error('声音已暂停'), { name: 'VoicePlaybackBlockedError' });
    const f = fixture(t, { uid: 2, setup: true, startError: cause });
    f.controller.accept(snapshot.callId); await tick();
    assert.equal(visibleGuide(f)?.dataset.state, 'playback');
    assert.match(f.document.querySelector('[data-voice-permission-retry]').textContent, /开启声音/);
    f.clearStartError(); f.document.querySelector('[data-voice-permission-retry]').click();
    assert.equal(f.started, 2, 'the retry starts within the real button handler');
    await tick(); assert.equal(f.sent.filter((message) => message.type === 'accept').length, 1);
});
