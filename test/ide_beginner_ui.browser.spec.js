const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');
const { WebSocketServer } = require('ws');
const stylus = require('stylus');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { playwright = require(location); break; } catch { /* Optional local browser runtime. */ }
}
const root = path.resolve(__dirname, '..');
const monacoFolder = path.join(root, 'node_modules/monaco-editor/min/vs');
const executablePath = [playwright.chromium.executablePath(), path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')].find((p) => fs.existsSync(p));
let browser; let server; let wss; let origin;
const runs = [];
before(async () => {
  const utils = fs.readFileSync(path.join(root, 'packages/ui-default/utils/index.ts'), 'utf8');
  const getAvailableLangs = utils.slice(utils.indexOf('export function getAvailableLangs'), utils.indexOf('export const createZipStream'));
  const bundle = (await esbuild.build({ absWorkingDir: root, stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client'; import {Provider} from 'react-redux'; import {createStore, combineReducers} from 'redux';
    import Editor from './packages/ui-default/components/scratchpad/ScratchpadEditorContainer';
    import Toolbar from './packages/ui-default/components/scratchpad/ScratchpadToolbarContainer';
    import Runtime from './packages/ui-default/components/ide/IdeRuntimeWindows';
    import editor from './packages/ui-default/components/scratchpad/reducers/editor';
    import ui from './packages/ui-default/components/scratchpad/reducers/ui';
    window.store=createStore(combineReducers({editor,ui,pretest:(s={isRunning:false,input:''})=>s}));
    createRoot(document.querySelector('#app')).render(<Provider store={store}><Toolbar/><div id="editor"><Editor/></div><Runtime/></Provider>);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic',
  plugins: [{ name: 'beginner-real-editor-and-toolbar', setup(build) {
    build.onResolve({ filter: /^(vj\/context|vj\/utils|vj\/components\/notification|vj\/components\/react\/IconComponent|vj\/components\/monaco\/loader)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
    build.onResolve({ filter: /^\.\/(themes|ScratchpadThemePicker|ScratchpadControlArt)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ loader: 'ts', contents:
      name === 'vj/utils' ? `${getAvailableLangs}\nexport const i18n=x=>x; export const request={};` :
      name === 'vj/context' ? 'export const ctx={scratchpad:{init(){window.editorReady=true}}};' :
      name === 'vj/components/notification' ? 'export default {success(){},error(){}};' :
      name === 'vj/components/react/IconComponent' ? 'export default ()=>null;' :
      name === 'vj/components/monaco/loader' ? 'export const load=async()=>({monaco:window.monaco,customOptions:{},registerAction:async()=>{}});' :
      name === './themes' ? "export const attachScratchpadMonacoTheme=()=>()=>{};export const currentScratchpadTheme=()=>({});export const scratchpadMonacoThemeName=()=> 'vs';" :
      name === './ScratchpadControlArt' ? 'export const ScratchpadLanguageArt=({children})=>children;export const useScratchpadControlArt=()=>({ready:false});' : 'export default ()=>null;' }));
  } }],
  })).outputFiles[0].text;
  const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/ide_runtime.page.styl'), 'utf8'));
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/beginner.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); return; }
    if (url.pathname.startsWith('/vs/')) {
      const file = path.resolve(monacoFolder, url.pathname.slice(4));
      if (!file.startsWith(`${monacoFolder}${path.sep}`) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : file.endsWith('.ttf') ? 'font/ttf' : 'text/javascript'); res.end(fs.readFileSync(file)); return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><style>body{margin:0}#app{position:relative;height:100vh}#editor{height:400px;width:900px}.scratchpad__toolbar{height:50px;display:flex;justify-content:space-between}.scratchpad__toolbar__actions,.scratchpad__toolbar__views{display:flex}${css}</style><div id="app"></div>
      <script>window.UserContext={_id:42};window.UiContext={ideMode:true,ideRuntimeConnUrl:'/ide/conn',cppEditorMode:'beginner',cppStarterTemplate:'',codeTemplate:'DO NOT SEED',codeLang:'cc.cc17',pdoc:{docId:-1,domainId:'cpp-class',config:{type:'default',langs:['cc.cc17']}},canViewRecord:false};window.LANGS={'cc.cc17':{display:'C++17',monaco:'cpp'},'py.py3':{display:'Python 3',monaco:'python'}};</script>
      <script src="/vs/loader.js"></script><script>require.config({paths:{vs:'/vs'}});require(['vs/editor/editor.main'],()=>{const s=document.createElement('script');s.src='/beginner.js';document.head.append(s)});</script>`);
  });
  wss = new WebSocketServer({ server }); wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'ready', languages: ['cc.cc17'], limits: {} }));
    ws.on('message', (raw) => { const data = JSON.parse(raw); if (data.type === 'run') {
      runs.push(data); ws.send(JSON.stringify({ type: 'exit', runId: data.runId, seq: 1, exitCode: 0, status: 'Accepted' }));
    } });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); wss?.clients.forEach((ws) => ws.terminate()); if (server) await new Promise((r) => server.close(r)); });
it('keeps beginner C++ editable and runnable using only the teacher-allowed language without inserting wrapper code into the draft', async () => {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin); await page.waitForFunction(() => window.editorReady);
  assert.equal(await page.evaluate(() => editor.getValue()), '');
  assert.deepEqual(await page.locator('select[aria-label="Language"] option').evaluateAll((els) => els.map((el) => el.value)), ['cc.cc17']);
  const run = page.getByRole('button', { name: '运行代码', exact: true }); assert(await run.isEnabled());
  const snippet = 'int x;\ncin >> x;\ncout << x + 1 << endl;';
  await page.evaluate((code) => editor.setValue(code), snippet);
  await page.waitForFunction((code) => store.getState().editor.code === code, snippet);
  await run.click();
  for (let i = 0; i < 100 && !runs.length; i++) await page.waitForTimeout(20);
  assert.equal(runs.length, 1); assert.equal(runs[0].lang, 'cc.cc17'); assert.equal(runs[0].code, snippet);
  assert.equal(await page.evaluate(() => editor.getValue()), snippet, 'the server-only wrapper never rewrites the student draft');
  await page.reload(); await page.waitForFunction(() => window.editorReady);
  assert.equal(await page.evaluate(() => editor.getValue()), snippet);
  assert.equal(await page.locator('select[aria-label="Language"]').inputValue(), 'cc.cc17');
  assert.deepEqual(errors, []); await page.close();
});
