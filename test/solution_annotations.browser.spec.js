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
    try { playwright = require(location); break; } catch { /* Bundled browser runtime is also supported. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((candidate) => candidate && fs.existsSync(candidate));
let browser; let server; let origin;
before(async () => {
    assert(executablePath, 'Chromium is required for standalone annotation tests');
    const bundle = await build({ entryPoints: [path.join(root, 'packages/ui-default/components/solution_annotations.ts')],
        bundle: true, write: false, format: 'iife', globalName: 'SolutionAnnotations', platform: 'browser',
        plugins: [{ name: 'real-monaco', setup(builder) {
            builder.onResolve({ filter: /^monaco-editor\// }, () => ({ path: 'monaco', namespace: 'test' }));
            builder.onResolve({ filter: /^vj\/components\/monaco\/loader$/ }, () => ({ path: 'loader', namespace: 'test' }));
            builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path: name }) => ({
                contents: name === 'monaco' ? 'module.exports=window.monaco;' : 'export const load=async()=>({monaco:window.monaco});',
            }));
        } }],
    });
    const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share.page.styl'), 'utf8'));
    const monaco = path.resolve(root, 'node_modules/monaco-editor/min/vs');
    server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/annotations.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle.outputFiles[0].text); return; }
        if (url.pathname.startsWith('/vs/')) {
            const file = path.resolve(monaco, url.pathname.slice(4));
            if (!file.startsWith(`${monaco}/`) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
            response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.ttf') ? 'font/ttf' : 'application/javascript');
            response.end(fs.readFileSync(file)); return;
        }
        response.setHeader('Content-Type', 'text/html');
        response.end(`<!doctype html><meta charset="utf-8"><style>
          *{box-sizing:border-box}body{margin:0;padding:30px;font:20px/1.7 Arial;background:#edf0f4}
          #workspace{position:relative;padding:30px;background:white;min-height:1050px;width:900px;border-radius:18px}
          #statement{width:730px}#code{width:790px;height:380px;margin-top:60px}#outside{height:50px}
          ${css}</style><button id="outside">outside controls</button>
          ${url.searchParams.has('learner') ? '<aside>Different learner layout</aside><div><div>' : ''}
          <main id="workspace" data-live-share-private>
          <section id="statement" data-solution-annotation-text="statement"><h2>三位数相加</h2>
          <p id="paragraph">读入三个整数，<strong>输出它们相加后的结果</strong>。注意输入之间的空格。</p>
          <p id="second">第二个重点可以独立标注，第一处不会消失。</p>
          <div data-live-share-private id="secret">PRIVATE-FORM-CONTENT</div></section>
          <div id="code"></div></main>
          ${url.searchParams.has('learner') ? '</div></div>' : ''}
          <script src="/vs/loader.js"></script><script>require.config({paths:{vs:'/vs'}});
          require(['vs/editor/editor.main'],function(){var s=document.createElement('script');s.src='/annotations.js';s.onload=()=>window.ready=true;document.head.appendChild(s)});</script>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

async function pageFixture(t, editable = true, initial, options = {}) {
    const context = await browser.newContext({ viewport: options.viewport || { width: editable ? 1250 : 1100, height: 950 } });
    t.after(() => context.close());
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/?${editable ? 'teacher' : 'learner'}`); await page.waitForFunction(() => window.ready);
    await page.evaluate(({ editable, initial, options }) => {
        if (options.scrollLayout) {
            document.body.style.padding = '16px';
            const workspace = document.querySelector('#workspace');
            const scroller = document.createElement('div'); scroller.id = 'platform-scroller';
            Object.assign(scroller.style, { position: 'relative', height: '760px', width: '100%', overflow: 'auto' });
            workspace.parentNode.insertBefore(scroller, workspace); scroller.append(workspace);
            Object.assign(workspace.style, { width: '100%', minHeight: '1400px', padding: '28px' });
            Object.assign(document.querySelector('#statement').style, { width: '100%',
                height: options.statementScroll === false ? 'auto' : '230px', overflow: options.statementScroll === false ? 'visible' : 'auto' });
            const spacer = document.createElement('div'); spacer.style.height = '600px';
            document.querySelector('#statement').append(spacer);
            Object.assign(document.querySelector('#code').style, { width: '100%', height: '300px', marginTop: '40px' });
        }
        if (options.reflowText) {
            const paragraph = document.createElement('p'); paragraph.id = 'reflow-paragraph'; paragraph.textContent = options.reflowText;
            document.querySelector('#paragraph').after(paragraph);
        }
        window.transportCount = 0;
        window.WebSocket = class { constructor() { window.transportCount++; throw Error('standalone annotations must not connect'); } };
        window.liveShareSentinel = { sessionId: 'unrelated-active-session', untouched: true };
        window.editor = monaco.editor.create(document.querySelector('#code'), { value: options.source || 'int main() {\n    int a = 3;\n    return a;\n}', language: 'cpp', minimap: { enabled: false },
            readOnly: !editable, fontSize: 20, lineHeight: 28, automaticLayout: true, scrollBeyondLastLine: false });
        window.changes = [];
        window.liveSnapshots = [];
        window.annotations = SolutionAnnotations.attachSolutionAnnotations({ root: document.querySelector('#workspace'), editable, initial,
            editors: [{ id: 'code', editor }], onChange: (value) => {
                changes.push(value);
                if (options.snapshotOnChange) liveSnapshots.push(annotations.serialize());
            } });
    }, { editable, initial, options });
    return { page, errors };
}

async function inkAt(page, start, label) {
    await page.mouse.move(start.x, start.y); await page.mouse.down({ button: 'right' });
    await page.mouse.move(start.x + 110, start.y + 3, { steps: 8 }); await page.mouse.up({ button: 'right' });
    await page.keyboard.press('Shift+Enter');
    const input = page.locator('[data-share-drawing-note-input]').last();
    await input.waitFor({ state: 'visible' }); await input.fill(label);
    const id = await input.locator('..').getAttribute('data-share-drawing-note');
    return id;
}
const inkPath = (page, id) => page.locator(`[data-share-drawing-stroke="${id}"] path`).last();
const inkNote = (page, id) => page.locator(`[data-share-drawing-note="${id}"]`);
async function dragInkNote(page, id, dx, dy) {
    const grip = await inkNote(page, id).locator('[data-share-drawing-note-drag]').boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + dx, grip.y + grip.height / 2 + dy, { steps: 8 }); await page.mouse.up();
}
async function center(locator) {
    return locator.evaluate((node) => {
        const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
}
async function codePoint(page, line) {
    return page.evaluate((line) => {
        const node = editor.getDomNode().getBoundingClientRect();
        const point = editor.getScrolledVisiblePosition({ lineNumber: line, column: 5 });
        return { x: node.left + point.left, y: node.top + point.top + point.height / 2 };
    }, line);
}
async function glyphPoint(page, offset) {
    return page.evaluate((offset) => {
        const text = document.querySelector('#reflow-paragraph').firstChild;
        const range = document.createRange(); range.setStart(text, offset); range.setEnd(text, offset + 1);
        const rect = range.getBoundingClientRect(); return { x: rect.left, y: rect.top + rect.height / 2 };
    }, offset);
}
async function expectAttached(page, id, original, target) {
    try { await page.waitForFunction(({ id, original, target }) => {
        const path = document.querySelector(`[data-share-drawing-stroke="${id}"] path:last-child`);
        const note = document.querySelector(`[data-share-drawing-note="${id}"]`);
        if (!path || !note) return false;
        const center = (node) => { const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; };
        const stroke = center(path); const bubble = center(note);
        return Math.abs(stroke.x - target.x - original.stroke.x) < 2 && Math.abs(stroke.y - target.y - original.stroke.y) < 2
            && Math.abs(bubble.x - target.x - original.note.x) < 2 && Math.abs(bubble.y - target.y - original.note.y) < 2;
    }, { id, original, target }, { timeout: 7000 }); } catch (error) {
        console.error('INK_GEOMETRY', JSON.stringify({ id, original, target,
            stroke: await center(inkPath(page, id)), note: await center(inkNote(page, id)),
            state: await page.evaluate(() => ({ scrollTop: editor.getScrollTop(), scrollLeft: editor.getScrollLeft(), saved: annotations.serialize() })) }));
        await page.screenshot({ path: '/tmp/onebyone-solution-scroll-failure.png' });
        throw error;
    }
}
async function relativeInk(page, id, target) {
    const stroke = await center(inkPath(page, id)); const note = await center(inkNote(page, id));
    return { stroke: { x: stroke.x - target.x, y: stroke.y - target.y }, note: { x: note.x - target.x, y: note.y - target.y } };
}

it('saved ink remains attached through nested statement and application-page scrolling', async (t) => {
    const { page, errors } = await pageFixture(t, true, undefined, { scrollLayout: true });
    const target = page.locator('#paragraph strong');
    const initial = await target.boundingBox();
    const id = await inkAt(page, { x: initial.x + 8, y: initial.y + initial.height - 3 }, '题面重点');
    const saved = await page.evaluate(() => annotations.serialize());
    assert.equal(saved.ink.length, 1, 'drawing on a page with an outer scroller must retain a content anchor');
    assert.equal(saved.ink[0].anchor.key, 'statement');
    const original = await relativeInk(page, id, await center(target));
    await page.evaluate(() => { document.querySelector('#statement').scrollTop = 40; });
    await expectAttached(page, id, original, await center(target));
    await page.evaluate(() => { document.querySelector('#platform-scroller').scrollTop = 60; });
    await expectAttached(page, id, original, await center(target));
    const learner = await pageFixture(t, false, saved, { scrollLayout: true, viewport: { width: 860, height: 950 } });
    await learner.page.waitForSelector(`[data-share-drawing-note="${id}"]`);
    assert.equal(await inkNote(learner.page, id).locator('textarea').getAttribute('readonly'), '');
    await learner.page.evaluate(() => { document.querySelector('#statement').scrollTop = 40; document.querySelector('#platform-scroller').scrollTop = 60; });
    await expectAttached(learner.page, id, original, await center(learner.page.locator('#paragraph strong')));
    assert.deepEqual([...errors, ...learner.errors], []);
});

it('a normal long statement keeps saved ink bound inside the workspace instead of the outer scrolling page', async (t) => {
    const { page, errors } = await pageFixture(t, true, undefined, { scrollLayout: true, statementScroll: false });
    const target = page.locator('#paragraph strong'); const rect = await target.boundingBox();
    const id = await inkAt(page, { x: rect.x + 10, y: rect.y + rect.height - 3 }, '随题面滚动');
    const saved = await page.evaluate(() => annotations.serialize());
    assert.equal(saved.ink.length, 1, 'an outer scroll viewport must not prevent persistent topic anchoring');
    const original = await relativeInk(page, id, await center(target));
    await page.evaluate(() => { document.querySelector('#platform-scroller').scrollTop = 75; });
    await expectAttached(page, id, original, await center(target));
    assert.deepEqual(errors, []);
});

it('saved statement ink follows the same words when a narrower learner layout wraps the paragraph', async (t) => {
    const reflowText = '先仔细阅读题意再分析输入和输出，确定每一步需要完成什么，最后检查计算顺序和输出格式。'.repeat(4);
    const { page, errors } = await pageFixture(t, true, undefined, { scrollLayout: true, statementScroll: false, reflowText,
        viewport: { width: 1600, height: 950 } });
    const point = await glyphPoint(page, 55);
    const id = await inkAt(page, { x: point.x + 1, y: point.y }, '同一段题意');
    const saved = await page.evaluate(() => annotations.serialize());
    assert.equal(typeof saved.ink[0].anchor.textOffset, 'number', 'text ink must persist its content location');
    const offset = saved.ink[0].anchor.textOffset;
    const original = await relativeInk(page, id, await glyphPoint(page, offset));
    const learner = await pageFixture(t, false, saved, { scrollLayout: true, statementScroll: false, reflowText,
        viewport: { width: 840, height: 950 } });
    const wrapped = await glyphPoint(learner.page, offset);
    assert(Math.abs(wrapped.x - (await glyphPoint(page, offset)).x) > 100, 'the smaller page must actually rewrap the anchored word');
    await expectAttached(learner.page, id, original, wrapped);
    await learner.page.evaluate(() => { document.querySelector('#platform-scroller').scrollTop = 60; });
    await expectAttached(learner.page, id, original, await glyphPoint(learner.page, offset));
    assert.deepEqual([...errors, ...learner.errors], []);
});

it('Monaco ink and label follow internal scrolling and inserted lines, including saved readonly replay', async (t) => {
    const source = Array.from({ length: 90 }, (_, index) => `int value_${index + 1} = ${index + 1}; // ${'horizontal scrolling '.repeat(10)}`).join('\n');
    const { page, errors } = await pageFixture(t, true, undefined, { scrollLayout: true, source });
    const statement = await page.locator('#paragraph strong').boundingBox();
    await inkAt(page, { x: statement.x + 8, y: statement.y + statement.height - 3 }, '题面范围');
    await page.evaluate(() => { editor.setScrollTop(7 * 28); });
    await page.waitForFunction(() => editor.getScrollTop() === 7 * 28);
    const target = await codePoint(page, 14);
    const id = await inkAt(page, { x: target.x, y: target.y + 7 }, '第十四行');
    await dragInkNote(page, id, 65, 35);
    const original = await relativeInk(page, id, await codePoint(page, 14));
    await page.evaluate(() => { editor.setScrollTop(9 * 28); });
    await page.waitForFunction(() => editor.getScrollTop() === 9 * 28);
    await expectAttached(page, id, original, await codePoint(page, 14));
    await page.evaluate(() => { editor.setScrollLeft(20); });
    await page.waitForFunction(() => editor.getScrollLeft() === 20);
    await expectAttached(page, id, original, await codePoint(page, 14));
    await page.evaluate(() => editor.executeEdits('test-insert-before-ink', [{ range: new monaco.Range(1, 1, 1, 1), text: '// 一\n// 二\n// 三\n' }]));
    await expectAttached(page, id, original, await codePoint(page, 17));
    const saved = await page.evaluate(() => annotations.serialize());
    assert.equal(saved.ink.length, 2);
    await page.screenshot({ path: '/tmp/onebyone-solution-scroll-teacher.png' });
    const learner = await pageFixture(t, false, saved, { scrollLayout: true, source: `// 一\n// 二\n// 三\n${source}`,
        viewport: { width: 840, height: 950 } });
    await learner.page.evaluate(() => { editor.setScrollTop(12 * 28); });
    await expectAttached(learner.page, id, original, await codePoint(learner.page, 17));
    assert.equal(await inkNote(learner.page, id).locator('[data-share-drawing-note-delete]').count(), 0);
    await learner.page.screenshot({ path: '/tmp/onebyone-solution-scroll-readonly.png' });
    assert.deepEqual([...errors, ...learner.errors], []);
});

it('legacy saved element and editor ink without new anchor metadata remains readable', async (t) => {
    const { page } = await pageFixture(t);
    const legacy = await page.evaluate(() => {
        const root = document.querySelector('#workspace').getBoundingClientRect();
        const statement = document.querySelector('#paragraph strong').getBoundingClientRect();
        const code = editor.getDomNode().getBoundingClientRect(); const layout = editor.getLayoutInfo();
        const position = editor.getScrolledVisiblePosition({ lineNumber: 2, column: 5 });
        const make = (id, anchor, reference, x, y, label) => ({ id, anchor, reference,
            points: [[x, y], [x + 80, y + 2]], note: { text: label, x: x + 95, y, width: 90, height: 43 } });
        return { version: 1, text: [], code: [], ink: [
            make('legacy-statement-ink', { kind: 'element', key: 'statement', path: [1, 0] },
                [1, 0, 0, 1, statement.left - root.left, statement.top - root.top],
                statement.left - root.left + 8, statement.bottom - root.top - 3, '旧题面笔迹'),
            make('legacy-editor-ink', { kind: 'editor', editorId: 'code' },
                [20, 0, 0, 28, code.left - root.left + layout.contentLeft, code.top - root.top],
                code.left - root.left + position.left, code.top - root.top + position.top + 20, '旧代码笔迹'),
        ] };
    });
    const learner = await pageFixture(t, false, legacy);
    for (const mark of legacy.ink) {
        await inkNote(learner.page, mark.id).waitFor({ state: 'visible' });
        assert.equal(await inkNote(learner.page, mark.id).locator('textarea').inputValue(), mark.note.text);
    }
    assert.equal(await learner.page.locator('[data-share-drawing-note-delete]').count(), 0);
    assert.deepEqual(await learner.page.evaluate(() => annotations.serialize()), legacy);
    assert.deepEqual(learner.errors, []);
});

it('live autosave snapshots do not terminate a right-button stroke while the mouse remains held', async (t) => {
    const { page, errors } = await pageFixture(t, true, undefined, { snapshotOnChange: true });
    const box = await page.locator('#paragraph strong').boundingBox();
    const start = { x: box.x + 5, y: box.y + box.height - 3 };
    await page.mouse.move(start.x, start.y); await page.mouse.down({ button: 'right' });
    for (let step = 1; step <= 5; step++) {
        await page.mouse.move(start.x + step * 25, start.y + step);
        await page.waitForTimeout(50);
    }
    await page.mouse.up({ button: 'right' });
    await page.keyboard.press('Shift+Enter'); await page.locator('[data-share-drawing-note-input]').fill('完整的这一笔');
    const saved = await page.evaluate(() => annotations.serialize());
    assert(saved.ink[0].points.length >= 5, 'taking a recovery snapshot must keep the active pen gesture running');
    const stroke = await inkPath(page, saved.ink[0].id).boundingBox();
    assert(stroke.width >= 120, 'the visible line must include the full teacher gesture');
    assert(await page.evaluate(() => liveSnapshots.length > 1));
    await page.waitForTimeout(100);
    const snapshotCount = await page.evaluate(() => liveSnapshots.length);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => liveSnapshots.length), snapshotCount, 'snapshot serialization must settle after pending packets drain');
    assert.deepEqual(errors, []);
});
async function selectText(page, selector) {
    await page.evaluate((selector) => {
        const node = document.querySelector(selector); const range = document.createRange(); range.selectNodeContents(node);
        const selection = document.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    }, selector);
}

it('private workspaces can annotate statement text, keep multiple notes, and replay on a differently wrapped read-only page', async (t) => {
    const { page, errors } = await pageFixture(t);
    await selectText(page, '#paragraph strong');
    await page.waitForSelector('[data-share-annotation-arrow]:not([hidden])');
    await page.keyboard.press('Shift+Enter');
    await page.locator('[data-share-annotation-input]').fill('先相加，再输出');
    await page.keyboard.press('Enter'); await page.keyboard.insertText('保留换行');
    await selectText(page, '#second'); await page.keyboard.press('Shift+Enter');
    await page.locator('[data-share-annotation-input]').last().fill('<img src=x onerror=alert(1)>');
    const saved = await page.evaluate(() => annotations.serialize());
    assert.equal(saved.text.length, 2); assert.equal(saved.text[0].quote, '输出它们相加后的结果');
    assert.equal(saved.text[0].text, '先相加，再输出\n保留换行'); assert.equal(saved.text[0].key, 'statement');
    assert.equal(await page.evaluate(() => transportCount), 0);
    assert.deepEqual(await page.evaluate(() => liveShareSentinel), { sessionId: 'unrelated-active-session', untouched: true });
    const learner = await pageFixture(t, false, saved);
    await learner.page.waitForSelector('[data-share-annotation-text]');
    assert.equal(await learner.page.locator('[data-share-annotation-text]').count(), 2);
    assert.equal(await learner.page.locator('[data-share-annotation-input],[data-share-annotation-clear]').count(), 0);
    assert.equal(await learner.page.locator('[data-share-annotation-text] img').count(), 0);
    assert.deepEqual(await learner.page.evaluate(() => annotations.serialize()), saved);
    await learner.page.screenshot({ path: '/tmp/onebyone-solution-annotations-readonly.png' });
    assert.deepEqual([...errors, ...learner.errors], []);
});

it('real Monaco selection notes never change source code and follow an edit before the selected code', async (t) => {
    const { page, errors } = await pageFixture(t);
    const original = await page.evaluate(() => { editor.focus(); editor.setSelection(new monaco.Range(2, 5, 2, 15)); return editor.getValue(); });
    await page.keyboard.press('Shift+Enter');
    await page.locator('[data-share-code-annotation] [data-share-annotation-input]').fill('变量初值');
    assert.equal(await page.evaluate(() => editor.getValue()), original);
    await page.evaluate(() => editor.executeEdits('test-insert', [{ range: new monaco.Range(1, 1, 1, 1), text: '// 示例\n' }]));
    const saved = await page.evaluate(() => annotations.serialize());
    assert.equal(saved.code.length, 1); assert.equal(saved.code[0].text, '变量初值');
    assert.equal(saved.code[0].quote, 'int a = 3;');
    assert.equal(saved.code[0].start, original.indexOf('int a') + '// 示例\n'.length);
    const learner = await pageFixture(t, false);
    await learner.page.evaluate(({ saved, source }) => {
        annotations.dispose(); editor.setValue(source);
        window.annotations = SolutionAnnotations.attachSolutionAnnotations({ root: document.querySelector('#workspace'), editable: false, initial: saved, editors: [{ id: 'code', editor }] });
    }, { saved, source: `// 示例\n${original}` });
    await learner.page.waitForSelector('[data-share-code-annotation] [data-share-annotation-text]');
    assert.equal(await learner.page.locator('[data-share-code-annotation] [data-share-annotation-text]').textContent(), '变量初值');
    assert.deepEqual([...errors, ...learner.errors], []);
});

it('right-button ink persists beyond the live-share fade interval, saves labels, and readonly replay cannot edit it', async (t) => {
    const { page, errors } = await pageFixture(t);
    const point = await page.locator('#paragraph').boundingBox();
    await page.mouse.move(point.x + 25, point.y + 15); await page.mouse.down({ button: 'right' });
    await page.mouse.move(point.x + 160, point.y + 22, { steps: 8 }); await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(6200);
    assert.equal(await page.locator('[data-share-drawing-stroke]').count(), 1);
    assert.equal(await page.locator('[data-share-drawing-stroke]').evaluate((node) => getComputedStyle(node).opacity), '1');
    await page.keyboard.press('Shift+Enter'); await page.locator('[data-share-drawing-note-input]').fill('这里');
    const saved = await page.evaluate(() => annotations.serialize());
    assert.equal(saved.ink.length, 1); assert.equal(saved.ink[0].note.text, '这里');
    assert.equal(saved.ink[0].anchor.kind, 'element'); assert.equal(saved.ink[0].anchor.key, 'statement');
    const learner = await pageFixture(t, false, saved);
    await learner.page.waitForSelector('[data-share-drawing-note-input]');
    assert.equal(await learner.page.locator('[data-share-drawing-note-input]').inputValue(), '这里');
    assert.equal(await learner.page.locator('[data-share-drawing-note-input]').getAttribute('readonly'), '');
    assert.equal(await learner.page.locator('[data-share-drawing-note-delete]').count(), 0);
    assert.deepEqual(await learner.page.evaluate(() => annotations.serialize()), saved);
    await page.locator('[data-share-drawing-note-delete]').click();
    assert.equal((await page.evaluate(() => annotations.serialize())).ink.length, 0);
    assert.deepEqual([...errors, ...learner.errors], []);
});

it('nested private fields are excluded and disposing removes only this workspace annotations', async (t) => {
    const { page, errors } = await pageFixture(t);
    await selectText(page, '#secret'); await page.keyboard.press('Shift+Enter');
    assert.equal((await page.evaluate(() => annotations.serialize())).text.length, 0);
    await selectText(page, '#paragraph strong'); await page.keyboard.press('Shift+Enter');
    await page.locator('[data-share-annotation-input]').fill('保存内容');
    const outcome = await page.evaluate(() => {
        const saved = annotations.serialize(); annotations.dispose();
        const node = document.querySelector('#paragraph');
        const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, clientX: 80, clientY: 150 });
        node.dispatchEvent(event);
        return { saved, prevented: event.defaultPrevented, overlays: document.querySelectorAll('[data-share-annotation],[data-share-drawing]').length,
            registered: editor.getDomNode().hasAttribute('data-live-share-editor'), value: editor.getValue() };
    });
    assert.equal(outcome.saved.text.length, 1); assert.equal(outcome.prevented, false); assert.equal(outcome.overlays, 0); assert.equal(outcome.registered, false);
    assert.equal(outcome.value, 'int main() {\n    int a = 3;\n    return a;\n}'); assert.deepEqual(errors, []);
});
