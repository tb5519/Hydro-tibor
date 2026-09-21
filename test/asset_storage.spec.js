const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { Readable } = require('node:stream');
const vm = require('node:vm');
const { before, beforeEach, after, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '..');
const appRequire = createRequire(path.join(root, 'packages/hydrooj/package.json'));
function load(filename, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, filename), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, process, Buffer, URL, AbortSignal,
        require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : appRequire(name),
    });
    return module.exports;
}
const assetModule = load('packages/hydrooj/src/lib/asset_storage.ts');
const { AssetStorage, eligibleAsset } = assetModule;
const { createAssetStorageModel } = load('packages/hydrooj/src/lib/asset_storage_model.ts', {
    './asset_storage': assetModule,
    './mime': (filename) => appRequire('mime-types').lookup(filename) || 'application/octet-stream',
});
let mongo;
let client;
let database;
let temporary;
let configPath;
let config;
let remote;
let model;
let objects;
let local;
let calls;
let signed;
let fault;
let getBody;
let factoryDeps;
let s3Client;
const projectPath = `scratch/lesson/${'a'.repeat(24)}.sb3`;
const imagePath = 'training/course/123/cat.png';
async function bytes(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
}
function writeConfig(changes = {}) {
    Object.assign(config, changes);
    fs.writeFileSync(configPath, JSON.stringify(config));
}
const sleepTurn = () => new Promise(setImmediate);
before(async () => {
    mongo = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongo.getUri());
    database = client.db('primary_storage_test');
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-primary-test-'));
    configPath = path.join(temporary, 'assets.json');
});
beforeEach(async () => {
    await database.dropDatabase();
    objects = new Map(); local = new Map(); calls = []; signed = []; fault = null; getBody = null;
    config = { enabled: true, storageEnabled: true, bucket: 'test-media', region: 'cn-wulanchabu',
        endpoint: 'https://s3.oss-cn-wulanchabu.aliyuncs.com', accessKeyId: 'fixture-id', secretAccessKey: 'fixture-secret' };
    writeConfig();
    const s3 = { async send(command) {
        const kind = command.constructor.name;
        const input = command.input;
        calls.push({ kind, input });
        if (fault) await fault(kind, input);
        if (kind === 'PutObjectCommand') {
            const body = Buffer.isBuffer(input.Body) ? input.Body : await bytes(input.Body);
            assert.equal(body.length, input.ContentLength);
            assert.equal(createHash('md5').update(body).digest('base64'), input.ContentMD5);
            objects.set(input.Key, { body, input });
            return {};
        }
        if (kind === 'HeadObjectCommand') {
            const object = objects.get(input.Key);
            return { ContentLength: object?.body.length, ContentType: object?.input.ContentType, Metadata: object?.input.Metadata };
        }
        if (kind === 'GetObjectCommand') {
            if (getBody) return { Body: getBody };
            const object = objects.get(input.Key);
            if (!object) throw new Error('NoSuchKey');
            return { Body: Readable.from([object.body]) };
        }
        if (kind === 'DeleteObjectCommand') { objects.delete(input.Key); return {}; }
        throw new Error(`Unexpected S3 command ${kind}`);
    } };
    s3Client = s3;
    remote = new AssetStorage({ configPath, client: () => s3, sign: async (_client, command, options) => {
        signed.push({ command, options });
        return `https://test-media.s3.example/${command.input.Key}?X-Amz-Signature=fixture`;
    } });
    const storage = {
        async put(id, file, meta) {
            local.set(id, { body: typeof file === 'string' ? fs.readFileSync(file) : Buffer.isBuffer(file) ? file : await bytes(file), meta });
        },
        async get(id, savePath) {
            const body = local.get(id)?.body;
            if (!body) throw new Error('Local file missing');
            if (savePath) fs.writeFileSync(savePath, body);
            return Readable.from([body]);
        },
        async getMeta(id) { const object = local.get(id); return { size: object.body.length, etag: id, metaData: object.meta }; },
        async del(id) { local.delete(id); },
        async signDownloadLink(id) { return `/fs/${id}`; },
    };
    factoryDeps = { coll: database.collection('storage'), assets: database.collection('storage.asset'), storage, assetStorage: remote };
    model = createAssetStorageModel(factoryDeps);
});
after(async () => {
    await client?.close(); await mongo?.stop();
    fs.rmSync(temporary, { recursive: true, force: true });
});

