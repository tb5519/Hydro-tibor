const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { before, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const AdmZip = require('adm-zip');
const { PNG } = require('pngjs');
const Koa = require('koa');
const request = require('supertest');
const root = path.resolve(__dirname, '..');
class PermissionError extends Error {}
class NotFoundError extends Error {}
class ValidationError extends Error {}
class CsrfTokenError extends Error {}
const errors = { PermissionError, NotFoundError, ValidationError, CsrfTokenError };
function load(relative, dependencies) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, relative), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, {
        module, exports: module.exports, Buffer, Blob, URL, Date, setTimeout,
        require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
    });
    return module.exports;
}
let mongod;
let client;
let database;
let model;
let handlers;
let scratchFiles;
let deleteDomainData;
let temp;
const blobs = new Map();
let counter = 0;
const teacher = { domainId: 'scratch-a', uid: 10, isTeacher: true };
const alice = { domainId: 'scratch-a', uid: 20, isTeacher: false };
const bob = { domainId: 'scratch-a', uid: 21, isTeacher: false };
const foreign = { domainId: 'scratch-b', uid: 20, isTeacher: true };
const project = (label = 'stage') => ({ targets: [{ isStage: true, name: label, variables: {}, lists: {}, broadcasts: {}, blocks: {}, costumes: [], sounds: [] }], extensions: [], meta: { semver: '3.0.0' } });
function upload(content = project(), extra = {}) {
    const zip = new AdmZip();
    zip.addFile('project.json', Buffer.from(JSON.stringify(content)));
    for (const [name, data] of Object.entries(extra)) zip.addFile(name, Buffer.from(data));
    const filepath = path.join(temp, `project-${counter++}.sb3`);
    zip.writeZip(filepath);
    return { filepath, originalFilename: '作品.sb3', size: fs.statSync(filepath).size };
}
function thumbnailData() {
    const png = new PNG({ width: 4, height: 4 });
    png.data.fill(255);
    const image = PNG.sync.write(png);
    return { image, data: `data:image/png;base64,${image.toString('base64')}` };
}
function thumbnailHandler(actor, workId) {
    return Object.assign(Object.create(handlers.ScratchThumbnailHandler.prototype), {
        actor, user: { _id: actor.uid }, response: {},
        request: { params: { workId: workId.toHexString() }, body: {} },
        url: (name, { fileId }) => `/${name}/${fileId}`, limitRate: async () => {},
    });
}
before(async () => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scratch-backend-test-'));
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    database = client.db('scratch_test');
    const db = {
        collection: (name) => database.collection(name),
        ensureIndexes: (collection, ...indexes) => collection.createIndexes(indexes),
    };
    const storage = {
        put: async (key, filepath) => { blobs.set(key, Buffer.isBuffer(filepath) ? filepath : fs.readFileSync(filepath)); },
        del: async (keys) => { keys.forEach((key) => blobs.delete(key)); },
        copy: async (source, dest) => { assert(blobs.has(source)); blobs.set(dest, Buffer.from(blobs.get(source))); },
        get: async (key) => blobs.get(key),
    };
    scratchFiles = load('packages/hydrooj/src/lib/scratch_files.ts', { '../error': errors });
    model = load('packages/hydrooj/src/model/scratch.ts', {
        '../context': {}, '../error': errors, '../lib/scratch_files': scratchFiles, '../logger': { Logger: class { warn() {} } },
        '../service/db': db, './storage': storage,
    });
    await model.apply({ on: (event, callback) => { if (event === 'domain/delete') deleteDomainData = callback; } });
    handlers = load('packages/hydrooj/src/handler/scratch.ts', {
        '../context': {}, '../error': errors,
        '../lib/domain_type': { isScratchDomain: (domain) => domain?.domainType === 'scratch' },
        '../lib/scratch_files': scratchFiles, '../model/builtin': { PERM: { PERM_EDIT_DOMAIN: 1n, PERM_VIEW_USER_PRIVATE_INFO: 2n }, PRIV: { PRIV_USER_PROFILE: 1 } },
        '../model/domain': { collUser: database.collection('domain.user') }, '../model/scratch': model,
        '../model/storage': storage,
        '../model/user': { getListForRender: async () => ({}) }, '../service/server': { Handler: class {} },
    });
});
after(async () => {
    await client?.close();
    await mongod?.stop();
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
});

