const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { before, after, it } = require('node:test');
const { build } = require('esbuild');
const stylus = require('stylus');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { playwright = require(location); break; } catch {}
}
const executablePath = [playwright?.chromium.executablePath(), path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')].find((file) => file && fs.existsSync(file));
const root = path.resolve(__dirname, '..');
let browser; let server; let origin;
const files = new Map(); const requests = [];
before(async () => {
  const bundle = (await build({ absWorkingDir: root, stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client'; import {Provider} from 'react-redux'; import {createStore} from 'redux';
    import Control from './packages/ui-default/components/ide/IdeFilesControl';
    window.store=createStore((state={editor:{lang:'py.py3',code:'print(1)'}},action)=>action.type==='SCRATCHPAD_EDITOR_UPDATE_CODE'?{editor:{...state.editor,code:action.payload}}:action.type==='SCRATCHPAD_EDITOR_SET_LANG'?{editor:{...state.editor,lang:action.payload}}:state);
    createRoot(document.querySelector('#app')).render(<Provider store={store}><Control/></Provider>);`, resolveDir: root, loader: 'tsx' },
    write: false, bundle: true, format: 'iife', plugins: [{ name: 'utils', setup(b) {
      b.onResolve({ filter: /^vj\/utils$/ }, () => ({ path: 'utils', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: "export const getAvailableLangs=()=>({'py.py3':{monaco:'python'},'cc.cc14':{monaco:'cpp'}});" }));
    } }], define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
  const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/ide_files.page.styl'), 'utf8'));
  server = http.createServer(async (req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle); return; }
    if (req.url.startsWith('/ide/files')) {
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') { const id = new URL(req.url, origin).searchParams.get('id'); res.end(JSON.stringify(id ? { file: files.get(id) } : { files: [...files.values()].map(({ code, ...value }) => value) })); return; }
      let body = ''; for await (const chunk of req) body += chunk;
      const input = JSON.parse(body); requests.push(input);
      if (input.action === 'delete') { files.delete(input.id); res.end('{"ok":true}'); return; }
      const file = { ...input, id: input.id || String(files.size + 1).padStart(24, '0'), revision: (input.revision || 0) + 1, updatedAt: new Date().toISOString() };
      files.set(file.id, file); res.end(JSON.stringify({ file })); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><style>body{margin:0;font-family:system-ui;background:#eef2f5}#app{display:flex;justify-content:flex-end;padding:24px;background:#fff}${css}</style><div id="app"></div><script>window.UiContext={ideFilesUrl:'/ide/files',pdoc:{config:{langs:['py.py3','cc.cc14']}}};window.UserContext={_id:2};</script><script src="/bundle.js"></script>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright.chromium.launch({ headless: true, executablePath });
});
after(async () => { await browser?.close(); await new Promise((r) => server?.close(r)); });
it('defaults to cloud, names once then saves directly, opens exact code and confirms draft replacement', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(origin); await page.getByRole('button', { name: '云端文件，点击切换本地' }).waitFor();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByLabel('文件名').fill('第一个程序');
  await page.locator('dialog').getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('dialog'));
  assert.equal([...files.values()].at(-1).name, '第一个程序.py');
  await page.evaluate(() => store.dispatch({ type: 'SCRATCHPAD_EDITOR_UPDATE_CODE', payload: 'print(2)' }));
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ide-files__notice')?.textContent.includes('已保存'));
  assert.equal([...files.values()].at(-1).code, 'print(2)');
  assert.equal(await page.locator('dialog').count(), 0);
  await page.evaluate(() => store.dispatch({ type: 'SCRATCHPAD_EDITOR_UPDATE_CODE', payload: 'unsaved' }));
  await page.getByRole('button', { name: '打开', exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: /第一个程序.py.*Python/ }).click();
  assert.equal(await page.evaluate(() => store.getState().editor.code), 'unsaved');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /第一个程序.py.*Python/ }).click();
  await page.waitForFunction(() => store.getState().editor.code === 'print(2)');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await page.screenshot({ path: '/tmp/onebyone-ide-cloud-files.png' });
  await page.close();
});
it('switches locally, imports C++ with its language, downloads exact code and rejects large files', async () => {
  const page = await browser.newPage(); await page.goto(origin);
  await page.getByRole('button', { name: '云端文件，点击切换本地' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('input[type=file]').setInputFiles({ name: '测试.cpp', mimeType: 'text/plain', buffer: Buffer.from('int main(){return 0;}') });
  await page.waitForFunction(() => store.getState().editor.lang === 'cc.cc14');
  const current = await page.evaluate(() => store.getState().editor); assert.equal(current.code, 'int main(){return 0;}');
  // Exercise the portable fallback used by browsers without filesystem picker support.
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '保存', exact: true }).click();
  const file = await download; assert.equal(file.suggestedFilename(), '测试.cpp');
  assert.equal(fs.readFileSync(await file.path(), 'utf8'), current.code);
  await page.locator('input[type=file]').setInputFiles({ name: 'too-big.py', mimeType: 'text/plain', buffer: Buffer.alloc(128 * 1024 + 1, 'a') });
  await page.getByText('代码文件不能超过 128 KB。').waitFor();
  assert.equal(await page.evaluate(() => store.getState().editor.code), current.code);
  await page.close();
});
it('opening a cloud document requests a new local destination instead of overwriting the previous file handle', async () => {
  const id = '000000000000000000000098';
  files.set(id, { id, name: '云端程序B.py', lang: 'py.py3', revision: 1, code: 'print("B")', updatedAt: new Date().toISOString() });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__localSaves = { suggestedNames: [], contents: {} };
    window.showSaveFilePicker = async ({ suggestedName }) => {
      const state = window.__localSaves;
      state.suggestedNames.push(suggestedName);
      const name = state.suggestedNames.length === 1 ? '本地程序A.py' : suggestedName;
      return { name, createWritable: async () => {
        let content;
        return { write: async (value) => { content = value; }, close: async () => { state.contents[name] = content; } };
      } };
    };
  });
  try {
    await page.goto(origin);
    await page.getByRole('button', { name: '云端文件，点击切换本地' }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForFunction(() => window.__localSaves.contents['本地程序A.py'] === 'print(1)');
    await page.getByRole('button', { name: '本地文件，点击切换云端' }).click();
    await page.getByRole('button', { name: '打开', exact: true }).click();
    await page.getByRole('button', { name: /云端程序B.py.*Python/ }).click();
    await page.waitForFunction(() => store.getState().editor.code === 'print("B")');
    await page.getByRole('button', { name: '云端文件，点击切换本地' }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.ide-files button:disabled'));
    let state = await page.evaluate(() => window.__localSaves);
    assert.equal(state.suggestedNames.length, 2, 'opening B must discard the local write handle for A');
    assert.equal(state.suggestedNames[1], '云端程序B.py');
    assert.equal(state.contents['本地程序A.py'], 'print(1)', 'the previous local file remains intact');
    assert.equal(state.contents['云端程序B.py'], 'print("B")');
    await page.evaluate(() => store.dispatch({ type: 'SCRATCHPAD_EDITOR_UPDATE_CODE', payload: 'print("B updated")' }));
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForFunction(() => window.__localSaves.contents['云端程序B.py'] === 'print("B updated")');
    state = await page.evaluate(() => window.__localSaves);
    assert.equal(state.suggestedNames.length, 2, 'later saves of B may reuse its own explicitly selected local handle');
    assert.equal(state.contents['本地程序A.py'], 'print(1)');
  } finally { await page.close(); files.delete(id); }
});
it('stays usable on a narrow viewport and treats filenames as text', async () => {
  files.set('000000000000000000000099', { id: '000000000000000000000099', name: '<img onerror=alert(1)>.py', lang: 'py.py3', revision: 1, code: '', updatedAt: new Date().toISOString() });
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } }); await page.goto(origin);
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await page.getByText('<img onerror=alert(1)>.py').waitFor();
  assert.equal(await page.locator('dialog img').count(), 0);
  const bounds = await page.locator('dialog').boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= 375);
  await page.screenshot({ path: '/tmp/onebyone-ide-cloud-files-mobile.png' }); await page.close();
});
