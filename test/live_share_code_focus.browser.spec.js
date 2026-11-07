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
    const bundle = await build({ entryPoints: [path.join(root, 'packages/ui-default/components/live_share/editor.ts')],
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

async function peers() {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const student = await context.newPage(); const teacher = await context.newPage();
    const errors = [];
    for (const page of [student, teacher]) { page.setDefaultTimeout(6000); page.on('pageerror', (error) => errors.push(error.message)); }
    await Promise.all([student.goto(`${origin}/student`), teacher.goto(`${origin}/teacher`)]);
    await Promise.all([student.waitForFunction(() => ready), teacher.waitForFunction(() => ready)]);
    await student.evaluate((pageId) => {
        window.outbox = [];
        window.editor = monaco.editor.create(document.querySelector('#original'), { value: 'alpha = 12345\nbeta = 67890\nprint(alpha + beta)\n' + Array.from({ length: 35 }, (_, i) => `# line ${i}`).join('\n'),
            language: 'python', fontSize: 20, lineHeight: 30, minimap: { enabled: false }, wordWrap: 'on' });
        document.querySelector('#test-input').value = 'first input line\nsecond input line\nthird input line';
        window.controller = LiveEditors.attachSourceEditors({ pageId, send: (message) => outbox.push(message) });
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
    return { teacher, student, errors, flush, close: () => context.close() };
}

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
