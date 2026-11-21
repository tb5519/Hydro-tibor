const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const source = path.join(__dirname, '../packages/ui-default/components/lesson/screen.ts');
const lesson = { _id: 'lesson-screen-123', teacherUid: 2, studentUid: 10 };
const jpeg = 'data:image/jpeg;base64,/9j/2Q==';
const tick = () => new Promise(resolve => setImmediate(resolve));
const request = (watching = true, extra = {}) => ({ type: 'screen-view', lessonId: lesson._id,
    uid: lesson.teacherUid, streamId: 'teacher-tab-A', watching, ...extra });
const state = (value = 'sharing', extra = {}) => ({ type: 'screen-state', lessonId: lesson._id,
    uid: lesson.studentUid, streamId: 'student-tab-A', state: value, ...extra });
const frame = (seq = 1, extra = {}) => ({ type: 'screen', lessonId: lesson._id,
    uid: lesson.studentUid, streamId: 'student-tab-A', seq, data: jpeg, ...extra });

it('a new view request cannot overwrite a failed camera-return reset', t => {
    const f = fixture(t, { teacher: true });
    f.screen.toggleView();
    f.block(true); f.screen.toggleView();
    const before = f.sent.length;
    f.screen.toggleView();
    assert.equal(f.sent.length, before);
    assert.equal(f.screen.snapshot().watching, false);
    f.block(false); f.screen.toggleView();
    assert.deepEqual(f.sent.slice(-2).map(message => message.watching), [false, true]);
    assert.equal(f.screen.snapshot().watching, true);
});

function fixture(t, options = {}) {
    const dom = new JSDOM('<main>课堂</main>', { url: 'https://onebyone.test/', pretendToBeVisual: true });
    const { window } = dom;
    const sent = []; const captures = []; const streams = []; const encodes = []; const draws = [];
    const resolvers = [];
    let changes = 0; let now = 1000000; let blocked = false; let userMediaCalls = 0;
    function stream() {
        const surface = Object.hasOwn(options, 'surface') ? options.surface : 'monitor';
        const listeners = new Map();
        const track = {
            stopped: 0, readyState: 'live', enabled: true,
            getSettings() {
                if (options.noSettings === 'throws') throw new TypeError('unavailable settings');
                return { displaySurface: surface, width: options.width || 1920, height: options.height || 1080 };
            },
            stop() { this.stopped++; this.readyState = 'ended'; },
            addEventListener(name, callback) { listeners.set(name, callback); },
            removeEventListener(name) { listeners.delete(name); },
            end() { this.readyState = 'ended'; listeners.get('ended')?.(); },
        };
        if (options.noSettings === 'absent') delete track.getSettings;
        const audioTrack = { stopped: 0, stop() { this.stopped++; } };
        const value = { track, audioTrack, getTracks: () => [track, audioTrack],
            getVideoTracks: () => [track], getAudioTracks: () => [audioTrack] };
        streams.push(value); return value;
    }
    Object.defineProperty(window, 'isSecureContext', { value: true });
    Object.defineProperty(window.navigator, 'mediaDevices', { value: {
        getUserMedia() { userMediaCalls++; throw new Error('Screen capture must not restart camera or microphone'); },
        getDisplayMedia(constraints) {
            captures.push(constraints);
            if (options.errorName) return Promise.reject(Object.assign(new Error('capture unavailable'), { name: options.errorName }));
            if (options.denied) return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
            const value = stream();
            if (options.delayed) return new Promise(resolve => resolvers.push(() => resolve(value)));
            return Promise.resolve(value);
        },
    } });
    window.HTMLMediaElement.prototype.play = async () => {};
    window.HTMLMediaElement.prototype.pause = () => {};
    Object.defineProperty(window.HTMLMediaElement.prototype, 'readyState', { get: () => 4 });
    Object.defineProperties(window.HTMLVideoElement.prototype, {
        videoWidth: { get: () => options.width || 1920 }, videoHeight: { get: () => options.height || 1080 },
    });
    window.HTMLCanvasElement.prototype.getContext = () => ({ fillStyle: '', fillRect() {}, clearRect() {},
        drawImage(...args) { draws.push(args); } });
    window.HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
        encodes.push({ width: this.width, height: this.height, type, quality });
        return options.encode ? options.encode(this.width, this.height, quality) : jpeg;
    };
    const module = { exports: {} };
    const fixtureDate = class extends Date { static now() { return now; } };
    const flowModule = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(path.dirname(source), 'camera_flow.ts'), 'utf8'),
        { loader: 'ts', format: 'cjs' }).code, { module: flowModule, exports: flowModule.exports, Date: fixtureDate });
    Object.defineProperty(window.performance, 'now', { value: () => now });
    vm.runInNewContext(transformSync(fs.readFileSync(source, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, window, document: window.document, navigator: window.navigator,
        HTMLVideoElement: window.HTMLVideoElement, Image: window.Image, console,
        require: () => flowModule.exports, Date: fixtureDate,
        setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
        setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window),
    });
    const screen = module.exports.mountLessonScreen({ uid: options.teacher ? lesson.teacherUid : lesson.studentUid }, {
        send(message) { if (blocked) return false; sent.push(message); return true; },
        canSendPicture: options.canSendPicture,
        preparePicture: options.preparePicture,
        onChange() { changes++; },
    });
    screen.start(lesson); screen.setConnected(true); screen.setPeerOnline(true);
    t.after(() => { screen.dispose(); window.close(); });
    return { screen, window, sent, captures, streams, encodes, draws, resolve: () => resolvers.shift()?.(),
        advance(ms) { now += ms; }, block(value) { blocked = value; },
        get changes() { return changes; }, get userMediaCalls() { return userMediaCalls; } };
}

