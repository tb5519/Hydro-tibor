const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');
const stylus = require('stylus');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const executablePath = [process.env.HERO_CHROMIUM_PATH, chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((item) => item && fs.existsSync(item));
const script = esbuild.buildSync({ entryPoints: [path.join(root, 'packages/ui-default/components/lesson/media.ts')],
    bundle: true, write: false, format: 'iife', globalName: 'LessonMedia' }).outputFiles[0].text;
const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/components/lesson/media.styl'), 'utf8'));
let browser;
before(async () => {
    assert(executablePath, 'Chromium is required for real camera and Picture-in-Picture verification');
    browser = await chromium.launch({ executablePath, headless: true,
        args: ['--use-fake-device-for-media-stream=fps=25', '--use-fake-ui-for-media-stream'] });
});
after(async () => browser?.close());

async function fixture(t, options = {}) {
    // A fixed emulated viewport also overrides the native PiP window's requested size.
    const context = await (options.browser || browser).newContext({ viewport: options.noDocumentPip ? { width: 1280, height: 800 } : null });
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://lesson-camera.test/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>OneByOne 上课模式</title><style>
body{background:#f1f5f9;font:16px system-ui;color:#243044;padding:32px}main{background:white;padding:32px;border-radius:24px;height:500px}button{font:inherit;padding:10px 16px} ${css}
</style></head><body><main><h1>编程课堂</h1><p>老师分享页面，师生摄像头可以拖动及桌面悬浮。</p><button id="join">进入课堂</button></main>
<script>${script}</script><script>
${options.noDocumentPip ? "Object.defineProperty(window,'documentPictureInPicture',{value:undefined});" : ''}
window.screenRequests=[];
${options.fakeScreen ? `Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:(constraints)=>{
 screenRequests.push(constraints); const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
 const context=canvas.getContext('2d');context.fillStyle='#c7d2fe';context.fillRect(0,0,1280,720);
 context.fillStyle='#172554';context.font='48px sans-serif';context.fillText('Synthetic learner desktop',80,120);
 const stream=canvas.captureStream(8);window.screenTrack=stream.getVideoTracks()[0];
 const settings=screenTrack.getSettings.bind(screenTrack);screenTrack.getSettings=()=>({...settings(),displaySurface:'monitor'});
 return Promise.resolve(stream);
}});` : ''}
window.sent=[];window.left=0;window.leaveApproved=true;window.media=LessonMedia.mountLessonMedia({uid:${options.uid || 2}},{send(message){sent.push(message);return true},onLeave(){left++;if(window.leaveApproved)media.stop()}});
window.room={_id:'camera-lesson',teacherUid:2,studentUid:5,teacherName:'唐老师',studentName:'橙子'};
document.querySelector('#join').onclick=()=>{const desktop=media.prepareDesktop();window.joined=(async()=>{await new Promise(resolve=>setTimeout(resolve,100));await media.start(room,desktop);media.setConnected(true);media.receive({type:'peer',online:true})})()};
</script></body></html>` }));
    await page.goto('https://lesson-camera.test/classroom');
    return { context, page, errors };
}

if (process.env.LESSON_MAC_BROWSERS === '1') {
    for (const [role, uid] of [['teacher', 2], ['learner', 5]]) {
        it(`Mac WebKit ${role} can read Safari permission help without opening another device prompt`, async t => {
            const engine = await webkit.launch(); t.after(() => engine.close());
            const { page, errors } = await fixture(t, { uid, noDocumentPip: true, browser: engine });
            await page.evaluate(() => {
                window.requests = { microphone: 0, camera: 0, screen: 0 };
                navigator.mediaDevices.getUserMedia = async constraints => {
                    requests[constraints.audio ? 'microphone' : 'camera']++;
                    throw new DOMException('Not allowed', 'NotAllowedError');
                };
                navigator.mediaDevices.getDisplayMedia = async () => {
                    requests.screen++;
                    if (requests.screen === 1) throw new DOMException('Not allowed', 'NotAllowedError');
                    const canvas = document.createElement('canvas');
                    canvas.getContext('2d').fillRect(0, 0, 80, 40);
                    const stream = canvas.captureStream(4); window.selection = stream.getVideoTracks()[0];
                    Object.defineProperty(selection, 'getSettings', { value: undefined });
                    return stream;
                };
            });
            await page.click('#join');
            for (const device of ['camera', 'microphone']) {
                const guide = page.locator(`[data-lesson-device-permission=${device}][data-state=blocked]`);
                await guide.waitFor();
                assert.match(await guide.innerText(), /Safari 浏览器 → 设置 → 网站/);
                await guide.locator('summary').click();
                assert.match(await guide.locator('details[open]').innerText(), /苹果菜单 → 系统设置 → 隐私与安全/);
                await guide.getByRole('button', { name: '收起提示' }).click();
            }
            assert.deepEqual(await page.evaluate(() => requests), { microphone: 1, camera: 1, screen: 0 });
            if (uid === 5) {
                await page.evaluate(() => media.receive({ type: 'screen-view', lessonId: room._id, uid: room.teacherUid, watching: true }));
                await page.getByRole('button', { name: '选择整个屏幕' }).click();
                await page.getByText('在 Mac 上检查屏幕录制权限').click();
                assert.match(await page.locator('details.lesson-media__screen-consent[open]').innerText(), /Safari 浏览器 → 设置 → 网站 → 屏幕共享/);
                assert.equal(await page.evaluate(() => requests.screen), 1);
                await page.getByRole('button', { name: '选择整个屏幕' }).click();
                await page.getByText(/浏览器没有报告共享类型/).waitFor();
                assert.deepEqual(await page.evaluate(() => [selection.readyState, requests.screen, sent.filter(packet => packet.type === 'screen').length]), ['ended', 2, 0]);
            } else {
                await page.locator('[data-lesson-screen-toggle]').click();
                assert.equal(await page.getByText('在 Mac 上检查屏幕录制权限').isVisible(), false);
                assert.equal(await page.evaluate(() => requests.screen), 0);
            }
            assert.deepEqual(errors, []);
        });
    }
}

it('a learner can retry each real device after browser denial and remembered grants start without guidance', async t => {
    // Other capture tests auto-accept native prompts. This browser uses the same
    // test devices with real browser permission decisions.
    const promptBrowser = await chromium.launch({ executablePath, headless: true,
        args: ['--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    t.after(() => promptBrowser.close());
    const { context, page, errors } = await fixture(t, { uid: 5, noDocumentPip: true, browser: promptBrowser });
    const origin = 'https://lesson-camera.test';
    await context.grantPermissions([], { origin });
    await page.evaluate(() => {
        window.deviceRequests = []; window.tracks = {};
        const Worklet = window.AudioWorkletNode;
        window.AudioWorkletNode = class extends Worklet {
            constructor(context, name, options) {
                super(context, name, options);
                if (name === 'onebyone-voice') {
                    window.roomOutput = context;
                    window.outputMeter = context.createAnalyser(); this.connect(outputMeter);
                }
            }
        };
        const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = constraints => {
            const kind = constraints.audio ? 'microphone' : 'camera';
            deviceRequests.push(kind);
            return getUserMedia(constraints).then(stream => { tracks[kind] = stream.getTracks()[0]; return stream; });
        };
    });
    await page.click('#join');
    const camera = page.locator('[data-lesson-device-permission=camera]');
    const microphone = page.locator('[data-lesson-device-permission=microphone]');
    await camera.getByRole('button', { name: '重试摄像头' }).waitFor();
    await microphone.getByRole('button', { name: '重试麦克风' }).waitFor();
    await page.evaluate(() => joined);
    await page.waitForFunction(() => !!window.outputMeter);
    await page.evaluate(() => {
        let seq = 0;
        const signal = btoa(String.fromCharCode(...Array.from({ length: 640 }, (_, i) => i % 32 < 16 ? 160 : 32)));
        window.teacherSpeech = setInterval(() => media.receive({
            type: 'audio', lessonId: room._id, uid: room.teacherUid, seq: seq++, data: signal,
        }), 40);
        window.hearTeacher = () => { const samples = new Float32Array(outputMeter.fftSize); outputMeter.getFloatTimeDomainData(samples); return samples.some(v => Math.abs(v) > .05); };
    });
    await page.waitForFunction(() => hearTeacher());
    await page.evaluate(() => roomOutput.suspend());
    await page.getByRole('button', { name: '点一下，听课堂声音' }).click();
    await page.waitForFunction(() => roomOutput.state === 'running' && hearTeacher());
    await page.evaluate(() => clearInterval(teacherSpeech));
    assert.equal(await page.evaluate(() => deviceRequests.length), 2, 'resuming classroom speakers never reopens either device permission');
    assert.match(await camera.textContent(), /不开摄像头也可以继续上课/);
    assert.equal(await camera.getAttribute('role'), 'group');
    await context.grantPermissions(['microphone'], { origin });
    await microphone.getByRole('button', { name: '重试麦克风' }).click();
    await page.waitForFunction(() => sent.some(message => message.type === 'audio'));
    assert.equal(await microphone.isVisible(), false);
    assert.equal(await camera.isVisible(), true, 'audio works while camera access is denied');
    await context.grantPermissions(['microphone', 'camera'], { origin });
    await camera.getByRole('button', { name: '重试摄像头' }).click();
    await page.waitForFunction(() => document.querySelector('[data-lesson-local-video]').srcObject?.getVideoTracks()[0]?.readyState === 'live');
    assert.equal(await camera.isVisible(), false);
    assert.deepEqual(await page.evaluate(() => deviceRequests.slice(2)), ['microphone', 'camera']);
    // Browsers do not dispatch "ended" for track.stop(). This models a system
    // wake where the previous USB inputs are gone without an event in the page.
    await page.evaluate(() => {
        window.oldInputs = { ...tracks }; oldInputs.camera.stop(); oldInputs.microphone.stop();
        window.dispatchEvent(new Event('pageshow'));
    });
    await page.waitForFunction(() => ['camera', 'microphone'].every(device => oldInputs[device] !== tracks[device] && tracks[device].readyState === 'live'));
    assert.deepEqual(await page.evaluate(() => deviceRequests.slice(4).sort()), ['camera', 'microphone']);
    await page.locator('[data-lesson-camera]').click();
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); navigator.mediaDevices.dispatchEvent(new Event('devicechange')); });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    assert.equal(await page.evaluate(() => document.querySelector('[data-lesson-local-video]').srcObject), null);
    assert.equal(await page.evaluate(() => deviceRequests.length), 6);
    await page.evaluate(() => {
        media.stop(); window.helpShown = [];
        new MutationObserver(changes => changes.forEach(({ target }) => {
            if (target.matches?.('[data-lesson-device-permission]:not([hidden])')) helpShown.push(target.dataset.lessonDevicePermission);
        })).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
    });
    await page.click('#join'); await page.evaluate(() => joined);
    assert.deepEqual(await page.evaluate(() => helpShown), []);
    assert.deepEqual(errors, []);
});

it('a real browser captures bounded JPEG and microphone frames, lets the camera move and stops both tracks on leave', async (t) => {
    const { page, errors } = await fixture(t, { noDocumentPip: true });
    assert.equal(await page.locator('[data-lesson-media]').isVisible(), false);
    assert.equal(await page.evaluate(() => sent.length), 0);
    await page.locator('#join').click();
    await page.waitForFunction(() => sent.some((message) => message.type === 'video') && sent.some((message) => message.type === 'audio'));
    const stats = await page.evaluate(() => ({ video: sent.filter((message) => message.type === 'video').map((message) => message.data.length),
        audio: sent.filter((message) => message.type === 'audio').map((message) => message.data.length),
        camera: document.querySelector('[data-lesson-local-video]').srcObject.getVideoTracks()[0].getSettings() }));
    assert(stats.video.every((length) => length <= 262144)); assert(stats.audio.every((length) => length === 856));
    assert(stats.camera.width === 960 && stats.camera.height === 540);
    await page.evaluate(() => {
        const frame = sent.find((message) => message.type === 'video');
        media.receive({ ...frame, uid: 5, streamId: 'student-camera' });
    });
    await page.waitForFunction(() => !document.querySelector('[data-lesson-remote-video]').hidden);
    const before = await page.locator('[data-lesson-media]').boundingBox();
    const handle = await page.locator('.lesson-media__header').boundingBox();
    await page.mouse.move(handle.x + 60, handle.y + 15); await page.mouse.down();
    await page.mouse.move(handle.x - 200, handle.y - 120, { steps: 5 }); await page.mouse.up();
    const moved = await page.locator('[data-lesson-media]').boundingBox();
    assert(moved.x < before.x - 150 && moved.y < before.y - 80);
    await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-classroom-camera.png') });
    await page.locator('[data-lesson-media]').screenshot({ path: path.join(os.tmpdir(), 'onebyone-classroom-camera-panel.png') });
    await page.evaluate(() => { window.cameraTrack = document.querySelector('[data-lesson-local-video]').srcObject.getVideoTracks()[0]; });
    await page.locator('[data-lesson-media-leave]').click();
    assert.equal(await page.evaluate(() => cameraTrack.readyState), 'live');
    assert.equal(await page.locator('[data-lesson-exit-dialog]').isVisible(), true);
    await page.locator('[data-lesson-exit-cancel]').click();
    assert.equal(await page.locator('[data-lesson-media]').isVisible(), true);
    await page.locator('[data-lesson-media-leave]').click();
    await page.locator('[data-lesson-exit-confirm]').click();
    assert.equal(await page.evaluate(() => cameraTrack.readyState), 'ended');
    const count = await page.evaluate(() => sent.length);
    await page.waitForTimeout(350); assert.equal(await page.evaluate(() => sent.length), count);
    assert.equal(await page.evaluate(() => left), 1); assert.deepEqual(errors, []);
});

it('joining automatically opens a compact Document Picture-in-Picture window and targets 25 fps with teacher above learner', async (t) => {
    const { page, errors } = await fixture(t);
    if (!await page.evaluate(() => !!window.documentPictureInPicture?.requestWindow)) {
        t.skip('This installed Chromium does not expose Document Picture-in-Picture'); return;
    }
    await page.locator('#join').click();
    await page.waitForFunction(() => documentPictureInPicture.window?.document.querySelector('[data-lesson-local-video]')?.srcObject);
    await page.waitForFunction(() => !!documentPictureInPicture.window?.document.querySelector('[data-lesson-media]'));
    assert.equal(await page.locator('[data-lesson-media]').count(), 0);
    const result = await page.evaluate(() => {
        const pip = documentPictureInPicture.window;
        return { title: pip.document.title, local: !!pip.document.querySelector('[data-lesson-local-video]').srcObject,
            controls: pip.document.querySelectorAll('.lesson-media__controls button').length };
    });
    assert.equal(result.title, 'OneByOne 上课'); assert.equal(result.local, true); assert(result.controls >= 3);
    const stats = await page.evaluate(async () => {
        const pip = documentPictureInPicture.window;
        const start = sent.filter(message => message.type === 'video').length;
        const at = performance.now();
        await new Promise(resolve => pip.setTimeout(resolve, 1500));
        const frames = sent.filter(message => message.type === 'video').length - start;
        const tiles = Array.from(pip.document.querySelectorAll('[data-lesson-participant]'));
        return { fps: frames / ((performance.now() - at) / 1000),
            roles: tiles.map(tile => tile.dataset.lessonParticipant),
            top: tiles[0].getBoundingClientRect().top, bottom: tiles[1].getBoundingClientRect().top,
            width: pip.innerWidth, height: pip.innerHeight,
            camera: pip.document.querySelector('[data-lesson-local-video]').srcObject.getVideoTracks()[0].getSettings(),
            toggleVisible: !pip.document.querySelector('[data-lesson-desktop]').hidden };
    });
    assert(stats.fps >= 22, `expected a 25 fps target to sustain at least 22 live frames/sec, got ${stats.fps.toFixed(1)}`);
    assert.equal(stats.camera.width, 960); assert.equal(stats.camera.height, 540); assert(stats.camera.frameRate >= 24);
    assert.deepEqual(stats.roles, ['teacher', 'student']); assert(stats.top < stats.bottom);
    assert(stats.width <= 240, `compact desktop width was ${stats.width}`); assert(stats.height <= 370, `compact desktop height was ${stats.height}`);
    assert.equal(stats.toggleVisible, false);
    const recovery = await page.evaluate(async () => {
        const pip = documentPictureInPicture.window;
        const video = pip.document.querySelector('[data-lesson-local-video]');
        const stream = video.srcObject; const track = stream.getVideoTracks()[0];
        media.setConnected(false);
        const pausedAt = sent.length;
        await new Promise(resolve => pip.setTimeout(resolve, 180));
        const pausedFrames = sent.length - pausedAt;
        media.setConnected(true); media.receive({ type: 'peer', online: true });
        await new Promise(resolve => pip.setTimeout(resolve, 200));
        return { pausedFrames, sameWindow: documentPictureInPicture.window === pip,
            sameStream: video.srcObject === stream, sameTrack: video.srcObject.getVideoTracks()[0] === track,
            trackState: track.readyState, resumed: sent.slice(pausedAt).map(message => message.type) };
    });
    assert.equal(recovery.pausedFrames, 0);
    assert.equal(recovery.sameWindow, true); assert.equal(recovery.sameStream, true); assert.equal(recovery.sameTrack, true);
    assert.equal(recovery.trackState, 'live'); assert(recovery.resumed.includes('video')); assert(recovery.resumed.includes('audio'));
    await page.evaluate(() => documentPictureInPicture.window.close());
    await page.waitForFunction(() => !!document.querySelector('[data-lesson-media]'));
    await page.locator('[data-lesson-media-leave]').click(); await page.locator('[data-lesson-exit-confirm]').click(); assert.deepEqual(errors, []);
});

it('the desktop camera window opens beauty between both pictures and confirms end without native browser dialogs', async (t) => {
    const { page, errors } = await fixture(t);
    if (!await page.evaluate(() => !!window.documentPictureInPicture?.requestWindow)) {
        t.skip('This installed Chromium does not expose Document Picture-in-Picture'); return;
    }
    await page.locator('#join').click();
    await page.waitForFunction(() => documentPictureInPicture.window?.document.querySelector('[data-lesson-local-video]')?.srcObject);
    const cancelled = await page.evaluate(() => {
        const pip = documentPictureInPicture.window; const doc = pip.document;
        window.confirm = pip.confirm = () => { throw new Error('A native confirmation cannot be used inside desktop PiP'); };
        const camera = doc.querySelector('[data-lesson-local-video]'); window.cameraTrack = camera.srcObject.getVideoTracks()[0];
        const group = doc.querySelector('[aria-label="老师摄像头美颜"]');
        const collapsed = group.hidden; const footer = doc.querySelector('.lesson-media__controls').getBoundingClientRect();
        const footerVisible = footer.top >= 0 && footer.bottom <= pip.innerHeight;
        doc.querySelector('[data-lesson-beauty-toggle]').click();
        const expanded = !group.hidden && group.closest('.lesson-media__tile') === null;
        const sliders = Array.from(group.querySelectorAll('input')).map(input => input.dataset.lessonBeauty);
        const panel = group.getBoundingClientRect(); const teacher = doc.querySelector('[data-lesson-participant="teacher"]').getBoundingClientRect();
        const student = doc.querySelector('[data-lesson-participant="student"]').getBoundingClientRect();
        doc.querySelector('[data-lesson-media-leave]').click();
        const dialog = !doc.querySelector('[data-lesson-exit-dialog]').hidden;
        doc.querySelector('[data-lesson-exit-cancel]').click();
        return { collapsed, expanded, sliders, footerVisible, betweenCameras: panel.top >= teacher.bottom && panel.bottom <= student.top,
            dialog, cancelled: doc.querySelector('[data-lesson-exit-dialog]').hidden,
            state: cameraTrack.readyState, sameWindow: documentPictureInPicture.window === pip, left };
    });
    assert.equal(cancelled.collapsed, true); assert.equal(cancelled.expanded, true); assert.equal(cancelled.betweenCameras, true);
    assert.equal(cancelled.footerVisible, true);
    assert.deepEqual(cancelled.sliders, ['whitening', 'smoothing', 'eyeBrightening']);
    assert.equal(cancelled.dialog, true); assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.state, 'live'); assert.equal(cancelled.sameWindow, true); assert.equal(cancelled.left, 0);
    await page.evaluate(() => {
        const doc = documentPictureInPicture.window.document;
        doc.querySelector('[data-lesson-media-leave]').click(); doc.querySelector('[data-lesson-exit-confirm]').click();
    });
    await page.waitForFunction(() => !documentPictureInPicture.window);
    assert.equal(await page.evaluate(() => cameraTrack.readyState), 'ended');
    assert.equal(await page.evaluate(() => left), 1); assert.deepEqual(errors, []);
});

it('the real desktop window switches the learner tile between screen and camera without restarting devices', async t => {
    const { page, errors } = await fixture(t);
    if (!await page.evaluate(() => !!window.documentPictureInPicture?.requestWindow)) {
        t.skip('This installed Chromium does not expose Document Picture-in-Picture'); return;
    }
    await page.locator('#join').click();
    await page.evaluate(() => joined);
    await page.waitForFunction(() => documentPictureInPicture.window?.document.querySelector('[data-lesson-local-video]')?.srcObject);
    const toggled = await page.evaluate(() => {
        const doc = documentPictureInPicture.window.document; const camera = doc.querySelector('[data-lesson-local-video]');
        window.originalCamera = camera.srcObject; window.originalCameraTrack = camera.srcObject.getVideoTracks()[0];
        const toggle = doc.querySelector('[data-lesson-screen-toggle]');
        const tile = toggle.closest('[data-lesson-participant]').dataset.lessonParticipant;
        toggle.click();
        return { tile, request: sent.find(message => message.type === 'screen-view' && message.watching), displayRequests: screenRequests.length };
    });
    assert.equal(toggled.tile, 'student'); assert(toggled.request); assert.equal(toggled.displayRequests, 0);
    await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
        const context = canvas.getContext('2d'); context.fillStyle = '#b8e3ff'; context.fillRect(0, 0, 1280, 720);
        context.fillStyle = '#0f172a'; context.font = '48px sans-serif'; context.fillText('Entire synthetic desktop', 40, 80);
        media.receive({ type: 'screen-state', lessonId: room._id, uid: 5, streamId: 'learner-desktop', state: 'sharing' });
        media.receive({ type: 'screen', lessonId: room._id, uid: 5, streamId: 'learner-desktop', seq: 1, data: canvas.toDataURL('image/jpeg', .7) });
    });
    await page.waitForFunction(() => {
        const image = documentPictureInPicture.window.document.querySelector('[data-lesson-remote-screen]');
        return image && !image.hidden && image.complete && image.naturalWidth === 1280;
    });
    const received = await page.evaluate(() => {
        const pip = documentPictureInPicture.window; const doc = pip.document;
        const image = doc.querySelector('[data-lesson-remote-screen]');
        const style = pip.getComputedStyle(image);
        const fit = style.objectFit; const transform = style.transform;
        doc.querySelector('[data-lesson-screen-toggle]').click();
        return { fit, transform, hidden: image.hidden, src: image.getAttribute('src'),
            sameCamera: doc.querySelector('[data-lesson-local-video]').srcObject === originalCamera,
            cameraState: originalCameraTrack.readyState, watchingFalse: sent.filter(message => message.type === 'screen-view').at(-1)?.watching === false };
    });
    assert.equal(received.fit, 'contain'); assert.equal(received.transform, 'none'); assert.equal(received.hidden, true); assert.equal(received.src, null);
    assert.equal(received.sameCamera, true); assert.equal(received.cameraState, 'live'); assert.equal(received.watchingFalse, true);
    await page.evaluate(() => { const doc = documentPictureInPicture.window.document; doc.querySelector('[data-lesson-media-leave]').click(); doc.querySelector('[data-lesson-exit-confirm]').click(); });
    assert.deepEqual(errors, []);
});

it('a learner authorizes a synthetic whole-screen stream from PiP and ending class stops that track', async t => {
    const { page, errors } = await fixture(t, { uid: 5, fakeScreen: true });
    if (!await page.evaluate(() => !!window.documentPictureInPicture?.requestWindow)) {
        t.skip('This installed Chromium does not expose Document Picture-in-Picture'); return;
    }
    await page.locator('#join').click();
    await page.evaluate(() => joined);
    await page.waitForFunction(() => documentPictureInPicture.window?.document.querySelector('[data-lesson-local-video]')?.srcObject);
    await page.evaluate(() => media.receive({ type: 'screen-view', lessonId: room._id, uid: 2, streamId: 'teacher-desktop', watching: true }));
    assert.equal(await page.evaluate(() => screenRequests.length), 0);
    const requested = await page.evaluate(() => {
        const doc = documentPictureInPicture.window.document;
        const consent = doc.querySelector('[data-lesson-screen-consent]');
        const visible = !consent.hidden; doc.querySelector('[data-lesson-screen-share]').click();
        return { visible, calls: screenRequests.length, surface: screenRequests[0]?.video?.displaySurface };
    });
    assert.equal(requested.visible, true); assert.equal(requested.calls, 1); assert.equal(requested.surface, 'monitor');
    await page.waitForFunction(() => sent.some(message => message.type === 'screen'));
    const frames = await page.evaluate(() => sent.filter(message => message.type === 'screen').map(message => message.data.length));
    assert(frames.every(length => length <= 262144));
    assert.equal(await page.evaluate(() => screenTrack.readyState), 'live');
    await page.evaluate(() => { const doc = documentPictureInPicture.window.document; doc.querySelector('[data-lesson-media-leave]').click(); doc.querySelector('[data-lesson-exit-confirm]').click(); });
    assert.equal(await page.evaluate(() => screenTrack.readyState), 'ended');
    assert.deepEqual(errors, []);
});

function panelGeometry(root) {
    const rect = el => {
        const { x, y, width, height, right, bottom } = el.getBoundingClientRect();
        return { x, y, width, height, right, bottom };
    };
    const content = root.querySelector('.lesson-media__content');
    const tiles = Array.from(root.querySelectorAll('[data-lesson-participant]'));
    return {
        panel: rect(root), grid: rect(content.firstElementChild), tiles: tiles.map(rect),
        last: rect(Array.from(content.children).filter(el => el.getClientRects().length).at(-1)),
        footer: rect(root.querySelector('.lesson-media__controls')),
        scrollWidth: content.scrollWidth, clientWidth: content.clientWidth,
    };
}

function assertPanelFits(layout, sideBySide = false) {
    const { panel, grid, tiles, footer, last } = layout;
    assert(Math.abs(grid.x - panel.x) <= 1 && Math.abs(grid.right - panel.right) <= 1,
        'the cameras span the panel from edge to edge');
    assert(Math.abs(grid.y - tiles[0].y) <= 1 && Math.abs(grid.bottom - tiles[1].bottom) <= 1);
    if (sideBySide) {
        assert(Math.abs(grid.x - tiles[0].x) <= 1 && Math.abs(grid.right - tiles[1].right) <= 1);
        assert(Math.abs(tiles[1].x - tiles[0].right) <= 2);
    } else {
        for (const tile of tiles) assert.equal(tile.width, grid.width);
        assert(Math.abs(tiles[1].y - tiles[0].bottom) <= 2);
    }
    assert(Math.abs(footer.y - last.bottom) <= 6, 'no empty area between the last picture or status message and the controls');
    assert(Math.abs(panel.bottom - footer.bottom) <= 1, 'no empty space below the controls');
    assert.equal(layout.scrollWidth, layout.clientWidth, 'no horizontal overflow');
}

async function showPeerCamera(page) {
    await page.waitForFunction(() => sent.some(message => message.type === 'video'));
    await page.evaluate(() => media.receive({ ...sent.find(message => message.type === 'video'), uid: 5, streamId: 'learner-camera' }));
    await page.waitForFunction(() => {
        const doc = window.documentPictureInPicture?.window?.document || document;
        return !doc.querySelector('[data-lesson-remote-video]').hidden;
    });
}

it('fits one or two cameras against the real Document PiP edges at compact, tall and landscape sizes', async t => {
    for (const [width, height] of [[220, 350], [300, 480], [540, 240]]) {
        const { page, errors } = await fixture(t);
        const supported = await page.evaluate(([width, height]) => {
            const api = window.documentPictureInPicture;
            if (!api?.requestWindow) return false;
            const open = api.requestWindow.bind(api);
            api.requestWindow = options => open({ ...options, width, height });
            return true;
        }, [width, height]);
        if (!supported) return t.skip('This Chromium has no Document Picture-in-Picture');
        await page.locator('#join').click();
        await page.waitForFunction(() => documentPictureInPicture.window?.document.querySelector('[data-lesson-camera]')?.dataset.state === 'on');
        const panel = await page.evaluateHandle(() => documentPictureInPicture.window.document.querySelector('[data-lesson-media]'));
        const single = await panel.evaluate(panelGeometry);
        assert(Math.abs(single.panel.width - width) <= 32 && Math.abs(single.panel.height - height) <= 32,
            `requested ${width}×${height}, got ${single.panel.width}×${single.panel.height}`);
        assertPanelFits(single);
        assert(single.tiles[1].height <= 42 && single.tiles[0].height > single.tiles[1].height,
            'the offline peer fits in a status and controls row beside the live picture');
        await showPeerCamera(page);
        const both = await panel.evaluate(panelGeometry);
        const horizontal = both.panel.width >= 320 && both.panel.width / both.panel.height >= 1.5;
        assertPanelFits(both, horizontal);
        assert(Math.abs(both.tiles[0].height - both.tiles[1].height) <= 1);
        if (width === 540) assert(horizontal, 'the landscape PiP lays out both cameras side by side');
        await page.evaluate(() => {
            const doc = documentPictureInPicture.window.document;
            doc.querySelector('[data-lesson-camera]').click();
            doc.querySelector('[data-lesson-microphone]').click();
        });
        const remoteOnly = await panel.evaluate(panelGeometry);
        assertPanelFits(remoteOnly);
        assert(remoteOnly.tiles[0].height <= 42 && remoteOnly.tiles[1].height > remoteOnly.tiles[0].height);
        assert.equal(await page.evaluate(() => documentPictureInPicture.window.document.querySelector('[data-lesson-microphone]').dataset.state), 'off');
        await panel.dispose();
        await page.evaluate(() => documentPictureInPicture.window.close());
        await page.waitForFunction(() => !!document.querySelector('[data-lesson-media]'));
        await page.locator('[data-lesson-media-leave]').click(); await page.locator('[data-lesson-exit-confirm]').click();
        assert.equal(await page.evaluate(() => left), 1); assert.deepEqual(errors, []);
        await page.context().close();
    }
});

it('keeps the page fallback tight at desktop and mobile widths and crops the video-only PiP canvas to the available pictures', async t => {
    const { page, errors } = await fixture(t, { noDocumentPip: true });
    await page.locator('#join').click();
    await page.waitForFunction(() => document.querySelector('[data-lesson-camera]').dataset.state === 'on');
    const root = page.locator('[data-lesson-media]');
    for (const width of [1280, 360, 210]) {
        await page.setViewportSize({ width, height: 700 });
        const single = await root.evaluate(panelGeometry);
        assertPanelFits(single);
        assert(single.tiles[1].height <= 42);
        assert(Math.abs(single.tiles[0].width / single.tiles[0].height - 16 / 9) < .03);
        assert(single.panel.x >= 0 && single.panel.right <= width);
    }
    await page.waitForFunction(() => document.pictureInPictureElement?.videoWidth > 0);
    await page.waitForFunction(() => document.pictureInPictureElement.videoHeight === 180);
    await showPeerCamera(page);
    assertPanelFits(await root.evaluate(panelGeometry));
    await page.waitForFunction(() => document.pictureInPictureElement.videoHeight === 360);
    await page.setViewportSize({ width: 360, height: 220 });
    const short = await root.evaluate(panelGeometry);
    assert(short.panel.y >= 0 && short.footer.bottom <= 220, 'header and leave button stay on screen in a short viewport');
    await page.setViewportSize({ width: 360, height: 700 });
    await page.locator('[data-lesson-camera]').click();
    await page.waitForFunction(() => document.pictureInPictureElement.videoHeight === 180);
    const live = await root.evaluate(panelGeometry);
    assertPanelFits(live); assert(live.tiles[0].height <= 42);
    await page.locator('[data-lesson-microphone]').click();
    assert.equal(await page.locator('[data-lesson-microphone]').getAttribute('data-state'), 'off');
    await page.evaluate(() => document.exitPictureInPicture());
    await page.locator('[data-lesson-media-leave]').click(); await page.locator('[data-lesson-exit-confirm]').click();
    assert.equal(await page.evaluate(() => left), 1); assert.deepEqual(errors, []);
});
