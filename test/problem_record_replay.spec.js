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
                            && (query.uid === undefined || doc.uid === query.uid)
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
        './contest_access': { canViewContestLevel: () => true },
        './record_visibility': {
            getHiddenSuperAdminUids: async () => options.hiddenUids || [],
            appendHiddenSuperAdminFilter: (query, ids) => ({ ...query, $and: [{ uid: { $nin: ids } }] }),
        },
    };
    dependencies['./objective_feedback'] = compileLib('objective_feedback', dependencies);
    dependencies['./objective_submission'] = compileLib('objective_submission', dependencies);
    dependencies['./objective_merged_review'] = compileLib('objective_merged_review', dependencies);
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

describe('objective merged replay permissions and pagination', () => {
    const objectiveRecord = (index, extra = {}) => makeRecord(index, {
        lang: '_', code: '1: A', testCases: [{ subtaskId: 1, id: 0, status: 1, score: 5 }], ...extra,
    });

    it('does not provide merged mode for programming problems or ordinary students', async () => {
        const programming = harness();
        await assert.rejects(programming.listProblemMergedSubmissions(programming.handler, 'class-a', programming.pdoc), ValidationError);
        await assert.rejects(programming.loadProblemMergedReview(programming.handler, 'class-a', programming.pdoc, 20), ValidationError);
        const student = harness({ objective: true, manager: false });
        await assert.rejects(student.listProblemMergedSubmissions(student.handler, 'class-a', student.pdoc), PermissionError);
        await assert.rejects(student.loadProblemMergedReview(student.handler, 'class-a', student.pdoc, 20), PermissionError);
    });

    it('groups each learner once before pagination, counts all readable attempts and does not expose individual source', async () => {
        const docs = Array.from({ length: 23 }, (_, index) => [
            objectiveRecord(index + 1, { uid: 20 + index }), objectiveRecord(index + 30, { uid: 20 + index }),
        ]).flat();
        docs.push(objectiveRecord(99, { uid: 99 }));
        const h = harness({ objective: true, docs, hiddenUids: [99] });
        const first = await h.listProblemMergedSubmissions(h.handler, 'class-a', h.pdoc);
        assert.equal(first.mode, 'merged');
        assert.equal(first.records.length, 20);
        assert.equal(first.records[0].uid, 42);
        assert.equal(first.records[0].submissionCount, 2);
        assert.match(first.records[0].importUrl, /mergedUid=42$/);
        assert.doesNotMatch(JSON.stringify(first), /SECRET|testCases|code|fromRecord/);
        const second = await h.listProblemMergedSubmissions(h.handler, 'class-a', h.pdoc, new ObjectId(first.nextCursor));
        assert.deepEqual(plain(second.records.map((item) => item.uid)), [22, 21, 20]);
        assert.equal(second.nextCursor, null);
        assert.equal(new Set([...first.records, ...second.records].map((item) => item.uid)).size, 23);
    });

    it('excludes unimportable, hidden, cross-domain and nonformal records from both counts and answer history', async () => {
        const docs = [objectiveRecord(1),
            objectiveRecord(2, { contest: RECORD_PRETEST }), objectiveRecord(3, { contest: RECORD_GENERATE }),
            objectiveRecord(4, { input: null }), objectiveRecord(5, { files: { hack: 'hack' } }),
            objectiveRecord(6, { files: { code: 'stored-code' } }), objectiveRecord(7, { domainId: 'class-b' }),
            objectiveRecord(8, { pid: 999 }), objectiveRecord(9, { code: undefined }),
            objectiveRecord(10, { uid: 99 }), objectiveRecord(11, { hackTarget: null }),
        ];
        const h = harness({ objective: true, docs, hiddenUids: [99] });
        const list = await h.listProblemMergedSubmissions(h.handler, 'class-a', h.pdoc);
        assert.equal(list.records.length, 1);
        assert.equal(list.records[0].submissionCount, 1);
        assert.equal((await h.loadProblemMergedReview(h.handler, 'class-a', h.pdoc, 20)).submissionCount, 1);
        await assert.rejects(h.loadProblemMergedReview(h.handler, 'class-a', h.pdoc, 99), RecordNotFoundError);
        await assert.rejects(h.loadProblemMergedReview(h.handler, 'class-b', h.pdoc, 20), ProblemNotFoundError);
        const forbiddenSource = harness({ objective: true, docs, permissions: [PERM.PERM_VIEW_PROBLEM, PERM.PERM_VIEW_RECORD, PERM.PERM_EDIT_HOMEWORK] });
        assert.equal((await forbiddenSource.listProblemMergedSubmissions(forbiddenSource.handler, 'class-a', forbiddenSource.pdoc)).records.length, 0);
        await assert.rejects(forbiddenSource.loadProblemMergedReview(forbiddenSource.handler, 'class-a', forbiddenSource.pdoc, 20), RecordNotFoundError);
    });

    it('applies contest visibility and projections before aggregating, including sealed result fields', async () => {
        for (const options of [
            { contestVisible: false }, { missingContest: true }, { contestDomain: 'class-b' }, { contestPids: [999] },
            { projection: (doc) => ({ ...doc, score: undefined }) }, { projection: (doc) => ({ ...doc, testCases: [] }) },
        ]) {
            const h = harness({ objective: true, docs: [objectiveRecord(1, { contest: tid })], ...options });
            assert.equal((await h.listProblemMergedSubmissions(h.handler, 'class-a', h.pdoc)).records.length, 0);
            await assert.rejects(h.loadProblemMergedReview(h.handler, 'class-a', h.pdoc, 20), RecordNotFoundError);
        }
        const projectedFields = harness({ objective: true, docs: [objectiveRecord(1, { contest: tid })],
            projection: (doc) => ({ ...doc, testCases: doc.testCases.map((item) => ({ ...item, status: undefined })) }) });
        const review = await projectedFields.loadProblemMergedReview(projectedFields.handler, 'class-a', projectedFields.pdoc, 20);
        assert.equal(review.questions[0].result, 'error');
    });

    it('reads the referenced grading config and restores permitted source after projection without exposing standard answers', async () => {
        const h = harness({ objective: true, reference: true, docs: [objectiveRecord(1, { contest: tid })],
            projection: (doc) => ({ ...doc, code: undefined }) });
        const review = await h.loadProblemMergedReview(h.handler, 'class-a', h.pdoc, 20);
        assert.equal(review.questions[0].result, 'first_correct');
        assert.equal(review.questions[0].attempts[0].answer, 'A');
        assert.doesNotMatch(JSON.stringify(review), /SECRET_KEY/);
        assert.ok(h.reads.some((item) => item.configRead?.domainId === 'source-domain' && item.configRead.raw));
    });

    it('forbids combining merged replay with another replay, contest or homework context and rejects invalid learner IDs', () => {
        const h = harness();
        for (const args of [
            [rid(1), undefined, undefined, 20], [undefined, tid, undefined, 20], [undefined, undefined, 20, 20],
            ...[0, 1, -2, 1.5, NaN].map((uid) => [undefined, undefined, undefined, uid]),
        ]) assert.throws(() => h.assertRecordReplayRequest(...args), ValidationError);
        assert.doesNotThrow(() => h.assertRecordReplayRequest(undefined, undefined, undefined, 20));
    });

    it('dispatches real record-picker handler requests by mode and preserves the existing accepted-only path', async () => {
        const h = harness({ objective: true, docs: [objectiveRecord(1), objectiveRecord(2)] });
        const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/record.ts'), 'utf8');
        const section = source.slice(source.indexOf('export class ProblemSubmissionRecordsHandler'), source.indexOf('export class ObjectiveSubmitFeedbackHandler'));
        const module = { exports: {} };
        vm.runInNewContext(transformSync(section, {
            loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
        }).code, {
            module, exports: module.exports, ...h,
            Handler: class { user = h.handler.user; url = h.handler.url; response = {}; },
            route: () => () => {}, query: () => () => {}, Types: {},
            problem: { get: async () => h.pdoc }, ProblemNotFoundError, ValidationError,
        });
        const handler = new module.exports.ProblemSubmissionRecordsHandler();
        await handler.get('class-a', 1002, false, undefined, 'merged');
        assert.equal(handler.response.body.records.length, 1);
        assert.equal(handler.response.body.records[0].submissionCount, 2);
        await handler.get('class-a', 1002, true);
        assert.equal(handler.response.body.records.length, 2);
        await assert.rejects(handler.get('class-a', 1002, true, undefined, 'merged'), ValidationError);
        await assert.rejects(handler.get('class-a', 1002, false, undefined, 'unknown'), ValidationError);
    });
});

describe('record replay handler integration', () => {
    it('guards context combinations, only loads imports on reads, and keeps original feedback separate from teacher history', () => {
        const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/problem.ts'), 'utf8');
        assert.match(source, /else assertRecordReplayRequest\(fromRecord, tid, reviewUid, mergedUid\)/);
        assert.match(source, /if \(isReadRequest && fromRecord\)\s*\{\s*this\.UiContext\.recordReplay = await loadProblemRecordReplay/);
        assert.match(source, /!this\.UiContext\.homeworkReview && !this\.UiContext\.recordReplay/);
        const recordSource = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/record.ts'), 'utf8');
        assert.match(recordSource, /@route\('pid', Types\.ProblemId\)/);
        assert.match(recordSource, /@query\('accepted', Types\.Boolean\)/);
        assert.match(recordSource, /@query\('cursor', Types\.ObjectId, true\)/);
        assert.match(recordSource, /ctx\.Route\('problem_submission_records', '\/p\/:pid\/submission-records', ProblemSubmissionRecordsHandler\)/);
    });
});
