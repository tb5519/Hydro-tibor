const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
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
const protocolModule = { exports: {} };
vm.runInNewContext(esbuild.transformSync(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/live_share.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: protocolModule, exports: protocolModule.exports, require, URL, Buffer });
function validateMessages(messages, role, pageId) {
    for (const message of messages) assert.doesNotThrow(() => protocolModule.exports.validateRelayData(role, 'editor', message, pageId),
        `${role} generated invalid ${message.type}: ${JSON.stringify(message)}`);
}
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
            validateMessages(toTeacher, 'student', 'student-page-1');
            validateMessages(toStudent, 'teacher', 'student-page-1');
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

async function editorPair(t, settings = {}) {
    const context = await browser.newContext({ viewport: { width: 900, height: 650 } });
    t.after(() => context.close());
    const student = await context.newPage();
    const teacher = await context.newPage();
    const errors = [];
    student.on('pageerror', (error) => errors.push(`student: ${error.stack || error.message}`));
    teacher.on('pageerror', (error) => errors.push(`teacher: ${error.stack || error.message}`));
    t.after(() => assert.deepEqual(errors, []));
    await Promise.all([student.goto(`${origin}/student`), teacher.goto(`${origin}/teacher`)]);
    await Promise.all([student.waitForFunction(() => window.ready), teacher.waitForFunction(() => window.ready)]);
    await student.evaluate((options) => {
        window.outbox = [];
        const model = monaco.editor.createModel(options.value || 'base', 'python');
        if (options.crlf) model.setEOL(monaco.editor.EndOfLineSequence.CRLF);
        window.editor = monaco.editor.create(document.getElementById('original'), { model, ...options.editor });
        if (options.duplicate) {
            const node = document.createElement('div');
            Object.assign(node.style, { width: '400px', height: '100px' });
            document.body.appendChild(node);
            window.secondEditor = monaco.editor.create(node, { model });
        }
        window.controller = LiveEditors.attachSourceEditors({ pageId: 'page', send: (message) => outbox.push(message) });
    }, settings);
    await teacher.evaluate((options) => {
        window.outbox = [];
        if (options.teacherTheme) {
            monaco.editor.defineTheme('teacher-custom', { base: 'vs', inherit: true, rules: [], colors: { 'editor.background': '#fff3e6' } });
            monaco.editor.setTheme('teacher-custom');
        }
        window.makeController = () => LiveEditors.attachViewerEditors({ pageId: 'page', container: document.getElementById('viewer'),
            getNodeRect: () => window.replayRect, send: (message) => outbox.push(message) });
        window.controller = makeController();
        window.sharedEditor = () => monaco.editor.getEditors()[0];
    }, settings);
    const flush = async () => {
        for (let round = 0; round < 5; round++) {
            await new Promise((resolve) => setTimeout(resolve, 110));
            const messages = await Promise.all([student.evaluate(() => outbox.splice(0)), teacher.evaluate(() => outbox.splice(0))]);
            validateMessages(messages[0], 'student', 'page');
            validateMessages(messages[1], 'teacher', 'page');
            await Promise.all([teacher.evaluate((items) => items.forEach((message) => controller.receive(message)), messages[0]),
                student.evaluate((items) => items.forEach((message) => controller.receive(message)), messages[1])]);
        }
    };
    await flush(); await teacher.waitForFunction(() => !!sharedEditor());
    return { student, teacher, flush };
}

it('single-line Windows code remains identical after peers insert lines and edit later offsets concurrently', {
    skip: !executablePath && 'Install Playwright and Chromium', timeout: 30000,
}, async (t) => {
    const { student, teacher, flush } = await editorPair(t, { crlf: true });
    await Promise.all([
        student.evaluate(() => editor.executeEdits('student', [{ range: new monaco.Range(1, 5, 1, 5), text: '\nsecond' }])),
        teacher.evaluate(() => sharedEditor().executeEdits('teacher', [{ range: new monaco.Range(1, 1, 1, 1), text: '# teacher\n' }])),
    ]);
    await flush();
    await Promise.all([
        student.evaluate(() => editor.executeEdits('student', [{ range: new monaco.Range(3, 1, 3, 1), text: 'S-' }])),
        teacher.evaluate(() => sharedEditor().executeEdits('teacher', [{ range: new monaco.Range(2, 1, 2, 1), text: 'T-' }])),
    ]);
    await flush();
    assert.equal(await student.evaluate(() => editor.getValue()), '# teacher\nT-base\nS-second');
    assert.equal(await teacher.evaluate(() => sharedEditor().getValue()), '# teacher\nT-base\nS-second');
});

