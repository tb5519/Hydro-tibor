const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { it } = require('node:test');
const { build } = require('esbuild');
const nunjucks = require('nunjucks');
const { chromium, webkit } = require('playwright');
const stylus = require('stylus');
const rupture = require('rupture');

const ui = path.resolve(__dirname, '../packages/ui-default');
const contest = '周赛（11月16日-11月22日）';
const problem = 'B. 相邻重复列留一份（200分）';
const labels = ['返回比赛列表', contest, '题目列表', '排行榜', '打印', problem];
const nav = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(ui, 'templates')), { autoescape: true });
const domain = { _id: 'system', name: 'Python训练' };
const url = (route, args = {}) => args.uid ? '/student' : '/' + route;
function headerHTML() {
    const context = { page_name: 'contest_detail_problem', UiContext: { domain },
        handler: { request: { query: {} }, user: { _id: 1, uname: '练习学员', domains: [domain], hasPriv: () => true, hasPerm: () => false } },
        model: { system: { get: (key) => key === 'server.name' ? 'OneByOne' : true } }, PRIV: {}, perm: {},
        _: (value) => value, typeof: (value) => typeof value, url, avatarUrl: () => '/avatar.png', ui: { getNodes: () => [] },
        overrideNav: labels.map((displayName, i) => ({ name: 'item' + i, displayName, checker: () => true,
            args: { prefix: i === labels.length - 1 ? 'contest_detail_problem' : i === 1 ? 'contest_detail' : 'other' } })) };
    return nav.render('partials/nav.html', context) + '<div id="panel" class="slideout-panel"><div class="slideout-overlay"></div>'
        + nav.render('partials/header_mobile.html', context);
}

