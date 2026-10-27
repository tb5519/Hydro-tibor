const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '..');
class UserFacingError extends Error { msg() { return this.message; } }
class PermissionError extends UserFacingError {}
class ValidationError extends UserFacingError {}
const CreateError = (name, Parent, message, code) => class extends Parent {
    constructor() { super(message); this.name = name; this.code = code; }
};
const errors = { CreateError, UserFacingError, PermissionError, ValidationError };
const load = (name, dependencies = {}) => {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, name), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module, exports: module.exports, Buffer, URL, Date, process, require: (id) => dependencies[id] ?? require(id) });
    return module.exports;
};
const { PERM, PRIV } = load('packages/common/permission.ts');
const now = new Date('2026-10-27T12:00:00+08:00');
const payload = (updates = {}) => ({ externalId: 'school-lesson-123', domainId: 'python', uid: 20,
    startAt: '2026-10-26T10:00:00+08:00', durationHours: 1.5, title: 'Python 课堂', ...updates });
const scope = { workspaceId: 'school-a', domains: [{ id: 'python', owner: 10 }, { id: 'cpp', owner: 10 }] };
let mongod; let client; let database; let model; let handlers; let scopeModel; let domainModel; let userModel; let workspaceModel;
const isScratchDomain = (doc) => doc?.domainType === 'scratch';

before(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    database = client.db('class-time');
    const db = { collection: (name) => database.collection(name), ensureIndexes: (coll, ...indexes) => coll.createIndexes(indexes) };
    domainModel = {
        collUser: database.collection('domain.user'), get: (id) => database.collection('domain').findOne({ _id: id }),
    };
    userModel = { getById: async (domainId, uid) => {
        const account = await database.collection('user').findOne({ _id: uid });
        return account ? { ...account,
            hasPriv: (value) => (account.priv & value) === value,
            hasPerm: (value) => value === PERM.PERM_VIEW ? !account.denyView : account.editDomains.includes(domainId),
        } : null;
    } };
    workspaceModel = {
        LEGACY_WORKSPACE_ID: 'tang', isEnabled: () => true, isPlatformAdmin: () => false,
        resolveDomainWorkspaceId: (doc) => doc?.workspaceId || 'tang',
        get: (id) => database.collection('workspace').findOne({ _id: id }),
        getDomains: (id) => database.collection('domain').find({ workspaceId: id }).toArray(),
        getMembers: (id) => database.collection('workspace.member').find({ workspaceId: id, status: 'active' }).toArray(),
        getAssignedWorkspaceIds: async (uid) => (await database.collection('user').findOne({ _id: uid }))?.assigned || [],
        getExcludedLegacyUids: async () => new Set(await database.collection('user').distinct('_id', { assigned: { $in: ['school-a', 'school-b'] } })),
    };
    model = load('packages/hydrooj/src/model/class_time.ts', {
        '../error': errors, '../lib/domain_type': { isScratchDomain }, '../service/db': db,
        '../lib/training_time': load('packages/hydrooj/src/lib/training_time.ts'),
        './builtin': { PERM, PRIV }, './domain': domainModel, './user': userModel, './workspace': workspaceModel,
        './training_dashboard': { trainingDashboardScope: (...args) => scopeModel.trainingDashboardScope(...args) },
    });
    scopeModel = load('packages/hydrooj/src/model/training_dashboard.ts', {
        '../error': errors, '../lib/domain_type': { isScratchDomain },
        '../lib/learning_time': {},
        '../lib/training_dashboard': load('packages/hydrooj/src/lib/training_dashboard.ts'),
        '../utils': { Time: {} }, './builtin': { PERM, PRIV, STATUS: {} }, './domain': domainModel,
        './user': userModel, './workspace': workspaceModel, './record': {}, './problem': {}, './training_time': {}, './class_time': model,
    });
    await model.apply({ db });
    handlers = load('packages/hydrooj/src/handler/class_time.ts', {
        '../error': errors, '../model/class_time': model, '../service/server': { Handler: class {} },
    });
});

