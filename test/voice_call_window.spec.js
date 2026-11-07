const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const file = path.join(__dirname, '../packages/ui-default/components/voice_call/window.ts');
const code = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const snapshot = { type: 'snapshot', callId: 'voice-call-1', status: 'active', teacherUid: 1, teacherName: '唐老师',
    studentUid: 2, studentName: '橙子', createdAt: Date.now(), acceptedAt: Date.now(), ringExpiresAt: Date.now() + 45000, isOwner: true };
function fixture(t, { delayed = false } = {}) {
    const dom = new JSDOM('<div id="voice"></div>', { url: 'https://onebyone.test/' });
    const module = { exports: {} };
    const sent = []; const frames = []; let stopped = 0; let reset = 0; let started = 0; let pending;
    const media = { ready: false, start() {
        started++;
        if (!delayed) { media.ready = true; return Promise.resolve(); }
        return new Promise((resolve) => { pending = () => { media.ready = true; resolve(); }; });
    }, stop() { stopped++; media.ready = false; }, setMuted() {}, setTransmitting() {},
    receive(...args) { frames.push(args); }, resetReceive() { reset++; } };
    vm.runInNewContext(code, { module, exports: module.exports, window: dom.window, document: dom.window.document,
        sessionStorage: dom.window.sessionStorage, require(name) {
            if (name === './audio') return { microphoneError: (e) => e.message }; return {};
        } });
    const root = dom.window.document.querySelector('#voice');
    const transport = { ready: true, send(payload) { sent.push(payload); return true; } };
    const controller = module.exports.mountVoiceCallWindow(root, { uid: 1 }, { transport, audioFactory: () => media });
    t.after(() => { controller.dispose(); dom.window.close(); });
    return { root, controller, sent, frames, media, resolve: () => pending?.(),
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
