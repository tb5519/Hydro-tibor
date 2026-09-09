const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { ObjectId } = require('mongodb');

const root = path.resolve(__dirname, '..');
const PERM = {
    PERM_VIEW_PROBLEM: 1n, PERM_VIEW_RECORD: 2n, PERM_VIEW_PROBLEM_HIDDEN: 4n,
    PERM_READ_RECORD_CODE: 8n, PERM_READ_RECORD_CODE_ACCEPT: 16n, PERM_EDIT_CONTEST: 32n,
    PERM_EDIT_HOMEWORK: 64n,
};
const PRIV = { PRIV_USER_PROFILE: 1, PRIV_READ_RECORD_CODE: 2 };
const STATUS = {
    STATUS_WAITING: 0, STATUS_ACCEPTED: 1, STATUS_WRONG_ANSWER: 2, STATUS_FETCHED: 3,
    STATUS_COMPILING: 4, STATUS_JUDGING: 5,
};
const RECORD_PRETEST = new ObjectId('000000000000000000000000');
const RECORD_GENERATE = new ObjectId('000000000000000000000001');
const tid = new ObjectId('6aa000000000000000000099');
const rid = (index) => new ObjectId(`6aa000000000000000${index.toString().padStart(6, '0')}`);
const plain = (value) => JSON.parse(JSON.stringify(value));
class PermissionError extends Error {}
class ProblemNotFoundError extends Error {}
class RecordNotFoundError extends Error {}
class ValidationError extends Error {}
const makeRecord = (index = 1, extra = {}) => ({
    _id: rid(index), domainId: 'class-a', pid: 1002, uid: 20, code: 'print("student")', lang: 'py.py3',
    status: STATUS.STATUS_ACCEPTED, score: 100, time: 10, memory: 1000, testCases: [], ...extra,
});