it('a teacher requests the learner screen without touching either capture API and toggles back to camera', async t => {
    const f = fixture(t, { teacher: true });
    assert.equal(f.captures.length, 0);
    f.screen.toggleView();
    assert.equal(f.screen.snapshot().watching, true);
    assert.equal(f.sent.at(-1).type, 'screen-view'); assert.equal(f.sent.at(-1).watching, true);
    await f.screen.startSharing();
    assert.equal(f.captures.length, 0); assert.equal(f.userMediaCalls, 0);
    f.screen.toggleView();
    assert.equal(f.screen.snapshot().watching, false);
    assert.equal(f.sent.at(-1).watching, false);
});

it('a new screen view needs its own fresh window even when both devices and the socket are unchanged', t => {
    const f = fixture(t, { teacher: true });
    f.screen.setPeerOnline(true, 'student-tab-A', true);
    const open = () => {
        f.screen.toggleView();
        assert.equal(f.sent.at(-1).flow, true);
        f.screen.receive(state('sharing', { flow: true }));
        const window = f.sent.findLast(m => m.type === 'screen-window');
        assert(window, 'the consent event requests the first screen immediately, even with background timers paused');
        return window.seq;
    };
    const first = open();
    f.screen.receive(frame(1)); assert.equal(f.screen.snapshot().remoteSource, null);
    f.screen.receive(frame(2, { ticket: first })); assert.equal(f.screen.snapshot().remoteSource, jpeg);
    f.screen.toggleView(); assert.equal(f.screen.snapshot().remoteSource, null);
    const second = open(); assert(second > first);
    f.screen.receive(frame(3, { ticket: first })); assert.equal(f.screen.snapshot().remoteSource, null);
    f.screen.receive(frame(4, { ticket: second })); assert.equal(f.screen.snapshot().remoteSource, jpeg);
    f.advance(2500); f.screen.capture();
    assert.equal(f.screen.snapshot().remoteSource, null); assert.equal(f.screen.snapshot().watching, true);
    const fresh = f.sent.findLast(m => m.type === 'screen-window');
    assert.equal(fresh.seen, 4);
    f.screen.receive(frame(5, { ticket: second })); assert.equal(f.screen.snapshot().remoteSource, null);
    f.screen.receive(frame(6, { ticket: fresh.seq })); assert.equal(f.screen.snapshot().remoteSource, jpeg);
    f.screen.setConnected(false); f.screen.setConnected(true);
    f.screen.setPeerOnline(true, 'student-tab-B', true);
    f.screen.receive(state('sharing', { streamId: 'student-tab-B', flow: true }));
    f.screen.receive(frame(7, { streamId: 'student-tab-B', ticket: fresh.seq }));
    assert.equal(f.screen.snapshot().remoteSource, null);
    f.screen.receive(state('stopped', { streamId: 'student-tab-B' }));
    f.screen.capture(); assert.equal(f.screen.snapshot().watching, false);
});

