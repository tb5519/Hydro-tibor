const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { buildSync } = require('esbuild');
const stylus = require('stylus');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Use the available browser runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
const root = path.resolve(__dirname, '..');
const controller = buildSync({
    absWorkingDir: root, entryPoints: ['packages/ui-default/components/live_share/controller.ts'], bundle: true, write: false,
    format: 'iife', globalName: 'LiveController', external: ['./mirror', './editor', './frames', './drawing', './ide', './broadcast_adapters'],
}).outputFiles[0].text;
const sharingCss = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share.page.styl'), 'utf8'));
let browser;
before(async () => {
    assert(executablePath, 'Playwright and Chromium are required for sharing failure regressions');
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => browser?.close());

async function fixture(t, settings = {}) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 700 }, ...settings.context });
    t.after(() => context.close());
    const page = await context.newPage();
    const clockStart = new Date('2026-11-06T00:00:00Z');
    await page.clock.install({ time: clockStart });
    // Only runFor advances controller timers, even when concurrent suites load the browser.
    await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://share-controller.test/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}#original{height:2400px}textarea{width:300px;height:80px}[data-teacher-assistant]{position:fixed;right:10px;top:10px;z-index:99}${sharingCss}</style></head><body><main id="original"><textarea id="teacher-code"># teacher draft</textarea><button id="teacher-run">老师自己的运行按钮</button></main><aside class="teacher-assistant" data-teacher-assistant><button data-live-share-open>共享模式</button><div data-assistant-panel><div class="teacher-assistant__footer"></div></div></aside><script>${controller}</script><script>
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
      const adapters={attachViewerMirror(options){const result=makeAdapter(options,mirrorAdapters);options.onViewport(${JSON.stringify(settings.studentViewport || { width: 1000, height: 700 })});return result},attachViewerEditors(options){return makeAdapter(options,editorAdapters)},attachSourceMirror(options){return makeAdapter(options,mirrorAdapters)},attachSourceEditors(options){return makeAdapter(options,editorAdapters)}};
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
    assert.equal(await page.getByRole('button', { name: '切换学员' }).isEnabled(), false);
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

async function viewGeometry(page) {
    return page.evaluate(() => {
        const viewport = document.querySelector('.live-share-viewport');
        const stage = document.querySelector('.live-share-stage');
        const bounds = stage.getBoundingClientRect();
        return { scale: new DOMMatrix(getComputedStyle(stage).transform).a,
            width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y,
            nativeWidth: stage.clientWidth, nativeHeight: stage.clientHeight,
            scrollWidth: viewport.scrollWidth, scrollHeight: viewport.scrollHeight,
            clientWidth: viewport.clientWidth, clientHeight: viewport.clientHeight,
            scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop,
            relays: sockets.flatMap((socket) => socket.sent).filter((message) => message.type === 'relay').length };
    });
}

it('fit enlarges a smaller learner screen on a large teacher monitor without changing its native layout', async (t) => {
    const { page, start, errors } = await fixture(t, { context: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 } });
    await start();
    const initial = await viewGeometry(page);
    assert.ok(Math.abs(initial.scale - 1080 / 700) < 0.00001);
    assert.ok(Math.abs(initial.width - 1000 * 1080 / 700) < 0.1);
    assert.equal(initial.nativeWidth, 1000); assert.equal(initial.nativeHeight, 700);
    assert.equal(initial.scrollWidth, initial.clientWidth); assert.equal(initial.scrollHeight, initial.clientHeight);
    assert.equal(await page.locator('[data-share-zoom-value]').textContent(), '154%');
    assert.equal(await page.locator('[data-share-zoom-fit]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-share-zoom-in]').click();
    assert.ok((await viewGeometry(page)).scale > initial.scale);
    await page.locator('[data-share-zoom-fit]').click();
    assert.equal(await page.locator('[data-share-pan-hint]').isVisible(), false);
    assert.equal((await viewGeometry(page)).relays, initial.relays, 'zoom is teacher-local and sends no learner commands');
    assert.deepEqual(errors, []);
});

