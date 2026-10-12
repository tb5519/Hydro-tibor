const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const appRequire = createRequire(path.join(root, 'packages/hydrooj/package.json'));
class ValidationError extends Error {}
class NotFoundError extends Error {}
const stamp = '1791763200000-12345678-1234-4234-8234-123456789abc';
const prefix = 'domain/class-a/home-video';
const videoPath = `${prefix}-${stamp}.mp4`;
const framePath = `${prefix}-poster-${stamp}.jpg`;
function load(relative, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, relative), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, Buffer, Date, URL, process, setTimeout, clearTimeout, setImmediate, AbortController,
        __dirname: path.dirname(path.join(root, relative)),
        require: (name) => { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw Error(`Unexpected dependency: ${name}`); },
    });
    return module.exports;
}
const paths = load('packages/hydrooj/src/lib/background_video_path.ts');
function fixture(t, options = {}) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-background-video-'));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    // Header fixtures exercise server admission; the browser separately decodes a real frame before upload.
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(4), Buffer.from('isomiso2'), Buffer.alloc(24)]);
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(8), Buffer.from('webm'), Buffer.alloc(24)]);
    const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=', 'base64');
    const file = (filename, bytes) => {
        const filepath = path.join(temporary, filename);
        fs.writeFileSync(filepath, bytes);
        return { filepath, originalFilename: filename, size: bytes.length };
    };
    const calls = { put: [], del: [], meta: [], signed: [], pathSigned: [], delivery: [], get: [] };
    const defaultMeta = { 'Content-Type': 'video/mp4', size: 1024, remoteAsset: {
        key: `media/v1/${'a'.repeat(64)}.mp4`, sha256: 'b'.repeat(64), contentType: 'video/mp4', size: 1024,
        bucket: 'test-media', region: 'cn-wulanchabu',
    } };
    const storage = {
        put: async (...args) => { calls.put.push(args); if (options.failPutAt === calls.put.length) throw new Error('OSS write failed'); },
        del: async (...args) => calls.del.push(args),
        getMeta: async (target) => {
            calls.meta.push(target);
            if (options.replacedAfterRead && calls.meta.length > 1) return { size: 1024, 'Content-Type': 'video/mp4' };
            return options.meta === undefined ? defaultMeta : options.meta;
        },
        signDownloadLink: async (target) => { calls.pathSigned.push(target); throw new Error('Do not resolve the mutable storage path again'); },
        get: async (...args) => { calls.get.push(args); throw new Error('Must not load media bytes'); },
    };
    const assetStorage = {
        signDownloadLink: async (descriptor) => {
            calls.signed.push(descriptor);
            if (options.signError) throw new Error('OSS unavailable');
            return 'https://test-media.oss.example/media.mp4?signature=fixture';
        },
    };
    const helper = load('packages/hydrooj/src/lib/background_video.ts', {
        crypto: { randomUUID }, 'fs/promises': require('node:fs/promises'), path: require('node:path'),
        '../error': { ValidationError, NotFoundError }, '../model/storage': { __esModule: true, default: storage },
        './background_video_path': paths,
        './asset_storage': { __esModule: true, default: assetStorage },
        './asset_delivery': { tryRedirectAsset: (handler, source) => {
            calls.delivery.push(source);
            if (!options.cdn) return false;
            handler.response.redirect = 'https://static.example/media.mp4?auth_key=fixture';
            handler.response.status = 302;
            return true;
        } },
    });
    const handler = { request: { method: options.method || 'GET', query: { v: options.queryVersion } },
        response: { headers: {}, addHeader(name, value) { this.headers[name] = value; } } };
    return { helper, calls, handler, file, mp4, webm, jpeg, temporary, defaultMeta };
}

