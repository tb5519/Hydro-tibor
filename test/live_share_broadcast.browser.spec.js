const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { build } = require('esbuild');
const stylus = require('stylus');
const root = path.resolve(__dirname, '..');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch {}
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((p) => p && fs.existsSync(p));
let browser; let server; let origin;
before(async () => {
    assert(executablePath, 'Chromium is required');
    const result = await build({ entryPoints: [path.join(root, 'packages/ui-default/components/live_share/broadcast_adapters.ts')],
        bundle: true, format: 'iife', globalName: 'Broadcast', write: false, loader: { '.css': 'empty' },
        plugins: [{ name: 'browser-dependencies', setup(builder) {
            builder.onResolve({ filter: /^monaco-editor\// }, () => ({ path: 'monaco', namespace: 'test' }));
            builder.onResolve({ filter: /^vj\// }, (args) => ({ path: args.path, namespace: 'test' }));
            builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path: module }) => ({ contents: module === 'monaco'
                ? 'module.exports = window.monaco || {};'
                : module.includes('monaco') ? 'export const load = async () => ({ monaco: window.monaco });'
                    : 'export const request = { get: async () => ({}), post: async () => ({}) };' }));
        } }],
    });
    const javascript = result.outputFiles[0].text;
    const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share.page.styl'), 'utf8'));
    const monacoFolder = path.join(root, 'node_modules/monaco-editor/min/vs');
    server = http.createServer((req, res) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/adapter.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(javascript); return; }
        if (pathname.startsWith('/vs/')) {
            const file = path.resolve(monacoFolder, pathname.slice(4));
            if (!file.startsWith(`${monacoFolder}${path.sep}`) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
            res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.ttf') ? 'font/ttf' : 'application/javascript');
            res.end(fs.readFileSync(file)); return;
        }
        const source = pathname === '/teacher';
        res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><html><head><meta charset="utf-8"><style>
            *{box-sizing:border-box}body{margin:0;font:20px/1.7 Arial;background:#eef1f5}main{margin:20px;padding:28px;background:white}
            #editor{width:700px;height:260px}p{margin:24px 0}#stage{position:absolute;left:0;top:0;width:1100px;height:850px;transform-origin:0 0}
            ${css}</style></head><body>${source ? `<main><h1>老师课堂</h1><p id="focus">编程学习从输出固定内容开始。接下来一起写代码。</p>
            <button id="button" onclick="window.clicks=(window.clicks||0)+1">老师正常操作</button><a id="link" href="/next">下一题</a>
            <select name="lang" id="language"><option value="c">C</option><option value="py.py3">Python 3</option><option value="cpp">C++</option></select>
            <div data-private>PRIVATE-TEACHER-SECRET</div><input name="token" value="PRIVATE-TEACHER-TOKEN"><div class="teacher-assistant" data-teacher-assistant>PRIVATE-ASSISTANT</div>
            ${['voice-call-toast', 'voice-call-card', 'voice-call-floating'].map(name => `<div class="${name}" data-live-share-private style="position:fixed;bottom:10px;width:160px;height:40px;background:red">PRIVATE-VOICE</div>`).join('')}
            <div id="editor"></div><div style="height:1400px"></div></main>` : '<textarea id="draft">原本的学员草稿</textarea><div id="stage"></div>'}
            <script src="/vs/loader.js"></script><script>require.config({paths:{vs:'/vs'}});require(['vs/editor/editor.main'],function(){var s=document.createElement('script');s.src='/adapter.js';s.onload=function(){window.ready=true};document.head.append(s)});</script></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

it('teacher broadcasts the real page to two readonly viewers with live code, notes and question pens', { timeout: 60000 }, async (t) => {
    const context = await browser.newContext({ viewport: { width: 1100, height: 850 } }); t.after(() => context.close());
    const teacher = await context.newPage(); const first = await context.newPage(); const second = await context.newPage();
    await second.setViewportSize({ width: 800, height: 650 });
    const pages = [teacher, first, second]; const errors = []; const sourcePackets = []; const questions = [];
    for (const page of pages) page.on('pageerror', (error) => errors.push(error.message));
    await Promise.all(pages.map((page, i) => page.goto(`${origin}/${i ? `student${i}` : 'teacher'}`)));
    await Promise.all(pages.map((page) => page.waitForFunction(() => window.ready)));
    let active = true; t.after(() => { active = false; }); let delivery = Promise.resolve();
    for (const [i, page] of [first, second].entries()) {
        await page.exposeFunction('sendQuestion', (packet) => {
            questions.push(packet); const data = { ...packet, strokeId: `u${i + 1}-${packet.strokeId}` };
            delivery = delivery.then(async () => { if (!active) return;
                await teacher.evaluate((p) => window.adapter.receive('drawing', p, 'student'), data);
                await (i ? first : second).evaluate((p) => window.adapter.receive('drawing', p, 'student'), data);
            });
        });
        await page.evaluate(() => {
            window.adapter = Broadcast.attachBroadcastViewer({ pageId: 'broadcast-page-123', container: document.querySelector('#stage'),
                sendDrawing: (packet) => window.sendQuestion(packet), onViewport: ({ width, height }) => {
                    const stage = document.querySelector('#stage'); stage.style.width = `${width}px`; stage.style.height = `${height}px`;
                    stage.style.transform = `scale(${Math.min(1, innerWidth / width)})`; window.synced = true;
                } }); window.adapter.setConnected(true);
        });
    }
    await teacher.exposeFunction('sendPacket', (kind, data) => {
        sourcePackets.push({ kind, data }); delivery = delivery.then(async () => { if (!active) return;
            await Promise.all([first, second].map((page) => page.evaluate(({ kind, data }) => window.adapter.receive(kind, data), { kind, data })));
        });
    });
    await teacher.evaluate(() => {
        document.querySelector('#language').value = 'py.py3';
        window.editor = monaco.editor.create(document.querySelector('#editor'), { value: 'print("hello")\nprint("world")', language: 'python', fontSize: 18 });
        window.adapter = Broadcast.attachBroadcastSource({ pageId: 'broadcast-page-123', annotationScope: { sessionId: 'broadcast-lesson-123', url: location.href },
            send: (kind, data) => { window.sendPacket(kind, data); } });
        window.adapter.setConnected(true);
    });
    await Promise.all([first, second].map((p) => p.waitForFunction(() => window.synced && monaco.editor.getEditors().some(e => e.getValue().includes('hello')))));
    const wire = JSON.stringify(sourcePackets);
    assert(!wire.includes('PRIVATE-TEACHER-SECRET')); assert(!wire.includes('PRIVATE-TEACHER-TOKEN')); assert(!wire.includes('PRIVATE-ASSISTANT'));
    for (const page of [first, second]) {
        const replay = page.frameLocator('iframe').first();
        assert.equal(await replay.locator('#language').inputValue(), 'py.py3', 'initial selected language matches the source property');
        for (const selector of ['.teacher-assistant', '.voice-call-toast', '.voice-call-card', '.voice-call-floating']) {
            assert.equal(await replay.locator(selector).evaluate(n => getComputedStyle(n).display), 'none', 'blocked UI has no visible empty shell');
        }
        assert.equal(await page.locator('.ide-runtime__shared-run').count(), 0, 'readonly broadcast adds no remote run button');
        assert.equal(await page.locator('[data-ide-runtime]:visible').count(), 0, 'no runtime UI appears without a source runtime');
    }
    await teacher.selectOption('#language', 'cpp');
    await Promise.all([first, second].map(async (page) => {
        // rrweb can replace its sandbox document while the initial snapshot settles.
        // Re-resolve the frame each time instead of retaining a promise in that old document.
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await page.frameLocator('iframe').first().locator('#language').inputValue().catch(() => '') === 'cpp') return;
            await page.waitForTimeout(30);
        }
        assert.fail('language changes must keep matching the source');
    }));
    await teacher.click('#button'); assert.equal(await teacher.evaluate(() => window.clicks), 1);
    await teacher.evaluate(() => window.editor.setValue('print("直播修改")'));
    await Promise.all([first, second].map((p) => p.waitForFunction(() => monaco.editor.getEditors()[0].getValue() === 'print("直播修改")')));
    for (const page of [first, second]) assert.equal(await page.evaluate(() => monaco.editor.getEditors()[0].getOption(monaco.editor.EditorOption.readOnly)), true);
    await teacher.evaluate(() => {
        const p = document.querySelector('#focus'); p.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
        const range = document.createRange(); range.setStart(p.firstChild, 4); range.setEnd(p.firstChild, 16);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        p.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }));
    });
    await first.waitForSelector('[data-share-annotation-id]');
    await teacher.keyboard.press('Shift+Enter');
    await teacher.keyboard.type('课堂重点');
    await Promise.all([first, second].map((p) => p.waitForFunction(() => [...document.querySelectorAll('[data-share-annotation-text]')].some(n => n.textContent === '课堂重点'))));
    assert.equal(await first.locator('[data-share-annotation-input]').count(), 0);
    // A student's click is a pen tap; the mirrored button cannot act on either page.
    await first.frameLocator('iframe').first().locator('#button').click({ force: true });
    assert.equal(await teacher.evaluate(() => window.clicks), 1);
    await first.mouse.move(420, 110); await first.mouse.down(); await first.mouse.move(580, 140, { steps: 8 }); await first.mouse.up();
    await Promise.all([teacher, second].map((p) => p.waitForFunction(() => [...document.querySelectorAll('[data-share-drawing-stroke]')].some(n => n.getBoundingClientRect().width > 50 && getComputedStyle(n).visibility === 'visible'))));
    for (const page of pages) {
        const colors = await page.locator('[data-share-drawing-role="student"] path:nth-child(2)').evaluateAll(nodes => nodes.map(n => n.getAttribute('stroke')));
        assert(colors.length && colors.every(color => color === '#1599b3'), 'learner question ink stays teal on its own view, the teacher and other learners');
    }
    assert(questions.length > 2); assert(questions.every((p) => ['start', 'move', 'end'].includes(p.phase)));
    await first.keyboard.press('Shift+Enter'); assert(!questions.some((p) => p.phase === 'note'));
    assert.equal(await first.locator('#draft').inputValue(), '原本的学员草稿');
    assert.equal(sourcePackets.filter(p => p.kind === 'drawing').length, 0, 'student ink must never retransmit from the source');
    // Teacher Shift+Enter annotates code without altering the program or exposing an editor to viewers.
    await teacher.evaluate(() => { window.editor.focus(); window.editor.setSelection(new monaco.Selection(1, 1, 1, 6)); });
    await teacher.keyboard.press('Shift+Enter');
    await teacher.waitForFunction(() => document.activeElement?.hasAttribute('data-share-annotation-input'));
    await teacher.keyboard.type('代码重点');
    await Promise.all([first, second].map((p) => p.waitForFunction(() => [...document.querySelectorAll('[data-share-annotation-text]')].some(n => n.textContent === '代码重点'))));
    assert.equal(await teacher.evaluate(() => window.editor.getValue()), 'print("直播修改")');
    // Right-button pen notes are also teacher-authored and streamed live.
    const editorBox = await teacher.locator('#editor').boundingBox();
    await teacher.mouse.move(editorBox.x + 90, editorBox.y + 70); await teacher.mouse.down({ button: 'right' });
    await teacher.mouse.move(editorBox.x + 250, editorBox.y + 100, { steps: 6 }); await teacher.mouse.up({ button: 'right' });
    await teacher.keyboard.press('Shift+Enter'); await teacher.keyboard.type('画笔重点');
    await Promise.all([first, second].map((p) => p.waitForFunction(() => [...document.querySelectorAll('[data-share-drawing-note-input]')].some(n => n.value === '画笔重点' && n.readOnly && getComputedStyle(n).visibility === 'visible'))));
    for (const page of pages) {
        const colors = await page.locator('[data-share-drawing-role="teacher"] path:nth-child(2)').evaluateAll(nodes => nodes.map(n => n.getAttribute('stroke')));
        assert(colors.length && colors.every(color => color === '#9272e5'), 'teacher ink remains purple on all displays');
    }
    assert(sourcePackets.filter(p => p.kind === 'drawing').some(p => p.data.anchor?.kind === 'editor'));
    // A reconnect/late audience full snapshot restores both note types and current code.
    await second.evaluate(() => { window.adapter.dispose(); window.adapter = Broadcast.attachBroadcastViewer({ pageId: 'broadcast-page-123',
        container: document.querySelector('#stage'), sendDrawing: (p) => window.sendQuestion(p) }); window.adapter.setConnected(true); });
    await teacher.evaluate(() => window.adapter.snapshot()); await delivery;
    await second.waitForFunction(() => [...document.querySelectorAll('[data-share-drawing-note-input]')].some(n => n.value === '画笔重点')
        && [...document.querySelectorAll('[data-share-annotation-text]')].some(n => n.textContent === '代码重点')
        && [...document.querySelectorAll('[data-share-annotation-text]')].some(n => n.textContent === '课堂重点'));

    // A teacher can leave this question and return in the same lesson. Fresh DOM,
    // editor and page IDs must rebuild all three durable annotation kinds.
    active = false; await delivery;
    await teacher.evaluate(() => adapter.dispose());
    await teacher.reload(); await teacher.waitForFunction(() => window.ready);
    for (const page of [first, second]) await page.evaluate(() => {
        adapter.dispose(); window.adapter = Broadcast.attachBroadcastViewer({ pageId: 'broadcast-page-return',
            container: document.querySelector('#stage'), sendDrawing: (p) => window.sendQuestion(p) });
    });
    active = true;
    await teacher.evaluate(() => {
        window.editor = monaco.editor.create(document.querySelector('#editor'), { value: 'print("直播修改")', language: 'python', fontSize: 18 });
        window.adapter = Broadcast.attachBroadcastSource({ pageId: 'broadcast-page-return', annotationScope: { sessionId: 'broadcast-lesson-123', url: location.href },
            send: (kind, data) => window.sendPacket(kind, data) });
    });
    for (const page of [first, second]) await page.waitForFunction(() => [...document.querySelectorAll('[data-share-drawing-note-input]')].some(n => n.value === '画笔重点')
        && [...document.querySelectorAll('[data-share-annotation-text]')].some(n => n.textContent === '代码重点')
        && [...document.querySelectorAll('[data-share-annotation-text]')].some(n => n.textContent === '课堂重点'));
    assert.equal(await teacher.locator('[data-share-annotation-input]').count(), 2);

    assert.deepEqual(errors, []);
    await Promise.all(pages.map((p) => p.evaluate(() => window.adapter.dispose())));
});