function compileLib(name, dependencies) {
    const mod = { exports: {} };
    const code = transformSync(fs.readFileSync(path.join(root, `packages/hydrooj/src/lib/${name}.ts`), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code;
    vm.runInNewContext(code, {
        module: mod, exports: mod.exports,
        require: (dependency) => dependencies[dependency] || require(dependency),
    });
    return mod.exports;
}

function harness(options = {}) {
    const reads = [];
    const docs = options.docs || [makeRecord()];
    const pdoc = {
        domainId: 'class-a', docId: 1002, pid: 'P1002',
        config: { type: options.objective ? 'objective' : 'default' },
        ...(options.reference ? { reference: { domainId: 'source-domain', pid: 500 } } : {}),
    };
    const permissions = new Set(options.permissions || [PERM.PERM_VIEW_PROBLEM, PERM.PERM_VIEW_RECORD, PERM.PERM_READ_RECORD_CODE]);
    const privileges = new Set(options.privileges || [PRIV.PRIV_USER_PROFILE]);
    const viewer = {
        _id: 10,
        hasPerm: (permission) => permissions.has(permission),
        hasPriv: (privilege) => privileges.has(privilege),
        own: () => !!options.ownsContest,
    };
    const canManage = (account) => options.manager !== false && [
        PERM.PERM_READ_RECORD_CODE, PERM.PERM_EDIT_CONTEST, PERM.PERM_EDIT_HOMEWORK,
    ].some((permission) => account.hasPerm(permission));
    const handler = {
        user: viewer,
        url: (name, { domainId, pid, rid: recordId, query = {} }) => (
            `/d/${domainId}/${name}/${pid || recordId}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`
        ),
    };
    const dependencies = {
        '../error': { PermissionError, ProblemNotFoundError, RecordNotFoundError, ValidationError },
        '../model/builtin': { PERM, PRIV, STATUS },
        '../model/setting': { langs: { 'py.py3': { display: 'Python 3' }, _: { display: '客观题' } } },
        '../model/problem': {
            canViewBy: () => options.problemVisible !== false,
            getStatus: async () => options.acceptedOwn ? { status: STATUS.STATUS_ACCEPTED } : null,
            get: async (domainId, pid, projection, raw) => {
                reads.push({ configRead: { domainId, pid, raw } });
                return { ...pdoc, config: options.config || { type: 'objective', answers: { 1: ['SECRET_KEY', 5] } },
                    reference: domainId === 'source-domain' ? undefined : pdoc.reference };
            },
        },
        '../model/record': {
            RECORD_PRETEST, RECORD_GENERATE,
            get: async (domainId, recordId) => docs.find((doc) => doc._id.equals(recordId)) || null,
            getMulti: (domainId, query) => {
                reads.push({ domainId, query });
                return { sort: () => ({
                    async *[Symbol.asyncIterator]() {
                        const results = docs.filter((doc) => (
                            doc.domainId === domainId && doc.pid === query.pid
                            && !query.contest.$nin.some((id) => id.equals(doc.contest))
                            && doc.input === undefined && doc.hackTarget === undefined && doc.files?.hack === undefined
                            && (query.status === undefined || doc.status === query.status)
                            && (!query._id || doc._id.toString() < query._id.$lt.toString())
                            && !(query.$and?.[0]?.uid?.$nin || []).includes(doc.uid)
                        )).sort((a, b) => b._id.toString().localeCompare(a._id.toString()));
                        yield* results;
                    },
                }) };
            },
        },
        '../model/contest': {
            get: async () => options.missingContest ? null : {
                domainId: options.contestDomain || 'class-a', docId: tid, pids: options.contestPids || [1002],
                allowViewCode: !!options.allowViewCode,
            },
            getStatus: async () => options.attend ? { attend: 1 } : null,
            canShowRecord: () => options.contestVisible !== false,
            canShowSelfRecord: () => !!options.selfVisible,
            applyProjection: (_, record) => options.projection ? options.projection(record) : record,
            isDone: () => !!options.contestDone,
        },
        '../model/user': { getById: async (_, uid) => ({ _id: uid, displayName: `学员 ${uid}`, uname: 'student' }) },
        './record_list_scope': { canManageRecordList: canManage },
        './record_visibility': {
            getHiddenSuperAdminUids: async () => options.hiddenUids || [],
            appendHiddenSuperAdminFilter: (query, ids) => ({ ...query, $and: [{ uid: { $nin: ids } }] }),
        },
    };
    dependencies['./objective_feedback'] = compileLib('objective_feedback', dependencies);
    dependencies['./objective_submission'] = compileLib('objective_submission', dependencies);
    return { ...compileLib('problem_record_replay', dependencies), handler, pdoc, reads };
}

describe('problem record picker permissions', () => {
    it('requires administrative capability, login, problem permission and record permission', async () => {
        for (const options of [
            { manager: false }, { privileges: [] },
            { permissions: [PERM.PERM_READ_RECORD_CODE, PERM.PERM_VIEW_RECORD] },
            { permissions: [PERM.PERM_READ_RECORD_CODE, PERM.PERM_VIEW_PROBLEM] },
        ]) {
            const h = harness(options);
            assert.equal(h.canUseProblemRecordPicker(h.handler.user), false);
            await assert.rejects(h.listProblemSubmissionRecords(h.handler, 'class-a', h.pdoc), PermissionError);
            await assert.rejects(h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1)), PermissionError);
        }
    });

    it('requires the current domain and a visible problem before querying submissions', async () => {
        const h = harness({ problemVisible: false });
        await assert.rejects(h.listProblemSubmissionRecords(h.handler, 'class-a', h.pdoc), PermissionError);
        await assert.rejects(h.loadProblemRecordReplay(h.handler, 'class-b', h.pdoc, rid(1)), ProblemNotFoundError);
        assert.equal(h.reads.length, 0);
    });

    it('hides protected administrator records and rejects guessed IDs', async () => {
        const h = harness({ hiddenUids: [20] });
        assert.deepEqual(plain(await h.listProblemSubmissionRecords(h.handler, 'class-a', h.pdoc)), { records: [], nextCursor: null });
        await assert.rejects(h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1)), RecordNotFoundError);
    });

    it('lists a visible result without source permission as disabled and forbids importing it', async () => {
        const h = harness({ permissions: [PERM.PERM_VIEW_PROBLEM, PERM.PERM_VIEW_RECORD, PERM.PERM_EDIT_HOMEWORK] });
        const result = await h.listProblemSubmissionRecords(h.handler, 'class-a', h.pdoc);
        assert.equal(result.records[0].status, STATUS.STATUS_ACCEPTED);
        assert.equal(result.records[0].canImport, false);
        assert.equal(result.records[0].importUrl, '');
        await assert.rejects(h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1)), RecordNotFoundError);
    });

    it('matches accepted-only source access and contest participant source access', async () => {
        const permissions = [PERM.PERM_VIEW_PROBLEM, PERM.PERM_VIEW_RECORD, PERM.PERM_EDIT_HOMEWORK, PERM.PERM_READ_RECORD_CODE_ACCEPT];
        for (const options of [
            { acceptedOwn: true }, { docs: [makeRecord(1, { uid: 10 })] },
            { docs: [makeRecord(1, { contest: tid })], ownsContest: true },
            { docs: [makeRecord(1, { contest: tid })], allowViewCode: true, contestDone: true, attend: true },
        ]) {
            const h = harness({ permissions, ...options });
            const replay = await h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1));
            assert.equal(replay.code, 'print("student")');
        }
        for (const options of [{}, { allowViewCode: true, contestDone: false, attend: true }, { allowViewCode: true, contestDone: true }]) {
            const h = harness({ permissions, docs: [makeRecord(1, { contest: tid })], ...options });
            await assert.rejects(h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1)), RecordNotFoundError);
        }
    });
});

