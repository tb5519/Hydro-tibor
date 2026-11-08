const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { test } = require('node:test');
const { build, buildSync, transformSync } = require('esbuild');
const { WebSocketServer } = require('ws');
const stylus = require('stylus');
const nunjucks = require('nunjucks');

const root = path.resolve(__dirname, '..');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Local browser runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((file) => file && fs.existsSync(file));
const protocolModule = { exports: {} };
vm.runInNewContext(buildSync({ absWorkingDir: root, entryPoints: ['packages/hydrooj/src/lib/teacher_broadcast.ts'],
    bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text,
{ module: protocolModule, exports: protocolModule.exports, require, URL, Buffer });

test('one teacher broadcasts to two selected learners, with read-only pen questions, navigation recovery and untouched learner drafts', { timeout: 120000 }, async () => {
    assert(executablePath, 'Chromium is required for real multi-viewer sharing integration');
    const controller = (await build({ absWorkingDir: root, bundle: true, write: false, minify: true,
        format: 'iife', platform: 'browser', globalName: 'LiveShare', entryPoints: ['packages/ui-default/components/live_share/controller.ts'],
        loader: { '.css': 'empty', '.ttf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' },
        plugins: [{ name: 'actual-browser-monaco', setup(builder) {
            builder.onResolve({ filter: /^monaco-editor\// }, () => ({ path: 'monaco', namespace: 'runtime' }));
            builder.onResolve({ filter: /^vj\/components\/monaco\/loader$/ }, () => ({ path: 'loader', namespace: 'runtime' }));
            builder.onResolve({ filter: /^vj\/utils$/ }, () => ({ path: 'utils', namespace: 'runtime' }));
            builder.onLoad({ filter: /.*/, namespace: 'runtime' }, ({ path: name }) => ({ contents: name === 'monaco'
                ? 'module.exports=window.monaco;' : name === 'utils' ? 'export const request={get:async()=>({capacity:4,active:0})};'
                    : 'export const load = async () => ({monaco:window.monaco});' }));
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
    const peers = new Map(); const events = []; const errors = []; const transportErrors = [];
    let origin; let room; let snapshotTimer;
    const send = (uid, message) => { const ws = peers.get(uid)?.ws; if (ws?.readyState === 1) ws.send(JSON.stringify(message)); };
    const announce = () => {
        const teacher = peers.get(2); if (!room || !teacher) return;
        room.pageId = teacher.pageId;
        const info = { sessionId: room.id, teacherUid: 2, teacherName: '唐老师', pageId: room.pageId,
            studentUids: room.studentUids, viewers: room.studentUids.map((uid) => ({ uid, name: `学员${uid}`, online: peers.has(uid) })) };
        send(2, { type: 'broadcast:started', ...info });
        room.studentUids.forEach((uid) => send(uid, { type: 'broadcast:view', ...info }));
    };
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, origin || 'http://localhost');
        if (url.pathname === '/share.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(`${controller}\n${assistantJs}`); return; }
        if (url.pathname.startsWith('/vs/')) {
            const file = path.resolve(monacoFolder, url.pathname.slice(4));
            if (!file.startsWith(`${monacoFolder}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
            response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
            fs.createReadStream(file).pipe(response); return;
        }
        const uid = Number(url.searchParams.get('uid')) || 2; const teacher = uid === 2;
        const config = { enabled: true, uid, canTeach: teacher, socketUrl: `/live-share/conn?uid=${uid}`, pageGrant: 'test-page-grant' };
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html><head><meta charset="utf-8"><title>${teacher ? '老师示范' : `学员${uid}自己的作业`}</title><style>
        *{box-sizing:border-box}body{margin:0;font-family:Arial;background:#eef1f4}main{padding:30px 48px}h1{font-size:24px;margin:0 0 15px}
        #original{width:calc(100vw - 96px);height:300px;margin:20px 0}button,a{font:18px Arial}#draft{width:300px;height:50px}#run,#next{padding:12px}
        ${css}</style></head><body><main id="own-page"><h1>${teacher ? `老师示范 ${url.pathname}` : `学员${uid}自己的作业`}</h1>
        <button id="run" type="button">运行示范</button><span id="result">尚未运行</span><a id="next" href="/lesson-two?uid=${uid}">下一题</a>
        <p id="explanation">选中一段讲解，老师可以写批注，孩子只能用画笔圈出疑问。</p><div id="original"></div>
        <button id="far-focus" style="position:fixed;right:40px;bottom:130px">右侧演示</button><textarea id="draft">学员${uid}未提交的草稿</textarea><div style="height:1500px"></div></main><aside id="already-inert" inert>原本不可操作</aside>
        <aside data-class-chat data-live-share-private style="position:fixed;z-index:2147482300;right:18px;top:30px"><input id="private-chat-draft" aria-label="私聊草稿" placeholder="私聊" /></aside>
        ${teacher ? assistant : ''}<script src="/vs/loader.js"></script><script src="/share.js"></script><script>
        window.UiContext={};window.UserContext={_id:${uid}};window.runs=0;
        document.querySelector('#run').addEventListener('click',()=>{runs++;document.querySelector('#result').textContent='已运行 '+runs});
        require.config({paths:{vs:'/vs'}});require(['vs/editor/editor.main'],()=>{
          window.editor=monaco.editor.create(document.getElementById('original'),{value:${JSON.stringify(teacher ? '# teacher demonstration\nprint("hello")' : `# learner ${uid} own draft`)},language:'python',fontSize:20,lineHeight:30,minimap:{enabled:false},wordWrap:'on',automaticLayout:true});
          window.originalEditorId=editor.getId();window.sharedEditor=()=>monaco.editor.getEditors().find(e=>e.getId()!==originalEditorId);
          TeacherAssistant.installTeacherAssistant();window.disposeShare=LiveShare.installLiveShare(${JSON.stringify(config)});window.ready=true;
        });</script></body></html>`);
    });
    const wss = new WebSocketServer({ server });
    wss.on('connection', (ws, request) => {
        const uid = Number(new URL(request.url, 'http://localhost').searchParams.get('uid'));
        ws.on('message', (raw) => {
            if (String(raw) === 'ping') { ws.send('pong'); return; }
            try {
                const message = JSON.parse(raw); events.push({ uid, ...message });
                if (message.type === 'hello') { peers.set(uid, { ...message, ws }); send(uid, { type: 'ready', uid, canTeach: uid === 2 }); if (room && (uid === 2 || room.studentUids.includes(uid))) announce(); }
                else if (message.type === 'list') send(uid, { type: 'students', students: [5, 6, 7].map((id) => ({ uid: id, name: `学员${id}`, online: peers.has(id) })) });
                else if (message.type.startsWith('broadcast:')) {
                    protocolModule.exports.validateBroadcastMessage(message);
                    if (message.type === 'broadcast:start') { assert.equal(uid, 2); room = { id: `broadcast-session-${Date.now()}`, studentUids: message.studentUids }; announce(); }
                    else if (message.type === 'broadcast:stop' && room?.id === message.sessionId) {
                        assert.equal(uid, 2); const ending = room; room = null;
                        [2, ...ending.studentUids].forEach((id) => send(id, { type: 'broadcast:ended', sessionId: ending.id }));
                    } else if (room?.id === message.sessionId && room.pageId === message.pageId) {
                        if (message.type === 'broadcast:sync') {
                            if (!snapshotTimer) snapshotTimer = setTimeout(() => { snapshotTimer = null; if (room) send(2, { type: 'broadcast:resync', sessionId: room.id, pageId: room.pageId }); }, 100);
                        } else if (message.type === 'broadcast:relay') {
                            assert(uid === 2 || room.studentUids.includes(uid));
                            protocolModule.exports.validateBroadcastRelay(uid === 2, message.kind, message.data, message.pageId);
                            const payload = { ...message, senderUid: uid, data: message.kind === 'drawing' ? protocolModule.exports.broadcastDrawing(uid, message.data) : message.data };
                            [2, ...room.studentUids].filter((id) => id !== uid).forEach((id) => send(id, payload));
                        }
                    }
                }
            } catch (error) { transportErrors.push(`${uid}: ${error.message}`); }
        });
        ws.on('close', () => { if (peers.get(uid)?.ws === ws) { peers.delete(uid); if (uid === 2 && room) room.studentUids.forEach((id) => send(id, { type: 'broadcast:paused', sessionId: room.id })); } });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await playwright.chromium.launch({ executablePath, headless: true }); const contexts = []; const pages = [];
    for (const [uid, width, height, dpr] of [[2, 3840, 2160, 1], [5, 1180, 760, 2], [6, 900, 700, 1], [7, 1280, 800, 1]]) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr }); contexts.push(context);
        const page = await context.newPage(); page.uid = uid; pages.push(page); page.setDefaultTimeout(15000); page.on('pageerror', (error) => errors.push(`${uid}: ${error.message}`));
    }
    const [teacher, first, second, unselected] = pages; const viewers = [first, second];
    const ownState = (page) => page.evaluate(() => ({ url: location.href, code: editor.getValue(), draft: document.querySelector('#draft').value,
        scroll: scrollY, focus: document.activeElement?.id, runs, overflow: document.body.style.overflow, inert: document.querySelector('#own-page').inert }));
    try {
        await Promise.all(pages.map(async (page) => { await page.goto(`${origin}/lesson-one?uid=${page.uid}`); await page.waitForFunction(() => ready); }));
        for (const page of viewers) await page.evaluate(() => { document.querySelector('#draft').focus({ preventScroll: true }); window.scrollTo(0, 220); });
        const originals = await Promise.all(pages.slice(1).map(ownState));
        await teacher.locator('[data-assistant-toggle]').click(); await teacher.locator('[data-teacher-broadcast-open]').click();
        await teacher.getByRole('checkbox', { name: '分享给学员5', exact: true }).check();
        await teacher.getByRole('checkbox', { name: '分享给学员6', exact: true }).check();
        if (process.env.LIVE_BROADCAST_SCREENSHOTS === '1') await teacher.screenshot({ path: '/tmp/onebyone-broadcast-picker.png' });
        await teacher.getByRole('button', { name: '开始分享', exact: true }).click();
        await Promise.all(viewers.map((page) => page.waitForFunction(() => sharedEditor()?.getValue() === '# teacher demonstration\nprint("hello")')));
        assert.deepEqual(events.find((event) => event.type === 'broadcast:start').studentUids, [5, 6]);
        for (const page of viewers) {
            await page.waitForFunction(() => document.querySelector('.teacher-broadcast-stage').style.width === '3840px');
            assert.equal(await page.locator('.teacher-broadcast-stage').evaluate((node) => node.style.width), '3840px');
            assert.equal(await page.evaluate(() => sharedEditor().getOption(monaco.editor.EditorOption.readOnly)), true);
            assert.equal(await page.locator('#own-page').evaluate((node) => node.inert), true);
            assert.equal(await page.locator('[data-class-chat]').evaluate((node) => node.inert), false,
                'a learner can privately message the teacher while the broadcast locks the learning page');
            await page.locator('#private-chat-draft').fill('PRIVATE-LEARNER-QUESTION');
            assert.equal(await page.locator('#private-chat-draft').inputValue(), 'PRIVATE-LEARNER-QUESTION');
            assert.match(await page.locator('.teacher-broadcast-hint').textContent(), /左键.*圈出/);
            const stage = await page.locator('.teacher-broadcast-stage').boundingBox(); const viewport = await page.locator('.teacher-broadcast-viewport').boundingBox();
            assert(stage.width >= 3840 * .85 - 1, 'large teacher viewport never shrinks code below the readable scale');
            if (await page.locator('.teacher-broadcast-hint__view').isVisible()) {
                await page.getByRole('button', { name: '查看老师的完整画面' }).click();
                const full = await page.locator('.teacher-broadcast-stage').boundingBox();
                assert(full.width <= viewport.width + 1 && full.height <= viewport.height + 1, 'whole source remains one click away');
                await page.getByRole('button', { name: '放大并跟随老师正在讲解的位置' }).click();
            }
        }
        assert.equal(await unselected.locator('.teacher-broadcast-overlay').count(), 0);
        const position = (page) => page.locator('.teacher-broadcast-stage').evaluate(node => ({left:node.style.left,top:node.style.top}));
        const firstViewport = await first.locator('.teacher-broadcast-viewport').boundingBox();
        await first.mouse.move(firstViewport.x + 180, firstViewport.y + 160); await first.mouse.down();
        const frozen = await position(first);
        // Separate physical computers do not blur the learner while the teacher
        // clicks; dispatch the source pointer without changing the test browser's active tab.
        const farBox = await teacher.locator('#far-focus').boundingBox();
        const teacherInput = await teacher.context().newCDPSession(teacher);
        await teacherInput.send('Input.dispatchMouseEvent', {type:'mousePressed',x:farBox.x+30,y:farBox.y+10,button:'left',clickCount:1});
        await teacherInput.send('Input.dispatchMouseEvent', {type:'mouseReleased',x:farBox.x+30,y:farBox.y+10,button:'left',clickCount:1});
        await teacherInput.detach();
        await second.waitForFunction(() => parseFloat(document.querySelector('.teacher-broadcast-stage').style.left) < -1000);
        assert.deepEqual(await position(first), frozen, 'teacher focus cannot move the canvas while a learner is drawing');
        await first.mouse.up();
        await first.waitForFunction(() => parseFloat(document.querySelector('.teacher-broadcast-stage').style.left) < -1000);
        const beforeWheel = await position(first);
        await first.mouse.wheel(-400, -200);
        await first.waitForFunction(left => parseFloat(document.querySelector('.teacher-broadcast-stage').style.left) > left + 50, parseFloat(beforeWheel.left));
        const panned = await position(first);
        await teacher.locator('#run').click();
        await second.waitForFunction(() => parseFloat(document.querySelector('.teacher-broadcast-stage').style.left) > -100);
        await first.waitForTimeout(400);
        assert.deepEqual(await position(first), panned, 'manual inspection has a short follow lock and never controls the source');
        await first.getByRole('button', {name:'查看老师的完整画面'}).click();
        await first.getByRole('button', {name:'放大并跟随老师正在讲解的位置'}).click();
        await first.setViewportSize({width:1500,height:1000});
        assert((await first.locator('.teacher-broadcast-stage').boundingBox()).width >= 3840*.85-1, 'resizing the learner window keeps text readable');
        await first.setViewportSize({width:1180,height:760});
        await teacher.waitForFunction(() => !document.querySelector('[data-share-drawing-stroke]'), null, {timeout:10000});
        await teacher.evaluate(() => { editor.setValue(' '.repeat(240) + 'print("远处代码")'); editor.setPosition({lineNumber:1,column:241}); editor.focus(); });
        await teacher.keyboard.press('ArrowRight');
        await second.waitForFunction(() => parseFloat(document.querySelector('.teacher-broadcast-stage').style.left) < -500);
        await teacher.evaluate(() => { editor.setValue('# teacher demonstration\nprint("hello")'); editor.setPosition({lineNumber:1,column:1}); editor.focus(); });
        await teacher.keyboard.press('ArrowRight');
        await second.waitForFunction(() => parseFloat(document.querySelector('.teacher-broadcast-stage').style.left) > -100);

        await teacher.evaluate(() => {
            const root = document.createElement('div'); root.id = 'test-runtime'; root.dataset.ideRuntime = 'true'; root.dataset.liveSharePrivate = '';
            root.innerHTML = '<section class="ide-window is-front" style="position:fixed;right:30px;top:150px;width:600px;height:400px">运行终端</section>';
            document.body.append(root);
        });
        await second.waitForFunction(() => parseFloat(document.querySelector('.teacher-broadcast-stage').style.left) < -1000);
        await teacher.evaluate(() => document.querySelector('#test-runtime').remove());
        await teacher.locator('#run').click();
        for (const page of viewers) await page.frameLocator('.teacher-broadcast-stage[data-ready="true"] .live-share-mirror iframe:visible').locator('#result').filter({ hasText: '已运行 2' }).waitFor();
        await teacher.evaluate(() => editor.executeEdits('demonstration', [{ range: new monaco.Range(1, 1, 1, 1), text: '# live teacher edit\n' }]));
        await Promise.all(viewers.map((page) => page.waitForFunction(() => sharedEditor()?.getValue().includes('# live teacher edit'))));
        const editorValue = await teacher.evaluate(() => editor.getValue());
        for (const page of viewers) assert.equal(await page.evaluate(() => sharedEditor().getValue()), editorValue);
        if (process.env.LIVE_BROADCAST_SCREENSHOTS === '1') await first.screenshot({ path: '/tmp/onebyone-broadcast-student.png' });
        const mirrorButton = await first.frameLocator('.teacher-broadcast-stage[data-ready="true"] .live-share-mirror iframe:visible').locator('#run').boundingBox();
        await first.mouse.click(mirrorButton.x + mirrorButton.width / 2, mirrorButton.y + mirrorButton.height / 2);
        await first.keyboard.type('learner must not type'); await first.mouse.wheel(0, 400);
        assert.equal(await teacher.evaluate(() => runs), 2); assert.equal(await teacher.evaluate(() => editor.getValue()), editorValue);
        const stage = await first.locator('.teacher-broadcast-viewport').boundingBox();
        await first.mouse.move(stage.x + 130, stage.y + 130); await first.mouse.down({ button: 'left' });
        // Send native pen motion without Playwright's HTML drag-and-drop heuristic.
        // An rrweb iframe may be rebuilt during a gesture; waiting for its former
        // drag target can hang the driver even though the pen itself is responsive.
        const penInput = await first.context().newCDPSession(first);
        for (let step = 1; step <= 8; step++) await penInput.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: stage.x + 130 + 10 * step, y: stage.y + 130 + 30 * step / 8, button: 'left', buttons: 1,
        });
        await first.mouse.up({ button: 'left' }); await penInput.detach();
        await teacher.locator('[data-share-drawing-stroke]').last().waitFor(); await second.locator('[data-share-drawing-stroke]').last().waitFor();
        const inkInSourceCoordinates = (page) => page.evaluate(() => {
            const path = [...document.querySelectorAll('[data-share-drawing-stroke] path:last-child')].at(-1);
            const rect = path.getBoundingClientRect(); const stage = document.querySelector('.teacher-broadcast-stage');
            const box = stage?.getBoundingClientRect(); const scale = box ? box.width / stage.clientWidth : 1;
            return {x:(rect.x-(box?.x||0))/scale,y:(rect.y-(box?.y||0))/scale,width:rect.width/scale,height:rect.height/scale};
        });
        const teacherInk = await inkInSourceCoordinates(teacher);
        for (const page of viewers) {
            const learnerInk = await inkInSourceCoordinates(page);
            for (const key of ['x','y','width','height']) assert(Math.abs(learnerInk[key]-teacherInk[key]) < 2,
                `question ink stays on the same source content after independent pan/scale (${key})`);
        }
        await first.keyboard.press('Shift+Enter');
        assert.equal(await first.locator('[data-share-drawing-note]').count(), 0);
        assert(events.some((event) => event.uid === 5 && event.type === 'broadcast:relay' && event.kind === 'drawing'));
        assert(!events.some((event) => event.uid !== 2 && event.type === 'broadcast:relay' && event.kind !== 'drawing'), 'viewers can only send temporary ink');
        await teacher.waitForFunction(() => !document.querySelector('[data-share-drawing-stroke]'), null, { timeout: 10000 });
        assert.deepEqual(await ownState(unselected), originals[2], 'unselected learner remains untouched');
        const oldPage = room.pageId; await teacher.reload(); await teacher.waitForFunction(() => ready);
        await teacher.locator('[data-broadcast-stop]').waitFor();
        await Promise.all(viewers.map((page) => page.waitForFunction(() => sharedEditor()?.getValue() === '# teacher demonstration\nprint("hello")')));
        assert.notEqual(room.pageId, oldPage, 'teacher refresh resumes broadcast on the new page identity');
        await teacher.locator('#next').click(); await teacher.waitForURL('**/lesson-two?uid=2'); await teacher.waitForFunction(() => ready);
        await teacher.locator('[data-broadcast-stop]').waitFor();
        for (const page of viewers) await page.frameLocator('.teacher-broadcast-stage[data-ready="true"] .live-share-mirror iframe:visible').locator('h1').filter({ hasText: '/lesson-two' }).waitFor();
        assert.equal(events.filter((event) => event.type === 'broadcast:start').length, 1, 'refresh and navigation rejoin the existing room');
        await teacher.locator('[data-broadcast-stop]').click();
        await Promise.all(viewers.map((page) => page.waitForFunction(() => !document.querySelector('.teacher-broadcast-overlay'))));
        for (let index = 0; index < viewers.length; index++) {
            assert.deepEqual(await ownState(viewers[index]), originals[index], 'leaving restores learner URL, draft, scroll, focus and interactions');
            assert.equal(await viewers[index].locator('#already-inert').evaluate((node) => node.inert), true);
            assert.equal(await viewers[index].evaluate(() => monaco.editor.getEditors().length), 1, 'replica editors are disposed');
            await viewers[index].locator('#run').click(); assert.equal(await viewers[index].evaluate(() => runs), 1);
        }
        assert.equal(await teacher.evaluate(() => sessionStorage.getItem('onebyone.broadcast.resume:2')), null);
        assert.deepEqual(errors, []); assert.deepEqual(transportErrors, []);
    } catch (error) {
        error.message += `\nBrowser: ${JSON.stringify(errors)}\nTransport: ${JSON.stringify(transportErrors)}\nTypes: ${JSON.stringify(events.map(({ uid, type, kind }) => [uid, type, kind]).slice(-30))}`;
        throw error;
    } finally {
        clearTimeout(snapshotTimer); await Promise.all(contexts.map((context) => context.close())); await browser.close();
        wss.clients.forEach((ws) => ws.terminate()); await new Promise((resolve) => server.close(resolve));
    }
});
