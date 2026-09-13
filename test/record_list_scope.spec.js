/* eslint-disable no-await-in-loop -- Mock fixtures and captured calls are shared, so scenario checks must remain sequential. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { beforeEach, describe, it } = require('node:test');
const esbuild = require('esbuild');
const { ObjectId } = require('mongodb');

const sourcePath = (name) => path.join(__dirname, '../packages/hydrooj/src', name);
function loadSource(filename, imports, globals = {}) {
    const source = fs.readFileSync(sourcePath(filename), 'utf8');
    const compiled = esbuild.transformSync(source, {
        loader: 'ts', format: 'cjs', target: 'es2022',
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    const sandbox = {
        module: { exports: {} }, exports: {}, ObjectId, Array,
        require(name) {
            if (Object.hasOwn(imports, name)) return imports[name];
            throw new Error(`Unexpected dependency ${name} in ${filename}`);
        },
        ...globals,
    };
    vm.runInNewContext(compiled, sandbox, { filename });
    return sandbox.module.exports;
}

const { PERM, PRIV } = loadSource('../../common/permission.ts', {});
const { STATUS } = loadSource('../../common/status.ts', {});
const builtin = { PERM, PRIV, STATUS };
const contestAccess = loadSource('lib/contest_access.ts', {
    '../model/builtin': builtin,
    './student_level': loadSource('lib/student_level.ts', {}),
});
const scope = loadSource('lib/record_list_scope.ts', { '../model/builtin': builtin });
const navigation = loadSource('lib/ui.ts', {
    '../model/builtin': builtin, './record_list_scope': scope,
}, { global: { Hydro: { ui: {} } } });

function account({ uid = 12, perm = PERM.PERM_DEFAULT, priv = PRIV.PRIV_DEFAULT } = {}) {
    return {
        _id: uid, perm, priv,
        hasPerm: (value) => (perm & value) === value,
        hasPriv: (value) => (priv & value) === value,
        own: (doc) => doc?.owner === uid,
    };
}
const teacher = () => account({ uid: 14, perm: PERM.PERM_ALL });
const admin = () => account({ uid: 14, perm: PERM.PERM_ALL, priv: PRIV.PRIV_ALL });
const pretestId = new ObjectId('000000000000000000000000');
const generateId = new ObjectId('000000000000000000000001');
const contestId = new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
let fixtures;
let calls;
let hiddenUids;
let allowScoreboard;
let allowSelfRecord;
let allowOtherRecord;

function same(a, b) {
    return a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a === b;
}
function matches(row, filter) {
    return Object.entries(filter).every(([key, expected]) => {
        if (key === '$or') return expected.some((part) => matches(row, part));
        if (key === '$and') return expected.every((part) => matches(row, part));
        if (expected && typeof expected === 'object' && !(expected instanceof ObjectId)) {
            return Object.entries(expected).every(([operator, value]) => {
                if (operator === '$ne') return !same(row[key], value);
                if (operator === '$in') return value.some((item) => same(row[key], item));
                if (operator === '$nin') return !value.some((item) => same(row[key], item));
                if (operator === '$gt') return row[key] > value;
                throw new Error(`Unexpected filter operator ${operator}`);
            });
        }
        return same(row[key], expected);
    });
}
function cursor(rows) {
    return {
        sort() { return this; }, project() { return this; },
        skip(count) { rows = rows.slice(count); return this; },
        limit(count) { rows = rows.slice(0, count); return this; },
        async toArray() { return rows.map((row) => ({ ...row })); },
    };
}
const tdoc = { docId: contestId, domainId: 'A', pids: [1], rule: 'acm', owner: 14 };
const recordModel = {
    RECORD_PRETEST: pretestId, RECORD_GENERATE: generateId, PROJECTION_LIST: ['uid', '_id'],
    getMulti(domainId, query) {
        calls.push(['records', domainId, query]);
        return cursor(fixtures.filter((row) => (!domainId || row.domainId === domainId) && matches(row, query)));
    },
};
const userModel = {
    async getById(domainId, uid) {
        calls.push(['userById', domainId, uid]);
        return [12, 13, 14].includes(uid) ? { _id: uid } : null;
    },
    async getByUname(domainId, uname) {
        calls.push(['userByUname', domainId, uname]);
        return uname === 'student-b' ? { _id: 13 } : null;
    },
    async getByEmail(domainId, email) {
        calls.push(['userByEmail', domainId, email]);
        return email === 'student-b@example.test' ? { _id: 13 } : null;
    },
    async getList(domainId, uids) { return Object.fromEntries(uids.map((uid) => [uid, { _id: uid }])); },
};
const problemModel = {
    PROJECTION_LIST: [], PROJECTION_CONTEST_LIST: [], default: {},
    async get(domainId, pid) { return { docId: +pid, domainId, pid }; },
    async getList(domainId, pids) { return Object.fromEntries(pids.map((pid) => [pid, { docId: pid }])); },
    canViewBy: () => true,
};
const contestModel = {
    async get(domainId, tid) { return domainId === 'A' && same(tid, contestId) ? tdoc : null; },
    getMulti() { return cursor([]); },
    async getStatus() { return { attend: true }; },
    canShowScoreboard: () => allowScoreboard,
    canShowSelfRecord() { calls.push(['canShowSelfRecord']); return allowSelfRecord; },
    canShowRecord() { calls.push(['canShowRecord']); return allowOtherRecord; },
    applyProjection(contest, row) { calls.push(['projection', row.uid]); return row; },
};
class PermissionError extends Error { }
class TestHandler {
    checkPerm(perm) { if (!this.user.hasPerm(perm)) throw new PermissionError('permission denied'); }
    checkPriv(priv) { if (!this.user.hasPriv(priv)) throw new PermissionError('privilege denied'); }
}
const handlers = loadSource('handler/record.ts', {
    lodash: require('lodash'), mongodb: { ObjectId },
    '../error': {
        PermissionError, ContestNotFoundError: Error, HackRejudgeFailedError: Error,
        PretestRejudgeFailedError: Error, ProblemConfigError: Error, ProblemNotFoundError: Error,
        RecordNotFoundError: Error, UserNotFoundError: Error,
    },
    '../lib/badge_ac_theme': {}, '../lib/record_list_scope': scope,
    '../lib/contest_access': contestAccess,
    '../lib/homework_review': {}, '../lib/objective_submission': {}, '../lib/problem_record_replay': {},
    '../lib/record_visibility': {
        async getHiddenSuperAdminUids() { return hiddenUids; },
        appendHiddenSuperAdminFilter(query, uids) {
            if (uids.length) query.$and = [...(query.$and || []), { uid: { $nin: uids } }];
        },
    },
    '../model/builtin': builtin, '../model/contest': contestModel, '../model/problem': problemModel,
    '../model/record': recordModel, '../model/setting': {}, '../model/storage': {},
    '../model/system': { get: (key) => key === 'pagination.record' ? 20 : undefined },
    '../model/task': {}, '../model/user': userModel,
    '../service/server': {
        Handler: TestHandler, ConnectionHandler: TestHandler,
        param: () => () => {}, query: () => () => {}, route: () => () => {}, subscribe: () => () => {}, Types: {},
    },
    '../utils': { buildProjection: () => ({}), Time: { week: 604800000, getObjectID: () => new ObjectId('000000000000000000000002') } },
    './contest': { ContestDetailBaseHandler: TestHandler }, './judge': {},
});

function setup(instance, viewer, options = {}) {
    Object.assign(instance, {
        user: viewer, args: { domainId: 'A' }, request: { query: options.query || {} },
        response: {}, ...options,
    });
    return instance;
}
async function http(viewer = account(), options = {}) {
    const instance = setup(new handlers.RecordListHandler(), viewer, options);
    await instance.get('A', options.page || 1, options.pid, options.tid, options.uidOrName,
        options.lang, options.status, options.full || false, options.includePretest || false,
        options.all || false, options.allDomain || false, false);
    return instance;
}
async function socket(viewer = account(), options = {}) {
    const instance = setup(new handlers.RecordMainConnectionHandler(), viewer, options);
    await instance.prepare('A', options.tid, options.pid, options.uidOrName, options.status,
        options.pretest || false, options.includePretest || false, options.all || false, options.allDomain || false, true);
    instance.deliveries = [];
    instance.queueSend = (rid, makePayload) => { instance.deliveries.push({ rid, makePayload }); };
    return instance;
}

beforeEach(() => {
    calls = [];
    hiddenUids = [];
    allowScoreboard = true;
    allowSelfRecord = true;
    allowOtherRecord = true;
    const row = (uid, extra = {}) => ({ _id: new ObjectId(), uid, pid: 1, status: 1, lang: 'py', domainId: 'A', ...extra });
    fixtures = [row(12), row(13), row(14), row(12, { domainId: 'B' }),
        row(12, { contest: pretestId }), row(13, { contest: pretestId }), row(12, { contest: generateId })];
});

describe('record list manager capability and navigation', () => {
    it('does not mistake ordinary students or accepted-code readers for teachers', () => {
        assert.equal(scope.canManageRecordList(account()), false);
        assert.equal(scope.canManageRecordList(account({ perm: PERM.PERM_DEFAULT | PERM.PERM_READ_RECORD_CODE_ACCEPT })), false);
        assert.equal(scope.canManageRecordList(account({ uid: 1, priv: 0, perm: PERM.PERM_BASIC })), false);
    });

    it('recognizes each relevant global and current-domain management capability', () => {
        for (const priv of [PRIV.PRIV_EDIT_SYSTEM, PRIV.PRIV_MANAGE_ALL_DOMAIN, PRIV.PRIV_READ_RECORD_CODE, PRIV.PRIV_REJUDGE]) {
            assert.equal(scope.canManageRecordList(account({ priv: PRIV.PRIV_DEFAULT | priv })), true);
        }
        for (const perm of [PERM.PERM_EDIT_DOMAIN, PERM.PERM_READ_RECORD_CODE, PERM.PERM_REJUDGE,
            PERM.PERM_REJUDGE_PROBLEM, PERM.PERM_EDIT_CONTEST, PERM.PERM_EDIT_HOMEWORK]) {
            assert.equal(scope.canManageRecordList(account({ perm: PERM.PERM_DEFAULT | perm })), true);
        }
        assert.equal(scope.canManageRecordList(teacher()), true);
        assert.equal(scope.canManageRecordList(admin()), true);
    });

    it('does not inherit teacher capability from a role in some other domain', () => {
        const currentDomainStudent = account();
        currentDomainStudent.otherDomain = account({ perm: PERM.PERM_ALL });
        assert.equal(scope.canManageRecordList(currentDomainStudent), false);
    });

    it('opens all visible records for teachers and own records for students from navigation', () => {
        const nav = navigation.getNodes('Nav').find((node) => node.name === 'record_main');
        assert.deepEqual(Object.keys(nav.args.query({ user: teacher() })), []);
        assert.deepEqual(Object.keys(nav.args.query({ user: admin() })), []);
        assert.equal(nav.args.query({ user: account() }).uidOrName, 12);
    });
});

describe('HTTP record list ownership boundary', () => {
    it('defaults to only the student’s own current-domain formal submissions', async () => {
        const result = await http();
        assert.deepEqual(result.response.body.rdocs.map((row) => row.uid), [12]);
        assert.equal(result.response.body.filterUidOrName, '12');
        assert.equal(result.response.body.canManageRecords, false);
        assert.equal(result.response.body.recordListSelfOnly, true);
        assert.equal(result.response.body.recordListPageSize, 20);
        assert.equal(calls.find((call) => call[0] === 'records')[1], 'A');
    });

    it('ignores another UID, username, email or nonexistent account supplied by a student', async () => {
        for (const uidOrName of ['13', 'student-b', 'student-b@example.test', 'does-not-exist']) {
            calls = [];
            const result = await http(account(), { uidOrName });
            assert.deepEqual(result.response.body.rdocs.map((row) => row.uid), [12]);
            assert.equal(calls.some((call) => call[0].startsWith('userBy')), false);
        }
    });

    it('keeps teachers unfiltered by user unless they explicitly select one', async () => {
        const all = await http(teacher(), { query: { includePretest: '' } });
        assert.deepEqual(all.response.body.rdocs.map((row) => row.uid), [12, 13, 14]);
        assert.equal(all.response.body.canManageRecords, true);
        assert.equal(all.response.body.recordListSelfOnly, false);
        assert.equal(all.response.body.filterUidOrName, undefined);
        assert.equal(calls.find((call) => call[0] === 'records')[1], 'A');
        for (const uidOrName of ['13', 'student-b', 'student-b@example.test']) {
            const filtered = await http(teacher(), { uidOrName, query: { includePretest: '' } });
            assert.deepEqual(filtered.response.body.rdocs.map((row) => row.uid), [13]);
        }
    });

    it('preserves an invalid explicit teacher filter as an empty result, not all records', async () => {
        const result = await http(teacher(), { uidOrName: 'does-not-exist' });
        assert.equal(result.response.body.rdocs.length, 0);
    });

    it('preserves fullStatus as self-only for both teachers and students', async () => {
        for (const viewer of [account(), teacher()]) {
            const result = await http(viewer, { uidOrName: '13', full: true });
            assert.ok(result.response.body.rdocs.every((row) => row.uid === viewer._id));
            assert.equal(result.response.body.filterUidOrName, String(viewer._id));
            assert.equal(result.response.body.recordListPageSize, 10);
        }
    });

    it('retains student problem/language/status filters without changing ownership', async () => {
        fixtures.push({ ...fixtures[0], _id: new ObjectId(), pid: 2, lang: 'cpp', status: 0 });
        const result = await http(account(), { uidOrName: '13', pid: 2, lang: 'cpp', status: 0 });
        assert.equal(result.response.body.rdocs.length, 1);
        assert.equal(result.response.body.rdocs[0].uid, 12);
        assert.equal(result.response.body.rdocs[0].pid, 2);
    });

    it('preserves pretest visibility: students own only, privileged teachers all, generators excluded', async () => {
        const student = await http(account(), { includePretest: true, query: { includePretest: '1' } });
        assert.deepEqual(student.response.body.rdocs.map((row) => row.uid), [12, 12]);
        const teacherResult = await http(teacher());
        assert.deepEqual(teacherResult.response.body.rdocs.map((row) => row.uid), [12, 13, 14, 12, 13]);
        assert.ok(teacherResult.response.body.rdocs.every((row) => !same(row.contest, generateId)));
    });

    it('retains contest self-record policy and denies hidden own results', async () => {
        fixtures.push({ ...fixtures[0], _id: new ObjectId(), contest: contestId });
        allowOtherRecord = false;
        const result = await http(account(), { tid: contestId, uidOrName: '13' });
        assert.deepEqual(result.response.body.rdocs.map((row) => row.uid), [12]);
        assert.ok(calls.some((call) => call[0] === 'canShowSelfRecord'));
        assert.equal(calls.some((call) => call[0] === 'canShowRecord'), false);
        allowSelfRecord = false;
        await assert.rejects(http(account(), { tid: contestId }), PermissionError);
    });

    it('does not grant all-domain or hidden-contest query flags to students', async () => {
        await assert.rejects(http(account(), { allDomain: true }), PermissionError);
        await assert.rejects(http(account(), { all: true }), PermissionError);
    });

    it('keeps existing hidden-superadmin filtering and allows pre-authorized all-domain admin scope', async () => {
        hiddenUids = [14];
        const teacherResult = await http(teacher(), { query: { includePretest: '' } });
        assert.deepEqual(teacherResult.response.body.rdocs.map((row) => row.uid), [12, 13]);
        hiddenUids = [];
        const adminResult = await http(admin(), { allDomain: true, query: { includePretest: '' } });
        assert.ok(adminResult.response.body.rdocs.some((row) => row.domainId === 'B'));
    });
});

describe('record-conn ownership boundary', () => {
    it('binds all student subscriptions to self regardless of the requested username', async () => {
        for (const uidOrName of [undefined, '13', 'student-b', 'does-not-exist']) {
            calls = [];
            const connection = await socket(account(), { uidOrName });
            assert.equal(connection.uid, 12);
            assert.equal(connection.recordListSelfOnly, true);
            assert.equal(calls.some((call) => call[0].startsWith('userBy')), false);
            await connection.onRecordChange(fixtures[1]);
            await connection.onRecordChange(fixtures[3]);
            assert.equal(connection.deliveries.length, 0);
            await connection.onRecordChange(fixtures[0]);
            assert.equal(connection.deliveries.length, 1);
        }
    });

    it('checks student ownership before loading or rendering a broadcast record', async () => {
        const connection = await socket();
        calls = [];
        await connection.onRecordChange(fixtures[1]);
        assert.equal(calls.length, 0);
        assert.equal(connection.deliveries.length, 0);
    });

    it('constrains arbitrary requested record IDs to the student and current domain', async () => {
        const connection = await socket();
        const observed = [];
        connection.onRecordChange = (row) => { observed.push(row); };
        await connection.message({ rids: fixtures.map((row) => row._id.toHexString()) });
        const query = calls.find((call) => call[0] === 'records');
        assert.equal(query[1], 'A');
        assert.equal(query[2].uid, 12);
        assert.ok(observed.length > 0);
        assert.ok(observed.every((row) => row.uid === 12 && row.domainId === 'A'));
    });

    it('keeps teacher default all-users and an explicit UID filter respected', async () => {
        const connection = await socket(teacher());
        assert.equal(connection.uid, undefined);
        assert.equal(connection.recordListSelfOnly, false);
        await connection.onRecordChange(fixtures[0]);
        await connection.onRecordChange(fixtures[1]);
        await connection.onRecordChange(fixtures[2]);
        await connection.onRecordChange(fixtures[3]);
        assert.equal(connection.deliveries.length, 3);
        const filtered = await socket(teacher(), { uidOrName: '13' });
        await filtered.onRecordChange(fixtures[0]);
        await filtered.onRecordChange(fixtures[1]);
        assert.equal(filtered.deliveries.length, 1);
    });

    it('keeps scratchpad/pretest subscriptions self-only even for administrators', async () => {
        for (const viewer of [account(), teacher()]) {
            const connection = await socket(viewer, { uidOrName: '13', pretest: true });
            assert.equal(connection.uid, viewer._id);
            await connection.onRecordChange(fixtures[1]);
            assert.equal(connection.deliveries.length, 0);
        }
    });

    it('keeps pretests opt-in and excludes generated records on ordinary lists', async () => {
        const formal = await socket();
        await formal.onRecordChange(fixtures[4]);
        await formal.onRecordChange(fixtures[6]);
        assert.equal(formal.deliveries.length, 0);
        const include = await socket(account(), { includePretest: true });
        await include.onRecordChange(fixtures[4]);
        await include.onRecordChange(fixtures[5]);
        assert.equal(include.deliveries.length, 1);
    });

    it('preserves existing contest and homework visibility checks on real-time updates', async () => {
        const connection = await socket(account(), { tid: contestId });
        const ownContest = { ...fixtures[0], contest: contestId };
        const otherContest = { ...fixtures[1], contest: contestId };
        await connection.onRecordChange(ownContest);
        await connection.onRecordChange(otherContest);
        assert.equal(connection.deliveries.length, 1);
        allowSelfRecord = false;
        await connection.onRecordChange(ownContest);
        assert.equal(connection.deliveries.length, 1);
    });

    it('does not grant all-domain or hidden-contest subscription flags to students', async () => {
        await assert.rejects(socket(account(), { allDomain: true }), PermissionError);
        await assert.rejects(socket(account(), { all: true }), PermissionError);
    });
});
