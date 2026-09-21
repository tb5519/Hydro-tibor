const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'packages/hydrooj/src/lib/asset_delivery.ts');
const appRequire = createRequire(path.join(root, 'packages/hydrooj/package.json'));
const moduleFixture = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module: moduleFixture, exports: moduleFixture.exports, require: appRequire, __dirname: path.dirname(filename),
    process, Buffer, URL, AbortController, setImmediate, setTimeout, clearTimeout,
});
const { AssetDelivery, signMediaUrl } = moduleFixture.exports;

function fixture(t, changes = {}, options = {}) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-assets-test-'));
    t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
    const configPath = path.join(temporary, 'assets.json');
    const config = { enabled: true, publicBaseUrl: 'https://static.example.com/static/release-1/', mediaBaseUrl: 'https://static.example.com/',
        mediaSigningKey: 'testsigningkey1234567890', bucket: 'example-test', region: 'cn-wulanchabu',
        endpoint: 'https://s3.oss-cn-wulanchabu.aliyuncs.com', accessKeyId: 'offline-example', secretAccessKey: 'offline-secret', ...changes };
    fs.writeFileSync(configPath, JSON.stringify(config));
    const publicRoot = path.join(temporary, 'public');
    fs.mkdirSync(path.join(publicRoot, 'img'), { recursive: true });
    fs.mkdirSync(path.join(publicRoot, 'scratch-editor'), { recursive: true });
    for (const name of ['app.js', 'favicon.ico', 'img/avatar.png', 'scratch-editor/editor.html']) fs.writeFileSync(path.join(publicRoot, name), 'example');
    fs.writeFileSync(path.join(publicRoot, 'manifest.json'), JSON.stringify({ 'app.js': '/app.js?hash=abc', avatar: '/img/avatar.png' }));
    fs.writeFileSync(path.join(publicRoot, 'scratch-editor/build-manifest.json'), JSON.stringify({ files: { 'editor.html': '0'.repeat(64) } }));
    const calls = [];
    const objects = new Map();
    const client = { async send(command) {
        calls.push(command);
        const input = command.input;
        if (command.constructor.name === 'PutObjectCommand') {
            objects.set(input.Key, { ...input, Body: Buffer.from(input.Body) });
            return {};
        }
        const item = objects.get(input.Key);
        return item ? { ContentLength: item.Body.length, ContentType: item.ContentType, CacheControl: item.CacheControl,
            ContentDisposition: item.ContentDisposition, Metadata: item.Metadata } : {};
    } };
    const make = (extra = {}) => new AssetDelivery({ configPath, publicRoot, client: () => client, ...options, ...extra });
    return { temporary, configPath, config, publicRoot, calls, objects, client, make, delivery: make() };
}
function source(id = 'one', bytes = Buffer.from('png'), extra = {}) {
    return { path: `domain/domain-a/${id}.png`, meta: { etag: `etag-${id}`, size: bytes.length,
        lastModified: '2026-09-01T00:00:00.000Z', 'Content-Type': 'image/png' }, load: () => bytes, ...extra };
}
function handler() {
    return { response: { headers: {}, addHeader(name, value) { this.headers[name] = value; } } };
}

it('does nothing with missing, disabled, malformed or relative configuration', (t) => {
    const f = fixture(t, { enabled: false });
    let calls = 0;
    for (const delivery of [f.delivery, f.make({ configPath: path.join(f.temporary, 'missing.json') }), f.make({ configPath: './assets.json' })]) {
        assert.equal(delivery.staticAssetUrl('/app.js'), '/app.js');
        assert.equal(delivery.tryRedirectAsset(handler(), source('x', Buffer.from('png'), { load: () => { calls++; } })), false);
    }
    fs.writeFileSync(f.configPath, '{invalid json');
    assert.equal(f.make().isEnabled(), false);
    assert.equal(calls, 0);
});

