const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { before, after, it } = require('node:test');
const { build, transformSync } = require('esbuild');
const stylus = require('stylus');

const root = path.resolve(__dirname, '..');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* The bundled local runtime is also supported. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((candidate) => candidate && fs.existsSync(candidate));
const pageId = 'annotation-page-123';
let browser;
let script;
let css;
let validateRelayData;

before(async () => {
    assert(executablePath, 'Chromium is required for classroom annotation interaction tests');
    const result = await build({ entryPoints: [path.join(root, 'packages/ui-default/components/live_share/mirror.ts')],
        bundle: true, format: 'iife', globalName: 'Mirror', write: false, loader: { '.css': 'empty' },
        plugins: [{ name: 'mirror-vendor', setup(builder) {
            builder.onResolve({ filter: /^\.\/vendor$/ }, () => ({ path: 'mirror-vendor', namespace: 'test' }));
            builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
                contents: `export { record, Replayer } from ${JSON.stringify(path.join(root, 'build/live-share/node_modules/rrweb/dist/rrweb.js'))};`,
                resolveDir: root,
            }));
        } }],
    });
    script = result.outputFiles[0].text;
    css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share.page.styl'), 'utf8'));
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/live_share.ts'), 'utf8'),
        { loader: 'ts', format: 'cjs' }).code, { module, exports: module.exports, require, URL, Buffer });
    validateRelayData = module.exports.validateRelayData;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

