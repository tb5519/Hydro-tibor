const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { ObjectId } = require('mongodb');

const root = path.resolve(__dirname, '..');
const STATUS = {
    STATUS_WAITING: 0, STATUS_ACCEPTED: 1, STATUS_WRONG_ANSWER: 2, STATUS_SYSTEM_ERROR: 8,
    STATUS_FETCHED: 22, STATUS_COMPILING: 21, STATUS_JUDGING: 20,
};
function loadModule(source, dependencies) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(source, {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, {
        module, exports: module.exports,
        require(name) { return dependencies[name] || require(name); },
    });
    return module.exports;
}
const helpers = loadModule(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/objective_feedback.ts'), 'utf8'), {
    '../model/builtin': { STATUS },
});
const { buildObjectiveFeedback, parseObjectiveConfig } = helpers;
const rid = new ObjectId();
const config = {
    type: 'objective',
    answers: { 1: ['secret-answer-a', 10], '2-1': [['secret-b', 'secret-c'], 20], '2-2': ['secret-d', 30] },
};
function makeRecord(extra = {}) {
    return {
        _id: rid, domainId: 'class-a', uid: 12, pid: 5983,
        status: STATUS.STATUS_WRONG_ANSWER, score: 20,
        code: '1: secret-answer-a\n2-1: [secret-b]\n2-2: ""',
        testCases: [
            { subtaskId: 1, id: 0, status: 1, score: 10 },
            { subtaskId: 2, id: 1, status: 2, score: 10, message: 'Partially Correct' },
            { subtaskId: 2, id: 2, status: 2, score: 0, message: 'No answer' },
        ],
        ...extra,
    };
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

describe('objective feedback grading', () => {
    it('returns earned and maximum marks with correct, partial, and unanswered states', () => {
        const result = plain(buildObjectiveFeedback(makeRecord(), config));
        assert.deepEqual(result, {
            rid: rid.toString(), state: 'complete', score: 20, totalScore: 60,
            questions: [
                { id: '1', answered: true, result: 'correct', score: 10, maxScore: 10 },
                { id: '2-1', answered: true, result: 'incorrect', score: 10, maxScore: 20 },
                { id: '2-2', answered: false, result: 'unanswered', score: 0, maxScore: 30 },
            ],
        });
        const serialized = JSON.stringify(result);
        for (const forbidden of ['secret', 'Partially Correct', 'No answer', 'code', 'answers', 'testCases']) {
            assert.ok(!serialized.includes(forbidden));
        }
    });
    it('uses the maximum configured answer weight and preserves non-100 and decimal totals', () => {
        const weighted = { type: 'objective', answers: { 1: { a: 7.5, b: 10.25, c: 0 }, '2-1': ['a', 100.5], '2-2': ['a', 10] } };
        assert.equal(buildObjectiveFeedback(makeRecord(), weighted).totalScore, 120.75);
    });
    it('keeps absent answers, whitespace, and empty multi-selections neutral', () => {
        const result = buildObjectiveFeedback(makeRecord({ code: '1: " "\n2-1: []' }), config);
        assert.ok(result.questions.every((question) => !question.answered && question.result === 'unanswered'));
    });
    it('does not expose partial grades while queued or judging', () => {
        for (const status of [0, 20, 21, 22]) {
            assert.deepEqual(plain(buildObjectiveFeedback(makeRecord({ status }), config)), { rid: rid.toString(), state: 'pending' });
        }
    });
    it('does not invent incorrect answers for missing testcase data or failed judge runs', () => {
        for (const extra of [{ testCases: [] }, { testCases: makeRecord().testCases.slice(1) }, { status: 8 }, { score: undefined }]) {
            assert.deepEqual(plain(buildObjectiveFeedback(makeRecord(extra), config)), { rid: rid.toString(), state: 'error' });
        }
    });
    it('rejects malformed submission/config YAML without leaking contents', () => {
        assert.equal(parseObjectiveConfig('type: [\nanswers: secret'), null);
        assert.equal(parseObjectiveConfig('type: default'), null);
        assert.equal(parseObjectiveConfig('null'), null);
        assert.equal(parseObjectiveConfig('type: objective\nanswers:\n  1: [a, 10]').type, 'objective');
        assert.equal(buildObjectiveFeedback(makeRecord({ code: '1: [' }), config).state, 'error');
        assert.equal(buildObjectiveFeedback(makeRecord(), { answers: {} }).state, 'error');
    });
    it('preserves available competition point receipts separately from earned marks', () => {
        const scorePointAward = { basePoints: 20, bonusPoints: 2, totalPoints: 22 };
        const result = buildObjectiveFeedback(makeRecord({ scorePointAward }), config);
        assert.equal(result.score, 20);
        assert.deepEqual(result.scorePointAward, scorePointAward);
    });
});

function feedbackHandler(options = {}) {
    const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/record.ts'), 'utf8');
    const start = source.indexOf('export class ObjectiveSubmitFeedbackHandler');
    const end = source.indexOf('\nexport async function apply', start);
    const imports = `
        import { Handler, param, Types, PRIV, PERM, record, problem, contest,
            RecordNotFoundError, ProblemNotFoundError, PermissionError, ProblemConfigError,
            buildObjectiveInitialSubmission, loadObjectiveSubmissionConfig, loadOwnObjectiveRecordSubmission,
            authorizeHomeworkReview, isHomeworkReviewRecord } from 'dependencies';
    `;
    const document = makeRecord(options.record);
    const sourceReads = [];
    const reviewCalls = [];
    const dependencies = {
        Handler: class {
            user = { _id: options.uid ?? 12, own: () => !!options.owner, hasPerm: () => !!options.editor };
            response = {};
            checkPriv() {}
        },
        param: () => () => {}, Types: { ObjectId }, PRIV: { PRIV_USER_PROFILE: 1 }, PERM: { PERM_EDIT_CONTEST: 1 },
        record: {
            get: async (domainId) => domainId === document.domainId ? document : null,
            RECORD_GENERATE: new ObjectId('000000000000000000000001'),
            RECORD_PRETEST: new ObjectId('000000000000000000000000'),
        },
        problem: {
            PROJECTION_PUBLIC: ['config', 'reference'], canViewBy: () => options.problemVisible !== false,
            get: async (domainId, pid, projection, raw) => {
                sourceReads.push({ domainId, pid, raw });
                if (options.reference && domainId === 'class-a') return { reference: { domainId: 'source-class', pid: 22 } };
                return { config };
            },
        },
        contest: {
            get: async (domainId, tid) => (options.deletedContest ? null : { docId: tid }),
            getStatus: async () => ({ attend: !!options.attend }),
            canShowRecord: () => !!options.showRecords,
            canShowSelfRecord: () => options.showSelf !== false,
            applyProjection: (_, recordDoc) => {
                if (options.hideScore) delete recordDoc.score;
                if (options.hideDetails) recordDoc.testCases = [];
                if (options.hideCaseField) {
                    recordDoc.testCases = recordDoc.testCases.map((testCase) => ({ ...testCase, [options.hideCaseField]: undefined }));
                }
                return recordDoc;
            },
        },
        RecordNotFoundError: class RecordNotFoundError extends Error {},
        ProblemNotFoundError: class ProblemNotFoundError extends Error {},
        PermissionError: class PermissionError extends Error {},
        ProblemConfigError: class ProblemConfigError extends Error {},
        authorizeHomeworkReview: async (viewer, domain, homework, pid, uid) => {
            reviewCalls.push({ pid, uid, tid: homework.docId.toString() });
            if (!options.reviewAuthorized) throw new Error('Review denied');
        },
        ...helpers,
    };
    dependencies.isHomeworkReviewRecord = loadModule(
        fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/homework_review.ts'), 'utf8'), {
            '../error': dependencies,
            '../model/builtin': dependencies,
            '../model/domain': {},
            '../model/record': {},
            '../model/user': {},
            '../model/workspace': {},
            './record_visibility': {},
        },
    ).isHomeworkReviewRecord;
    Object.assign(dependencies, loadModule(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/objective_submission.ts'), 'utf8'), {
        '../error': dependencies,
        '../model/builtin': dependencies,
        '../model/contest': dependencies.contest,
        '../model/problem': dependencies.problem,
        '../model/record': dependencies.record,
        './objective_feedback': helpers,
    }));
    const { ObjectiveSubmitFeedbackHandler } = loadModule(imports + source.slice(start, end), { dependencies });
    const handler = new ObjectiveSubmitFeedbackHandler();
    return {
        sourceReads,
        reviewCalls,
        async get(domainId = 'class-a', tid, reviewUid) {
            await handler.get(domainId, rid, tid, reviewUid);
            return plain(handler.response.body);
        },
    };
}