it('mirrors source editor layout preferences and restores the teacher theme after disconnect', {
    skip: !executablePath && 'Install Playwright and Chromium', timeout: 30000,
}, async (t) => {
    const { student, teacher, flush } = await editorPair(t, { teacherTheme: true, value: 'x = 1\n'.repeat(80), editor: {
        fontSize: 18, lineHeight: 29, glyphMargin: true, lineNumbers: 'relative', wordWrap: 'on',
        minimap: { enabled: true, side: 'left', size: 'fill' }, padding: { top: 12, bottom: 17 }, scrollBeyondLastLine: false,
    } });
    await student.evaluate(() => {
        editor.getModel().updateOptions({ tabSize: 7, insertSpaces: false });
        monaco.editor.defineTheme('source-custom', { base: 'vs-dark', inherit: true, rules: [{ token: 'comment', foreground: '11ffaa' }], colors: {
            'editor.background': '#182536', 'editor.foreground': '#ddf0ff',
        } });
        monaco.editor.setTheme('source-custom');
    });
    await flush();
    const describe = (name) => {
        const e = name === 'source' ? editor : sharedEditor();
        const value = (key) => e.getOption(monaco.editor.EditorOptions[key].id);
        return { fontSize: value('fontInfo').fontSize, lineHeight: value('fontInfo').lineHeight,
            glyphMargin: value('glyphMargin'), wordWrap: value('wordWrap'), lineNumbers: value('lineNumbers').renderType,
            minimap: value('minimap'), padding: value('padding'), tabSize: e.getModel().getOptions().tabSize,
            insertSpaces: e.getModel().getOptions().insertSpaces, background: e._themeService.getColorTheme().getColor('editor.background').toString() };
    };
    assert.deepEqual(await teacher.evaluate(describe, 'viewer'), await student.evaluate(describe, 'source'));
    // The student can leave the code page before the teacher disconnects.
    await student.evaluate(() => editor.dispose());
    await flush();
    assert.equal(await teacher.evaluate(() => monaco.editor.getEditors().length), 0);
    await teacher.evaluate(() => controller.dispose());
    assert.equal(await teacher.evaluate(() => monaco.editor.create(document.getElementById('original'), {})._themeService.getColorTheme().themeName), 'teacher-custom');
});

it('a model shown by two widgets is synchronized once rather than receiving duplicate bindings', {
    skip: !executablePath && 'Install Playwright and Chromium', timeout: 30000,
}, async (t) => {
    const { student, teacher, flush } = await editorPair(t, { duplicate: true });
    assert.equal(await teacher.evaluate(() => monaco.editor.getEditors().length), 1);
    await teacher.evaluate(() => sharedEditor().executeEdits('teacher', [{ range: new monaco.Range(1, 1, 1, 1), text: '# once\n' }]));
    await flush();
    assert.equal(await student.evaluate(() => editor.getValue()), '# once\nbase');
    assert.equal(await student.evaluate(() => secondEditor.getValue()), '# once\nbase');
    assert.equal(await teacher.evaluate(() => sharedEditor().getValue()), '# once\nbase');
});

it('teacher editor scrolling reaches the student without being snapped back by stale source layouts', {
    skip: !executablePath && 'Install Playwright and Chromium', timeout: 30000,
}, async (t) => {
    const { student, teacher, flush } = await editorPair(t, { value: 'line\n'.repeat(120) });
    const stale = await student.evaluate(() => outbox.splice(0));
    await teacher.evaluate(() => sharedEditor().setScrollTop(620, 1));
    await teacher.evaluate((messages) => messages.forEach((message) => controller.receive(message)), stale);
    assert.equal(await teacher.evaluate(() => sharedEditor().getScrollTop()), 620);
    await flush();
    assert.equal(await student.evaluate(() => editor.getScrollTop()), 620);
    assert.equal(await teacher.evaluate(() => sharedEditor().getScrollTop()), 620);
    await student.evaluate(() => editor.setScrollTop(180, 1));
    await flush();
    assert.equal(await teacher.evaluate(() => sharedEditor().getScrollTop()), 180);
});

it('Monaco Chinese composition commits before remote edits and both peers keep identical code', {
    skip: !executablePath && 'Install Playwright and Chromium', timeout: 30000,
}, async (t) => {
    const { student, teacher, flush } = await editorPair(t);
    const input = await student.context().newCDPSession(student);
    await student.evaluate(() => { editor.focus(); editor.setPosition({ lineNumber: 1, column: 1 }); });
    await input.send('Input.imeSetComposition', { text: 'zhong', selectionStart: 5, selectionEnd: 5 });
    await teacher.evaluate(() => sharedEditor().executeEdits('teacher', [{ range: new monaco.Range(1, 5, 1, 5), text: '\n# teacher' }]));
    await flush();
    await input.send('Input.insertText', { text: '中文' });
    await flush();
    assert.equal(await student.evaluate(() => editor.getValue()), '中文base\n# teacher');
    assert.equal(await teacher.evaluate(() => sharedEditor().getValue()), '中文base\n# teacher');
});

