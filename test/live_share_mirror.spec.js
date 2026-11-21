const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');
const stylus = require('stylus');

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
let studyChoicesScript;
let drawingScript;
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
    drawingScript = (await esbuild.build({ entryPoints: [path.join(root, 'packages/ui-default/components/live_share/drawing.ts')],
        bundle: true, format: 'iife', globalName: 'Drawing', write: false })).outputFiles[0].text;
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
    studyChoicesScript = (await esbuild.build({ stdin: { resolveDir: root, contents: `
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        const h = React.createElement;
        window.studyChanges = [];
        function Choices() {
            const [question, setQuestion] = useState('question-1');
            const [locked, setLocked] = useState(false);
            const [radio, setRadio] = useState('');
            const [checked, setChecked] = useState(false);
            window.setStudyQuestion = setQuestion;
            window.lockStudyChoices = setLocked;
            return h('div', null,
                h('form', { 'data-daily-quiz-form':true }, h('fieldset', { disabled:locked },
                    ['A', 'B'].map(value => h('label', { key:value, 'data-daily-quiz-option':value },
                        h('input', { type:'radio', name:'daily-quiz-answer', value, checked:radio===value,
                            'aria-describedby':'daily-quiz-option-'+question+'-'+value,
                            onChange:() => { window.studyChanges.push('daily:'+value); setRadio(value); } }),
                        h('span', { id:'daily-quiz-option-'+question+'-'+value }, '答案 '+value)))),
                    h('button', { type:'submit', onClick:e => { e.preventDefault(); window.studyChanges.push('submit'); } }, '提交答案')),
                h('form', { className:'sc-quiz__card' }, h('fieldset', { disabled:locked },
                    h('label', null, h('input', { type:'checkbox', name:'scratch-quiz-answer', value:'A', checked,
                        'aria-describedby':'sc-quiz-option-'+question+'-A',
                        onChange:() => { window.studyChanges.push('scratch:A'); setChecked(!checked); } }),
                        h('span', { id:'scratch-choice-label' }, 'Scratch 选项')))),
                h('input', { id:'unrelated-checkbox', type:'checkbox', onChange:() => window.studyChanges.push('unrelated') }));
        }
        createRoot(document.querySelector('#study-choices')).render(h(Choices));
    ` }, bundle: true, format: 'iife', write: false, define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
    browser = process.env.HYDRO_WEBKIT === '1' ? await playwright.webkit.launch({ headless: true })
        : await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

async function fixture({ latency = 0, editorMarkup = '', inlineLocalImages = false, showNonSensitiveInputs = false, videoData = null,
    viewGestures = false, teacherDpr = 1, studentDpr = 1, splitPanes = false, studyChoices = false, localControls = false, readOnly = false,
    serveImage, origin = 'https://sharing.test', proxy } = {}) {
    const studentContext = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: studentDpr, proxy });
    const teacherContext = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: teacherDpr, proxy });
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
        await context.route(`${origin}/**`, async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            if (serveImage && (pathname.includes('/figures/') || pathname.startsWith('/d/S0001/file/'))) return serveImage(route, context === teacherContext);
            if (pathname === '/sample.webm' && videoData) {
                const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
                const start = range ? Number(range[1]) : 0;
                const end = range?.[2] ? Math.min(Number(range[2]), videoData.length - 1) : videoData.length - 1;
                return route.fulfill({ status: range ? 206 : 200, contentType: 'video/webm', body: videoData.subarray(start, end + 1),
                    headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${videoData.length}` } : {}) } });
            }
            const teacherPage = pathname === '/teacher';
            const body = teacherPage ? '<textarea id="teacher-draft">teacher own code</textarea><main id="mirror" style="position:relative;width:1000px;height:700px"></main>' : `
                ${editorMarkup}${studyChoices ? '<div id="study-choices"></div>' : ''}<header>OneByOne</header><h1 id="title">学生正在练习</h1>
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
    await teacher.goto(`${origin}/teacher`);
    await student.goto(`${origin}/d/C0001/p/P1`);
    if (studyChoices) {
        await student.addScriptTag({ content: studyChoicesScript });
        await student.locator('#scratch-choice-label').waitFor();
    }
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
    await teacher.evaluate(({ viewGestures, localControls, readOnly }) => {
        window.statuses = [];
        window.viewZooms = []; window.viewPans = [];
        window.viewer = Mirror.attachViewerMirror({ pageId: 'page-1', container: document.querySelector('#mirror'), readOnly,
            ...(localControls ? { onDocument(doc) {
                const button = doc.createElement('button'); button.id = 'trusted-capacity'; button.textContent = '运行位置';
                button.dataset.ideCapacityLocal = ''; button.dataset.liveShareUi = '';
                button.style.setProperty('visibility', 'visible', 'important');
                button.addEventListener('click', () => { window.localClicks = (window.localClicks || 0) + 1; });
                button.addEventListener('dblclick', () => { window.localReleases = (window.localReleases || 0) + 1; });
                doc.body.prepend(button);
                return { owns(target) { return button === target || button.contains(target); },
                    dispose() { window.localDisposals = (window.localDisposals || 0) + 1; button.remove(); } };
            } } : {}),
            ...(viewGestures ? {
                onViewZoom: (data) => { window.viewZooms.push(data); window.onViewZoomHook?.(data); },
                onViewPan: (data) => { window.viewPans.push(data); window.onViewPanHook?.(data); },
            } : {}),
            sendCommand: (data) => window.sendCommand(data), onStatus: (message) => window.statuses.push(message) });
    }, { viewGestures, localControls, readOnly });
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

for (const readOnly of [false, true]) it(`shows a small source-only pointer in ${readOnly ? 'readonly broadcasts' : 'teacher assistance'}, including blocked editors and scaled views`, async () => {
    const f = await fixture({ readOnly });
    try {
        await f.teacher.addStyleTag({ content: stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share.page.styl'), 'utf8')) });
        await f.teacher.evaluate(() => {
            document.querySelector('#mirror').style.cssText += ';transform:scale(.7);transform-origin:top left';
            window.remoteMouseEvents = 0;
            document.querySelector('#mirror iframe').contentDocument.addEventListener('pointermove', () => remoteMouseEvents++);
        });
        const dot = f.teacher.locator('#mirror > .live-share-remote-pointer');
        assert.equal(await dot.isVisible(), false, 'no invented cursor before a real source move');
        await f.student.mouse.move(320, 105);
        await f.teacher.waitForFunction(() => document.querySelector('.live-share-remote-pointer').style.left === '320px'
            && document.querySelector('.live-share-remote-pointer').style.display === 'block');
        await f.teacher.waitForTimeout(90);
        const layout = await dot.evaluate((node) => {
            const box = node.getBoundingClientRect(); const host = node.parentElement.getBoundingClientRect();
            return { x: (box.left + box.width / 2 - host.left) / .7, y: (box.top + box.height / 2 - host.top) / .7,
                width: box.width, pointer: getComputedStyle(node).pointerEvents, background: getComputedStyle(node).backgroundColor };
        });
        assert(Math.abs(layout.x - 320) < 1 && Math.abs(layout.y - 105) < 1, 'light point follows the source logical coordinates under scaling');
        assert(layout.width < 10 && layout.width > 7, 'the light point stays compact instead of covering text');
        assert.equal(layout.pointer, 'none'); assert.notEqual(layout.background, 'rgba(0, 0, 0, 0)');
        assert.equal(await f.teacher.evaluate(() => remoteMouseEvents), 0, 'remote pointer never simulates the viewer local mouse');
        await f.teacher.mouse.move(700, 300);
        await f.student.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 900, clientY: 600 })));
        await f.teacher.waitForTimeout(180);
        assert.equal(await dot.evaluate(node => node.style.left), '320px', 'viewer and synthetic events never impersonate the real source pointer');
        assert.equal(await f.teacher.evaluate(() => {
            const make = (positions) => ({ type: 3, timestamp: Date.now(), data: { source: 1, positions } });
            return [[], [{ id: 1, x: NaN, y: 20, timeOffset: 0 }], [{ id: -1, x: 10, y: 20, timeOffset: 0 }],
                [{ id: 1, x: 50000, y: 20, timeOffset: 0 }]].every(positions => Mirror.sanitizeMirrorEvent(make(positions)) === null)
                && !!Mirror.sanitizeMirrorEvent(make([{ id: 1, x: -1, y: -1, timeOffset: 0 }]));
        }), true, 'bad pointer packets are rejected while the explicit leave marker remains valid');
        const editor = await f.student.locator('[data-live-share-editor]').boundingBox();
        await f.student.mouse.move(editor.x + 80, editor.y + 40);
        await f.teacher.waitForFunction((point) => Math.abs(parseFloat(document.querySelector('.live-share-remote-pointer').style.left) - point.x) < 1
            && Math.abs(parseFloat(document.querySelector('.live-share-remote-pointer').style.top) - point.y) < 1, { x: editor.x + 80, y: editor.y + 40 });
        assert.equal(await dot.isVisible(), true, 'Monaco blocking does not suppress a mouse-only display packet');
        await f.student.mouse.move(1005, 705);
        await dot.waitFor({ state: 'hidden' });
        await f.student.mouse.move(200, 100); await dot.waitFor({ state: 'visible' });
        await f.student.evaluate(() => window.dispatchEvent(new Event('blur')));
        await dot.waitFor({ state: 'hidden' });
        await f.student.mouse.move(220, 110); await dot.waitFor({ state: 'visible' });
        await f.teacher.evaluate(() => viewer.setConnected(false));
        await dot.waitFor({ state: 'hidden' });
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('hides source pointer coordinates over private controls while preserving relayed IDE and annotation surfaces', async () => {
    const f = await fixture();
    try {
        await f.teacher.addStyleTag({ content: stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share.page.styl'), 'utf8')) });
        await f.student.evaluate(() => {
            const probe = document.createElement('div'); probe.id = 'pointer-privacy-probe';
            probe.style.cssText = 'position:fixed;left:760px;top:500px;width:200px;height:140px;background:white;z-index:100';
            document.body.append(probe);
        });
        const dot = f.teacher.locator('#mirror > .live-share-remote-pointer');
        const probe = async (markup) => {
            await f.student.evaluate(markup => { document.getElementById('pointer-privacy-probe').innerHTML = markup;
                const node = document.getElementById('probe-target'); node.style.cssText = 'display:block;margin:0;width:150px;height:80px'; }, markup);
            await f.student.mouse.move(320, 105); await dot.waitFor({ state: 'visible' });
            await f.student.mouse.move(780, 525);
        };
        for (const markup of [
            '<div data-live-share-private><span id="probe-target">hidden</span></div>',
            '<div data-live-share-ui><span id="probe-target">hidden</span></div>',
            '<div class="voice-call-floating"><span id="probe-target">hidden</span></div>',
            '<div data-voice-call-ui><span id="probe-target">hidden</span></div>',
            '<input id="probe-target" type="password" value="secret">',
            '<input id="probe-target" name="api_token" value="secret">',
            '<input id="probe-target" autocomplete="one-time-code" value="123456">',
            '<div data-private><div data-ide-runtime data-live-share-private><span id="probe-target">hidden</span></div></div>',
            '<div class="live-share-code-focus-layer" data-live-share-private><input id="probe-target" name="csrf" value="secret"></div>',
            '<div data-ide-runtime data-live-share-private data-live-share-ui><span id="probe-target">viewer runtime</span></div>',
        ]) {
            await probe(markup); await dot.waitFor({ state: 'hidden' });
        }
        for (const markup of [
            '<div data-ide-runtime data-live-share-private><span id="probe-target">terminal output</span></div>',
            '<div class="live-share-annotation-source" data-live-share-private><span id="probe-target">shared note</span></div>',
            '<div class="live-share-code-focus-layer" data-live-share-private data-live-share-ui><span id="probe-target">code note</span></div>',
            '<div data-live-share-private data-live-share-ui><div data-share-drawing-note data-live-share-private data-live-share-ui><span id="probe-target">drawing note</span></div></div>',
        ]) {
            await probe(markup);
            await f.teacher.waitForFunction(() => document.querySelector('.live-share-remote-pointer').style.left === '780px'
                && document.querySelector('.live-share-remote-pointer').style.display === 'block');
        }
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('trusted teacher controls stay local while copied markers cannot bypass replay safeguards', async () => {
    const f = await fixture({ localControls: true,
        editorMarkup: '<button id="forged-capacity" data-ide-capacity-local onclick="window.saves++">伪造释放</button>' });
    try {
        const button = f.frame().locator('#trusted-capacity');
        await button.click();
        assert.equal(await f.teacher.evaluate(() => localClicks), 1);
        assert.equal(await f.teacher.evaluate(() => window.localReleases || 0), 0);
        await button.dblclick();
        assert.equal(await f.teacher.evaluate(() => localReleases), 1);
        assert.equal(f.commands.length, 0, 'teacher management never executes with student credentials');
        await f.frame().locator('#forged-capacity').click();
        assert.equal(await f.student.evaluate(() => saves), 0);
        assert.equal(await f.teacher.evaluate(() => localReleases), 1, 'student-supplied attributes grant no teacher authority');
        assert(f.acks.every((ack) => !ack.ok), 'the source retains its normal unknown-control rejection');
        await f.teacher.evaluate(() => viewer.dispose());
        assert((await f.teacher.evaluate(() => localDisposals)) >= 1);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

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

it('keeps Scratch resize sensors out of the replay layout while real embedded documents retain an inert placeholder', async () => {
    // This is the object created by the resize listener in the shipped Scratch GUI.
    const sensor = '<object class="resize-sensor" tabindex="-1" type="text/html" data="about:blank" '
        + 'style="display:block;position:absolute;top:0;left:0;height:100%;width:100%;overflow:hidden;pointer-events:none;z-index:-1"></object>';
    const embedded = '<object class="resize-sensor" type="text/html" data="data:text/html,embedded-lesson-document"></object>';
    const f = await fixture({ editorMarkup: `<div id="scratch-stage" style="position:relative;width:280px">
        <button id="costume-tool" style="margin:0">选择造型</button>
        <div id="sprite-title" style="height:28px">舞台</div>${sensor}</div>
        <div id="following-content" style="height:18px">角色</div>
        <div id="foreign-lesson">${embedded}</div>
        <div id="foreign-frame"><iframe sandbox="" srcdoc="private lesson contents"></iframe></div>` });
    try {
        const frame = f.frame();
        const stage = frame.locator('#scratch-stage');
        const sourceStage = f.student.locator('#scratch-stage');
        const visibleBoxes = stage.locator('[data-live-share-unavailable]:visible');
        const checkStage = async () => {
            assert.equal(await visibleBoxes.count(), 0, 'a size listener must never turn into a visible dashed box');
            assert.equal(await stage.locator('iframe, object, embed').count(), 0, 'the sensor must stay inert in the replay');
            assert.equal((await stage.boundingBox()).height, (await sourceStage.boundingBox()).height);
            const gapToSibling = async (locator) => locator.evaluate((node) =>
                node.nextElementSibling.getBoundingClientRect().top - node.getBoundingClientRect().top);
            assert.equal(await gapToSibling(stage), await gapToSibling(sourceStage));
            assert.equal(await stage.locator('#costume-tool').evaluate((button) => {
                const { x, y, width, height } = button.getBoundingClientRect();
                return button.ownerDocument.elementFromPoint(x + width / 2, y + height / 2) === button;
            }), true, 'the collapsed placeholder leaves the costume control reachable');
        };

        for (const selector of ['#foreign-lesson', '#foreign-frame']) {
            const external = frame.locator(selector);
            await external.locator('[data-live-share-unavailable]:visible').waitFor();
            assert.equal(await external.locator('iframe, object, embed').count(), 0);
        }
        await checkStage();

        // Reuse the same stage and surrounding nodes while the GUI replaces its
        // sensor, first with a real frame, then with a newly mounted listener.
        const thirdPartyUrl = 'https://embedded-class.test/lesson';
        const replayLoads = [];
        await f.student.context().route(thirdPartyUrl, (route) =>
            route.fulfill({ contentType: 'text/html', body: '<p>private replacement contents</p>' }));
        await f.teacher.context().route(thirdPartyUrl, (route) => { replayLoads.push(route.request().url()); return route.abort(); });
        await f.student.evaluate((url) => {
            const replacement = document.createElement('iframe');
            replacement.src = url;
            replacement.style.cssText = 'display:block;border:0;width:0;height:0';
            const stage = document.querySelector('#scratch-stage');
            stage.querySelector('object').replaceWith(replacement);
            stage.dataset.frameState = 'collapsed';
        }, thirdPartyUrl);
        await f.student.frameLocator('#scratch-stage iframe').getByText('private replacement contents').waitFor({ state: 'attached' });
        await frame.locator('#scratch-stage[data-frame-state=collapsed]').waitFor();
        await checkStage();
        const embeddedFrame = sourceStage.locator('iframe');
        await embeddedFrame.evaluate((node) => { node.style.width = '100%'; node.style.height = '96px'; });
        await visibleBoxes.waitFor();
        const actualBox = await embeddedFrame.boundingBox();
        const replayBox = await visibleBoxes.boundingBox();
        const stageTop = await sourceStage.boundingBox();
        const replayTop = await stage.boundingBox();
        assert.ok(Math.abs((actualBox.y - stageTop.y) - (replayBox.y - replayTop.y)) <= 1, 'visible embed stays below the costume controls');
        await embeddedFrame.evaluate((node) => { node.style.width = '0'; node.style.height = '0'; });
        await visibleBoxes.waitFor({ state: 'hidden' });
        await checkStage();
        assert.equal(await stage.locator('iframe').count(), 0);
        assert.deepEqual(replayLoads, [], 'a third-party document is never fetched from the teacher browser');
        await f.student.evaluate((markup) => {
            const parent = document.querySelector('#scratch-stage');
            parent.querySelector('iframe').remove();
            parent.insertAdjacentHTML('afterbegin', markup);
            const row = document.createElement('div'); row.id = 'new-sprite'; row.textContent = '新角色';
            row.style.height = '19px'; parent.append(row);
            document.querySelector('#sprite-title').textContent = '舞台已更新';
        }, sensor);
        await stage.locator('#new-sprite').waitFor();
        assert.equal(await stage.locator('#sprite-title').textContent(), '舞台已更新');
        await checkStage();
        assert.equal(await frame.locator('#following-content').textContent(), '角色');
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

it('teacher quiz labels trigger the student React change handlers and refuse locked or recycled questions', async () => {
    const f = await fixture({ studyChoices: true });
    try {
        await f.frame().locator('[data-daily-quiz-option="B"] span').click();
        await f.student.waitForFunction(() => window.studyChanges.includes('daily:B'));
        assert.equal(await f.student.locator('[name="daily-quiz-answer"][value="B"]').isChecked(), true);
        const radioCommand = f.commands.find((entry) => entry.action === 'click');
        await f.frame().locator('#scratch-choice-label').click();
        await f.student.waitForFunction(() => window.studyChanges.includes('scratch:A'));
        assert.equal(await f.student.locator('[name="scratch-quiz-answer"]').isChecked(), true);
        await f.student.evaluate((command) => window.source.receiveCommand(command), radioCommand);
        assert.deepEqual(await f.student.evaluate(() => window.studyChanges), ['daily:B', 'scratch:A'], 'retry does not fire a second callback');

        await f.frame().locator('[data-daily-quiz-form] button').click();
        await f.frame().locator('#unrelated-checkbox').click();
        await f.teacher.waitForTimeout(100);
        assert.deepEqual(await f.student.evaluate(() => window.studyChanges), ['daily:B', 'scratch:A'], 'submit and unrelated form inputs stay protected');

        await f.student.evaluate(() => window.lockStudyChoices(true));
        await f.student.waitForFunction(() => document.querySelector('[name="daily-quiz-answer"]').matches(':disabled'));
        const locked = await f.student.evaluate((command) => window.source.receiveCommand({ ...command, id:'quiz-locked' }), radioCommand);
        assert.equal(locked.ok, false, 'the source rejects a click even if the teacher still sees an unlocked choice');
        await f.student.evaluate(() => {
            window.previousStudyInput = document.querySelector('[name="daily-quiz-answer"][value="B"]');
            window.lockStudyChoices(false);
            window.setStudyQuestion('question-2');
        });
        await f.student.locator('#daily-quiz-option-question-2-B').waitFor();
        assert.equal(await f.student.evaluate(() => window.previousStudyInput === document.querySelector('[name="daily-quiz-answer"][value="B"]')), true,
            'React reused the old input; only its question identity changed');
        const stale = await f.student.evaluate((command) => window.source.receiveCommand({ ...command, id:'quiz-old-question' }), radioCommand);
        assert.equal(stale.ok, false, 'a delayed answer click cannot select an option in the next question');
        assert.deepEqual(await f.student.evaluate(() => window.studyChanges), ['daily:B', 'scratch:A']);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('teacher study menus and record filters invoke the original source callbacks without navigation or writes', async () => {
    const f = await fixture({ editorMarkup: `
        <div id="study-controls">
            <button id="domain-menu" type="button" class="domain-switcher__trigger"><span>课堂菜单</span></button>
            <span id="show-tags" name="show_tags"><i>展开标签</i></span>
            <span id="category" data-category-container><span data-category="算法"><i>算法分类</i></span></span>
            <button id="review-view" type="button" data-learning-action="view" data-learning-view="recent"><span>学习记录</span></button>
            <a id="record-picker" href="/record?pid=1" data-problem-record-picker="1"><span>提交记录</span></a>
            <div id="record-dialog" hidden>
                <div class="problem-record-picker__filters"><button id="record-filter" type="button"><span>已通过</span></button></div>
                <button id="record-more" class="problem-record-picker__more" type="button">更多</button>
                <button id="record-import" class="problem-record-picker__record" type="button">导入作答</button>
                <button id="record-close" class="problem-record-picker__close" type="button">关闭</button>
            </div>
            <button id="write-learning" type="button" data-learning-action="mark-explained">修改学习状态</button>
        </div>
        <script>
            window.studyClicks = [];
            document.querySelector('#study-controls').addEventListener('click',event=>{
                const target=event.target.closest('button,a,[name="show_tags"],[data-category]');
                if(!target) return;
                event.preventDefault(); window.studyClicks.push(target.id || target.dataset.category);
                if(target.id==='record-picker') document.querySelector('#record-dialog').hidden=false;
                if(target.id==='record-close') document.querySelector('#record-dialog').hidden=true;
            });
        </script>` });
    try {
        await f.student.evaluate(() => {
            const tabs = document.createElement('div');
            tabs.className = 'scratchpad__tablist';
            tabs.innerHTML = '<button type="button" id="editor-settings"><span>编辑器设置</span></button>';
            tabs.addEventListener('click', () => window.studyClicks.push('editor-settings'));
            document.querySelector('#scratchpad').prepend(tabs);
        });
        for (const [selector, result] of [['#domain-menu span','domain-menu'], ['#show-tags i','show-tags'], ['[data-category] i','算法'],
            ['#review-view span','review-view'], ['#editor-settings span','editor-settings'], ['#record-picker span','record-picker']]) {
            await f.frame().locator(selector).click();
            await f.student.waitForFunction((result) => window.studyClicks.includes(result), result);
        }
        assert.equal(new URL(f.student.url()).pathname, '/d/C0001/p/P1', 'the record link opens its dialog instead of navigating');
        await f.frame().locator('#record-filter span').click();
        await f.frame().locator('#record-more').click();
        await f.student.waitForFunction(() => window.studyClicks.includes('record-more'));
        await f.frame().locator('#record-import').click();
        await f.frame().locator('#write-learning').click();
        await f.frame().locator('#record-close').click();
        await f.student.waitForFunction(() => window.studyClicks.includes('record-close'));
        assert.deepEqual(await f.student.evaluate(() => window.studyClicks), [
            'domain-menu', 'show-tags', '算法', 'review-view', 'editor-settings', 'record-picker', 'record-filter', 'record-more', 'record-close',
        ]);
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

it('keeps the learner’s language and search when earlier teacher commands arrive late', async () => {
    const f = await fixture();
    try {
        await f.teacher.evaluate(() => {
            window.heldFields = [];
            const send = window.sendCommand;
            window.sendCommand = (command) => ['select', 'search'].includes(command.action)
                ? window.heldFields.push(command) : send(command);
        });
        await f.frame().locator('#lang').selectOption('cpp');
        await f.frame().locator('#search').fill('teacher query');
        await f.frame().locator('#search').press('Enter');
        const stale = await f.teacher.evaluate(() => window.heldFields.splice(0));
        assert.deepEqual(stale.map((command) => command.action), ['select', 'search']);
        await f.student.locator('#lang').selectOption('cpp');
        await f.student.locator('#lang').selectOption('py');
        await f.student.locator('#search').fill('student query');
        const results = await f.student.evaluate((commands) => commands.map((command) => window.source.receiveCommand(command).ok), stale);
        assert.deepEqual(results, [false, false]);
        assert.equal(await f.student.locator('#lang').inputValue(), 'py');
        assert.equal(await f.student.locator('#search').inputValue(), 'student query');
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe')?.contentDocument?.querySelector('#search')?.value === 'student query');
        await f.frame().locator('#lang').selectOption('cpp');
        const fresh = await f.teacher.evaluate(() => window.heldFields.pop());
        assert.equal(await f.student.evaluate((command) => window.source.receiveCommand(command).ok, fresh), true);
        assert.equal(await f.student.locator('#lang').inputValue(), 'cpp');
    } finally { await f.close(); }
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

async function problemImageFixture(t, { protectedImage = false, late = false } = {}) {
    // The source URL belongs to the learner. A second browser cannot reuse their
    // cookie or a one-time download, even when it is on the same website.
    const generator = await browser.newPage();
    const images = await generator.evaluate(() => ['#269444', '#e08022'].map(color => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 320;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#172d52'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = color; ctx.fillRect(290, 130, 60, 60);
        return canvas.toDataURL('image/png').split(',')[1];
    }));
    await generator.close();
    const urls = []; let openGate;
    const gate = new Promise(resolve => { openGate = resolve; });
    t.after(openGate);
    const url = './figures/stage.png?expires=1690000000&signature=learner-only-example';
    const f = await fixture({ teacherDpr: 2, studentDpr: 1, editorMarkup: `
        <aside id="question-panel" class="scratch-problem-question" style="width:380px;height:435px;overflow:auto">
        <h1>GESP Scratch一级 · 躲避陨石</h1><div class="scratch-problem-description typo">
        <h2>舞台示例</h2><p><picture><source id="stage-source"><img id="stage-example"
            alt="躲避陨石：原卷舞台与角色示例" ${late ? '' : `src="${url}"`} style="max-width:100%;height:auto"></picture></p>
        <h2 id="prepare">准备工作</h2><ol><li>添加角色 Rocks 和 Rocketship。</li><li>添加背景 Moon。</li></ol>
        <div style="height:850px"></div></div></aside>`,
        async serveImage(route, teacher) {
            const request = route.request().url();
            urls.push({ request, teacher });
            if (teacher && protectedImage) return route.fulfill({ status: 403, body: '已过期' });
            if (late && !teacher && !request.includes('replacement')) await gate;
            return route.fulfill({ contentType: 'image/png', headers: { 'Cache-Control': 'no-store' },
                body: Buffer.from(images[request.includes('replacement') ? 1 : 0], 'base64') });
        } });
    t.after(f.close);
    return { ...f, urls, openGate, url };
}

async function installProblemDrawing(f) {
    await Promise.all([f.teacher, f.student].map(page => page.addScriptTag({ content: drawingScript })));
    await f.teacher.exposeFunction('relayInk', packet => f.student.evaluate(value => ink.receive(value, 'teacher'), packet));
    for (const [page, teacher] of [[f.student, false], [f.teacher, true]]) await page.evaluate(teacher => {
        const mirror = teacher ? viewer : source;
        const stage = teacher ? document.querySelector('#mirror') : document.createElement('div');
        if (!teacher) {
            stage.dataset.liveShareUi = ''; stage.dataset.liveSharePrivate = '';
            stage.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147482000';
            document.body.append(stage);
        }
        window.ink = Drawing.attachTemporaryDrawing({ pageId: 'page-1', teacher, container: stage,
            ...(teacher && { send: packet => relayInk(packet), annotationScope: { sessionId: 'lesson-figure', url: 'https://sharing.test/d/C0001/p/P1' },
                annotationDocument: () => viewer.getDrawingDocument() }),
            anchors: { identify(node) { const nodeId = mirror.getDrawingNodeId(node); return nodeId ? { nodeId } : null; },
                resolve: identity => mirror.getDrawingNode(identity.nodeId) } });
    }, teacher);
}

async function imageLayout(locator) {
    return locator.evaluate(img => {
        const bounds = img.getBoundingClientRect();
        const next = img.ownerDocument.querySelector('#prepare').getBoundingClientRect();
        return { width: bounds.width, height: bounds.height, below: next.top - bounds.top,
            widthAttr: img.getAttribute('width'), heightAttr: img.getAttribute('height') };
    });
}

async function expectProblemFigure(f, color = [38, 148, 68]) {
    for (const [page, teacher] of [[f.student, false], [f.teacher, true]]) {
        await page.waitForFunction(({ teacher, color }) => {
            const doc = teacher ? document.querySelector('#mirror iframe')?.contentDocument : document;
            const img = doc?.querySelector('#stage-example');
            if (!img?.complete || !img.naturalWidth || !img.naturalHeight) return false;
            const canvas = doc.createElement('canvas'); canvas.width = canvas.height = 1;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, Math.floor(img.naturalWidth / 2), Math.floor(img.naturalHeight / 2), 1, 1, 0, 0, 1, 1);
            const pixel = ctx.getImageData(0, 0, 1, 1).data;
            return color.every((value, i) => Math.abs(pixel[i] - value) < 16);
        }, { teacher, color }, { timeout: 6500 }).catch(async error => {
            const status = await (teacher ? f.frame() : f.student).locator('#stage-example').evaluate(img => ({
                width: img.naturalWidth, height: img.naturalHeight, layoutHeight: img.getBoundingClientRect().height,
                nextHeadingTop: img.ownerDocument.querySelector('#prepare').getBoundingClientRect().top,
            }));
            throw new Error(`${teacher ? 'teacher' : 'learner'} did not render the expected image pixel: ${JSON.stringify(status)}, viewer image requests: ${f.urls.filter(item => item.teacher).length}`, { cause: error });
        });
    }
    const learner = await imageLayout(f.student.locator('#stage-example'));
    const teacher = await imageLayout(f.frame().locator('#stage-example'));
    assert.equal(learner.width, 380); assert.equal(learner.height, 190);
    for (const key of ['width', 'height', 'below']) assert(Math.abs(learner[key] - teacher[key]) < 1,
        `figure and next paragraph keep learner geometry: ${key}, ${JSON.stringify(learner)} vs ${JSON.stringify(teacher)}`);
}

async function expectProblemInk(f) {
    for (const [page, img] of [[f.teacher, f.frame().locator('#stage-example')], [f.student, f.student.locator('#stage-example')]]) {
        const path = page.locator('[data-share-drawing-stroke] path:nth-child(2)');
        await path.waitFor();
        const box = await img.boundingBox();
        const expected = [box.x + box.width / 4, box.y + box.height / 4, box.x + box.width * .75, box.y + box.height * .75];
        const actual = await path.evaluate(path => [0, path.getTotalLength()].flatMap(distance => {
            const point = path.getPointAtLength(distance).matrixTransform(path.getScreenCTM());
            return [point.x, point.y];
        }));
        actual.forEach((value, index) => assert(Math.abs(value - expected[index]) < 2,
            `ink keeps its endpoints on the same figure pixels: ${actual} vs ${expected}`));
    }
}

async function drawProblemInk(f) {
    const image = await f.frame().locator('#stage-example').boundingBox();
    await f.teacher.mouse.move(image.x + image.width / 4, image.y + image.height / 4);
    await f.teacher.mouse.down({ button: 'right' });
    await f.teacher.mouse.move(image.x + image.width * .75, image.y + image.height * .75, { steps: 5 });
    await f.teacher.mouse.up({ button: 'right' });
    await expectProblemInk(f);
}

it('a teacher draws across the same Scratch problem image pixels on both devices through panel scroll and stage zoom', async t => {
    const f = await problemImageFixture(t); await expectProblemFigure(f); await installProblemDrawing(f);
    await f.teacher.evaluate(() => { const stage = document.querySelector('#mirror'); stage.style.transform = 'scale(.77)'; stage.style.transformOrigin = 'top left'; });
    await drawProblemInk(f);
    await f.teacher.keyboard.press('Shift+Enter');
    await f.teacher.locator('[data-share-drawing-note-input]').fill('看图中心');
    await f.student.locator('[data-share-drawing-note-input]').waitFor();
    await f.student.locator('#question-panel').evaluate(node => { node.scrollTop = 60; });
    await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#question-panel').scrollTop === 60);
    await f.teacher.evaluate(() => { document.querySelector('#mirror').style.transform = 'scale(1.12)'; });
    await expectProblemInk(f);
    assert.deepEqual(f.errors, []);
});

it('a Scratch figure keeps its normal left click and routes teacher wheel movement only to the learner question panel', async t => {
    const f = await problemImageFixture(t); await expectProblemFigure(f); await installProblemDrawing(f);
    const figure = f.frame().locator('#stage-example');
    const box = await figure.boundingBox();
    await f.teacher.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(await f.teacher.locator('[data-share-drawing-stroke]').count(), 0);
    assert.equal(f.commands.filter(c => c.action === 'click').length, 0, 'a plain picture has no click command');
    await f.teacher.mouse.wheel(0, 65);
    await f.student.waitForFunction(() => document.querySelector('#question-panel').scrollTop > 45);
    await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#question-panel').scrollTop > 45);
    assert.equal(await f.student.evaluate(() => window.scrollY), 0);
    assert(f.commands.some(c => c.action === 'scroll'));
    await f.student.evaluate(() => {
        const image = document.querySelector('#stage-example');
        const link = document.createElement('a'); link.id = 'next-from-stage'; link.href = '/d/C0001/p/P2';
        image.after(link); link.append(image);
    });
    await f.frame().locator('#next-from-stage #stage-example').waitFor();
    const linked = await figure.boundingBox();
    const x = linked.x + linked.width / 3; const y = linked.y + linked.height / 2;
    await f.teacher.mouse.move(x, y);
    // A drag can leave the underlying image while the secondary button is held.
    await f.teacher.mouse.down({ button: 'right' });
    await f.teacher.mouse.move(linked.x + linked.width + 25, y + 4, { steps: 8 });
    await f.teacher.mouse.up({ button: 'right' });
    const stroke = f.student.locator('[data-share-drawing-stroke] path:nth-child(2)');
    await stroke.waitFor();
    assert(await stroke.evaluate(path => path.getTotalLength()) > linked.width * .68);
    assert.equal(f.commands.filter(c => c.action === 'click').length, 0, 'a secondary drag on the linked figure never navigates');
    if (process.env.HYDRO_WEBKIT === '1') {
        await f.teacher.keyboard.down('Control');
        await f.teacher.mouse.move(x, y); await f.teacher.mouse.down();
        await f.teacher.mouse.move(x + 28, y + 14, { steps: 3 }); await f.teacher.mouse.up();
        await f.teacher.keyboard.up('Control');
        await f.student.waitForFunction(() => document.querySelectorAll('[data-share-drawing-stroke]').length === 2);
        assert.equal(f.commands.filter(c => c.action === 'click').length, 0, 'Mac Control-click can also draw without opening the picture link');
    }
    await f.teacher.mouse.click(x, y);
    await f.student.waitForURL('**/d/C0001/p/P2');
    assert.equal(f.commands.filter(c => c.action === 'click').length, 1);
    assert.equal(await f.teacher.evaluate(() => location.pathname), '/teacher');
    assert.deepEqual(f.errors, []);
});

it('a late learner-only Scratch figure survives a signed URL expiring, picture source replacement and reconnect', async t => {
    const f = await problemImageFixture(t, { protectedImage: true, late: true });
    await f.student.locator('#stage-source').evaluate((source, url) => { source.srcset = url; }, f.url);
    await f.student.waitForFunction(() => document.querySelector('#stage-example').complete === false);
    f.openGate(); await expectProblemFigure(f);
    await f.student.locator('#stage-source').evaluate(node => { node.srcset = './figures/replacement.png?signature=second-learner-only-example'; });
    await expectProblemFigure(f, [224, 128, 34]);
    await installProblemDrawing(f); await drawProblemInk(f);
    await f.teacher.keyboard.press('Shift+Enter');
    await f.teacher.locator('[data-share-drawing-note-input]').fill('看替换后的舞台');
    await f.student.waitForFunction(() => document.querySelector('[data-share-drawing-note-input]')?.value === '看替换后的舞台');
    await Promise.all([f.teacher.evaluate(() => { ink.setConnected(false); viewer.setConnected(false); }),
        f.student.evaluate(() => { ink.setConnected(false); source.setConnected(false); })]);
    await f.teacher.evaluate(() => {
        window.previousReplay = document.querySelector('#mirror iframe');
        window.previousImageInput = document.querySelector('[data-live-share-image-input]');
        viewer.setConnected(true); ink.setConnected(true);
    });
    await f.student.evaluate(() => { source.setConnected(true); ink.setConnected(true); });
    await f.teacher.waitForFunction(() => viewer.getDrawingDocument() && document.querySelector('#mirror iframe') !== previousReplay);
    await expectProblemFigure(f, [224, 128, 34]);
    await f.student.waitForFunction(() => document.querySelector('[data-share-drawing-note-input]')?.value === '看替换后的舞台');
    await expectProblemInk(f);
    if (process.env.HYDRO_WEBKIT === '1') {
        await f.teacher.waitForFunction(() => previousImageInput && !previousImageInput.isConnected
            && document.querySelectorAll('[data-live-share-image-input]:not([hidden])').length === 1);
    }
    assert.equal(f.urls.filter(({ teacher }) => teacher).length, 0, 'viewers never need to request learner-only URLs');
    assert.deepEqual(f.errors, []);
});

it('replays the 2025-03 meteor problem layout after its protected Hydro attachment redirects', async t => {
    // Run the same route and geometry test on every machine. Local acceptance
    // can supply the archived exam JPEG without shipping the question bank.
    let bytes;
    if (process.env.LIVE_SHARE_PROBLEM_FIGURE) {
        bytes = fs.readFileSync(process.env.LIVE_SHARE_PROBLEM_FIGURE);
        assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), 'c043027e3ce60bf5da68761b15374de63c3256e63fadde4f027124870fa3f0b5');
    } else {
        const generator = await browser.newPage();
        const image = await generator.evaluate(() => {
            const canvas = document.createElement('canvas'); canvas.width = 969; canvas.height = 1109;
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 969, 1109);
            gradient.addColorStop(0, '#e98225'); gradient.addColorStop(.5, '#3e7050'); gradient.addColorStop(1, '#ecf3fc');
            ctx.fillStyle = gradient; ctx.fillRect(0, 0, 969, 1109);
            return canvas.toDataURL('image/jpeg').split(',')[1];
        });
        await generator.close(); bytes = Buffer.from(image, 'base64');
    }
    const resource = '/d/S0001/file/2/gesp-scratch-202503-t2-c043027e3ce60bf5.jpeg?noDisposition=1';
    const hits = [];
    // The browser itself follows the redirect to another origin with no CORS
    // header. Playwright does not route redirected requests a second time.
    const cdn = require('node:http').createServer((request, response) => {
        response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }); response.end(bytes);
    });
    await new Promise(resolve => cdn.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { cdn.closeAllConnections(); cdn.close(resolve); }));
    const cdnOrigin = `http://127.0.0.1:${cdn.address().port}`;
    const attachment = require('node:http').createServer((req, response) => {
        if (req.headers['x-hydro-media-cache'] === 'share-raster-v1') {
            response.writeHead(200, { 'Content-Type': 'image/jpeg' }); response.end(bytes);
        } else {
            response.writeHead(302, { Location: cdnOrigin + '/protected/meteor.jpg?expires=120' }); response.end();
        }
    });
    await new Promise(resolve => attachment.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { attachment.closeAllConnections(); attachment.close(resolve); }));
    const f = await fixture({ teacherDpr: 2, studentDpr: 1, origin: `http://127.0.0.1:${attachment.address().port}`, editorMarkup: `
        <aside id="question-panel" class="scratch-problem-question" style="height:580px;overflow:auto;width:380px">
            <h1>GESP Scratch一级 · 躲避陨石</h1><div class="scratch-problem-description typo">
            <p><strong>题目难度：3 / 10</strong></p><h3>舞台示例</h3>
            <p><img id="stage-example" alt="躲避陨石：原卷舞台与角色示例" src="${resource}" style="max-width:100%;height:auto"></p>
            <h3 id="prepare">准备工作</h3><ol><li>删除默认小猫角色。</li><li>添加角色 Rocks 和 Rocketship。</li></ol></div>
            <div style="height:620px"></div></aside>`,
        async serveImage(route, teacher) {
            const req = route.request();
            const url = new URL(req.url());
            hits.push({ teacher, host: url.host, type: req.resourceType() });
            if (teacher) return route.fulfill({ status: 403, body: 'Attachment unavailable to viewer' });
            return route.continue();
        } });
    t.after(f.close);
    await f.student.waitForFunction(() => document.querySelector('#stage-example').naturalHeight === 1109);
    // The native cross-origin picture really is opaque to the student's canvas.
    assert.equal(await f.student.locator('#stage-example').evaluate(img => {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.drawImage(img, 0, 0); try { ctx.getImageData(0, 0, 1, 1); } catch (err) { return err.name; }
    }), 'SecurityError');
    await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#stage-example')?.naturalHeight > 0);
    const averageError = await f.frame().locator('#stage-example').evaluate(async (img, data) => {
        const reference = new Image(); reference.src = 'data:image/jpeg;base64,' + data; await reference.decode();
        function samples(image) {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
            const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, 0, 0, 160, 160);
            const pixels = ctx.getImageData(0, 0, 160, 160).data; const blocks = new Float64Array(16 * 16 * 3);
            for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
                const block = (Math.floor(y / 10) * 16 + Math.floor(x / 10)) * 3;
                for (let c = 0; c < 3; c++) blocks[block + c] += pixels[(y * 160 + x) * 4 + c] / 100;
            }
            return blocks;
        }
        const actual = samples(img); const expected = samples(reference);
        let sum = 0;
        for (let i = 0; i < actual.length; ++i) sum += Math.abs(actual[i] - expected[i]);
        return sum / actual.length;
    }, bytes.toString('base64'));
    assert(averageError < 6, `teacher sees the same original diagram, mean RGB error was ${averageError}`);
    const studentLayout = await imageLayout(f.student.locator('#stage-example'));
    const teacherLayout = await imageLayout(f.frame().locator('#stage-example'));
    for (const key of ['width', 'height', 'below']) assert(Math.abs(studentLayout[key] - teacherLayout[key]) < 1,
        `${key} must match the original exam figure: ${JSON.stringify(studentLayout)} vs ${JSON.stringify(teacherLayout)}`);
    assert.equal(hits.filter(hit => hit.teacher).length, 0);
    assert(hits.some(hit => !hit.teacher && hit.type === 'fetch'), 'the learner can read their authorized Hydro attachment');
    await installProblemDrawing(f);
    await f.student.locator('#question-panel').evaluate(panel => { panel.scrollTop = 110; });
    await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#question-panel').scrollTop === 110);
    await drawProblemInk(f);
    if (process.env.LIVE_SHARE_IMAGE_SCREENSHOT) await f.teacher.screenshot({ path: process.env.LIVE_SHARE_IMAGE_SCREENSHOT, clip: { x: 0, y: 36, width: 380, height: 570 } });
    assert.deepEqual(f.errors, []);
});

it('keeps an ordinary public external problem figure visible without CORS and never hands its signed replacement to the viewer', async t => {
    const host = 'http://lesson-figures.example';
    const publicUrl = host + '/diagrams/meteor.png';
    const token = 'learner-only-expiring-access';
    const privateUrl = host + '/diagrams/meteor.png?signature=' + token;
    let bytes;
    // Both engines fetch the non-localhost image URL through this loopback
    // proxy. The response actually omits CORS headers and needs no redirect.
    const cdn = require('node:http').createServer((request, response) => {
        if (!bytes || ![publicUrl, privateUrl].includes(request.url)) {
            response.writeHead(404); response.end(); return;
        }
        response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); response.end(bytes);
    });
    await new Promise(resolve => cdn.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { cdn.closeAllConnections(); cdn.close(resolve); }));
    const f = await fixture({ origin: 'http://classroom.sharing.test', proxy: { server: `http://127.0.0.1:${cdn.address().port}` },
        editorMarkup: '<div class="scratch-problem-description"><img id="public-figure" width="250" height="125"></div>' });
    t.after(f.close);
    bytes = Buffer.from(await f.student.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 250; canvas.height = 125;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#40693d'; ctx.fillRect(0, 0, 250, 125);
        return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    const requests = [];
    for (const [page, viewer] of [[f.student, false], [f.teacher, true]]) {
        page.context().on('request', request => {
            if (!request.url().startsWith(host + '/')) return;
            requests.push({ viewer, url: request.url(), kind: request.resourceType(), referrer: request.headers().referer });
        });
    }
    await f.student.locator('#public-figure').evaluate((img, url) => { img.src = url; }, publicUrl);
    await f.student.waitForFunction(() => document.querySelector('#public-figure').complete && document.querySelector('#public-figure').naturalWidth === 250);
    assert.equal(await f.student.locator('#public-figure').evaluate(img => {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.drawImage(img, 0, 0); try { ctx.getImageData(0, 0, 1, 1); } catch (error) { return error.name; }
    }), 'SecurityError');
    assert.equal(await f.student.evaluate(async url => {
        try { await fetch(url, { credentials: 'omit', mode: 'cors' }); return 'readable'; } catch { return 'blocked'; }
    }, publicUrl), 'blocked');
    await f.teacher.waitForFunction(url => {
        const img = document.querySelector('#mirror iframe').contentDocument.querySelector('#public-figure');
        return img.currentSrc === url && img.complete && img.naturalWidth === 250;
    }, publicUrl);
    assert(requests.some(hit => hit.viewer && hit.url === publicUrl && hit.kind === 'image' && !hit.referrer));
    await f.student.locator('#public-figure').evaluate((img, url) => { img.src = url; }, privateUrl);
    await f.student.waitForFunction(url => {
        const img = document.querySelector('#public-figure');
        return img.currentSrc === url && img.complete && img.naturalWidth === 250;
    }, privateUrl);
    await f.teacher.waitForFunction(() => {
        const img = document.querySelector('#mirror iframe').contentDocument.querySelector('#public-figure');
        return !img.hasAttribute('src') && img.naturalWidth === 0 && img.alt === '题目图片暂时无法共享';
    });
    const box = await f.frame().locator('#public-figure').evaluate(img => {
        const rect = img.getBoundingClientRect(); return [rect.width, rect.height];
    });
    assert.deepEqual(box, [250, 125], await f.frame().locator('#public-figure').evaluate(img => img.outerHTML));
    assert(!requests.some(hit => hit.viewer && hit.url.includes(token)));
    assert(!JSON.stringify(f.packets).includes(token));
    assert(!await f.frame().locator('html').evaluate((html, value) => html.outerHTML.includes(value), token));
    await f.student.locator('#public-figure').evaluate((img, url) => { img.src = url; }, publicUrl);
    await f.teacher.waitForFunction(url => {
        const img = document.querySelector('#mirror iframe').contentDocument.querySelector('#public-figure');
        return img.currentSrc === url && img.complete && img.naturalWidth === 250 && !img.hasAttribute('alt');
    }, publicUrl);
    // WebKit reports even caught access-control failures as pageerror events.
    // Both learner reads are intentionally denied by this server.
    const expectedCorsErrors = new Set([publicUrl, privateUrl].map(url =>
        'student: ' + url.replace('http:/', '') + ' due to access control checks.'));
    assert.deepEqual(f.errors.filter(message => !expectedCorsErrors.has(message)), []);
});
