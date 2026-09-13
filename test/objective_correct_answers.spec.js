const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { ObjectId } = require('mongodb');

const root = path.resolve(__dirname, '..');
const PERM = { PERM_EDIT_DOMAIN: 1n, PERM_VIEW_RECORD: 2n, PERM_READ_RECORD_CODE: 4n, PERM_EDIT_PROBLEM: 8n, PERM_SUBMIT_PROBLEM: 16n };
const PRIV = { PRIV_USER_PROFILE: 1, PRIV_EDIT_SYSTEM: 2 };
const plain = (value) => JSON.parse(JSON.stringify(value));
function loadLib(name, dependencies) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, `packages/hydrooj/src/lib/${name}.ts`), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, { module, exports: module.exports, require: (id) => dependencies[id] || require(id) });
    return module.exports;
}
const feedback = loadLib('objective_feedback', { '../model/builtin': { STATUS: {} } });
const yamlConfig = 'type: objective\nanswers:\n  1: [D, 10]\n  2-1: [[A, C], 20]\n  3: [42, 30]';
const viewer = (options = {}) => ({
    _id: options.guest ? 0 : 10,
    hasPriv: (priv) => priv === PRIV.PRIV_USER_PROFILE ? !options.guest && !options.noProfile : !!options.global,
    hasPerm: (perm) => perm === PERM.PERM_EDIT_DOMAIN ? !!options.manager : !!options.recordReader,
    own: () => !!options.owner,
});
function fixture(options = {}) {
    const reads = [];
    const memberships = [];
    const pdoc = { domainId: 'class-a', docId: 12, pid: 'P12', owner: 10, title: '客观题', content: '', tag: [],
        config: { type: options.programming ? 'default' : 'objective', langs: ['_'] },
        ...(options.reference ? { reference: { domainId: options.sourceDomain || 'source', pid: 33 } } : {}) };
    const raw = { ...pdoc, config: options.rawConfig === undefined ? yamlConfig : options.rawConfig };
    const helpers = loadLib('objective_correct_answers', {
        '../model/builtin': { PERM, PRIV }, './objective_feedback': feedback,
        '../model/problem': { get: async (domainId, pid, projection, rawConfig) => {
            reads.push({ domainId, pid, projection, rawConfig });
            if (pid === 12) return options.missingLocal ? null : raw;
            return options.missingSource ? null : { domainId, docId: pid, config: options.sourceConfig || yamlConfig,
                ...(options.nestedReference ? { reference: { domainId: 'third-domain', pid: 44 } } : {}) };
        } },
        '../model/user': { getById: async (domainId, uid) => {
            memberships.push({ domainId, uid });
            return options.missingMembership ? null : viewer({ manager: options.sourceManager });
        } },
    });
    const currentViewer = viewer(options);
    return { ...helpers, reads, memberships, pdoc, currentViewer,
        load: () => helpers.loadObjectiveCorrectAnswers(currentViewer, 'class-a', pdoc) };
}

