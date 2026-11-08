const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { build } = require('esbuild');
const { WebSocketServer } = require('ws');

let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { playwright = require(location); break; } catch { /* Bundled local runtime. */ }
}
const executablePath = [playwright?.chromium.executablePath(),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
  .find((entry) => entry && fs.existsSync(entry));
let browser; let server; let sockets; let origin; let bundle;
const connections = new Map(); const posts = [];

function pageMarkup(url) {
  const uid = url.pathname === '/signed-out' ? 0 : url.pathname === '/other-user' ? 3 : 2;
  return `<!doctype html><html data-app="Hydro" data-page="fixture"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>页面 ${url.pathname}</title><style>body{margin:0;font:18px Arial}main{padding:24px}a,button{display:inline-block;margin:10px;padding:10px}#bottom{margin-top:1400px}</style>
    <script>window.UserContext={_id:${uid}};window.UiContext={domainId:'C0001'};</script><script src="/navigation.js"></script>
    </head><body><main><h1 id="heading">${url.pathname}</h1>
    <a id="normal" href="/problem">题目</a><a id="blank" href="/assignment" target="_blank">作业新标签</a>
    <a id="top" href="/ranking" target="_top">排名</a><a id="hash" href="#bottom">页内位置</a>
    <a id="denied" href="/forbidden">没有权限的页面</a><a id="download" href="/attachment.txt" download="课堂资料.txt">下载文件</a>
    <a id="external" href="https://example.invalid/guide" target="_blank">外部资料</a>
    <button id="js" onclick="location.assign('/ide')">脚本跳转</button>
    <button id="open" onclick="window.open('/scratch','_blank')">打开 Scratch</button>
    <button id="print" onclick="const popup=window.open('','_blank','width=600,height=400,popup=1');if(popup){popup.document.write('<h1>打印预览</h1>');popup.document.close()}">打印</button>
    <button id="state" onclick="history.pushState({fixture:1},'', '/filtered?q=AC');document.title='筛选后的题库'">局部筛选</button>
    <form id="search" action="/search" method="get"><input name="q" value="python"><button>搜索</button></form>
    <form id="save" action="/save" method="post" target="_top"><input name="title" value="自己的作业"><button>保存</button></form>
    <textarea id="draft">未保存的草稿</textarea><div id="bottom">页面下方</div>
    ${url.pathname === '/scratch' ? '<iframe id="scratch" sandbox="allow-scripts" src="/scratch-stage"></iframe>' : ''}
    ${url.pathname === '/forbidden' ? '<p id="permission-denied">没有访问权限</p>' : ''}
    </main><script>
    function start(){
      if(Navigation.attachPlatformPage(window)) { window.fixtureChild=true; Navigation.notifyPlatformPageReady(window); return; }
      const shell=Navigation.installPlatformShell(window); if(!shell)return;
      window.fixtureHostId=Math.random().toString(36).slice(2); window.fixtureUser=${uid};
      window.fixtureFrames=[];window.fixtureMessages=0;
      const key=location.search.match(/run=([^&]+)/)?.[1]||'default';
      window.fixtureSocket=new WebSocket(location.origin.replace('http','ws')+'/connection?run='+key);
      fixtureSocket.addEventListener('message',()=>window.fixtureMessages++);
      window.fixtureAudio=new AudioContext();window.fixtureTrack=fixtureAudio.createMediaStreamDestination().stream.getAudioTracks()[0];
      const draft=document.createElement('textarea');draft.id='persistent-chat-draft';draft.value='聊天输入保持';draft.style='position:fixed;bottom:12px;right:12px;z-index:99999';document.body.append(draft);
      const end=()=>{fixtureSocket.close();fixtureTrack.stop();fixtureAudio.close();localStorage.setItem('session-ended',String(Date.now()));};
      window.addEventListener('onebyone:session-ended',end);window.addEventListener('pagehide',()=>fixtureSocket.close());
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
    </script></body></html>`;
}

before(async () => {
  assert(executablePath, 'Chromium is required for persistent navigation regression');
  bundle = (await build({ entryPoints: [path.resolve(__dirname, '../packages/ui-default/utils/persistent-navigation.ts')],
    bundle: true, format: 'iife', globalName: 'Navigation', write: false })).outputFiles[0].text;
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/navigation.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle); return; }
    if (url.pathname === '/attachment.txt') {
      res.setHeader('Content-Type', 'text/plain'); res.setHeader('Content-Disposition', 'attachment; filename="lesson.txt"'); res.end('课堂资料'); return;
    }
    if (url.pathname === '/scratch-stage') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<button id="stage-run" onclick="this.textContent=\'正在运行\'">运行积木</button>'); return; }
    if (req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      posts.push({ path: url.pathname, body }); res.writeHead(303, { Location: '/saved' }); res.end(); return;
    }
    res.writeHead(url.pathname === '/forbidden' ? 403 : 200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(pageMarkup(url));
  });
  sockets = new WebSocketServer({ server });
  sockets.on('connection', (socket, request) => {
    const key = new URL(request.url, 'http://localhost').searchParams.get('run');
    const record = connections.get(key) || { opened: 0, closed: 0 }; connections.set(key, record); record.opened++;
    const timer = setInterval(() => { if (socket.readyState === 1) socket.send('live'); }, 50);
    socket.on('close', () => { record.closed++; clearInterval(timer); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => {
  await browser?.close(); for (const socket of sockets?.clients || []) socket.terminate();
  if (sockets) await new Promise((resolve) => sockets.close(resolve));
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function fixture(t) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, acceptDownloads: true }); t.after(() => context.close());
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  const run = Math.random().toString(36).slice(2);
  await page.goto(`${origin}/home?run=${run}`);
  await page.waitForFunction(() => window.fixtureMessages >= 1 && window.__onebyonePlatformShell?.contentWindow()?.fixtureChild);
  const id = await page.evaluate(() => fixtureHostId);
  const frame = () => page.frames().find(item => item.parentFrame() === page.mainFrame());
  const check = async (pathname) => {
    await page.waitForFunction((expected) => {
      try { const current = __onebyonePlatformShell.contentWindow(); return current?.location.pathname === expected && current.fixtureChild; }
      catch { return false; }
    }, pathname);
    await page.waitForFunction((expected) => location.pathname === expected, pathname);
    assert.equal(await page.evaluate(() => fixtureHostId), id, 'the communication host document must remain alive');
    assert.equal(await page.evaluate(() => fixtureTrack.readyState), 'live', 'a camera/audio track must not stop on navigation');
    assert.equal(await page.locator('#persistent-chat-draft').inputValue(), '聊天输入保持');
    assert.equal(connections.get(run)?.opened, 1); assert.equal(connections.get(run)?.closed, 0);
  };
  return { page, context, errors, run, frame, check };
}

it('keeps one real socket, media track and chat draft through links, script navigation, new-tab links and denied pages', { timeout: 45000 }, async (t) => {
  const { page, context, frame, check, errors } = await fixture(t);
  const messages = await page.evaluate(() => fixtureMessages);
  await frame().locator('#normal').click(); await check('/problem');
  await frame().locator('#blank').click(); await check('/assignment');
  await frame().locator('#top').click(); await check('/ranking');
  await frame().locator('#js').click(); await check('/ide');
  await frame().locator('#open').click(); await check('/scratch');
  assert.equal(context.pages().length, 1, 'ordinary internal new-tab links should reuse the persistent tab');
  await frame().frameLocator('#scratch').locator('#stage-run').click();
  assert.equal(await frame().frameLocator('#scratch').locator('#stage-run').textContent(), '正在运行');
  await frame().locator('#denied').click(); await check('/forbidden');
  assert(await frame().locator('#permission-denied').isVisible());
  await page.waitForFunction((initial) => fixtureMessages > initial + 2, messages);
  assert.deepEqual(errors, []);
});

it('preserves native GET and POST form semantics and follows redirects without a second host connection', { timeout: 30000 }, async (t) => {
  const { page, frame, check, errors } = await fixture(t);
  await frame().locator('#search button').click(); await check('/search');
  assert.equal(new URL(page.url()).searchParams.get('q'), 'python');
  const before = posts.length;
  await frame().locator('#save button').click(); await check('/saved');
  assert.equal(posts.length, before + 1); assert.equal(posts.at(-1).path, '/save');
  assert.equal(new URLSearchParams(posts.at(-1).body).get('title'), '自己的作业');
  assert.deepEqual(errors, []);
});

it('keeps URL, title and browser back/forward aligned with child history and page fragments', { timeout: 30000 }, async (t) => {
  const { page, frame, check, errors } = await fixture(t);
  await frame().locator('#normal').click(); await check('/problem');
  await frame().locator('#js').click(); await check('/ide');
  await page.goBack(); await check('/problem');
  await page.goForward(); await check('/ide');
  await frame().locator('#state').click();
  await page.waitForFunction(() => location.pathname === '/filtered' && document.title === '筛选后的题库');
  await page.goBack(); await check('/ide');
  await frame().locator('#hash').click();
  await page.waitForFunction(() => location.hash === '#bottom');
  assert(await frame().evaluate(() => scrollY > 100));
  await page.goBack(); await page.waitForFunction(() => location.hash === '');
  assert.deepEqual(errors, []);
});

it('does not hijack downloads, external links or blank print windows', { timeout: 30000 }, async (t) => {
  const { page, context, frame, check, errors } = await fixture(t);
  const downloaded = page.waitForEvent('download'); await frame().locator('#download').click();
  assert.equal((await downloaded).suggestedFilename(), 'lesson.txt'); await check('/home');
  const printed = context.waitForEvent('page'); await frame().locator('#print').click(); const printPage = await printed;
  await printPage.waitForLoadState('domcontentloaded'); assert.equal(await printPage.locator('h1').textContent(), '打印预览'); await printPage.close();
  await context.route('https://example.invalid/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>外部资料</h1>' }));
  const opened = context.waitForEvent('page'); await frame().locator('#external').click(); const externalPage = await opened;
  await externalPage.waitForLoadState(); assert.equal(await externalPage.locator('h1').textContent(), '外部资料');
  await check('/home'); assert.deepEqual(errors, []);
});

