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
const tid = new ObjectId();
const dag = [{ _id: 1, title: 'Chapter', pids: [1], requireNids: [] }];
function fixture(permissions = PERM.PERM_DEFAULT, privileges = PRIV.PRIV_USER_PROFILE, owner = 42) {
    const writes = [];
    const statusReads = [];
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
            this.response = {};
        }
        checkPerm(permission) { if (!this.user.hasPerm(permission)) throw new PermissionError(); }
        checkPriv(privilege) { if (!this.user.hasPriv(privilege)) throw new PermissionError(); }
        async paginate() { return [[], 1]; }
        url(name) { return `/${name}`; }
        back() { this.response.redirect = '/back'; }
    }
    const training = {
        get: async () => document,
        getPids: () => [1], getMulti: () => cursor([]), getList: async () => ({}),
        getMultiStatus: (domainId, query) => { statusReads.push(query); return cursor(query.uid === 42 ? [] : [{ uid: 24 }]); },
        getStatus: async () => ({ enroll: 1 }),
        setStatus: async (domainId, docId, uid, value) => { writes.push(['status', uid]); return { ...value, enroll: 1 }; },
        isDone: () => false, isProgress: () => false, isOpen: () => true, isInvalid: () => false,
        canSelfEnroll: (doc) => doc.allowSelfEnroll !== false,
        add: async () => { writes.push(['create']); return tid; },
        edit: async () => { writes.push(['edit']); },
        del: async () => { writes.push(['delete']); },
        enroll: async (domainId, docId, uid) => { writes.push(['enroll', uid]); },
    };
    const handlers = load('packages/hydrooj/src/handler/training.ts', {
        '@hydrooj/utils/lib/utils': { sortFiles: (files) => files },
        '../error': { PermissionError, ValidationError, TrainingAlreadyEnrollError: class extends Error {} },
        '../lib/training_access': access,
        '../model/builtin': { PERM, PRIV, STATUS: { STATUS_ACCEPTED: 1 } },
        '../model/domain': { getMultiUserInDomain: () => cursor([{ uid: 24 }]) },
        '../model/oplog': {},
        '../model/problem': { get: async () => ({ docId: 1 }), getList: async () => ({ 1: { docId: 1 } }), getListStatus: async () => ({}) },
        '../model/storage': { del: async () => { writes.push(['files-delete']); }, put: async () => { writes.push(['files-upload']); }, getMeta: async () => ({ size: 10 }) },
        '../model/system': { get: () => 1000 },
        '../model/training': training,
        '../model/user': { getById: async () => ({ _id: owner }), getListForRender: async () => ({}), listGroup: async () => [] },
        '../service/server': { Handler, param: () => () => {}, post: () => () => {}, Types: { ArrayOf: () => {} } },
    });
    const routes = {};
    handlers.apply({ Route: (name, route, Constructor) => { routes[name] = Constructor; } });
    const make = (name) => new routes[name]();
    return { make, writes, statusReads, document };
}
async function editDispatch(handler, method, editTid) {
    await handler.prepare('class-a', editTid);
    if (method === 'get') return handler.get();
    return handler.post('class-a', editTid, 'Plan', 'Summary', JSON.stringify(dag), 0, 'Description', true, 0);
}

describe('training teacher authorization', () => {
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
            const files = h.make('training_files'); await files.prepare('class-a', tid); await files.get('class-a', tid);
            assert.equal(files.response.body.canEditTraining, true);
            await files.postUploadFile('class-a', tid, 'new.txt');
            await h.make('training_detail').postDelete('class-a', tid);
            assert.ok(h.writes.some(([operation]) => operation === 'create'));
            assert.ok(h.writes.some(([operation]) => operation === 'edit'));
            assert.ok(h.writes.some(([operation]) => operation === 'enroll'));
            assert.ok(h.writes.some(([operation]) => operation === 'files-upload'));
            assert.ok(h.writes.some(([operation]) => operation === 'delete'));
        }
    });

    it('continues to permit learners to enroll in an open plan', async () => {
        const h = fixture();
        await h.make('training_detail').postEnroll('class-a', tid);
        assert.deepEqual(h.writes, [['enroll', 42]]);
    });
});
