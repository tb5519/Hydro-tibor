const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const code = buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/utils/background-video-warmup.ts')],
    bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const catalogResponse = (data, status = 200, contentType = 'application/json') => ({
    ok: status >= 200 && status < 300, status,
    headers: new Headers({ 'Content-Type': contentType }), json: async () => data,
});

function harness(options = {}) {
    const dom = new JSDOM(options.html || '', { url: 'https://onebyone.test/d/python/p', pretendToBeVisual: true });
    const win = dom.window; const doc = win.document;
    Object.defineProperty(win.navigator, 'connection', { value: options.connection || {}, configurable: true });
    Object.defineProperty(doc, 'readyState', { value: options.loading ? 'loading' : 'complete', configurable: true });
    Object.defineProperty(doc, 'hidden', { value: !!options.hidden, configurable: true });
    win.UiContext = { backgroundVideoWarmup: { scope: options.scope || '42:python' } };
    win.matchMedia = () => ({ matches: !!options.reduced });
    const callbacks = new Map(); let next = 1;
    win.requestIdleCallback = (callback) => { const id = next++; callbacks.set(id, callback); return id; };
    win.cancelIdleCallback = (id) => callbacks.delete(id);
    const counters = { load: 0, pause: 0, play: 0 };
    const media = win.HTMLMediaElement.prototype;
    media.load = function () { counters.load++; };
    media.pause = function () { counters.pause++; };
    media.play = function () { counters.play++; return Promise.resolve(); };
    Object.defineProperty(media, 'readyState', { get() { return this._ready || 0; } });
    const mod = { exports: {} };
    vm.runInNewContext(code, { module: mod, exports: mod.exports, URL, Date });
    const config = { scope: '42:python', items: [{ url: '/d/python/home/video?v=7', poster: '/d/python/home/video-poster?v=7' }] };
    return {
        dom, win, doc, api: mod.exports, config, counters, callbacks,
        idle() { const pending = [...callbacks.values()]; callbacks.clear(); for (const callback of pending) callback(); },
        start(value = config) { return mod.exports.startBackgroundVideoWarmup(value, win); },
        ready(video) { video._ready = 2; video.dispatchEvent(new win.Event('loadeddata')); },
        close() { win.dispatchEvent(new win.Event('pagehide')); win.close(); },
    };
}

test('background video warming waits for page load and idle; decodes without playing and records only stable scoped URLs', () => {
    const h = harness({ loading: true });
    try {
        h.start(); h.idle();
        assert.equal(h.doc.querySelector('video'), null);
        Object.defineProperty(h.doc, 'readyState', { value: 'complete', configurable: true });
        h.win.dispatchEvent(new h.win.Event('load'));
        assert.equal(h.doc.querySelector('video'), null);
        h.idle();
        const video = h.doc.querySelector('video');
        assert.equal(video.src, 'https://onebyone.test/d/python/home/video?v=7');
        assert.equal(video.poster, 'https://onebyone.test/d/python/home/video-poster?v=7');
        assert.equal(video.muted, true); assert.equal(video.autoplay, false);
        assert.equal(video.preload, 'auto'); assert.equal(video.playsInline, true);
        assert.equal(video.controls, false); assert.equal(video.getAttribute('aria-hidden'), 'true');
        assert.equal(h.counters.load, 1); assert.equal(h.counters.play, 0);
        assert.equal(h.api.hasBackgroundVideoReadyHint(h.config.items[0].url, h.win), false);
        h.ready(video);
        assert.equal(h.api.hasBackgroundVideoReadyHint(h.config.items[0].url, h.win), true);
        assert.equal(h.api.hasBackgroundVideoReadyHint('/d/python/home/video?v=8', h.win), false);
        const key = 'onebyone-background-video-ready:v1:42:python';
        assert.deepEqual(Object.keys(JSON.parse(h.win.sessionStorage.getItem(key))), [video.src]);
        h.win.UiContext.backgroundVideoWarmup.scope = '99:python';
        assert.equal(h.api.hasBackgroundVideoReadyHint(h.config.items[0].url, h.win), false, 'readiness hints do not leak between accounts');
    } finally { h.close(); }
});

test('an existing background player is reused, never paused, loaded or duplicated by warmup', () => {
    const h = harness({ html: '<div data-loop-background data-background-video-src="/d/python/home/video?v=7"><video></video></div>' });
    try {
        const video = h.doc.querySelector('video');
        const binding = h.start(); h.idle();
        assert.equal(h.doc.querySelectorAll('video').length, 1);
        assert.equal(h.counters.load, 0); assert.equal(h.counters.play, 0);
        h.ready(video);
        assert.equal(h.api.hasBackgroundVideoReadyHint(h.config.items[0].url, h.win), true);
        binding.dispose();
        assert.equal(video.isConnected, true); assert.equal(h.counters.pause, 0);
        assert.equal(h.counters.load, 0);
    } finally { h.close(); }
});

