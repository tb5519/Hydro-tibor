const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../packages/ui-default/components/achievement_wall.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function deferred() {
    let resolve; let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function fixture(count = 2, { storage = {}, urls = [], placeholders = [], reducedMotion = false } = {}) {
    const dom = new JSDOM('<section data-achievement-wall aria-busy="true"><header>成就墙 <strong data-achievement-count>0</strong> / 50</header><p class="achievement-wall__intro">每一次突破，都在这里闪耀</p><div class="achievement-wall__grid" data-achievement-grid-empty></div><p data-achievement-hint hidden>悬停或点按图片，查看成就故事</p></section>', { url: 'https://school.test/', runScripts: 'outside-only' });
    const win = dom.window;
    const root = win.document.querySelector('section');
    const grid = root.querySelector('.achievement-wall__grid');
    const frames = new Map();
    const timers = new Map();
    let nextId = 0; let now = 1770000000000;
    win.Date.now = () => now;
    win.performance.now = () => now;
    win.matchMedia = () => ({ matches: reducedMotion });
    win.requestAnimationFrame = (callback) => { frames.set(++nextId, callback); return nextId; };
    win.cancelAnimationFrame = (id) => frames.delete(id);
    win.setTimeout = (callback, delay = 0) => { timers.set(++nextId, { callback, delay, at: now + delay }); return nextId; };
    win.clearTimeout = (id) => timers.delete(id);
    Object.entries(storage).forEach(([key, value]) => win.localStorage.setItem(key, value));
    const pictures = Array.from({ length: count }, (_, index) => {
        const tile = win.document.createElement('button');
        tile.dataset.achievementTile = ''; tile.dataset.name = `成就 ${index + 1}`;
        const image = win.document.createElement('img');
        image.src = urls[index] || `https://images.test/${index}.webp?v=1`;
        image.loading = 'lazy';
        const decoded = deferred();
        const state = { complete: false, width: 0, decodeCalls: 0 };
        Object.defineProperties(image, {
            complete: { get: () => state.complete },
            naturalWidth: { get: () => state.width },
        });
        image.decode = () => { state.decodeCalls++; return decoded.promise; };
        if (placeholders.includes(index)) {
            const placeholder = win.document.createElement('span');
            placeholder.className = 'achievement-wall__placeholder'; placeholder.textContent = '✦';
            tile.append(placeholder);
        } else {
            tile.dataset.achievementPending = '';
            tile.append(image);
        }
        grid.append(tile);
        return {
            image, tile, state, decoded,
            visible: () => !tile.hasAttribute('data-achievement-pending'),
            load() { state.width = 384; state.complete = true; image.dispatchEvent(new win.Event('load')); },
            fail() { state.width = 0; state.complete = true; image.dispatchEvent(new win.Event('error')); },
        };
    });
    const exports = {};
    new win.Function('exports', source)(exports);
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    const paint = () => {
        const current = Array.from(frames.values()); frames.clear();
        current.forEach((callback) => callback(now));
    };
    return {
        win, root, grid, pictures, timers,
        bind: (timeout) => exports.prepareAchievementWall(root, timeout),
        install: () => exports.installAchievementWallReadiness(win.document),
        flush, paint,
        async advance(ms) {
            const until = now + ms;
            for (;;) {
                const next = Array.from(timers.entries()).filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                now = next[1].at; timers.delete(next[0]); next[1].callback();
                await flush(); paint();
            }
            now = until; await flush(); paint();
        },
        count: () => Number(root.querySelector('[data-achievement-count]').textContent),
        visible: () => pictures.filter((picture) => picture.visible()).length,
        storage: () => Object.fromEntries(Object.keys(win.localStorage).map((key) => [key, win.localStorage.getItem(key)])),
        close: () => win.close(),
    };
}

describe('progressive achievement wall', () => {
    it('keeps the heading available and reveals each decoded thumbnail without waiting for a slow sibling', async (t) => {
        const h = fixture(3); t.after(h.close); h.bind();
        assert.equal(h.root.hasAttribute('data-achievement-wall-loading'), false);
        assert.equal(h.root.querySelector('header').hidden, false);
        assert.equal(h.count(), 0);
        assert.equal(h.visible(), 0);
        assert.ok(h.grid.hasAttribute('data-achievement-grid-empty'));
        assert.ok(h.pictures.every(({ image }) => image.loading === 'eager'));
        const [, fast, next] = h.pictures;
        fast.load(); await h.flush(); await h.advance(100);
        assert.equal(h.visible(), 0, 'loading an image must still wait for its own decode');
        fast.decoded.resolve(); await h.flush(); await h.advance(100);
        assert.equal(fast.visible(), true);
        assert.equal(h.pictures[0].visible(), false, 'the slow image must remain out of the grid');
        assert.equal(h.count(), 1);
        assert.equal(h.grid.hasAttribute('data-achievement-grid-empty'), false);
        assert.equal(h.root.querySelector('[data-achievement-hint]').hidden, false);
        next.load(); next.decoded.resolve(); await h.flush(); await h.advance(100);
        assert.equal(h.count(), 2);
        assert.equal(h.root.getAttribute('aria-busy'), 'true');
        h.pictures[0].load(); h.pictures[0].decoded.resolve(); await h.flush(); await h.advance(100);
        assert.equal(h.count(), 3);
        assert.equal(h.root.getAttribute('aria-busy'), 'false');
    });

    it('increments the count as a ready batch enters quickly one tile at a time', async (t) => {
        const h = fixture(3); t.after(h.close); h.bind();
        h.pictures.forEach((picture) => { picture.load(); picture.decoded.resolve(); });
        await h.flush(); await h.advance(0);
        assert.equal(h.count(), 1);
        assert.equal(h.pictures[0].tile.classList.contains('is-entering'), true);
        await h.advance(59);
        assert.equal(h.count(), 1);
        await h.advance(1);
        assert.equal(h.count(), 2);
        await h.advance(60);
        assert.equal(h.count(), 3);
        assert.equal(h.root.getAttribute('aria-busy'), 'false');
    });

    it('shows browser-cached thumbnails synchronously without decoding, waiting, or entry animation', (t) => {
        const h = fixture(2); t.after(h.close);
        h.pictures.forEach(({ state }) => { state.complete = true; state.width = 384; });
        const dispose = h.bind();
        assert.equal(h.bind(), dispose);
        assert.equal(h.count(), 2);
        assert.equal(h.visible(), 2);
        assert.ok(h.pictures.every(({ state, tile }) => !state.decodeCalls && !tile.classList.contains('is-entering')));
        assert.equal(h.root.getAttribute('aria-busy'), 'false');
    });

    it('restores cached thumbnails at DOM readiness before the rest of the page widgets bind', async (t) => {
        const h = fixture(2); t.after(h.close);
        h.pictures[0].state.complete = true; h.pictures[0].state.width = 384;
        h.install();
        h.win.document.dispatchEvent(new h.win.Event('DOMContentLoaded'));
        assert.equal(h.count(), 1);
        assert.equal(h.pictures[0].state.decodeCalls, 0);
        assert.equal(h.pictures[0].tile.classList.contains('is-entering'), false);
        h.bind();
        h.pictures[1].load(); h.pictures[1].decoded.resolve(); await h.flush(); await h.advance(100);
        assert.equal(h.count(), 2, 'later widget initialization must reuse the early binding');
        assert.equal(h.pictures[1].state.decodeCalls, 1);
    });

    it('restores previously loaded URL versions on another page without replaying and treats changed versions as new', async (t) => {
        const first = fixture(1); t.after(first.close); first.bind();
        first.pictures[0].load(); first.pictures[0].decoded.resolve(); await first.flush(); await first.advance(100);
        const storage = first.storage();
        assert.ok(Object.keys(storage).length, 'successful downloads should be remembered across page loads');
        const restored = fixture(2, { storage, urls: ['https://images.test/0.webp?v=1', 'https://images.test/0.webp?v=2'] });
        t.after(restored.close); restored.bind();
        assert.equal(restored.pictures[0].visible(), false, 'a remembered URL cannot substitute for bytes missing from the browser cache');
        assert.equal(restored.count(), 0);
        restored.pictures[0].load();
        assert.equal(restored.pictures[0].visible(), true);
        assert.equal(restored.pictures[0].tile.classList.contains('is-entering'), false);
        assert.equal(restored.pictures[0].state.decodeCalls, 0);
        assert.equal(restored.count(), 1);
        assert.equal(restored.pictures[1].visible(), false, 'a changed artwork URL must load before entering');
        restored.pictures[1].load(); restored.pictures[1].decoded.resolve(); await restored.flush(); await restored.advance(100);
        assert.equal(restored.count(), 2);
    });

    it('immediately counts image-less achievements and handles an empty wall without pending work', (t) => {
        const h = fixture(3, { placeholders: [0, 2] }); t.after(h.close); h.bind();
        assert.equal(h.count(), 2);
        assert.equal(h.visible(), 2);
        assert.ok(h.pictures.filter((_, i) => i !== 1).every(({ tile }) => !tile.classList.contains('is-entering')));
        const empty = fixture(0); t.after(empty.close); empty.bind();
        assert.equal(empty.count(), 0);
        assert.equal(empty.root.getAttribute('aria-busy'), 'false');
        assert.equal(empty.timers.size, 0);
    });

    it('reveals named fallbacks for network and decode errors without marking failed images as loaded', async (t) => {
        const h = fixture(); t.after(h.close); h.bind();
        const [networkFailure, decodeFailure] = h.pictures;
        networkFailure.fail();
        decodeFailure.load(); decodeFailure.decoded.reject(new Error('corrupt image'));
        await h.flush(); await h.advance(200);
        assert.equal(h.count(), 2);
        for (const [i, { image, tile }] of h.pictures.entries()) {
            assert.equal(image.hidden, true);
            assert.equal(tile.querySelector('.achievement-wall__fallback-name').textContent, `成就 ${i + 1}`);
        }
        const retry = fixture(2, { storage: h.storage() }); t.after(retry.close); retry.bind();
        assert.equal(retry.visible(), 0);
        assert.equal(retry.count(), 0);
    });

    it('invalidates remembered success if the image has failed before the next binding', async (t) => {
        const first = fixture(1); t.after(first.close);
        first.pictures[0].state.complete = true; first.pictures[0].state.width = 384; first.bind();
        const failed = fixture(1, { storage: first.storage() }); t.after(failed.close);
        failed.pictures[0].state.complete = true; failed.bind(); await failed.advance(100);
        assert.equal(failed.count(), 1);
        assert.equal(failed.pictures[0].image.hidden, true);
        const retry = fixture(1, { storage: failed.storage() }); t.after(retry.close); retry.bind();
        assert.equal(retry.visible(), 0);
    });

    it('bounds stalled downloads and decodes and ignores late events after showing fallbacks', async (t) => {
        const h = fixture(); t.after(h.close); h.bind(8000);
        h.pictures[0].load(); await h.flush();
        await h.advance(8000); await h.advance(200);
        assert.equal(h.count(), 2);
        assert.equal(h.root.getAttribute('aria-busy'), 'false');
        assert.ok(h.pictures.every(({ image, tile }) => image.hidden && tile.querySelector('.achievement-wall__placeholder')));
        h.pictures[0].decoded.resolve(); h.pictures[1].load(); await h.flush(); await h.advance(100);
        assert.ok(h.pictures.every(({ image }) => image.hidden));
        assert.equal(h.root.querySelectorAll('.achievement-wall__fallback-name').length, 2);
        const retry = fixture(2, { storage: h.storage() }); t.after(retry.close); retry.bind();
        assert.equal(retry.visible(), 0);
    });

    it('continues progressive loading when browser storage is unavailable', async (t) => {
        const h = fixture(1); t.after(h.close);
        Object.defineProperty(h.win, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
        assert.doesNotThrow(() => h.bind());
        h.pictures[0].load(); h.pictures[0].decoded.resolve(); await h.flush(); await h.advance(100);
        assert.equal(h.count(), 1);
        assert.equal(h.pictures[0].image.hidden, false);
    });

    it('recovers from malformed saved cache data without hiding the wall', (t) => {
        const h = fixture(1, { storage: { 'hydro:achievement-wall:ready:v1': '{interrupted' } }); t.after(h.close);
        h.pictures[0].state.complete = true; h.pictures[0].state.width = 384;
        assert.doesNotThrow(() => h.bind());
        assert.equal(h.count(), 1);
        assert.equal(h.pictures[0].state.decodeCalls, 0);
        assert.equal(h.pictures[0].tile.classList.contains('is-entering'), false);
    });

    it('does not animate fresh arrivals when reduced motion is requested', async (t) => {
        const h = fixture(2, { reducedMotion: true }); t.after(h.close); h.bind();
        h.pictures.forEach((picture) => { picture.load(); picture.decoded.resolve(); });
        await h.flush(); await h.advance(200);
        assert.equal(h.count(), 2);
        assert.ok(h.pictures.every(({ tile }) => !tile.classList.contains('is-entering')));
    });

    it('cancels pending work on disposal and permits a fresh binding', async (t) => {
        const h = fixture(2); t.after(h.close);
        const dispose = h.bind();
        h.pictures[0].load(); await h.flush();
        dispose(); dispose();
        h.pictures[0].decoded.resolve(); await h.flush(); await h.advance(10000);
        assert.equal(h.count(), 0);
        assert.equal(h.timers.size, 0);
        assert.equal(h.pictures[1].image.hidden, false);
        h.bind();
        assert.equal(h.count(), 1, 'a new binding may immediately use the now-cached thumbnail');
        assert.equal(h.pictures[1].visible(), false);
    });
});
