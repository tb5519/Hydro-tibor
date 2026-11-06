const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { transformSync } = require('esbuild');
const nunjucks = require('nunjucks');
const stylus = require('stylus');

let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Use the installed local browser runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const theme = read('packages/ui-default/public/theme-4.58.0-beta.21.css');
const controls = transformSync(read('packages/ui-default/components/domain_join_controls.ts'), {
    loader: 'ts', format: 'iife', globalName: 'DomainJoinControls',
}).code;
const css = ['home_domain', 'domain_join_applications'].map((name) => stylus.render(read(`packages/ui-default/pages/${name}.page.styl`))).join('\n');
const env = new nunjucks.Environment(null, { autoescape: true });
const image = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#edf4ff"/><path d="M22 20L10 32l12 12m20-24l12 12-12 12M38 12L26 52" fill="none" stroke="#377ad7" stroke-width="5"/></svg>';
const joined = [
    { _id: 'system', name: 'Python训练', domainType: 'oj', owner: 2 },
    { _id: 'C0001', name: 'C++训练', domainType: 'oj', owner: 2 },
    { _id: 'S0001', name: 'Scratch创作', domainType: 'scratch', owner: 2 },
];
const candidates = [
    { _id: 'new-cpp', name: 'C++进阶课堂', domainType: 'oj', avatarUrl: '/avatar.svg', requiresCode: false, joinUrl: '/d/C0001/domain/join?target=new-cpp' },
    { _id: 'new-scratch', name: 'Scratch创作营', domainType: 'scratch', avatarUrl: '/avatar.svg', requiresCode: true, joinUrl: '/d/C0001/domain/join?target=new-scratch' },
];
let browser;
before(async () => { if (executablePath) browser = await playwright.chromium.launch({ executablePath, headless: true }); });
after(async () => { await browser?.close(); });
const test = (name, fn) => it(name, { skip: !executablePath && 'Install Playwright and Chromium' }, fn);

async function fixture({ width = 1440, mode = 'home', domains = joined, items = candidates, admin = false,
    searchFailure = false, settingFailure = false, enabled = false, invitationCode = '', delayPost = 0, changedCode = false } = {}) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const posts = [];
    const errors = [];
    let searches = 0;
    let failedSetting = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://classroom.test/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname === '/avatar.svg') return route.fulfill({ contentType: 'image/svg+xml', body: image });
        if (url.pathname.endsWith('/domain/search')) {
            searches++;
            assert.equal(url.searchParams.get('purpose'), 'join');
            const latestItems = changedCode && searches > 1 ? items.map((item) => ({ ...item, requiresCode: true })) : items;
            return route.fulfill({ contentType: 'application/json', status: searchFailure && searches === 1 ? 503 : 200,
                body: JSON.stringify(searchFailure && searches === 1 ? { error: { message: '网络暂时不可用，请重试。' } } : latestItems) });
        }
        if (request.method() === 'POST') {
            const body = request.postDataJSON();
            posts.push({ url: request.url(), body });
            if (delayPost) await new Promise((resolve) => setTimeout(resolve, delayPost));
            if (mode === 'settings') {
                if (settingFailure && !failedSetting) {
                    failedSetting = true;
                    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '保存失败，请重试。' } }) });
                }
                return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ saved: true, enabled: body.enabled === 'on', invitationCode: body.invitationCode.trim() }) });
            }
            if ((changedCode || url.searchParams.get('target') === 'new-scratch') && body.code !== '快乐编程') {
                return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { message: '加入指令不正确，请重新输入。' } }) });
            }
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, url: '/d/joined/' }) });
        }
        const name = mode === 'settings' ? 'domain_join_applications' : 'home_domain';
        const template = read(`packages/ui-default/templates/${name}.html`).replace(/{% extends [^%]+%}/, '');
        const body = env.renderString(template, {
            ddocs: domains, role: Object.fromEntries(domains.map((item) => [item._id, admin ? 'root' : 'default'])),
            canManage: Object.fromEntries(domains.map((item) => [item._id, admin])),
            domain: { _id: 'C0001', name: 'C++训练' }, enabled, invitationCode, saved: false,
            handler: { user: { _id: admin ? 2 : 20, hasPriv: (priv) => priv === 2 || admin } },
            model: { builtin: { PRIV: { PRIV_CREATE_DOMAIN: 1, PRIV_USER_PROFILE: 2 } } },
            avatarUrl: () => '/avatar.svg',
            url: (name, args = {}) => `/d/${args.domainId || 'C0001'}/${({ domain_search: 'domain/search', domain_dashboard: 'domain/dashboard', scratch_main: 'scratch', homepage: '', home_domain_create: 'home/domain/create' })[name] || name}`,
        });
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="layout--basic page--${name} theme--default hasjs"><head><meta charset="utf-8"><style>${theme}\n${css}</style></head><body>
          <nav style="padding:18px 36px;background:white;font-size:22px;font-weight:bold;color:#334155">OneByOne</nav><div id="panel"><main class="main"><div class="row"><div class="medium-10 columns">${body}</div><aside class="medium-2 columns"><div class="section" style="padding:24px">${mode === 'settings' ? '域管理' : '我的资料'}<p style="margin-top:20px;color:#70829a">${mode === 'settings' ? '加入设置' : '我的徽章'}</p></div></aside></div></main></div>
          <script>${controls}</script><script>
          const api = { get: async (url) => { const res = await fetch(url); const data = await res.json(); if (!res.ok) throw new Error(data.error.message); return data; },
            post: async (url, body) => { const res = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const data=await res.json(); if (!res.ok) throw new Error(data.error.message); return data; },
            navigate: (url) => { document.body.dataset.destination = url; } };
          DomainJoinControls.${mode === 'settings' ? 'bindDomainJoinSettings' : 'bindDomainJoinPicker'}(document, api);
          </script></body></html>` });
    });
    await page.goto(`https://classroom.test/${mode}`);
    return { page, posts, errors, searches: () => searches };
}