it('avoids encoding a complex screen while the microphone and camera occupy the upload, and still serves an older teacher', async t => {
    let writable = false;
    const f = fixture(t, { canSendPicture: () => writable });
    f.screen.setPeerOnline(true, 'teacher-tab-A', true);
    f.screen.receive(request(true, { flow: true })); await f.screen.startSharing();
    const window = { type: 'screen-window', uid: 2, lessonId: lesson._id, streamId: 'teacher-tab-A', seq: 1, level: 3 };
    f.screen.receive(window); f.screen.capture();
    assert.equal(f.encodes.length, 0);
    writable = true; f.screen.capture();
    assert.equal(f.sent.at(-1).ticket, 1);
    f.screen.receive(request(false)); f.advance(1500); f.screen.receive({ ...window, seq: 2 }); f.screen.capture();
    assert.equal(f.sent.filter(m => m.type === 'screen').length, 1);
    f.screen.receive(request()); f.screen.capture();
    assert.equal(f.sent.at(-1).type, 'screen'); assert.equal(f.sent.at(-1).ticket, undefined);
});

it('publishes only fresh decoded desktop images and cancels pending decodes on a camera switch', async t => {
    const jobs = []; const displayed = [];
    const f = fixture(t, { teacher: true, preparePicture: data => new Promise(resolve => {
        jobs.push({ data, complete: () => resolve(() => displayed.push(data)) });
    }) });
    f.screen.setPeerOnline(true, 'student-tab-A', true); f.screen.toggleView();
    f.screen.receive(state('sharing', { flow: true })); f.screen.capture();
    const picture = seq => {
        const ticket = f.sent.findLast(m => m.type === 'screen-window').seq;
        const data = 'data:image/jpeg;base64,' + Buffer.from('desktop picture ' + seq).toString('base64');
        f.screen.receive(frame(seq, { ticket, data })); return data;
    };
    picture(1); picture(2); f.advance(1050); f.screen.capture();
    const latest = picture(3); assert.equal(jobs.length, 1);
    jobs[0].complete(); await tick();
    assert.equal(displayed.length, 0); assert.equal(jobs[1].data, latest, 'only the newest waiting picture is decoded');
    jobs[1].complete(); await tick(); assert.deepEqual(displayed, [latest]);
    picture(4); f.screen.toggleView(); jobs[2].complete(); await tick();
    assert.deepEqual(displayed, [latest]); assert.equal(f.screen.snapshot().remoteSource, null);
});

it('a request alone keeps devices idle, then an explicit learner click synchronously opens the entire-screen picker', async t => {
    const f = fixture(t);
    await f.screen.startSharing(); assert.equal(f.captures.length, 0, 'cannot share without teacher request');
    f.screen.receive(request());
    assert.equal(f.captures.length, 0); assert.equal(f.screen.snapshot().requested, true);
    const pending = f.screen.startSharing();
    assert.equal(f.captures.length, 1, 'picker call must retain transient click activation');
    await pending;
    assert.equal(f.captures[0].audio, false);
    assert.equal(f.captures[0].video.displaySurface, 'monitor');
    assert.equal(f.screen.snapshot().sharing, true);
    assert(f.sent.some(message => message.type === 'screen-state' && message.state === 'sharing'));
    assert.equal(f.userMediaCalls, 0);
});

it('a join picker resolving after cancellation or for different participants releases its desktop track', async t => {
    const f = fixture(t, { delayed: true });
    f.screen.stop();
    const failedJoin = f.screen.prepareEntryScreen(lesson);
    failedJoin.cancel(); f.resolve(); await tick();
    assert(f.streams[0].track.stopped);
    const differentTeacher = f.screen.prepareEntryScreen(lesson);
    f.screen.start({ ...lesson, teacherUid: lesson.teacherUid + 1 }, differentTeacher);
    f.resolve(); await tick();
    assert(f.streams[1].track.stopped);
    assert.equal(f.screen.snapshot().sharing, false);
    assert.equal(f.sent.filter(message => message.type === 'screen').length, 0);
});

