const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { webcrypto } = require('node:crypto');

function fixture() {
  let now = 10000; let timerId = 0;
  const timers = new Map(); const messages = [];
  const socket = { readyState: 1, send: (value) => messages.push(JSON.parse(value)), close() {} };
  const context = { console, URL, TextEncoder, crypto: webcrypto, location: { href: 'http://local/ide' },
    window: { dispatchEvent() {} }, CustomEvent: class {}, Date: { now: () => now },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); } };
  function load(name, dependencies = {}) {
    const module = { exports: {} };
    const file = path.resolve(__dirname, '../packages/ui-default/components/ide', name);
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
      { ...context, module, exports: module.exports, require: (key) => dependencies[key] });
    return module.exports;
  }
  const types = load('types.ts');
  const { createIdeRuntime } = load('runtime.ts', { './types': types });
  const runtime = createIdeRuntime({ url: '/ide/conn', source: () => ({ lang: 'py.py3', code: 'input()' }), socketFactory: () => socket });
  const server = (value) => socket.onmessage({ data: JSON.stringify(value) });
  server({ type: 'ready' }); runtime.command({ type: 'run' });
  server({ type: 'state', state: 'running' });
  return { runtime, messages, server, tick(ms) {
    now += ms;
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); }
  } };
}
it('typing renews only a real input wait and coalesces changes without submitting stdin', () => {
  const f = fixture();
  f.runtime.command({ type: 'input-draft', text: 'before wait' });
  assert.equal(f.messages.filter((m) => m.type === 'input-draft').length, 0);
  f.server({ type: 'input-request' });
  f.runtime.command({ type: 'input-draft', text: '小' });
  f.runtime.command({ type: 'input-draft', text: '小明' });
  f.runtime.command({ type: 'input-draft', text: '小明同学' });
  f.tick(999);
  assert.equal(f.messages.filter((m) => m.type === 'input-draft').length, 1);
  f.tick(1);
  assert.deepEqual(f.messages.filter((m) => m.type === 'input-draft').map((m) => m.text), ['小', '小明同学']);
  f.runtime.command({ type: 'input-draft', text: '小明同学' }); f.tick(1000);
  assert.equal(f.messages.filter((m) => m.type === 'input-draft').length, 2);
  assert.equal(f.messages.filter((m) => m.type === 'input').length, 0);
  f.runtime.command({ type: 'input', text: '小明同学' });
  const activity = f.messages.filter((m) => ['input', 'input-draft'].includes(m.type));
  assert(activity.every((m, i) => !i || m.seq > activity[i - 1].seq));
  f.runtime.dispose();
});
it('late activity is cancelled on submit, stop and a new run', () => {
  for (const action of ['input', 'stop', 'exit']) {
    const f = fixture(); f.server({ type: 'input-request' });
    f.runtime.command({ type: 'input-draft', text: 'a' });
    f.runtime.command({ type: 'input-draft', text: 'ab' });
    if (action === 'exit') { f.server({ type: 'exit', status: 'finished', exitCode: 0 }); f.runtime.command({ type: 'run' }); }
    else f.runtime.command({ type: action, text: 'ab' });
    f.tick(1000);
    assert.equal(f.messages.filter((m) => m.type === 'input-draft').length, 1, action);
    f.runtime.dispose();
  }
});
it('dialog draft is shared without overwriting terminal text or accepting stale dialog activity', () => {
  const f = fixture();
  f.runtime.command({ type: 'input-draft', text: 'terminal' });
  f.server({ type: 'turtle', commands: [{ op: 'request', id: 2, kind: 'text', title: '姓名', prompt: '请输入' }] });
  f.runtime.command({ type: 'input-draft', target: 'dialog', requestId: 1, text: 'stale' });
  f.runtime.command({ type: 'input-draft', target: 'dialog', requestId: 2, text: '小明' });
  assert.equal(f.runtime.snapshot().request.draft, '小明');
  assert.equal(f.runtime.snapshot().inputDraft, 'terminal');
  assert.deepEqual(f.messages.filter((m) => m.type === 'input-draft').map((m) => m.text), ['小明']);
  f.runtime.command({ type: 'input-draft', target: 'dialog', requestId: 2, text: '小明同学' });
  f.runtime.command({ type: 'turtle-event', event: { type: 'response', id: 2, value: '小明同学' } });
  f.tick(1000);
  assert.equal(f.runtime.snapshot().request, null);
  assert.equal(f.messages.filter((m) => m.type === 'input-draft').length, 1);
  f.runtime.dispose();
});
it('automatic stop explains why the slot was released even when the process returns exit code zero', () => {
  const f = fixture();
  f.server({ type: 'exit', status: 'stopped', exitCode: 0, reason: '已等待输入 5 分钟，程序已自动停止。' });
  assert.equal(f.runtime.snapshot().state, 'finished');
  assert(f.runtime.snapshot().windows.terminal.visible);
  assert(f.runtime.snapshot().output.some((part) => part.text.includes('已等待输入 5 分钟')));
  f.runtime.dispose();
});
