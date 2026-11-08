const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { before, after, it } = require('node:test');
const { build } = require('esbuild');
const { WebSocketServer } = require('ws');
const stylus = require('stylus');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { playwright = require(location); break; } catch { /* optional local runtime */ }
}
const executablePath = [playwright?.chromium.executablePath(),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
  .find((entry) => entry && fs.existsSync(entry));
const root = path.resolve(__dirname, '..');
let browser; let server; let origin; let wss;
const clients = [];
const received = [];
const heartbeats = [];
const send = (client, msg) => client.send(JSON.stringify(msg));
const wait = async (fn) => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); } assert.fail('condition timed out'); };
before(async () => {
  assert(executablePath, 'Chromium must be installed to check the runtime UI');
  const bundle = (await build({ absWorkingDir: root, stdin: { contents: "export * from './packages/ui-default/components/ide'; export * from './packages/ui-default/components/live_share/ide'; import './packages/ui-default/components/form/form.page';", resolveDir: root },
    write: false, bundle: true, format: 'iife', globalName: 'Ide',
    plugins: [{ name: 'real-global-form-guard', setup(build) {
      build.onResolve({ filter: /^vj\/(misc\/Page|utils)$/ }, (args) => ({ path: args.path, namespace: 'guard-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'guard-fixture' }, (args) => ({ contents: args.path === 'vj/utils'
        ? 'export const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms)); export const request = {get(){throw new Error("Unexpected capacity request")},post(){throw new Error("Unexpected capacity release")}};'
        : 'export class AutoloadPage { constructor(name, setup) { setup(); } }' }));
    } }],
  })).outputFiles[0].text;
  const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/ide_runtime.page.styl'), 'utf8'));
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); return; }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#eef3f4;font-family:system-ui}#app{position:relative;height:100vh}.bar{height:50px;padding:0 20px;display:flex;align-items:center}#code{width:80%;height:80%;border:0;background:#f5faf8;font:16px monospace}${css}</style>
      <div id="app"><div class="bar">在线IDE · 程序窗口</div><textarea id="code">print('你好')</textarea></div>
      <script src="/bundle.js"></script><script>
      window.commands=[];window.snapshots=[];
      const teacher=location.search.includes('teacher');
      window.runtime=teacher?null:Ide.createIdeRuntime({url:'/ide/conn',source:()=>({code:document.querySelector('#code').value,lang:'py.py3'})});
      window.view=Ide.createIdeView(document.querySelector('#app'),{shared:teacher,onCommand:c=>{commands.push(c);if(runtime)runtime.command(c)}});
      if(runtime){Ide.setActiveIdeRuntime(runtime);runtime.subscribe(s=>{view.render(s);snapshots.push(JSON.parse(JSON.stringify(s)))})}
      </script>`);
  });
  wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => { clients.push(ws); ws.on('message', (raw) => {
    if (raw.toString() === 'pong') heartbeats.push(ws);
    else received.push({ ws, data: JSON.parse(raw) });
  }); send(ws, { type: 'ready', limits: {}, languages: ['py.py3', 'cc.cc17'] }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); wss?.clients.forEach((ws) => ws.terminate()); await new Promise((r) => server?.close(r)); });
async function owner() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const count = clients.length;
  await page.goto(origin); await page.waitForFunction(() => runtime.snapshot().ready);
  await wait(() => clients.length > count);
  return { page, ws: clients.at(-1), errors };
}
async function run(page, ws) {
  await page.evaluate(() => runtime.command({ type: 'run' }));
  await wait(() => received.some((v) => v.ws === ws && v.data.type === 'run'));
  return received.filter((v) => v.ws === ws && v.data.type === 'run').at(-1).data.runId;
}
it('opens runtime windows on the right, fits both without overlap and preserves a manually arranged position', async () => {
  const { page, ws, errors } = await owner(); const runId = await run(page, ws);
  send(ws, { type: 'state', runId, seq: 1, state: 'running' });
  send(ws, { type: 'output', runId, seq: 2, stream: 'stdout', text: '右侧终端' });
  const terminal = page.locator('.ide-window--terminal'); const graphics = page.locator('.ide-window--graphics');
  await terminal.waitFor({ state: 'visible' });
  assert((await terminal.boundingBox()).x > 1280 * .45, 'output leaves the left code area visible');
  assert((await terminal.boundingBox()).y < 90, 'single terminal starts below the toolbar, not near the bottom');
  await page.screenshot({ path: '/tmp/onebyone-ide-default-window.png' });
  send(ws, { type: 'turtle', runId, seq: 3, commands: [{ op: 'screen', width: 640, height: 480 }] });
  await graphics.waitFor({ state: 'visible' });
  for (const height of [800, 650]) {
    await page.setViewportSize({ width: 1280, height });
    await page.waitForTimeout(50);
    const a = await terminal.boundingBox(); const b = await graphics.boundingBox();
    assert(a.x > 1280 * .4 && b.x > 1280 * .4, 'both windows stay on the right');
    assert(b.y + b.height + 10 <= a.y, 'drawing and terminal remain separated');
    assert(a.y + a.height <= height - 15 && b.y >= 64, 'windows remain inside the available viewport');
  }
  const before = await graphics.boundingBox(); const terminalBefore = await terminal.boundingBox();
  const title = await page.locator('[data-ide-drag="graphics"]').boundingBox();
  await page.mouse.move(title.x + 100, title.y + 20); await page.mouse.down();
  await page.mouse.move(title.x - 20, title.y + 40, { steps: 5 }); await page.mouse.up();
  const moved = await graphics.boundingBox(); const terminalAfter = await terminal.boundingBox();
  assert(moved.x < before.x - 100, 'the teacher or learner can move the window away from the default');
  assert(Math.abs(moved.height - before.height) < 1 && Math.abs(terminalAfter.height - terminalBefore.height) < 1,
    'taking over a fitted layout does not jump either window size');
  assert(Math.abs(terminalAfter.y - terminalBefore.y) < 1, `the other window stays in place during dragging: ${terminalAfter.y} versus ${terminalBefore.y}`);
  const placement = await page.evaluate(() => ({ ...runtime.snapshot().windows.graphics }));
  send(ws, { type: 'exit', runId, seq: 4, exitCode: 0, status: 'Accepted' });
  await page.waitForFunction(() => runtime.snapshot().state === 'finished');
  await run(page, ws);
  const next = await page.evaluate(() => runtime.snapshot().windows.graphics);
  for (const key of ['x', 'y', 'width', 'height']) assert.equal(next[key], placement[key], `${key} survives the next run`);
  assert.deepEqual(errors, []);
  await page.close();
});
it('opens terminal only for real output, streams Chinese and accepts repeated input without IME double send', async () => {
  const { page, ws, errors } = await owner();
  assert.equal(await page.locator('.ide-window:visible').count(), 0);
  const runId = await run(page, ws);
  send(ws, { type: 'state', runId, seq: 1, state: 'running' });
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.ide-window:visible').count(), 0);
  send(ws, { type: 'output', runId, seq: 2, stream: 'stdout', text: '你好，' });
  send(ws, { type: 'output', runId, seq: 3, stream: 'stdout', text: '请输入名字：' });
  send(ws, { type: 'input-request', runId, seq: 4, prompt: '请输入名字：' });
  await page.waitForFunction(() => document.querySelector('.ide-terminal__output').textContent.includes('你好，请输入名字：'));
  const input = page.getByRole('textbox', { name: '终端输入' });
  await input.fill('小明');
  await input.evaluate((el) => el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await input.press('Enter');
  assert.equal(received.filter((v) => v.ws === ws && v.data.type === 'input').length, 0);
  await input.evaluate((el) => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await input.press('Enter');
  await wait(() => received.some((v) => v.ws === ws && v.data.type === 'input'));
  send(ws, { type: 'input-end', runId, seq: 5 });
  send(ws, { type: 'output', runId, seq: 6, stream: 'stdout', text: '年龄：' });
  send(ws, { type: 'input-request', runId, seq: 7 });
  await input.fill('9'); await input.press('Enter');
  await wait(() => received.filter((v) => v.ws === ws && v.data.type === 'input').length === 2);
  const inputs = received.filter((v) => v.ws === ws && v.data.type === 'input').map((v) => v.data);
  assert.deepEqual(inputs.map((v) => v.text), ['小明\n', '9\n']); assert(inputs[1].seq > inputs[0].seq);
  send(ws, { type: 'exit', runId, seq: 8, exitCode: 0, status: 'Accepted' });
  await page.waitForFunction(() => runtime.snapshot().state === 'finished');
  await page.locator('.ide-terminal__input-form').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.ide-terminal__input-form:visible').count(), 0);
  assert.equal(await page.locator('.ide-window--graphics:visible').count(), 0);
  assert.deepEqual(errors, []); await page.close();
});
it('preserves ordered turtle updates, fixed world coordinates and shared view commands without second execution', async () => {
  const { page, ws, errors } = await owner(); const runId = await run(page, ws);
  const primitives = [
    { op: 'screen', width: 800, height: 600, bg: '#fff', title: '我的海龟', world: [-400, -300, 400, 300] },
    { op: 'line', id: 1, turtle: 1, x1: 0, y1: 0, x2: 100, y2: 50, width: 4, color: 'green' },
    { op: 'turtle', id: 1, x: 100, y: 50, heading: 45, visible: true, shape: 'turtle', pencolor: '#245948', fillcolor: '#77b9a0', scale: [1, 1] },
  ];
  send(ws, { type: 'state', runId, seq: 1, state: 'running' });
  send(ws, { type: 'turtle', runId, seq: 2, commands: primitives });
  await page.locator('.ide-window--graphics').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.ide-graphics__canvas line').count(), 0, 'tracer(0) waits for update');
  send(ws, { type: 'turtle', runId, seq: 3, commands: [{ op: 'update' }] });
  await page.waitForFunction(() => document.querySelectorAll('.ide-graphics__canvas line').length === 1);
  const line = page.locator('.ide-graphics__canvas line');
  assert.equal(await line.getAttribute('x1'), '400'); assert.equal(await line.getAttribute('y2'), '250');
  const teacher = await browser.newPage({ viewport: { width: 900, height: 650 } });
  const beforeCount = clients.length;
  await teacher.goto(`${origin}?teacher`);
  await teacher.evaluate((s) => view.render(s), await page.evaluate(() => runtime.snapshot()));
  assert.equal(clients.length, beforeCount, 'shared view never opens execution connection');
  assert.equal(await teacher.locator('.ide-graphics__canvas line').getAttribute('x2'), await line.getAttribute('x2'));
  await teacher.getByRole('button', { name: '停止学员的程序' }).click();
  assert.deepEqual(await teacher.evaluate(() => commands.at(-1)), { type: 'stop' });
  await page.getByRole('img', { name: '海龟绘图画布，点击后可使用键盘控制' }).click({ position: { x: 310, y: 230 } });
  const canvas = await page.locator('.ide-graphics__canvas').boundingBox();
  await page.mouse.move(canvas.x + 310, canvas.y + 230); await page.mouse.down();
  await page.mouse.move(canvas.x + 330, canvas.y + 240, { steps: 3 }); await page.mouse.up();
  await wait(() => received.some((v) => v.ws === ws && v.data.event?.action === 'drag'));
  assert.equal(received.find((v) => v.ws === ws && v.data.event?.action === 'drag').data.event.button, 1, 'pointermove uses the original mouse button');
  await page.keyboard.press('ArrowLeft');
  await wait(() => received.some((v) => v.ws === ws && v.data.type === 'turtle-event' && v.data.event.type === 'key'));
  const key = received.find((v) => v.ws === ws && v.data.type === 'turtle-event' && v.data.event.type === 'key').data;
  assert.equal(key.event.key, 'ArrowLeft');
  send(ws, { type: 'turtle', runId, seq: 4, commands: [{ op: 'clear', turtle: 1 }, { op: 'update' }] });
  await page.waitForFunction(() => document.querySelectorAll('.ide-graphics__canvas line').length === 0);
  assert.deepEqual(errors, []); await teacher.close(); await page.close();
});
it('drags, resizes, minimizes and restores windows; renders runtime requests safely', async () => {
  const { page, ws, errors } = await owner(); const runId = await run(page, ws);
  send(ws, { type: 'state', runId, seq: 1, state: 'running' });
  send(ws, { type: 'output', runId, seq: 2, stream: 'stdout', text: '<script>throw 1</script>\n' });
  const title = page.locator('[data-ide-drag="terminal"]'); await title.waitFor({ state: 'visible' });
  const before = await page.locator('.ide-window--terminal').boundingBox();
  const box = await title.boundingBox(); await page.mouse.move(box.x + 150, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 100, { steps: 5 }); await page.mouse.up();
  const moved = await page.locator('.ide-window--terminal').boundingBox(); assert(moved.x < before.x - 50); assert(moved.y > before.y);
  const grip = await page.locator('[data-ide-resize="terminal"]').boundingBox();
  await page.mouse.move(grip.x + 8, grip.y + 8); await page.mouse.down(); await page.mouse.move(grip.x + 108, grip.y + 68, { steps: 5 }); await page.mouse.up();
  const sized = await page.locator('.ide-window--terminal').boundingBox(); assert(sized.width > before.width + 50);
  await page.locator('.ide-window--terminal').getByRole('button', { name: '收起窗口' }).click();
  await page.getByRole('button', { name: '展开运行终端' }).click();
  await page.locator('.ide-window--terminal').getByRole('button', { name: '最大化或还原' }).click();
  await page.waitForFunction(() => document.querySelector('.ide-window--terminal').getBoundingClientRect().width > 1200);
  assert.equal(await page.locator('.ide-terminal__output script').count(), 0);
  send(ws, { type: 'turtle', runId, seq: 3, commands: [{ op: 'screen', width: 640, height: 480 }, { op: 'request', id: 9, kind: 'text', title: '名字', prompt: '你叫什么名字？' }] });
  await page.getByRole('textbox', { name: '你叫什么名字？' }).fill('小红'); await page.getByRole('button', { name: '确定', exact: true }).click();
  await wait(() => received.some((v) => v.ws === ws && v.data.type === 'turtle-event' && v.data.event.type === 'response'));
  assert.equal(received.find((v) => v.ws === ws && v.data.event?.type === 'response').data.event.value, '小红');
  send(ws, { type: 'turtle', runId, seq: 4, commands: [{ op: 'close' }, { op: 'request', id: 10, kind: 'text', prompt: '独立输入' }] });
  await page.getByRole('textbox', { name: '独立输入' }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.ide-window--graphics:visible').count(), 0, 'textinput alone never creates an empty turtle canvas');
  await page.getByRole('button', { name: '取消输入' }).click();
  assert.deepEqual(errors, []); await page.close();
});
it('does not replay old output, auto-rerun after disconnect, or force empty windows', async () => {
  const { page, ws } = await owner(); const runId = await run(page, ws);
  send(ws, { type: 'state', runId, seq: 1, state: 'running' });
  send(ws, { type: 'exit', runId, seq: 2, exitCode: 0, status: 'Accepted' });
  await page.waitForFunction(() => runtime.snapshot().state === 'finished');
  assert.equal(await page.locator('.ide-window:visible').count(), 0);
  await page.evaluate(() => runtime.command({ type: 'run' }));
  await wait(() => received.filter((v) => v.ws === ws && v.data.type === 'run').length === 2);
  const freshId = received.filter((v) => v.ws === ws && v.data.type === 'run').at(-1).data.runId;
  send(ws, { type: 'output', runId, seq: 9, text: 'stale previous run' });
  send(ws, { type: 'output', runId: freshId, seq: 2, text: 'fresh run' });
  send(ws, { type: 'output', runId: freshId, seq: 1, text: 'out of order' });
  await page.waitForFunction(() => runtime.snapshot().output.some((part) => part.text.includes('fresh run')));
  await page.waitForFunction(() => document.querySelector('.ide-terminal__output').textContent === 'fresh run');
  ws.close(); await page.waitForFunction(() => runtime.snapshot().state === 'disconnected');
  const connectionCount = clients.length; await page.waitForTimeout(150);
  assert.equal(clients.length, connectionCount);
  await page.evaluate(() => runtime.command({ type: 'run' }));
  await wait(() => clients.length > connectionCount);
  await wait(() => received.some((v) => v.ws === clients.at(-1) && v.data.type === 'run'));
  await page.close();
});
it('shares one real runtime with a differently sized teacher viewport and rejects duplicate, stale and disconnected controls', async () => {
  const { page, ws, errors } = await owner();
  const teacher = await browser.newPage({ viewport: { width: 940, height: 700 } });
  const teacherErrors = []; teacher.on('pageerror', (e) => teacherErrors.push(e.message));
  const count = clients.length;
  await teacher.goto(`${origin}?teacher`);
  await page.exposeFunction('relayToTeacher', (message) => teacher.evaluate((data) => window.shareViewer?.receive(data), message));
  await teacher.exposeFunction('relayToStudent', (message) => page.evaluate((data) => window.shareSource?.receiveCommand(data), message));
  await teacher.evaluate(() => {
    view.dispose();
    const host = document.createElement('div'); host.id = 'teacher-stage';
    host.style.cssText = 'position:relative; width:1280px; height:800px; transform:scale(.7);transform-origin:top left;';
    document.querySelector('#app').replaceChildren(host);
    window.teacherCommands = [];
    window.shareViewer = Ide.attachViewerIde({ pageId: 'ide-page-1', container: host, sendCommand: (data) => { teacherCommands.push(data); void relayToStudent(data); } });
    shareViewer.setConnected(true);
  });
  await page.evaluate(() => {
    window.shareAcks = [];
    window.shareSource = Ide.attachSourceIde({ pageId: 'ide-page-1', send: (data) => { void relayToTeacher(data); return true; }, sendAck: (data) => shareAcks.push(data) });
    shareSource.setConnected(true);
  });
  await teacher.getByRole('button', { name: '运行学员的代码' }).click();
  await wait(() => received.some((v) => v.ws === ws && v.data.type === 'run'));
  const runId = received.find((v) => v.ws === ws && v.data.type === 'run').data.runId;
  assert.equal(clients.length, count, 'teacher runs only the learner process');
  send(ws, { type: 'state', runId, seq: 0, state: 'running' });
  send(ws, { type: 'turtle', runId, seq: 1, commands: [
    { op: 'screen', width: 800, height: 600, bg: '#fff', title: '同步绘图', world: [-400, -300, 400, 300] },
    { op: 'line', id: 1, turtle: 1, x1: -20, y1: 10, x2: 100, y2: 100, color: 'blue', width: 4 }, { op: 'update' },
  ] });
  send(ws, { type: 'output', runId, seq: 2, stream: 'stdout', text: '同步输入：' });
  send(ws, { type: 'input-request', runId, seq: 3 });
  await teacher.waitForFunction(() => document.querySelector('.ide-terminal__output')?.textContent === '同步输入：');
  await teacher.waitForFunction(() => document.querySelectorAll('.ide-graphics__canvas line').length === 1);
  const hostTop = await teacher.locator('[data-ide-runtime]').evaluate((el) => el.getBoundingClientRect().top);
  await page.evaluate(() => { document.querySelector('#app').style.transform = 'translateY(24px)'; });
  await teacher.waitForFunction((before) => document.querySelector('[data-ide-runtime]').getBoundingClientRect().top > before + 15, hostTop);
  const learnerWindow = await page.locator('.ide-window--terminal').boundingBox();
  const teacherWindow = await teacher.locator('.ide-window--terminal').boundingBox();
  assert(Math.abs(teacherWindow.width / learnerWindow.width - .7) < .01, 'window has source logical size and scales as one surface');
  const input = teacher.getByRole('textbox', { name: '终端输入' });
  await input.pressSequentially('teacher input', { delay: 60 });
  await teacher.waitForTimeout(300);
  assert.equal(await input.textContent(), 'teacher input', 'earlier shared acknowledgements cannot erase local typing');
  await page.waitForFunction(() => document.querySelector('.ide-terminal__input').textContent === 'teacher input');
  const inlinePosition = (el) => {
    const input = el.querySelector('.ide-terminal__input'); const output = el.querySelector('.ide-terminal__output');
    const inputRect = input.getClientRects()[0]; const outputRect = output.getClientRects()[0];
    return { x: inputRect.left - outputRect.left, y: inputRect.top - outputRect.top };
  };
  const ownerInput = await page.locator('.ide-terminal__console').evaluate(inlinePosition);
  const viewerInput = await teacher.locator('.ide-terminal__console').evaluate(inlinePosition);
  assert(Math.abs(viewerInput.x / .7 - ownerInput.x) < 1 && Math.abs(viewerInput.y / .7 - ownerInput.y) < 1,
    'teacher input remains at the same prompt position after viewport scaling');
  await input.press('Enter');
  await wait(() => received.filter((v) => v.ws === ws && v.data.type === 'input').length === 1);
  assert.equal(received.find((v) => v.ws === ws && v.data.type === 'input').data.text, 'teacher input\n');
  const transmitted = await teacher.evaluate(() => teacherCommands.find((data) => data.command.type === 'input'));
  await page.evaluate((data) => { shareSource.receiveCommand(data); shareSource.receiveCommand({ ...data, id: 'stale_command_test', runId: 'old_run' }); }, transmitted);
  await page.waitForTimeout(100);
  assert.equal(received.filter((v) => v.ws === ws && v.data.type === 'input').length, 1, 'duplicate and old-run input never repeats');
  await teacher.locator('.ide-window--terminal').getByRole('button', { name: '收起窗口' }).click();
  await page.locator('.ide-window--terminal').waitFor({ state: 'hidden' });
  await teacher.getByRole('img', { name: '海龟绘图画布，点击后可使用键盘控制' }).click({ position: { x: 280, y: 210 } });
  await teacher.keyboard.press('ArrowRight');
  await wait(() => received.some((v) => v.ws === ws && v.data.event?.key === 'ArrowRight'));
  send(ws, { type: 'turtle', runId, seq: 4, commands: [{ op: 'request', id: 29, kind: 'text', title: '绘图标题', prompt: '写一句话' }] });
  const dialogField = teacher.getByRole('textbox', { name: '写一句话' }); await dialogField.waitFor({ state: 'visible' });
  await dialogField.pressSequentially('teacher label', { delay: 35 });
  await page.waitForFunction(() => document.querySelector('.ide-graphics__dialog-input').value === 'teacher label');
  assert.equal(await dialogField.inputValue(), 'teacher label', 'old shared acknowledgements do not overwrite a local dialog draft');
  await dialogField.fill('一起学习');
  await dialogField.evaluate((el) => el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await dialogField.press('Enter');
  assert.equal(received.filter((v) => v.ws === ws && v.data.event?.type === 'response').length, 0, 'IME candidate confirmation does not answer the turtle dialog');
  await dialogField.evaluate((el) => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await page.waitForFunction(() => document.querySelector('.ide-graphics__dialog-input').value === '一起学习');
  await dialogField.press('Enter');
  await wait(() => received.some((v) => v.ws === ws && v.data.event?.type === 'response'));
  assert.equal(received.find((v) => v.ws === ws && v.data.event?.type === 'response').data.event.value, '一起学习');
  await teacher.getByRole('button', { name: '停止学员的程序' }).click();
  await wait(() => received.some((v) => v.ws === ws && v.data.type === 'stop'));
  const stoppedCount = received.filter((v) => v.ws === ws && v.data.type === 'stop').length;
  await page.evaluate((data) => { shareSource.setConnected(false); shareSource.receiveCommand({ ...data, id: 'disconnected_command', command: { type: 'stop' } }); }, transmitted);
  await page.waitForTimeout(100);
  assert.equal(received.filter((v) => v.ws === ws && v.data.type === 'stop').length, stoppedCount);
  assert.deepEqual(errors, []); assert.deepEqual(teacherErrors, []);
  await page.evaluate(() => shareSource.dispose()); await teacher.evaluate(() => shareViewer.dispose());
  await teacher.close(); await page.close();
});
it('keeps a running process stoppable after nonfatal input errors and preserves overlong Chinese input', async () => {
  const { page, ws } = await owner(); const runId = await run(page, ws);
  send(ws, { type: 'state', runId, seq: 0, state: 'running' });
  send(ws, { type: 'input-request', runId, seq: 1 });
  const input = page.getByRole('textbox', { name: '终端输入' }); await input.fill('汉'.repeat(5500)); await input.press('Enter');
  await page.waitForFunction(() => runtime.snapshot().inputErrorSeq === 1);
  await page.waitForFunction(() => document.querySelector('.ide-terminal__input').textContent.length === 5500);
  assert.equal(received.filter((v) => v.ws === ws && v.data.type === 'input').length, 0);
  assert.equal(await page.evaluate(() => runtime.snapshot().state), 'waiting-input');
  send(ws, { type: 'error', runId, code: 'RATE_LIMIT', message: '操作过快', fatal: false });
  await page.waitForFunction(() => runtime.snapshot().message === '操作过快');
  assert.equal(await page.evaluate(() => runtime.snapshot().state), 'waiting-input');
  await page.evaluate(() => runtime.command({ type: 'stop' }));
  await wait(() => received.some((v) => v.ws === ws && v.data.type === 'stop'));
  await page.close();
});
it('readonly broadcasts show only source runtime windows and never an extra run shortcut', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}?teacher`);
    await page.evaluate(() => {
      view.dispose(); window.viewerCommands = [];
      window.viewer = Ide.attachViewerIde({ pageId: 'readonly-page', container: document.querySelector('#app'), readOnly: true,
        sendCommand(command) { viewerCommands.push(command); } });
      viewer.setConnected(true);
      window.sequence = 0;
      window.receiveState = (snapshot) => viewer.receive({ type: 'ide', sequence: ++sequence, index: 0, total: 1,
        chunk: JSON.stringify({ reset: true, snapshot, rect: { x: 0, y: 0, width: 1000, height: 700 } }) });
    });
    assert.equal(await page.locator('.ide-runtime__shared-run').count(), 0);
    assert.equal(await page.locator('[data-ide-runtime]:visible').count(), 0);
    await page.evaluate(() => receiveState(null));
    assert.equal(await page.locator('[data-ide-runtime]:visible').count(), 0);
    await page.evaluate(() => receiveState(Ide.emptyIdeSnapshot()));
    assert.equal(await page.locator('.ide-window:visible, .ide-runtime__dock-button:visible').count(), 0, 'idle source produces no controls or windows');
    await page.evaluate(() => {
      const state = Ide.emptyIdeSnapshot(); state.windows.terminal.visible = true;
      state.output = [{ stream: 'stdout', text: '老师运行中的输出' }]; receiveState(state);
    });
    await page.locator('.ide-window--terminal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.ide-terminal__output').textContent(), '老师运行中的输出');
    await page.evaluate(() => document.querySelector('[aria-label="收起窗口"]').click());
    assert.deepEqual(await page.evaluate(() => viewerCommands), [], 'readonly runtime cannot forward commands');
    await page.evaluate(() => receiveState(null));
    assert.equal(await page.locator('[data-ide-runtime]:visible').count(), 0, 'source removal hides all runtime UI');
  } finally { await page.close(); }
});

