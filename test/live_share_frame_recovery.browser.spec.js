const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { build, buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
let playwright;
for (const module of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(module); break; } catch {}
}
const executablePath = [playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find(file => file && fs.existsSync(file));
let server; let browser; let origin;
before(async () => {
    assert(executablePath, 'Chromium is required for capture recovery checks');
    const options = { absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
        loader: { '.css': 'empty', '.ttf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } };
    const parentScript = buildSync({ ...options, globalName: 'Frames', entryPoints: ['packages/ui-default/components/live_share/frames.ts'] }).outputFiles[0].text;
    const captureScript = (await build({ ...options, entryPoints: ['packages/ui-default/components/live_share/frame_capture.ts'],
        plugins: [{ name: 'capture-only', setup(builder) {
            builder.onResolve({ filter: /^\.\/vendor$/ }, args => args.importer.endsWith('/mirror.ts')
                ? { path: path.join(root, 'packages/ui-default/components/live_share/capture_vendor.js') } : undefined);
        } }],
    })).outputFiles[0].text;
    server = http.createServer((req, res) => {
        const url = new URL(req.url, origin || 'http://localhost');
        if (url.pathname.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.end(url.pathname === '/capture.js' ? captureScript : parentScript); return;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (url.pathname === '/scratch-editor/editor.html') {
            res.end(`<!doctype html><html><body><p id="text">Scratch 画面</p>
            <script>window.oversize=()=>{const n=document.createElement('div');n.id='oversize';n.textContent='x'.repeat(9*1024*1024);document.body.append(n)};
            ${url.searchParams.has('large') ? 'oversize();' : ''}</script><script src="/capture.js"></script></body></html>`); return;
        }
        res.end(`<!doctype html><html><body><iframe id="source" sandbox="allow-scripts" style="width:700px;height:420px" src="/scratch-editor/editor.html${url.searchParams.has('large') ? '?large=1' : ''}#channel=recovery-frame-channel"></iframe>
          <script src="/parent.js"></script><script>window.packets=[];window.statuses=[];window.starts=[];window.failures=[];window.recoveryTimers=[];
          const nativeTimeout=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>{const id=nativeTimeout(fn,delay,...args);
          if([800,1600,3200,6400,60000].includes(delay))recoveryTimers.push({delay,run:()=>{clearTimeout(id);fn(...args)}});return id};
          addEventListener('message',e=>{if(e.data?.type==='live-share-frame-start')starts.push({id:e.data.id,at:Date.now()});});
          window.framesSource=Frames.attachSourceFrames({pageId:'outer-page',send:p=>packets.push(p),onStatus:s=>{statuses.push(s);failures.push({id:document.querySelector('#source').getAttribute('data-live-share-frame'),at:Date.now()})}});</script></body></html>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function fixture(t, large = false) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    t.after(() => page.close()); const errors = [];
    page.on('pageerror', error => errors.push(error.message)); t.after(() => assert.deepEqual(errors, []));
    await page.goto(`${origin}/${large ? '?large=1' : ''}`);
    const child = page.frames().find(frame => frame.url().includes('/scratch-editor/editor.html'));
    await child.waitForFunction(() => typeof window.oversize === 'function');
    await page.waitForFunction(() => starts.length > 0);
    return { page, child };
}

it('restarts an oversized child recorder with a new epoch and resumes normal updates without refreshing the learner page', { timeout: 25000 }, async t => {
    const { page, child } = await fixture(t);
    await page.waitForFunction(() => packets.some(p => p.type === 'frame' && p.packet.event?.type === 2));
    const firstId = await page.locator('#source').getAttribute('data-live-share-frame');
    await child.evaluate(() => oversize());
    await page.waitForFunction(() => statuses.includes('Scratch 画面正在重新同步…'));
    await child.evaluate(() => { document.querySelector('#oversize').remove(); document.querySelector('#text').textContent = '恢复后仍是同一个作品'; });
    await page.waitForFunction(old => document.querySelector('#source').getAttribute('data-live-share-frame') !== old, firstId);
    await page.waitForFunction(old => packets.some(p => p.type === 'frame' && p.id !== old && p.packet.event?.type === 2
        && JSON.stringify(p.packet).includes('恢复后仍是同一个作品')), firstId);
    assert.equal(await page.evaluate(() => starts.length), 2);
    const currentId = await page.locator('#source').getAttribute('data-live-share-frame');
    await page.evaluate(() => { packets.length = 0; });
    await child.evaluate(() => { document.querySelector('#text').textContent = '实时更新也恢复'; });
    await page.waitForFunction(id => packets.some(p => p.id === id && JSON.stringify(p).includes('实时更新也恢复')), currentId);
    assert.equal(await page.evaluate(old => packets.some(p => p.id === old), firstId), false, 'retired recorder packets cannot enter the new epoch');
});

it('backs off an oversized initial snapshot and recovers automatically once the page becomes capturable', { timeout: 25000 }, async t => {
    const { page, child } = await fixture(t, true);
    await page.waitForFunction(() => failures.length >= 3);
    const attempts = await page.evaluate(() => ({starts,failures}));
    const delays = attempts.failures.slice(0, 2).map(failure => attempts.starts.find(start => start.at > failure.at && start.id !== failure.id).at - failure.at);
    assert(delays[0] >= 700, JSON.stringify(attempts));
    assert(delays[1] >= 1400, `consecutive failures increase the delay instead of spinning: ${JSON.stringify(attempts)}`);
    await child.evaluate(() => { document.querySelector('#oversize').remove(); document.querySelector('#text').textContent = '首次画面恢复'; });
    await page.waitForFunction(() => packets.some(p => p.type === 'frame' && p.packet.event?.type === 2
        && JSON.stringify(p.packet).includes('首次画面恢复')), null, { timeout: 10000 });
    assert(await page.evaluate(() => failures.length <= 3));
});

it('ignores forged recovery requests and cancels a scheduled child restart when sharing is disposed', { timeout: 20000 }, async t => {
    const { page, child } = await fixture(t);
    const id = await page.locator('#source').getAttribute('data-live-share-frame');
    await page.evaluate(id => postMessage({ type: 'live-share-frame-status', id, channel: 'recovery-frame-channel', code: 'RECORDER_STOPPED' }, '*'), id);
    await child.evaluate(id => parent.postMessage({ type: 'live-share-frame-status', id, channel: 'wrong-channel', code: 'RECORDER_STOPPED' }, '*'), id);
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('#source').getAttribute('data-live-share-frame'), id);
    assert.equal(await page.evaluate(() => statuses.length), 0);
    await child.evaluate(() => oversize());
    await page.waitForFunction(() => statuses.length > 0);
    await page.evaluate(() => framesSource.dispose());
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => starts.length), 1);
    assert.equal(await page.locator('#source').getAttribute('data-live-share-frame'), null);
});

it('cools repeated capture failures down for a minute and resets retries only after healthy capture', { timeout: 45000 }, async t => {
    const { page, child } = await fixture(t, true);
    await page.waitForFunction(() => recoveryTimers.some(timer => timer.delay === 60000), null, { timeout: 25000 });
    const stalledId = await page.locator('#source').getAttribute('data-live-share-frame');
    const failures = await page.evaluate(() => statuses.length);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#source').getAttribute('data-live-share-frame'), stalledId);
    assert.equal(await page.evaluate(() => statuses.length), failures);
    const finishCooldown = async (text) => {
        await child.evaluate(text => { document.querySelector('#oversize').remove(); document.querySelector('#text').textContent = text; }, text);
        // Exercise the minute timer's callback without making the suite sleep a minute.
        await page.evaluate(() => recoveryTimers.filter(timer => timer.delay === 60000).at(-1).run());
        await page.waitForFunction(text => packets.some(p => p.type === 'frame' && p.packet.event?.type === 2
            && JSON.stringify(p.packet).includes(text)), text);
    };
    await finishCooldown('第一次冷却后恢复');
    await child.evaluate(() => oversize());
    await page.waitForFunction(() => recoveryTimers.filter(timer => timer.delay === 60000).length === 2);
    assert.equal(await page.evaluate(() => recoveryTimers.at(-1).delay), 60000, 'brief recovery does not reset the failure budget');
    await finishCooldown('第二次冷却后恢复');
    await page.evaluate(() => { window.originalNow = Date.now; Date.now = () => originalNow() + 31000; });
    await child.evaluate(() => { document.querySelector('#text').textContent = '稳定采集后的新更新'; });
    await page.waitForFunction(() => packets.some(p => JSON.stringify(p).includes('稳定采集后的新更新')));
    const before = await page.evaluate(() => recoveryTimers.length);
    await child.evaluate(() => oversize());
    await page.waitForFunction(before => recoveryTimers.length > before, before);
    assert.equal(await page.evaluate(() => recoveryTimers.at(-1).delay), 800, 'healthy capture lasting 30 seconds restores the fast transient retry');
    await page.evaluate(() => { Date.now = originalNow; framesSource.dispose(); });
});
