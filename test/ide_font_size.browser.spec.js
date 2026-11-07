const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');
const stylus = require('stylus');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { playwright = require(location); break; } catch { /* Optional local runtime. */ }
}
const executablePath = [playwright?.chromium.executablePath(),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
  .find((entry) => entry && fs.existsSync(entry));
const root = path.resolve(__dirname, '..');
const monacoFolder = path.join(root, 'node_modules/monaco-editor/min/vs');
let browser; let server; let origin;
before(async () => {
  assert(executablePath, 'Chromium is required for real Monaco checks');
  const bundle = (await esbuild.build({ absWorkingDir: root, stdin: { contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import Editor from './packages/ui-default/components/scratchpad/ScratchpadEditorContainer';
    import Control from './packages/ui-default/components/ide/IdeFontSizeControl';
    export * from './packages/ui-default/components/live_share/editor';
    export * from './packages/ui-default/components/ide/fontSize';
    function App() {
      const [code,setCode]=React.useState('print("hello")'); window.changeCode=setCode;
      return <><div id="toolbar">主题：雾青 {UiContext.ideMode && <Control />}</div><div id="editor"><Editor value={code} language="python" settings={{fontSize:21}} handleUpdateCode={setCode}/></div></>;
    }
    createRoot(document.querySelector('#app')).render(<App/>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', globalName: 'FontIde',
  plugins: [{ name: 'real-monaco-with-production-editor', setup(build) {
    build.onResolve({ filter: /^(vj\/context|vj\/components\/monaco\/loader|react-redux|monaco-editor\/.*)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
    build.onResolve({ filter: /^\.\/themes$/ }, (args) => args.importer.endsWith('ScratchpadEditorContainer.tsx') ? { path: 'themes', namespace: 'fixture' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents:
      name === 'react-redux' ? 'export const connect=()=>component=>component;' :
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
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise((r) => server.close(r)); });
const font = (page) => page.evaluate(() => editor.getOption(monaco.editor.EditorOptions.fontInfo.id).fontSize);
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