it('uses the internal endpoint for mirror I/O without changing public URLs or persisted identities', async (t) => {
    const f = fixture(t);
    const image = source();
    f.delivery.queueAssetMirror(image);
    await f.delivery.waitForAssetMirrors();
    const originalIndex = fs.readFileSync(path.join(f.temporary, 'asset-mirror-index.json'), 'utf8');
    const originalUrl = handler();
    assert.equal(f.delivery.tryRedirectAsset(originalUrl, image), true);
    const internalEndpoint = 'https://s3.oss-cn-wulanchabu-internal.aliyuncs.com';
    fs.writeFileSync(f.configPath, JSON.stringify({ ...f.config, internalEndpoint }));
    const endpoints = [];
    const internal = f.make({ client: (config) => { endpoints.push(config.endpoint); return f.client; } });
    const response = handler();
    assert.equal(internal.tryRedirectAsset(response, image), true, 'existing verified mirror survives transport switch');
    assert.equal(new URL(response.response.redirect).pathname, new URL(originalUrl.response.redirect).pathname);
    assert.equal(new URL(response.response.redirect).hostname, 'static.example.com');
    assert.equal(fs.readFileSync(path.join(f.temporary, 'asset-mirror-index.json'), 'utf8'), originalIndex);
    assert.equal(endpoints.length, 0, 'ready mirror does not re-upload on internal endpoint switch');
    internal.queueAssetMirror(source('new-internal-object'));
    await internal.waitForAssetMirrors();
    assert.deepEqual(endpoints, [internalEndpoint]);
    const sdk = f.make({ client: undefined }).client({ ...f.config, internalEndpoint });
    assert.equal((await sdk.config.endpoint()).hostname, 's3.oss-cn-wulanchabu-internal.aliyuncs.com');
    sdk.destroy();
    assert.equal(internal.staticAssetUrl('/app.js'), 'https://static.example.com/static/release-1/app.js');
});

it('rejects malformed, cross-region and non-HTTPS internal endpoints without any mirror traffic', (t) => {
    const f = fixture(t);
    for (const internalEndpoint of ['', null, 'http://s3.oss-cn-wulanchabu-internal.aliyuncs.com',
        'https://s3.oss-cn-hangzhou-internal.aliyuncs.com', 'https://127.0.0.1',
        'https://s3.oss-cn-wulanchabu-internal.aliyuncs.com/path',
        'https://s3.oss-cn-wulanchabu-internal.aliyuncs.com?x=1',
        'https://s3.oss-cn-wulanchabu-internal.aliyuncs.com#x',
        'https://s3.oss-cn-wulanchabu-internal.aliyuncs.com:444',
        'https://user:pass@s3.oss-cn-wulanchabu-internal.aliyuncs.com']) {
        fs.writeFileSync(f.configPath, JSON.stringify({ ...f.config, internalEndpoint }));
        const delivery = f.make();
        assert.equal(delivery.isEnabled(), false);
        assert.equal(delivery.queueAssetMirror(source()), false);
        assert.equal(delivery.tryRedirectAsset(handler(), source()), false);
    }
    assert.equal(f.calls.length, 0);
});

it('maps only known public assets, preserving version queries and leaving routes private', (t) => {
    const { delivery } = fixture(t);
    assert.equal(delivery.staticAssetUrl('/app.js?version=abc#x'), 'https://static.example.com/static/release-1/app.js?version=abc#x');
    assert.equal(delivery.staticAssetUrl('/favicon.ico?v=onebyone'), 'https://static.example.com/static/release-1/favicon.ico?v=onebyone');
    assert.equal(delivery.staticAssetUrl('/scratch-editor/editor.html'), 'https://static.example.com/static/release-1/scratch-editor/editor.html');
    for (const route of ['/resource/version/lang-zh.js', '/fs/user/1/file.png', '/storage?target=x', '/unknown.png',
        '//evil.example/app.js', '/%2e%2e/app.js', '/img/%2favatar.png', '/%252e%252e/app.js', 'https://evil.example/app.js']) {
        assert.equal(delivery.staticAssetUrl(route), route);
    }
});

