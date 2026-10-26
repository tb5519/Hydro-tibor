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
        let decoded = deferred();
        const state = { complete: false, width: 0, decodeCalls: 0, requests: 0 };
        const sourceAttribute = Object.getOwnPropertyDescriptor(win.HTMLImageElement.prototype, 'src');
        Object.defineProperty(image, 'src', {
            get() { return sourceAttribute.get.call(image); },
            set(value) { state.requests++; state.complete = false; state.width = 0; sourceAttribute.set.call(image, value); },
        });
        const setAttribute = image.setAttribute.bind(image);
        image.setAttribute = (name, value) => {
            if (name === 'src') { state.requests++; state.complete = false; state.width = 0; }
            return setAttribute(name, value);
        };
        Object.defineProperties(image, {
            complete: { get: () => state.complete },
            naturalWidth: { get: () => state.width },
        });
        image.decode = () => { state.decodeCalls++; return decoded.promise; };
        tile.dataset.achievementPending = '';
        if (!placeholders.includes(index)) tile.append(image);
        grid.append(tile);
        return {
            image, tile, state,
            get decoded() { return decoded; },
            nextDecode() { decoded = deferred(); return decoded; },
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

describe('complete-batch achievement wall', () => {
    it('keeps only the heading and zero count until every thumbnail has loaded and decoded', async (t) => {
        const h = fixture(3); t.after(h.close); h.bind();
        assert.equal(h.root.hasAttribute('data-achievement-wall-loading'), false);
        assert.equal(h.root.querySelector('header').hidden, false);
        assert.ok(h.pictures.every(({ image }) => image.loading === 'eager'));
        h.pictures[2].load(); h.pictures[2].decoded.resolve();
        h.pictures[1].load(); h.pictures[1].decoded.resolve();
        await h.flush(); await h.advance(500);
        assert.equal(h.count(), 0);
        assert.equal(h.visible(), 0, 'a fast image must not reveal an incomplete collection');
        assert.ok(h.grid.hasAttribute('data-achievement-grid-empty'));
        assert.equal(h.root.querySelector('[data-achievement-hint]').hidden, true);
        h.pictures[0].load(); await h.flush(); await h.advance(500);
        assert.equal(h.count(), 0, 'the last image must finish decoding before any tile appears');
        assert.equal(h.visible(), 0);
        h.pictures[0].decoded.resolve(); await h.flush(); await h.advance(0);
        assert.equal(h.count(), 1);
        assert.equal(h.pictures[0].visible(), true, 'reveal follows catalogue order, not download order');
        assert.equal(h.grid.hasAttribute('data-achievement-grid-empty'), false);
        assert.equal(h.root.querySelector('[data-achievement-hint]').hidden, false);
        await h.advance(59); assert.equal(h.count(), 1);
        await h.advance(1); assert.equal(h.count(), 2);
        await h.advance(60); assert.equal(h.count(), 3);
        assert.equal(h.root.getAttribute('aria-busy'), 'false');
    });

    it('animates the fully prepared first batch and increments its count once per tile', async (t) => {
        const h = fixture(3); t.after(h.close); h.bind();
        h.pictures.forEach((picture) => { picture.load(); picture.decoded.resolve(); });
        await h.flush(); await h.advance(0);
        assert.equal(h.count(), 1);
        assert.equal(h.pictures[0].tile.classList.contains('is-entering'), true);
        await h.advance(60);
        assert.equal(h.count(), 2);
        await h.advance(60);
        assert.equal(h.count(), 3);
        h.pictures.forEach((picture) => picture.load());
        await h.flush(); await h.advance(500);
        assert.equal(h.count(), 3, 'duplicate load events must not replay or increment the batch again');
        assert.ok(h.pictures.every(({ tile }) => !tile.classList.contains('is-entering')));
        assert.equal(h.timers.size, 0);
    });

    it('shows an entirely browser-cached wall synchronously without decoding or entry animation', (t) => {
        const h = fixture(2); t.after(h.close);
        h.pictures.forEach(({ state }) => { state.complete = true; state.width = 384; });
        const dispose = h.bind();
        assert.equal(h.bind(), dispose);
        assert.equal(h.count(), 2);
        assert.equal(h.visible(), 2);
        assert.ok(h.pictures.every(({ state, tile }) => !state.decodeCalls && !tile.classList.contains('is-entering')));
        assert.equal(h.root.getAttribute('aria-busy'), 'false');
        assert.equal(h.timers.size, 0);
    });

    it('does not show a cached subset while another thumbnail is still missing', async (t) => {
        const h = fixture(2); t.after(h.close);
        h.pictures[0].state.complete = true; h.pictures[0].state.width = 384;
        h.bind();
        assert.equal(h.count(), 0);
        assert.equal(h.visible(), 0);
        assert.equal(h.pictures[0].state.decodeCalls, 0);
        h.pictures[1].load(); h.pictures[1].decoded.resolve(); await h.flush(); await h.advance(0);
        assert.equal(h.count(), 1);
        assert.equal(h.pictures[0].tile.classList.contains('is-entering'), true);
        await h.advance(60); assert.equal(h.count(), 2);
    });

    it('restores a fully cached wall before the rest of the page widgets bind', (t) => {
        const h = fixture(2); t.after(h.close);
        h.pictures.forEach(({ state }) => { state.complete = true; state.width = 384; });
        h.install();
        h.win.document.dispatchEvent(new h.win.Event('DOMContentLoaded'));
        assert.equal(h.count(), 2);
        h.bind();
        assert.equal(h.count(), 2);
        assert.ok(h.pictures.every(({ state, tile }) => !state.decodeCalls && !tile.classList.contains('is-entering')));
    });

    it('waits for remembered images to actually load and decode, then restores the whole wall without replaying', async (t) => {
        const first = fixture(2); t.after(first.close); first.bind();
        first.pictures.forEach((picture) => { picture.load(); picture.decoded.resolve(); });
        await first.flush(); await first.advance(100);
        const restored = fixture(2, { storage: first.storage() }); t.after(restored.close); restored.bind();
        assert.equal(restored.count(), 0);
        restored.pictures[0].load();
        assert.equal(restored.count(), 0, 'history must not substitute for a still-missing sibling');
        restored.pictures[1].load();
        await restored.flush();
        assert.equal(restored.count(), 0, 'a saved success marker must not bypass this page’s unfinished decode');
        restored.pictures.forEach((picture) => picture.decoded.resolve());
        await restored.flush();
        assert.equal(restored.count(), 2);
        assert.equal(restored.visible(), 2);
        assert.ok(restored.pictures.every(({ state, tile }) => state.decodeCalls === 1 && !tile.classList.contains('is-entering')));
    });

    it('treats a replacement URL as a new batch and waits for the replacement to decode', async (t) => {
        const first = fixture(2); t.after(first.close);
        first.pictures.forEach(({ state }) => { state.complete = true; state.width = 384; }); first.bind();
        const h = fixture(2, { storage: first.storage(), urls: ['https://images.test/0.webp?v=1', 'https://images.test/1.webp?v=2'] });
        t.after(h.close); h.bind();
        h.pictures[0].load(); h.pictures[0].decoded.resolve(); h.pictures[1].load(); await h.flush(); await h.advance(500);
        assert.equal(h.visible(), 0);
        assert.equal(h.count(), 0);
        assert.equal(h.pictures[1].state.decodeCalls, 1);
        h.pictures[1].decoded.resolve(); await h.flush(); await h.advance(0);
        assert.equal(h.count(), 1);
        assert.equal(h.pictures[0].tile.classList.contains('is-entering'), true);
        await h.advance(60); assert.equal(h.count(), 2);
    });

    it('never substitutes stars or reveals a partial batch when earned artwork has not been uploaded', async (t) => {
        const h = fixture(3, { placeholders: [0, 2] }); t.after(h.close); h.bind();
        h.pictures[1].load(); h.pictures[1].decoded.resolve(); await h.flush(); await h.advance(1000);
        assert.equal(h.count(), 0);
        assert.equal(h.visible(), 0);
        assert.ok(h.grid.hasAttribute('data-achievement-grid-empty'));
        assert.equal(h.root.querySelector('.achievement-wall__placeholder'), null);
        assert.equal(h.root.querySelector('.achievement-wall__fallback-name'), null);
        const empty = fixture(0); t.after(empty.close); empty.bind();
        assert.equal(empty.count(), 0);
        assert.equal(empty.root.getAttribute('aria-busy'), 'false');
        assert.equal(empty.timers.size, 0);
    });

    it('keeps network and decode failures hidden, retries, and releases the batch only after recovery', async (t) => {
        const h = fixture(); t.after(h.close); h.bind();
        const [networkFailure, decodeFailure] = h.pictures;
        networkFailure.fail();
        decodeFailure.load(); decodeFailure.decoded.reject(new Error('corrupt image'));
        await h.flush(); await h.advance(200);
        assert.equal(h.count(), 0);
        assert.equal(h.visible(), 0);
        assert.equal(h.root.querySelector('.achievement-wall__placeholder'), null);
        assert.equal(h.root.querySelector('.achievement-wall__fallback-name'), null);
        const persisted = JSON.stringify(h.storage());
        assert.doesNotMatch(persisted, /images\.test/);
        await h.advance(1000);
        assert.ok(h.pictures.every(({ state }) => state.requests > 0), 'failed images must be retried');
        decodeFailure.nextDecode();
        networkFailure.load(); networkFailure.decoded.resolve();
        decodeFailure.load(); decodeFailure.decoded.resolve();
        await h.flush(); await h.advance(100);
        assert.equal(h.count(), 2);
        assert.equal(h.visible(), 2);
        assert.equal(h.root.querySelector('.achievement-wall__placeholder'), null);
    });

    it('removes stale success history after a previously cached image fails', async (t) => {
        const first = fixture(1); t.after(first.close);
        first.pictures[0].state.complete = true; first.pictures[0].state.width = 384; first.bind();
        const failed = fixture(1, { storage: first.storage() }); t.after(failed.close);
        failed.pictures[0].state.complete = true; failed.bind(); await failed.advance(100);
        assert.equal(failed.count(), 0);
        assert.equal(failed.visible(), 0);
        assert.equal(failed.root.querySelector('.achievement-wall__placeholder'), null);
        const retry = fixture(1, { storage: failed.storage() }); t.after(retry.close); retry.bind();
        retry.pictures[0].load(); await retry.flush();
        assert.equal(retry.count(), 0, 'failed history cannot bypass decode on the next visit');
        assert.equal(retry.pictures[0].state.decodeCalls, 1);
        retry.pictures[0].decoded.resolve(); await retry.flush(); await retry.advance(0);
        assert.equal(retry.count(), 1);
        assert.equal(retry.pictures[0].tile.classList.contains('is-entering'), true);
    });

    it('ignores an obsolete decode completion after an image retry has started', async (t) => {
        const h = fixture(2); t.after(h.close); h.bind();
        const first = h.pictures[0];
        const obsoleteDecode = first.decoded;
        first.load(); await h.flush(); first.fail(); await h.advance(1000);
        first.nextDecode(); first.load();
        h.pictures[1].load(); h.pictures[1].decoded.resolve();
        obsoleteDecode.resolve(); await h.flush(); await h.advance(100);
        assert.equal(h.count(), 0);
        assert.equal(h.visible(), 0, 'an old attempt cannot release the current batch');
        first.decoded.resolve(); await h.flush(); await h.advance(100);
        assert.equal(h.count(), 2);
    });

    it('keeps a stalled batch at zero past the timeout and accepts a genuine late completion', async (t) => {
        const h = fixture(); t.after(h.close); h.bind(8000);
        h.pictures[0].load(); await h.flush();
        await h.advance(8000); await h.advance(200);
        assert.equal(h.count(), 0);
        assert.equal(h.visible(), 0);
        assert.equal(h.root.getAttribute('aria-busy'), 'true');
        assert.equal(h.root.querySelector('.achievement-wall__placeholder'), null);
        h.pictures[0].decoded.resolve();
        h.pictures[1].load(); h.pictures[1].decoded.resolve(); await h.flush(); await h.advance(100);
        assert.equal(h.count(), 2);
        assert.equal(h.root.querySelector('.achievement-wall__placeholder'), null);
    });

    it('bounds automatic retries without ever exposing failed artwork or manufacturing loaded cache entries', async (t) => {
        const h = fixture(1); t.after(h.close); h.bind(100);
        h.pictures[0].fail();
        for (let i = 0; i < 8; i++) { await h.advance(30000); h.pictures[0].fail(); }
        await h.advance(60000);
        assert.equal(h.pictures[0].state.requests, 5);
        assert.equal(h.count(), 0);
        assert.equal(h.visible(), 0);
        assert.equal(h.timers.size, 0);
        assert.equal(h.root.querySelector('.achievement-wall__placeholder'), null);
        assert.doesNotMatch(JSON.stringify(h.storage()), /images\.test/);
    });

    it('keeps batch behavior when browser storage is blocked or malformed', async (t) => {
        for (const blocked of [true, false]) {
            const h = fixture(2, { storage: { 'hydro:achievement-wall:ready:v1': '{interrupted' } }); t.after(h.close);
            if (blocked) Object.defineProperty(h.win, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
            assert.doesNotThrow(() => h.bind());
            h.pictures[0].load(); h.pictures[0].decoded.resolve(); await h.flush(); await h.advance(100);
            assert.equal(h.count(), 0);
            h.pictures[1].load(); h.pictures[1].decoded.resolve(); await h.flush(); await h.advance(100);
            assert.equal(h.count(), 2);
        }
    });

    it('respects the full-batch barrier but skips animation for reduced motion', async (t) => {
        const h = fixture(2, { reducedMotion: true }); t.after(h.close); h.bind();
        h.pictures[0].load(); h.pictures[0].decoded.resolve(); await h.flush(); await h.advance(100);
        assert.equal(h.count(), 0);
        h.pictures[1].load(); h.pictures[1].decoded.resolve(); await h.flush(); await h.advance(0);
        assert.equal(h.count(), 2);
        assert.ok(h.pictures.every(({ tile }) => !tile.classList.contains('is-entering')));
    });

    it('cancels retries and late completions on disposal, then permits a fresh complete-batch binding', async (t) => {
        const h = fixture(2); t.after(h.close);
        const dispose = h.bind();
        h.pictures[0].load(); await h.flush(); h.pictures[1].fail();
        dispose(); dispose();
        h.pictures[0].decoded.resolve(); await h.flush(); await h.advance(100000);
        assert.equal(h.count(), 0);
        assert.equal(h.visible(), 0);
        assert.equal(h.timers.size, 0);
        assert.equal(h.pictures[1].state.requests, 0);
        h.pictures[1].state.complete = false;
        h.bind();
        assert.equal(h.count(), 0);
        h.pictures[1].load(); h.pictures[1].decoded.resolve(); await h.flush(); await h.advance(100);
        assert.equal(h.count(), 2);
    });
});
