const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const code = buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/components/background_video.ts')],
    bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function harness(html = '<div data-loop-background data-background-video-src="https://cdn.example.test/loop.mp4"><img src="/poster.jpg"></div>', reduced = false) {
    const dom = new JSDOM(html, { url: 'https://example.test/manage', pretendToBeVisual: true });
    const win = dom.window; const doc = win.document;
    const motion = { matches: reduced, listener: null, addEventListener(_, listener) { this.listener = listener; }, removeEventListener() { this.listener = null; } };
    win.matchMedia = () => motion;
    let observer;
    win.IntersectionObserver = class {
        constructor(callback) { this.callback = callback; observer = this; }
        observe(target) { this.target = target; }
        disconnect() { this.disconnected = true; }
        show(value) { this.callback([{ target: this.target, isIntersecting: value }]); }
    };
    const counters = { play: 0, pause: 0, load: 0, revoked: [] };
    const media = win.HTMLMediaElement.prototype;
    media.load = function () { counters.load++; };
    media.play = function () { counters.play++; this._paused = false; return Promise.resolve(); };
    media.pause = function () { counters.pause++; this._paused = true; };
    Object.defineProperty(media, 'paused', { get() { return this._paused !== false; } });
    Object.defineProperty(media, 'readyState', { get() { return this._ready || 0; } });
    let frameId = 0;
    win.HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
        this._frames ||= new Map(); const id = ++frameId; this._frames.set(id, callback);
        this._frame = () => { const pending = [...this._frames.values()]; this._frames.clear();
            for (const next of pending) next(0, { mediaTime: this.currentTime, expectedDisplayTime: 0 }); };
        return id;
    };
    win.HTMLVideoElement.prototype.cancelVideoFrameCallback = function (id) { this._frames?.delete(id); };
    win.URL.createObjectURL = () => 'blob:local-video';
    win.URL.revokeObjectURL = (url) => counters.revoked.push(url);
    const mod = { exports: {} };
    vm.runInNewContext(code, { module: mod, exports: mod.exports, URL, console });
    return { dom, win, doc, motion, counters, api: mod.exports,
        get observer() { return observer; },
        ready(video) { video._ready = 4; video.dispatchEvent(new win.Event('canplay')); },
        playing(video) { video.dispatchEvent(new win.Event('playing')); video._frame?.(); },
        close() { dom.window.close(); },
    };
}

test('image-only backgrounds remain unchanged; invalid media addresses never load', () => {
    const h = harness('<div data-loop-background><img src="/still.jpg"></div><div data-loop-background data-background-video-src="javascript:alert(1)"><img src="/still.jpg"></div>');
    try {
        h.api.bindBackgroundMedia(h.doc);
        assert.equal(h.doc.querySelector('video'), null);
        assert.equal(h.doc.querySelectorAll('img').length, 2);
        assert.equal(h.counters.load, 0);
    } finally { h.close(); }
});

test('visible video starts from a playable frame without waiting for canplaythrough; native fallback preserves the current frame', async () => {
    const h = harness();
    try {
        const root = h.doc.querySelector('[data-loop-background]');
        const binding = h.api.bindLoopBackground(root, h.win);
        const video = root.querySelector('video');
        assert.equal(video.getAttribute('src'), null);
        assert.equal(video.muted, true); assert.equal(video.loop, true); assert.equal(video.playsInline, true);
        assert.equal(video.controls, false); assert.equal(video.getAttribute('aria-hidden'), 'true');
        h.observer.show(true);
        assert.equal(video.src, 'https://cdn.example.test/loop.mp4');
        assert.equal(h.counters.play, 0);
        h.ready(video); await flush();
        assert.equal(h.counters.play, 1);
        assert.equal(root.classList.contains('is-video-playing'), false);
        video.dispatchEvent(new h.win.Event('playing'));
        assert.equal(root.classList.contains('is-video-playing'), false);
        video._frame();
        assert.equal(root.classList.contains('is-video-playing'), true);
        video.currentTime = 3.5;
        video.dispatchEvent(new h.win.Event('ended'));
        assert.equal(root.querySelector('video'), video);
        assert.equal(video.currentTime, 3.5);
        assert.equal(h.counters.load, 1);
        binding.dispose();
        assert.equal(root.querySelector('video'), null);
        assert(root.querySelector('img'));
    } finally { h.close(); }
});