it('a learner can retry a cancelled join picker before the teacher arrives and revoke it on leaving', async t => {
    const options = { denied: true }; const f = fixture(t, options);
    f.screen.stop();
    await f.screen.start(lesson, f.screen.prepareEntryScreen(lesson));
    assert.equal(f.screen.snapshot().entryRetry, true);
    assert.equal(f.screen.snapshot().sharing, false);
    options.denied = false;
    await f.screen.startSharing();
    assert.equal(f.screen.snapshot().sharing, true);
    assert.equal(f.screen.snapshot().entryRetry, false);
    f.screen.capture(); assert.equal(f.sent.filter(message => message.type === 'screen').length, 0);
    f.screen.stop(); assert(f.streams[0].track.stopped);
});

it('refusing screen permission reports the refusal without affecting camera or microphone', async t => {
    const f = fixture(t, { denied: true }); f.screen.receive(request());
    await f.screen.startSharing();
    assert.equal(f.screen.snapshot().sharing, false);
    assert(f.screen.snapshot().error); assert.equal(f.userMediaCalls, 0);
    assert(f.sent.some(message => message.type === 'screen-state' && message.state === 'declined'));
});

it('a focus error keeps the page-authorization action visible across teacher heartbeats and retries only on a new click', async t => {
    const configuration = { errorName: 'InvalidStateError' };
    const f = fixture(t, configuration); f.screen.receive(request()); await f.screen.startSharing();
    assert.equal(f.screen.snapshot().needsPageAuthorization, true);
    assert.equal(f.screen.snapshot().requested, true);
    f.advance(2100); f.screen.receive(request()); f.screen.capture();
    assert.equal(f.captures.length, 1);
    assert.equal(f.screen.snapshot().needsPageAuthorization, true, 'the repeated viewing request must not hide focus-error recovery');
    configuration.errorName = '';
    await f.screen.startSharing();
    assert.equal(f.captures.length, 2); assert.equal(f.screen.snapshot().sharing, true);
    assert.equal(f.screen.snapshot().needsPageAuthorization, false);
});

it('a refused learner is not prompted again by repeated teacher viewing heartbeats', async t => {
    const f = fixture(t, { denied: true }); f.screen.receive(request()); await f.screen.startSharing();
    assert.equal(f.screen.snapshot().requested, false);
    for (let n = 0; n < 4; n++) { f.advance(2100); f.screen.receive(request()); f.screen.capture(); }
    assert.equal(f.screen.snapshot().requested, false); assert.equal(f.captures.length, 1);
    f.screen.receive(request(false)); f.screen.receive(request(true));
    assert.equal(f.screen.snapshot().requested, true, 'a separate teacher click may request fresh consent');
    assert.equal(f.captures.length, 1);
});

for (const surface of ['window', 'browser', undefined]) {
    it(`rejects a ${surface || 'missing'} display-surface setting and immediately stops every returned track`, async t => {
        const f = fixture(t, { surface }); f.screen.receive(request());
        await f.screen.startSharing();
        assert.equal(f.screen.snapshot().sharing, false);
        assert.equal(f.streams.length, 1);
        assert(f.streams[0].track.stopped > 0); assert(f.streams[0].audioTrack.stopped > 0);
        assert.match(f.screen.snapshot().error, surface ? /请选择「整个屏幕」/ : /浏览器没有报告共享类型/);
        f.screen.capture(); assert.equal(f.sent.filter(item => item.type === 'screen').length, 0);
    });
}
for (const noSettings of ['throws', 'absent']) it(`a browser whose track settings are ${noSettings} releases both tracks without blaming the learner`, async t => {
    const f = fixture(t, { noSettings });
    f.screen.receive(request()); await f.screen.startSharing();
    assert.match(f.screen.snapshot().error, /浏览器没有报告共享类型/);
    assert.equal(f.screen.snapshot().permissionHelp, false, 'this is not a permission denial');
    assert.equal(f.screen.snapshot().sharing, false);
    assert.equal(f.streams[0].track.stopped, 1); assert.equal(f.streams[0].audioTrack.stopped, 1);
    f.screen.capture();
    assert.equal(f.sent.filter(item => item.type === 'screen' || item.state === 'sharing').length, 0);
});

it('leaving while permission is pending closes a late stream and cannot revive the old lesson', async t => {
    const f = fixture(t, { delayed: true }); f.screen.receive(request());
    const pending = f.screen.startSharing(); assert.equal(f.captures.length, 1);
    f.screen.stop(); f.screen.start({ ...lesson, _id: 'lesson-new-456' });
    f.screen.setConnected(true); f.screen.setPeerOnline(true); f.resolve(); await pending;
    assert.equal(f.screen.snapshot().sharing, false);
    assert(f.streams[0].track.stopped > 0);
    assert.equal(f.sent.filter(message => message.type === 'screen-state' && message.state === 'sharing').length, 0);
});

