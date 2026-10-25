const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { ObjectId } = require('mongodb');

const root = path.resolve(__dirname, '..');
function load(filename, dependencies = {}) {
    const mod = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, filename), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, {
        module: mod, exports: mod.exports,
        Math: Object.assign(Object.create(Math), { sum: (values) => values.reduce((total, value) => total + value, 0) }),
        require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
    });
    return mod.exports;
}
const { PERM, PRIV } = load('packages/common/permission.ts');
const access = load('packages/hydrooj/src/lib/training_access.ts', { '../model/builtin': { PERM, PRIV } });
class PermissionError extends Error {}
class ValidationError extends Error {}
class ProblemNotFoundError extends Error {}
class TrainingNotFoundError extends Error {}
const tid = new ObjectId();
const dag = [{ _id: 1, title: 'Chapter', pids: [1], requireNids: [] }];
function fixture(permissions = PERM.PERM_DEFAULT, privileges = PRIV.PRIV_USER_PROFILE, owner = 42, objectiveKind) {
    const writes = [];
    const statusReads = [];
    const downloads = [];
    const membership = { enroll: 1 };
    const document = { docId: tid, _id: tid, owner, dag, attend: 2, title: 'Existing plan', allowSelfEnroll: true, files: [] };
    const cursor = (rows) => ({ project() { return this; }, limit() { return this; }, sort() { return this; }, toArray: async () => rows });
    class Handler {
        constructor() {
            this.user = {
                _id: 42,
                hasPerm: (permission) => (permissions & permission) === permission,
                hasPriv: (privilege) => (privileges & privilege) === privilege,
                own: (doc) => doc.owner === 42,
            };
            this.ctx = { parallel: async () => {} };
            this.request = { files: { file: { size: 10, filepath: '/tmp/unused-fixture' } } };
            this.response = { headers: {}, addHeader(name, value) { this.headers[name] = value; } };
        }
        checkPerm(permission) { if (!this.user.hasPerm(permission)) throw new PermissionError(); }
        checkPriv(privilege) { if (!this.user.hasPriv(privilege)) throw new PermissionError(); }
        async paginate() { return [[], 1]; }
        url(name) { return `/${name}`; }
        back(body) { this.response.redirect = '/back'; this.response.body = body; }
    }
    const training = {
        get: async (domainId, docId) => {
            if (domainId !== 'class-a' || !tid.equals(docId)) throw new TrainingNotFoundError();
            return document;
        },
        getPids: () => [1], getMulti: () => cursor([]), getList: async () => ({}),
        getMultiStatus: (domainId, query) => { statusReads.push(query); return cursor(query.uid === 42 ? [] : [{ uid: 24 }]); },
        getStatus: async () => membership,
        setStatus: async (domainId, docId, uid, value) => { writes.push(['status', uid]); return { ...value, enroll: 1 }; },
        isDone: () => false, isProgress: () => false, isOpen: () => true, isInvalid: () => false,
        canSelfEnroll: (doc) => doc.allowSelfEnroll !== false,
        getDisplayAttend: (doc) => doc.attend,
        add: async () => { writes.push(['create']); return tid; },
        edit: async () => { writes.push(['edit']); },
        del: async () => { writes.push(['delete']); },
        enroll: async (domainId, docId, uid) => { writes.push(['enroll', uid]); if (uid === 42) membership.enroll = 1; },
        unenroll: async (domainId, docId, uid) => { writes.push(['unenroll', uid]); if (uid === 42) membership.enroll = 0; return true; },
    };
    const handlers = load('packages/hydrooj/src/handler/training.ts', {
        '@hydrooj/utils/lib/utils': { sortFiles: (files) => files },
        '../error': { PermissionError, ValidationError, ProblemNotFoundError, TrainingNotFoundError, TrainingAlreadyEnrollError: class extends Error {} },
        '../lib/training_access': access,
        '../model/builtin': { PERM, PRIV, STATUS: { STATUS_ACCEPTED: 1 } },
        '../model/domain': { getMultiUserInDomain: () => cursor([{ uid: 24 }]) },
        '../model/oplog': { log: async (...args) => { downloads.push(['log', ...args.slice(1)]); } },
        '../model/problem': {
            get: async () => ({ docId: 1, objectiveKind }), isObjectiveSource: (pdoc) => !!pdoc?.objectiveKind,
            getList: async () => ({ 1: { docId: 1 } }), getListStatus: async () => ({}),
        },
        '../model/storage': {
            del: async () => { writes.push(['files-delete']); },
            put: async () => { writes.push(['files-upload']); },
            getMeta: async (target) => { downloads.push(['metadata', target]); return { size: 10 }; },
            signDownloadLink: async (...args) => { downloads.push(['sign', ...args]); return '/download'; },
        },
        '../model/system': { get: () => 1000 },
        '../model/training': training,
        '../model/user': { getById: async () => ({ _id: owner }), getListForRender: async () => ({}), listGroup: async () => [] },
        '../service/server': { Handler, param: () => () => {}, post: () => () => {}, Types: { ArrayOf: () => {} } },
    });
    const routes = {};
    handlers.apply({ Route: (name, route, Constructor) => { routes[name] = Constructor; } });
    const make = (name) => new routes[name]();
    return { make, writes, statusReads, document, membership, downloads };
}
async function editDispatch(handler, method, editTid) {
    await handler.prepare('class-a', editTid);
    if (method === 'get') return handler.get();
    return handler.post('class-a', editTid, 'Plan', 'Summary', JSON.stringify(dag), 0, 'Description', true, 0);
}

