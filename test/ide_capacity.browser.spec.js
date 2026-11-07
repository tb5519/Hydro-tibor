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
const executablePath = [playwright?.chromium.executablePath(), path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')].find((p) => p && fs.existsSync(p));
const root = path.resolve(__dirname, '..');
let browser; let server; let origin;
before(async () => {
  const bundle = (await esbuild.build({ absWorkingDir: root, stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import Badge from './packages/ui-default/components/ide/IdeCapacityBadge';
    export {attachIdeCapacityMirror} from './packages/ui-default/components/ide/IdeCapacityBadge';
    export {getIdeCapacityStore} from './packages/ui-default/components/ide/capacity';
    export const mount = (language='cc.cc17') => { const root=createRoot(document.querySelector('#app')); root.render(<Badge language={language}/>); return ()=>root.unmount(); };
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'iife', globalName: 'Capacity',
  plugins: [{ name: 'capacity-network', setup(build) {
    build.onResolve({ filter: /^vj\/utils$/ }, () => ({ path: 'utils', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const request={get:(url)=>window.api("GET",url),post:(url)=>window.api("POST",url)};' }));
  } }],
  })).outputFiles[0].text;
  const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/ide_runtime.page.styl'), 'utf8'));
  server = http.createServer((req, res) => {
    if (req.url === '/badge.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); return; }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><style>body{font-family:system-ui}#app{display:flex;gap:12px;padding:30px}${css}</style><div id="app"></div>
      <script>window.UiContext={ideCapacityUrl:'/teacher/capacity',ideReleaseUrl:'/teacher/release'};
      window.calls=[];window.timers=[];window.visible='visible';Object.defineProperty(document,'visibilityState',{get:()=>visible});
      const setTimeoutOriginal=window.setTimeout;window.setTimeout=(fn,ms,...args)=>{timers.push(ms);return setTimeoutOriginal(fn,ms,...args)};
      window.pending=[];window.mode='defer';window.reply={capacity:4,used:0,available:4,compilerBusy:false,ownRunning:false,canRelease:false,resetting:false};
      window.api=(method,url)=>{calls.push({method,url});if(mode==='defer')return new Promise((resolve,reject)=>pending.push({resolve,reject}));if(mode==='error')return Promise.reject(new Error('连接失败'));return Promise.resolve({...reply})};
      window.next=(data)=>pending.shift().resolve(data);window.update=(data)=>{reply={...reply,...data};mode='ready';window.dispatchEvent(new Event('focus'))};
      </script><script src="/badge.js"></script>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise((r) => server.close(r)); });
async function fixture(lang = 'cc.cc17') {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin); await page.evaluate((lang) => { window.dispose = Capacity.mount(lang); }, lang);
  await page.waitForFunction(() => pending.length === 1); return { page, errors };
}
const text = (page) => page.locator('#app [data-ide-capacity]').textContent();
it('shows honest loading/offline/full/compiler/own-run states and keeps the student badge read-only', async () => {
  const { page, errors } = await fixture(); assert.equal(await text(page), '检查中');
  await page.evaluate(() => next(reply)); await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '可直接运行');
  await page.locator('[data-ide-capacity]').dblclick(); assert.equal(await page.evaluate(() => calls.filter((c) => c.method === 'POST').length), 0);
  assert(await page.evaluate(() => timers.includes(10000)));
  await page.evaluate(() => update({ used: 4, available: 0 })); await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '需要等待');
  assert(await page.evaluate(() => timers.includes(3000)));
  await page.evaluate(() => update({ capacity: 2, used: 4, available: 0 }));
  await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '需要等待');
  assert.match(await page.locator('[data-ide-capacity] [title]').getAttribute('title'), /4\/2/, 'lowered capacity can temporarily be below active programs');
  await page.evaluate(() => update({ capacity: 4, used: 1, available: 3, compilerBusy: true })); await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '编译稍候');
  await page.evaluate(() => update({ used: 4, available: 0, ownRunning: true })); await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '程序运行中');
  await page.evaluate(() => { mode='error'; window.dispatchEvent(new Event('focus')); }); await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '状态离线');
  assert.equal(await page.locator('[data-ide-capacity] button').count(), 0);
  assert.deepEqual(errors, []); await page.close();
});
it('pauses hidden checks, restores fresh status on return and lets Python use a free slot while the compiler is busy', async () => {
  const { page } = await fixture('py.py3');
  await page.evaluate(() => { next({...reply,compilerBusy:true}); }); await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '可直接运行');
  const count = await page.evaluate(() => { visible='hidden';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));return calls.length; });
  await page.waitForTimeout(80); assert.equal(await page.evaluate(() => calls.length), count);
  await page.evaluate(() => { mode='defer';visible='visible';document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => pending.length === 1); assert.equal(await text(page), '检查中');
  await page.evaluate(() => next({...reply,used:4,available:0})); await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '需要等待');
  await page.close();
});
it('requires teacher double click, ignores single clicks and duplicates, and waits for actual release completion', async () => {
  const { page, errors } = await fixture();
  await page.evaluate(() => next({...reply,used:4,available:0,canRelease:true}));
  const control = page.locator('[data-ide-capacity] button'); await control.waitFor(); await control.click();
  assert.equal(await page.evaluate(() => calls.filter((c) => c.method === 'POST').length), 0);
  await control.dblclick(); await page.waitForFunction(() => pending.length === 1);
  assert.equal(await text(page), '正在释放'); assert(await control.isDisabled());
  await control.dispatchEvent('dblclick'); await control.dispatchEvent('dblclick');
  assert.equal(await page.evaluate(() => calls.filter((c) => c.method === 'POST').length), 1);
  await page.evaluate(() => next({...reply,used:4,available:0,canRelease:true,resetting:true}));
  assert.equal(await text(page), '正在释放');
  assert(await page.evaluate(() => timers.includes(1000)));
  await page.evaluate(() => update({used:0,available:4,canRelease:true,resetting:false}));
  await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '已停止全部程序');
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '状态离线');
  assert.deepEqual(errors, []); await page.close();
});
it('reports release failure, and an older GET cannot overwrite a release in progress', async () => {
  const { page, errors } = await fixture(); await page.evaluate(() => next({...reply,canRelease:true}));
  const control = page.locator('[data-ide-capacity] button'); await control.waitFor();
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); }); await page.waitForFunction(() => pending.length === 1);
  // Restore the last verified state only for this test's overlapping background refresh.
  await page.evaluate(() => next({...reply,canRelease:true})); await control.waitFor();
  await page.evaluate(() => { void Capacity.getIdeCapacityStore().refresh(); }); await page.waitForFunction(() => pending.length === 1);
  await control.dblclick(); await page.waitForFunction(() => pending.length === 2);
  await page.evaluate(() => next({...reply,canRelease:true})); await page.waitForTimeout(30);
  assert.equal(await text(page), '正在释放');
  await page.evaluate(() => pending.shift().reject(new Error('没有权限执行此操作')));
  await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '操作未成功');
  assert.match(await control.getAttribute('title'), /没有权限/); assert(await control.isEnabled());
  await page.evaluate(() => { mode='ready';reply={...reply,used:4,available:0,canRelease:true}; });
  await page.waitForFunction(() => document.querySelector('[data-ide-capacity]').textContent === '需要等待', { timeout: 6000 });
  assert.doesNotMatch(await control.getAttribute('title'), /没有权限/, 'temporary release feedback expires and fresh capacity is shown');
  assert.deepEqual(errors, []); await page.close();
});
it('mounts a teacher-owned iframe control, does not trust forged markers, and remounts after replay replacement', async () => {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message)); await page.goto(origin);
  await page.evaluate(() => {
    const iframe=document.createElement('iframe');document.body.append(iframe);iframe.style.cssText='width:600px;height:200px';
    window.replay=iframe.contentDocument;replay.head.innerHTML='<style>[data-live-share-ui]{visibility:hidden!important}</style>';replay.body.innerHTML='<div class="scratchpad__toolbar"><select><option value="cc.cc17">C++17</option></select><span data-ide-capacity>student</span></div><span id="forged" data-ide-capacity-local>fake</span>';
    window.mirror=Capacity.attachIdeCapacityMirror(replay);
  });
  await page.waitForFunction(() => pending.length === 1);
  await page.evaluate(() => next({...reply,used:4,available:0,ownRunning:true,canRelease:true}));
  const control = page.frameLocator('iframe').locator('[data-ide-capacity-local] button'); await control.waitFor();
  assert.equal(await control.textContent(), '需要等待', 'teacher ownRunning must not describe the mirrored student');
  assert(await control.isVisible(), 'trusted local control stays visible despite the mirror hide rule');
  assert.deepEqual(await page.evaluate(() => [mirror.owns(replay.querySelector('button')),mirror.owns(replay.querySelector('#forged'))]), [true,false]);
  await control.dblclick(); await page.waitForFunction(() => calls.some((c) => c.method === 'POST'));
  assert.equal(await page.evaluate(() => calls.find((c) => c.method === 'POST').url), '/teacher/release');
  await page.evaluate(() => next({...reply,canRelease:true}));
  await page.evaluate(() => { replay.querySelector('.scratchpad__toolbar').innerHTML='<select><option value="cc.cc17">C++17</option></select><span data-ide-capacity>new student marker</span>';mode='ready';reply.canRelease=true; });
  await control.waitFor();
  assert.equal(await page.frameLocator('iframe').locator('[data-ide-capacity-local] button').count(), 1);
  await page.evaluate(() => mirror.dispose());
  assert.equal(await page.frameLocator('iframe').locator('[data-ide-capacity-local] button').count(), 0);
  assert.equal(await page.frameLocator('iframe').locator('[data-ide-capacity]').getAttribute('style'), '');
  assert.deepEqual(errors, []); await page.close();
});