it('falls back immediately, deduplicates upload, verifies HEAD and persists a secret-free mirror', async (t) => {
    const f = fixture(t, {}, { now: () => 1_700_000_000_000 });
    let loaded = 0;
    const image = source('private', Buffer.from('png'), { load: () => { loaded++; return Buffer.from('png'); } });
    assert.equal(f.delivery.tryRedirectAsset(handler(), image), false);
    assert.equal(f.delivery.tryRedirectAsset(handler(), image), false);
    assert.equal(loaded, 0, 'origin request does not wait for the source loader');
    await f.delivery.waitForAssetMirrors();
    assert.equal(loaded, 1);
    assert.equal(f.calls.length, 2);
    const response = handler();
    assert.equal(f.delivery.tryRedirectAsset(response, image), true);
    assert.equal(response.response.status, 302);
    assert.equal(response.response.headers['Cache-Control'], 'private, no-store');
    const url = new URL(response.response.redirect);
    assert.match(url.pathname, /^\/media\/v1\/[a-f0-9]{64}\.png$/);
    const [time, random, uid, signature] = url.searchParams.get('auth_key').split('-');
    assert.equal(time, '1700000000');
    assert.equal(uid, '0');
    assert.equal(signature, createHash('md5').update(`${url.pathname}-${time}-${random}-0-${f.config.mediaSigningKey}`).digest('hex'));
    const indexPath = path.join(f.temporary, 'asset-mirror-index.json');
    assert.equal(fs.statSync(indexPath).mode & 0o777, 0o600);
    const index = fs.readFileSync(indexPath, 'utf8');
    for (const privateValue of [f.config.secretAccessKey, f.config.mediaSigningKey, image.path]) assert.equal(index.includes(privateValue), false);
    assert.equal(f.make().tryRedirectAsset(handler(), image), true, 'restart uses verified persisted index without HEAD');
    assert.equal(f.calls.length, 2);
});

it('uses the documented Type A encoding without emitting OSS credentials', () => {
    const url = new URL(signMediaUrl('https://static.example.com/', '/media/中文.png', 'example-secret', 1_700_000_000_000));
    assert.equal(url.pathname, '/media/%E4%B8%AD%E6%96%87.png');
    assert.equal(url.toString().includes('example-secret'), false);
});

it('directly signs a trusted primary object without copying it or creating a mirror index', (t) => {
    const f = fixture(t, { accessKeyId: undefined, secretAccessKey: undefined });
    const image = source();
    image.meta.remoteAsset = { key: `media/v1/${'a'.repeat(64)}.png`, sha256: 'b'.repeat(64), size: image.meta.size,
        contentType: 'image/png', bucket: f.config.bucket, region: f.config.region };
    const response = handler();
    assert.equal(f.delivery.tryRedirectAsset(response, image), true);
    assert.equal(new URL(response.response.redirect).pathname, `/${image.meta.remoteAsset.key}`);
    assert.equal(f.delivery.queueAssetMirror(image), false);
    assert.equal(f.delivery.status().pending, 0);
    assert.equal(fs.existsSync(path.join(f.temporary, 'asset-mirror-index.json')), false);
    assert.equal(f.calls.length, 0);
});

it('does not sign a mismatched primary bucket and does not mistake a preview for its original', async (t) => {
    const f = fixture(t);
    const image = source();
    const remoteAsset = { key: `media/v1/${'a'.repeat(64)}.png`, sha256: 'b'.repeat(64), size: image.meta.size,
        contentType: 'image/png', bucket: f.config.bucket, region: f.config.region };
    image.meta.remoteAsset = { ...remoteAsset, bucket: 'another-bucket' };
    assert.equal(f.delivery.tryRedirectAsset(handler(), image), false);
    assert.equal(f.delivery.status().pending, 0);
    image.meta.remoteAsset = remoteAsset;
    const preview = { ...image, variant: 'preview-384' };
    assert.equal(f.delivery.tryRedirectAsset(handler(), preview), false);
    await f.delivery.waitForAssetMirrors();
    const response = handler();
    assert.equal(f.delivery.tryRedirectAsset(response, preview), true);
    assert.notEqual(new URL(response.response.redirect).pathname, `/${remoteAsset.key}`);
});

