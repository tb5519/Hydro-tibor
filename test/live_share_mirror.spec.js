const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const runtime = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const playwright = require(runtime);
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((candidate) => candidate && fs.existsSync(candidate));
let browser;
let script;
let splitterScript;
let splitterCss;
before(async () => {
    assert(executablePath, 'Chromium is required for live sharing interaction tests');
    const result = await esbuild.build({ entryPoints: [path.join(root, 'packages/ui-default/components/live_share/mirror.ts')],
        bundle: true, format: 'iife', globalName: 'Mirror', write: false, loader: { '.css': 'empty' },
        plugins: [{ name: 'mirror-vendor', setup(build) {
            build.onResolve({ filter: /^\.\/vendor$/ }, () => ({ path: 'mirror-vendor', namespace: 'test' }));
            build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
                contents: `export { record, Replayer } from ${JSON.stringify(path.join(root, 'build/live-share/node_modules/rrweb/dist/rrweb.js'))};`,
                resolveDir: root,
            }));
        } }],
    });
    script = result.outputFiles[0].text;
    // Render the installed Allotment implementation: sash ancestry and its
    // imperative resize behavior must not be substituted with a test DOM stub.
    splitterScript = (await esbuild.build({ stdin: { resolveDir: root, contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { Allotment } from 'allotment';
        import { attachSharedSplitter } from './packages/ui-default/components/live_share/splitter';
        const columns = React.createRef(), rows = React.createRef();
        const root = document.querySelector('#scratchpad');
        root.style.cssText = 'position:fixed;inset:80px 40px 40px;z-index:2;background:white';
        const app = createRoot(root), h = React.createElement;
        app.render(h(Allotment, { ref: columns, className:'live-share-split-columns', defaultSizes:[50,350,520] },
            h(Allotment.Pane, { minSize:50,maxSize:50 }, '菜单'),
            h(Allotment.Pane, { minSize:100 }, '题目正文'),
            h(Allotment.Pane, { minSize:150 }, h(Allotment, { ref:rows, className:'live-share-split-rows', vertical:true, defaultSizes:[300,140,140] },
                h(Allotment.Pane, { minSize:80 }, '编辑器'),
                h(Allotment.Pane, { minSize:60 }, '测试输入'),
                h(Allotment.Pane, { minSize:60 }, '运行结果')))));
        const stop = attachSharedSplitter(root, (axis, sizes) => (axis==='columns'?columns:rows).current?.resize(sizes));
        window.disposeSplit = () => { stop(); app.unmount(); };
    ` }, bundle: true, format: 'iife', write: false, define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
    splitterCss = fs.readFileSync(require.resolve('allotment/dist/style.css'), 'utf8');
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

async function fixture({ latency = 0, editorMarkup = '', inlineLocalImages = false, showNonSensitiveInputs = false, videoData = null,
    viewGestures = false, teacherDpr = 1, studentDpr = 1, splitPanes = false } = {}) {
    const studentContext = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: studentDpr });
    const teacherContext = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: teacherDpr });
    const student = await studentContext.newPage();
    const teacher = await teacherContext.newPage();
    student.setDefaultTimeout(7000); teacher.setDefaultTimeout(7000);
    const packets = [];
    const commands = [];
    const acks = [];
    const errors = [];
    let studentReady = false;
    student.on('pageerror', (e) => errors.push(`student: ${e.message}`));
    teacher.on('pageerror', (e) => errors.push(`teacher: ${e.message}`));
    for (const context of [studentContext, teacherContext]) {
        await context.route('https://sharing.test/**', async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            if (pathname === '/sample.webm' && videoData) {
                const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
                const start = range ? Number(range[1]) : 0;
                const end = range?.[2] ? Math.min(Number(range[2]), videoData.length - 1) : videoData.length - 1;
                return route.fulfill({ status: range ? 206 : 200, contentType: 'video/webm', body: videoData.subarray(start, end + 1),
                    headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${videoData.length}` } : {}) } });
            }
            const teacherPage = pathname === '/teacher';
            const body = teacherPage ? '<textarea id="teacher-draft">teacher own code</textarea><main id="mirror" style="position:relative;width:1000px;height:700px"></main>' : `
                ${editorMarkup}<header>OneByOne</header><h1 id="title">学生正在练习</h1>
                <a id="next" href="/d/C0001/p/P2">下一道题</a>
                <a id="profile" href="/user/28">个人主页</a><a id="personal-center" href="/home/profile">个人中心</a>
                <a id="contest-detail" href="/d/C0001/contest/recent/clarification">比赛详情</a>
                <a id="open-editor" href="javascript:;" name="problem-sidebar__open-scratchpad" onclick="window.opens++">进入在线编程</a>
                <a id="evil-link" href="/d/C0001/manage">控制面板</a>
                <button id="unknown" type="button" onclick="window.saves++">保存修改</button>
                <div id="scratchpad"><div class="scratchpad__toolbar__language"><select id="lang"><option value="py">Python</option><option value="cpp">C++</option></select></div>
                <button id="run" type="button" class="scratchpad__toolbar__pretest" onclick="window.runs++;document.querySelector('#result').textContent='运行 '+window.runs">运行</button>
                <button id="submit" type="button" class="scratchpad__toolbar__submit" onclick="window.submits++">提交</button><p id="result">未运行</p></div>
                <div data-live-share-editor="editor-one" style="height:140px"><div class="monaco-editor">private unsaved code managed separately</div></div>
                <input type="password" value="student password"><input type="hidden" value="csrf secret">
                <div data-private>private account data</div><aside data-live-share-ui>正在共享 <button>断开</button></aside>
                <iframe srcdoc="<p>inner secret</p>"></iframe>
                <form method="get" action="/d/C0001/p"><input id="search" type="search" name="q" value=""><button>查找</button></form>
                <div id="nested" style="height:180px;overflow:auto"><div id="nested-content" style="height:1200px;width:1400px">独立滚动内容</div></div><div id="long" style="height:1600px">学习内容</div><p id="bottom">底部</p>
                <script>window.runs=0;window.submits=0;window.saves=0;window.opens=0;window.sourceScriptRan=true;document.querySelector('#lang').addEventListener('change',e=>document.body.dataset.language=e.target.value)</script>`;
            return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px system-ui;background:#f1f5f9}header{background:white;padding:18px}h1{font-size:24px}button,a,select{margin:8px;padding:8px}#mirror{background:white}</style></head><body>${body}<script>${script}</script></body></html>` });
        });
    }
    await teacher.goto('https://sharing.test/teacher');
    await student.goto('https://sharing.test/d/C0001/p/P1');
    if (splitPanes) {
        await student.addStyleTag({ content: splitterCss });
        await student.addScriptTag({ content: splitterScript });
        await student.waitForFunction(() => document.querySelectorAll('#scratchpad .sash').length === 4
            && document.querySelector('.live-share-split-rows').getBoundingClientRect().height > 500);
    }
    await teacher.exposeFunction('sendCommand', async (data) => {
        commands.push(data);
        if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
        if (studentReady) await student.evaluate((value) => window.source.receiveCommand(value), data);
    });
    await teacher.evaluate((viewGestures) => {
        window.statuses = [];
        window.viewZooms = []; window.viewPans = [];
        window.viewer = Mirror.attachViewerMirror({ pageId: 'page-1', container: document.querySelector('#mirror'),
            ...(viewGestures ? {
                onViewZoom: (data) => { window.viewZooms.push(data); window.onViewZoomHook?.(data); },
                onViewPan: (data) => { window.viewPans.push(data); window.onViewPanHook?.(data); },
            } : {}),
            sendCommand: (data) => window.sendCommand(data), onStatus: (message) => window.statuses.push(message) });
    }, viewGestures);
    await student.exposeFunction('sendPacket', async (data) => {
        packets.push(data);
        if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
        await teacher.evaluate((value) => window.viewer.receive(value), data);
    });
    await student.exposeFunction('sendAck', (data) => { acks.push(data); });
    await student.evaluate(({ inlineLocalImages, showNonSensitiveInputs }) => {
        window.statuses = [];
        window.source = Mirror.attachSourceMirror({ pageId: 'page-1', inlineLocalImages, showNonSensitiveInputs, send: (data) => window.sendPacket(data),
            beforeRasterCapture: (canvas) => window.drawBeforeCapture?.(canvas),
            sendAck: (data) => window.sendAck(data), onStatus: (message) => window.statuses.push(message) });
    }, { inlineLocalImages, showNonSensitiveInputs });
    studentReady = true;
    await teacher.frameLocator('#mirror iframe').locator('#title').waitFor();
    const close = async () => {
        studentReady = false;
        await Promise.allSettled([student.evaluate(() => { window.source?.dispose(); window.disposeSplit?.(); }), teacher.evaluate(() => window.viewer?.dispose())]);
        await studentContext.close(); await teacherContext.close();
    };
    return { student, teacher, packets, commands, acks, errors, close,
        frame: () => teacher.frameLocator('#mirror iframe') };
}