beforeEach(async () => {
    await Promise.all(['workspace', 'workspace.member', 'domain', 'domain.user', 'user', 'training.class', 'training.class.token']
        .map((name) => database.collection(name).deleteMany({})));
    await database.collection('workspace').insertMany([
        { _id: 'school-a', status: 'active' }, { _id: 'school-b', status: 'active' }, { _id: 'tang', status: 'active' },
    ]);
    await database.collection('domain').insertMany([
        { _id: 'python', workspaceId: 'school-a', owner: 10, domainType: 'oj' },
        { _id: 'cpp', workspaceId: 'school-a', owner: 10, domainType: 'oj' },
        { _id: 'other', workspaceId: 'school-b', owner: 11, domainType: 'oj' },
        { _id: 'scratch', workspaceId: 'school-a', owner: 10, domainType: 'scratch' },
        { _id: 'system', workspaceId: 'tang', owner: 12, domainType: 'oj' },
    ]);
    await database.collection('user').insertMany([
        { _id: 10, priv: PRIV.PRIV_USER_PROFILE, editDomains: ['python', 'cpp', 'scratch'], assigned: ['school-a'] },
        { _id: 11, priv: PRIV.PRIV_USER_PROFILE, editDomains: ['other'], assigned: ['school-b'] },
        { _id: 12, priv: PRIV.PRIV_USER_PROFILE, editDomains: ['system'], assigned: [] },
        { _id: 20, priv: PRIV.PRIV_USER_PROFILE, editDomains: [], assigned: ['school-a'] },
        { _id: 21, priv: PRIV.PRIV_USER_PROFILE, editDomains: [], assigned: ['school-b'] },
    ]);
    await database.collection('workspace.member').insertMany([
        { workspaceId: 'school-a', uid: 10, status: 'active' }, { workspaceId: 'school-b', uid: 11, status: 'active' },
    ]);
    await domainModel.collUser.insertMany([
        { domainId: 'python', uid: 20, join: true }, { domainId: 'cpp', uid: 20, join: true },
        { domainId: 'other', uid: 21, join: true }, { domainId: 'python', uid: 10, join: true },
    ]);
});
after(async () => { await client?.close(); await mongod?.stop(); });
const issue = (selected = scope) => model.issueToken(selected, 10, now);
const write = (secret, updates = {}, requestDomain) => model.ingest(secret, payload(updates), requestDomain, now);