async function fixture({ scale = 1, latency = 20 } = {}) {
    const studentContext = await browser.newContext({ viewport: { width: 1100, height: 780 }, deviceScaleFactor: 1 });
    const teacherContext = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
    const student = await studentContext.newPage();
    const teacher = await teacherContext.newPage();
    const inputSession = await teacherContext.newCDPSession(teacher);
    student.setDefaultTimeout(7000); teacher.setDefaultTimeout(7000);
    const commands = []; const acks = []; const packets = []; const errors = [];
    let active = true;
    for (const [page, name] of [[student, 'student'], [teacher, 'teacher']]) page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    for (const context of [studentContext, teacherContext]) await context.route('https://annotation.test/**', (route) => {
        const teacherPage = new URL(route.request().url()).pathname === '/teacher';
        const body = teacherPage
            ? `<header>老师自己的页面</header><textarea id="teacher-draft">老师的草稿不变</textarea><div id="mirror" style="position:relative;width:1100px;height:780px;margin:30px 60px;transform:scale(${scale});transform-origin:top left"></div>`
            : `<header>OneByOne · 编程课堂</header><main id="lesson"><h1 id="title">编程的仪式感</h1><h2>题目描述</h2>
                <p id="statement">编程学习通常<span id="focus">从输出固定内容开始</span>。本题要求直接输出一行文字。</p>
                <p id="multiline">思考这一段文字的内容，先观察输出的格式，再写出自己的答案。<strong>不要漏掉大小写和空格。</strong>完成以后可以运行程序检查输出。</p>
                <div id="nested" style="height:130px;overflow:auto;border:1px solid #cbd5e1"><p id="nested-focus">这是独立滚动区里的重点内容</p><div style="height:500px"></div></div>
                <span id="link-line">接下来：<a id="study-link" href="/p/P2000">下一道题：输出练习</a></span>
                <form><input id="ordinary-input" value="表单输入不能成为远程标注内容"><button type="button" id="ordinary-button">按钮文字</button></form>
                <div data-private id="private">PRIVATE-ANNOTATION-SECRET</div><div data-live-share-editor="annotation-editor" class="monaco-editor">编辑器内容另行同步</div>
                <div style="height:1700px"></div><p>页面底部</p></main>`;
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><style>
            *{box-sizing:border-box}body{margin:0;font:20px/1.8 system-ui;background:#eef1f5;color:#17243a}header{height:64px;padding:10px 44px;background:#fff}
            #lesson{margin:32px 44px;padding:32px 42px;background:white;border-radius:20px}h1{font-size:30px;margin:0 0 16px}h2{font-size:22px;margin:20px 0}p{margin:20px 0}
            #multiline{max-width:650px}input,button{font:16px system-ui;padding:10px}#teacher-draft{position:absolute;right:8px;top:8px;width:150px;height:40px}
            ${css}</style></head><body>${body}<script>${script}</script></body></html>` });
    });
    await Promise.all([teacher.goto('https://annotation.test/teacher'), student.goto('https://annotation.test/p/P1000')]);
    await teacher.exposeFunction('sendCommand', async (data) => {
        if (!active) return;
        validateRelayData('teacher', 'command', data, pageId);
        commands.push(data);
        if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
        if (active) await student.evaluate((value) => window.source.receiveCommand(value), data);
    });
    await teacher.evaluate((pageId) => {
        window.viewerReady = false;
        window.viewer = Mirror.attachViewerMirror({ pageId, container: document.querySelector('#mirror'),
            sendCommand: (data) => window.sendCommand(data), onViewport: () => { window.viewerReady = true; } });
    }, pageId);
    await student.exposeFunction('sendPacket', async (data) => {
        if (!active) return;
        packets.push(data);
        if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
        if (active) await teacher.evaluate((value) => window.viewer.receive(value), data);
    });
    await student.exposeFunction('sendAck', (data) => { acks.push(data); });
    await student.evaluate((pageId) => {
        window.source = Mirror.attachSourceMirror({ pageId, send: (data) => window.sendPacket(data), sendAck: (data) => window.sendAck(data) });
    }, pageId);
    await teacher.waitForFunction(() => window.viewerReady, null, { timeout: 7000 }).catch(async (error) => {
        console.log('Annotation fixture errors:', errors, 'packets:', packets.length);
        await teacher.screenshot({ path: path.join(os.tmpdir(), 'live-share-annotation-fixture-error.png'), caret: 'initial' });
        throw error;
    });
    const close = async () => {
        active = false;
        await Promise.allSettled([student.evaluate(() => window.source?.dispose()), teacher.evaluate(() => window.viewer?.dispose())]);
        await studentContext.close(); await teacherContext.close();
    };
    return { student, teacher, commands, acks, packets, errors, close, inputSession, frame: () => teacher.frameLocator('#mirror iframe') };
}

async function selectionPoints(f, selector) {
    const inner = await f.frame().locator(selector).evaluate((node) => {
        const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const texts = []; let text;
        while ((text = walker.nextNode())) if (text.textContent.length) texts.push(text);
        const range = node.ownerDocument.createRange();
        range.setStart(texts[0], 0); range.setEnd(texts[0], 1);
        const first = range.getBoundingClientRect();
        const lastText = texts.at(-1);
        range.setStart(lastText, lastText.textContent.length - 1); range.setEnd(lastText, lastText.textContent.length);
        const last = range.getBoundingClientRect();
        return { start: { x: first.left + 0.1, y: first.top + first.height / 2 }, end: { x: last.right - 0.1, y: last.top + last.height / 2 } };
    });
    const frame = await f.teacher.locator('#mirror iframe').boundingBox();
    const size = await f.teacher.locator('#mirror iframe').evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight }));
    const point = (p) => ({ x: frame.x + p.x * frame.width / size.width, y: frame.y + p.y * frame.height / size.height });
    return { start: point(inner.start), end: point(inner.end) };
}

async function selectText(f, selector = '#focus', whileDragging) {
    const { start, end } = await selectionPoints(f, selector);
    await f.teacher.mouse.move(start.x, start.y); await f.teacher.mouse.down();
    // Playwright's drag detector waits on an iframe timer, but replay deliberately
    // forbids scripts. Native protocol input still exercises real text selection.
    for (let step = 1; step <= 12; step++) await f.inputSession.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', button: 'left', buttons: 1,
        x: start.x + (end.x - start.x) * step / 12, y: start.y + (end.y - start.y) * step / 12,
    });
    if (whileDragging) await whileDragging();
    await f.teacher.mouse.up();
}

// These selectors are intentionally shared with the production accessibility/UI contract.
const selectors = {
    root: '[data-share-annotation]', box: '[data-share-annotation-box]', arrow: '[data-share-annotation-arrow]',
    bubble: '[data-share-annotation-note]', input: '[data-share-annotation-input]', handle: '[data-share-annotation-drag]',
    connector: '[data-share-annotation-connector]', text: '[data-share-annotation-text]',
};

it('drag selection shows only focus boxes and arrows; Enter opens notes on both sides and writing streams immediately', { timeout: 30000 }, async () => {
    const f = await fixture();
    try {
        const sourceHeight = await f.student.evaluate(() => document.scrollingElement.scrollHeight);
        const replayHeight = await f.teacher.locator('#mirror iframe').evaluate((frame) => frame.contentDocument.scrollingElement.scrollHeight);
        assert.equal(replayHeight, sourceHeight, 'the blocked annotation container adds no extra blank page height to the replay');
        await selectText(f, '#focus', async () => {
            await f.student.locator(selectors.box).waitFor({ state: 'visible' });
            assert(await f.teacher.locator(selectors.box).isVisible(), 'teacher sees the selected focus during the drag');
            assert(await f.student.locator(selectors.arrow).isVisible(), 'student sees an arrow before any note is typed');
        });
        assert.equal(await f.teacher.locator(selectors.bubble).isVisible(), false, 'selection alone does not open the teacher note');
        assert.equal(await f.student.locator(selectors.bubble).isVisible(), false, 'selection alone does not open the student note');
        await f.teacher.keyboard.press('Enter');
        await f.teacher.locator(selectors.input).waitFor({ state: 'visible' });
        await f.student.locator(selectors.bubble).waitFor({ state: 'visible' });
        assert.equal(await f.teacher.locator(selectors.arrow).isVisible(), false, 'the standalone arrow gives way to a note connector');
        await f.student.locator(selectors.arrow).waitFor({ state: 'hidden' });
        assert(await f.teacher.locator(selectors.connector).isVisible());
        assert(await f.student.locator(selectors.connector).isVisible());
        const quote = f.commands.filter((command) => command.action === 'annotate' && command.annotation).at(-1).annotation.quote;
        assert.equal(quote, '从输出固定内容开始');
        await f.teacher.locator(selectors.input).pressSequentially('先');
        await f.student.locator(selectors.bubble).getByText('先', { exact: true }).waitFor();
        await f.teacher.locator(selectors.input).evaluate((input) => {
            input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
            input.value = '注意大小写';
            input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '注意大小写', inputType: 'insertCompositionText', isComposing: true }));
        });
        await f.student.locator(selectors.bubble).getByText('注意大小写', { exact: true }).waitFor();
        await f.teacher.locator(selectors.input).evaluate((input) => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '注意大小写' })));
        const literal = '先看输出：<img src=x onerror="window.annotationXSS=1">';
        await f.teacher.locator(selectors.input).fill(literal);
        await f.student.locator(selectors.bubble).getByText(literal, { exact: true }).waitFor();
        assert.equal(await f.student.locator(`${selectors.bubble} img`).count(), 0, 'note text is never interpreted as HTML');
        assert.equal(await f.student.evaluate(() => window.annotationXSS), undefined);
        assert.equal(await f.teacher.locator(selectors.input).evaluate((node) => document.activeElement === node), true);
        assert.equal(await f.teacher.locator('#teacher-draft').inputValue(), '老师的草稿不变');
        assert(!JSON.stringify(f.packets).includes('onerror'), 'the source annotation layer is excluded from rrweb to avoid recursive copies');
        assert(!JSON.stringify(f.packets).includes('PRIVATE-ANNOTATION-SECRET'));
        await f.teacher.locator(selectors.input).fill('');
        await f.student.locator(selectors.bubble).getByText('老师正在输入…', { exact: true }).waitFor();
        assert(await f.student.locator(selectors.bubble).isVisible(), 'an opened note stays visible while its text is being replaced');
        assert(await f.student.locator(selectors.box).isVisible(), 'clearing note text retains the focus box');
        await f.teacher.getByRole('button', { name: '清除标注', exact: true }).click();
        await f.student.locator(selectors.box).waitFor({ state: 'hidden' });
        assert.equal(await f.teacher.locator(selectors.box).isVisible(), false);
        await selectText(f, '#ordinary-button');
        assert.equal(await f.teacher.locator(selectors.box).isVisible(), false, 'selecting control labels does not create a lesson annotation');
        assert.equal(await f.student.locator(selectors.box).isVisible(), false);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('a fast drag over a study link selects its text without navigating the student', { timeout: 20000 }, async () => {
    const f = await fixture({ latency: 0 });
    try {
        const originalUrl = f.student.url();
        // Start on adjacent prose so Chrome selects text instead of dragging the link itself.
        const { start, end } = await selectionPoints(f, '#link-line');
        await f.teacher.mouse.move(start.x, start.y);
        await f.inputSession.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: start.x, y: start.y });
        await f.inputSession.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: end.x, y: end.y });
        await f.inputSession.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: end.x, y: end.y });
        await f.student.locator(selectors.box).waitFor({ state: 'visible' });
        assert.equal(f.student.url(), originalUrl, 'releasing a fast text selection must not become a remote link click');
        await f.teacher.keyboard.press('Enter');
        await f.teacher.locator(selectors.input).fill('链接文字也可以圈出重点。');
        await f.student.locator(selectors.bubble).getByText('链接文字也可以圈出重点。', { exact: true }).waitFor();
        assert.equal(f.commands.filter((command) => command.action === 'click').length, 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('scaled teacher note dragging remains aligned with the student and anchors follow document/nested scrolling and reflow', { timeout: 35000 }, async () => {
    const f = await fixture({ scale: 0.5 });
    try {
        await selectText(f);
        await f.teacher.keyboard.press('Enter');
        await f.teacher.locator(selectors.input).fill('看这里，先写出正确的输出格式。');
        await f.student.locator(selectors.bubble).waitFor({ state: 'visible' });
        const teacherBubble = await f.teacher.locator(selectors.bubble).boundingBox();
        const studentBubble = await f.student.locator(selectors.bubble).boundingBox();
        const handle = await f.teacher.locator(selectors.handle).boundingBox();
        await f.teacher.mouse.move(handle.x + 20, handle.y + handle.height / 2); await f.teacher.mouse.down();
        await f.teacher.mouse.move(handle.x + 60, handle.y + handle.height / 2 + 30, { steps: 10 }); await f.teacher.mouse.up();
        await f.student.waitForFunction(({ selector, x }) => document.querySelector(selector).getBoundingClientRect().x > x + 60,
            { selector: selectors.bubble, x: studentBubble.x });
        const movedTeacher = await f.teacher.locator(selectors.bubble).boundingBox();
        const movedStudent = await f.student.locator(selectors.bubble).boundingBox();
        assert(Math.abs((movedTeacher.x - teacherBubble.x) * 2 - (movedStudent.x - studentBubble.x)) < 3,
            'teacher pointer coordinates map through the 0.5 scale without using DPR');
        assert(Math.abs((movedTeacher.y - teacherBubble.y) * 2 - (movedStudent.y - studentBubble.y)) < 3);
        const before = await f.student.locator(selectors.box).boundingBox();
        await f.student.evaluate(() => window.scrollTo(0, 80));
        await f.student.waitForFunction(({ selector, y }) => Math.abs(document.querySelector(selector).getBoundingClientRect().y - (y - 80)) < 3,
            { selector: selectors.box, y: before.y });
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentWindow.scrollY === 80);
        const sourceFocus = await f.student.locator('#focus').boundingBox();
        const sourceBox = await f.student.locator(selectors.box).boundingBox();
        assert(Math.abs(sourceFocus.y - sourceBox.y) < 10 && Math.abs(sourceFocus.x - sourceBox.x) < 10);
        await f.student.evaluate(() => { document.querySelector('#lesson').style.paddingLeft = '100px'; });
        await f.student.waitForFunction(({ selector, x }) => document.querySelector(selector).getBoundingClientRect().x > x + 50,
            { selector: selectors.box, x: sourceBox.x });
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#lesson').style.paddingLeft === '100px');
        await f.teacher.getByRole('button', { name: '清除标注', exact: true }).click();
        await selectText(f, '#nested-focus');
        await f.teacher.keyboard.press('Enter');
        await f.teacher.locator(selectors.input).fill('独立区域也要跟随。');
        const nestedBefore = await f.student.locator(selectors.box).boundingBox();
        await f.student.evaluate(() => { document.querySelector('#nested').scrollTop = 10; });
        await f.student.waitForFunction(({ selector, y }) => Math.abs(document.querySelector(selector).getBoundingClientRect().y - (y - 10)) < 3,
            { selector: selectors.box, y: nestedBefore.y });
        if (process.env.LIVE_SHARE_SCREENSHOTS === '1') {
            await f.teacher.screenshot({ path: path.join(os.tmpdir(), 'live-share-annotation-teacher.png'), caret: 'initial' });
            await f.student.screenshot({ path: path.join(os.tmpdir(), 'live-share-annotation-student.png'), caret: 'initial' });
        }
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('multiple annotations keep their own text and position, one can close independently, and long notes remain readable', { timeout: 35000 }, async () => {
    const f = await fixture();
    try {
        await selectText(f); await f.teacher.keyboard.press('Enter');
        const first = f.teacher.locator(selectors.root).last();
        await first.locator(selectors.input).fill('第一处：注意输出内容。');
        const firstId = await first.getAttribute('data-share-annotation-id');
        const firstSelector = `[data-share-annotation-id="${firstId}"]`;
        await f.student.locator(firstSelector).getByText('第一处：注意输出内容。', { exact: true }).waitFor();
        await selectText(f, '#title'); await f.teacher.keyboard.press('Enter');
        const second = f.teacher.locator(selectors.root).last();
        const secondId = await second.getAttribute('data-share-annotation-id');
        const secondSelector = `[data-share-annotation-id="${secondId}"]`;
        assert.notEqual(firstId, secondId);
        await second.locator(selectors.input).fill('第二处：先阅读题目。');
        await f.student.locator(secondSelector).getByText('第二处：先阅读题目。', { exact: true }).waitFor();
        if (process.env.LIVE_SHARE_SCREENSHOTS === '1') {
            await f.teacher.screenshot({ path: path.join(os.tmpdir(), 'live-share-annotation-multiple-teacher.png'), caret: 'initial' });
            await f.student.screenshot({ path: path.join(os.tmpdir(), 'live-share-annotation-multiple-student.png'), caret: 'initial' });
        }
        assert.equal(await f.student.locator(selectors.root).count(), 2);
        assert.equal(await f.teacher.locator(firstSelector).locator(selectors.input).inputValue(), '第一处：注意输出内容。');
        const firstPosition = await f.student.locator(firstSelector).locator(selectors.bubble).boundingBox();
        const secondHandle = await second.locator(selectors.handle).boundingBox();
        await f.teacher.mouse.move(secondHandle.x + 20, secondHandle.y + secondHandle.height / 2);
        await f.teacher.mouse.down();
        await f.inputSession.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
            x: secondHandle.x + 250, y: secondHandle.y + secondHandle.height / 2 });
        await f.teacher.mouse.up();
        await f.student.waitForFunction(({ selector, x }) => document.querySelector(selector).getBoundingClientRect().x > x + 150,
            { selector: `${secondSelector} ${selectors.bubble}`, x: secondHandle.x - 60 });
        const unchangedFirst = await f.student.locator(firstSelector).locator(selectors.bubble).boundingBox();
        assert(Math.abs(unchangedFirst.x - firstPosition.x) < 2 && Math.abs(unchangedFirst.y - firstPosition.y) < 2);
        await second.getByRole('button', { name: '清除标注', exact: true }).click();
        await f.student.locator(secondSelector).waitFor({ state: 'detached' });
        assert(await f.student.locator(firstSelector).locator(selectors.box).isVisible());
        const longText = Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 行：一步一步检查答案。`).join('\n');
        await f.teacher.locator(firstSelector).locator(selectors.input).fill(longText);
        await f.student.locator(firstSelector).locator(selectors.text).getByText(longText, { exact: true }).waitFor();
        const scroll = await f.student.locator(firstSelector).locator(selectors.text).evaluate((node) => {
            const before = window.scrollY;
            node.scrollTop = node.scrollHeight;
            return { before, after: window.scrollY, top: node.scrollTop, max: node.scrollHeight - node.clientHeight };
        });
        assert(scroll.top > 0 && Math.abs(scroll.top - scroll.max) <= 1, 'the final line can be reached inside a long note');
        assert.equal(scroll.after, scroll.before, 'reading a long note does not scroll the lesson');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('stale or mismatched anchors are rejected, disappearing text hides the annotation, and disconnect/dispose remove it', { timeout: 30000 }, async () => {
    const f = await fixture();
    try {
        await selectText(f);
        await f.teacher.keyboard.press('Enter');
        await f.teacher.locator(selectors.input).fill('这条提示只能发给当前页面。');
        await f.student.locator(selectors.bubble).getByText('这条提示只能发给当前页面。', { exact: true }).waitFor();
        const valid = f.commands.filter((command) => command.action === 'annotate' && command.annotation?.text).at(-1);
        assert(valid);
        const stale = await f.student.evaluate((data) => window.source.receiveCommand({ ...data, id: 'stale-annotation-command', pageId: 'old-page-annotation' }), valid);
        assert.equal(stale.ok, false);
        const mismatched = await f.student.evaluate((data) => window.source.receiveCommand({ ...data, id: 'mismatched-annotation-command',
            annotation: { ...data.annotation, quote: '这不是被选中的原文' } }), valid);
        assert.equal(mismatched.ok, false, 'recycled nodes or changed text cannot point an old highlight at a new sentence');
        await f.student.evaluate(() => document.querySelector('#focus').remove());
        await f.student.locator(selectors.box).waitFor({ state: 'hidden' });
        await f.teacher.locator(selectors.box).waitFor({ state: 'hidden' });
        await selectText(f, '#multiline');
        await f.teacher.keyboard.press('Enter');
        await f.teacher.locator(`${selectors.root}:visible ${selectors.input}`).fill('第二段提示');
        await f.student.locator(`${selectors.root}:visible ${selectors.box}`).waitFor({ state: 'visible' });
        await Promise.all([f.teacher.evaluate(() => window.viewer.setConnected(false)), f.student.evaluate(() => window.source.setConnected(false))]);
        await f.student.waitForFunction(() => ![...document.querySelectorAll('[data-share-annotation]')].some((node) => !node.hidden));
        await f.teacher.waitForFunction(() => ![...document.querySelectorAll('[data-share-annotation]')].some((node) => !node.hidden));
        const disconnected = await f.student.evaluate((data) => window.source.receiveCommand({ ...data, id: 'disconnected-annotation-command' }), valid);
        assert.equal(disconnected.ok, false);
        await Promise.all([f.teacher.evaluate(() => window.viewer.dispose()), f.student.evaluate(() => window.source.dispose())]);
        assert.equal(await f.student.locator(selectors.root).count(), 0);
        assert.equal(await f.teacher.locator(selectors.root).count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});
