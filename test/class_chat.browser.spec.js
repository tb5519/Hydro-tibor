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
  try { playwright = require(location); break; } catch { /* Local runtime. */ }
}
const root = path.resolve(__dirname, '..');
const executablePath = [playwright?.chromium.executablePath(),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')].find((entry) => entry && fs.existsSync(entry));
let browser; let server; let origin; let wss;
let records = []; let requests = []; let sequence = 0; let failResponseOnce = false; let onlineStudents = new Set([40]); let imageRequests = 0;
let multipleTeachers = false; let forbiddenUsers = new Set();
const names = { 2: '唐老师', 3: '李老师', 40: '当当', 41: '橙子' };
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB6kAAAAASUVORK5CYII=', 'base64');
const out = (res, value) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
const message = (from, to, text, extra = {}) => ({ id: String(++sequence).padStart(24, '0'), from, to, text, createdAt: new Date().toISOString(), kind: 'text', read: false, ...extra });
const notify = () => wss.clients.forEach((ws) => ws.send(JSON.stringify({ type: 'changed' })));

before(async () => {
  assert(executablePath, 'Chromium is required for chat interactions');
  const js = (await esbuild.build({ entryPoints: ['packages/ui-default/components/class_chat/controller.ts'], absWorkingDir: root,
    bundle: true, write: false, format: 'iife', globalName: 'ClassChat' })).outputFiles[0].text;
  const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/class_chat.page.styl'), 'utf8'));
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/chat.js') { res.setHeader('content-type', 'text/javascript'); res.end(js); return; }
    if (url.pathname === '/asset/picture') { imageRequests++; res.setHeader('content-type', 'image/png'); res.setHeader('cache-control', 'private, no-store'); res.end(image); return; }
    if (url.pathname === '/chat-api') {
      const uid = Number(url.searchParams.get('uid'));
      if (forbiddenUsers.has(uid)) { res.statusCode = 403; out(res, { error: { message: '当前账号暂时没有聊天权限。' } }); return; }
      if (req.method === 'POST') {
        const chunks = []; for await (const part of req) chunks.push(part);
        const body = Buffer.concat(chunks).toString();
        const multipart = req.headers['content-type']?.startsWith('multipart/form-data');
        let value;
        if (multipart) {
          const field = (name) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1];
          value = { operation: field('operation'), peerUid: Number(field('peerUid')), domainId: field('domainId'), clientId: field('clientId'), text: field('text') };
          const imageUpload = /Content-Type: image\/png/.test(body);
          value.attachment = imageUpload ? { name: '截图.png', mime: 'image/png', size: image.length, url: '/asset/picture' }
            : { name: '练习.py', mime: 'application/octet-stream', size: 18, url: '/asset/download' };
        } else value = JSON.parse(body);
        requests.push({ uid, value, multipart });
        if (value.operation === 'read') {
          records.filter((m) => m.from === Number(value.peerUid) && m.to === uid && m.id <= value.through).forEach((m) => { m.read = true; });
          out(res, { ok: true }); notify(); return;
        }
        if (value.operation === 'send') {
          const existing = records.find((item) => item.from === uid && item.clientId === value.clientId);
          if (existing) { out(res, { message: existing, usedBytes: 5000 }); return; }
          const item = message(uid, Number(value.peerUid), value.text, { clientId: value.clientId,
            ...(value.snapshot ? { kind: 'snapshot', snapshot: { ...value.snapshot, title: '三位数相加', url: '/snapshot/sent' } } : {}),
            ...(value.attachment ? { kind: value.attachment.mime.startsWith('image/') ? 'image' : 'file', attachment: value.attachment } : {}) });
          records.push(item);
          if (failResponseOnce) { failResponseOnce = false; res.statusCode = 503; out(res, { error: { message: '连接中断，请重试。' } }); return; }
          out(res, { message: item, usedBytes: 5000, quotaBytes: 52428800 }); notify(); return;
        }
      }
      const peer = Number(url.searchParams.get('peerUid'));
      const quota = { quotaBytes: 52428800, maxFileBytes: 10485760, maxImageBytes: 5242880 };
      if (peer) {
        const items = records.filter((m) => m.from === uid && m.to === peer || m.from === peer && m.to === uid);
        out(res, { messages: items, hasMore: false, usedBytes: 5000, ...quota }); return;
      }
      const ids = uid === 2 ? [40, 41] : multipleTeachers ? [2, 3] : [2];
      const peers = ids.map((id) => {
        const items = records.filter((m) => m.from === uid && m.to === id || m.from === id && m.to === uid);
        return { uid: id, name: names[id], domainId: 'classroom', online: onlineStudents.has(id), unread: items.filter((m) => m.to === uid && !m.read).length,
          lastMessage: items.at(-1)?.text || '', lastAt: items.at(-1)?.createdAt };
      });
      out(res, { peers, canTeach: uid === 2, unread: peers.reduce((sum, p) => sum + p.unread, 0), ...quota }); return;
    }
    const uid = Number(url.searchParams.get('uid')) || 40;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f0f3f5;color:#253a4c;font-family:Arial,"PingFang SC",sans-serif}nav.demo{background:white;padding:22px 70px;border-bottom:1px solid #dae2e9}main{margin:60px;max-width:900px;padding:40px;background:white;border-radius:20px;line-height:2}h1{font-size:30px}${css}</style><nav class="demo"><b>OneByOne</b>　首页　　题库　　训练　　作业</nav><main><h1>三位数相加</h1><h2>题目描述</h2><p>读入三个整数，计算它们的和。</p><div id="scratchpad"><div id="editor"></div></div></main>
    <script>window.UiContext={classChat:{problem:{pid:54,domainId:'classroom',grant:'fixture-grant'}}};window.UserContext={_id:${uid}};window.currentCode='a, b, c = map(int, input().split())\\nprint(a + b + c)';window.editor={getDomNode:()=>document.querySelector('#editor'),getValue:()=>window.currentCode};window.audioCount=0;window.toneCount=0;window.AudioContext=class {constructor(){window.audioCount++;this.state='running';this.currentTime=0;this.destination={};}resume(){return Promise.resolve()}close(){return Promise.resolve()}createOscillator(){return {type:'',frequency:{value:0},connect(){},disconnect(){},start(){window.toneCount++},stop(){}}}createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}};</script>
    <script src="/chat.js"></script><script>window.disposeChat=ClassChat.installClassChat({enabled:true,uid:${uid},canTeach:${uid === 2},name:${JSON.stringify(names[uid])},apiUrl:'/chat-api?uid=${uid}',socketUrl:'/socket?uid=${uid}'});</script>`);
  });
  wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'ready' })));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); wss?.clients.forEach((ws) => ws.terminate()); if (server) await new Promise((resolve) => server.close(resolve)); });
async function fixture(uid = 40, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/?uid=${uid}`);
  await page.waitForSelector('.class-chat__launcher');
  await page.waitForFunction(() => document.querySelectorAll('[data-peer-uid]').length > 0);
  return { context, page, errors };
}
const reset = () => { records = []; requests = []; sequence = 0; failResponseOnce = false; onlineStudents = new Set([40]); imageRequests = 0; multipleTeachers = false; forbiddenUsers = new Set(); };