test('a recently ready video is not downloaded by another hidden warmup, while new versions still warm', () => {
    const h = harness();
    try {
        const first = h.start(); h.idle();
        const video = h.doc.querySelector('video');
        h.ready(video);
        first.dispose();
        const loads = h.counters.load;
        const second = h.start(); h.idle();
        assert.equal(h.doc.querySelector('video'), null);
        assert.equal(h.counters.load, loads, 'the readiness hint suppresses only another hidden preload');
        second.dispose();
        h.start({ ...h.config, items: [{ url: '/d/python/home/video?v=8' }] }); h.idle();
        assert.equal(h.doc.querySelector('video').src, 'https://onebyone.test/d/python/home/video?v=8');
        assert.equal(h.counters.load, loads + 1);
    } finally { h.close(); }
});

test('expired or other account/domain readiness never suppresses a new hidden warmup', () => {
    for (const kind of ['expired', 'account', 'domain']) {
        const h = harness();
        try {
            const scope = kind === 'account' ? '99:python' : kind === 'domain' ? '42:other' : h.config.scope;
            h.api.rememberBackgroundVideoReady(h.config.items[0].url, h.win, scope);
            if (kind === 'expired') {
                h.win.sessionStorage.setItem('onebyone-background-video-ready:v1:42:python', JSON.stringify({
                    'https://onebyone.test/d/python/home/video?v=7': Date.now() - 301_000,
                }));
            }
            h.start(); h.idle();
            assert.equal(h.doc.querySelectorAll('video').length, 1, kind);
            assert.equal(h.counters.load, 1, kind);
        } finally { h.close(); }
    }
});

test('a readiness hint never bypasses the visible player or its current readiness observation', () => {
    const h = harness({ html: '<div data-loop-background data-background-video-src="/d/python/home/video?v=7"><video></video></div>' });
    try {
        h.api.rememberBackgroundVideoReady(h.config.items[0].url, h.win);
        const video = h.doc.querySelector('video');
        const key = 'onebyone-background-video-ready:v1:42:python';
        const source = 'https://onebyone.test/d/python/home/video?v=7';
        const original = JSON.parse(h.win.sessionStorage.getItem(key));
        original[source] -= 60_000;
        h.win.sessionStorage.setItem(key, JSON.stringify(original));
        h.start(); h.idle();
        assert.equal(h.doc.querySelectorAll('video').length, 1);
        assert.equal(h.counters.load, 0); assert.equal(h.counters.pause, 0);
        assert.equal(h.win.sessionStorage.getItem(key), JSON.stringify(original));
        h.ready(video);
        assert.ok(JSON.parse(h.win.sessionStorage.getItem(key))[source] > original[source]);
    } finally { h.close(); }
});

test('a reserved visible wrapper is left for its player; hidden loading is capped at two videos and a duplicate start is idempotent', () => {
    const h = harness({ html: '<div data-loop-background data-background-video-src="/d/python/home/video?v=7"></div>' });
    try {
        const value = { ...h.config, items: [...h.config.items, { url: '/badge/2/background-video?v=8' }, { url: '/badge/3/background-video?v=9' }] };
        const binding = h.start(value);
        assert.equal(h.start(value), binding);
        h.idle();
        assert.equal(h.doc.querySelectorAll('video').length, 1);
        assert.match(h.doc.querySelector('video').src, /badge\/2/);
        assert.equal(h.counters.play, 0);
        binding.dispose();
        assert.equal(h.doc.querySelector('video'), null);
    } finally { h.close(); }
});

test('warming respects slow connections, save data and reduced motion; hidden pages wait until visible', () => {
    for (const options of [{ connection: { saveData: true } }, { connection: { effectiveType: 'slow-2g' } },
        { connection: { effectiveType: '2g' } }, { connection: { effectiveType: '3g' } }, { reduced: true }]) {
        const h = harness(options);
        try { h.start(); h.idle(); assert.equal(h.counters.load, 0); } finally { h.close(); }
    }
    const h = harness({ hidden: true });
    try {
        h.start(); h.idle(); assert.equal(h.counters.load, 0);
        Object.defineProperty(h.doc, 'hidden', { value: false, configurable: true });
        h.doc.dispatchEvent(new h.win.Event('visibilitychange')); h.idle();
        assert.equal(h.counters.load, 1);
    } finally { h.close(); }
});