it('a chooser opened before disconnect cannot revive after reconnect or complete a newer authorization attempt', async t => {
    const f = fixture(t, { delayed: true }); f.screen.receive(request());
    const oldSelection = f.screen.startSharing();
    f.screen.setConnected(false); f.screen.setConnected(true); f.screen.setPeerOnline(true); f.screen.receive(request());
    const newSelection = f.screen.startSharing();
    assert.equal(f.captures.length, 2, 'reconnect requires a new learner click for a previously pending chooser');
    f.resolve(); await oldSelection;
    assert(f.streams[0].track.stopped > 0); assert.equal(f.screen.snapshot().sharing, false);
    assert.equal(f.screen.snapshot().starting, true, 'old completion cannot clear the newer chooser status');
    f.resolve(); await newSelection;
    assert.equal(f.screen.snapshot().sharing, true); assert.equal(f.streams[1].track.stopped, 0);
});

it('a screen track that already ended while the browser picker was pending is never announced or sent', async t => {
    const f = fixture(t, { delayed: true }); f.screen.receive(request());
    const pending = f.screen.startSharing(); f.streams[0].track.readyState = 'ended'; f.resolve(); await pending;
    assert.equal(f.screen.snapshot().sharing, false); assert(f.streams[0].track.stopped > 0);
    assert.equal(f.sent.filter(message => message.type === 'screen-state' && message.state === 'sharing').length, 0);
});

it('returning to the camera pauses screen encoding and reuses the existing explicitly authorised stream', async t => {
    const f = fixture(t); f.screen.receive(request()); await f.screen.startSharing();
    f.screen.capture(); const count = f.sent.filter(message => message.type === 'screen').length;
    assert.equal(count, 1);
    f.screen.receive(request(false)); f.advance(200); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen').length, count);
    assert.equal(f.streams[0].track.stopped, 0); assert.equal(f.screen.snapshot().sharing, true);
    f.screen.receive(request(true)); f.advance(200); f.screen.capture();
    assert.equal(f.captures.length, 1);
    assert.equal(f.sent.filter(message => message.type === 'screen').length, count + 1);
    assert.equal(f.userMediaCalls, 0);
});

it('disconnect pauses screen frames, reconnect reports existing consent, and frames wait for a fresh teacher request', async t => {
    const f = fixture(t); f.screen.receive(request()); await f.screen.startSharing(); f.screen.capture();
    const count = f.sent.filter(message => message.type === 'screen').length;
    f.screen.setConnected(false); f.advance(200); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen').length, count);
    f.screen.setConnected(true); f.screen.setPeerOnline(true); f.advance(200); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen').length, count);
    assert.equal(f.sent.filter(message => message.type === 'screen-state' && message.state === 'sharing').length, 2);
    f.screen.receive(request()); f.advance(200); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen').length, count + 1);
    assert.equal(f.captures.length, 1);
});

it('capture stays within eight frames per second, bounds dimensions, and preserves an ultrawide full desktop', async t => {
    const f = fixture(t, { width: 3440, height: 1440 }); f.screen.receive(request()); await f.screen.startSharing();
    for (let n = 0; n < 25; n++) { f.screen.capture(); f.advance(40); }
    const frames = f.sent.filter(message => message.type === 'screen');
    assert(frames.length > 0 && frames.length <= 8);
    assert(f.encodes.every(entry => entry.width <= 1280 && entry.height <= 720 && entry.type === 'image/jpeg'));
    assert(frames.every(entry => entry.data.length <= 262144));
    for (const args of f.draws) {
        assert([5, 9].includes(args.length));
        if (args.length === 9) assert.deepEqual(args.slice(1, 5), [0, 0, 3440, 1440]);
        else assert(Math.abs(args[3] / args[4] - 3440 / 1440) < .01, 'draw the full source without stretching/cropping');
    }
});