describe('record replay scope and original result', () => {
    it('rejects cross-domain, cross-problem, pretest, generated, input and hack records', async () => {
        for (const extra of [
            { domainId: 'class-b' }, { pid: 1003 }, { contest: RECORD_PRETEST }, { contest: RECORD_GENERATE },
            { input: [] }, { input: null }, { hackTarget: rid(99) }, { hackTarget: null }, { files: { hack: 'stored-hack' } },
        ]) {
            const h = harness({ docs: [makeRecord(1, extra)] });
            assert.deepEqual(plain(await h.listProblemSubmissionRecords(h.handler, 'class-a', h.pdoc)), { records: [], nextCursor: null });
            await assert.rejects(h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1)), RecordNotFoundError);
        }
    });

    it('omits invisible, stale, mismatched and partially projected contest results', async () => {
        for (const options of [
            { contestVisible: false }, { missingContest: true }, { contestDomain: 'class-b' }, { contestPids: [1003] },
            { projection: (record) => ({ ...record, score: undefined }) },
            { projection: (record) => ({ ...record, status: undefined }) },
            { projection: (record) => ({ ...record, testCases: [] }) },
        ]) {
            const h = harness({ docs: [makeRecord(1, { contest: tid, testCases: [{ status: 1, score: 100 }] })], ...options });
            assert.deepEqual(plain(await h.listProblemSubmissionRecords(h.handler, 'class-a', h.pdoc)), { records: [], nextCursor: null });
            await assert.rejects(h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1)), RecordNotFoundError);
        }
    });

    it('permits the record owner self-result exception but not another student result', async () => {
        const h = harness({ docs: [makeRecord(1, { uid: 10, contest: tid })], contestVisible: false, selfVisible: true });
        assert.equal((await h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1))).uid, 10);
        const other = harness({ docs: [makeRecord(1, { contest: tid })], contestVisible: false, selfVisible: true });
        await assert.rejects(other.loadProblemRecordReplay(other.handler, 'class-a', other.pdoc, rid(1)), RecordNotFoundError);
    });

    it('returns only whitelisted original result metadata, keeping teacher identity separate', async () => {
        const h = harness({ docs: [makeRecord(1, {
            judgeTexts: ['SECRET_JUDGE'], compilerTexts: ['SECRET_COMPILER'], files: { log: 'SECRET_FILE' },
            testCases: [{ id: 1, subtaskId: 0, status: 1, score: 100, time: 10, memory: 10, message: 'SECRET_ANSWER' }],
        })] });
        const replay = await h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1));
        assert.equal(replay.uid, 20);
        assert.equal(h.handler.user._id, 10);
        assert.equal(replay.record.status, STATUS.STATUS_ACCEPTED);
        assert.equal(replay.code, 'print("student")');
        assert.equal(replay.langName, 'Python 3');
        assert.equal(replay.submittedAt, rid(1).getTimestamp().toISOString());
        assert.doesNotMatch(JSON.stringify(replay), /SECRET_/);
        const list = await h.listProblemSubmissionRecords(h.handler, 'class-a', h.pdoc);
        assert.equal(list.records[0].canImport, true);
        assert.match(list.records[0].importUrl, /fromRecord=6aa0/);
        assert.doesNotMatch(JSON.stringify(list), /SECRET_|print|testCases|compilerTexts|judgeTexts/);
    });

    it('disables file submissions instead of treating a missing inline answer as a draft', async () => {
        for (const extra of [{ files: { code: 'zip-submission' }, code: '' }, { code: undefined }]) {
            const h = harness({ docs: [makeRecord(1, extra)] });
            assert.equal((await h.listProblemSubmissionRecords(h.handler, 'class-a', h.pdoc)).records[0].canImport, false);
            await assert.rejects(h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1)), RecordNotFoundError);
        }
    });

    it('builds objective marks from the raw referenced configuration without exposing keys or messages', async () => {
        const h = harness({ objective: true, reference: true, docs: [makeRecord(1, {
            lang: '_', code: '1: A', score: 0, status: STATUS.STATUS_WRONG_ANSWER,
            testCases: [{ subtaskId: 1, id: 0, status: STATUS.STATUS_WRONG_ANSWER, score: 0, message: 'SECRET_KEY' }],
        })] });
        const replay = await h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1));
        assert.deepEqual(plain(replay.objective.answers), { 1: 'A' });
        assert.equal(replay.objective.feedback.state, 'complete');
        assert.equal(replay.objective.feedback.score, 0);
        assert.equal(replay.objective.feedback.totalScore, 5);
        assert.equal(replay.objective.feedback.questions[0].result, 'incorrect');
        assert.equal(h.reads.at(-1).configRead.domainId, 'source-domain');
        assert.equal(h.reads.at(-1).configRead.raw, true);
        assert.doesNotMatch(JSON.stringify(replay), /SECRET_KEY|message|scorePointAward/);
    });

    it('preserves pending status without manufacturing objective marks', async () => {
        const h = harness({ objective: true, docs: [makeRecord(1, { lang: '_', code: '1: A', status: STATUS.STATUS_JUDGING })] });
        const replay = await h.loadProblemRecordReplay(h.handler, 'class-a', h.pdoc, rid(1));
        assert.equal(replay.status, STATUS.STATUS_JUDGING);
        assert.equal(replay.objective.feedback.state, 'pending');
        assert.equal(replay.objective.feedback.questions, undefined);
    });

    it('forbids combining record import with contest or homework review context', () => {
        const h = harness();
        for (const args of [[rid(1), tid], [rid(1), undefined, 20], [rid(1), undefined, 0]]) {
            assert.throws(() => h.assertRecordReplayRequest(...args), ValidationError);
        }
        assert.doesNotThrow(() => h.assertRecordReplayRequest(rid(1)));
        assert.doesNotThrow(() => h.assertRecordReplayRequest(undefined, tid, 20));
    });
});

