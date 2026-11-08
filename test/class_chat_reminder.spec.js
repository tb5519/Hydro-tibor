const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

function fixture() {
  let now = 100000;
  const code = transformSync(fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/components/class_chat/sound.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const exported = { exports: {} };
  vm.runInNewContext(code, { module: exported, exports: exported.exports, Date: { now: () => now }, Math });
  const storage = new Map();
  function client() {
    const listeners = new Map(); const timers = new Map(); let timerId = 0; let tones = 0; let contexts = 0;
    const win = {
      addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name),
      localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
      document: { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) },
      setInterval: (fn) => { timers.set(++timerId, fn); return timerId; }, clearInterval: (id) => timers.delete(id),
      AudioContext: class {
        constructor() { contexts++; this.state = 'running'; this.currentTime = 0; }
        async resume() {} async close() { this.state = 'closed'; }
        createOscillator() { return { frequency: {}, connect() {}, disconnect() {}, start() { tones++; }, stop() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
      },
    };
    return { win, gesture: () => listeners.get('pointerdown')?.(), frameGesture: () => listeners.get('onebyone:platform-gesture')?.(), tick: () => [...timers.values()].forEach((fn) => fn()), tones: () => tones, contexts: () => contexts };
  }
  return { create: exported.exports.createStudentChatReminder, client, advance: () => { now += 10000; } };
}

it('students repeat until read, only one tab plays, and teacher never creates audio or timers', async () => {
  const f = fixture(); const a = f.client(); const b = f.client(); const teacher = f.client();
  const first = f.create(40, true, a.win); const second = f.create(40, true, b.win); const silent = f.create(2, false, teacher.win);
  first.setUnread(true); second.setUnread(true); silent.setUnread(true);
  assert.equal(a.contexts(), 0, 'no attempt to bypass browser gesture requirement');
  a.gesture(); b.gesture(); teacher.gesture();
  await Promise.resolve();
  assert.equal(a.tones() + b.tones(), 2, 'one short two-tone reminder across tabs');
  f.advance(); a.tick(); b.tick(); teacher.tick();
  assert.equal(a.tones() + b.tones(), 4, 'repeat while unread');
  first.setUnread(false); second.setUnread(false);
  f.advance(); a.tick(); b.tick();
  assert.equal(a.tones() + b.tones(), 4, 'stop as soon as read');
  assert.equal(teacher.contexts(), 0);
  first.dispose(); second.dispose(); silent.dispose();
});

it('when the first tab closes another tab can continue the unread reminder', async () => {
  const f = fixture(); const a = f.client(); const b = f.client();
  const first = f.create(40, true, a.win); const second = f.create(40, true, b.win);
  first.setUnread(true); second.setUnread(true); a.gesture(); b.gesture();
  await Promise.resolve(); first.dispose();
  f.advance(); b.tick();
  assert.equal(b.tones(), 2);
  second.dispose();
});

it('gestures inside a persistent content page unlock the parent reminder and dispose cleanly', async () => {
  const f = fixture(); const a = f.client(); const reminder = f.create(40, true, a.win);
  reminder.setUnread(true); a.frameGesture(); await Promise.resolve();
  assert.equal(a.tones(), 2);
  reminder.dispose(); f.advance(); a.frameGesture();
  assert.equal(a.contexts(), 1, 'a disposed session must not create another audio context');
});