it('requires an exact media business path and matching MIME/extension, excluding Judge and arbitrary attachments', () => {
    for (const filename of [imagePath, 'problem/main/1/additional_file/cat.png', 'contest/main/1/public/cat.png',
        'user/12/.avatar.png', 'user/12/lesson.png', 'domain/main/avatar-12345678-1234-1234-1234-123456789abc.png',
        'domain/main/home-poster-1234.png', 'badge/12/profile-background-123.png',
        'domain/main/badge/12/ac-effect-123.png', 'system/point-lottery/lottery-prize-123-1-abc.png']) {
        assert.equal(eligibleAsset(filename, 'image/png'), true, filename);
    }
    assert.equal(eligibleAsset(projectPath, 'application/octet-stream'), true);
    assert.equal(eligibleAsset('badge/12/theme-sound-123.m4a', 'audio/mp4'), true);
    for (const filename of ['problem/main/1/testdata/cat.png', 'submission/12/cat.png', 'contest/main/1/private/cat.png',
        'misc/cat.png', 'training/a/b/../cat.png', 'training/a/b/%2e%2e.png', 'scratch/a/arbitrary.sb3',
        'training/a/b/notes.pdf', 'training/a/b/code.cpp', 'training/a/b/video.mp4']) {
        assert.equal(eligibleAsset(filename, filename.endsWith('.sb3') ? 'application/octet-stream' : 'image/png'), false, filename);
    }
    assert.equal(eligibleAsset(imagePath, 'text/html'), false);
});

it('writes only selected files to verified OSS and exposes the descriptor without local duplicate bytes', async () => {
    await model.put(projectPath, Buffer.from('project bytes'), 20);
    const record = await model.coll.findOne({ path: projectPath });
    assert.equal(local.size, 0);
    assert.equal(objects.size, 1);
    assert.equal(record.remoteAsset.contentType, 'application/octet-stream');
    assert.match(record.remoteAsset.key, /^media\/v1\/[a-f0-9]{64}\.sb3$/);
    assert.equal(record.remoteAsset.sha256, createHash('sha256').update('project bytes').digest('hex'));
    assert.deepEqual((await model.getMeta(projectPath)).remoteAsset, record.remoteAsset);
    assert.deepEqual(calls.slice(0, 2).map((call) => call.kind), ['PutObjectCommand', 'HeadObjectCommand']);
    await model.put('problem/main/1/testdata/image.png', Buffer.from('judge data'));
    assert.equal(local.size, 1);
    assert.equal(objects.size, 1);
});

it('supports file and streaming uploads while removing temporary spool files', async () => {
    const file = path.join(temporary, 'source.png');
    fs.writeFileSync(file, 'file data');
    await model.put(imagePath, file);
    await model.put('user/20/sound.mp3', Readable.from([Buffer.from('part one'), Buffer.from('part two')]));
    const puts = calls.filter((call) => call.kind === 'PutObjectCommand');
    assert.equal(puts.length, 2);
    assert.equal(Buffer.isBuffer(puts[1].input.Body), false);
    assert.equal(fs.existsSync(puts[1].input.Body.path), false);
    assert.equal(objects.get(puts[1].input.Key).body.toString(), 'part onepart two');
});

