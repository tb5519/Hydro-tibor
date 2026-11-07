/* Real Hydro pages, authenticated WebSockets, browser microphones and AudioWorklets.
 * No application controller or transport is mocked. The browser's generated
 * microphone is the only substitute, so this is safe to run without a headset.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { before, after, it } = require('node:test');

const root = path.resolve(__dirname, '..');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Use the available browser runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
let browser; let server; let fixture; let logs = ''; let serverExited = false; let audioFixtureDir; let stage = 'boot';
const pages = [];

before(async () => {
    assert(executablePath, 'A Chromium runtime is required for real application voice tests');
    server = spawn(process.execPath, ['-r', '@hydrooj/register', 'test/voice_call.integration.js'], {
        cwd: root,
        env: { ...process.env, VOICE_CALL_SERVE: '1', VOICE_CALL_PORT: process.env.VOICE_CALL_APP_PORT || '18907' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    fixture = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Hydro fixture did not become ready:\n${logs.slice(-12000)}`)), 155000);
        const inspect = (chunk) => {
            logs += chunk.toString(); if (logs.length > 160000) logs = logs.slice(-120000);
            const match = logs.match(/VOICE_SMOKE (\{[^\n]+\})/);
            if (match) { clearTimeout(timeout); resolve(JSON.parse(match[1])); }
        };
        server.stdout.on('data', inspect); server.stderr.on('data', inspect);
        server.on('exit', (code) => { serverExited = true; clearTimeout(timeout); reject(new Error(`Hydro fixture exited ${code}:\n${logs.slice(-12000)}`)); });
        server.on('error', reject);
    });
    audioFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onebyone-voice-browser-'));
    const audioPath = path.join(audioFixtureDir, 'microphone.wav');
    const samples = 16000 * 2; const wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
    for (let index = 0; index < samples; index++) wav.writeInt16LE(Math.round(Math.sin(index * 2 * Math.PI * 440 / 16000) * 6500), 44 + index * 2);
    fs.writeFileSync(audioPath, wav);
    browser = await playwright.chromium.launch({ executablePath, headless: true,
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
            `--use-file-for-fake-audio-capture=${audioPath}`] });
}, { timeout: 170000 });

after(async () => {
    for (const [index, record] of pages.entries()) {
        if (record.page.isClosed()) continue;
        try {
            const state = await record.page.evaluate(() => ({ url: location.href,
                microphoneRequests: __voiceAppProbe?.microphoneRequests,
                tracks: __voiceAppProbe?.tracks.map((track) => ({ state: track.readyState, enabled: track.enabled })),
                frames: { captured: __voiceAppProbe?.capturedFrames, playback: __voiceAppProbe?.playFrames,
                    received: __voiceAppProbe?.received.filter((message) => message.type === 'audio').length },
                controlMessages: __voiceAppProbe?.received.filter((message) => message.type !== 'audio').slice(-15),
                voiceText: [...document.querySelectorAll('.voice-call-card,.voice-call-floating')].map((node) => node.textContent),
                errors: __voiceAppProbe?.errors,
            }));
            fs.writeFileSync(path.join(os.tmpdir(), `onebyone-voice-real-diagnostic-${index}.json`), JSON.stringify({ stage, ...state, errors: record.errors }, null, 2));
            await record.page.screenshot({ path: path.join(os.tmpdir(), `onebyone-voice-real-final-${index}.png`) });
        } catch { /* The original assertion remains the primary failure. */ }
    }
    await browser?.close();
    if (audioFixtureDir) fs.rmSync(audioFixtureDir, { recursive: true, force: true });
    if (server && !serverExited) {
        server.kill('SIGTERM');
        await Promise.race([new Promise((resolve) => server.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 5000))]);
        if (!serverExited) server.kill('SIGKILL');
    }
});