it('student unread survives until viewed, teacher remains silent, and private chat never auto-opens', async () => {
  reset(); records.push(message(2, 40, '先看一下输入格式，等你回复。'));
  const student = await fixture();
  assert.equal(await student.page.locator('.class-chat__badge').textContent(), '1');
  assert.equal(await student.page.locator('.class-chat__panel').isVisible(), false);
  assert.equal(requests.filter((r) => r.value.operation === 'read').length, 0);
  assert.equal(await student.page.locator('[data-live-share-private] .class-chat__launcher').count(), 1);
  await student.page.locator('h1').click();
  assert.equal(await student.page.evaluate(() => toneCount), 2);
  await student.page.locator('.class-chat__launcher').click();
  await student.page.waitForSelector('.class-chat__message');
  await student.page.waitForFunction(() => document.querySelector('.class-chat__badge').hidden);
  assert(records[0].read);
  const teacher = await fixture(2);
  await teacher.page.locator('.class-chat__launcher').click();
  await teacher.page.locator('[data-peer-uid="40"]').click();
  assert.equal(await teacher.page.evaluate(() => audioCount), 0);
  assert.equal(await teacher.page.locator('[data-snapshot]').isVisible(), false);
  assert.deepEqual(student.errors, []); assert.deepEqual(teacher.errors, []);
  await student.context.close(); await teacher.context.close();
});

