const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
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
        const config = { enabled: true, uid, canTeach: teacher, socketUrl: `/live-share/conn?uid=${uid}`,
            ...(teacher ? {} : { pageGrant: 'fixture-grant' }) };
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${teacher ? '老师工作台' : `题目 ${number}`}</title><style>
          *{box-sizing:border-box}body{margin:0;font-family:system-ui;background:#eef1f4;color:#263b51}nav{height:64px;padding:18px 32px;background:#fff;font-weight:bold}#panel{min-height:2200px;padding:32px}.fixture-card{padding:28px;background:white;border-radius:18px;max-width:1000px}textarea{display:block;width:600px;height:260px;margin:24px 0;font:16px monospace}button,a{padding:10px;margin-right:10px} ${css}
          </style></head><body><nav>OneByOne · ${teacher ? '老师工作台' : 'Python训练'}</nav><div id="panel"><main class="fixture-card">
          <h1>${teacher ? '老师自己的工作页面' : `学员${uid} · 题目 ${number}`}</h1>
          <textarea name="code" id="code" aria-label="原页面代码">${teacher ? '# teacher draft' : 'print("student")'}</textarea>
          <div id="scratchpad"><button type="button" class="scratchpad__toolbar__pretest" id="run">运行测试</button><button type="submit" id="submit">正式提交</button></div>
          <a id="next" href="/p/2?uid=${uid}">下一道题</a><p id="result">等待运行</p>
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
                peer = { ws, uid, ...msg, key: `${uid}:${msg.tabId}` }; peers.set(peer.key, peer);
                send(peer, { type: 'ready', uid, canTeach: uid === 2 });
                for (const room of rooms.values()) if (room.student === peer.key || room.teacher === peer.key) notify(room);
            } else if (msg.type === 'list') {
                const ids = [...new Set([...peers.values()].filter((p) => p.uid !== 2).map((p) => p.uid))];
                send(peer, { type: 'students', students: ids.map((id) => ({ uid: id, name: `学员${id}`, online: true,
                    tabs: [...peers.values()].filter((p) => p.uid === id).map((p) => ({ tabId: p.tabId, title: p.title, visible: true })) })) });
            } else if (msg.type === 'start') {
                const student = [...peers.values()].find((p) => p.uid === msg.studentUid);
                for (const room of [...rooms.values()]) if (room.teacher === peer.key) {
                    send(peers.get(room.student), { type: 'ended', sessionId: room.id }); rooms.delete(room.id);
                }
                const room = { id: `session-${Date.now()}-${msg.studentUid}`, teacher: peer.key, student: student.key, pageId: student.pageId };
                rooms.set(room.id, room); notify(room);
            } else if (msg.type === 'relay') {
                const room = rooms.get(msg.sessionId);
                if (!room || msg.pageId !== room.pageId) return;
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