describe('authorized objective correct-answer extraction', () => {
    const { buildObjectiveCorrectAnswers } = fixture();
    it('extracts scalar, multi-select, nested question and alternative accepted values without scoring metadata', () => {
        const config = { type: 'objective', checker: 'SECRET_CHECKER', answers: {
            1: ['D', 10], '2-1': [['A', 'C'], 20], 3: [42, 30], 4: [false, 2],
            5: { first: 10, alternative: 5, wrong: 0, broken: 'not a score' },
            6: { only: 5 }, 7: ['<script>literal answer</script>', '4'],
        } };
        const result = buildObjectiveCorrectAnswers(config);
        assert.deepEqual(plain(result), { 1: 'D', '2-1': ['A', 'C'], 3: '42', 4: 'false',
            5: ['first', 'alternative'], 6: 'only', 7: '<script>literal answer</script>' });
        result['2-1'].push('B');
        assert.deepEqual(config.answers['2-1'][0], ['A', 'C']);
        assert.doesNotMatch(JSON.stringify(result), /SECRET_CHECKER|checker|score|wrong|broken/);
        assert.deepEqual(plain(buildObjectiveCorrectAnswers(yamlConfig)), { 1: 'D', '2-1': ['A', 'C'], 3: '42' });
    });

    it('omits malformed configs, keys and nested answer values instead of exposing arbitrary objects', () => {
        for (const config of [null, [], {}, 'type: objective\nanswers: [', { type: 'default', answers: { 1: ['SECRET', 1] } },
            { type: 'objective', answers: [] }]) assert.deepEqual(plain(buildObjectiveCorrectAnswers(config)), {});
        const answers = JSON.parse('{"__proto__":["SECRET",10],"constructor":["SECRET",10],"not-question":["SECRET",10]}');
        Object.assign(answers, {
            1: [null, 10], 2: [{ secret: 'SECRET' }, 10], 3: [['A', { secret: 'SECRET' }], 10],
            4: ['SECRET'], 5: ['SECRET', 10, 'extra'], 6: ['SECRET', null],
            7: ['', 10], 8: [[], 10], 9: [[1, 2], 10], 10: { SECRET: { nested: 10 } },
            11: ['SECRET', Number.NaN], 12: [Number.POSITIVE_INFINITY, 10], 13: { SECRET: 0 },
        });
        assert.deepEqual(plain(buildObjectiveCorrectAnswers({ type: 'objective', answers })), {});
    });

    it('permits signed-in global administrators and current-domain managers', async () => {
        for (const options of [{ global: true }, { manager: true }]) {
            const f = fixture(options);
            assert.deepEqual(plain(await f.load()), { 1: 'D', '2-1': ['A', 'C'], 3: '42' });
            assert.equal(f.reads.length, 1);
            assert.equal(f.reads[0].rawConfig, true);
            assert.equal(f.reads[0].pid, 12);
            assert.deepEqual(f.memberships, []);
        }
    });

    it('never reads raw keys for guests, students, record/code readers or problem owners without administration', async () => {
        for (const options of [{}, { guest: true, manager: true, global: true }, { noProfile: true, manager: true },
            { recordReader: true }, { owner: true }, { owner: true, recordReader: true }]) {
            const f = fixture(options);
            assert.equal(await f.load(), undefined);
            assert.deepEqual(f.reads, []);
        }
    });

    it('requires source-domain management for cross-domain references unless the viewer is a global administrator', async () => {
        for (const options of [{ manager: true }, { manager: true, missingMembership: true }]) {
            const f = fixture({ ...options, reference: true });
            assert.equal(await f.load(), undefined);
            assert.deepEqual(f.reads.map(({ domainId }) => domainId), ['class-a']);
            assert.deepEqual(f.memberships, [{ domainId: 'source', uid: 10 }]);
        }
        for (const options of [{ manager: true, sourceManager: true }, { global: true }]) {
            const f = fixture({ ...options, reference: true, rawConfig: 'type: objective\nanswers:\n  1: [WRONG_LOCAL, 10]' });
            assert.deepEqual(plain(await f.load()), { 1: 'D', '2-1': ['A', 'C'], 3: '42' });
            assert.deepEqual(f.reads.map(({ domainId }) => domainId), ['class-a', 'source']);
        }
    });

    it('handles same-domain references without another membership check and withholds invalid sources', async () => {
        const sameDomain = fixture({ manager: true, reference: true, sourceDomain: 'class-a' });
        assert.ok(await sameDomain.load());
        assert.deepEqual(sameDomain.memberships, []);
        for (const options of [{ missingLocal: true }, { reference: true, missingSource: true },
            { reference: true, nestedReference: true }, { reference: true, sourceConfig: 'broken config' },
            { rawConfig: 'type: objective\nanswers: []' }, { programming: true }]) {
            assert.equal(await fixture({ global: true, ...options }).load(), undefined);
        }
        const wrongDomain = fixture({ global: true });
        assert.equal(await wrongDomain.loadObjectiveCorrectAnswers(wrongDomain.currentViewer, 'another', wrongDomain.pdoc), undefined);
        assert.deepEqual(wrongDomain.reads, []);
    });
});

