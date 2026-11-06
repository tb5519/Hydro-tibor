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
            <div id="viewer"></div><script src="/test-parent.js"></script><script>
            window.outbox=[];window.childLoaded=false;window.projectEvents=[];
            window.addEventListener('message', e=>{if(e.source!==document.querySelector('#source')?.contentWindow||e.origin!=='null'||e.data?.channel!=='real-scratch-channel-1234')return;
                if(e.data.type==='dirty'||e.data.type==='runState')window.projectEvents.push(e.data.type);
                if(e.data.type==='ready')e.source.postMessage({type:'init',channel:e.data.channel,mode:'editor',readOnly:false,title:'真实课堂作品'},'*');
                if(e.data.type==='loaded')window.childLoaded=true;});window.ready=true;</script></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await playwright.chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const source = await context.newPage(); const viewer = await context.newPage();
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
            window.viewerFrames = FrameAdapters.attachViewerFrames({ pageId: 'runtime-page', container, getNodeRect: (id) => viewerMirror.getFrameRect(id) });
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
            } catch (error) { pumpError = error; } finally { busy = false; }
        }, 80);
        await source.evaluate(() => {
            window.sourceFrames = FrameAdapters.attachSourceFrames({ pageId: 'runtime-page', send: (data) => outbox.push(data) });
            window.sourceMirror = FrameAdapters.attachSourceMirror({ pageId: 'runtime-page', send: (data) => outbox.push(data) });
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
        await context.close(); await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
});
