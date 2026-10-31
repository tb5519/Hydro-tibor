const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const mod = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.resolve(__dirname, '../packages/hydrooj/src/lib/scratch_assignment_progress.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: mod, exports: mod.exports });
const { learnerAssignmentState: state, teacherAssignmentSummary: summary, sortAssignmentLearners: sort } = mod.exports;
const assignment = (extra = {}) => ({ _id: 'a', projectRequired: true, deadline: null, ...extra });
const quiz = { revision: 'current', items: [{ id: 1, score: 40 }, { id: 2, score: 60 }] };
const result = (answers, revision = 'current') => ({ revision, owner: 20, assignmentId: 'a', answers });
const submitted = (extra = {}) => ({ _id: 'submitted', reviewedAt: null, createdAt: new Date(100), ...extra });

describe('Scratch assignment progress semantics', () => {
    it('distinguishes starting an empty editor from saving, submitting and reviewing', () => {
        assert.equal(state(assignment(), 20).status, 'new');
        assert.equal(state(assignment(), 20, { _id: 'w', currentFileId: null }).status, 'new');
        assert.equal(state(assignment(), 20, { _id: 'w', currentFileId: 'file' }).status, 'draft');
        assert.equal(state(assignment(), 20, null, submitted()).status, 'submitted');
        const reviewed = submitted({ reviewedAt: new Date(200), grade: '优秀', feedback: '可以加入音效' });
        assert.equal(state(assignment(), 20, null, reviewed, reviewed).status, 'reviewed');
        assert.equal(state(assignment(), 20, null, reviewed, reviewed).completed, true);
    });
    it('requires both parts of mixed homework and counts answers rather than only correct answers', () => {
        const mixed = assignment({ objectiveQuiz: quiz });
        const half = state(mixed, 20, null, submitted(), null, result({ 1: { correct: true } }));
        assert.equal(half.status, 'draft');
        assert.equal(half.completed, false);
        assert.equal(half.projectSubmitted, true);
        const complete = state(mixed, 20, null, submitted(), null, result({ 1: { correct: false }, 2: { correct: true } }));
        assert.equal(complete.status, 'submitted');
        assert.equal(complete.objectiveCorrect, 1);
        assert.equal(complete.objectiveScore, 60);
        assert.equal(complete.objectiveTotalScore, 100);
        assert.equal(complete.completed, true);
    });
    it('handles objective-only homework and ignores obsolete result revisions', () => {
        const task = assignment({ projectRequired: false, objectiveQuiz: quiz });
        const done = state(task, 20, null, null, null, result({ 1: { correct: true }, 2: { correct: false } }));
        assert.equal(done.status, 'completed');
        assert.equal(done.projectRequired, false);
        const old = state(task, 20, null, null, null, result({ 1: { correct: true }, 2: { correct: true } }, 'old'));
        assert.equal(old.status, 'new');
        assert.equal(old.objectiveAnswered, 0);
    });
    it('keeps prior feedback visible while a newer submission waits for review', () => {
        const feedback = submitted({ _id: 'old-reviewed', reviewedAt: new Date(200), feedback: '<script>old</script>', grade: '继续加油' });
        const row = state(assignment(), 20, null, submitted({ _id: 'new-pending' }), feedback);
        assert.equal(row.status, 'submitted');
        assert.equal(row.reviewed, false);
        assert.equal(row.hasFeedback, true);
        assert.equal(row.submissionId, 'new-pending');
        assert.equal(row.feedbackSubmissionId, 'old-reviewed');
        assert.equal(row.feedback, '<script>old</script>');
    });
    it('marks only unfinished work overdue and excludes historical rows from classroom totals', () => {
        const task = assignment({ deadline: new Date(200) });
        const todo = state(task, 20, null, null, null, null, 300);
        const done = state(task, 21, null, submitted(), null, null, 300);
        const history = { ...state(task, 22), historical: true };
        assert(todo.overdue);
        assert(!done.overdue);
        const totals = summary([todo, done, history]);
        assert.equal(totals.total, 2);
        assert.equal(totals.completed, 1);
        assert.equal(totals.notStarted, 1);
        assert.equal(totals.pendingReview, 1);
        assert.equal(totals.completionPercent, 50);
        assert.deepEqual(Array.from(sort([todo, history, done]), (row) => row.uid), [21, 20, 22]);
    });
    it('keeps submitted completion but identifies newer saved changes and deadline after completion', () => {
        const task = assignment({ deadline: new Date(200) });
        const latest = submitted({ revision: 2 });
        const saved = { currentFileId: 'current', revision: 3 };
        const row = state(task, 20, saved, latest, null, null, 300);
        assert.equal(row.completed, true);
        assert.equal(row.hasUnsubmittedChanges, true);
        assert.equal(row.deadlinePassed, true);
        assert.equal(row.overdue, false);
        assert.equal(state(task, 20, { ...saved, revision: 2 }, latest).hasUnsubmittedChanges, false);
        assert.equal(state(task, 20, saved).hasUnsubmittedChanges, false);
    });

});