test('external, credential-bearing and signed URLs never load or enter sessionStorage', () => {
    for (const url of ['https://cdn.test/video.mp4', 'javascript:alert(1)', 'https://name:password@onebyone.test/home/video',
        '/home/video?X-Amz-Signature=private', '/home/video?Signature=private', '/home/video?token=private']) {
        const h = harness();
        try {
            h.start({ scope: h.config.scope, items: [{ url }] }); h.idle();
            h.api.rememberBackgroundVideoReady(url, h.win);
            assert.equal(h.doc.querySelector('video'), null); assert.equal(h.win.sessionStorage.length, 0);
        } finally { h.close(); }
    }
});

test('readiness hints expire, prune malformed entries, and remain bounded at 32 entries', () => {
    const h = harness();
    try {
        const key = 'onebyone-background-video-ready:v1:42:python';
        h.win.sessionStorage.setItem(key, JSON.stringify({
            'https://onebyone.test/old?v=1': Date.now() - 301_000,
            'https://onebyone.test/future?v=1': Date.now() + 120_000,
            'https://onebyone.test/signed?Signature=secret': Date.now(),
        }));
        assert.equal(h.api.hasBackgroundVideoReadyHint('/old?v=1', h.win), false);
        for (let id = 0; id < 45; id++) h.api.rememberBackgroundVideoReady(`/badge/${id}/background-video?v=1`, h.win);
        const value = JSON.parse(h.win.sessionStorage.getItem(key));
        assert.equal(Object.keys(value).length, 32);
        assert.equal(h.api.hasBackgroundVideoReadyHint('/badge/44/background-video?v=1', h.win), true);
        assert.equal(Object.keys(value).some((url) => /Signature|old\?|future\?/.test(url)), false);
    } finally { h.close(); }
});

test('navigation cancels pending warmup and releases only owned preload videos', () => {
    const pending = harness();
    try {
        pending.start(); pending.win.dispatchEvent(new pending.win.Event('pagehide')); pending.idle();
        assert.equal(pending.counters.load, 0); assert.equal(pending.doc.querySelector('video'), null);
    } finally { pending.close(); }
    const loaded = harness();
    try {
        loaded.start(); loaded.idle();
        const video = loaded.doc.querySelector('video');
        loaded.win.dispatchEvent(new loaded.win.Event('pagehide'));
        assert.equal(video.isConnected, false); assert.equal(video.getAttribute('src'), null);
        assert.equal(loaded.counters.pause, 1); assert.equal(loaded.counters.play, 0);
    } finally { loaded.close(); }
});

test('authenticated theme catalog runs only after load and idle, while homepage warming does not wait for its response', async () => {
    const h = harness({ loading: true }); const requests = []; let resolve;
    try {
        h.win.fetch = (url, init) => { requests.push({ url, init }); return new Promise((done) => { resolve = done; }); };
        h.start({ ...h.config, catalog: '/d/python/background-video-warmup?current=1' }); h.idle();
        assert.equal(requests.length, 0);
        Object.defineProperty(h.doc, 'readyState', { value: 'complete', configurable: true });
        h.win.dispatchEvent(new h.win.Event('load'));
        assert.equal(requests.length, 0); h.idle();
        assert.equal(requests.length, 1); assert.equal(h.doc.querySelectorAll('video').length, 1);
        assert.equal(requests[0].url, 'https://onebyone.test/d/python/background-video-warmup?current=1');
        assert.equal(requests[0].init.credentials, 'same-origin'); assert.equal(requests[0].init.priority, 'low');
        assert.equal(requests[0].init.cache, 'no-store'); assert.equal(requests[0].init.headers.Accept, 'application/json');
        resolve(catalogResponse({ scope: '42:python', items: [h.config.items[0], { url: '/badge/8/background-video?v=10', poster: '/badge/8/background-video-poster?v=10' }] }));
        await flush();
        assert.equal(h.doc.querySelectorAll('video').length, 2, 'same homepage source is not downloaded twice');
        assert.equal(h.counters.load, 2); assert.equal(h.counters.play, 0);
        const badge = [...h.doc.querySelectorAll('video')].find((video) => /badge/.test(video.src));
        assert.equal(badge.poster, 'https://onebyone.test/badge/8/background-video-poster?v=10');
        h.ready(badge);
        assert.equal(h.api.hasBackgroundVideoReadyHint('/badge/8/background-video?v=10', h.win), true);
    } finally { h.close(); }
});