it('separates source revisions, generated variants, content dispositions and storage targets', async (t) => {
    const f = fixture(t);
    const original = source();
    const sources = [original, { ...original, variant: 'preview-v1-384' }, { ...original, variant: 'preview-v1-768' },
        { ...original, meta: { ...original.meta, etag: 'new-etag' } }, { ...original, contentDisposition: 'attachment; filename="image.png"' }];
    sources.forEach((item) => f.delivery.queueAssetMirror(item));
    await f.delivery.waitForAssetMirrors();
    assert.equal(f.objects.size, sources.length);
    fs.writeFileSync(f.configPath, JSON.stringify({ ...f.config, bucket: 'different-bucket' }));
    const changed = f.make();
    assert.equal(changed.tryRedirectAsset(handler(), original), false);
    await changed.waitForAssetMirrors();
});

it('only accepts explicit media types and exact Scratch project paths within 20 MiB', async (t) => {
    const f = fixture(t);
    const octet = { etag: 'immutable-file-id', size: 3, 'Content-Type': 'application/octet-stream' };
    const project = { path: 'scratch/domain-a/1234567890abcdef12345678.sb3', meta: octet, load: () => Buffer.from('sb3'), contentDisposition: 'attachment; filename="project.sb3"' };
    assert.equal(f.delivery.queueAssetMirror(project), true);
    for (const item of [
        { ...project, path: 'user/42/private.sb3' }, { ...project, path: 'scratch/domain-a/other.sb3' },
        { ...project, path: 'scratch/../1234567890abcdef12345678.sb3' },
        { ...project, meta: { ...octet, size: 20 * 1024 * 1024 + 1 } },
        { ...project, contentDisposition: 'attachment\r\nInjected: yes' },
        source('x', Buffer.from('png'), { meta: { ...octet, 'Content-Type': 'text/html' } }),
    ]) assert.equal(f.delivery.queueAssetMirror(item), false);
    await f.delivery.waitForAssetMirrors();
    const object = [...f.objects.values()][0];
    assert.match(object.Key, /\.sb3$/);
    assert.equal(object.ContentDisposition, project.contentDisposition);
});

it('bounds and deduplicates the queue while processing only one source at a time', async (t) => {
    let release;
    const gate = new Promise((done) => { release = done; });
    const f = fixture(t, {}, { queueLimit: 2 });
    const first = source('first', Buffer.from('png'), { load: async () => { await gate; return Buffer.from('png'); } });
    assert.equal(f.delivery.queueAssetMirror(first), true);
    assert.equal(f.delivery.queueAssetMirror(first), true);
    assert.equal(f.delivery.queueAssetMirror(source('second')), true);
    assert.equal(f.delivery.queueAssetMirror(source('third')), false);
    await new Promise(setImmediate);
    assert.equal(f.calls.length, 0);
    assert.equal(f.delivery.status().pending, 2);
    release();
    await f.delivery.waitForAssetMirrors();
    assert.equal(f.objects.size, 2);
    assert.equal(f.delivery.status().pending, 0);
});

it('backs off failed verification and never redirects before verified persistence', async (t) => {
    let now = 1_700_000_000_000;
    let calls = 0;
    const f = fixture(t, {}, { now: () => now, retryMs: 1000,
        client: () => ({ async send() { calls++; return { ContentLength: 3, Metadata: { sha256: 'bad' } }; } }) });
    const image = source();
    assert.equal(f.delivery.tryRedirectAsset(handler(), image), false);
    await f.delivery.waitForAssetMirrors();
    assert.equal(f.delivery.tryRedirectAsset(handler(), image), false);
    assert.equal(f.delivery.status().pending, 0);
    assert.equal(calls, 2);
    now += 1001;
    assert.equal(f.delivery.queueAssetMirror(image), true);
    await f.delivery.waitForAssetMirrors();
    assert.equal(calls, 4);
    assert.equal(fs.existsSync(path.join(f.temporary, 'asset-mirror-index.json')), false);
});

