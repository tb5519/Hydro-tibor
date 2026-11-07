const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Bundled browser runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((candidate) => candidate && fs.existsSync(candidate));
let browser;
let script;
before(async () => {
    assert(executablePath, 'Chromium is required for temporary drawing tests');
    script = buildSync({ entryPoints: [path.join(root, 'packages/ui-default/components/live_share/drawing.ts')],
        bundle: true, format: 'iife', globalName: 'Drawing', write: false }).outputFiles[0].text;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

async function fixture(scale = 1.35) {
    const teacher = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    const student = await browser.newPage({ viewport: { width: 900, height: 650 }, deviceScaleFactor: 1 });
    const errors = [];
    for (const page of [teacher, student]) {
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setContent(`<style>body{margin:0;background:#eef0f4}#stage{position:relative;margin:30px 20px;width:800px;height:560px;transform-origin:top left;transform:scale(${page === teacher ? scale : 1})}iframe{position:absolute;left:70px;top:100px;width:400px;height:300px;border:4px solid #b1bdd0}button{position:absolute;left:500px;top:100px}textarea{position:absolute;left:500px;top:160px;width:220px;height:160px}</style>
            <main id="stage"><iframe sandbox="allow-same-origin" id="outer"></iframe><button id="action">运行</button><textarea>print('Hello')</textarea></main>`);
        await page.addScriptTag({ content: script });
        await page.evaluate(() => {
            const frame = document.querySelector('#outer');
            const nested = frame.contentDocument.createElement('iframe');
            nested.id = 'nested'; nested.setAttribute('sandbox', 'allow-same-origin');
            nested.style.cssText = 'position:absolute;left:35px;top:50px;width:270px;height:180px;border:3px solid #ddd';
            frame.contentDocument.body.style.margin = '0';
            frame.contentDocument.body.append(nested);
            nested.contentDocument.body.style.cssText = 'margin:0;background:#fff;color:#334;font:18px sans-serif';
            nested.contentDocument.body.innerHTML = '<p>积木编辑区</p><button id="block">移动十步</button>';
            window.clicks = 0; window.contexts = 0;
            document.querySelector('#action').onclick = () => window.clicks++;
            nested.contentDocument.querySelector('#block').onclick = () => window.clicks++;
            for (const target of [document, frame.contentDocument, nested.contentDocument]) {
                target.addEventListener('contextmenu', () => window.contexts++);
            }
        });
    }
    await teacher.exposeFunction('relayDrawing', (packet) => student.evaluate((value) => {
        window.packets.push(value); window.surface.receive(value);
    }, packet));
    for (const page of [teacher, student]) await page.evaluate((teacher) => {
        window.packets = [];
        window.surface = Drawing.attachTemporaryDrawing({ container: document.querySelector('#stage'), teacher,
            pageId: 'test_page_1234', send: (packet) => { window.packets.push(packet); window.relayDrawing(packet); } });
    }, page === teacher);
    return { teacher, student, errors, close: () => Promise.all([teacher.close(), student.close()]) };
}

async function paths(page) {
    return page.locator('[data-share-drawing-stroke] path:nth-child(2)').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('d')));
}
async function draw(page, box, offsets = [[15, 20], [30, 35], [65, 45], [80, 70]]) {
    await page.mouse.move(box.x + offsets[0][0], box.y + offsets[0][1]);
    await page.mouse.down({ button: 'right' });
    for (const [x, y] of offsets.slice(1)) await page.mouse.move(box.x + x, box.y + y, { steps: 3 });
    await page.mouse.up({ button: 'right' });
}