it('simultaneous native IME input on both computers merges complete characters without intermediate text', {
    skip: !executablePath && 'Install Playwright and Chromium', timeout: 30000,
}, async (t) => {
    const { student, teacher, flush } = await editorPair(t);
    const sourceInput = await student.context().newCDPSession(student);
    const viewerInput = await teacher.context().newCDPSession(teacher);
    await student.evaluate(() => { editor.focus(); editor.setPosition({ lineNumber: 1, column: 1 }); });
    await teacher.evaluate(() => { sharedEditor().focus(); sharedEditor().setPosition({ lineNumber: 1, column: 5 }); });
    await Promise.all([
        sourceInput.send('Input.imeSetComposition', { text: 'xuesheng', selectionStart: 8, selectionEnd: 8 }),
        viewerInput.send('Input.imeSetComposition', { text: 'laoshi', selectionStart: 6, selectionEnd: 6 }),
    ]);
    await flush();
    await Promise.all([sourceInput.send('Input.insertText', { text: '学生' }), viewerInput.send('Input.insertText', { text: '老师' })]);
    await flush();
    assert.equal(await student.evaluate(() => editor.getValue()), '学生base老师');
    assert.equal(await teacher.evaluate(() => sharedEditor().getValue()), '学生base老师');
});

it('editor scroll remains usable after viewer recreation and a dropped teacher scroll', {
    skip: !executablePath && 'Install Playwright and Chromium', timeout: 30000,
}, async (t) => {
    const { student, teacher, flush } = await editorPair(t, { value: 'line\n'.repeat(120) });
    await teacher.evaluate(() => sharedEditor().setScrollTop(600, 1));
    await flush();
    await teacher.evaluate(() => { controller.dispose(); controller = makeController(); });
    await flush();
    await teacher.waitForFunction(() => !!sharedEditor());
    await teacher.evaluate(() => sharedEditor().setScrollTop(900, 1));
    await flush();
    assert.equal(await student.evaluate(() => editor.getScrollTop()), 900);
    await teacher.evaluate(() => sharedEditor().setScrollTop(1200, 1));
    await new Promise((resolve) => setTimeout(resolve, 110));
    await teacher.evaluate(() => { window.outbox = outbox.filter((message) => message.type !== 'edit:scroll'); });
    await student.evaluate(() => editor.setScrollTop(200, 1));
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flush();
    assert.equal(await teacher.evaluate(() => sharedEditor().getScrollTop()), 200);
});

it('editor geometry follows the replay placeholder each frame instead of waiting for source layout polling', {
    skip: !executablePath && 'Install Playwright and Chromium', timeout: 30000,
}, async (t) => {
    const { teacher, flush } = await editorPair(t);
    await teacher.evaluate(() => { window.replayRect = { x: 50, y: 180, width: 620, height: 340 }; });
    await teacher.waitForFunction(() => document.querySelector('[data-live-share-editor]').style.top === '180px', undefined, { timeout: 1000 });
    await flush();
    assert.equal(await teacher.evaluate(() => document.querySelector('[data-live-share-editor]').style.top), '180px');
    await teacher.evaluate(() => { window.replayRect.y = 80; });
    await teacher.waitForFunction(() => document.querySelector('[data-live-share-editor]').style.top === '80px', undefined, { timeout: 1000 });
    assert.equal(await teacher.evaluate(() => sharedEditor().getLayoutInfo().width), 620);
});

it('a final student scroll arriving inside the teacher gesture cooldown is eventually displayed', {
    skip: !executablePath && 'Install Playwright and Chromium', timeout: 30000,
}, async (t) => {
    const { student, teacher } = await editorPair(t, { value: 'line\n'.repeat(120) });
    await teacher.evaluate(() => sharedEditor().setScrollTop(600, 1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const toStudent = await teacher.evaluate(() => outbox.splice(0));
    validateMessages(toStudent, 'teacher', 'page');
    await student.evaluate((messages) => {
        messages.forEach((message) => controller.receive(message));
        editor.setScrollTop(200, 1);
    }, toStudent);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const toTeacher = await student.evaluate(() => outbox.splice(0));
    validateMessages(toTeacher, 'student', 'page');
    await teacher.evaluate((messages) => messages.forEach((message) => controller.receive(message)), toTeacher);
    await teacher.waitForFunction(() => sharedEditor().getScrollTop() === 200, undefined, { timeout: 1500 });
});