it('browser stop-sharing stops the capture, reports stopped, and never restarts a device', async t => {
    const f = fixture(t); f.screen.receive(request()); await f.screen.startSharing(); f.streams[0].track.end();
    assert.equal(f.screen.snapshot().sharing, false);
    assert(f.sent.some(message => message.type === 'screen-state' && message.state === 'stopped'));
    f.advance(1000); f.screen.capture(); assert.equal(f.captures.length, 1);
    assert.equal(f.userMediaCalls, 0);
});

it('explicit learner stop and disposal close tracks and prevent late messages from resuming capture', async t => {
    const f = fixture(t); f.screen.receive(request()); await f.screen.startSharing(); f.screen.stopSharing();
    assert(f.streams[0].track.stopped > 0); assert.equal(f.screen.snapshot().sharing, false);
    f.screen.dispose(); f.screen.receive(request()); await f.screen.startSharing();
    assert.equal(f.captures.length, 1); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen').length, 0);
});

it('teacher accepts only its current learner screen after sharing state, rejects stale sequence and clears it on stop', async t => {
    const f = fixture(t, { teacher: true }); f.screen.toggleView();
    f.screen.receive(frame(1)); assert.equal(f.screen.snapshot().remoteSource, null);
    f.screen.receive(state());
    for (const invalid of [frame(1, { uid: 999 }), frame(1, { lessonId: 'another-lesson' }), frame(-1),
        frame(1, { data: 'data:text/html;base64,WA==' }), frame(1, { data: 'data:image/jpeg;base64,' + 'A'.repeat(262145) })]) {
        f.screen.receive(invalid); assert.equal(f.screen.snapshot().remoteSource, null);
    }
    f.screen.receive(frame(5)); assert.equal(f.screen.snapshot().remoteSource, jpeg);
    const at = f.screen.snapshot().remoteAt;
    f.advance(20); f.screen.receive(frame(4)); assert.equal(f.screen.snapshot().remoteAt, at);
    f.screen.receive(state('stopped')); assert.equal(f.screen.snapshot().remoteSource, null);
    assert.equal(f.screen.snapshot().watching, false);
});

it('expired teacher frames restore the camera instead of freezing an old desktop picture', async t => {
    const f = fixture(t, { teacher: true }); f.screen.toggleView(); f.screen.receive(state()); f.screen.receive(frame());
    assert.equal(f.screen.snapshot().remoteSource, jpeg);
    f.advance(1900); f.screen.capture();
    assert.equal(f.screen.snapshot().remoteSource, null);
});

it('teacher camera toggle rejects late desktop frames and a different learner tab requires a fresh sharing state', async t => {
    const f = fixture(t, { teacher: true }); f.screen.toggleView(); f.screen.receive(state()); f.screen.receive(frame(5));
    f.screen.toggleView(); f.screen.receive(frame(6)); assert.equal(f.screen.snapshot().remoteSource, null);
    f.screen.toggleView(); f.screen.receive(frame(1, { streamId: 'student-tab-B' }));
    assert.equal(f.screen.snapshot().remoteSource, null);
    f.screen.receive(state('sharing', { streamId: 'student-tab-B' }));
    assert.equal(f.screen.snapshot().remoteSource, null, 'a frame or state alone cannot replace the authenticated peer tab');
    f.screen.setPeerOnline(true, 'student-tab-B');
    f.screen.receive(state('sharing', { streamId: 'student-tab-B' })); f.screen.receive(frame(1, { streamId: 'student-tab-B' }));
    assert.equal(f.screen.snapshot().remoteSource, jpeg);
    f.screen.receive(state('stopped')); f.screen.receive(frame(7));
    assert.equal(f.screen.snapshot().remoteSource, jpeg, 'messages from the retired screen tab cannot clear its replacement');
});

it('a foreign lesson request or student-side forged screen frame cannot start capture or alter the screen state', async t => {
    const f = fixture(t);
    f.screen.receive(request(true, { uid: lesson.studentUid }));
    f.screen.receive(request(true, { lessonId: 'other-lesson' })); f.screen.receive(frame());
    assert.equal(f.screen.snapshot().requested, false); assert.equal(f.screen.snapshot().remoteSource, null);
    await f.screen.startSharing(); assert.equal(f.captures.length, 0);
});

it('a blocked transport does not accumulate a queue of old screen frames', async t => {
    const f = fixture(t); f.screen.receive(request()); await f.screen.startSharing(); f.block(true);
    for (let n = 0; n < 20; n++) { f.screen.capture(); f.advance(140); }
    assert.equal(f.sent.filter(message => message.type === 'screen').length, 0);
    f.block(false); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen').length, 1);
});

