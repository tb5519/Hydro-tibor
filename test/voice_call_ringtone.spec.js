const assert = require('node:assert/strict');
const { it } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const { transformSync } = require('esbuild');
const source = transformSync(fs.readFileSync(require('node:path').join(__dirname, '../packages/ui-default/components/voice_call/ringtone.ts'), 'utf8'), {
    loader: 'ts', format: 'iife', globalName: 'Ringtone',
}).code;
function fixture({ blocked = false, pending = false } = {}) {
    const document = new EventTarget(); document.hidden = false;
    const contexts = []; const intervals = new Map(); let sequence = 0;
    class Audio {
        state = 'suspended'; currentTime = 0; nodes = []; destination = {};
        constructor() { contexts.push(this); }
        resume() {
            if (blocked) return Promise.reject(new Error('Autoplay denied'));
            if (pending) return new Promise((resolve) => { this.release = () => { this.state = 'running'; resolve(); }; });
            this.state = 'running'; return Promise.resolve();
        }
        close() { this.state = 'closed'; return Promise.resolve(); }
        createOscillator() {
            const node = { frequency: {}, starts: 0, stops: 0, connect() {}, disconnect() {}, start() { this.starts++; }, stop() { this.stops++; } };
            this.nodes.push(node); return node;
        }
        createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    }
    const ctx = vm.createContext({ document, window: { AudioContext: Audio, setInterval(callback) { intervals.set(++sequence, callback); return sequence; }, clearInterval(id) { intervals.delete(id); } } });
    vm.runInContext(source, ctx);
    return { ring: ctx.Ringtone.createCallRinger(), contexts, intervals, document };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
it('ringing only plays while incoming and visible; accepting or hiding immediately releases sound', async () => {
    const { ring, contexts, intervals, document } = fixture();
    assert.equal(contexts.length, 0);
    ring.setIncoming(true); await tick();
    assert.equal(contexts[0].nodes.length, 2); assert.equal(intervals.size, 1);
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(contexts[0].state, 'closed'); assert.equal(intervals.size, 0);
    assert.ok(contexts[0].nodes.every((node) => node.stops >= 2));
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); await tick();
    assert.equal(contexts.length, 2); assert.equal(contexts[1].nodes.length, 2);
    ring.setIncoming(false);
    assert.equal(contexts[1].state, 'closed'); assert.equal(intervals.size, 0);
    ring.dispose(); document.dispatchEvent(new Event('pointerdown')); assert.equal(contexts.length, 2);
});
it('blocked autoplay and a late audio resume cannot create a stale ring', async () => {
    const blocked = fixture({ blocked: true }); blocked.ring.setIncoming(true); await tick();
    assert.equal(blocked.contexts[0].nodes.length, 0); blocked.ring.dispose();
    const delayed = fixture({ pending: true }); delayed.ring.setIncoming(true); delayed.ring.setIncoming(false);
    delayed.contexts[0].release(); await tick();
    assert.equal(delayed.contexts[0].nodes.length, 0); assert.equal(delayed.intervals.size, 0); delayed.ring.dispose();
});
