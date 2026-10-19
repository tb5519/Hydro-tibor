const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');

const source = esbuild.transformSync(fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/components/scratchpad/themeAssets.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs', target: 'es2020',
}).code;

const tick = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

function harness() {
    const createdImages = [];
    const createdVideos = [];
    const timers = new Map();
    let now = 0;
    let nextTimer = 0;
    class MockImage {
        constructor() {
            this.complete = false;
            this.naturalWidth = 0;
            this.decodeCalls = 0;
            createdImages.push(this);
        }
        decode() {
            this.decodeCalls += 1;
            return this.decodeResult || Promise.resolve();
        }
        loaded(width = 200) {
            this.complete = true;
            this.naturalWidth = width;
            this.onload?.();
        }
        failed() { this.onerror?.(); }
    }
    class MockVideo {
        constructor() {
            this.readyState = 0;
            this.events = new Map();
            this.attributes = new Map();
            this.pauses = 0;
            this.loads = 0;
            createdVideos.push(this);
        }
        setAttribute(key, value) { this.attributes.set(key, value); }
        removeAttribute(key) { this.attributes.delete(key); if (key === 'src') this.src = ''; }
        addEventListener(key, callback) {
            if (!this.events.has(key)) this.events.set(key, new Set());
            this.events.get(key).add(callback);
        }
        removeEventListener(key, callback) { this.events.get(key)?.delete(callback); }
        emit(key) { for (const callback of this.events.get(key) || []) callback(); }
        load() { this.loads += 1; }
        pause() { this.pauses += 1; }
        loaded() { this.readyState = 2; this.emit('loadeddata'); }
    }
    const mod = { exports: {} };
    vm.runInNewContext(source, {
        module: mod, exports: mod.exports,
        Image: MockImage,
        document: { createElement(tag) { assert.equal(tag, 'video'); return new MockVideo(); } },
        setTimeout(callback, delay) {
            const id = ++nextTimer;
            timers.set(id, { callback, at: now + delay });
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
    });
    return {
        ...mod.exports, images: createdImages, videos: createdVideos, timers,
        advance(ms) {
            now += ms;
            for (const [id, timer] of timers) {
                if (timer.at <= now) { timers.delete(id); timer.callback(); }
            }
        },
    };
}

function theme(assets, extra = {}) {
    return { id: 'badge:7', badgeId: 7, assets, ...extra };
}

function image(id, url = `/${id}.png`) { return { id, url, type: 'image/png' }; }

describe('coordinated scratchpad theme asset preparation', () => {
    it('prepares assigned layers, every button variant and the poster, without fetching unassigned uploads or gallery previews', async () => {
        const h = harness();
        const selected = theme(['background', 'toolbar', 'base', 'hover', 'active', 'poster', 'unused'].map((id) => image(id)), {
            slots: { background: { assetId: 'background' }, toolbar: { assetId: 'toolbar' } },
            controls: { run: { assetId: 'base', hoverAssetId: 'hover', activeAssetId: 'active' } },
            posterAssetId: 'poster', thumbnailUrl: '/thumbnail.png', previewUrl: '/preview.png',
        });
        let done = false;
        const preparation = h.prepareScratchpadThemeAssets(selected).then((ready) => { done = true; return ready; });
        assert.deepEqual(h.images.map((entry) => entry.src).sort(), ['/background.png', '/toolbar.png', '/base.png', '/hover.png', '/active.png', '/poster.png'].sort());
        for (const entry of h.images.slice(0, -1)) entry.loaded();
        await tick();
        assert.equal(done, false, 'one outstanding asset must keep the whole theme pending');
        const last = h.images.at(-1);
        let decode;
        last.decodeResult = new Promise((resolve) => { decode = resolve; });
        last.loaded();
        await tick();
        assert.equal(done, false, 'network completion must also wait for image decoding');
        assert.equal(h.isScratchpadThemeImageReady(last.src), false);
        decode();
        assert.equal(await preparation, true);
        assert.equal(h.isScratchpadThemeImageReady(last.src), true);
        assert.equal(h.timers.size, 0);
    });

    it('shares concurrent image requests and reuses the decoded success for later switches', async () => {
        const h = harness();
        const selected = theme([image('first', '/same.png'), image('second', '/same.png')], {
            slots: { editor: { assetId: 'first' } }, controls: { run: { assetId: 'second' } },
        });
        const first = h.prepareScratchpadThemeAssets(selected);
        const second = h.prepareScratchpadThemeAssets(selected);
        assert.equal(h.images.length, 1);
        h.images[0].loaded();
        assert.equal(await first, true);
        assert.equal(await second, true);
        assert.equal(await h.prepareScratchpadThemeAssets(selected), true);
        assert.equal(h.images.length, 1);
        assert.equal(h.images[0].decodeCalls, 1);
    });

    it('accepts valid Safari images when decode rejects but never accepts a broken image', async () => {
        const h = harness();
        const selected = (id) => theme([image(id)], { slots: { background: { assetId: id } } });
        const safari = h.prepareScratchpadThemeAssets(selected('safari'));
        h.images[0].decodeResult = Promise.reject(new Error('Safari decode rejection'));
        h.images[0].loaded();
        assert.equal(await safari, true);
        const broken = h.prepareScratchpadThemeAssets(selected('broken'));
        h.images[1].loaded(0);
        assert.equal(await broken, false);
        assert.equal(h.isScratchpadThemeImageReady('/broken.png'), false);
        const retry = h.prepareScratchpadThemeAssets(selected('broken'));
        assert.equal(h.images.length, 3, 'failure must allow a real retry');
        h.images[2].loaded();
        assert.equal(await retry, true);
    });

    it('bounds stalled image/decode requests and ignores late results after timeout', async () => {
        const h = harness();
        const selected = theme([image('stalled')], { slots: { background: { assetId: 'stalled' } } });
        const pending = h.prepareScratchpadThemeAssets(selected);
        let decode;
        h.images[0].decodeResult = new Promise((resolve) => { decode = resolve; });
        h.images[0].loaded();
        h.advance(h.SCRATCHPAD_THEME_ASSET_TIMEOUT);
        assert.equal(await pending, false);
        decode();
        await tick();
        assert.equal(h.isScratchpadThemeImageReady('/stalled.png'), false);
        assert.equal(h.timers.size, 0);
        const retry = h.prepareScratchpadThemeAssets(selected);
        h.images[1].loaded();
        assert.equal(await retry, true);
    });

    it('waits for the first video frame together with artwork and transfers the prepared element once', async () => {
        const h = harness();
        const selected = theme([{ id: 'movie', type: 'video/mp4', url: '/background.mp4' }, image('poster')], {
            slots: { background: { assetId: 'movie' } }, posterAssetId: 'poster',
        });
        let done = false;
        const pending = h.prepareScratchpadThemeAssets(selected).then((ready) => { done = true; return ready; });
        h.images[0].loaded();
        await tick();
        assert.equal(done, false);
        const video = h.videos[0];
        assert.equal(video.muted, true);
        assert.equal(video.defaultMuted, true);
        assert.equal(video.playsInline, true);
        assert.equal(video.loop, true);
        assert.equal(video.preload, 'auto');
        assert.equal(video.loads, 1);
        assert.equal(h.takePreparedScratchpadVideo('/background.mp4'), undefined);
        video.loaded();
        assert.equal(await pending, true);
        assert.ok(video.pauses >= 1);
        assert.strictEqual(h.takePreparedScratchpadVideo('/background.mp4'), video);
        assert.equal(h.takePreparedScratchpadVideo('/background.mp4'), undefined);
        assert.equal(video.src, '/background.mp4', 'claim must preserve the decoded first frame');
        const second = h.prepareScratchpadThemeAssets(selected);
        assert.equal(h.videos.length, 2);
        assert.equal(h.images.length, 1);
        h.videos[1].loaded();
        assert.equal(await second, true);
    });

    it('deduplicates video loads, retries failed video requests and releases timed-out decoders', async () => {
        const h = harness();
        const selected = theme([{ id: 'movie', type: 'video/webm', url: '/movie.webm' }], { slots: { background: { assetId: 'movie' } } });
        const first = h.prepareScratchpadThemeAssets(selected);
        const concurrent = h.prepareScratchpadThemeAssets(selected);
        assert.equal(h.videos.length, 1);
        h.videos[0].emit('error');
        assert.equal(await first, false);
        assert.equal(await concurrent, false);
        assert.equal(h.videos[0].src, '');
        const stalled = h.prepareScratchpadThemeAssets(selected);
        h.advance(h.SCRATCHPAD_THEME_ASSET_TIMEOUT);
        assert.equal(await stalled, false);
        assert.equal(h.videos[1].src, '');
        const successful = h.prepareScratchpadThemeAssets(selected);
        h.videos[2].loaded();
        assert.equal(await successful, true);
        assert.equal(h.timers.size, 0);
    });

    it('limits retained video decoders and decoded image references', async () => {
        const h = harness();
        for (let i = 0; i < 5; i += 1) {
            const pending = h.prepareScratchpadThemeAssets(theme([{ id: 'movie', type: 'video/mp4', url: `/movie-${i}.mp4` }], { slots: { background: { assetId: 'movie' } } }));
            h.videos[i].loaded();
            assert.equal(await pending, true);
        }
        assert.equal(h.videos[0].src, '');
        assert.equal(h.videos[1].src, '');
        assert.equal(h.takePreparedScratchpadVideo('/movie-0.mp4'), undefined);
        assert.strictEqual(h.takePreparedScratchpadVideo('/movie-4.mp4'), h.videos[4]);
        for (let i = 0; i < 200; i += 1) {
            const pending = h.prepareScratchpadThemeAssets(theme([image(`image-${i}`)], { slots: { background: { assetId: `image-${i}` } } }));
            h.images[i].loaded();
            assert.equal(await pending, true);
        }
        assert.equal(h.isScratchpadThemeImageReady('/image-0.png'), false);
        assert.equal(h.isScratchpadThemeImageReady('/image-199.png'), true);
    });

    it('lets built-in themes finish without a browser and rejects invalid assigned references', async () => {
        const h = harness();
        assert.equal(await h.prepareScratchpadThemeAssets({ id: 'ocean' }), true);
        assert.equal(await h.prepareScratchpadThemeAssets(theme([], { controls: { run: { assetId: 'missing' } } })), false);
        assert.equal(h.images.length, 0);
        assert.equal(h.videos.length, 0);
    });
});
