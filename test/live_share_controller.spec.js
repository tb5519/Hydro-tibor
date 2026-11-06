const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { transformSync } = require('esbuild');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Use the available browser runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
const root = path.resolve(__dirname, '..');
const controller = transformSync(fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share/controller.ts'), 'utf8'), {
    loader: 'ts', format: 'iife', globalName: 'LiveController',
}).code;
let browser;
before(async () => {
    assert(executablePath, 'Playwright and Chromium are required for sharing failure regressions');
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => browser?.close());

async function fixture(t) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    t.after(() => context.close());
    const page = await context.newPage();
    const clockStart = new Date('2026-11-06T00:00:00Z');
    await page.clock.install({ time: clockStart });
    // Only runFor advances controller timers, even when concurrent suites load the browser.
    await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://share-controller.test/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}#original{height:2400px}textarea{width:300px;height:80px}[data-teacher-assistant]{position:fixed;right:10px;top:10px;z-index:99}.live-share-overlay{position:fixed;inset:0}.live-share-picker{position:fixed;inset:0;z-index:100}</style></head><body><main id="original"><textarea id="teacher-code"># teacher draft</textarea><button id="teacher-run">老师自己的运行按钮</button></main><aside data-teacher-assistant><button data-live-share-open>共享模式</button><div data-assistant-panel><div class="teacher-assistant__footer"></div></div></aside><script>${controller}</script><script>
      window.BroadcastChannel=undefined;
      window.sockets=[];window.editorAdapters=[];window.mirrorAdapters=[];
      class FakeSocket extends EventTarget {
        constructor(url){super();this.url=url;this.readyState=0;this.bufferedAmount=0;this.sent=[];sockets.push(this)}
        send(data){this.sent.push(data==='ping'?data:JSON.parse(data))}
        open(){this.readyState=1;this.dispatchEvent(new Event('open'))}
        deliver(message){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(message)}))}
        close(){if(this.readyState===3)return;this.readyState=3;this.dispatchEvent(new Event('close'))}
      }
      const makeAdapter=(options,collection)=>{
        const adapter={options,connected:true,disposed:false,received:[],drafts:[],dispose(){this.disposed=true},setConnected(value){this.connected=value},receive(message){this.received.push(message)},getPendingDrafts(){return this.drafts}};
        collection.push(adapter);return adapter;
      };
      const adapters={attachViewerMirror(options){const result=makeAdapter(options,mirrorAdapters);options.onViewport({width:1000,height:700});return result},attachViewerEditors(options){return makeAdapter(options,editorAdapters)},attachSourceMirror(options){return makeAdapter(options,mirrorAdapters)},attachSourceEditors(options){return makeAdapter(options,editorAdapters)}};
      window.cleanup=LiveController.installLiveShare({enabled:true,uid:2,canTeach:true,socketUrl:'/live-share/conn'}, {socketFactory:(url)=>new FakeSocket(url),loadAdapters:()=>window.holdAdapters?new Promise(resolve=>{window.releaseAdapters=()=>resolve(adapters)}):Promise.resolve(adapters)});
      window.receive=(message)=>sockets.at(-1).deliver(message);
      window.pending=(value)=>{const editor=editorAdapters.at(-1);editor.drafts=value?[{editorId:'e-'+editor.options.pageId,language:'python',value:'# unsynced '+value}]:[];editor.options.onStatus({editorId:'e-'+editor.options.pageId,pending:value?1:0,connected:true,ready:true})};
    </script></body></html>` }));
    await page.goto('https://share-controller.test/p/teacher');
    await page.clock.runFor(1);
    await page.locator('[data-live-share-open]').click();
    await page.evaluate(() => { sockets.at(-1).open(); receive({ type: 'ready' }); });
    async function start(id = 'session-a', studentUid = 5, pageId = 'page-a') {
        await page.evaluate(({ id, studentUid, pageId }) => receive({ type: 'started', sessionId: id, studentUid, studentName: `学员${studentUid}`, tabId: `tab-${studentUid}`, pageId }), { id, studentUid, pageId });
        await page.waitForFunction(() => !!editorAdapters.length && !editorAdapters.at(-1).disposed);
    }
    return { page, errors, start };
}

it('a real teacher refresh preserves unacknowledged code in user-scoped session recovery', async (t) => {
    const { page, start, errors } = await fixture(t);
    await start();
    await page.evaluate(() => pending('before refresh'));
    await page.reload();
    const backups = await page.evaluate(() => JSON.parse(sessionStorage.getItem('onebyone.live-share.unsynced:2') || '[]'));
    assert.equal(backups.length, 1);
    assert.equal(backups[0].studentUid, 5);
    assert.equal(backups[0].value, '# unsynced before refresh');
    assert.equal(await page.locator('.live-share-backup').count(), 1);
    assert.deepEqual(errors, []);
});

it('an old ending timeout cannot stop a newly selected learner after the old room ends', async (t) => {
    const { page, start } = await fixture(t);
    await start();
    await page.evaluate(() => pending('old room'));
    await page.getByRole('button', { name: '断开共享' }).click();
    await page.getByRole('button', { name: '切换学员' }).click();
    assert.equal(await page.locator('.live-share-picker').count(), 0, 'switching stays disabled while final writes drain');
    await page.evaluate(() => receive({ type: 'ended', sessionId: 'session-a' }));
    await start('session-b', 6, 'page-b');
    await page.clock.runFor(10020);
    assert.equal(await page.locator('.live-share-controls__name').textContent(), '学员6');
    const stops = await page.evaluate(() => sockets.flatMap((socket) => socket.sent).filter((message) => message.type === 'stop'));
    assert.ok(!stops.some((message) => message.sessionId === 'session-b'));
    assert.equal(await page.locator('.live-share-overlay').count(), 1);
});

it('a dropped initial start request can be selected again after reconnect instead of remaining disabled', async (t) => {
    const { page } = await fixture(t);
    const students = { type: 'students', students: [{ uid: 5, name: '学员5', online: true, tabs: [{ tabId: 'tab-5', title: 'Python作业', visible: true }] }] };
    await page.evaluate((message) => receive(message), students);
    await page.locator('.live-share-student').click();
    assert.equal(await page.locator('.live-share-student').isDisabled(), true);
    await page.evaluate(() => sockets.at(-1).close());
    await page.clock.runFor(800);
    await page.evaluate((message) => { sockets.at(-1).open(); receive({ type: 'ready' }); receive(message); }, students);
    assert.equal(await page.locator('.live-share-student').isDisabled(), false);
    await page.locator('.live-share-student').click();
    assert.equal(await page.evaluate(() => sockets.flatMap((socket) => socket.sent).filter((message) => message.type === 'start').length), 2);
});

it('switching learner or page rejects stale relays and backs up previous unconfirmed edits', async (t) => {
    const { page, start } = await fixture(t);
    await start();
    await page.evaluate(() => pending('learner 5'));
    await start('session-b', 6, 'page-b');
    await page.evaluate(() => {
        receive({ type: 'relay', sessionId: 'session-a', pageId: 'page-a', kind: 'editor', data: { type: 'edit:update', tag: 'wrong-student' } });
        receive({ type: 'relay', sessionId: 'session-b', pageId: 'old-page-b', kind: 'editor', data: { type: 'edit:update', tag: 'wrong-page' } });
        receive({ type: 'relay', sessionId: 'session-b', pageId: 'page-b', kind: 'editor', data: { type: 'edit:update', tag: 'right' } });
    });
    assert.deepEqual(await page.evaluate(() => editorAdapters.at(-1).received.map((message) => message.tag)), ['right']);
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('onebyone.live-share.unsynced:2')));
    assert.equal(saved[0].studentUid, 5);
    assert.equal(saved[0].value, '# unsynced learner 5');
    assert.equal(await page.evaluate(() => editorAdapters[0].disposed), true);
    await page.evaluate(() => pending('page b old'));
    await start('session-b', 6, 'page-b-new');
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('onebyone.live-share.unsynced:2')).length), 2);
});

it('same-room reconnect retains the existing collaborative editor and cleanup restores teacher DOM', async (t) => {
    const { page, start } = await fixture(t);
    await page.locator('[aria-label="关闭学员选择"]').click();
    await page.locator('#teacher-code').focus();
    await page.evaluate(() => { window.scrollTo(0, 180); document.body.style.overflow = 'auto'; });
    await start();
    assert.equal(await page.evaluate(() => document.getElementById('original').inert), true);
    await page.evaluate(() => pending('keep during reconnect'));
    await page.evaluate(() => sockets.at(-1).close());
    assert.equal(await page.evaluate(() => editorAdapters.at(-1).connected), false);
    await page.clock.runFor(800);
    await page.evaluate(() => { sockets.at(-1).open(); receive({ type: 'ready' }); });
    await start();
    assert.equal(await page.evaluate(() => editorAdapters.length), 1);
    assert.equal(await page.evaluate(() => editorAdapters.at(-1).connected), true);
    await page.evaluate(() => cleanup());
    assert.equal(await page.locator('.live-share-overlay').count(), 0);
    assert.equal(await page.evaluate(() => document.getElementById('original').inert), false);
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'auto');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'teacher-code');
    assert.equal(await page.locator('#teacher-code').inputValue(), '# teacher draft');
    const drafts = await page.evaluate(() => JSON.parse(sessionStorage.getItem('onebyone.live-share.unsynced:2')));
    assert.equal(drafts[0].value, '# unsynced keep during reconnect');
});

async function chooseNextStudent(page) {
    await page.getByRole('button', { name: '切换学员' }).click();
    await page.evaluate(() => receive({ type: 'students', students: [{ uid: 6, name: '学员6', online: true, tabs: [{ tabId: 'tab-6', title: 'C++作业', visible: true }] }] }));
    await page.locator('.live-share-student').click();
}

it('one learner-switch click waits for the last ACK and automatically starts only the selected learner', async (t) => {
    const { page, start } = await fixture(t);
    await start();
    await page.evaluate(() => pending('final note'));
    await chooseNextStudent(page);
    assert.equal(await page.evaluate(() => sockets.flatMap((socket) => socket.sent).filter((message) => message.type === 'start').length), 0);
    assert.match(await page.locator('.live-share-status').textContent(), /同步最后的修改/);
    await page.evaluate(() => pending(0));
    const starts = await page.evaluate(() => sockets.flatMap((socket) => socket.sent).filter((message) => message.type === 'start'));
    assert.deepEqual(starts.map((message) => message.studentUid), [6]);
    await start('session-b', 6, 'page-b');
    await page.clock.runFor(10020);
    assert.equal(await page.locator('.live-share-controls__name').textContent(), '学员6');
    assert.equal(await page.evaluate(() => sockets.flatMap((socket) => socket.sent).filter((message) => message.type === 'start').length), 1);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('onebyone.live-share.unsynced:2')), null);
});

it('learner-switch timeout preserves a downloadable draft before continuing without a second click', async (t) => {
    const { page, start } = await fixture(t);
    await start();
    await page.evaluate(() => pending('unacknowledged last line'));
    await chooseNextStudent(page);
    await page.clock.runFor(9990);
    assert.equal(await page.evaluate(() => sockets.flatMap((socket) => socket.sent).some((message) => message.type === 'start')), false);
    await page.clock.runFor(20);
    const drafts = await page.evaluate(() => JSON.parse(sessionStorage.getItem('onebyone.live-share.unsynced:2')));
    assert.equal(drafts[0].value, '# unsynced unacknowledged last line');
    assert.equal(drafts[0].studentUid, 5);
    assert.equal(await page.locator('.live-share-backup').count(), 1);
    const starts = await page.evaluate(() => sockets.flatMap((socket) => socket.sent).filter((message) => message.type === 'start'));
    assert.deepEqual(starts.map((message) => message.studentUid), [6]);
});

it('queued switch survives a short disconnect and resumes after the source confirms the last edit', async (t) => {
    const { page, start } = await fixture(t);
    await start();
    await page.evaluate(() => pending('before brief disconnect'));
    await chooseNextStudent(page);
    await page.evaluate(() => sockets.at(-1).close());
    await page.clock.runFor(800);
    await page.evaluate(() => { sockets.at(-1).open(); receive({ type: 'ready' }); });
    await start();
    assert.equal(await page.evaluate(() => editorAdapters.length), 1);
    await page.evaluate(() => pending(0));
    const starts = await page.evaluate(() => sockets.flatMap((socket) => socket.sent).filter((message) => message.type === 'start'));
    assert.deepEqual(starts.map((message) => message.studentUid), [6]);
});

it('a switch target remains queued beyond the offline timeout and starts once the socket is ready again', async (t) => {
    const { page, start } = await fixture(t);
    await start();
    await page.evaluate(() => pending('long disconnection'));
    await chooseNextStudent(page);
    await page.evaluate(() => sockets.at(-1).close());
    await page.clock.runFor(10020);
    const drafts = await page.evaluate(() => JSON.parse(sessionStorage.getItem('onebyone.live-share.unsynced:2')));
    assert.equal(drafts[0].value, '# unsynced long disconnection');
    assert.equal(await page.evaluate(() => sockets.flatMap((socket) => socket.sent).filter((message) => message.type === 'start').length), 0);
    await page.evaluate(() => { sockets.at(-1).open(); receive({ type: 'ready' }); });
    const starts = await page.evaluate(() => sockets.flatMap((socket) => socket.sent).filter((message) => message.type === 'start'));
    assert.deepEqual(starts.map((message) => message.studentUid), [6]);
    assert.equal(await page.locator('.live-share-backup').count(), 1);
});

it('student navigation while a switch is waiting retains the selected target and backs up old-page code', async (t) => {
    const { page, start } = await fixture(t);
    await start();
    await page.evaluate(() => pending('old page before navigation'));
    await chooseNextStudent(page);
    await start('session-a', 5, 'page-a-next');
    await page.clock.runFor(10020);
    const starts = await page.evaluate(() => sockets.flatMap((socket) => socket.sent).filter((message) => message.type === 'start'));
    assert.deepEqual(starts.map((message) => message.studentUid), [6]);
    const drafts = await page.evaluate(() => JSON.parse(sessionStorage.getItem('onebyone.live-share.unsynced:2')));
    assert.equal(drafts[0].value, '# unsynced old page before navigation');
    assert.equal(drafts[0].studentUid, 5);
});

it('mirror interruption freezes existing editors and reconnects without losing unconfirmed code', async (t) => {
    const { page, start } = await fixture(t);
    await start();
    await page.evaluate(() => { pending('mirror failure'); mirrorAdapters.at(-1).options.onStatus('画面同步中断，请重试'); });
    assert.equal(await page.evaluate(() => sockets.at(-1).readyState), 3);
    assert.equal(await page.evaluate(() => editorAdapters.at(-1).connected), false);
    assert.equal(await page.evaluate(() => editorAdapters.at(-1).disposed), false);
    assert.equal(await page.evaluate(() => editorAdapters.at(-1).drafts[0].value), '# unsynced mirror failure');
    await page.clock.runFor(800);
    await page.evaluate(() => { sockets.at(-1).open(); receive({ type: 'ready' }); });
    await start();
    assert.equal(await page.evaluate(() => editorAdapters.length), 1);
    assert.equal(await page.evaluate(() => editorAdapters.at(-1).connected), true);
});

it('an overflowing initialization buffer reconnects and discards the stale snapshot before rebuilding', async (t) => {
    const { page } = await fixture(t);
    await page.evaluate(() => {
        window.holdAdapters = true;
        receive({ type: 'started', sessionId: 'session-a', studentUid: 5, studentName: '学员5', tabId: 'tab-5', pageId: 'page-a' });
        for (let index = 0; index < 161; index++) receive({ type: 'relay', sessionId: 'session-a', pageId: 'page-a', kind: 'mirror', data: { index } });
    });
    assert.equal(await page.evaluate(() => sockets.at(-1).readyState), 3);
    await page.clock.runFor(800);
    await page.evaluate(() => {
        sockets.at(-1).open(); receive({ type: 'ready' });
        receive({ type: 'started', sessionId: 'session-a', studentUid: 5, studentName: '学员5', tabId: 'tab-5', pageId: 'page-a' });
        releaseAdapters();
    });
    await page.waitForFunction(() => editorAdapters.length === 1);
    assert.equal(await page.evaluate(() => mirrorAdapters.at(-1).received.length), 0);
    assert.equal(await page.evaluate(() => editorAdapters.at(-1).connected), true);
});
