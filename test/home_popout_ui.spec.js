const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const nunjucks = require('nunjucks');
const stylus = require('stylus');

let playwright;
for (const location of [process.env.HERO_PLAYWRIGHT_MODULE, 'playwright',
    path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
    try { playwright = require(location); break; } catch { /* Optional browser runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(root, 'packages/ui-default/templates')), { autoescape: true });
env.addFilter('json', JSON.stringify);
env.addFilter('jsesc', (value) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
const template = read('packages/ui-default/templates/main.html').replace('{% extends "layout/basic.html" %}', '');
let browser;
before(async () => { if (executablePath) browser = await playwright.chromium.launch({ executablePath, headless: true }); });
after(async () => { await browser?.close(); });
const test = (name, fn) => it(name, { skip: !executablePath && 'Install Playwright and Chromium' }, fn);
const theme = read('packages/ui-default/public/theme-4.58.0-beta.21.css');
const css = process.env.HERO_USE_BUILT_CSS ? '' : stylus.render(read('packages/ui-default/pages/home_popout.page.styl'));
const artwork = (mobile) => `<svg xmlns="http://www.w3.org/2000/svg" width="${mobile ? 1200 : 3600}" height="${mobile ? 1500 : 1080}">
  <rect x="${mobile ? 60 : 360}" y="${mobile ? 120 : 140}" width="${mobile ? 1080 : 2880}" height="${mobile ? 1260 : 800}" rx="34" fill="#e0f2fe"/>
  <path d="${mobile ? 'M650 800h400v600H650z' : 'M2900 300h560v640H2900z'}" fill="#f4b84a"/>
</svg>`;

async function fixture({ width = 1440, mobile = true, layout = 'popout', broken = '', video = false, image = true } = {}) {
    const page = await browser.newPage({ viewport: { width, height: 1050 } });
    page.setDefaultTimeout(5000);
    const requests = []; const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://hero.test/**', (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/desktop.svg' || pathname === '/mobile.svg') {
            requests.push(pathname);
            if (broken === 'all' || (broken === 'mobile' && pathname === '/mobile.svg')) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ contentType: 'image/svg+xml', body: artwork(pathname === '/mobile.svg') });
        }
        const body = env.renderString(template, {
            homePoster: { layout, image: image ? '/desktop.svg' : '', mobileImage: mobile ? '/mobile.svg' : '', video: video ? '/video.mp4' : '' },
            pointLottery: { enabled: true, points: 100, cost: 50, prizes: [] }, contents: [], _: (text) => text, url: (name) => `/#${name}`,
        });
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="layout--basic page--homepage theme--default hasjs"><head><meta charset="utf-8">
            <style>${theme}</style><style>${css}</style></head><body><nav style="height:60px;background:white">OneByOne</nav>
            <div id="panel" class="slideout-panel"><div class="main">${body}<section id="next-card" style="height:100px;background:white">置顶比赛</section></div></div></body></html>` });
    });
    await page.goto('https://hero.test/');
    await page.waitForFunction(() => document.querySelector('.ui-v2-home__hero--poster-ready, .ui-v2-home__hero--art-error')
        || !document.querySelector('.ui-v2-home__hero--poster'));
    return { page, requests, errors };
}

test('popout artwork preserves its ratio, aligns the core and leaves buttons clickable across screen sizes', async () => {
    for (const width of [1920, 1440, 1280, 1024, 768, 767, 640, 390, 375, 320]) {
        const { page, requests, errors } = await fixture({ width });
        try {
            const geometry = await page.evaluate(() => {
                const hero = document.querySelector('.ui-v2-home__hero');
                const art = hero.querySelector('img');
                const box = (e) => e.getBoundingClientRect().toJSON();
                return { hero: box(hero), art: box(art), copy: box(hero.querySelector('.ui-v2-home__hero-text')),
                    title: box(hero.querySelector('h1')), actions: box(hero.querySelector('.ui-v2-home__hero-actions')),
                    core: box(document.querySelector('.ui-v2-home')), next: box(document.querySelector('#next-card')),
                    scroll: document.documentElement.scrollWidth, viewport: innerWidth,
                    background: getComputedStyle(hero).backgroundColor, fit: getComputedStyle(art).objectFit };
            });
            assert(Math.abs(geometry.art.width / geometry.art.height - (width < 768 ? 0.8 : 10 / 3)) < 0.01, `${width}: aspect ratio`);
            assert.equal(geometry.background, 'rgba(0, 0, 0, 0)');
            assert.equal(geometry.fit, 'contain');
            assert(geometry.scroll <= geometry.viewport, `${width}: horizontal overflow`);
            assert(geometry.hero.bottom <= geometry.next.y, `${width}: artwork overlaps next section`);
            assert(geometry.title.y >= geometry.copy.y - 1 && geometry.actions.bottom <= geometry.copy.bottom + 1, `${width}: copy exceeds design safe area`);
            if (width >= 768) assert(Math.abs(geometry.hero.x + geometry.hero.width * 0.1 - geometry.core.x - parseFloat(await page.locator('.ui-v2-home').evaluate(e => getComputedStyle(e).paddingLeft))) < 1);
            assert.deepEqual(requests, [width < 768 ? '/mobile.svg' : '/desktop.svg'], 'only the selected responsive image is downloaded');
            await page.getByRole('button', { name: '积分抽奖', exact: true }).click();
            assert.equal(await page.locator('[data-point-lottery]').evaluate(e => e.hidden), false);
            await page.locator('[data-point-lottery-close][aria-label="关闭"]').click();
            await page.getByRole('link', { name: '在线IDE', exact: true }).click();
            assert(page.url().endsWith('#online_ide'));
            assert.deepEqual(errors, []);
            if ([1440, 375].includes(width)) await page.screenshot({ path: path.join(os.tmpdir(), `onebyone-home-popout-${width}.png`) });
        } finally { await page.close(); }
    }
});

test('missing or broken mobile artwork falls back without stretching and total failure keeps navigation usable', async () => {
    for (const options of [{ mobile: false }, { broken: 'mobile' }, { broken: 'all' }]) {
        const { page, errors } = await fixture({ width: 375, ...options });
        try {
            if (options.broken !== 'all') {
                await page.waitForFunction(() => document.querySelector('img.ui-v2-home__hero-poster').naturalWidth === 3600);
                const boxes = await page.evaluate(() => ['.ui-v2-home__hero-text', '.ui-v2-home__hero-art'].map(s => document.querySelector(s).getBoundingClientRect().toJSON()));
                assert(boxes[0].bottom <= boxes[1].y + 1, 'fallback copy remains above the desktop art');
                assert(Math.abs(boxes[1].width / boxes[1].height - 10 / 3) < 0.01);
            } else assert.equal(await page.locator('.ui-v2-home__hero-art').isVisible(), false);
            await page.getByRole('link', { name: '开始刷题', exact: true }).click();
            assert(page.url().endsWith('#problem_main'));
            assert.deepEqual(errors, []);
        } finally { await page.close(); }
    }
});

test('legacy banners and videos retain their presentation, and popout uses only static art', async () => {
    for (const options of [{ layout: 'banner' }, { layout: 'banner', video: true }, { layout: 'popout', video: true }, { layout: 'popout', image: false }]) {
        const { page } = await fixture(options);
        try {
            const popout = options.layout === 'popout' && options.image !== false;
            assert.equal(await page.locator('.ui-v2-home__hero--popout').count(), popout ? 1 : 0);
            assert.equal(await page.locator('[data-loop-background]').count(), options.video && !popout ? 1 : 0);
            if (!popout && options.image !== false) assert.equal(await page.locator('.ui-v2-home__hero').evaluate(e=>getComputedStyle(e).overflow), 'hidden');
        } finally { await page.close(); }
    }
});
