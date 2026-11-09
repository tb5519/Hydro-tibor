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

test('one connection switches both directions, isolates learner screens, and restores annotations without reviving retired sessions', { timeout: 150000 }, async () => {
    assert(executablePath, 'Chromium is required for bidirectional classroom sharing');
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

    const peers = new Map(); const events = []; const errors = []; const sockets = new Map();
    let origin; let room; let serial = 0; let version = 0; let connectionId; let audience = [];
    let failSwitch = false;
    const send = (uid, message) => { const ws = peers.get(uid)?.ws; if (ws?.readyState === 1) ws.send(JSON.stringify(message)); };
    const participants = (item) => item.mode === 'broadcast' ? [2, ...audience] : [2, item.studentUid];
    const announce = () => {
        if (!room) return;
        const info = { sessionId: room.id, connectionId, connectionVersion: version, pageId: room.pageId, teacherUid: 2, teacherName: '唐老师' };
        if (room.mode === 'broadcast') {
            const data = { ...info, studentUids: audience, viewers: audience.map(uid => ({ uid, name: `学员${uid}`, online: peers.has(uid) })) };
            send(2, { type: 'broadcast:started', ...data });
            audience.forEach(uid => send(uid, { type: 'broadcast:view', ...data }));
            send(2, { type: 'broadcast:resync', ...info });
        } else {
            const source = peers.get(room.studentUid);
            send(2, { type: 'started', ...info, studentUid: room.studentUid, studentName: `学员${room.studentUid}`, tabId: source.tabId, pageUrl: source.url });
            send(room.studentUid, { type: 'share-start', ...info, tabId: source.tabId, pageUrl: source.url });
        }
    };
    const createRoom = (mode, studentUid) => {
        room = { id: `transport-${++serial}`, mode, studentUid, pageId: peers.get(mode === 'broadcast' ? 2 : studentUid).pageId };
        announce();
    };
    const end = () => {
        if (!room) return;
        const old = room; room = null;
        participants(old).forEach(uid => send(uid, { type: old.mode === 'broadcast' ? 'broadcast:ended' : 'ended', sessionId: old.id,
            connectionId, connectionVersion: version }));
        [2, ...audience].forEach(uid => send(uid, { type: 'connection:ended', connectionId, connectionVersion: version }));
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
        const uid = Number(/(?:^|; )uid=(\d+)/.exec(request.headers.cookie || '')?.[1]) || 2;
        const config = { enabled: true, uid, canTeach: uid === 2, socketUrl: `/live-share/conn?uid=${uid}`, pageGrant: 'test-page-grant' };
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html><head><meta charset="utf-8"><title>用户${uid}</title><style>
        *{box-sizing:border-box}body{margin:0;font-family:Arial;background:#eef1f4}main{padding:30px 48px}h1{font-size:24px;margin:0 0 15px}
        #explanation{font-size:20px;margin:20px 0}#original{width:calc(100vw - 96px);height:300px;margin:20px 0}
        ${css}</style></head><body><main><h1>同一课堂页面</h1><p id="explanation">从输出固定内容开始，认真检查输入与输出。</p><div id="original"></div><p id="ink-focus" style="width:500px;height:100px">这里也可以圈出重点</p><div style="height:1000px"></div></main>
        ${uid === 2 ? assistant : ''}<script src="/vs/loader.js"></script><script src="/share.js"></script><script>
        window.UiContext={};window.UserContext={_id:${uid}};
        require.config({paths:{vs:'/vs'}});require(['vs/editor/editor.main'],()=>{
          window.editor=monaco.editor.create(document.getElementById('original'),{value:'alpha = 1\\nprint(alpha)',language:'python',fontSize:20,lineHeight:30,minimap:{enabled:false},wordWrap:'on',automaticLayout:true});
          window.originalEditorId=editor.getId();window.sharedEditor=()=>monaco.editor.getEditors().find(e=>e.getId()!==originalEditorId);
          TeacherAssistant.installTeacherAssistant();window.disposeShare=LiveShare.installLiveShare(${JSON.stringify(config)});window.ready=true;
        });</script></body></html>`);
    });
    const wss = new WebSocketServer({ server });
    wss.on('connection', (ws, request) => {
        const uid = Number(new URL(request.url, 'http://localhost').searchParams.get('uid'));
        sockets.set(uid, (sockets.get(uid) || 0) + 1);
        ws.on('message', raw => {
            if (String(raw) === 'ping') { ws.send('pong'); return; }
            try {
                const message = JSON.parse(raw); events.push({ uid, ...message });
                if (message.type === 'hello') { peers.set(uid, { ...message, ws }); send(uid, { type: 'ready', uid, canTeach: uid === 2 }); }
                else if (message.type === 'list') send(uid, { type: 'students', students: [5, 6].map(id => ({ uid: id, name: `学员${id}`, online: peers.has(id) })) });
                else if (message.type === 'broadcast:start' || message.type === 'start') {
                    assert.equal(uid, 2); assert(!room); connectionId = `connection-${++serial}`; version = 1;
                    audience = message.studentUids || [message.studentUid]; createRoom(message.type === 'start' ? 'assist' : 'broadcast', message.studentUid);
                } else if (message.type === 'switch') {
                    assert.equal(uid, 2); assert.equal(message.sessionId, room.id);
                    if (failSwitch) { failSwitch = false; send(2, { type: 'switch:error', requestId: message.requestId, code: 'OFFLINE', message: '学员暂时离线' }); return; }
                    const old = room; version++;
                    participants(old).forEach(id => send(id, { type: old.mode === 'broadcast' ? 'broadcast:ended' : 'ended', sessionId: old.id,
                        connectionId, connectionVersion: version, switched: true }));
                    createRoom(message.mode, message.studentUid || audience[0]);
                } else if (message.type === 'stop' || message.type === 'broadcast:stop') { if (room?.id === message.sessionId) end(); }
                else if (message.type === 'page') { const p = peers.get(uid); if (p) Object.assign(p, message); send(uid, { type: 'page-ready', pageId: message.pageId, requestId: message.requestId }); }
                else if (room?.id === message.sessionId && room.pageId === message.pageId) {
                    if (message.type === 'broadcast:sync') send(2, { type: 'broadcast:resync', sessionId: room.id, pageId: room.pageId, connectionId, connectionVersion: version });
                    else if (message.type === 'sync') announce();
                    else if (message.type === 'broadcast:relay' && room.mode === 'broadcast') {
                        protocolModule.exports.validateBroadcastRelay(uid === 2, message.kind, message.data, message.pageId);
                        [2, ...audience].filter(id => id !== uid).forEach(id => send(id, { ...message, connectionId, connectionVersion: version,
                            senderUid: uid, data: message.kind === 'drawing' ? protocolModule.exports.broadcastDrawing(uid, message.data) : message.data }));
                    } else if (message.type === 'relay' && room.mode === 'assist') {
                        assert([2, room.studentUid].includes(uid)); send(uid === 2 ? room.studentUid : 2, { ...message, connectionId, connectionVersion: version });
                    }
                }
            } catch (error) { errors.push(`transport ${uid}: ${error.message}`); }
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await playwright.chromium.launch({ executablePath, headless: true }); const contexts = []; const pages = [];
    for (const uid of [2, 5, 6]) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 850 } }); contexts.push(context);
        await context.addCookies([{ name: 'uid', value: String(uid), url: origin }]);
        const page = await context.newPage(); page.uid = uid; page.setDefaultTimeout(15000); pages.push(page);
        page.on('pageerror', error => errors.push(`${uid}: ${error.message}`));
    }
    const [teacher, first, second] = pages;
    const noteInput = '[data-share-annotation-input]';
    const readNotes = page => page.evaluate(() => [...document.querySelectorAll('[data-share-annotation-note],[data-share-drawing-note]')].map(n => n.querySelector('textarea')?.value || n.textContent).filter(text => text.trim()));
    async function waitNote(page, text) { await page.waitForFunction(text => [...document.querySelectorAll('[data-share-annotation-note],[data-share-drawing-note]')].some(n => (n.querySelector('textarea')?.value || n.textContent).includes(text)), text); }
    async function codeNote(inMirror, text) {
        await teacher.evaluate(inMirror => { const target = inMirror ? sharedEditor() : editor;
            target.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 }); target.focus(); }, inMirror);
        await teacher.keyboard.press('Shift+Enter');
        await teacher.locator(`${noteInput}:focus`).fill(text);
    }
    async function inkNote(inMirror, text) {
        const owner = inMirror ? teacher.frameLocator('.live-share-stage .live-share-mirror iframe:visible').locator('#ink-focus') : teacher.locator('#ink-focus');
        const box = await owner.boundingBox();
        await teacher.mouse.move(box.x + 24, box.y + 20); await teacher.mouse.down({ button: 'right' });
        const input = await teacher.context().newCDPSession(teacher);
        for (let step = 1; step <= 8; step++) await input.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'right', buttons: 2,
            x: box.x + 24 + step * 12, y: box.y + 20 + step * 2 });
        await teacher.mouse.up({ button: 'right' }); await input.detach(); await teacher.keyboard.press('Shift+Enter');
        await teacher.locator('[data-share-drawing-note-input]:focus').fill(text);
    }
    async function selectProse(inMirror) {
        const owner = inMirror ? teacher.frameLocator('.live-share-stage .live-share-mirror iframe:visible').locator('#explanation') : teacher.locator('#explanation');
        const geometry = await owner.evaluate(node => { const range = node.ownerDocument.createRange(); const t = node.firstChild;
            range.setStart(t, 0); range.setEnd(t, 1); const a = range.getBoundingClientRect();
            range.setStart(t, 9); range.setEnd(t, 10); const b = range.getBoundingClientRect();
            return { x1:a.left+0.1, y1:a.top+a.height/2, x2:b.right-0.1, y2:b.top+b.height/2 }; });
        if (inMirror) {
            const frame = teacher.locator('.live-share-stage .live-share-mirror iframe:visible'); const box = await frame.boundingBox();
            const dimensions = await frame.evaluate(n => ({width:n.clientWidth,height:n.clientHeight}));
            for (const key of ['x1','x2']) geometry[key] = box.x + geometry[key] * box.width / dimensions.width;
            for (const key of ['y1','y2']) geometry[key] = box.y + geometry[key] * box.height / dimensions.height;
        }
        await teacher.mouse.move(geometry.x1, geometry.y1); await teacher.mouse.down();
        const input = await teacher.context().newCDPSession(teacher);
        for (let step=1;step<=10;step++) await input.send('Input.dispatchMouseEvent', {type:'mouseMoved',button:'left',buttons:1,
            x:geometry.x1+(geometry.x2-geometry.x1)*step/10,y:geometry.y1+(geometry.y2-geometry.y1)*step/10});
        await teacher.mouse.up(); await input.detach(); await teacher.keyboard.press('Shift+Enter');
        await teacher.locator(noteInput).last().waitFor({state:'visible'});
    }
    async function mode(next, studentUid) {
        await teacher.getByRole('button', { name: next === 'assist' ? '查看学员画面' : '分享我的画面', exact: true }).click();
        if (next === 'assist' && audience.length > 1) await teacher.locator(`[data-teacher-share-controls] [data-student-uid="${studentUid}"]`).click();
        await teacher.locator(`[data-teacher-share-controls][data-mode="${next}"]`).waitFor({ state: 'visible' });
        await teacher.waitForFunction(() => !document.querySelector('[data-teacher-share-controls]').classList.contains('is-busy'));
    }
    const cache = () => teacher.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('hydro:lesson-annotations:')));
    try {
        for (const page of pages) { await page.goto(`${origin}/lesson`); await page.waitForFunction(() => ready); }
        await teacher.locator('[data-assistant-toggle]').click(); await teacher.locator('[data-teacher-broadcast-open]').click();
        for (const uid of [5, 6]) await teacher.getByRole('checkbox', { name: `分享给学员${uid}`, exact: true }).check();
        await teacher.getByRole('button', { name: '开始分享', exact: true }).click();
        for (const page of [first, second]) await page.waitForFunction(() => sharedEditor()?.getValue() === 'alpha = 1\nprint(alpha)');
        const logical = connectionId; const originalBroadcast = { ...room }; const originalVersion = version;
        const controls = await teacher.locator('[data-teacher-share-controls]').boundingBox();
        assert(controls.x > 900, 'shared controls stay compact at the right edge');
        await selectProse(false); await teacher.locator(noteInput).last().fill('老师的讲解');
        await waitNote(first, '老师的讲解'); await waitNote(second, '老师的讲解');
        await codeNote(false, '老师的代码批注'); await waitNote(first, '老师的代码批注');
        await inkNote(false, '老师圈出的重点'); await waitNote(second, '老师圈出的重点');
        failSwitch = true;
        await teacher.getByRole('button', { name: '查看学员画面', exact: true }).click();
        await teacher.locator('[data-teacher-share-controls] [data-student-uid="5"]').click();
        await teacher.waitForFunction(() => !document.querySelector('[data-teacher-share-controls]').classList.contains('is-busy'));
        assert.equal(room.mode, 'broadcast', 'rejected switch leaves the existing mode live');
        await waitNote(first, '老师的讲解');
        await mode('assist', 5);
        await teacher.waitForFunction(() => sharedEditor()?.getValue() === 'alpha = 1\nprint(alpha)');
        await second.locator('.teacher-broadcast-overlay').waitFor({state:'detached'});
        assert.equal(await second.evaluate(() => editor.getValue()), 'alpha = 1\nprint(alpha)');
        assert(!(await readNotes(teacher)).some(text => text.includes('老师的讲解')), 'same URL in the learner page cannot inherit the teacher annotation');
        await selectProse(true); await teacher.locator(noteInput).last().fill('只给第一位学员');
        await waitNote(first, '只给第一位学员');
        assert.equal((await readNotes(second)).length, 0, 'other learners never receive the watched learner annotations');
        const assistOne = { ...room }; const assistVersion = version;
        await teacher.evaluate(() => sharedEditor().setValue('alpha = 2\nprint(alpha)'));
        await first.waitForFunction(() => editor.getValue() === 'alpha = 2\nprint(alpha)');
        await codeNote(true, '第一位学员的代码批注'); await waitNote(first, '第一位学员的代码批注');
        await inkNote(true, '第一位学员圈出的重点'); await waitNote(first, '第一位学员圈出的重点');
        await mode('broadcast');
        for (const page of [first, second]) await page.waitForFunction(() => sharedEditor()?.getValue() === 'alpha = 1\nprint(alpha)');
        await waitNote(teacher, '老师的讲解'); await waitNote(first, '老师的讲解'); await waitNote(second, '老师的讲解');
        await waitNote(teacher, '老师的代码批注'); await waitNote(second, '老师的代码批注');
        await waitNote(teacher, '老师圈出的重点'); await waitNote(first, '老师圈出的重点');
        assert(!(await readNotes(teacher)).some(text => text.includes('只给第一位学员')));
        // Delayed packets from a retired transport cannot resurrect its mode or clear the logical connection's cache.
        send(2, { type:'started', sessionId:assistOne.id, connectionId:logical, connectionVersion:assistVersion,
            pageId:assistOne.pageId, studentUid:5, studentName:'学员5', pageUrl:`${origin}/lesson` });
        send(2, { type:'ended', sessionId:assistOne.id, connectionId:logical, connectionVersion:assistVersion });
        send(5, { type:'broadcast:view', sessionId:originalBroadcast.id, connectionId:logical, connectionVersion:originalVersion,
            pageId:originalBroadcast.pageId, teacherUid:2, teacherName:'唐老师', studentUids:[5,6] });
        await teacher.waitForTimeout(300);
        assert.equal(await teacher.locator('[data-teacher-share-controls]').getAttribute('data-mode'), 'broadcast');
        await waitNote(teacher, '老师的讲解');
        await mode('assist', 6);
        await teacher.waitForFunction(() => sharedEditor()?.getValue() === 'alpha = 1\nprint(alpha)');
        assert.deepEqual(await readNotes(teacher), [], 'second learner at the identical URL has no first learner notes');
        await selectProse(true); await teacher.locator(noteInput).last().fill('只给第二位学员');
        await waitNote(second, '只给第二位学员');
        await mode('broadcast'); await waitNote(teacher, '老师的讲解');
        await mode('assist', 5); await waitNote(teacher, '只给第一位学员'); await waitNote(first, '只给第一位学员');
        await waitNote(teacher, '第一位学员的代码批注'); await waitNote(first, '第一位学员的代码批注');
        await waitNote(teacher, '第一位学员圈出的重点'); await waitNote(first, '第一位学员圈出的重点');
        assert(!(await readNotes(teacher)).some(text => text.includes('只给第二位学员')));
        assert.equal(connectionId, logical); assert.equal(events.filter(e => e.type === 'broadcast:start').length, 1);
        assert.equal(events.filter(e => e.type === 'start').length, 0, 'direction changes never start an unrelated connection');
        for (const uid of [2,5,6]) assert.equal(sockets.get(uid), 1, 'direction changes preserve the authenticated WebSocket');
        assert((await cache()).some(key => key.includes(`${logical}:broadcast:2:`)));
        assert((await cache()).some(key => key.includes(`${logical}:assist:5:`)));
        assert((await cache()).some(key => key.includes(`${logical}:assist:6:`)));
        await teacher.getByRole('button', {name:'断开共享',exact:true}).click();
        await teacher.locator('.live-share-overlay').waitFor({state:'detached'});
        await teacher.waitForFunction(id => !Object.keys(localStorage).some(key => key.startsWith(`hydro:lesson-annotations:v1:${id}:`)), logical);
        assert.deepEqual(errors, []);
    } catch (error) {
        for (const page of pages) await page.screenshot({path:`/tmp/live-share-switch-failure-${page.uid}.png`});
        error.message += `\nErrors:${JSON.stringify(errors)}\nRoom:${JSON.stringify(room)}\nEvents:${JSON.stringify(events.filter(e=>!['relay','broadcast:relay','pulse'].includes(e.type)).slice(-15))}`;
        throw error;
    } finally {
        await Promise.all(contexts.map(context => context.close())); await browser.close();
        wss.clients.forEach(ws => ws.terminate()); await new Promise(resolve => server.close(resolve));
    }
});
