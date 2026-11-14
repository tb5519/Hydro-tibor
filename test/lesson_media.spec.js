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
    if (options.storageDenied) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } });
    else for (const [key, value] of Object.entries(options.storage || {})) window.localStorage.setItem(key, value);
    const sent = []; const captures = []; const streams = []; const audioFrames = []; const encodes = [];
    const beautyInstances = []; const draws = [];
    let now = Date.now(); let intervalId = 0;
    const intervals = new Map();
    if (options.manualClock) {
        window.setInterval = (callback, delay) => { const id = ++intervalId; intervals.set(id, { callback, delay }); return id; };
        window.clearInterval = (id) => intervals.delete(id);
    }
    let audioStarts = 0; let audioStops = 0; let audioResets = 0; let audioResumes = 0;
    let left = 0; let delayedResolve; let resumeResolve;
    let audioOptions;
    const audio = {
        ready: false, transmitting: false, muted: false,
        async start() {
            if (this.ready) {
                audioResumes++;
                if (options.audioResumeDenied) throw new Error('浏览器暂停了语音，请点击“重试设备”恢复语音。');
                if (options.delayedAudioResume) await new Promise(resolve => { resumeResolve = resolve; });
                return;
            }
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
        fillRect() {}, clearRect() {}, drawImage(...args) { draws.push(args); }, fillText() {}, save() {}, restore() {},
        measureText: () => ({ width: 20 }),
    });
    window.HTMLCanvasElement.prototype.toDataURL = function(type, quality) { encodes.push({ width: this.width, height: this.height, quality }); return options.encodeFrame ? options.encodeFrame(this.width, this.height, quality) : jpeg; };
    const module = { exports: {} };
    const beautyModule = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(path.dirname(source), 'beauty.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module: beautyModule, exports: beautyModule.exports, Float32Array });
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
            if (name === './beauty') return beautyModule.exports;
            throw new Error(`Unexpected import: ${name}`);
        },
    });
    const media = module.exports.mountLessonMedia({ uid: options.uid || lesson.teacherUid }, {
        send(message) { if (options.sendBlocked) return false; sent.push(message); return true; }, onLeave() { left++; },
        audioFactory(value) { audioOptions = value; return audio; },
        beautyFactory(canvas, onStatus) {
            const instance = { canvas, calls: [], disposed: 0, notify: onStatus,
                process(source, settings) {
                    this.calls.push({ source, settings: { ...settings } });
                    onStatus(options.beautyFailure || '');
                    return options.filteredBeauty && !options.beautyFailure ? canvas : source;
                },
                dispose() { this.disposed++; },
            };
            beautyInstances.push(instance); return instance;
        },
    });
    const root = window.document.querySelector('[data-lesson-media]');
    t.after(() => { media.dispose(); window.close(); });
    return { window, document: window.document, media, sent, captures, streams, audio, audioFrames, encodes, beautyInstances, draws,
        resolveCamera: () => delayedResolve?.(), sendAudio: (data) => audioOptions.onFrame(data),
        resolveAudioResume: () => resumeResolve?.(),
        advance(milliseconds) { now += milliseconds; for (const interval of intervals.values()) interval.callback(); },
        get root() { return root; },
        get audioStarts() { return audioStarts; }, get audioStops() { return audioStops; },
        get audioResumes() { return audioResumes; },
        get audioResets() { return audioResets; }, get left() { return left; } };
}