describe('training teacher authorization', () => {
    it('rejects private question sources in a training even when the author is a teacher', async () => {
        const h = fixture(PERM.PERM_ALL, PRIV.PRIV_USER_PROFILE, 42, 'single');
        await assert.rejects(editDispatch(h.make('training_create'), 'post'), ValidationError);
        assert.deepEqual(h.writes, []);
    });

    it('rejects direct GET and POST create/edit even when a default learner owns the plan', async () => {
        assert.ok(PERM.PERM_DEFAULT & PERM.PERM_CREATE_TRAINING);
        assert.ok(PERM.PERM_DEFAULT & PERM.PERM_EDIT_TRAINING_SELF);
        for (const editTid of [undefined, tid]) {
            for (const method of ['get', 'post']) {
                const h = fixture();
                await assert.rejects(editDispatch(h.make(editTid ? 'training_edit' : 'training_create'), method, editTid), PermissionError);
                assert.deepEqual(h.writes, []);
            }
        }
    });

    it('rejects owner deletion, roster changes, and GET/POST file management before writing', async () => {
        const h = fixture();
        for (const action of [
            () => h.make('training_detail').postDelete('class-a', tid),
            () => h.make('training_detail').postAddUser('class-a', tid, [24]),
            () => h.make('training_detail').postRemoveUser('class-a', tid, [24]),
            async () => { const handler = h.make('training_files'); await handler.prepare('class-a', tid); await handler.get('class-a', tid); },
            async () => { const handler = h.make('training_files'); await handler.prepare('class-a', tid); await handler.postUploadFile('class-a', tid, 'new.txt'); },
            async () => { const handler = h.make('training_files'); await handler.prepare('class-a', tid); await handler.postDeleteFiles('class-a', tid, ['old.txt']); },
        ]) await assert.rejects(action, PermissionError);
        assert.deepEqual(h.writes, []);
    });

    it('removes learner authoring flags and forces the learner own progress despite an alternate uid', async () => {
        const h = fixture();
        const list = h.make('training_main'); await list.get('class-a');
        assert.equal(list.response.body.canCreateTraining, false);
        const detail = h.make('training_detail'); await detail.get('class-a', tid, 24);
        assert.equal(detail.response.body.canEditTraining, false);
        assert.equal(detail.response.body.canManageTraining, false);
        assert.equal(detail.response.body.trainingDirectProblemLinks, false);
        assert.equal(detail.response.body.viewingUid, 42);
        assert.equal(h.statusReads.some((query) => query.docId), false);
        assert.deepEqual(h.writes, [['status', 42]]);
    });

    it('keeps create, edit, delete, file management and enrollment management for teachers and administrators', async () => {
        for (const [permissions, privileges] of [
            [PERM.PERM_DEFAULT | PERM.PERM_EDIT_TRAINING, PRIV.PRIV_USER_PROFILE],
            [PERM.PERM_DEFAULT | PERM.PERM_EDIT_DOMAIN, PRIV.PRIV_USER_PROFILE],
            [PERM.PERM_DEFAULT, PRIV.PRIV_USER_PROFILE | PRIV.PRIV_EDIT_SYSTEM],
        ]) {
            const h = fixture(permissions, privileges, 99);
            await editDispatch(h.make('training_create'), 'post');
            await editDispatch(h.make('training_edit'), 'post', tid);
            const edit = h.make('training_edit'); await editDispatch(edit, 'get', tid);
            assert.equal(edit.response.body.canEditTraining, true);
            const list = h.make('training_main'); await list.get('class-a');
            assert.equal(list.response.body.canCreateTraining, true);
            await h.make('training_detail').postAddUser('class-a', tid, [24]);
            const remove = h.make('training_detail');
            await remove.postRemoveUser('class-a', tid, [24, 24]);
            assert.equal(remove.response.body.removedCount, 1);
            assert.equal(remove.response.body.displayAttend, 2);
            const files = h.make('training_files'); await files.prepare('class-a', tid); await files.get('class-a', tid);
            assert.equal(files.response.body.canEditTraining, true);
            await files.postUploadFile('class-a', tid, 'new.txt');
            await h.make('training_detail').postDelete('class-a', tid);
            assert.ok(h.writes.some(([operation]) => operation === 'create'));
            assert.ok(h.writes.some(([operation]) => operation === 'edit'));
            assert.ok(h.writes.some(([operation]) => operation === 'enroll'));
            assert.ok(h.writes.some(([operation]) => operation === 'unenroll'));
            assert.ok(h.writes.some(([operation]) => operation === 'files-upload'));
            assert.ok(h.writes.some(([operation]) => operation === 'delete'));
        }
    });

    it('continues to permit learners to enroll in an open plan', async () => {
        const h = fixture();
        await h.make('training_detail').postEnroll('class-a', tid);
        assert.deepEqual(h.writes, [['enroll', 42]]);
    });

    it('validates the complete removal batch before writing', async () => {
        for (const uids of [[], [1], [0], [-2], [2.5], [NaN], [Infinity], [Number.MAX_SAFE_INTEGER + 1],
            [24, 0], ['24'], new Array(501).fill(24)]) {
            const h = fixture(PERM.PERM_ALL);
            await assert.rejects(h.make('training_detail').postRemoveUser('class-a', tid, uids), ValidationError);
            assert.deepEqual(h.writes, []);
        }
    });

    it('rejects removing from a missing training or a different domain before writing', async () => {
        for (const [domainId, docId] of [['class-b', tid], ['class-a', new ObjectId()]]) {
            const h = fixture(PERM.PERM_ALL);
            await assert.rejects(h.make('training_detail').postRemoveUser(domainId, docId, [24]), TrainingNotFoundError);
            assert.deepEqual(h.writes, []);
        }
    });

    it('denies a removed learner the direct URL of a closed plan before progress writes or plan hooks', async () => {
        const h = fixture(PERM.PERM_DEFAULT, PRIV.PRIV_USER_PROFILE, 99);
        h.document.allowSelfEnroll = false;
        h.membership.enroll = 0;
        const detail = h.make('training_detail');
        detail.ctx.parallel = () => { throw new Error('unauthorized plan hook must not run'); };
        await assert.rejects(detail.get('class-a', tid, 24), TrainingNotFoundError);
        assert.deepEqual(h.writes, []);
    });

    it('permits a re-added learner to view a closed plan while open plans remain available to removed learners', async () => {
        const h = fixture(PERM.PERM_DEFAULT, PRIV.PRIV_USER_PROFILE, 99);
        h.document.allowSelfEnroll = false;
        h.membership.enroll = 1;
        await h.make('training_detail').get('class-a', tid);
        assert.deepEqual(h.writes, [['status', 42]]);
        h.membership.enroll = 0;
        h.document.allowSelfEnroll = true;
        await h.make('training_detail').get('class-a', tid);
        await h.make('training_detail').postEnroll('class-a', tid);
        assert.equal(h.membership.enroll, 1);
    });

    it('allows managers and plan owners to view closed plans without enrollment', async () => {
        for (const [permissions, privileges, owner] of [
            [PERM.PERM_DEFAULT, PRIV.PRIV_USER_PROFILE, 42],
            [PERM.PERM_DEFAULT | PERM.PERM_EDIT_TRAINING, PRIV.PRIV_USER_PROFILE, 99],
            [PERM.PERM_DEFAULT | PERM.PERM_EDIT_DOMAIN, PRIV.PRIV_USER_PROFILE, 99],
            [PERM.PERM_DEFAULT, PRIV.PRIV_USER_PROFILE | PRIV.PRIV_EDIT_SYSTEM, 99],
        ]) {
            const h = fixture(permissions, privileges, owner);
            h.document.allowSelfEnroll = false;
            h.membership.enroll = 0;
            await h.make('training_detail').get('class-a', tid);
            assert.deepEqual(h.writes, [['status', 42]]);
        }
    });

    it('rejects a removed learner saved attachment URL before reading, logging, or signing a closed plan file', async () => {
        const h = fixture(PERM.PERM_DEFAULT, PRIV.PRIV_USER_PROFILE, 99);
        h.document.allowSelfEnroll = false;
        h.membership.enroll = 0;
        const download = h.make('training_file_download');
        await assert.rejects(download.get('class-a', tid, 'notes.pdf'), TrainingNotFoundError);
        assert.deepEqual(h.downloads, []);
        assert.equal(download.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(download.response.redirect, undefined);
    });

    it('permits re-added learners and open-plan learners to download attachments without public caching', async () => {
        for (const [open, enrolled] of [[false, 1], [true, 0]]) {
            const h = fixture(PERM.PERM_DEFAULT, PRIV.PRIV_USER_PROFILE, 99);
            h.document.allowSelfEnroll = open;
            h.membership.enroll = enrolled;
            const download = h.make('training_file_download');
            await download.get('class-a', tid, 'notes.pdf');
            assert.deepEqual(h.downloads.map(([operation]) => operation), ['metadata', 'log', 'sign']);
            assert.equal(h.downloads[2][1], `training/class-a/${tid}/notes.pdf`);
            assert.equal(download.response.headers['Cache-Control'], 'private, no-store');
            assert.equal(download.response.redirect, '/download');
        }
    });

    it('permits managers and owners to download closed-plan files while denying missing and cross-domain plans', async () => {
        for (const [permissions, privileges, owner] of [
            [PERM.PERM_DEFAULT, PRIV.PRIV_USER_PROFILE, 42],
            [PERM.PERM_DEFAULT | PERM.PERM_EDIT_TRAINING, PRIV.PRIV_USER_PROFILE, 99],
            [PERM.PERM_DEFAULT | PERM.PERM_EDIT_DOMAIN, PRIV.PRIV_USER_PROFILE, 99],
            [PERM.PERM_DEFAULT, PRIV.PRIV_USER_PROFILE | PRIV.PRIV_EDIT_SYSTEM, 99],
        ]) {
            const h = fixture(permissions, privileges, owner);
            h.document.allowSelfEnroll = false;
            h.membership.enroll = 0;
            await h.make('training_file_download').get('class-a', tid, 'notes.pdf');
            assert.equal(h.downloads.at(-1)[0], 'sign');
        }
        for (const [domainId, docId] of [['class-b', tid], ['class-a', new ObjectId()]]) {
            const h = fixture(PERM.PERM_ALL);
            await assert.rejects(h.make('training_file_download').get(domainId, docId, 'notes.pdf'), TrainingNotFoundError);
            assert.deepEqual(h.downloads, []);
        }
    });
});
