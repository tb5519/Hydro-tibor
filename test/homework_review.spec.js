const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { ObjectId } = require('mongodb');

const root = path.resolve(__dirname, '..');
const PERM = { PERM_EDIT_HOMEWORK: 1n, PERM_EDIT_HOMEWORK_SELF: 2n, PERM_EDIT_DOMAIN: 4n, PERM_SUBMIT_PROBLEM: 8n };
const PRIV = { PRIV_USER_PROFILE: 1, PRIV_EDIT_SYSTEM: 2, PRIV_MANAGE_ALL_DOMAIN: 4, PRIV_JUDGE: 8 };
const STATUS = { STATUS_ACCEPTED: 1, STATUS_WRONG_ANSWER: 2, STATUS_WAITING: 0, STATUS_JUDGING: 20, STATUS_COMPILING: 21, STATUS_FETCHED: 22 };
const tid = new ObjectId('6aa000000000000000000001');
const bestRid = new ObjectId('6aa000000000000000000011');
const newestRid = new ObjectId('6aa000000000000000000012');
const homework = { domainId: 'class-a', rule: 'homework', docId: tid, owner: 10, pids: [1002], assignedUsers: [20] };
const teacher = {
    _id: 10,
    hasPerm: (perm) => perm === PERM.PERM_EDIT_HOMEWORK,
    own: () => false,
};
class PermissionError extends Error {}
class ValidationError extends Error {}
class UserNotFoundError extends Error {}
const makeRecord = (extra = {}) => ({
    _id: bestRid, domainId: 'class-a', uid: 20, pid: 1002, contest: tid,
    lang: 'python3', code: 'print("student")', status: 1, score: 100, time: 10, memory: 1000,
    testCases: [], ...extra,
});
const plain = (value) => JSON.parse(JSON.stringify(value));
function compileLib(name, dependencies) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, `packages/hydrooj/src/lib/${name}.ts`), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, { module, exports: module.exports, require: (dependency) => dependencies[dependency] || require(dependency) });
    return module.exports;
}
const objectiveDependencies = {
    '../error': {}, '../model/builtin': { STATUS }, '../model/contest': {}, '../model/problem': {}, '../model/record': {}, './contest_access': {},
};
for (const name of ['objective_feedback', 'objective_submission', 'objective_merged_review']) {
    objectiveDependencies[`./${name}`] = compileLib(name, objectiveDependencies);
}

