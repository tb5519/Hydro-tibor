const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { buildSync } = require('esbuild');

let playwright;
for (const location of [process.env.AVATAR_PLAYWRIGHT_MODULE, 'playwright',
    path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
    try { playwright = require(location); break; } catch { /* Optional local browser runtime. */ }
}
const chrome = process.env.AVATAR_CHROMIUM_PATH || (playwright && playwright.chromium.executablePath());
const macChrome = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium');
const executablePath = [chrome, macChrome].find((entry) => entry && fs.existsSync(entry));
const available = playwright && executablePath;
const root = path.resolve(__dirname, '..');
let browser; let bundle; let drawing;
before(async () => {
    if (!available) return;
    const compile = (name, globalName) => buildSync({ entryPoints: [path.join(root, `packages/ui-default/components/${name}.ts`)],
        bundle: true, write: false, format: 'iife', globalName, target: 'es2020' }).outputFiles[0].text;
    bundle = compile('avatar_gold', 'avatarGold');
    drawing = compile('avatar_gold_drawing', 'avatarDrawing');
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });
const test = (title, run) => it(title, { skip: !available && 'Install Playwright/Chromium or set AVATAR_PLAYWRIGHT_MODULE and AVATAR_CHROMIUM_PATH' }, run);
const avatar = fs.readFileSync(path.join(root, 'packages/ui-default/public/img/avatar.png')).toString('base64');

async function harness(reducedMotion = 'no-preference') {
    const page = await browser.newPage({ viewport: { width: 720, height: 500 }, reducedMotion });
    const requests = [];
    let badgeCount = 5;
    await page.route('https://avatar.test/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/effects') {
            requests.push(url.searchParams.get('uids'));
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ users: url.searchParams.get('uids').split(',').map(Number)
                .map((uid) => ({ uid, badgeCount: uid === 2 ? 4 : badgeCount, effect: uid === 2 || badgeCount < 5 ? null : 'electric-arc' })) }) });
        }
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:40px;background:#f4f7fb;font-family:sans-serif">
            <div style="display:flex;align-items:center;gap:50px"><a href="#clicked" id="link"><img id="square" data-badge-avatar-uid="1" style="width:80px;height:80px;border-radius:14px"></a>
            <img id="circle" data-badge-avatar-uid="1" style="width:80px;height:80px;border-radius:50%">
            <img id="small" data-badge-avatar-uid="1" style="width:32px;height:32px;border-radius:50%">
            <img id="locked" data-badge-avatar-uid="2" style="width:48px;height:48px;border-radius:12px"></div>
            <div id="dynamic" style="margin-top:70px"></div><dialog><img id="dialog-avatar" data-badge-avatar-uid="1" style="width:48px;height:48px;border-radius:12px"></dialog>
            <script>document.querySelectorAll('img').forEach(img=>img.src='data:image/png;base64,${avatar}');</script></body>` });
    });
    await page.goto('https://avatar.test/');
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => { window.beforeAvatarRects = [...document.querySelectorAll('img')].map(e=>e.getBoundingClientRect().toJSON()); window.cleanupGold = avatarGold.installAvatarGoldEffects('/effects'); });
    await page.waitForFunction(() => {
        const canvas = document.querySelector('.avatar-gold-layer canvas');
        return canvas && canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((n, i) => i % 4 === 3 && n > 0);
    });
    return { page, requests, revoke: () => { badgeCount = 4; } };
}
async function regionAlpha(page, id, dx, dy, size = 3) {
    return page.evaluate(({ id, dx, dy, size }) => {
        const box = document.getElementById(id).getBoundingClientRect();
        const canvas = document.querySelector('.avatar-gold-layer canvas');
        const pixels = canvas.getContext('2d').getImageData(Math.floor(box.left + dx), Math.floor(box.top + dy), size, size).data;
        return [...pixels].reduce((sum, n, i) => sum + (i % 4 === 3 ? n : 0), 0);
    }, { id, dx, dy, size });
}

test('gold follows each avatar shape without covering portraits, changing layout or blocking clicks', async () => {
    const { page, requests } = await harness();
    try {
        assert.equal(requests.length, 1, 'eligibility is batched across repeated user avatars');
        assert.equal(requests[0], '1,2');
        assert(await regionAlpha(page, 'square', 38, -3) > 0);
        assert(await regionAlpha(page, 'circle', 38, -3) > 0);
        assert(await regionAlpha(page, 'small', 15, -3) > 0);
        assert.equal(await regionAlpha(page, 'square', 30, 30, 20), 0, 'portrait remains unpainted');
        assert.equal(await regionAlpha(page, 'circle', 0, 0), 0, 'circle corners must not reuse rounded-square sprite');
        assert.equal(await regionAlpha(page, 'locked', 20, -4, 4), 0, 'four badges do not unlock effect');
        assert.equal(await regionAlpha(page, 'square', 35, -10, 3), 0, 'no distant arcs or particles');
        assert.equal(await page.evaluate(() => JSON.stringify(beforeAvatarRects) === JSON.stringify([...document.querySelectorAll('img')].map(e=>e.getBoundingClientRect().toJSON()))), true);
        await page.locator('#square').click();
        assert(page.url().endsWith('#clicked'));
        const before = await page.locator('.avatar-gold-layer canvas').evaluate(e=>e.toDataURL());
        await page.waitForTimeout(220);
        assert.notEqual(await page.locator('.avatar-gold-layer canvas').evaluate(e=>e.toDataURL()), before, 'gold flows');
        await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-avatar-gold-live.png') });
    } finally { await page.close(); }
});

test('dynamic avatars and dialogs retain decoration; reduced motion is static and revocation removes it', async () => {
    const h = await harness('reduce'); const { page } = h;
    try {
        await page.locator('.avatar-gold-layer canvas').evaluate(e=>{window.goldPixels=[...e.getContext('2d').getImageData(0,0,e.width,e.height).data];});
        await page.waitForTimeout(220);
        assert(await page.locator('.avatar-gold-layer canvas').evaluate(e=>{
            const pixels=e.getContext('2d').getImageData(0,0,e.width,e.height).data;
            return pixels.every((value,index)=>value===goldPixels[index]);
        }), 'reduced-motion gold must stay static');
        await page.evaluate(() => { const img = document.querySelector('#small').cloneNode(); img.id = 'added'; document.querySelector('#dynamic').append(img); });
        await page.waitForTimeout(220);
        assert(await regionAlpha(page, 'added', 15, -3) > 0);
        await page.evaluate(() => document.querySelector('dialog').showModal());
        await page.waitForTimeout(220);
        assert(await regionAlpha(page, 'dialog-avatar', 22, -3) > 0, 'dialog avatar is drawn in top layer');
        assert.equal(await regionAlpha(page, 'square', 38, -3), 0, 'background avatar does not bleed through modal');
        await page.evaluate(() => document.querySelector('dialog').close());
        h.revoke();
        await page.evaluate(() => { const original = Date.now; Date.now = () => original() + 61000; document.dispatchEvent(new Event('visibilitychange')); });
        await page.waitForTimeout(250);
        assert.equal(await regionAlpha(page, 'square', 38, -3), 0);
        await page.evaluate(() => cleanupGold());
        assert.equal(await page.locator('.avatar-gold-layer').count(), 0);
    } finally { await page.close(); }
});

test('drawing supports rectangles, asymmetric and elliptical corners plus older canvas gradient fallback', async () => {
    const page = await browser.newPage();
    try {
        await page.addScriptTag({ content: drawing });
        const results = await page.evaluate(() => {
            const shapes = [[80, 40, [{x:30,y:10},{x:4,y:4},{x:0,y:0},{x:8,y:12}]], [48,48,Array(4).fill({x:24,y:24})], [32,32,Array(4).fill({x:0,y:0})]];
            return shapes.flatMap(([width,height,radii]) => [false,true].map(fallback => {
                const canvas=document.createElement('canvas');canvas.width=width+12;canvas.height=height+12;
                const ctx=canvas.getContext('2d');if(fallback)ctx.createConicGradient=undefined;
                ctx.translate(6,6);avatarDrawing.drawGoldAvatarBorder(ctx,1.2,{width,height,radii});
                const center=ctx.getImageData(6+width/2,6+height/2,1,1).data[3];
                const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
                return {center, painted:[...pixels].some((n,i)=>i%4===3&&n>0)};
            }));
        });
        results.forEach(result=>assert.deepEqual(result,{center:0,painted:true}));
    } finally { await page.close(); }
});
