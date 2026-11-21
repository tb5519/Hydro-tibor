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
  if (process.env.IDE_FONT_BROWSER !== 'webkit') assert(executablePath, 'Chromium is required for real Monaco checks');
  const bundle = (await esbuild.build({ absWorkingDir: root, stdin: { contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import Editor from './packages/ui-default/components/scratchpad/ScratchpadEditorContainer';
    import Control from './packages/ui-default/components/ide/IdeFontSizeControl';
    import { createIdeRuntime, setActiveIdeRuntime } from './packages/ui-default/components/ide/runtime';
    import { createIdeView } from './packages/ui-default/components/ide/view';
    import submitPage from './packages/ui-default/pages/problem_submit.page';
    export * from './packages/ui-default/components/live_share/editor';
    export * from './packages/ui-default/components/live_share/ide';
    export * from './packages/ui-default/components/ide/fontSize';
    function App() {
      const [code,setCode]=React.useState('print("hello")'); window.changeCode=setCode;
      const [settings,setSettings]=React.useState(()=>JSON.parse(localStorage.getItem('editor.config') || '{"fontSize":21}'));
      const setFontSize=(fontSize)=>{const next={...settings,fontSize};localStorage.setItem('editor.config',JSON.stringify(next));setSettings(next)};
      return <><div id="toolbar">主题：雾青 {UiContext.ideMode && <Control />}</div><div id="editor"><Editor value={code} language="python" settings={settings} setFontSize={setFontSize} handleUpdateCode={setCode}/></div></>;
    }
    createRoot(document.querySelector('#app')).render(<App/>);
    if(location.pathname === '/submit') submitPage.mount();
    if (location.pathname === '/terminal') {
      window.runtime = createIdeRuntime({url:'/ide/conn', source:()=>({code:window.editor.getValue(),lang:'py.py3'})});
      window.runtimeView = createIdeView(document.body, {onCommand:runtime.command});
      runtime.subscribe(runtimeView.render); setActiveIdeRuntime(runtime);
    }
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', globalName: 'FontIde',
  plugins: [{ name: 'real-monaco-with-production-editor', setup(build) {
    build.onResolve({ filter: /^(vj\/context|vj\/utils|vj\/misc\/Page|vj\/components\/languageselect|vj\/components\/monaco\/loader|react-redux|monaco-editor\/.*)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
    build.onResolve({ filter: /^\.\/themes$/ }, (args) => args.importer.endsWith('ScratchpadEditorContainer.tsx') ? { path: 'themes', namespace: 'fixture' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents:
      name === 'react-redux' ? 'export const connect=()=>component=>component;' :
      name === 'vj/misc/Page' ? 'export class NamedPage { constructor(names,mount){this.mount=mount} }' :
      name === 'vj/components/languageselect' ? 'export const renderLanguageSelect=()=>{}' :
      name === 'vj/utils' ? 'export const i18n=v=>v,tpl=()=>"",getAvailableLangs=()=>({}),request={get(){throw new Error("Unexpected capacity request")},post(){throw new Error("Unexpected capacity release")}};' :
      name === 'vj/context' ? 'export const ctx={scratchpad:{init(){window.editorReady=true}}};' :
      name === 'vj/components/monaco/loader' ? 'export const load=async()=>{const config={fontSize:21,...JSON.parse(localStorage.getItem("editor.config")||"{}")};return {monaco:window.monaco,customOptions:config,registerAction:async editor=>editor.updateOptions(config)}};' :
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
      ${url.pathname === '/submit' ? '<section name="submit_section"><form><textarea name="code" style="font-size:16px">answer</textarea></form></section>' : ''}
      <script>window.UiContext={ideMode:${!['/question','/submit'].includes(url.pathname)},pdoc:{pid:'ide',config:{type:'submit_answer'}}};window.UserContext={_id:${Number(url.searchParams.get('uid')) || 42},codeFontFamily:'monospace'};window.outbox=[];</script>
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
  browser = process.env.IDE_FONT_BROWSER === 'webkit'
    ? await playwright.webkit.launch({ headless: true })
    : await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); wss?.clients.forEach((ws) => ws.terminate()); if (server) await new Promise((r) => server.close(r)); });
const font = (page) => page.evaluate(() => editor.getOption(monaco.editor.EditorOptions.fontInfo.id).fontSize);
const terminalFont = (page) => page.evaluate(() => ['.ide-terminal__output', '.ide-terminal__input']
  .map((selector) => Number.parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)));
async function ctrlWheel(page, locator, deltaY) {
  await locator.hover();
  await page.keyboard.down('Control');
  try { await page.mouse.wheel(0, deltaY); } finally { await page.keyboard.up('Control'); }
}
async function macShortcuts(page) {
  await page.addInitScript(() => {
    if (!/Mac/.test(navigator.platform)) Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
  });
}
it('handles Mac Command keys, wheel and pinch only inside the online IDE, problem editor and submit field', async () => {
  const page = await browser.newPage();
  try {
    await macShortcuts(page);
    for (const path of ['/', '/question', '/submit']) {
      await page.goto(origin + path); await page.waitForFunction(() => window.editorReady);
      const selector = path === '/submit' ? 'textarea[name=code]' : '#editor .monaco-editor';
      const surface = page.locator(selector);
      const size = () => path === '/submit' ? surface.evaluate(node => parseFloat(getComputedStyle(node).fontSize)) : font(page);
      const initial = await size();
      if (path === '/submit') await surface.focus(); else await page.evaluate(() => editor.focus());
      await page.keyboard.press('Meta+=');
      assert.equal(await size(), initial + 2);
      await page.keyboard.press('Meta+-');
      assert.equal(await size(), initial);
      await page.evaluate(() => {
        window.trustedFontWheel = null;
        window.addEventListener('wheel', event => { window.trustedFontWheel = [event.isTrusted, event.metaKey, Math.sign(event.deltaY)]; },
          { capture: true, passive: true, once: true });
      });
      await (path === '/submit' ? surface : page.locator('#editor .view-lines')).hover();
      await page.keyboard.down('Meta');
      try { await page.mouse.wheel(0, -120); } finally { await page.keyboard.up('Meta'); }
      await page.waitForFunction(() => window.trustedFontWheel !== null);
      assert.deepEqual(await page.evaluate(() => trustedFontWheel), [true, true, -1]);
      assert.equal(await size(), initial + 2);
      await page.keyboard.press('Meta+-');
      assert.equal(await size(), initial);
      const captured = await surface.evaluate(node => {
        const wheel = (deltaY, metaKey, ctrlKey = false) => {
          const target = node.querySelector('.view-lines') || node;
          return !target.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode: 0, metaKey, ctrlKey, bubbles: true, cancelable: true }));
        };
        const pinch = (type, scale) => {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperty(event, 'scale', { value: scale });
          return !node.dispatchEvent(event);
        };
        const result = [wheel(-100, true), wheel(-1, true)];
        wheel(0, true); // Monaco may consume a horizontal wheel without changing the font.
        result.push(pinch('gesturestart', 1), pinch('gesturechange', 1.13), wheel(-100, false, true), pinch('gestureend', 1.13));
        return result;
      });
      assert.deepEqual(captured, [true, true, true, true, true, true]);
      assert.equal(await size(), initial + 4, 'one wheel step and one pinch step, including Safari duplicate-wheel suppression');
      const outside = await page.evaluate(() => {
        const target = document.querySelector('#toolbar');
        const key = new KeyboardEvent('keydown', { key: '+', metaKey: true, shiftKey: true, bubbles: true, cancelable: true });
        const wheel = new WheelEvent('wheel', { deltaY: -100, metaKey: true, bubbles: true, cancelable: true });
        return [target.dispatchEvent(key), target.dispatchEvent(wheel)];
      });
      assert.deepEqual(outside, [true, true]); assert.equal(await size(), initial + 4);
      if (path !== '/submit') {
        assert.equal(await surface.evaluate(node => {
          const field = document.createElement('input'); node.append(field); field.focus();
          const result = field.dispatchEvent(new KeyboardEvent('keydown', { key: '=', metaKey: true, bubbles: true, cancelable: true }));
          field.remove(); return result;
        }), true);
        assert.equal(await size(), initial + 4);
      }
    }
  } finally { await page.close(); }
});
it('changes only code font on Ctrl-wheel in the IDE, problem editor and ordinary submit form', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(origin); await page.waitForFunction(() => window.editorReady);
    const code = page.locator('#editor .view-lines');
    await page.evaluate(() => { editor.setSelection(new monaco.Selection(1, 1, 1, 6)); });
    await ctrlWheel(page, code, -120);
    await page.waitForFunction(() => editor.getRawOptions().fontSize === 16);
    assert.equal(await page.getByRole('button', { name:'代码字号 16，点击恢复默认', exact:true }).count(), 1);
    assert.deepEqual(await page.evaluate(() => [editor.getValue(), editor.getSelection().endColumn, window.visualViewport.scale]), ['print("hello")', 6, 1]);
    assert.equal(await page.evaluate(() => localStorage.getItem('editor.config')), null);
    await page.evaluate(() => FontIde.setIdeFontSize(40));
    await ctrlWheel(page, code, -120);
    assert.equal(await font(page), 40);
    await page.evaluate(() => FontIde.setIdeFontSize(10));
    await ctrlWheel(page, code, 120);
    assert.equal(await font(page), 10);
    await code.hover(); await page.mouse.wheel(0, -120);
    assert.equal(await font(page), 10);
    await page.evaluate(() => localStorage.setItem('editor.config', JSON.stringify({ fontSize: 21, tabSize: 3 })));
    await page.goto(`${origin}/question`); await page.waitForFunction(() => window.editorReady);
    await ctrlWheel(page, code, 120);
    await page.waitForFunction(() => editor.getRawOptions().fontSize === 19);
    await page.evaluate(() => changeCode('updated')); await page.waitForFunction(() => editor.getValue() === 'updated');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('editor.config'))), { fontSize:19, tabSize:3 });
    await page.reload(); await page.waitForFunction(() => window.editorReady); assert.equal(await font(page), 19);
    await page.goto(`${origin}/submit`); const answer = page.locator('textarea[name=code]');
    await page.waitForFunction(() => document.querySelector('textarea[name=code]')?.hasAttribute('data-code-font-wheel'));
    await ctrlWheel(page, answer, -120);
    await page.waitForFunction(() => document.querySelector('textarea[name=code]').style.fontSize === '21px');
    assert.equal(await answer.inputValue(), 'answer');
    assert.equal(await page.evaluate(() => FontIde.getIdeFontSize()), 10);
    await page.reload(); await page.waitForFunction(() => document.querySelector('textarea[name=code]')?.style.fontSize === '21px');
  } finally { await page.close(); }
});
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
  await Promise.all([macShortcuts(student), macShortcuts(teacher)]);
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
      await teacher.evaluate((messages) => messages.forEach((m) => {
        if (m.type === 'edit:init' && m.document !== 'annotations' && m.kind === 'monaco') window.latestEditorInit = m;
        controller.receive(m);
      }), a);
      await student.evaluate((messages) => messages.forEach((m) => controller.receive(m)), b);
    }
  }
  await flush(); await teacher.waitForFunction(() => !!sharedEditor());
  for (let i = 0; i < 3; i++) await student.getByRole('button', { name: '增大字号', exact: true }).click();
  await flush();
  assert.equal(await font(student), 20);
  assert.equal(await teacher.evaluate(() => sharedEditor().getOption(monaco.editor.EditorOptions.fontInfo.id).fontSize), 20);
  const remoteCode = teacher.locator('#shared .view-lines');
  await ctrlWheel(teacher, remoteCode, -120); await ctrlWheel(teacher, remoteCode, -120);
  await flush();
  assert.equal(await font(student), 24);
  assert.equal(await teacher.evaluate(() => sharedEditor().getRawOptions().fontSize), 24);
  const sharedId = await teacher.locator('#shared [data-live-share-editor]').first().getAttribute('data-live-share-editor');
  await student.evaluate((editorId) => {
    const packet = { type:'edit:font-step', pageId:'font-page', editorId, direction:-1 };
    controller.receive({ ...packet, pageId:'previous-page' });
    controller.receive({ ...packet, editorId:'previous-editor' });
    Object.defineProperty(document, 'hidden', { configurable:true, value:true });
    controller.receive(packet); delete document.hidden;
    controller.setConnected(false); controller.receive(packet); controller.setConnected(true);
  }, sharedId);
  await teacher.evaluate(() => {
    controller.setConnected(false); controller.setConnected(true);
    if (document.querySelector('#shared [data-code-font-wheel]')) throw new Error('unconfirmed source after reconnect');
  });
  await flush();
  assert.equal(await font(student), 24);
  assert.equal(await teacher.evaluate(() => sharedEditor().getRawOptions().fontSize), 24);
  await ctrlWheel(teacher, remoteCode, 120); await flush();
  assert.equal(await font(student), 22, 'only a fresh gesture changes the student font after reconnection');
  assert.equal(await font(teacher), 14, 'teacher own editor preference is not overwritten');
  await teacher.evaluate(() => sharedEditor().focus());
  await teacher.keyboard.press('Meta+=');
  await teacher.locator('#shared .view-lines').evaluate(node => node.dispatchEvent(new WheelEvent('wheel',
    { deltaY: -120, metaKey: true, bubbles: true, cancelable: true })));
  await flush();
  assert.equal(await font(student), 26, 'the Mac keyboard and wheel adjust the learner editor by one step each');
  assert.equal(await teacher.evaluate(() => sharedEditor().getRawOptions().fontSize), 26);
  assert.equal(await font(teacher), 14);
  for (const mode of ['legacy', 'observer']) {
    await teacher.evaluate((mode) => {
      controller.dispose(); outbox.length = 0;
      window.controller = FontIde.attachViewerEditors({ pageId: 'font-page', container: document.querySelector('#shared'),
        readOnly: mode === 'observer', send: message => outbox.push(message) });
      const snapshot = { ...latestEditorInit };
      if (mode === 'legacy') delete snapshot.fontWheel;
      controller.receive(snapshot);
    }, mode);
    await teacher.waitForFunction(() => !!sharedEditor());
    assert.equal(await teacher.locator('#shared [data-code-font-wheel]').count(), 0);
    await ctrlWheel(teacher, remoteCode, -120);
    assert.equal(await teacher.evaluate(() => outbox.some(message => message.type === 'edit:font-step')), false);
    assert.equal(await font(teacher), 14);
  }
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
