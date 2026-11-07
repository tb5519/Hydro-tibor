const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const file = path.join(__dirname, '../packages/ui-default/components/voice_call/transport.ts');
const code = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
function fixture(t, mediaOwner = true) {
    const dom = new JSDOM('<body></body>', { url: 'https://onebyone.test/d/C0001/' });
    const sockets = []; const messages = []; const connections = [];
    class Socket extends dom.window.EventTarget {
        static OPEN = 1;
        constructor(url) { super(); this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
        send(value) { this.sent.push(value); }
        open() { this.readyState = 1; this.dispatchEvent(new dom.window.Event('open')); }
        message(value) { this.dispatchEvent(new dom.window.MessageEvent('message', { data: typeof value === 'string' ? value : JSON.stringify(value) })); }
        close(code = 1000) { this.readyState = 3; this.dispatchEvent(new dom.window.CloseEvent('close', { code })); }
    }
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, window: dom.window, document: dom.window.document,
        WebSocket: Socket, URL, Uint8Array });
    const config = { enabled: true, uid: 1, canTeach: true, socketUrl: '/voice-call/conn' };
    const create = (extra = {}) => new module.exports.VoiceTransport({ ...config, ...extra }, { mediaOwner,
        onMessage: (m) => messages.push(m), onConnection: (value) => connections.push(value) });
    const transport = create();
    t.after(() => { transport.dispose(); dom.window.close(); });
    return { dom, sockets, messages, connections, transport, create };
}
it('voice handshakes with same-origin encrypted socket and never sends media before ready', (t) => {
    const f = fixture(t);
    f.transport.start(); const ws = f.sockets[0];
    assert.equal(ws.url, 'wss://onebyone.test/voice-call/conn');
    assert.equal(f.transport.send({ type: 'dial', studentUid: 2 }), false);
    ws.open(); const hello = JSON.parse(ws.sent[0]);
    assert.equal(hello.type, 'hello'); assert.equal(hello.mediaOwner, true);
    assert.match(hello.tabId, /^[0-9a-f]{32}$/);
    assert.equal(f.transport.send({ type: 'audio' }), false);
    ws.message({ type: 'ready' });
    assert.equal(f.transport.ready, true); assert.equal(f.connections[0], true);
    assert.equal(f.transport.send({ type: 'dial', studentUid: 2 }), true);
});
it('congestion discards audio instead of queueing old speech and navigation preserves tab identity', (t) => {
    const f = fixture(t); f.transport.start(); const ws = f.sockets[0]; ws.open(); ws.message({ type: 'ready' });
    const original = JSON.parse(ws.sent[0]); ws.bufferedAmount = 17000;
    assert.equal(f.transport.send({ type: 'audio', data: 'old' }), false);
    assert.equal(f.transport.send({ type: 'hangup', callId: 'call' }), true);
    f.transport.dispose();
    const next = f.create(); next.start(); const newSocket = f.sockets[1]; newSocket.open();
    const nextHello = JSON.parse(newSocket.sent[0]);
    assert.equal(nextHello.tabId, original.tabId); assert.equal(nextHello.deviceId, original.deviceId);
    assert.equal(newSocket.sent.some((v) => v.includes('old')), false); next.dispose();
});
it('disposal cancels connections and cross-origin socket configuration is refused', (t) => {
    const f = fixture(t); const other = f.create({ socketUrl: 'https://other.test/voice-call/conn' });
    other.start(); assert.equal(f.sockets.length, 0); assert.equal(f.messages[0].type, 'error'); other.dispose();
    f.transport.start(); const ws = f.sockets[0]; ws.open(); ws.message({ type: 'ready' }); f.transport.dispose();
    assert.equal(f.transport.ready, false); assert.equal(ws.readyState, 3);
    assert.equal(f.transport.send({ type: 'audio' }), false);
});
for (const code of [4002, 4003]) it(`terminal server close ${code} ends voice without racing to reconnect`, async (t) => {
    const f = fixture(t); f.transport.start(); const ws = f.sockets[0]; ws.open(); ws.message({ type: 'ready' });
    ws.close(code);
    assert.equal(f.transport.ready, false);
    assert.equal(f.messages.at(-1).type, 'terminated');
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(f.sockets.length, 1); assert.equal(f.transport.send({ type: 'audio' }), false);
});