async function openPicker(page) {
    await page.getByRole('button', { name: '加入新域', exact: true }).click();
    await page.locator('[data-join-loading]').waitFor({ state: 'hidden' });
}

test('renders scoped classroom cards and directly joins an open classroom once', async () => {
    const { page, posts, errors } = await fixture({ delayPost: 150 });
    try {
        assert.equal(await page.locator('.home-domains__card').count(), 3);
        assert.equal(await page.locator('input[value="leave"]').count(), 2);
        assert.equal(await page.locator('.domain-auto-star').count(), 0);
        assert.equal(await page.locator('.home-domains__enter').last().getAttribute('href'), '/d/S0001/scratch');
        assert.equal(await page.locator('.home-domains__enter').last().evaluate((element) => getComputedStyle(element).color), 'rgb(136, 95, 190)');
        await openPicker(page);
        assert.equal(await page.locator('.domain-join-picker__item').count(), 2);
        await page.getByRole('button', { name: '加入 C++进阶课堂', exact: true }).click();
        assert.equal(await page.locator('[data-join-close]').isDisabled(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('dialog').evaluate((element) => element.open), true);
        await page.waitForFunction(() => document.body.dataset.destination);
        assert.equal(posts.length, 1);
        assert.deepEqual(posts[0].body, { code: '' });
        assert.equal(await page.locator('body').getAttribute('data-destination'), 'https://classroom.test/d/joined/');
        assert.deepEqual(errors, []);
    } finally { await page.close(); }
});

test('keeps the code dialog open after a wrong instruction and accepts the corrected instruction', async () => {
    const { page, posts, errors } = await fixture();
    try {
        await openPicker(page);
        const box = await page.locator('dialog').boundingBox();
        await page.mouse.click(box.x + 4, box.y + 4);
        assert.equal(await page.locator('dialog').evaluate((element) => element.open), true, 'inside padding must not close dialog');
        await page.getByRole('button', { name: '输入指令加入 Scratch创作营' }).click();
        await page.getByLabel('加入指令', { exact: true }).fill('错误指令');
        await page.getByRole('button', { name: '确认加入', exact: true }).click();
        await page.locator('[data-join-error]').waitFor({ state: 'visible' });
        assert.match(await page.locator('[data-join-error]').innerText(), /不正确/);
        assert.equal(await page.locator('dialog').evaluate((element) => element.open), true);
        assert.equal(await page.locator('[data-join-code]').getAttribute('aria-invalid'), 'true');
        await page.getByLabel('加入指令', { exact: true }).fill(' 快乐编程 ');
        await page.getByLabel('加入指令', { exact: true }).press('Enter');
        await page.waitForFunction(() => document.body.dataset.destination);
        assert.deepEqual(posts.map((item) => item.body.code), ['错误指令', '快乐编程']);
        assert.deepEqual(errors, []);
    } finally { await page.close(); }
});

test('supports failed-list retry, local search, empty state and keyboard dismissal', async () => {
    const { page, searches, errors } = await fixture({ searchFailure: true });
    try {
        await openPicker(page);
        await page.getByRole('button', { name: '重新加载' }).click();
        await page.locator('.domain-join-picker__item').first().waitFor();
        assert.equal(searches(), 2);
        await page.getByRole('searchbox', { name: '搜索课堂' }).fill('Scratch');
        assert.equal(await page.locator('.domain-join-picker__item').count(), 1);
        await page.getByRole('searchbox', { name: '搜索课堂' }).fill('不存在');
        assert.equal(await page.locator('[data-join-empty]').isVisible(), true);
        assert.equal(searches(), 2, 'searching the loaded list needs no extra server request');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('dialog').evaluate((element) => element.open), false);
        assert.equal(await page.getByRole('button', { name: '加入新域', exact: true }).evaluate((element) => document.activeElement === element), true);
        assert.deepEqual(errors, []);
    } finally { await page.close(); }
});