it('a small high-DPI teacher can switch from full fit to readable 100%, pan, and reset without phantom overflow', async (t) => {
    const { page, start, errors } = await fixture(t, { context: { viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 }, studentViewport: { width: 1440, height: 900 } });
    await start();
    const initial = await viewGeometry(page);
    assert.ok(Math.abs(initial.scale - 800 / 1440) < 0.00001);
    assert.ok(Math.abs(initial.height - 500) < 0.1);
    assert.equal(initial.scrollWidth, 800); assert.equal(initial.scrollHeight, 600);
    await page.locator('[data-share-zoom-value]').click();
    const readable = await viewGeometry(page);
    assert.equal(readable.scale, 1); assert.equal(readable.width, 1440); assert.equal(readable.height, 900);
    assert.equal(readable.scrollWidth, 1440); assert.equal(readable.scrollHeight, 900);
    assert.equal(readable.scrollLeft, 0); assert.equal(readable.scrollTop, 0, '100% starts at the top-left so code line starts remain visible');
    assert.equal(await page.locator('[data-share-pan-hint]').isVisible(), true);
    await page.evaluate(() => mirrorAdapters.at(-1).options.onViewPan({ dx: 100, dy: 90 }));
    const panned = await viewGeometry(page);
    assert.equal(panned.scrollLeft, readable.scrollLeft + 100); assert.equal(panned.scrollTop, readable.scrollTop + 90);
    await page.setViewportSize({ width: 900, height: 650 });
    await page.clock.runFor(30);
    assert.equal((await viewGeometry(page)).scale, 1, 'manual zoom survives a teacher window resize');
    await page.locator('[data-share-zoom-fit]').click();
    const fitted = await viewGeometry(page);
    assert.equal(fitted.scrollLeft, 0); assert.equal(fitted.scrollTop, 0);
    assert.equal(fitted.scrollWidth, 900); assert.equal(fitted.scrollHeight, 650);
    assert.ok(Math.abs(fitted.scale - 900 / 1440) < 0.00001);
    assert.equal(fitted.relays, initial.relays);
    await page.getByRole('button', { name: '断开共享' }).click();
    assert.equal(await page.locator('.live-share-zoom').count(), 0);
    assert.equal(await page.locator('#teacher-code').inputValue(), '# teacher draft');
    assert.deepEqual(errors, []);
});

it('Ctrl-wheel keeps the teacher cursor anchor stable and does not resize or scroll the learner', async (t) => {
    const { page, start } = await fixture(t, { context: { viewport: { width: 800, height: 600 } }, studentViewport: { width: 1440, height: 900 } });
    await start(); await page.locator('[data-share-zoom-value]').click();
    const before = await viewGeometry(page);
    const anchor = { clientX: 270, clientY: 230 };
    const sourceX = (anchor.clientX - before.x) / before.scale;
    const sourceY = (anchor.clientY - before.y) / before.scale;
    await page.evaluate((point) => mirrorAdapters.at(-1).options.onViewZoom({ delta: -80, ...point }), anchor);
    const after = await viewGeometry(page);
    assert.ok(after.scale > 1);
    assert.ok(Math.abs((anchor.clientX - after.x) / after.scale - sourceX) < 1);
    assert.ok(Math.abs((anchor.clientY - after.y) / after.scale - sourceY) < 1);
    assert.equal(after.nativeWidth, 1440); assert.equal(after.nativeHeight, 900);
    assert.equal(after.relays, before.relays);
    await page.evaluate(() => {
        const input = document.createElement('textarea'); input.id = 'local-editor';
        document.querySelector('.live-share-editors').append(input);
        input.focus();
    });
    await page.keyboard.type('a b');
    assert.equal(await page.locator('#local-editor').inputValue(), 'a b', 'the pan shortcut must not consume spaces while editing');
});

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

