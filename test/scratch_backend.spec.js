const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
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
const remoteAssets = new Map();
const mirrorCalls = [];
const redirectCalls = [];
const originReads = [];
const readyPaths = new Set();
let mirrorResult = () => false;
const assetDelivery = {
    queueAssetMirror(source) {
        mirrorCalls.push(source);
        return mirrorResult(source);
    },
    tryRedirectAsset(handler, source) {
        redirectCalls.push(source);
        if (!source || !readyPaths.has(source.path)) return false;
        handler.response.status = 302;
        handler.response.redirect = `https://media.example.test/media/v1/${source.meta.etag}.sb3?auth_key=test-signature`;
        handler.response.addHeader('Cache-Control', 'private, no-store');
        handler.response.addHeader('Referrer-Policy', 'no-referrer');
        return true;
    },
};
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
function fileHandler(actor, fileId) {
    const handler = new handlers.ScratchFileHandler();
    const headers = {};
    Object.assign(handler, {
        actor, request: { params: { fileId: fileId.toHexString() } }, headers,
        response: {
            addHeader: (key, value) => { headers[key] = value; },
            attachment: (name, bytes) => { handler.attachmentName = name; handler.response.body = bytes; },
        },
    });
    return handler;
}
function publicProjectHandler(token, domainId = alice.domainId) {
    const handler = new handlers.ScratchShareProjectHandler();
    const headers = {};
    Object.assign(handler, {
        domain: { _id: domainId, domainType: 'scratch' }, user: { _id: 0 }, headers, context: {},
        request: { method: 'get', params: { token } },
        response: {
            addHeader: (key, value) => { headers[key] = value; },
            attachment: (name, bytes) => { handler.attachmentName = name; handler.response.body = bytes; },
        },
    });
    return handler;
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
        get: async (key) => { originReads.push(key); return blobs.get(key); },
        getMeta: async (key) => ({ remoteAsset: remoteAssets.get(key) }),
    };
    scratchFiles = load('packages/hydrooj/src/lib/scratch_files.ts', { '../error': errors });
    model = load('packages/hydrooj/src/model/scratch.ts', {
        '../context': {}, '../error': errors, '../lib/scratch_files': scratchFiles, '../logger': { Logger: class { warn() {} } },
        '../lib/asset_delivery': assetDelivery,
        '../service/db': db, './storage': storage,
    });
    await model.apply({ on: (event, callback) => { if (event === 'domain/delete') deleteDomainData = callback; } });
    handlers = load('packages/hydrooj/src/handler/scratch.ts', {
        '../context': {}, '../error': errors,
        '../lib/scratch_editor_assets': { getScratchEditorVersion: () => 'a'.repeat(64) },
        '../lib/asset_delivery': assetDelivery,
        '../lib/domain_type': { isScratchDomain: (domain) => domain?.domainType === 'scratch' },
        '../lib/scratch_files': scratchFiles, '../model/builtin': { PERM: { PERM_EDIT_DOMAIN: 1n, PERM_VIEW_USER_PRIVATE_INFO: 2n }, PRIV: { PRIV_USER_PROFILE: 1 } },
        '../model/domain': { collUser: database.collection('domain.user') }, '../model/scratch': model,
        '../model/storage': storage,
        '../model/user': {
            coll: database.collection('user'),
            getListForRender: async () => ({}),
        }, '../service/server': { Handler: class {} },
    });
});
beforeEach(() => {
    mirrorCalls.length = 0;
    redirectCalls.length = 0;
    originReads.length = 0;
    readyPaths.clear();
    mirrorResult = () => false;
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
        assert.equal(handler.UiContext.scratch.editorVersion, 'a'.repeat(64));
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

    it('lets a teacher explicitly save the current student work without changing its owner', async () => {
        const work = await model.createWork(alice, 'teacher can help');
        await model.saveWork(alice, work._id, 0, upload(project('student version')));
        await assert.rejects(model.saveWork(teacher, work._id, 1, upload(project('unconfirmed'))), PermissionError);
        await assert.rejects(model.saveWork(teacher, work._id, 1, upload(), true, work.title, undefined, true), ValidationError);
        const saved = await model.saveWork(teacher, work._id, 1, upload(project('teacher correction')),
            false, work.title, undefined, true);
        assert.equal(saved.work.owner, alice.uid);
        assert.equal(saved.work.revision, 2);
        assert.equal(await model.versions.countDocuments({ workId: work._id }), 1);
        assert.equal((await model.getFile(alice, saved.work.currentFileId)).owner, teacher.uid);
        await assert.rejects(model.saveWork(bob, work._id, 2, upload(), false, work.title, undefined, true), PermissionError);
    });

    it('copies a work into an independent file and replaces a same-named older free work', async () => {
        const first = await model.createWork(alice, 'single title');
        const firstSaved = await model.saveWork(alice, first._id, 0, upload(project('old work')));
        const oldFile = await model.getFile(alice, firstSaved.work.currentFileId);
        assert((await model.createWork(alice, first.title))._id.equals(first._id));
        const copy = await model.copyWork(alice, first._id);
        assert.notEqual(copy.title, first.title);
        assert(!copy._id.equals(first._id));
        assert(!copy.currentFileId.equals(firstSaved.work.currentFileId));
        assert(blobs.get((await model.getFile(alice, copy.currentFileId)).path).equals(blobs.get(oldFile.path)));
        await model.saveWork(alice, copy._id, 1, upload(project('replacement')), false, first.title);
        assert.equal(await model.works.findOne({ _id: first._id }), null);
        assert.equal(await model.files.findOne({ _id: oldFile._id }), null);
        assert.equal(blobs.has(oldFile.path), false);
        assert.equal(await model.versions.countDocuments({ workId: copy._id }), 1);
        assert.equal((await model.getWork(alice, copy._id)).title, first.title);
    });

    it('filters teacher gallery by a member and serves popup actions as JSON', async () => {
        await database.collection('domain.user').insertOne({ domainId: teacher.domainId, uid: bob.uid, join: true });
        const bobWork = await model.createWork(bob, 'Bob gallery work');
        const gallery = Object.assign(Object.create(handlers.ScratchWorksHandler.prototype), {
            actor: teacher, domain: { _id: teacher.domainId }, request: { query: { owner: String(bob.uid) } },
            paginate: async (cursor) => [await cursor.toArray(), 1, 1],
            renderScratch: async (_template, body) => { gallery.body = body; },
        });
        await gallery.get();
        assert(gallery.body.works.some((work) => work._id.equals(bobWork._id)));
        assert(gallery.body.works.every((work) => work.owner === bob.uid));
        assert(gallery.body.studentOptions.some((option) => option.uid === bob.uid));
        assert.equal(gallery.body.selectedOwner, bob.uid);
        gallery.request.query.owner = '999999';
        await assert.rejects(gallery.get(), ValidationError);

        const action = Object.assign(Object.create(handlers.ScratchWorkHandler.prototype), {
            actor: teacher, response: {}, request: {
                json: false, headers: { accept: 'application/json' }, params: { workId: bobWork._id.toHexString() },
                body: { title: 'Bob renamed' },
            },
        });
        await action.post();
        assert.equal(action.response.body.title, 'Bob renamed');
        action.request.body = { operation: 'copy' };
        await action.postCopy();
        assert.equal(action.response.body.ok, true);
        const copyId = new ObjectId(action.response.body.workId);
        assert.equal((await model.getWork(teacher, copyId)).owner, teacher.uid);
        action.request.body = { operation: 'delete' };
        await action.postDelete();
        assert.equal(action.response.body.ok, true);
        assert.equal(await model.works.findOne({ _id: bobWork._id }), null);
    });

    it('opens a student work in teacher edit mode with explicit deputy-save context', async () => {
        const work = await model.createWork(bob, 'edit together');
        const editor = Object.assign(Object.create(handlers.ScratchEditorHandler.prototype), {
            actor: teacher, user: { _id: teacher.uid }, domain: { _id: teacher.domainId }, UiContext: {},
            request: { query: { workId: work._id.toHexString() } },
            url: (name) => `/${name}`,
            renderScratch: async () => {},
        });
        await editor.get();
        assert.equal(editor.UiContext.scratchEditor.readOnly, false);
        assert.equal(editor.UiContext.scratchEditor.saveForStudent, true);
        assert.equal(editor.UiContext.scratchEditor.saveUrl, '/scratch_save');
        assert.equal(editor.UiContext.scratchEditor.locale, 'zh-cn');
        assert.equal(editor.UiContext.scratchEditor.languageUrl, null); // the fixture has no owner user document
        assert.equal(editor.UiContext.scratchEditor.canSubmit, false);
    });

    it('remembers the Scratch language per student across works and teacher edits', async () => {
        await database.collection('user').insertMany([
            { _id: alice.uid, uname: 'alice' },
            { _id: bob.uid, uname: 'bob' },
            { _id: teacher.uid, uname: 'teacher' },
        ]);
        const first = await model.createWork(bob, 'first language work');
        const second = await model.createWork(bob, 'second language work');
        const aliceWork = await model.createWork(alice, 'alice language work');
        const editor = (actor, workId, query = {}) => Object.assign(Object.create(handlers.ScratchEditorHandler.prototype), {
            actor, user: { _id: actor.uid }, domain: { _id: actor.domainId }, UiContext: {},
            request: { query: { workId: workId.toHexString(), ...query } },
            url: (name) => `/${name}`,
            renderScratch: async () => {},
        });
        const studentSession = '11111111-1111-4111-8111-111111111111';
        const teacherSession = '22222222-2222-4222-8222-222222222222';
        const language = (actor, workId, locale, sequence = '1', session = actor.isTeacher ? teacherSession : studentSession, generation = '1') => Object.assign(Object.create(handlers.ScratchLanguageHandler.prototype), {
            actor, request: { params: { workId: workId.toHexString() }, body: { locale, session, sequence, generation } },
            response: {}, limitRate: async () => {},
        });

        const firstOpen = editor(bob, first._id);
        await firstOpen.get();
        assert.equal(firstOpen.UiContext.scratchEditor.locale, 'zh-cn');
        assert.equal(firstOpen.UiContext.scratchEditor.languageGeneration, 1);
        const changed = language(bob, first._id, 'en');
        await changed.post();
        assert.equal(changed.response.body.ok, true);
        assert.equal(changed.response.body.locale, 'en');
        assert.equal(changed.response.type, 'application/json');
        assert.equal((await database.collection('user').findOne({ _id: bob.uid })).scratchEditorLocale, 'en');

        const teacherOpen = editor(teacher, second._id);
        await teacherOpen.get();
        assert.equal(teacherOpen.UiContext.scratchEditor.locale, 'en');
        assert.equal(teacherOpen.UiContext.scratchEditor.languageUrl, '/scratch_language');
        assert.equal(teacherOpen.UiContext.scratchEditor.languageGeneration, 2);
        const teacherChange = language(teacher, second._id, 'ja-Hira', '1', teacherSession, '2');
        await teacherChange.post();
        const teacherSaved = await database.collection('user').findOne({ _id: bob.uid });
        assert.equal(teacherSaved.scratchEditorLocale, 'ja-Hira');
        assert.equal(teacherSaved.scratchEditorLocaleRevision.session, teacherSession);
        assert.equal(teacherSaved.scratchEditorLocaleRevision.generation, 2);
        assert.equal(teacherSaved.scratchEditorLocaleRevision.sequence, 1);
        assert.equal((await database.collection('user').findOne({ _id: teacher.uid })).scratchEditorLocale, undefined);
        const studentOpen = editor(bob, first._id);
        await studentOpen.get();
        assert.equal(studentOpen.UiContext.scratchEditor.locale, 'ja-Hira');
        assert.equal(studentOpen.UiContext.scratchEditor.languageGeneration, 3);

        const readOnlyOpen = editor(teacher, first._id, { readOnly: 'true' });
        await readOnlyOpen.get();
        assert.equal(readOnlyOpen.UiContext.scratchEditor.locale, 'ja-Hira');
        assert.equal(readOnlyOpen.UiContext.scratchEditor.languageUrl, null);
        assert.equal(readOnlyOpen.UiContext.scratchEditor.languageGeneration, null);
        const aliceOpen = editor(alice, aliceWork._id);
        await aliceOpen.get();
        assert.equal(aliceOpen.UiContext.scratchEditor.locale, 'zh-cn');
        assert.equal(aliceOpen.UiContext.scratchEditor.languageGeneration, 1);

        for (const locale of ['en-US', 'ja-hira', '__proto__', '', 12, null]) {
            await assert.rejects(language(teacher, first._id, locale).post(), ValidationError);
        }
        await assert.rejects(language(alice, first._id, 'fr').post(), PermissionError);
        await assert.rejects(language(foreign, first._id, 'fr').post(), NotFoundError);
        assert.equal((await database.collection('user').findOne({ _id: bob.uid })).scratchEditorLocale, 'ja-Hira');
        assert.equal((await database.collection('user').findOne({ _id: alice.uid })).scratchEditorLocale, undefined);

        for (const [sequence, session] of [
            ['0', teacherSession], ['1000000001', teacherSession], ['1.5', teacherSession],
            ['NaN', teacherSession], [null, teacherSession], ['1', 'not-a-uuid'], ['1', null],
        ]) {
            await assert.rejects(language(teacher, second._id, 'fr', sequence, session, '2').post(), ValidationError);
        }
        for (const generation of ['0', '1000000001', '1.5', 'NaN', null]) {
            await assert.rejects(language(teacher, second._id, 'fr', '2', teacherSession, generation).post(), ValidationError);
        }
        const missingSequence = language(teacher, second._id, 'fr');
        delete missingSequence.request.body.sequence;
        await assert.rejects(missingSequence.post(), ValidationError);
        const missingSession = language(teacher, second._id, 'fr');
        delete missingSession.request.body.session;
        await assert.rejects(missingSession.post(), ValidationError);
        const missingGeneration = language(teacher, second._id, 'fr');
        delete missingGeneration.request.body.generation;
        await assert.rejects(missingGeneration.post(), ValidationError);
        const newest = language(teacher, second._id, 'fr', '2', teacherSession, '2');
        await newest.post();
        const delayed = language(teacher, second._id, 'en', '1', teacherSession, '2');
        await delayed.post();
        assert.equal(delayed.response.body.ok, true);
        assert.equal(delayed.response.body.locale, 'fr');
        assert.equal((await database.collection('user').findOne({ _id: bob.uid })).scratchEditorLocale, 'fr');
        const nextSession = '33333333-3333-4333-8333-333333333333';
        await language(bob, first._id, 'pt-br', '1', nextSession, '3').post();
        const latest = await database.collection('user').findOne({ _id: bob.uid });
        assert.equal(latest.scratchEditorLocale, 'pt-br');
        assert.equal(latest.scratchEditorLocaleRevision.session, nextSession);
        assert.equal(latest.scratchEditorLocaleRevision.generation, 3);
        assert.equal(latest.scratchEditorLocaleRevision.sequence, 1);
        const oldTab = language(teacher, second._id, 'en', '3', teacherSession, '2');
        await oldTab.post();
        assert.equal(oldTab.response.body.accepted, false);
        assert.equal(oldTab.response.body.locale, 'pt-br');
        const futureTab = language(teacher, second._id, 'fr', '1', teacherSession, '4');
        await futureTab.post();
        assert.equal(futureTab.response.body.accepted, false);
        assert.equal((await database.collection('user').findOne({ _id: bob.uid })).scratchEditorLocale, 'pt-br');
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

    it('keeps submission evidence while replacing old draft versions and bytes', async () => {
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
        assert.equal(await model.versions.countDocuments({ domainId: alice.domainId, workId: work._id }), 1);
        assert.equal(await model.versions.findOne({ workId: work._id, revision: 1 }), null);
        assert(blobs.get(original.path).equals(originalBytes));
        assert.equal(await model.files.countDocuments({ domainId: alice.domainId, workId: work._id }), 2);
        await assert.rejects(model.getSubmission(bob, submitted.submission._id), PermissionError);
        await assert.rejects(model.getSubmission(foreign, submitted.submission._id), NotFoundError);
        await model.deleteWork(alice, work._id);
        assert.equal(await model.submissions.countDocuments({ workId: work._id }), 0);
        assert.equal(blobs.has(original.path), false);
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
        const originalProjectSize = (await model.getFile(alice, (await model.getWork(alice, work._id)).currentFileId)).size;
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
                assert.equal((await model.quotas.findOne({ _id: alice.domainId })).bytes,
                    originalQuota - originalProjectSize + newProject.size);
            }
        }
        const afterSave = await model.getWork(alice, work._id);
        const quotaAfterSave = (await model.quotas.findOne({ _id: alice.domainId })).bytes;
        const blobCountAfterSave = blobs.size;
        await assert.rejects(model.cacheWorkThumbnail(alice, work._id, 1, data), ValidationError);
        assert.deepEqual(await model.getWork(alice, work._id), afterSave);
        assert.equal(await model.files.countDocuments({ workId: work._id }), 1);
        assert.equal(await model.files.countDocuments({ workId: work._id, purpose: 'thumbnail' }), 0);
        assert.equal(await model.versions.countDocuments({ workId: work._id }), 1);
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

    it('clears stale covers and removes replaced draft files', async () => {
        const work = await model.createWork(alice, 'cover follows content');
        const { data } = thumbnailData();
        const first = await model.saveWork(alice, work._id, 0, upload(project('original stage')), false, undefined, data);
        const originalVersion = await model.versions.findOne({ workId: work._id, revision: 1 });
        const originalCover = await model.getFile(alice, first.work.thumbnailFileId);
        const second = await model.saveWork(alice, work._id, 1, upload(project('changed stage')));
        assert.equal(second.work.thumbnailFileId, undefined);
        assert.equal(await model.files.findOne({ _id: originalCover._id }), null);
        assert.equal(blobs.has(originalCover.path), false);
        assert.equal(await model.versions.findOne({ _id: originalVersion._id }), null);
        assert.equal(await model.files.findOne({ _id: originalVersion.fileId }), null);
        await model.cacheWorkThumbnail(alice, work._id, 2, data);
        assert.equal(await model.versions.countDocuments({ workId: work._id }), 1);
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
        assert.deepEqual(Object.keys(player.UiContext.scratchPlayer).sort(), ['editorVersion', 'maxFileSize', 'projectUrl', 'title']);
        assert.equal(player.UiContext.scratchPlayer.editorVersion, 'a'.repeat(64));
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
        assert.equal(await model.versions.countDocuments({ workId: work._id }), 1);
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

describe('Scratch permission-gated CDN delivery', () => {
    it('passes the verified primary OSS descriptor to private and shared reads without fetching project bytes', async () => {
        const work = await model.createWork(alice, 'OSS primary');
        const saved = await model.saveWork(alice, work._id, 0, upload());
        const file = await model.getFile(alice, saved.work.currentFileId);
        const remoteAsset = {
            key: `media/v1/${'a'.repeat(64)}.sb3`, sha256: 'b'.repeat(64), size: file.size,
            contentType: 'application/octet-stream', bucket: 'onebyone-oss', region: 'cn-wulanchabu',
        };
        remoteAssets.set(file.path, remoteAsset);
        readyPaths.add(file.path);
        const handler = fileHandler(alice, file._id);
        await handler.get();
        assert.equal(handler.response.status, 302);
        assert.equal(redirectCalls.at(-1).meta.remoteAsset, remoteAsset);
        assert.equal(originReads.length, 0);
        const shared = Object.assign(Object.create(handlers.ScratchShareProjectHandler.prototype), {
            shared: { file }, response: { addHeader() {} },
        });
        await shared.get();
        assert.equal(shared.response.status, 302);
        assert.equal(redirectCalls.at(-1).meta.remoteAsset, remoteAsset);
        assert.equal(originReads.length, 0);
    });

    it('queues immutable saved projects, thumbnails and material copies with the same identity used for reads', async () => {
        const work = await model.createWork(alice, 'CDN identity');
        const saved = await model.saveWork(alice, work._id, 0, upload(), false, undefined, thumbnailData().data);
        for (const id of [saved.work.currentFileId, saved.work.thumbnailFileId]) {
            const file = await model.getFile(alice, id);
            const queued = mirrorCalls.find((source) => source.path === file.path);
            assert(queued, 'successful primary storage must schedule this immutable file');
            assert.equal(queued.meta.etag, file._id.toHexString());
            assert.equal(queued.meta.size, file.size);
            assert.equal(queued.meta.lastModified.getTime(), file.createdAt.getTime());
            assert.equal(queued.meta['Content-Type'], file.purpose === 'thumbnail' ? 'image/png' : 'application/octet-stream');
            assert.equal(queued.contentDisposition, file.purpose === 'thumbnail' ? 'inline' : 'attachment; filename="project.sb3"');
            assert.deepEqual(queued.meta, model.fileAssetSource(file).meta);
            assert((await queued.load()).equals(blobs.get(file.path)));
        }
        const material = await model.writeMaterial(teacher, { title: 'CDN copy', category: '', recipientIds: [alice.uid] }, upload());
        const copy = await model.createWorkFromMaterial(alice, material._id);
        const original = await model.getFile(teacher, material.fileId);
        const copied = await model.getFile(alice, copy.currentFileId);
        const queuedCopy = mirrorCalls.find((source) => source.path === copied.path);
        assert(queuedCopy);
        assert.equal(queuedCopy.meta.etag, copied._id.toHexString());
        assert.notEqual(queuedCopy.meta.etag, original._id.toHexString());
        assert.notEqual(queuedCopy.path, original.path);
        assert((await queuedCopy.load()).equals(blobs.get(original.path)));
    });

    it('does not sign, mirror or read bytes before domain, owner and material-recipient authorization succeeds', async () => {
        const work = await model.createWork(alice, 'private CDN work');
        const saved = await model.saveWork(alice, work._id, 0, upload(), false, undefined, thumbnailData().data);
        const material = await model.writeMaterial(teacher, { title: 'targeted CDN material', category: '', recipientIds: [alice.uid] }, upload());
        for (const fileId of [saved.work.currentFileId, saved.work.thumbnailFileId, material.fileId]) {
            const file = await model.getFile(alice, fileId);
            readyPaths.add(file.path);
        }
        mirrorCalls.length = 0;
        for (const fileId of [saved.work.currentFileId, saved.work.thumbnailFileId, material.fileId]) {
            await assert.rejects(fileHandler(bob, fileId).get(), PermissionError);
            await assert.rejects(fileHandler(foreign, fileId).get(), NotFoundError);
        }
        await assert.rejects(model.saveWork(bob, work._id, 1, upload()), PermissionError);
        await assert.rejects(model.createWorkFromMaterial(bob, material._id), PermissionError);
        await assert.rejects(model.saveWork(alice, work._id, 1, upload({ targets: [] })), ValidationError);
        assert.equal(redirectCalls.length, 0);
        assert.equal(mirrorCalls.length, 0);
        assert.equal(originReads.length, 0);
    });

    it('redirects only ready authorized project and thumbnail mirrors and otherwise preserves origin responses', async () => {
        const work = await model.createWork(alice, 'CDN fallback');
        const saved = await model.saveWork(alice, work._id, 0, upload(), false, undefined, thumbnailData().data);
        for (const fileId of [saved.work.currentFileId, saved.work.thumbnailFileId]) {
            const file = await model.getFile(alice, fileId);
            const fallback = fileHandler(alice, fileId);
            await fallback.get();
            assert.equal(fallback.response.redirect, undefined);
            assert(fallback.response.body.equals(blobs.get(file.path)));
            assert.equal(fallback.response.type, file.purpose === 'thumbnail' ? 'image/png' : 'application/octet-stream');
            assert.equal(fallback.headers['X-Content-Type-Options'], 'nosniff');
            if (!file.purpose) assert.match(fallback.headers['Content-Security-Policy'], /sandbox/);
            readyPaths.add(file.path);
            const reads = originReads.length;
            const redirected = fileHandler(alice, fileId);
            await redirected.get();
            assert.equal(redirected.response.status, 302);
            assert.match(redirected.response.redirect, /^https:\/\/media\.example\.test\/media\/v1\//);
            assert.match(redirected.response.redirect, /auth_key=/);
            assert.equal(redirected.response.body, undefined);
            assert.equal(redirected.headers['Cache-Control'], 'private, no-store');
            assert.equal(redirected.headers['Referrer-Policy'], 'no-referrer');
            assert.equal(originReads.length, reads, 'a ready mirror must not load the origin bytes again');
        }
    });

    it('authorizes each public snapshot before redirecting, keeps HEAD bodyless, and refuses revoked or foreign tokens', async () => {
        const work = await model.createWork(alice, 'shared CDN snapshot');
        await model.saveWork(alice, work._id, 0, upload(project('fixed snapshot')));
        const share = await model.shareWork(alice, work._id);
        const file = (await model.getPublicShare(alice.domainId, share._id)).file;
        const fallback = publicProjectHandler(share._id);
        await fallback.prepare();
        await fallback.get();
        assert(fallback.response.body.equals(blobs.get(file.path)));
        assert.equal(fallback.response.redirect, undefined);
        assert.equal(fallback.headers['Cache-Control'], 'private, no-store');
        await model.saveWork(alice, work._id, 1, upload(project('new private draft')));
        readyPaths.add(file.path);
        const redirected = publicProjectHandler(share._id);
        await redirected.prepare();
        const reads = originReads.length;
        await redirected.get();
        assert.equal(redirected.response.status, 302);
        assert.equal(redirectCalls.at(-1).meta.etag, file._id.toHexString(), 'sharing must retain the saved snapshot identity');
        assert.equal(originReads.length, reads);
        const calls = redirectCalls.length;
        const head = publicProjectHandler(share._id);
        head.request.method = 'head';
        await head.prepare();
        await head.head();
        assert.equal(head.context.status, 200);
        assert.equal(head.response.body, '');
        assert.equal(head.headers['Content-Length'], String(file.size));
        assert.equal(redirectCalls.length, calls, 'HEAD must not mint a download capability');
        await model.revokeWorkShares(alice, work._id);
        const mirrored = mirrorCalls.length;
        for (const handler of [publicProjectHandler(share._id), publicProjectHandler(share._id, foreign.domainId),
            publicProjectHandler('0'.repeat(64))]) {
            await assert.rejects(handler.prepare(), NotFoundError);
            assert.equal(handler.response.redirect, undefined);
        }
        assert.equal(redirectCalls.length, calls);
        assert.equal(mirrorCalls.length, mirrored);
        assert.equal(originReads.length, reads);
    });

    it('keeps non-SB3 classroom materials on the original attachment route instead of disguising them as projects', async () => {
        for (const [filename, bytes] of [['notes.txt', Buffer.from('Lesson notes')],
            ['handout.pdf', Buffer.from('%PDF-1.7\nfixture')], ['picture.png', thumbnailData().image]]) {
            const filepath = path.join(temp, `${counter++}-${filename}`);
            fs.writeFileSync(filepath, bytes);
            const queued = mirrorCalls.length;
            const material = await model.writeMaterial(teacher, { title: filename, category: '', recipientIds: [alice.uid] },
                { filepath, originalFilename: filename });
            const file = await model.getFile(alice, material.fileId);
            assert.equal(model.fileAssetSource(file), null);
            assert.equal(mirrorCalls.length, queued);
            readyPaths.add(file.path);
            const attempts = redirectCalls.length;
            const handler = fileHandler(alice, file._id);
            await handler.get();
            assert.equal(redirectCalls.length, attempts);
            assert.equal(handler.response.redirect, undefined);
            assert.equal(handler.attachmentName, filename);
            assert.equal(handler.response.type, 'application/octet-stream');
            assert(handler.response.body.equals(bytes));
        }
    });

    it('requires a matching immutable file classification before making an asset source', () => {
        const file = { _id: new ObjectId(), path: 'scratch/test/valid.sb3', size: 42,
            mime: 'application/x.scratch.sb3', createdAt: new Date() };
        assert(model.fileAssetSource(file));
        assert(model.fileAssetSource({ ...file, purpose: 'thumbnail', mime: 'image/png', path: 'scratch/test/thumb.png' }));
        for (const changed of [
            { mime: 'application/pdf' }, { path: 'scratch/test/image.png' }, { mime: 'application/octet-stream' },
            { purpose: 'thumbnail' }, { purpose: 'thumbnail', mime: 'image/png' },
            { purpose: 'thumbnail', mime: 'image/svg+xml', path: 'scratch/test/thumb.png' },
            { purpose: undefined, mime: 'image/png', path: 'scratch/test/material.png' },
        ]) assert.equal(model.fileAssetSource({ ...file, ...changed }), null);
    });

    it('does not await mirror network work before completing the primary project save', async () => {
        const work = await model.createWork(alice, 'nonblocking CDN save');
        mirrorResult = () => new Promise(() => {});
        let timeout;
        try {
            const saved = await Promise.race([
                model.saveWork(alice, work._id, 0, upload()),
                new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('save waited for mirror')), 1500); }),
            ]);
            assert.equal(saved.work.revision, 1);
            assert.equal(mirrorCalls.length, 1);
            const file = await model.getFile(alice, saved.work.currentFileId);
            assert(blobs.has(file.path));
        } finally {
            clearTimeout(timeout);
        }
    });
});
