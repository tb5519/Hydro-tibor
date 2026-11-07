const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { build } = require('esbuild');
let playwright;
for (const name of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(name); break; } catch { /* Bundled browser is supported. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((value) => value && fs.existsSync(value));
let browser; let script;
before(async () => {
    assert(executablePath, 'Chromium is required for voice audio tests');
    script = (await build({ entryPoints: [path.join(__dirname, '../packages/ui-default/components/voice_call/audio.ts')],
        bundle: true, format: 'iife', globalName: 'Voice', write: false })).outputFiles[0].text;
    browser = await playwright.chromium.launch({ executablePath, headless: true,
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
});
after(async () => { await browser?.close(); });
async function page(t) {
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();
    await context.route('https://voice.test/**', (route) => route.fulfill({ contentType: 'text/html',
        body: '<!doctype html><button id="start">开始</button>' }));
    await page.goto('https://voice.test/'); await page.addScriptTag({ content: script });
    t.after(() => context.close()); return page;
}
it('real Chromium microphone and AudioWorklet capture bounded frames, play them, mute, and release devices', async (t) => {
    const p = await page(t);
    await p.evaluate(() => {
        window.frames = []; window.failures = [];
        window.audio = new Voice.VoiceAudio({ onFrame(data) { frames.push(data); audio.receive(frames.length, data); },
            onError(e) { failures.push(e.message); } });
        document.querySelector('#start').onclick = async () => { await audio.start(); audio.setTransmitting(true); };
    });
    await p.click('#start');
    await p.waitForFunction(() => frames.length >= 12, null, { timeout: 10000 });
    const state = await p.evaluate(() => ({ frames: frames.length, sizes: [...new Set(frames.map((v) => v.length))],
        context: audio.context.state, track: audio.stream.getTracks()[0].readyState, failures }));
    assert.deepEqual(state.sizes, [856]); assert.equal(state.context, 'running'); assert.equal(state.track, 'live');
    assert.deepEqual(state.failures, []);
    await p.evaluate(() => { audio.setMuted(true); window.mutedCount = frames.length; });
    await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => frames.length - mutedCount), 0);
    await p.evaluate(() => { audio.setMuted(false); });
    await p.waitForFunction(() => frames.length > mutedCount + 3);
    const released = await p.evaluate(async () => {
        const track = audio.stream.getTracks()[0]; const context = audio.context;
        audio.stop(); await new Promise((r) => setTimeout(r, 20));
        return { track: track.readyState, context: context.state, ready: audio.ready };
    });
    assert.deepEqual(released, { track: 'ended', context: 'closed', ready: false });
});
it('late getUserMedia resolution after hangup stops the newly returned track', async (t) => {
    const p = await page(t);
    const result = await p.evaluate(async () => {
        const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        const stream = await native({ audio: true });
        let grant;
        navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { grant = resolve; });
        const audio = new Voice.VoiceAudio({ onFrame() {} });
        const opening = audio.start();
        audio.stop(); grant(stream); await opening;
        return { track: stream.getTracks()[0].readyState, ready: audio.ready };
    });
    assert.deepEqual(result, { track: 'ended', ready: false });
});
it('autoplay suspension resolves to a visible retry error instead of leaving microphone open indefinitely', async (t) => {
    const p = await page(t);
    const result = await p.evaluate(async () => {
        const prototype = AudioContext.prototype;
        const oldResume = prototype.resume;
        prototype.resume = () => new Promise(() => {});
        const audio = new Voice.VoiceAudio({ onFrame() {} });
        let message;
        try { await audio.start(); } catch (e) { message = e.message; }
        prototype.resume = oldResume;
        return { message, ready: audio.ready, stream: audio.stream, context: audio.context };
    });
    assert.match(result.message, /点击下方按钮继续通话/);
    assert.equal(result.ready, false); assert.equal(result.stream, null); assert.equal(result.context, null);
});
it('real BroadcastChannel gives duplicated tabs a new identity while navigation retains the original owner', async (t) => {
    const p1 = await page(t);
    const transportScript = (await build({ entryPoints: [path.join(__dirname, '../packages/ui-default/components/voice_call/transport.ts')],
        bundle: true, format: 'iife', globalName: 'VoiceTransportModule', write: false })).outputFiles[0].text;
    const setup = async (p, copiedId) => {
        await p.addScriptTag({ content: transportScript });
        await p.evaluate((copiedId) => {
            if (copiedId) sessionStorage.setItem('onebyone.voice.tab:1', copiedId);
            window.sockets = [];
            class Socket extends EventTarget {
                static OPEN = 1;
                constructor() { super(); this.readyState = 0; this.bufferedAmount = 0; this.sent = []; sockets.push(this);
                    queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
                send(value) { this.sent.push(JSON.parse(value)); if (this.sent.at(-1).type === 'hello') {
                    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'ready' }) })));
                } }
                close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
            }
            window.WebSocket = Socket;
            window.transport = new VoiceTransportModule.VoiceTransport({ enabled: true, uid: 1, socketUrl: '/voice-call/conn' },
                { mediaOwner: true, onMessage() {} });
            transport.start();
        }, copiedId);
        await p.waitForFunction(() => transport.ready);
        return p.evaluate(() => sockets[0].sent[0].tabId);
    };
    const original = await setup(p1);
    const p2 = await p1.context().newPage(); await p2.goto('https://voice.test/');
    const copy = await setup(p2, original);
    assert.notEqual(copy, original, 'duplicated sessionStorage cannot steal the existing voice owner');
    assert.equal(await p1.evaluate(() => sockets[0].sent[0].tabId), original);
    await p1.evaluate(() => transport.dispose());
    await p1.reload();
    assert.equal(await setup(p1), original, 'same-tab page navigation preserves call resume identity');
    await Promise.all([p1.evaluate(() => transport.dispose()), p2.evaluate(() => transport.dispose())]);
});