describe('class-time scoped tokens and durable idempotent imports', () => {
    it('lets a full-privilege administrator generate a token for both legacy classrooms and import class time', async () => {
        await database.collection('user').updateOne({ _id: 12 }, { $set: { priv: PRIV.PRIV_ALL, editDomains: [] } });
        await database.collection('domain').insertOne({ _id: 'C0001', workspaceId: 'tang', owner: 12, domainType: 'oj' });
        await database.collection('user').insertOne({ _id: 22, priv: PRIV.PRIV_USER_PROFILE, editDomains: [], assigned: [] });
        await domainModel.collUser.insertOne({ domainId: 'system', uid: 22, join: true });
        const teacher = await userModel.getById('system', 12);
        assert.equal(teacher.hasPriv(PRIV.PRIV_JUDGE), true);
        assert.equal(teacher.hasPriv(PRIV.PRIV_EDIT_SYSTEM), true);
        const allowed = await scopeModel.trainingDashboardScope({
            domain: await domainModel.get('system'), user: teacher, session: {},
        });
        assert.deepEqual(Array.from(allowed.domains, (item) => item.id).sort(), ['C0001', 'system']);
        const issued = await model.issueToken(allowed, 12, now);
        assert.equal(issued.status.active, true);
        const result = await write(issued.token, { uid: 22, domainId: 'system' });
        assert.equal(result.accepted, true);
        assert.equal(await model.classes.countDocuments({ uid: 22 }), 1);
    });
    it('keeps administrator tokens inside their selected classrooms and assigned active workspace', async () => {
        for (const priv of [PRIV.PRIV_ALL, PRIV.PRIV_USER_PROFILE | PRIV.PRIV_EDIT_SYSTEM | PRIV.PRIV_JUDGE]) {
            await database.collection('user').updateOne({ _id: 10 }, { $set: { priv } });
            const issued = await issue({ workspaceId: 'school-a', domains: [{ id: 'python' }] });
            assert.equal((await write(issued.token)).accepted, true);
            await assert.rejects(() => write(issued.token, { domainId: 'cpp' }), model.ClassTimeScopeError);
            await assert.rejects(() => issue({ workspaceId: 'school-b', domains: [{ id: 'other' }] }), model.ClassTimeScopeError);
            await database.collection('workspace').updateOne({ _id: 'school-a' }, { $set: { status: 'disabled' } });
            await assert.rejects(() => issue(), model.ClassTimeScopeError);
            await assert.rejects(() => write(issued.token), model.ClassTimeScopeError);
            await database.collection('workspace').updateOne({ _id: 'school-a' }, { $set: { status: 'active' } });
        }
    });
    it('continues to reject judge service accounts without administrator privilege on issue and ingestion', async () => {
        const issued = await issue();
        await database.collection('user').updateOne({ _id: 10 }, { $set: {
            priv: PRIV.PRIV_USER_PROFILE | PRIV.PRIV_JUDGE | PRIV.PRIV_VIEW_ALL_DOMAIN
                | PRIV.PRIV_READ_PROBLEM_DATA | PRIV.PRIV_UNLIMITED_ACCESS,
        } });
        await assert.rejects(() => issue(), model.ClassTimeScopeError);
        await assert.rejects(() => write(issued.token), model.ClassTimeScopeError);
        assert.equal(await model.classes.countDocuments(), 0);
    });
    it('stores only the hash, returns public token metadata, and writes completed lessons separately', async () => {
        const issued = await issue();
        assert.match(issued.token, /^ct_[a-f0-9]{64}$/);
        assert.equal(issued.status.active, true);
        const stored = await model.tokens.findOne({ teacherUid: 10 });
        assert.equal(stored.hash.length, 64);
        assert(!JSON.stringify(stored).includes(issued.token));
        assert(!JSON.stringify(await model.tokenStatus(10, 'school-a', now)).includes(stored.hash));
        const result = await write(issued.token);
        assert.equal(result.accepted, true); assert.equal(result.duplicate, false); assert.equal(result.durationHours, 1.5);
        const row = await model.classes.findOne({ uid: 20 });
        assert.equal(row.day, '2026-10-26'); assert.equal(row.durationSeconds, 5400);
        assert.equal(row.endAt.toISOString(), '2026-10-26T03:30:00.000Z');
        assert.equal(await database.collection('training.time.daily').countDocuments(), 0);
    });
    it('makes simultaneous retries exactly once and conflicts on changed content', async () => {
        const { token } = await issue();
        const results = await Promise.all(Array.from({ length: 8 }, () => write(token)));
        assert.equal(results.filter((item) => !item.duplicate).length, 1);
        assert.equal(await model.classes.countDocuments(), 1);
        for (const change of [{ durationHours: 2 }, { title: 'Changed' }, { domainId: 'cpp' }, { startAt: '2026-10-26T11:00:00+08:00' }]) {
            await assert.rejects(() => write(token, change), model.ClassTimeConflictError);
        }
        assert.equal(await model.classes.countDocuments(), 1);
    });
    it('rotation invalidates the old token while external IDs retain idempotency', async () => {
        const first = await issue(); await write(first.token);
        const second = await issue();
        await assert.rejects(() => write(first.token), model.ClassTimeTokenError);
        assert.equal((await write(second.token)).duplicate, true);
        assert.equal(await model.tokens.countDocuments(), 1);
    });
    it('explicitly rejects expired, revoked, malformed and missing tokens', async () => {
        const { token } = await issue();
        for (const secret of [undefined, '', 'ct_bad', 'x'.repeat(67)]) await assert.rejects(() => write(secret), model.ClassTimeTokenError);
        await model.tokens.updateOne({ teacherUid: 10 }, { $set: { expiresAt: now } });
        await assert.rejects(() => write(token), model.ClassTimeTokenError);
        const second = await issue();
        assert.equal((await model.revokeToken(10, 'school-a', now)).active, false);
        await assert.rejects(() => write(second.token), model.ClassTimeTokenError);
    });
    it('rejects classroom selection outside the real current teacher scope', async () => {
        for (const id of ['other', 'missing', 'scratch']) {
            await assert.rejects(() => issue({ workspaceId: 'school-a', domains: [{ id }] }), model.ClassTimeScopeError);
        }
        const { token } = await issue({ workspaceId: 'school-a', domains: [{ id: 'python' }] });
        await assert.rejects(() => write(token, { domainId: 'cpp' }), model.ClassTimeScopeError);
        await assert.rejects(() => write(token, { domainId: 'other', uid: 21 }), model.ClassTimeScopeError);
        await assert.rejects(() => write(token, {}, { _id: 'other', workspaceId: 'school-b' }), model.ClassTimeScopeError);
    });
    it('rechecks teacher permissions, disabled workspaces, profile and workspace assignments', async () => {
        const { token } = await issue();
        await database.collection('workspace').updateOne({ _id: 'school-a' }, { $set: { status: 'disabled' } });
        await assert.rejects(() => write(token), model.ClassTimeScopeError);
        await database.collection('workspace').updateOne({ _id: 'school-a' }, { $set: { status: 'active' } });
        for (const change of [{ editDomains: [] }, { priv: 0 }, { assigned: ['school-b'] }]) {
            await database.collection('user').updateOne({ _id: 10 }, { $set: change });
            await assert.rejects(() => write(token), model.ClassTimeScopeError);
            await database.collection('user').updateOne({ _id: 10 }, { $set: { editDomains: ['python', 'cpp'], priv: PRIV.PRIV_USER_PROFILE, assigned: ['school-a'] } });
        }
        await database.collection('domain').updateOne({ _id: 'python' }, { $set: { workspaceId: 'school-b' } });
        await assert.rejects(() => write(token), model.ClassTimeScopeError);
    });
    it('rejects unjoined, removed, nonexistent, privileged, teaching and foreign learners', async () => {
        const { token } = await issue();
        for (const uid of [10, 21, 999, 1]) await assert.rejects(() => write(token, { uid }));
        for (const change of [{ join: false }, { blockedByStudentManagement: true }]) {
            await domainModel.collUser.updateOne({ domainId: 'python', uid: 20 }, { $set: change });
            await assert.rejects(() => write(token), model.ClassTimeScopeError);
            await domainModel.collUser.updateOne({ domainId: 'python', uid: 20 }, { $set: { join: true, blockedByStudentManagement: false } });
        }
        for (const change of [{ priv: PRIV.PRIV_ALL }, { priv: PRIV.PRIV_USER_PROFILE | PRIV.PRIV_EDIT_SYSTEM },
            { priv: PRIV.PRIV_USER_PROFILE | PRIV.PRIV_JUDGE }, { priv: 0 }, { editDomains: ['python'] }, { denyView: true }]) {
            await database.collection('user').updateOne({ _id: 20 }, { $set: change });
            await assert.rejects(() => write(token), model.ClassTimeScopeError);
            await database.collection('user').updateOne({ _id: 20 }, { $set: { priv: PRIV.PRIV_USER_PROFILE, editDomains: [], denyView: false } });
        }
    });
    it('excludes other workspace teachers and modern students from the legacy classroom', async () => {
        const { token } = await issue();
        await database.collection('workspace.member').insertOne({ workspaceId: 'school-a', uid: 20, status: 'active' });
        await assert.rejects(() => write(token), model.ClassTimeScopeError);
        await domainModel.collUser.insertOne({ domainId: 'system', uid: 20, join: true });
        const legacy = await model.issueToken({ workspaceId: 'tang', domains: [{ id: 'system' }] }, 12, now);
        await assert.rejects(() => write(legacy.token, { domainId: 'system' }), model.ClassTimeScopeError);
    });
    it('rejects malformed duration, dates, unknown keys, IDs and future or unfinished lessons', async () => {
        const { token } = await issue();
        for (const durationHours of [0, -1, 24.01, Infinity, NaN, '1.5', 0.00000001]) {
            await assert.rejects(() => write(token, { durationHours }), ValidationError);
        }
        for (const startAt of ['2026-10-26T10:00:00', '2026-02-30T10:00:00+08:00', '2026-10-26T10:00:00+99:00', 'tomorrow',
            '2026-10-27T11:30:00+08:00', '2026-10-28T10:00:00+08:00']) await assert.rejects(() => write(token, { startAt }), ValidationError);
        for (const change of [{ externalId: '' }, { externalId: 'x'.repeat(129) }, { externalId: 'foo\nbar' }, { uid: '20' },
            { title: 'x'.repeat(201) }, { hours: 100 }, { workspaceId: 'school-b' }]) await assert.rejects(() => write(token, change), ValidationError);
        assert.equal(await model.classes.countDocuments(), 0);
    });
    it('allows an ISO offset-equivalent replay without duplicate credit and preserves school-wide IDs', async () => {
        const { token } = await issue(); await write(token);
        assert.equal((await write(token, { startAt: '2026-10-26T02:00:00Z' })).duplicate, true);
        const other = await model.issueToken({ workspaceId: 'school-b', domains: [{ id: 'other' }] }, 11, now);
        await write(other.token, { domainId: 'other', uid: 21 });
        assert.equal(await model.classes.countDocuments({ externalId: 'school-lesson-123' }), 2);
    });
});

