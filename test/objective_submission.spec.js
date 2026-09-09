const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { ObjectId } = require('mongodb');

const root = path.resolve(__dirname, '..');
function loadModule(file, dependencies) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, { module, exports: module.exports, require: (name) => dependencies[name] || require(name) });
    return module.exports;
}
const STATUS = { STATUS_WAITING: 0, STATUS_ACCEPTED: 1, STATUS_WRONG_ANSWER: 2,
    STATUS_FETCHED: 22, STATUS_COMPILING: 21, STATUS_JUDGING: 20 };
const feedback = loadModule('packages/hydrooj/src/lib/objective_feedback.ts', { '../model/builtin': { STATUS } });
const config = { type: 'objective', answers: { 1: ['grading-key-secret', 100], '2-1': [['hidden-A', 'hidden-B'], 10] } };
const ids = {
    homework: new ObjectId('600000000000000000000001'),
    contest: new ObjectId('600000000000000000000002'),
    pretest: new ObjectId('000000000000000000000000'),
    generate: new ObjectId('000000000000000000000001'),
};
const rid = (suffix) => new ObjectId(`6100000000000000000000${String(suffix).padStart(2, '0')}`);
const record = (suffix, extra = {}) => ({ _id: rid(suffix), domainId: 'class-a', pid: 12, uid: 24,
    code: '1: "my answer"\n2-1: ["my selection"]', status: 2, score: 0,
    testCases: [{ subtaskId: 1, id: 0, score: 0, status: 2 }, { subtaskId: 2, id: 1, score: 0, status: 2 }], ...extra });
const plain = (value) => JSON.parse(JSON.stringify(value));
const eq = (a, b) => a == null ? b == null : b != null && a.toString() === b.toString();

function fixture(records = [], options = {}) {
    const reads = [];
    const queries = [];
    const dependencies = {
        '../error': {
            PermissionError: class PermissionError extends Error {},
            ProblemConfigError: class ProblemConfigError extends Error {},
            ProblemNotFoundError: class ProblemNotFoundError extends Error {},
            RecordNotFoundError: class RecordNotFoundError extends Error {},
        },
        '../model/builtin': { PRIV: { PRIV_USER_PROFILE: 1 }, PERM: { PERM_EDIT_CONTEST: 1, PERM_VIEW_PROBLEM_HIDDEN: 2 } },
        './objective_feedback': feedback,
        '../model/problem': {
            PROJECTION_PUBLIC: ['config', 'reference'],
            canViewBy: () => options.problemVisible !== false,
            get: async (domainId, pid, projection, raw) => {
                reads.push({ domainId, pid, raw });
                if (options.reference && domainId === 'class-a') return { docId: 12, reference: { domainId: 'source', pid: 33 } };
                return { docId: pid, config: options.rawConfig || config };
            },
        },
        '../model/contest': {
            getMulti: (domainId, query) => {
                assert.equal(domainId, 'class-a');
                assert.equal(query.rule, 'homework');
                assert.equal(query.pids, 12);
                return { project: () => ({ toArray: async () => [{ docId: ids.homework }] }) };
            },
            get: async (domainId, tid) => ({ domainId, docId: tid }),
            getStatus: async () => ({ attend: options.attend !== false }),
            canShowRecord: () => false,
            canShowSelfRecord: () => options.showSelf !== false,
            applyProjection: (tdoc, rdoc) => {
                if (options.hideScore) delete rdoc.score;
                if (options.hideCases) rdoc.testCases = [];
                if (options.hideCaseMarks) rdoc.testCases = rdoc.testCases.map((testCase) => ({ ...testCase, score: undefined }));
                return rdoc;
            },
        },
        '../model/record': {
            RECORD_PRETEST: ids.pretest, RECORD_GENERATE: ids.generate,
            getMulti: (domainId, query) => {
                queries.push(query);
                let selected = records.filter((rdoc) => rdoc.domainId === domainId && rdoc.uid === query.uid && rdoc.pid === query.pid
                    && (!query.input || !Object.hasOwn(rdoc, 'input')) && (!query.hackTarget || !Object.hasOwn(rdoc, 'hackTarget'))
                    && (query.contest?.$in ? query.contest.$in.some((tid) => eq(tid, rdoc.contest)) : eq(query.contest, rdoc.contest)));
                const cursor = {
                    sort: (sort) => { selected.sort((a, b) => sort._id * a._id.toString().localeCompare(b._id.toString())); return cursor; },
                    limit: (limit) => { selected = selected.slice(0, limit); return cursor; },
                    next: async () => selected[0] || null,
                };
                return cursor;
            },
        },
    };
    const helpers = loadModule('packages/hydrooj/src/lib/objective_submission.ts', dependencies);
    const handler = {
        user: { _id: 24, hasPriv: () => options.signedIn !== false, own: () => false, hasPerm: () => false },
        checkPriv() {},
    };
    return { ...helpers, handler, queries, reads,
        restore: (tid) => helpers.loadOwnObjectiveSubmission(handler, 'class-a', { docId: 12 }, tid) };
}

