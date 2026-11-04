const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
function load(filename, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, filename), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, { module, exports: module.exports, URL, Buffer, Blob,
        require: (name) => dependencies[name] || require(name) });
    return module.exports;
}
const media = load('packages/hydrooj/src/lib/media_cache.ts');
const source = (changes = {}) => ({ path: 'user/8/.avatar.png', meta: {
    size: 10, etag: 'revision-one', 'Content-Type': 'image/png', ...changes,
} });
const handler = (changes = {}) => ({
    user: { _id: 8 }, session: { _id: 'not-exposed-session-token', updateAt: 'yesterday' },
    request: { method: 'get', headers: {}, originalPath: '/d/class/file/8/.avatar.png', querystring: '', query: {} },
    response: { headers: {}, addHeader(name, value) { this.headers[name] = value; } }, ...changes,
});
function binaryRequest(h, asset = source(), range) {
    h.request.headers = range ? { range } : {};
    h.request.query = { __media_version: media.mediaCacheVersion(asset), __media_scope: media.mediaCacheScope(h) };
    h.response.body = Buffer.from('0123456789');
    return h;
}
async function bytes(body) {
    if (Buffer.isBuffer(body)) return body;
    const chunks = [];
    for await (const chunk of body) chunks.push(chunk);
    return Buffer.concat(chunks);
}

test('metadata identity changes on replacement, metadata revisions, source and generated size', () => {
    const asset = source();
    const before = media.mediaCacheVersion(asset);
    assert.match(before, /^[a-f0-9]{64}$/);
    for (const changed of [source({ etag: 'revision-two' }), source({ size: 11 }),
        source({ lastModified: '2026-11-04T00:00:00Z' }), { ...asset, path: 'user/9/.avatar.png' },
        { ...asset, variant: 'badge-ac-png-area-v1-384' }]) {
        assert.notEqual(media.mediaCacheVersion(changed), before);
    }
    const remote = { key: `media/v1/${'a'.repeat(64)}.png`, sha256: 'b'.repeat(64), size: 10,
        contentType: 'image/png', bucket: 'example', region: 'region' };
    assert.notEqual(media.mediaCacheVersion(source({ remoteAsset: remote })),
        media.mediaCacheVersion(source({ remoteAsset: { ...remote, key: `media/v1/${'c'.repeat(64)}.png` } })));
});

test('only trusted raster image, audio and video metadata is eligible', () => {
    for (const invalid of [null, {}, source({ size: 0 }), source({ size: NaN }),
        source({ etag: '', lastModified: 'invalid' }), source({ 'Content-Type': 'text/html' }),
        { ...source(), path: 'user/8/project.sb3' }, { ...source({ 'Content-Type': 'image/svg+xml' }), path: 'user/8/icon.svg' },
        { ...source(), path: '../private.png' }, { ...source(), path: 'user/8/file.png?evil' },
        source({ remoteAsset: { key: 'untrusted', size: 10, contentType: 'image/png' } })]) {
        assert.equal(media.mediaCacheVersion(invalid), '');
    }
    for (const [extension, type] of [['mp3', 'audio/mpeg'], ['wav', 'audio/wav'], ['mp4', 'video/mp4'], ['webm', 'video/webm']]) {
        assert.match(media.mediaCacheVersion({ path: `user/8/file.${extension}`, meta: source({ 'Content-Type': type }).meta }), /^[a-f0-9]{64}$/);
    }
});

test('scope separates login sessions and accounts but ignores session activity timestamps', () => {
    const h = handler();
    const scope = media.mediaCacheScope(h);
    h.session.updateAt = 'today';
    assert.equal(media.mediaCacheScope(h), scope);
    h.session._id = 'second-session';
    assert.notEqual(media.mediaCacheScope(h), scope);
    h.session._id = 'not-exposed-session-token';
    h.user._id = 9;
    assert.notEqual(media.mediaCacheScope(h), scope);
    assert.equal(media.mediaCacheScope(handler({ user: { _id: 1 } })), media.mediaCacheScope(handler({ user: { _id: 0 } })));
});

