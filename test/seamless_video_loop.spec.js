const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const code = buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/utils/seamless-video-loop.ts')],
    bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const flush = () => new Promise((resolve) => setImmediate(resolve));
function harness({ supported = true, active = true } = {}) {
    const dom = new JSDOM('<div data-loop-background class="is-video-playing"><img src="/poster.jpg"><video class="loop-background__video" src="https://cdn.example.test/loop.mp4"></video></div>', {
        url: 'https://example.test/', pretendToBeVisual: true,
    });
    const win = dom.window; const root = win.document.querySelector('[data-loop-background]');
    const primary = root.querySelector('video');
    const counts = { play: [], pause: [], load: [], seek: [], switched: [] };
    const callbacks = new Map(); let nextId = 1;
    let clock = 0;
    Object.defineProperty(win.performance, 'now', { value: () => clock });
    const media = win.HTMLMediaElement.prototype;
    media.play = function () {
        counts.play.push(this);
        if (this._reject) return Promise.reject(new Error('NotAllowedError'));
        this._paused = false;
        this.dispatchEvent(new win.Event('playing'));
        return Promise.resolve();
    };
    media.pause = function () { counts.pause.push(this); this._paused = true; };
    media.load = function () { counts.load.push(this); };
    Object.defineProperties(media, {
        paused: { get() { return this._paused !== false; } },
        readyState: { get() { return this._ready || 0; } },
        duration: { get() { return this._duration || 4; } },
        currentTime: { get() { return this._time || 0; }, set(value) { counts.seek.push({ video: this, value }); this._time = value; } },
        seeking: { get() { return !!this._seeking; } },
        error: { get() { return this._error || null; } },
    });
    if (supported) {
        win.HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
            const id = nextId++; callbacks.set(id, { video: this, callback }); return id;
        };
        win.HTMLVideoElement.prototype.cancelVideoFrameCallback = (id) => callbacks.delete(id);
    }
    primary._ready = 4; primary._paused = false;
    const mod = { exports: {} };
    vm.runInNewContext(code, { module: mod, exports: mod.exports, console });
    const state = { active };
    const controller = mod.exports.createSeamlessVideoLoop(primary, win, {
        isActive: () => state.active,
        onSwitch: (next) => counts.switched.push(next),
    });
    return {
        root, primary, win, counts, callbacks, state, controller,
        get spare() { return [...root.querySelectorAll('video')].find((v) => v !== primary); },
        frame(video, time, now = clock) {
            const entry = [...callbacks].find(([, value]) => value.video === video);
            assert(entry, 'Expected an armed frame callback');
            clock = now;
            callbacks.delete(entry[0]); video._time = time;
            entry[1].callback(now, { mediaTime: time });
        },
        prime(video = this.spare) {
            video._ready = 2;
            video.dispatchEvent(new win.Event('loadeddata'));
            this.frame(video, 0);
        },
        close() { controller.dispose(); dom.window.close(); },
    };
}

test('spare decoder eagerly prepares one opening frame and remains silent without autoplay', () => {
    const h = harness();
    try {
        assert.equal(h.root.querySelectorAll('video').length, 2);
        assert.equal(h.primary.getAttribute('data-loop-current'), 'true');
        assert.equal(h.spare.hasAttribute('data-loop-current'), false);
        assert.equal(h.spare.src, h.primary.src);
        assert.equal(h.spare.preload, 'auto');
        assert.equal(h.spare.muted, true); assert.equal(h.spare.playsInline, true);
        assert.equal(h.spare.autoplay, false); assert.equal(h.spare.controls, false);
        assert.equal(h.primary.loop, true); assert.equal(h.spare.loop, true);
        assert.equal(h.counts.play.length, 0);
        assert.equal(h.counts.load.length, 0, 'Never reset the already playing decoder');
    } finally { h.close(); }
});

test('measured 4K wake-up starts the hidden decoder early but keeps the tail visible until the boundary', () => {
    const h = harness();
    try {
        const spare = h.spare; spare._ready = 2;
        spare.dispatchEvent(new h.win.Event('loadeddata'));
        h.frame(spare, 0, 130);
        assert.equal(h.counts.play.length, 1);
        h.frame(h.primary, 3.8, 3930);
        assert.equal(h.counts.play.length, 1);
        h.frame(h.primary, 3.85, 3980);
        assert.equal(h.counts.play.length, 2, 'Wake the spare before the last two frames');
        h.frame(spare, 0, 4010);
        assert.equal(h.counts.switched.length, 0, 'An early frame must not truncate the visible tail');
        assert.equal(h.primary.getAttribute('data-loop-current'), 'true');
        h.frame(h.primary, 3.98, 4110);
        h.frame(spare, 0.03, 4113);
        assert.equal(h.counts.switched[0], spare);
        assert.equal(spare.getAttribute('data-loop-current'), 'true');
    } finally { h.close(); }
});