it('an oversize desktop cannot bypass the per-frame bound even when all JPEG quality attempts are too large', async t => {
    const f = fixture(t, { encode: () => 'data:image/jpeg;base64,' + 'A'.repeat(262145) });
    f.screen.receive(request()); await f.screen.startSharing();
    f.screen.capture(); f.advance(160); f.screen.capture();
    assert(f.encodes.length > 0);
    assert.equal(f.sent.filter(message => message.type === 'screen').length, 0);
});

it('the teacher leaving pauses the learner encoder while retaining visible, explicitly authorised capture until stopped', async t => {
    const f = fixture(t); f.screen.receive(request()); await f.screen.startSharing(); f.screen.capture();
    const count = f.sent.filter(message => message.type === 'screen').length;
    f.screen.setPeerOnline(false); f.advance(200); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen').length, count);
    assert.equal(f.screen.snapshot().sharing, true);
    assert.equal(f.streams[0].track.stopped, 0);
    f.screen.setPeerOnline(true); f.advance(200); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen').length, count);
    f.screen.receive(request()); f.advance(200); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen').length, count + 1);
});

it('an idle teacher never emits screen-view controls merely because the lesson connects or heartbeat runs', t => {
    const f = fixture(t, { teacher: true });
    for (let n = 0; n < 3; n++) { f.advance(2100); f.screen.capture(); }
    f.screen.setPeerOnline(true, 'student-tab-A'); f.advance(2100); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen-view').length, 0);
    assert.equal(f.captures.length, 0); assert.equal(f.userMediaCalls, 0);
    f.screen.toggleView();
    assert.equal(f.sent.filter(message => message.type === 'screen-view').length, 1);
    assert.equal(f.sent.at(-1).watching, true);
});

it('a teacher reconnects to an authoritative replacement learner tab and ignores media from the old owner', t => {
    const f = fixture(t, { teacher: true }); f.screen.toggleView();
    f.screen.receive(state()); f.screen.receive(frame(5));
    assert.equal(f.screen.snapshot().remoteSource, jpeg);
    f.screen.setConnected(false); assert.equal(f.screen.snapshot().remoteSource, null);
    f.screen.setConnected(true); f.screen.setPeerOnline(true, 'student-tab-B');
    assert.equal(f.screen.snapshot().watching, true);
    assert(f.sent.filter(message => message.type === 'screen-view' && message.watching).length >= 2);
    f.screen.receive(state('sharing', { streamId: 'student-tab-B' }));
    f.screen.receive(frame(1, { streamId: 'student-tab-B' }));
    assert.equal(f.screen.snapshot().remoteSource, jpeg);
    f.screen.receive(state('stopped')); f.screen.receive(frame(99));
    assert.equal(f.screen.snapshot().remoteSource, jpeg);
    f.screen.setPeerOnline(true, 'student-tab-A');
    f.screen.receive(state()); f.screen.receive(frame(100));
    assert.equal(f.screen.snapshot().remoteSource, jpeg, 'server-authoritative binding may restore a previously retired owner');
    f.screen.receive(state('stopped', { streamId: 'student-tab-B' }));
    assert.equal(f.screen.snapshot().remoteSource, jpeg);
});

it('a temporarily blocked return-to-camera control is retried once after recovery and does not become a periodic false heartbeat', t => {
    const f = fixture(t, { teacher: true }); f.screen.toggleView(); f.screen.receive(state()); f.screen.receive(frame());
    f.block(true); f.screen.toggleView();
    assert.equal(f.screen.snapshot().watching, false); assert.equal(f.screen.snapshot().remoteSource, null);
    assert.equal(f.sent.filter(message => message.type === 'screen-view' && !message.watching).length, 0);
    f.advance(2100); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen-view' && !message.watching).length, 0);
    f.block(false); f.advance(2100); f.screen.capture();
    assert.equal(f.sent.filter(message => message.type === 'screen-view' && !message.watching).length, 1);
    for (let n = 0; n < 3; n++) { f.advance(2100); f.screen.capture(); }
    assert.equal(f.sent.filter(message => message.type === 'screen-view' && !message.watching).length, 1);
});
