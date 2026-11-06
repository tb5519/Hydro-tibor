const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');

let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Use the installed browser test runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
const root = path.resolve(__dirname, '..');
const monacoFolder = path.join(root, 'node_modules/monaco-editor/min/vs');
let browser;
let server;
let origin;
before(async () => {
    if (!executablePath) return;
    const bundle = await esbuild.build({
        entryPoints: [path.join(root, 'packages/ui-default/components/live_share/editor.ts')],
        bundle: true, write: false, format: 'iife', globalName: 'LiveEditors', platform: 'browser',
        plugins: [{ name: 'use-real-monaco-browser-runtime', setup(build) {
            build.onResolve({ filter: /^monaco-editor\// }, () => ({ path: 'monaco', namespace: 'test-runtime' }));
            build.onResolve({ filter: /^vj\/components\/monaco\/loader$/ }, () => ({ path: 'loader', namespace: 'test-runtime' }));
            build.onLoad({ filter: /.*/, namespace: 'test-runtime' }, ({ path: module }) => ({
                contents: module === 'monaco' ? 'module.exports = window.monaco;' : 'export const load = async () => ({ monaco: window.monaco });',
            }));
        } }],
    });
    const javascript = bundle.outputFiles[0].text;
    server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/shared-editor.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(javascript); return; }
        if (pathname.startsWith('/vs/')) {
            const file = path.resolve(monacoFolder, pathname.slice(4));
            if (!file.startsWith(`${monacoFolder}${path.sep}`) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
            response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.ttf') ? 'font/ttf' : 'application/javascript');
            response.end(fs.readFileSync(file)); return;
        }
        response.setHeader('Content-Type', 'text/html');
        response.end(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}#original{position:absolute;left:24px;top:24px;width:700px;height:400px}#viewer{position:absolute;inset:0;width:900px;height:650px;pointer-events:none}</style></head><body><div id="original"></div><div id="viewer"></div><script src="/vs/loader.js"></script><script>require.config({ paths: { vs: '/vs' } });require(['vs/editor/editor.main'], function () { var script=document.createElement('script');script.src='/shared-editor.js';script.onload=function(){window.ready=true};document.head.appendChild(script); });</script></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

it('real Monaco peers merge concurrent edits, persist source drafts, selectively undo, and restore teacher state', {
    skip: !executablePath && 'Install Playwright and Chromium', timeout: 60000,
}, async (t) => {
    const context = await browser.newContext({ viewport: { width: 900, height: 650 } });
    t.after(() => context.close());
    const student = await context.newPage();
    const teacher = await context.newPage();
    const errors = [];
    student.on('pageerror', (error) => errors.push(`student: ${error.message}`));
    teacher.on('pageerror', (error) => errors.push(`teacher: ${error.stack || error.message}`));
    await Promise.all([student.goto(`${origin}/student`), teacher.goto(`${origin}/teacher`)]);
    await Promise.all([student.waitForFunction(() => window.ready), teacher.waitForFunction(() => window.ready)]);
    await student.evaluate(() => {
        window.outbox = [];
        window.editor = monaco.editor.create(document.getElementById('original'), { value: 'print("hello")', language: 'python', automaticLayout: true });
        window.originalUndo = window.editor.getModel().undo;
        window.editor.onDidChangeModelContent(() => localStorage.setItem('student-code', window.editor.getValue()));
        window.controller = LiveEditors.attachSourceEditors({ pageId: 'student-page-1', send: (message) => outbox.push(message) });
    });
    await teacher.evaluate(() => {
        window.outbox = [];
        window.statuses = [];
        window.editor = monaco.editor.create(document.getElementById('original'), { value: 'teacher original draft', language: 'python', automaticLayout: true });
        localStorage.setItem('teacher-code', 'teacher original draft');
        window.originalEditorId = window.editor.getId();
        window.controller = LiveEditors.attachViewerEditors({ pageId: 'student-page-1', container: document.getElementById('viewer'), send: (message) => outbox.push(message), onStatus: (status) => statuses.push(status) });
        window.sharedEditor = () => monaco.editor.getEditors().find((editor) => editor.getId() !== originalEditorId);
    });
    async function flush() {
        await new Promise((resolve) => setTimeout(resolve, 110));
        for (let round = 0; round < 6; round++) {
            const [toTeacher, toStudent] = await Promise.all([student.evaluate(() => outbox.splice(0)), teacher.evaluate(() => outbox.splice(0))]);
            await Promise.all([
                teacher.evaluate((messages) => messages.forEach((message) => controller.receive(message)), toTeacher),
                student.evaluate((messages) => messages.forEach((message) => controller.receive(message)), toStudent),
            ]);
            if (!toTeacher.length && !toStudent.length) break;
        }
    }
    await flush();
    await teacher.waitForFunction(() => !!sharedEditor());
    assert.equal(await teacher.evaluate(() => sharedEditor().getValue()), 'print("hello")');
    // Both peers edit their local model before either side receives the other's transaction.
    await Promise.all([
        student.evaluate(() => editor.executeEdits('student-typing', [{ range: new monaco.Range(1, 1, 1, 1), text: 'a = 1\n' }])),
        teacher.evaluate(() => {
            const editor = sharedEditor(); const model = editor.getModel();
            const line = model.getLineCount(); const column = model.getLineMaxColumn(line);
            editor.executeEdits('teacher-comment', [{ range: new monaco.Range(line, column, line, column), text: '\n# 老师注释' }]);
        }),
    ]);
    assert.equal(await teacher.evaluate(() => statuses.at(-1).pending > 0), true);
    assert.equal(await teacher.evaluate(() => controller.getPendingDrafts().length), 1);
    await flush();
    const expected = 'a = 1\nprint("hello")\n# 老师注释';
    assert.equal(await student.evaluate(() => editor.getValue()), expected);
    assert.equal(await teacher.evaluate(() => sharedEditor().getValue()), expected);
    assert.equal(await student.evaluate(() => localStorage.getItem('student-code')), expected);
    assert.equal(await teacher.evaluate(() => statuses.at(-1).pending), 0);
    assert.equal(await teacher.evaluate(() => controller.getPendingDrafts().length), 0);
    assert.equal(await teacher.evaluate(() => editor.getValue()), 'teacher original draft');
    assert.equal(await teacher.evaluate(() => localStorage.getItem('teacher-code')), 'teacher original draft');
    assert.equal(await teacher.evaluate(() => sharedEditor().getModel().uri.scheme), 'live-share');
    // Exercise Monaco's actual command path, not the CRDT helper directly.
    await teacher.evaluate(() => sharedEditor().trigger('keyboard', 'undo', null));
    await flush();
    assert.equal(await student.evaluate(() => editor.getValue()), 'a = 1\nprint("hello")');
    await teacher.evaluate(() => sharedEditor().trigger('keyboard', 'redo', null));
    await flush();
    assert.equal(await student.evaluate(() => editor.getValue()), expected);
    await student.evaluate(() => editor.trigger('keyboard', 'undo', null));
    await flush();
    assert.equal(await teacher.evaluate(() => sharedEditor().getValue()), 'print("hello")\n# 老师注释');
    await teacher.evaluate(() => controller.setConnected(false));
    assert.equal(await teacher.evaluate(() => sharedEditor().getRawOptions().readOnly), true);
    await student.evaluate(() => controller.setConnected(false));
    await student.evaluate(() => editor.executeEdits('offline-student', [{ range: new monaco.Range(1, 1, 1, 1), text: '# 学员继续\n' }]));
    assert.equal(await student.evaluate(() => localStorage.getItem('student-code')), '# 学员继续\nprint("hello")\n# 老师注释');
    await Promise.all([student.evaluate(() => controller.setConnected(true)), teacher.evaluate(() => controller.setConnected(true))]);
    await flush();
    assert.equal(await teacher.evaluate(() => sharedEditor().getValue()), '# 学员继续\nprint("hello")\n# 老师注释');
    assert.equal(await teacher.evaluate(() => sharedEditor().getRawOptions().readOnly), false);
    await Promise.all([student.evaluate(() => controller.dispose()), teacher.evaluate(() => controller.dispose())]);
    assert.equal(await student.evaluate(() => editor.getModel().undo === originalUndo), true);
    await student.evaluate(() => editor.trigger('keyboard', 'undo', null));
    assert.equal(await student.evaluate(() => editor.getValue()), '# 学员继续\nprint("hello")\n# 老师注释');
    await student.evaluate(() => editor.executeEdits('normal-new-edit', [{ range: new monaco.Range(1, 1, 1, 1), text: '# new\n' }]));
    await student.evaluate(() => editor.trigger('keyboard', 'undo', null));
    assert.equal(await student.evaluate(() => editor.getValue()), '# 学员继续\nprint("hello")\n# 老师注释');
    assert.equal(await teacher.evaluate(() => monaco.editor.getEditors().length), 1);
    assert.equal(await teacher.evaluate(() => editor.getId() === originalEditorId), true);
    assert.equal(await teacher.evaluate(() => editor.getValue()), 'teacher original draft');
    assert.deepEqual(errors, []);
});