test('parser-loaded cached video is adopted without resetting its source, buffer or displayed frame', () => {
    const h = harness('<div data-loop-background data-background-video-src="https://cdn.example.test/loop.mp4"><img src="/poster.jpg"><video class="loop-background__video" src="https://cdn.example.test/loop.mp4" data-background-frame-ready="true"></video></div>');
    try {
        const root = h.doc.querySelector('[data-loop-background]');
        root.getBoundingClientRect = () => ({ top: 0, bottom: 300 });
        const cached = root.querySelector('video'); cached._ready = 3; cached._paused = false;
        const binding = h.api.bindLoopBackground(root, h.win);
        assert.equal(root.querySelector('video'), cached);
        assert.equal(h.counters.load, 0); assert.equal(h.counters.play, 0);
        assert(root.classList.contains('is-video-playing'));
        assert.equal(cached.src, 'https://cdn.example.test/loop.mp4');
        binding.dispose(); assert.equal(root.querySelector('video'), null);
    } finally { h.close(); }
});

test('a cached paused video and first loadeddata frame start immediately; pageshow resumes without a new download', async () => {
    const h = harness('<div data-loop-background data-background-video-src="https://cdn.example.test/loop.mp4"><img src="/poster.jpg"><video class="loop-background__video" src="https://cdn.example.test/loop.mp4"></video></div>');
    try {
        const root = h.doc.querySelector('[data-loop-background]'); root.getBoundingClientRect = () => ({ top: 0, bottom: 300 });
        const cached = root.querySelector('video'); cached._ready = 2;
        const binding = h.api.bindLoopBackground(root, h.win); await flush();
        assert.equal(h.counters.play, 1); assert.equal(h.counters.load, 0);
        assert.equal(root.classList.contains('is-video-playing'), false);
        h.playing(cached); assert(root.classList.contains('is-video-playing'));
        cached.pause(); h.win.dispatchEvent(new h.win.Event('pageshow')); await flush();
        assert.equal(cached.paused, false); assert.equal(h.counters.load, 0);
        binding.dispose();
    } finally { h.close(); }
    const cold = harness();
    try {
        const root = cold.doc.querySelector('[data-loop-background]'); const binding = cold.api.bindLoopBackground(root, cold.win);
        cold.observer.show(true); const video = root.querySelector('video'); video._ready = 2;
        video.dispatchEvent(new cold.win.Event('loadeddata')); await flush();
        assert.equal(cold.counters.play, 1); assert(!root.classList.contains('is-video-playing'));
        cold.playing(video); assert(root.classList.contains('is-video-playing')); binding.dispose();
    } finally { cold.close(); }
});

test('reduced motion loads no video, offscreen/hidden playback pauses, and errors restore the poster', async () => {
    const h = harness(undefined, true);
    try {
        const root = h.doc.querySelector('[data-loop-background]');
        const binding = h.api.bindLoopBackground(root, h.win);
        const video = root.querySelector('video');
        h.observer.show(true); assert.equal(h.counters.load, 0);
        h.motion.matches = false; h.motion.listener(); h.ready(video); await flush(); h.playing(video);
        assert(root.classList.contains('is-video-playing'));
        h.observer.show(false); assert.equal(video.paused, true);
        h.observer.show(true); await flush(); assert.equal(video.paused, false);
        Object.defineProperty(h.doc, 'visibilityState', { configurable: true, value: 'hidden' });
        h.doc.dispatchEvent(new h.win.Event('visibilitychange'));
        assert.equal(video.paused, true);
        Object.defineProperty(h.doc, 'visibilityState', { configurable: true, value: 'visible' });
        h.doc.dispatchEvent(new h.win.Event('visibilitychange')); await flush();
        video.dispatchEvent(new h.win.Event('error'));
        assert.equal(root.classList.contains('is-video-playing'), false);
        assert(root.querySelector('img'));
        h.doc.dispatchEvent(new h.win.Event('pointerdown'));
        assert.equal(video.paused, true);
        binding.dispose();
    } finally { h.close(); }
});