it('rejects malformed shared snapshots without DOM errors or poisoning later valid sequence numbers', async () => {
  const teacher = await browser.newPage(); const errors = []; teacher.on('pageerror', (e) => errors.push(e.message));
  await teacher.goto(`${origin}?teacher`);
  const result = await teacher.evaluate(() => {
    view.dispose();
    const host = document.querySelector('#app');
    const viewer = Ide.attachViewerIde({ pageId: 'malformed-page', container: host, sendCommand() {} });
    viewer.setConnected(true);
    const state = Ide.emptyIdeSnapshot(); state.windows.terminal.visible = true; state.fontSize = 26;
    state.output = [{ stream: 'stdout', text: 'safe output' }];
    const rect = { x: 0, y: 0, width: 1000, height: 700 };
    function receive(snapshot, sequence, rest = {}) {
      const chunk = JSON.stringify({ reset: true, snapshot, rect, ...rest });
      viewer.receive({ type: 'ide', sequence, index: 0, total: 1, chunk });
    }
    receive(state, 1);
    const before = document.querySelector('.ide-terminal__output').textContent;
    const patches = [
      { screen: { ...state.screen, width: -1 } }, { screen: { ...state.screen, world: [1, 1, 1, 1] } },
      { windows: { terminal: { ...state.windows.terminal, x: 99 }, graphics: state.windows.graphics } },
      { primitives: [{ id: 1, turtle: 1, op: 'polygon', points: 'bad', fill: 'red', stroke: 'red', width: 1 }] },
      { turtles: [null] }, { output: [{ stream: 'html', text: '<img onerror="alert(1)">' }] },
      { shapes: { bad: 'not points' } }, { request: { op: 'request', id: 1, kind: 'eval' } },
      { fontSize: 9 }, { fontSize: 41 }, { fontSize: '24' }, { fontSize: null },
    ];
    for (const patch of patches) receive({ ...state, ...patch }, 100);
    viewer.receive({ type: 'ide', sequence: 100, index: 0, total: 1, chunk: 'null' });
    receive({ revision: 1 }, 100, { reset: false, base: 0, upsert: [null], remove: [] });
    const after = document.querySelector('.ide-terminal__output').textContent;
    const fontAfterRejected = getComputedStyle(document.querySelector('.ide-terminal__output')).fontSize;
    receive({ ...state, revision: 2, output: [{ stream: 'stdout', text: 'new valid output' }] }, 2);
    const valid = document.querySelector('.ide-terminal__output').textContent;
    const legacy = { ...state, revision: 3 }; delete legacy.fontSize;
    receive(legacy, 3);
    const legacyFont = getComputedStyle(document.querySelector('.ide-terminal__input')).fontSize;
    viewer.setConnected(false); viewer.setConnected(true);
    receive({ ...state, revision: 3, output: [{ stream: 'stdout', text: 'reconnected output' }] }, 0);
    const reconnect = document.querySelector('.ide-terminal__output').textContent;
    viewer.dispose(); return { before, after, valid, reconnect, fontAfterRejected, legacyFont };
  });
  assert.deepEqual(result, { before: 'safe output', after: 'safe output', valid: 'new valid output', reconnect: 'reconnected output', fontAfterRejected: '26px', legacyFont: '14px' });
  assert.deepEqual(errors, []); await teacher.close();
});