it('retains unsaved work when a native beforeunload warning is cancelled', { timeout: 30000 }, async (t) => {
  const { page, frame, check, errors } = await fixture(t);
  await frame().locator('#draft').fill('不能丢失的 Scratch 或代码草稿');
  await frame().evaluate(() => window.addEventListener('beforeunload', (event) => { event.preventDefault(); event.returnValue = ''; }));
  const dismissed = page.waitForEvent('dialog').then(async (dialog) => { assert.equal(dialog.type(), 'beforeunload'); await dialog.dismiss(); });
  await frame().locator('#normal').click({ noWaitAfter: true }); await dismissed;
  await check('/home');
  assert.equal(await frame().locator('#draft').inputValue(), '不能丢失的 Scratch 或代码草稿');
  assert.deepEqual(errors, []);
});

for (const destination of ['/signed-out', '/other-user']) it(`stops the previous account session on ${destination}`, { timeout: 30000 }, async (t) => {
  const { page, frame, run } = await fixture(t);
  await frame().evaluate((url) => location.assign(url), destination);
  await page.waitForFunction(() => !!localStorage.getItem('session-ended'));
  for (let retry = 0; retry < 100 && !connections.get(run)?.closed; retry++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(connections.get(run)?.closed, 1, 'old account transport must be disposed instead of leaking to signed-out content');
});