it('real Allotment column and row dividers resize from either peer and reject stale, disabled, private or forged targets', { timeout: 35000 }, async () => {
    const f = await fixture({ splitPanes: true, latency: 25, teacherDpr: 2 });
    const columnSash = '.live-share-split-columns > .sash-container > .sash:nth-child(2)';
    const rowSash = '.live-share-split-rows > .sash-container > .sash:nth-child(1)';
    const columnPane = '.live-share-split-columns > .split-view-container > .split-view-view:nth-child(2)';
    const rowPane = '.live-share-split-rows > .split-view-container > .split-view-view:nth-child(1)';
    const dimension = async (page, selector, vertical = false) => page.locator(selector).evaluate((node, vertical) => {
        const rect = node.getBoundingClientRect(); return vertical ? rect.height : rect.width;
    }, vertical);
    try {
        await f.frame().locator(columnSash).waitFor();
        const input = await f.teacher.context().newCDPSession(f.teacher);
        async function teacherDrag(selector, dx, dy, duringDrag) {
            const box = await f.frame().locator(selector).boundingBox();
            const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            await f.teacher.mouse.move(start.x, start.y); await f.teacher.mouse.down();
            // A sandbox replay cannot run Playwright's injected drag-detection
            // timer, so send the same trusted native mouse movement via CDP.
            for (let step = 1; step <= 8; step++) await input.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved', button: 'left', buttons: 1, x: start.x + dx * step / 8, y: start.y + dy * step / 8,
            });
            if (duringDrag) await duringDrag();
            await f.teacher.mouse.up();
        }
        for (const [sash, pane, vertical, delta] of [[columnSash, columnPane, false, 85], [rowSash, rowPane, true, 65]]) {
            const before = await dimension(f.student, pane, vertical);
            await teacherDrag(sash, vertical ? 0 : delta, vertical ? delta : 0, async () => {
                await f.student.waitForFunction(({ pane, vertical, before }) => {
                    const box = document.querySelector(pane).getBoundingClientRect();
                    return (vertical ? box.height : box.width) > before + 40;
                }, { pane, vertical, before });
            });
            await f.teacher.waitForFunction(({ pane, vertical, expected }) => {
                const box = document.querySelector('#mirror iframe').contentDocument.querySelector(pane).getBoundingClientRect();
                return Math.abs((vertical ? box.height : box.width) - expected) < 3;
            }, { pane, vertical, expected: before + delta });
            assert(Math.abs(await dimension(f.student, pane, vertical) - before - delta) < 3,
                `${vertical ? 'row' : 'column'} dragging reaches the intended position before release`);
        }
        const oldWidth = await dimension(f.student, columnPane);
        const sourceSash = await f.student.locator(columnSash).boundingBox();
        await f.student.mouse.move(sourceSash.x + sourceSash.width / 2, sourceSash.y + sourceSash.height / 2);
        await f.student.mouse.down();
        await f.student.mouse.move(sourceSash.x + sourceSash.width / 2 - 60, sourceSash.y + sourceSash.height / 2, { steps: 8 });
        await f.student.mouse.up();
        await f.teacher.waitForFunction(({ pane, expected }) => Math.abs(document.querySelector('#mirror iframe').contentDocument.querySelector(pane)
            .getBoundingClientRect().width - expected) < 3, { pane: columnPane, expected: oldWidth - 60 });
        assert(Math.abs(await dimension(f.student, columnPane) - oldWidth + 60) < 3, 'student native Allotment dragging remains unchanged');
        const valid = f.commands.filter((command) => command.action === 'resize').find((command) => command.x > 0.45);
        assert(valid, 'teacher sends a bounded resize command');
        for (const [id, patch] of [['forged-sash', { target: 'forged-target' }], ['stale-sash', { pageId: 'old-page' }], ['outside-ratio', { x: 1.5 }]]) {
            const ack = await f.student.evaluate(({ valid, id, patch }) => window.source.receiveCommand({ ...valid, id, ...patch }), { valid, id, patch });
            assert.equal(ack.ok, false, id);
        }
        await f.student.locator(columnSash).evaluate((sash) => sash.classList.add('sash-disabled'));
        const disabled = await f.student.evaluate((valid) => window.source.receiveCommand({ ...valid, id: 'disabled-sash' }), valid);
        assert.equal(disabled.ok, false);
        await f.student.locator(columnSash).evaluate((sash) => { sash.classList.remove('sash-disabled'); sash.parentElement.setAttribute('data-private', ''); });
        const privateAck = await f.student.evaluate((valid) => window.source.receiveCommand({ ...valid, id: 'private-sash' }), valid);
        assert.equal(privateAck.ok, false);
        assert.equal(await f.student.evaluate(() => window.saves), 0, 'resizing never invokes unrelated page actions');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('mirrors ordinary DOM changes, blocks private/editor content, and does not run student scripts in the replay', async () => {
    const f = await fixture();
    try {
        const frame = f.frame();
        assert.equal(await frame.locator('#title').textContent(), '学生正在练习');
        const recorded = JSON.stringify(f.packets);
        for (const secret of ['student password', 'csrf secret', 'private account data', 'private unsaved code managed separately', 'inner secret']) {
            assert(!recorded.includes(secret), `${secret} must not leave the student's page`);
        }
        assert.equal(await f.teacher.locator('#mirror iframe').getAttribute('sandbox'), 'allow-same-origin');
        assert.equal(await f.teacher.locator('#mirror iframe').evaluate((iframe) => iframe.contentWindow.sourceScriptRan), undefined);
        await f.student.evaluate(() => { document.querySelector('#title').textContent = '新的题目内容'; });
        await frame.locator('#title').getByText('新的题目内容', { exact: true }).waitFor();
        assert.equal(await f.teacher.locator('#teacher-draft').inputValue(), 'teacher own code');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('shares bounded 2D canvas rasters without mutating the source and never captures private canvases or TOTP secrets', async () => {
    const f = await fixture({ editorMarkup: '<canvas id="drawing" width="1600" height="1000" style="width:320px;height:200px"></canvas><div data-private><canvas id="private-drawing"></canvas></div><p id="secret">PRIVATE-TOTP-SECRET</p><canvas id="qrcode"></canvas>' });
    try {
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#drawing')?.style.backgroundImage.includes('data:image/'));
        const initialRaster = await f.frame().locator('#drawing').evaluate((node) => node.style.backgroundImage);
        const original = await f.student.evaluate(() => {
            const canvas = document.querySelector('#drawing');
            const context = canvas.getContext('2d');
            context.fillStyle = '#1266cc'; context.fillRect(0, 0, canvas.width, canvas.height);
            const privateCanvas = document.querySelector('#private-drawing');
            privateCanvas.getContext('2d').fillRect(0, 0, 100, 100);
            document.querySelector('#qrcode').getContext('2d').fillRect(0, 0, 100, 100);
            return canvas.getAttribute('style');
        });
        await f.teacher.waitForFunction((initial) => document.querySelector('#mirror iframe').contentDocument.querySelector('#drawing')?.style.backgroundImage !== initial, initialRaster);
        const image = await f.teacher.evaluate(async () => {
            const background = document.querySelector('#mirror iframe').contentDocument.querySelector('#drawing').style.backgroundImage;
            const src = background.slice(5, -2);
            const image = new Image(); image.src = src; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
            return { width: image.width, height: image.height, length: src.length, pixel: [...context.getImageData(20, 20, 1, 1).data] };
        });
        assert(image.width <= 960 && image.height <= 720 && image.length <= 48 * 1024);
        assert(image.pixel[2] > 180 && image.pixel[0] < 40, 'the replay receives the blue drawing pixels');
        assert.equal(await f.student.locator('#drawing').getAttribute('style'), original, 'source styles are untouched');
        const snapshotEvents = () => f.packets.flatMap((packet) => packet.events || (packet.event ? [packet.event] : []))
            .flatMap((event) => event.data?.attributes || []).filter((entry) => entry.attributes?.style?.['background-image']);
        const count = snapshotEvents().length;
        await f.teacher.waitForTimeout(950);
        assert.equal(snapshotEvents().length, count, 'unchanged drawing pixels are not retransmitted');
        assert(!JSON.stringify(f.packets).includes('PRIVATE-TOTP-SECRET'));
        assert.equal(await f.frame().locator('#private-drawing,#qrcode,#secret').count(), 0);
        await f.student.evaluate(() => {
            window.source.setConnected(false);
            const canvas = document.querySelector('#drawing');
            const context = canvas.getContext('2d'); context.fillStyle = '#ee2211'; context.fillRect(0, 0, canvas.width, canvas.height);
        });
        await f.teacher.waitForTimeout(500);
        assert.equal(snapshotEvents().length, count, 'disconnected pages stop sending raster frames');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

for (const mode of ['preserved', 'continuously rendered', 'redrawn before capture']) it(`captures ${mode} WebGL pixels without replaying WebGL commands`, async () => {
    const f = await fixture({ editorMarkup: '<canvas id="webgl" width="160" height="100"></canvas>' });
    try {
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#webgl')?.style.backgroundImage.includes('data:image/'));
        const initialRaster = await f.frame().locator('#webgl').evaluate((node) => node.style.backgroundImage);
        assert(await f.student.evaluate((mode) => {
            const canvas = document.querySelector('#webgl');
            const gl = canvas.getContext('webgl', { preserveDrawingBuffer: mode === 'preserved' });
            if (!gl) return false;
            const draw = () => {
                gl.clearColor(0.1, 0.8, 0.2, 1); gl.clear(gl.COLOR_BUFFER_BIT);
                if (mode === 'continuously rendered') requestAnimationFrame(draw);
            };
            if (mode === 'redrawn before capture') window.drawBeforeCapture = (target) => { if (target === canvas) draw(); };
            draw(); return true;
        }, mode), 'browser must provide WebGL for this regression');
        await f.teacher.waitForFunction((initial) => document.querySelector('#mirror iframe').contentDocument.querySelector('#webgl')?.style.backgroundImage !== initial, initialRaster);
        const pixel = await f.teacher.evaluate(async () => {
            const source = document.querySelector('#mirror iframe').contentDocument.querySelector('#webgl').style.backgroundImage.slice(5, -2);
            const image = new Image(); image.src = source; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100;
            const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
            return [...context.getImageData(20, 20, 1, 1).data];
        });
        assert(pixel[1] > 180 && pixel[0] < 50);
        assert(f.packets.flatMap((packet) => packet.events || [packet.event]).filter(Boolean).every((event) => event.data?.source !== 9));
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('optionally inlines blob thumbnails within the raster budget without exposing private images', async () => {
    const f = await fixture({ inlineLocalImages: true, editorMarkup: '<img id="thumbnail" width="80" height="60"><div data-private><img id="private-thumbnail"></div>' });
    try {
        await f.student.evaluate(async () => {
            const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
            const context = canvas.getContext('2d'); context.fillStyle = '#dd3322'; context.fillRect(0, 0, 80, 60);
            const url = URL.createObjectURL(await new Promise((resolve) => canvas.toBlob(resolve)));
            document.querySelector('#thumbnail').src = url; document.querySelector('#private-thumbnail').src = url;
        });
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#thumbnail')?.src.startsWith('data:image/'));
        assert((await f.student.locator('#thumbnail').getAttribute('src')).startsWith('blob:'), 'source blob URL is retained');
        assert.equal(await f.frame().locator('#private-thumbnail').count(), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('rasterizes controlled SVG icons and shows ordinary Scratch fields while masking private values', async () => {
    const icon = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#22aa44"/></svg>');
    const f = await fixture({ inlineLocalImages: true, showNonSensitiveInputs: true,
        editorMarkup: `<img id="svg-icon" width="24" height="24" src="data:image/svg+xml,${icon}"><input id="sprite-name" value="小猫角色"><input id="sprite-x" type="number" value="123"><input type="password" value="NEVER-SHARE-PASSWORD"><input name="tfa_code" value="NEVER-SHARE-TOTP"><div data-private><input value="NEVER-SHARE-PRIVATE"></div>` });
    try {
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#svg-icon')?.src.startsWith('data:image/webp'));
        assert.equal(await f.frame().locator('#sprite-name').inputValue(), '小猫角色');
        assert.equal(await f.frame().locator('#sprite-x').inputValue(), '123');
        const recorded = JSON.stringify(f.packets);
        for (const secret of ['NEVER-SHARE-PASSWORD', 'NEVER-SHARE-TOTP', 'NEVER-SHARE-PRIVATE']) assert(!recorded.includes(secret));
        assert(!recorded.includes('data:image/svg+xml'));
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('validates media events and silently follows the source video play, pause, seek, rate and position', { timeout: 30000 }, async () => {
    const generator = await browser.newPage();
    let videoData;
    try {
        videoData = Buffer.from(await generator.evaluate(async () => {
            const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
            const context = canvas.getContext('2d');
            const stream = canvas.captureStream(8);
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 20000 });
            const chunks = [];
            recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
            const completed = new Promise((resolve) => { recorder.onstop = resolve; });
            let frame = 0;
            const paint = () => { context.fillStyle = frame++ % 2 ? '#dd4411' : '#2266cc'; context.fillRect(0, 0, 80, 60); };
            paint(); recorder.start();
            const timer = setInterval(paint, 125);
            await new Promise((resolve) => setTimeout(resolve, 4000));
            recorder.stop(); clearInterval(timer); await completed; stream.getTracks().forEach((track) => track.stop());
            const data = new Uint8Array(await new Blob(chunks).arrayBuffer());
            return btoa(String.fromCharCode(...data));
        }), 'base64');
    } finally { await generator.close(); }
    const f = await fixture({ videoData, editorMarkup: '<video id="lesson" src="/sample.webm" preload="auto" width="160" height="120"></video>' });
    try {
        await f.student.waitForFunction(() => document.querySelector('#lesson').readyState >= 2);
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#lesson')?.readyState >= 2);
        assert.equal(await f.frame().locator('#lesson').evaluate((node) => node.muted && node.volume === 0 && node.paused), true);
        await f.student.evaluate(() => document.querySelector('#lesson').play());
        await f.teacher.waitForFunction(() => !document.querySelector('#mirror iframe').contentDocument.querySelector('#lesson').paused);
        await f.student.evaluate(() => document.querySelector('#lesson').pause());
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#lesson').paused);
        await f.student.evaluate(() => { const video = document.querySelector('#lesson'); video.currentTime = 1.25; video.playbackRate = 0.5; });
        await f.teacher.waitForFunction(() => {
            const video = document.querySelector('#mirror iframe').contentDocument.querySelector('#lesson');
            return video.paused && Math.abs(video.currentTime - 1.25) < 0.12 && video.playbackRate === 0.5;
        });
        await f.student.evaluate(() => document.querySelector('#lesson').play());
        await f.teacher.waitForFunction(() => !document.querySelector('#mirror iframe').contentDocument.querySelector('#lesson').paused);
        await f.teacher.waitForTimeout(1300);
        const sourceTime = await f.student.locator('#lesson').evaluate((node) => node.currentTime);
        const replayTime = await f.frame().locator('#lesson').evaluate((node) => node.currentTime);
        assert(Math.abs(sourceTime - replayTime) < 0.35, `video drift ${Math.abs(sourceTime - replayTime)}`);
        await f.frame().locator('#lesson').evaluate((node) => { node.muted = false; node.volume = 1; });
        await f.teacher.waitForFunction(() => {
            const video = document.querySelector('#mirror iframe').contentDocument.querySelector('#lesson'); return video.muted && video.volume === 0;
        });
        const rejected = await f.teacher.evaluate(() => {
            const base = { type: 3, timestamp: Date.now(), data: { source: 7, id: 1, type: 0, currentTime: 1, playbackRate: 1, volume: 1, muted: false, loop: false } };
            return [ { id: -1 }, { type: 99 }, { currentTime: Infinity }, { currentTime: -1 }, { playbackRate: 100 }, { volume: 2 }, { loop: 'yes' } ]
                .every((invalid) => Mirror.sanitizeMirrorEvent({ ...base, data: { ...base.data, ...invalid } }) === null);
        });
        assert(rejected);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('retains a safe blocked-frame anchor without replaying iframe contents, scripts or URLs', async () => {
    const f = await fixture({ editorMarkup: '<iframe data-live-share-frame="scratch-one" style="position:absolute;left:12px;top:400px;width:500px;height:160px;border:0" srcdoc="<p>private frame payload</p>"></iframe>' });
    try {
        await f.teacher.waitForFunction(() => !!window.viewer.getFrameRect('scratch-one'));
        assert.deepEqual(await f.teacher.evaluate(() => window.viewer.getFrameRect('scratch-one')), { x: 12, y: 400, width: 500, height: 160 });
        assert.equal(await f.frame().locator('[data-live-share-frame="scratch-one"]').evaluate((node) => node.tagName), 'DIV');
        assert.equal(await f.frame().locator('[data-live-share-frame="scratch-one"]').getAttribute('srcdoc'), null);
        assert(!JSON.stringify(f.packets).includes('private frame payload'));
        await f.student.evaluate(() => { document.querySelector('[data-live-share-frame]').style.top = '450px'; });
        await f.teacher.waitForFunction(() => window.viewer.getFrameRect('scratch-one')?.y === 450);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('anchors the editor to the replay placeholder immediately during teacher scrolling and safely updates late bindings and sizes', async () => {
    const f = await fixture({ latency: 100 });
    try {
        await f.teacher.waitForFunction(() => window.viewer.getEditorRect('editor-one')?.height === 140);
        const result = await f.teacher.evaluate(() => {
            const before = window.viewer.getEditorRect('editor-one');
            const doc = document.querySelector('#mirror iframe').contentDocument;
            doc.querySelector('#title').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }));
            return { before, after: window.viewer.getEditorRect('editor-one') };
        });
        assert.equal(result.before.y - result.after.y, 120, 'overlay anchor moves with replay before the network round trip');
        await f.student.evaluate(() => {
            const node = document.createElement('div');
            node.className = 'monaco-editor';
            node.id = 'late-editor';
            node.style.cssText = 'width:600px;height:180px';
            node.textContent = 'private late editor contents';
            document.body.appendChild(node);
        });
        await f.teacher.waitForTimeout(350);
        await f.student.evaluate(() => { document.querySelector('#late-editor').setAttribute('data-live-share-editor', 'late-editor'); });
        await f.teacher.waitForFunction(() => window.viewer.getEditorRect('late-editor')?.width === 600);
        await f.student.evaluate(() => { document.querySelector('#late-editor').style.cssText = 'width:500px;height:250px'; });
        await f.teacher.waitForFunction(() => {
            const rect = window.viewer.getEditorRect('late-editor');
            return rect?.width === 500 && rect.height === 250;
        });
        await f.student.evaluate(() => { document.querySelector('#late-editor').removeAttribute('data-live-share-editor'); });
        await f.teacher.waitForFunction(() => window.viewer.getEditorRect('late-editor') === null);
        assert(!JSON.stringify(f.packets).includes('private late editor contents'));
        assert.equal(await f.teacher.evaluate(() => window.viewer.getEditorRect('bad"] selector')), null);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('preserves a textarea editor position and outer box without copying private content or arbitrary inline styles', async () => {
    const f = await fixture({ editorMarkup: '<textarea name="code" data-live-share-editor="textarea-editor" class="padded-editor" style="position:absolute;top:500px;left:30px;color:rgb(123,45,67)">private textarea code</textarea><style>.padded-editor{box-sizing:content-box;width:500px;height:120px;padding:12px;border:2px solid}</style>' });
    try {
        await f.teacher.waitForFunction(() => !!window.viewer.getEditorRect('textarea-editor'));
        const actual = await f.student.evaluate(() => {
            const rect = document.querySelector('.padded-editor').getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
        assert.deepEqual(await f.teacher.evaluate(() => window.viewer.getEditorRect('textarea-editor')), actual);
        const recorded = JSON.stringify(f.packets);
        assert(!recorded.includes('private textarea code'));
        assert(!recorded.includes('123,45,67'));
        await f.student.evaluate(() => { document.querySelector('.padded-editor').style.top = '600px'; });
        await f.teacher.waitForFunction(() => window.viewer.getEditorRect('textarea-editor')?.y === 600);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('refreshes the placeholder when an existing textarea becomes a shared editor after recording starts', async () => {
    const f = await fixture({ editorMarkup: '<textarea name="code" id="late-area">private late textarea</textarea>' });
    try {
        await f.student.evaluate(() => { document.querySelector('#late-area').setAttribute('data-live-share-editor', 'late-area'); });
        await f.teacher.waitForFunction(() => !!window.viewer.getEditorRect('late-area'));
        assert(!JSON.stringify(f.packets).includes('private late textarea'));
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('executes allowed teacher clicks once, synchronizes language changes, and refuses side-effect buttons', async () => {
    const f = await fixture();
    try {
        await f.frame().locator('#run').click();
        await f.student.waitForFunction(() => window.runs === 1);
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#result')?.textContent === '运行 1');
        const runCommand = f.commands.find((entry) => entry.action === 'click');
        assert(runCommand);
        await f.student.evaluate((data) => window.source.receiveCommand(data), runCommand);
        assert.equal(await f.student.evaluate(() => window.runs), 1, 'a retry must not run the code twice');
        await f.frame().locator('#lang').selectOption('cpp');
        await f.student.waitForFunction(() => document.body.dataset.language === 'cpp');
        await f.frame().locator('#submit').click();
        await f.frame().locator('#unknown').click();
        await f.teacher.waitForTimeout(120);
        assert.deepEqual(await f.student.evaluate(() => [window.submits, window.saves]), [0, 0]);
        assert(f.acks.some((ack) => !ack.ok && ack.reason.includes('提交')));
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('rejects stale page commands and disconnected controls without changing the student page', async () => {
    const f = await fixture();
    try {
        await f.frame().locator('#run').click();
        await f.student.waitForFunction(() => window.runs === 1);
        const valid = f.commands[0];
        const stale = await f.student.evaluate((data) => window.source.receiveCommand({ ...data, id: 'stale', pageId: 'page-old' }), valid);
        assert.equal(stale.ok, false);
        const hidden = await f.student.evaluate((data) => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            const result = window.source.receiveCommand({ ...data, id: 'hidden-tab' });
            delete document.hidden;
            return result;
        }, valid);
        assert.equal(hidden.ok, false);
        await f.student.evaluate(() => window.source.setConnected(false));
        const disconnected = await f.student.evaluate((data) => window.source.receiveCommand({ ...data, id: 'disconnected' }), valid);
        assert.equal(disconnected.ok, false);
        assert.equal(await f.student.evaluate(() => window.runs), 1);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('teacher navigation changes only the student and refuses management links', async () => {
    const f = await fixture();
    try {
        await f.frame().locator('#evil-link').click();
        await f.teacher.waitForTimeout(100);
        assert.equal(new URL(f.student.url()).pathname, '/d/C0001/p/P1');
        await f.frame().locator('#next').click();
        await f.student.waitForURL('**/d/C0001/p/P2');
        assert.equal(f.teacher.url(), 'https://sharing.test/teacher');
        assert.equal(await f.teacher.locator('#teacher-draft').inputValue(), 'teacher own code');
    } finally { await f.close(); }
});

it('teacher can follow ordinary personal-center and contest-page links without navigating their own page', async () => {
    for (const [link, destination] of [['profile', '/user/28'], ['personal-center', '/home/profile'], ['contest-detail', '/d/C0001/contest/recent/clarification']]) {
        const f = await fixture();
        try {
            await f.frame().locator(`#${link}`).click();
            await f.student.waitForURL(`**${destination}`);
            assert.equal(new URL(f.student.url()).pathname, destination);
            assert.equal(f.teacher.url(), 'https://sharing.test/teacher');
            assert.deepEqual(f.errors, []);
        } finally { await f.close(); }
    }
});

it('opens the named online editor without replaying javascript links and supports safe GET problem searches', async () => {
    const f = await fixture();
    try {
        assert.equal(await f.frame().locator('#open-editor').getAttribute('href'), null, 'executable URLs never enter the replay');
        await f.frame().locator('#open-editor').click();
        await f.student.waitForFunction(() => window.opens === 1);
        assert.equal(await f.teacher.locator('#mirror iframe').evaluate((iframe) => iframe.contentWindow.opens), undefined);
        assert.equal(await f.frame().locator('form').getAttribute('action'), null, 'the replay form cannot submit natively');
        await f.frame().locator('#search').fill('二分 搜索');
        await f.frame().locator('#search').press('Enter');
        await f.student.waitForURL('**/d/C0001/p?q=*');
        assert.equal(new URL(f.student.url()).searchParams.get('q'), '二分 搜索');
        assert.equal(f.teacher.url(), 'https://sharing.test/teacher');
    } finally { await f.close(); }
});

it('scaled replay clicks and local zoom use teacher CSS coordinates across different device densities', async () => {
    const f = await fixture({ viewGestures: true, teacherDpr: 2, studentDpr: 1 });
    try {
        let count = 0;
        for (const scale of [0.55, 1.4]) {
            await f.teacher.evaluate((scale) => {
                const root = document.querySelector('#mirror'); root.style.transformOrigin = '0 0'; root.style.transform = `scale(${scale})`;
            }, scale);
            await f.frame().locator('#run').click();
            await f.student.waitForFunction((count) => window.runs === count, ++count);
            const box = await f.frame().locator('#title').boundingBox();
            const point = { x: box.x + 80, y: box.y + box.height / 2 };
            await f.teacher.mouse.move(point.x, point.y);
            await f.teacher.keyboard.down('Control');
            await f.teacher.mouse.wheel(0, -120);
            await f.teacher.keyboard.up('Control');
            await f.teacher.waitForFunction((count) => window.viewZooms.length === count, count);
            const zoom = await f.teacher.evaluate(() => window.viewZooms.at(-1));
            assert.equal(zoom.delta, -120);
            assert(Math.abs(zoom.clientX - point.x) < 2 && Math.abs(zoom.clientY - point.y) < 2,
                `scale ${scale} zoom should anchor in teacher CSS pixels, independent of DPR`);
        }
        assert.equal(await f.student.evaluate(() => window.scrollY), 0);
        assert.equal(f.commands.filter((entry) => entry.action === 'scroll').length, 0, 'local zoom never scrolls the student');
        await f.teacher.mouse.wheel(0, 100);
        await f.student.waitForFunction(() => window.scrollY >= 99);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('Space dragging pans only the teacher view, survives moving iframe coordinates, and leaves input spaces alone', async () => {
    const f = await fixture({ viewGestures: true, teacherDpr: 1, studentDpr: 2 });
    try {
        await f.teacher.evaluate(() => {
            const root = document.querySelector('#mirror');
            root.style.transformOrigin = '0 0'; root.style.transform = 'scale(0.7)';
            let x = 0; let y = 0;
            window.onViewPanHook = (delta) => { x -= delta.dx; y -= delta.dy; root.style.transform = `translate(${x}px,${y}px) scale(0.7)`; };
        });
        const title = await f.frame().locator('#title').boundingBox();
        const x = title.x + 80; const y = title.y + title.height / 2;
        await f.teacher.mouse.click(x, y);
        await f.teacher.keyboard.down('Space');
        await f.teacher.mouse.move(x, y); await f.teacher.mouse.down();
        await f.teacher.mouse.move(x + 70, y + 42, { steps: 10 });
        await f.teacher.mouse.up(); await f.teacher.keyboard.up('Space');
        const pan = await f.teacher.evaluate(() => window.viewPans.reduce((sum, delta) => ({ dx: sum.dx + delta.dx, dy: sum.dy + delta.dy }), { dx: 0, dy: 0 }));
        assert(Math.abs(pan.dx + 70) < 2 && Math.abs(pan.dy + 42) < 2, `pan should scroll opposite physical teacher movement for natural grabbing: ${JSON.stringify(pan)}`);
        assert.equal(f.commands.length, 0, 'pan never becomes a source click/scroll');
        assert.equal(await f.student.evaluate(() => window.scrollY), 0);
        await f.teacher.waitForTimeout(310);
        await f.frame().locator('#search').fill('first');
        await f.teacher.keyboard.press('Space');
        await f.teacher.keyboard.type('second');
        assert.equal(await f.frame().locator('#search').inputValue(), 'first second', 'typing Space remains ordinary text input');
        await f.frame().locator('#run').click();
        await f.student.waitForFunction(() => window.runs === 1);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('source scroll follows the student and teacher wheel scrolls the same student document', async () => {
    const f = await fixture();
    try {
        await f.student.evaluate(() => window.scrollTo(0, 500));
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentWindow.scrollY === 500);
        await f.frame().locator('#long').hover();
        await f.teacher.mouse.wheel(0, 160);
        await f.student.waitForFunction(() => window.scrollY > 500);
        assert(f.commands.some((command) => command.action === 'scroll'));
    } finally { await f.close(); }
});


it('continuously relays a teacher trackpad gesture without waiting for it to stop or jumping backwards on echoes', async () => {
    const f = await fixture({ latency: 60 });
    let gesture;
    try {
        await f.student.evaluate(() => window.scrollTo(0, 200));
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentWindow.scrollY === 200);
        gesture = f.teacher.evaluate(async () => {
            const doc = document.querySelector('#mirror iframe').contentDocument;
            const positions = [];
            for (let i = 0; i < 60; i++) {
                doc.querySelector('#long').dispatchEvent(new doc.defaultView.WheelEvent('wheel', { deltaY: 8, bubbles: true, cancelable: true }));
                positions.push(doc.scrollingElement.scrollTop);
                await new Promise((resolve) => setTimeout(resolve, 16));
            }
            return positions;
        });
        // A trailing debounce leaves the student completely still for this whole gesture.
        await f.student.waitForFunction(() => window.scrollY > 260, null, { timeout: 750 });
        const positions = await gesture;
        assert(positions.every((position, index) => !index || position >= positions[index - 1]), 'old replay echoes must not rewind the teacher');
        await f.student.waitForFunction(() => Math.abs(window.scrollY - 680) <= 1);
        await f.teacher.waitForFunction(() => Math.abs(document.querySelector('#mirror iframe').contentWindow.scrollY - 680) <= 1);
        const scrolls = f.commands.filter((entry) => entry.action === 'scroll');
        assert(scrolls.length >= 8 && scrolls.length <= 50, 'continuous scrolling is throttled, never sent once per idle gesture');
        await f.student.evaluate(() => window.scrollTo(0, 120));
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentWindow.scrollY === 120);
        assert.deepEqual(f.errors, []);
    } finally { await gesture?.catch(() => {}); await f.close(); }
});

it('teacher wheel controls nested scroll containers and clamps their bounds without moving the page', async () => {
    const f = await fixture({ latency: 40 });
    try {
        await f.teacher.evaluate(async () => {
            const doc = document.querySelector('#mirror iframe').contentDocument;
            for (let i = 0; i < 20; i++) {
                doc.querySelector('#nested-content').dispatchEvent(new doc.defaultView.WheelEvent('wheel', { deltaX: 20, deltaY: 12, bubbles: true, cancelable: true }));
                await new Promise((resolve) => setTimeout(resolve, 16));
            }
        });
        await f.student.waitForFunction(() => {
            const node = document.querySelector('#nested'); return Math.abs(node.scrollTop - 240) <= 1 && Math.abs(node.scrollLeft - 400) <= 1;
        });
        assert.equal(await f.student.evaluate(() => window.scrollY), 0);
        await f.teacher.waitForFunction(() => Math.abs(document.querySelector('#mirror iframe').contentDocument.querySelector('#nested').scrollTop - 240) <= 1);
        await f.teacher.evaluate(() => {
            const doc = document.querySelector('#mirror iframe').contentDocument;
            doc.querySelector('#nested-content').dispatchEvent(new doc.defaultView.WheelEvent('wheel', { deltaY: 10000, bubbles: true, cancelable: true }));
        });
        await f.student.waitForFunction(() => { const node = document.querySelector('#nested'); return node.scrollTop === node.scrollHeight - node.clientHeight; });
        assert.equal(await f.student.evaluate(() => window.scrollY), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});


it('disconnect discards an unsent wheel target', async () => {
    const f = await fixture();
    try {
        const before = f.commands.length;
        await f.teacher.evaluate(() => {
            const doc = document.querySelector('#mirror iframe').contentDocument;
            doc.querySelector('#long').dispatchEvent(new doc.defaultView.WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true }));
            window.viewer.setConnected(false);
        });
        await f.teacher.waitForTimeout(120);
        assert.equal(f.commands.length, before, 'a queued scroll must not run after disconnect');
        assert.equal(await f.student.evaluate(() => window.scrollY), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('reconnect waits for a new snapshot and resumes updates and clicks on the current document', async () => {
    const f = await fixture();
    try {
        await f.teacher.evaluate(() => window.viewer.setConnected(false));
        await f.student.evaluate(() => { window.source.setConnected(false); document.querySelector('#title').textContent = '断线期间的新内容'; });
        await f.teacher.waitForTimeout(200);
        assert.equal(await f.frame().locator('#title').textContent(), '学生正在练习');
        await f.teacher.evaluate(() => window.viewer.setConnected(true));
        assert.equal(await f.teacher.locator('#mirror iframe').evaluate((iframe) => iframe.style.pointerEvents), 'none');
        await f.student.evaluate(() => window.source.setConnected(true));
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#title')?.textContent === '断线期间的新内容');
        await f.frame().locator('#run').click();
        await f.student.waitForFunction(() => window.runs === 1);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('large compressed Unicode snapshots reassemble and unsafe or missing sequences do not apply', async () => {
    const page = await browser.newPage();
    try {
        await page.goto('about:blank'); await page.addScriptTag({ content: script });
        const result = await page.evaluate(async () => {
            const accepted = []; const failures = [];
            const event = { type: 2, timestamp: Date.now(), data: { node: { type: 3, id: 1, textContent: '编程学习ABC'.repeat(20000) } } };
            const packets = await Mirror.mirrorPackets(event, 1);
            const assembler = new Mirror.MirrorAssembler((value) => accepted.push(value), (message) => failures.push(message));
            for (const packet of packets.toReversed()) assembler.receive(packet);
            await new Promise((resolve) => setTimeout(resolve, 150));
            assembler.receive({ type: 'rrweb', sequence: 3, event: { type: 3, timestamp: Date.now(), data: { source: 3, id: 1, x: 0, y: 50 } } });
            await new Promise((resolve) => setTimeout(resolve, 30));
            return { count: accepted.length, content: accepted[0]?.data.node.textContent, failures, encoding: packets[0].encoding };
        });
        assert.equal(result.count, 1);
        assert.equal(result.content, '编程学习ABC'.repeat(20000));
        assert.equal(result.encoding, 'gzip');
        assert.equal(result.failures.length, 1);
    } finally { await page.close(); }
});

it('safe navigation covers ordinary platform pages while rejecting account actions, dangerous queries and encoded paths', async () => {
    const page = await browser.newPage();
    try {
        await page.goto('about:blank'); await page.addScriptTag({ content: script });
        const urls = await page.evaluate(() => {
            const base = 'https://sharing.test/d/C0001/p/P1';
            const rejected = ['https://evil.test/p/P2', '/logout', '/d/C0001/p/P1/edit', '/d/C0001/contest/create',
                '/p/P1?operation=delete', '/p/%252e%252e', 'javascript:alert(1)', '/home/account',
                '/home/profile/password', '/home/changeMail/secret', '/user/tfa', '/user/webauthn', '/oauth/vendor/callback',
                '/language/en', '/lottery/draw', '/achievement/ack', '/p/P2?method=delete', '/p/P2?auth=secret', '/p//P2'];
            const permitted = ['/p/P2?tid=abc', '/d/C0001/homework/abc', '/user/28', '/home/profile', '/home/domain', '/home/messages',
                '/d/C0001/contest/abc/clarification', '/d/C0001/contest/abc/scoreboard/all', '/badge-honor-wall',
                '/scratch/editor?workId=abc', '/scratch/assignment/abc/quiz', '/discuss/topic/123'];
            return { rejected: rejected.map((url) => Mirror.safeStudyUrl(url, base)),
                permitted: permitted.map((url) => Mirror.safeStudyUrl(url, base)) };
        });
        assert(urls.rejected.every((url) => url === null));
        assert.equal(urls.permitted.length, 12);
        assert(urls.permitted.every((url) => url?.startsWith('https://sharing.test/')));
    } finally { await page.close(); }
});
