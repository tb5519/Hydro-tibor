const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');
const stylus = require('stylus');
const { chromium } = require('playwright');

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
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
});
after(async () => browser?.close());

async function fixture(t, options = {}) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://lesson-camera.test/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>OneByOne 上课模式</title><style>
body{background:#f1f5f9;font:16px system-ui;color:#243044;padding:32px}main{background:white;padding:32px;border-radius:24px;height:500px}button{font:inherit;padding:10px 16px} ${css}
</style></head><body><main><h1>编程课堂</h1><p>老师分享页面，师生摄像头可以拖动及桌面悬浮。</p><button id="join">进入课堂</button></main>
<script>${script}</script><script>
${options.noDocumentPip ? "Object.defineProperty(window,'documentPictureInPicture',{value:undefined});" : ''}
window.sent=[];window.left=0;window.media=LessonMedia.mountLessonMedia({uid:2},{send(message){sent.push(message);return true},onLeave(){left++}});
window.room={_id:'camera-lesson',teacherUid:2,studentUid:5,teacherName:'唐老师',studentName:'橙子'};
document.querySelector('#join').onclick=()=>{const desktop=media.prepareDesktop();window.joined=(async()=>{await new Promise(resolve=>setTimeout(resolve,100));await media.start(room,desktop);media.setConnected(true);media.receive({type:'peer',online:true})})()};
</script></body></html>` }));
    await page.goto('https://lesson-camera.test/classroom');
    return { context, page, errors };
}

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
    assert(stats.camera.width === 1280 && stats.camera.height === 720);
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
    await page.evaluate(() => { window.cameraTrack = document.querySelector('[data-lesson-local-video]').srcObject.getVideoTracks()[0]; });
    await page.locator('[data-lesson-media-leave]').click();
    assert.equal(await page.evaluate(() => cameraTrack.readyState), 'ended');
    const count = await page.evaluate(() => sent.length);
    await page.waitForTimeout(350); assert.equal(await page.evaluate(() => sent.length), count);
    assert.equal(await page.evaluate(() => left), 1); assert.deepEqual(errors, []);
});

it('joining automatically opens a real Document Picture-in-Picture window and sustains 30 fps with teacher above learner', async (t) => {
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
    assert.equal(result.title, 'OneByOne 上课'); assert.equal(result.local, true); assert(result.controls >= 4);
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
            camera: pip.document.querySelector('[data-lesson-local-video]').srcObject.getVideoTracks()[0].getSettings(),
            toggleVisible: !pip.document.querySelector('[data-lesson-desktop]').hidden };
    });
    assert(stats.fps >= 25, `expected at least 25 live frames/sec, got ${stats.fps.toFixed(1)}`);
    assert.equal(stats.camera.width, 1280); assert.equal(stats.camera.height, 720); assert(stats.camera.frameRate >= 25);
    assert.deepEqual(stats.roles, ['teacher', 'student']); assert(stats.top < stats.bottom);
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
    await page.locator('[data-lesson-media-leave]').click(); assert.deepEqual(errors, []);
});