test('generic local attachments support additional raster, audio and video formats without MIME mismatches', () => {
    for (const [extension, type] of [
        ['bmp', 'image/bmp'], ['aac', 'audio/aac'], ['flac', 'audio/flac'], ['mov', 'video/quicktime'],
        ['ogv', 'video/ogg'], ['ogg', 'audio/ogg'], ['ogg', 'video/ogg'], ['webm', 'audio/webm'], ['webm', 'video/webm'],
    ]) {
        const asset = { path: `user/8/lesson.${extension}`, meta: source({ 'Content-Type': type }).meta };
        const version = media.mediaCacheVersion(asset);
        assert.match(version, /^[a-f0-9]{64}$/, `${extension}: ${type}`);
        assert.notEqual(version, media.mediaCacheVersion({ ...asset, meta: { ...asset.meta, etag: 'replacement' } }));
        assert.equal(media.mediaCacheVersion({ ...asset, meta: { ...asset.meta, 'Content-Type': 'text/html' } }), '');
        assert.equal(media.mediaCacheVersion({ ...asset, meta: { ...asset.meta, 'Content-Type': 'image/png' } }), '');
        const h = handler();
        h.request.headers['x-hydro-media-cache'] = 'resolve-v1';
        assert(media.respondMediaCache(h, asset));
        assert.equal(h.response.body.mediaCache.type, type);
        assert.equal(h.response.body.mediaCache.version, version);
        assert(new URL(h.response.body.mediaCache.url, 'https://onebyone.test').searchParams.has('__media_version'));
    }
});

test('resolve returns bounded metadata without bytes, credential material or redirect', () => {
    const h = handler();
    h.request.headers['x-hydro-media-cache'] = 'resolve-v1';
    h.response.redirect = '/old-target';
    h.response.etag = 'old';
    h.request.querystring = 'v=existing&noDisposition=true';
    assert(media.respondMediaCache(h, source()));
    assert.equal(h.response.status, 200);
    assert.equal(h.response.redirect, null);
    assert.equal(h.response.etag, null);
    assert.equal(h.response.type, 'application/json');
    assert.equal(h.response.headers['Cache-Control'], 'private, no-store');
    assert.equal(h.response.headers.Vary, 'Cookie, Authorization, X-Hydro-Media-Cache');
    const descriptor = h.response.body.mediaCache;
    assert.deepEqual(Object.keys(descriptor).sort(), ['scope', 'size', 'type', 'url', 'version']);
    const url = new URL(descriptor.url, 'https://onebyone.test');
    assert.equal(url.pathname, '/d/class/file/8/.avatar.png');
    assert.equal(url.searchParams.get('v'), 'existing');
    assert.equal(url.searchParams.get('__media_version'), descriptor.version);
    assert.equal(url.searchParams.get('__media_scope'), descriptor.scope);
    assert.equal(JSON.stringify(h.response.body).includes(h.session._id), false);
});

test('ordinary methods and unsafe assets retain their original handler behavior', () => {
    const h = handler();
    assert.equal(media.respondMediaCache(h, source()), false);
    h.request.headers['x-hydro-media-cache'] = 'resolve-v1';
    h.request.method = 'post';
    assert.equal(media.respondMediaCache(h, source()), false);
    h.request.method = 'get';
    assert.equal(media.respondMediaCache(h, source({ 'Content-Type': 'application/octet-stream' })), false);
});

test('descriptors preserve validated attachment names without permitting injected response headers', () => {
    const h = handler();
    h.request.headers['x-hydro-media-cache'] = 'resolve-v1';
    h.response.disposition = 'attachment; filename="lesson.png"';
    assert(media.respondMediaCache(h, source()));
    assert.equal(h.response.body.mediaCache.contentDisposition, 'attachment; filename="lesson.png"');
    assert.equal(h.response.disposition, null, 'Metadata itself must not download as an attachment');
    assert(media.respondMediaCache(h, { ...source(), contentDisposition: 'attachment\r\nInjected: value' }));
    assert.equal(h.response.body.mediaCache.contentDisposition, undefined);
});

test('stale versions and other sessions are rejected before any original bytes are read', () => {
    const h = binaryRequest(handler());
    assert.equal(media.validateMediaCacheRequest(h, source()), false);
    assert.equal(h.response.headers['Cache-Control'], 'private, no-store');
    assert.equal(media.validateMediaCacheRequest(h, source({ etag: 'new-file' })), true);
    assert.equal(h.response.status, 409);
    assert(!h.response.body.mediaCache);
    const other = binaryRequest(handler());
    other.session._id = 'new-login';
    assert(media.validateMediaCacheRequest(other, source()));
    assert.equal(other.response.status, 409);
});

