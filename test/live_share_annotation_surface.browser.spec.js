const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { buildSync } = require('esbuild');
const stylus = require('stylus');

const root = path.resolve(__dirname, '..');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Support the bundled browser runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((candidate) => candidate && fs.existsSync(candidate));
let browser;
let script;
let css;
before(async () => {
    assert(executablePath, 'Chromium is required for annotation coordinate tests');
    script = buildSync({ entryPoints: [path.join(root, 'packages/ui-default/components/live_share/annotation.ts')],
        bundle: true, format: 'iife', globalName: 'Annotation', write: false }).outputFiles[0].text;
    css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share.page.styl'), 'utf8'));
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

// These are already in the learner's CSS coordinate system. Device pixels and
// the teacher's stage transform must never change the selected visual rows.
const rects = [
    { x: 88.125, y: 70.5, width: 170.25, height: 20 },
    { x: 266.375, y: 67.5, width: 91.25, height: 26 },
    { x: 365.625, y: 70.5, width: 205.5, height: 20 },
    { x: 88.125, y: 97.5, width: 425.5, height: 20 },
    { x: 88.125, y: 130.5, width: 122.25, height: 32 },
];
async function render(options) {
    const context = await browser.newContext({ viewport: options.viewport, deviceScaleFactor: options.dpr });
    const page = await context.newPage();
    try {
        await page.setContent(`<style>body{margin:0}#stage{position:relative;width:800px;height:560px;
            transform:scale(${options.scale});transform-origin:top left}${css}</style><main id="stage"></main>`);
        await page.addScriptTag({ content: script });
        return await page.evaluate(({ rects, teacher }) => {
            const stage = document.querySelector('#stage');
            const x = Math.min(...rects.map((rect) => rect.x)); const y = Math.min(...rects.map((rect) => rect.y));
            const width = Math.max(...rects.map((rect) => rect.x + rect.width)) - x;
            const height = Math.max(...rects.map((rect) => rect.y + rect.height)) - y;
            const surface = Annotation.attachAnnotationSurface({ container: stage, teacher });
            surface.render({ startNodeId: 1, endNodeId: 1, startOffset: 0, endOffset: 2, quote: '重点', text: '',
                noteOpen: false, offsetX: 0, offsetY: 0 }, { x, y, width, height, rects });
            const selection = stage.querySelector('[data-share-annotation-selection]');
            const outline = stage.querySelector('[data-share-annotation-box]');
            return { path: outline.getAttribute('d'), left: selection.style.left, top: selection.style.top,
                width: selection.style.width, height: selection.style.height,
                stageWidth: stage.clientWidth, stageHeight: stage.clientHeight };
        }, { rects, teacher: options.teacher });
    } finally { await context.close(); }
}

it('the same selected rows produce identical outlines across different screen sizes, pixel densities and teacher stage scales', async () => {
    const baseline = await render({ teacher: false, viewport: { width: 800, height: 560 }, dpr: 1, scale: 1 });
    for (const options of [
        { teacher: true, viewport: { width: 1920, height: 1080 }, dpr: 2, scale: 1.75 },
        { teacher: true, viewport: { width: 680, height: 500 }, dpr: 1, scale: 0.625 },
        { teacher: true, viewport: { width: 1440, height: 900 }, dpr: 1.5, scale: 0.873 },
        { teacher: false, viewport: { width: 1280, height: 720 }, dpr: 2, scale: 1 },
    ]) assert.deepEqual(await render(options), baseline, `coordinates must remain learner CSS pixels: ${JSON.stringify(options)}`);
});