async function persistentFixture(t, teacher, controlledClock = false) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    t.after(() => context.close());
    const page = await context.newPage(); const errors = [];
    if (controlledClock) {
        const clockStart = new Date('2026-11-06T00:00:00Z');
        await page.clock.install({ time: clockStart });
        await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
    }
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://persistent-share.test/**', (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/content')) return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><h1>${url.pathname}</h1><script>
          const liveShare={enabled:true,uid:${teacher ? 2 : 10},canTeach:${teacher},socketUrl:'/d/class-a/live-share/conn',domainId:'class-a',pageGrant:'grant-current-page'};
          window.notifyHost=()=>parent.dispatchEvent(new parent.CustomEvent('onebyone:page-change',{detail:{window,context:{liveShare},url:location.href,title:document.title}}));
          notifyHost();
          const make=(kind,options)=>{ const value={kind,options,document,disposed:false,connected:true,dispose(){this.disposed=true},setConnected(v){this.connected=v},receive(){},receiveCommand(){}};parent.created.push(value);return value };
          window.__onebyoneLiveShareSources={
            loadAdapters:async()=>({attachSourceMirror:o=>make('mirror',o),attachSourceEditors:o=>make('editor',o),attachSourceFrames:o=>make('frames',o),attachSourceIde:o=>make('ide',o),attachTemporaryDrawing:o=>make('drawing',o)}),
            loadBroadcastAdapters:async()=>({attachBroadcastSource:o=>make('broadcast',o)}),
            loadDrawing:async()=>({attachTemporaryDrawing:o=>make('local-drawing',o)})
          };
          notifyHost(); notifyHost();
        </script></body></html>` });
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><iframe id="content"></iframe><script>${controller}</script><script>
          window.BroadcastChannel=undefined;window.sockets=[];window.created=[];
          window.__onebyonePlatformShell={contentWindow:()=>document.querySelector('iframe').contentWindow};
          class FakeSocket extends EventTarget {
            constructor(){super();this.readyState=0;this.bufferedAmount=0;this.sent=[];this.closed=0;sockets.push(this)}
            send(s){this.sent.push(s==='ping'?s:JSON.parse(s))}
            open(){this.readyState=1;this.dispatchEvent(new Event('open'))}
            deliver(m){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(m)}))}
            close(){this.closed++;this.readyState=3;this.dispatchEvent(new Event('close'))}
          }
          window.cleanup=LiveController.installLiveShare({enabled:true,uid:${teacher ? 2 : 10},canTeach:${teacher},socketUrl:'/d/class-a/live-share/conn',domainId:'class-a',pageGrant:'old-initial-page'}, {socketFactory:()=>new FakeSocket()});
          document.querySelector('iframe').src='/content-one';
        </script></body></html>` });
    });
    await page.goto('https://persistent-share.test/');
    await page.waitForFunction(() => sockets.length === 1);
    await page.evaluate(() => { sockets[0].open(); sockets[0].deliver({ type: 'ready' }); });
    const announce = async (kind) => page.evaluate((kind) => {
        const sent = sockets[0].sent.filter((item) => item.type === 'hello' || item.type === 'page').at(-1);
        if (sent.type === 'page') sockets[0].deliver({ type: 'page-ready', pageId: sent.pageId, requestId: sent.requestId });
        sockets[0].deliver({ type: kind, sessionId: 'persistent-session', pageId: sent.pageId, teacherUid: 2, studentUid: 10,
            teacherName: '唐老师', studentName: '学员', pageUrl: sent.url, studentUids: [10] });
    }, kind);
    const navigate = async (url) => {
        await page.evaluate((url) => { dispatchEvent(new CustomEvent('onebyone:page-loading')); document.querySelector('iframe').src = url; }, url);
        await page.waitForFunction((url) => sockets[0].sent.some((item) => item.type === 'page' && item.url === url), url);
    };
    return { page, errors, announce, navigate };
}

it('keeps one assistance transport while child source documents, editors and drawing roots change', async (t) => {
    const { page, errors, announce, navigate } = await persistentFixture(t, false);
    await announce('share-start');
    await page.waitForFunction(() => created.some((item) => item.kind === 'mirror'));
    const before = await page.evaluate(() => ({ messages: sockets[0].sent.length, adapters: created.length }));
    await page.evaluate(() => {
        const child = document.querySelector('iframe').contentWindow;
        child.document.title = '标题已更新'; child.notifyHost();
        child.history.replaceState({}, '', '/content-one?filter=recent#detail'); child.notifyHost(); child.notifyHost();
    });
    assert.deepEqual(await page.evaluate(() => ({ messages: sockets[0].sent.length, adapters: created.length })), before);
    assert.equal(await page.evaluate(() => created.some((item) => item.disposed)), false);
    assert.equal(await page.evaluate(() => created.find((item) => item.kind === 'drawing').options.container.ownerDocument === document.querySelector('iframe').contentDocument), true);
    await navigate('/content-two');
    assert.equal(await page.evaluate(() => created.filter((item) => ['mirror', 'editor', 'frames', 'drawing', 'ide'].includes(item.kind)).every((item) => item.disposed)), true);
    await announce('share-start');
    await page.waitForFunction(() => created.filter((item) => item.kind === 'mirror').length === 2);
    assert.equal(await page.evaluate(() => sockets.length), 1);
    assert.equal(await page.evaluate(() => sockets[0].closed), 0);
    assert.equal(await page.evaluate(() => created.filter((item) => item.kind === 'mirror').at(-1).document === document.querySelector('iframe').contentDocument), true);
    assert.deepEqual(errors, []);
});