it('text is escaped, Enter sends once, Shift+Enter inserts newline and snapshots freeze exact current code', async () => {
  reset(); const { context, page, errors } = await fixture();
  await page.locator('.class-chat__launcher').click();
  const input = page.locator('.class-chat__input');
  await input.fill('<img src=x onerror="window.bad=true">老师好');
  await input.press('Shift+Enter'); await input.type('第二行');
  assert.equal(records.length, 0);
  await input.press('Enter');
  await page.waitForSelector('.class-chat__message');
  assert.equal(records.length, 1);
  assert(records[0].text.includes('\n第二行'));
  assert.equal(await page.locator('.class-chat__text img').count(), 0);
  assert.equal(await page.evaluate(() => !!window.bad), false);
  await page.locator('[data-snapshot]').click();
  await page.waitForSelector('.class-chat__code-card');
  const frozen = records[1].snapshot.code;
  await page.evaluate(() => { currentCode = 'print("later")'; });
  assert(frozen.includes('print(a + b + c)'));
  assert.equal(records[1].snapshot.grant, 'fixture-grant');
  assert.equal(await page.locator('.class-chat__code-card').getAttribute('href'), `${origin}/snapshot/sent`);
  assert.deepEqual(errors, []); await context.close();
});

it('teacher switching conversations keeps per-student drafts and only selected student receives a send', async () => {
  reset(); records.push(message(40, 2, '老师，这里我还不太理解。'), message(41, 2, '今天的练习完成啦！'));
  const { context, page, errors } = await fixture(2);
  await page.locator('.class-chat__launcher').click();
  await page.locator('[data-peer-uid="40"]').click();
  await page.locator('.class-chat__input').fill('当当，我们从输入开始看。');
  await page.locator('[data-peer-uid="41"]').click();
  assert.equal(await page.locator('.class-chat__input').inputValue(), '');
  await page.locator('.class-chat__input').fill('橙子，做得很好。');
  await page.locator('.class-chat__send').click();
  await page.waitForFunction(() => document.querySelector('.class-chat__input').value === '');
  assert.equal(records.at(-1).to, 41);
  await page.locator('[data-peer-uid="40"]').click();
  assert.equal(await page.locator('.class-chat__input').inputValue(), '当当，我们从输入开始看。');
  await page.screenshot({ path: '/tmp/onebyone-class-chat-teacher.png' });
  assert.deepEqual(errors, []); await context.close();
});