describe('Scratch native backend isolation and immutable submissions', () => {
    it('authorizes active Scratch members per request, blocks OJ routes, outsiders, and cross-origin mutations', async () => {
        await database.collection('domain.user').insertOne({ domainId: 'scratch-a', uid: 20, join: true });
        const handler = Object.create(handlers.ScratchHandler.prototype);
        Object.assign(handler, {
            domain: { _id: 'scratch-a', domainType: 'scratch' }, user: { _id: 20, hasPerm: () => false },
            checkPriv: () => {}, UiContext: {}, request: { method: 'get', headers: {}, host: 'onebyone.test' }, response: { addHeader() {} },
        });
        await handler.prepare();
        assert.equal(handler.actor.uid, 20);
        handler.domain.domainType = 'oj';
        await assert.rejects(handler.prepare(), NotFoundError);
        handler.domain.domainType = 'scratch';
        handler.user._id = 30;
        await assert.rejects(handler.prepare(), PermissionError);
        handler.user.hasPerm = () => true;
        await handler.prepare(); // domain administrators do not require an additional membership row
        handler.request.method = 'post';
        await assert.rejects(handler.prepare(), CsrfTokenError);
        handler.request.headers.origin = 'https://outside.test';
        await assert.rejects(handler.prepare(), CsrfTokenError);
        handler.request.headers.origin = 'https://onebyone.test';
        await handler.prepare();
        handler.user.hasPerm = () => false;
        handler.user._id = 20;
        await database.collection('domain.user').updateOne({ uid: 20 }, { $set: { join: false } });
        await assert.rejects(handler.prepare(), PermissionError); // revoked memberships are immediately effective
    });

    it('isolates work and file reads by domain and owner and refuses teachers editing another student draft', async () => {
        const work = await model.createWork(alice, 'Alice private work');
        const saved = await model.saveWork(alice, work._id, 0, upload());
        assert.equal((await model.getWork(teacher, work._id)).owner, alice.uid);
        await assert.rejects(model.getWork(bob, work._id), PermissionError);
        await assert.rejects(model.getWork(foreign, work._id), NotFoundError);
        await assert.rejects(model.saveWork(teacher, work._id, 1, upload()), PermissionError);
        await assert.rejects(model.getFile(bob, saved.work.currentFileId), PermissionError);
        await assert.rejects(model.getFile(foreign, saved.work.currentFileId), NotFoundError);
        assert.equal((await model.listWorks(bob).toArray()).length, 0);
        assert.equal((await model.listWorks(foreign).toArray()).length, 0);
    });

    it('resolves duplicate assignment starts to one student work and enforces teacher-only assignment writes', async () => {
        await assert.rejects(model.writeAssignment(alice, { title: 'forbidden', description: '', deadline: null }), PermissionError);
        const assignment = await model.writeAssignment(teacher, { title: 'lesson', description: 'Create a cat', deadline: null }, null, upload());
        const results = await Promise.all(Array.from({ length: 5 }, () => model.createWork(alice, 'lesson', assignment._id)));
        assert.equal(new Set(results.map((work) => work._id.toString())).size, 1);
        await assert.rejects(model.createWork(foreign, 'wrong domain', assignment._id), NotFoundError);
        assert.equal((await model.getFile(alice, assignment.templateFileId)).owner, teacher.uid);
        await assert.rejects(model.getFile(foreign, assignment.templateFileId), NotFoundError);
    });

    it('keeps submitted bytes and grade unchanged after many draft saves and restoration', async () => {
        const assignment = await model.writeAssignment(teacher, { title: 'immutable lesson', description: '', deadline: null });
        const work = await model.createWork(alice, 'first', assignment._id);
        const submitted = await model.saveWork(alice, work._id, 0, upload(project('submitted')), true);
        const original = await model.getFile(alice, submitted.submission.fileId);
        const originalBytes = Buffer.from(blobs.get(original.path));
        await model.reviewSubmission(teacher, submitted.submission._id, '优秀', 'Keep practicing!');
        await assert.rejects(model.reviewSubmission(alice, submitted.submission._id, '100', 'cheat'), PermissionError);
        for (let revision = 1; revision <= 13; revision++) await model.saveWork(alice, work._id, revision, upload(project(`draft-${revision}`)));
        const unchanged = await model.getSubmission(alice, submitted.submission._id);
        assert.equal(unchanged.grade, '优秀');
        assert.equal(unchanged.feedback, 'Keep practicing!');
        assert(unchanged.fileId.equals(submitted.submission.fileId));
        assert(blobs.get(original.path).equals(originalBytes));
        assert.equal(await model.versions.countDocuments({ domainId: alice.domainId, workId: work._id }), 11);
        const initialVersion = await model.versions.findOne({ workId: work._id, revision: 1 });
        const restored = await model.restoreVersion(alice, work._id, initialVersion._id, 14);
        assert.equal(restored.revision, 15);
        assert(restored.currentFileId.equals(original._id));
        for (let revision = 15; revision <= 26; revision++) await model.saveWork(alice, work._id, revision, upload(project(`restored-draft-${revision}`)));
        assert(blobs.get(original.path).equals(originalBytes));
        assert.equal(await model.versions.countDocuments({ domainId: alice.domainId, workId: work._id }), 11);
        await assert.rejects(model.getSubmission(bob, submitted.submission._id), PermissionError);
        await assert.rejects(model.getSubmission(foreign, submitted.submission._id), NotFoundError);
        await assert.rejects(model.deleteWork(alice, work._id), ValidationError);
    });

    it('rejects stale and concurrent saves without orphaned revisions or overwrites', async () => {
        const work = await model.createWork(alice, 'multi-tab');
        const results = await Promise.allSettled([
            model.saveWork(alice, work._id, 0, upload(project('one'))),
            model.saveWork(alice, work._id, 0, upload(project('two'))),
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal((await model.getWork(alice, work._id)).revision, 1);
        await assert.rejects(model.saveWork(alice, work._id, 0, upload()), ValidationError);
        assert.equal(await model.versions.countDocuments({ workId: work._id }), 1);
        assert.equal(await model.files.countDocuments({ workId: work._id }), 1);
    });

    it('allows drafts after deadlines but rejects late or free-work submissions', async () => {
        const assignment = await model.writeAssignment(teacher, { title: 'closed', description: '', deadline: new Date(Date.now() - 1000) });
        const work = await model.createWork(alice, 'closed', assignment._id);
        await model.saveWork(alice, work._id, 0, upload());
        await assert.rejects(model.saveWork(alice, work._id, 1, upload(), true), ValidationError);
        const free = await model.createWork(alice, 'free');
        await assert.rejects(model.saveWork(alice, free._id, 0, upload(), true), ValidationError);
        assert.equal(await model.submissions.countDocuments({ workId: work._id }), 0);
    });

    it('isolates targeted materials and copies visible templates into independent student works', async () => {
        const material = await model.writeMaterial(teacher, { title: 'private starter', category: '课堂', recipientIds: [alice.uid] }, upload());
        assert.equal((await model.listMaterials(alice).toArray()).some((doc) => doc._id.equals(material._id)), true);
        assert.equal((await model.listMaterials(bob).toArray()).some((doc) => doc._id.equals(material._id)), false);
        await assert.rejects(model.getMaterial(bob, material._id), PermissionError);
        await assert.rejects(model.getFile(bob, material.fileId), PermissionError);
        await assert.rejects(model.getFile(foreign, material.fileId), NotFoundError);
        await assert.rejects(model.createWorkFromMaterial(bob, material._id), PermissionError);
        const work = await model.createWorkFromMaterial(alice, material._id);
        const copy = await model.getFile(alice, work.currentFileId);
        assert.equal(copy.owner, alice.uid);
        await model.deleteMaterial(teacher, material._id);
        assert(blobs.has(copy.path));
        await model.getFile(alice, copy._id);
        await model.deleteWork(alice, work._id);
        assert.equal(blobs.has(copy.path), false);
        assert.equal(await model.versions.countDocuments({ workId: work._id }), 0);
    });

    it('rejects malformed archives, untrusted extensions, zip expansion bombs, and unsafe materials', async () => {
        await scratchFiles.validateScratchArchive(upload().filepath);
        await scratchFiles.validateScratchArchive(upload({ ...project(), extensions: ['pen', 'music', 'makeymakey'] }).filepath);
        for (const malicious of [
            { ...project(), extensions: ['https://evil.test/ext.js'] },
            { ...project(), extensionURLs: { injected: 'https://evil.test/x.js' } },
            { ...project(), targets: [{ isStage: true, extensionURLs: { injected: 'data:text/javascript,evil' } }] },
            { targets: [], extensions: [] },
        ]) await assert.rejects(scratchFiles.validateScratchArchive(upload(malicious).filepath), ValidationError);
        await assert.rejects(scratchFiles.validateScratchArchive(upload(project(), { 'bomb.txt': 'x'.repeat(101 * 1024 * 1024) }).filepath), ValidationError);
        await assert.rejects(scratchFiles.validateScratchArchive(upload({ ...project(), comment: 'x'.repeat(5 * 1024 * 1024) }).filepath), ValidationError);
        const script = path.join(temp, 'evil.svg');
        fs.writeFileSync(script, '<svg onload="alert(1)"/>');
        await assert.rejects(scratchFiles.validateScratchMaterial(script, 'evil.svg'), ValidationError);
        await assert.rejects(scratchFiles.validateScratchMaterial(script, 'evil.png'), ValidationError);
    });

    it('validates and stores bounded PNG thumbnails without allowing cross-user file access', async () => {
        const work = await model.createWork(alice, 'with cover');
        const png = new PNG({ width: 4, height: 4 });
        png.data.fill(255);
        const image = PNG.sync.write(png);
        const data = `data:image/png;base64,${image.toString('base64')}`;
        const first = await model.saveWork(alice, work._id, 0, upload(), false, undefined, data);
        assert(first.work.thumbnailFileId);
        const thumbnail = await model.getFile(alice, first.work.thumbnailFileId);
        assert.equal(thumbnail.purpose, 'thumbnail');
        assert(blobs.get(thumbnail.path).equals(image));
        await assert.rejects(model.getFile(bob, thumbnail._id), PermissionError);
        await assert.rejects(model.saveWork(alice, work._id, 1, upload(), false, undefined, 'data:image/svg+xml;base64,PHN2Zy8+'), ValidationError);
        const second = await model.saveWork(alice, work._id, 1, upload(), false, undefined, data);
        assert(!first.work.thumbnailFileId.equals(second.work.thumbnailFileId));
        assert(!blobs.has(thumbnail.path));
        const big = Buffer.from(image);
        big.writeUInt32BE(100000, 16);
        await assert.rejects(scratchFiles.validateScratchThumbnail(`data:image/png;base64,${big.toString('base64')}`), ValidationError);
    });

    it('authorizes thumbnail configuration by domain and work access without granting teachers cache writes', async () => {
        const work = await model.createWork(alice, 'thumbnail configuration');
        const saved = await model.saveWork(alice, work._id, 0, upload());
        const original = await model.getWork(alice, work._id);
        for (const actor of [alice, teacher]) {
            const handler = thumbnailHandler(actor, work._id);
            await handler.get();
            assert.equal(handler.response.type, 'application/json');
            assert.equal(handler.response.body.title, work.title);
            assert.equal(handler.response.body.revision, 1);
            assert.equal(handler.response.body.projectUrl, `/scratch_file/${saved.work.currentFileId}`);
            assert.equal(handler.response.body.thumbnailUrl, null);
            assert.equal(handler.response.body.canCache, actor.uid === alice.uid);
        }
        await assert.rejects(thumbnailHandler(bob, work._id).get(), PermissionError);
        await assert.rejects(thumbnailHandler(foreign, work._id).get(), NotFoundError);
        assert.deepEqual(await model.getWork(alice, work._id), original);
        const assignment = await model.writeAssignment(teacher, { title: 'starter preview', description: '', deadline: null }, null, upload());
        const starter = await model.createWork(alice, 'template not saved yet', assignment._id);
        const handler = thumbnailHandler(alice, starter._id);
        await handler.get();
        assert.equal(handler.response.body.projectUrl, `/scratch_file/${assignment.templateFileId}`);
        assert.equal(handler.response.body.revision, 0);
        assert.equal(handler.response.body.canCache, false);
        const fileId = await model.cacheWorkThumbnail(alice, work._id, 1, thumbnailData().data);
        const cached = thumbnailHandler(alice, work._id);
        await cached.get();
        assert.equal(cached.response.body.thumbnailUrl, `/scratch_file/${fileId}`);
    });

    it('does not persist an unsaved assignment preview that can change when the teacher replaces its template', async () => {
        const assignment = await model.writeAssignment(teacher, { title: 'changing template', description: '', deadline: null }, null, upload());
        const work = await model.createWork(alice, 'follow teacher template', assignment._id);
        const original = await model.getWork(alice, work._id);
        const originalQuota = (await model.quotas.findOne({ _id: alice.domainId })).bytes;
        const originalBlobCount = blobs.size;
        const handler = thumbnailHandler(alice, work._id);
        await handler.get();
        assert.equal(handler.response.body.canCache, false);
        assert.equal(handler.response.body.projectUrl, `/scratch_file/${assignment.templateFileId}`);
        handler.request.body = { revision: 0, thumbnail: thumbnailData().data };
        await assert.rejects(handler.post(), ValidationError);
        assert.deepEqual(await model.getWork(alice, work._id), original, 'the failed cache must also release its lease');
        assert.equal(await model.files.countDocuments({ workId: work._id }), 0);
        assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes, originalQuota);
        assert.equal(blobs.size, originalBlobCount);
        const replacement = await model.writeAssignment(teacher, {
            title: assignment.title, description: '', deadline: null,
        }, assignment._id, upload(project('new teacher template')));
        await handler.get();
        assert.equal(handler.response.body.projectUrl, `/scratch_file/${replacement.templateFileId}`);
        assert.equal(handler.response.body.thumbnailUrl, null);
        assert.equal(handler.response.body.revision, 0);
        assert.equal(handler.response.body.canCache, false);
        await model.saveWork(alice, work._id, 0, upload(project('student saved version')));
        await handler.get();
        assert.equal(handler.response.body.canCache, true);
        const cache = await model.cacheWorkThumbnail(alice, work._id, 1, thumbnailData().data);
        assert((await model.getWork(alice, work._id)).thumbnailFileId.equals(cache));
    });

    it('caches a real PNG exactly once without changing project revision, recency, or submitted work', async () => {
        const assignment = await model.writeAssignment(teacher, { title: 'cached submission', description: '', deadline: null });
        const work = await model.createWork(alice, 'cache without editing', assignment._id);
        const saved = await model.saveWork(alice, work._id, 0, upload(), true);
        const beforeWork = await model.getWork(alice, work._id);
        const beforeVersions = await model.versions.find({ workId: work._id }).toArray();
        const beforeSubmission = await model.getSubmission(alice, saved.submission._id);
        const beforeQuota = (await model.quotas.findOne({ _id: alice.domainId })).bytes;
        const { image, data } = thumbnailData();
        const handler = thumbnailHandler(alice, work._id);
        handler.request.body = { revision: 1, thumbnail: data };
        await handler.post();
        assert.equal(handler.response.body.ok, true);
        const { thumbnailFileId, ...afterWork } = await model.getWork(alice, work._id);
        assert.deepEqual(afterWork, beforeWork);
        assert.deepEqual(await model.versions.find({ workId: work._id }).toArray(), beforeVersions);
        assert.deepEqual(await model.getSubmission(alice, saved.submission._id), beforeSubmission);
        const file = await model.getFile(alice, thumbnailFileId);
        assert.equal(file.purpose, 'thumbnail');
        assert.equal(file.mime, 'image/png');
        assert(blobs.get(file.path).equals(image));
        assert.equal(PNG.sync.read(blobs.get(file.path)).width, 4);
        assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes, beforeQuota + image.length);
        assert.equal(`${await model.cacheWorkThumbnail(alice, work._id, 1, data)}`, `${thumbnailFileId}`);
        assert.equal(await model.files.countDocuments({ workId: work._id, purpose: 'thumbnail' }), 1);
        assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes, beforeQuota + image.length);
        for (const actor of [bob, teacher]) {
            const denied = thumbnailHandler(actor, work._id);
            denied.request.body = { revision: 1, thumbnail: data };
            await assert.rejects(denied.post(), PermissionError);
        }
        await assert.rejects(model.cacheWorkThumbnail(foreign, work._id, 1, data), NotFoundError);
    });

    it('rejects falsely labeled and corrupt PNG cache uploads without file, quota, or work changes', async () => {
        const work = await model.createWork(alice, 'invalid cover');
        await model.saveWork(alice, work._id, 0, upload());
        const original = await model.getWork(alice, work._id);
        const quota = (await model.quotas.findOne({ _id: alice.domainId })).bytes;
        const originalBlobCount = blobs.size;
        const { image } = thumbnailData();
        const badCrc = Buffer.from(image);
        badCrc[29] ^= 1;
        const invalidImages = [
            '', undefined, 'data:image/svg+xml;base64,PHN2Zy8+',
            `data:image/png;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`,
            `data:image/png;base64,${image.subarray(0, 33).toString('base64')}`,
            `data:image/png;base64,${badCrc.toString('base64')}`,
        ];
        for (const data of invalidImages) await assert.rejects(model.cacheWorkThumbnail(alice, work._id, 1, data), ValidationError);
        assert.deepEqual(await model.getWork(alice, work._id), original);
        assert.equal(await model.files.countDocuments({ workId: work._id, purpose: 'thumbnail' }), 0);
        assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes, quota);
        assert.equal(blobs.size, originalBlobCount);
    });

    it('serializes cache and save requests in both directions and rejects stale covers without leaked bytes', { timeout: 15000 }, async () => {
        const work = await model.createWork(alice, 'cache race');
        await model.saveWork(alice, work._id, 0, upload());
        const originalQuota = (await model.quotas.findOne({ _id: alice.domainId })).bytes;
        const { image, data } = thumbnailData();
        const insert = model.files.insertOne.bind(model.files);
        let cachedFileId;
        let cachedFilePath;
        for (const cachingFirst of [true, false]) {
            let entered;
            let release;
            const paused = new Promise((resolve) => { entered = resolve; });
            const resume = new Promise((resolve) => { release = resolve; });
            model.files.insertOne = async (doc, ...args) => {
                const result = await insert(doc, ...args);
                if (doc.workId?.equals(work._id) && (doc.purpose === 'thumbnail') === cachingFirst) {
                    entered();
                    await resume;
                }
                return result;
            };
            const winner = cachingFirst
                ? model.cacheWorkThumbnail(alice, work._id, 1, data)
                : model.saveWork(alice, work._id, 1, upload(project('new project')));
            try {
                await paused;
                await assert.rejects(model.cacheWorkThumbnail(alice, work._id, 1, data), ValidationError);
                await assert.rejects(model.saveWork(alice, work._id, 1, upload()), ValidationError);
            } finally {
                model.files.insertOne = insert;
                release();
            }
            const result = await winner;
            if (cachingFirst) {
                cachedFileId = result;
                cachedFilePath = (await model.getFile(alice, result)).path;
                assert.equal(await model.files.countDocuments({ workId: work._id, purpose: 'thumbnail' }), 1);
                assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes, originalQuota + image.length);
            } else {
                assert.equal(result.work.revision, 2);
                assert.equal(result.work.thumbnailFileId, undefined);
                assert.equal(await model.files.findOne({ _id: cachedFileId }), null);
                assert.equal(blobs.has(cachedFilePath), false);
                const newProject = await model.getFile(alice, result.work.currentFileId);
                assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes, originalQuota + newProject.size);
            }
        }
        const afterSave = await model.getWork(alice, work._id);
        const quotaAfterSave = (await model.quotas.findOne({ _id: alice.domainId })).bytes;
        const blobCountAfterSave = blobs.size;
        await assert.rejects(model.cacheWorkThumbnail(alice, work._id, 1, data), ValidationError);
        assert.deepEqual(await model.getWork(alice, work._id), afterSave);
        assert.equal(await model.files.countDocuments({ workId: work._id }), 2);
        assert.equal(await model.files.countDocuments({ workId: work._id, purpose: 'thumbnail' }), 0);
        assert.equal(await model.versions.countDocuments({ workId: work._id }), 2);
        assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes, quotaAfterSave);
        assert.equal(blobs.size, blobCountAfterSave);
    });

    it('rolls back cache storage and quota when publishing a thumbnail fails, and releases its lease', async () => {
        const work = await model.createWork(alice, 'failed cache publish');
        await model.saveWork(alice, work._id, 0, upload());
        const original = await model.getWork(alice, work._id);
        const originalQuota = (await model.quotas.findOne({ _id: alice.domainId })).bytes;
        const originalBlobCount = blobs.size;
        const update = model.works.updateOne.bind(model.works);
        model.works.updateOne = async (query, patch, ...args) => {
            if (query._id?.equals(work._id) && patch.$set?.thumbnailFileId) throw new Error('thumbnail publish failed');
            return update(query, patch, ...args);
        };
        try {
            await assert.rejects(model.cacheWorkThumbnail(alice, work._id, 1, thumbnailData().data), /thumbnail publish failed/);
        } finally {
            model.works.updateOne = update;
        }
        assert.deepEqual(await model.getWork(alice, work._id), original);
        assert.equal(await model.files.countDocuments({ workId: work._id, purpose: 'thumbnail' }), 0);
        assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes, originalQuota);
        assert.equal(blobs.size, originalBlobCount);
        await model.cacheWorkThumbnail(alice, work._id, 1, thumbnailData().data);
        assert.equal(await model.files.countDocuments({ workId: work._id, purpose: 'thumbnail' }), 1);
    });

    it('clears and releases stale stage covers after saves without a snapshot and after restoring another revision', async () => {
        const work = await model.createWork(alice, 'cover follows content');
        const { data } = thumbnailData();
        const first = await model.saveWork(alice, work._id, 0, upload(project('original stage')), false, undefined, data);
        const originalVersion = await model.versions.findOne({ workId: work._id, revision: 1 });
        const originalCover = await model.getFile(alice, first.work.thumbnailFileId);
        const second = await model.saveWork(alice, work._id, 1, upload(project('changed stage')));
        assert.equal(second.work.thumbnailFileId, undefined);
        assert.equal(await model.files.findOne({ _id: originalCover._id }), null);
        assert.equal(blobs.has(originalCover.path), false);
        const cachedFileId = await model.cacheWorkThumbnail(alice, work._id, 2, data);
        const cachedCover = await model.getFile(alice, cachedFileId);
        const quotaBeforeRestore = (await model.quotas.findOne({ _id: alice.domainId })).bytes;
        const restored = await model.restoreVersion(alice, work._id, originalVersion._id, 2);
        assert.equal(restored.revision, 3);
        assert(restored.currentFileId.equals(originalVersion.fileId));
        assert.equal(restored.thumbnailFileId, undefined);
        assert.equal(await model.files.findOne({ _id: cachedFileId }), null);
        assert.equal(blobs.has(cachedCover.path), false);
        assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes, quotaBeforeRestore - cachedCover.size);
        assert.equal(await model.files.countDocuments({ workId: work._id, purpose: 'thumbnail' }), 0);
        await model.cacheWorkThumbnail(alice, work._id, 3, data);
        assert.equal(await model.versions.countDocuments({ workId: work._id }), 3);
    });

    it('shares only saved work with unguessable tokens, authorizes owners and teachers, and keeps same-revision sharing idempotent', async () => {
        const work = await model.createWork(alice, 'a shared creation');
        await assert.rejects(model.shareWork(alice, work._id), ValidationError);
        await model.saveWork(alice, work._id, 0, upload(project('shared snapshot')));
        const originalWork = await model.getWork(alice, work._id);
        const originalQuota = (await model.quotas.findOne({ _id: alice.domainId })).bytes;
        const share = await model.shareWork(alice, work._id);
        assert.match(share._id, /^[a-f0-9]{64}$/);
        assert.equal(share.revision, 1);
        assert.equal(share.title, work.title);
        assert(share.fileId.equals(originalWork.currentFileId));
        assert.equal((await model.shareWork(alice, work._id))._id, share._id);
        assert.equal((await model.shareWork(teacher, work._id))._id, share._id);
        assert.equal(await model.shares.countDocuments({ workId: work._id }), 1);
        assert.equal(await model.files.countDocuments({ workId: work._id }), 1);
        assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes, originalQuota);
        assert.deepEqual(await model.getWork(alice, work._id), originalWork);
        await assert.rejects(model.shareWork(bob, work._id), PermissionError);
        await assert.rejects(model.shareWork(foreign, work._id), NotFoundError);
        await assert.rejects(model.revokeWorkShares(bob, work._id), PermissionError);
        await assert.rejects(model.getPublicShare('scratch-b', share._id), NotFoundError);
        for (const token of [null, new ObjectId(), 'guess', share._id.slice(1), `${share._id}/project`, '0'.repeat(64)]) {
            await assert.rejects(model.getPublicShare(alice.domainId, token), NotFoundError);
        }
        const publicFile = (await model.getPublicShare(alice.domainId, share._id)).file;
        assert(publicFile._id.equals(originalWork.currentFileId));
        await assert.rejects(model.getFile({ ...alice, uid: 0 }, publicFile._id), PermissionError);
        await model.revokeWorkShares(teacher, work._id);
        await assert.rejects(model.getPublicShare(alice.domainId, share._id), NotFoundError);
        const replacement = await model.shareWork(alice, work._id);
        assert.notEqual(replacement._id, share._id, 're-sharing after revocation must never revive an old URL');
    });

    it('retains immutable shared files through draft pruning, then revokes all work tokens and releases unreferenced files', async () => {
        const work = await model.createWork(alice, 'shared draft history');
        await model.saveWork(alice, work._id, 0, upload(project('first shared version')));
        const first = await model.shareWork(teacher, work._id);
        const originalFile = (await model.getPublicShare(alice.domainId, first._id)).file;
        const originalBytes = Buffer.from(blobs.get(originalFile.path));
        for (let revision = 1; revision < 13; revision++) {
            await model.saveWork(alice, work._id, revision, upload(project(`later revision ${revision}`)));
        }
        assert.equal(await model.versions.findOne({ workId: work._id, revision: 1 }), null);
        const stillShared = await model.getPublicShare(alice.domainId, first._id);
        assert.equal(stillShared.share.revision, 1);
        assert(blobs.get(stillShared.file.path).equals(originalBytes));
        const latest = await model.shareWork(alice, work._id);
        assert.equal(latest.revision, 13);
        assert.notEqual(latest._id, first._id);
        const quotaBefore = (await model.quotas.findOne({ _id: alice.domainId })).bytes;
        await model.revokeWorkShares(alice, work._id);
        await assert.rejects(model.getPublicShare(alice.domainId, first._id), NotFoundError);
        await assert.rejects(model.getPublicShare(alice.domainId, latest._id), NotFoundError);
        assert.equal(await model.shares.countDocuments({ workId: work._id }), 0);
        assert.equal(await model.files.findOne({ _id: originalFile._id }), null);
        assert.equal(blobs.has(originalFile.path), false);
        assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes, quotaBefore - originalFile.size);
        assert(await model.getFile(alice, latest.fileId), 'revocation must keep the current private project intact');
    });

    it('invalidates shares when their work or domain is deleted', async () => {
        const work = await model.createWork(alice, 'delete shared work');
        await model.saveWork(alice, work._id, 0, upload());
        const share = await model.shareWork(alice, work._id);
        const file = (await model.getPublicShare(alice.domainId, share._id)).file;
        await model.deleteWork(alice, work._id);
        await assert.rejects(model.getPublicShare(alice.domainId, share._id), NotFoundError);
        assert.equal(await model.shares.countDocuments({ workId: work._id }), 0);
        assert.equal(blobs.has(file.path), false);
        const isolated = { domainId: 'deleted-scratch-domain', uid: 50, isTeacher: true };
        const otherWork = await model.createWork(isolated, 'deleted domain');
        await model.saveWork(isolated, otherWork._id, 0, upload());
        const otherShare = await model.shareWork(isolated, otherWork._id);
        await deleteDomainData(isolated.domainId);
        await assert.rejects(model.getPublicShare(isolated.domainId, otherShare._id), NotFoundError);
        assert.equal(await model.shares.countDocuments({ domainId: isolated.domainId }), 0);
        assert.equal(await model.files.countDocuments({ domainId: isolated.domainId }), 0);
        assert.equal(await model.quotas.findOne({ _id: isolated.domainId }), null);
    });

    it('exposes only public player metadata and the shared SB3, with non-cacheable GET and validated bodyless HEAD responses', async () => {
        const work = await model.createWork(alice, 'safe public title');
        await model.saveWork(alice, work._id, 0, upload(project('public bytes')));
        const share = await model.shareWork(alice, work._id);
        const publicHandler = (Class, token = share._id, domainType = 'scratch') => {
            const handler = new Class();
            const headers = {};
            Object.assign(handler, {
                domain: { _id: alice.domainId, domainType }, user: { _id: 0 }, UiContext: {}, args: {}, context: {},
                request: { method: 'get', params: { token }, json: true },
                response: { addHeader: (key, value) => { headers[key] = value; }, attachment: (_, bytes) => { handler.response.body = bytes; } },
                url: (name, args) => `/${name}/${args.token}`, headers,
            });
            return handler;
        };
        const player = publicHandler(handlers.ScratchShareHandler);
        assert.equal(player.noCheckPermView, true);
        await player.prepare();
        await player.get();
        assert.equal(player.response.template, 'scratch_share.html');
        assert.deepEqual(Object.keys(player.response.body).sort(), ['revision', 'title']);
        assert.deepEqual(Object.keys(player.UiContext.scratchPlayer).sort(), ['maxFileSize', 'projectUrl', 'title']);
        assert.equal(player.UiContext.scratchPlayer.projectUrl, `/scratch_share_project/${share._id}`);
        assert.equal(player.headers['Cache-Control'], 'private, no-store');
        assert.equal(player.headers['X-Content-Type-Options'], 'nosniff');
        assert.equal(player.headers['Referrer-Policy'], 'no-referrer');
        assert.equal(player.headers['X-Robots-Tag'], 'noindex, nofollow, noarchive');
        const file = publicHandler(handlers.ScratchShareProjectHandler);
        await file.prepare();
        await file.get();
        assert.equal(file.response.type, 'application/octet-stream');
        assert(file.response.body.equals(blobs.get((await model.getPublicShare(alice.domainId, share._id)).file.path)));
        for (const Class of [handlers.ScratchShareHandler, handlers.ScratchShareProjectHandler]) {
            const head = publicHandler(Class);
            head.request.method = 'head';
            await head.prepare();
            await head.head();
            assert.equal(head.response.body, '');
            assert.equal(head.context.status, 200);
            assert.equal(head.response.template, undefined);
            assert.equal(head.UiContext.scratchPlayer, undefined);
            await assert.rejects(publicHandler(Class, 'f'.repeat(64)).prepare(), NotFoundError);
            await assert.rejects(publicHandler(Class, share._id, 'oj').prepare(), NotFoundError);
        }
        await model.revokeWorkShares(alice, work._id);
        await assert.rejects(publicHandler(handlers.ScratchShareProjectHandler).prepare(), NotFoundError);
    });

    it('commits public HEAD as HTTP 200 and never injects domain context into public or invalid-share responses', async () => {
        const work = await model.createWork(alice, 'public response fixture');
        await model.saveWork(alice, work._id, 0, upload());
        const share = await model.shareWork(alice, work._id);
        const file = (await model.getPublicShare(alice.domainId, share._id)).file;
        const baseLayer = load('node_modules/@hydrooj/framework/base.ts', {
            '@hydrooj/framework': { serializer: () => (_, value) => value },
            '@hydrooj/utils/lib/utils': { errorMessage: (error) => error },
            './error': { SystemError: Error, UserFacingError: Error },
        }).default;
        const app = new Koa();
        app.use(async (ctx, next) => {
            ctx.params = { token: ctx.path.split('/')[3] };
            await next();
        });
        app.use(baseLayer({ error() {} }, '', ''));
        app.use(async (ctx) => {
            const Class = ctx.path.endsWith('/project') ? handlers.ScratchShareProjectHandler : handlers.ScratchShareHandler;
            const handler = new Class();
            const privateContext = { domain: { owner: 123, workspaceId: 'private-workspace', secretSetting: 'private-value' } };
            Object.assign(handler, {
                context: ctx, request: ctx.HydroContext.request, response: ctx.HydroContext.response, args: ctx.HydroContext.args,
                domain: { _id: alice.domainId, domainType: 'scratch' },
                user: { _id: 0, privateAccountField: 'must-not-be-exposed' }, UiContext: privateContext,
                url: (name, args) => `/scratch/share/${args.token}${name === 'scratch_share_project' ? '/project' : ''}`,
                renderHTML: async (template, body) => {
                    if (template === 'scratch_share_error.html') {
                        assert.deepEqual(Object.keys(body), ['message']);
                        return `<!doctype html><p>${body.message}</p>`;
                    }
                    return `<!doctype html><p>${body.title}</p>`;
                },
            });
            ctx.handler = handler;
            ctx.HydroContext.UiContext = privateContext;
            ctx.HydroContext.user = handler.user;
            try {
                await handler.prepare();
                await handler[ctx.method.toLowerCase()]();
            } catch (error) {
                await handler.onerror(error);
            }
        });
        const http = request(app.callback());
        const publicPath = `/scratch/share/${share._id}`;
        for (const suffix of ['', '/project']) {
            const response = await http.head(publicPath + suffix).expect(200);
            assert.equal(response.text, undefined);
            assert.match(response.headers['cache-control'], /no-store/);
            if (suffix) assert.equal(+response.headers['content-length'], file.size);
        }
        for (const suffix of ['', '?noTemplate=1']) {
            const response = await http.get(publicPath + suffix)
                .set('Accept', 'application/json').set('X-Hydro-Inject', 'uicontext,usercontext').expect(200);
            assert.deepEqual(response.body, { title: work.title, revision: 1 });
        }
        const noTemplate = await http.get(`${publicPath}?noTemplate=1`)
            .set('Accept', 'text/html').set('X-Hydro-Inject', 'uicontext,usercontext').expect(200);
        assert.deepEqual(noTemplate.body, { title: work.title, revision: 1 });
        const html = await http.get(publicPath).set('Accept', 'text/html').set('X-Hydro-Inject', 'uicontext,usercontext').expect(200);
        assert.equal(html.text, `<!doctype html><p>${work.title}</p>`);
        await model.revokeWorkShares(alice, work._id);
        for (const token of [share._id, '0'.repeat(64)]) {
            for (const accept of ['text/html', 'application/json']) {
                for (const suffix of ['', '/project']) {
                    const response = await http.get(`/scratch/share/${token}${suffix}`)
                        .set('Accept', accept).set('X-Hydro-Inject', 'uicontext,usercontext').expect(404);
                    if (accept === 'text/html' && !suffix) {
                        assert.match(response.headers['content-type'], /text\/html/);
                        assert.equal(response.text, '<!doctype html><p>分享链接已失效或不存在。</p>');
                    } else assert.deepEqual(response.body, { error: { message: '分享链接已失效或不存在。' } });
                    assert(!response.text.includes('private'));
                }
            }
            const noTemplateError = await http.get(`/scratch/share/${token}?noTemplate=1`)
                .set('Accept', 'text/html').set('X-Hydro-Inject', 'uicontext,usercontext').expect(404);
            assert.deepEqual(noTemplateError.body, { error: { message: '分享链接已失效或不存在。' } });
            await http.head(`/scratch/share/${token}`).expect(404);
        }
    });

    it('rejects forged asset sizes even when project.json itself is valid', async () => {
        const valid = upload(project(), { 'oversize.svg': 'x'.repeat(1024 * 1024) });
        const buffer = fs.readFileSync(valid.filepath);
        for (let offset = 0; offset < buffer.length - 46; offset++) {
            if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
            const nameSize = buffer.readUInt16LE(offset + 28);
            if (buffer.toString('utf8', offset + 46, offset + 46 + nameSize) !== 'oversize.svg') continue;
            buffer.writeUInt32LE(1, offset + 24);
            buffer.writeUInt32LE(1, buffer.readUInt32LE(offset + 42) + 22);
        }
        fs.writeFileSync(valid.filepath, buffer);
        await assert.rejects(scratchFiles.validateScratchArchive(valid.filepath), ValidationError);
    });

    it('atomically enforces domain file quotas for both uploads and material copies', async () => {
        const material = await model.writeMaterial(teacher, { title: 'quota starter', category: '测试', recipientIds: [] }, upload());
        const file = await model.getFile(teacher, material.fileId);
        const originalQuota = await model.quotas.findOne({ _id: teacher.domainId });
        await model.quotas.updateOne({ _id: teacher.domainId }, { $set: { bytes: 2 * 1024 ** 3 - file.size } });
        const results = await Promise.allSettled([
            model.createWorkFromMaterial(alice, material._id), model.createWorkFromMaterial(bob, material._id),
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal((await model.quotas.findOne({ _id: teacher.domainId })).bytes, 2 * 1024 ** 3);
        const work = await model.createWork(alice, 'quota upload');
        await assert.rejects(model.saveWork(alice, work._id, 0, upload()), ValidationError);
        assert.equal((await model.getWork(alice, work._id)).revision, 0);
        await model.quotas.updateOne({ _id: teacher.domainId }, { $set: { bytes: originalQuota.bytes + file.size } });
    });

    it('recovers from a failed restore without leaving a revision that blocks subsequent saves', async () => {
        const work = await model.createWork(alice, 'restore failure');
        await model.saveWork(alice, work._id, 0, upload());
        const version = await model.versions.findOne({ workId: work._id, revision: 1 });
        const update = model.works.updateOne.bind(model.works);
        model.works.updateOne = async (query, patch, ...args) => {
            if (patch.$set?.currentFileId) throw new Error('transient write failure');
            return update(query, patch, ...args);
        };
        try {
            await assert.rejects(model.restoreVersion(alice, work._id, version._id, 1), /transient write failure/);
        } finally {
            model.works.updateOne = update;
        }
        assert.equal(await model.versions.countDocuments({ workId: work._id }), 1);
        const saved = await model.saveWork(alice, work._id, 1, upload());
        assert.equal(saved.work.revision, 2);
    });

    it('reconciles staged revisions after a process dies and its save lease expires', async () => {
        const work = await model.createWork(alice, 'restart during save');
        const first = await model.saveWork(alice, work._id, 0, upload());
        const staleFile = { ...(await model.getFile(alice, first.work.currentFileId)), _id: new ObjectId(), path: 'scratch/stale-upload.sb3' };
        blobs.set(staleFile.path, Buffer.from('stale data'));
        await model.files.insertOne(staleFile);
        const staged = { _id: new ObjectId(), domainId: alice.domainId, owner: alice.uid, workId: work._id, fileId: staleFile._id, revision: 2 };
        await model.versions.insertOne(staged);
        await model.submissions.insertOne({ ...staged, _id: new ObjectId(), assignmentId: new ObjectId() });
        await model.works.updateOne({ _id: work._id }, { $set: { savingToken: new ObjectId(), savingUntil: new Date(Date.now() - 1000) } });
        const next = await model.saveWork(alice, work._id, 1, upload());
        assert.equal(next.work.revision, 2);
        assert.equal(await model.submissions.countDocuments({ workId: work._id }), 0);
        assert.equal(await model.versions.countDocuments({ workId: work._id }), 2);
        assert.equal(blobs.has(staleFile.path), false);
    });

    it('rolls back invalid uploads and makes subsequent valid saves possible', async () => {
        const work = await model.createWork(alice, 'invalid upload');
        await assert.rejects(model.saveWork(alice, work._id, 0, upload({ targets: [] })), ValidationError);
        assert.equal(await model.files.countDocuments({ workId: work._id }), 0);
        assert.equal((await model.getWork(alice, work._id)).revision, 0);
        await model.saveWork(alice, work._id, 0, upload());
    });
});