describe('restoring the latest own objective submission', () => {
    it('restores the latest attempt, including pending or lower scores, rather than the best historical answer', async () => {
        const older = record(1, { score: 110, code: '1: "old best answer"' });
        const newer = record(2, { status: 20, score: 0, code: '1: "new incomplete answer"' });
        const result = await fixture([older, newer]).restore();
        assert.deepEqual(plain(result), { answers: { 1: 'new incomplete answer' }, feedback: { rid: rid(2).toString(), state: 'pending' } });
    });

    it('keeps practice limited to own no-contest or homework records, excluding other contests, users and generated runs', async () => {
        const records = [record(1), record(2, { contest: ids.homework, code: '1: "homework answer"' }),
            record(3, { contest: ids.contest }), record(4, { contest: ids.pretest }), record(5, { contest: ids.generate }),
            record(6, { uid: 25 }), record(7, { pid: 13 }), record(8, { domainId: 'other-class' }),
            record(9, { input: '' }), record(10, { hackTarget: rid(1) })];
        const result = await fixture(records).restore();
        assert.equal(result.feedback.rid, rid(2).toString());
        assert.deepEqual(plain(result.answers), { 1: 'homework answer' });
    });

    it('limits contest restoration to the current contest, even when a newer practice answer exists', async () => {
        const result = await fixture([record(1, { contest: ids.contest }), record(2), record(3, { contest: ids.homework })]).restore(ids.contest);
        assert.equal(result.feedback.rid, rid(1).toString());
        assert.equal(await fixture([record(1)]).restore(ids.contest), null);
        const signedOut = fixture([record(1)], { signedIn: false });
        assert.equal(await signedOut.restore(), null);
        assert.equal(signedOut.queries.length, 0);
    });

    it('restores only submitted values while withholding all hidden contest grades', async () => {
        await Promise.all([{ showSelf: false }, { hideScore: true }, { hideCases: true }].map(async (options) => {
            const result = await fixture([record(1, { contest: ids.contest })], options).restore(ids.contest);
            assert.deepEqual(plain(result.feedback), { rid: rid(1).toString(), state: 'hidden' });
            assert.deepEqual(plain(result.answers), { 1: 'my answer', '2-1': ['my selection'] });
            assert.doesNotMatch(JSON.stringify(result), /grading-key-secret|hidden-A|hidden-B|testCases|score/);
        }));
        const projected = await fixture([record(1, { contest: ids.contest })], { hideCaseMarks: true }).restore(ids.contest);
        assert.deepEqual(plain(projected.feedback), { rid: rid(1).toString(), state: 'error' });
    });

    it('loads raw YAML config from the reference source without returning any grading answer', async () => {
        const rawConfig = 'type: objective\nanswers:\n  1: [grading-key-secret, 100]\n  2-1: [[hidden-A, hidden-B], 10]';
        const f = fixture([record(1)], { reference: true, rawConfig });
        const result = await f.restore();
        assert.equal(result.feedback.totalScore, 110);
        assert.deepEqual(f.reads, [{ domainId: 'class-a', pid: 12, raw: true }, { domainId: 'source', pid: 33, raw: true }]);
        assert.doesNotMatch(JSON.stringify(result), /grading-key-secret|hidden-A|hidden-B/);
    });
});

describe('safe objective answer snapshot builder', () => {
    const { buildObjectiveInitialSubmission } = fixture();
    it('preserves intentionally empty answers and rejects nested objects, unsupported values and unknown keys', () => {
        const empty = buildObjectiveInitialSubmission(record(1, { code: '1: ""\n2-1: []\nnot-a-question: grading-key-secret' }), config);
        assert.deepEqual(plain(empty.answers), { 1: '', '2-1': [] });
        assert.ok(empty.feedback.questions.every((question) => question.result === 'unanswered'));
        const invalid = buildObjectiveInitialSubmission(record(1, { code: '1: {nested: grading-key-secret}\n2-1: [A, {nested: hidden-A}]' }), config);
        assert.deepEqual(plain(invalid.answers), {});
    });

    it('handles blank, malformed and non-mapping YAML without exposing parse errors or raw content', () => {
        for (const code of ['', '1: [', '- A\n- B', 'null', 'plain text']) {
            const result = buildObjectiveInitialSubmission(record(1, { code }), config);
            assert.deepEqual(plain(result.answers), {});
            assert.doesNotMatch(JSON.stringify(result), /grading-key-secret|hidden-A|SyntaxError|YAMLException/);
        }
    });

    it('never trusts raw score or test cases when the caller supplies a hidden feedback projection', () => {
        const hidden = { rid: rid(1).toString(), state: 'hidden' };
        const result = buildObjectiveInitialSubmission(record(1, { score: 100 }), config, hidden);
        assert.deepEqual(plain(result.feedback), hidden);
        assert.doesNotMatch(JSON.stringify(result), /score|questions|testCases/);
    });
});
