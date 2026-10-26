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

function fixture(count = 2) {
    const dom = new JSDOM('<section data-achievement-wall data-achievement-wall-loading aria-busy="true"></section>', { runScripts: 'outside-only' });
    const win = dom.window;
    const root = win.document.querySelector('section');
    const frames = new Map();
    const timers = new Map();
    let nextId = 0;
    win.requestAnimationFrame = (callback) => { frames.set(++nextId, callback); return nextId; };
    win.cancelAnimationFrame = (id) => frames.delete(id);
    win.setTimeout = (callback, delay) => { timers.set(++nextId, { callback, delay }); return nextId; };
    win.clearTimeout = (id) => timers.delete(id);
    const pictures = Array.from({ length: count }, (_, index) => {
        const tile = win.document.createElement('button');
        tile.dataset.achievementTile = ''; tile.dataset.name = `成就 ${index + 1}`;
        const image = win.document.createElement('img');
        image.src = `https://images.test/${index}.webp`;
        image.loading = 'lazy';
        const decoded = deferred();
        const state = { complete: false, width: 0, decodeCalls: 0 };
        Object.defineProperties(image, {
            complete: { get: () => state.complete },
            naturalWidth: { get: () => state.width },
        });
        image.decode = () => { state.decodeCalls++; return decoded.promise; };
        tile.append(image); root.append(tile);
        return {
            image, tile, state, decoded,
            load() { state.width = 384; state.complete = true; image.dispatchEvent(new win.Event('load')); },
            fail() { state.complete = true; image.dispatchEvent(new win.Event('error')); },
        };
    });
    const exports = {};
    new win.Function('exports', source)(exports);
    return {
        win, root, pictures, timers,
        bind: () => exports.prepareAchievementWall(root),
        async flush() { await new Promise((resolve) => setImmediate(resolve)); },
        paint() {
            for (let i = 0; i < 2; i++) {
                const current = Array.from(frames.values()); frames.clear();
                current.forEach((callback) => callback());
            }
        },
        expire() { Array.from(timers.values()).forEach(({ callback }) => callback()); },
        isLoading: () => root.hasAttribute('data-achievement-wall-loading'),
        close: () => win.close(),
    };
}

describe('achievement wall thumbnail readiness', () => {
    it('waits for every thumbnail and its decode before revealing one complete wall', async (t) => {
        const h = fixture(); t.after(h.close); h.bind();
        assert.ok(h.pictures.every(({ image }) => image.loading === 'eager'));
        const [first, second] = h.pictures;
        first.load(); first.decoded.resolve(); await h.flush(); h.paint();
        assert.equal(h.isLoading(), true);
        second.load(); await h.flush(); h.paint();
        assert.equal(h.isLoading(), true);
        second.decoded.resolve(); await h.flush();
        assert.equal(h.isLoading(), true);
        h.paint();
        assert.equal(h.isLoading(), false);
        assert.equal(h.root.getAttribute('aria-busy'), 'false');
        assert.equal(h.root.classList.contains('is-ready'), true);
        assert.equal(h.timers.size, 0);
    });

    it('also decodes cached images and binds each wall only once', async (t) => {
        const h = fixture(1); t.after(h.close);
        const picture = h.pictures[0];
        picture.state.complete = true; picture.state.width = 384;
        const dispose = h.bind();
        assert.equal(h.bind(), dispose);
        await h.flush(); h.paint();
        assert.equal(picture.state.decodeCalls, 1);
        assert.equal(h.isLoading(), true);
        picture.decoded.resolve(); await h.flush(); h.paint();
        assert.equal(h.isLoading(), false);
    });

    it('creates the named fallback before revealing a failed or corrupt image', async (t) => {
        const h = fixture(); t.after(h.close); h.bind();
        const [networkFailure, decodeFailure] = h.pictures;
        networkFailure.fail();
        assert.equal(networkFailure.image.hidden, true);
        assert.equal(networkFailure.tile.querySelector('.achievement-wall__fallback-name').textContent, '成就 1');
        assert.equal(h.isLoading(), true);
        decodeFailure.load(); decodeFailure.decoded.reject(new Error('corrupt image')); await h.flush();
        assert.equal(decodeFailure.image.hidden, true);
        assert.equal(decodeFailure.tile.querySelector('.achievement-wall__fallback-name').textContent, '成就 2');
        h.paint();
        assert.equal(h.isLoading(), false);
    });

    it('handles errors that completed before binding and reveals empty walls immediately', (t) => {
        const failed = fixture(1); t.after(failed.close);
        failed.pictures[0].state.complete = true;
        failed.bind(); failed.paint();
        assert.equal(failed.isLoading(), false);
        assert.equal(failed.pictures[0].image.hidden, true);
        const empty = fixture(0); t.after(empty.close); empty.bind();
        assert.equal(empty.isLoading(), false);
        assert.equal(empty.root.getAttribute('aria-busy'), 'false');
        assert.equal(empty.timers.size, 0);
    });

    it('bounds stalled downloads and decodes without later replacing visible fallbacks', async (t) => {
        const h = fixture(); t.after(h.close); h.bind();
        h.pictures[0].load(); await h.flush();
        assert.equal(Array.from(h.timers.values())[0].delay, 8000);
        h.expire(); h.paint();
        assert.equal(h.isLoading(), false);
        assert.ok(h.pictures.every(({ image, tile }) => image.hidden && tile.querySelector('.achievement-wall__placeholder')));
        h.pictures[0].decoded.resolve(); h.pictures[1].load(); await h.flush();
        assert.ok(h.pictures.every(({ image }) => image.hidden));
        assert.equal(h.root.querySelectorAll('.achievement-wall__fallback-name').length, 2);
    });

    it('cancels pending work on disposal and permits a fresh binding', async (t) => {
        const h = fixture(1); t.after(h.close);
        const dispose = h.bind();
        h.pictures[0].load(); await h.flush();
        dispose(); dispose();
        h.pictures[0].decoded.resolve(); await h.flush(); h.paint();
        assert.equal(h.isLoading(), true);
        assert.equal(h.timers.size, 0);
        h.bind(); await h.flush(); h.paint();
        assert.equal(h.isLoading(), false);
    });
});
