const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
function load(relative, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, relative), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, URL, Date, console, setTimeout, clearTimeout,
        require: (name) => { if (!(name in dependencies)) throw Error(name); return dependencies[name]; },
    });
    return module.exports;
}
const access = load('packages/hydrooj/src/lib/decorative_image_access.ts');
const { getBadgeAcDisplayUrl } = load('packages/hydrooj/src/lib/badge_image.ts');
const { getImageWarmupPage } = load('packages/hydrooj/src/lib/image_prewarm.ts', {
    './badge_image': { getBadgeAcDisplayUrl }, '../model/workspace': {
        resolveDomainWorkspaceId: (domain) => domain.workspaceId || 'tang', LEGACY_WORKSPACE_ID: 'tang',
    },
});
it('allows only GET/HEAD selected-poster routes and exact current-domain raster storage paths', () => {
    assert.equal(access.isHomePosterImageRequest('/home/poster', 'get'), true);
    assert.equal(access.isHomePosterImageRequest('/home/poster', 'HEAD'), true);
    for (const request of [['/home/poster', 'POST'], ['/home/poster/x', 'GET'], ['/image-warmup', 'GET'], ['/badge/1/background', 'GET']]) {
        assert.equal(access.isHomePosterImageRequest(...request), false);
    }
    assert.equal(access.isPublicHomePosterPath('class-a', 'domain/class-a/home-poster-123.png'), true);
    for (const value of ['domain/class-b/home-poster-123.png', 'user/1/.avatar.png', 'domain/class-a/private.png',
        'domain/class-a/home-poster-123.svg', 'domain/class-a/home-poster-123.png/../secret', 'domain/class-a/home-poster-123.png?x']) {
        assert.equal(access.isPublicHomePosterPath('class-a', value), false);
    }
});
it('catalog skips guest queries, batches active metadata, pages and strips private fields within the exact badge scope', async () => {
    const calls = [];
    const rows = Array.from({ length: 9 }, (_, index) => ({ _id: index + 1, backgroundImagePath: `badge/${index}/profile-background.png`,
        backgroundImageUpdatedAt: 'version-1', acImagePath: index ? '' : 'badge/1/ac.png', users: [42], title: 'private title' }));
    const ctx = { db: { collection: (name) => ({ find(query) {
        const call = { name, query }; calls.push(call);
        return { project(value) { call.projection = value; return this; }, sort(value) { call.sort = value; return this; },
            limit(value) { call.limit = value; return this; }, async toArray() {
                return name === 'badge' ? rows : rows.slice(0, 8).map((r) => ({ path: r.backgroundImagePath, size: 100 }));
            } };
    } }) } };
    assert.equal((await getImageWarmupPage(ctx, { _id: 'class-a', workspaceId: 'workspace-a' }, 0)).items.length, 0);
    assert.equal(calls.length, 0);
    const result = await getImageWarmupPage(ctx, { _id: 'class-a', workspaceId: 'workspace-a' }, 42, 3);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].query.domainId, 'class-a');
    assert.equal(calls[0].query._id.$gt, 3);
    assert.equal(calls[0].limit, 9);
    assert.equal(calls[1].query.autoDelete, null);
    assert.equal(result.items.length, 8);
    assert.equal(result.next, 8);
    assert.deepEqual(Object.keys(result.items[0]).sort(), ['size', 'url']);
    assert.match(result.items[0].url, /^\/d\/class-a\/badge\/1\/background\?v=version-1$/);
    assert.equal(JSON.stringify(result).includes('private title'), false);
    calls.length = 0;
    await getImageWarmupPage(ctx, { _id: 'system' }, 42);
    assert.equal(calls[0].query.domainId.$exists, false, 'legacy catalog never includes modern domain badges');
});
const { startImageWarmup } = load('packages/ui-default/utils/image-warmup.ts');
function environment(options = {}) {
    const requests = []; const listeners = {}; const store = new Map();
    const env = {
        fetch: async (url) => {
            requests.push(url);
            return { ok: true, headers: new Headers({ 'Content-Type': 'image/png', 'Content-Length': '3' }),
                arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
        },
        AbortController, navigator: { connection: options.connection || {} }, document: { hidden: !!options.hidden, readyState: options.loading ? 'loading' : 'complete' },
        location: { href: 'https://onebyone.test/d/system/login', origin: 'https://onebyone.test' },
        addEventListener: (name, fn) => { listeners[name] = fn; }, requestIdleCallback: (fn) => setTimeout(fn, 0),
        setTimeout, clearTimeout, sessionStorage: { getItem: (key) => store.get(key), setItem: (key, value) => store.set(key, value) },
    };
    return { env, requests, listeners, store };
}
const settle = () => new Promise((done) => setTimeout(done, 30));
it('warms public poster before page load/login and reuses versioned HTTP-cache entries across subsequent pages', async () => {
    const f = environment({ loading: true });
    const config = { poster: '/d/system/home/poster?v=1', backgrounds: ['/components/profile/backgrounds/1.jpg'], scope: '0:system' };
    startImageWarmup(config, f.env);
    await settle();
    assert.deepEqual(f.requests, ['https://onebyone.test/d/system/home/poster?v=1']);
    assert.equal(typeof f.listeners.load === 'function', true);
    f.listeners.load(); await settle();
    assert.equal(f.requests.length, 2);
    f.env.document.readyState = 'complete';
    startImageWarmup(config, f.env); await settle();
    assert.equal(f.requests.length, 2, 'recently completed versioned images are not fetched again');
    startImageWarmup({ ...config, poster: '/d/system/home/poster?v=2' }, f.env); await settle();
    assert.equal(f.requests.length, 3, 'a changed version warms immediately');
    for (const value of f.store.values()) assert.equal(value.includes('auth_key'), false);
});
it('respects mobile save-data, slow networks, hidden pages and navigation cancellation', async () => {
    for (const options of [{ connection: { saveData: true } }, { connection: { effectiveType: '2g' } }, { hidden: true }]) {
        const f = environment(options);
        startImageWarmup({ poster: '/home/poster' }, f.env); await settle();
        assert.equal(f.requests.length, 0);
    }
    const f = environment({ connection: { effectiveType: '3g' } });
    startImageWarmup({ poster: '/home/poster', backgrounds: ['/1.jpg'], catalog: '/image-warmup' }, f.env); await settle();
    assert.equal(f.requests.length, 1, '3g warms only the poster');
    const g = environment(); startImageWarmup({ poster: '/home/poster' }, g.env); g.listeners.pagehide(); await settle();
    assert.equal(g.requests.length, 0);
});