it('answers Hydro text heartbeats without interrupting a running or waiting program', async () => {
  const { page, ws, errors } = await owner();
  ws.send('ping');
  await wait(() => heartbeats.filter((peer) => peer === ws).length === 1);
  assert.equal(await page.evaluate(() => runtime.snapshot().state), 'idle');
  assert.equal(await page.locator('.ide-window:visible').count(), 0);
  const runId = await run(page, ws);
  send(ws, { type: 'state', runId, seq: 0, state: 'running' });
  send(ws, { type: 'input-request', runId, seq: 1 });
  await page.waitForFunction(() => runtime.snapshot().state === 'waiting-input');
  ws.send('ping'); ws.send('pong'); ws.send('ping');
  await wait(() => heartbeats.filter((peer) => peer === ws).length === 3);
  assert.deepEqual(await page.evaluate(() => ({ state: runtime.snapshot().state, runId: runtime.snapshot().runId,
    inputPending: runtime.snapshot().inputPending, ready: runtime.snapshot().ready })),
  { state: 'waiting-input', runId, inputPending: true, ready: true });
  await page.getByRole('textbox', { name: '终端输入' }).fill('心跳后继续');
  await page.getByRole('textbox', { name: '终端输入' }).press('Enter');
  await wait(() => received.some((v) => v.ws === ws && v.data.type === 'input'));
  assert.equal(received.find((v) => v.ws === ws && v.data.type === 'input').data.text, '心跳后继续\n');
  assert.equal(received.filter((v) => v.ws === ws && v.data.type === 'run').length, 1);
  assert.equal(received.filter((v) => v.ws === ws && v.data.type === 'stop').length, 0);
  assert.deepEqual(errors, []); await page.close();
});
it('bypasses the real global five-second form lock for consecutive terminal lines and turtle dialogs', async () => {
  const { page, ws, errors } = await owner();
  const guard = await page.evaluate(() => {
    const button = document.createElement('button'); button.type = 'submit'; document.body.append(button);
    const first = new MouseEvent('click', { bubbles: true, cancelable: true }); button.dispatchEvent(first);
    const second = new MouseEvent('click', { bubbles: true, cancelable: true }); button.dispatchEvent(second);
    button.remove(); return [first.defaultPrevented, second.defaultPrevented];
  });
  assert.deepEqual(guard, [false, true], 'fixture executes the actual form.page.ts lock');
  const runId = await run(page, ws);
  send(ws, { type: 'state', runId, seq: 0, state: 'running' });
  const input = page.getByRole('textbox', { name: '终端输入' });
  for (let index = 1; index <= 2; index++) {
    send(ws, { type: 'input-request', runId, seq: index });
    await input.fill(String(index)); await input.press('Enter');
    await wait(() => received.filter((v) => v.ws === ws && v.data.type === 'input').length === index);
  }
  for (let index = 1; index <= 2; index++) {
    send(ws, { type: 'turtle', runId, seq: index + 2, commands: [{ op: 'request', id: index, kind: 'text', title: '连续输入', prompt: `问题${index}` }] });
    const field = page.getByRole('textbox', { name: `问题${index}` });
    await field.fill(`答案${index}`);
    if (index === 1) await field.press('Enter'); else await page.getByRole('button', { name: '确定', exact: true }).click();
    await wait(() => received.filter((v) => v.ws === ws && v.data.event?.type === 'response').length === index);
  }
  assert.deepEqual(received.filter((v) => v.ws === ws && v.data.type === 'input').map((v) => v.data.text), ['1\n', '2\n']);
  assert.deepEqual(received.filter((v) => v.ws === ws && v.data.event?.type === 'response').map((v) => v.data.event.value), ['答案1', '答案2']);
  assert.deepEqual(errors, []); await page.close();
});