async function participant(username, size = { width: 1360, height: 900 }) {
    const context = await browser.newContext({ viewport: size, permissions: ['microphone'] });
    const response = await context.request.post(`${fixture.origin}/login`, {
        form: { uname: username, password: fixture.password }, maxRedirects: 0,
    });
    assert.equal(response.status(), 302, (await response.text()).slice(0, 800));
    await context.addInitScript(() => {
        const probe = { microphoneRequests: 0, tracks: [], worklets: [], sent: [], received: [], playFrames: 0,
            capturedFrames: 0, audibleCaptureFrames: 0, audiblePlaybackFrames: 0, sockets: [], errors: [] };
        window.__voiceAppProbe = probe;
        const remember = (key) => sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) || '0') + 1));
        const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (...args) => {
            probe.microphoneRequests++; remember('voice-test.microphone-requests');
            const stream = await nativeGetUserMedia(...args);
            probe.tracks.push(...stream.getTracks()); return stream;
        };
        const nativeStop = MediaStreamTrack.prototype.stop;
        MediaStreamTrack.prototype.stop = function stopObservedTrack() {
            remember('voice-test.stopped-tracks'); return nativeStop.call(this);
        };
        const NativeSocket = window.WebSocket;
        window.WebSocket = class ObservedSocket extends NativeSocket {
            constructor(...args) {
                super(...args);
                this.isVoice = String(args[0]).includes('/voice-call/conn');
                if (!this.isVoice) return;
                probe.sockets.push(this);
                this.addEventListener('message', ({ data }) => {
                    try {
                        const message = JSON.parse(data);
                        // Keep only counts and metadata, never audio samples.
                        probe.received.push(message.type === 'audio' ? { type: 'audio', callId: message.callId,
                            seq: message.seq, streamId: message.streamId, length: message.data?.length } : message);
                    } catch { /* Heartbeat text. */ }
                });
            }
            send(data) {
                if (this.isVoice) {
                    try {
                        const message = JSON.parse(data);
                        probe.sent.push(message.type === 'audio' ? { type: 'audio', callId: message.callId,
                            seq: message.seq, length: message.data?.length } : message);
                    } catch { /* Heartbeat text. */ }
                }
                return super.send(data);
            }
        };
        const NativeWorklet = window.AudioWorkletNode;
        window.AudioWorkletNode = class ObservedWorklet extends NativeWorklet {
            constructor(...args) {
                super(...args);
                if (args[1] !== 'onebyone-voice') return;
                probe.worklets.push(this);
                const nativePost = this.port.postMessage.bind(this.port);
                this.port.postMessage = (...values) => {
                    if (values[0]?.type === 'play') {
                        probe.playFrames++;
                        if (values[0].bytes?.some((value) => value !== 255 && value !== 127)) probe.audiblePlaybackFrames++;
                    }
                    return nativePost(...values);
                };
                this.port.addEventListener('message', ({ data }) => {
                    if (data?.type === 'frame') { probe.capturedFrames++; if (data.level > 0.001) probe.audibleCaptureFrames++; }
                });
                this.port.start();
            }
        };
        window.addEventListener('error', (event) => probe.errors.push(event.message));
        window.addEventListener('unhandledrejection', (event) => probe.errors.push(String(event.reason?.stack || event.reason)));
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', (error) => errors.push(error.stack || error.message));
    pages.push({ page, errors });
    await page.goto(`${fixture.origin}/d/${fixture.domainId}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__voiceAppProbe?.received.some((message) => message.type === 'ready'), null, { timeout: 25000 });
    return page;
}

async function assistant(page) {
    const toggle = page.locator('[data-assistant-toggle]');
    await toggle.waitFor({ state: 'visible' });
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
}
async function dial(teacher, student) {
    await assistant(teacher);
    await teacher.locator('[data-voice-call-open]').click();
    const learner = teacher.locator(`[data-voice-student="${fixture.studentUid}"]`);
    await learner.waitFor({ state: 'visible' });
    await teacher.waitForFunction((uid) => !document.querySelector(`[data-voice-student="${uid}"]`)?.disabled, fixture.studentUid);
    await learner.click();
    await student.locator('.voice-call-card.is-incoming').waitFor({ state: 'visible', timeout: 15000 });
}
const snapshot = (page) => page.evaluate(() => __voiceAppProbe.received.filter((message) => message.type === 'snapshot').at(-1));
const count = (page, key, type = 'audio') => page.evaluate(({ key, type }) => __voiceAppProbe[key].filter((message) => message.type === type).length, { key, type });
async function activeAudio(page, minimum = 8) {
    await page.waitForFunction((minimum) => {
        const p = window.__voiceAppProbe;
        return p.received.some((message) => message.type === 'snapshot' && message.status === 'active' && message.isOwner)
            && p.sent.filter((message) => message.type === 'audio').length >= minimum
            && p.received.filter((message) => message.type === 'audio').length >= minimum
            && p.worklets.length > 0 && p.capturedFrames >= minimum && p.playFrames >= minimum
            && p.audibleCaptureFrames > 0 && p.audiblePlaybackFrames > 0;
    }, minimum, { timeout: 20000 });
}
async function stopped(page) {
    await page.waitForFunction(() => __voiceAppProbe.tracks.length > 0
        && __voiceAppProbe.tracks.every((track) => track.readyState === 'ended'), null, { timeout: 10000 });
}

it('real application connects two voices, isolates a third student, survives navigation and sharing, and releases either hangup', { timeout: 180000 }, async () => {
    stage = 'login and presence';
    const teacher = await participant(fixture.teacher);
    const student = await participant(fixture.student, { width: 1100, height: 780 });
    const other = await participant(fixture.other);
    assert.equal(await student.evaluate(() => __voiceAppProbe.microphoneRequests), 0);
    assert.equal(await other.evaluate(() => __voiceAppProbe.microphoneRequests), 0);
    stage = 'dial and consent';
    await dial(teacher, student);
    assert.equal(await student.evaluate(() => __voiceAppProbe.microphoneRequests), 0, 'incoming call never starts student microphone');
    assert.equal(await count(student, 'received'), 0, 'no audio arrives before acceptance');
    await student.getByRole('button', { name: '接听', exact: true }).click();
    await Promise.all([activeAudio(teacher), activeAudio(student)]);
    console.log('PASS real two-way microphone audio and explicit student consent');
    const firstCall = (await snapshot(teacher)).callId;
    assert.equal((await snapshot(student)).callId, firstCall);
    assert.equal(await count(other, 'received'), 0);
    assert.equal(await count(other, 'received', 'snapshot'), 0);
    assert.equal(await other.evaluate(() => __voiceAppProbe.microphoneRequests), 0);
    assert.ok(await teacher.evaluate(() => __voiceAppProbe.received.filter((message) => message.type === 'audio').every((message) => message.length === 856 && !!message.streamId)));

    stage = 'mute';
    await teacher.getByRole('button', { name: '静音', exact: true }).click();
    const mutedAt = await count(teacher, 'sent');
    await teacher.waitForTimeout(350);
    assert.equal(await count(teacher, 'sent'), mutedAt, 'mute stops audio traffic');
    assert.ok(await teacher.evaluate(() => __voiceAppProbe.tracks.every((track) => !track.enabled)));
    await teacher.getByRole('button', { name: '取消静音', exact: true }).click();
    await teacher.waitForFunction((before) => __voiceAppProbe.sent.filter((message) => message.type === 'audio').length > before + 4, mutedAt);

    stage = 'student full-page navigation';
    const studentStops = await student.evaluate(() => Number(sessionStorage.getItem('voice-test.stopped-tracks') || '0'));
    await student.goto(`${fixture.origin}/home/domain`, { waitUntil: 'domcontentloaded' });
    await activeAudio(student);
    assert.equal((await snapshot(student)).callId, firstCall, 'student navigation keeps the accepted call');
    assert.ok(await student.evaluate((previous) => Number(sessionStorage.getItem('voice-test.stopped-tracks') || '0') > previous, studentStops));
    assert.equal(await student.locator('.voice-call-card.is-incoming').isVisible(), false, 'no second acceptance is needed');

    stage = 'teacher full-page navigation';
    const teacherStops = await teacher.evaluate(() => Number(sessionStorage.getItem('voice-test.stopped-tracks') || '0'));
    await teacher.goto(`${fixture.origin}/home/domain`, { waitUntil: 'domcontentloaded' });
    await activeAudio(teacher);
    assert.equal((await snapshot(teacher)).callId, firstCall, 'teacher navigation keeps the same call');
    assert.ok(await teacher.evaluate((previous) => Number(sessionStorage.getItem('voice-test.stopped-tracks') || '0') > previous, teacherStops));
    const beforeAfterNavigation = await count(student, 'received');
    await student.waitForFunction((before) => __voiceAppProbe.received.filter((message) => message.type === 'audio').length > before + 8, beforeAfterNavigation);
    console.log('PASS mute, both full-page navigations and same-call audio recovery');

    // These isolated accounts only join voice-class. Existing screen sharing
    // requires membership in the page's classroom, whereas voice deliberately
    // survives personal pages with no system-domain membership.
    await Promise.all([teacher, student].map((page) => page.goto(`${fixture.origin}/d/${fixture.domainId}/`, { waitUntil: 'domcontentloaded' })));
    await Promise.all([teacher, student].map((page) => activeAudio(page)));
    assert.equal((await snapshot(teacher)).callId, firstCall);
    assert.equal((await snapshot(student)).callId, firstCall);
    stage = 'share start';
    await assistant(teacher);
    await teacher.locator('[data-live-share-open]').click();
    const sharedLearner = teacher.locator('.live-share-student').filter({ hasText: fixture.student }).first();
    await sharedLearner.waitFor({ state: 'visible' });
    await sharedLearner.click();
    await teacher.locator('.live-share-overlay').waitFor({ state: 'visible', timeout: 20000 });
    await teacher.locator('.live-share-mirror iframe').waitFor({ state: 'attached', timeout: 20000 });
    await student.locator('.live-share-notice').waitFor({ state: 'visible', timeout: 20000 });
    assert.equal(await teacher.locator('.voice-call-floating').isVisible(), true);
    const sharedAt = await count(teacher, 'received');
    await teacher.waitForFunction((before) => __voiceAppProbe.received.filter((message) => message.type === 'audio').length > before + 8, sharedAt);
    await teacher.screenshot({ path: path.join(os.tmpdir(), 'onebyone-voice-real-shared.png') });
    stage = 'share stop';
    await assistant(teacher);
    await teacher.getByRole('button', { name: '断开共享', exact: true }).click();
    await teacher.locator('.live-share-overlay').waitFor({ state: 'detached' });
    assert.equal((await snapshot(teacher)).callId, firstCall);
    const afterShare = await count(student, 'received');
    await student.waitForFunction((before) => __voiceAppProbe.received.filter((message) => message.type === 'audio').length > before + 8, afterShare);
    await teacher.screenshot({ path: path.join(os.tmpdir(), 'onebyone-voice-real-teacher.png') });
    await student.screenshot({ path: path.join(os.tmpdir(), 'onebyone-voice-real-student.png') });
    console.log('PASS voice alongside real screen sharing and share disconnection');

    stage = 'teacher hangup';
    await teacher.locator('.voice-call-window').getByRole('button', { name: '挂断', exact: true }).click();
    await Promise.all([stopped(teacher), stopped(student)]);
    assert.equal(await other.evaluate(() => __voiceAppProbe.microphoneRequests), 0);
    assert.equal(await count(other, 'received'), 0);
    await student.locator('.voice-call-floating').waitFor({ state: 'hidden', timeout: 10000 });
    stage = 'student hangup';
    await dial(teacher, student);
    await student.getByRole('button', { name: '接听', exact: true }).click();
    await Promise.all([teacher, student].map((page) => page.waitForFunction((previous) => {
        const current = __voiceAppProbe.received.filter((message) => message.type === 'snapshot').at(-1);
        return current?.status === 'active' && current.callId !== previous && current.isOwner;
    }, firstCall)));
    await Promise.all([teacher.waitForFunction(() => __voiceAppProbe.tracks.some((track) => track.readyState === 'live')),
        student.waitForFunction(() => __voiceAppProbe.tracks.some((track) => track.readyState === 'live'))]);
    await student.locator('.voice-call-window').getByRole('button', { name: '挂断', exact: true }).click();
    await Promise.all([stopped(teacher), stopped(student)]);
    for (const record of pages) assert.deepEqual(record.errors, [], `Browser errors at ${record.page.url()}`);
    stage = 'complete';
});
