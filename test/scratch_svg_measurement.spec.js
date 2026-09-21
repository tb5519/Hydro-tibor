const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { build } = require('esbuild');

const root = path.resolve(__dirname, '..');
const candidates = [process.env.SCRATCH_BUILD_DIR, path.join(root, '.cache/scratch-player-build'),
    path.join(os.homedir(), 'Desktop/hydro-tibor/.cache/scratch-player-build')].filter(Boolean);
const workspace = candidates.find((dir) => fs.existsSync(path.join(dir, 'node_modules/@turbowarp/scratch-svg-renderer/src/load-svg-string.js')));
let playwright;
for (const location of [process.env.SCRATCH_PLAYWRIGHT_MODULE, 'playwright',
    path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
    try { playwright = require(location); break; } catch { /* Optional local browser test runtime. */ }
}
const chrome = process.env.SCRATCH_CHROMIUM_PATH || path.join(os.homedir(),
    'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium');
const available = workspace && playwright && fs.existsSync(chrome);
let browser; let patched; let original;
before(async () => {
    if (!available) return;
    const make = async (patch) => (await build({
        stdin: { contents: "window.loadSvg = require('@turbowarp/scratch-svg-renderer/src/load-svg-string');",
            resolveDir: workspace }, bundle: true, write: false, platform: 'browser', format: 'iife',
        plugins: patch ? [{ name: 'onebyone-svg', setup(builder) {
            builder.onResolve({ filter: /tw-svg-sandbox$/ }, () => ({ path: path.join(root, 'build/scratch/svg-sandbox.js') }));
        } }] : [],
    })).outputFiles[0].text;
    [patched, original] = await Promise.all([make(true), make(false)]);
    browser = await playwright.chromium.launch({ executablePath: chrome, headless: true });
});
after(async () => { await browser?.close(); });
async function harness(code, isolated = true) {
    const page = await browser.newPage();
    const requests = [];
    await page.route('**/*', (route) => { requests.push(route.request().url()); return route.abort(); });
    await page.setContent(`<iframe sandbox="allow-scripts${isolated ? '' : ' allow-same-origin'}" title="isolated SVG test"></iframe>`);
    const html = `<!doctype html><body><script>${code.replace(/<\/script/gi, '<\\/script')}</script></body>`;
    await page.locator('iframe').evaluate((frame, srcdoc) => { frame.srcdoc = srcdoc; }, html);
    const frame = page.frames().find((entry) => entry.parentFrame());
    await frame.waitForFunction(() => typeof window.loadSvg === 'function');
    return { page, frame, requests };
}
const test = (title, run) => it(title, { skip: !available && 'Set SCRATCH_BUILD_DIR and local Playwright/Chromium paths for native geometry tests' }, run);

test('reproduces the stock SVG renderer null.open crash inside a real opaque iframe', async () => {
    const h = await harness(original);
    try {
        const error = await h.frame.evaluate(() => {
            try { window.loadSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="30"/></svg>', true); }
            catch (failure) { return failure.message; }
        });
        assert.match(error, /null.*open/);
    } finally { await h.page.close(); }
});

test('measures actual negative coordinates, transformed geometry, inline styles and gradients without nested frames', async () => {
    const h = await harness(patched);
    try {
        const result = await h.frame.evaluate(() => {
            const svg = window.loadSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" viewBox="0 0 100 80">
                <defs><linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs>
                <g transform="translate(-20 10)"><rect width="30" height="40" style="fill:url(#g)"/></g>
                <rect x="1000" width="50" height="50" style="display:none"/></svg>`, true);
            return { box: svg.getAttribute('viewBox'), gradient: !!svg.querySelector('linearGradient'),
                frames: document.querySelectorAll('iframe').length, hosts: document.querySelectorAll('.onebyone-svg-measurement').length };
        });
        // Upstream intentionally expands bounds by its computed stroke width.
        assert.equal(result.box, '-20.5 9.5 31 41');
        assert.equal(result.gradient, true);
        assert.equal(result.frames, 0);
        assert.equal(result.hosts, 1);
        assert.deepEqual(h.requests, []);
    } finally { await h.page.close(); }
});

test('supports missing viewBox, text and embedded image dimensions; reuses a clean measurement container', async () => {
    const h = await harness(patched);
    try {
        const result = await h.frame.evaluate(() => {
            const image = window.loadSvg('<svg xmlns="http://www.w3.org/2000/svg"><image x="3" y="4" width="50" height="60" href="data:image/svg+xml,&lt;svg onload=alert(1)/&gt;"/></svg>');
            const text = window.loadSvg('<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20" style="font-family:Arial;font-size:20px">Hello</text></svg>');
            const again = window.loadSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect x="1" y="2" width="7" height="9"/></svg>');
            return { image: image.getAttribute('viewBox'), text: text.getAttribute('viewBox').split(' ').map(Number),
                again: again.getAttribute('viewBox'), hosts: document.querySelectorAll('.onebyone-svg-measurement').length };
        });
        assert.equal(result.image, '2.5 3.5 51 61');
        assert(result.text[2] > 20 && result.text[3] > 10);
        assert.equal(result.again, '0.5 1.5 8 10');
        assert.equal(result.hosts, 1);
        assert.deepEqual(h.requests, []);
    } finally { await h.page.close(); }
});

test('matches the original renderer geometry for safe shape, class-style, text and gradient fixtures', async () => {
    const fixed = await harness(patched);
    const reference = await harness(original, false); // Test control only: production remains opaque.
    const fixtures = [
        '<svg xmlns="http://www.w3.org/2000/svg"><rect x="-20" y="10" width="30" height="40"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><style>.large{font-size:30px;font-family:Arial}.hide{display:none}</style><text class="large" x="4" y="30">Hello</text><rect class="hide" x="1000" width="10" height="10"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><path transform="translate(5 7) scale(2)" d="M0 0L20 0L20 10Z" fill="url(#g)" stroke="blue" stroke-width="2"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg"><image x="3" y="4" width="50" height="60"/></svg>',
    ];
    try {
        const measure = (frame) => frame.evaluate((items) => items.map((source) => window.loadSvg(source, true).getAttribute('viewBox')), fixtures);
        assert.deepEqual(await measure(fixed.frame), await measure(reference.frame));
        assert.deepEqual(fixed.requests, []);
    } finally { await fixed.page.close(); await reference.page.close(); }
});

test('untrusted SVG cannot execute, request external resources or style the editor during measurement', async () => {
    const h = await harness(patched);
    try {
        const result = await h.frame.evaluate(() => {
            const svg = window.loadSvg(`<svg xmlns="http://www.w3.org/2000/svg" onload="window.pwned=1">
                <style>@import url(https://invalid.test/import.css); body { display:none } rect {fill:url(https://invalid.test/css)}</style>
                <script>window.pwned=2</script><foreignObject><iframe src="https://invalid.test/frame"/></foreignObject>
                <use href="https://invalid.test/sprite.svg#id"/>
                <image width="20" height="30" href="https://invalid.test/image.png"/>
                <rect width="20" height="30" onclick="window.pwned=3" style="fill:url(https://invalid.test/fill);--p:url(https://invalid.test/custom);stroke:var(--p)"/>
                </svg>`, true);
            return { box: svg.getAttribute('viewBox'), pwned: window.pwned, display: getComputedStyle(document.body).display,
                frames: document.querySelectorAll('iframe').length, liveSVG: document.querySelectorAll('svg').length };
        });
        await h.page.waitForTimeout(80);
        assert(result.box.split(' ').every((value) => Number.isFinite(Number(value))));
        assert.equal(result.pwned, undefined);
        assert.notEqual(result.display, 'none');
        assert.equal(result.frames, 0);
        assert.equal(result.liveSVG, 0);
        assert.deepEqual(h.requests, []);
    } finally { await h.page.close(); }
});

const assetCache = path.join(root, '.cache/scratch-library');
const lockFile = path.join(root, 'build/scratch/library-assets.lock.json');
it('all mirrored stock SVGs retain the original renderer bounds in the opaque classroom', {
    skip: (!available || !fs.existsSync(assetCache) || !fs.existsSync(lockFile)) && 'Prepare the pinned stock library cache first',
}, async () => {
    const names = Object.keys(JSON.parse(fs.readFileSync(lockFile)).files).filter((name) => name.endsWith('.svg'));
    const fixed = await harness(patched);
    const reference = await harness(original, false);
    const differences = [];
    try {
        for (let start = 0; start < names.length; start += 20) {
            const items = names.slice(start, start + 20).map((name) => ({ name, source: fs.readFileSync(path.join(assetCache, name), 'utf8') }));
            const measure = (frame) => frame.evaluate((assets) => assets.map(({ name, source }) => {
                try { return { name, box: window.loadSvg(source, true).getAttribute('viewBox').split(' ').map(Number) }; }
                catch (error) { return { name, error: error.message }; }
            }), items);
            const [actual, expected] = await Promise.all([measure(fixed.frame), measure(reference.frame)]);
            actual.forEach((result, index) => {
                const originalResult = expected[index];
                if (result.error || originalResult.error || result.box.some((value, n) => Math.abs(value - originalResult.box[n]) > 0.01)) {
                    differences.push({ name: result.name, actual: result, expected: originalResult });
                }
            });
        }
        assert.equal(differences.length, 0, JSON.stringify(differences.slice(0, 12), null, 2));
        assert.equal(names.length, 759);
        assert.deepEqual(fixed.requests, []);
    } finally { await fixed.page.close(); await reference.page.close(); }
});
