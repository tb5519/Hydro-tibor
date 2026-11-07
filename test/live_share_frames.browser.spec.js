const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { before, after, it } = require('node:test');
const { build, buildSync, transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Local test runtime. */ }
}
const executablePath = [playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
const protocolModule = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/live_share.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: protocolModule, exports: protocolModule.exports, require, URL, Buffer });
let browser;
let server;
let origin;

before(async () => {
    assert(executablePath, 'Chromium is required for opaque iframe integration tests');
    const options = { absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
        loader: { '.css': 'empty', '.ttf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } };
    const parentBundle = buildSync({ ...options, globalName: 'FrameAdapters', stdin: { resolveDir: root, contents: `
        export * from './packages/ui-default/components/live_share/frames';
        export * from './packages/ui-default/components/live_share/mirror';
    ` } }).outputFiles[0].text;
    const childBundle = (await build({ ...options, entryPoints: ['packages/ui-default/components/live_share/frame_capture.ts'],
        plugins: [{ name: 'capture-only', setup(build) {
            build.onResolve({ filter: /^\.\/vendor$/ }, (args) => args.importer.endsWith('/mirror.ts')
                ? { path: path.join(root, 'packages/ui-default/components/live_share/capture_vendor.js') } : undefined);
        } }],
    })).outputFiles[0].text;
    server = http.createServer((request, response) => {
        const url = new URL(request.url, origin || 'http://localhost');
        if (url.pathname === '/parent.js' || url.pathname === '/capture.js') {
            response.setHeader('Content-Type', 'application/javascript'); response.end(url.pathname === '/parent.js' ? parentBundle : childBundle); return;
        }
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (url.pathname === '/scratch-editor/editor.html') {
            response.end(`<!doctype html><html><head><style>html,body{margin:0;background:#eaf1fb}#workspace{display:flex;padding:24px;gap:20px;font:20px system-ui}svg{background:#fff;width:300px;height:250px}canvas{width:240px;height:180px;background:white}</style></head><body>
                <div id="workspace"><svg xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="200" height="44" fill="#ffab19" rx="8"/><text id="block" x="20" y="40">重复执行 10 次</text></svg>
                <canvas id="stage" width="240" height="180"></canvas><img id="sprite" width="48" height="48"><img id="vector-icon" width="32" height="32"></div>
                <input id="project-title" value="我的小猫作品"><input id="sprite-x" type="number" value="35">
                <button id="save" onclick="window.saved=true">保存作品</button>
                <ul><li class="menu_menu-item_fixture" onclick="window.saved=true">新建</li><li class="menu_menu-item_fixture" onclick="window.saved=true">从电脑加载</li></ul>
                <input type="password" id="secret-password" value="child-password-must-not-leak">
                <script>window.childScriptsRan=1;window.draw=(color)=>{const c=document.getElementById('stage').getContext('2d');c.fillStyle=color;c.fillRect(0,0,240,180)};draw('#ff9f19');
                const iconSvg='<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#855cd6"/></svg>';
                const icon=new Blob([iconSvg],{type:'image/svg+xml'});document.getElementById('sprite').src=URL.createObjectURL(icon);
                document.getElementById('vector-icon').src='data:image/svg+xml,'+encodeURIComponent(iconSvg);</script>
                <script src="/capture.js"></script></body></html>`); return;
        }
        response.end(`<!doctype html><html><head><style>body{margin:0}#source{position:absolute;left:30px;top:60px;width:700px;height:400px;border:0}#viewer{position:absolute;inset:0;pointer-events:none}</style></head><body>
            ${url.pathname === '/source' ? '<h1>Scratch 学员页面</h1><iframe id="source" sandbox="allow-scripts" src="/scratch-editor/editor.html#channel=fixture-channel-123456"></iframe>' : '<h1>老师原页面</h1>'}
            <div id="viewer"></div><script src="/parent.js"></script><script>window.outbox=[];window.childMessages=[];
            window.addEventListener('message',e=>{if(e.data?.type==='live-share-frame')childMessages.push(e.data)});window.ready=true;</script></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

async function pair(t, control = false) {
    const context = await browser.newContext({ viewport: { width: 900, height: 650 } });
    t.after(() => context.close());
    const source = await context.newPage();
    const viewer = await context.newPage();
    const errors = [];
    for (const page of [source, viewer]) page.on('pageerror', (error) => errors.push(error.message));
    t.after(() => assert.deepEqual(errors, []));
    await Promise.all([source.goto(`${origin}/source`), viewer.goto(`${origin}/viewer`)]);
    await Promise.all([source.waitForFunction(() => window.ready), viewer.waitForFunction(() => window.ready)]);
    const child = source.frames().find((frame) => frame.url().includes('/scratch-editor/editor.html'));
    await child.waitForFunction(() => !!window.draw);
    await source.evaluate(() => {
        window.acks = []; window.sourceFrames = FrameAdapters.attachSourceFrames({ pageId: 'fixture-page', send: (data) => outbox.push(data), sendAck: (ack) => acks.push(ack) });
        window.sourceMirror = FrameAdapters.attachSourceMirror({ pageId: 'fixture-page', send: (data) => outbox.push(data) });
    });
    await viewer.evaluate((control) => {
        window.commands = []; window.commandHistory = [];
        const container = document.getElementById('viewer');
        window.viewerMirror = FrameAdapters.attachViewerMirror({ pageId: 'fixture-page', container, sendCommand: () => {} });
        window.viewerFrames = FrameAdapters.attachViewerFrames({ pageId: 'fixture-page', container, getNodeRect: (id) => viewerMirror.getFrameRect(id), sendCommand: control ? (command) => { commands.push(command); commandHistory.push(command); } : undefined });
        window.receive = (data) => (data.type === 'frame' || data.type === 'frame-remove' ? viewerFrames : viewerMirror).receive(data);
    }, control);
    const flush = async (rounds = 5) => {
        for (let round = 0; round < rounds; round++) {
            await new Promise((resolve) => setTimeout(resolve, 160));
            const packets = await source.evaluate(() => outbox.splice(0));
            for (const data of packets) protocolModule.exports.validateRelayData('student', 'mirror', data, 'fixture-page');
            await viewer.evaluate((items) => items.forEach(receive), packets);
            const commands = await viewer.evaluate(() => window.commands.splice(0));
            for (const command of commands) protocolModule.exports.validateRelayData('teacher', 'command', command, 'fixture-page');
            await source.evaluate((items) => items.forEach(command => sourceFrames.receiveCommand(command)), commands);
        }
    };
    await flush();
    return { source, viewer, child, flush };
}

it('captures opaque Scratch SVG/DOM through the controlled bridge and replays it inertly inside its parent frame', { timeout: 45000 }, async (t) => {
    const { source, viewer, child, flush } = await pair(t);
    const nested = viewer.frameLocator('[data-live-share-frame-viewer] iframe');
    await nested.locator('#block').filter({ hasText: '重复执行 10 次' }).waitFor({ timeout: 5000 });
    assert.equal(await child.evaluate(() => window.origin), 'null', 'source sandbox remains opaque');
    assert.equal(await source.locator('#source').getAttribute('sandbox'), 'allow-scripts');
    assert.equal(await viewer.locator('[data-live-share-frame-viewer] iframe').getAttribute('sandbox'), 'allow-same-origin');
    assert.equal(await nested.locator('script').count(), 0, 'source scripts are never replayed');
    assert.equal(await nested.locator('input[type=password]').count(), 0, 'password field is masked');
    assert.equal(await nested.locator('body').textContent().then((text) => text.includes('child-password-must-not-leak')), false);
    assert.equal(await nested.locator('#project-title').inputValue(), '我的小猫作品');
    assert.equal(await nested.locator('#sprite-x').inputValue(), '35');
    await flush();
    for (let attempt = 0; attempt < 15; attempt++) {
        if (await nested.locator('#stage').evaluate(node => node.style.backgroundImage.includes('data:image/'))) break;
        await flush(1);
    }
    const stageRaster = await nested.locator('#stage').evaluate((node) => node.style.backgroundImage);
    assert(stageRaster.includes('data:image/'), 'the opaque child stage is replayed as raster pixels');
    // Losing the first raster during replay initialization must not leave a
    // motionless project blank forever. Its bounded periodic refresh restores it.
    await nested.locator('#stage').evaluate(node => { node.style.backgroundImage = ''; });
    for (let attempt = 0; attempt < 20; attempt++) {
        await flush(1);
        if (await nested.locator('#stage').evaluate(node => node.style.backgroundImage.includes('data:image/'))) break;
    }
    assert.equal(await nested.locator('#stage').evaluate(node => node.style.backgroundImage), stageRaster);
    assert.match(await nested.locator('#sprite').getAttribute('src'), /^data:image\//, 'blob:null sprite thumbnails become bounded raster images');
    assert.match(await nested.locator('#vector-icon').getAttribute('src'), /^data:image\/(?:webp|png|jpeg);base64,/, 'inline SVG icons are converted to inert raster images');
    await child.evaluate(() => { document.getElementById('block').textContent = '重复执行 25 次'; });
    await child.evaluate(() => draw('#2255ff'));
    await flush();
    await nested.locator('#block').filter({ hasText: '重复执行 25 次' }).waitFor();
    assert.notEqual(await nested.locator('#stage').evaluate((node) => node.style.backgroundImage), stageRaster);
    const sourceRect = await source.locator('#source').boundingBox();
    const viewerRect = await viewer.locator('[data-live-share-frame-viewer]').boundingBox();
    assert.deepEqual(viewerRect, sourceRect);
    await source.evaluate(() => { document.getElementById('source').style.top = '180px'; });
    await flush();
    assert.equal((await viewer.locator('[data-live-share-frame-viewer]').boundingBox()).y, 180);
});

it('rejects wrong source/channel capture messages, stops on disconnect, and removes stale iframe recordings', { timeout: 45000 }, async (t) => {
    const { source, viewer, child, flush } = await pair(t);
    await viewer.frameLocator('[data-live-share-frame-viewer] iframe').locator('#block').waitFor();
    const id = await source.locator('#source').getAttribute('data-live-share-frame');
    const forged = { type: 'rrweb', sequence: 999, event: { type: 4, timestamp: Date.now(), data: { width: 1, height: 1, href: origin } } };
    await source.evaluate(({ id, forged }) => {
        outbox.length = 0;
        window.postMessage({ type: 'live-share-frame', channel: 'fixture-channel-123456', id, packet: forged }, '*');
    }, { id, forged });
    await child.evaluate(({ id, forged }) => parent.postMessage({ type: 'live-share-frame', channel: 'wrong-channel', id, packet: forged }, '*'), { id, forged });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(await source.evaluate(() => outbox.some((item) => item.type === 'frame' && item.packet.sequence === 999)), false);
    await source.evaluate(() => { sourceFrames.setConnected(false); childMessages.length = 0; outbox.length = 0; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await child.evaluate(() => { document.getElementById('block').textContent = '断开后修改'; });
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(await source.evaluate(() => childMessages.length), 0);
    await source.evaluate(() => sourceFrames.setConnected(true));
    await viewer.evaluate(() => { viewerFrames.setConnected(false); viewerFrames.setConnected(true); });
    await flush();
    await viewer.frameLocator('[data-live-share-frame-viewer] iframe').locator('#block').filter({ hasText: '断开后修改' }).waitFor();
    await child.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        document.getElementById('block').textContent = '返回缓存页面后继续';
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await source.evaluate(() => sourceFrames.snapshot());
    await flush();
    await viewer.frameLocator('[data-live-share-frame-viewer] iframe').locator('#block').filter({ hasText: '返回缓存页面后继续' }).waitFor();
    await source.evaluate(() => document.getElementById('source').remove());
    await flush();
    assert.equal(await viewer.locator('[data-live-share-frame-viewer]').count(), 0);
});

it('capture lease expires if parent keepalives stop even when the child page keeps running', { timeout: 45000 }, async (t) => {
    const { source, viewer, child, flush } = await pair(t);
    await flush();
    await child.evaluate(() => { window.originalNow = Date.now; Date.now = () => originalNow() + 15000; });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await source.evaluate(() => { childMessages.length = 0; });
    await child.evaluate(() => { document.getElementById('block').textContent = '租约过期后的修改'; });
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(await source.evaluate(() => childMessages.length), 0);
    await child.evaluate(() => { Date.now = originalNow; });
    await source.evaluate(() => sourceFrames.snapshot());
    await flush();
    assert(await source.evaluate(() => childMessages.length > 0), 'a renewed authenticated request resumes capture');
    await viewer.frameLocator('[data-live-share-frame-viewer] iframe').locator('#block').filter({ hasText: '租约过期后的修改' }).waitFor();
    await source.evaluate(() => { outbox.length = 0; sourceFrames.dispose(); });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(await source.evaluate(() => outbox.some((message) => message.type === 'frame-remove')), false,
        'disposing after session end must not relay into a closed room');
    assert.equal(await source.locator('#source').getAttribute('data-live-share-frame'), null);
    await source.evaluate(() => { childMessages.length = 0; });
    await child.evaluate(() => { document.getElementById('block').textContent = '停止共享后不再采集'; });
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(await source.evaluate(() => childMessages.length), 0);
});


it('routes only current opaque-frame controls and rejects stale epochs after disconnect or lease renewal', { timeout: 45000 }, async (t) => {
    const { source, viewer, child, flush } = await pair(t, true);
    let nested = viewer.frameLocator('[data-live-share-frame-viewer] iframe');
    await nested.locator('#project-title').fill('一起修改作品'); await flush();
    assert.equal(await child.locator('#project-title').inputValue(), '一起修改作品');
    await nested.locator('#save').click();
    await nested.getByText('新建', { exact: true }).click(); await nested.getByText('从电脑加载', { exact: true }).click(); await flush(2);
    assert.equal(await child.evaluate(() => !!window.saved), false, 'persistence buttons stay local');
    const oldCommand = await viewer.evaluate(() => commandHistory.find(command => command.command.input.type === 'text'));
    assert(oldCommand); const oldId = oldCommand.frameId;
    await source.evaluate(() => sourceFrames.setConnected(false));
    await source.evaluate((command) => sourceFrames.receiveCommand(command), { ...oldCommand, id: 'after-disconnect' });
    assert.equal(await source.evaluate(() => acks.at(-1).ok), false);
    await source.evaluate(() => sourceFrames.setConnected(true)); await flush();
    assert.notEqual(await source.locator('#source').getAttribute('data-live-share-frame'), oldId);
    await source.evaluate((command) => sourceFrames.receiveCommand(command), { ...oldCommand, id: 'old-after-resume' });
    assert.equal(await source.evaluate(() => acks.at(-1).ok), false);
    const resumedId = await source.locator('#source').getAttribute('data-live-share-frame');
    await child.evaluate(() => { window.originalNow = Date.now; Date.now = () => originalNow() + 15000; });
    await source.waitForTimeout(1100);
    await child.evaluate(() => { Date.now = originalNow; });
    await source.evaluate(() => sourceFrames.snapshot()); await flush();
    assert.notEqual(await source.locator('#source').getAttribute('data-live-share-frame'), resumedId,
        'a new recorder receives a fresh command epoch after lease expiry');
    assert.equal(await child.locator('#project-title').inputValue(), '一起修改作品');
});

it('allows local teacher drawing in opaque Scratch only through the authenticated leased parent bridge', { timeout: 45000 }, async (t) => {
    const { source, child } = await pair(t);
    const send = (message) => source.evaluate((message) => document.getElementById('source').contentWindow.postMessage(message, '*'), message);
    const message = { type: 'live-share-local-drawing', channel: 'fixture-channel-123456', enabled: true };
    await send({ ...message, channel: 'wrong-channel' }); await source.waitForTimeout(100);
    assert.equal(await child.locator('[data-share-drawing]').count(), 0);
    await child.evaluate((message) => window.postMessage(message, '*'), message); await source.waitForTimeout(100);
    assert.equal(await child.locator('[data-share-drawing]').count(), 0, 'a child cannot impersonate its parent');
    await send(message); await child.locator('[data-share-drawing]').waitFor();
    await source.mouse.move(130, 160); await source.mouse.down({ button: 'right' });
    await source.mouse.move(230, 220, { steps: 8 }); await source.mouse.up({ button: 'right' });
    assert.equal(await child.locator('[data-share-drawing-stroke]').count(), 1);
    await send({ ...message, enabled: false }); await child.locator('[data-share-drawing]').waitFor({ state: 'detached' });
    await send(message); await child.locator('[data-share-drawing]').waitFor();
    await child.evaluate(() => { window.originalNow = Date.now; Date.now = () => originalNow() + 15000; });
    await child.locator('[data-share-drawing]').waitFor({ state: 'detached', timeout: 3000 });
    await child.evaluate(() => { Date.now = originalNow; });
});
