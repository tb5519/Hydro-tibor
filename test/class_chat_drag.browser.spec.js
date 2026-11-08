const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { playwright = require(location); break; } catch { /* Local runtime. */ }
}
const executablePath = [playwright?.chromium.executablePath(),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')].find((entry) => entry && fs.existsSync(entry));
let browser; let bundle;
const storageKey = 'onebyone.class-chat.panel-position.v1:';
before(async () => {
  assert(executablePath, 'Chromium is required for draggable chat regression');
  bundle = (await esbuild.build({ entryPoints: [path.resolve(__dirname, '../packages/ui-default/components/class_chat/drag.ts')],
    bundle: true, write: false, format: 'iife', globalName: 'ChatDrag' })).outputFiles[0].text;
  browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => browser?.close());
async function fixture() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://chat-drag.test/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{margin:0}#panel{position:fixed;right:28px;bottom:28px;display:flex;flex-direction:column;width:560px;height:min(660px,calc(100dvh - 72px));min-height:400px;border:1px solid #abc;overflow:hidden;box-sizing:border-box;background:white}
    #panel[hidden]{display:none}#handle{display:flex;justify-content:space-between;padding:16px;touch-action:none;user-select:none;cursor:grab;background:#edf3f8}#handle h2{margin:0}#body{padding:20px;flex:1}#body textarea{height:140px;width:90%}
    @media(max-width:640px){#panel{right:10px;bottom:10px;width:calc(100vw - 20px);height:calc(100dvh - 40px)}}
    </style><section id="panel" hidden><header id="handle"><h2>师生消息</h2><input id="search" placeholder="搜索"><button id="close">×</button></header><div id="body"><textarea id="message">可以选择的聊天内容</textarea><a id="link" href="#">资料链接</a></div></section>
    <script>${bundle}</script><script>
    window.panel=document.querySelector('#panel');window.handle=document.querySelector('#handle');
    window.install=(uid=2)=>{window.abort=new AbortController();window.drag=ChatDrag.installChatPanelDrag(panel,handle,uid,abort.signal);};
    window.open=()=>{panel.hidden=false;drag.refresh();};install();open();
    </script>` }));
  await page.goto('https://chat-drag.test/');
  await page.waitForFunction(() => handle.dataset.chatPanelDraggable === 'true');
  return { context, page, errors };
}
const box = (page) => page.locator('#panel').boundingBox();
async function dragHeader(page, dx, dy, options) {
  const h = await page.locator('#handle h2').boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down(options); await page.mouse.move(h.x + h.width / 2 + dx, h.y + h.height / 2 + dy, { steps: 8 }); await page.mouse.up(options);
}
function near(actual, expected, tolerance = 1) { assert(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`); }

it('moves by the title, clamps to viewport, remembers per-account location and restores after reopening', async () => {
  const { context, page, errors } = await fixture();
  try {
    const before = await box(page); await dragHeader(page, -250, -90);
    const moved = await box(page); near(moved.x, before.x - 250); near(moved.y, before.y - 90);
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), `${storageKey}2`);
    assert(saved.x > 0 && saved.x < 1 && saved.y > 0 && saved.y < 1);
    await page.evaluate(() => { panel.hidden = true; panel.hidden = false; drag.refresh(); });
    near((await box(page)).x, moved.x); near((await box(page)).y, moved.y);
    await page.reload(); await page.waitForFunction(() => handle.dataset.chatPanelDraggable === 'true');
    near((await box(page)).x, moved.x); near((await box(page)).y, moved.y);
    await page.evaluate(() => { drag.dispose(); install(40); open(); });
    near((await box(page)).x, before.x); near((await box(page)).y, before.y);
    await dragHeader(page, -2000, -1000); const clamped = await box(page);
    near(clamped.x, 12); near(clamped.y, 12);
    await dragHeader(page, 3000, 2000); const opposite = await box(page);
    near(opposite.x + opposite.width, 1428); near(opposite.y + opposite.height, 888);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

it('buttons, inputs, message text and right-button gestures remain normal interactions', async () => {
  const { context, page, errors } = await fixture();
  try {
    const before = await box(page);
    for (const selector of ['#close', '#search', '#message', '#link']) {
      const target = await page.locator(selector).boundingBox();
      await page.mouse.move(target.x + 5, target.y + 5); await page.mouse.down();
      await page.mouse.move(target.x + 60, target.y + 20); await page.mouse.up();
      assert.deepEqual(await box(page), before, `${selector} must not move the conversation`);
    }
    await dragHeader(page, -100, -40, { button: 'right' }); assert.deepEqual(await box(page), before);
    await page.locator('#message').fill('输入和选择消息不受拖动影响');
    assert.equal(await page.locator('#message').inputValue(), '输入和选择消息不受拖动影响');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

it('handles small screens and returns to the desktop preference without saving a cramped mobile position', async () => {
  const { context, page, errors } = await fixture();
  try {
    await dragHeader(page, -280, -70); const desktop = await box(page);
    const saved = await page.evaluate((key) => localStorage.getItem(key), `${storageKey}2`);
    await page.setViewportSize({ width: 390, height: 680 });
    await page.waitForFunction(() => handle.dataset.chatPanelDraggable === 'false');
    const mobile = await box(page);
    assert(mobile.x >= 11 && mobile.y >= 11 && mobile.x + mobile.width <= 379 && mobile.y + mobile.height <= 669);
    await dragHeader(page, 70, 30); assert.deepEqual(await box(page), mobile);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), `${storageKey}2`), saved);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => handle.dataset.chatPanelDraggable === 'true');
    near((await box(page)).x, desktop.x); near((await box(page)).y, desktop.y);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

it('visual viewport zoom, panning and the keyboard keep the full panel reachable; abort removes listeners and styles', async () => {
  const { context, page, errors } = await fixture();
  try {
    await page.evaluate(() => {
      drag.dispose(); window.vv = Object.assign(new EventTarget(), { offsetLeft: 250, offsetTop: 200, width: 700, height: 300 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv }); install(); open();
    });
    let actual = await box(page);
    assert(actual.x >= 262 && actual.y >= 212 && actual.x + actual.width <= 938 && actual.y + actual.height <= 488);
    await page.evaluate(() => { vv.offsetLeft = 300; vv.offsetTop = 330; vv.width = 350; vv.height = 220; vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll')); });
    await page.waitForFunction(() => Number.parseFloat(panel.style.top) >= 342);
    actual = await box(page);
    assert(actual.x >= 312 && actual.y >= 342 && actual.x + actual.width <= 638 && actual.y + actual.height <= 538);
    await page.evaluate(() => abort.abort());
    assert.equal(await page.locator('#handle').getAttribute('data-chat-panel-draggable'), null);
    assert.equal(await page.locator('#panel').getAttribute('style'), '');
    const disposed = await box(page);
    await page.evaluate(() => { vv.offsetTop = 0; vv.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('resize')); });
    await dragHeader(page, -120, -50); assert.deepEqual(await box(page), disposed);
    await page.evaluate(() => { drag.refresh(); panel.hidden = true; panel.hidden = false; });
    assert.equal(await page.locator('#panel').getAttribute('style'), '');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