it('edits directly after the output prompt, wraps long Chinese lines and sends pasted multiline data as plain text', async () => {
  const { page, ws, errors } = await owner(); const runId = await run(page, ws);
  send(ws, { type: 'state', runId, seq: 0, state: 'running' });
  send(ws, { type: 'output', runId, seq: 1, stream: 'stdout', text: '请输入你的名字：' });
  send(ws, { type: 'input-request', runId, seq: 2 });
  const input = page.getByRole('textbox', { name: '终端输入' }); await input.fill('小明');
  const position = await page.evaluate(() => {
    const output = document.querySelector('.ide-terminal__output'); const input = document.querySelector('.ide-terminal__input');
    const a = output.getClientRects()[0]; const b = input.getClientRects()[0];
    return { topDifference: b.top - a.top, gap: b.left - a.right, border: getComputedStyle(input.parentElement).borderTopWidth };
  });
  assert(Math.abs(position.topDifference) < 1 && Math.abs(position.gap) < 1, 'cursor and draft start immediately at the prompt end');
  assert.equal(position.border, '0px', 'there is no separate input panel');
  await page.screenshot({ path: '/tmp/ide-inline-terminal.png' });
  await input.fill('x'); await input.press('Backspace');
  assert.equal(await input.textContent(), ''); assert(await input.isVisible(), 'clearing the draft leaves a focusable caret target');
  await input.fill('中文'.repeat(65));
  const wrap = await input.evaluate((el) => {
    const range = document.createRange(); range.selectNodeContents(el);
    const rows = [...range.getClientRects()]; const console = el.closest('.ide-terminal__console');
    return { lines: new Set(rows.map((r) => Math.round(r.top))).size, overflow: console.scrollWidth - console.clientWidth,
      firstTop: rows[0].top, outputTop: document.querySelector('.ide-terminal__output').getClientRects()[0].top };
  });
  assert(wrap.lines >= 3 && wrap.overflow <= 1, 'long Chinese input wraps inside the terminal without horizontal overflow');
  assert(Math.abs(wrap.firstTop - wrap.outputTop) < 1, 'long drafts still start beside the prompt');
  await input.fill('');
  await input.evaluate((el) => {
    el.focus(); const selection = getSelection(); const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    selection.removeAllRanges(); selection.addRange(range);
    const data = new DataTransfer(); data.setData('text/plain', '1\n2\n3'); data.setData('text/html', '<img src=x onerror="throw 1">');
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  });
  assert.equal(await input.textContent(), '1\n2\n3');
  assert.equal(await input.locator('img').count(), 0);
  await input.press('Enter'); await wait(() => received.some((v) => v.ws === ws && v.data.type === 'input'));
  assert.equal(received.find((v) => v.ws === ws && v.data.type === 'input').data.text, '1\n2\n3\n');
  await page.waitForFunction(() => document.querySelector('.ide-terminal__output').textContent === '请输入你的名字：1\n2\n3\n');
  send(ws, { type: 'output', runId, seq: 3, stream: 'stdout', text: '下一个：' });
  send(ws, { type: 'input-request', runId, seq: 4 });
  await input.fill('4'); await input.press('Enter');
  await wait(() => received.filter((v) => v.ws === ws && v.data.type === 'input').length === 2);
  assert.equal(received.filter((v) => v.ws === ws && v.data.type === 'input').at(-1).data.text, '4\n');
  assert.deepEqual(errors, []); await page.close();
});