it('times out a hung loader, continues the queue, and rejects stale late work', async (t) => {
    let finish;
    const f = fixture(t, {}, { timeoutMs: 15 });
    f.delivery.queueAssetMirror(source('hung', Buffer.from('png'), { load: () => new Promise((done) => { finish = done; }) }));
    f.delivery.queueAssetMirror(source('ok'));
    await f.delivery.waitForAssetMirrors();
    assert.equal(f.delivery.status().failed, 1);
    assert.equal(f.objects.size, 1);
    finish(Readable.from([Buffer.from('png')]));
    await new Promise(setImmediate);
    assert.equal(f.objects.size, 1);
});

it('rejects truncated or oversized streams without publishing a mirror', async (t) => {
    const f = fixture(t, {}, { maxBytes: 8 });
    f.delivery.queueAssetMirror(source('truncated', Buffer.from('png'), { load: () => Readable.from([Buffer.from('x')]) }));
    f.delivery.queueAssetMirror(source('oversized', Buffer.from('png'), { load: () => Readable.from([Buffer.alloc(9)]) }));
    await f.delivery.waitForAssetMirrors();
    assert.equal(f.calls.length, 0);
    assert.equal(f.delivery.status().failed, 2);
});

function releaseFixture(t) {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-release-test-')));
    t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
    const publicRoot = path.join(directory, 'packages/ui-default/public');
    fs.mkdirSync(path.join(publicRoot, 'scratch-editor'), { recursive: true });
    fs.writeFileSync(path.join(publicRoot, 'app.js'), 'const release = 1;');
    fs.writeFileSync(path.join(publicRoot, 'scratch-editor/editor.html'), '<!doctype html>');
    fs.writeFileSync(path.join(publicRoot, 'scratch-editor/source.tar.gz'), 'source fixture');
    fs.writeFileSync(path.join(publicRoot, 'scratch-editor/UPSTREAM-LICENSE'), 'license fixture');
    const scratchHash = createHash('sha256').update('<!doctype html>').digest('hex');
    fs.writeFileSync(path.join(publicRoot, 'manifest.json'), JSON.stringify({ app: '/app.js?abc', map: '/app.js.map' }));
    fs.writeFileSync(path.join(publicRoot, 'scratch-editor/build-manifest.json'), JSON.stringify({ files: { 'editor.html': scratchHash,
        'source.tar.gz': createHash('sha256').update('source fixture').digest('hex'),
        'UPSTREAM-LICENSE': createHash('sha256').update('license fixture').digest('hex') } }));
    const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
    git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-qm', 'fixture');
    return { directory, publicRoot, git };
}

it('release planner combines both manifests, excludes arbitrary files, and rejects dirty assets', async (t) => {
    const { collectRelease } = await import(pathToFileURL(path.join(root, 'build/assets/sync.mjs')));
    const f = releaseFixture(t);
    fs.writeFileSync(path.join(f.publicRoot, 'private-backup.json'), 'private');
    const plan = await collectRelease(f.publicRoot, 'test-v1', f.directory);
    assert.deepEqual(plan.files.map((file) => file.path), ['app.js', 'manifest.json', 'scratch-editor/UPSTREAM-LICENSE',
        'scratch-editor/build-manifest.json', 'scratch-editor/editor.html', 'scratch-editor/source.tar.gz']);
    assert.equal(plan.files[0].cacheControl, 'public, max-age=31536000, immutable');
    assert.equal(plan.files.find((file) => file.path === 'scratch-editor/editor.html').cacheControl, 'public, max-age=300');
    assert.equal(plan.files[0].contentType, 'text/javascript');
    await assert.rejects(() => collectRelease(f.directory, 'test-v1', f.directory), /Source must/);
    fs.appendFileSync(path.join(f.publicRoot, 'app.js'), 'changed');
    await assert.rejects(() => collectRelease(f.publicRoot, 'test-v1', f.directory), /Commit the prepared/);
});