describe('objective feedback authorization', () => {
    const contestId = new ObjectId();
    it('rejects other students, other domains, and pretests even with teacher privileges', async () => {
        await assert.rejects(feedbackHandler({ uid: 13, owner: true, editor: true }).get(), { name: 'Error' });
        await assert.rejects(feedbackHandler().get('other-class'));
        await assert.rejects(feedbackHandler({ record: { contest: new ObjectId('000000000000000000000000') } }).get());
        await assert.rejects(feedbackHandler({ record: { contest: new ObjectId('000000000000000000000001') } }).get());
    });
    it('withholds all grade data when contest self records or testcase details are hidden', async () => {
        await Promise.all([{ showSelf: false }, { hideScore: true }, { hideDetails: true }].map(async (visibility) => {
            const response = await feedbackHandler({ record: { contest: contestId }, ...visibility }).get();
            assert.deepEqual(response, { objective: { rid: rid.toString(), state: 'hidden' } });
        }));
    });
    it('returns own permitted contest marks and allows an attendee to view their hidden contest problem', async () => {
        const response = await feedbackHandler({ record: { contest: contestId }, attend: true, problemVisible: false }).get();
        assert.equal(response.objective.score, 20);
        await assert.rejects(feedbackHandler({ record: { contest: contestId }, problemVisible: false }).get());
        await assert.rejects(feedbackHandler({ problemVisible: false }).get());
        await assert.rejects(feedbackHandler({ record: { contest: contestId }, deletedContest: true }).get());
    });
    it('never restores marks redacted by a plugin projection that retains the testcase count', async () => {
        await Promise.all(['status', 'score'].map(async (hideCaseField) => {
            const response = await feedbackHandler({ record: { contest: contestId }, hideCaseField }).get();
            assert.deepEqual(response, { objective: { rid: rid.toString(), state: 'error' } });
        }));
    });
    it('reads referenced problem grading server-side while returning only safe marks', async () => {
        const handler = feedbackHandler({ reference: true });
        const response = await handler.get();
        assert.equal(response.objective.totalScore, 60);
        assert.deepEqual(handler.sourceReads, [
            { domainId: 'class-a', pid: 5983, raw: true },
            { domainId: 'source-class', pid: 22, raw: true },
        ]);
        assert.ok(!JSON.stringify(response).includes('secret'));
    });
    it('requires explicit homework review authorization before polling another student’s result', async () => {
        const tid = new ObjectId();
        await assert.rejects(feedbackHandler({ uid: 13 }).get('class-a', tid, 12));
        await assert.rejects(feedbackHandler({ uid: 13, reviewAuthorized: true }).get('class-a', undefined, 12));
        const review = feedbackHandler({ uid: 13, reviewAuthorized: true });
        const result = await review.get('class-a', tid, 12);
        assert.equal(result.objective.score, 20);
        assert.deepEqual(review.reviewCalls, [{ pid: 5983, uid: 12, tid: tid.toString() }]);
        assert.ok(!JSON.stringify(result).includes('secret'));
    });
    it('rejects other contests, pretests, targets and domains even after review management authorization', async () => {
        const tid = new ObjectId();
        await Promise.all([{ contest: new ObjectId() }, { contest: new ObjectId('000000000000000000000000') },
            { contest: new ObjectId('000000000000000000000001') }, { uid: 14 }, { input: '' }, { hackTarget: rid }].map(async (recordOverride) => {
            await assert.rejects(feedbackHandler({ uid: 13, reviewAuthorized: true, record: recordOverride }).get('class-a', tid, 12));
        }));
        await assert.rejects(feedbackHandler({ uid: 13, reviewAuthorized: true }).get('other-class', tid, 12));
        const ownHomework = feedbackHandler({ uid: 13, reviewAuthorized: true, record: { contest: tid } });
        assert.equal((await ownHomework.get('class-a', tid, 12)).objective.state, 'complete');
    });
});