describe('generated background media paths', () => {
    it('recognizes only generated domain home and numeric badge namespaces', () => {
        for (const target of ['domain/课堂 A/home-video', 'badge/1/profile-video', 'domain/class-a/badge/12/profile-video']) {
            assert.equal(paths.isBackgroundVideoPrefix(target), true);
            assert.equal(paths.backgroundVideoMediaType(`${target}-${stamp}.mp4`), 'video/mp4');
            assert.equal(paths.backgroundVideoMediaType(`${target}-${stamp}.webm`), 'video/webm');
            assert.equal(paths.backgroundVideoMediaType(`${target}-poster-${stamp}.jpg`), 'image/jpeg');
            assert.equal(paths.isBackgroundVideoPath(target, `${target}-${stamp}.mp4`), true);
            assert.equal(paths.isBackgroundVideoPath(target, `${target}-poster-${stamp}.jpg`, true), true);
            assert.equal(paths.isBackgroundVideoPath(target, `${target}-poster-${stamp}.jpg`), false);
            assert.equal(paths.isBackgroundVideoPath(target, `${target}-${stamp}.mp4`, true), false);
        }
    });
    it('rejects path traversal, unsafe encoding, foreign prefixes and arbitrary attachments', () => {
        for (const target of ['domain/../home-video', 'domain/a%2fb/home-video', 'domain/a\\b/home-video', 'badge/name/profile-video',
            'user/1/video', 'domain/a/home-video?x', 'domain/a/home-video/extra']) {
            assert.equal(paths.isBackgroundVideoPrefix(target), false, target);
            assert.equal(paths.backgroundVideoMediaType(`${target}-${stamp}.mp4`), '', target);
        }
        assert.equal(paths.isBackgroundVideoPath('domain/class-b/home-video', videoPath), false);
        assert.equal(paths.backgroundVideoMediaType(`${prefix}-old.mp4`), '');
        assert.equal(paths.backgroundVideoMediaType(`${prefix}-${stamp}.avi`), '');
    });
});

describe('object-storage-only background upload', () => {
    it('stores validated video and generated poster with remoteOnly and unique paired names', async (t) => {
        const f = fixture(t);
        const result = await f.helper.storeBackgroundVideo(f.file('upload.mp4', f.mp4), f.file('frame.jpg', f.jpeg), 20, prefix);
        assert.equal(f.calls.put.length, 2);
        assert.equal(paths.isBackgroundVideoPath(prefix, result.videoPath), true);
        assert.equal(paths.isBackgroundVideoPath(prefix, result.videoPosterPath, true), true);
        assert.equal(result.videoPath.slice(prefix.length + 1, -4), result.videoPosterPath.slice(prefix.length + 8, -4));
        assert.ok(Number.isFinite(Date.parse(result.videoUpdatedAt)));
        for (const call of f.calls.put) {
            assert.equal(call[2], 20);
            assert.equal(call[3].remoteOnly, true);
        }
        assert.equal(f.calls.del.length, 0);
    });
    it('supports WebM and server-derived extension while ignoring a forged reported byte count', async (t) => {
        const f = fixture(t);
        const file = f.file('VIDEO.WEBM', f.webm);
        file.size = 1;
        const result = await f.helper.storeBackgroundVideo(file, f.file('frame.jpg', f.jpeg), 20, 'badge/3/profile-video');
        assert.match(result.videoPath, /\.webm$/);
    });
    it('rejects missing files, unsupported content and forged extensions before any storage write', async (t) => {
        const f = fixture(t);
        const frame = f.file('frame.jpg', f.jpeg);
        for (const file of [undefined, f.file('empty.mp4', Buffer.alloc(0)), f.file('bad.mp4', Buffer.from('<html>not video</html>')),
            f.file('wrong.webm', f.mp4), f.file('bad.avi', f.mp4), f.file('short.mp4', f.mp4.subarray(0, 10))]) {
            await assert.rejects(f.helper.storeBackgroundVideo(file, frame, 20, prefix), ValidationError);
        }
        await assert.rejects(f.helper.storeBackgroundVideo(f.file('good.mp4', f.mp4), undefined, 20, prefix), ValidationError);
        await assert.rejects(f.helper.storeBackgroundVideo(f.file('good2.mp4', f.mp4), f.file('not-image.jpg', Buffer.from('<script>bad</script>')), 20, prefix), ValidationError);
        assert.equal(f.calls.put.length, 0);
    });
    it('uses actual file size to reject oversized video and frame without trusting request metadata', async (t) => {
        const f = fixture(t);
        const video = f.file('huge.mp4', f.mp4);
        fs.truncateSync(video.filepath, paths.BACKGROUND_VIDEO_MAX_SIZE + 1);
        video.size = 1;
        await assert.rejects(f.helper.storeBackgroundVideo(video, f.file('frame.jpg', f.jpeg), 20, prefix), ValidationError);
        const frame = f.file('huge.jpg', f.jpeg);
        fs.truncateSync(frame.filepath, paths.BACKGROUND_POSTER_MAX_SIZE + 1);
        frame.size = 1;
        await assert.rejects(f.helper.storeBackgroundVideo(f.file('good.mp4', f.mp4), frame, 20, prefix), ValidationError);
        assert.equal(f.calls.put.length, 0);
    });
    it('rejects unsupported destination prefix before touching files', async (t) => {
        const f = fixture(t);
        await assert.rejects(f.helper.storeBackgroundVideo({ filepath: '/does-not-exist' }, undefined, 20, 'user/1/media'), ValidationError);
        assert.equal(f.calls.put.length, 0);
    });
    it('cleans both newly assigned paths when either object-store write fails', async (t) => {
        for (const failPutAt of [1, 2]) {
            const f = fixture(t, { failPutAt });
            await assert.rejects(f.helper.storeBackgroundVideo(f.file('video.mp4', f.mp4), f.file('frame.jpg', f.jpeg), 20, prefix), /OSS write failed/);
            assert.equal(f.calls.del.length, 1);
            assert.equal(f.calls.del[0][0].length, 2);
            assert.ok(f.calls.del[0][0].includes(f.calls.put[0][0]));
            assert.equal(f.calls.del[0][1], 20);
        }
    });
    it('cleanup ignores private files and malformed generated paths', async (t) => {
        const f = fixture(t);
        await f.helper.deleteBackgroundVideo(['user/1/private.jpg', 'badge/1/profile-video-old.mp4', videoPath, framePath], 20);
        assert.deepEqual(Array.from(f.calls.del[0][0]), [videoPath, framePath]);
        await f.helper.deleteBackgroundVideo(['user/1/private.jpg'], 20);
        assert.equal(f.calls.del.length, 1);
    });
});