class PermissionError extends Error {}
function problemHandler(options = {}) {
    const f = fixture(options);
    const tid = new ObjectId('6aa000000000000000000001');
    const rid = new ObjectId('6aa000000000000000000011');
    const events = [];
    class BaseHandler {
        user = f.currentViewer;
        domain = { _id: 'class-a' };
        tdoc = options.homework ? { docId: tid, owner: 10, pids: [12] } : null;
        tsdoc = {};
        UiContext = {};
        request = { method: options.method || 'GET', query: {} };
        response = { body: {} };
        ctx = { parallel: async () => {} };
        url() { return '/return'; }
    }
    const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/problem.ts'), 'utf8');
    const section = source.slice(source.indexOf('export class ProblemDetailHandler'), source.indexOf('export class ProblemSubmitHandler'));
    const mod = { exports: {} };
    vm.runInNewContext(transformSync(section, { loader: 'ts', format: 'cjs',
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code, {
        module: mod, exports: mod.exports, ...require('lodash'), PERM, PRIV, STATUS: {}, Time: { minute: 60000 },
        route: () => () => {}, query: () => () => {}, param: () => () => {}, Types: new Proxy({}, { get: () => () => {} }),
        ContestDetailBaseHandler: BaseHandler, PermissionError, ProblemNotFoundError: class extends Error {},
        rejectHomeworkReviewMutation: () => {}, assertRecordReplayRequest: () => {},
        authorizeHomeworkReview: async () => {
            events.push('homework');
            if (options.denied === 'homework') throw new PermissionError();
            return { _id: 20, displayName: '学员' };
        },
        contest: { isNotStarted: () => false, isDone: () => false, getStatus: async () => ({}), canShowSelfRecord: () => true },
        problem: { get: async () => f.pdoc, canViewBy: () => options.denied !== 'problem', getStatus: async () => null },
        domain: { get: async () => ({ _id: 'source' }) }, user: { getById: async () => ({ _id: 10 }) },
        solution: { count: async () => 0 }, discussion: { count: async () => 0 },
        setting: { langs: { _: {} } }, pickPreferredCodeLang: () => '_', getCppEditorMode: () => 'proficient',
        getActiveBadgeAcTheme: async () => null, canManageRecordList: () => false, mistake: { getPracticeState: () => null },
        canUseProblemRecordPicker: () => true,
        loadHomeworkReviewRecord: async () => null, publicHomeworkReviewRecord: () => null,
        loadHomeworkReviewRecords: async () => [], loadObjectiveSubmissionConfig: async () => ({ config: {} }),
        buildObjectiveMergedReview: () => ({ uid: 20, questions: [] }),
        loadProblemRecordReplay: async () => {
            events.push('single');
            if (options.denied === 'single') throw new PermissionError();
            return { rid: rid.toString() };
        },
        loadProblemMergedReview: async () => {
            events.push('merged');
            if (options.denied === 'merged') throw new PermissionError();
            return { uid: 20, questions: [] };
        },
        loadObjectiveCorrectAnswers: async (...args) => { events.push('answers'); return f.loadObjectiveCorrectAnswers(...args); },
    });
    const handler = new mod.exports.ProblemDetailHandler();
    return { ...f, events, handler,
        prepare: () => handler._prepare('class-a', 12, options.homework ? tid : undefined, options.homework ? 20 : undefined,
            options.single ? rid : undefined, options.merged ? 20 : undefined) };
}

describe('correct answers at the objective problem handler boundary', () => {
    it('emits the same minimal answer map for normal, single-record, merged-bank and homework reviews', async () => {
        for (const mode of [{}, { single: true }, { merged: true }, { homework: true }]) {
            const h = problemHandler({ global: true, ...mode });
            await h.prepare();
            assert.deepEqual(plain(h.handler.UiContext.objectiveCorrectAnswers), { 1: 'D', '2-1': ['A', 'C'], 3: '42' });
            assert.equal(h.events.at(-1), 'answers');
        }
    });

    it('keeps keys absent from every student and general record-reader view', async () => {
        for (const mode of [{}, { single: true }, { merged: true }, { homework: true }]) {
            const h = problemHandler({ recordReader: true, ...mode });
            await h.prepare();
            assert.equal(Object.hasOwn(h.handler.UiContext, 'objectiveCorrectAnswers'), false);
            assert.deepEqual(h.reads, []);
        }
    });

    it('does not read keys before denied problem, record or homework authorization', async () => {
        for (const options of [{ denied: 'problem' }, { denied: 'single', single: true },
            { denied: 'merged', merged: true }, { denied: 'homework', homework: true }]) {
            const h = problemHandler({ global: true, ...options });
            await assert.rejects(h.prepare(), PermissionError);
            assert.deepEqual(h.reads, []);
            assert.equal(h.events.includes('answers'), false);
        }
    });

    it('withholds cross-domain reference keys without source administration and skips non-read requests', async () => {
        const referenced = problemHandler({ manager: true, reference: true });
        await referenced.prepare();
        assert.equal(referenced.handler.UiContext.objectiveCorrectAnswers, undefined);
        assert.deepEqual(referenced.memberships, [{ domainId: 'source', uid: 10 }]);
        const post = problemHandler({ global: true, method: 'POST' });
        await post.prepare();
        assert.equal(post.events.includes('answers'), false);
        assert.deepEqual(post.reads, []);
    });
});
