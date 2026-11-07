const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { before, after, it } = require('node:test');
const { buildSync, transformSync } = require('esbuild');
const { WebSocketServer } = require('ws');
const stylus = require('stylus');
const nunjucks = require('nunjucks');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Local runtime. */ }
}
const executablePath = [playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
const root = path.resolve(__dirname, '..');
const protocolModule = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/live_share.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: protocolModule, exports: protocolModule.exports, require, URL, Buffer });
const { sharePage, validateRelayData } = protocolModule.exports;
let browser;
let server;
let wss;
let origin;
let bundle;
let css;
const peers = new Map();
const rooms = new Map();
const sent = [];
const send = (peer, message) => { if (peer?.ws.readyState === 1) peer.ws.send(JSON.stringify(message)); };
const notify = (room) => {
    const teacher = peers.get(room.teacher);
    const student = peers.get(room.student);
    if (!teacher || !student) return;
    room.pageId = student.pageId;
    send(teacher, { type: 'started', sessionId: room.id, studentUid: student.uid, studentName: `学员${student.uid}`,
        teacherName: '唐老师', tabId: student.tabId, pageId: room.pageId });
    send(student, { type: 'share-start', sessionId: room.id, teacherUid: teacher.uid,
        teacherName: '唐老师', tabId: student.tabId, pageId: room.pageId });
};
const followForeground = (peer) => {
    if (peer.uid === 2 || !peer.visible) return;
    for (const room of rooms.values()) {
        if (room.studentUid !== peer.uid || room.deviceId !== peer.deviceId || room.student === peer.key) continue;
        send(peers.get(room.student), { type: 'ended', sessionId: room.id });
        room.student = peer.key;
        notify(room);
    }
};
const assistant = () => new nunjucks.Environment(null, { autoescape: true }).renderString(fs.readFileSync(
    path.join(root, 'packages/ui-default/templates/partials/teacher_assistant.html'), 'utf8'), {
    handler: { user: { _id: 2, hasPerm: () => true, hasPriv: () => true }, domain: { _id: 'system' }, session: {} },
    perm: { PERM_EDIT_DOMAIN: 1 }, PRIV: { PRIV_EDIT_SYSTEM: 1, PRIV_ALL: 1, PRIV_USER_PROFILE: 1 },
    UiContext: { liveShare: { canTeach: true } }, page_name: 'homepage', model: {}, url: (name) => `/${name}`,
});
before(async () => {
    assert(executablePath, 'Playwright browser is required for the live sharing integration test');
    const result = buildSync({ absWorkingDir: root, entryPoints: ['packages/ui-default/components/live_share/controller.ts'],
        write: false, bundle: true, format: 'iife', globalName: 'LiveShare', platform: 'browser', loader: { '.css': 'empty', '.ttf': 'dataurl' },
        external: ['vj/*'], define: { 'process.env.NODE_ENV': '"production"' } });
    const assistantJs = transformSync(fs.readFileSync(path.join(root, 'packages/ui-default/components/teacher_assistant.ts'), 'utf8'),
        { loader: 'ts', format: 'iife', globalName: 'TeacherAssistant' }).code;
    bundle = `${result.outputFiles[0].text}\n${assistantJs}`;
    css = ['teacher_assistant', 'live_share'].map((name) => stylus.render(fs.readFileSync(
        path.join(root, `packages/ui-default/components/${name}.page.styl`), 'utf8'))).join('\n');
    server = http.createServer((req, res) => {
        const url = new URL(req.url, origin || 'http://localhost');
        if (url.pathname === '/share.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle); return; }
        const uid = Number(url.searchParams.get('uid')) || 5;
        const teacher = uid === 2;
        const number = url.pathname.split('/').pop() || '1';
        const pageTitle = url.pathname.startsWith('/contest/') ? '比赛详情' : url.pathname === '/home/profile' ? '个人中心'
            : url.pathname === '/home/domain' ? '我的课堂' : url.pathname.startsWith('/user/') ? '个人主页' : `题目 ${number}`;
        const config = { enabled: teacher || !!sharePage(url.pathname + url.search), uid, canTeach: teacher, socketUrl: `/live-share/conn?uid=${uid}`,
            ...(teacher ? {} : { pageGrant: 'fixture-grant' }) };
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${teacher ? '老师工作台' : pageTitle}</title><style>
          *{box-sizing:border-box}body{margin:0;font-family:system-ui;background:#eef1f4;color:#263b51}nav{height:64px;padding:18px 32px;background:#fff;font-weight:bold}#panel{min-height:2200px;padding:32px}.fixture-card{padding:28px;background:white;border-radius:18px;max-width:1000px}textarea{display:block;width:600px;height:260px;margin:24px 0;font:16px monospace}button,a{padding:10px;margin-right:10px} ${css}
          </style></head><body><nav>OneByOne · ${teacher ? '老师工作台' : 'Python训练'}</nav><div id="panel"><main class="fixture-card">
          <h1>${teacher ? '老师自己的工作页面' : `学员${uid} · ${pageTitle}`}</h1>
          <textarea name="code" id="code" aria-label="原页面代码">${teacher ? '# teacher draft' : 'print("student")'}</textarea>
          <div id="scratchpad"><button type="button" class="scratchpad__toolbar__pretest" id="run">运行测试</button><button type="submit" id="submit">正式提交</button></div>
          <a id="next" href="/p/2?uid=${uid}">下一道题</a><p id="result">等待运行</p>
          <a id="contest" href="/contest/contest-2026?uid=${uid}">比赛详情</a>
          <a id="profile" href="/home/profile?uid=${uid}">个人中心</a>
          <a id="classrooms" href="/home/domain?uid=${uid}" target="_blank">在新标签页打开我的课堂</a>
          <a id="user" href="/user/${uid}?uid=${uid}">个人主页</a>
          <input type="password" id="private-password" value="must-never-leak"><input type="hidden" name="token" value="fixture-private-token">
          <div style="height:1200px"></div><p>页面底部</p></main></div>${teacher ? assistant() : ''}<script src="/share.js"></script><script>
          window.runs=0;window.submissions=0;
          document.querySelector('#run').onclick=()=>{window.runs++;document.querySelector('#result').textContent='运行完成 '+window.runs};
          document.querySelector('#submit').onclick=()=>window.submissions++;
          document.querySelector('#code').addEventListener('input',()=>localStorage.setItem('fixture-draft',document.querySelector('#code').value));
          window.UiContext={}; window.UserContext={_id:${uid}};
          TeacherAssistant.installTeacherAssistant();window.disposeShare=LiveShare.installLiveShare(${JSON.stringify(config)});
          </script></body></html>`);
    });
    wss = new WebSocketServer({ server });
    wss.on('connection', (ws, req) => {
        const uid = Number(new URL(req.url, 'http://localhost').searchParams.get('uid'));
        let peer;
        ws.on('message', (raw) => {
            if (raw.toString() === 'ping') { ws.send('pong'); return; }
            const msg = JSON.parse(raw);
            sent.push({ uid, message: msg });
            if (msg.type === 'hello') {
                if (uid !== 2 && !sharePage(msg.url)) { ws.close(); return; }
                peer = { ws, uid, ...msg, key: `${uid}:${msg.tabId}` }; peers.set(peer.key, peer);
                send(peer, { type: 'ready', uid, canTeach: uid === 2 });
                followForeground(peer);
                for (const room of rooms.values()) if (room.student === peer.key || room.teacher === peer.key) notify(room);
            } else if (msg.type === 'pulse') {
                peer.visible = msg.visible;
                followForeground(peer);
                if (!peer.visible) for (const room of rooms.values()) if (room.student === peer.key) {
                    send(peers.get(room.teacher), { type: 'paused', sessionId: room.id, reason: '学员正在切换标签页' });
                    send(peer, { type: 'paused', sessionId: room.id, reason: '学员正在切换标签页' });
                }
            } else if (msg.type === 'list') {
                const ids = [...new Set([...peers.values()].filter((p) => p.uid !== 2).map((p) => p.uid))];
                send(peer, { type: 'students', students: ids.map((id) => ({ uid: id, name: `学员${id}`, online: true,
                    tabs: [...peers.values()].filter((p) => p.uid === id).map((p) => ({ tabId: p.tabId, title: p.title, visible: p.visible })) })) });
            } else if (msg.type === 'start') {
                const student = [...peers.values()].find((p) => p.uid === msg.studentUid);
                for (const room of [...rooms.values()]) if (room.teacher === peer.key) {
                    send(peers.get(room.student), { type: 'ended', sessionId: room.id }); rooms.delete(room.id);
                }
                const room = { id: `session-${Date.now()}-${msg.studentUid}`, teacher: peer.key, student: student.key,
                    studentUid: student.uid, deviceId: student.deviceId, pageId: student.pageId };
                rooms.set(room.id, room); notify(room);
            } else if (msg.type === 'relay') {
                const room = rooms.get(msg.sessionId);
                if (!room || ![room.teacher, room.student].includes(peer.key) || msg.pageId !== room.pageId) return;
                validateRelayData(room.teacher === peer.key ? 'teacher' : 'student', msg.kind, msg.data, msg.pageId);
                send(peers.get(room.teacher === peer.key ? room.student : room.teacher), msg);
            } else if (msg.type === 'stop') {
                const room = rooms.get(msg.sessionId);
                if (!room) return;
                rooms.delete(room.id);
                send(peers.get(room.student), { type: 'ended', sessionId: room.id });
                send(peer, { type: 'ended', sessionId: room.id });
            }
        });
        ws.on('close', () => {
            if (peers.get(peer?.key)?.ws === ws) peers.delete(peer.key);
            for (const room of rooms.values()) if (room.student === peer?.key || room.teacher === peer?.key) {
                send(peers.get(room.teacher === peer?.key ? room.student : room.teacher), { type: 'paused', sessionId: room.id, reason: '正在重新连接…' });
            }
        });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); wss?.clients.forEach((ws) => ws.terminate()); await new Promise((resolve) => server?.close(resolve)); });

it('connects one student, mirrors typing/navigation, edits jointly, and restores the teacher page', { timeout: 90000 }, async () => {
    const contexts = await Promise.all([2, 5, 6].map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })));
    const [teacher, student, other] = await Promise.all(contexts.map((context) => context.newPage()));
    const errors = [];
    [teacher, student, other].forEach((page) => page.on('pageerror', (error) => errors.push(error.message)));
    try {
        await Promise.all([teacher.goto(`${origin}/teacher?uid=2`), student.goto(`${origin}/p/1?uid=5`), other.goto(`${origin}/p/1?uid=6`)]);
        await teacher.locator('#code').fill('# original teacher draft\nprint(123)');
        await teacher.evaluate(() => window.scrollTo(0, 280));
        const originalUrl = teacher.url();
        await teacher.locator('[data-assistant-toggle]').click();
        await teacher.locator('[data-live-share-open]').click();
        await teacher.getByRole('button', { name: /学员5/ }).waitFor();
        await teacher.screenshot({ path: '/tmp/onebyone-live-share-picker.png' });
        await teacher.getByRole('button', { name: /学员5/ }).click();
        await teacher.locator('.live-share-editors textarea').waitFor();
        await student.locator('#code').fill('print("student change")');
        await teacher.waitForFunction(() => document.querySelector('.live-share-editors textarea')?.value === 'print("student change")');
        await teacher.locator('.live-share-editors textarea').fill('# teacher comment\nprint("student change")');
        await student.waitForFunction(() => document.querySelector('#code').value.startsWith('# teacher comment'));
        assert.equal(await student.evaluate(() => localStorage.getItem('fixture-draft')), '# teacher comment\nprint("student change")');
        assert.equal(await other.locator('#code').inputValue(), 'print("student")');
        assert.equal(await other.locator('.live-share-notice').count(), 0);
        assert.equal(await student.locator('.live-share-notice button').count(), 0, 'student has status only, no mode or reclaim button');
        const notice = await student.locator('.live-share-notice').boundingBox();
        assert(notice.y > 800 && notice.y + notice.height <= 890, 'assistance notice stays at the bottom, clear of the menu');
        assert.equal(await student.locator('.live-share-notice').evaluate((node) => getComputedStyle(node).pointerEvents), 'none');
        await student.screenshot({ path: '/tmp/onebyone-live-share-student-notice.png' });
        const frame = teacher.frameLocator('.live-share-mirror iframe');
        await frame.locator('#run').click();
        await student.waitForFunction(() => window.runs === 1);
        await teacher.screenshot({ path: '/tmp/onebyone-live-share-session.png' });
        await frame.locator('#submit').click();
        await teacher.waitForFunction(() => document.querySelector('.live-share-status')?.textContent.includes('学员'));
        assert.equal(await student.evaluate(() => window.submissions), 0);
        const captured = sent.filter((entry) => entry.uid === 5 && entry.message.kind === 'mirror').map((entry) => JSON.stringify(entry.message));
        assert(captured.every((text) => !text.includes('must-never-leak') && !text.includes('fixture-private-token')));
        await frame.locator('#next').click();
        await student.waitForURL('**/p/2?uid=5');
        await teacher.frameLocator('.live-share-mirror iframe').locator('h1').filter({ hasText: '题目 2' }).waitFor();
        assert.equal(teacher.url(), originalUrl, 'teacher URL must not navigate with the student');
        // Losing either transport freezes controls until the source supplies a
        // fresh snapshot and CRDT state; reconnect must keep the same student.
        const studentPeer = [...peers.values()].find((peer) => peer.uid === 5);
        const studentConnection = studentPeer.ws;
        studentConnection.terminate();
        await teacher.waitForFunction(() => document.querySelector('.live-share-overlay')?.classList.contains('is-disconnected'));
        await teacher.waitForFunction(() => document.querySelector('.live-share-overlay')
          && !document.querySelector('.live-share-overlay').classList.contains('is-disconnected'));
        assert.notEqual([...peers.values()].find((peer) => peer.uid === 5).ws, studentConnection);
        await teacher.locator('.live-share-editors textarea').fill('# resumed comment');
        await student.waitForFunction(() => document.querySelector('#code').value === '# resumed comment');
        [...peers.values()].find((peer) => peer.uid === 2).ws.terminate();
        await teacher.waitForFunction(() => document.querySelector('.live-share-overlay')?.classList.contains('is-disconnected'));
        await teacher.waitForFunction(() => document.querySelector('.live-share-overlay')
          && !document.querySelector('.live-share-overlay').classList.contains('is-disconnected'));
        await teacher.locator('[data-assistant-toggle]').click();
        await teacher.getByRole('button', { name: '切换学员', exact: true }).click();
        await teacher.getByRole('button', { name: /学员6/ }).click();
        await teacher.frameLocator('.live-share-mirror iframe').locator('h1').filter({ hasText: '学员6' }).waitFor();
        await student.waitForFunction(() => !document.querySelector('.live-share-notice'));
        await teacher.locator('.live-share-editors textarea').fill('# second student only');
        await other.waitForFunction(() => document.querySelector('#code').value === '# second student only');
        assert.equal(await student.locator('#code').inputValue(), '# resumed comment');
        await teacher.locator('[data-assistant-toggle]').click();
        await teacher.getByRole('button', { name: '断开共享', exact: true }).click();
        await teacher.waitForFunction(() => !document.querySelector('.live-share-overlay'));
        assert.equal(await teacher.locator('#code').inputValue(), '# original teacher draft\nprint(123)');
        assert.equal(await teacher.evaluate(() => window.scrollY), 280);
        assert.equal(await teacher.locator('#panel').evaluate((node) => node.inert), false);
        await student.waitForFunction(() => !document.querySelector('.live-share-notice'));
        await other.waitForFunction(() => !document.querySelector('.live-share-notice'));
        assert.equal(await other.locator('#code').inputValue(), '# second student only');
        assert.deepEqual(errors, []);
    } finally { await Promise.all(contexts.map((context) => context.close())); }
});

it('follows student navigation through contest and personal pages, foreground tabs, and reconnects without crossing accounts or devices', { timeout: 90000 }, async () => {
    const contexts = await Promise.all([2, 17, 18, 17].map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })));
    const [teacher, student, other, otherDevice] = await Promise.all(contexts.map((context) => context.newPage()));
    const errors = [];
    [teacher, student, other, otherDevice].forEach((page) => page.on('pageerror', (error) => errors.push(error.message)));
    try {
        await Promise.all([teacher.goto(`${origin}/teacher?uid=2`), student.goto(`${origin}/p/1?uid=17`), other.goto(`${origin}/p/1?uid=18`)]);
        await teacher.locator('#code').fill('# teacher remains on their own draft');
        await teacher.evaluate(() => window.scrollTo(0, 220));
        const originalUrl = teacher.url();
        await teacher.locator('[data-assistant-toggle]').click();
        await teacher.locator('[data-live-share-open]').click();
        await teacher.getByRole('button', { name: /学员17/ }).click();
        await teacher.locator('.live-share-editors textarea').waitFor();

        await student.locator('#contest').click();
        await student.waitForURL('**/contest/contest-2026?uid=17');
        await teacher.frameLocator('.live-share-mirror iframe').locator('h1').filter({ hasText: '学员17 · 比赛详情' }).waitFor();
        await student.locator('#profile').click();
        await student.waitForURL('**/home/profile?uid=17');
        await teacher.frameLocator('.live-share-mirror iframe').locator('h1').filter({ hasText: '学员17 · 个人中心' }).waitFor();
        assert.equal(teacher.url(), originalUrl);

        // Another learner and the same account on another device cannot move the room.
        await Promise.all([other.goto(`${origin}/home/profile?uid=18`), otherDevice.goto(`${origin}/user/17?uid=17`)]);
        await otherDevice.waitForFunction(() => !!sessionStorage.getItem('onebyone.live-share.tab:17'));
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.equal(await otherDevice.locator('.live-share-notice').count(), 0);
        assert.equal(await other.locator('.live-share-notice').count(), 0);
        assert.equal(await teacher.frameLocator('.live-share-mirror iframe').locator('h1').textContent(), '学员17 · 个人中心');

        const initialTab = await student.evaluate(() => sessionStorage.getItem('onebyone.live-share.tab:17'));
        // Headless browsers keep every page visible. Emulate the old tab's
        // visibility event while using a real target=_blank navigation.
        await student.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        const opened = student.waitForEvent('popup');
        await student.locator('#classrooms').click();
        const current = await opened;
        current.on('pageerror', (error) => errors.push(error.message));
        await current.waitForURL('**/home/domain?uid=17');
        await teacher.frameLocator('.live-share-mirror iframe').locator('h1').filter({ hasText: '学员17 · 我的课堂' }).waitFor();
        assert.notEqual(await current.evaluate(() => sessionStorage.getItem('onebyone.live-share.tab:17')), initialTab);
        await student.waitForFunction(() => !document.querySelector('.live-share-notice'));
        await teacher.locator('.live-share-editors textarea').fill('# current foreground tab only');
        await current.waitForFunction(() => document.querySelector('#code').value === '# current foreground tab only');
        assert.equal(await student.locator('#code').inputValue(), 'print("student")');
        assert.equal(await other.locator('#code').inputValue(), 'print("student")');
        assert.equal(await otherDevice.locator('#code').inputValue(), 'print("student")');

        await current.locator('#user').click();
        await current.waitForURL('**/user/17?uid=17');
        await teacher.frameLocator('.live-share-mirror iframe').locator('h1').filter({ hasText: '学员17 · 个人主页' }).waitFor();
        const currentTab = await current.evaluate(() => sessionStorage.getItem('onebyone.live-share.tab:17'));
        const connection = peers.get(`17:${currentTab}`).ws;
        connection.terminate();
        await teacher.waitForFunction(() => document.querySelector('.live-share-overlay')?.classList.contains('is-disconnected'));
        await teacher.waitForFunction(() => document.querySelector('.live-share-overlay')
            && !document.querySelector('.live-share-overlay').classList.contains('is-disconnected'));
        assert.notEqual(peers.get(`17:${currentTab}`).ws, connection);
        await teacher.locator('.live-share-editors textarea').fill('# recovered personal page');
        await current.waitForFunction(() => document.querySelector('#code').value === '# recovered personal page');

        await teacher.locator('[data-assistant-toggle]').click();
        await teacher.getByRole('button', { name: '断开共享', exact: true }).click();
        await teacher.waitForFunction(() => !document.querySelector('.live-share-overlay'));
        await current.waitForFunction(() => !document.querySelector('.live-share-notice'));
        assert.equal(teacher.url(), originalUrl);
        assert.equal(await teacher.locator('#code').inputValue(), '# teacher remains on their own draft');
        assert.equal(await teacher.evaluate(() => window.scrollY), 220);
        assert.equal(await teacher.locator('#panel').evaluate((node) => node.inert), false);
        assert.deepEqual(errors, []);
    } finally { await Promise.all(contexts.map((context) => context.close())); }
});

it('keeps local teacher drawing private, shares identical strokes across resolutions, and clears them when sharing ends', { timeout: 60000 }, async () => {
    const contexts = await Promise.all([
        browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 }),
        browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 }),
        browser.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 }),
    ]);
    const [teacher, student, other] = await Promise.all(contexts.map((context) => context.newPage()));
    const errors = [];
    [teacher, student, other].forEach((page) => page.on('pageerror', (error) => errors.push(error.message)));
    const drawingPackets = () => sent.filter((entry) => entry.uid === 2 && entry.message.kind === 'command'
        && entry.message.data?.action === 'draw');
    const rightStroke = async (locator) => {
        const box = await locator.boundingBox();
        assert(box && box.width > 100 && box.height > 15);
        await teacher.mouse.move(box.x + 20, box.y + box.height / 2);
        await teacher.mouse.down({ button: 'right' });
        await teacher.mouse.move(box.x + 90, box.y + box.height / 2 + 6, { steps: 8 });
        await teacher.mouse.move(box.x + 150, box.y + box.height / 2 - 4, { steps: 7 });
        await teacher.mouse.up({ button: 'right' });
    };
    const sourceSelector = '.live-share-drawing-root [data-share-drawing-stroke]';
    const viewerSelector = '.live-share-stage [data-share-drawing-stroke]';
    const identicalStrokes = async (count) => {
        const expected = await teacher.locator(`${viewerSelector} path:last-child`).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('d')));
        assert.equal(expected.length, count);
        await student.waitForFunction(({ selector, paths }) => JSON.stringify([...document.querySelectorAll(`${selector} path:last-child`)]
            .map((node) => node.getAttribute('d'))) === JSON.stringify(paths), { selector: sourceSelector, paths: expected });
        assert.equal(await other.locator('[data-share-drawing-stroke]').count(), 0, 'another learner must never receive the marks');
    };
    try {
        await Promise.all([teacher.goto(`${origin}/teacher?uid=2`), student.goto(`${origin}/p/1?uid=41`), other.goto(`${origin}/p/1?uid=42`)]);
        await teacher.locator('.live-share-drawing-root [data-share-drawing]').waitFor({ state: 'attached' });
        const initialPackets = drawingPackets().length;
        await rightStroke(teacher.locator('h1'));
        assert.equal(await teacher.locator(sourceSelector).count(), 1);
        assert.equal(drawingPackets().length, initialPackets, 'drawing on the teacher\'s own page stays local');
        assert.equal(await student.locator('[data-share-drawing-stroke]').count(), 0);

        await teacher.locator('[data-assistant-toggle]').click();
        await teacher.locator('[data-live-share-open]').click();
        await teacher.getByRole('button', { name: /学员41/ }).click();
        await teacher.locator('.live-share-editors textarea').waitFor();
        await teacher.locator('.live-share-stage [data-share-drawing]').waitFor({ state: 'attached' });
        await student.locator('.live-share-drawing-root [data-share-drawing]').waitFor({ state: 'attached' });
        assert.equal(await teacher.locator(sourceSelector).count(), 0, 'the teacher\'s local pen is cleared and paused during sharing');
        const rootBounds = await student.locator('.live-share-drawing-root').boundingBox();
        assert.deepEqual(rootBounds, { x: 0, y: 0, width: 1000, height: 760 }, 'the source overlay uses the same viewport coordinates as embedded Scratch');
        await teacher.frameLocator('.live-share-mirror iframe').locator('h1').waitFor();
        await rightStroke(teacher.frameLocator('.live-share-mirror iframe').locator('h1'));
        await identicalStrokes(1);
        await rightStroke(teacher.locator('.live-share-editors textarea'));
        await identicalStrokes(2);
        assert.equal(await student.locator('#code').inputValue(), 'print("student")', 'the right-button pen must not edit code');
        assert.equal(await teacher.locator('.live-share-editors textarea').inputValue(), 'print("student")');
        const completed = drawingPackets().slice(initialPackets);
        assert.equal(completed.filter((entry) => entry.message.data.drawing.phase === 'start').length, 2);
        assert.equal(completed.filter((entry) => entry.message.data.drawing.phase === 'end').length, 2);
        const staleStroke = completed.find((entry) => entry.message.data.drawing.phase === 'start').message;

        await teacher.locator('[data-assistant-toggle]').click();
        await teacher.getByRole('button', { name: '断开共享', exact: true }).click();
        await teacher.waitForFunction(() => !document.querySelector('.live-share-overlay'));
        await student.waitForFunction(() => !document.querySelector('.live-share-drawing-root'));
        assert.equal(await teacher.locator(viewerSelector).count(), 0);
        const stoppedPackets = drawingPackets().length;
        await rightStroke(teacher.locator('#code'));
        assert.equal(await teacher.locator(sourceSelector).count(), 1, 'the teacher\'s local pen resumes after disconnect');
        assert.equal(drawingPackets().length, stoppedPackets);

        // A packet already in flight cannot recreate a drawing after the room ends.
        const studentPeer = [...peers.values()].find((peer) => peer.uid === 41);
        send(studentPeer, staleStroke);
        await student.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
        assert.equal(await student.locator('[data-share-drawing-stroke]').count(), 0);
        assert.equal(await other.locator('[data-share-drawing-stroke]').count(), 0);
        assert.deepEqual(errors, []);
    } finally { await Promise.all(contexts.map((context) => context.close())); }
});

it('pins a right-button mark with a live label across different DPRs while preserving code annotation shortcuts', { timeout: 60000 }, async () => {
    const contexts = await Promise.all([
        browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 }),
        browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 }),
        browser.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 }),
    ]);
    const [teacher, student, other] = await Promise.all(contexts.map((context) => context.newPage()));
    const errors = [];
    [teacher, student, other].forEach((page) => page.on('pageerror', (error) => errors.push(error.message)));
    const drawingPackets = () => sent.filter((entry) => entry.uid === 2 && entry.message.kind === 'command'
        && entry.message.data?.action === 'draw');
    try {
        await Promise.all([teacher.goto(`${origin}/teacher?uid=2`), student.goto(`${origin}/p/1?uid=51`), other.goto(`${origin}/p/1?uid=52`)]);
        await teacher.locator('[data-assistant-toggle]').click();
        await teacher.locator('[data-live-share-open]').click();
        await teacher.getByRole('button', { name: /学员51/ }).click();
        await teacher.locator('.live-share-editors textarea').waitFor();
        const heading = teacher.frameLocator('.live-share-mirror iframe').locator('h1');
        await heading.waitFor();
        const box = await heading.boundingBox();
        const packetStart = drawingPackets().length;
        await teacher.mouse.move(box.x + 15, box.y + box.height / 2);
        await teacher.mouse.down({ button: 'right' });
        await teacher.mouse.move(box.x + 145, box.y + box.height / 2 + 4, { steps: 12 });
        await teacher.mouse.up({ button: 'right' });
        const teacherStroke = teacher.locator('.live-share-stage [data-share-drawing-stroke]');
        await teacherStroke.waitFor({ state: 'attached' });
        const strokeId = await teacherStroke.getAttribute('data-share-drawing-stroke');
        const stroke = `[data-share-drawing-stroke="${strokeId}"]`;
        const note = `[data-share-drawing-note="${strokeId}"]`;
        const input = `${note} [data-share-drawing-note-input]`;
        await student.locator(stroke).waitFor({ state: 'attached' });
        await teacher.keyboard.press('Shift+Enter');
        await teacher.locator(input).waitFor();
        await teacher.waitForFunction((selector) => document.activeElement?.matches(selector), input);
        await student.locator(note).waitFor();
        assert.equal(await teacher.locator(input).inputValue(), '', 'the shortcut opens and focuses an empty label immediately');
        assert.equal(await student.locator(input).inputValue(), '', 'the learner sees the label as soon as it opens');
        await teacher.locator(input).fill('先看这里');
        await student.waitForFunction((selector) => document.querySelector(selector)?.value === '先看这里', input);
        await teacher.locator(input).press('Enter');
        await teacher.locator(input).pressSequentially('再看输出');
        const expectedText = '先看这里\n再看输出';
        await student.waitForFunction(({ selector, text }) => document.querySelector(selector)?.value === text, { selector: input, text: expectedText });
        assert.equal(await teacher.locator(input).inputValue(), expectedText, 'ordinary Enter adds a newline inside the label');
        const geometry = (node) => ({ width: node.style.width, height: node.style.height,
            left: node.style.left, top: node.style.top });
        const teacherGeometry = await teacher.locator(note).evaluate(geometry);
        await student.waitForFunction(({ selector, dimensions }) => {
            const node = document.querySelector(selector);
            return node && ['width', 'height', 'left', 'top'].every((key) => node.style[key] === dimensions[key]);
        }, { selector: note, dimensions: teacherGeometry });
        assert.equal(await other.locator('[data-share-drawing-note],[data-share-drawing-stroke]').count(), 0);
        // Real relay anchors use recorder node IDs, not replay iframe positions.
        const inkStart = drawingPackets().slice(packetStart).find((entry) => entry.message.data.drawing.phase === 'start');
        assert.equal(inkStart.message.data.drawing.anchor.kind, 'dom');
        const relative = async (page, target, overlay) => {
            const [content, mark, bubble] = await Promise.all([target.boundingBox(), page.locator(overlay).boundingBox(), page.locator(note).boundingBox()]);
            return { mark: mark.y - content.y, note: bubble.y - content.y };
        };
        const studentBefore = await relative(student, student.locator('h1'), stroke);
        const teacherBefore = await relative(teacher, heading, stroke);
        await student.evaluate(() => window.scrollTo(0, 80));
        await teacher.waitForFunction(() => document.querySelector('.live-share-mirror iframe')?.contentWindow?.scrollY === 80);
        await teacher.waitForTimeout(100);
        const studentAfter = await relative(student, student.locator('h1'), stroke);
        const teacherAfter = await relative(teacher, heading, stroke);
        for (const key of ['mark', 'note']) {
            assert(Math.abs(studentAfter[key] - studentBefore[key]) < 1.5, `student ${key} follows page content`);
            assert(Math.abs(teacherAfter[key] - teacherBefore[key]) < 1.5, `teacher ${key} follows page content`);
        }
        await student.evaluate(() => window.scrollTo(0, 700));
        await teacher.waitForFunction(() => document.querySelector('.live-share-mirror iframe')?.contentWindow?.scrollY === 700);
        await student.locator(note).waitFor({ state: 'hidden' });
        await teacher.locator(note).waitFor({ state: 'hidden' });
        await student.evaluate(() => window.scrollTo(0, 0));
        await teacher.waitForFunction(() => document.querySelector('.live-share-mirror iframe')?.contentWindow?.scrollY === 0);
        await student.locator(note).waitFor(); await teacher.locator(note).waitFor();
        // Temporary strokes normally disappear after five seconds plus the fade.
        // A labeled mark must remain readable until the teacher explicitly deletes it.
        await teacher.waitForTimeout(6500);
        assert.equal(await teacher.locator(stroke).count(), 1);
        assert.equal(await student.locator(stroke).count(), 1);
        assert.equal(await teacher.locator(note).isVisible(), true);
        assert.equal(await student.locator(note).isVisible(), true);
        assert.equal(await student.locator(input).inputValue(), expectedText);
        assert.equal(await student.locator('#code').inputValue(), 'print("student")', 'label typing does not modify learner code');
        assert(drawingPackets().slice(packetStart).some((entry) => entry.message.data.drawing.phase === 'note'),
            'label content travels through the validated WebSocket protocol');
        await teacher.locator(`${note} [data-share-drawing-note-delete]`).click();
        await teacher.locator(note).waitFor({ state: 'detached' });
        await student.locator(note).waitFor({ state: 'detached' });
        await teacher.locator(stroke).waitFor({ state: 'detached' });
        await student.locator(stroke).waitFor({ state: 'detached' });
        assert(drawingPackets().slice(packetStart).some((entry) => entry.message.data.drawing.phase === 'delete'));

        const code = teacher.locator('.live-share-editors textarea');
        await code.fill('print("still code")');
        await student.waitForFunction(() => document.querySelector('#code').value === 'print("still code")');
        const packetsBeforeCodeNote = drawingPackets().length;
        await code.evaluate((node) => { node.focus(); node.setSelectionRange(0, 5); node.dispatchEvent(new Event('select', { bubbles: true })); });
        await code.press('Shift+Enter');
        const codeNote = teacher.locator('[data-share-code-annotation] [data-share-annotation-input]');
        await codeNote.waitFor();
        await teacher.waitForFunction(() => document.activeElement?.matches('[data-share-code-annotation] [data-share-annotation-input]'));
        await codeNote.fill('这是原有代码批注');
        await student.waitForFunction(() => [...document.querySelectorAll('[data-share-code-annotation] [data-share-annotation-note]')]
            .some((node) => node.textContent.includes('这是原有代码批注')));
        assert.equal(drawingPackets().length, packetsBeforeCodeNote, 'without a fresh mark, Shift+Enter stays with code annotations');
        assert.equal(await teacher.locator('[data-share-drawing-stroke],[data-share-drawing-note]').count(), 0,
            'ordinary code typing must not create pen marks or pen labels');
        assert.equal(await student.locator('#code').inputValue(), 'print("still code")');
        assert.equal(await other.locator('[data-share-code-annotation],[data-share-drawing-note]').count(), 0);
        await teacher.locator('[data-assistant-toggle]').click();
        await teacher.getByRole('button', { name: '断开共享', exact: true }).click();
        await teacher.waitForFunction(() => !document.querySelector('.live-share-overlay'));
        assert.deepEqual(errors, []);
    } finally { await Promise.all(contexts.map((context) => context.close())); }
});