describe('background remote delivery', () => {
    it('privately caches only the exact authorized version below signed URL validity and isolates credentials', async (t) => {
        for (const cdn of [true, false]) {
            for (const method of ['GET', 'HEAD']) {
                const f = fixture(t, { cdn, method, queryVersion: '2026-10-12T01:02:03Z' });
                await f.helper.redirectBackgroundVideo(f.handler, videoPath, '2026-10-12T01:02:03Z');
                assert.equal(f.handler.response.headers['Cache-Control'], 'private, max-age=300');
                assert.equal(f.handler.response.headers.Vary, 'Cookie, Authorization');
                assert.equal(f.handler.response.status, 302);
                assert.equal(f.calls.get.length, 0);
            }
        }
        for (const options of [{}, { queryVersion: 'old' }, { queryVersion: ['current'] },
            { queryVersion: 'current', method: 'POST' }]) {
            const f = fixture(t, options);
            await f.helper.redirectBackgroundVideo(f.handler, videoPath, 'current');
            assert.equal(f.handler.response.headers['Cache-Control'], 'private, no-store');
            assert.equal(f.handler.response.headers.Vary, 'Cookie, Authorization');
        }
    });
    it('uses a ready CDN redirect without fetching or copying bytes', async (t) => {
        const f = fixture(t, { cdn: true });
        await f.helper.redirectBackgroundVideo(f.handler, videoPath);
        assert.match(f.handler.response.redirect, /^https:\/\/static\.example\//);
        assert.equal(f.calls.get.length, 0);
        assert.equal(f.calls.signed.length, 0);
        assert.equal(f.handler.response.headers['Cache-Control'], 'private, no-store');
    });
    it('uses a signed object-store URL when CDN is off, still without proxying bytes', async (t) => {
        const f = fixture(t);
        await f.helper.redirectBackgroundVideo(f.handler, videoPath);
        assert.match(f.handler.response.redirect, /^https:\/\/test-media\.oss\.example\//);
        assert.deepEqual(f.calls.signed, [f.defaultMeta.remoteAsset]);
        assert.deepEqual(f.calls.meta, [videoPath]);
        assert.equal(f.calls.pathSigned.length, 0);
        assert.equal(f.handler.response.status, 302);
        assert.equal(f.handler.response.body, undefined);
        assert.equal(f.calls.get.length, 0);
    });
    it('rejects missing, local-only, mismatched and oversized metadata instead of falling back to the website', async (t) => {
        for (const meta of [null, { size: 12, 'Content-Type': 'video/mp4' },
            { size: 12, 'Content-Type': 'text/html', remoteAsset: { size: 12, contentType: 'video/mp4' } },
            { size: 12, 'Content-Type': 'video/mp4', remoteAsset: { size: 13, contentType: 'video/mp4' } },
            { size: 12, 'Content-Type': 'video/mp4', remoteAsset: { size: 12, contentType: 'video/webm' } },
            { size: paths.BACKGROUND_VIDEO_MAX_SIZE + 1, 'Content-Type': 'video/mp4', remoteAsset: { size: paths.BACKGROUND_VIDEO_MAX_SIZE + 1, contentType: 'video/mp4' } },
        ]) {
            const f = fixture(t, { meta });
            await assert.rejects(f.helper.redirectBackgroundVideo(f.handler, videoPath), NotFoundError);
            assert.equal(f.calls.get.length, 0);
            assert.equal(f.calls.signed.length, 0);
            assert.equal(f.calls.delivery.length, 0);
        }
    });
    it('applies the independent cover size limit and rejects unsafe paths before metadata reads', async (t) => {
        const f = fixture(t, { meta: { 'Content-Type': 'image/jpeg', size: 12, remoteAsset: { size: 12, contentType: 'image/jpeg' } } });
        await f.helper.redirectBackgroundVideo(f.handler, framePath);
        assert.equal(f.calls.signed[0].contentType, 'image/jpeg');
        assert.deepEqual(f.calls.meta, [framePath]);
        const g = fixture(t);
        await assert.rejects(g.helper.redirectBackgroundVideo(g.handler, 'user/1/private.jpg'), NotFoundError);
        assert.equal(g.calls.meta.length, 0);
    });
    it('surfaces object-store signing failure without local fallback', async (t) => {
        const f = fixture(t, { signError: true });
        await assert.rejects(f.helper.redirectBackgroundVideo(f.handler, videoPath), /OSS unavailable/);
        assert.equal(f.calls.get.length, 0);
        assert.equal(f.handler.response.redirect, undefined);
    });
    it('signs the already validated immutable descriptor when the current storage path is replaced concurrently', async (t) => {
        const f = fixture(t, { replacedAfterRead: true });
        await f.helper.redirectBackgroundVideo(f.handler, videoPath);
        assert.deepEqual(f.calls.meta, [videoPath], 'the selected storage path is read only once');
        assert.equal(f.calls.pathSigned.length, 0, 'path signer would re-query a possibly local replacement');
        assert.equal(f.calls.signed[0], f.defaultMeta.remoteAsset);
        assert.equal(f.calls.get.length, 0);
        assert.match(f.handler.response.redirect, /^https:\/\/test-media\.oss\.example\//);
    });
});

it('the real CDN signer accepts verified MP4/WebM objects and never mirrors local video', async (t) => {
    const dependencies = Object.fromEntries(['crypto', 'fs', 'os', 'path', '@aws-sdk/client-s3'].map((name) => [name, appRequire(name)]));
    const { AssetDelivery } = load('packages/hydrooj/src/lib/asset_delivery.ts', dependencies);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-background-cdn-'));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    const configPath = path.join(temporary, 'assets.json');
    fs.writeFileSync(configPath, JSON.stringify({ enabled: true, mediaBaseUrl: 'https://static.example/',
        mediaSigningKey: 'fixturesecretkey123456', bucket: 'test-media', region: 'cn-wulanchabu',
        endpoint: 'https://s3.oss-cn-wulanchabu.aliyuncs.com', accessKeyId: 'fixture-id', secretAccessKey: 'fixture-secret' }));
    let networkCalls = 0;
    const delivery = new AssetDelivery({ configPath, publicRoot: temporary, client: () => ({ send: async () => { networkCalls++; throw Error('No upload allowed'); } }) });
    for (const extension of ['mp4', 'webm']) {
        const contentType = `video/${extension}`;
        const source = { path: `${prefix}-${stamp}.${extension}`, meta: { etag: 'fixture-revision', size: 1024, 'Content-Type': contentType,
            remoteAsset: { key: `media/v1/${'a'.repeat(64)}.${extension}`, sha256: 'b'.repeat(64), size: 1024,
                contentType, bucket: 'test-media', region: 'cn-wulanchabu' } }, load: () => { throw Error('No source bytes'); } };
        const handler = { response: { addHeader: () => {} } };
        assert.equal(delivery.tryRedirectAsset(handler, source), true);
        assert.equal(new URL(handler.response.redirect).pathname, `/${source.meta.remoteAsset.key}`);
        assert.equal(delivery.queueAssetMirror(source), false);
        const localSource = { ...source, meta: { ...source.meta, remoteAsset: undefined } };
        assert.equal(delivery.tryRedirectAsset({ response: { addHeader: () => {} } }, localSource), false);
        assert.equal(delivery.queueAssetMirror(localSource), false);
        assert.equal(delivery.tryRedirectAsset({ response: { addHeader: () => {} } }, { ...source, variant: 'preview' }), false);
    }
    await delivery.waitForAssetMirrors();
    assert.equal(networkCalls, 0);
    assert.equal(delivery.status().pending, 0);
    assert.equal(fs.existsSync(path.join(temporary, 'asset-mirror-index.json')), false);
});
