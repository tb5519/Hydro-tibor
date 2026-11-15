const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/handler/problem.ts'), 'utf8');
const begin = source.indexOf('export class ProblemObjectiveHandler');
const end = source.indexOf('export const ProblemApi', begin);
assert(begin >= 0 && end > begin);
const compiled = transformSync(source.slice(begin, end), {
    loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).code;
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(options = {}) {
    const calls = [];
    const failure = new Error('publication failed');
    const record = (type, ...args) => calls.push({ type, args: plain(args) });
    class ValidationError extends Error {}
    class PermissionError extends Error {}
    const metadata = {
        normalizeProblemCode(value) {
            record('normalize', value);
            if (options.invalid) throw new ValidationError('invalid code');
            return value?.trim().toUpperCase() || undefined;
        },
        async ensureDomainProblemCodes(domainId) { record('backfill', domainId); },
        async reserveProblemCode(...args) {
            record('reserve', ...args);
            if (options.duplicate) throw new ValidationError('duplicate code');
            return {
                code: args[3] || 'S5',
                async commit() { record('commit'); if (options.commitFailure) throw failure; },
                async rollback() { record('rollback'); if (options.rollbackFailure) throw new Error('rollback failed'); },
            };
        },
    };
    const problem = {
        async get() { return null; },
        async add(...args) { record('add', ...args); return 7001; },
        async addTestdata(...args) { record('file', ...args.slice(0, 3)); if (options.fileFailure) throw failure; },
        async addAdditionalFile() {},
        async edit(...args) { record('publish', ...args); if (options.publishFailure) throw failure; },
        async del(...args) { record('delete', ...args); if (options.deleteFailure) throw new Error('delete failed'); },
    };
    const moduleValue = { exports: {} };
    vm.runInNewContext(compiled, {
        module: moduleValue, exports: moduleValue.exports, Buffer,
        ObjectiveAuthoringHandler: class {}, post: () => () => {},
        Types: new Proxy({}, { get: () => ({}) }),
        isScratchDomain: domain => domain.domainType === 'scratch',
        PERM: { PERM_EDIT_DOMAIN: 1n }, PermissionError, ValidationError,
        ProblemAlreadyExistError: ValidationError, parseCategory: value => value,
        parseObjectivePaper: JSON.parse, parseObjective: JSON.parse,
        rewriteObjectiveFiles: value => value,
        buildObjectivePaper: () => ({ content: 'paper content', config: 'type: objective' }),
        parseObjectiveTags: value => value,
        document: { TYPE_PROBLEM: 10, getMulti: () => ({ toArray: async () => [{ docId: 11, title: 'source', tag: ['循环'],
            objective: { version: 1, kind: 'single', stem: 'test', answers: ['A'] }, additional_file: [] }] }) },
        problem, scratchProblemIds: metadata,
        storage: { copy: async () => {} }, sanitize: value => value,
    });
    const handler = Object.assign(new moduleValue.exports.ProblemObjectiveHandler(), {
        domain: { domainType: options.regular ? 'cpp' : 'scratch' },
        user: { _id: 10, hasPerm: () => !options.student }, response: {},
        url: (name, params) => `/${name}/${params.paperId || params.pid}`,
    });
    const publish = code => handler.post('class-a', '题卷', JSON.stringify({ version: 1, items: [{ id: 11, score: 10 }] }), '', '', [], code);
    return { handler, calls, publish, failure, ValidationError, PermissionError };
}

it('reserves the Scratch display ID before publication while keeping the numeric paper identity unchanged', async () => {
    const f = fixture(); await f.publish(' s12 ');
    assert.deepEqual(f.calls.map(call => call.type), ['normalize', 'backfill', 'add', 'reserve', 'file', 'commit', 'publish']);
    assert.deepEqual(f.calls.find(call => call.type === 'reserve').args,
        [{ domainId: 'class-a', uid: 10, isTeacher: true }, 'objective', 7001, 'S12']);
    assert.equal(f.calls.find(call => call.type === 'add').args[1], '');
    assert.equal(f.calls.find(call => call.type === 'add').args[6].hidden, true);
    assert.equal(f.handler.response.redirect, '/scratch_problem_paper/7001');
});

it('allocates an automatic display ID when the teacher leaves the field empty', async () => {
    const f = fixture(); await f.publish('');
    assert.equal(f.calls.find(call => call.type === 'reserve').args[3], null);
    assert.equal(f.calls.filter(call => call.type === 'commit').length, 1);
});

it('leaves ordinary domain publication and routing independent of Scratch numbering', async () => {
    const f = fixture({ regular: true, invalid: true }); await f.publish('not used');
    assert.deepEqual(f.calls.map(call => call.type), ['add', 'file', 'publish']);
    assert.equal(f.handler.response.redirect, '/problem_detail/7001');
});

it('rejects invalid IDs and student authors before creating or numbering anything', async () => {
    const bad = fixture({ invalid: true }); await assert.rejects(bad.publish('bad code'), bad.ValidationError);
    assert.deepEqual(bad.calls.map(call => call.type), ['normalize']);
    const student = fixture({ student: true }); await assert.rejects(student.publish('S1'), student.PermissionError);
    assert.deepEqual(student.calls, []);
});

it('removes a failed new paper when its display ID is already occupied', async () => {
    const f = fixture({ duplicate: true }); await assert.rejects(f.publish('S1'), f.ValidationError);
    assert.deepEqual(f.calls.map(call => call.type), ['normalize', 'backfill', 'add', 'reserve', 'delete']);
    assert.deepEqual(f.calls.at(-1).args, ['class-a', 7001]);
});

for (const reason of ['fileFailure', 'publishFailure', 'commitFailure']) {
    it(`rolls back the reserved code and new paper after ${reason}`, async () => {
        const f = fixture({ [reason]: true }); await assert.rejects(f.publish('S9'), error => error === f.failure);
        assert.equal(f.calls.filter(call => call.type === 'rollback').length, 1);
        assert.equal(f.calls.filter(call => call.type === 'delete').length, 1);
        assert.equal(f.handler.response.redirect, undefined);
        if (reason === 'commitFailure') assert.equal(f.calls.some(call => call.type === 'publish'), false);
    });
}

it('attempts both cleanups and preserves the publication error if cleanup also fails', async () => {
    const f = fixture({ fileFailure: true, rollbackFailure: true, deleteFailure: true });
    await assert.rejects(f.publish('S9'), error => error === f.failure);
    assert.deepEqual(f.calls.slice(-2).map(call => call.type), ['rollback', 'delete']);
});