test('catalog-only pages preload the selected theme and reuse an already initialized profile video', async () => {
    const h = harness({ html: '<div data-loop-background data-background-video-src="/badge/8/background-video?v=10"><video src="/badge/8/background-video?v=10"></video></div>' });
    try {
        const video = h.doc.querySelector('video'); video._ready = 2;
        h.win.fetch = async () => catalogResponse({ scope: '42:python', items: [{ url: '/badge/8/background-video?v=10' }] });
        h.start({ scope: '42:python', catalog: '/background-video-warmup' }); h.idle(); await flush();
        assert.equal(h.doc.querySelectorAll('video').length, 1); assert.equal(h.counters.load, 0);
        assert.equal(h.api.hasBackgroundVideoReadyHint(video.src, h.win), true);
        h.win.dispatchEvent(new h.win.Event('pagehide'));
        assert.equal(video.isConnected, true); assert.equal(h.counters.pause, 0);
    } finally { h.close(); }
});

test('wrong scope, changed account scope and unsigned external catalog items are ignored', async () => {
    for (const kind of ['wrong-scope', 'changed-account', 'external-source', 'signed-source']) {
        const h = harness();
        try {
            const data = { scope: kind === 'wrong-scope' ? '99:python' : '42:python', items: [{
                url: kind === 'external-source' ? 'https://cdn.test/private.mp4'
                    : kind === 'signed-source' ? '/badge/8/background-video?Signature=secret' : '/badge/8/background-video?v=10',
            }] };
            h.win.fetch = async () => {
                if (kind === 'changed-account') h.win.UiContext.backgroundVideoWarmup.scope = '99:python';
                return catalogResponse(data);
            };
            h.start({ ...h.config, catalog: '/background-video-warmup' }); h.idle(); await flush();
            assert.equal(h.doc.querySelectorAll('video').length, 1);
            assert.equal(h.win.sessionStorage.length, 0);
        } finally { h.close(); }
    }
});

test('catalog failures and expired login preserve homepage preload and never surface as a page failure', async () => {
    for (const kind of ['network', 'auth', 'login-html', 'json', 'malformed']) {
        const h = harness();
        try {
            h.win.fetch = async () => {
                if (kind === 'network') throw new Error('offline');
                if (kind === 'auth') return catalogResponse({}, 403);
                if (kind === 'login-html') return catalogResponse({}, 200, 'text/html');
                if (kind === 'json') return { ...catalogResponse({}), json: async () => { throw new Error('invalid JSON'); } };
                return catalogResponse({ scope: '42:python', items: 'invalid' });
            };
            h.start({ ...h.config, catalog: '/background-video-warmup' }); h.idle(); await flush();
            assert.equal(h.doc.querySelectorAll('video').length, 1); assert.equal(h.counters.load, 1);
            assert.equal(h.counters.play, 0);
        } finally { h.close(); }
    }
});

test('catalog is never requested on slow networks, save data, reduced motion, outside origin or before idle cancellation', async () => {
    for (const options of [{ connection: { saveData: true } }, { connection: { effectiveType: '3g' } }, { reduced: true }]) {
        const h = harness(options); let requests = 0;
        try {
            h.win.fetch = async () => { requests++; return catalogResponse({}); };
            h.start({ ...h.config, catalog: '/background-video-warmup' }); h.idle(); await flush();
            assert.equal(requests, 0); assert.equal(h.counters.load, 0);
        } finally { h.close(); }
    }
    const h = harness(); let requests = 0;
    try {
        h.win.fetch = async () => { requests++; return catalogResponse({}); };
        h.start({ ...h.config, catalog: 'https://other.test/background-video-warmup' }); h.idle(); await flush();
        assert.equal(requests, 0); assert.equal(h.counters.load, 1);
    } finally { h.close(); }
    const canceled = harness();
    try {
        canceled.win.fetch = async () => { requests++; return catalogResponse({}); };
        canceled.start({ ...canceled.config, catalog: '/background-video-warmup' });
        canceled.win.dispatchEvent(new canceled.win.Event('pagehide')); canceled.idle(); await flush();
        assert.equal(requests, 0); assert.equal(canceled.counters.load, 0);
    } finally { canceled.close(); }
});

test('navigation aborts the catalog request and ignores even an uncancellable stale response', async () => {
    const h = harness(); let resolve; let signal;
    try {
        h.win.fetch = (url, init) => { signal = init.signal; return new Promise((done) => { resolve = done; }); };
        h.start({ ...h.config, catalog: '/background-video-warmup' }); h.idle();
        assert.equal(signal.aborted, false);
        h.win.dispatchEvent(new h.win.Event('pagehide'));
        assert.equal(signal.aborted, true); assert.equal(h.doc.querySelector('video'), null);
        resolve(catalogResponse({ scope: '42:python', items: [{ url: '/badge/8/background-video?v=10' }] })); await flush();
        assert.equal(h.doc.querySelector('video'), null); assert.equal(h.win.sessionStorage.length, 0);
    } finally { h.close(); }
});