it('release upload validates metadata, is idempotent, and refuses overwriting an existing version', async (t) => {
    const { collectRelease, uploadRelease } = await import(pathToFileURL(path.join(root, 'build/assets/sync.mjs')));
    const f = releaseFixture(t);
    const plan = await collectRelease(f.publicRoot, 'test-v1', f.directory);
    const objects = new Map();
    let puts = 0;
    const client = { async send(command) {
        const item = command.input;
        if (command.constructor.name === 'PutObjectCommand') {
            puts++;
            for await (const chunk of item.Body) assert.ok(chunk.length);
            objects.set(item.Key, { ContentLength: item.ContentLength, ContentType: item.ContentType, CacheControl: item.CacheControl, Metadata: item.Metadata });
            return {};
        }
        if (!objects.has(item.Key)) throw Object.assign(new Error('missing'), { name: 'NotFound' });
        return objects.get(item.Key);
    } };
    assert.equal(await uploadRelease(plan, f.publicRoot, { bucket: 'test' }, client), plan.files.length);
    assert.equal(await uploadRelease(plan, f.publicRoot, { bucket: 'test' }, client), 0);
    assert.equal(puts, plan.files.length);
    objects.get(plan.files[0].key).Metadata.sha256 = 'wrong';
    await assert.rejects(() => uploadRelease(plan, f.publicRoot, { bucket: 'test' }, client), /already occupied/);
    assert.equal(puts, plan.files.length);
});

const backfillModule = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, 'build/assets/backfill.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module: backfillModule, exports: backfillModule.exports, require: appRequire, process,
});
const backfill = backfillModule.exports.run;
function backfillDependencies(records, overrides = {}) {
    const calls = [];
    const remote = { key: `media/v1/${'b'.repeat(64)}.png`, sha256: 'c'.repeat(64), size: 3, contentType: 'image/png', bucket: 'test', region: 'test' };
    const dependencies = { eligibleAsset: (filename) => filename.endsWith('.png'), storage: {
        coll: { find: (query) => ({ sort: () => ({ limit: (count) => (async function* iterator() {
            for (const record of records.filter((item) => !query._id || item._id > query._id.$gt).slice(0, count)) yield record;
        }()) }) }) },
        async migrateToRemote(id) { calls.push(['migrate', id]); const record = records.find((item) => item._id === id);
            record.remoteAsset = remote; return { status: 'migrated', remoteAsset: remote, physicalId: record.link || id }; },
        async cleanupLocalMirror(id) { calls.push(['cleanup', id]); return records.filter((item) => item._id === id || item.link === id).every((item) => !!item.remoteAsset); },
        ...overrides,
    } };
    return { dependencies, calls, remote };
}

it('backfill dry-run does not upload, edit records, create a journal, or clean any files', async (t) => {
    const f = fixture(t);
    const records = [{ _id: 'a', path: 'domain/a/avatar.png', size: 3 }, { _id: 'b', path: 'problem/a/private.in', size: 99 }];
    const b = backfillDependencies(records);
    const manifestPath = path.join(f.temporary, 'dry-run.jsonl');
    const result = await backfill({ manifestPath, limit: 1 }, b.dependencies);
    assert.equal(result.candidates, 1);
    assert.equal(result.hasMore, true);
    assert.equal(result.nextId, 'a');
    assert.equal(b.calls.length, 0);
    assert.equal(records[0].remoteAsset, undefined);
    assert.equal(fs.existsSync(manifestPath), false);
});