async function fixture(t, nativeTabs = false) {
    const executablePath = [process.env.HERO_CHROMIUM_PATH, chromium.executablePath(),
        path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((file) => file && fs.existsSync(file));
    let context;
    if (nativeTabs && process.env.SCRATCHPAD_NAV_BROWSER !== 'webkit') {
        // Chrome's ordinary tab activation produces real visibility changes.
        const server = await chromium.launchServer({ executablePath, args: ['--headless=new', '--remote-debugging-port=0'] });
        t.after(() => server.close());
        const profile = server.process().spawnargs.find(arg => arg.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
        const port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
        const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { noDefaults: true });
        context = browser.contexts()[0];
    } else {
        const browser = process.env.SCRATCHPAD_NAV_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath });
        t.after(() => browser.close());
        context = await browser.newContext();
    }
    const bundle = await build({ stdin: { contents: `
      import $ from 'jquery';
      import navigation from './components/navigation/navigation.page';
      import dropdown from './components/dropdown/dropdown.page';
      window.$ = $; navigation.beforeLoading(); dropdown.afterLoading(); navigation.afterLoading();
    `, resolveDir: ui }, bundle: true, write: false, define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'navigation-context', setup(builder) {
        builder.onResolve({ filter: /^vj\/(utils|components\/notification|components\/selectUser)$/ }, ({ path: dependency }) => ({ path: dependency, namespace: 'context' }));
        builder.onLoad({ filter: /.*/, namespace: 'context' }, ({ path: dependency }) => ({
            contents: dependency === 'vj/utils' ? `
              export const i18n = () => '更多', request = {}, tpl = String.raw;
              export * as mediaQuery from './utils/mediaQuery.ts';
              export const zIndexManager = { getNext: () => 100010 };
            ` : 'export default {}', resolveDir: ui,
        }));
        builder.onResolve({ filter: /^vj\// }, async ({ path: dependency }) => builder.resolve('./' + dependency.slice(3), { resolveDir: ui, kind: 'import-statement' }));
    } }] });
    const common = fs.readFileSync(path.join(ui, 'common/common.inc.styl'), 'utf8').replace('~vj', ui);
    const sourceCSS = stylus(common + "\n@import '" + ui + "/components/navigation/navigation.page.styl'\n@import '" + ui + "/components/scratchpad/scratchpad.page.styl'")
        .set('filename', path.join(ui, 'common/common.inc.styl')).use(rupture()).render();
    const dir = path.join(ui, 'public');
    const theme = require(path.join(dir, 'manifest.json'))['theme.css'].slice(1).split('?')[0];
    await context.route('http://nav.test/**', (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/avatar.png') return route.fulfill({ path: path.join(dir, 'favicon-32x32.png') });
        if (pathname === '/theme.css') return route.fulfill({ path: path.join(dir, theme) });
        if (pathname === '/changes.css') return route.fulfill({ contentType: 'text/css', body: sourceCSS });
        if (pathname === '/navigation.js') return route.fulfill({ contentType: 'application/javascript', body: bundle.outputFiles[0].text });
        if (/\.woff2?$/.test(pathname)) {
            const font = path.join(dir, path.basename(pathname));
            if (fs.existsSync(font)) return route.fulfill({ path: font });
        }
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html>
          <html class="hasjs layout--basic page--contest_detail_problem"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
          <link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/changes.css">
          <style>body{--font-family:Arial,sans-serif} #panel{display:flex;flex-direction:column}</style>
          <body class="mode--scratchpad header--collapsed">${headerHTML()}<div class="main">
          <div class="scratchpad-container" style="inset:0;width:100%;height:100%"><div id="scratchpad">
          <section class="scratchpad__coding-area" data-scratchpad-skin="true"><div class="scratchpad__workspace">
          <div class="scratchpad__toolbar flex-row"><div class="scratchpad__toolbar__actions"><select aria-label="编程语言"><option>Python 3</option></select></div>
          <div class="scratchpad__toolbar__views">${['主题','设置','评测记录'].map(name =>
            '<button class="scratchpad__toolbar__button enabled" onclick="window.used=this.textContent">' + name + '</button>').join('')}</div></div>
          </div></section></div></div></div></div><script>window.Hydro={}</script><script src="/navigation.js"></script></body></html>` });
    });
    return async (width) => {
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        await page.bringToFront();
        await page.setViewportSize({ width, height: 720 });
        await page.goto('http://nav.test/contest?scratchpad=1');
        await page.locator('.nav_more').waitFor({ state: 'attached' });
        return page;
    };
}
async function desktopFits(page) {
    await page.waitForFunction(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const header = box('#menu'), tools = box('.scratchpad__toolbar');
        const items = document.querySelectorAll('.domain-switcher__trigger, .nav__profile-link, .nav__list--main > li > a');
        const visible = [...items].map(link => link.getBoundingClientRect()).filter(r => r.width).sort((a, b) => a.left - b.left);
        return header.width > 0 && visible.every((r, i) => r.top >= header.top - 1 && r.bottom <= header.bottom + 1
            && r.bottom <= tools.top + 1 && r.left >= header.left && r.right <= header.right + 1
            && (i === 0 || visible[i - 1].right <= r.left + 1));
    }, null, { timeout: 2500 });
    for (const label of ['主题','设置','评测记录']) {
        await page.getByRole('button', { name: label, exact: true }).click({ timeout: 2200 });
        assert.equal(await page.evaluate(() => window.used), label);
    }
}
it('keeps contest, classroom and profile in one header through resizing, zoom and independent windows', async (t) => {
    const open = await fixture(t, true);
    const wide = await open(1440); const editing = await open(1024);
    for (const width of [1024, 819, 760, 601, 900]) {
        await editing.setViewportSize({ width, height: 720 });
        await desktopFits(editing);
        assert.deepEqual(await editing.locator('.nav--active').evaluateAll(nodes => nodes.map(link => link.title)), [contest, problem]);
    }
    await editing.locator('.domain-switcher__trigger').click();
    await editing.getByRole('link', { name: /Python训练.*当前/ }).waitFor();
    await editing.keyboard.press('Escape');
    await editing.waitForFunction(() => getComputedStyle(document.querySelector('.drop.domain-switcher-dropdown')).visibility === 'hidden');
    await editing.locator('.nav_more').hover();
    await editing.locator('.drop-open #menu-nav-more a').first().waitFor();
    await wide.bringToFront();
    if (process.env.SCRATCHPAD_NAV_BROWSER !== 'webkit') {
        await editing.waitForFunction(() => document.hidden && !document.querySelector('.nav-more-dropdown.drop-open'), null, { timeout: 3000, polling: 50 });
    }
    await desktopFits(wide);
    assert.equal(await wide.locator('.domain-switcher__trigger').getAttribute('aria-expanded'), 'false');
    await editing.bringToFront();
    await editing.evaluate(() => { document.documentElement.style.zoom = '1.25'; });
    await desktopFits(editing);
    await editing.evaluate(() => {
        document.documentElement.style.zoom = '';
        document.querySelector('.domain-switcher__trigger-name').textContent = '学员的特别长课堂名称'.repeat(10);
        document.querySelector('.nav__profile-link').textContent = '同学'.repeat(30);
    });
    await editing.setViewportSize({ width: 601, height: 700 });
    await desktopFits(editing);
    await wide.bringToFront();
    await wide.setViewportSize({ width: 2000, height: 720 });
    await wide.waitForFunction(() => document.querySelectorAll('.nav__list--main > li:not(.nav_more)').length === 7);
    assert.deepEqual(await wide.locator('.nav__list--main > li:not(.nav_more) a').allTextContents()
        .then(items => items.map(label => label.trim())), ['OneByOne', ...labels]);
    if (process.env.SCRATCHPAD_NAV_PREVIEW) {
        await wide.setViewportSize({ width: 800, height: 720 });
        await desktopFits(wide);
        await wide.screenshot({ path: process.env.SCRATCHPAD_NAV_PREVIEW, clip: { x: 0, y: 0, width: 800, height: 110 } });
    }
});
it('restores every navigation item to the mobile drawer and keeps it and editor controls operable', async (t) => {
    const open = await fixture(t); const page = await open(760);
    await desktopFits(page);
    for (const width of [600, 375]) {
        await page.setViewportSize({ width, height: 660 });
        const hamburger = page.locator('.header__hamburger');
        await hamburger.click({ timeout: 2000 });
        await page.locator('.slideout-open #menu').waitFor();
        assert.deepEqual(await page.locator('.nav__list--main > li:not(.nav_more) a').allTextContents()
            .then(items => items.map(label => label.trim())), ['OneByOne', ...labels]);
        await page.locator('.domain-switcher__link').scrollIntoViewIfNeeded();
        assert.equal(await page.locator('.domain-switcher__link').isVisible(), true);
        await page.locator('.slideout-overlay').click({ position: { x: 8, y: 100 } });
        await page.getByRole('button', { name: '设置', exact: true }).click({ timeout: 2000 });
    }
    await page.setViewportSize({ width: 767, height: 660 });
    await desktopFits(page);
});
