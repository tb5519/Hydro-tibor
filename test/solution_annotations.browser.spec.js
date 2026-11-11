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

async function pageFixture(t, editable = true, initial) {
    const context = await browser.newContext({ viewport: { width: editable ? 1250 : 1100, height: 950 } });
    t.after(() => context.close());
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/?${editable ? 'teacher' : 'learner'}`); await page.waitForFunction(() => window.ready);
    await page.evaluate(({ editable, initial }) => {
        window.transportCount = 0;
        window.WebSocket = class { constructor() { window.transportCount++; throw Error('standalone annotations must not connect'); } };
        window.liveShareSentinel = { sessionId: 'unrelated-active-session', untouched: true };
        window.editor = monaco.editor.create(document.querySelector('#code'), { value: 'int main() {\n    int a = 3;\n    return a;\n}', language: 'cpp', minimap: { enabled: false },
            readOnly: !editable, fontSize: 20, lineHeight: 28, automaticLayout: true, scrollBeyondLastLine: false });
        window.changes = [];
        window.annotations = SolutionAnnotations.attachSolutionAnnotations({ root: document.querySelector('#workspace'), editable, initial,
            editors: [{ id: 'code', editor }], onChange: (value) => changes.push(value) });
    }, { editable, initial });
    return { page, errors };
}
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