function handler(body, authorization) {
    const h = new handlers.ClassTimeIngestHandler();
    return Object.assign(h, { domain: { _id: 'system' }, request: { query: {}, body, headers: {
        'content-type': 'application/json; charset=utf-8', ...(authorization === undefined ? {} : { authorization }),
    } }, response: { status: 200, addHeader() {} }, limitRate: async () => {} });
}

describe('external class-time request boundary', () => {
    it('supports a Bearer header and a JSON token, and always requires independent credentials', async () => {
        const issued = await model.issueToken(scope, 10);
        const h = handler(payload(), `Bearer ${issued.token}`); await h.prepare(); await h.post();
        assert.equal(h.response.body.accepted, true); assert.equal(h.response.type, 'application/json');
        const retry = handler({ ...payload(), token: issued.token }); await retry.post();
        assert.equal(retry.response.body.duplicate, true);
        await assert.rejects(() => handler(payload()).post(), model.ClassTimeTokenError);
    });
    it('never accepts URL secrets and rejects ambiguous auth, non-JSON, extra keys and arrays', async () => {
        const { token } = await model.issueToken(scope, 10);
        const url = handler(payload(), `Bearer ${token}`); url.request.query.token = token;
        await assert.rejects(() => url.post(), ValidationError);
        await assert.rejects(() => handler({ ...payload(), token: 'different' }, `Bearer ${token}`).post(), model.ClassTimeTokenError);
        await assert.rejects(() => handler(payload(), `Basic ${token}`).post(), model.ClassTimeTokenError);
        const form = handler({ ...payload(), token }); form.request.headers['content-type'] = 'application/x-www-form-urlencoded';
        await assert.rejects(() => form.post(), ValidationError);
        await assert.rejects(() => handler([], `Bearer ${token}`).post(), ValidationError);
    });
    it('returns JSON 401/403/409 and validation 400 without a login redirect', async () => {
        for (const [error, code] of [[new model.ClassTimeTokenError(), 401], [new model.ClassTimeScopeError(), 403],
            [new model.ClassTimeConflictError(), 409], [new ValidationError('durationHours'), 400]]) {
            const h = handler({}); await h.onerror(error);
            assert.equal(h.response.status, code); assert.equal(h.response.type, 'application/json');
            assert.equal(h.response.redirect, undefined); assert(h.response.body.error);
        }
    });
    it('exempts precisely the ingestion POST and registers only the intended route', () => {
        const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/service/server.ts'), 'utf8');
        const functionText = source.match(/export function isClassTimeIngestionRequest\([^]*?\n\}/)[0];
        const fn = loadFunction(functionText);
        assert.equal(fn('/training-time/classes', 'POST'), true);
        assert.equal(fn('/training-time/classes', 'post'), true);
        for (const method of ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']) assert.equal(fn('/training-time/classes', method), false);
        for (const target of ['/training-time/classes/', '/training-time/classes/anything', '/training-time/session', '/manage/training-dashboard']) {
            assert.equal(fn(target, 'POST'), false);
        }
        assert.match(source, /isClassTimeIngestionRequest\(path, method\)/);
        assert.match(source, /isClassTimeIngestionRequest\(h\.request\.path, h\.request\.method\)/);
        assert.match(source, /isClassTimeIngestionRequest\(c\.request\.path, c\.request\.method\)[^\n]+delete c\.handler\.args\.token/);
        const routes = []; handlers.apply({ Route: (...args) => routes.push(args) });
        assert.equal(routes.length, 1); assert.equal(routes[0][1], '/training-time/classes');
        assert.equal(typeof handlers.ClassTimeIngestHandler.prototype.get, 'undefined');
    });
});

function loadFunction(source) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, { module, exports: module.exports });
    return module.exports.isClassTimeIngestionRequest;
}