it('disabled new writes keep local behavior but disabling both switches never strands existing remote bytes', async () => {
    await model.put(projectPath, Buffer.from('saved'));
    writeConfig({ enabled: false, storageEnabled: false });
    assert.equal((await bytes(await model.get(projectPath))).toString(), 'saved');
    await model.put(imagePath, Buffer.from('local'));
    assert.equal(local.size, 1);
    const url = await model.signDownloadLink(projectPath, '作品 名称.sb3', true, 'user');
    assert.match(url, /^https:\/\//);
    assert.equal(signed[0].options.expiresIn, 600);
    assert.match(signed[0].command.input.ResponseContentDisposition, /filename\*=UTF-8''%E4%BD%9C/);
    writeConfig({ storageEnabled: true }); // CDN is independently disabled.
    await model.put('user/20/image.png', Buffer.from('primary'));
    assert.equal(objects.size, 2);
});

it('rejects incorrect bucket/region and never falls back to a stale local file', async () => {
    await model.put(projectPath, Buffer.from('saved'));
    writeConfig({ bucket: 'wrong-bucket' });
    await assert.rejects(model.get(projectPath), /bucket and region/);
    await assert.rejects(model.signDownloadLink(projectPath), /bucket and region/);
    writeConfig({ bucket: 'test-media', region: 'wrong-region' });
    await assert.rejects(model.get(projectPath), /bucket and region/);
});

it('upload failure preserves the active previous version and does not silently grow local storage', async () => {
    await model.put(imagePath, Buffer.from('before'));
    const original = await model.coll.findOne({ path: imagePath });
    fault = async (kind) => { if (kind === 'PutObjectCommand') throw new Error('OSS offline'); };
    await assert.rejects(model.put(imagePath, Buffer.from('after')), /OSS offline/);
    assert.equal((await model.coll.findOne({ _id: original._id })).autoDelete, undefined);
    assert.equal((await bytes(await model.get(imagePath))).toString(), 'before');
    assert.equal(local.size, 0);
    assert.equal(objects.size, 1);
});

it('HEAD mismatch rejects publication and cleans an uploaded object, retaining the previous active version', async () => {
    await model.put(imagePath, Buffer.from('before'));
    fault = async (kind, input) => {
        if (kind === 'HeadObjectCommand') objects.get(input.Key).input.Metadata.sha256 = '0'.repeat(64);
    };
    await assert.rejects(model.put(imagePath, Buffer.from('after')), /verification failed/);
    assert.equal(await model.coll.countDocuments({ path: imagePath, autoDelete: null }), 1);
    assert.equal(objects.size, 1);
});

it('a metadata insertion failure removes the orphan OSS object and does not retire the old version', async () => {
    await model.put(imagePath, Buffer.from('before'));
    const insert = model.coll.insertOne.bind(model.coll);
    model.coll.insertOne = async () => { throw new Error('DB write failed'); };
    await assert.rejects(model.put(imagePath, Buffer.from('after')), /DB write failed/);
    model.coll.insertOne = insert;
    assert.equal(objects.size, 1);
    assert.equal(await model.coll.countDocuments({ path: imagePath, autoDelete: null }), 1);
});

it('an uncertain DB acknowledgement never deletes bytes which the database already references', async () => {
    const insert = model.coll.insertOne.bind(model.coll);
    model.coll.insertOne = async (doc) => { await insert(doc); throw new Error('Lost DB acknowledgement'); };
    await assert.rejects(model.put(imagePath, Buffer.from('saved')), /Lost DB acknowledgement/);
    model.coll.insertOne = insert;
    assert.equal(objects.size, 1);
    assert.equal((await bytes(await model.get(imagePath))).toString(), 'saved');
});

it('failed orphan cleanup remains retryable through the registry', async () => {
    model.coll.insertOne = async () => { throw new Error('DB down'); };
    fault = async (kind) => { if (kind === 'DeleteObjectCommand') throw new Error('delete offline'); };
    await assert.rejects(model.put(imagePath, Buffer.from('orphan')), /DB down/);
    assert.equal(objects.size, 1);
    assert.equal(await model.assets.countDocuments({ state: 'ready', writers: 0 }), 1);
    fault = null;
    await model.cleanFiles();
    assert.equal(objects.size, 0);
});

it('returns the original OSS stream and propagates errors, with partial download files removed', async () => {
    await model.put(imagePath, Buffer.from('saved'));
    getBody = new Readable({ read() {} });
    assert.equal(await model.get(imagePath), getBody);
    getBody.destroy();
    getBody = Readable.from((async function* () { yield Buffer.from('partial'); throw new Error('stream failed'); })());
    await assert.rejects(bytes(await model.get(imagePath)), /stream failed/);
    getBody = Readable.from((async function* () { yield Buffer.from('partial'); throw new Error('stream failed'); })());
    const target = path.join(temporary, 'partial-download');
    await assert.rejects(model.get(imagePath, target), /stream failed/);
    assert.equal(fs.existsSync(target), false);
});

it('copy shares one remote object, preserves seven-day retained references, and deletes only the last expired reference', async () => {
    await model.put(imagePath, Buffer.from('shared'));
    await model.copy(imagePath, 'user/20/copied.png');
    assert.equal(objects.size, 1);
    const records = await model.coll.find().toArray();
    assert.equal(records[0].remoteAsset.key, records[1].remoteAsset.key);
    assert.equal(records[1].link, undefined);
    await model.del([imagePath]);
    const deleted = await model.coll.findOne({ path: imagePath });
    assert(deleted.autoDelete.getTime() > Date.now() + 6.9 * 86400000);
    await model.cleanFiles();
    assert.equal(objects.size, 1);
    await model.coll.updateOne({ path: imagePath }, { $set: { autoDelete: new Date(0) } });
    await model.cleanFiles();
    assert.equal(objects.size, 1);
    assert.equal((await bytes(await model.get('user/20/copied.png'))).toString(), 'shared');
    await model.del(['user/20/copied.png']);
    await model.coll.updateOne({ path: 'user/20/copied.png' }, { $set: { autoDelete: new Date(0) } });
    await model.cleanFiles();
    assert.equal(objects.size, 0);
    assert.equal(await model.coll.countDocuments(), 0);
});

it('network deletion failure keeps the expired record and retries safely', async () => {
    await model.put(imagePath, Buffer.from('saved'));
    await model.coll.updateOne({ path: imagePath }, { $set: { autoDelete: new Date(0) } });
    fault = async (kind) => { if (kind === 'DeleteObjectCommand') throw new Error('delete offline'); };
    await assert.rejects(model.cleanFiles(), /delete offline/);
    assert.equal(await model.coll.countDocuments(), 1);
    assert.equal(objects.size, 1);
    fault = null;
    await model.cleanFiles();
    assert.equal(await model.coll.countDocuments(), 0);
    assert.equal(objects.size, 0);
});

it('GC cannot remove an object while a copy is between acquiring its writer gate and inserting its reference', async () => {
    await model.put(imagePath, Buffer.from('saved'));
    const insert = model.coll.insertOne.bind(model.coll);
    let proceed; let entered;
    const pending = new Promise((resolve) => { entered = resolve; });
    model.coll.insertOne = async (doc) => {
        if (doc.path === 'user/20/copied.png') { entered(); await new Promise((resolve) => { proceed = resolve; }); }
        return insert(doc);
    };
    const copying = model.copy(imagePath, 'user/20/copied.png');
    await pending;
    await model.coll.updateOne({ path: imagePath }, { $set: { autoDelete: new Date(0) } });
    await model.cleanFiles();
    assert.equal(objects.size, 1);
    assert.equal(await model.coll.countDocuments({ path: imagePath }), 1);
    proceed(); await copying;
    await model.cleanFiles();
    assert.equal((await bytes(await model.get('user/20/copied.png'))).toString(), 'saved');
});

it('a copy that read an old source before GC cannot resurrect a deleted object', async () => {
    await model.put(imagePath, Buffer.from('saved'));
    const update = model.assets.updateOne.bind(model.assets);
    let once = true;
    model.assets.updateOne = async (filter, change, options) => {
        if (once && change.$inc?.writers === 1) {
            once = false;
            await model.coll.updateOne({ path: imagePath }, { $set: { autoDelete: new Date(0) } });
            await model.cleanFiles();
        }
        return update(filter, change, options);
    };
    await assert.rejects(model.copy(imagePath, 'user/20/copied.png'), /being removed/);
    assert.equal(objects.size, 0);
    assert.equal(await model.coll.countDocuments(), 0);
});

it('legacy local copies retain original bytes until every local reference has expired', async () => {
    writeConfig({ storageEnabled: false });
    await model.put(imagePath, Buffer.from('local shared'));
    await model.copy(imagePath, 'user/20/copied.png');
    const original = await model.coll.findOne({ path: imagePath });
    await model.coll.updateOne({ _id: original._id }, { $set: { autoDelete: new Date(0) } });
    await model.cleanFiles();
    assert.equal(local.size, 1);
    assert.equal((await bytes(await model.get('user/20/copied.png'))).toString(), 'local shared');
    await model.coll.updateOne({ path: 'user/20/copied.png' }, { $set: { autoDelete: new Date(0) } });
    await model.cleanFiles();
    assert.equal(local.size, 0);
});

it('migration targets exact record IDs, preserves retained metadata, and removes local bytes only after every alias migrated', async () => {
    writeConfig({ storageEnabled: false });
    await model.put(imagePath, Buffer.from('original'), 20);
    await model.copy(imagePath, 'user/20/copied.png');
    const original = await model.coll.findOne({ path: imagePath });
    const copy = await model.coll.findOne({ path: 'user/20/copied.png' });
    await model.put(imagePath, Buffer.from('newer'), 21);
    const retained = await model.coll.findOne({ _id: original._id });
    writeConfig({ storageEnabled: true });
    const migrated = await model.migrateToRemote(original._id);
    assert.equal(migrated.status, 'migrated');
    const updated = await model.coll.findOne({ _id: original._id });
    assert.equal(updated.autoDelete.getTime(), retained.autoDelete.getTime());
    assert.equal(updated.lastModified.getTime(), retained.lastModified.getTime());
    assert.equal(updated.owner, 20);
    assert.equal(await model.cleanupLocalMirror(original._id), false);
    await model.migrateToRemote(copy._id);
    assert.equal(await model.cleanupLocalMirror(original._id), true);
    assert.equal(local.has(original._id), false);
    assert.equal((await bytes(await model.get('user/20/copied.png'))).toString(), 'original');
    assert.equal((await bytes(await model.get(imagePath))).toString(), 'newer');
    assert.equal((await model.migrateToRemote(original._id)).status, 'remote');
});

it('migration failure keeps local metadata and bytes available', async () => {
    writeConfig({ storageEnabled: false });
    await model.put(imagePath, Buffer.from('source'));
    const original = await model.coll.findOne({ path: imagePath });
    writeConfig({ storageEnabled: true });
    fault = async (kind) => { if (kind === 'PutObjectCommand') throw new Error('upload offline'); };
    await assert.rejects(model.migrateToRemote(original._id), /upload offline/);
    assert.equal((await model.coll.findOne({ _id: original._id })).remoteAsset, undefined);
    assert.equal((await bytes(await model.get(imagePath))).toString(), 'source');
    assert.equal(await model.cleanupLocalMirror(original._id), false);
});

it('cleanup refuses to unlink a local original while a copy writer is active', async () => {
    writeConfig({ storageEnabled: false });
    await model.put(imagePath, Buffer.from('source'));
    const original = await model.coll.findOne({ path: imagePath });
    const insert = model.coll.insertOne.bind(model.coll);
    let proceed; let entered;
    const pending = new Promise((resolve) => { entered = resolve; });
    model.coll.insertOne = async (doc) => { entered(); await new Promise((resolve) => { proceed = resolve; }); return insert(doc); };
    const copying = model.copy(imagePath, 'user/20/copied.png');
    await pending;
    assert.equal(await model.cleanupLocalMirror(original._id), false);
    proceed(); await copying;
    assert.equal(local.size, 1);
    await sleepTurn();
});

it('resumed cleanup recovers the original physical identity after alias migration and verifies remote bytes again', async () => {
    writeConfig({ storageEnabled: false });
    await model.put(imagePath, Buffer.from('source'));
    await model.copy(imagePath, 'user/20/copied.png');
    const original = await model.coll.findOne({ path: imagePath });
    const alias = await model.coll.findOne({ path: 'user/20/copied.png' });
    await model.coll.updateOne({ _id: original._id }, { $set: { autoDelete: new Date(0) } });
    await model.cleanFiles();
    writeConfig({ storageEnabled: true });
    await model.migrateToRemote(alias._id);
    const resumed = await model.migrateToRemote(alias._id);
    assert.equal(resumed.physicalId, original._id);
    assert.equal((await model.coll.findOne({ _id: alias._id })).localMirrorId, original._id);
    const object = objects.get(resumed.remoteAsset.key);
    objects.delete(resumed.remoteAsset.key);
    await assert.rejects(model.cleanupLocalMirror(original._id), /verification failed/);
    assert.equal(local.has(original._id), true);
    objects.set(resumed.remoteAsset.key, object);
    assert.equal(await model.cleanupLocalMirror(original._id), true);
    assert.equal((await model.coll.findOne({ _id: alias._id })).localMirrorId, undefined);
    assert.equal(await model.cleanupLocalMirror(original._id), true);
});

it('migration CAS rejects concurrent metadata changes and discards its unused remote object', async () => {
    writeConfig({ storageEnabled: false });
    await model.put(imagePath, Buffer.from('source'));
    const original = await model.coll.findOne({ path: imagePath });
    writeConfig({ storageEnabled: true });
    fault = async (kind) => {
        if (kind === 'HeadObjectCommand') await model.coll.updateOne({ _id: original._id }, { $set: { etag: 'concurrent-version' } });
    };
    await assert.rejects(model.migrateToRemote(original._id), /changed during migration/);
    assert.equal((await model.coll.findOne({ _id: original._id })).remoteAsset, undefined);
    assert.equal(local.size, 1);
    assert.equal(objects.size, 0);
});

it('a process known to have exited cannot leave a completed live object permanently locked', async () => {
    await model.put(imagePath, Buffer.from('source'));
    const gate = await model.assets.findOne({ remoteAsset: { $exists: true } });
    await model.assets.insertOne({ _id: 'process:old', process: { host: 'server', boot: 'boot', pid: 999, start: 'old' } });
    await model.assets.updateOne({ _id: gate._id }, { $set: { state: 'deleting', deletingOwner: 'old' } });
    model = createAssetStorageModel({ ...factoryDeps, ownerProcess: { host: 'server', boot: 'boot', pid: 1000, start: 'new' },
        isOwnerDead: (owner) => owner?.pid === 999 });
    await model.recoverAbandonedGates();
    await model.copy(imagePath, 'user/20/copied.png');
    assert.equal((await bytes(await model.get('user/20/copied.png'))).toString(), 'source');
});

it('GC releases only writers proven dead, retaining live or unknown process owners without age-based stealing', async () => {
    await model.put(imagePath, Buffer.from('source'));
    const gate = await model.assets.findOne({ remoteAsset: { $exists: true } });
    await model.assets.insertMany([
        { _id: 'process:old', process: { host: 'server', boot: 'boot', pid: 999, start: 'old' } },
        { _id: 'process:live', process: { host: 'server', boot: 'boot', pid: 1001, start: 'live' } },
    ]);
    await model.assets.updateOne({ _id: gate._id }, { $set: { writers: 3, writerOwners: { old: 1, live: 1, unknown: 1 } } });
    await model.coll.updateOne({ path: imagePath }, { $set: { autoDelete: new Date(0) } });
    model = createAssetStorageModel({ ...factoryDeps, ownerProcess: { host: 'server', boot: 'boot', pid: 1000, start: 'new' },
        isOwnerDead: (owner) => owner?.pid === 999 });
    await model.cleanFiles();
    const retained = await model.assets.findOne({ _id: gate._id });
    assert.equal(retained.writers, 2);
    assert.deepEqual(retained.writerOwners, { live: 1, unknown: 1 });
    assert.equal(objects.size, 1);
    await model.assets.updateOne({ _id: gate._id }, { $set: { writers: 1, writerOwners: { old: 1 } } });
    await model.cleanFiles();
    assert.equal(objects.size, 0);
});

it('invalid enabled storage configuration reports failure instead of silently reverting new writes to disk', async () => {
    writeConfig({ endpoint: 'http://insecure.example.test' });
    await assert.rejects(model.put(imagePath, Buffer.from('source')), /configuration is invalid/);
    assert.equal(local.size, 0);
    assert.equal(await model.coll.countDocuments(), 0);
});

it('limits in-flight uploads to two with a bounded queue and releases slots after failure', async () => {
    const service = new AssetStorage({ configPath, client: () => s3Client, concurrency: 2, queueLimit: 1 });
    let entered; const active = new Promise((resolve) => { entered = resolve; });
    const pending = [];
    fault = async (kind) => {
        if (kind !== 'PutObjectCommand') return;
        await new Promise((resolve) => { pending.push(resolve); if (pending.length === 2) entered(); });
    };
    const first = service.put(imagePath, Buffer.from('one'), 'image/png');
    const second = service.put(imagePath, Buffer.from('two'), 'image/png');
    await active;
    const third = service.put(imagePath, Buffer.from('three'), 'image/png');
    const rejectedInput = Readable.from([Buffer.from('four')]);
    await assert.rejects(service.put(imagePath, rejectedInput, 'image/png'), /uploads are busy/);
    assert.equal(rejectedInput.destroyed, true);
    assert.equal(calls.filter((call) => call.kind === 'PutObjectCommand').length, 2);
    fault = null;
    pending.forEach((resolve) => resolve());
    await Promise.all([first, second, third]);
    fault = async () => { throw new Error('network failed'); };
    await assert.rejects(service.put(imagePath, Buffer.from('bad'), 'image/png'), /network failed/);
    fault = null;
    await service.put(imagePath, Buffer.from('retry'), 'image/png');
});

it('removes failed or oversized stream spools and only reaps temporary owners proven to have exited', async () => {
    const tempRoot = fs.mkdtempSync(path.join(temporary, 'spools-'));
    const service = new AssetStorage({ configPath, client: () => s3Client, temporaryRoot: tempRoot, maxBytes: 4,
        ownerProcess: { host: 'server', boot: 'boot', pid: 1000, start: 'new' }, isOwnerDead: (owner) => owner?.pid === 999 });
    for (const [name, pid] of [['hydro-asset-Dead123', 999], ['hydro-asset-Live123', 1000]]) {
        const directory = path.join(tempRoot, name);
        fs.mkdirSync(directory);
        fs.writeFileSync(path.join(directory, 'owner.json'), JSON.stringify({ host: 'server', boot: 'boot', pid, start: 'old' }));
        fs.writeFileSync(path.join(directory, 'upload'), 'unfinished bytes');
    }
    await service.reapTemporaryUploads();
    assert.equal(fs.existsSync(path.join(tempRoot, 'hydro-asset-Dead123')), false);
    assert.equal(fs.existsSync(path.join(tempRoot, 'hydro-asset-Live123')), true);
    await assert.rejects(service.put(imagePath, Readable.from([Buffer.from('12345')]), 'image/png'), /size limit/);
    assert.deepEqual(fs.readdirSync(tempRoot), ['hydro-asset-Live123']);
    await assert.rejects(service.put(imagePath, Readable.from((async function* () { yield Buffer.from('x'); throw new Error('input broke'); })()), 'image/png'), /input broke/);
    assert.deepEqual(fs.readdirSync(tempRoot), ['hydro-asset-Live123']);
    assert.equal(calls.length, 0);
});

it('uses the optional internal endpoint only for server operations and always signs browser downloads with the public endpoint', async () => {
    const internalEndpoint = 'https://s3.oss-cn-wulanchabu-internal.aliyuncs.com';
    writeConfig({ internalEndpoint });
    const endpoints = [];
    const service = new AssetStorage({ configPath, client: (options) => { endpoints.push(options.endpoint); return s3Client; },
        sign: async () => 'https://browser-download.example.test/object' });
    const asset = await service.put(imagePath, Readable.from([Buffer.from('internal bytes')]), 'image/png');
    assert.deepEqual(endpoints, [internalEndpoint, internalEndpoint]); // PUT and verification HEAD
    assert.equal((await bytes(await service.get(asset))).toString(), 'internal bytes');
    assert.equal(endpoints.at(-1), internalEndpoint);
    writeConfig({ enabled: false, storageEnabled: false });
    await service.signDownloadLink(asset, 'image.png');
    assert.equal(endpoints.at(-1), config.endpoint);
    await service.verify(asset);
    assert.equal(endpoints.at(-1), internalEndpoint);
    await service.delete(asset);
    assert.equal(endpoints.at(-1), internalEndpoint);
    assert.equal(objects.size, 0);
});

it('fails closed for cross-region, non-HTTPS, credential-bearing or non-origin internal endpoint settings', async () => {
    const valid = 'https://s3.oss-cn-wulanchabu-internal.aliyuncs.com';
    for (const internalEndpoint of [
        '', null, '/internal', '//s3.oss-cn-wulanchabu-internal.aliyuncs.com',
        'http://s3.oss-cn-wulanchabu-internal.aliyuncs.com', 'https://s3.oss-cn-beijing-internal.aliyuncs.com',
        'https://s3.oss-cn-wulanchabu-internal.aliyuncs.com.evil.test',
        'https://user:password@s3.oss-cn-wulanchabu-internal.aliyuncs.com',
        `${valid}:444`, `${valid}/path`, `${valid}?query=1`, `${valid}#hash`, ` ${valid}`,
    ]) {
        writeConfig({ internalEndpoint });
        await assert.rejects(model.put(imagePath, Buffer.from('source')), /configuration is invalid/, String(internalEndpoint));
    }
    assert.equal(calls.length, 0);
    assert.equal(local.size, 0);
    writeConfig({ internalEndpoint: `${valid}/` });
    assert.equal(remote.shouldStore(imagePath, 'image/png'), true);
});

it('the real AWS presigner emits a public virtual-hosted URL even when the internal endpoint is configured', async () => {
    await model.put(projectPath, Buffer.from('saved project'));
    const file = await model.coll.findOne({ path: projectPath });
    writeConfig({ internalEndpoint: 'https://s3.oss-cn-wulanchabu-internal.aliyuncs.com' });
    const service = new AssetStorage({ configPath }); // Real SDK signing is local; no network request is made.
    const link = new URL(await service.signDownloadLink(file.remoteAsset, '作品.sb3'));
    assert.equal(link.protocol, 'https:');
    assert.equal(link.hostname, 'test-media.s3.oss-cn-wulanchabu.aliyuncs.com');
    assert.equal(link.pathname, `/${file.remoteAsset.key}`);
    assert.equal(link.searchParams.get('X-Amz-Expires'), '600');
    assert.match(link.searchParams.get('response-content-disposition'), /^attachment;/);
});

it('stores preset sprite3 archives only in immutable Scratch paths with private attachment metadata', async () => {
    const spritePath = `scratch/lesson/${'c'.repeat(24)}.sprite3`;
    assert.equal(eligibleAsset(spritePath, 'application/octet-stream'), true);
    assert.equal(eligibleAsset(spritePath, 'application/x.scratch.sprite3'), true);
    assert.equal(eligibleAsset(spritePath, 'image/png'), false);
    assert.equal(eligibleAsset('user/1/role.sprite3', 'application/octet-stream'), false);
    assert.equal(eligibleAsset(`scratch/lesson/${'c'.repeat(24)}.sprite3`, 'application/x.scratch.sb3'), false);
    const result = await remote.put(spritePath, Buffer.from('validated sprite3 archive'), 'application/octet-stream');
    assert.match(result.key, /\.sprite3$/);
    assert.equal(assetModule.validRemoteAsset(result), true);
    const put = calls.find((call) => call.kind === 'PutObjectCommand');
    assert.equal(put.input.ContentDisposition, 'attachment');
    assert.equal(put.input.CacheControl, 'private, max-age=0');
    await assert.rejects(remote.put(spritePath, Buffer.alloc(20 * 1024 * 1024 + 1), 'application/octet-stream'), /limit|large|size/i);
});
