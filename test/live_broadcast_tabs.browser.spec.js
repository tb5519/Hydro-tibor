const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { buildSync } = require('esbuild');
let playwright;
for (const name of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(name); break; } catch { /* Local browser runtime. */ }
}
const executablePath = [playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((file) => file && fs.existsSync(file));
const root = path.resolve(__dirname, '..');
const script = buildSync({ absWorkingDir: root, entryPoints: ['packages/ui-default/components/live_share/controller.ts'],
    bundle: true, write: false, format: 'iife', globalName: 'Sharing',
    external: ['./mirror', './editor', './frames', './drawing', './ide', './broadcast_adapters'],
}).outputFiles[0].text;

test('broadcast discovers noopener and already-open teacher tabs, retains handoff, and clears the lease on real ending', { timeout: 30000 }, async (t) => {
    const browser = await playwright.chromium.launch({ executablePath, headless: true });
    t.after(() => browser.close());
    const context = await browser.newContext(); const errors = [];
    context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
    await context.route('https://broadcast-tabs.test/**', (route) => {
        const uid = Number(new URL(route.request().url()).searchParams.get('uid')) || 2;
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>
          <button data-teacher-broadcast-open>分享</button><a id="new-topic" target="_blank" rel="noopener" href="/topic-two">新标签打开题目</a>
          <script>${script}</script><script>
          window.sockets=[];window.adapters=[];
          class Socket extends EventTarget {
            constructor(){super();this.readyState=0;this.sent=[];this.bufferedAmount=0;sockets.push(this)}
            send(data){this.sent.push(data==='ping'?data:JSON.parse(data))}
            open(){this.readyState=1;this.dispatchEvent(new Event('open'))}
            receive(message){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(message)}))}
            close(){this.readyState=3;this.dispatchEvent(new CloseEvent('close'))}
          }
          const make=options=>{const a={options,dispose(){this.disposed=true},setConnected(){},snapshot(){},receive(){}};adapters.push(a);return a};
          window.cleanup=Sharing.installLiveShare({enabled:true,uid:${uid},canTeach:true,pageGrant:'allowed-page',socketUrl:'/conn'},
            {socketFactory:()=>new Socket(),loadAdapters:()=>Promise.resolve({}),
             loadBroadcastAdapters:()=>Promise.resolve({attachBroadcastSource:make,attachBroadcastViewer:make})});
          window.announce=()=>{const s=sockets.at(-1);s.open();s.receive({type:'ready'});s.receive({type:'broadcast:started',sessionId:'same-lesson-session',
            pageId:s.sent.find(m=>m.type==='hello').pageId,teacherUid:${uid},teacherName:'老师',studentUids:[10],viewers:[]})};
          </script></body></html>` });
    });
    const teacher = await context.newPage(); const existing = await context.newPage();
    await Promise.all([teacher.goto('https://broadcast-tabs.test/topic-one'), existing.goto('https://broadcast-tabs.test/already-open')]);
    await teacher.waitForTimeout(120);
    assert.equal(await existing.evaluate(() => sockets.length), 0, 'idle teacher tabs do not open a stream');
    // Model a competing first-time tab finishing its localStorage write after this tab initialized.
    await existing.evaluate(() => localStorage.setItem('onebyone.live-share.device:2', 'settled-browser-device'));
    await teacher.bringToFront(); await teacher.locator('[data-teacher-broadcast-open]').click();
    await teacher.waitForFunction(() => sockets.length === 1); await teacher.evaluate(() => announce());
    await teacher.waitForFunction(() => adapters.length === 1);
    await existing.waitForFunction(() => sockets.length === 1);
    assert.equal(await existing.evaluate(() => adapters.length), 0, 'the storage hint alone never starts sharing');
    const opening = context.waitForEvent('page'); await teacher.locator('#new-topic').click(); const topic = await opening;
    await topic.waitForLoadState(); await topic.waitForFunction(() => sockets.length === 1);
    assert.equal(await topic.evaluate(() => sessionStorage.getItem('onebyone.broadcast.resume:2')), null, 'noopener does not inherit the old tab resume flag');
    assert.equal(await topic.evaluate(() => adapters.length), 0);
    await topic.evaluate(() => announce()); await topic.waitForFunction(() => adapters.length === 1);
    const identities = await Promise.all([teacher, topic].map(page => page.evaluate(() => sockets[0].sent.find(m=>m.type==='hello'))));
    assert.notEqual(identities[0].tabId, identities[1].tabId);
    assert.equal(identities[0].deviceId, identities[1].deviceId);
    assert.equal(identities[0].deviceId, 'settled-browser-device');
    await teacher.evaluate(() => sockets[0].receive({type:'broadcast:ended',sessionId:'same-lesson-session',followed:true}));
    assert(await topic.evaluate(() => !!localStorage.getItem('onebyone.broadcast.active:2')), 'tab handoff retains room discovery');
    await teacher.bringToFront(); await teacher.evaluate(() => announce());
    await teacher.waitForFunction(() => adapters.length === 2);
    await topic.evaluate(() => sockets[0].receive({type:'broadcast:ended',sessionId:'same-lesson-session',followed:true}));
    await teacher.getByRole('button', {name:'结束分享',exact:true}).click();
    assert.equal(await teacher.evaluate(() => localStorage.getItem('onebyone.broadcast.active:2')), null);
    const after = await context.newPage(); await after.goto('https://broadcast-tabs.test/after-ending'); await after.waitForTimeout(150);
    assert.equal(await after.evaluate(() => sockets.length), 0, 'a new tab does not resume an ended room');
    const account = await context.newPage(); await account.goto('https://broadcast-tabs.test/other-account?uid=3'); await account.waitForTimeout(150);
    assert.equal(await account.evaluate(() => sockets.length), 0);
    await teacher.evaluate(() => {cleanup();localStorage.setItem('onebyone.broadcast.active:2',JSON.stringify({sessionId:'expired-session',expiresAt:Date.now()-1}));});
    const expired = await context.newPage(); await expired.goto('https://broadcast-tabs.test/expired'); await expired.waitForTimeout(150);
    assert.equal(await expired.evaluate(() => sockets.length), 0, 'expired discovery never activates sharing');
    assert.deepEqual(errors, []);
});