it('right-button drawing in nested Scratch replay and code uses learner coordinates across different resolution and DPR', async () => {
    const f = await fixture();
    try {
        const nested = f.teacher.frameLocator('#outer').frameLocator('#nested');
        const bounds = await nested.locator('body').boundingBox();
        await draw(f.teacher, bounds);
        await f.student.waitForFunction(() => window.packets.some((packet) => packet.phase === 'end'));
        assert.deepEqual(await paths(f.teacher), await paths(f.student));
        const start = await f.student.evaluate(() => window.packets[0].points[0]);
        // Stage margin + outer border + nested offset/border must each be counted once.
        assert(Math.abs(start[0] - (70 + 4 + 35 + 3 + 15 / 1.35)) < .2, JSON.stringify(start));
        assert(Math.abs(start[1] - (100 + 4 + 50 + 3 + 20 / 1.35)) < .2, JSON.stringify(start));
        await draw(f.teacher, await f.teacher.locator('textarea').boundingBox());
        await f.student.waitForFunction(() => window.packets.filter((packet) => packet.phase === 'end').length === 2);
        assert.deepEqual(await paths(f.teacher), await paths(f.student));
        assert.equal(await f.teacher.locator('textarea').inputValue(), "print('Hello')");
        await f.teacher.locator('#action').click();
        await nested.locator('#block').click();
        assert.equal(await f.teacher.evaluate(() => window.clicks), 2, 'ordinary left clicks remain available');
        assert.equal(await f.teacher.evaluate(() => window.contexts), 0, 'right-drag does not open context menus');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('a right drag released outside an iframe finishes and the next ordinary click is unaffected', async () => {
    const f = await fixture(.7);
    try {
        const start = await f.teacher.frameLocator('#outer').frameLocator('#nested').locator('body').boundingBox();
        await f.teacher.mouse.move(start.x + 25, start.y + 40);
        await f.teacher.mouse.down({ button: 'right' });
        await f.teacher.mouse.move(560, 370, { steps: 12 });
        await f.teacher.mouse.up({ button: 'right' });
        await f.student.waitForFunction(() => window.packets.some((packet) => packet.phase === 'end'));
        assert.deepEqual(await paths(f.teacher), await paths(f.student));
        await f.teacher.locator('#action').click();
        assert.equal(await f.teacher.evaluate(() => window.clicks), 1);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('marks fade after five seconds, disappear and never mutate learner content', async () => {
    const f = await fixture(1);
    try {
        await draw(f.teacher, await f.teacher.locator('textarea').boundingBox());
        await f.student.waitForFunction(() => window.packets.some((packet) => packet.phase === 'end'));
        assert.equal(await f.student.locator('[data-share-drawing-stroke]').count(), 1);
        await f.student.locator('[data-share-drawing-stroke]').waitFor({ state: 'detached', timeout: 7500 });
        await f.teacher.locator('[data-share-drawing-stroke]').waitFor({ state: 'detached', timeout: 1500 });
        assert.equal(await f.student.locator('textarea').inputValue(), "print('Hello')");
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('malformed, replayed and stale packets are rejected and disconnect clears all marks', async () => {
    const f = await fixture();
    try {
        const accepted = await f.student.evaluate(() => {
            const start = { strokeId: 'stroke_1234', phase: 'start', sequence: 0, points: [[25, 30]] };
            for (const bad of [null, { ...start, html: '<img>' }, { ...start, points: [[NaN, 30]] },
                { ...start, points: [[-1, 2]] }, { ...start, points: Array.from({ length: 33 }, () => [1, 2]) },
                { ...start, sequence: 1 }, { ...start, phase: 'remove' }]) window.surface.receive(bad);
            const before = document.querySelectorAll('[data-share-drawing-stroke]').length;
            window.surface.receive(start); window.surface.receive(start);
            window.surface.receive({ ...start, phase: 'move', sequence: 4, points: [[99, 99]] });
            return { before, paths: [...document.querySelectorAll('[data-share-drawing-stroke] path')].map((node) => node.getAttribute('d')) };
        });
        assert.equal(accepted.before, 0);
        assert(accepted.paths.length === 2 && accepted.paths.every((value) => value === 'M 25 30 l .01 0'));
        await f.teacher.evaluate(() => window.surface.setConnected(false));
        await f.student.evaluate(() => window.surface.setConnected(false));
        assert.equal(await f.student.locator('[data-share-drawing-stroke]').count(), 0);
        await draw(f.teacher, await f.teacher.locator('textarea').boundingBox());
        assert.equal(await f.teacher.locator('[data-share-drawing-stroke]').count(), 0);
        assert.equal(await f.teacher.evaluate(() => window.packets.length), 0);
        await f.student.evaluate(() => window.surface.receive({ strokeId: 'stroke_9999', phase: 'start', sequence: 0, points: [[5, 6]] }));
        assert.equal(await f.student.locator('[data-share-drawing-stroke]').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('replaced replay documents are rebound and disposal removes input interception and visual marks', async () => {
    const f = await fixture(1);
    try {
        await f.teacher.evaluate(() => {
            const frame = document.querySelector('#outer');
            frame.srcdoc = '<body style="margin:0;height:300px;background:#fff">新页面</body>';
        });
        await f.teacher.frameLocator('#outer').getByText('新页面').waitFor();
        await f.teacher.waitForTimeout(250);
        await draw(f.teacher, await f.teacher.locator('#outer').boundingBox());
        await f.student.waitForFunction(() => window.packets.some((packet) => packet.phase === 'end'));
        assert.deepEqual(await paths(f.teacher), await paths(f.student));
        // rrweb rebuilds in place: Document identity stays the same, but
        // document.open() removes its Window's input event listeners.
        assert(await f.teacher.evaluate(() => {
            const frame = document.querySelector('#outer');
            const prior = frame.contentDocument;
            prior.open(); prior.write('<body style="margin:0;height:300px;background:#fff">rrweb rebuilt page</body>'); prior.close();
            return prior === frame.contentDocument;
        }));
        await f.teacher.frameLocator('#outer').getByText('rrweb rebuilt page').waitFor();
        await draw(f.teacher, await f.teacher.locator('#outer').boundingBox());
        await f.student.waitForFunction(() => window.packets.filter((packet) => packet.phase === 'end').length === 2);
        assert.deepEqual(await paths(f.teacher), await paths(f.student));
        await f.teacher.evaluate(() => window.surface.dispose());
        assert.equal(await f.teacher.locator('[data-share-drawing]').count(), 0);
        await f.teacher.locator('#action').click({ button: 'right' });
        assert.equal(await f.teacher.evaluate(() => window.contexts), 1, 'outside sharing normal context menus are restored');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('a teacher-only page overlay accepts right drawing across page content and restores menus when paused', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
    try {
        await page.setContent('<style>body{margin:0}textarea{position:absolute;left:80px;top:100px;width:300px;height:160px}#overlay{position:fixed;inset:0;pointer-events:none}</style><textarea>老师自己的页面</textarea><div id="overlay"></div>');
        await page.addScriptTag({ content: script });
        await page.evaluate(() => {
            window.contexts = 0;
            document.addEventListener('contextmenu', () => window.contexts++);
            window.surface = Drawing.attachTemporaryDrawing({ container: document.querySelector('#overlay'), teacher: true,
                pageId: 'local_teacher', scopeDocument: true });
        });
        await draw(page, await page.locator('textarea').boundingBox());
        assert.equal(await page.locator('[data-share-drawing-stroke]').count(), 1);
        assert.equal(await page.locator('textarea').inputValue(), '老师自己的页面');
        assert.equal(await page.evaluate(() => window.contexts), 0);
        await page.evaluate(() => window.surface.setConnected(false));
        await page.locator('textarea').click({ button: 'right' });
        assert.equal(await page.locator('[data-share-drawing-stroke]').count(), 0);
        assert.equal(await page.evaluate(() => window.contexts), 1);
        await page.evaluate(() => window.surface.setConnected(true));
        await draw(page, await page.locator('textarea').boundingBox());
        assert.equal(await page.locator('[data-share-drawing-stroke]').count(), 1);
    } finally { await page.close(); }
});

it('local teacher drawing leases only controlled opaque Scratch frames and revokes the lease on pause/disposal', async () => {
    const http = require('node:http');
    const server = http.createServer((request, response) => {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(request.url === '/' ? '<body></body>' : `<body>Scratch test bridge<script>
            window.addEventListener('message', event => {
                if(event.data?.type === 'live-share-local-drawing') parent.postMessage({
                    type:'drawing-probe', path:location.pathname, channel:event.data.channel, enabled:event.data.enabled
                }, '*');
            });
        </script></body>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage();
    try {
        await page.goto(origin);
        await page.addScriptTag({ content: script });
        await page.evaluate(() => {
            window.messages = [];
            window.addEventListener('message', (event) => {
                if (event.data?.type === 'drawing-probe') window.messages.push(event.data);
            });
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none'; document.body.append(overlay);
            window.surface = Drawing.attachTemporaryDrawing({ container: overlay, teacher: true, scopeDocument: true, pageId: 'teacher-local' });
            for (const [id, src, sandbox] of [
                ['controlled', '/scratch-editor/editor.html#channel=local_controlled', 'allow-scripts'],
                ['wrongpath', '/unrelated.html#channel=local_wrongpath', 'allow-scripts'],
                ['sameorigin', '/scratch-editor/editor.html#channel=local_sameorigin', 'allow-scripts allow-same-origin'],
            ]) {
                const frame = document.createElement('iframe'); frame.id = id; frame.src = src;
                frame.setAttribute('sandbox', sandbox); document.body.append(frame);
            }
        });
        await page.waitForFunction(() => window.messages.some((value) => value.enabled));
        assert(await page.evaluate(() => window.messages.every((value) => value.channel === 'local_controlled')));
        await page.evaluate(() => window.surface.setConnected(false));
        await page.waitForFunction(() => window.messages.at(-1)?.enabled === false);
        const paused = await page.evaluate(() => window.messages.length);
        await page.waitForTimeout(4200);
        assert.equal(await page.evaluate(() => window.messages.length), paused, 'paused teacher overlay does not renew the child lease');
        await page.evaluate(() => window.surface.setConnected(true));
        await page.waitForFunction(() => window.messages.at(-1)?.enabled === true);
        await page.evaluate(() => window.surface.dispose());
        await page.waitForFunction(() => window.messages.at(-1)?.enabled === false);
    } finally { await page.close(); await new Promise((resolve) => server.close(resolve)); }
});

it('Shift+Enter fixes a stroke with a compact live label, preserves empty labels, shares wrapping and dragging, and deletes both with ×', { timeout: 20000 }, async () => {
    const f = await fixture(1.35);
    try {
        await draw(f.teacher, await f.teacher.locator('textarea').boundingBox());
        await f.teacher.keyboard.press('Shift+Enter');
        const note = f.teacher.locator('[data-share-drawing-note]');
        const input = note.locator('[data-share-drawing-note-input]');
        await f.student.locator('[data-share-drawing-note]').waitFor();
        assert(await input.evaluate((node) => node === document.activeElement), 'the new label is ready to type immediately');
        assert.equal(await input.inputValue(), '');
        assert.equal(await note.evaluate((node) => node.offsetWidth), 36, 'an empty/one-character label stays compact');
        await f.teacher.waitForTimeout(6300);
        assert.equal(await f.teacher.locator('[data-share-drawing-stroke]').count(), 1, 'an empty pinned label never fades');
        assert.equal(await f.student.locator('[data-share-drawing-stroke]').count(), 1);
        await input.fill('好');
        await f.student.waitForFunction(() => document.querySelector('[data-share-drawing-note-input]')?.value === '好');
        assert.equal(await note.evaluate((node) => node.offsetWidth), 36);
        await input.press('End'); await input.press('Enter'); await input.pressSequentially('Next line');
        await f.student.waitForFunction(() => document.querySelector('[data-share-drawing-note-input]')?.value === '好\nNext line');
        const copy = f.student.locator('[data-share-drawing-note]');
        const dimensions = async (locator) => locator.evaluate((node) => ({ width: node.offsetWidth, height: node.offsetHeight,
            inputHeight: node.querySelector('textarea').scrollHeight, x: node.style.left, y: node.style.top }));
        assert.deepEqual(await dimensions(note), await dimensions(copy));
        assert.equal(await copy.locator('textarea').evaluate((node) => node.readOnly), true);
        assert.equal(await copy.locator('button').count(), 0, 'the learner cannot accidentally remove a teacher label');
        const before = await dimensions(note);
        const grip = await note.locator('[data-share-drawing-note-drag]').boundingBox();
        await f.teacher.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
        await f.teacher.mouse.down();
        await f.teacher.mouse.move(grip.x + grip.width / 2 - 81, grip.y + grip.height / 2 + 54, { steps: 6 });
        await f.teacher.mouse.up();
        const after = await dimensions(note);
        assert(Math.abs(parseFloat(after.x) - parseFloat(before.x) + 60) < .2, 'drag motion is mapped back to learner CSS pixels');
        assert(Math.abs(parseFloat(after.y) - parseFloat(before.y) - 40) < .2);
        await f.student.waitForFunction((value) => document.querySelector('[data-share-drawing-note]')?.style.left === value, after.x);
        assert.deepEqual(await dimensions(note), await dimensions(copy));
        const long = '这是一段需要自动换行的课堂提示。'.repeat(14);
        await input.fill(long);
        await f.student.waitForFunction((value) => document.querySelector('[data-share-drawing-note-input]')?.value === value, long);
        assert.deepEqual(await dimensions(note), await dimensions(copy), 'both peers render the same measured width and wrapped height');
        assert.equal(await input.evaluate((node) => node.scrollHeight <= node.clientHeight), true, 'normal-size labels have room for all lines');
        await note.locator('[data-share-drawing-note-delete]').click();
        await f.student.locator('[data-share-drawing-note]').waitFor({ state: 'detached' });
        assert.equal(await f.teacher.locator('[data-share-drawing-stroke]').count(), 0);
        assert.equal(await f.student.locator('[data-share-drawing-stroke]').count(), 0);
        assert.equal(await f.teacher.locator('textarea').first().inputValue(), "print('Hello')");
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('multiple pinned strokes survive later marks and never steal note typing, IME, expired-stroke shortcuts or controls outside the shared surface', { timeout: 20000 }, async () => {
    const f = await fixture(1);
    try {
        const box = await f.teacher.locator('textarea').boundingBox();
        await draw(f.teacher, box); await f.teacher.keyboard.press('Shift+Enter');
        await f.teacher.locator('[data-share-drawing-note-input]').fill('第一处');
        await draw(f.teacher, box, [[20, 80], [40, 90], [100, 100]]);
        await f.teacher.keyboard.press('Shift+Enter');
        assert.equal(await f.teacher.locator('[data-share-drawing-note]').count(), 2, 'a new right stroke leaves the previous note input and can be pinned');
        await f.student.waitForFunction(() => document.querySelectorAll('[data-share-drawing-note]').length === 2);
        await f.teacher.locator('[data-share-drawing-note-input]').last().fill('第二处');
        await draw(f.teacher, box, [[20, 120], [40, 125], [100, 130]]);
        const firstInput = f.teacher.locator('[data-share-drawing-note-input]').first();
        await firstInput.focus(); await firstInput.press('End'); await firstInput.press('Shift+Enter');
        assert.equal(await firstInput.inputValue(), '第一处\n', 'Shift+Enter inside an existing note remains a line break');
        assert.equal(await f.teacher.locator('[data-share-drawing-note]').count(), 2);
        const events = await f.teacher.evaluate(() => {
            const stage = document.querySelector('#stage'); stage.focus();
            stage.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
            const composing = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
            stage.dispatchEvent(composing);
            stage.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
            const imeKey = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, keyCode: 229, bubbles: true, cancelable: true });
            stage.dispatchEvent(imeKey);
            const outside = document.createElement('input'); outside.id = 'outside'; document.body.append(outside); outside.focus();
            const external = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
            outside.dispatchEvent(external);
            return [composing.defaultPrevented, imeKey.defaultPrevented, external.defaultPrevented];
        });
        assert.deepEqual(events, [false, false, false]);
        assert.equal(await f.teacher.locator('[data-share-drawing-note]').count(), 2);
        await f.teacher.waitForFunction(() => document.querySelectorAll('[data-share-drawing-stroke]').length === 2, null, { timeout: 7500 });
        const allowed = await f.teacher.evaluate(() => {
            const stage = document.querySelector('#stage'); stage.focus();
            const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
            stage.dispatchEvent(event); return !event.defaultPrevented;
        });
        assert(allowed, 'expired strokes cannot be pinned and leave the existing annotation shortcut available');
        assert.equal(await f.teacher.locator('[data-share-drawing-note]').count(), 2);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('pinned marks are never evicted by the stroke limit and malformed or reordered label commands are rejected', async () => {
    const f = await fixture(1);
    try {
        const result = await f.student.evaluate(() => {
            const note = { text: '<img src=x onerror=alert(1)>', x: 20, y: 20, width: 200, height: 54 };
            const start = { strokeId: 'pinned_0000', phase: 'start', sequence: 0, points: [[5, 6]] };
            const label = { strokeId: start.strokeId, phase: 'note', sequence: 2, points: [], note };
            for (const packet of [{ ...label, note: { ...note, width: 1 } }, { ...label, note: { ...note, html: 'x' } },
                { ...label, points: [[5, 6]] }, { ...start, note }, { ...label, note: { ...note, text: 'x'.repeat(1001) } },
                { ...label, note: { ...note, x: NaN } }]) if (Drawing.validDrawingPacket(packet)) throw new Error('accepted invalid label');
            for (let index = 0; index < 32; index++) {
                const strokeId = `pinned_${String(index).padStart(4, '0')}`;
                window.surface.receive({ ...start, strokeId });
                window.surface.receive({ strokeId, phase: 'end', sequence: 1, points: [] });
                window.surface.receive({ ...label, strokeId });
            }
            window.surface.receive({ ...start, strokeId: 'overflow_stroke' });
            window.surface.receive({ strokeId: start.strokeId, phase: 'delete', sequence: 4, points: [] });
            window.surface.receive({ ...label, sequence: 1, note: { ...note, text: 'reordered' } });
            return { strokes: document.querySelectorAll('[data-share-drawing-stroke]').length,
                notes: document.querySelectorAll('[data-share-drawing-note]').length,
                text: document.querySelector('[data-share-drawing-note-input]').value,
                injected: document.querySelectorAll('[data-share-drawing-note] img').length };
        });
        assert.deepEqual(result, { strokes: 32, notes: 32, text: '<img src=x onerror=alert(1)>', injected: 0 });
        await f.student.evaluate(() => window.surface.receive({ strokeId: 'pinned_0000', phase: 'delete', sequence: 3, points: [] }));
        assert.equal(await f.student.locator('[data-share-drawing-note]').count(), 31);
        await f.student.evaluate(() => window.surface.setConnected(false));
        assert.equal(await f.student.locator('[data-share-drawing-note]').count(), 0);
        assert.equal(await f.student.locator('[data-share-drawing-stroke]').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('the final drawing sequence stays available to delete a label after its editing budget is exhausted', async () => {
    const f = await fixture(1);
    try {
        await f.teacher.evaluate(() => {
            const strokeId = 'sequence_limit_note';
            window.surface.receive({ strokeId, phase: 'start', sequence: 0, points: [[100, 100], [180, 110]] });
            window.surface.receive({ strokeId, phase: 'end', sequence: 1, points: [] });
            for (let sequence = 2; sequence <= 4095; sequence++) window.surface.receive({ strokeId, phase: 'note', sequence, points: [],
                note: { text: '仍能删除', x: 200, y: 100, width: 90, height: 42 } });
        });
        assert.equal(await f.teacher.locator('[data-share-drawing-note-input]').evaluate((node) => node.readOnly), true);
        await f.teacher.locator('[data-share-drawing-note-delete]').click();
        assert.equal(await f.teacher.locator('[data-share-drawing-note]').count(), 0);
        assert.equal(await f.teacher.locator('[data-share-drawing-stroke]').count(), 0);
        assert.deepEqual(await f.teacher.evaluate(() => window.packets.at(-1)), {
            strokeId: 'sequence_limit_note', phase: 'delete', sequence: 4096, points: [],
        });
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});