it('opening a classroom does not capture before an explicit join, then captures only video through the camera API', async (t) => {
    const f = fixture(t);
    assert.equal(f.captures.length, 0); assert.equal(f.audioStarts, 0);
    await f.media.start(lesson);
    assert.equal(f.captures.length, 1); assert.equal(f.captures[0].audio, false);
    assert.ok(f.captures[0].video); assert.equal(f.audioStarts, 1);
    assert.equal(f.audio.transmitting, false, 'captured audio waits for an authenticated socket');
    f.media.setConnected(true); await tick();
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

it('a temporary disconnect pauses transport while retaining permitted devices and resumes the same tracks', async (t) => {
    const f = fixture(t, { manualClock: true });
    await f.media.start(lesson); f.media.setConnected(true); await tick();
    const local = f.root.querySelector('[data-lesson-local-video]');
    const originalStream = local.srcObject; const stops = f.audioStops;
    f.media.receive({ type: 'video', lessonId: lesson._id, uid: lesson.studentUid, streamId: 'peer-a', seq: 1, data: jpeg });
    f.media.setConnected(false);
    assert.equal(f.streams[0].track.stopped, 0); assert.equal(f.audio.ready, true);
    assert.equal(f.audio.transmitting, false); assert.equal(f.audioStops, stops);
    assert.equal(local.srcObject, originalStream);
    const remote = f.root.querySelector('[data-lesson-remote-video]');
    assert.equal(remote.getAttribute('src'), null);
    const paused = f.sent.length; f.advance(1000); f.sendAudio('while-offline');
    assert.equal(f.sent.length, paused, 'camera and late audio callbacks never send while transport is offline');
    const captures = f.captures.length; const starts = f.audioStarts;
    f.media.setConnected(true); await tick();
    assert.equal(f.captures.length, captures); assert.equal(f.audioStarts, starts);
    assert.equal(f.audioResumes, 2, 'initial ready and reconnect resume the permitted audio context without reacquiring a microphone');
    assert.equal(f.audio.transmitting, true); assert.equal(local.srcObject, originalStream);
    f.advance(33); f.sendAudio('resumed-voice');
    assert(f.sent.some(message => message.type === 'video'));
    assert.equal(f.sent.at(-1).type, 'audio');
    f.media.stop(); assert.ok(f.streams[0].track.stopped > 0); assert.equal(f.audio.ready, false);
});

it('a late audio-context resume cannot restart transmission after the lesson has been left', async (t) => {
    const f = fixture(t, { delayedAudioResume: true, manualClock: true });
    await f.media.start(lesson); f.media.setConnected(true);
    assert.equal(f.audioResumes, 1);
    f.media.setConnected(false); f.media.stop(); f.resolveAudioResume(); await tick();
    assert.equal(f.audio.ready, false); assert.equal(f.audio.transmitting, false);
    assert.equal(f.audioStarts, 1); assert.equal(f.root.hidden, true);
    f.advance(1000); f.sendAudio('late-audio-resume'); assert.equal(f.sent.length, 0);
});

it('a blocked audio-context resume leaves the class active and an explicit retry reuses its microphone', async (t) => {
    const options = { audioResumeDenied: true };
    const f = fixture(t, options);
    await f.media.start(lesson); f.media.setConnected(true); await tick();
    assert.equal(f.root.hidden, false); assert.equal(f.audio.ready, true);
    assert.equal(f.audio.transmitting, false);
    assert.equal(f.root.querySelector('[data-lesson-device-retry]').hidden, false);
    assert.match(f.root.textContent, /重试设备/);
    options.audioResumeDenied = false;
    f.root.querySelector('[data-lesson-device-retry]').click(); await tick();
    assert.equal(f.audioStarts, 1); assert.equal(f.audioResumes, 2);
    assert.equal(f.captures.length, 1); assert.equal(f.audio.transmitting, true);
    assert.equal(f.root.querySelector('[data-lesson-device-retry]').hidden, true);
});

it('repeated disconnects keep the existing desktop window and do not ask for devices again', async (t) => {
    const f = fixture(t);
    const pip = new JSDOM('<head></head><body></body>', { url: 'https://onebyone.test/' });
    const originalClose = pip.window.close.bind(pip.window);
    let requests = 0; let closed = 0;
    pip.window.close = () => { closed++; pip.window.dispatchEvent(new pip.window.Event('pagehide')); };
    f.window.documentPictureInPicture = { async requestWindow() { requests++; return pip.window; } };
    t.after(originalClose);
    await f.media.start(lesson); f.media.setConnected(true); await tick();
    const originalStream = f.root.querySelector('[data-lesson-local-video]').srcObject;
    for (let attempt = 0; attempt < 3; attempt++) {
        f.media.setConnected(false);
        assert.equal(f.root.ownerDocument, pip.window.document); assert.equal(closed, 0);
        assert.equal(f.streams[0].track.stopped, 0); assert.equal(f.audio.ready, true);
        f.media.setConnected(true);
        assert.equal(f.root.querySelector('[data-lesson-local-video]').srcObject, originalStream);
    }
    assert.equal(requests, 1); assert.equal(f.captures.length, 1); assert.equal(f.audioStarts, 1);
    f.media.stop(); assert.equal(closed, 1); assert.equal(f.root.ownerDocument, f.document);
});

it('camera-off and microphone mute choices survive reconnect, including a mute chosen while offline', async (t) => {
    const f = fixture(t);
    await f.media.start(lesson); f.media.setConnected(true);
    f.root.querySelector('[data-lesson-camera]').click();
    f.media.setConnected(false);
    f.root.querySelector('[data-lesson-microphone]').click();
    assert.equal(f.audio.muted, true);
    f.media.setConnected(true); await tick();
    assert.equal(f.captures.length, 1); assert.equal(f.audioStarts, 1);
    assert.equal(f.root.querySelector('[data-lesson-local-video]').srcObject, null);
    assert.equal(f.audio.muted, true);
    assert.equal(f.root.querySelector('[data-lesson-microphone]').getAttribute('aria-pressed'), 'false');
});

it('a full page recovery preserves only this account and lesson camera-off and mute choices', async (t) => {
    const f = fixture(t);
    await f.media.start(lesson); f.media.setConnected(true);
    f.root.querySelector('[data-lesson-camera]').click();
    f.root.querySelector('[data-lesson-microphone]').click();
    const key = `onebyone.lesson.devices.v1:${lesson.teacherUid}:${lesson._id}`;
    const saved = f.window.localStorage.getItem(key);
    assert.deepEqual(JSON.parse(saved), { cameraWanted: false, muted: true });
    f.media.dispose();
    const recovered = fixture(t, { storage: { [key]: saved } });
    await recovered.media.start(lesson); recovered.media.setConnected(true);
    assert.equal(recovered.captures.length, 0, 'an explicitly disabled camera stays off after authenticated recovery');
    assert.equal(recovered.audio.muted, true); assert.equal(recovered.audioStarts, 1);
    assert.equal(recovered.root.querySelector('[data-lesson-microphone]').getAttribute('aria-pressed'), 'false');
    const anotherAccount = fixture(t, { uid: lesson.studentUid, storage: { [key]: saved } });
    await anotherAccount.media.start(lesson);
    assert.equal(anotherAccount.captures.length, 1); assert.equal(anotherAccount.audio.muted, false);
    const anotherLesson = fixture(t, { storage: { [key]: saved } });
    await anotherLesson.media.start({ ...lesson, _id: 'new-lesson-456' });
    assert.equal(anotherLesson.captures.length, 1); assert.equal(anotherLesson.audio.muted, false);
});

it('denied permissions are not saved as camera choices and unavailable preference storage does not block devices', async (t) => {
    const denied = fixture(t, { cameraDenied: true, microphoneDenied: true });
    await denied.media.start(lesson);
    assert.equal(denied.window.localStorage.length, 0, 'permission state is not stored as a user device toggle');
    const f = fixture(t, { storageDenied: true });
    await f.media.start(lesson); f.media.setConnected(true);
    f.root.querySelector('[data-lesson-camera]').click(); f.root.querySelector('[data-lesson-microphone]').click();
    f.media.setConnected(false); f.media.setConnected(true);
    assert.equal(f.captures.length, 1); assert.equal(f.audio.muted, true);
    assert.equal(f.root.querySelector('[data-lesson-local-video]').srcObject, null);
});

it('reconnect never retries denied camera or microphone permission without an explicit device retry', async (t) => {
    const f = fixture(t, { cameraDenied: true, microphoneDenied: true });
    await f.media.start(lesson); f.media.setConnected(true);
    f.media.setConnected(false); f.media.setConnected(true); await tick();
    assert.equal(f.captures.length, 1); assert.equal(f.audioStarts, 1);
    assert.equal(f.audio.ready, false); assert.equal(f.audio.transmitting, false);
    assert.equal(f.root.querySelector('[data-lesson-device-retry]').hidden, false);
});

it('a pending camera grant can finish during an outage but is released if the class is explicitly left', async (t) => {
    const f = fixture(t, { delayedCamera: true, manualClock: true });
    const pending = f.media.start(lesson); await tick();
    f.media.setConnected(false); f.resolveCamera(); await pending;
    assert.equal(f.streams[0].track.stopped, 0);
    assert.equal(f.audio.ready, true); assert.equal(f.audio.transmitting, false);
    f.advance(1000); assert.equal(f.sent.length, 0);
    f.media.stop(); f.media.setConnected(true); f.advance(1000); f.sendAudio('late-frame');
    assert.ok(f.streams[0].track.stopped > 0); assert.equal(f.audio.ready, false);
    assert.equal(f.sent.length, 0); assert.equal(f.root.hidden, true);
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
    assert.equal(f.beautyInstances[0].calls.length, 60, 'JPEG quality/size retries reuse one processed camera frame');
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

it('teacher beauty uses one processed frame for preview and outgoing video and survives a transport outage', async (t) => {
    const f = fixture(t, { filteredBeauty: true, manualClock: true });
    await f.media.start(lesson); f.media.setConnected(true); await tick();
    const group = f.root.querySelector('[aria-label="老师摄像头美颜"]');
    assert.equal(group.hidden, false);
    assert.equal(f.root.querySelector('[data-lesson-beauty="whitening"]').value, '20');
    assert.equal(f.root.querySelector('[data-lesson-beauty="smoothing"]').value, '25');
    f.advance(33);
    const processor = f.beautyInstances[0]; const preview = f.root.querySelector('[data-lesson-local-preview]');
    assert.equal(processor.calls.length, 1); assert.equal(preview, processor.canvas);
    assert.equal(preview.hidden, false); assert.equal(f.root.querySelector('[data-lesson-local-video]').hidden, true);
    assert.equal(f.draws.at(-1)[0], preview, 'JPEG receives the processed pixels shown in the preview');
    assert.equal(f.sent.at(-1).type, 'video');
    f.media.setConnected(false); const sent = f.sent.length; f.advance(33);
    assert.equal(f.sent.length, sent); assert.equal(processor.calls.length, 2, 'local beauty preview continues during reconnect');
    assert.equal(processor.disposed, 0); assert.equal(f.streams[0].track.stopped, 0);
    f.media.setConnected(true); await tick(); f.advance(33);
    assert.equal(f.beautyInstances.length, 1); assert.equal(f.captures.length, 1);
    f.media.stop(); const processed = processor.calls.length; f.advance(1000);
    assert.equal(processor.disposed, 1); assert.equal(processor.calls.length, processed);
});

it('student cameras have no beauty controls or processing and cannot save teacher parameters', async (t) => {
    const f = fixture(t, { uid: lesson.studentUid, filteredBeauty: true, manualClock: true });
    await f.media.start(lesson); f.media.setConnected(true); f.advance(33);
    assert.equal(f.root.querySelector('[aria-label="老师摄像头美颜"]').hidden, true);
    assert.equal(f.beautyInstances.length, 0);
    assert.equal(f.draws.at(-1)[0], f.root.querySelector('[data-lesson-local-video]'));
    const input = f.root.querySelector('[data-lesson-beauty="whitening"]');
    input.value = '90'; input.dispatchEvent(new f.window.Event('input'));
    assert.equal(f.window.localStorage.getItem(`onebyone.lesson.beauty.v1:${lesson.studentUid}`), null);
});

it('teacher beauty sliders persist by account and zeroing both restores unprocessed preview and video', async (t) => {
    const f = fixture(t, { filteredBeauty: true, manualClock: true });
    await f.media.start(lesson); f.media.setConnected(true);
    const change = (key, value) => {
        const input = f.root.querySelector(`[data-lesson-beauty="${key}"]`);
        input.value = String(value); input.dispatchEvent(new f.window.Event('input'));
    };
    change('whitening', 60); change('smoothing', 45); f.advance(33);
    const processor = f.beautyInstances[0];
    assert.deepEqual(processor.calls.at(-1).settings, { whitening: 60, smoothing: 45 });
    const key = `onebyone.lesson.beauty.v1:${lesson.teacherUid}`;
    const saved = f.window.localStorage.getItem(key);
    assert.deepEqual(JSON.parse(saved), { whitening: 60, smoothing: 45 });
    const recovered = fixture(t, { storage: { [key]: saved } }); await recovered.media.start(lesson);
    assert.equal(recovered.root.querySelector('[data-lesson-beauty="whitening"]').value, '60');
    assert.equal(recovered.root.querySelector('[data-lesson-beauty="smoothing"]').value, '45');
    const other = fixture(t, { uid: 3, storage: { [key]: saved } });
    await other.media.start({ ...lesson, teacherUid: 3 });
    assert.equal(other.root.querySelector('[data-lesson-beauty="whitening"]').value, '20');
    change('whitening', 0); change('smoothing', 0); f.advance(33);
    assert.equal(processor.disposed, 1); assert.equal(f.beautyInstances.length, 1);
    assert.equal(f.root.querySelector('[data-lesson-local-preview]').hidden, true);
    assert.equal(f.root.querySelector('[data-lesson-local-video]').hidden, false);
    assert.equal(f.draws.at(-1)[0], f.root.querySelector('[data-lesson-local-video]'));
});

it('beauty GPU failure falls back to raw video without restarting devices or ending the classroom', async (t) => {
    const options = { filteredBeauty: true, manualClock: true, beautyFailure: '美颜暂不可用，当前使用原画。' };
    const f = fixture(t, options);
    await f.media.start(lesson); f.media.setConnected(true); await tick(); f.advance(33);
    assert.equal(f.root.hidden, false); assert.equal(f.audio.ready, true);
    assert.match(f.root.textContent, /美颜暂不可用/);
    assert.equal(f.root.querySelector('[data-lesson-local-preview]').hidden, true);
    assert.equal(f.draws.at(-1)[0], f.root.querySelector('[data-lesson-local-video]'));
    assert.equal(f.sent.at(-1).type, 'video'); assert.equal(f.streams[0].track.stopped, 0);
    options.beautyFailure = ''; f.advance(33);
    assert.equal(f.root.querySelector('[data-lesson-local-preview]').hidden, false);
    assert.equal(f.captures.length, 1); assert.equal(f.audioStarts, 1); assert.equal(f.beautyInstances.length, 1);
});

it('ending a class releases its beauty processor and a new class restores teacher settings with fresh resources', async (t) => {
    const f = fixture(t, { filteredBeauty: true, manualClock: true });
    await f.media.start(lesson); f.media.setConnected(true);
    const input = f.root.querySelector('[data-lesson-beauty="smoothing"]');
    input.value = '48'; input.dispatchEvent(new f.window.Event('input')); f.advance(33);
    const previous = f.beautyInstances[0];
    f.media.stop(); assert.equal(previous.disposed, 1);
    await f.media.start({ ...lesson, _id: 'next-class-456' }); f.media.setConnected(true); f.advance(33);
    assert.equal(f.beautyInstances.length, 2);
    assert.equal(f.beautyInstances[1].canvas, previous.canvas, 'the panel can safely reuse its preview element');
    assert.equal(f.beautyInstances[1].calls.at(-1).settings.smoothing, 48);
    previous.notify('Late error from previous classroom');
    assert.doesNotMatch(f.root.textContent, /Late error/);
    assert.equal(f.root.querySelector('[data-lesson-local-preview]').hidden, false);
    assert.equal(f.streams[0].track.stopped > 0, true); assert.equal(f.streams[1].track.stopped, 0);
});

it('video picture-in-picture composes the same processed teacher preview that is sent to the learner', async (t) => {
    const f = fixture(t, { filteredBeauty: true, manualClock: true });
    f.window.HTMLCanvasElement.prototype.captureStream = () => ({ getTracks: () => [{ stop() {} }] });
    f.window.HTMLVideoElement.prototype.requestPictureInPicture = async () => {};
    await f.media.start(lesson); f.media.setConnected(true); await tick(); f.advance(33);
    const preview = f.root.querySelector('[data-lesson-local-preview]');
    assert(f.draws.some(args => args[0] === preview && args[3] === 1280 && args[4] === 720), 'outgoing JPEG uses the filtered source');
    assert(f.draws.some(args => args[0] === preview && args[3] === 320 && args[4] === 180), 'the desktop composite uses that same filtered source');
});
