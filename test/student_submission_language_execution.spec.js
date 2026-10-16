const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const { ObjectId } = require('mongodb');

const root = path.resolve(__dirname, '..');
class ValidationError extends Error { constructor(...args) { super(args.join(' ')); } }
class ProblemNotAllowLanguageError extends Error {}
class ProblemConfigError extends Error {}
function compile(source, globals = {}) {
    const module = { exports: {} };
    const code = transformSync(source, { loader: 'ts', format: 'cjs',
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code;
    vm.runInNewContext(code, { module, exports: module.exports, ...globals });
    return module.exports;
}
const policyLib = compile(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/student_submission_language.ts'), 'utf8'), {
    require: () => ({ ValidationError }),
});
const globalPolicy = (languages) => ({ version: 1, mode: 'global', languages, domains: [] });
const domainPolicy = (domains) => ({ version: 1, mode: 'per-domain', languages: [],
    domains: Object.entries(domains).map(([domainId, languages]) => ({ domainId, languages })) });
const LANGS = {
    cc: { display: 'C++' }, 'cc.cc17': { display: 'C++17', monaco: 'cpp' },
    'py.py3': { display: 'Python3', pretest: 'python-internal' },
    'python-internal': { display: 'Python runner', hidden: true },
};
const handlerSource = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/problem.ts'), 'utf8');
const handlerSections = [
    handlerSource.slice(handlerSource.indexOf('function getDomainDefaultCodeLang'), handlerSource.indexOf('type ProblemCategoryEntry')),
    handlerSource.slice(handlerSource.indexOf('export class OnlineIdeHandler'), handlerSource.indexOf('function isScratchObjectiveTeacher')),
    handlerSource.slice(handlerSource.indexOf('export class ProblemDetailHandler'), handlerSource.indexOf('export class ProblemHackHandler')),
].join('\n');

function harness(options = {}) {
    const writes = [];
    const doc = options.policy === undefined ? {} : { submissionLanguagePolicy: options.policy };
    const pdoc = { domainId: 'class-a', docId: 1001, title: 'Practice', owner: 1, tag: [], content: '', additional_file: [], data: ['config.yaml'],
        config: { type: options.type || 'default', ...(options.problemLangs ? { langs: options.problemLangs } : {}) },
        ...(options.reference ? { reference: { domainId: 'source', pid: 2001 } } : {}) };
    class Base {
        user = { _id: 20, _udoc: doc, _dudoc: {}, codeLang: 'cc.cc17', hasPerm: () => false, hasPriv: () => true };
        domain = { _id: 'class-a', ...(options.domainLangs ? { langs: options.domainLangs } : {}) };
        entryDomain = options.entryDomain ? { _id: options.entryDomain } : undefined;
        tdoc = options.contest ? { docId: new ObjectId(), owner: 1, rule: options.contest, pids: [1001],
            allDomains: !!options.shared, langs: options.contestLangs } : undefined;
        tsdoc = options.contest ? { attend: 1, startAt: new Date(), entryDomainId: options.enrolledDomain } : undefined;
        args = { domainId: 'class-a' };
        UiContext = {};
        request = { method: 'GET', query: {}, body: {}, files: {} };
        response = { body: {} };
        ctx = { parallel: async () => {} };
        checkPerm() {}
        checkPriv() {}
        async limitRate() {}
        url(name) { return `/${name}`; }
    }
    const classes = compile(handlerSections, {
        ...require('lodash'), ...policyLib, ObjectId, Handler: Base, ContestDetailBaseHandler: Base,
        route: () => () => {}, param: () => () => {}, query: () => () => {},
        Types: new Proxy({}, { get: () => () => {} }),
        PERM: {}, PRIV: {}, STATUS: { STATUS_ACCEPTED: 1 }, Time: { minute: 60000 },
        ValidationError, ProblemNotAllowLanguageError, ProblemConfigError,
        NoProblemError: class extends Error {}, ProblemNotAllowPretestError: class extends Error {},
        setting: { langs: LANGS, SETTINGS_BY_KEY: { codeLang: { range: LANGS } } },
        problem: { get: async (domainId) => domainId === 'source'
            ? { ...pdoc, reference: undefined, config: { type: 'default', langs: options.sourceLangs } } : pdoc,
        getStatus: async () => null, canViewBy: () => true, isObjectiveSource: () => false, inc: async () => {} },
        domain: { get: async (domainId) => ({ _id: domainId, langs: options.sourceDomainLangs }), incUserInDomain: async () => {} },
        contest: { isNotStarted: () => false, isDone: () => false, isOngoing: () => true, canShowSelfRecord: () => true,
            updateStatus: async () => {}, getStatus: async () => ({ attend: 1, startAt: new Date() }) },
        record: { add: async (...args) => { writes.push(args); return new ObjectId(); } },
        user: { getById: async () => ({ _id: 1 }) },
        solution: { count: async () => 0 }, discussion: { count: async () => 0 }, system: { get: () => 1000 },
        rejectHomeworkReviewMutation: () => {}, assertRecordReplayRequest: () => {}, isScratchObjectiveTeacher: () => false,
        authorizeHomeworkReview: async () => ({ _id: 21, uname: 'Student' }), canAccessHomeworkProblem: async () => true,
        canUseProblemRecordPicker: () => false, canManageRecordList: () => false,
        getActiveBadgeAcTheme: async () => null, getCppEditorMode: () => 'proficient', isCppLanguage: () => false,
        mistake: { get: async () => null, getPracticeState: () => null }, loadObjectiveCorrectAnswers: async () => null,
        loadHomeworkReviewRecord: async () => ({ _id: new ObjectId(), lang: 'cc.cc17', code: 'old code' }),
        publicHomeworkReviewRecord: (record) => record,
        loadProblemRecordReplay: async () => ({ lang: 'cc.cc17', code: 'old code' }),
    });
    const handler = new classes.ProblemSubmitHandler();
    handler.pdoc = pdoc;
    handler.response.body.pdoc = pdoc;
    const prepare = (reviewUid, fromRecord) => handler._prepare('class-a', 1001, handler.tdoc?.docId, reviewUid, fromRecord);
    const submit = (lang, pretest = false) => {
        handler.response.body = { pdoc: handler.pdoc };
        return handler.post('class-a', lang, 'print(1)', pretest, ['sample'], '', handler.tdoc?.docId);
    };
    return { handler, classes, writes, prepare, submit };
}

test('problem, domain, contest and account language limits intersect in visible choices', async () => {
    for (const contest of [undefined, 'homework', 'ioi']) {
        const h = harness({ contest, policy: globalPolicy(['cc.cc17', 'py.py3']),
            problemLangs: ['cc.cc17', 'py.py3'], domainLangs: 'cc.cc17,py.py3', contestLangs: ['py.py3'] });
        await h.prepare();
        assert.deepEqual(Array.from(h.handler.pdoc.config.langs), contest ? ['py.py3'] : ['cc.cc17', 'py.py3']);
        await h.handler.get();
        assert(!Object.hasOwn(h.handler.response.body.langRange, 'cc'));
    }
    const h = harness({ policy: globalPolicy(['py.py3']), problemLangs: ['cc.cc17', 'py.py3'], domainLangs: 'cc.cc17' });
    await h.prepare();
    assert.deepEqual(Array.from(h.handler.pdoc.config.langs), []);
    await assert.rejects(h.handler.prepare('class-a'), /请联系老师调整/);
});

test('direct submissions, file uploads and pretests cannot bypass the account policy', async () => {
    const h = harness({ policy: globalPolicy(['py.py3']) });
    for (const pretest of [false, true]) await assert.rejects(h.submit('cc.cc17', pretest), ProblemNotAllowLanguageError);
    h.handler.request.files.file = { size: 20, filepath: '/must/not/read.cpp' };
    await assert.rejects(h.handler.post('class-a', 'cc.cc17', '', false), ProblemNotAllowLanguageError);
    assert.equal(h.writes.length, 0);
    await h.submit('py.py3');
    await h.submit('py.py3', true);
    assert.equal(h.writes[0][3], 'py.py3');
    assert.equal(h.writes[1][3], 'python-internal');
    assert.equal(h.writes[1][6].type, 'pretest');
    await assert.rejects(h.submit('python-internal', true), ProblemNotAllowLanguageError);
});

test('legacy users remain unrestricted and a domain policy does not affect an unrelated domain', async () => {
    for (const policy of [undefined, domainPolicy({ 'class-b': ['py.py3'] })]) {
        const h = harness({ policy });
        await h.prepare();
        assert(h.handler.pdoc.config.langs.includes('cc.cc17'));
        await h.submit('cc.cc17');
        assert.equal(h.writes.length, 1);
    }
});

test('shared contests enforce source and validated/current or enrolled entry policies even when the URL drops the entry', async () => {
    const policy = domainPolicy({ 'class-a': ['cc.cc17', 'py.py3'], python: ['py.py3'], cpp: ['cc.cc17'] });
    const h = harness({ contest: 'ioi', shared: true, entryDomain: 'python', enrolledDomain: 'python', policy });
    await h.prepare();
    assert.deepEqual(Array.from(h.handler.pdoc.config.langs), ['py.py3']);
    // _prepare projects tsdoc for display; the private enrolled domain must survive.
    assert.equal(h.handler.tsdoc.entryDomainId, undefined);
    h.handler.entryDomain = undefined;
    await assert.rejects(h.submit('cc.cc17'), ProblemNotAllowLanguageError);
    await h.submit('py.py3');
    const changedEntry = harness({ contest: 'ioi', shared: true, entryDomain: 'cpp', enrolledDomain: 'python', policy });
    await changedEntry.prepare();
    assert.deepEqual(Array.from(changedEntry.handler.pdoc.config.langs), []);
    const sourceRestricted = harness({ contest: 'ioi', shared: true, entryDomain: 'other', policy: domainPolicy({ 'class-a': ['py.py3'] }) });
    await assert.rejects(sourceRestricted.submit('cc.cc17'), ProblemNotAllowLanguageError);
});

test('referenced problems use the actual classroom policy and retain the source problem/domain limits', async () => {
    const h = harness({ reference: true, sourceLangs: ['cc.cc17', 'py.py3'], sourceDomainLangs: 'py.py3',
        policy: domainPolicy({ 'class-a': ['py.py3'], source: ['cc.cc17'] }) });
    await h.prepare();
    assert.deepEqual(Array.from(h.handler.pdoc.config.langs), ['py.py3']);
    await h.submit('py.py3');
});

test('objective and submit-answer submissions are exempt, including a malformed closed policy', async () => {
    for (const type of ['objective', 'submit_answer']) {
        const h = harness({ type, policy: globalPolicy([]) });
        await h.prepare();
        assert.deepEqual(Array.from(h.handler.pdoc.config.langs), ['_']);
        await h.handler.prepare('class-a');
        await h.submit('cc.cc17');
        assert.equal(h.writes[0][3], '_');
    }
});

test('teacher homework history and record replay stay viewable when the old language is no longer allowed', async () => {
    const teacher = harness({ contest: 'homework', policy: globalPolicy([]) });
    await teacher.prepare(21);
    assert.equal(teacher.handler.UiContext.homeworkReview.lang, 'cc.cc17');
    assert.equal(teacher.handler.UiContext.homeworkReview.code, 'old code');
    const own = harness({ policy: globalPolicy([]) });
    await own.prepare(undefined, new ObjectId());
    assert.equal(own.handler.UiContext.recordReplay.lang, 'cc.cc17');
});

test('online IDE language selection uses the candidate actual domain and keeps answer types exempt', () => {
    const h = harness({ policy: domainPolicy({ 'class-a': ['py.py3'], 'class-b': ['cc'] }) });
    const ide = new h.classes.OnlineIdeHandler();
    const doc = { domainId: 'class-a', config: { type: 'default' } };
    assert.deepEqual(Array.from(ide.getAllowedLangs(doc, { _id: 'class-a' })), ['py.py3']);
    assert.deepEqual(Array.from(ide.getAllowedLangs(doc, { _id: 'class-b' })), ['cc']);
    assert.deepEqual(Array.from(ide.getAllowedLangs({ ...doc, config: { type: 'default', langs: ['cc.cc17'] } }, { _id: 'class-a' })), []);
    assert.deepEqual(Array.from(ide.getAllowedLangs({ ...doc, config: { type: 'objective' } }, { _id: 'class-a' })), ['_']);
});

test('a forbidden cached draft keeps its code, chooses an allowed language, and never rewrites history', () => {
    const source = fs.readFileSync(path.join(root, 'packages/ui-default/components/scratchpad/reducers/editor.ts'), 'utf8');
    function state(overrides = {}) {
        const cache = new Map([['20/class-a/1001', 'original draft'], ['20/class-a/1001#lang', 'cc.cc17']]);
        const UiContext = { pdoc: { domainId: 'class-a', docId: 1001, config: { langs: ['py.py3'] } }, codeLang: 'py.py3', ...overrides };
        const reducer = compile(source, { UiContext, UserContext: { _id: 20 }, window: { LANGS },
            localStorage: { getItem: (key) => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value) } }).default;
        return { value: reducer(), cache };
    }
    const draft = state();
    assert.equal(draft.value.lang, 'py.py3');
    assert.equal(draft.value.code, 'original draft');
    assert.equal(draft.cache.get('20/class-a/1001'), 'original draft');
    assert.equal(state({ recordReplay: { lang: 'cc.cc17' } }).value.lang, 'cc.cc17');
    assert.equal(state({ homeworkReview: { lang: 'old-cpp', code: 'student history' } }).value.lang, 'old-cpp');
    assert.equal(state({ pdoc: { domainId: 'class-a', docId: 1001, config: { langs: [] } } }).value.lang, '');
});

test('an explicitly allowed root compiler stays selectable when every version is disallowed', () => {
    const source = fs.readFileSync(path.join(root, 'packages/ui-default/utils/index.ts'), 'utf8');
    const section = source.slice(source.indexOf('export function getAvailableLangs'), source.indexOf('export const createZipStream'));
    const { getAvailableLangs } = compile(section, { Array, window: { LANGS } });
    assert.deepEqual(Object.keys(getAvailableLangs(['cc'])), ['cc']);
    assert.deepEqual(Object.keys(getAvailableLangs(['cc', 'cc.cc17'])), ['cc.cc17']);
    assert.deepEqual(Object.keys(getAvailableLangs([])), []);
});
