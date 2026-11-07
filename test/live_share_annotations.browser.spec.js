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
    await dragSelection(f, start, end, whileDragging);
}

async function dragSelection(f, start, end, whileDragging) {
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
    selection: '[data-share-annotation-selection]', resize: '[data-share-annotation-resize]',
    outline: '[data-share-annotation-outline]',
};

it('temporary focus forms one closed text-shaped contour with a solid rounded arrow and clears on outside click', { timeout: 25000 }, async () => {
    const f = await fixture();
    try {
        await selectText(f, '#multiline');
        await f.student.locator(`${selectors.box}:visible`).first().waitFor();
        assert.equal(await f.teacher.locator(`${selectors.root} button:visible`).count(), 0,
            'temporary emphasis has no distracting delete control');
        const geometry = await f.student.locator('#multiline').evaluate((paragraph) => {
            const range = document.createRange(); range.selectNodeContents(paragraph);
            const bounds = range.getBoundingClientRect();
            const outline = document.querySelector('[data-share-annotation-box]');
            const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
            const pieces = []; let text;
            while ((text = walker.nextNode())) {
                range.selectNodeContents(text);
                for (const rect of range.getClientRects()) pieces.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
            }
            const lines = [];
            for (const piece of pieces) {
                const line = lines.find((line) => Math.abs(line.y - piece.y) < 2);
                if (line) { line.left = Math.min(line.left, piece.x); line.right = Math.max(line.right, piece.x + piece.width); }
                else lines.push({ y: piece.y, height: piece.height, left: piece.x, right: piece.x + piece.width });
            }
            const inverse = outline.getScreenCTM().inverse();
            const contains = (x, y) => {
                const point = outline.ownerSVGElement.createSVGPoint(); point.x = x; point.y = y;
                return outline.isPointInFill(point.matrixTransform(inverse));
            };
            return { count: document.querySelectorAll('[data-share-annotation-box]').length, d: outline.getAttribute('d'),
                lines: lines.map((line) => ({ width: line.right - line.left,
                    inside: contains((line.left + line.right) / 2, line.y + line.height / 2),
                    includesEmptyTail: contains(line.right + 18, line.y + line.height / 2) })),
                width: bounds.width, height: bounds.height };
        });
        assert.equal(geometry.count, 1, 'all selected lines share one outline, not independent boxes');
        assert.equal((geometry.d.match(/m/gi) || []).length, 1, 'one connected contour starts once');
        assert.equal((geometry.d.match(/z/gi) || []).length, 1, 'the contour is explicitly closed');
        assert(geometry.lines.length >= 2 && Math.abs(geometry.lines[0].width - geometry.lines.at(-1).width) > 40,
            'the fixture includes wrapped first and last lines of distinct lengths');
        assert(geometry.lines.every((line) => line.inside), 'the closed contour encloses all selected line centers');
        assert(geometry.lines.every((line) => !line.includesEmptyTail), 'the contour steps around each line instead of including empty line tails');
        const arrow = await f.student.locator(selectors.arrow).evaluate((svg) => {
            const paths = [...svg.querySelectorAll('path')].filter((path) => path.getAttribute('d') && getComputedStyle(path).display !== 'none');
            const path = paths[0]; const box = path.getBBox();
            return { count: paths.length, fill: getComputedStyle(path).fill, d: path.getAttribute('d'), width: box.width, height: box.height };
        });
        assert.equal(arrow.count, 1, 'the arrow is one solid silhouette');
        assert(arrow.fill !== 'none' && !arrow.fill.endsWith(', 0)'), 'the arrow body has a visible solid fill');
        assert(/[QC]/i.test(arrow.d) && /Z/i.test(arrow.d), 'curved corners form a closed rounded arrow');
        assert(arrow.width >= 40 && arrow.height >= 40, 'the chunky arrow remains clearly visible');
        assert.equal(await f.student.locator(`${selectors.box}:visible`).count(), await f.teacher.locator(`${selectors.box}:visible`).count());
        if (process.env.LIVE_SHARE_SCREENSHOTS === '1') {
            await f.student.screenshot({ path: path.join(os.tmpdir(), 'live-share-annotation-multiline.png'), caret: 'initial' });
        }
        await f.frame().locator('h2').click();
        await f.student.locator(selectors.root).waitFor({ state: 'detached' });
        assert.equal(await f.teacher.locator(selectors.root).count(), 0, 'clicking other page content removes temporary emphasis');
        await selectText(f);
        await f.student.locator(selectors.box).waitFor();
        await f.teacher.locator('#teacher-draft').click();
        await f.student.locator(selectors.root).waitFor({ state: 'detached' });
        assert.equal(await f.teacher.locator(selectors.root).count(), 0, 'clicking outside the mirrored page also removes it');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('mixed inline math and separate paragraphs form a solid smooth focus block instead of folded corridors', { timeout: 25000 }, async () => {
    const f = await fixture();
    try {
        await f.student.evaluate(() => {
            document.querySelector('#lesson').innerHTML = `<h2>题目描述</h2>
                <p id="math-paragraph" style="font-size:19px;white-space:nowrap">给定两个整数 <i id="math-start" style="font:italic 25px Georgia;position:relative;top:-2px">A</i> 和 <i style="font:italic 24px Georgia;position:relative;top:-1px">B</i>，输出 <i style="font:italic 26px Georgia;position:relative;top:-3px">A + B</i> 的值。保证 <i style="font:italic 25px Georgia;position:relative;top:-2px">A, B</i> 及结果均在 <strong style="font-size:22px">32</strong> 位整型范围内。</p>
                <p id="math-next" style="font-size:19px">现在请你解决这一问题。</p>
                <h2 id="math-heading" style="font-size:27px">输入格式</h2>
                <p>一行，包含两个整数 A, B，中间用单个空格隔开。</p><div style="height:1000px"></div>`;
        });
        await f.frame().locator('#math-heading').waitFor();
        const { start } = await selectionPoints(f, '#math-start');
        const { end } = await selectionPoints(f, '#math-heading');
        await dragSelection(f, start, end);
        // A box can already exist for an intermediate mouse-move selection.
        // Wait for the learner to acknowledge the final heading-inclusive range
        // before asserting geometry, rather than measuring an earlier packet.
        await f.teacher.exposeFunction('finalMathSelectionReceived', () => f.commands.some((command) =>
            command.action === 'annotate' && command.annotation?.quote.trim().endsWith('输入格式')
            && f.acks.some((ack) => ack.id === command.id && ack.ok)));
        await f.teacher.waitForFunction(() => window.finalMathSelectionReceived());
        const finalTeacherPath = await f.teacher.locator(selectors.box).getAttribute('d');
        await f.student.waitForFunction(({ selector, d }) => document.querySelector(selector)?.getAttribute('d') === d,
            { selector: selectors.box, d: finalTeacherPath });
        await f.student.locator(selectors.box).waitFor();
        const geometry = await f.student.locator(selectors.box).evaluate((outline) => {
            const range = document.createRange();
            const start = document.querySelector('#math-start').firstChild;
            const firstParagraph = document.querySelector('#math-paragraph');
            range.setStart(start, 0); range.setEnd(firstParagraph, firstParagraph.childNodes.length);
            const first = range.getBoundingClientRect();
            range.selectNodeContents(document.querySelector('#math-next'));
            const second = range.getBoundingClientRect();
            range.selectNodeContents(document.querySelector('#math-heading'));
            const last = range.getBoundingClientRect();
            const inverse = outline.getScreenCTM().inverse();
            const contains = (x, y) => {
                const point = outline.ownerSVGElement.createSVGPoint(); point.x = x; point.y = y;
                return outline.isPointInFill(point.matrixTransform(inverse));
            };
            const gapY = (first.bottom + second.top) / 2;
            // The new contour fills the obvious connection towards the next
            // paragraph's left edge, not only their narrow horizontal overlap.
            const diagonalLeft = (first.left + second.left) / 2;
            const sharedRight = Math.min(first.right, second.right);
            const bridgeX = diagonalLeft + (sharedRight - diagonalLeft) / 3;
            const walker = document.createTreeWalker(firstParagraph, NodeFilter.SHOW_TEXT);
            const glyphs = []; let text; let selected = false;
            while ((text = walker.nextNode())) {
                selected ||= text === start;
                if (!selected || !text.textContent.trim()) continue;
                range.selectNodeContents(text);
                for (const rect of range.getClientRects()) if (rect.width && rect.height) glyphs.push(rect);
            }
            const samples = glyphs.map((rect) => ({
                inside: contains(rect.left + rect.width / 2, rect.top + rect.height / 2),
                smoothTop: contains(rect.left + rect.width / 2, first.top - 1),
                smoothBottom: contains(rect.left + rect.width / 2, first.bottom + 1),
            }));
            return { d: outline.getAttribute('d'), samples, bridge: contains(bridgeX, gapY),
                gap: second.top - first.bottom, leftOffset: first.left - second.left,
                shortTailOutside: !contains(second.right + 25, second.top + second.height / 2),
                headingInside: contains(last.left + last.width / 2, last.top + last.height / 2) };
        });
        if (process.env.LIVE_SHARE_SCREENSHOTS === '1') {
            await f.student.screenshot({ path: path.join(os.tmpdir(), 'live-share-annotation-math-block.png'), caret: 'initial' });
            await f.teacher.screenshot({ path: path.join(os.tmpdir(), 'live-share-annotation-math-block-teacher.png'), caret: 'initial' });
        }
        assert(geometry.gap > 10 && geometry.leftOffset > 80, 'the fixture has a visible paragraph gap and a partially selected first line');
        assert.equal((geometry.d.match(/m/gi) || []).length, 1, 'all selected blocks have a single contour');
        assert.equal((geometry.d.match(/z/gi) || []).length, 1, 'the contour closes once');
        assert(geometry.samples.every((sample) => sample.inside), 'all inline formula and prose fragments remain enclosed');
        assert(geometry.samples.every((sample) => sample.smoothTop && sample.smoothBottom),
            'inline formula baselines and font sizes share smooth row edges rather than tiny bumps');
        assert(geometry.bridge, 'the paragraph gap is filled towards the direct diagonal edge, without a thin folded connector');
        assert(geometry.shortTailOutside, 'a short paragraph keeps its text-shaped edge instead of a full rectangular selection');
        assert(geometry.headingInside, 'the selected heading belongs to the same connected block');
        assert.equal(await f.teacher.locator(selectors.box).getAttribute('d'), geometry.d,
            'teacher and learner render identical focus geometry');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('a selection spanning outside paragraphs and a scroller clips each text fragment to its own overflow bounds', { timeout: 25000 }, async () => {
    const f = await fixture();
    try {
        await f.student.evaluate(() => {
            const nested = document.querySelector('#nested');
            const content = document.createElement('p'); content.id = 'clip-lines';
            content.style.cssText = 'width:1400px;white-space:nowrap;margin:20px 0;line-height:36px';
            for (let index = 0; index < 9; index++) {
                content.append(document.createTextNode(`第${index + 1}行：滚动区内部文字只有可见部分应被框住。`.repeat(3)), document.createElement('br'));
            }
            nested.replaceChildren(content);
            nested.scrollLeft = 240; nested.scrollTop = 20;
            document.querySelector('#link-line').textContent = '滚动区域后面的外部文字';
        });
        await f.frame().locator('#clip-lines').waitFor();
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#nested').scrollLeft === 240);
        const { start } = await selectionPoints(f, '#multiline');
        const { end } = await selectionPoints(f, '#link-line');
        await dragSelection(f, start, end);
        await f.student.locator(selectors.box).waitFor();
        // Reassert the scroll position after native selection autoscroll, then
        // check the production range renderer updates without a new selection.
        await f.student.evaluate(() => { const node = document.querySelector('#nested'); node.scrollLeft = 240; node.scrollTop = 20; });
        const geometry = await f.student.locator(selectors.box).evaluate((path) => {
            const scroll = document.querySelector('#nested').getBoundingClientRect();
            const range = document.createRange(); range.selectNodeContents(document.querySelector('#clip-lines'));
            const visible = [...range.getClientRects()].find((rect) => rect.height > 0 && rect.top >= scroll.top && rect.bottom <= scroll.bottom);
            const inverse = path.getScreenCTM().inverse();
            const contains = (x, y) => {
                const point = path.ownerSVGElement.createSVGPoint(); point.x = x; point.y = y;
                return path.isPointInFill(point.matrixTransform(inverse));
            };
            const bounds = path.getBoundingClientRect();
            const after = document.querySelector('#link-line').getBoundingClientRect();
            return { visible: !!visible, outside: visible && contains(scroll.left - 25, visible.top + visible.height / 2),
                inside: visible && contains(scroll.left + 25, visible.top + visible.height / 2),
                bottom: bounds.bottom, afterBottom: after.bottom,
                left: bounds.left, outsideLeft: document.querySelector('#multiline').getBoundingClientRect().left };
        });
        assert(geometry.visible && geometry.inside, 'visible scroller text remains inside the shared outline');
        assert.equal(geometry.outside, false, 'horizontally clipped scroller text is never outlined in the outside margin');
        assert(geometry.left >= geometry.outsideLeft - 6, 'clipped text does not extend the overall contour into the page margin');
        assert(geometry.bottom <= geometry.afterBottom + 6, 'offscreen lower lines inside the scroller cannot extend the outline below its last outside anchor');
        if (process.env.LIVE_SHARE_SCREENSHOTS === '1') {
            await f.student.screenshot({ path: path.join(os.tmpdir(), 'live-share-annotation-overflow.png'), caret: 'initial' });
        }
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

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
        await f.teacher.locator('#teacher-draft').click();
        await f.student.locator(selectors.box).waitFor({ state: 'hidden' });
        assert.equal(await f.teacher.locator(selectors.root).count(), 0, 'leaving a cleared note removes it without another delete action');
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

it('scaled note dragging and resizing synchronize dimensions, and anchors follow scrolling and reflow', { timeout: 35000 }, async () => {
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
        const resizeHandle = await f.teacher.locator(selectors.resize).boundingBox();
        await f.teacher.mouse.move(resizeHandle.x + resizeHandle.width / 2, resizeHandle.y + resizeHandle.height / 2);
        await f.teacher.mouse.down();
        await f.teacher.mouse.move(resizeHandle.x + resizeHandle.width / 2 + 65, resizeHandle.y + resizeHandle.height / 2 + 45, { steps: 10 });
        await f.teacher.mouse.up();
        await f.student.waitForFunction(({ selector, width }) => document.querySelector(selector).getBoundingClientRect().width > width + 100,
            { selector: selectors.bubble, width: movedStudent.width });
        const resizedTeacher = await f.teacher.locator(selectors.bubble).boundingBox();
        const resizedStudent = await f.student.locator(selectors.bubble).boundingBox();
        assert(Math.abs(resizedTeacher.width * 2 - resizedStudent.width) < 3 && Math.abs(resizedTeacher.height * 2 - resizedStudent.height) < 3,
            'both peers show the same manually resized bubble in learner CSS pixels');
        assert(Math.abs(resizedStudent.width - movedStudent.width - 130) < 3);
        assert(Math.abs((resizedTeacher.height - movedTeacher.height) * 2 - 90) < 3,
            'vertical resize uses the mirror scale rather than teacher DPR');
        const dimensions = f.commands.filter((command) => command.action === 'annotate' && command.annotation?.width).at(-1).annotation;
        assert(Math.abs(dimensions.width - resizedStudent.width) < 3 && Math.abs(dimensions.height - resizedStudent.height) < 3);
        await f.teacher.locator(selectors.input).fill('手动调好的大小不应在继续写字时跳回默认值。\n下一行继续实时显示。');
        await f.student.locator(selectors.bubble).getByText('手动调好的大小不应在继续写字时跳回默认值。\n下一行继续实时显示。', { exact: true }).waitFor();
        const afterWriting = await f.student.locator(selectors.bubble).boundingBox();
        assert(Math.abs(afterWriting.width - resizedStudent.width) < 1 && Math.abs(afterWriting.height - resizedStudent.height) < 1);
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
        await f.teacher.getByRole('button', { name: '删除批注', exact: true }).click();
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
        await f.frame().locator('h2').click();
        assert(await f.teacher.locator(firstSelector).locator(selectors.bubble).isVisible(), 'written notes survive clicks outside them');
        await selectText(f, '#title');
        const temporaryId = await f.teacher.locator(selectors.root).last().getAttribute('data-share-annotation-id');
        await f.frame().locator('h2').click();
        await f.student.locator(`[data-share-annotation-id="${temporaryId}"]`).waitFor({ state: 'detached' });
        assert(await f.student.locator(firstSelector).locator(selectors.bubble).isVisible(), 'discarding a new temporary focus does not delete a written note');
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
        await second.getByRole('button', { name: '删除批注', exact: true }).click();
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
        await f.student.locator(`${selectors.root}:visible ${selectors.box}`).first().waitFor({ state: 'visible' });
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
