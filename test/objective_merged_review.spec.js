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
const deps = {
    '../model/builtin': { STATUS }, '../error': {}, '../model/problem': {}, '../model/record': {},
    '../model/contest': {}, './contest_access': {},
};
for (const name of ['objective_feedback', 'objective_submission', 'objective_merged_review']) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, `packages/hydrooj/src/lib/${name}.ts`), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, { module, exports: module.exports, require: (name) => deps[name] || require(name) });
    deps[`./${name}`] = module.exports;
}
const { buildObjectiveMergedReview } = deps['./objective_merged_review'];
const plain = (value) => JSON.parse(JSON.stringify(value));
const rid = (i) => new ObjectId(`6aa0000${i}0000000000000000`);
const student = { uid: 20, name: '小明' };
const config = { type: 'objective', answers: { 1: ['SECRET_A', 10], 2: ['SECRET_B', 10], 3: ['SECRET_C', 10], 4: ['SECRET_D', 10] } };
const makeRecord = (i, code, results = [1, 1, 1, 1], extra = {}) => ({
    _id: rid(i), uid: 20, code, status: 2, score: 0,
    testCases: results.map((status, index) => ({ subtaskId: index + 1, id: 0, status, score: status === 1 ? 10 : 0,
        message: 'SECRET_JUDGE' })),
    ...extra,
});

describe('objective merged answers', () => {
    it('grades each question by its first nonempty answer, preserving every selected answer in chronological order', () => {
        const result = plain(buildObjectiveMergedReview([
            makeRecord(3, '1: B\n2: B', [2, 1, 2, 2]),
            makeRecord(1, '1: " "\n2: A\n3: C\n4: []', [2, 2, 2, 2]),
            makeRecord(2, '1: A\n2: B\n3: ""', [1, 1, 2, 2]),
        ], config, student));
        assert.deepEqual(result.questions.map((question) => question.result), ['first_correct', 'correct_after_retry', 'incorrect', 'unanswered']);
        assert.deepEqual(result.questions[0].attempts.map((attempt) => attempt.answer), ['A', 'B']);
        assert.deepEqual(result.questions[1].attempts.map((attempt) => attempt.answer), ['A', 'B', 'B']);
        assert.equal(result.questions[0].answer, 'A');
        assert.equal(result.questions[1].answer, 'B');
        assert.equal(result.questions[0].attempts[0].submittedAt, rid(2).getTimestamp().toISOString());
        assert.equal(result.submissionCount, 3);
        assert.deepEqual(result.summary, { firstCorrect: 1, correctAfterRetry: 1, incorrect: 1, unanswered: 1, pending: 0, error: 0 });
        assert.equal(result.firstSubmittedAt, rid(1).getTimestamp().toISOString());
        assert.equal(result.lastSubmittedAt, rid(3).getTimestamp().toISOString());
        assert.doesNotMatch(JSON.stringify(result), /SECRET_|testCases|message|scorePointAward/);
    });

    it('handles multi-select answers and never counts blank or malformed answer values as attempts', () => {
        const result = buildObjectiveMergedReview([
            makeRecord(1, '1: ["", " "]\n2: 42\n3: {A: true}\n4: [A]'),
            makeRecord(2, '1: [A, B]\n2: null\n3: [A, 5]\n4: [A, C]'),
            makeRecord(3, '1: ['),
        ], config, student);
        assert.deepEqual(plain(result.questions[0].answer), ['A', 'B']);
        assert.equal(result.questions[0].attempts.length, 1);
        assert.equal(result.questions[1].result, 'unanswered');
        assert.equal(result.questions[2].result, 'unanswered');
        assert.deepEqual(plain(result.questions[3].attempts.map((attempt) => attempt.answer)), [['A'], ['A', 'C']]);
    });

    it('does not manufacture a first-time success from pending, projected or failed earlier grades', () => {
        for (const extra of [{ status: 20 }, { status: 8 }, { testCases: [] }, { score: undefined }]) {
            const result = buildObjectiveMergedReview([makeRecord(1, '1: A', undefined, extra), makeRecord(2, '1: A')], config, student);
            assert.equal(result.questions[0].result, extra.status === 20 ? 'pending' : 'error');
            assert.equal(result.questions[0].attempts[1].result, 'correct');
        }
        const knownWrong = buildObjectiveMergedReview([
            makeRecord(1, '1: B', [2, 2, 2, 2]), makeRecord(2, '1: A', undefined, { status: 20 }), makeRecord(3, '1: A'),
        ], config, student);
        assert.equal(knownWrong.questions[0].result, 'correct_after_retry');
        const unknownFirst = buildObjectiveMergedReview([
            makeRecord(1, '1: A', undefined, { status: 20 }), makeRecord(2, '1: B', [2, 2, 2, 2]), makeRecord(3, '1: A'),
        ], config, student);
        assert.equal(unknownFirst.questions[0].result, 'pending');
        const onlyPending = buildObjectiveMergedReview([makeRecord(1, '1: A', undefined, { status: 20 })], config, student);
        assert.equal(onlyPending.questions[0].result, 'pending');
    });

    it('keeps an established first correct answer green after resubmissions and later judge failures', () => {
        const result = buildObjectiveMergedReview([
            makeRecord(1, '1: A'), makeRecord(2, '1: A'), makeRecord(3, '1: B', undefined, { status: 8 }),
        ], config, student);
        assert.equal(result.questions[0].result, 'first_correct');
        assert.equal(result.questions[0].attempts.length, 3);
    });

    it('deduplicates records, excludes another learner and file submissions, and returns an explicit empty answer sheet', () => {
        const answer = makeRecord(1, '1: A');
        const result = buildObjectiveMergedReview([
            answer, answer, makeRecord(2, '1: B', undefined, { uid: 21 }),
            makeRecord(3, '1: C', undefined, { files: { code: 'stored-code' } }),
        ], config, student);
        assert.equal(result.submissionCount, 1);
        assert.equal(result.questions[0].attempts.length, 1);
        const empty = buildObjectiveMergedReview([], config, student);
        assert.equal(empty.summary.unanswered, 4);
        assert.equal(empty.submissionCount, 0);
        assert.equal(empty.firstSubmittedAt, undefined);
        assert.equal(buildObjectiveMergedReview([answer], {}, student).questions.length, 0);
    });
});
