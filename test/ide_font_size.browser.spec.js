const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');
const stylus = require('stylus');
const { WebSocketServer } = require('ws');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { playwright = require(location); break; } catch { /* Optional local runtime. */ }
}
const executablePath = [playwright?.chromium.executablePath(),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
  .find((entry) => entry && fs.existsSync(entry));
const root = path.resolve(__dirname, '..');
const monacoFolder = path.join(root, 'node_modules/monaco-editor/min/vs');
let browser; let server; let origin; let wss;
before(async () => {
  assert(executablePath, 'Chromium is required for real Monaco checks');
  const bundle = (await esbuild.build({ absWorkingDir: root, stdin: { contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import Editor from './packages/ui-default/components/scratchpad/ScratchpadEditorContainer';
    import Control from './packages/ui-default/components/ide/IdeFontSizeControl';
    import { createIdeRuntime, setActiveIdeRuntime } from './packages/ui-default/components/ide/runtime';
    import { createIdeView } from './packages/ui-default/components/ide/view';
    export * from './packages/ui-default/components/live_share/editor';
    export * from './packages/ui-default/components/live_share/ide';
    export * from './packages/ui-default/components/ide/fontSize';
    function App() {
      const [code,setCode]=React.useState('print("hello")'); window.changeCode=setCode;
      return <><div id="toolbar">主题：雾青 {UiContext.ideMode && <Control />}</div><div id="editor"><Editor value={code} language="python" settings={{fontSize:21}} handleUpdateCode={setCode}/></div></>;
    }
    createRoot(document.querySelector('#app')).render(<App/>);
    if (location.pathname === '/terminal') {
      window.runtime = createIdeRuntime({url:'/ide/conn', source:()=>({code:window.editor.getValue(),lang:'py.py3'})});
      window.runtimeView = createIdeView(document.body, {onCommand:runtime.command});
      runtime.subscribe(runtimeView.render); setActiveIdeRuntime(runtime);
    }
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', globalName: 'FontIde',
  plugins: [{ name: 'real-monaco-with-production-editor', setup(build) {
    build.onResolve({ filter: /^(vj\/context|vj\/utils|vj\/components\/monaco\/loader|react-redux|monaco-editor\/.*)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
    build.onResolve({ filter: /^\.\/themes$/ }, (args) => args.importer.endsWith('ScratchpadEditorContainer.tsx') ? { path: 'themes', namespace: 'fixture' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents:
      name === 'react-redux' ? 'export const connect=()=>component=>component;' :
      name === 'vj/utils' ? 'export const request={get(){throw new Error("Unexpected capacity request")},post(){throw new Error("Unexpected capacity release")}};' :
      name === 'vj/context' ? 'export const ctx={scratchpad:{init(){window.editorReady=true}}};' :
      name === 'vj/components/monaco/loader' ? 'export const load=async()=>({monaco:window.monaco,customOptions:{fontSize:21},registerAction:async editor=>editor.updateOptions({fontSize:21})});' :
      name === 'themes' ? "export const attachScratchpadMonacoTheme=()=>()=>{};export const currentScratchpadTheme=()=>({});export const scratchpadMonacoThemeName=()=> 'vs';" : 'module.exports=window.monaco;' }));
  } }],
  })).outputFiles[0].text;
  const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/ide_runtime.page.styl'), 'utf8'));
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/font.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); return; }
    if (url.pathname.startsWith('/vs/')) {
      const file = path.resolve(monacoFolder, url.pathname.slice(4));
      if (!file.startsWith(`${monacoFolder}${path.sep}`) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : file.endsWith('.ttf') ? 'font/ttf' : 'text/javascript');
      res.end(fs.readFileSync(file)); return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><style>body{margin:0}#toolbar{height:50px;display:flex;gap:12px;align-items:center;padding:0 20px}#editor{height:380px;width:720px}#shared{position:absolute;inset:0;width:900px;height:650px;pointer-events:none}${css}</style><div id="app"></div><div id="shared"></div>
      <script>window.UiContext={ideMode:${url.pathname !== '/question'},pdoc:{pid:'ide'}};window.UserContext={_id:${Number(url.searchParams.get('uid')) || 42},codeFontFamily:'monospace'};window.outbox=[];</script>
      <script src="/vs/loader.js"></script><script>require.config({paths:{vs:'/vs'}});require(['vs/editor/editor.main'],()=>{let script=document.createElement('script');script.src='/font.js';document.head.append(script)});</script>`);
  });
  wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    const send = (value) => ws.send(JSON.stringify(value));
    send({ type: 'ready', limits: {}, languages: ['py.py3'] });
    ws.on('message', (raw) => {
      if (raw.toString() === 'pong') return;
      const message = JSON.parse(raw.toString());
      if (message.type === 'run') {
        send({ type: 'state', runId: message.runId, seq: 0, state: 'running' });
        send({ type: 'output', runId: message.runId, seq: 1, stream: 'stdout', text: '你好，请输入名字：' });
        send({ type: 'input-request', runId: message.runId, seq: 2 });
      } else if (message.type === 'stop') {
        send({ type: 'exit', runId: message.runId, seq: 3, exitCode: 0, status: 'Accepted' });
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); wss?.clients.forEach((ws) => ws.terminate()); if (server) await new Promise((r) => server.close(r)); });
const font = (page) => page.evaluate(() => editor.getOption(monaco.editor.EditorOptions.fontInfo.id).fontSize);
const terminalFont = (page) => page.evaluate(() => ['.ide-terminal__output', '.ide-terminal__input']
  .map((selector) => Number.parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)));
it('changes real Monaco size, survives typing and reload, and isolates IDE preferences by account and from problem editor', async () => {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin); await page.waitForFunction(() => window.editorReady);
  assert.equal(await font(page), 14, 'IDE restores its value after normal editor action registration');
  await page.evaluate(() => localStorage.setItem('editor.config', '{"fontSize":21}'));
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '增大字号', exact: true }).click();
  assert.equal(await font(page), 24);
  await page.screenshot({ path: '/tmp/ide-font-size.png' });
  await page.evaluate(() => changeCode('print("new text")'));
  await page.waitForFunction(() => editor.getValue() === 'print("new text")');
  assert.equal(await font(page), 24, 'Redux settings application does not restore the old font size on every edit');
  await page.evaluate(() => monaco.editor.setTheme('vs-dark'));
  assert.equal(await font(page), 24);
  assert.equal(await page.evaluate(() => localStorage.getItem('editor.config')), '{"fontSize":21}');
  await page.reload(); await page.waitForFunction(() => window.editorReady); assert.equal(await font(page), 24);
  await page.goto(`${origin}/?uid=43`); await page.waitForFunction(() => window.editorReady); assert.equal(await font(page), 14);
  await page.goto(`${origin}/question`); await page.waitForFunction(() => window.editorReady);
  assert.equal(await page.getByRole('group', { name: '代码字号' }).count(), 0);
  assert.equal(await font(page), 21, 'problem editor keeps its existing font setting');
  assert.deepEqual(errors, []); await page.close();
});
it('uses the current IDE font in the teacher shared Monaco and restores the student preference on return', async () => {
  const student = await browser.newPage(); const teacher = await browser.newPage();
  await Promise.all([student.goto(origin), teacher.goto(`${origin}/?uid=99`)]);
  await Promise.all([student.waitForFunction(() => window.editorReady), teacher.waitForFunction(() => window.editorReady)]);
  await student.evaluate(() => { window.controller = FontIde.attachSourceEditors({ pageId: 'font-page', send: (msg) => outbox.push(msg) }); });
  await teacher.evaluate(() => {
    window.originalId = editor.getId(); window.controller = FontIde.attachViewerEditors({ pageId: 'font-page', container: document.querySelector('#shared'), send: (msg) => outbox.push(msg) });
    window.sharedEditor = () => monaco.editor.getEditors().find((value) => value.getId() !== originalId);
  });
  async function flush() {
    for (let round = 0; round < 8; round++) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      const a = await student.evaluate(() => outbox.splice(0)); const b = await teacher.evaluate(() => outbox.splice(0));
      await teacher.evaluate((messages) => messages.forEach((m) => controller.receive(m)), a);
      await student.evaluate((messages) => messages.forEach((m) => controller.receive(m)), b);
    }
  }
  await flush(); await teacher.waitForFunction(() => !!sharedEditor());
  for (let i = 0; i < 3; i++) await student.getByRole('button', { name: '增大字号', exact: true }).click();
  await flush();
  assert.equal(await font(student), 20);
  assert.equal(await teacher.evaluate(() => sharedEditor().getOption(monaco.editor.EditorOptions.fontInfo.id).fontSize), 20);
  assert.equal(await font(teacher), 14, 'teacher own editor preference is not overwritten');
  await teacher.evaluate(() => controller.dispose()); await student.evaluate(() => controller.dispose());
  await Promise.all([teacher.close(), student.close()]);
});

it('keeps terminal output and inline input at the real editor size before running, while waiting, after rerun and reload', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${origin}/terminal`);
    await page.waitForFunction(() => window.editorReady && runtime.snapshot().ready);
    for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '增大字号', exact: true }).click();
    assert.equal(await font(page), 24);
    assert.equal(await page.locator('.ide-window:visible').count(), 0, 'changing size does not open an unused terminal');
    await page.evaluate(() => runtime.command({ type: 'run' }));
    await page.waitForFunction(() => runtime.snapshot().state === 'waiting-input');
    assert.deepEqual(await terminalFont(page), [24, 24]);
    await page.getByRole('textbox', { name: '终端输入' }).fill('小明');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '增大字号', exact: true }).click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.ide-terminal__input')).fontSize === '30px');
    assert.equal(await font(page), 30); assert.deepEqual(await terminalFont(page), [30, 30]);
    assert.equal(await page.getByRole('textbox', { name: '终端输入' }).textContent(), '小明', 'resizing preserves pending input');
    await page.screenshot({ path: '/tmp/onebyone-ide-terminal-font.png' });
    await page.evaluate(() => runtime.command({ type: 'stop' }));
    await page.waitForFunction(() => runtime.snapshot().state === 'finished');
    await page.evaluate(() => runtime.command({ type: 'run' }));
    await page.waitForFunction(() => runtime.snapshot().state === 'waiting-input');
    assert.deepEqual(await terminalFont(page), [30, 30], 'new runs retain the chosen size');
    await page.reload(); await page.waitForFunction(() => window.editorReady && runtime.snapshot().ready);
    await page.evaluate(() => runtime.command({ type: 'run' }));
    await page.waitForFunction(() => runtime.snapshot().state === 'waiting-input');
    assert.equal(await font(page), 30); assert.deepEqual(await terminalFont(page), [30, 30], 'reload restores both sizes');
    await page.getByRole('button', { name: '代码字号 30，点击恢复默认', exact: true }).click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.ide-terminal__input')).fontSize === '14px');
    assert.equal(await font(page), 14); assert.deepEqual(await terminalFont(page), [14, 14]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

for (const readOnly of [false, true]) it(`mirrors the source terminal font in ${readOnly ? 'readonly broadcast' : 'teacher assistance'} without changing viewer preferences`, async () => {
  const source = await browser.newPage(); const viewer = await browser.newPage();
  const errors = []; source.on('pageerror', (error) => errors.push(error.message)); viewer.on('pageerror', (error) => errors.push(error.message));
  try {
    await Promise.all([source.goto(`${origin}/terminal`), viewer.goto(`${origin}/?uid=99`)]);
    await Promise.all([source.waitForFunction(() => window.editorReady && runtime.snapshot().ready), viewer.waitForFunction(() => window.editorReady)]);
    await source.exposeFunction('relayRuntime', (data) => viewer.evaluate((message) => window.runtimeViewer?.receive(message), data));
    await viewer.evaluate((readOnly) => {
      window.runtimeViewer = FontIde.attachViewerIde({ pageId: 'font-runtime', container: document.querySelector('#shared'), readOnly, sendCommand() {} });
      runtimeViewer.setConnected(true);
    }, readOnly);
    await source.evaluate(() => {
      window.runtimeSource = FontIde.attachSourceIde({ pageId: 'font-runtime', send(data) { void relayRuntime(data); return true; }, sendAck() {} });
      runtimeSource.setConnected(true);
    });
    for (let i = 0; i < 5; i++) await source.getByRole('button', { name: '增大字号', exact: true }).click();
    await source.evaluate(() => runtime.command({ type: 'run' }));
    await viewer.locator('.ide-window--terminal').waitFor({ state: 'visible' });
    await viewer.waitForFunction(() => getComputedStyle(document.querySelector('.ide-terminal__input')).fontSize === '24px');
    assert.deepEqual(await terminalFont(viewer), [24, 24]);
    assert.equal(await font(viewer), 14, 'incoming terminal state does not overwrite viewer code size');
    await viewer.evaluate(() => FontIde.setIdeFontSize(38));
    assert.deepEqual(await terminalFont(viewer), [24, 24], 'viewer local preference never resizes the source terminal');
    await source.getByRole('button', { name: '减小字号', exact: true }).click();
    await viewer.waitForFunction(() => getComputedStyle(document.querySelector('.ide-terminal__input')).fontSize === '22px');
    assert.deepEqual(await terminalFont(source), [22, 22]); assert.deepEqual(await terminalFont(viewer), [22, 22]);
    await viewer.evaluate(() => runtimeViewer.dispose());
    assert.equal(await font(viewer), 38, 'leaving shared view retains the viewer own preference');
    assert.deepEqual(errors, []);
  } finally { await Promise.all([source.close(), viewer.close()]); }
});