test('adaptive wake-up is bounded to 250ms and never skips a large opening segment', () => {
    const h = harness();
    try {
        const spare = h.spare; spare._ready = 2;
        spare.dispatchEvent(new h.win.Event('loadeddata'));
        h.frame(spare, 0, 1000);
        h.frame(h.primary, 3.7, 4700);
        assert.equal(h.counts.play.length, 1, 'A slow prime must not schedule arbitrarily far ahead');
        h.frame(h.primary, 3.78, 4780);
        assert.equal(h.counts.play.length, 2);
        h.frame(spare, 0, 4790);
        assert.equal(h.counts.switched.length, 0);
        h.frame(spare, 0.1, 4890);
        assert.equal(h.counts.switched.length, 0, 'A stale opening is discarded rather than shown');
        assert.equal(h.primary.loop, true);
        assert.equal(h.primary.getAttribute('data-loop-current'), 'true');
    } finally { h.close(); }
});

test('unsupported or inactive pages retain native looping and allocate no second decoder', () => {
    for (const options of [{ supported: false }, { active: false }]) {
        const h = harness(options);
        try {
            assert.equal(h.root.querySelectorAll('video').length, 1);
            assert.equal(h.primary.loop, true);
            assert.equal(h.counts.play.length, 0);
            if (!options.active && options.active !== undefined) {
                h.state.active = true; h.controller.resume();
                assert.equal(h.root.querySelectorAll('video').length, 2);
            }
        } finally { h.close(); }
    }
});

test('handoff reveals only a real opening frame and rewinds only the hidden decoder', () => {
    const h = harness();
    try {
        const spare = h.spare;
        h.prime(spare);
        h.frame(h.primary, 3.98);
        assert.equal(h.counts.play.length, 2, 'Warmup precedes the boundary resume');
        assert.equal(h.counts.play[0], spare);
        assert.equal(h.primary.getAttribute('data-loop-current'), 'true');
        assert.equal(h.counts.switched.length, 0);
        assert.equal(h.primary.currentTime, 3.98);
        h.frame(spare, 0);
        assert.equal(spare.getAttribute('data-loop-current'), 'true');
        assert.equal(h.primary.hasAttribute('data-loop-current'), false);
        assert.equal(h.counts.switched[0], spare);
        h.frame(h.primary, 0); // Warm the now-hidden former current video.
        assert.equal(h.primary.paused, true);
        assert.equal(h.primary.currentTime, 0);
        assert.equal(spare.paused, false);
        assert.equal(h.root.classList.contains('is-video-playing'), true);
        assert.equal(h.root.querySelector('img').getAttribute('src'), '/poster.jpg');
        assert(h.counts.seek.every((entry) => entry.video !== spare));
        // Reuse the same two elements for the next boundary.
        h.frame(spare, 3.98);
        h.frame(h.primary, 0);
        assert.equal(h.root.querySelectorAll('video').length, 2);
        assert.equal(h.counts.switched[1], h.primary);
        assert.equal(spare.currentTime, 0);
    } finally { h.close(); }
});

test('unready, seeking, or unrewound spares never replace the visible decoder', () => {
    for (const overrides of [{ _ready: 1 }, { _ready: 2, _seeking: true }, { _ready: 2, _time: 0.2 }]) {
        const h = harness();
        try {
            Object.assign(h.spare, overrides);
            h.frame(h.primary, 3.98);
            assert.equal(h.counts.play.length, 0);
            assert.equal(h.counts.switched.length, 0);
            assert.equal(h.primary.getAttribute('data-loop-current'), 'true');
            assert.equal(h.primary.loop, true);
            h.frame(h.primary, 0);
            assert.equal(h.primary.getAttribute('data-loop-current'), 'true');
        } finally { h.close(); }
    }
});

test('native loop wins over a late spare; the stale frame cannot jump backwards', () => {
    const h = harness();
    try {
        const spare = h.spare; h.prime(spare);
        h.frame(h.primary, 3.98);
        const staleFrame = [...h.callbacks.values()].find((entry) => entry.video === spare).callback;
        h.frame(h.primary, 0.02);
        h.frame(spare, 0); // Re-prime the cancelled hidden decoder for a later loop.
        assert.equal(spare.paused, true);
        assert.equal(h.counts.switched.length, 0);
        staleFrame(0, { mediaTime: 0 });
        assert.equal(h.counts.switched.length, 0);
        assert.equal(h.primary.getAttribute('data-loop-current'), 'true');
    } finally { h.close(); }
});

