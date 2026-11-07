const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { before, after, it } = require('node:test');
const { build } = require('esbuild');
const stylus = require('stylus');

const root = path.resolve(__dirname, '..');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Bundled browser runtime is supported. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((candidate) => candidate && fs.existsSync(candidate));
const monacoFolder = path.join(root, 'node_modules/monaco-editor/min/vs');
let browser; let server; let origin;
const boxSelector = '[data-share-code-focus] [data-share-annotation-box]';
const pageId = 'code-focus-page';

async function assertCodeOutline(page) {
    assert.equal(await page.locator(`${boxSelector}:visible`).count(), 1, 'the teacher focus is one continuous outline');
    const geometry = await page.locator(`${boxSelector}:visible`).evaluate((outline) => {
        const path = outline.getAttribute('d');
        const transform = outline.getScreenCTM().inverse();
        const contains = (x, y) => {
            const point = outline.ownerSVGElement.createSVGPoint(); point.x = x; point.y = y;
            return outline.isPointInFill(point.matrixTransform(transform));
        };
        const editor = document.querySelector('.live-share-teacher-focus-region')?.closest('.monaco-editor');
        const editorRect = editor?.getBoundingClientRect();
        const lines = [...document.querySelectorAll('.live-share-teacher-focus-region')].map((node) => node.getBoundingClientRect())
            .filter((rect) => rect.width && rect.height && rect.bottom > editorRect.top && rect.top < editorRect.bottom);
        return { path, lines: lines.length, containsText: lines.every((rect) => contains(rect.left + rect.width / 2, rect.top + rect.height / 2)) };
    });
    assert.equal((geometry.path.match(/M/g) || []).length, 1, 'outline has one starting point');
    assert.equal((geometry.path.match(/Z/g) || []).length, 1, 'outline closes once');
    assert(geometry.containsText, 'outline encloses the actual selected text on every visible code line');
    return geometry;
}
before(async () => {
    assert(executablePath, 'Chromium is required for code focus tests');
    const bundle = await build({ stdin: { contents: 'export * from "./packages/ui-default/components/live_share/editor"; export * from "./packages/ui-default/components/live_share/drawing";',
        resolveDir: root, loader: 'ts' },
        bundle: true, write: false, format: 'iife', globalName: 'LiveEditors', plugins: [{ name: 'monaco-runtime', setup(builder) {
            builder.onResolve({ filter: /^monaco-editor\// }, () => ({ path: 'monaco', namespace: 'test' }));
            builder.onResolve({ filter: /^vj\/components\/monaco\/loader$/ }, () => ({ path: 'loader', namespace: 'test' }));
            builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path: name }) => ({
                contents: name === 'monaco' ? 'module.exports=window.monaco' : 'export const load=async()=>({monaco:window.monaco})',
            }));
        } }] });
    const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share.page.styl'), 'utf8'));
    server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/editors.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].text); return; }
        if (url.pathname.startsWith('/vs/')) {
            const file = path.resolve(monacoFolder, url.pathname.slice(4));
            if (!file.startsWith(`${monacoFolder}${path.sep}`) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
            res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.ttf') ? 'font/ttf' : 'application/javascript');
            res.end(fs.readFileSync(file)); return;
        }
        const teacher = url.pathname === '/teacher';
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#eef1f5}#original{position:absolute;left:44px;top:90px;width:680px;height:320px}#test-input{position:absolute;left:44px;top:440px;width:680px;height:150px;font:18px/28px monospace;padding:9px;border:2px solid #ccc}#viewer{position:relative;width:950px;height:700px;transform:scale(${teacher ? 0.75 : 1});transform-origin:top left;pointer-events:none}${css}</style></head><body>
          ${teacher ? '<div id="viewer"></div>' : '<div id="original"></div><textarea id="test-input" name="code" wrap="off"></textarea>'}<div style="height:1700px"></div>
          <script src="/vs/loader.js"></script><script>require.config({paths:{vs:'/vs'}});require(['vs/editor/editor.main'],()=>{const script=document.createElement('script');script.src='/editors.js';script.onload=()=>window.ready=true;document.head.append(script)})</script></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

async function peers(options = {}) {
    const context = await browser.newContext({ viewport: options.studentViewport || { width: 1100, height: 800 }, deviceScaleFactor: options.studentScaleFactor || 1 });
    const teacherContext = await browser.newContext({ viewport: options.teacherViewport || { width: 1100, height: 800 }, deviceScaleFactor: options.teacherScaleFactor || 1 });
    const student = await context.newPage(); const teacher = await teacherContext.newPage();
    const errors = [];
    for (const page of [student, teacher]) { page.setDefaultTimeout(6000); page.on('pageerror', (error) => errors.push(error.message)); }
    await Promise.all([student.goto(`${origin}/student`), teacher.goto(`${origin}/teacher`)]);
    await Promise.all([student.waitForFunction(() => ready), teacher.waitForFunction(() => ready)]);
    await student.evaluate((pageId) => {
        window.outbox = [];
        window.editor = monaco.editor.create(document.querySelector('#original'), { value: 'alpha = 12345\nbeta = 67890\nprint(alpha + beta)\n' + Array.from({ length: 35 }, (_, i) => `# line ${i}`).join('\n'),
            language: 'python', fontSize: 20, lineHeight: 30, minimap: { enabled: false }, wordWrap: 'on' });
        document.querySelector('#test-input').value = 'first input line\nsecond input line\nthird input line';
        window.controller = LiveEditors.attachSourceEditors({ pageId, send: (message) => { outbox.push(message); if (message.type === 'edit:focus') window.lastFocus = message; } });
    }, pageId);
    await teacher.evaluate((pageId) => {
        window.outbox = [];
        window.controller = LiveEditors.attachViewerEditors({ pageId, container: document.querySelector('#viewer'), send: (message) => outbox.push(message) });
        window.sharedEditor = () => monaco.editor.getEditors()[0];
    }, pageId);
    async function flush() {
        await new Promise((resolve) => setTimeout(resolve, 100));
        for (let i = 0; i < 7; i++) {
            const [toTeacher, toStudent] = await Promise.all([student.evaluate(() => outbox.splice(0)), teacher.evaluate(() => outbox.splice(0))]);
            await Promise.all([teacher.evaluate((messages) => messages.forEach((message) => controller.receive(message)), toTeacher),
                student.evaluate((messages) => messages.forEach((message) => controller.receive(message)), toStudent)]);
            if (!toTeacher.length && !toStudent.length) break;
        }
    }
    await flush(); await teacher.waitForFunction(() => !!sharedEditor());
    return { teacher, student, errors, flush, close: () => Promise.all([context.close(), teacherContext.close()]) };
}

it('right-button ink and pinned labels follow actual Monaco content scroll on both peers', { timeout: 40000 }, async () => {
    const f = await peers({ teacherScaleFactor: 2, studentScaleFactor: 1 });
    try {
        await f.teacher.exposeFunction('relayInk', (packet) => f.student.evaluate((value) => window.ink.receive(value), packet));
        await f.student.evaluate(() => {
            const root = document.createElement('div'); root.style.cssText = 'position:fixed;inset:0;pointer-events:none';
            document.body.append(root);
            window.ink = LiveEditors.attachTemporaryDrawing({ container: root, teacher: false, pageId: 'test-ink-page' });
        });
        await f.teacher.evaluate(() => {
            window.inkPackets = [];
            window.ink = LiveEditors.attachTemporaryDrawing({ container: document.querySelector('#viewer'), teacher: true, pageId: 'test-ink-page',
                send: (value) => { window.inkPackets.push(value); window.relayInk(value); } });
        });
        const target = await f.teacher.evaluate(() => {
            const editor = sharedEditor(); const node = editor.getDomNode(); const box = node.getBoundingClientRect();
            const position = editor.getScrolledVisiblePosition({ lineNumber: 4, column: 1 });
            const scale = box.width / node.offsetWidth;
            return { x: box.x + (position.left + 4) * scale, y: box.y + (position.top + 10) * scale };
        });
        await f.teacher.mouse.move(target.x, target.y); await f.teacher.mouse.down({ button: 'right' });
        await f.teacher.mouse.move(target.x + 65, target.y + 4, { steps: 6 }); await f.teacher.mouse.up({ button: 'right' });
        await f.teacher.keyboard.press('Shift+Enter');
        const note = '[data-share-drawing-note]'; const stroke = '[data-share-drawing-stroke]';
        await f.teacher.locator(`${note} textarea`).fill('这行');
        await f.student.waitForFunction(() => document.querySelector('[data-share-drawing-note] textarea')?.value === '这行');
        assert.equal(await f.teacher.evaluate(() => inkPackets[0].anchor?.kind), 'editor');
        const bounds = async () => Promise.all([f.teacher, f.student].map(async (page) => ({
            stroke: await page.locator(stroke).boundingBox(), note: await page.locator(note).boundingBox(),
        })));
        const before = await bounds();
        await f.student.evaluate(() => editor.setScrollPosition({ scrollTop: 60 }, 1));
        await f.flush(); await f.teacher.waitForFunction(() => sharedEditor().getScrollTop() === 60);
        await f.teacher.waitForTimeout(100);
        const after = await bounds();
        for (const [i, scale] of [[0, .75], [1, 1]]) {
            assert(Math.abs(after[i].stroke.y - before[i].stroke.y + 60 * scale) < 1.5, 'ink follows real editor scroll');
            assert(Math.abs(after[i].note.y - before[i].note.y + 60 * scale) < 1.5, 'label follows real editor scroll');
        }
        await f.teacher.evaluate(() => sharedEditor().setScrollPosition({ scrollTop: 700 }, 1));
        await f.flush();
        await f.teacher.locator(note).waitFor({ state: 'hidden' }); await f.student.locator(note).waitFor({ state: 'hidden' });
        await f.teacher.evaluate(() => sharedEditor().setScrollPosition({ scrollTop: 0 }, 1)); await f.flush();
        await f.teacher.locator(note).waitFor(); await f.student.locator(note).waitFor();
        await f.teacher.locator('[data-share-drawing-note-delete]').click();
        await f.student.locator(stroke).waitFor({ state: 'detached' });
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('right-button ink includes the Monaco gutter but remains clipped to its own editor on both peers', { timeout: 30000 }, async () => {
    const f = await peers({ teacherScaleFactor: 2, studentScaleFactor: 1 });
    try {
        await f.teacher.exposeFunction('relayInk', (packet) => f.student.evaluate((value) => window.ink.receive(value), packet));
        await f.student.evaluate(() => {
            const root = document.createElement('div'); root.style.cssText = 'position:fixed;inset:0;pointer-events:none';
            document.body.append(root);
            window.ink = LiveEditors.attachTemporaryDrawing({ container: root, teacher: false, pageId: 'gutter-ink-page' });
        });
        await f.teacher.evaluate(() => {
            window.ink = LiveEditors.attachTemporaryDrawing({ container: document.querySelector('#viewer'), teacher: true,
                pageId: 'gutter-ink-page', send: window.relayInk });
        });
        const bounds = await f.teacher.locator('.monaco-editor').boundingBox();
        await f.teacher.mouse.move(bounds.x + 8, bounds.y + 78);
        await f.teacher.mouse.down({ button: 'right' });
        await f.teacher.mouse.move(bounds.x + 180, bounds.y + 84, { steps: 8 });
        await f.teacher.mouse.up({ button: 'right' });
        await f.student.locator('[data-share-drawing-stroke]').waitFor();
        await f.teacher.keyboard.press('Shift+Enter');
        await f.teacher.locator('[data-share-drawing-note-input]').fill('行号旁也完整');
        await f.student.waitForFunction(() => document.querySelector('[data-share-drawing-note-input]')?.value === '行号旁也完整');
        for (const page of [f.teacher, f.student]) {
            const visible = await page.locator('[data-share-drawing-stroke]').evaluate((stroke) => {
                const editor = document.querySelector('.monaco-editor').getBoundingClientRect();
                const path = stroke.querySelector('path').getBoundingClientRect();
                const clipId = stroke.parentElement.getAttribute('clip-path').match(/#([^)]*)/)[1];
                const clip = document.getElementById(clipId).querySelector('rect');
                const svg = stroke.ownerSVGElement;
                const point = svg.createSVGPoint();
                point.x = Number(clip.getAttribute('x')); point.y = Number(clip.getAttribute('y'));
                const start = point.matrixTransform(svg.getScreenCTM());
                point.x += Number(clip.getAttribute('width')); point.y += Number(clip.getAttribute('height'));
                const end = point.matrixTransform(svg.getScreenCTM());
                return { editor: { left: editor.left, right: editor.right, top: editor.top, bottom: editor.bottom },
                    clip: { left: start.x, right: end.x, top: start.y, bottom: end.y }, startX: path.left };
            });
            assert(visible.startX > visible.clip.left + 2, 'the beginning of the stroke in the line-number gutter is visible');
            for (const key of ['left', 'right', 'top', 'bottom']) assert(Math.abs(visible.clip[key] - visible.editor[key]) < 1,
                `ink clips to this editor's ${key} edge, not its text column or an unrelated panel`);
        }
        await f.teacher.screenshot({ path: path.join(os.tmpdir(), 'live-share-monaco-gutter-ink-teacher.png') });
        await f.student.screenshot({ path: path.join(os.tmpdir(), 'live-share-monaco-gutter-ink-student.png') });
        await f.student.evaluate(() => editor.setScrollPosition({ scrollTop: 600 }, 1));
        await f.flush();
        await f.teacher.locator('[data-share-drawing-stroke]').waitFor({ state: 'hidden' });
        await f.student.locator('[data-share-drawing-stroke]').waitFor({ state: 'hidden' });
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('first-row and partially scrolled code selections retain a complete visible outline at the editor edge', { timeout: 30000 }, async () => {
    const f = await peers({ teacherScaleFactor: 2, studentScaleFactor: 1 });
    try {
        await f.teacher.evaluate(() => sharedEditor().setSelection(new monaco.Selection(1, 3, 1, 11)));
        await f.flush();
        await f.student.locator(`${boxSelector}:visible`).waitFor();
        for (const scrollTop of [0, 14]) {
            await f.student.evaluate((scrollTop) => editor.setScrollPosition({ scrollTop }, 1), scrollTop);
            await f.flush();
            await f.teacher.waitForFunction((scrollTop) => sharedEditor().getScrollTop() === scrollTop, scrollTop);
            await f.flush(); // Deliver geometry measured after the remote scroll has rendered.
            const paths = [];
            for (const [page, scale] of [[f.teacher, .75], [f.student, 1]]) {
                const geometry = await page.locator(`${boxSelector}:visible`).evaluate((outline) => {
                    const box = outline.getBoundingClientRect();
                    const layer = outline.closest('[data-share-code-focus]').getBoundingClientRect();
                    return { path: outline.getAttribute('d'), top: box.top, bottom: box.bottom, left: box.left, right: box.right,
                        layer: { top: layer.top, bottom: layer.bottom, left: layer.left, right: layer.right },
                        stroke: Number.parseFloat(getComputedStyle(outline).strokeWidth) };
                });
                assert(geometry.top - geometry.stroke * scale / 2 >= geometry.layer.top - .1,
                    'the entire top stroke stays inside the visible editor, including the first code row');
                assert(geometry.bottom + geometry.stroke * scale / 2 <= geometry.layer.bottom + .1);
                paths.push(geometry.path);
            }
            assert.equal(paths[0], paths[1], 'both peers use the same complete outline regardless of DPR and stage scale');
        }
        await f.student.screenshot({ path: path.join(os.tmpdir(), 'live-share-monaco-top-outline.png') });
        await f.student.evaluate(() => editor.setScrollPosition({ scrollTop: 100 }, 1));
        await f.flush();
        await f.teacher.locator(`${boxSelector}:visible`).waitFor({ state: 'hidden' });
        await f.student.locator(`${boxSelector}:visible`).waitFor({ state: 'hidden' });
        assert.equal(await f.teacher.locator(`${boxSelector}:visible`).count(), 0, 'offscreen code does not leave an outline on the toolbar');
        assert.equal(await f.student.locator(`${boxSelector}:visible`).count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('Monaco teacher selections show exact line frames on both peers without moving learner selection or capturing Enter', { timeout: 30000 }, async () => {
    const f = await peers();
    try {
        await f.student.evaluate(() => editor.setSelection(new monaco.Selection(3, 1, 3, 6)));
        await f.flush();
        assert.equal(await f.teacher.locator(`${boxSelector}:visible`).count(), 0, 'student cursor is not a teacher focus');
        await f.teacher.evaluate(() => sharedEditor().setSelection(new monaco.Selection(1, 4, 2, 9)));
        await f.flush();
        await f.student.locator(`${boxSelector}:visible`).first().waitFor();
        assert.equal((await assertCodeOutline(f.student)).lines, 2);
        assert.equal((await assertCodeOutline(f.teacher)).lines, 2);
        const sourceBoxes = await f.student.locator(`${boxSelector}:visible`).evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
        const teacherBoxes = await f.teacher.locator(`${boxSelector}:visible`).evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
        for (let i = 0; i < sourceBoxes.length; i++) for (const key of ['x', 'y', 'w', 'h']) {
            assert(Math.abs(sourceBoxes[i][key] * 0.75 - teacherBoxes[i][key]) < 2, `scaled ${key} matches line ${i}`);
        }
        assert.equal(await f.student.evaluate(() => editor.getSelection().startLineNumber), 3, 'teacher focus leaves learner caret untouched');
        assert(await f.student.locator('[data-share-code-focus] [data-share-annotation-arrow]:visible').count());
        assert.equal(await f.teacher.locator('[data-share-code-focus] [data-share-annotation-note]:visible').count(), 0);
        await f.teacher.evaluate(() => { sharedEditor().focus(); sharedEditor().trigger('keyboard', 'type', { text: '\n' }); });
        await f.flush();
        assert.equal(await f.student.evaluate(() => editor.getValue()), await f.teacher.evaluate(() => sharedEditor().getValue()));
        assert.equal(await f.student.locator(`${boxSelector}:visible`).count(), 0, 'typing collapses the teacher selection and clears focus');
        assert.equal(await f.teacher.locator('[data-share-annotation-note]:visible').count(), 0, 'Enter remains code editing');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('code focus tracks relative ranges, scrolling and layout; disconnect removes remote highlights', { timeout: 30000 }, async () => {
    const f = await peers();
    try {
        await f.teacher.evaluate(() => sharedEditor().setSelection(new monaco.Selection(2, 1, 3, 7)));
        await f.flush(); await f.student.locator(`${boxSelector}:visible`).first().waitFor();
        await f.student.evaluate(() => editor.executeEdits('student', [{ range: new monaco.Range(1, 1, 1, 1), text: '# inserted\n' }]));
        await f.flush();
        const selected = await f.teacher.evaluate(() => sharedEditor().getModel().getValueInRange(sharedEditor().getSelection()));
        assert.equal(selected, 'beta = 67890\nprint(');
        const y = await f.student.locator(`${boxSelector}:visible`).first().evaluate((node) => node.getBoundingClientRect().y);
        await f.student.evaluate(() => window.scrollTo(0, 40));
        await f.student.waitForFunction(({ selector, y }) => Math.abs(document.querySelector(selector).getBoundingClientRect().y - y + 40) < 2, { selector: boxSelector, y });
        await f.teacher.evaluate(() => sharedEditor().setScrollTop(450)); await f.flush();
        await f.student.locator(`${boxSelector}:visible`).first().waitFor({ state: 'hidden' });
        await f.teacher.evaluate(() => sharedEditor().setScrollTop(0)); await f.flush();
        await f.student.locator(`${boxSelector}:visible`).first().waitFor();
        await Promise.all([f.student.evaluate(() => controller.setConnected(false)), f.teacher.evaluate(() => controller.setConnected(false))]);
        assert.equal(await f.student.locator(`${boxSelector}:visible`).count(), 0);
        assert.equal(await f.teacher.locator(`${boxSelector}:visible`).count(), 0);
        await Promise.all([f.student.evaluate(() => controller.dispose()), f.teacher.evaluate(() => controller.dispose())]);
        assert.equal(await f.student.locator('[data-share-code-focus]').count(), 0);
        assert.equal(await f.teacher.locator('[data-share-code-focus]').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('shared textarea selections frame only teacher-selected text and do not turn Enter into annotation input', { timeout: 30000 }, async () => {
    const f = await peers();
    try {
        await f.teacher.locator('textarea[data-live-share-editor]').waitFor();
        await f.teacher.locator('textarea[data-live-share-editor]').evaluate((node) => { node.focus(); node.setSelectionRange(6, 26); });
        await f.flush();
        await f.student.locator(`${boxSelector}:visible`).first().waitFor();
        assert.equal(await f.student.locator(`${boxSelector}:visible`).count(), 1);
        assert.equal(await f.teacher.locator(`${boxSelector}:visible`).count(), 1);
        await f.student.locator('#test-input').evaluate((node) => { node.value = `new\n${node.value}`; node.dispatchEvent(new Event('input', { bubbles: true })); });
        await f.flush();
        assert.deepEqual(await f.teacher.locator('textarea[data-live-share-editor]').evaluate((node) => [node.selectionStart, node.selectionEnd]), [10, 30],
            'a learner insertion before the range preserves the teacher selected content');
        const before = await f.student.locator('#test-input').inputValue();
        await f.teacher.locator('textarea[data-live-share-editor]').press('Enter');
        await f.flush();
        assert.equal(await f.student.locator('#test-input').inputValue(), `${before.slice(0, 10)}\n${before.slice(30)}`);
        assert.equal(await f.student.locator(`${boxSelector}:visible`).count(), 0);
        assert.equal(await f.teacher.locator('[data-share-annotation-note]:visible').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('soft-wrapped code uses rendered line fragments and follows an editor resize on both computers', { timeout: 30000 }, async () => {
    const f = await peers();
    try {
        await f.student.evaluate(() => editor.setValue('value = "' + 'abcdefghij'.repeat(15) + '"'));
        await f.flush();
        await f.teacher.evaluate(() => sharedEditor().setSelection(new monaco.Selection(1, 10, 1, 145)));
        await f.flush();
        await f.student.locator(`${boxSelector}:visible`).first().waitFor();
        const initialLines = (await assertCodeOutline(f.student)).lines;
        assert(initialLines > 1, 'one long model line is framed as separate visible wrapped lines');
        assert.equal((await assertCodeOutline(f.teacher)).lines, initialLines);
        await f.student.evaluate(() => { document.querySelector('#original').style.width = '380px'; editor.layout(); });
        await f.flush();
        await f.teacher.waitForFunction(() => sharedEditor().getLayoutInfo().width === 380);
        const resizedLines = (await assertCodeOutline(f.student)).lines;
        assert(resizedLines > initialLines, 'narrower code column produces more line frames');
        assert.equal((await assertCodeOutline(f.teacher)).lines, resizedLines);
        const unselected = await f.student.locator(`${boxSelector}:visible`).evaluate((outline) => {
            const lines = [...document.querySelectorAll('.live-share-teacher-focus-region')].map((node) => node.getBoundingClientRect());
            const last = lines.at(-1); const right = Math.max(...lines.map((line) => line.right));
            const point = outline.ownerSVGElement.createSVGPoint(); point.x = (last.right + right) / 2; point.y = last.top + last.height / 2;
            return { trailingSpace: right - last.right, enclosed: outline.isPointInFill(point.matrixTransform(outline.getScreenCTM().inverse())) };
        });
        assert(unselected.trailingSpace > 20);
        assert.equal(unselected.enclosed, false, 'the irregular outline excludes unselected space after the short final line');
        await f.teacher.evaluate(() => sharedEditor().setPosition({ lineNumber: 1, column: 20 }));
        await f.flush();
        assert.equal(await f.student.locator(`${boxSelector}:visible`).count(), 0, 'collapsing the selection clears the learner frames');
        assert.equal(await f.teacher.locator(`${boxSelector}:visible`).count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('teacher clicks outside Monaco or textarea clear the temporary focus without changing native selections', { timeout: 30000 }, async () => {
    const f = await peers();
    try {
        await f.teacher.evaluate(() => {
            document.body.insertAdjacentHTML('beforeend', '<button id="outside" style="position:fixed;right:20px;top:20px">老师助手</button>');
            sharedEditor().focus(); sharedEditor().setSelection(new monaco.Selection(2, 1, 2, 9));
        });
        await f.flush(); await f.student.locator(`${boxSelector}:visible`).first().waitFor();
        await f.student.locator('#test-input').click(); await f.flush();
        assert(await f.student.locator(`${boxSelector}:visible`).count(), 'a learner focus change must not clear the teacher focus');
        await f.teacher.getByRole('button', { name: '老师助手' }).click();
        await f.flush();
        assert.equal(await f.student.locator(`${boxSelector}:visible`).count(), 0);
        assert.equal(await f.teacher.locator(`${boxSelector}:visible`).count(), 0);
        assert.equal(await f.teacher.evaluate(() => sharedEditor().getModel().getValueInRange(sharedEditor().getSelection())), 'beta = 6', 'leaving the editor keeps its native selection');
        await f.student.evaluate(() => editor.executeEdits('student', [{ range: new monaco.Range(1, 1, 1, 1), text: '# before\n' }]));
        await f.flush();
        assert.equal(await f.teacher.locator(`${boxSelector}:visible`).count(), 0, 'remote edits must not reopen a blurred editor focus');
        await f.teacher.evaluate(() => sharedEditor().focus());
        await f.flush(); await f.student.locator(`${boxSelector}:visible`).first().waitFor();

        await f.teacher.locator('textarea[data-live-share-editor]').evaluate((node) => { node.focus(); node.setSelectionRange(6, 26); });
        await f.flush();
        assert.equal(await f.student.locator(`${boxSelector}:visible`).count(), 1, 'only the currently focused code input is framed');
        await f.teacher.getByRole('button', { name: '老师助手' }).click(); await f.flush();
        assert.equal(await f.student.locator(`${boxSelector}:visible`).count(), 0);
        assert.equal(await f.teacher.locator(`${boxSelector}:visible`).count(), 0);
        assert.deepEqual(await f.teacher.locator('textarea[data-live-share-editor]').evaluate((node) => [node.selectionStart, node.selectionEnd]), [6, 26]);
        await f.teacher.locator('textarea[data-live-share-editor]').focus(); await f.flush();
        assert.equal(await f.student.locator(`${boxSelector}:visible`).count(), 1, 'returning to the existing textarea selection restores focus');
        assert.equal(await f.teacher.locator('[data-share-annotation-note]:visible').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

const noteSelector = '[data-share-code-annotation]';
async function addCodeNote(f, range = [2, 1, 2, 9]) {
    await f.teacher.evaluate((range) => {
        sharedEditor().focus(); sharedEditor().setSelection(new monaco.Selection(...range));
    }, range);
    await f.teacher.keyboard.press('Shift+Enter');
    await f.flush();
    await f.teacher.waitForFunction(() => document.activeElement?.matches('[data-share-annotation-input]'));
    const id = await f.teacher.evaluate(() => document.activeElement.closest('[data-share-code-annotation]').dataset.shareCodeAnnotation);
    return f.teacher.locator(`[data-share-code-annotation="${id}"] [data-share-annotation-input]`);
}

it('Shift+Enter creates live code notes on both peers; typing and newline in notes never alter learner code', { timeout: 30000 }, async () => {
    const f = await peers();
    try {
        const initial = await f.student.evaluate(() => {
            window.changeEvents = 0; editor.onDidChangeModelContent(() => changeEvents++);
            editor.setSelection(new monaco.Selection(3, 1, 3, 6));
            return editor.getValue();
        });
        const input = await addCodeNote(f);
        assert.equal(await f.student.locator(`${noteSelector} [data-share-annotation-note]:visible`).count(), 1);
        assert.equal(await f.teacher.locator(`${noteSelector} [data-share-annotation-arrow]:visible`).count(), 0);
        await input.fill('先看变量'); await input.press('Enter'); await input.press('End');
        await f.teacher.keyboard.insertText('再看输出'); await f.flush();
        assert.equal(await input.inputValue(), '先看变量\n再看输出');
        assert.equal(await f.student.locator(`${noteSelector} [data-share-annotation-note]`).textContent().then((text) => text.includes('先看变量\n再看输出')), true);
        assert.equal(await f.student.evaluate(() => editor.getValue()), initial);
        assert.equal(await f.student.evaluate(() => changeEvents), 0, 'annotations never trigger code persistence or rejudging');
        assert.equal(await f.student.evaluate(() => editor.getSelection().startLineNumber), 3);
        assert.deepEqual(await f.teacher.evaluate(() => controller.getPendingDrafts()), [], 'notes are not unsaved code drafts');
        await f.teacher.evaluate(() => { sharedEditor().focus(); sharedEditor().setPosition({ lineNumber: 4, column: 1 }); });
        await f.teacher.keyboard.press('Enter'); await f.flush();
        assert.equal(await f.student.evaluate(() => editor.getValue()), initial.replace('# line 0', '\n# line 0'));
        assert.equal(await f.teacher.locator(noteSelector).count(), 1, 'normal code Enter must not open an additional note');
        assert.equal(await f.student.locator(noteSelector).count(), 1);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('multiple code notes retain independent anchors, drag and resize together, and survive reconnect until deleted', { timeout: 30000 }, async () => {
    const f = await peers();
    try {
        const first = await addCodeNote(f, [1, 1, 1, 6]); await first.fill('甲'); await f.flush();
        const second = await addCodeNote(f, [3, 1, 3, 6]); await second.fill('乙'); await f.flush();
        assert.equal(await f.teacher.locator(noteSelector).count(), 2);
        assert.equal(await f.student.locator(noteSelector).count(), 2);
        const id = await first.evaluate((node) => node.closest('[data-share-code-annotation]').dataset.shareCodeAnnotation);
        const firstRoot = `${noteSelector}[data-share-code-annotation="${id}"]`;
        const teacherBubble = f.teacher.locator(`${firstRoot} [data-share-annotation-note]`);
        const studentBubble = f.student.locator(`${firstRoot} [data-share-annotation-note]`);
        const before = await teacherBubble.boundingBox();
        const handle = await f.teacher.locator(`${firstRoot} [data-share-annotation-drag]`).boundingBox();
        await f.teacher.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
        await f.teacher.mouse.down(); await f.teacher.mouse.move(handle.x + handle.width / 2 + 95, handle.y + handle.height / 2 + 35, { steps: 4 });
        await f.teacher.mouse.up(); await f.flush();
        const dragged = await teacherBubble.boundingBox();
        assert(dragged.x > before.x + 50, `teacher can drag one code note: ${JSON.stringify({before, handle, dragged})}`);
        const grip = f.teacher.locator(`${firstRoot} [data-share-annotation-resize]`);
        await grip.press('ArrowRight'); await grip.press('ArrowDown'); await f.flush();
        const resized = await teacherBubble.boundingBox(); const sourceSize = await studentBubble.boundingBox();
        assert(resized.width > dragged.width + 5); assert(resized.height > dragged.height + 5);
        for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(sourceSize[key] * .75 - resized[key]) < 2, `note ${key} aligns after scale`);
        // The selected content moves exactly one line. Its outside stroke is
        // inset at the first-row viewport edge, so measure the content anchor.
        const selection = `${firstRoot} [data-share-annotation-selection]`;
        const oldY = await f.student.locator(selection).evaluate((node) => node.getBoundingClientRect().y);
        await f.student.evaluate(() => editor.executeEdits('student', [{ range: new monaco.Range(1, 1, 1, 1), text: '# prefix\n' }]));
        await f.flush();
        await f.student.waitForFunction(({ selector, oldY }) => {
            const shape = document.querySelector(selector);
            return shape && Math.abs(shape.getBoundingClientRect().y - oldY - 30) < 2;
        }, { selector: selection, oldY });
        const newY = await f.student.locator(selection).evaluate((node) => node.getBoundingClientRect().y);
        assert(Math.abs(newY - oldY - 30) < 2, 'relative note anchor follows code inserted before the selected word');
        await Promise.all([f.teacher.evaluate(() => controller.setConnected(false)), f.student.evaluate(() => controller.setConnected(false))]);
        assert.equal(await f.teacher.locator(`${noteSelector}:visible`).count(), 0);
        await Promise.all([f.teacher.evaluate(() => controller.setConnected(true)), f.student.evaluate(() => controller.setConnected(true))]);
        await f.flush();
        assert.equal(await f.teacher.locator(`${noteSelector}:visible`).count(), 2);
        assert.equal(await f.student.locator(`${noteSelector}:visible`).count(), 2);
        await teacherBubble.hover();
        await f.teacher.locator(`${firstRoot} [data-share-annotation-clear]`).click(); await f.flush();
        assert.equal(await f.teacher.locator(noteSelector).count(), 1);
        assert.equal(await f.student.locator(noteSelector).count(), 1);
        assert.equal(await f.student.locator(`${noteSelector} [data-share-annotation-note]`).textContent().then((text) => text.includes('乙')), true);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('read-only Monaco and textarea accept code annotations with Shift+Enter without unlocking their source text', { timeout: 30000 }, async () => {
    const f = await peers();
    try {
        const original = await f.student.evaluate(() => {
            editor.updateOptions({ readOnly: true });
            document.querySelector('#test-input').readOnly = true;
            window.inputEvents = 0; document.querySelector('#test-input').addEventListener('input', () => inputEvents++);
            return editor.getValue();
        });
        await f.flush();
        const codeNote = await addCodeNote(f); await codeNote.fill('只读讲解'); await f.flush();
        assert.equal(await f.teacher.evaluate(() => sharedEditor().getRawOptions().readOnly), true);
        const textarea = f.teacher.locator('textarea[data-live-share-editor]');
        await textarea.evaluate((node) => { node.focus(); node.setSelectionRange(0, 5); });
        await textarea.press('Shift+Enter'); await f.flush();
        await f.teacher.waitForFunction(() => document.activeElement?.matches('[data-share-annotation-input]'));
        await f.teacher.locator(`${noteSelector} [data-share-annotation-input]`).last().fill('输入提示'); await f.flush();
        assert.equal(await f.student.locator(noteSelector).count(), 2);
        assert.equal(await f.student.locator('#test-input').inputValue(), 'first input line\nsecond input line\nthird input line');
        assert.equal(await f.student.evaluate(() => inputEvents), 0);
        assert.equal(await f.student.evaluate(() => editor.getValue()), original);
        assert.equal(await textarea.evaluate((node) => node.readOnly), true);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('empty code notes disappear after leaving, while text and note controls preserve the intended annotation', { timeout: 30000 }, async () => {
    const f = await peers();
    try {
        const initial = await f.student.evaluate(() => editor.getValue());
        const empty = await addCodeNote(f);
        const id = await empty.evaluate((node) => node.closest('[data-share-code-annotation]').dataset.shareCodeAnnotation);
        const root = `[data-share-code-annotation="${id}"]`;
        const grip = f.teacher.locator(`${root} [data-share-annotation-resize]`);
        // Focusing a note control is still editing that note, not an outside click.
        await grip.press('ArrowRight'); await grip.press('ArrowDown'); await f.flush();
        assert.equal(await f.teacher.locator(root).count(), 1);
        assert.equal(await f.student.locator(root).count(), 1);
        const handle = await f.teacher.locator(`${root} [data-share-annotation-drag]`).boundingBox();
        await f.teacher.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
        await f.teacher.mouse.down(); await f.teacher.mouse.move(handle.x + handle.width / 2 + 35, handle.y + handle.height / 2 + 20, { steps: 3 });
        await f.teacher.mouse.up(); await f.flush();
        assert.equal(await f.teacher.locator(root).count(), 1, 'dragging an empty note must not delete it');
        await f.teacher.evaluate(() => sharedEditor().focus()); await f.flush();
        assert.equal(await f.teacher.locator(noteSelector).count(), 0, 'leaving a blank note removes it');
        assert.equal(await f.student.locator(noteSelector).count(), 0);
        const written = await addCodeNote(f); await written.fill('保留这条讲解'); await f.flush();
        await f.teacher.evaluate(() => sharedEditor().focus()); await f.flush();
        assert.equal(await f.teacher.locator(noteSelector).count(), 1, 'a note with text remains after editing code');
        assert.equal(await f.student.locator(noteSelector).count(), 1);
        await written.fill('   '); await f.teacher.evaluate(() => sharedEditor().focus()); await f.flush();
        assert.equal(await f.teacher.locator(noteSelector).count(), 0, 'clearing all text then leaving removes the note');
        assert.equal(await f.student.locator(noteSelector).count(), 0);
        assert.equal(await f.student.evaluate(() => editor.getValue()), initial);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('different display pixel densities and teacher zoom keep wrapped Monaco outlines in learner coordinates', { timeout: 30000 }, async () => {
    const f = await peers({ studentViewport: { width: 1366, height: 768 }, teacherViewport: { width: 1920, height: 1080 }, studentScaleFactor: 1, teacherScaleFactor: 2 });
    try {
        await f.student.evaluate(() => {
            document.querySelector('#original').style.width = '527px'; editor.layout();
            editor.updateOptions({ fontSize: 23, lineHeight: 31, letterSpacing: 0.3, glyphMargin: true, minimap: { enabled: true }, wordWrap: 'on' });
            editor.setValue('const message = "' + 'Ab中文\t'.repeat(50) + '";\nconst next = 42;');
        });
        await f.flush();
        await f.teacher.evaluate(() => { sharedEditor().focus(); sharedEditor().setSelection(new monaco.Selection(1, 18, 1, 100)); });
        await f.flush();
        for (const zoom of [0.63, 1.17, 0.9]) {
            await f.teacher.evaluate((value) => { document.querySelector('#viewer').style.transform = `scale(${value})`; }, zoom);
            await f.flush();
            const paths = await Promise.all([f.student, f.teacher].map((page) => page.locator(`${boxSelector}:visible`).first().getAttribute('d')));
            assert.equal(paths[1], paths[0], `wrapped shape must match at teacher zoom ${zoom}`);
            await f.teacher.setViewportSize({ width: 760, height: 540 });
        }
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('textarea focus uses the learner padding and wrapping when teacher screen size differs', { timeout: 30000 }, async () => {
    const f = await peers({ studentViewport: { width: 1366, height: 768 }, teacherViewport: { width: 900, height: 650 }, teacherScaleFactor: 2 });
    try {
        await f.student.locator('#test-input').evaluate((node) => {
            node.wrap = 'soft'; node.style.width = '360px'; node.style.padding = '18px 24px'; node.style.letterSpacing = '0.4px';
            node.style.overflowY = 'scroll'; node.style.scrollbarGutter = 'stable';
            node.value = 'A very long test input line with numbers 12345 and repeated words to wrap into several rows.\nSecond line';
            node.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await f.flush();
        await f.teacher.locator('textarea[data-live-share-editor]').evaluate((node) => { node.focus(); node.setSelectionRange(7, 85); });
        await f.flush();
        // Deliver asynchronous learner geometry until both peers have rendered it.
        let paths;
        for (let attempt = 0; attempt < 12; attempt++) {
            await f.flush();
            paths = await Promise.all([f.student, f.teacher].map((page) => page.locator(`${boxSelector}:visible`).first().getAttribute('d')));
            if (paths[0] === paths[1]) break;
        }
        assert.equal(paths[1], paths[0], 'textarea outline follows the same learner rows');
        const widths = await Promise.all([f.student.locator('#test-input'), f.teacher.locator('textarea[data-live-share-editor]')].map((field) => field.evaluate((node) => {
            const style = getComputedStyle(node); return node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        })));
        assert.equal(widths[1], widths[0], 'textarea text space matches even with a reserved learner scrollbar gutter');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('late code focus geometry cannot restore pre-deletion frames, and unchanged notes republish after reconnect', { timeout: 30000 }, async () => {
    const f = await peers();
    try {
        const note = await addCodeNote(f, [3, 1, 3, 6]); await note.fill('检查输出'); await f.flush(); await f.flush();
        const old = await f.student.evaluate(() => lastFocus);
        const selector = `${noteSelector} [data-share-annotation-box]`;
        const before = await f.teacher.locator(selector).boundingBox();
        await f.student.evaluate(() => editor.executeEdits('delete-only', [{ range: new monaco.Range(1, 1, 2, 1), text: '' }]));
        await f.student.waitForTimeout(120);
        const messages = await f.student.evaluate(() => outbox.splice(0));
        await f.teacher.evaluate((messages) => messages.filter((message) => message.type !== 'edit:focus').forEach((message) => controller.receive(message)), messages);
        await f.teacher.evaluate((message) => controller.receive(message), old);
        await f.teacher.waitForTimeout(60);
        const after = await f.teacher.locator(selector).boundingBox();
        assert(Math.abs(after.y - before.y + 22.5) < 1, 'stale pre-deletion geometry must not move the note back to its old row');
        const current = await f.student.evaluate(() => lastFocus);
        assert.notEqual(current.focus.revision, old.focus.revision);
        for (const invalid of [
            { ...current, pageId: 'old-page' },
            { ...current, focus: { ...current.focus, width: current.focus.width + 10 } },
            { ...current, focus: { ...current.focus, scrollTop: current.focus.scrollTop + 40 } },
            { ...current, focus: { ...current.focus, selections: current.focus.selections.map((entry) => ({ ...entry, noteId: 'other-note', rects: [{ x: 150, y: 220, width: 100, height: 25 }] })) } },
        ]) {
            await f.teacher.evaluate((message) => controller.receive(message), invalid);
            await f.teacher.waitForTimeout(30);
            assert(Math.abs((await f.teacher.locator(selector).boundingBox()).y - after.y) < 1, 'foreign page, note, viewport or scroll cannot replace this note frame');
        }
        await Promise.all([f.teacher.evaluate(() => controller.setConnected(false)), f.student.evaluate(() => controller.setConnected(false))]);
        await Promise.all([f.teacher.evaluate(() => controller.setConnected(true)), f.student.evaluate(() => controller.setConnected(true))]);
        await f.flush(); await f.flush();
        assert.equal(await f.teacher.locator(selector).getAttribute('d'), await f.student.locator(selector).getAttribute('d'));
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('queued focus batches discard geometry measured before a simultaneous resize and code deletion', { timeout: 30000 }, async () => {
    const f = await peers();
    try {
        await f.student.evaluate(() => {
            const timeout = window.setTimeout.bind(window); const clear = window.clearTimeout.bind(window);
            const raf = window.requestAnimationFrame.bind(window); const cancel = window.cancelAnimationFrame.bind(window);
            const queued = new Map(); const frames = new Set();
            window.setTimeout = (callback, delay, ...args) => {
                if (delay !== 40) return timeout(callback, delay, ...args);
                const id = timeout(() => {}, 60000); queued.set(id, () => callback(...args)); return id;
            };
            window.clearTimeout = (id) => { queued.delete(id); clear(id); };
            window.requestAnimationFrame = (callback) => {
                const id = raf((time) => { frames.delete(id); callback(time); }); frames.add(id); return id;
            };
            window.pauseMeasuredFrames = () => { for (const id of frames) cancel(id); frames.clear(); window.requestAnimationFrame = () => 0; };
            window.drainMeasuredBatch = () => {
                const callbacks = [...queued]; queued.clear();
                for (const [id, callback] of callbacks) { clear(id); callback(); }
            };
            window.restoreMeasuredFrames = () => {
                window.setTimeout = timeout; window.clearTimeout = clear;
                window.requestAnimationFrame = raf; window.cancelAnimationFrame = cancel;
                drainMeasuredBatch();
            };
        });
        await f.teacher.evaluate(() => { sharedEditor().focus(); sharedEditor().setSelection(new monaco.Selection(2, 1, 3, 6)); });
        await f.flush(); await f.student.locator(`${boxSelector}:visible`).waitFor();
        const pending = await f.student.evaluate(() => {
            pauseMeasuredFrames(); outbox.length = 0;
            document.querySelector('#original').style.width = '360px'; editor.layout();
            editor.executeEdits('delete-only', [{ range: new monaco.Range(1, 1, 2, 1), text: '' }]);
            drainMeasuredBatch();
            return outbox.filter((message) => message.type === 'edit:focus' && message.editorId === editor.getDomNode().dataset.liveShareEditor);
        });
        assert.deepEqual(pending, [], 'old measured rectangles must never be relabelled with the resized editor or deleted-code revision');
        await f.student.evaluate(() => restoreMeasuredFrames()); await f.flush();
        await f.teacher.evaluate(() => sharedEditor().setSelection(new monaco.Selection(1, 1, 2, 6)));
        let paths;
        for (let attempt = 0; attempt < 12; attempt++) {
            await f.flush();
            paths = await Promise.all([f.student, f.teacher].map((page) => page.locator(`${boxSelector}:visible`).getAttribute('d')));
            if (paths[0] === paths[1]) break;
        }
        assert.equal(paths[1], paths[0], 'a fresh measurement restores matching outlines after the resize/delete batch');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});