test('can refresh and enter an instruction when the teacher changes an open classroom while the picker is open', async () => {
    const { page, posts, searches, errors } = await fixture({ changedCode: true });
    try {
        await openPicker(page);
        await page.getByRole('button', { name: '加入 C++进阶课堂', exact: true }).click();
        await page.getByRole('button', { name: '刷新课堂列表' }).click();
        await page.getByRole('button', { name: '输入指令加入 C++进阶课堂', exact: true }).click();
        await page.getByLabel('加入指令', { exact: true }).fill('快乐编程');
        await page.getByRole('button', { name: '确认加入', exact: true }).click();
        await page.waitForFunction(() => document.body.dataset.destination);
        assert.equal(searches(), 2);
        assert.deepEqual(posts.map((item) => item.body.code), ['', '快乐编程']);
        assert.deepEqual(errors, []);
    } finally { await page.close(); }
});

test('teacher can retry a failed save without losing the instruction and disable while preserving it', async () => {
    const { page, posts, errors } = await fixture({ mode: 'settings', settingFailure: true });
    try {
        assert.equal(await page.getByRole('button', { name: '保存设置' }).isDisabled(), true);
        await page.locator('[name="enabled"]').check();
        await page.getByLabel('加入指令', { exact: false }).fill(' 快乐编程 ');
        await page.getByRole('button', { name: '保存设置' }).click();
        await page.locator('[data-join-settings-status].is-error').waitFor();
        assert.equal(await page.getByLabel('加入指令', { exact: false }).inputValue(), ' 快乐编程 ');
        await page.getByRole('button', { name: '保存设置' }).click();
        await page.getByText('设置已保存。', { exact: true }).waitFor();
        assert.equal(await page.locator('[data-join-settings-badge]').innerText(), '已开放');
        assert.equal(await page.getByRole('button', { name: '保存设置' }).isDisabled(), true);
        await page.locator('[name="enabled"]').uncheck();
        await page.getByRole('button', { name: '保存设置' }).click();
        await page.getByText('仅老师添加', { exact: true }).waitFor();
        assert.equal(posts.at(-1).body.enabled, 'off');
        assert.equal(posts.at(-1).body.invitationCode, '快乐编程');
        assert.deepEqual(errors, []);
    } finally { await page.close(); }
});

test('desktop and mobile layouts stay within the viewport and preserve safe text rendering', async () => {
    for (const width of [1440, 390]) {
        const { page, errors } = await fixture({ width });
        try {
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.screenshot({ path: path.join(os.tmpdir(), `onebyone-my-domains-${width}.png`), fullPage: true });
            await openPicker(page);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            const bounds = await page.locator('dialog').boundingBox();
            assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
            await page.screenshot({ path: path.join(os.tmpdir(), `onebyone-join-picker-${width}.png`) });
            assert.deepEqual(errors, []);
        } finally { await page.close(); }
        const settings = await fixture({ width, mode: 'settings', enabled: true, invitationCode: '快乐编程' });
        try {
            assert.equal(await settings.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await settings.page.screenshot({ path: path.join(os.tmpdir(), `onebyone-join-settings-${width}.png`), fullPage: true });
            assert.deepEqual(settings.errors, []);
        } finally { await settings.page.close(); }
    }
    const unsafeName = '<img src=x onerror=alert(1)>超长课堂'.repeat(8);
    const { page, errors } = await fixture({ width: 390, domains: [{ ...joined[0], name: unsafeName }], items: [{ ...candidates[0], name: unsafeName }] });
    try {
        assert.equal(await page.locator('.home-domains__card h3').innerText(), unsafeName);
        assert.equal(await page.locator('[onerror]').count(), 0);
        await openPicker(page);
        assert.equal(await page.locator('.domain-join-picker__item h3').innerText(), unsafeName);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []);
    } finally { await page.close(); }
});
