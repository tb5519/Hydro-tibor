const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { build, buildSync, transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'packages/ui-default/public');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Local test runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
const protocolModule = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/live_share.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: protocolModule, exports: protocolModule.exports, require, URL, Buffer });

test('the prepared Scratch runtime renders its real default project through the opaque capture bridge within relay budgets', { timeout: 90000 }, async () => {
    assert(executablePath, 'Chromium is required for the actual Scratch runtime regression');
    const prebuiltCapture = process.env.LIVE_SHARE_PREBUILT_CAPTURE === '1';
    const preparedHtml = fs.readFileSync(path.join(assets, 'scratch-editor/editor.html'), 'utf8');
    const preparedBridge = [...preparedHtml.matchAll(/<script\b[^>]*>/g)].find(([tag]) => tag.includes('data-live-share-capture'))?.[0]
        .match(/\bsrc=["']([^"']+)/)?.[1];
    if (prebuiltCapture) assert.match(preparedBridge || '', /^\/scratch-editor\/js\/live-share-frame\.[a-f0-9]{16,64}\.js$/,
        'the prepared release must include its content-addressed capture bridge');
    const options = { absWorkingDir: root, bundle: true, write: false, minify: true, format: 'iife', platform: 'browser',
        loader: { '.css': 'empty', '.ttf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } };
    const parentBundle = buildSync({ ...options, globalName: 'FrameAdapters', stdin: { resolveDir: root, contents: `
        export * from './packages/ui-default/components/live_share/frames';
        export * from './packages/ui-default/components/live_share/mirror';
        export * from './packages/ui-default/components/live_share/drawing';
    ` } }).outputFiles[0].text;
    const captureBundle = prebuiltCapture ? '' : (await build({ ...options, entryPoints: ['packages/ui-default/components/live_share/frame_capture.ts'],
        plugins: [{ name: 'capture-only', setup(build) {
            build.onResolve({ filter: /^\.\/vendor$/ }, (args) => args.importer.endsWith('/mirror.ts')
                ? { path: path.join(root, 'packages/ui-default/components/live_share/capture_vendor.js') } : undefined);
        } }],
    })).outputFiles[0].text;
    const requests = [];
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        requests.push(url.pathname);
        if (url.pathname === '/test-parent.js' || url.pathname === '/scratch-editor/test-capture.js') {
            response.setHeader('Content-Type', 'application/javascript');
            // Match service/server.ts: opaque Scratch frames read public editor assets with CORS.
            if (url.pathname.startsWith('/scratch-editor/')) response.setHeader('Access-Control-Allow-Origin', '*');
            response.end(url.pathname === '/test-parent.js' ? parentBundle : captureBundle); return;
        }
        if (url.pathname.startsWith('/scratch-editor/')) {
            const filename = path.resolve(assets, `.${url.pathname}`);
            if (!filename.startsWith(`${assets}${path.sep}`) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
                response.writeHead(404).end(); return;
            }
            response.setHeader('Access-Control-Allow-Origin', '*');
            response.setHeader('Content-Type', filename.endsWith('.html') ? 'text/html; charset=utf-8'
                : filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.svg') ? 'image/svg+xml'
                    : filename.endsWith('.json') ? 'application/json' : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream');
            if (filename.endsWith('/editor.html')) {
                if (prebuiltCapture) response.end(preparedHtml);
                else {
                    const html = preparedHtml.replace(/<script\b[^>]*\bdata-live-share-capture\b[^>]*>\s*<\/script>/g, '');
                    response.end(html.replace('</body>', '<script defer crossorigin="anonymous" src="/scratch-editor/test-capture.js"></script></body>'));
                }
            } else fs.createReadStream(filename).pipe(response);
            return;
        }
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%}#source{position:absolute;left:0;top:0;width:1280px;height:720px;border:0}#viewer{position:absolute;inset:0;pointer-events:none}</style></head><body>
            ${url.pathname === '/source' ? '<iframe id="source" sandbox="allow-scripts" src="/scratch-editor/editor.html?lang=zh-cn#channel=real-scratch-channel-1234"></iframe>' : '<p id="teacher-draft">teacher own page</p>'}
            <div id="viewer" data-live-share-private></div><script src="/test-parent.js"></script><script>
            window.outbox=[];window.childLoaded=false;window.projectEvents=[];
            window.addEventListener('message', e=>{if(e.source!==document.querySelector('#source')?.contentWindow||e.origin!=='null'||e.data?.channel!=='real-scratch-channel-1234')return;
                if(e.data.type==='dirty'||e.data.type==='runState')window.projectEvents.push(e.data.type);
                if(e.data.type==='ready')e.source.postMessage({type:'init',channel:e.data.channel,mode:'editor',readOnly:false,title:'真实课堂作品'},'*');
                if(e.data.type==='loaded')window.childLoaded=true;});window.ready=true;</script></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await playwright.chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const viewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const source = await context.newPage(); const viewer = await viewerContext.newPage();
    const errors = []; const badResponses = [];
    for (const page of [source, viewer]) {
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('response', (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
    }
    let pump;
    try {
        await Promise.all([source.goto(`${origin}/source`), viewer.goto(`${origin}/viewer`)]);
        await source.waitForFunction(() => childLoaded, null, { timeout: 45000 });
        const child = source.frames().find((frame) => frame.url().includes('/scratch-editor/editor.html'));
        assert(child, 'actual prepared Scratch editor is open');
        const realStage = await child.evaluate(() => {
            const canvases = [...document.querySelectorAll('canvas')];
            const renderer = window.ReduxStore?.getState?.().scratchGui?.vm?.renderer;
            const stage = renderer?.canvas || canvases.find((node) => node.width >= 480 && node.height >= 360);
            if (!stage) return false;
            const icon = [...document.querySelectorAll('img')].find((node) => node.src.startsWith('data:image/svg+xml') && node.getBoundingClientRect().width > 10);
            if (icon) icon.dataset.testRealIcon = 'true';
            const title = [...document.querySelectorAll('input')].find(input => input.value === '真实课堂作品');
            if (title) title.dataset.testRealTitle = 'true';
            stage.dataset.testRealStage = 'true'; return { width: stage.width, height: stage.height, draw: typeof renderer?.draw, icon: !!icon };
        });
        assert(realStage, 'Scratch has initialized its real stage renderer');
        assert.equal(realStage.draw, 'function', 'the controlled child has a display-only stage redraw method');
        assert(realStage.icon, 'actual Scratch includes an inline SVG interface icon');
        const projectBefore = await child.evaluate(() => window.ReduxStore.getState().scratchGui.vm.toJSON());
        const projectEventsBefore = await source.evaluate(() => projectEvents.slice());
        assert.equal(await child.evaluate(() => window.origin), 'null');
        await viewer.evaluate(() => {
            const container = document.getElementById('viewer');
            window.viewerMirror = FrameAdapters.attachViewerMirror({ pageId: 'runtime-page', container, sendCommand: () => {} });
            window.commands = []; window.viewerFrames = FrameAdapters.attachViewerFrames({ pageId: 'runtime-page', container, getNodeRect: (id) => viewerMirror.getFrameRect(id), sendCommand: (command) => commands.push(command) });
            window.drawingPackets = [];
            window.viewerDrawing = FrameAdapters.attachTemporaryDrawing({ pageId: 'runtime-page', container, teacher: true,
                anchors: {
                    identify: (node) => viewerFrames.getDrawingNodeId(node) || (() => { const nodeId = viewerMirror.getDrawingNodeId(node); return nodeId ? { nodeId } : null; })(),
                    resolve: (ref) => ref.frameId ? viewerFrames.getDrawingNode(ref) : viewerMirror.getDrawingNode(ref.nodeId),
                },
                send: (drawing) => { drawingPackets.push(drawing); commands.push({ id: crypto.randomUUID().replaceAll('-', ''), pageId: 'runtime-page', nodeId: 1, action: 'draw', drawing }); },
            });
            window.receive = (data) => (data.type === 'frame' || data.type === 'frame-remove' ? viewerFrames : viewerMirror).receive(data);
        });
        const limiter = new protocolModule.exports.ShareRateLimit();
        const packets = []; let pumpError; let busy = false;
        pump = setInterval(async () => {
            if (busy) return; busy = true;
            try {
                const batch = await source.evaluate(() => outbox.splice(0));
                for (const data of batch) {
                    protocolModule.exports.validateRelayData('student', 'mirror', data, 'runtime-page');
                    const envelope = { type: 'relay', sessionId: 'runtime-session', pageId: 'runtime-page', kind: 'mirror', data };
                    protocolModule.exports.validateShareMessage(envelope); limiter.accept(envelope);
                    packets.push(data);
                }
                await viewer.evaluate((batch) => batch.forEach(receive), batch);
                const commands = await viewer.evaluate(() => window.commands.splice(0));
                for (const command of commands) protocolModule.exports.validateRelayData('teacher', 'command', command, 'runtime-page');
                await source.evaluate((commands) => commands.forEach((command) => command.action === 'draw'
                    ? sourceDrawing.receive(command.drawing) : sourceFrames.receiveCommand(command)), commands);
            } catch (error) { pumpError = error; } finally { busy = false; }
        }, 80);
        await source.evaluate(() => {
            window.acks = []; window.sourceFrames = FrameAdapters.attachSourceFrames({ pageId: 'runtime-page', send: (data) => outbox.push(data), sendAck: (ack) => acks.push(ack) });
            window.sourceMirror = FrameAdapters.attachSourceMirror({ pageId: 'runtime-page', send: (data) => outbox.push(data) });
            const root = document.createElement('div'); root.dataset.liveShareUi = ''; root.dataset.liveSharePrivate = '';
            root.style.cssText = 'position:fixed;inset:0;pointer-events:none'; document.documentElement.append(root);
            window.sourceDrawing = FrameAdapters.attachTemporaryDrawing({ pageId: 'runtime-page', container: root, teacher: false,
                anchors: { identify: (node) => { const nodeId = sourceMirror.getDrawingNodeId(node); return nodeId ? { nodeId } : null; },
                    resolve: (ref) => ref.frameId ? null : sourceMirror.getDrawingNode(ref.nodeId),
                    frameGeometry: (anchor) => sourceFrames.getDrawingGeometry(anchor) },
            });
        });
        const replay = viewer.frameLocator('[data-live-share-frame-viewer] iframe');
        await replay.locator('[data-test-real-stage]').waitFor({ timeout: 30000 });
        await viewer.waitForFunction(() => {
            const doc = document.querySelector('[data-live-share-frame-viewer] iframe')?.contentDocument;
            return doc?.querySelector('[data-test-real-stage]')?.style.backgroundImage.includes('data:image/');
        }, null, { timeout: 15000 });
        // Give more than one capture interval after GUI initialization; the
        // static project must remain visible after WebGL clears its draw buffer.
        await viewer.waitForTimeout(1600);
        const pixels = await replay.locator('[data-test-real-stage]').evaluate(async (node) => {
            const image = new Image(); image.src = node.style.backgroundImage.slice(5, -2); await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let nonWhite = 0;
            for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200 && (data[i] < 220 || data[i + 1] < 220 || data[i + 2] < 220)) nonWhite++;
            return nonWhite;
        });
        assert(pixels > 100, `the real default cat is visible, not a blank WebGL surface (${pixels} colored pixels)`);
        await viewer.waitForFunction(() => {
            const image = document.querySelector('[data-live-share-frame-viewer] iframe')?.contentDocument?.querySelector('[data-test-real-icon]');
            return image?.src.startsWith('data:image/') && !image.src.startsWith('data:image/svg') && image.naturalWidth > 0;
        }, null, { timeout: 10000 });
        assert(await replay.locator('input').evaluateAll((inputs) => inputs.some((input) => input.value === '真实课堂作品')),
            'ordinary Scratch project fields stay visible while sensitive fields remain masked');
        assert.equal(await child.evaluate(() => window.ReduxStore.getState().scratchGui.vm.toJSON()), projectBefore,
            'redrawing the existing stage must not edit or run the learner project');
        assert.deepEqual(await source.evaluate(() => projectEvents), projectEventsBefore,
            'capture never emits project-dirty or run-state events');
        const titleField = replay.locator('[data-test-real-title]');
        await titleField.click(); await titleField.fill('老师和学员一起创作'); await titleField.press('Enter');
        await child.waitForFunction(() => document.querySelector('[data-test-real-title]')?.value === '老师和学员一起创作');
        // Exercise the actual inert teacher replay, never source-side test clicks.
        await replay.getByRole('tab', { name: '造型', exact: true }).click();
        await child.waitForFunction(() => [...document.querySelectorAll('[role=tab]')].some(node => node.textContent === '造型' && node.getAttribute('aria-selected') === 'true'));
        await replay.getByRole('tab', { name: '造型', exact: true }).and(replay.locator('[aria-selected=true]')).waitFor();
        await replay.getByRole('tab', { name: '代码', exact: true }).click();
        await child.waitForFunction(() => [...document.querySelectorAll('[role=tab]')].some(node => node.textContent === '代码' && node.getAttribute('aria-selected') === 'true'));
        await replay.getByRole('tab', { name: '代码', exact: true }).and(replay.locator('[aria-selected=true]')).waitFor();
        const flyoutBefore = await child.evaluate(() => ScratchBlocks.getMainWorkspace().getFlyout().getWorkspace().scrollY);
        await replay.locator('.blocklyFlyout').hover({ position: { x: 160, y: 210 } });
        await viewer.mouse.wheel(0, 270);
        await child.waitForFunction((before) => Math.abs(ScratchBlocks.getMainWorkspace().getFlyout().getWorkspace().scrollY - before) > 20, flyoutBefore);
        await viewer.mouse.wheel(0, -1200);
        await child.waitForFunction((before) => Math.abs(ScratchBlocks.getMainWorkspace().getFlyout().getWorkspace().scrollY - before) < 5, flyoutBefore);
        await replay.locator('.blocklyFlyout [data-id="motion_movesteps"]').waitFor({ state: 'visible' });
        await viewer.waitForTimeout(300);
        const block = await replay.locator('.blocklyFlyout [data-id="motion_movesteps"]').boundingBox();
        const workspace = await replay.locator('.blocklySvg').boundingBox();
        const blockCount = await child.evaluate(() => ScratchBlocks.getMainWorkspace().getTopBlocks().length);
        await viewer.mouse.move(block.x + 40, block.y + 20); await viewer.mouse.down();
        await viewer.mouse.move(workspace.x + workspace.width * .6, block.y + 90, { steps: 16 });
        await viewer.mouse.up();
        await child.waitForFunction((before) => ScratchBlocks.getMainWorkspace().getTopBlocks().length > before, blockCount);
        // Pin a real right-button mark to a real Scratch block. Scratch scrolls
        // this workspace via SVG transforms, so window-scroll offsets alone
        // cannot keep either the mark or its label attached.
        await child.waitForFunction((before) => ReduxStore.getState().scratchGui.vm.editingTarget.blocks.getScripts().length > before, blockCount);
        const markedBlockId = await child.evaluate(() => ReduxStore.getState().scratchGui.vm.editingTarget.blocks.getScripts().at(-1));
        const markedBlockSelector = `.blocklyBlockCanvas [data-id="${markedBlockId}"]`;
        const markedBlock = replay.locator(markedBlockSelector).first();
        await markedBlock.waitFor({ state: 'visible' });
        const markedBounds = await markedBlock.boundingBox();
        await viewer.mouse.move(markedBounds.x + 8, markedBounds.y + 8);
        await viewer.mouse.down({ button: 'right' });
        await viewer.mouse.move(markedBounds.x + Math.min(65, markedBounds.width - 8), markedBounds.y + 13, { steps: 8 });
        await viewer.mouse.up({ button: 'right' });
        const teacherStroke = viewer.locator('[data-share-drawing-stroke]');
        await teacherStroke.waitFor();
        const strokeId = await teacherStroke.getAttribute('data-share-drawing-stroke');
        const strokeSelector = `[data-share-drawing-stroke="${strokeId}"]`;
        const noteSelector = `[data-share-drawing-note="${strokeId}"]`;
        await viewer.keyboard.press('Shift+Enter');
        await viewer.locator(`${noteSelector} [data-share-drawing-note-input]`).fill('看这里');
        await source.locator(strokeSelector).waitFor({ state: 'visible' });
        await source.waitForFunction((selector) => document.querySelector(`${selector} textarea`)?.value === '看这里', noteSelector);
        const anchor = await viewer.evaluate(() => drawingPackets.find(packet => packet.phase === 'start')?.anchor);
        assert.equal(anchor?.kind, 'dom'); assert.equal(anchor?.mode, 'svg');
        assert.equal(typeof anchor?.frameId, 'string', 'the anchor retains its controlled Scratch recorder epoch');
        const relativeBounds = async (page, target, selector) => {
            const [blockBounds, mark, note] = await Promise.all([target.boundingBox(), page.locator(selector).boundingBox(), page.locator(noteSelector).boundingBox()]);
            assert(blockBounds && mark && note, 'block, anchored mark and pinned label must remain visible');
            return { markX: mark.x - blockBounds.x, markY: mark.y - blockBounds.y,
                noteX: note.x - blockBounds.x, noteY: note.y - blockBounds.y };
        };
        const sourceBlock = child.locator(markedBlockSelector).first();
        const beforeMark = await relativeBounds(source, sourceBlock, strokeSelector);
        const beforeViewerMark = await relativeBounds(viewer, markedBlock, strokeSelector);
        const scrollBefore = await child.evaluate(() => ({ x: ScratchBlocks.getMainWorkspace().scrollX, y: ScratchBlocks.getMainWorkspace().scrollY }));
        await replay.locator('.blocklySvg').hover({ position: { x: 500, y: 350 } });
        await viewer.mouse.wheel(0, 75);
        await child.waitForFunction((before) => Math.abs(ScratchBlocks.getMainWorkspace().scrollY - before.y) > 20, scrollBefore);
        await viewer.waitForTimeout(450);
        const afterMark = await relativeBounds(source, sourceBlock, strokeSelector);
        const afterViewerMark = await relativeBounds(viewer, markedBlock, strokeSelector);
        for (const key of Object.keys(beforeMark)) {
            assert(Math.abs(afterMark[key] - beforeMark[key]) < 3, `learner ${key} follows transformed workspace content`);
            assert(Math.abs(afterViewerMark[key] - beforeViewerMark[key]) < 3, `teacher ${key} follows the same block at another DPR`);
            assert(Math.abs(afterMark[key] - afterViewerMark[key]) < 3, `both peers agree on ${key} in CSS pixels`);
        }
        await source.evaluate(() => { document.body.style.minHeight = '1800px'; window.scrollTo(0, 900); });
        await source.waitForTimeout(350);
        await source.locator(noteSelector).waitFor({ state: 'hidden' });
        await source.locator(strokeSelector).waitFor({ state: 'hidden' });
        assert.equal(await source.locator('#source').getAttribute('data-live-share-frame'), anchor.frameId,
            'scrolling an opaque frame offscreen must not invalidate pinned anchors');
        await source.evaluate(() => window.scrollTo(0, 0));
        await source.locator(noteSelector).waitFor({ state: 'visible' });
        await viewer.waitForTimeout(350);
        const returnedMark = await relativeBounds(source, sourceBlock, strokeSelector);
        for (const key of Object.keys(beforeMark)) assert(Math.abs(returnedMark[key] - beforeMark[key]) < 3,
            `returning to the iframe restores anchored ${key}`);
        // Removed identities and old frame epochs cannot resolve to unrelated
        // content, and a peer cannot request arbitrary DOM selectors.
        assert.equal(await source.evaluate((reference) => sourceFrames.getDrawingGeometry({ ...reference, frameId: 'expired-frame-1234' }), anchor), null);
        await source.evaluate((frameId) => {
            window.geometryProbe = [];
            window.addEventListener('message', (event) => {
                if (event.source === document.querySelector('#source').contentWindow && event.origin === 'null'
                    && event.data?.type === 'live-share-frame-geometry' && event.data.nodeId === 2147483000) geometryProbe.push(event.data);
            });
            const target = document.querySelector('#source').contentWindow;
            const request = { type: 'live-share-capture', action: 'geometry', channel: 'real-scratch-channel-1234', id: frameId, nodeId: 2147483000, mode: 'svg' };
            target.postMessage({ ...request, channel: 'wrong-channel-1234' }, '*');
            target.postMessage({ ...request, id: 'expired-frame-1234' }, '*');
            target.postMessage({ ...request, mode: 'selector' }, '*');
        }, anchor.frameId);
        await source.waitForTimeout(120);
        assert.equal(await source.evaluate(() => geometryProbe.length), 0, 'invalid channels, epochs and geometry modes are ignored in the opaque child');
        await source.evaluate((frameId) => document.querySelector('#source').contentWindow.postMessage({
            type: 'live-share-capture', action: 'geometry', channel: 'real-scratch-channel-1234', id: frameId, nodeId: 2147483000, mode: 'svg',
        }, '*'), anchor.frameId);
        await source.waitForFunction(() => geometryProbe.length > 0);
        assert.equal(await source.evaluate(() => geometryProbe[0].geometry), null, 'unrecorded nodes produce no geometry');
        await viewer.locator(`${noteSelector} [data-share-drawing-note-delete]`).click();
        await source.locator(strokeSelector).waitFor({ state: 'detached' });
        // Set up a small deterministic learner project, then start/stop it only
        // through the teacher's real green-flag and stop buttons.
        await child.evaluate(() => {
            const vm = ReduxStore.getState().scratchGui.vm; const blocks = vm.editingTarget.blocks;
            blocks.createBlock({ id: 'remote-flag', opcode: 'event_whenflagclicked', next: 'remote-loop', parent: null, topLevel: true, shadow: false, inputs: {}, fields: {}, x: 120, y: 120 });
            blocks.createBlock({ id: 'remote-loop', opcode: 'control_forever', next: null, parent: 'remote-flag', topLevel: false, shadow: false, inputs: { SUBSTACK: { name: 'SUBSTACK', block: 'remote-move', shadow: null } }, fields: {} });
            blocks.createBlock({ id: 'remote-move', opcode: 'motion_movesteps', next: null, parent: 'remote-loop', topLevel: false, shadow: false, inputs: { STEPS: { name: 'STEPS', block: 'remote-num', shadow: 'remote-num' } }, fields: {} });
            blocks.createBlock({ id: 'remote-num', opcode: 'math_number', next: null, parent: 'remote-move', topLevel: false, shadow: true, inputs: {}, fields: { NUM: { name: 'NUM', value: '5' } } });
            vm.emitWorkspaceUpdate();
        });
        const xBefore = await child.evaluate(() => ReduxStore.getState().scratchGui.vm.editingTarget.x);
        const rasterBeforeRun = await replay.locator('[data-test-real-stage]').evaluate(node => node.style.backgroundImage);
        await replay.locator('img[title="运行"]').click();
        await child.waitForFunction((before) => Math.abs(ReduxStore.getState().scratchGui.vm.editingTarget.x - before) > 50, xBefore);
        await viewer.waitForFunction((before) => {
            const node = document.querySelector('[data-live-share-frame-viewer] iframe')?.contentDocument?.querySelector('[data-test-real-stage]');
            return node?.style.backgroundImage.includes('data:image/') && node.style.backgroundImage !== before;
        }, rasterBeforeRun);
        assert(await child.evaluate(() => ReduxStore.getState().scratchGui.vm.runtime.threads.length > 0), 'the real project is still running');
        await replay.locator('img[title="停止"]').click();
        await child.waitForFunction(() => ReduxStore.getState().scratchGui.vm.runtime.threads.length === 0);
        await source.waitForFunction(() => acks.length > 10);
        assert.equal(await source.evaluate(() => acks.some(ack => !ack.ok)), false, 'real Scratch gestures are accepted by the current source');
        assert.equal(await replay.locator('script').count(), 0);
        assert.equal(await viewer.locator('[data-live-share-frame-viewer] iframe').getAttribute('sandbox'), 'allow-same-origin');
        assert.equal(await viewer.locator('#teacher-draft').textContent(), 'teacher own page');
        assert(requests.includes(prebuiltCapture ? preparedBridge : '/scratch-editor/test-capture.js'),
            'capture bridge loads using anonymous opaque-origin CORS');
        assert(packets.some((packet) => packet.type === 'frame'), 'actual Scratch produces a nested display stream');
        assert.equal(pumpError, undefined, `all actual renderer packets must respect protocol/rate budgets: ${pumpError?.message}`);
        assert.deepEqual(badResponses, []);
        assert.deepEqual(errors, []);
        if (process.env.LIVE_SHARE_SCREENSHOTS === '1') {
            await source.screenshot({ path: path.join(os.tmpdir(), 'live-share-real-scratch-source.png') });
            await viewer.screenshot({ path: path.join(os.tmpdir(), 'live-share-real-scratch-viewer.png') });
        }
    } finally {
        clearInterval(pump);
        await context.close(); await viewerContext.close(); await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
});