it('keeps teacher broadcast identity and socket while loading source adapters from each child realm', async (t) => {
    const { page, errors, announce, navigate } = await persistentFixture(t, true);
    await announce('broadcast:started');
    await page.waitForFunction(() => created.some((item) => item.kind === 'broadcast'));
    await navigate('/content-two');
    assert.equal(await page.evaluate(() => created.find((item) => item.kind === 'broadcast').disposed), true);
    assert.equal(await page.locator('[data-teacher-share-controls][data-mode="broadcast"]:not([hidden])').count(), 1);
    await announce('broadcast:started');
    await page.waitForFunction(() => created.filter((item) => item.kind === 'broadcast').length === 2);
    assert.equal(await page.evaluate(() => sockets.length), 1);
    assert.equal(await page.evaluate(() => sockets[0].closed), 0);
    assert.equal(await page.evaluate(() => created.filter((item) => item.kind === 'broadcast').at(-1).document === document.querySelector('iframe').contentDocument), true);
    assert.deepEqual(errors, []);
});

it('retries only the latest page after temporary rate limits or lost acknowledgments without reconnecting', async (t) => {
    const { page, errors, announce, navigate } = await persistentFixture(t, true, true);
    await announce('broadcast:started');
    await page.waitForFunction(() => created.some((item) => item.kind === 'broadcast'));
    await navigate('/content-two');
    const earlier = await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page').at(-1));
    await navigate('/content-three');
    const latest = await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page').at(-1));
    await page.evaluate(({ earlier, latest }) => {
        sockets[0].deliver({ type: 'page-ready', pageId: earlier.pageId, requestId: earlier.requestId });
        sockets[0].deliver({ type: 'error', operation: 'page', requestId: earlier.requestId, code: 'FORBIDDEN' });
        sockets[0].deliver({ type: 'error', operation: 'page', requestId: latest.requestId, code: 'RATE_LIMIT' });
    }, { earlier, latest });
    const messages = await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page').length);
    await page.clock.runFor(999);
    assert.equal(await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page').length), messages);
    await page.clock.runFor(1);
    assert.deepEqual(await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page').at(-1)), latest);
    assert.equal(await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page').length), messages + 1);
    await page.evaluate((latest) => sockets[0].deliver({ type: 'error', operation: 'page', requestId: latest.requestId, code: 'UNAVAILABLE' }), latest);
    await page.clock.runFor(2000);
    assert.equal(await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page').length), messages + 2);
    await page.evaluate((latest) => sockets[0].deliver({ type: 'page-ready', pageId: latest.pageId, requestId: latest.requestId }), latest);
    await page.clock.runFor(9000);
    assert.equal(await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page').length), messages + 2);
    assert.equal(await page.evaluate(() => sockets.length), 1);
    assert.equal(await page.evaluate(() => sockets[0].closed), 0);
    assert.equal(await page.locator('[data-teacher-share-controls][data-mode="broadcast"]:not([hidden])').count(), 1);
    await announce('broadcast:started');
    await page.waitForFunction(() => created.filter((item) => item.kind === 'broadcast').length === 2);
    assert.deepEqual(errors, []);
});

it('does not confuse a loading-state acknowledgment with the later ready state of the same document', async (t) => {
    const { page, errors, navigate } = await persistentFixture(t, false, true);
    await navigate('/content-two');
    const updates = await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page'));
    const latest = updates.at(-1);
    const loading = updates.find((item) => item.pageId === latest.pageId && item.url === '');
    assert.ok(loading, 'the early DOM-ready event announces a paused version of the same page epoch');
    assert.notEqual(loading.requestId, latest.requestId);
    await page.evaluate((loading) => sockets[0].deliver({ type: 'page-ready', pageId: loading.pageId, requestId: loading.requestId }), loading);
    await page.clock.runFor(1000);
    assert.deepEqual(await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page').at(-1)), latest);
    assert.equal(await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page').length), updates.length + 1);
    await page.evaluate((latest) => sockets[0].deliver({ type: 'page-ready', pageId: latest.pageId, requestId: latest.requestId }), latest);
    await page.clock.runFor(8000);
    assert.equal(await page.evaluate(() => sockets[0].sent.filter((item) => item.type === 'page').length), updates.length + 1);
    assert.equal(await page.evaluate(() => sockets[0].closed), 0);
    assert.deepEqual(errors, []);
});