describe('problem record pagination', () => {
    it('pages 20 visible records in descending order without leaking hidden IDs or skipping entries', async () => {
        const docs = Array.from({ length: 23 }, (_, index) => makeRecord(index + 1));
        docs.push(makeRecord(50, { uid: 99 }));
        const h = harness({ docs, hiddenUids: [99] });
        const first = await h.listProblemSubmissionRecords(h.handler, 'class-a', h.pdoc);
        assert.equal(first.records.length, 20);
        assert.equal(first.records[0].rid, rid(23).toString());
        assert.equal(first.nextCursor, rid(4).toString());
        const second = await h.listProblemSubmissionRecords(h.handler, 'class-a', h.pdoc, false, new ObjectId(first.nextCursor));
        assert.deepEqual(plain(second.records.map((item) => item.rid)), [rid(3), rid(2), rid(1)].map(String));
        assert.equal(second.nextCursor, null);
    });

    it('filters accepted attempts while skipping invisible contest attempts before deciding the next cursor', async () => {
        const docs = Array.from({ length: 20 }, (_, index) => makeRecord(index + 1));
        docs.push(makeRecord(21, { status: STATUS.STATUS_WRONG_ANSWER }), makeRecord(22, { contest: tid }));
        const h = harness({ docs, contestVisible: false });
        const result = await h.listProblemSubmissionRecords(h.handler, 'class-a', h.pdoc, true);
        assert.equal(result.records.length, 20);
        assert.equal(result.records[0].rid, rid(20).toString());
        assert.equal(result.nextCursor, null);
        assert.equal(h.reads[0].query.status, STATUS.STATUS_ACCEPTED);
    });
});

describe('record replay handler integration', () => {
    it('guards context combinations, only loads imports on reads, and keeps original feedback separate from teacher history', () => {
        const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/problem.ts'), 'utf8');
        assert.match(source, /else assertRecordReplayRequest\(fromRecord, tid, reviewUid\)/);
        assert.match(source, /if \(isReadRequest && fromRecord\)\s*\{\s*this\.UiContext\.recordReplay = await loadProblemRecordReplay/);
        assert.match(source, /!this\.UiContext\.homeworkReview && !this\.UiContext\.recordReplay/);
        const recordSource = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/record.ts'), 'utf8');
        assert.match(recordSource, /@route\('pid', Types\.ProblemId\)/);
        assert.match(recordSource, /@query\('accepted', Types\.Boolean\)/);
        assert.match(recordSource, /@query\('cursor', Types\.ObjectId, true\)/);
        assert.match(recordSource, /ctx\.Route\('problem_submission_records', '\/p\/:pid\/submission-records', ProblemSubmissionRecordsHandler\)/);
    });
});