test('successful versioned bytes have a one year private cache while errors and mutable URLs do not', () => {
    const h = binaryRequest(handler());
    assert(media.setMediaCacheHeaders(h, source()));
    assert.equal(h.response.headers['Cache-Control'], 'private, max-age=31536000, immutable');
    assert.equal(h.response.headers['Content-Length'], '10');
    assert.equal(h.response.headers.ETag, `"${media.mediaCacheVersion(source())}"`);
    for (const fail of [handler(), binaryRequest(handler())]) {
        fail.response.status = 500;
        assert.equal(media.setMediaCacheHeaders(fail, source()), false);
        assert.equal(fail.response.headers['Cache-Control'], undefined);
    }
});

test('local range, suffix, open-ended and If-Range responses match metadata and bytes', async () => {
    for (const [range, expected] of [['bytes=2-5', '2345'], ['bytes=-3', '789'], ['bytes=7-', '789'], ['bytes=1-99', '123456789']]) {
        const h = binaryRequest(handler(), source(), range);
        assert(media.setMediaCacheHeaders(h, source()));
        assert.equal(h.response.status, 206);
        assert.equal((await bytes(h.response.body)).toString(), expected);
        assert.equal(+h.response.headers['Content-Length'], expected.length);
    }
    const h = binaryRequest(handler(), source(), 'bytes=2-5');
    h.request.headers['if-range'] = '"stale"';
    media.setMediaCacheHeaders(h, source());
    assert.equal(h.response.status, undefined);
    assert.equal(h.response.body.toString(), '0123456789');
});

test('a handler-verified immutable storage signature can serve old local range requests', () => {
    const h = handler();
    h.request.headers.range = 'bytes=2-5';
    h.response.body = Buffer.from('0123456789');
    assert.equal(media.setMediaCacheHeaders(h, source()), false);
    assert(media.setMediaCacheHeaders(h, source(), { authorizedSignedSource: true }));
    assert.equal(h.response.status, 206);
    assert.equal(h.response.body.toString(), '2345');
    assert.equal(h.response.headers['Cache-Control'], 'private, max-age=31536000, immutable');
});

test('unsatisfiable ranges are empty 416 responses with no-store', () => {
    for (const range of ['bytes=10-', 'bytes=5-2', 'bytes=-0']) {
        const h = binaryRequest(handler(), source(), range);
        media.setMediaCacheHeaders(h, source());
        assert.equal(h.response.status, 416);
        assert.equal(h.response.headers['Content-Range'], 'bytes */10');
        assert.equal(h.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(h.response.body.length, 0);
    }
});

test('stream range slicing stops the source and detects truncated transfers', async () => {
    const h = binaryRequest(handler(), source(), 'bytes=2-5');
    const input = Readable.from([Buffer.from('0123'), Buffer.from('4567'), Buffer.from('89')]);
    h.response.body = input;
    media.setMediaCacheHeaders(h, source());
    assert.equal((await bytes(h.response.body)).toString(), '2345');
    assert.equal(input.destroyed, true);
    const truncated = binaryRequest(handler(), source(), 'bytes=2-9');
    truncated.response.body = Readable.from([Buffer.from('0123')]);
    media.setMediaCacheHeaders(truncated, source());
    await assert.rejects(bytes(truncated.response.body), /ended before/);
});

test('real framework returns JSON with neither context injection nor redirect under JSON Accept', async () => {
    const Koa = require('koa');
    const request = require('supertest');
    const base = load('framework/framework/base.ts', {
        '@hydrooj/framework': { serializer: () => (_, value) => value },
        '@hydrooj/utils/lib/utils': { errorMessage: (error) => error },
        './error': { SystemError: Error, UserFacingError: Error },
    }).default;
    const app = new Koa();
    app.use(async (ctx, next) => { ctx.params = {}; await next(); });
    app.use(base({ error() {} }, '', ''));
    app.use(async (ctx) => {
        const h = handler({ context: ctx, request: ctx.HydroContext.request, response: ctx.HydroContext.response });
        ctx.handler = h;
        ctx.HydroContext.UiContext = { privateField: 'do-not-leak' };
        ctx.HydroContext.user = { secretField: 'do-not-leak' };
        media.respondMediaCache(h, source(), 'https://cdn.example/media/v1/file.png?auth_key=short-lived');
    });
    const result = await request(app.callback()).get('/file/8/.avatar.png')
        .set('Accept', 'application/json').set('X-Hydro-Media-Cache', 'resolve-v1')
        .set('X-Hydro-Inject', 'uicontext,usercontext').expect(200).expect('Content-Type', /application\/json/);
    assert.deepEqual(Object.keys(result.body), ['mediaCache']);
    assert.equal(result.headers.location, undefined);
    assert.equal(result.headers['cache-control'], 'private, no-store');
    assert.equal(JSON.stringify(result.body).includes('do-not-leak'), false);
});
