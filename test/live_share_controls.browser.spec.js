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
  await page.setContent('<body style="margin:0;background:#eef2f4"><button id="outside">普通页面按钮</button><div class="live-share-overlay"></div></body>');
  await page.addStyleTag({ content: css }); await page.addScriptTag({ content: js });
  await page.evaluate((value) => {
    window.calls = [];
    window.controls = ShareControls.createTeacherShareControls({ onSwitch: uid => calls.push(['switch', uid ?? null]),
      onEnd: () => calls.push(['end']), onChooseStudent: () => calls.push(['choose']) });
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