it('oversize files are blocked before upload, selected attachment can be removed and a small file sends', async () => {
  reset(); const { context, page, errors } = await fixture();
  await page.locator('.class-chat__launcher').click();
  await page.locator('[data-file-input]').setInputFiles({ name: 'large.zip', mimeType: 'application/zip', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  assert.match(await page.locator('.class-chat__feedback').textContent(), /最大 10 MB/);
  assert.equal(requests.filter((r) => r.multipart).length, 0);
  await page.locator('[data-file-input]').setInputFiles({ name: '练习.py', mimeType: 'text/plain', buffer: Buffer.from('print("hello")') });
  assert.equal(await page.locator('.class-chat__attachment').isVisible(), true);
  await page.getByRole('button', { name: '取消附件' }).click();
  assert.equal(await page.locator('.class-chat__attachment').isVisible(), false);
  await page.locator('[data-file-input]').setInputFiles({ name: '练习.py', mimeType: 'text/plain', buffer: Buffer.from('print("hello")') });
  await page.locator('.class-chat__send').click(); await page.waitForSelector('.class-chat__file-link');
  assert.equal(requests.filter((r) => r.multipart).length, 1);
  assert.equal(records.at(-1).to, 2);
  assert.deepEqual(errors, []); await context.close();
});

it('mobile remains within viewport and draggable avatar remembers position across navigation', async () => {
  reset(); const { context, page, errors } = await fixture(40, { width: 390, height: 844 });
  const first = await page.locator('.class-chat__launcher').boundingBox();
  await page.mouse.move(first.x + 20, first.y + 20); await page.mouse.down();
  await page.mouse.move(60, 190, { steps: 5 }); await page.mouse.up();
  assert.equal(await page.locator('.class-chat__panel').isVisible(), false);
  const moved = await page.locator('.class-chat__launcher').boundingBox();
  await page.reload(); await page.waitForSelector('.class-chat__launcher');
  const restored = await page.locator('.class-chat__launcher').boundingBox();
  assert(Math.abs(restored.x - moved.x) < 2 && Math.abs(restored.y - moved.y) < 2);
  await page.locator('.class-chat__launcher').click(); await page.waitForSelector('.class-chat__panel', { state: 'visible' });
  const panel = await page.locator('.class-chat__panel').boundingBox();
  assert(panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= 390 && panel.y + panel.height <= 844);
  assert.equal(await page.locator('.class-chat__sidebar').isVisible(), false);
  await page.waitForTimeout(220);
  await page.screenshot({ path: '/tmp/onebyone-class-chat-student-mobile.png' });
  assert.deepEqual(errors, []); await context.close();
});

it('new websocket message updates unread live and students see image and snapshot cards', async () => {
  reset(); const { context, page, errors } = await fixture();
  records.push(message(2, 40, '这一步可以这样理解。', { kind: 'image', attachment: { name: '示意图.png', size: image.length, mime: 'image/png', url: '/asset/picture' } }));
  notify();
  await page.waitForFunction(() => document.querySelector('.class-chat__badge').textContent === '1');
  await page.locator('.class-chat__launcher').click();
  await page.waitForSelector('.class-chat__image');
  await page.waitForFunction(() => document.querySelector('.class-chat__image').naturalWidth > 0);
  await page.locator('[data-snapshot]').click(); await page.waitForSelector('.class-chat__code-card');
  await page.screenshot({ path: '/tmp/onebyone-class-chat-student.png' });
  assert.deepEqual(errors, []); await context.close();
});

it('retry after an ambiguous network failure reuses the message identity and preserves the draft', async () => {
  reset(); const { context, page, errors } = await fixture();
  await page.locator('.class-chat__launcher').click();
  await page.evaluate(() => { crypto.randomUUID = undefined; });
  await page.locator('.class-chat__input').fill('老师，这条消息请帮我看看。');
  failResponseOnce = true;
  await page.locator('.class-chat__send').click();
  await page.waitForSelector('.class-chat__feedback.is-error');
  assert.equal(await page.locator('.class-chat__input').inputValue(), '老师，这条消息请帮我看看。');
  assert.equal(records.length, 1);
  await page.locator('.class-chat__send').click();
  await page.waitForFunction(() => document.querySelector('.class-chat__input').value === '');
  const sends = requests.filter((r) => r.value.operation === 'send');
  assert.equal(sends.length, 2); assert.equal(sends[0].value.clientId, sends[1].value.clientId);
  assert.match(sends[0].value.clientId, /^[a-zA-Z0-9_-]{8,96}$/);
  assert.equal(records.length, 1);
  assert.deepEqual(errors, []); await context.close();
});

it('pasting a copied screenshot previews it, accepts a caption and sends with Enter', async () => {
  reset(); const { context, page, errors } = await fixture();
  await page.locator('.class-chat__launcher').click();
  const prevented = await page.evaluate((base64) => {
    const data = new DataTransfer();
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    data.items.add(new File([bytes], '截图.png', { type: 'image/png' }));
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    document.querySelector('.class-chat__input').dispatchEvent(event);
    return event.defaultPrevented;
  }, image.toString('base64'));
  assert.equal(prevented, true);
  await page.waitForFunction(() => document.querySelector('.class-chat__attachment img')?.naturalWidth > 0);
  assert.equal(records.length, 0, 'pasting never sends before the learner is ready');
  await page.locator('.class-chat__input').fill('老师，我截图圈出了这一处。');
  await page.locator('.class-chat__input').press('Enter');
  await page.waitForSelector('.class-chat__message .class-chat__image');
  assert.equal(records.length, 1); assert.equal(records[0].kind, 'image');
  assert.equal(records[0].text, '老师，我截图圈出了这一处。');
  assert.equal(await page.locator('.class-chat__attachment').isVisible(), false);
  assert.deepEqual(errors, []); await context.close();
});

it('clipboard items fallback works on the open panel, while text and outside-page pastes stay native', async () => {
  reset(); const { context, page, errors } = await fixture();
  await page.locator('.class-chat__launcher').click();
  const states = await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const file = new File([bytes], '截图.png', { type: 'image/png' });
    const textData = new DataTransfer(); textData.setData('text/plain', '普通文字');
    const plain = new ClipboardEvent('paste', { clipboardData: textData, bubbles: true, cancelable: true });
    document.querySelector('.class-chat__input').dispatchEvent(plain);
    const outsideData = new DataTransfer(); outsideData.items.add(file);
    const outside = new ClipboardEvent('paste', { clipboardData: outsideData, bubbles: true, cancelable: true });
    document.querySelector('main').dispatchEvent(outside);
    const outsideAttached = !document.querySelector('.class-chat__attachment').hidden;
    const fallback = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(fallback, 'clipboardData', { value: { files: [], items: [{ kind: 'file', getAsFile: () => file }] } });
    document.querySelector('.class-chat__panel').dispatchEvent(fallback);
    return { plain: plain.defaultPrevented, outside: outside.defaultPrevented, outsideAttached, fallback: fallback.defaultPrevented };
  }, image.toString('base64'));
  assert.deepEqual(states, { plain: false, outside: false, outsideAttached: false, fallback: true });
  await page.waitForFunction(() => document.querySelector('.class-chat__attachment img')?.naturalWidth > 0);
  assert.deepEqual(errors, []); await context.close();
});