test('blocked autoplay keeps the image and retries on ordinary interaction without a play button', async () => {
    const h = harness();
    try {
        const root = h.doc.querySelector('[data-loop-background]');
        const binding = h.api.bindLoopBackground(root, h.win);
        const video = root.querySelector('video');
        video.play = () => { h.counters.play++; return Promise.reject(new Error('NotAllowedError')); };
        h.observer.show(true); h.ready(video); await flush();
        assert.equal(root.classList.contains('is-video-playing'), false);
        assert.equal(root.querySelector('button'), null);
        video.play = () => { h.counters.play++; video._paused = false; return Promise.resolve(); };
        h.doc.dispatchEvent(new h.win.Event('pointerdown')); await flush(); h.playing(video);
        assert.equal(h.counters.play, 2); assert(root.classList.contains('is-video-playing'));
        binding.dispose();
    } finally { h.close(); }
});

const formMarkup = '<form action="/manage/media" data-background-video-upload><input name="operation" value="upload_video" type="hidden"><input type="file" name="file"><button type="submit">保存视频</button><p data-video-upload-status></p></form>';
function setupUpload(h, fetcher, services = {}) {
    const form = h.doc.querySelector('form');
    const input = form.querySelector('[type=file]');
    const file = new h.win.File(['video-data'], 'seamless.mp4', { type: 'video/mp4' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    h.win.fetch = fetcher;
    const binding = h.api.bindBackgroundVideoUpload(form, h.win, services);
    return { form, input, file, binding, submit() { form.dispatchEvent(new h.win.Event('submit', { bubbles: true, cancelable: true })); }, status() { return form.querySelector('[data-video-upload-status]').textContent; } };
}

test('video upload creates a local poster and uploads both together; double submit makes one request', async () => {
    const h = harness(formMarkup);
    const capture = deferred(); const requests = []; const redirects = [];
    try {
        const u = setupUpload(h, async (url, init) => {
            requests.push({ url, init }); return { ok: true, status: 200, json: async () => ({ url: '/manage/media?saved=1' }) };
        }, { capture: () => capture.promise, navigate: (url) => redirects.push(url) });
        u.submit(); u.submit(); assert.match(u.status(), /首帧/); assert.equal(requests.length, 0);
        capture.resolve(new h.win.Blob(['poster'], { type: 'image/jpeg' })); await flush();
        assert.equal(requests.length, 1);
        assert.equal(requests[0].init.credentials, 'same-origin');
        assert.equal(requests[0].init.body.get('operation'), 'upload_video');
        assert.equal(requests[0].init.body.get('file').name, 'seamless.mp4');
        assert.equal(requests[0].init.body.get('poster').name, 'video-poster.jpg');
        assert.deepEqual(redirects, ['https://example.test/manage/media?saved=1']);
        assert.equal(u.input.disabled, false);
        u.binding.dispose();
    } finally { h.close(); }
});

test('failed capture or expired login makes no redirect and restores controls', async () => {
    for (const failCapture of [true, false]) {
        const h = harness(formMarkup); const requests = []; const redirects = [];
        try {
            const u = setupUpload(h, async () => { requests.push(1); return { ok: false, status: 403 }; }, {
                capture: async () => { if (failCapture) throw new Error('首帧读取失败'); return new h.win.Blob(['poster']); },
                navigate: (url) => redirects.push(url),
            });
            u.submit(); await flush();
            assert.equal(requests.length, failCapture ? 0 : 1);
            assert.equal(redirects.length, 0);
            assert.match(u.status(), failCapture ? /首帧读取失败/ : /登录验证已过期/);
            assert.equal(u.input.disabled, false);
            assert.equal(u.input.files[0].name, 'seamless.mp4');
            u.binding.dispose();
        } finally { h.close(); }
    }
});

test('leaving the form aborts generation and ignores even an uncancellable stale response', async () => {
    const h = harness(formMarkup); const response = deferred(); const redirects = []; let signal;
    try {
        const u = setupUpload(h, (_url, init) => { signal = init.signal; return response.promise; }, {
            capture: async () => new h.win.Blob(['poster']), navigate: (url) => redirects.push(url),
        });
        u.submit(); await flush(); u.binding.dispose();
        assert.equal(signal.aborted, true);
        response.resolve({ ok: true, json: async () => ({ url: '/manage' }) }); await flush();
        assert.equal(redirects.length, 0);
        assert.equal(u.input.disabled, false);
    } finally { h.close(); }
});

test('invalid extensions, oversize files and external form actions never get submitted', async () => {
    for (const kind of ['extension', 'size', 'action']) {
        const h = harness(formMarkup); let captures = 0; let requests = 0;
        try {
            const u = setupUpload(h, async () => { requests++; }, { capture: async () => { captures++; } });
            if (kind === 'action') u.form.action = 'https://other.test/upload';
            else Object.defineProperty(u.input, 'files', { value: [{ name: kind === 'extension' ? 'bad.exe' : 'large.mp4', type: 'video/mp4', size: kind === 'size' ? 51 * 1024 * 1024 : 10 }] });
            u.submit(); await flush();
            assert.equal(captures, 0); assert.equal(requests, 0);
            assert.match(u.status(), kind === 'action' ? /地址无效/ : kind === 'size' ? /40 MB/ : /MP4/);
            u.binding.dispose();
        } finally { h.close(); }
    }
});

test('local frame capture produces a scaled JPEG and releases the object URL and decoder', async () => {
    const h = harness('');
    try {
        h.win.HTMLMediaElement.prototype.load = function () {
            if (!this.src) return;
            this._ready = 2;
            Object.defineProperty(this, 'videoWidth', { value: 3840 });
            Object.defineProperty(this, 'videoHeight', { value: 2160 });
            queueMicrotask(() => this.dispatchEvent(new h.win.Event('loadeddata')));
        };
        let drawn;
        h.win.HTMLCanvasElement.prototype.getContext = function () { return { drawImage: (...args) => { drawn = { args, width: this.width, height: this.height }; } }; };
        h.win.HTMLCanvasElement.prototype.toBlob = function (callback, type) { callback(new h.win.Blob(['jpeg'], { type })); };
        const poster = await h.api.captureBackgroundPoster(new h.win.File(['video'], 'background.webm', { type: 'video/webm' }), h.win);
        assert.equal(poster.type, 'image/jpeg');
        assert.equal(drawn.width, 1920); assert.equal(drawn.height, 1080);
        assert.equal(h.doc.querySelector('video'), null);
        assert.deepEqual(h.counters.revoked, ['blob:local-video']);
    } finally { h.close(); }
});

test('local frame capture cancellation releases resources without uploading', async () => {
    const h = harness('');
    try {
        const controller = new h.win.AbortController();
        const promise = h.api.captureBackgroundPoster(new h.win.File(['video'], 'background.mp4', { type: 'video/mp4' }), h.win, controller.signal);
        controller.abort();
        await assert.rejects(promise, { name: 'AbortError' });
        assert.equal(h.doc.querySelector('video'), null);
        assert.deepEqual(h.counters.revoked, ['blob:local-video']);
    } finally { h.close(); }
});

test('video upload protects unsaved badge edits and accepts an unchanged details form', async () => {
    const h = harness(`<form id="details"><input name="title" value="勋章"><textarea name="content">简介</textarea><select name="kind"><option>第一项</option><option>第二项</option></select></form>${formMarkup.replace('data-background-video-upload', 'data-background-video-upload data-background-video-watch-form="#details"')}`);
    let uploads = 0;
    try {
        const form = h.doc.querySelector('[data-background-video-upload]');
        const input = form.querySelector('[type=file]');
        Object.defineProperty(input, 'files', { value: [new h.win.File(['video'], 'background.mp4', { type: 'video/mp4' })] });
        h.win.fetch = async () => { uploads++; return { ok: true, status: 200, json: async () => ({ success: true, url: '/manage' }) }; };
        const binding = h.api.bindBackgroundVideoUpload(form, h.win, { capture: async () => new h.win.Blob(['poster']), navigate() {} });
        const title = h.doc.querySelector('[name=title]');
        title.value = '修改后的勋章';
        form.dispatchEvent(new h.win.Event('submit', { cancelable: true })); await flush();
        assert.equal(uploads, 0);
        assert.match(form.querySelector('[data-video-upload-status]').textContent, /先保存/);
        title.value = title.defaultValue;
        form.dispatchEvent(new h.win.Event('submit', { cancelable: true })); await flush();
        assert.equal(uploads, 1);
        binding.dispose();
    } finally { h.close(); }
});
