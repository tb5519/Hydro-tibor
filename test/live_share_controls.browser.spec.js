const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');
const stylus = require('stylus');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { playwright = require(location); break; } catch { /* Local runtime. */ }
}
const root = path.resolve(__dirname, '..');
const executablePath = [playwright?.chromium.executablePath(),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')].find((entry) => entry && fs.existsSync(entry));
let browser; let js; let css;
before(async () => {
  assert(executablePath, 'Chromium is required for shared classroom controls');
  js = (await esbuild.build({ entryPoints: ['packages/ui-default/components/live_share/share_controls.ts'], absWorkingDir: root,
    bundle: true, write: false, format: 'iife', globalName: 'ShareControls' })).outputFiles[0].text;
  css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share.page.styl'), 'utf8'));
  browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => browser?.close());
async function fixture(state, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  await page.route('https://classroom.test/**', route => route.fulfill({ contentType: 'text/html', body:
    '<body style="margin:0;background:#eef2f4"><button id="outside">普通页面按钮</button><div class="live-share-overlay"></div></body>' }));
  await page.goto('https://classroom.test/');
  await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  await page.evaluate((value) => {
    window.calls = [];
    window.makeControls = (userId = 2) => ShareControls.createTeacherShareControls({ userId,
      onSwitch: uid => calls.push(['switch', uid ?? null]), onEnd: () => calls.push(['end']), onChooseStudent: () => calls.push(['choose']) });
    window.controls = makeControls();
    controls.update(value);
  }, state);
  return page;
}
const assist = { mode: 'assist', studentName: '当当', status: '已连接 · 可直接点击和编辑', canChooseStudent: true };
const broadcast = { mode: 'broadcast', label: '我的画面', status: '1 位学员正在观看', students: [{ uid: 40, name: '当当', online: true }] };
it('right-side controls remain clickable above the shared screen and both actions are direct', async () => {
  const page = await fixture(assist);
  try {
    const card = page.locator('[data-teacher-share-controls]');
    const bounds = await card.boundingBox();
    assert(bounds.x > 1200 && bounds.x + bounds.width <= 1440);
    assert(await card.evaluate(node => document.elementFromPoint(node.getBoundingClientRect().left + 20, node.getBoundingClientRect().top + 20).closest('[data-teacher-share-controls]') === node));
    await page.getByRole('button', { name: '分享我的画面', exact: true }).click();
    await page.getByRole('button', { name: '切换学员', exact: true }).click();
    await page.getByRole('button', { name: '断开共享', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => calls), [['switch', null], ['choose'], ['end']]);
    assert.equal(await page.locator('.live-share-controls__name').textContent(), '当当');
  } finally { await page.close(); }
});
it('one student switches immediately and mode updates retain a single toolbar', async () => {
  const page = await fixture(assist);
  try {
    await page.evaluate(value => controls.update(value), broadcast);
    await page.getByRole('button', { name: '查看学员画面', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => calls), [['switch', 40]]);
    assert.equal(await page.locator('[data-teacher-share-controls]').count(), 1);
    assert.equal(await page.locator('[data-broadcast-stop]').count(), 1);
    await page.getByRole('button', { name: '结束分享', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => calls), [['switch', 40], ['end']]);
    await page.evaluate(() => controls.update(null));
    assert.equal(await page.locator('[data-teacher-share-controls]').isVisible(), false);
  } finally { await page.close(); }
});
it('multiple students show a compact chooser, disable offline students, and Escape restores focus', async () => {
  const state = { ...broadcast, students: [...broadcast.students, { uid: 41, name: '橙子', online: false }, { uid: 42, name: '睿睿', online: true }] };
  const page = await fixture(state);
  try {
    const switchButton = page.getByRole('button', { name: '查看学员画面', exact: true });
    await switchButton.click();
    assert.equal(await page.locator('[data-student-uid="41"]').isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => calls), []);
    await page.keyboard.press('Escape');
    assert.equal(await switchButton.evaluate(node => node === document.activeElement), true);
    assert.equal(await page.getByRole('group', { name: '选择要查看的学员' }).isVisible(), false);
    await switchButton.click();
    await page.locator('[data-student-uid="42"]').click();
    assert.deepEqual(await page.evaluate(() => calls), [['switch', 42]]);
    await switchButton.click();
    await page.evaluate(() => dispatchEvent(new Event('onebyone:platform-gesture')));
    assert.equal(await page.getByRole('group', { name: '选择要查看的学员' }).isVisible(), false);
  } finally { await page.close(); }
});
it('pending transitions and unavailable pages prevent repeated switch and stop requests', async () => {
  const page = await fixture({ ...assist, busy: true });
  try {
    assert.equal(await page.getByRole('button', { name: '分享我的画面' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: '断开共享' }).isDisabled(), true);
    await page.evaluate(() => document.querySelector('[data-share-end]').click());
    assert.deepEqual(await page.evaluate(() => calls), []);
    await page.evaluate(value => controls.update({ ...value, switchDisabled: true }), assist);
    assert.equal(await page.getByRole('button', { name: '分享我的画面' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: '断开共享' }).isDisabled(), false);
    await page.getByRole('button', { name: '断开共享' }).click();
    assert.deepEqual(await page.evaluate(() => calls), [['end']]);
  } finally { await page.close(); }
});
it('toolbar and long student chooser fit small and short viewports without horizontal overflow', async () => {
  const students = Array.from({ length: 12 }, (_, i) => ({ uid: 40 + i, name: `很长的学员名字 ${i}`, online: true }));
  for (const viewport of [{ width: 390, height: 620 }, { width: 320, height: 360 }, { width: 900, height: 320 }]) {
    const page = await fixture({ ...broadcast, students }, viewport);
    try {
      await page.getByRole('button', { name: '查看学员画面' }).click();
      for (const selector of ['[data-teacher-share-controls]', '.teacher-share-controls__picker']) {
        const bounds = await page.locator(selector).boundingBox();
        assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1,
          `${selector} must fit ${JSON.stringify(viewport)}: ${JSON.stringify(bounds)}`);
      }
    } finally { await page.close(); }
  }
});
it('dispose removes controls and ignores future state without disturbing the page', async () => {
  const page = await fixture(assist);
  try {
    await page.evaluate(value => { controls.dispose(); controls.dispose(); controls.update(value); }, broadcast);
    assert.equal(await page.locator('[data-teacher-share-controls]').count(), 0);
    assert.equal(await page.locator('.live-share-overlay').count(), 1);
    assert.deepEqual(await page.evaluate(() => calls), []);
  } finally { await page.close(); }
});
it('the collapse button really becomes a small pill and restores the direct controls', async () => {
  const page = await fixture(assist);
  try {
    const card = page.locator('[data-teacher-share-controls]');
    const expanded = await card.boundingBox();
    assert(expanded.height <= 110 && expanded.width <= 220, JSON.stringify(expanded));
    await page.getByRole('button', { name: '收起共享控制', exact: true }).click();
    const compact = await card.boundingBox();
    assert(compact.height <= 40 && compact.width <= 170, JSON.stringify(compact));
    assert(compact.height * compact.width < expanded.height * expanded.width / 3);
    assert.equal(await page.locator('[data-share-switch-mode]').isVisible(), false);
    assert.equal(await page.locator('[data-share-end]').isVisible(), false);
    assert.equal(await page.locator('.teacher-share-controls__name').isVisible(), true);
    const expand = page.getByRole('button', { name: '展开共享控制', exact: true });
    assert.equal(await expand.getAttribute('aria-expanded'), 'false');
    await expand.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-share-collapse]').getAttribute('aria-expanded'), 'true');
    await page.getByRole('button', { name: '分享我的画面', exact: true }).click();
    await page.getByRole('button', { name: '断开共享', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => calls), [['switch', null], ['end']]);
    await page.screenshot({ path: '/tmp/onebyone-share-controls-expanded.png' });
    await page.getByRole('button', { name: '收起共享控制', exact: true }).click();
    await page.screenshot({ path: '/tmp/onebyone-share-controls-compact.png' });
  } finally { await page.close(); }
});
it('dragging the heading does not activate controls and keeps its place through mode changes and child navigation', async () => {
  const page = await fixture(assist);
  try {
    const card = page.locator('[data-teacher-share-controls]');
    const heading = page.locator('[data-share-drag-handle]');
    const initial = await card.boundingBox(); const handle = await heading.boundingBox();
    await page.mouse.move(handle.x + 15, handle.y + 12); await page.mouse.down();
    await page.mouse.move(handle.x - 380, handle.y - 170, { steps: 12 }); await page.mouse.up();
    const dragged = await card.boundingBox();
    assert(dragged.x < initial.x - 350 && dragged.y < initial.y - 150);
    assert.deepEqual(await page.evaluate(() => calls), []);
    await page.getByRole('button', { name: '切换学员', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => calls), [['choose']]);
    await page.evaluate(value => {
      controls.update(value);
      const frame = document.createElement('iframe'); frame.srcdoc = '<h1>新的题目</h1>'; document.body.append(frame);
      dispatchEvent(new CustomEvent('onebyone:page-change', { detail: { window: frame.contentWindow, url: '/p/53' } }));
    }, broadcast);
    assert.deepEqual(await card.boundingBox(), dragged);
    await page.getByRole('button', { name: '收起共享控制', exact: true }).click();
    const compact = await card.boundingBox();
    await page.evaluate(value => controls.update(value), assist);
    const switched = await card.boundingBox();
    assert.equal(switched.y, compact.y);
    assert.equal(await card.evaluate(node => node.classList.contains('is-collapsed')), true);
    assert.equal(await page.locator('[data-teacher-share-controls]').count(), 1);
    await page.getByRole('button', { name: '展开共享控制', exact: true }).click();
    assert.deepEqual(await card.boundingBox(), dragged);
  } finally { await page.close(); }
});
it('teacher position and collapsed state survive recreation, and another teacher keeps independent preferences', async () => {
  const page = await fixture(assist);
  try {
    const card = page.locator('[data-teacher-share-controls]');
    await page.locator('[data-share-drag-handle]').focus();
    await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowUp');
    const moved = await card.boundingBox();
    await page.getByRole('button', { name: '收起共享控制', exact: true }).click();
    const compact = await card.boundingBox();
    await page.evaluate(value => { controls.dispose(); window.controls = makeControls(2); controls.update(value); }, assist);
    assert.deepEqual(await card.boundingBox(), compact);
    assert.equal(await page.getByRole('button', { name: '展开共享控制', exact: true }).isVisible(), true);
    await page.evaluate(value => { controls.dispose(); window.controls = makeControls(3); controls.update(value); }, assist);
    const other = await card.boundingBox();
    assert(other.x > moved.x && other.y > moved.y && other.height > compact.height);
    await page.evaluate(value => { controls.dispose(); window.controls = makeControls(2); controls.update(value); }, assist);
    assert.deepEqual(await card.boundingBox(), compact);
  } finally { await page.close(); }
});
it('dragging and saved edge positions remain visible after resize, including the student picker', async () => {
  const students = Array.from({ length: 12 }, (_, i) => ({ uid: i + 40, name: `学员 ${i}`, online: true }));
  const page = await fixture({ ...broadcast, students });
  try {
    const card = page.locator('[data-teacher-share-controls]');
    const handle = await page.locator('[data-share-drag-handle]').boundingBox();
    await page.mouse.move(handle.x + 15, handle.y + 12); await page.mouse.down();
    await page.mouse.move(-300, 1100, { steps: 8 }); await page.mouse.up();
    const lowerLeft = await card.boundingBox(); assert.equal(lowerLeft.x, 12); assert(Math.abs(lowerLeft.y + lowerLeft.height - 888) <= 1);
    await page.setViewportSize({ width: 320, height: 360 });
    await page.waitForFunction(() => document.querySelector('[data-teacher-share-controls]').getBoundingClientRect().bottom <= 360);
    await page.getByRole('button', { name: '查看学员画面', exact: true }).click();
    for (const selector of ['[data-teacher-share-controls]', '.teacher-share-controls__picker']) {
      const rect = await page.locator(selector).boundingBox();
      assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 320 && rect.y + rect.height <= 360, JSON.stringify(rect));
    }
    await page.keyboard.press('Escape');
    await page.evaluate(value => {
      controls.dispose(); localStorage.setItem('onebyone.teacher-share-controls.v1:2', JSON.stringify({ version: 1, x: -20, y: 30, collapsed: false }));
      window.controls = makeControls(); controls.update(value);
    }, assist);
    const restored = await card.boundingBox();
    assert.equal(restored.x, 12); assert(Math.abs(restored.y + restored.height - 348) <= 1);
  } finally { await page.close(); }
});
it('buttons and short pointer taps do not drag, and cancellation/disposal stop active dragging', async () => {
  const page = await fixture(assist);
  try {
    const card = page.locator('[data-teacher-share-controls]');
    const before = await card.boundingBox(); const handle = await page.locator('[data-share-drag-handle]').boundingBox();
    await page.mouse.move(handle.x + 12, handle.y + 12); await page.mouse.down();
    await page.mouse.move(handle.x + 14, handle.y + 13); await page.mouse.up();
    assert.deepEqual(await card.boundingBox(), before);
    const choose = await page.getByRole('button', { name: '切换学员', exact: true }).boundingBox();
    await page.mouse.move(choose.x + 10, choose.y + 10); await page.mouse.down(); await page.mouse.move(choose.x - 80, choose.y + 10); await page.mouse.up();
    assert.deepEqual(await card.boundingBox(), before);
    await page.evaluate(() => {
      const heading = document.querySelector('[data-share-drag-handle]');
      heading.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: 100, clientY: 100, bubbles: true }));
      dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 200, clientY: 150 }));
      dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7 }));
    });
    const cancelled = await card.boundingBox();
    await page.evaluate(() => dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 400, clientY: 400 })));
    assert.deepEqual(await card.boundingBox(), cancelled);
    await page.evaluate(() => controls.dispose()); await page.mouse.move(100, 100);
    assert.equal(await card.count(), 0); assert.deepEqual(await page.evaluate(() => calls), []);
  } finally { await page.close(); }
});
