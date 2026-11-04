const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');

const code = transformSync(fs.readFileSync(path.join(__dirname, '../packages/ui-default/utils/media-cache.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code;
const origin = 'https://school.test';
function moduleApi() {
    const module = { exports: {} };
    vm.runInNewContext(code, {
        module, exports: module.exports, URL, Request, Response, Headers, ReadableStream,
        AbortController, Uint8Array, Date, self: { location: new URL(origin) },
    });
    return module.exports;
}

function fixture(overrides = {}) {
    const api = moduleApi();
    const entries = new Map();
    const calls = { resolve: 0, source: [], fallback: 0 };
    let bytes = Buffer.from('picture');
    let time = 1_800_000_000_000;
    let revoked = false;
    let quotaFull = false;
    const info = { scope: 'a'.repeat(64), version: '1'.repeat(64), type: 'image/png', size: bytes.length,
        url: 'https://cdn.test/media/picture.png?signature=first' };
    const keyOf = (request) => typeof request === 'string' ? request : request.url;
    const cache = {
        async keys() { return [...entries.keys()].map((key) => new Request(key)); },
        async match(request) { return entries.get(keyOf(request))?.clone(); },
        async put(request, response) {
            if (quotaFull) throw new Error('QuotaExceededError');
            entries.set(keyOf(request), response.clone());
        },
        async delete(request) { return entries.delete(keyOf(request)); },
    };
    const options = { origin, caches: { async open() { return cache; } }, now: () => time, chunkSize: 8, ...overrides,
        async fetch(input, init = {}) {
            const request = input instanceof Request ? input : new Request(input, init);
            if (request.headers.get('X-Hydro-Media-Cache') === 'resolve-v1') {
                calls.resolve++;
                assert.equal(request.headers.get('Accept'), 'application/json');
                assert.equal(request.cache, 'no-store');
                if (revoked) return Response.json({ error: 'Access denied' }, { status: 403 });
                return Response.json({ mediaCache: info });
            }
            if (new URL(request.url).origin === origin) {
                calls.fallback++;
                return new Response(revoked ? 'denied' : bytes, {
                    status: revoked ? 403 : 200, headers: { 'Content-Type': info.type },
                });
            }
            calls.source.push(request);
            const range = /bytes=(\d+)-(\d+)/.exec(request.headers.get('Range') || '');
            const start = range ? Number(range[1]) : 0;
            const end = range ? Number(range[2]) : bytes.length - 1;
            return new Response(bytes.subarray(start, end + 1), { status: range ? 206 : 200, headers: {
                'Content-Type': info.type, 'Cache-Control': 'private, no-store',
                ...(range ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}),
            } });
        },
    };
    const request = (headers = {}) => new Request(`${origin}/d/system/badge/1/ac-image?v=old`, { headers });
    return { api, options, info, entries, calls, cache, request,
        read: (headers) => api.fetchCachedMedia(request(headers), options),
        setBytes(value) { bytes = Buffer.from(value); info.size = bytes.length; },
        setTime(value) { time = value; }, get time() { return time; },
        revoke() { revoked = true; }, failQuota() { quotaFull = true; },
    };
}

test('recognizes media routes while excluding navigation, code archives, SVG and unrelated origins', () => {
    const { isMediaCacheRequest } = moduleApi();
    for (const route of ['/d/system/badge/1/background-video', '/achievement/sound', '/home/video',
        '/file/32/.avatar.png', '/p/P100/file/test.png', '/training/course/file/video.mp4',
        '/contest/123/file/public/example.mp3', '/contest/123/file/private/example.mp4',
        '/scratch/file/abcdef', '/scratch/work/abc/thumbnail',
        '/scratch/assignment/abc/quiz/file/example.png', '/daily-quiz/session/file/1/example.png',
        '/manage/daily-quiz/student/28/upcoming/2026-11-04/system/1/file/2/example.mp4',
        '/manage/users/daily-quiz/28/2026-11-04/file/2/example.png']) {
        assert(isMediaCacheRequest(new Request(origin + route), origin), route);
        if (!route.startsWith('/d/')) assert(isMediaCacheRequest(new Request(origin + '/d/system' + route), origin), route);
    }
    for (const route of ['/p/P100', '/achievement/pending', '/scratch/file/old.sb3',
        '/file/3/sprite.sprite3', '/file/3/unsafe.svg', '/scratch-editor/editor.html']) {
        assert.equal(isMediaCacheRequest(new Request(origin + route), origin), false, route);
    }
    assert.equal(isMediaCacheRequest(new Request('https://outside.test/file/3/a.png'), origin), false);
    assert.equal(isMediaCacheRequest({ method: 'GET', mode: 'navigate' }, origin), false);
});

test('reuses bytes across changed signatures and resolves current authorization on every call', async () => {
    const f = fixture();
    assert.equal(await (await f.read()).text(), 'picture');
    f.info.url = 'https://cdn.test/media/picture.png?signature=tomorrow';
    const response = await f.read();
    assert.equal(await response.text(), 'picture');
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(f.calls.resolve, 2);
    assert.equal(f.calls.source.length, 1);
    assert.equal(f.calls.source[0].credentials, 'omit');
});

test('replacing a file at the same application URL immediately selects its new bytes', async () => {
    const f = fixture();
    await (await f.read()).text();
    f.info.version = '2'.repeat(64);
    f.setBytes('updated');
    assert.equal(await (await f.read()).text(), 'updated');
    assert.equal(f.calls.source.length, 2);
});

test('scopes isolate accounts and permission revocation cannot read warm bytes', async () => {
    const f = fixture();
    await (await f.read()).text();
    f.info.scope = 'b'.repeat(64);
    await (await f.read()).text();
    assert.equal(f.calls.source.length, 2);
    f.revoke();
    const response = await f.read();
    assert.equal(response.status, 403);
    assert.equal(await response.text(), 'denied');
    assert.equal(f.calls.source.length, 2);
});

test('persistent cache survives worker restart and expires after 365 days', async () => {
    const f = fixture();
    await (await f.read()).text();
    const restarted = moduleApi();
    f.setTime(f.time + 300 * 24 * 3600 * 1000);
    assert.equal(await (await restarted.fetchCachedMedia(f.request(), f.options)).text(), 'picture');
    assert.equal(f.calls.source.length, 1);
    f.setTime(f.time + 66 * 24 * 3600 * 1000);
    await (await restarted.fetchCachedMedia(f.request(), f.options)).text();
    assert.equal(f.calls.source.length, 2);
});

test('video downloads requested ranges only and reuses enclosing cached ranges', async () => {
    const f = fixture();
    f.info.type = 'video/mp4';
    f.setBytes('0123456789abcdefghijklmnopqrstuv');
    const first = await f.read({ Range: 'bytes=0-3' });
    assert.equal(first.status, 206);
    assert.equal(first.headers.get('Content-Range'), 'bytes 0-3/32');
    assert.equal(await first.text(), '0123');
    assert.deepEqual(f.calls.source.map((request) => request.headers.get('Range')), ['bytes=0-3']);
    assert.equal(await (await f.read({ Range: 'bytes=8-' })).text(), '89abcdefghijklmnopqrstuv');
    assert.equal(f.calls.source.length, 4);
    assert.equal(await (await f.read({ Range: 'bytes=10-11' })).text(), 'ab');
    assert.equal(await (await f.read({ Range: 'bytes=-4' })).text(), 'stuv');
    assert.equal(f.calls.source.length, 4);
});

test('non-range video streams with backpressure and cancellation stops downloading', async () => {
    const f = fixture();
    f.info.type = 'video/mp4';
    f.setBytes('0123456789abcdefghijklmnopqrstuv');
    const response = await f.read();
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    assert.equal(Buffer.from((await reader.read()).value).toString(), '01234567');
    await reader.cancel();
    assert.equal(f.calls.source.length, 1);
    assert.equal(await (await f.read()).text(), '0123456789abcdefghijklmnopqrstuv');
    assert.equal(f.calls.source.length, 4);
});

test('unsupported ranges use normal delivery and unsatisfiable ranges return 416 without download', async () => {
    const f = fixture();
    for (const range of ['bytes=999-', 'bytes=-0', 'bytes=5-2']) {
        const response = await f.read({ Range: range });
        assert.equal(response.status, 416);
        assert.equal(response.headers.get('Content-Range'), 'bytes */7');
    }
    assert.equal(f.calls.source.length, 0);
    assert.equal(await (await f.read({ Range: 'bytes=0-1,4-5' })).text(), 'picture');
    assert.equal(f.calls.fallback, 1);
});

test('If-Range mismatch supplies the full current representation', async () => {
    const f = fixture();
    const response = await f.read({ Range: 'bytes=0-1', 'If-Range': '"old-version"' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'picture');
});

test('corrupt cached bytes are discarded and downloaded again', async () => {
    const f = fixture();
    await (await f.read()).text();
    const [key, response] = [...f.entries][0];
    f.entries.set(key, new Response('bad', { headers: response.headers }));
    assert.equal(await (await f.read()).text(), 'picture');
    assert.equal(f.calls.source.length, 2);
});

test('concurrent writes evict old parts and respect the shared capacity', async () => {
    const f = fixture({ capacity: 14 });
    const pending = [];
    for (const version of ['1', '2', '3']) {
        f.info.version = version.repeat(64);
        pending.push(f.read().then((response) => response.text()));
    }
    assert.deepEqual(await Promise.all(pending), ['picture', 'picture', 'picture']);
    const sizes = await Promise.all([...f.entries.values()].map(async (response) => (await response.clone().arrayBuffer()).byteLength));
    assert(sizes.reduce((sum, size) => sum + size, 0) <= 14);
});

test('storage quota failure still displays downloaded media', async () => {
    const f = fixture();
    f.failQuota();
    assert.equal(await (await f.read()).text(), 'picture');
    assert.equal(f.entries.size, 0);
});

test('SVG and invalid descriptors never populate the media cache', async () => {
    const f = fixture();
    f.info.type = 'image/svg+xml';
    assert.equal(await (await f.read()).text(), 'picture');
    f.info.type = 'image/png';
    f.info.version = 'invalid';
    assert.equal(await (await f.read()).text(), 'picture');
    assert.equal(f.entries.size, 0);
    assert.equal(f.calls.source.length, 0);
});

test('old-server direct media is returned without a duplicate download', async () => {
    const f = fixture();
    let requests = 0;
    f.options.fetch = async () => {
        requests++;
        return new Response('old-server', { headers: { 'Content-Type': 'image/png' } });
    };
    assert.equal(await (await f.read()).text(), 'old-server');
    assert.equal(requests, 1);
    assert.equal(f.entries.size, 0);
});

test('preserves attachment disposition and excludes signed URLs from persistent keys', async () => {
    const f = fixture();
    f.info.contentDisposition = 'attachment; filename="picture.png"';
    const response = await f.read();
    await response.text();
    assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="picture.png"');
    assert([...f.entries.keys()].every((key) => !key.includes('signature') && !key.includes('cdn.test')));
});

test('refreshes expired video signatures during playback without mixing versions', async () => {
    const f = fixture();
    f.info.type = 'video/mp4';
    f.setBytes('0123456789abcdefghijklmnopqrstuv');
    const network = f.options.fetch;
    let expireNext = false;
    f.options.fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : input;
        if (expireNext && url.startsWith('https://cdn.test/')) {
            expireNext = false;
            f.info.url = 'https://cdn.test/media/picture.png?signature=refreshed';
            return new Response('expired', { status: 403 });
        }
        return network(input, init);
    };
    const reader = (await f.read()).body.getReader();
    const parts = [(await reader.read()).value];
    expireNext = true;
    while (true) {
        const part = await reader.read();
        if (part.done) break;
        parts.push(part.value);
    }
    assert.equal(Buffer.concat(parts).toString(), '0123456789abcdefghijklmnopqrstuv');
    assert.equal(f.calls.resolve, 2);
    assert(f.calls.source.at(-1).url.includes('signature=refreshed'));
});
