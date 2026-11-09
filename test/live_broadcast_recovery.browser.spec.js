const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { buildSync } = require('esbuild');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch {}
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((file) => file && fs.existsSync(file));
const root = path.resolve(__dirname, '..');
const script = buildSync({ absWorkingDir: root, entryPoints: ['packages/ui-default/components/live_share/controller.ts'], bundle: true,
    format: 'iife', globalName: 'LiveController', write: false,
    external: ['./mirror', './editor', './frames', './drawing', './ide', './broadcast_adapters'],
}).outputFiles[0].text;
let browser;
before(async () => { assert(executablePath); browser = await playwright.chromium.launch({ executablePath, headless: true }); });
after(async () => browser?.close());

async function fixture(t, teacher = false) {
    const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
    const time = new Date('2026-11-07T00:00:00Z'); await page.clock.install({ time }); await page.clock.pauseAt(new Date(+time + 1000));
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://broadcast-recovery.test/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>
      <main id="original"><textarea id="draft">unsaved original</textarea><button id="run">运行</button></main>
      <aside class="voice-call-floating"><button id="hangup">挂断</button></aside><aside id="previously-inert" inert></aside>
      <button data-teacher-broadcast-open>分享模式</button><script>${script}</script><script>
      window.BroadcastChannel=undefined;window.sockets=[];window.adapters=[];window.holdAdapters=false;
      class FakeSocket extends EventTarget {
        constructor(){super();this.readyState=0;this.bufferedAmount=0;this.sent=[];sockets.push(this)}
        send(data){this.sent.push(data==='ping'?data:JSON.parse(data))}
        open(){this.readyState=1;this.dispatchEvent(new Event('open'))}
        deliver(message){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(message)}))}
        close(code=1000){if(this.readyState===3)return;this.readyState=3;this.dispatchEvent(new CloseEvent('close',{code}))}
      }
      const create=(options)=>{if(options.container){const view=document.createElement('div');view.textContent=options.pageId;options.container.append(view)}const a={options,connected:true,disposed:false,snapshots:0,received:[],connections:[],
        receive(kind,data){if(this.connected&&!this.disposed)this.received.push({kind,data})},
        snapshot(){this.snapshots++},setConnected(value){this.connections.push(value);this.connected=value},dispose(){this.disposed=true}};adapters.push(a);return a};
      const module={attachBroadcastViewer:create,attachBroadcastSource:create};
      const config={enabled:true,uid:${teacher ? 2 : 10},canTeach:${teacher},pageGrant:'allowed-page',socketUrl:'/live-share/conn'};
      window.cleanup=LiveController.installLiveShare(config,{socketFactory:()=>new FakeSocket(),loadAdapters:()=>Promise.resolve({}),
        loadBroadcastAdapters:()=>holdAdapters?new Promise(resolve=>{window.releaseAdapters=()=>resolve(module)}):Promise.resolve(module)});
      window.receive=(message)=>sockets.at(-1).deliver(message);
      window.room=()=>({sessionId:'broadcast-room-123',pageId:${teacher ? "sockets.at(-1).sent.find(m=>m.type==='hello').pageId" : "'teacher-page-123'"},teacherUid:2,teacherName:'唐老师',studentUids:[10],viewers:[{uid:10,name:'学员',online:true}]});
      window.announce=()=>receive({type:'broadcast:${teacher ? 'started' : 'view'}',...room()});
      window.allSent=()=>sockets.flatMap(s=>s.sent);
      </script></body></html>` }));
    await page.goto('https://broadcast-recovery.test/lesson'); await page.clock.runFor(1);
    if (teacher) await page.locator('[data-teacher-broadcast-open]').click();
    await page.evaluate(() => { sockets.at(-1).open(); receive({ type: 'ready' }); announce(); });
    await page.waitForFunction(() => adapters.length > 0);
    return { page, errors };
}

it('successive failed reconnects and bare ready messages cannot postpone releasing the learner page', async (t) => {
    const { page, errors } = await fixture(t);
    assert.equal(await page.locator('#original').evaluate(n => n.inert), true);
    await page.evaluate(() => sockets.at(-1).close());
    for (let i = 0; i < 12; i++) {
        await page.clock.runFor(10000);
        await page.evaluate(() => { sockets.at(-1).open(); receive({ type: 'ready' }); sockets.at(-1).close(); });
    }
    await page.clock.runFor(5001);
    assert.equal(await page.locator('.teacher-broadcast-overlay').count(), 0);
    assert.equal(await page.locator('#original').evaluate(n => n.inert), false);
    assert.equal(await page.locator('#previously-inert').evaluate(n => n.inert), true);
    assert.equal(await page.locator('#draft').inputValue(), 'unsaved original');
    assert.deepEqual(errors, []);
});

it('the first complete picture, not viewport metadata, clears loading and stops snapshot retries', async (t) => {
    const { page, errors } = await fixture(t);
    assert.equal(await page.locator('.teacher-broadcast-loading').evaluate(n => n.hidden), false);
    await page.evaluate(() => adapters[0].options.onViewport({width:1440,height:900}));
    assert.match(await page.locator('.teacher-broadcast-hint__status').textContent(), /正在同步/);
    await page.clock.runFor(100);
    const initial = await page.evaluate(() => allSent().filter(m => m.type === 'broadcast:sync').length);
    // Losing every initial frame packet leaves no fragment timer to trigger recovery.
    await page.clock.runFor(12100);
    assert.equal(await page.evaluate(() => allSent().filter(m => m.type === 'broadcast:sync').length), initial + 1);
    await page.evaluate(() => adapters[0].options.onReady());
    assert.equal(await page.locator('.teacher-broadcast-loading').evaluate(n => n.hidden), true);
    assert.match(await page.locator('.teacher-broadcast-hint__status').textContent(), /正在观看/);
    await page.clock.runFor(24000);
    assert.equal(await page.evaluate(() => allSent().filter(m => m.type === 'broadcast:sync').length), initial + 1);
    assert.deepEqual(errors, []);
});

it('a progressing large snapshot is allowed to finish without repeated capture requests', async (t) => {
    const { page } = await fixture(t);
    await page.clock.runFor(100);
    const initial = await page.evaluate(() => allSent().filter(m => m.type === 'broadcast:sync').length);
    for (let i = 0; i < 8; i++) {
        await page.clock.runFor(5000);
        await page.evaluate(() => receive({type:'broadcast:relay',...room(),senderUid:2,kind:'mirror',data:{type:'rrweb-chunk'}}));
    }
    assert.equal(await page.evaluate(() => allSent().filter(m => m.type === 'broadcast:sync').length), initial);
    await page.evaluate(() => adapters[0].options.onReady());
    assert.match(await page.locator('.teacher-broadcast-hint__status').textContent(), /正在观看/);
});

it('continuous increments without a full picture cannot conceal a missing initial snapshot forever', async (t) => {
    const { page } = await fixture(t);
    for (let i = 0; i < 12; i++) {
        await page.evaluate(() => receive({type:'broadcast:relay',...room(),senderUid:2,kind:'mirror',data:{type:'rrweb-batch'}}));
        await page.clock.runFor(5000);
    }
    assert.equal(await page.evaluate(() => sockets[0].readyState), 3);
    assert.equal(await page.locator('.teacher-broadcast-loading').evaluate(n => n.hidden), false);
    assert.match(await page.locator('.teacher-broadcast-hint__status').textContent(), /重新同步|重新连接/);
});

it('page changes and failed replacement frames keep the last picture until a complete new frame is ready', async (t) => {
    const { page, errors } = await fixture(t);
    await page.evaluate(() => adapters[0].options.onReady());
    await page.evaluate(() => {
        const previous=room;window.room=()=>({...previous(),pageId:'teacher-next-page'});
        announce();
    });
    await page.waitForFunction(() => adapters.length === 2);
    assert.equal(await page.locator('.teacher-broadcast-overlay').count(), 1);
    assert.equal(await page.evaluate(() => adapters[0].disposed), false);
    assert.equal(await page.evaluate(() => adapters[0].connected), false);
    assert.equal(await page.locator('.teacher-broadcast-stage[data-ready=true]').textContent(), 'teacher-page-123');
    assert.equal(await page.locator('.teacher-broadcast-stage').last().evaluate(n => n.style.visibility), 'hidden');
    assert.equal(await page.locator('#original').evaluate(n => n.inert), true);
    // Even another failed construction must not discard the usable prior page.
    await page.evaluate(() => adapters[1].options.onStatus('共享画面同步中断，请重新连接。'));
    assert.equal(await page.evaluate(() => adapters[0].disposed), false);
    assert.equal(await page.evaluate(() => adapters[1].disposed), true);
    await page.clock.runFor(900);
    await page.evaluate(() => {sockets.at(-1).open();receive({type:'ready'});announce();});
    await page.waitForFunction(() => adapters.length === 3);
    await page.evaluate(() => adapters[1].options.onReady());
    assert.equal(await page.evaluate(() => adapters[0].disposed), false, 'a superseded callback cannot hide the retained picture');
    await page.evaluate(() => adapters[2].options.onReady());
    assert.equal(await page.evaluate(() => adapters[0].disposed), true);
    assert.equal(await page.locator('.teacher-broadcast-stage').count(), 1);
    assert.equal(await page.locator('.teacher-broadcast-stage').textContent(), 'teacher-next-page');
    assert.equal(await page.locator('.voice-call-floating').evaluate(n => n.inert), false);
    await page.evaluate(() => receive({type:'broadcast:ended',sessionId:room().sessionId}));
    assert.equal(await page.locator('.teacher-broadcast-overlay').count(), 0);
    assert.equal(await page.locator('#original').evaluate(n => n.inert), false);
    assert.equal(await page.locator('#draft').inputValue(), 'unsaved original');
    assert.deepEqual(errors, []);
});

it('revoking a session removes both the retained picture and the unready replacement', async (t) => {
    const { page } = await fixture(t);
    await page.evaluate(() => {adapters[0].options.onReady();receive({type:'broadcast:view',...room(),pageId:'teacher-next-page'});});
    await page.waitForFunction(() => adapters.length === 2);
    await page.evaluate(() => receive({type:'broadcast:error',code:'FORBIDDEN',message:'分享已结束'}));
    assert.equal(await page.locator('.teacher-broadcast-overlay').count(), 0);
    assert.equal(await page.evaluate(() => adapters.every(a => a.disposed)), true);
    assert.equal(await page.locator('#original').evaluate(n => n.inert), false);
    await page.evaluate(() => adapters[1].options.onReady());
    assert.equal(await page.locator('.teacher-broadcast-overlay').count(), 0);
});

it('repeated oversized captures stop safely instead of remaining frozen or reconnecting indefinitely', async (t) => {
    const { page } = await fixture(t, true);
    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => adapters.at(-1).options.onStatus('共享画面变化过多，已暂停，请重新连接。'));
        if (i < 2) {
            await page.clock.runFor(900);
            await page.evaluate(() => {sockets.at(-1).open();receive({type:'ready'});announce();});
            await page.waitForFunction(count => adapters.length === count, i + 2);
        }
    }
    assert.equal(await page.locator('[data-teacher-share-controls][data-mode="broadcast"]:not([hidden])').count(), 0);
    assert.match(await page.locator('.teacher-broadcast-flash').textContent(), /内容过多/);
    assert.equal(await page.evaluate(() => allSent().some(m => m.type === 'broadcast:stop')), true);
});

it('an authenticated room resume cancels the outage deadline and requests a fresh viewer snapshot', async (t) => {
    const { page } = await fixture(t);
    await page.clock.runFor(100); const before = await page.evaluate(() => allSent().filter(m=>m.type==='broadcast:sync').length);
    await page.evaluate(() => sockets.at(-1).close()); await page.clock.runFor(900);
    await page.evaluate(() => { sockets.at(-1).open(); receive({ type: 'ready' }); announce(); });
    await page.clock.runFor(100);
    assert.equal(await page.evaluate(() => adapters.at(-1).connected), true);
    assert.equal(await page.evaluate(() => allSent().filter(m=>m.type==='broadcast:sync').length), before + 1);
    // Keep the transport alive without another room event while advancing past the old deadline.
    for (let i = 0; i < 7; i++) { await page.clock.runFor(20000); await page.evaluate(() => receive({ type: 'ready' })); }
    assert.equal(await page.locator('.teacher-broadcast-overlay').count(), 1);
});

it('source and viewer mirror failures rebuild their adapter after authenticated reconnection', async (t) => {
    for (const teacher of [false, true]) {
        const { page, errors } = await fixture(t, teacher);
        await page.evaluate(() => { adapters.at(-1).connected=false; adapters.at(-1).options.onStatus('共享画面同步中断，请重新连接。'); });
        assert.equal(await page.evaluate(() => adapters[0].disposed), true);
        assert.equal(await page.evaluate(() => sockets[0].readyState), 3);
        await page.clock.runFor(900);
        await page.evaluate(() => { sockets.at(-1).open(); receive({type:'ready'}); announce(); });
        await page.waitForFunction(() => adapters.length === 2);
        await page.evaluate((source) => receive({ type:'broadcast:relay', ...room(), kind:source?'drawing':'mirror', data:{tag:'after-recovery'} }), teacher);
        assert.equal(await page.evaluate(() => adapters.at(-1).received.at(-1).data.tag), 'after-recovery');
        assert.deepEqual(errors, []);
    }
});

it('a revoked login closes the overlay immediately and does not enter an endless reconnect loop', async (t) => {
    const { page, errors } = await fixture(t);
    await page.evaluate(() => sockets.at(-1).close(4003));
    assert.equal(await page.locator('.teacher-broadcast-overlay').count(), 0);
    assert.equal(await page.locator('#original').evaluate(n => n.inert), false);
    await page.clock.runFor(130000);
    assert.equal(await page.evaluate(() => sockets.length), 1);
    assert.deepEqual(errors, []);
});

it('backpressure rebuilds the stream and callbacks from an old page cannot interrupt the new page', async (t) => {
    const { page } = await fixture(t);
    await page.evaluate(() => receive({type:'broadcast:error',code:'BACKPRESSURE',message:'retry'}));
    assert.equal(await page.evaluate(() => sockets[0].readyState), 3);
    await page.clock.runFor(900);
    await page.evaluate(() => { sockets.at(-1).open();receive({type:'ready'});announce(); });
    await page.waitForFunction(() => adapters.length === 2);
    await page.evaluate(() => receive({type:'broadcast:view',...room(),pageId:'teacher-new-page-123'}));
    await page.waitForFunction(() => adapters.length === 3);
    await page.evaluate(() => {
        adapters[1].options.onStatus('共享画面同步中断，请重新连接。');
        receive({type:'broadcast:relay',...room(),kind:'mirror',data:{tag:'old-page'}});
        receive({type:'broadcast:relay',...room(),pageId:'teacher-new-page-123',kind:'mirror',data:{tag:'new-page'}});
    });
    assert.equal(await page.evaluate(() => sockets.at(-1).readyState), 1);
    assert.deepEqual(await page.evaluate(() => adapters.at(-1).received.map(p=>p.data.tag)), ['new-page']);
});

it('duplicate announcements and clustered resyncs produce one capture, including after lazy adapter loading', async (t) => {
    const { page } = await fixture(t, true);
    const before = await page.evaluate(() => adapters.at(-1).snapshots);
    await page.evaluate(() => { for(let i=0;i<20;i++){announce();receive({type:'broadcast:resync',...room()})} });
    await page.clock.runFor(100);
    assert.equal(await page.evaluate(() => adapters.at(-1).snapshots), before+1);
    assert.equal(await page.evaluate(() => adapters.at(-1).connections.length), 1, 'the bundle activates once; same room announcements do not toggle it again');
    await page.evaluate(() => { for(let i=0;i<20;i++)announce(); }); await page.clock.runFor(100);
    assert.equal(await page.evaluate(() => adapters.at(-1).snapshots), before+1);
    assert.equal(await page.locator('.voice-call-floating').evaluate(n => n.inert), false);
    await page.evaluate(() => { const node=document.createElement('aside');node.className='voice-call-toast';document.body.append(node); });
    // A delayed viewer adapter still requests a complete snapshot after the component becomes ready.
    const viewer = await fixture(t);
    await viewer.page.evaluate(() => { holdAdapters=true; receive({type:'broadcast:ended',sessionId:room().sessionId}); announce(); });
    // The loader is cached in this tab; force a genuine slow load on a fresh document instead.
    await viewer.page.reload(); await viewer.page.clock.runFor(1);
    await viewer.page.evaluate(() => { holdAdapters=true; sockets.at(-1).open();receive({type:'ready'});announce(); });
    await viewer.page.evaluate(() => receive({type:'broadcast:relay',...room(),kind:'mirror',data:{tag:'initial-buffer'}}));
    await viewer.page.clock.runFor(1500);
    await viewer.page.evaluate(() => releaseAdapters()); await viewer.page.waitForFunction(() => adapters.length===1);
    await viewer.page.clock.runFor(100);
    assert.equal(await viewer.page.evaluate(() => allSent().filter(m=>m.type==='broadcast:sync').length), 1);
    assert.equal(await viewer.page.evaluate(() => adapters[0].received[0].data.tag), 'initial-buffer');
    assert.equal(await viewer.page.locator('.voice-call-floating').evaluate(n => n.inert), false);
});
