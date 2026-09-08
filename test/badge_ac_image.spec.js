const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { describe, it } = require('node:test');
const { PNG } = require('pngjs');
const { BadgeAcImageCache, resizeBadgeAcPng } = require('../addons/badge-for-hydrooj/ac_image_cache');
const { getBadgeAcDisplayUrl } = require('../packages/hydrooj/src/lib/badge_image');

function artwork(width, height, alpha = 128) {
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            data[offset] = 245;
            data[offset + 1] = 176;
            data[offset + 2] = 55;
            data[offset + 3] = x < width / 4 ? 0 : alpha;
        }
    }
    return PNG.sync.write({ width, height, data });
}

async function withCache(test, run) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hydro-badge-image-test-'));
    test.after(() => fs.rm(directory, { recursive: true, force: true }));
    return run(new BadgeAcImageCache(directory), directory);
}

describe('badge AC display image worker', () => {
    it('scales square artwork to 384/768 and keeps transparent PNG pixels', async () => {
        const source = artwork(1000, 1000);
        for (const size of [384, 768]) {
            const output = await resizeBadgeAcPng(source, size); // eslint-disable-line no-await-in-loop
            const png = PNG.sync.read(output);
            assert.equal(png.width, size);
            assert.equal(png.height, size);
            assert.equal(png.data[3], 0);
            assert.deepEqual([...png.data.subarray((size / 2) * 4, (size / 2) * 4 + 4)], [245, 176, 55, 128]);
        }
    });

    it('preserves a rectangular image aspect ratio and never upscales a small original', async () => {
        const wide = PNG.sync.read(await resizeBadgeAcPng(artwork(1200, 600), 384));
        assert.deepEqual([wide.width, wide.height], [384, 192]);
        const small = PNG.sync.read(await resizeBadgeAcPng(artwork(64, 32), 768));
        assert.deepEqual([small.width, small.height], [64, 32]);
    });

    it('does not create dark halos at semi-transparent edges', async () => {
        const source = artwork(1001, 997);
        const output = PNG.sync.read(await resizeBadgeAcPng(source, 384));
        for (let i = 0; i < output.data.length; i += 4) {
            if (output.data[i + 3] > 0) assert.deepEqual([...output.data.subarray(i, i + 3)], [245, 176, 55]);
        }
    });

    it('rejects invalid/oversized/interlaced PNGs and non-whitelisted sizes before expensive decoding', async () => {
        await assert.rejects(resizeBadgeAcPng(Buffer.from('not a png'), 384));
        await assert.rejects(resizeBadgeAcPng(Buffer.alloc(8 * 1024 * 1024 + 1), 384));
        const huge = Buffer.from(artwork(1, 1));
        huge.writeUInt32BE(100000, 16);
        await assert.rejects(resizeBadgeAcPng(huge, 384));
        const interlaced = Buffer.from(artwork(1, 1));
        interlaced[28] = 1;
        await assert.rejects(resizeBadgeAcPng(interlaced, 384));
        await assert.rejects(resizeBadgeAcPng(artwork(1, 1), 1024));
    });

    it('rejects animated PNG chunks so display resizing never silently strips animation', async () => {
        const source = artwork(1, 1);
        const animationControl = Buffer.alloc(20);
        animationControl.writeUInt32BE(8, 0);
        animationControl.write('acTL', 4, 'ascii');
        const animated = Buffer.concat([source.subarray(0, 33), animationControl, source.subarray(33)]);
        await assert.rejects(resizeBadgeAcPng(animated, 384));
    });

    it('keeps the parent event loop responsive while decoding/resampling larger artwork', async () => {
        const source = artwork(2048, 2048);
        let ticks = 0;
        const timer = setInterval(() => ticks++, 5);
        try {
            await resizeBadgeAcPng(source, 384);
        } finally {
            clearInterval(timer);
        }
        assert(ticks >= 3, `Event-loop ticks while Worker was busy: ${ticks}`);
    });
});

