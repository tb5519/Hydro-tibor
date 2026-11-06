const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { test } = require('node:test');
const { build, transformSync } = require('esbuild');
const { WebSocketServer } = require('ws');
const stylus = require('stylus');
const nunjucks = require('nunjucks');

const root = path.resolve(__dirname, '..');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Local runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((file) => file && fs.existsSync(file));
const protocolModule = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/live_share.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: protocolModule, exports: protocolModule.exports, require, URL, Buffer });

test('different screen sizes and DPR preserve source editor geometry, concurrent input, Scratch frames and the teacher original page', { timeout: 90000 }, async () => {
    assert(executablePath, 'Chromium is required for cross-resolution sharing integration');
    const options = { absWorkingDir: root, bundle: true, write: false, minify: true, format: 'iife', platform: 'browser',
        loader: { '.css': 'empty', '.ttf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } };
    const controller = (await build({ ...options, globalName: 'LiveShare', entryPoints: ['packages/ui-default/components/live_share/controller.ts'],
        plugins: [{ name: 'actual-browser-monaco', setup(builder) {
            builder.onResolve({ filter: /^monaco-editor\// }, () => ({ path: 'monaco', namespace: 'runtime' }));
            builder.onResolve({ filter: /^vj\/components\/monaco\/loader$/ }, () => ({ path: 'loader', namespace: 'runtime' }));
            builder.onLoad({ filter: /.*/, namespace: 'runtime' }, ({ path: name }) => ({ contents: name === 'monaco'
                ? 'module.exports=window.monaco;' : 'export const load = async () => ({monaco:window.monaco});' }));
        } }],
    })).outputFiles[0].text;
    const capture = (await build({ ...options, entryPoints: ['packages/ui-default/components/live_share/frame_capture.ts'],
        plugins: [{ name: 'capture-only', setup(builder) {
            builder.onResolve({ filter: /^\.\/vendor$/ }, (args) => args.importer.endsWith('/mirror.ts')
                ? { path: path.join(root, 'packages/ui-default/components/live_share/capture_vendor.js') } : undefined);
        } }],
    })).outputFiles[0].text;
    const assistantJs = transformSync(fs.readFileSync(path.join(root, 'packages/ui-default/components/teacher_assistant.ts'), 'utf8'),
        { loader: 'ts', format: 'iife', globalName: 'TeacherAssistant' }).code;
    const css = ['teacher_assistant', 'live_share'].map((name) => stylus.render(fs.readFileSync(
        path.join(root, `packages/ui-default/components/${name}.page.styl`), 'utf8'))).join('\n');
    const assistant = new nunjucks.Environment(null, { autoescape: true }).renderString(fs.readFileSync(
        path.join(root, 'packages/ui-default/templates/partials/teacher_assistant.html'), 'utf8'), {
        handler: { user: { _id: 2, hasPerm: () => true, hasPriv: () => true }, domain: { _id: 'system' }, session: {} },
        perm: { PERM_EDIT_DOMAIN: 1 }, PRIV: { PRIV_EDIT_SYSTEM: 1, PRIV_ALL: 1, PRIV_USER_PROFILE: 1 },
        UiContext: { liveShare: { canTeach: true } }, page_name: 'homepage', model: {}, url: (name) => `/${name}`,
    });
    const monacoFolder = path.join(root, 'node_modules/monaco-editor/min/vs');
    const publicFolder = path.join(root, 'packages/ui-default/public');
    let origin;
    const peers = new Map(); let room;
    const errors = []; const transportErrors = [];
    const send = (uid, message) => { const ws = peers.get(uid)?.ws; if (ws?.readyState === 1) ws.send(JSON.stringify(message)); };
    const announce = () => {
        const student = peers.get(5); if (!room || !student || !peers.get(2)) return;
        room.pageId = student.pageId;
        send(2, { type: 'started', sessionId: room.id, studentUid: 5, studentName: '学员5', teacherName: '唐老师', tabId: student.tabId, pageId: student.pageId });
        send(5, { type: 'share-start', sessionId: room.id, teacherUid: 2, teacherName: '唐老师', tabId: student.tabId, pageId: student.pageId });
    };
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, origin || 'http://localhost');
        if (url.pathname === '/share.js' || url.pathname === '/scratch-editor/test-capture.js') {
            response.setHeader('Content-Type', 'application/javascript'); response.setHeader('Access-Control-Allow-Origin', '*');
            response.end(url.pathname === '/share.js' ? `${controller}\n${assistantJs}` : capture); return;
        }
        if (url.pathname.startsWith('/vs/') || url.pathname.startsWith('/scratch-editor/')) {
            const folder = url.pathname.startsWith('/vs/') ? monacoFolder : publicFolder;
            const relative = url.pathname.startsWith('/vs/') ? url.pathname.slice(4) : `.${url.pathname}`;
            const file = path.resolve(folder, relative);
            if (!file.startsWith(`${folder}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
            response.setHeader('Access-Control-Allow-Origin', '*');
            response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.html') ? 'text/html; charset=utf-8'
                : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
            if (file.endsWith('/editor.html')) {
                response.end(fs.readFileSync(file, 'utf8').replace(/<script\b[^>]*\bdata-live-share-capture\b[^>]*>\s*<\/script>/g, '')
                    .replace('</body>', '<script crossorigin="anonymous" defer src="/scratch-editor/test-capture.js"></script></body>'));
            } else fs.createReadStream(file).pipe(response);
            return;
        }
        const teacher = url.searchParams.get('uid') === '2';
        const scratch = url.pathname === '/scratch/editor';
        const uid = teacher ? 2 : 5;
        const config = { enabled: true, uid, canTeach: teacher, socketUrl: `/live-share/conn?uid=${uid}`, ...(teacher ? {} : { pageGrant: 'test-page-grant' }) };
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html><head><meta charset="utf-8"><style>
            *{box-sizing:border-box}body{margin:0;font-family:system-ui;background:#eef1f4}#original{width:${teacher ? '520px' : 'calc(100vw - 96px)'};height:${teacher ? '280px' : '400px'};margin:24px 48px}h1{margin:20px 48px}
            #scratchpad{margin:20px 48px}#scratchpad button,#next{padding:14px;font:18px system-ui}#scratch-frame{position:absolute;inset:0;width:100vw;height:100vh;border:0}${css}
            </style></head><body>${scratch ? '<iframe id="scratch-frame" sandbox="allow-scripts" src="/scratch-editor/editor.html?lang=zh-cn#channel=resolution-scratch-1234"></iframe>' : `
            <h1>${teacher ? '老师自己的工作页面' : '学员正在编程'}</h1><div id="original"></div><div id="scratchpad"><button id="run" type="button" class="scratchpad__toolbar__pretest">运行测试</button><span id="result">尚未运行</span></div>
            <a id="next" href="/scratch/editor?uid=5">打开 Scratch</a><div style="height:1800px"></div>`}
            ${teacher ? assistant : ''}<script src="/vs/loader.js"></script><script src="/share.js"></script><script>
            window.UiContext={};window.UserContext={_id:${uid}};window.runs=0;window.childLoaded=false;
            document.querySelector('#run')?.addEventListener('click',()=>{runs++;document.querySelector('#result').textContent='已运行 '+runs});
            window.addEventListener('message',e=>{if(e.source!==document.querySelector('#scratch-frame')?.contentWindow||e.origin!=='null'||e.data?.channel!=='resolution-scratch-1234')return;
                if(e.data.type==='ready')e.source.postMessage({type:'init',channel:e.data.channel,mode:'editor',readOnly:false,title:'分辨率验证'},'*');
                if(e.data.type==='loaded')childLoaded=true;});
            require.config({paths:{vs:'/vs'}});require(['vs/editor/editor.main'],()=>{
                if(!${scratch})window.editor=monaco.editor.create(document.getElementById('original'),{value:${JSON.stringify(teacher ? '# teacher original draft' : 'print("student")')},language:'python',fontSize:${teacher ? 15 : 20},lineHeight:${teacher ? 23 : 31},minimap:{enabled:false},wordWrap:'on',automaticLayout:true});
                window.originalEditorId=window.editor?.getId?.();window.sharedEditor=()=>monaco.editor.getEditors().find(e=>e.getId()!==originalEditorId);
                TeacherAssistant.installTeacherAssistant();window.disposeShare=LiveShare.installLiveShare(${JSON.stringify(config)});window.ready=true;
            });</script></body></html>`);
    });
    const wss = new WebSocketServer({ server });
    wss.on('connection', (ws, request) => {
        const uid = Number(new URL(request.url, 'http://localhost').searchParams.get('uid'));
        ws.on('message', (raw) => {
            if (String(raw) === 'ping') { ws.send('pong'); return; }
            try {
                const message = JSON.parse(raw);
                if (message.type === 'hello') { peers.set(uid, { ...message, ws }); send(uid, { type: 'ready', uid, canTeach: uid === 2 }); announce(); }
                else if (message.type === 'list') send(uid, { type: 'students', students: [{ uid: 5, name: '学员5', online: peers.has(5) }] });
                else if (message.type === 'start') { room = { id: `resolution-session-${Date.now()}` }; announce(); }
                else if (message.type === 'relay' && room && room.id === message.sessionId && room.pageId === message.pageId) {
                    protocolModule.exports.validateRelayData(uid === 2 ? 'teacher' : 'student', message.kind, message.data, message.pageId);
                    // Latency ensures both users edit before receiving each other's operations.
                    setTimeout(() => send(uid === 2 ? 5 : 2, message), 60);
                } else if (message.type === 'stop' && room?.id === message.sessionId) {
                    const id = room.id; room = null; send(2, { type: 'ended', sessionId: id }); send(5, { type: 'ended', sessionId: id });
                }
            } catch (error) { transportErrors.push(error.message); }
        });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await playwright.chromium.launch({ executablePath, headless: true });
    const studentContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const teacherContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const student = await studentContext.newPage(); const teacher = await teacherContext.newPage();
    for (const page of [student, teacher]) { page.setDefaultTimeout(15000); page.on('pageerror', (error) => errors.push(error.message)); }
    try {
        await Promise.all([student.goto(`${origin}/p/1?uid=5`), teacher.goto(`${origin}/teacher?uid=2`)]);
        await Promise.all([student.waitForFunction(() => ready), teacher.waitForFunction(() => ready)]);
        await teacher.evaluate(() => window.scrollTo(0, 230));
        const original = await teacher.evaluate(() => ({ url: location.href, width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
            scroll: scrollY, code: editor.getValue(), layout: editor.getLayoutInfo(), font: editor.getOption(monaco.editor.EditorOption.fontInfo) }));
        await teacher.locator('[data-assistant-toggle]').click(); await teacher.locator('[data-live-share-open]').click();
        await teacher.getByRole('button', { name: /学员5/ }).click();
        await teacher.waitForFunction(() => sharedEditor()?.getValue() === 'print("student")');
        await teacher.waitForFunction(() => document.querySelector('.live-share-stage')?.style.width === '1920px');
        await teacher.frameLocator('.live-share-mirror iframe').locator('#run').waitFor();
        const sourceLayout = await student.evaluate(() => ({ layout: editor.getLayoutInfo(), font: editor.getOption(monaco.editor.EditorOption.fontInfo), dpr: devicePixelRatio }));
        const sharedLayout = await teacher.evaluate(() => ({ layout: sharedEditor().getLayoutInfo(), font: sharedEditor().getOption(monaco.editor.EditorOption.fontInfo),
            stage: { width: document.querySelector('.live-share-stage').style.width, height: document.querySelector('.live-share-stage').style.height } }));
        assert.equal(original.dpr, 2); assert.equal(sourceLayout.dpr, 1);
        assert.equal(sharedLayout.stage.width, '1920px'); assert.equal(sharedLayout.stage.height, '1080px');
        assert.equal(sharedLayout.font.fontSize, sourceLayout.font.fontSize); assert.equal(sharedLayout.font.lineHeight, sourceLayout.font.lineHeight);
        assert.equal(sharedLayout.layout.width, sourceLayout.layout.width); assert.equal(sharedLayout.layout.height, sourceLayout.layout.height);
        const stage = await teacher.locator('.live-share-stage').boundingBox();
        assert(stage.width <= 1280.5 && stage.height <= 800.5, 'default fit keeps the complete student screen visible');
        const sourceBox = await student.locator('#original').boundingBox();
        const mirrorBox = await teacher.locator('.live-share-editors .monaco-editor').boundingBox();
        const scale = stage.width / 1920;
        assert(Math.abs(mirrorBox.width - sourceBox.width * scale) < 2);
        assert(Math.abs(mirrorBox.x - (stage.x + sourceBox.x * scale)) < 2);
        if (process.env.LIVE_SHARE_SCREENSHOTS === '1') {
            const file = path.join(os.tmpdir(), 'live-share-resolution-fit.png');
            await teacher.screenshot({ path: file }); console.log(`Fit preview: ${file}`);
        }
        await teacher.frameLocator('.live-share-mirror iframe').locator('#run').click();
        await student.waitForFunction(() => runs === 1);
        await Promise.all([
            student.evaluate(() => editor.executeEdits('student', [{ range: new monaco.Range(1, 1, 1, 1), text: '# student\n' }])),
            teacher.evaluate(() => sharedEditor().executeEdits('teacher', [{ range: new monaco.Range(1, 1, 1, 1), text: '# teacher\n' }])),
        ]);
        await student.waitForFunction(() => editor.getValue().includes('# teacher') && editor.getValue().includes('# student'));
        await teacher.waitForFunction(() => sharedEditor().getValue().includes('# teacher') && sharedEditor().getValue().includes('# student'));
        assert.equal(await teacher.evaluate(() => sharedEditor().getValue()), await student.evaluate(() => editor.getValue()));
        const sourceViewBeforeZoom = await student.evaluate(() => ({ width: innerWidth, height: innerHeight, x: scrollX, y: scrollY,
            font: editor.getOption(monaco.editor.EditorOption.fontInfo).fontSize, layoutWidth: editor.getLayoutInfo().width }));
        assert.equal(await teacher.locator('[data-share-zoom-fit]').getAttribute('aria-pressed'), 'true');
        await teacher.locator('[data-share-zoom-in]').click();
        assert((await teacher.locator('.live-share-stage').boundingBox()).width > stage.width + 10, 'the zoom button enlarges the entire shared scene');
        await teacher.locator('[data-share-zoom-value]').click();
        await teacher.waitForFunction(() => Math.abs(document.querySelector('.live-share-stage').getBoundingClientRect().width - 1920) < 1);
        assert.deepEqual(await teacher.locator('.live-share-viewport').evaluate((node) => ({ x: node.scrollLeft, y: node.scrollTop })),
            { x: 0, y: 0 }, '100% starts at the top left so the beginning of each code line remains visible');
        if (process.env.LIVE_SHARE_SCREENSHOTS === '1') {
            const file = path.join(os.tmpdir(), 'live-share-resolution-readable.png');
            await teacher.screenshot({ path: file }); console.log(`Readable preview: ${file}`);
        }
        await teacher.evaluate(() => document.querySelector('.live-share-viewport').scrollTo(200, 80));
        assert((await teacher.locator('.live-share-viewport').evaluate((node) => node.scrollLeft)) >= 199,
            '100% source size can be panned on a smaller teacher display');
        assert.deepEqual(await student.evaluate(() => ({ width: innerWidth, height: innerHeight, x: scrollX, y: scrollY,
            font: editor.getOption(monaco.editor.EditorOption.fontInfo).fontSize, layoutWidth: editor.getLayoutInfo().width })), sourceViewBeforeZoom,
        'teacher zoom and pan never resize, scroll or change the learner editor');
        await teacher.locator('[data-share-zoom-fit]').click();
        assert.equal(await teacher.locator('.live-share-viewport').evaluate((node) => node.scrollLeft), 0);
        await teacher.setViewportSize({ width: 1024, height: 768 });
        await teacher.waitForFunction(() => document.querySelector('.live-share-stage').getBoundingClientRect().width <= 1024.5);
        assert((await teacher.locator('.live-share-stage').boundingBox()).height <= 768.5);
        await teacher.setViewportSize({ width: 1280, height: 800 });
        await teacher.waitForFunction(() => Math.abs(document.querySelector('.live-share-stage').getBoundingClientRect().width - 1280) < 1);
        await teacher.frameLocator('.live-share-mirror iframe').locator('#run').click();
        await student.waitForFunction(() => runs === 2);
        await teacher.frameLocator('.live-share-mirror iframe').locator('#next').click();
        await student.waitForURL('**/scratch/editor?uid=5');
        await student.waitForFunction(() => childLoaded);
        await teacher.locator('[data-live-share-frame-viewer] iframe').waitFor();
        await teacher.waitForFunction(() => !document.querySelector('[data-live-share-frame-viewer]')?.hidden);
        const scratchStage = await teacher.locator('.live-share-stage').boundingBox();
        const scratchBox = await teacher.locator('[data-live-share-frame-viewer]').boundingBox();
        assert(Math.abs(scratchStage.width - scratchBox.width) < 2 && Math.abs(scratchStage.height - scratchBox.height) < 2,
            'the full-size Scratch child stays aligned inside the scaled student viewport');
        const childViewport = await teacher.locator('[data-live-share-frame-viewer] iframe').evaluate((frame) => ({ width: frame.contentWindow.innerWidth, height: frame.contentWindow.innerHeight }));
        assert.deepEqual(childViewport, { width: 1920, height: 1080 }, 'Scratch uses source CSS pixels, not teacher DPR pixels');
        await teacher.locator('[data-share-zoom-value]').click();
        await teacher.waitForFunction(() => Math.abs(document.querySelector('[data-live-share-frame-viewer]').getBoundingClientRect().width - 1920) < 1);
        assert.deepEqual(await teacher.locator('[data-live-share-frame-viewer] iframe').evaluate((frame) => ({ width: frame.contentWindow.innerWidth, height: frame.contentWindow.innerHeight })),
            childViewport, 'Scratch is scaled together with the page without changing its inner layout');
        await teacher.locator('[data-share-zoom-fit]').click();
        await teacher.locator('[data-assistant-toggle]').click(); await teacher.getByRole('button', { name: '断开共享', exact: true }).click();
        await teacher.waitForFunction(() => !document.querySelector('.live-share-overlay'));
        const restored = await teacher.evaluate(() => ({ url: location.href, width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
            scroll: scrollY, code: editor.getValue(), layout: editor.getLayoutInfo(), font: editor.getOption(monaco.editor.EditorOption.fontInfo) }));
        assert.equal(restored.url, original.url); assert.equal(restored.code, original.code); assert.equal(restored.scroll, original.scroll);
        assert.equal(restored.width, original.width); assert.equal(restored.height, original.height); assert.equal(restored.dpr, original.dpr);
        assert.equal(restored.layout.width, original.layout.width); assert.equal(restored.font.fontSize, original.font.fontSize);
        assert.deepEqual(errors, []); assert.deepEqual(transportErrors, []);
    } catch (error) {
        error.message += `\nBrowser: ${JSON.stringify(errors)}\nTransport: ${JSON.stringify(transportErrors)}\nStatus: ${await teacher.locator('.live-share-status').textContent().catch(() => '')}`;
        throw error;
    } finally {
        await studentContext.close(); await teacherContext.close(); await browser.close();
        wss.clients.forEach((ws) => ws.terminate()); await new Promise((resolve) => server.close(resolve));
    }
});