it('backfill journals both sides of migration before cleanup and preserves unmigrated aliases', async (t) => {
    const f = fixture(t);
    const records = [{ _id: 'a', path: 'domain/a/avatar.png', size: 3 }, { _id: 'b', path: 'private/old.in', link: 'a', size: 3 }];
    const b = backfillDependencies(records);
    const manifestPath = path.join(f.temporary, 'backfill.jsonl');
    const result = await backfill({ apply: true, cleanup: true, manifestPath }, b.dependencies);
    assert.deepEqual(b.calls, [['migrate', 'a'], ['cleanup', 'a']]);
    assert.equal(result.localDeleted, 0);
    assert.equal(result.localRetained, 1);
    assert.equal(fs.statSync(manifestPath).mode & 0o777, 0o600);
    const journal = fs.readFileSync(manifestPath, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(journal.map((event) => event.event), ['begin', 'before', 'after', 'local-cleanup-intent', 'local-cleanup-result', 'complete']);
    assert.equal(journal[1].record.remoteAsset, undefined);
    assert.equal(journal[2].result.remoteAsset.key, b.remote.key);
});

it('backfill stops on migration errors and never removes another active run lock', async (t) => {
    const f = fixture(t);
    const b = backfillDependencies([{ _id: 'a', path: 'domain/a/avatar.png', size: 3 }], {
        async migrateToRemote() { throw new Error('SDK failure with credentials that must not be printed'); },
    });
    const manifestPath = path.join(f.temporary, 'backfill.jsonl');
    await assert.rejects(() => backfill({ apply: true, cleanup: true, manifestPath }, b.dependencies), /Asset backfill stopped/);
    assert.equal(b.calls.length, 0);
    assert.equal(fs.existsSync(`${manifestPath}.lock`), false);
    assert.equal(fs.readFileSync(manifestPath, 'utf8').includes('credentials'), false);
    fs.writeFileSync(`${manifestPath}.lock`, 'another-process');
    await assert.rejects(() => backfill({ apply: true, manifestPath }, b.dependencies));
    assert.equal(fs.readFileSync(`${manifestPath}.lock`, 'utf8'), 'another-process');
});

it('separate cleanup recovers old alias identities from the verified apply journal without uploading', async (t) => {
    const f = fixture(t);
    const b = backfillDependencies([{ _id: 'alias', path: 'domain/a/avatar.png', size: 3 }]);
    b.dependencies.storage.migrateToRemote = async () => { throw new Error('cleanup must not migrate'); };
    const manifestPath = path.join(f.temporary, 'backfill.jsonl');
    fs.writeFileSync(manifestPath, `${JSON.stringify({ event: 'after', physicalId: 'original/file.png', result: { status: 'migrated', remoteAsset: b.remote } })}\n`);
    const result = await backfill({ apply: true, cleanup: true, cleanupOnly: true, manifestPath }, b.dependencies);
    assert.deepEqual(b.calls, [['cleanup', 'original/file.png']]);
    assert.equal(result.migrated, 0);
    assert.equal(result.localDeleted, 1);
});

it('cleanup can recover a committed migration marker when a crash prevented the after journal event', async (t) => {
    const f = fixture(t);
    const record = { _id: 'alias', path: 'domain/a/avatar.png', size: 3, localMirrorId: 'old/physical.png', remoteAsset: { key: 'verified' } };
    const b = backfillDependencies([record], {
        async migrateToRemote() { return { status: 'remote', physicalId: record.localMirrorId, remoteAsset: record.remoteAsset }; },
    });
    const manifestPath = path.join(f.temporary, 'recovery.jsonl');
    const result = await backfill({ apply: true, cleanup: true, cleanupOnly: true, manifestPath }, b.dependencies);
    assert.deepEqual(b.calls, [['cleanup', 'old/physical.png']]);
    assert.equal(result.alreadyRemote, 1);
    assert.equal(result.migrated, 0);
    const events = fs.readFileSync(manifestPath, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(events.find((event) => event.event === 'before').physicalId, 'old/physical.png');
});

it('publishes only explicit selected-poster copies under static and preserves the private original', async (t) => {
    const f = fixture(t);
    const image = source('home-poster-123', Buffer.from('png'), { decoration: 'home-poster' });
    image.meta.remoteAsset = { key: `media/v1/${'a'.repeat(64)}.png`, sha256: 'b'.repeat(64), size: 3,
        contentType: 'image/png', bucket: f.config.bucket, region: f.config.region };
    assert.equal(f.delivery.tryRedirectAsset(handler(), image), false);
    await f.delivery.waitForAssetMirrors();
    const h = handler();
    assert.equal(f.delivery.tryRedirectAsset(h, image), true);
    assert.match(h.response.redirect, /^https:\/\/static.example.com\/static\/home-posters\/v1\/[a-f0-9]{64}\.png$/);
    assert.equal(h.response.headers['Cache-Control'], 'public, max-age=300');
    assert.equal(f.calls[0].input.CacheControl, 'public, max-age=31536000, immutable');
    assert.equal(f.calls.filter((call) => call.constructor.name === 'PutObjectCommand').length, 1);
    const again = handler();
    assert.equal(f.make().tryRedirectAsset(again, image), true);
    assert.equal(again.response.redirect, h.response.redirect, 'public immutable URL is stable after restart');
    assert.equal(f.delivery.tryRedirectAsset(handler(), source('private-file', Buffer.from('png'), { decoration: 'home-poster' })), false);
    assert.equal(f.delivery.queueAssetMirror({ ...image, path: 'scratch/a/aaaaaaaaaaaaaaaaaaaaaaaa.png' }), false);
});

it('keeps decorative badge copies signed with short session-varying browser cache; ordinary media stays no-store', async (t) => {
    const f = fixture(t);
    const image = source('unused', Buffer.from('png'), { path: 'badge/42/profile-background-123.png', decoration: 'badge' });
    assert.equal(f.delivery.tryRedirectAsset(handler(), image), false);
    await f.delivery.waitForAssetMirrors();
    const h = handler();
    assert.equal(f.delivery.tryRedirectAsset(h, image), true);
    assert.match(h.response.redirect, /\/media\/decorations\/v1\/[a-f0-9]{64}\.png\?auth_key=/);
    assert.equal(h.response.headers['Cache-Control'], 'private, max-age=300');
    assert.equal(h.response.headers.Vary, 'Cookie, Authorization');
    assert.equal(f.calls[0].input.CacheControl, 'private, max-age=300');
    const ordinary = { ...image, decoration: undefined };
    assert.equal(f.delivery.tryRedirectAsset(handler(), ordinary), false, 'ordinary requests cannot reuse decorative cache entries');
    await f.delivery.waitForAssetMirrors();
    const privateResponse = handler();
    assert.equal(f.delivery.tryRedirectAsset(privateResponse, ordinary), true);
    assert.equal(privateResponse.response.headers['Cache-Control'], 'private, no-store');
});

it('mirrors and signs validated sprite3 archives without making other archive paths eligible', async (t) => {
    const f = fixture(t);
    const bytes = Buffer.from('validated sprite3 archive');
    const sprite = source('unused', bytes, { path: `scratch/lesson/${'e'.repeat(24)}.sprite3`,
        meta: { etag: 'immutable-sprite', size: bytes.length, 'Content-Type': 'application/octet-stream' }, contentDisposition: 'attachment' });
    assert.equal(f.delivery.queueAssetMirror(sprite), true);
    await f.delivery.waitForAssetMirrors();
    const reply = handler();
    assert.equal(f.delivery.tryRedirectAsset(reply, sprite), true);
    assert.match(new URL(reply.response.redirect).pathname, /\.sprite3$/);
    assert.equal(reply.response.headers['Cache-Control'], 'private, no-store');
    const remote = { key: `media/v1/${'f'.repeat(64)}.sprite3`, sha256: 'a'.repeat(64), size: bytes.length,
        contentType: 'application/octet-stream', bucket: f.config.bucket, region: f.config.region };
    assert.equal(f.delivery.tryRedirectAsset(handler(), { ...sprite, meta: { ...sprite.meta, remoteAsset: remote } }), true);
    assert.equal(f.delivery.queueAssetMirror({ ...sprite, path: 'user/1/role.sprite3' }), false);
    assert.equal(f.delivery.queueAssetMirror({ ...sprite, meta: { ...sprite.meta, size: 20 * 1024 * 1024 + 1 } }), false);
});
