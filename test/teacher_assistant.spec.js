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
    try { playwright = require(location); break; } catch { /* Use the local browser test runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const env = new nunjucks.Environment(null, { autoescape: true });
let browser;
let controls;
let css;
let template;
let theme;
before(async () => {
    controls = transformSync(read('packages/ui-default/components/teacher_assistant.ts'), {
        loader: 'ts', format: 'iife', globalName: 'TeacherAssistant',
    }).code;
    css = stylus.render(read('packages/ui-default/components/teacher_assistant.page.styl'));
    theme = read('packages/ui-default/public/theme-4.58.0-beta.21.css');
    template = read('packages/ui-default/templates/partials/teacher_assistant.html');
    if (executablePath) browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });
const test = (name, fn) => it(name, { skip: !executablePath && 'Install Playwright and Chromium' }, fn);
const key = (uid) => `onebyone.teacher-assistant.position.v1:${uid}`;

function render({ role = 'teacher', uid = 2 } = {}) {
    const workspace = role.startsWith('workspace-') ? { code: 'classroom', legacy: false } : undefined;
    const member = workspace ? { role: role.slice('workspace-'.length) } : undefined;
    return env.renderString(template, {
        handler: {
            user: {
                _id: role === 'guest' ? 0 : uid,
                hasPerm: (value) => role === 'teacher' || role === 'admin',
                hasPriv: (value) => role === 'admin' || value === 'PRIV_USER_PROFILE' && role !== 'guest',
            },
            workspaceMember: member,
            workspaceDoc: workspace,
            session: {},
            domain: { _id: 'C0001', domainType: 'oj' },
        },
        UserContext: { _id: role === 'guest' ? 0 : uid },
        UiContext: { domainId: 'C0001' },
        workspace, workspaceMember: member, platformAdminMode: role === 'platform-admin',
        page_name: role === 'platform-admin' ? 'platform_dashboard' : workspace ? 'workspace_dashboard' : 'domain_dashboard',
        perm: { PERM_EDIT_DOMAIN: 'PERM_EDIT_DOMAIN', PERM_VIEW_HOMEWORK: 'PERM_VIEW_HOMEWORK' },
        PRIV: { PRIV_EDIT_SYSTEM: 'PRIV_EDIT_SYSTEM', PRIV_ALL: 'PRIV_ALL', PRIV_USER_PROFILE: 'PRIV_USER_PROFILE' },
        model: {
            builtin: { PERM: new Proxy({}, { get: (_, name) => name }), PRIV: new Proxy({}, { get: (_, name) => name }) },
            workspace: {
                isPlatformAdmin: () => role === 'platform-admin',
                isLegacyOwner: () => role === 'legacy-owner',
            },
        },
        _: (value) => value,
        url: (name) => `/d/C0001/${name}`,
    });
}

async function fixture({ width = 1440, height = 900, role = 'teacher', uid = 2, storage, blockedStorage = false, hasTouch = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (blockedStorage) {
        await page.addInitScript(() => {
            Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Disabled storage', 'SecurityError'); } });
        });
    } else if (storage !== undefined) {
        await page.addInitScript(({ initial, storageKey }) => {
            if (!sessionStorage.getItem('seeded')) {
                localStorage.setItem(storageKey, initial);
                sessionStorage.setItem('seeded', 'yes');
            }
        }, { initial: storage, storageKey: key(uid) });
    }
    await page.route('https://teacher-assistant.test/**', async (route) => {
        const requested = new URL(route.request().url());
        const currentUid = Number(requested.searchParams.get('uid') || uid);
        const html = render({ role, uid: currentUid });
        await route.fulfill({ contentType: 'text/html', body: `<!DOCTYPE html><html class="theme--default hasjs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${theme}
          *{box-sizing:border-box}body{margin:0;background:#eef1f4;font-family:system-ui,sans-serif;color:#24364d}.fixture-topbar{height:64px;padding:20px 32px;background:white;border-bottom:1px solid #dce4ec}#panel{transform:translateZ(0);padding:32px;min-height:2400px}.content{padding:30px;background:white;border:1px solid #e0e8ef;border-radius:20px;max-width:900px}button,a{font:inherit} ${css}
          </style></head><body><nav class="fixture-topbar">OneByOne · 老师工作台</nav><div id="panel"><div class="content"><h1>学员训练看板</h1><p>课堂里的每一步进步，都值得看见。</p><button id="outside">查看学员</button><iframe id="scratch-frame" title="Scratch 编辑器" style="display:block;width:250px;height:60px;margin-top:20px;border:0" srcdoc="<button>继续搭积木</button>"></iframe><div style="margin-top:100px;height:340px;background:linear-gradient(135deg,#edf7f9,#f6f1ff);border-radius:18px"></div></div></div>${html}<script>${controls}</script><script>window.cleanupAssistant = TeacherAssistant.installTeacherAssistant(document);</script></body></html>` });
    });
    await page.goto(`https://teacher-assistant.test/first?uid=${uid}`);
    if (!['student', 'guest', 'workspace-assistant'].includes(role)) {
        await page.locator('[data-assistant-toggle]').waitFor({ state: 'visible' });
    }
    return { page, context, errors };
}

async function buttonBox(page) { return page.locator('[data-assistant-toggle]').boundingBox(); }
async function drag(page, x, y) {
    const start = await buttonBox(page);
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 12 });
    await page.mouse.up();
}
async function visibleBounds(page, selector) {
    const rect = await page.locator(selector).boundingBox();
    const size = page.viewportSize();
    assert(rect, `${selector} should be visible`);
    assert(rect.x >= -1 && rect.y >= -1, `${selector} must not escape the top or left edge: ${JSON.stringify(rect)}`);
    assert(rect.x + rect.width <= size.width + 1 && rect.y + rect.height <= size.height + 1,
        `${selector} must remain within the viewport: ${JSON.stringify(rect)} / ${JSON.stringify(size)}`);
    return rect;
}

it('renders only for teachers and administrators and stays outside the transformed page panel', () => {
    for (const role of ['student', 'guest', 'workspace-assistant']) {
        assert(!render({ role }).includes('data-teacher-assistant'), `${role} should not see the assistant`);
    }
    for (const role of ['teacher', 'admin', 'platform-admin', 'legacy-owner', 'workspace-owner', 'workspace-admin', 'workspace-teacher']) {
        assert(render({ role }).includes('data-teacher-assistant'), `${role} should see the assistant`);
    }
    const layout = read('packages/ui-default/templates/layout/html5.html');
    assert(layout.includes('partials/teacher_assistant.html'));
    assert(layout.indexOf('partials/teacher_assistant.html') > layout.indexOf('{% block body %}'));
});

test('opens on click or keyboard, closes with Escape and outside click, and supports repeated initialization', async () => {
    const { page, context, errors } = await fixture();
    try {
        const toggle = page.locator('[data-assistant-toggle]');
        await page.evaluate(() => TeacherAssistant.installTeacherAssistant(document));
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await visibleBounds(page, '[data-assistant-panel]');
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await toggle.evaluate((element) => element === document.activeElement), true);
        await toggle.press('Enter');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await page.locator('#outside').click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await toggle.click();
        await page.locator('[data-assistant-close]').click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('dragging never opens the panel and remembers the position across reload and page changes', async () => {
    const { page, context, errors } = await fixture();
    try {
        await drag(page, 400, 340);
        assert.equal(await page.locator('[data-assistant-toggle]').getAttribute('aria-expanded'), 'false');
        const expected = await buttonBox(page);
        assert(Math.abs(expected.x + expected.width / 2 - 400) <= 2);
        const saved = await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)), key(2));
        assert(Number.isFinite(saved.x) && saved.x >= 0 && saved.x <= 1);
        assert(Number.isFinite(saved.y) && saved.y >= 0 && saved.y <= 1);
        for (const navigate of [() => page.reload(), () => page.goto('https://teacher-assistant.test/second?uid=2')]) {
            await navigate();
            const actual = await buttonBox(page);
            assert(Math.abs(actual.x - expected.x) <= 2 && Math.abs(actual.y - expected.y) <= 2);
        }
        await page.locator('[data-assistant-toggle]').click();
        assert.equal(await page.locator('[data-assistant-toggle]').getAttribute('aria-expanded'), 'true');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('position is private to the current account and can be restored to the default', async () => {
    const { page, context, errors } = await fixture();
    try {
        const initial = await buttonBox(page);
        await drag(page, 310, 290);
        const moved = await buttonBox(page);
        await page.goto('https://teacher-assistant.test/second?uid=7');
        const other = await buttonBox(page);
        assert(Math.abs(other.x - initial.x) <= 2 && Math.abs(other.y - initial.y) <= 2);
        await page.goto('https://teacher-assistant.test/third?uid=2');
        assert(Math.abs((await buttonBox(page)).x - moved.x) <= 2);
        await page.locator('[data-assistant-toggle]').click();
        await page.locator('[data-assistant-reset]').click();
        const reset = await buttonBox(page);
        assert(Math.abs(reset.x - initial.x) <= 2 && Math.abs(reset.y - initial.y) <= 2);
        await page.reload();
        assert(Math.abs((await buttonBox(page)).x - initial.x) <= 2);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('keeps both the floating button and its panel inside the viewport after dragging to edges and resizing', async () => {
    const { page, context, errors } = await fixture();
    try {
        for (const [x, y] of [[1, 1], [1439, 1], [1439, 899], [1, 899]]) {
            await drag(page, x, y);
            await visibleBounds(page, '[data-assistant-toggle]');
            await page.locator('[data-assistant-toggle]').click();
            await visibleBounds(page, '[data-assistant-panel]');
            await page.keyboard.press('Escape');
        }
        await page.setViewportSize({ width: 390, height: 720 });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await visibleBounds(page, '[data-assistant-toggle]');
        await page.locator('[data-assistant-toggle]').click();
        await visibleBounds(page, '[data-assistant-panel]');
        await page.setViewportSize({ width: 640, height: 360 });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await visibleBounds(page, '[data-assistant-toggle]');
        await visibleBounds(page, '[data-assistant-panel]');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('scrolling does not detach the assistant from its remembered screen position', async () => {
    const { page, context, errors } = await fixture();
    try {
        await drag(page, 490, 480);
        const before = await buttonBox(page);
        await page.mouse.move(600, 500);
        await page.mouse.wheel(0, 800);
        await page.waitForFunction(() => scrollY > 0);
        const after = await buttonBox(page);
        assert(Math.abs(after.x - before.x) <= 1 && Math.abs(after.y - before.y) <= 1);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('keyboard positioning is remembered and cleanup releases the existing installation', async () => {
    const { page, context, errors } = await fixture();
    try {
        const toggle = page.locator('[data-assistant-toggle]');
        const before = await buttonBox(page);
        await toggle.focus();
        await toggle.press('Alt+ArrowLeft');
        await toggle.press('Alt+ArrowUp');
        const moved = await buttonBox(page);
        assert(Math.abs(moved.x - before.x + 16) <= 1 && Math.abs(moved.y - before.y + 16) <= 1);
        await page.reload();
        const restored = await buttonBox(page);
        assert(Math.abs(restored.x - moved.x) <= 1 && Math.abs(restored.y - moved.y) <= 1);
        await page.evaluate(() => window.cleanupAssistant());
        assert.equal(await toggle.isVisible(), false);
        await page.evaluate(() => { window.cleanupAssistant = TeacherAssistant.installTeacherAssistant(document); });
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('keyboard opening works immediately after a drag and clicking the editor iframe closes without stealing focus', async () => {
    const { page, context, errors } = await fixture();
    try {
        await drag(page, 500, 600);
        const toggle = page.locator('[data-assistant-toggle]');
        await toggle.press('Enter');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await page.frameLocator('#scratch-frame').getByRole('button', { name: '继续搭积木' }).click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'scratch-frame');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('persistent assistant follows the current server menu without duplicating controls or losing its position', async () => {
    const { page, context, errors } = await fixture();
    try {
        await drag(page, 500, 600);
        const before = await buttonBox(page);
        await page.route('https://teacher-assistant.test/assistant-content', (route) => route.fulfill({ contentType: 'text/html', body: render() }));
        await page.evaluate(() => { document.querySelector('#scratch-frame').src = '/assistant-content'; document.querySelector('#scratch-frame').removeAttribute('srcdoc'); });
        await page.waitForFunction(() => document.querySelector('#scratch-frame').contentWindow.location.pathname === '/assistant-content');
        await page.evaluate(() => {
            TeacherAssistant.installPersistentTeacherAssistant(document);
            const frame = document.querySelector('#scratch-frame');
            const next = document.querySelector('[data-teacher-assistant]').cloneNode(true);
            next.querySelector('.teacher-assistant__links').innerHTML = '<a href="/d/python/settings">新的课堂设置</a>';
            frame.contentDocument.body.replaceChildren(next);
            window.liveControls = document.createElement('section');
            window.liveControls.className = 'live-share-controls';
            const disconnect = document.createElement('button');
            disconnect.textContent = '断开共享';
            disconnect.onclick = () => { window.disconnected = true; };
            window.liveControls.append(disconnect);
            document.querySelector('[data-assistant-panel]').append(window.liveControls);
            window.originalAssistantPanel = document.querySelector('[data-assistant-panel]');
            window.__onebyonePlatformShell = { contentWindow: () => frame.contentWindow };
            window.dispatchEvent(new CustomEvent('onebyone:page-change', { detail: { window: frame.contentWindow } }));
            window.dispatchEvent(new CustomEvent('onebyone:page-change', { detail: { window: frame.contentWindow } }));
        });
        assert.equal(await page.locator('[data-teacher-assistant]').count(), 1);
        const after = await buttonBox(page);
        assert(Math.abs(before.x - after.x) <= 1 && Math.abs(before.y - after.y) <= 1);
        await page.locator('[data-assistant-toggle]').click();
        assert.equal(await page.getByRole('link', { name: '新的课堂设置' }).isVisible(), true);
        assert.equal(await page.evaluate(() => window.liveControls.isConnected
            && document.querySelector('[data-assistant-panel]') === window.originalAssistantPanel), true);
        await page.getByRole('button', { name: '断开共享' }).click();
        assert.equal(await page.evaluate(() => window.disconnected), true);
        await page.evaluate(() => window.dispatchEvent(new Event('onebyone:session-ended')));
        assert.equal(await page.locator('[data-assistant-toggle]').isVisible(), false);
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('invalid or unavailable browser storage does not prevent opening and dragging', async () => {
    for (const options of [{ storage: '{broken' }, { storage: '{"x":null,"y":"bad"}' }, { blockedStorage: true }]) {
        const { page, context, errors } = await fixture(options);
        try {
            await visibleBounds(page, '[data-assistant-toggle]');
            await drag(page, 350, 310);
            await page.locator('[data-assistant-toggle]').click();
            await visibleBounds(page, '[data-assistant-panel]');
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    }
});

test('supports touch dragging and a subsequent tap without opening the menu during the drag', async () => {
    const { page, context, errors } = await fixture({ width: 390, height: 844, hasTouch: true });
    try {
        const start = await buttonBox(page);
        const client = await context.newCDPSession(page);
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x + start.width / 2, y: start.y + start.height / 2 }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y: 320 }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.equal(await page.locator('[data-assistant-toggle]').getAttribute('aria-expanded'), 'false');
        const moved = await buttonBox(page);
        assert(Math.abs(moved.x + moved.width / 2 - 120) <= 2);
        await page.touchscreen.tap(moved.x + moved.width / 2, moved.y + moved.height / 2);
        assert.equal(await page.locator('[data-assistant-toggle]').getAttribute('aria-expanded'), 'true');
        await visibleBounds(page, '[data-assistant-panel]');
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('dark styling and reduced motion preserve readable mobile menu controls', async () => {
    const { page, context, errors } = await fixture({ width: 390, height: 844 });
    try {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => {
            document.documentElement.dataset.mantineColorScheme = 'dark';
            document.body.style.background = '#141d29';
        });
        await page.locator('[data-assistant-toggle]').click();
        const panel = page.locator('[data-assistant-panel]');
        await visibleBounds(page, '[data-assistant-panel]');
        assert.equal(await panel.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(32, 44, 59)');
        assert.equal(await panel.evaluate((element) => getComputedStyle(element).animationName), 'none');
        const contrast = await page.locator('[data-assistant-toggle]').evaluate((element) => {
            const luminance = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => {
                const c = value / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
            const style = getComputedStyle(element);
            const colors = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
            return (colors[0] + 0.05) / (colors[1] + 0.05);
        });
        assert(contrast >= 4.5, `Expanded dark-mode toggle should remain readable: ${contrast}`);
        await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-teacher-assistant-dark-mobile.png') });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});