test('autoplay rejection or spare decoding error preserves native playback without a black layer', async () => {
    const h = harness();
    try {
        const spare = h.spare; spare._ready = 2; spare._reject = true;
        spare.dispatchEvent(new h.win.Event('canplay'));
        h.frame(h.primary, 3.98); await flush();
        assert.equal(h.counts.switched.length, 0);
        assert.equal(h.primary.paused, false);
        assert.equal(h.primary.loop, true);
        assert.equal(h.primary.getAttribute('data-loop-current'), 'true');
        assert.equal(h.root.classList.contains('is-video-playing'), true);
        spare.dispatchEvent(new h.win.Event('error'));
        assert.equal(h.root.querySelectorAll('video').length, 1);
        assert.equal(h.primary.paused, false);
        assert.equal(h.primary.getAttribute('data-loop-current'), 'true');
        assert.equal(h.callbacks.size, 0);
    } finally { h.close(); }
});

test('pause cancels both decoders and callbacks; resume waits for current playback and dispose is idempotent', () => {
    const h = harness();
    try {
        const spare = h.spare; h.prime(spare);
        h.frame(h.primary, 3.98);
        const stale = [...h.callbacks.values()].map((entry) => entry.callback);
        h.state.active = false; h.controller.pause();
        assert.equal(h.primary.paused, true); assert.equal(spare.paused, true);
        assert.equal(h.callbacks.size, 0);
        stale.forEach((callback) => callback(0, { mediaTime: 0 }));
        assert.equal(h.counts.switched.length, 0);
        h.state.active = true; h.controller.resume();
        assert.equal(h.callbacks.size, 0, 'Outer player starts the visible decoder');
        h.primary.play();
        h.frame(spare, 0);
        assert.equal(h.callbacks.size, 1);
        h.controller.dispose(); h.controller.dispose();
        assert.equal(h.callbacks.size, 0);
        assert.equal(h.root.querySelectorAll('video').length, 1);
        assert.equal(h.primary.paused, true);
        h.primary.play();
        assert.equal(h.callbacks.size, 0);
    } finally { h.close(); }
});

test('a stale or delayed spare frame is never displayed after visibility changes', () => {
    const h = harness();
    try {
        h.prime();
        h.frame(h.primary, 3.98);
        h.state.active = false;
        h.frame(h.spare, 0);
        assert.equal(h.counts.switched.length, 0);
        assert.equal(h.primary.getAttribute('data-loop-current'), 'true');
        assert.equal(h.spare.paused, true);
    } finally { h.close(); }
});

test('readyState alone primes the hidden compositor but cannot switch without a presented opening frame', () => {
    const h = harness();
    try {
        const spare = h.spare; spare._ready = 4;
        spare.dispatchEvent(new h.win.Event('canplay'));
        assert.equal(h.counts.play.length, 1);
        assert.equal(spare.paused, false);
        assert.equal(spare.hasAttribute('data-loop-current'), false);
        h.frame(h.primary, 3.98);
        assert.equal(h.counts.play.length, 1, 'Cannot hand off during priming');
        assert.equal(h.counts.switched.length, 0);
        h.frame(spare, 0);
        assert.equal(spare.paused, true);
        assert.equal(h.counts.seek.length, 0, 'A presented opening frame is retained without re-seeking');
        h.frame(h.primary, 0);
        h.frame(h.primary, 3.98);
        assert.equal(h.counts.play.length, 2, 'The loop resumes the primed decoder');
        h.frame(spare, 0.016);
        assert.equal(h.counts.switched[0], spare);
    } finally { h.close(); }
});

test('priming pauses and rewinds only when the hidden clock ran beyond the opening frame', () => {
    const h = harness();
    try {
        const spare = h.spare; spare._ready = 4;
        spare.dispatchEvent(new h.win.Event('loadeddata'));
        h.frame(spare, 0.12);
        assert.equal(spare.paused, true);
        assert.equal(spare.currentTime, 0);
        assert.deepEqual(h.counts.seek.map((entry) => entry.video), [spare]);
        assert.equal(h.primary.paused, false);
        assert.equal(h.primary.getAttribute('data-loop-current'), 'true');
    } finally { h.close(); }
});

test('in-flight priming is cancelled on pause/dispose and stale frames never restart either decoder', () => {
    const h = harness();
    try {
        const spare = h.spare; spare._ready = 4;
        spare.dispatchEvent(new h.win.Event('seeked'));
        const stalePrime = [...h.callbacks.values()].find((entry) => entry.video === spare).callback;
        h.controller.pause();
        assert.equal(h.callbacks.size, 0);
        assert.equal(h.primary.paused, true); assert.equal(spare.paused, true);
        stalePrime(0, { mediaTime: 0 });
        assert.equal(h.counts.switched.length, 0);
        h.controller.resume(); h.primary.play();
        assert([...h.callbacks.values()].some((entry) => entry.video === spare));
        h.controller.dispose();
        assert.equal(h.callbacks.size, 0);
        assert.equal(h.root.querySelectorAll('video').length, 1);
        stalePrime(0, { mediaTime: 0 });
        assert.equal(h.callbacks.size, 0);
    } finally { h.close(); }
});
