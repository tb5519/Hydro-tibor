const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { ObjectId } = require('mongodb');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/scratch.ts'), 'utf8');
const start = source.indexOf('export class ScratchProblemMainHandler');
const end = source.indexOf('export class ScratchProblemCreateHandler', start);
assert(start >= 0 && end > start);
const compiled = transformSync(source.slice(start, end), { loader: 'ts', format: 'cjs' }).code;
const cursor = docs => ({ project() { return this; }, sort() { return this; }, async toArray() { return docs; } });
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

async function listing(entries, query = {}, isTeacher = true) {
    const codes = new Map();
    const projects = entries.filter(entry => entry.kind === 'project').map((entry, i) => {
        const _id = new ObjectId((i + 1).toString(16).padStart(24, '0'));
        codes.set(`project:${_id}`, entry.code);
        return { _id, title: entry.title || `Project ${entry.code}`, tags: ['创作'], hidden: !!entry.hidden };
    });
    const papers = entries.filter(entry => entry.kind === 'objective').map((entry, i) => {
        const paperId = 100 + i;
        codes.set(`objective:${paperId}`, entry.code);
        return { paperId, title: entry.title || `Paper ${entry.code}`, tags: ['坐标'], hidden: !!entry.hidden,
            revision: 1, questionCount: 2, scores: [5, 5], totalScore: 10 };
    });
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module, exports: module.exports, ObjectId, Date, ScratchHandler: class {},
        scratch: {
            assignments: { find: filter => cursor(filter.problemPaperId?.$exists === false
                ? projects.filter(doc => !filter.hidden || !doc.hidden) : []) },
            works: { find: () => cursor([]) },
            submissions: { aggregate: () => cursor([]), find: () => cursor([]) }, listAssignments: () => cursor([]),
        },
        scratchObjective: { listPublicPapers: async actor => papers.filter(paper => actor.isTeacher || !paper.hidden),
            results: { aggregate: () => cursor([]) } },
        ensureDomainProblemCodes: async () => codes,
        problemCodeKey: (kind, id) => `${kind}:${id}`,
        compareProblemCodes: (a, b) => natural.compare(a.problemCode, b.problemCode)
            || a.problemCode.localeCompare(b.problemCode) || `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
        submissionFullyCorrect: () => false, submissionReviewStatus: () => null,
    });
    let rendered;
    const handler = Object.assign(new module.exports.ScratchProblemMainHandler(), {
        actor: { domainId: 'scratch-a', uid: 10, isTeacher }, request: { query },
        url: (name, args = {}) => `/${name}/${Object.values(args).join('/')}`,
        async renderScratch(template, data) { rendered = { template, ...JSON.parse(JSON.stringify(data)) }; },
    });
    await handler.get(); return rendered;
}

it('interleaves both problem kinds by natural ID rather than source type or insertion order', async () => {
    const result = await listing([{ kind: 'project', code: 'S10' }, { kind: 'project', code: 'S2' },
        { kind: 'objective', code: 'S1' }, { kind: 'objective', code: 'S3' }]);
    assert.deepEqual(result.problems.map(entry => entry.problemCode), ['S1', 'S2', 'S3', 'S10']);
    assert.deepEqual(result.problems.map(entry => entry.kind), ['objective', 'project', 'objective', 'project']);
});
it('sorts the full mixed list before slicing either page', async () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({ kind: i % 2 ? 'objective' : 'project', code: `S${30 - i}` }));
    const first = await listing(entries); const second = await listing(entries, { page: 2 });
    assert.equal(first.count, 30); assert.equal(first.numPages, 2);
    assert.deepEqual(first.problems.map(entry => entry.problemCode), Array.from({ length: 24 }, (_, i) => `S${i + 1}`));
    assert.deepEqual(second.problems.map(entry => entry.problemCode), ['S25', 'S26', 'S27', 'S28', 'S29', 'S30']);
});
it('supports ID search and type filters while preserving hidden visibility and immutable URLs', async () => {
    const entries = [{ kind: 'project', code: 'S8', title: '小猫' }, { kind: 'objective', code: 'P2', title: '循环' },
        { kind: 'project', code: 'PRIVATE', hidden: true }];
    const searched = await listing(entries, { q: 's8' });
    assert.equal(searched.count, 1); assert.equal(searched.problems[0].id, '000000000000000000000001');
    assert.equal(searched.problems[0].url, '/scratch_problem_detail/000000000000000000000001');
    const papers = await listing(entries, { kind: 'objective' });
    assert.equal(papers.count, 1); assert.equal(papers.problems[0].url, '/scratch_problem_paper/100');
    const learner = await listing(entries, {}, false);
    assert.deepEqual(learner.problems.map(entry => entry.problemCode), ['P2', 'S8']);
    assert(learner.problems.every(entry => entry.editUrl === null));
});