describe('badge AC display cache and fallback', () => {
    it('deduplicates simultaneous loads and persists across cache instances', async (test) => withCache(test, async (cache, directory) => {
        const png = artwork(1000, 1000);
        let loads = 0;
        const source = {
            path: 'badge/1/original.png', version: 'v1', size: png.length,
            load: async () => {
                loads++;
                return Readable.from([png]);
            },
        };
        const outputs = await Promise.all(Array.from({ length: 6 }, () => cache.get(source, 384)));
        assert.equal(loads, 1);
        assert(outputs.every((output) => output && output.equals(outputs[0])));
        assert.equal((await fs.readdir(directory)).filter((name) => name.endsWith('.png')).length, 1);
        const another = new BadgeAcImageCache(directory);
        const hit = await another.get({ ...source, load: async () => { throw new Error('Must not load source'); } }, 384);
        assert(hit.equals(outputs[0]));
    }));

    it('uses separate path/version/size cache keys and never alters the source bytes', async (test) => withCache(test, async (cache, directory) => {
        const png = artwork(1000, 500);
        const original = Buffer.from(png);
        let loads = 0;
        const source = {
            path: '../../original.png', version: 'v1', size: png.length,
            load: async () => {
                loads++;
                return png;
            },
        };
        await cache.get(source, 384);
        await cache.get({ ...source, version: 'v2' }, 384);
        await cache.get({ ...source, path: 'other.png' }, 384);
        await cache.get(source, 768);
        assert.equal(loads, 4);
        assert(png.equals(original));
        assert((await fs.readdir(directory)).every((name) => /^[a-f0-9]{64}\.png$/.test(name)));
    }));

    it('serializes different tasks without loading their original PNGs in parallel', async (test) => withCache(test, async (cache) => {
        const png = artwork(1000, 500);
        let active = 0;
        let maxActive = 0;
        const outputs = await Promise.all([1, 2, 3].map((id) => cache.get({
            path: `badge/${id}/original.png`, version: 'v1', size: png.length,
            load: async () => {
                active++;
                maxActive = Math.max(maxActive, active);
                await new Promise((resolve) => setTimeout(resolve, 10));
                active--;
                return png;
            },
        }, 384)));
        assert.equal(maxActive, 1);
        assert(outputs.every(Boolean));
    }));

    it('returns null and suppresses repeated invalid input for original-image fallback', async (test) => withCache(test, async (cache) => {
        let loads = 0;
        const source = {
            path: 'invalid.png', version: 'v1', size: 10,
            load: async () => {
                loads++;
                return Buffer.from('invalid');
            },
        };
        assert.equal(await cache.get(source, 384), null);
        assert.equal(await cache.get(source, 384), null);
        assert.equal(loads, 1);
        assert.equal(await cache.get({ ...source, size: 9 * 1024 * 1024 }, 384), null);
        assert.equal(await cache.get(source, 1000), null);
        assert.equal(loads, 1);
    }));

    it('does not load or resize while another Hydro process owns the disk lock', async (test) => withCache(test, async (cache, directory) => {
        await fs.writeFile(path.join(directory, '.resize.lock'), 'another-process');
        const result = await cache.get({ path: 'busy.png', version: 'v1', size: 10,
            load: async () => { throw new Error('Must not load while globally busy'); } }, 384);
        assert.equal(result, null);
        assert.equal(await fs.readFile(path.join(directory, '.resize.lock'), 'utf8'), 'another-process');
    }));

    it('bounds bytes actually read even if storage metadata understates the upload size', async (test) => withCache(test, async (cache) => {
        const stream = Readable.from([Buffer.alloc(8 * 1024 * 1024), Buffer.alloc(1)]);
        assert.equal(await cache.get({ path: 'oversized.png', version: 'v1', size: 1, load: async () => stream }, 384), null);
        assert(stream.destroyed);
    }));

    it('caps pending tasks at eight and falls back without reading overflow sources', async (test) => withCache(test, async (cache) => {
        const png = artwork(10, 10);
        let release;
        const blocked = new Promise((resolve) => { release = resolve; });
        let signalOverflow;
        const overflow = new Promise((resolve) => { signalOverflow = resolve; });
        let reads = 0;
        let misses = 0;
        const requests = Array.from({ length: 12 }, (_, id) => cache.get({
            path: `${id}.png`, version: 'v1', size: png.length,
            load: async () => {
                reads++;
                await blocked;
                return png;
            },
        }, 384).then((result) => {
            if (!result && ++misses === 4) signalOverflow();
            return result;
        }));
        const timer = setTimeout(() => signalOverflow(), 1000);
        try {
            await overflow;
            assert.equal(misses, 4);
            assert(reads <= 1);
        } finally {
            clearTimeout(timer);
            release();
        }
        assert.equal((await Promise.all(requests)).filter(Boolean).length, 8);
        assert.equal(reads, 8);
    }));

    it('times out stalled sources and releases the lock/queue for future work', async (test) => withCache(test, async (cache, directory) => {
        const started = Date.now();
        assert.equal(await cache.get({ path: 'stalled.png', version: 'v1', size: 10, load: () => new Promise(() => {}) }, 384), null);
        assert(Date.now() - started < 6000);
        assert(!(await fs.readdir(directory)).includes('.resize.lock'));
        const png = artwork(10, 10);
        assert(await cache.get({ path: 'healthy.png', version: 'v1', size: png.length, load: async () => png }, 384));
    }));
});

describe('shared badge AC display URL', () => {
    it('is domain-scoped, versioned, uses only the two dimensions, and has no URL for missing artwork', () => {
        const badge = { _id: 7, acImagePath: 'private-storage.png', acImageUpdatedAt: 'a & b' };
        assert.equal(getBadgeAcDisplayUrl('C++', badge), '/d/C%2B%2B/badge/7/ac-image?size=384&v=a%20%26%20b');
        assert.equal(getBadgeAcDisplayUrl('Python', badge, 768), '/d/Python/badge/7/ac-image?size=768&v=a%20%26%20b');
        assert.equal(getBadgeAcDisplayUrl('Python', badge, 500), '/d/Python/badge/7/ac-image?size=384&v=a%20%26%20b');
        assert.equal(getBadgeAcDisplayUrl('Python', { _id: 7 }), '');
    });
});
