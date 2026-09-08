const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { it } = require('node:test');
const { PNG } = require('pngjs');
const { BadgeAcImageCache } = require('../addons/badge-for-hydrooj/ac_image_cache');

let fixtures = {};
let cache;
let cacheCalls = 0;
class Handler {
    constructor(domain, query = {}) {
        this.domain = domain;
        this.ctx = {};
        this.request = { query };
        this.response = { headers: {}, addHeader(name, value) { this.headers[name] = value; } };
    }
}
class NotFoundError extends Error {}
const badgeModel = {
    async badgeGet(ctx, id, domainId) {
        return (fixtures.badges || []).find((badge) => badge._id === id && badge.domainId === domainId) || null;
    },
};
const storageStub = {
    async getMeta(filename) { return fixtures.images[filename]?.meta || null; },
    async get(filename) { return fixtures.images[filename]?.bytes; },
};
const previousHydro = global.Hydro;
const originalLoad = Module._load;
let addon;
try {
    global.Hydro = { model: { userBadge: {}, badge: badgeModel, user: {} } };
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/addons/badge-for-hydrooj/index.ts')) {
            if (request === 'hydrooj') {
                return { Handler, NotFoundError, param: () => () => {}, PRIV: {}, PERM: {}, STATUS: {}, Types: {} };
            }
            if (request === 'hydrooj/src/model/storage') return storageStub;
            if (request === 'hydrooj/src/model/workspace') {
                return { LEGACY_WORKSPACE_ID: 'tang', resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang' };
            }
            if (request.startsWith('hydrooj/src/')) return {};
            if (request === './ac_image_cache') {
                return {
                    badgeAcImageCache: {
                        get(...args) {
                            cacheCalls++;
                            return cache.get(...args);
                        },
                    },
                };
            }
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    addon = require('../addons/badge-for-hydrooj/index');
} finally {
    Module._load = originalLoad;
    global.Hydro = previousHydro;
}

async function setup(test) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hydro-badge-handler-test-'));
    test.after(() => fs.rm(directory, { recursive: true, force: true }));
    cache = new BadgeAcImageCache(directory);
    cacheCalls = 0;
    const data = Buffer.alloc(1000 * 1000 * 4, 128);
    const bytes = PNG.sync.write({ width: 1000, height: 1000, data });
    fixtures = {
        badges: [
            { _id: 1, acImagePath: 'global.png', acImageUpdatedAt: 'v1' },
            { _id: 2, domainId: 'A', acImagePath: 'A.png', acImageUpdatedAt: 'v1' },
        ],
        images: Object.fromEntries(['global.png', 'A.png'].map((filename) => [filename, {
            bytes, meta: { size: bytes.length, 'Content-Type': 'image/png', etag: 'original-etag' },
        }])),
    };
}

it('returns the original unchanged without a size or with non-whitelisted sizes', async (test) => {
    await setup(test);
    const handler = new addon.BadgeAcImageHandler({ _id: 'Python' });
    await handler.get('Python', 1);
    assert.strictEqual(handler.response.body, fixtures.images['global.png'].bytes);
    assert.equal(handler.response.type, 'image/png');
    const arbitrary = new addon.BadgeAcImageHandler({ _id: 'Python' });
    await arbitrary.get('Python', 1, 999);
    assert.strictEqual(arbitrary.response.body, fixtures.images['global.png'].bytes);
    assert.equal(cacheCalls, 0);
});

it('returns real 384/768 PNGs with transparency and immutable caching only for the matching version', async (test) => {
    await setup(test);
    for (const size of [384, 768]) {
        const handler = new addon.BadgeAcImageHandler({ _id: 'A', workspaceId: 'teacher' }, { v: 'v1' });
        await handler.get('A', 2, size); // eslint-disable-line no-await-in-loop
        const png = PNG.sync.read(handler.response.body);
        assert.deepEqual([png.width, png.height, png.data[3]], [size, size, 128]);
        assert.equal(handler.response.type, 'image/png');
        assert.equal(handler.response.headers['Cache-Control'], 'public, max-age=604800, immutable');
    }
    const stale = new addon.BadgeAcImageHandler({ _id: 'A', workspaceId: 'teacher' }, { v: 'old-version' });
    await stale.get('A', 2, 384);
    assert.equal(stale.response.headers['Cache-Control'], 'public, max-age=60');
});

it('checks badge domain ownership before accessing a warm cache, so global IDs cannot leak into a modern domain', async (test) => {
    await setup(test);
    const globalHandler = new addon.BadgeAcImageHandler({ _id: 'Python' }, { v: 'v1' });
    await globalHandler.get('Python', 1, 384);
    assert.equal(cacheCalls, 1);
    const modern = new addon.BadgeAcImageHandler({ _id: 'A', workspaceId: 'teacher' }, { v: 'v1' });
    await assert.rejects(modern.get('A', 1, 384), NotFoundError);
    const sibling = new addon.BadgeAcImageHandler({ _id: 'B', workspaceId: 'teacher' }, { v: 'v1' });
    await assert.rejects(sibling.get('B', 2, 384), NotFoundError);
    assert.equal(cacheCalls, 1);
});

it('falls back to the original content type without invoking a PNG decoder for non-PNG metadata', async (test) => {
    await setup(test);
    fixtures.images['global.png'].meta['Content-Type'] = 'image/webp';
    const handler = new addon.BadgeAcImageHandler({ _id: 'Python' }, { v: 'v1' });
    await handler.get('Python', 1, 384);
    assert.strictEqual(handler.response.body, fixtures.images['global.png'].bytes);
    assert.equal(handler.response.type, 'image/webp');
    assert.equal(cacheCalls, 0);
});

it('preserves the original on malformed PNG/worker failures and avoids an immutable fallback response', async (test) => {
    await setup(test);
    const original = Buffer.from('invalid PNG bytes');
    fixtures.images['global.png'].bytes = original;
    fixtures.images['global.png'].meta.size = original.length;
    const handler = new addon.BadgeAcImageHandler({ _id: 'Python' }, { v: 'v1' });
    await handler.get('Python', 1, 384);
    assert.strictEqual(handler.response.body, original);
    assert.equal(handler.response.headers['Cache-Control'], 'public, max-age=60');
});
