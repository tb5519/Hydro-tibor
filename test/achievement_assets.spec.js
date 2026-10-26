const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const source = buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/components/achievement_assets.ts')],
    bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const thumbnail = (id, version = 'a') => `/d/system/achievement/${id}/image?size=384&v=${version}`;
const original = (id, version = 'a') => `/d/system/achievement/${id}/image?v=${version}`;
const absolute = (url) => new URL(url, 'https://oj.test/').href;
function deferred() {
    let resolve; let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function fixture({ loading = false, html = '' } = {}) {
    const dom = new JSDOM(html, { url: 'https://oj.test/d/system/', runScripts: 'outside-only' });
    const win = dom.window;
    Object.defineProperty(win.document, 'readyState', { value: loading ? 'loading' : 'complete', configurable: true });
    let now = 1770000000000; let nextId = 0;
    const timers = new Map();
    win.Date.now = () => now;
    win.setTimeout = (callback, delay = 0) => { timers.set(++nextId, { callback, at: now + delay }); return nextId; };
    win.clearTimeout = (id) => timers.delete(id);
    const images = [];
    win.Image = function Image() {
        const image = win.document.createElement('img');
        const decode = deferred();
        const state = { complete: false, width: 0, decodeCalls: 0 };
        Object.defineProperties(image, {
            complete: { get: () => state.complete },
            naturalWidth: { get: () => state.width },
        });
        image.decode = () => { state.decodeCalls++; return decode.promise; };
        images.push({
            image, decode, state,
            load() { state.complete = true; state.width = 384; image.dispatchEvent(new win.Event('load')); },
            fail() { state.complete = true; state.width = 0; image.dispatchEvent(new win.Event('error')); },
            ready() { this.load(); decode.resolve(); },
        });
        return image;
    };
    const module = { exports: {} };
    vm.runInNewContext(source, { module, exports: module.exports, URL, Promise });
    return {
        win, images, timers,
        start: (config) => module.exports.startAchievementAssetWarmup(config, win),
        history: () => JSON.parse(win.localStorage.getItem('hydro:achievement-wall:ready:v1') || '[]'),
        ready() {
            Object.defineProperty(win.document, 'readyState', { value: 'interactive', configurable: true });
            win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
        },
        async advance(ms) {
            const until = now + ms;
            for (;;) {
                const next = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                now = next[1].at; timers.delete(next[0]); next[1].callback(); await flush();
            }
            now = until; await flush();
        },
        close() { win.dispatchEvent(new win.Event('pagehide')); win.close(); },
    };
}

describe('achievement asset preloading', () => {
    it('allows only same-origin versioned achievement image URLs and gives thumbnails high priority', async (t) => {
        const h = fixture(); t.after(h.close);
        const good = thumbnail('difficulty-2');
        h.start({
            achievementThumbnailPreload: [good, absolute(good), `${good}#ignored`,
                'https://outside.test/d/system/achievement/a/image?size=384&v=1',
                'https://name:password@oj.test/d/system/achievement/a/image?size=384&v=1',
                '/d/system/achievement/a/image?size=384', `${thumbnail('a')}&signature=secret`,
                '/unrelated/image?size=384&v=a', original('wrong-size'), 'data:image/png,abc', 'javascript:alert(1)', null],
            achievementImagePreload: [original('difficulty-3'), thumbnail('wrong-kind'), '/d/system/achievement/a/image'],
        });
        assert.deepEqual(h.images.map(({ image }) => image.src), [absolute(good), absolute(original('difficulty-3'))]);
        assert.equal(h.images[0].image.fetchPriority, 'high');
        assert.equal(h.images[1].image.fetchPriority, 'auto');
        assert.ok(h.images.every(({ image }) => image.loading === 'eager' && image.decoding === 'async'));
        h.images.forEach((entry) => entry.ready()); await flush();
        assert.deepEqual(h.history(), [absolute(good)], 'only thumbnails become wall readiness hints');
    });

    it('prioritizes the current visible wall and holds thumbnail concurrency at six through decode', async (t) => {
        const visible = thumbnail('award-9');
        const h = fixture({ html: `<section data-achievement-wall><button data-achievement-tile><img src="${visible}"></button></section>` });
        t.after(h.close);
        const config = { achievementThumbnailPreload: Array.from({ length: 10 }, (_, i) => thumbnail(`award-${i}`)) };
        h.start(config);
        assert.equal(h.images.length, 6);
        assert.equal(h.images[0].image.src, absolute(visible));
        h.images[0].load(); await flush();
        assert.equal(h.images.length, 6, 'a pending decode keeps its slot');
        assert.deepEqual(h.history(), []);
        h.images[0].decode.resolve(); await flush();
        assert.equal(h.images.length, 7);
        assert.deepEqual(h.history(), [absolute(visible)]);
        h.start(config);
        assert.equal(h.images.length, 7, 'duplicate initialization reuses in-flight and completed URLs');
        h.images[1].ready(); await flush(); assert.equal(h.images.length, 8);
        h.images[2].ready(); await flush(); assert.equal(h.images.length, 9);
        h.images[3].ready(); await flush(); assert.equal(h.images.length, 10);
        h.images.slice(4).forEach((entry) => entry.ready()); await flush();
        assert.equal(h.history().length, 10);
        assert.equal(h.timers.size, 0);
    });

    it('defers original artwork until DOM readiness, caps candidates at six and loads at most two at once', async (t) => {
        const h = fixture({ loading: true }); t.after(h.close);
        const urls = Array.from({ length: 10 }, (_, i) => original(`award-${i}`));
        h.start({ achievementImagePreload: [urls[0], ...urls] });
        assert.equal(h.images.length, 0);
        h.ready();
        assert.equal(h.images.length, 2);
        assert.ok(h.images.every(({ image }) => image.fetchPriority === 'auto'));
        for (let i = 0; i < 6; i++) {
            h.images[i].ready(); await flush();
            assert.equal(h.images.length, Math.min(6, i + 3));
        }
        assert.deepEqual(h.images.map(({ image }) => image.src), urls.slice(0, 6).map(absolute));
        assert.deepEqual(h.history(), []);
    });

    it('shares one versioned cache entry while viewing different users and reloads only new image versions', async (t) => {
        const h = fixture(); t.after(h.close);
        const config = { achievementThumbnailPreload: [thumbnail('same')], achievementImagePreload: [original('same')] };
        const binding = h.start({ ...config, profileUid: 19 });
        assert.equal(h.start({ ...config, profileUid: 42 }), binding);
        assert.equal(h.images.length, 2);
        h.images.forEach((entry) => entry.ready()); await flush();
        h.start({ ...config, profileUid: 99 });
        assert.equal(h.images.length, 2);
        h.start({ achievementThumbnailPreload: [thumbnail('same', 'b')] });
        assert.equal(h.images.length, 3);
        assert.equal(h.images[2].image.src, absolute(thumbnail('same', 'b')));
        assert.deepEqual(h.history(), [absolute(thumbnail('same'))]);
    });

    it('isolates failed downloads and corrupt decodes so other images can continue and failures never become ready hints', async (t) => {
        const h = fixture(); t.after(h.close);
        const config = { achievementThumbnailPreload: Array.from({ length: 8 }, (_, i) => thumbnail(`award-${i}`)) };
        h.start(config);
        h.images[0].fail(); assert.equal(h.images.length, 7);
        h.images[1].load(); h.images[1].decode.reject(new Error('corrupt image')); await flush();
        assert.equal(h.images.length, 8);
        h.images.slice(2).forEach((entry) => entry.ready()); await flush();
        assert.deepEqual(h.history(), config.achievementThumbnailPreload.slice(2).map(absolute));
        h.start(config); assert.equal(h.images.length, 8, 'rapid rerenders must not retry a broken image repeatedly');
        await h.advance(30000);
        h.start(config); assert.equal(h.images.length, 10, 'a later visit may retry a transient failure');
    });

    it('releases stalled slots after thirty seconds without touching the wall or accepting a late decode', async (t) => {
        const visible = thumbnail('visible');
        const h = fixture({ html: `<section data-achievement-wall><button data-achievement-tile><img src="${visible}"></button></section>` });
        t.after(h.close);
        const wallImage = h.win.document.querySelector('img');
        h.start({ achievementThumbnailPreload: Array.from({ length: 6 }, (_, i) => thumbnail(`award-${i}`)) });
        assert.equal(h.images.length, 6);
        h.images[0].load(); await flush();
        await h.advance(29999); assert.equal(h.images.length, 6);
        await h.advance(1); assert.equal(h.images.length, 7);
        assert.equal(wallImage.getAttribute('src'), visible);
        assert.equal(h.images[0].image.getAttribute('src'), null);
        h.images[0].decode.resolve(); await flush();
        assert.deepEqual(h.history(), []);
        h.images[6].ready(); await flush();
        assert.equal(h.history().length, 1);
    });

    it('cleans up in-flight work on navigation and can initialize again without stale success callbacks', async (t) => {
        const h = fixture(); t.after(h.close);
        const config = { achievementThumbnailPreload: [thumbnail('one')], achievementImagePreload: [original('two')] };
        const binding = h.start(config);
        h.images[0].load(); await flush();
        binding.dispose(); binding.dispose();
        assert.equal(h.timers.size, 0);
        assert.ok(h.images.every(({ image }) => image.onload === null && image.onerror === null && !image.getAttribute('src')));
        h.images[0].decode.resolve(); await flush();
        assert.deepEqual(h.history(), []);
        assert.notEqual(h.start(config), binding);
        assert.equal(h.images.length, 4);
    });

    it('keeps pending work across the back-forward cache and marks thumbnails only after successful decode', async (t) => {
        const h = fixture(); t.after(h.close);
        h.start({ achievementThumbnailPreload: [thumbnail('one')] });
        h.win.dispatchEvent(new h.win.PageTransitionEvent('pagehide', { persisted: true }));
        assert.ok(h.images[0].image.src);
        h.images[0].load(); await flush(); assert.deepEqual(h.history(), []);
        h.images[0].decode.resolve(); await flush();
        assert.deepEqual(h.history(), [absolute(thumbnail('one'))]);
    });

    it('accepts missing initial context and storage restrictions without blocking later valid preloading', async (t) => {
        const h = fixture(); t.after(h.close);
        assert.doesNotThrow(() => h.start(undefined));
        h.start({ achievementThumbnailPreload: 'not-an-array', achievementImagePreload: {} });
        assert.equal(h.images.length, 0);
        Object.defineProperty(h.win, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
        h.start({ achievementThumbnailPreload: [thumbnail('later')] });
        h.images[0].ready(); await flush();
        assert.equal(h.timers.size, 0);
        h.start({ achievementThumbnailPreload: [thumbnail('later')] });
        assert.equal(h.images.length, 1);
    });
});
