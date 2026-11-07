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
    try { playwright = require(location); break; } catch { /* Bundled test runtime is supported. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((candidate) => candidate && fs.existsSync(candidate));
let browser;
let script;
let css;
let themeCss;
before(async () => {
    assert(executablePath, 'Chromium is required for annotation bubble tests');
    script = buildSync({ entryPoints: [path.join(root, 'packages/ui-default/components/live_share/annotation.ts')],
        bundle: true, format: 'iife', globalName: 'Annotation', write: false }).outputFiles[0].text;
    css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share.page.styl'), 'utf8'));
    const publicRoot = path.join(root, 'packages/ui-default/public');
    const manifest = JSON.parse(fs.readFileSync(path.join(publicRoot, 'manifest.json'), 'utf8'));
    themeCss = fs.readFileSync(path.join(publicRoot, manifest['theme.css'].split('?')[0]), 'utf8');
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

async function fixture({ teacherScale = 1, teacherFont = 'system-ui', studentFont = 'system-ui',
    teacherViewport = { width: 800, height: 560 }, studentViewport = { width: 800, height: 560 },
    teacherDpr = 1, studentDpr = 1, teacherCodeFont = '"Courier New", monospace', studentCodeFont = 'Monaco, monospace' } = {}) {
    const teacher = await browser.newPage({ viewport: teacherViewport, deviceScaleFactor: teacherDpr });
    const student = await browser.newPage({ viewport: studentViewport, deviceScaleFactor: studentDpr });
    const pages = [teacher, student];
    const errors = [];
    for (const page of pages) {
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setContent(`<html><head><style>${themeCss}</style><style>
            body{--font-family:${page === teacher ? teacherFont : studentFont};--code-font-family:${page === teacher ? teacherCodeFont : studentCodeFont}}
            body{margin:0;background:#f4f6fa;font:18px system-ui;color:#24324a}
            #stage{position:relative;width:800px;height:560px;transform:scale(${page === teacher ? teacherScale : 1});transform-origin:top left}h1{position:absolute;left:70px;top:35px;font-size:25px}
            p{position:absolute;left:100px;top:175px;margin:0} ${css}</style></head><body>
            <main id="stage"><h1>共享课堂 · 轻量批注</h1><p>注意输出的空格和大小写。</p></main></body></html>`);
        await page.addScriptTag({ content: script });
    }
    const patch = async (value) => {
        await student.evaluate((patch) => {
            window.value = { ...window.value, ...patch };
            window.surface.render(window.value, window.rect);
        }, value);
    };
    await teacher.exposeFunction('sendPatch', patch);
    await teacher.exposeFunction('clearRemote', () => student.evaluate(() => window.surface.render(null, null)));
    for (let index = 0; index < pages.length; index++) await pages[index].evaluate((isTeacher) => {
        window.value = { startNodeId: 2, endNodeId: 2, startOffset: 0, endOffset: 2, quote: '注意',
            text: '', noteOpen: true, offsetX: 90, offsetY: 70 };
        window.rect = { x: 100, y: 180, width: 254, height: 24 };
        window.surface = Annotation.attachAnnotationSurface({ container: document.querySelector('#stage'), teacher: isTeacher,
            onChange: (patch) => { window.value = { ...window.value, ...patch }; window.sendPatch(patch); },
            onClear: () => { window.surface.render(null, null); window.clearRemote(); } });
        window.surface.render(window.value, window.rect);
    }, index === 0);
    return { teacher, student, errors, close: () => Promise.all(pages.map((page) => page.close())) };
}

const bubble = '[data-share-annotation-note]';
const input = '[data-share-annotation-input]';
const copy = '[data-share-annotation-text]';
async function dimensions(page) {
    return page.locator(bubble).evaluate((node) => ({ width: node.offsetWidth, height: node.offsetHeight }));
}
async function fill(f, text) {
    await f.teacher.locator(input).fill(text);
    await f.student.waitForFunction((text) => window.value.text === text, text);
}

for (const setup of [
    { name: 'matching page fonts', teacherFont: 'Arial, sans-serif', studentFont: 'Arial, sans-serif', teacherScale: 0.63 },
    { name: 'different page font preferences', teacherFont: '"Courier New", "Songti SC", monospace',
        studentFont: 'Arial, "PingFang SC", sans-serif', teacherScale: 1.17 },
]) it(`short Chinese and mixed notes fit identically with ${setup.name}, real site CSS and teacher zoom`, async (t) => {
    const f = await fixture({ ...setup, teacherViewport: { width: 1366, height: 900 }, studentViewport: { width: 900, height: 650 }, teacherDpr: 2, studentDpr: 1 });
    try {
        const results = [];
        for (const text of ['阿斯顿阿斯顿', '阿斯顿啊打发士大夫', '注意 HelloWorld 和空格', 'Hello World', 'sssssssssssssssssss']) {
            await fill(f, text);
            const metrics = async (page, selector) => page.locator(selector).evaluate((node) => {
                const style = getComputedStyle(node);
                let rows = null;
                if (node.tagName !== 'TEXTAREA') {
                    const range = document.createRange(); range.selectNodeContents(node);
                    rows = [...new Set([...range.getClientRects()].map((rect) => Math.round(rect.y * 100)))].length;
                }
                return { bubble: { width: node.parentElement.offsetWidth, height: node.parentElement.offsetHeight },
                    clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
                    font: style.font, letterSpacing: style.letterSpacing, whiteSpace: style.whiteSpace,
                    wordBreak: style.wordBreak, overflowWrap: style.overflowWrap, boxSizing: style.boxSizing, rows };
            });
            results.push({ text, teacher: await metrics(f.teacher, input), student: await metrics(f.student, copy) });
            if (process.env.LIVE_SHARE_SCREENSHOTS === '1') {
                const id = `${setup.teacherScale}-${results.length}`;
                await f.teacher.locator('#stage').screenshot({ path: path.join(os.tmpdir(), `live-share-bubble-wrap-${id}-teacher.png`) });
                await f.student.locator('#stage').screenshot({ path: path.join(os.tmpdir(), `live-share-bubble-wrap-${id}-student.png`) });
            }
        }
        if (process.env.LIVE_SHARE_SCREENSHOTS === '1') t.diagnostic(JSON.stringify(results));
        for (const result of results) {
            assert.deepEqual(result.teacher.bubble, result.student.bubble, `peer dimensions match for ${result.text}`);
            assert.equal(result.teacher.font, result.student.font, 'the shared note font is independent of each page font preference');
            for (const peer of [result.teacher, result.student]) {
                assert(peer.scrollWidth <= peer.clientWidth && peer.scrollHeight <= peer.clientHeight,
                    `an automatically sized short note fully fits ${result.text}: ${JSON.stringify(peer)}`);
            }
            assert.equal(result.student.rows, 1, 'these short notes stay on one visible line without needless wrapping');
        }
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('manual note sizes retain identical mixed-text wrapping and explicit newlines across peer fonts', async () => {
    const f = await fixture({ teacherFont: '"Courier New", "Songti SC", monospace', studentFont: 'Arial, "PingFang SC", sans-serif',
        teacherScale: 0.63, teacherViewport: { width: 1366, height: 900 }, studentViewport: { width: 900, height: 650 }, teacherDpr: 2 });
    try {
        await fill(f, '阿斯顿啊打发士大夫 Hello World sssssssssss\n第二行：检查空格');
        const size = await dimensions(f.teacher);
        const handle = await f.teacher.locator('[data-share-annotation-resize]').boundingBox();
        const x = handle.x + handle.width / 2; const y = handle.y + handle.height / 2;
        await f.teacher.mouse.move(x, y); await f.teacher.mouse.down();
        await f.teacher.mouse.move(x + (120 - size.width) * 0.63, y + (96 - size.height) * 0.63, { steps: 8 });
        await f.teacher.mouse.up();
        await f.student.waitForFunction(() => Math.abs(window.value.width - 120) < 1 && Math.abs(window.value.height - 96) < 1);
        for (const text of ['阿斯顿啊打发士大夫 Hello World sssssssssss\n第二行：检查空格', 'Hello World\n阿斯顿阿斯顿\nssssssssss']) {
            await fill(f, text);
            const metrics = async (page, selector) => page.locator(selector).evaluate((node) => ({
                width: node.clientWidth, height: node.clientHeight, scrollWidth: node.scrollWidth, scrollHeight: node.scrollHeight,
                font: getComputedStyle(node).font, text: node.value || node.textContent,
            }));
            assert.deepEqual(await metrics(f.teacher, input), await metrics(f.student, copy),
                'fixed-width teacher input and learner copy have exactly the same wrapping, line height and scroll extent');
            assert.deepEqual(await dimensions(f.teacher), { width: 120, height: 96 });
            assert.deepEqual(await dimensions(f.student), { width: 120, height: 96 });
        }
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('empty, one-character and two-character notes are compact plain bubbles with identical peer dimensions', async () => {
    const f = await fixture();
    try {
        assert.deepEqual(await dimensions(f.teacher), { width: 36, height: 36 });
        assert.deepEqual(await dimensions(f.student), await dimensions(f.teacher));
        assert.equal(await f.student.locator(copy).textContent(), '…');
        for (const text of ['对', '重点']) {
            await fill(f, text);
            const size = await dimensions(f.teacher);
            assert(size.width <= (text.length === 1 ? 40 : 54) && size.height === 36);
            assert.deepEqual(await dimensions(f.student), size);
            assert.equal(await f.teacher.locator(`${bubble} .live-share-annotation__title, ${bubble} .live-share-annotation__hint`).count(), 0);
            const fit = await f.teacher.locator(input).evaluate((node) => ({ height: node.clientHeight, scroll: node.scrollHeight,
                width: node.clientWidth, scrollWidth: node.scrollWidth }));
            assert(fit.scroll <= fit.height && fit.scrollWidth <= fit.width, 'small bubble fully fits its text without scrolling or clipped glyphs');
        }
        if (process.env.LIVE_SHARE_SCREENSHOTS === '1') {
            await f.student.screenshot({ path: path.join(os.tmpdir(), 'live-share-compact-note.png') });
            await f.teacher.locator(bubble).hover();
            await f.teacher.screenshot({ path: '/tmp/live-share-compact-note-teacher.png' });
        }
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('live typing and newlines grow and shrink the note without losing focus or covering its content', async () => {
    const f = await fixture();
    try {
        await f.teacher.locator(input).focus();
        await f.teacher.locator(input).pressSequentially('first line');
        await f.teacher.locator(input).press('Enter');
        await f.teacher.locator(input).pressSequentially('second line');
        await f.student.waitForFunction(() => window.value.text === 'first line\nsecond line');
        assert(await f.teacher.locator(input).evaluate((node) => document.activeElement === node
            && node.selectionStart === node.value.length && node.scrollHeight <= node.clientHeight));
        assert.deepEqual(await dimensions(f.student), await dimensions(f.teacher));
        assert.equal((await dimensions(f.teacher)).height, 56, 'two text lines need only their own height and bubble padding');
        await f.teacher.locator(bubble).hover();
        const controlsOutside = await f.teacher.locator(bubble).evaluate((node) => {
            const text = node.querySelector('textarea'); const rect = text.getBoundingClientRect(); const style = getComputedStyle(text);
            const content = { left: rect.left + parseFloat(style.paddingLeft), right: rect.right - parseFloat(style.paddingRight),
                top: rect.top + parseFloat(style.paddingTop), bottom: rect.bottom - parseFloat(style.paddingBottom) };
            return [...node.querySelectorAll('button,[data-share-annotation-drag]')].every((control) => {
                const bounds = control.getBoundingClientRect();
                return bounds.right <= content.left || bounds.left >= content.right || bounds.bottom <= content.top || bounds.top >= content.bottom;
            });
        });
        assert(controlsOutside, 'drag, delete and resize hit areas stay outside the written text');
        await fill(f, '好');
        assert.deepEqual(await dimensions(f.teacher), { width: 36, height: 36 }, 'deleting text shrinks an automatically sized bubble');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('long notes remain readable and manual resizing can reach one-character size on both peers', async () => {
    const f = await fixture();
    try {
        const text = Array.from({ length: 35 }, (_, index) => `第 ${index + 1} 行：检查空格和输出格式。`).join('\n');
        await fill(f, text);
        const initial = await dimensions(f.teacher);
        assert(initial.width <= 360 && initial.height === 260);
        assert.deepEqual(await dimensions(f.student), initial);
        await f.teacher.locator('[data-share-annotation-resize]').focus();
        for (let index = 0; index < 20; index++) {
            await f.teacher.locator('[data-share-annotation-resize]').press('Shift+ArrowLeft');
            await f.teacher.locator('[data-share-annotation-resize]').press('Shift+ArrowUp');
        }
        await f.student.waitForFunction(() => window.value.width === 36 && window.value.height === 36);
        assert.deepEqual(await dimensions(f.teacher), { width: 36, height: 36 });
        assert.deepEqual(await dimensions(f.student), { width: 36, height: 36 });
        for (const [page, selector] of [[f.teacher, input], [f.student, copy]]) {
            const scrollbar = await page.locator(selector).evaluate((node) => {
                const style = getComputedStyle(node);
                node.scrollTop = 0;
                return { nativeWidth: style.scrollbarWidth, webkitDisplay: getComputedStyle(node, '::-webkit-scrollbar').display,
                    gutter: node.offsetWidth - node.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
                    overflow: style.overflowY, canScroll: node.scrollHeight > node.clientHeight };
            });
            assert.equal(scrollbar.nativeWidth, 'none', 'standard scrollbars cannot reserve different text width across operating systems');
            assert.equal(scrollbar.webkitDisplay, 'none', 'WebKit scrollbars also stay hidden');
            assert(Math.abs(scrollbar.gutter) <= 1 && scrollbar.overflow === 'auto' && scrollbar.canScroll,
                'long notes retain scrolling without a native scrollbar gutter');
            await page.locator(selector).hover();
            await page.mouse.wheel(0, 120);
            await page.waitForFunction((selector) => document.querySelector(selector).scrollTop > 0, selector);
            const scroll = await page.locator(selector).evaluate((node) => {
                node.scrollTop = node.scrollHeight;
                return { top: node.scrollTop, end: node.scrollHeight - node.clientHeight, text: node.value || node.textContent };
            });
            assert(scroll.top > 0 && Math.abs(scroll.top - scroll.end) <= 1 && scroll.text.endsWith('检查空格和输出格式。'),
                'the last line remains reachable when a teacher deliberately makes a long note small');
        }
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('the wider top drag area is easy to grab without covering text and the small delete button removes both notes', async () => {
    const f = await fixture();
    try {
        await fill(f, '注意');
        const before = await f.teacher.locator(bubble).boundingBox();
        const handle = await f.teacher.locator('[data-share-annotation-drag]').boundingBox();
        assert(handle.height >= 16 && handle.width >= 20, 'the top handle has a practical hit area instead of a narrow border');
        const hitArea = await f.teacher.locator('[data-share-annotation-drag]').evaluate((node) => {
            const bounds = node.getBoundingClientRect();
            const input = node.parentElement.querySelector('textarea');
            const textBounds = input.getBoundingClientRect(); const style = getComputedStyle(input);
            const contentTop = textBounds.top + parseFloat(style.paddingTop);
            const hit = [2, bounds.height / 2, bounds.height - 2].every((y) =>
                document.elementFromPoint(bounds.left + bounds.width / 3, bounds.top + y)?.closest('[data-share-annotation-drag]') === node);
            return { hit, outsideText: bounds.bottom <= contentTop,
                closeWidth: node.parentElement.querySelector('[data-share-annotation-clear]').offsetWidth };
        });
        assert(hitArea.hit && hitArea.outsideText, 'upper, middle and lower handle points are draggable without blocking note text');
        assert(hitArea.closeWidth <= 20, 'the close control remains a small x');
        const learnerHandle = await f.student.locator('.live-share-annotation__header').boundingBox();
        assert(learnerHandle && Math.abs(learnerHandle.height - handle.height) < 1,
            'both peers show the same light top bar');
        assert.equal(await f.student.locator('.live-share-annotation__header').evaluate((node) => getComputedStyle(node).pointerEvents), 'none',
            'the learner top bar is visual only');
        await f.teacher.mouse.move(handle.x + handle.width / 3, handle.y + handle.height / 2);
        await f.teacher.mouse.down(); await f.teacher.mouse.move(handle.x + handle.width / 3 + 85, handle.y + handle.height / 2 + 35, { steps: 8 });
        await f.teacher.mouse.up();
        await f.student.waitForFunction(() => Math.abs(window.value.offsetX - 175) < 1 && Math.abs(window.value.offsetY - 105) < 1);
        const after = await f.teacher.locator(bubble).boundingBox();
        assert(Math.abs(after.x - before.x - 85) < 1 && Math.abs(after.y - before.y - 35) < 1);
        assert.deepEqual(await dimensions(f.student), await dimensions(f.teacher));
        for (const page of [f.teacher, f.student]) assert(await page.evaluate(() => window.value.width === undefined && window.value.height === undefined),
            'dragging only changes position and must not freeze automatic content sizing');
        await fill(f, '好');
        assert.deepEqual(await dimensions(f.teacher), { width: 36, height: 36 }, 'a dragged note still shrinks when its text becomes shorter');
        assert.deepEqual(await dimensions(f.student), await dimensions(f.teacher));
        await f.teacher.locator(bubble).hover();
        await f.teacher.getByRole('button', { name: '删除批注', exact: true }).click();
        await f.student.locator(bubble).waitFor({ state: 'hidden' });
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});
