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
    if (options.mac) Object.defineProperties(window.navigator, {
        platform: { value: 'MacIntel' }, userAgent: { value: options.mac },
    });
    if (options.storageDenied) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } });
    else for (const [key, value] of Object.entries(options.storage || {})) window.localStorage.setItem(key, value);
    const sent = []; const captures = []; const streams = []; const audioFrames = []; const encodes = [];
    const screenCaptures = []; const screenStreams = []; let delayedScreenResolve;
    const beautyInstances = []; const draws = [];
    let now = Date.now(); let intervalId = 0;
    const intervals = new Map();
    if (options.manualClock) {
        window.setInterval = (callback, delay) => { const id = ++intervalId; intervals.set(id, { callback, delay }); return id; };
        window.clearInterval = (id) => intervals.delete(id);
    }
    let audioStarts = 0; let audioStops = 0; let audioResets = 0; let audioResumes = 0;
    let left = 0; let delayedResolve; let resumeResolve; const leaveConfirmations = [];
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
        releaseInput() { this.ready = false; this.transmitting = false; },
        setMuted(value) { this.muted = value; },
        setTransmitting(value) { this.transmitting = value; },
        resetReceive() { audioResets++; },
        receive(...args) { audioFrames.push(args); },
    };
    function makeStream(screen = false) {
        const listeners = new Map();
        const track = {
            stopped: 0, enabled: true, readyState: 'live',
            stop() { this.stopped++; this.readyState = 'ended'; },
            addEventListener(name, listener) { listeners.set(name, listener); },
            removeEventListener(name) { listeners.delete(name); },
            getSettings() { return { width: screen ? 1920 : 320, height: screen ? 1080 : 240,
                ...(screen ? { displaySurface: options.screenSurface || 'monitor' } : {}) }; },
            end() { this.readyState = 'ended'; listeners.get('ended')?.(); },
        };
        const stream = { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [], track, screen };
        (screen ? screenStreams : streams).push(stream); return stream;
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
        getDisplayMedia(constraints) {
            screenCaptures.push(constraints);
            if (options.screenDenied) return Promise.reject(Object.assign(new Error('Screen denied'), { name: 'NotAllowedError' }));
            const stream = makeStream(true);
            if (options.delayedScreen) return new Promise(resolve => { delayedScreenResolve = () => resolve(stream); });
            return Promise.resolve(stream);
        },
    } });
    window.HTMLMediaElement.prototype.play = async () => {};
    window.HTMLMediaElement.prototype.pause = () => {};
    Object.defineProperties(window.HTMLMediaElement.prototype, { readyState: { get: () => 4 }, paused: { get: () => false } });
    Object.defineProperties(window.HTMLVideoElement.prototype, {
        videoWidth: { get() { return this.srcObject?.screen ? 1920 : 320; } },
        videoHeight: { get() { return this.srcObject?.screen ? 1080 : 240; } },
    });
    window.HTMLCanvasElement.prototype.getContext = () => ({
        fillRect() {}, clearRect() {}, drawImage(...args) { draws.push(args); }, fillText() {}, save() {}, restore() {},
        measureText: () => ({ width: 20 }),
    });
    window.HTMLCanvasElement.prototype.toDataURL = function(type, quality) { encodes.push({ width: this.width, height: this.height, quality }); return options.encodeFrame ? options.encodeFrame(this.width, this.height, quality) : jpeg; };
    const module = { exports: {} };
    const beautyModule = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(path.dirname(source), 'beauty.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module: beautyModule, exports: beautyModule.exports, Float32Array });
    const guideModule = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(path.dirname(source), '../voice_call/permission_guide.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module: guideModule, exports: guideModule.exports });
    const code = transformSync(fs.readFileSync(source, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
    const fixtureDate = options.manualClock ? class ClockDate extends Date { static now() { return now; } } : Date;
    const recoveryModule = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(path.dirname(source), 'device_recovery.ts'), 'utf8'),
        { loader: 'ts', format: 'cjs' }).code, { module: recoveryModule, exports: recoveryModule.exports, window, navigator: window.navigator, Date: fixtureDate });
    const flowModule = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(path.dirname(source), 'camera_flow.ts'), 'utf8'),
        { loader: 'ts', format: 'cjs' }).code, { module: flowModule, exports: flowModule.exports, performance: window.performance, Date: fixtureDate });
    const screenModule = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(path.dirname(source), 'screen.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module: screenModule, exports: screenModule.exports, window, document: window.document, navigator: window.navigator,
            require: () => flowModule.exports, Date: fixtureDate, console, setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window) });
    vm.runInNewContext(code, {
        module, exports: module.exports, window, document: window.document, navigator: window.navigator,
        HTMLElement: window.HTMLElement, HTMLVideoElement: window.HTMLVideoElement, Image: window.Image,
        sessionStorage: window.sessionStorage, performance: window.performance,
        requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
        setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
        setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window),
        Date: fixtureDate,
        require(name) {
            if (name === '../voice_call/permission_guide') return guideModule.exports;
            if (name.includes('voice_call/audio')) return { VoiceAudio: function FakeAudio() {}, microphoneError: (error) => error.message };
            if (name === './beauty') return beautyModule.exports;
            if (name === './camera_flow') return flowModule.exports;
            if (name === './device_recovery') return recoveryModule.exports;
            if (name === './screen') return screenModule.exports;
            throw new Error(`Unexpected import: ${name}`);
        },
    });
    const media = module.exports.mountLessonMedia({ uid: options.uid || lesson.teacherUid }, {
        send(message) { if (options.sendBlocked) return false; sent.push(message); return true; }, onLeave(confirmation) { left++; leaveConfirmations.push(confirmation); },
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
    return { window, document: window.document, media, sent, captures, streams, audio, audioFrames, encodes, beautyInstances, draws, leaveConfirmations,
        screenCaptures, screenStreams, resolveScreen: () => delayedScreenResolve?.(),
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

it('an accepted independent voice call pauses both classroom audio directions without ending video or losing mute', async t => {
    const f = fixture(t, { manualClock: true });
    await f.media.start(lesson); f.media.setConnected(true); await tick();
    const mic = f.root.querySelector('[data-lesson-microphone]');
    mic.click(); assert.equal(f.audio.muted, true);
    f.window.__onebyoneVoiceAudioUid = lesson.teacherUid;
    f.window.dispatchEvent(new f.window.Event('onebyone:voice-audio-change'));
    assert.equal(f.audio.transmitting, false);
    assert.match(f.root.textContent, /独立语音通话/);
    const audio = { type: 'audio', lessonId: lesson._id, uid: lesson.studentUid, streamId: 'voice-peer', seq: 1, data: 'speech' };
    const sent = f.sent.length;
    f.sendAudio('private-conversation'); f.media.receive(audio);
    assert.equal(f.audioFrames.length, 0);
    assert.equal(f.sent.length, sent);
    f.advance(200); assert(f.sent.some(frame => frame.type === 'video'));
    assert.equal(f.streams[0].track.stopped, 0);
    f.media.setConnected(false); f.media.setConnected(true); await tick();
    assert.equal(f.audio.transmitting, false, 'automatic reconnect cannot mix active conversations');
    delete f.window.__onebyoneVoiceAudioUid;
    f.window.dispatchEvent(new f.window.Event('onebyone:voice-audio-change'));
    f.media.receive({ ...audio, seq: 2 }); assert.equal(f.audioFrames.length, 1);
    assert.equal(f.audio.muted, true); assert.equal(f.audioStarts, 1);
});

it('hanging up a separate call opens classroom playback even when its microphone was denied', async t => {
    const f = fixture(t, { microphoneDenied: true });
    let listens = 0;
    f.audio.listen = async () => { listens++; };
    f.window.__onebyoneVoiceAudioUid = lesson.teacherUid;
    f.window.dispatchEvent(new f.window.Event('onebyone:voice-audio-change'));
    await f.media.start(lesson); f.media.setConnected(true); await tick();
    assert.equal(listens, 0);
    f.media.setConnected(false);
    delete f.window.__onebyoneVoiceAudioUid;
    f.window.dispatchEvent(new f.window.Event('onebyone:voice-audio-change'));
    f.media.setConnected(true);
    await tick();
    assert.equal(listens, 1); assert.equal(f.audio.transmitting, false); assert.equal(f.audioStarts, 1);
});

it('camera permission rejection leaves the classroom usable and keeps an independently permitted microphone', async (t) => {
    const f = fixture(t, { cameraDenied: true });
    await f.media.start(lesson); f.media.setConnected(true);
    assert.equal(f.audio.ready, true); assert.equal(f.root.hidden, false);
    assert.match(f.root.textContent, /摄像头|权限/);
    assert.ok(f.root.querySelector('[data-lesson-device-retry]'));
    f.root.querySelector('[data-lesson-media-leave]').click();
    assert.equal(f.left, 0); f.root.querySelector('[data-lesson-exit-confirm]').click();
    assert.equal(f.left, 1, 'a denied camera cannot trap the learner in the room');
});

it('a working camera recovers at most twice from repeated OS track loss and explicitly retrying resets that budget', async t => {
    const f = fixture(t, { manualClock: true });
    Object.defineProperty(f.window.navigator, 'permissions', { value: { query: async () => ({ state: 'granted' }) } });
    await f.media.start(lesson); f.media.setConnected(true);
    for (let i = 0; i < 2; i++) {
        f.streams.at(-1).track.end(); await tick();
        assert.equal(f.streams.length, i + 2);
    }
    f.streams.at(-1).track.end(); await tick(); f.advance(60000);
    f.window.dispatchEvent(new f.window.Event('pageshow')); await tick();
    assert.equal(f.streams.length, 3, 'waking after a minute cannot buy more attempts for a persistently lost camera');
    assert.match(f.root.querySelector('[data-lesson-media-status]').textContent, /点摄像头按钮/);
    f.root.querySelector('[data-lesson-camera]').click(); await tick(); assert.equal(f.streams.length, 4);
    f.root.querySelector('[data-lesson-camera]').click();
    f.window.dispatchEvent(new f.window.Event('focus')); await tick();
    assert.equal(f.streams.length, 4, 'an intentional camera-off choice survives wake');
});

it('a revoked or absent camera never prompts on wake; permission changes or user retries use the current room only', async t => {
    const f = fixture(t);
    let permission = 'granted'; let devices = [];
    Object.defineProperty(f.window.navigator, 'permissions', { value: { query: async () => ({ state: permission }) } });
    f.window.navigator.mediaDevices.enumerateDevices = async () => devices;
    await f.media.start(lesson); f.media.setConnected(true);
    f.streams[0].track.end(); await tick();
    assert.equal(f.streams.length, 1, 'no camera input is available yet');
    devices = [{ kind: 'videoinput' }];
    f.window.dispatchEvent(new f.window.Event('focus')); await tick();
    assert.equal(f.streams.length, 2);
    permission = 'denied';
    f.streams[1].track.end(); await tick();
    const help = f.root.querySelector('[data-lesson-device-permission=camera]');
    assert.equal(help.dataset.state, 'blocked'); assert.equal(help.hidden, false);
    f.media.setConnected(false); f.media.setConnected(true);
    assert.equal(f.streams.length, 2);
    f.media.stop(); f.window.dispatchEvent(new f.window.Event('pageshow')); await tick();
    assert.equal(f.streams.length, 2); assert.equal(help.hidden, true);
});

it('a delayed OS permission check from a lost camera cannot reopen input in a later lesson', async t => {
    const f = fixture(t);
    let pending; let delayed = false;
    Object.defineProperty(f.window.navigator, 'permissions', { value: { query: () => delayed
        ? new Promise(resolve => { pending = resolve; }) : Promise.resolve({ state: 'granted' }) } });
    await f.media.start(lesson); f.media.setConnected(true);
    delayed = true; f.streams[0].track.end();
    assert.equal(typeof pending, 'function');
    f.media.stop(); delayed = false;
    await f.media.start({ ...lesson, _id: 'new-room' }); f.media.setConnected(true);
    pending({ state: 'granted' }); await tick();
    assert.equal(f.streams.length, 2);
    assert.equal(f.streams[0].track.readyState, 'ended'); assert.equal(f.streams[1].track.readyState, 'live');
});

it('leave requests preserve both participants devices and desktop until the controller confirms exit', async (t) => {
    for (const uid of [lesson.teacherUid, lesson.studentUid]) {
        const f = fixture(t, { uid, manualClock: true });
        const pip = new JSDOM('<head></head><body></body>', { url: 'https://onebyone.test/' });
        const originalClose = pip.window.close.bind(pip.window);
        let closed = 0;
        pip.window.close = () => { closed++; pip.window.dispatchEvent(new pip.window.Event('pagehide')); };
        f.window.documentPictureInPicture = { async requestWindow() { return pip.window; } };
        t.after(originalClose);
        f.window.confirm = pip.window.confirm = () => { throw new Error('Document PiP must not call a native modal'); };
        await f.media.start(lesson); f.media.setConnected(true); await tick();
        const track = f.streams[0].track;
        const stops = f.audioStops;
        f.root.querySelector('[data-lesson-media-leave]').click();
        assert.equal(f.left, 0, 'showing the in-window dialog never requests exit');
        assert.equal(f.root.querySelector('[data-lesson-exit-dialog]').hidden, false);
        assert.equal(pip.window.document.activeElement, f.root.querySelector('[data-lesson-exit-cancel]'));
        f.root.querySelector('[data-lesson-exit-cancel]').click();
        assert.equal(f.left, 0); assert.equal(f.root.querySelector('[data-lesson-exit-dialog]').hidden, true);
        assert.equal(track.readyState, 'live'); assert.equal(track.stopped, 0);
        assert.equal(f.audio.ready, true); assert.equal(f.audio.transmitting, true); assert.equal(f.audioStops, stops);
        assert.equal(closed, 0); assert.equal(f.root.ownerDocument, pip.window.document); assert.equal(f.root.hidden, false);
        const sent = f.sent.length; f.advance(34); f.sendAudio('after-cancelled-exit');
        assert(f.sent.length > sent, 'cancelling exit keeps transport running');
        f.root.querySelector('[data-lesson-media-leave]').click();
        f.root.querySelector('[data-lesson-exit-confirm]').click();
        f.root.querySelector('[data-lesson-exit-confirm]').click();
        assert.equal(f.left, 1, 'one confirmation gives the controller one exit request');
        assert.deepEqual(JSON.parse(JSON.stringify(f.leaveConfirmations)), [{ confirmed: true, lessonId: lesson._id }]);
        assert.equal(track.readyState, 'live', 'only the controller may stop accepted classroom media');
        f.media.stop();
        assert.equal(track.readyState, 'ended'); assert.equal(f.audio.ready, false);
        assert.equal(closed, 1); assert.equal(f.root.hidden, true);
    }
});

it('a cancelled or stale in-window exit confirmation cannot leave a later classroom', async (t) => {
    const f = fixture(t);
    await f.media.start(lesson); f.media.setConnected(true);
    f.root.querySelector('[data-lesson-media-leave]').click();
    f.root.querySelector('[data-lesson-exit-dialog]').dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(f.left, 0); assert.equal(f.root.querySelector('[data-lesson-exit-dialog]').hidden, true);
    f.root.querySelector('[data-lesson-media-leave]').click(); f.media.stop();
    await f.media.start({ ...lesson, _id: 'later-class' });
    f.root.querySelector('[data-lesson-exit-confirm]').click();
    assert.equal(f.left, 0); assert.equal(f.streams.at(-1).track.readyState, 'live');
    assert.equal(f.root.querySelector('[data-lesson-exit-dialog]').hidden, true);
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
    f.window.documentPictureInPicture = { requestWindow(size) {
        calls++; assert.equal(size.width, 220); assert.equal(size.height, 350); assert.equal(size.preferInitialWindowPlacement, true);
        return Promise.resolve(pip.window);
    } };
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

it('teacher stays above learner for either participant and capture targets 960x540 at 25 fps', async (t) => {
    for (const uid of [lesson.teacherUid, lesson.studentUid]) {
        const f = fixture(t, { uid, manualClock: true });
        await f.media.start(lesson); f.media.setConnected(true);
        const tiles = f.root.querySelectorAll('.lesson-media__grid > [data-lesson-participant]');
        assert.deepEqual(Array.from(tiles, tile => tile.dataset.lessonParticipant), ['teacher', 'student']);
        assert.match(tiles[0].textContent, /唐老师 · 老师/); assert.match(tiles[1].textContent, /橙子 · 学员/);
        assert.equal(f.captures[0].video.width.ideal, 960); assert.equal(f.captures[0].video.height.ideal, 540);
        assert.equal(f.captures[0].video.frameRate.ideal, 25); assert.equal(f.captures[0].video.frameRate.max, 25);
        for (let frame = 0; frame < 25; frame++) f.advance(40);
        assert.equal(f.sent.filter(message => message.type === 'video').length, 25);
        assert(f.encodes.every(frame => frame.width === 960 && frame.height === 540));
    }
});

it('camera and microphone icons live on the local picture and show clear off and muted states', async (t) => {
    const f = fixture(t, { uid: lesson.studentUid });
    await f.media.start(lesson); f.media.setConnected(true);
    const camera = f.root.querySelector('[data-lesson-camera]'); const microphone = f.root.querySelector('[data-lesson-microphone]');
    const localTile = f.root.querySelector('[data-lesson-local-video]').parentElement;
    assert.equal(camera.closest('.lesson-media__tile'), localTile); assert.equal(microphone.closest('.lesson-media__tile'), localTile);
    const remoteTile = f.root.querySelector('[data-lesson-remote-video]').parentElement;
    assert.equal(remoteTile.querySelector('[data-lesson-camera], [data-lesson-microphone]'), null);
    assert.equal(remoteTile.querySelector('[data-lesson-screen-toggle]').hidden, true, 'only a teacher can request the learner desktop');
    assert.equal(camera.dataset.state, 'on'); assert.equal(microphone.dataset.state, 'on');
    assert.ok(camera.querySelector('svg')); assert.ok(microphone.querySelector('svg'));
    camera.click(); microphone.click();
    assert.equal(camera.dataset.state, 'off'); assert.equal(microphone.dataset.state, 'off');
    assert.match(camera.getAttribute('aria-label'), /已关闭/); assert.match(microphone.getAttribute('aria-label'), /已静音/);
    assert.equal(camera.getAttribute('aria-pressed'), 'false'); assert.equal(microphone.getAttribute('aria-pressed'), 'false');
    assert.equal(f.audio.muted, true); assert.equal(f.streams[0].track.readyState, 'ended');
    assert.equal(f.root.querySelector('.lesson-media__controls [data-lesson-camera]'), null);
});

it('complex camera frames reduce quality and dimensions to keep a bounded live byte rate', async (t) => {
    const frame = length => 'data:image/jpeg;base64,' + 'A'.repeat(length - 23);
    const f = fixture(t, { manualClock: true, encodeFrame(width, _height, quality) {
        return frame(width === 960 ? 180000 : quality > .3 ? 110000 : 70000);
    } });
    await f.media.start(lesson); f.media.setConnected(true);
    for (let i = 0; i < 60; i++) f.advance(40);
    const frames = f.sent.filter(message => message.type === 'video');
    assert.equal(frames.length, 60, 'large source frames adapt instead of reducing a 25 fps stream to 4 fps');
    assert.equal(f.beautyInstances[0].calls.length, 60, 'JPEG quality/size retries reuse one processed camera frame');
    assert(f.encodes.some(encode => encode.width === 640));
    assert(f.encodes.some(encode => encode.quality < .3));
    assert(frames.reduce((sum, message) => sum + message.data.length + 256, 0) <= 3 * 1024 * 1024 * 2.4 + 252000);
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
    const toggle = f.root.querySelector('[data-lesson-beauty-toggle]');
    assert.equal(group.hidden, true, 'beauty sliders start collapsed below the teacher camera');
    assert.equal(toggle.closest('[data-lesson-participant]').dataset.lessonParticipant, 'teacher');
    toggle.click();
    assert.equal(group.hidden, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(group.previousElementSibling.dataset.lessonParticipant, 'teacher');
    assert.equal(group.nextElementSibling.dataset.lessonParticipant, 'student');
    assert.equal(group.closest('.lesson-media__tile'), null, 'sliders cannot cover any part of either video');
    assert.equal(f.root.querySelector('.lesson-media__controls').parentElement, f.root);
    assert.equal(f.root.querySelector('.lesson-media__content').contains(f.root.querySelector('.lesson-media__controls')), false);
    assert.equal(f.root.querySelector('[data-lesson-beauty="whitening"]').value, '20');
    assert.equal(f.root.querySelector('[data-lesson-beauty="smoothing"]').value, '25');
    assert.equal(f.root.querySelector('[data-lesson-beauty="eyeBrightening"]').value, '20');
    group.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(group.hidden, true); assert.equal(toggle.getAttribute('aria-expanded'), 'false');
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

it('beauty expansion grows the desktop window from a user click and collapsing restores its previous height', async (t) => {
    const f = fixture(t);
    const pip = new JSDOM('<head></head><body></body>', { url: 'https://onebyone.test/' });
    let height = 420; const resizes = [];
    Object.defineProperties(pip.window, { outerHeight: { get: () => height }, outerWidth: { get: () => 260 } });
    pip.window.resizeBy = (width, delta) => { resizes.push(['by', width, delta]); height += delta; };
    pip.window.resizeTo = (width, nextHeight) => { resizes.push(['to', width, nextHeight]); height = nextHeight; };
    f.window.documentPictureInPicture = { async requestWindow() { return pip.window; } };
    t.after(() => pip.window.close());
    await f.media.start(lesson); f.media.setConnected(true); await tick();
    const toggle = f.root.querySelector('[data-lesson-beauty-toggle]'); const group = f.root.querySelector('[aria-label="老师摄像头美颜"]');
    assert.equal(group.hidden, true); assert.equal(resizes.length, 0);
    toggle.click(); assert.equal(height, 540); assert.equal(group.hidden, false);
    f.media.setConnected(false); f.media.setConnected(true);
    assert.equal(resizes.length, 1, 'network recovery never resizes a permitted desktop window');
    toggle.click(); assert.equal(height, 420); assert.equal(group.hidden, true);
    assert.deepEqual(resizes, [['by', 0, 120], ['to', 260, 420]]);
    assert.equal(f.captures.length, 1); assert.equal(f.streams[0].track.readyState, 'live');
});

it('denied desktop resizing leaves a separate scrollable beauty panel and usable end controls', async (t) => {
    const f = fixture(t);
    const pip = new JSDOM('<head></head><body></body>', { url: 'https://onebyone.test/' });
    pip.window.resizeBy = () => { throw new Error('Resizing unavailable'); };
    f.window.documentPictureInPicture = { async requestWindow() { return pip.window; } };
    t.after(() => pip.window.close());
    await f.media.start(lesson); f.media.setConnected(true); await tick();
    f.root.querySelector('[data-lesson-beauty-toggle]').click();
    const group = f.root.querySelector('[aria-label="老师摄像头美颜"]');
    assert.equal(group.hidden, false); assert.equal(group.closest('.lesson-media__tile'), null);
    assert.equal(group.closest('.lesson-media__content'), f.root.querySelector('.lesson-media__content'));
    f.root.querySelector('[data-lesson-media-leave]').click();
    assert.equal(f.root.querySelector('[data-lesson-exit-dialog]').hidden, false);
    f.root.querySelector('[data-lesson-exit-cancel]').click();
    assert.equal(f.left, 0); assert.equal(f.streams[0].track.readyState, 'live');
});

it('student cameras have no beauty controls or processing and cannot save teacher parameters', async (t) => {
    const f = fixture(t, { uid: lesson.studentUid, filteredBeauty: true, manualClock: true });
    await f.media.start(lesson); f.media.setConnected(true); f.advance(33);
    assert.equal(f.root.querySelector('[aria-label="老师摄像头美颜"]').hidden, true);
    assert.equal(f.root.querySelector('[data-lesson-beauty-toggle]').hidden, true);
    const localTile = f.root.querySelector('[data-lesson-local-video]').parentElement;
    assert.equal(localTile.dataset.lessonParticipant, 'student');
    assert.equal(localTile.querySelectorAll('.lesson-media__icon:not([hidden])').length, 2);
    assert.equal(f.beautyInstances.length, 0);
    assert.equal(f.draws.at(-1)[0], f.root.querySelector('[data-lesson-local-video]'));
    const input = f.root.querySelector('[data-lesson-beauty="whitening"]');
    input.value = '90'; input.dispatchEvent(new f.window.Event('input'));
    assert.equal(f.window.localStorage.getItem(`onebyone.lesson.beauty.v1:${lesson.studentUid}`), null);
});

it('teacher beauty sliders persist by account and zeroing all three restores unprocessed preview and video', async (t) => {
    const f = fixture(t, { filteredBeauty: true, manualClock: true });
    await f.media.start(lesson); f.media.setConnected(true);
    const change = (key, value) => {
        const input = f.root.querySelector(`[data-lesson-beauty="${key}"]`);
        input.value = String(value); input.dispatchEvent(new f.window.Event('input'));
    };
    change('whitening', 60); change('smoothing', 45); change('eyeBrightening', 70); f.advance(40);
    const processor = f.beautyInstances[0];
    assert.deepEqual(processor.calls.at(-1).settings, { whitening: 60, smoothing: 45, eyeBrightening: 70 });
    const key = `onebyone.lesson.beauty.v1:${lesson.teacherUid}`;
    const saved = f.window.localStorage.getItem(key);
    assert.deepEqual(JSON.parse(saved), { whitening: 60, smoothing: 45, eyeBrightening: 70 });
    const recovered = fixture(t, { storage: { [key]: saved } }); await recovered.media.start(lesson);
    assert.equal(recovered.root.querySelector('[data-lesson-beauty="whitening"]').value, '60');
    assert.equal(recovered.root.querySelector('[data-lesson-beauty="smoothing"]').value, '45');
    assert.equal(recovered.root.querySelector('[data-lesson-beauty="eyeBrightening"]').value, '70');
    const other = fixture(t, { uid: 3, storage: { [key]: saved } });
    await other.media.start({ ...lesson, teacherUid: 3 });
    assert.equal(other.root.querySelector('[data-lesson-beauty="whitening"]').value, '20');
    change('whitening', 0); change('smoothing', 0); f.advance(40);
    assert.equal(processor.disposed, 0, 'eye brightening alone continues through the shared processed source');
    assert.equal(processor.calls.at(-1).settings.eyeBrightening, 70);
    change('eyeBrightening', 0); f.advance(40);
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
    assert(f.draws.some(args => args[0] === preview && args[3] === 960 && args[4] === 540), 'outgoing JPEG uses the filtered source');
    assert(f.draws.some(args => args[0] === preview && args[3] === 320 && args[4] === 180), 'the desktop composite uses that same filtered source');
});

it('opens Safari video PiP when the standard API rejects the format and keeps an older close event out of a new window', async t => {
    const f = fixture(t, { manualClock: true });
    const composites = []; const windows = [];
    f.window.HTMLCanvasElement.prototype.captureStream = () => {
        const track = { stopped: false, stop() { this.stopped = true; } }; composites.push(track);
        return { getTracks: () => [track] };
    };
    const video = f.window.HTMLVideoElement.prototype;
    video.requestPictureInPicture = async () => { throw Object.assign(new Error(), { name: 'NotSupportedError' }); };
    video.webkitSupportsPresentationMode = mode => mode === 'picture-in-picture';
    video.webkitSetPresentationMode = function(mode) { this.webkitPresentationMode = mode; if (mode === 'picture-in-picture') windows.push(this); };
    await f.media.start(lesson); f.media.setConnected(true); await tick();
    assert.equal(windows.length, 1); assert.equal(f.root.querySelector('[data-lesson-desktop]').hidden, true);
    const close = element => {
        element.webkitPresentationMode = 'inline';
        element.dispatchEvent(new f.window.Event('webkitpresentationmodechanged'));
    };
    close(windows[0]); assert(composites[0].stopped); assert.equal(f.streams[0].track.stopped, 0);
    f.root.querySelector('[data-lesson-desktop]').click(); await tick(); assert.equal(windows.length, 2);
    close(windows[0]); assert.equal(composites[1].stopped, false);
    f.root.querySelector('[data-lesson-microphone]').click(); assert.equal(f.root.querySelector('[data-lesson-microphone]').dataset.state, 'off');
    close(windows[1]); assert(composites[1].stopped);
    video.webkitSupportsPresentationMode = () => false;
    f.root.querySelector('[data-lesson-desktop]').click(); await tick();
    assert.equal(windows.length, 2); assert(!f.root.querySelector('[data-lesson-desktop]').hidden);
    assert.equal(f.streams[0].track.stopped, 0, 'a rejected Safari window leaves the classroom camera available on the page');
});

async function connectScreenFixture(f) {
    await f.media.start(lesson); f.media.setConnected(true);
    f.media.receive({ type: 'peer', online: true, streamId: f.captures.length && f.root.querySelector('[data-lesson-participant="teacher"] [data-lesson-local-video]') ? 'student-screen-tab' : 'teacher-screen-tab' });
    await tick();
}
const screenMessage = (type, values = {}, uid = lesson.teacherUid) => ({
    type, lessonId: lesson._id, uid, streamId: uid === lesson.teacherUid ? 'teacher-screen-tab' : 'student-screen-tab', ...values,
});

it('the teacher requests the learner desktop from its camera tile without opening any display picker', async t => {
    const f = fixture(t, { manualClock: true }); await connectScreenFixture(f);
    const audioStops = f.audioStops;
    const toggle = f.root.querySelector('[data-lesson-screen-toggle]');
    assert(toggle && !toggle.hidden); assert.equal(toggle.closest('[data-lesson-participant]').dataset.lessonParticipant, 'student');
    assert.equal(f.screenCaptures.length, 0);
    toggle.click();
    assert(f.sent.some(message => message.type === 'screen-view' && message.watching === true));
    assert.equal(f.screenCaptures.length, 0); assert.equal(f.captures.length, 1); assert.equal(f.audioStarts, 1);
    toggle.click();
    assert.equal(f.sent.filter(message => message.type === 'screen-view').at(-1).watching, false);
    assert.equal(f.captures.length, 1); assert.equal(f.streams[0].track.stopped, 0); assert.equal(f.audioStops, audioStops);
});

it('a learner screen request waits for its explicit click and can be declined with no capture', async t => {
    const f = fixture(t, { uid: lesson.studentUid, manualClock: true }); await connectScreenFixture(f);
    f.media.receive(screenMessage('screen-view', { watching: true }));
    const consent = f.root.querySelector('[data-lesson-screen-consent]');
    assert(consent && !consent.hidden); assert.equal(f.screenCaptures.length, 0);
    f.root.querySelector('[data-lesson-screen-decline]').click();
    assert.equal(consent.hidden, true); assert.equal(f.screenCaptures.length, 0);
    assert(f.sent.some(message => message.type === 'screen-state' && message.state === 'declined'));
    assert.equal(f.streams[0].track.stopped, 0);
});

it('learner whole-desktop sharing starts only from consent and its stop icon closes screen tracks independently', async t => {
    const f = fixture(t, { uid: lesson.studentUid, manualClock: true }); await connectScreenFixture(f);
    f.media.receive(screenMessage('screen-view', { watching: true }));
    f.root.querySelector('[data-lesson-screen-share]').click();
    assert.equal(f.screenCaptures.length, 1, 'the display picker starts synchronously in the learner click');
    assert.equal(f.screenCaptures[0].audio, false); assert.equal(f.screenCaptures[0].video.displaySurface, 'monitor');
    await tick(); f.advance(150);
    assert(f.sent.some(message => message.type === 'screen-state' && message.state === 'sharing'));
    assert(f.sent.some(message => message.type === 'screen'));
    const stop = f.root.querySelector('[data-lesson-screen-stop]'); assert(stop && !stop.hidden);
    stop.click();
    assert(f.screenStreams[0].track.stopped > 0); assert.equal(f.streams[0].track.stopped, 0); assert.equal(f.audio.ready, true);
    assert(f.sent.some(message => message.type === 'screen-state' && message.state === 'stopped'));
    const count = f.sent.filter(message => message.type === 'screen').length;
    f.advance(1000); assert.equal(f.sent.filter(message => message.type === 'screen').length, count);
});

it('camera toggling never restarts permitted media and remote desktop pixels disappear when the learner stops', async t => {
    const f = fixture(t, { manualClock: true }); await connectScreenFixture(f);
    const toggle = f.root.querySelector('[data-lesson-screen-toggle]'); toggle.click();
    f.media.receive(screenMessage('screen-state', { state: 'sharing' }, lesson.studentUid));
    f.media.receive(screenMessage('screen', { seq: 1, data: jpeg }, lesson.studentUid));
    const screen = f.root.querySelector('[data-lesson-remote-screen]'); screen.dispatchEvent(new f.window.Event('load'));
    assert.equal(screen.getAttribute('src'), jpeg); assert.equal(screen.hidden, false);
    f.media.receive(screenMessage('screen-state', { state: 'stopped' }, lesson.studentUid));
    assert.equal(screen.hidden, true); assert.equal(screen.getAttribute('src'), null);
    assert.equal(f.captures.length, 1); assert.equal(f.audioStarts, 1); assert.equal(f.streams[0].track.stopped, 0);
});

it('a learner can hear the teacher while the native entry screen picker is still open', async t => {
    const f = fixture(t, { uid: lesson.studentUid, delayedScreen: true });
    let listening = false;
    f.audio.listen = async () => { listening = true; };
    const entry = f.media.prepareEntryScreen(lesson);
    const entering = f.media.start(lesson, undefined, entry); f.media.setConnected(true);
    await tick();
    assert.equal(listening, true); assert.equal(f.audioStarts, 0); assert.equal(f.captures.length, 0);
    f.media.receive({ type: 'audio', uid: lesson.teacherUid, lessonId: lesson._id, streamId: 'teacher', seq: 1, data: 'guide' });
    assert.deepEqual(f.audioFrames, [[1, 'guide']]);
    f.resolveScreen(); await entering;
    assert.equal(f.audioStarts, 1); assert.equal(f.captures.length, 1);
});

it('a screen picker resolving after class exit cannot revive capture or retain its track', async t => {
    const f = fixture(t, { uid: lesson.studentUid, manualClock: true, delayedScreen: true }); await connectScreenFixture(f);
    f.media.receive(screenMessage('screen-view', { watching: true })); f.root.querySelector('[data-lesson-screen-share]').click();
    assert.equal(f.screenCaptures.length, 1); f.media.stop(); f.resolveScreen(); await tick(); f.advance(1000);
    assert(f.screenStreams[0].track.stopped > 0); assert.equal(f.sent.filter(message => message.type === 'screen').length, 0);
    assert.equal(f.root.hidden, true);
});

it('window-only screen selection is rejected without affecting classroom camera or microphone', async t => {
    const f = fixture(t, { uid: lesson.studentUid, manualClock: true, screenSurface: 'window' }); await connectScreenFixture(f);
    f.media.receive(screenMessage('screen-view', { watching: true })); f.root.querySelector('[data-lesson-screen-share]').click();
    await tick(); f.advance(500);
    assert(f.screenStreams[0].track.stopped > 0); assert.equal(f.sent.filter(message => message.type === 'screen').length, 0);
    assert.match(f.root.textContent, /整个屏幕/); assert.equal(f.streams[0].track.stopped, 0); assert.equal(f.audio.ready, true);
});

it('cancelling browser screen consent leaves the learner camera and microphone running', async t => {
    const f = fixture(t, { uid: lesson.studentUid, manualClock: true, screenDenied: true }); await connectScreenFixture(f);
    f.media.receive(screenMessage('screen-view', { watching: true })); f.root.querySelector('[data-lesson-screen-share]').click();
    await tick(); f.advance(500);
    assert.equal(f.screenCaptures.length, 1); assert.equal(f.screenStreams.length, 0);
    assert(f.sent.some(message => message.type === 'screen-state' && message.state === 'declined'));
    assert.equal(f.sent.filter(message => message.type === 'screen').length, 0);
    assert.equal(f.streams[0].track.stopped, 0); assert.equal(f.audio.ready, true); assert.equal(f.root.hidden, false);
    assert.match(f.root.textContent, /授权/);
});

for (const [browser, ua] of [['Safari', 'Version/18.4 Safari/605.1.15'], ['Chrome', 'Chrome/140.0 Safari/537.36']]) {
    it(`Mac ${browser} screen permission help stays folded after refusal and opens the picker only on explicit retry`, async t => {
        const options = { uid: lesson.studentUid, manualClock: true, screenDenied: true, mac: ua };
        const f = fixture(t, options); await connectScreenFixture(f);
        const help = f.root.querySelector('details.lesson-media__screen-consent');
        assert.equal(help.hidden, true);
        f.media.receive(screenMessage('screen-view', { watching: true }));
        const share = f.root.querySelector('[data-lesson-screen-share]');
        share.click(); await tick();
        assert.equal(help.hidden, false); assert.equal(help.open, false);
        help.querySelector('summary').click();
        assert.equal(help.open, true); assert.equal(f.screenCaptures.length, 1);
        assert.match(help.textContent, /隐私与安全.*录屏与系统录音/);
        assert(help.textContent.includes(browser));
        if (browser === 'Safari') {
            assert.match(help.textContent, /Safari 浏览器 → 设置 → 网站 → 屏幕共享/);
            assert.doesNotMatch(help.textContent, /设为「允许」/);
        }
        options.screenDenied = false; share.click(); await tick();
        assert.equal(f.screenCaptures.length, 2); assert.equal(help.hidden, true); assert.equal(help.open, false);
        assert.equal(f.audio.ready, true); assert.equal(f.streams[0].track.stopped, 0);
        const teacher = fixture(t, { mac: ua, manualClock: true }); await connectScreenFixture(teacher);
        teacher.root.querySelector('[data-lesson-screen-toggle]').click();
        assert.equal(teacher.root.querySelector('details.lesson-media__screen-consent').hidden, true);
        assert.equal(teacher.screenCaptures.length, 0);
    });
}