it('clipboard screenshots enforce the image size limit and explain a multi-image paste', async () => {
  reset(); const { context, page, errors } = await fixture();
  await page.locator('.class-chat__launcher').click();
  await page.evaluate(() => {
    const data = new DataTransfer(); data.items.add(new File([new Uint8Array(5 * 1024 * 1024 + 1)], '大截图.png', { type: 'image/png' }));
    document.querySelector('.class-chat__input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  assert.match(await page.locator('.class-chat__feedback').textContent(), /图片最大 5/);
  assert.equal(await page.locator('.class-chat__attachment').isVisible(), false);
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], '截图一.png', { type: 'image/png' }));
    data.items.add(new File([bytes], '截图二.png', { type: 'image/png' }));
    document.querySelector('.class-chat__input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, image.toString('base64'));
  assert.equal(await page.locator('.class-chat__attachment strong').textContent(), '截图一.png');
  assert.match(await page.locator('.class-chat__feedback').textContent(), /第一张图片/);
  assert.equal(records.length, 0);
  assert.deepEqual(errors, []); await context.close();
});

it('only teachers see student presence and outgoing read receipts, with live updates', async () => {
  reset(); records.push(message(2, 40, '先看看这个例子。'));
  const teacher = await fixture(2);
  await teacher.page.locator('.class-chat__launcher').click();
  await teacher.page.locator('[data-peer-uid="40"]').click();
  assert.match(await teacher.page.locator('.class-chat__connection').textContent(), /^在线/);
  assert.equal(await teacher.page.locator('[data-peer-uid="40"] .class-chat__presence-dot.is-online').count(), 1);
  assert.equal(await teacher.page.locator('[data-peer-uid="41"] .class-chat__presence-dot:not(.is-online)').count(), 1);
  assert.equal(await teacher.page.locator('.class-chat__receipt').textContent(), '未读');
  records[0].read = true; onlineStudents.delete(40); notify();
  await teacher.page.waitForFunction(() => document.querySelector('.class-chat__receipt')?.textContent === '已读');
  assert.match(await teacher.page.locator('.class-chat__connection').textContent(), /^离线/);
  const student = await fixture(40);
  records.push(message(40, 2, '我看懂了。', { read: true })); notify();
  await student.page.locator('.class-chat__launcher').click();
  await student.page.waitForFunction(() => document.querySelectorAll('.class-chat__message').length === 2);
  assert.equal(await student.page.locator('.class-chat__presence-dot, .class-chat__receipt').count(), 0,
    'student UI ignores online/read metadata even if an API mistakenly includes it');
  assert.equal(await student.page.locator('.class-chat__connection').textContent(), '私聊 · 仅你和老师可见');
  assert.equal(await student.page.locator('.class-chat__connection.has-presence').count(), 0);
  await teacher.page.screenshot({ path: '/tmp/onebyone-class-chat-teacher-presence.png' });
  assert.deepEqual(teacher.errors, []); assert.deepEqual(student.errors, []);
  await teacher.context.close(); await student.context.close();
});

it('snapshot history renders the bounded preview without requiring the full code or problem content', async () => {
  reset(); records.push(message(40, 2, '', { kind: 'snapshot', snapshot: { title: '三位数相加', pid: 54,
    domainId: 'classroom', lang: 'py.py3', codePreview: 'a = 1\nprint(a)', url: '/snapshot/sent' } }));
  const { context, page, errors } = await fixture(2);
  await page.locator('.class-chat__launcher').click();
  await page.locator('[data-peer-uid="40"]').click();
  await page.waitForSelector('.class-chat__code-card');
  assert.equal(await page.locator('.class-chat__code-card pre').textContent(), 'a = 1\nprint(a)');
  assert.deepEqual(errors, []); await context.close();
});

it('read receipts and new messages reuse loaded private images without another download', async () => {
  reset(); records.push(message(2, 40, '', { kind: 'image', attachment: { name: '示意图.png', size: image.length, mime: 'image/png', url: '/asset/picture' } }));
  const { context, page, errors } = await fixture(2);
  await page.locator('.class-chat__launcher').click();
  await page.locator('[data-peer-uid="40"]').click();
  await page.waitForFunction(() => document.querySelector('.class-chat__message .class-chat__image')?.naturalWidth > 0);
  await page.evaluate(() => { window.originalChatImage = document.querySelector('.class-chat__image'); });
  assert.equal(imageRequests, 1);
  records[0].read = true; notify();
  await page.waitForFunction(() => document.querySelector('.class-chat__receipt')?.textContent === '已读');
  records.push(message(40, 2, '看到图片啦！')); notify();
  await page.waitForFunction(() => document.querySelectorAll('.class-chat__message').length === 2);
  assert.equal(await page.evaluate(() => originalChatImage === document.querySelector('.class-chat__image')), true);
  assert.equal(imageRequests, 1, 'private no-store image must not refetch on ordinary chat refresh');
  assert.deepEqual(errors, []); await context.close();
});

it('a hidden mobile conversation does not mark incoming messages read while the learner views contacts', async () => {
  reset(); multipleTeachers = true; records.push(message(2, 40, '第一条消息'));
  const { context, page, errors } = await fixture(40, { width: 390, height: 844 });
  await page.locator('.class-chat__launcher').click();
  await page.locator('[data-peer-uid="2"]').click();
  await page.waitForFunction(() => document.querySelector('.class-chat__badge').hidden);
  await page.locator('[data-back]').click();
  assert.equal(await page.locator('.class-chat__messages').isVisible(), false);
  records.push(message(2, 40, '这条还没有打开看')); notify();
  await page.waitForFunction(() => document.querySelectorAll('.class-chat__message').length === 2);
  assert.equal(records.at(-1).read, false, 'hidden panes are not read receipts');
  assert.equal(await page.locator('.class-chat__badge').textContent(), '1');
  await page.locator('[data-peer-uid="2"]').click();
  await page.waitForFunction(() => document.querySelector('.class-chat__badge').hidden);
  assert.equal(records.at(-1).read, true);
  assert.deepEqual(errors, []); await context.close();
});

it('revoked authentication clears stale unread reminders and reconnects after access is restored', async () => {
  reset(); records.push(message(2, 40, '尚未查看的老师消息'));
  const { context, page, errors } = await fixture();
  await page.locator('h1').click();
  assert.equal(await page.evaluate(() => toneCount), 2);
  forbiddenUsers.add(40); notify();
  await page.waitForFunction(() => document.querySelector('.class-chat__badge').hidden);
  await page.evaluate(() => { const original = Date.now.bind(Date); Date.now = () => original() + 20000; });
  await page.locator('h1').click();
  assert.equal(await page.evaluate(() => toneCount), 2, 'old unread cannot keep ringing after authorization is lost');
  forbiddenUsers.delete(40);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => !document.querySelector('.class-chat__badge').hidden);
  assert.equal(await page.locator('.class-chat__badge').textContent(), '1');
  assert.deepEqual(errors, []); await context.close();
});