function harness(options = {}) {
    const reads = [];
    const docs = options.docs || [];
    const target = { _id: 20, displayName: '学员', hasPerm: () => !!options.targetTeacher };
    const dependencies = {
        '../error': { PermissionError, ValidationError, UserNotFoundError },
        '../model/builtin': { PERM, PRIV },
        '../model/record': {
            get: async (domainId, rid) => docs.find((doc) => doc.domainId === domainId && doc._id.equals(rid)) || null,
            getMulti: (domainId, query) => {
                reads.push({ domainId, query });
                const results = docs.filter((doc) => doc.domainId === domainId && doc.uid === query.uid && doc.pid === query.pid
                    && query.contest.$in.some((id) => id === null ? !doc.contest : id.equals(doc.contest))
                    && doc.hackTarget === undefined && doc.input === undefined && doc.files?.hack === undefined)
                    .sort((a, b) => b._id.toString().localeCompare(a._id.toString()));
                return { sort: () => ({
                    limit: () => ({ toArray: async () => results.slice(0, 1) }),
                    async *[Symbol.asyncIterator]() { yield* results; },
                }) };
            },
        },
        '../model/user': {
            coll: { findOne: async () => options.missingAccount ? null : { _id: 20, priv: options.priv ?? PRIV.PRIV_USER_PROFILE } },
            getById: async () => target,
        },
        '../model/domain': { collUser: { findOne: async (query) => {
            reads.push({ membership: query });
            return options.outsideWorkspace ? null : { uid: 20, domainId: 'class-a' };
        } } },
        '../model/workspace': {
            LEGACY_WORKSPACE_ID: 'legacy', isPlatformAdmin: () => !!options.platformAdmin,
            resolveDomainWorkspaceId: () => options.legacy ? 'legacy' : 'workspace-a',
            getDomains: async () => [{ _id: 'class-a' }, { _id: 'class-b' }],
            getMembers: async () => options.member ? [{ uid: 20 }] : [],
            getExcludedLegacyUids: async () => new Set(options.excludedLegacy ? [20] : []),
            isAssignedToOtherWorkspace: async () => !!options.otherWorkspace,
        },
        './record_visibility': { canViewRecordOwner: async () => options.ownerVisible !== false },
    };
    const mod = { exports: {} };
    const code = transformSync(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/homework_review.ts'), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code;
    vm.runInNewContext(code, {
        module: mod, exports: mod.exports,
        require: (name) => dependencies[name] || require(name),
    });
    return { ...mod.exports, reads, target };
}

describe('homework review authorization', () => {
    it('allows homework managers and self-editing owners, but denies students and view-only teachers', () => {
        const h = harness();
        assert.equal(h.canManageHomeworkReview(teacher, homework), true);
        const owner = { hasPerm: () => false, own: (_, permission) => permission === PERM.PERM_EDIT_HOMEWORK_SELF };
        assert.equal(h.canManageHomeworkReview(owner, homework), true);
        for (const viewer of [
            { hasPerm: () => false, own: () => false },
            { hasPerm: () => false, own: (_, permission) => !permission },
        ]) assert.throws(() => h.assertHomeworkReviewScope(viewer, homework, 1002, 20), PermissionError);
    });

    it('requires homework, assigned student and a problem from that homework', () => {
        const h = harness();
        for (const [doc, pid, uid] of [
            [{ ...homework, rule: 'ioi' }, 1002, 20],
            [homework, 1003, 20], [homework, 1002, 21], [null, 1002, 20],
        ]) assert.throws(() => h.assertHomeworkReviewScope(teacher, doc, pid, uid), PermissionError);
        for (const uid of [0, 1, -1, 2.5, Number.NaN]) {
            assert.throws(() => h.assertHomeworkReviewScope(teacher, homework, 1002, uid), ValidationError);
        }
    });

    it('checks active membership within this workspace before returning student information', async () => {
        const h = harness();
        assert.equal(await h.authorizeHomeworkReview(teacher, { _id: 'class-a' }, homework, 1002, 20), h.target);
        assert.deepEqual(plain(h.reads[0].membership), { uid: 20, join: true, domainId: { $in: ['class-a', 'class-b'] } });
    });

    it('rejects other workspace students, staff, disabled profiles and hidden record owners', async () => {
        await Promise.all([
            { outsideWorkspace: true }, { otherWorkspace: true }, { member: true }, { targetTeacher: true },
            { priv: 0 }, { priv: PRIV.PRIV_USER_PROFILE | PRIV.PRIV_EDIT_SYSTEM }, { missingAccount: true },
            { platformAdmin: true }, { ownerVisible: false }, { legacy: true, excludedLegacy: true },
        ].map(async (options) => {
            const h = harness(options);
            await assert.rejects(h.authorizeHomeworkReview(teacher, { _id: 'class-a' }, homework, 1002, 20), UserNotFoundError);
        }));
    });

    it('blocks mutations carrying reviewUid in either query or body, including empty or zero values', () => {
        const h = harness();
        for (const request of [
            { query: { reviewUid: '20' } }, { body: { reviewUid: 20 } },
            { query: { reviewUid: '' } }, { body: { reviewUid: 0 } },
            { query: { mergedUid: '20' } }, { body: { mergedUid: 20 } },
            { query: { mergedUid: '' } }, { body: { mergedUid: 0 } },
        ]) assert.throws(() => h.rejectHomeworkReviewMutation(request), PermissionError);
        assert.doesNotThrow(() => h.rejectHomeworkReviewMutation({ query: {}, body: { code: 'print(1)' } }));
    });
});

describe('homework review submission selection', () => {
    it('prefers the same best record displayed by homework progress over a newer lower score', async () => {
        const best = makeRecord();
        const h = harness({ docs: [best, makeRecord({ _id: newestRid, score: 0 })] });
        assert.equal(await h.loadHomeworkReviewRecord('class-a', 1002, 20, homework, { detail: { 1002: { rid: bestRid } } }), best);
        assert.equal(h.reads.length, 0);
    });

    it('accepts a normal problem submission used in the homework completion list', async () => {
        const best = makeRecord({ contest: undefined });
        const h = harness({ docs: [best] });
        assert.equal(await h.loadHomeworkReviewRecord('class-a', 1002, 20, homework, { detail: { 1002: { rid: bestRid.toString() } } }), best);
    });

    it('falls back to latest scoped formal submission when the best record is stale or belongs to another student', async () => {
        const newest = makeRecord({ _id: newestRid, score: 75, contest: undefined });
        const h = harness({ docs: [makeRecord({ uid: 10 }), newest] });
        assert.equal(await h.loadHomeworkReviewRecord('class-a', 1002, 20, homework, { detail: { 1002: { rid: bestRid } } }), newest);
        assert.deepEqual(plain(h.reads[0]), {
            domainId: 'class-a', query: { uid: 20, pid: 1002, contest: { $in: [null, tid.toString()] },
                hackTarget: { $exists: false }, input: { $exists: false }, 'files.hack': { $exists: false } },
        });
    });

    it('never falls back to an administrator draft, another contest, pretest, generated or hack record', async () => {
        const h = harness({ docs: [
            makeRecord({ uid: 10 }), makeRecord({ contest: new ObjectId('6aa000000000000000000099') }),
            makeRecord({ contest: new ObjectId('000000000000000000000000') }),
            makeRecord({ contest: new ObjectId('000000000000000000000001') }),
            makeRecord({ input: ['test'] }), makeRecord({ hackTarget: newestRid }),
            makeRecord({ hackTarget: null }), makeRecord({ files: { hack: 'file-hack' } }),
            makeRecord({ domainId: 'class-b' }), makeRecord({ pid: 1003 }),
        ] });
        assert.equal(await h.loadHomeworkReviewRecord('class-a', 1002, 20, homework, { detail: { 1002: { rid: bestRid } } }), null);
    });

    it('loads every homework and ordinary practice answer while excluding other contests, targets and nonformal sources', async () => {
        const own = makeRecord();
        const practice = makeRecord({ _id: newestRid, contest: undefined });
        const h = harness({ docs: [own, practice,
            makeRecord({ uid: 21 }), makeRecord({ pid: 999 }), makeRecord({ domainId: 'class-b' }),
            makeRecord({ contest: new ObjectId() }), makeRecord({ files: { code: 'stored-source' } }),
            makeRecord({ input: null }), makeRecord({ files: { hack: 'stored-hack' } }),
        ] });
        const results = await h.loadHomeworkReviewRecords('class-a', 1002, 20, homework);
        assert.deepEqual(new Set(results), new Set([own, practice]));
        assert.equal(h.reads[0].query.contest.$in.length, 2);
        await assert.rejects(h.loadHomeworkReviewRecords('class-b', 1002, 20, homework), PermissionError);
        await assert.rejects(h.loadHomeworkReviewRecords('class-a', 1002, 20, { ...homework, rule: 'ioi' }), PermissionError);
    });

    it('returns only safe record fields without judge messages, test data, files or code', () => {
        const h = harness();
        const result = h.publicHomeworkReviewRecord(makeRecord({
            compilerTexts: ['secret-compiler'], judgeTexts: ['secret-judge'], files: { code: 'secret-file' },
            testCases: [{ id: 1, subtaskId: 0, status: 1, score: 100, time: 10, memory: 1000, message: 'secret-answer' }],
        }));
        assert.equal(result.uid, 20);
        assert.equal(result.testCases[0].score, 100);
        const serialized = JSON.stringify(result);
        assert.ok(!serialized.includes('secret'));
        assert.ok(!serialized.includes('code'));
        assert.equal(h.publicHomeworkReviewRecord(null), null);
    });
});

function problemHandler(options = {}) {
    const helpers = harness(options);
    const ownLoads = [];
    const mergedLoads = [];
    const statusUids = [];
    class ContestNotLiveError extends Error {}
    const pdoc = {
        domainId: 'class-a', docId: 1002, pid: options.pid === undefined ? 'P1002' : options.pid,
        owner: 10, title: '题目', content: '', tag: [],
        config: { type: options.objective ? 'objective' : 'default', langs: ['python3'] }, additional_file: [],
    };
    class BaseHandler {
        user = options.viewer || teacher;
        domain = { _id: 'class-a' };
        args = { domainId: 'class-a' };
        tdoc = options.standalone ? null : homework;
        tsdoc = {};
        UiContext = {};
        request = { method: 'GET', query: { reviewUid: 20 }, json: false };
        response = { body: {} };
        ctx = { parallel: async () => {} };
        url(name, args) {
            if (name === 'problem_submission_records') return `/d/${args.domainId}/p/${args.pid}/submission-records`;
            if (name === 'problem_detail') {
                assert.equal(args.query, undefined);
                assert.equal(args.tid, undefined);
                assert.equal(args.reviewUid, undefined);
                return `/d/${args.domainId}/p/${args.pid}`;
            }
            return `/homework/${args.tid}?uid=${args.query.uid}`;
        }
    }
    const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/problem.ts'), 'utf8');
    const section = source.slice(source.indexOf('export class ProblemDetailHandler'), source.indexOf('export class ProblemSubmitHandler'));
    const code = transformSync(section, {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    const mod = { exports: {} };
    vm.runInNewContext(code, {
        module: mod, exports: mod.exports, ...require('lodash'), ...helpers,
        PERM, PRIV, STATUS, Time: { minute: 60000 },
        route: () => () => {}, query: () => () => {}, param: () => () => {},
        Types: new Proxy({}, { get: () => () => {} }),
        ContestDetailBaseHandler: BaseHandler, ContestNotLiveError,
        ContestNotAttendedError: class extends Error {}, ContestNotFoundError: class extends Error {},
        ProblemNotFoundError: class extends Error {}, PermissionError,
        contest: {
            isNotStarted: () => true, isDone: () => false, canShowSelfRecord: () => true,
            getStatus: async () => ({ detail: { 1002: { rid: bestRid } } }),
            getRelated: async () => [],
        },
        problem: {
            get: async () => pdoc, canViewBy: () => options.normalVisible !== false,
            getStatus: async (_domain, _pid, uid) => { statusUids.push(uid); return null; },
        },
        user: { getById: async () => ({ _id: 10 }) },
        solution: { count: async () => 0 }, discussion: { count: async () => 0 },
        setting: { langs: { python3: {} } },
        pickPreferredCodeLang: () => 'python3', getCppEditorMode: () => 'proficient',
        getActiveBadgeAcTheme: async () => null,
        assertRecordReplayRequest: (fromRecord) => { assert.equal(fromRecord, undefined); },
        canUseProblemRecordPicker: () => true,
        canManageRecordList: (viewer) => viewer.hasPerm(PERM.PERM_EDIT_HOMEWORK),
        mistake: { getPracticeState: () => null },
        loadOwnObjectiveSubmission: async (...args) => { ownLoads.push(args); return null; },
        buildObjectiveMergedReview: objectiveDependencies['./objective_merged_review'].buildObjectiveMergedReview,
        loadObjectiveSubmissionConfig: async () => ({ config: { type: 'objective', answers: { 1: ['SECRET_A', 10] } } }),
        loadProblemMergedReview: async (handler, domainId, problemDoc, uid) => {
            mergedLoads.push({ domainId, pid: problemDoc.docId, uid });
            return { uid, name: '学员', submissionCount: 0, questions: [], summary: {} };
        },
    });
    return { handler: new mod.exports.ProblemDetailHandler(), statusUids, ownLoads, mergedLoads, ContestNotLiveError };
}

describe('problem page homework review integration', () => {
    it('opens a read-only student review without requiring teacher attendance and never loads teacher code', async () => {
        const h = problemHandler({ docs: [makeRecord()] });
        await h.handler._prepare('class-a', 1002, tid, 20);
        await h.handler.get('class-a', tid, false);
        assert.equal(h.handler.response.body.mode, 'review');
        assert.equal(h.handler.UiContext.homeworkReview.uid, 20);
        assert.equal(h.handler.UiContext.homeworkReview.code, 'print("student")');
        assert.equal(h.handler.UiContext.homeworkReview.rid, bestRid.toString());
        assert.equal(h.handler.UiContext.homeworkReview.returnUrl, `/homework/${tid}?uid=20`);
        assert.equal(h.handler.UiContext.homeworkReview.ownAnswerUrl, '/d/class-a/p/P1002');
        assert.deepEqual(h.statusUids, [20]);
        assert.equal(h.ownLoads.length, 0);
    });

    it('provides an explicit empty review when the student has no submissions', async () => {
        const h = problemHandler();
        await h.handler._prepare('class-a', 1002, tid, 20);
        assert.equal(h.handler.UiContext.homeworkReview.uid, 20);
        assert.equal(h.handler.UiContext.homeworkReview.code, '');
        assert.equal(h.handler.UiContext.homeworkReview.rid, '');
        assert.equal(h.handler.UiContext.homeworkReview.record, null);
    });

    it('uses the numeric problem id for the own-answer route when no public problem id exists', async () => {
        const h = problemHandler({ pid: '' });
        await h.handler._prepare('class-a', 1002, tid, 20);
        assert.equal(h.handler.UiContext.homeworkReview.ownAnswerUrl, '/d/class-a/p/1002');
    });

    it('keeps hidden problems review-only when the teacher cannot access the normal problem page', async () => {
        const h = problemHandler({ normalVisible: false, docs: [makeRecord()] });
        await h.handler._prepare('class-a', 1002, tid, 20);
        assert.equal(h.handler.UiContext.homeworkReview.code, 'print("student")');
        assert.equal(h.handler.UiContext.homeworkReview.ownAnswerUrl, '');
        await assert.rejects(h.handler._prepare('class-a', 1002), PermissionError);
    });

    it('does not let ordinary students bypass contest entry by adding reviewUid', async () => {
        const h = problemHandler({ viewer: { _id: 30, own: () => false, hasPerm: () => false } });
        await assert.rejects(h.handler._prepare('class-a', 1002, tid, 20), PermissionError);
        await assert.rejects(h.handler._prepare('class-a', 1002, tid), h.ContestNotLiveError);
    });

    it('defaults objective homework review to all student attempts without importing any teacher draft or standard answer', async () => {
        const h = problemHandler({ objective: true, docs: [
            makeRecord({ code: '1: B', status: 2, score: 0, testCases: [{ subtaskId: 1, id: 0, status: 2, score: 0 }] }),
            makeRecord({ _id: newestRid, contest: undefined, code: '1: A', testCases: [{ subtaskId: 1, id: 0, status: 1, score: 10 }] }),
            makeRecord({ uid: 10, code: 'TEACHER_DRAFT' }),
        ] });
        await h.handler._prepare('class-a', 1002, tid, 20);
        await h.handler.get('class-a', tid, false);
        const merged = h.handler.UiContext.objectiveMergedReview;
        assert.equal(merged.uid, 20);
        assert.equal(merged.submissionCount, 2);
        assert.equal(merged.questions[0].result, 'correct_after_retry');
        assert.deepEqual(plain(merged.questions[0].attempts.map((attempt) => attempt.answer)), ['B', 'A']);
        assert.equal(h.handler.response.body.mode, 'review');
        assert.equal(h.handler.UiContext.homeworkReview.code, '');
        assert.equal(h.handler.UiContext.objectiveInitialSubmission, undefined);
        assert.equal(h.ownLoads.length, 0);
        assert.doesNotMatch(JSON.stringify(h.handler.UiContext), /TEACHER_DRAFT|SECRET_A/);
    });

    it('returns an unanswered objective sheet for an assigned learner without any submissions', async () => {
        const h = problemHandler({ objective: true });
        await h.handler._prepare('class-a', 1002, tid, 20);
        assert.equal(h.handler.UiContext.objectiveMergedReview.submissionCount, 0);
        assert.equal(h.handler.UiContext.objectiveMergedReview.questions[0].result, 'unanswered');
    });

    it('opens a problem-bank merged learner review as read-only and never loads the teacher’s objective draft', async () => {
        const h = problemHandler({ objective: true, standalone: true });
        await h.handler._prepare('class-a', 1002, undefined, undefined, undefined, 20);
        await h.handler.get('class-a', undefined, false);
        assert.equal(h.handler.response.body.mode, 'review');
        assert.equal(h.handler.UiContext.objectiveMergedReview.uid, 20);
        assert.equal(h.handler.UiContext.problemRecordPicker.allowMerged, true);
        assert.equal(h.handler.UiContext.recordReplay, undefined);
        assert.equal(h.ownLoads.length, 0);
        assert.deepEqual(h.mergedLoads, [{ domainId: 'class-a', pid: 1002, uid: 20 }]);
    });

    it('rejects a mergedUid write at the problem handler boundary before reading or changing any submission', async () => {
        const h = problemHandler({ objective: true, standalone: true });
        h.handler.request.method = 'POST';
        h.handler.request.query = { mergedUid: 20 };
        await assert.rejects(h.handler._prepare('class-a', 1002, undefined, undefined, undefined, 20), PermissionError);
        assert.equal(h.statusUids.length, 0);
        assert.equal(h.mergedLoads.length, 0);
    });
});
