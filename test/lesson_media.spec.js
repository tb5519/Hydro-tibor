const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const source = path.join(__dirname, '../packages/ui-default/components/lesson/media.ts');
const lesson = {
    _id: 'lesson-123', teacherUid: 2, studentUid: 10, teacherName: '唐老师', studentName: '橙子',
    title: 'Python 课堂', startAt: new Date().toISOString(), endAt: new Date(Date.now() + 3600000).toISOString(),
    status: 'active', teacherJoined: true, studentJoined: true,
};
const jpeg = 'data:image/jpeg;base64,/9j/2Q==';
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(t, options = {}) {
    const dom = new JSDOM('<main>学习页面</main>', { url: 'https://onebyone.test/', pretendToBeVisual: true });
    const { window } = dom;
    const sent = []; const captures = []; const streams = []; const audioFrames = []; const encodes = [];
    let now = Date.now(); let intervalId = 0;
    const intervals = new Map();
    if (options.manualClock) {
        window.setInterval = (callback, delay) => { const id = ++intervalId; intervals.set(id, { callback, delay }); return id; };
        window.clearInterval = (id) => intervals.delete(id);
    }
    let audioStarts = 0; let audioStops = 0; let audioResets = 0; let left = 0; let delayedResolve;
    let audioOptions;
    const audio = {
        ready: false, transmitting: false, muted: false,
        async start() {
            audioStarts++;
            if (options.microphoneDenied) throw Object.assign(new Error('麦克风权限未开启'), { name: 'NotAllowedError' });
            this.ready = true;
        },
        stop() { audioStops++; this.ready = false; this.transmitting = false; },
        setMuted(value) { this.muted = value; },
        setTransmitting(value) { this.transmitting = value; },
        resetReceive() { audioResets++; },
        receive(...args) { audioFrames.push(args); },
    };
    function makeStream() {
        const listeners = new Map();
        const track = {
            stopped: 0, enabled: true, readyState: 'live',
            stop() { this.stopped++; this.readyState = 'ended'; },
            addEventListener(name, listener) { listeners.set(name, listener); },
            removeEventListener(name) { listeners.delete(name); },
            getSettings() { return { width: 320, height: 240 }; },
        };
        const stream = { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [], track };
        streams.push(stream); return stream;
    }
    Object.defineProperty(window, 'isSecureContext', { value: true });
    Object.defineProperty(window.navigator, 'mediaDevices', { value: {
        getUserMedia(constraints) {
            captures.push(constraints);
            if (options.cameraDenied) return Promise.reject(Object.assign(new Error('摄像头权限未开启'), { name: 'NotAllowedError' }));
            const stream = makeStream();
            if (options.delayedCamera) return new Promise((resolve) => { delayedResolve = () => resolve(stream); });
            return Promise.resolve(stream);
        },
    } });
    window.HTMLMediaElement.prototype.play = async () => {};
    window.HTMLMediaElement.prototype.pause = () => {};
    Object.defineProperties(window.HTMLMediaElement.prototype, { readyState: { get: () => 4 }, paused: { get: () => false } });
    Object.defineProperties(window.HTMLVideoElement.prototype, { videoWidth: { get: () => 320 }, videoHeight: { get: () => 240 } });
    window.HTMLCanvasElement.prototype.getContext = () => ({
        fillRect() {}, clearRect() {}, drawImage() {}, fillText() {}, save() {}, restore() {},
        measureText: () => ({ width: 20 }),
    });
    window.HTMLCanvasElement.prototype.toDataURL = function(type, quality) { encodes.push({ width: this.width, height: this.height, quality }); return options.encodeFrame ? options.encodeFrame(this.width, this.height, quality) : jpeg; };
    const module = { exports: {} };
    const code = transformSync(fs.readFileSync(source, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
    vm.runInNewContext(code, {
        module, exports: module.exports, window, document: window.document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, HTMLVideoElement: window.HTMLVideoElement, Image: window.Image,
        sessionStorage: window.sessionStorage, performance: window.performance,
        requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
        setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
        setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window),
        Date: options.manualClock ? class ClockDate extends Date { static now() { return now; } } : Date,
        require(name) {
            if (name.includes('voice_call/audio')) return { VoiceAudio: function FakeAudio() {}, microphoneError: (error) => error.message };
            throw new Error(`Unexpected import: ${name}`);
        },
    });
    const media = module.exports.mountLessonMedia({ uid: options.uid || lesson.teacherUid }, {
        send(message) { if (options.sendBlocked) return false; sent.push(message); return true; }, onLeave() { left++; },
        audioFactory(value) { audioOptions = value; return audio; },
    });
    const root = window.document.querySelector('[data-lesson-media]');
    t.after(() => { media.dispose(); window.close(); });
    return { window, document: window.document, media, sent, captures, streams, audio, audioFrames, encodes,
        resolveCamera: () => delayedResolve?.(), sendAudio: (data) => audioOptions.onFrame(data),
        advance(milliseconds) { now += milliseconds; for (const interval of intervals.values()) interval.callback(); },
        get root() { return root; },
        get audioStarts() { return audioStarts; }, get audioStops() { return audioStops; },
        get audioResets() { return audioResets; }, get left() { return left; } };
}

it('opening a classroom does not capture before an explicit join, then captures only video through the camera API', async (t) => {
    const f = fixture(t);
    assert.equal(f.captures.length, 0); assert.equal(f.audioStarts, 0);
    await f.media.start(lesson);
    assert.equal(f.captures.length, 1); assert.equal(f.captures[0].audio, false);
    assert.ok(f.captures[0].video); assert.equal(f.audioStarts, 1);
    assert.equal(f.audio.transmitting, false, 'captured audio waits for an authenticated socket');
    f.media.setConnected(true);
    assert.equal(f.audio.transmitting, true);
    f.sendAudio('voice-frame');
    assert.equal(f.sent.at(-1).lessonId, lesson._id); assert.equal(f.sent.at(-1).type, 'audio');
});

it('camera permission rejection leaves the classroom usable and keeps an independently permitted microphone', async (t) => {
    const f = fixture(t, { cameraDenied: true });
    await f.media.start(lesson); f.media.setConnected(true);
    assert.equal(f.audio.ready, true); assert.equal(f.root.hidden, false);
    assert.match(f.root.textContent, /摄像头|权限/);
    assert.ok(f.root.querySelector('[data-lesson-device-retry]'));
    f.root.querySelector('[data-lesson-media-leave]').click();
    assert.equal(f.left, 1, 'a denied camera cannot trap the learner in the room');
});

it('a camera permission result arriving after leave is stopped instead of reopening capture', async (t) => {
    const f = fixture(t, { delayedCamera: true });
    const pending = f.media.start(lesson);
    await tick(); assert.equal(f.captures.length, 1);
    f.media.stop(); f.resolveCamera(); await pending;
    assert.ok(f.streams[0].track.stopped > 0);
    assert.equal(f.audio.ready, false); assert.equal(f.root.hidden, true);
});

it('disconnect releases devices and clears the remote picture; reconnect never reopens them without a click', async (t) => {
    const f = fixture(t);
    await f.media.start(lesson); f.media.setConnected(true);
    f.media.receive({ type: 'video', lessonId: lesson._id, uid: lesson.studentUid, streamId: 'peer-a', seq: 1, data: jpeg });
    f.media.setConnected(false);
    assert.ok(f.streams[0].track.stopped > 0); assert.equal(f.audio.ready, false);
    const remote = f.root.querySelector('[data-lesson-remote-video]');
    assert.equal(remote.getAttribute('src'), null);
    const captures = f.captures.length; const starts = f.audioStarts;
    f.media.setConnected(true); await tick();
    assert.equal(f.captures.length, captures); assert.equal(f.audioStarts, starts);
});

it('frames are isolated to the current lesson and opposite participant, and replayed sequences are dropped', async (t) => {
    const f = fixture(t);
    await f.media.start(lesson); f.media.setConnected(true);
    const valid = { type: 'audio', lessonId: lesson._id, uid: lesson.studentUid, streamId: 'peer-a', seq: 5, data: 'voice' };
    f.media.receive({ ...valid, lessonId: 'another-class' });
    f.media.receive({ ...valid, uid: 99 }); f.media.receive({ ...valid, uid: lesson.teacherUid });
    assert.equal(f.audioFrames.length, 0);
    f.media.receive(valid); f.media.receive(valid); f.media.receive({ ...valid, seq: 4 });
    assert.equal(f.audioFrames.length, 1);
    f.media.receive({ ...valid, streamId: 'peer-b', seq: 0 });
    assert.equal(f.audioFrames.length, 2, 'a newly authorized peer connection restarts its sequence');
    f.media.receive({ type: 'video', lessonId: lesson._id, uid: lesson.studentUid, streamId: 'peer-b', seq: 1, data: jpeg });
    f.media.receive({ type: 'peer', online: false });
    assert.equal(f.root.querySelector('[data-lesson-remote-video]').getAttribute('src'), null);
});

it('document Picture-in-Picture moves the real controls into an OS window and restores them when it closes', async (t) => {
    const f = fixture(t);
    const pip = new JSDOM('<head></head><body></body>', { url: 'https://onebyone.test/' });
    let closed = 0; let requests = 0;
    const originalClose = pip.window.close.bind(pip.window);
    pip.window.close = () => { closed++; pip.window.dispatchEvent(new pip.window.Event('pagehide')); };
    f.window.documentPictureInPicture = { async requestWindow() { requests++; return pip.window; } };
    t.after(originalClose);
    await f.media.start(lesson); f.media.setConnected(true);
    assert.equal(requests, 1, 'joining automatically opens desktop floating');
    assert.ok(pip.window.document.querySelector('[data-lesson-media]'));
    assert.equal(f.document.querySelector('[data-lesson-media]'), null, 'there is one set of live controls');
    pip.window.dispatchEvent(new pip.window.Event('pagehide'));
    assert.ok(f.document.querySelector('[data-lesson-media]'));
    await f.media.openDesktop(); f.media.stop();
    assert.ok(closed > 0); assert.equal(f.root.hidden, true); assert.equal(f.audio.ready, false);
});

it('unsupported desktop floating gives a visible explanation rather than claiming a page overlay is always on top', async (t) => {
    const f = fixture(t);
    await f.media.start(lesson); f.media.setConnected(true);
    await f.media.openDesktop();
    const status = f.root.querySelector('[data-lesson-media-status]');
    assert.match(status.textContent, /不支持|Chrome|Edge|画中画/);
    assert.equal(f.root.ownerDocument, f.document);
});

it('turning off the camera releases its track while audio continues, and turning it on requires a fresh request', async (t) => {
    const f = fixture(t);
    await f.media.start(lesson); f.media.setConnected(true);
    const camera = f.root.querySelector('[data-lesson-camera]');
    camera.click();
    assert.ok(f.streams[0].track.stopped > 0); assert.equal(f.audio.ready, true);
    assert.equal(f.root.querySelector('[data-lesson-local-video]').srcObject, null);
    camera.click(); await tick();
    assert.equal(f.captures.length, 2); assert.equal(f.streams[1].track.stopped, 0);
    assert.equal(f.audioStarts, 1, 'camera toggles do not create another microphone');
});

it('leaving while the OS Picture-in-Picture request is pending closes the late window instead of moving controls into it', async (t) => {
    const f = fixture(t);
    const pip = new JSDOM('<head></head><body></body>', { url: 'https://onebyone.test/' });
    const originalClose = pip.window.close.bind(pip.window);
    let closed = 0; let resolveWindow;
    pip.window.close = () => { closed++; pip.window.dispatchEvent(new pip.window.Event('pagehide')); };
    f.window.documentPictureInPicture = { requestWindow() { return new Promise((resolve) => { resolveWindow = resolve; }); } };
    t.after(originalClose);
    await f.media.start(lesson); f.media.setConnected(true);
    f.media.stop(); resolveWindow(pip.window); await tick();
    assert.equal(closed, 1); assert.equal(pip.window.document.querySelector('[data-lesson-media]'), null);
    assert.equal(f.root.hidden, true); assert.equal(f.root.ownerDocument, f.document);
});

it('an undecoded or stopped video expires and cannot block the next live picture forever', async (t) => {
    const f = fixture(t, { manualClock: true });
    await f.media.start(lesson); f.media.setConnected(true);
    f.media.receive({ type: 'peer', online: true });
    const remote = f.root.querySelector('[data-lesson-remote-video]');
    f.media.receive({ type: 'video', lessonId: lesson._id, uid: lesson.studentUid, streamId: 'peer-a', seq: 1, data: jpeg });
    assert.equal(remote.getAttribute('src'), jpeg);
    // No load/error event arrives from the browser: the pending decode still expires.
    f.advance(2100);
    assert.equal(remote.getAttribute('src'), null); assert.equal(remote.hidden, true);
    f.media.receive({ type: 'video', lessonId: lesson._id, uid: lesson.studentUid, streamId: 'peer-a', seq: 2, data: jpeg });
    assert.equal(remote.getAttribute('src'), jpeg);
    remote.dispatchEvent(new f.window.Event('load'));
    assert.equal(remote.hidden, false);
});


it('reserves an empty desktop window in the join click and only adopts it after authenticated consent', async (t) => {
    const f = fixture(t);
    const pip = new JSDOM('<head></head><body></body>', { url: 'https://onebyone.test/' });
    let calls = 0; let closed = 0;
    const originalClose = pip.window.close.bind(pip.window);
    pip.window.close = () => { closed++; pip.window.dispatchEvent(new pip.window.Event('pagehide')); };
    f.window.documentPictureInPicture = { requestWindow(size) { calls++; assert.equal(size.width, 320); assert(size.height <= 600); return Promise.resolve(pip.window); } };
    t.after(originalClose);
    const reservation = f.media.prepareDesktop();
    assert.equal(calls, 1, 'the browser API runs synchronously, before a REST promise can consume user activation');
    await tick();
    assert.equal(f.captures.length, 0); assert.equal(f.audioStarts, 0);
    assert.equal(pip.window.document.querySelector('video'), null);
    assert.match(pip.window.document.body.textContent, /正在进入课堂/);
    await f.media.start(lesson, reservation); await tick();
    assert.equal(calls, 1, 'start reuses its already opened OS window');
    assert.equal(closed, 0, 'start cleanup must preserve the reserved desktop');
    assert.equal(f.root.ownerDocument, pip.window.document);
    assert.equal(f.root.querySelector('[data-lesson-desktop]').hidden, true, 'normal classes have no floating-mode choice');
    f.media.stop(); assert.equal(closed, 1); assert.equal(f.root.ownerDocument, f.document);
});

it('cancelling a failed join closes a late reserved window without opening devices', async (t) => {
    const f = fixture(t);
    const pip = new JSDOM('<head></head><body></body>', { url: 'https://onebyone.test/' });
    const originalClose = pip.window.close.bind(pip.window);
    let resolveWindow; let closed = 0;
    pip.window.close = () => { closed++; };
    f.window.documentPictureInPicture = { requestWindow() { return new Promise(resolve => { resolveWindow = resolve; }); } };
    t.after(originalClose);
    const reservation = f.media.prepareDesktop(); f.media.cancelDesktop(reservation); f.media.cancelDesktop(reservation);
    resolveWindow(pip.window); await tick();
    assert.equal(closed, 1); assert.equal(f.captures.length, 0); assert.equal(f.audioStarts, 0);
    assert.equal(f.root.hidden, true); assert.equal(pip.window.document.querySelector('[data-lesson-media]'), null);
});

it('a browser rejecting automatic floating keeps a visible retry without a return-to-page mode switch', async (t) => {
    const f = fixture(t);
    f.window.documentPictureInPicture = { requestWindow() { throw Object.assign(new Error('Browser activation required'), { name: 'NotAllowedError' }); } };
    const reservation = f.media.prepareDesktop();
    await f.media.start(lesson, reservation); await tick();
    const retry = f.root.querySelector('[data-lesson-desktop]');
    assert.equal(retry.hidden, false); assert.match(retry.textContent, /重新打开悬浮窗/);
    assert.match(f.root.textContent, /浏览器拦截/); assert.doesNotMatch(f.root.textContent, /返回页面/);
});

it('teacher stays above learner for either participant and capture targets 1280x720 at 30 fps', async (t) => {
    for (const uid of [lesson.teacherUid, lesson.studentUid]) {
        const f = fixture(t, { uid, manualClock: true });
        await f.media.start(lesson); f.media.setConnected(true);
        const tiles = f.root.querySelectorAll('.lesson-media__grid > [data-lesson-participant]');
        assert.deepEqual(Array.from(tiles, tile => tile.dataset.lessonParticipant), ['teacher', 'student']);
        assert.match(tiles[0].textContent, /唐老师 · 老师/); assert.match(tiles[1].textContent, /橙子 · 学员/);
        assert.equal(f.captures[0].video.width.ideal, 1280); assert.equal(f.captures[0].video.height.ideal, 720);
        assert.equal(f.captures[0].video.frameRate.ideal, 30);
        for (let frame = 0; frame < 30; frame++) f.advance(33);
        assert.equal(f.sent.filter(message => message.type === 'video').length, 30);
        assert(f.encodes.every(frame => frame.width === 1280 && frame.height === 720));
    }
});

it('complex camera frames reduce quality and dimensions to keep a bounded live byte rate', async (t) => {
    const frame = length => 'data:image/jpeg;base64,' + 'A'.repeat(length - 23);
    const f = fixture(t, { manualClock: true, encodeFrame(width, _height, quality) {
        return frame(width === 1280 ? 180000 : quality > .3 ? 110000 : 70000);
    } });
    await f.media.start(lesson); f.media.setConnected(true);
    for (let i = 0; i < 60; i++) f.advance(33);
    const frames = f.sent.filter(message => message.type === 'video');
    assert.equal(frames.length, 60, 'large source frames adapt instead of reducing a 30 fps stream to 4 fps');
    assert(f.encodes.some(encode => encode.width === 960));
    assert(f.encodes.some(encode => encode.quality < .3));
    assert(frames.reduce((sum, message) => sum + message.data.length + 256, 0) <= 3 * 1024 * 1024 * 1.98 + 210000);
    f.media.stop(); const sent = f.sent.length; f.advance(1000); assert.equal(f.sent.length, sent);
});


it('a hanging desktop request times out to a retry and closes a window that arrives afterwards', async (t) => {
    const f = fixture(t);
    const pip = new JSDOM('<head></head><body></body>', { url: 'https://onebyone.test/' });
    const originalClose = pip.window.close.bind(pip.window);
    const originalTimeout = f.window.setTimeout.bind(f.window);
    let expire; let resolveWindow; let closed = 0;
    f.window.setTimeout = (callback, delay) => { if (delay === 30000) expire = callback; return originalTimeout(callback, delay); };
    pip.window.close = () => { closed++; };
    f.window.documentPictureInPicture = { requestWindow() { return new Promise(resolve => { resolveWindow = resolve; }); } };
    t.after(originalClose);
    const reservation = f.media.prepareDesktop(); await f.media.start(lesson, reservation);
    assert.equal(f.root.querySelector('[data-lesson-desktop]').hidden, true);
    expire(); await tick();
    assert.equal(f.root.querySelector('[data-lesson-desktop]').hidden, false);
    assert.equal(f.audio.ready, true, 'a floating-window failure must not terminate permitted lesson devices');
    resolveWindow(pip.window); await tick();
    assert.equal(closed, 1); assert.equal(pip.window.document.querySelector('[data-lesson-media]'), null);
});
