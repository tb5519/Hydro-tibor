const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

function load(relative, requireModule) {
    const mod = { exports: {} };
    const source = transformSync(fs.readFileSync(path.join(__dirname, relative), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code;
    vm.runInNewContext(source, { module: mod, exports: mod.exports, require: requireModule });
    return mod.exports;
}

const policyHelpers = load('../packages/hydrooj/src/lib/student_submission_language.ts', () => ({
    ValidationError: class ValidationError extends Error {},
}));
const globalPolicy = (languages) => ({ version: 1, mode: 'global', languages, domains: [] });
const domainPolicy = (domains) => ({ version: 1, mode: 'per-domain', languages: [], domains });

function harness({ policy, lang = 'cc', type = 'default', shared = false, entry, enrolledEntry, binary = false } = {}) {
    const events = [];
    let Handler;
    const catalog = { cc: { display: 'C++', isBinary: binary }, py3: { display: 'Python 3' }, _: { display: '答案' } };
    const action = (kind, result) => async (...args) => { events.push({ kind, args }); return result; };
    const module = load('../packages/onsite-toolkit/submit.ts', (name) => {
        if (name === 'hydrooj/src/handler/contest') return { ContestDetailBaseHandler: class {} };
        if (name === 'hydrooj/src/lib/student_submission_language') return policyHelpers;
        assert.equal(name, 'hydrooj');
        return {
            ContestModel: { isOngoing: () => true, updateStatus: action('contest-status') },
            DomainModel: { incUserInDomain: action('student-count') },
            fs: { readFile: action('read-file', type === 'objective' ? '{"1":"A"}' : 'int main() {}') },
            nanoid: () => 'upload-id',
            ProblemModel: { get: async () => ({ docId: 7, title: '题目', config: { type, langs: ['cc', 'py3'] } }),
                inc: action('problem-count') },
            RecordModel: { add: action('add-record', 'new-record-id') },
            SettingModel: { langs: catalog },
            StorageModel: { put: action('store-file') },
            SystemModel: { get: () => 0 },
        };
    });
    module.apply({ Route: (name, route, handler) => {
        assert.equal(name, 'contest_autosubmit');
        assert.equal(route, '/contest/:tid/autosubmit');
        Handler = handler;
    } });
    const handler = new Handler();
    Object.assign(handler, {
        tdoc: { docId: 'contest-id', title: '比赛', pids: [7], allowPrint: true, allDomains: shared },
        tsdoc: { attend: 1, ...(enrolledEntry ? { entryDomainId: enrolledEntry } : {}) },
        entryDomain: entry ? { _id: entry } : undefined,
        user: { _id: 42, uname: 'student', school: 'school',
            _udoc: policy === undefined ? {} : { submissionLanguagePolicy: policy } },
        request: { files: { file: { originalFilename: `A.${lang}`, filepath: '/test-upload', size: 20 } }, query: {} },
        response: {},
        limitRate: action('rate-limit'),
    });
    return { handler, events, async submit(dryrun = false, domainId = 'source') {
        await handler.post({ domainId, dryrun });
        return handler.response.body;
    } };
}

describe('on-site upload shortcut respects teacher submission languages', () => {
    it('preserves unrestricted and permitted submissions with the original language and counters', async () => {
        for (const policy of [undefined, globalPolicy(['cc', 'py3'])]) {
            const h = harness({ policy });
            assert.equal((await h.submit()).rid, 'new-record-id');
            const record = h.events.find((event) => event.kind === 'add-record');
            assert.equal(record.args[3], 'cc');
            assert.deepEqual(h.events.filter((event) => /-count|contest-status/.test(event.kind)).map((event) => event.kind),
                ['problem-count', 'student-count', 'contest-status']);
        }
    });

    it('rejects prohibited text and binary uploads before reading, storing, rate limiting or recording, including dry runs', async () => {
        for (const dryrun of [false, true]) {
            for (const binary of [false, true]) {
                const h = harness({ policy: globalPolicy(['py3']), binary });
                assert.match((await h.submit(dryrun)).error, /老师未允许/);
                assert.deepEqual(h.events, []);
            }
        }
    });

    it('checks only the configured classroom for ordinary contests and treats unspecified domains as unrestricted', async () => {
        const policy = domainPolicy([{ domainId: 'classroom', languages: ['py3'] }]);
        const h = harness({ policy, entry: 'classroom', enrolledEntry: 'classroom' });
        assert.equal((await h.submit()).rid, 'new-record-id');
        const restricted = harness({ policy });
        assert.match((await restricted.submit(false, 'classroom')).error, /老师未允许/);
        assert.deepEqual(restricted.events, []);
    });

    it('intersects source, validated entry and enrolled entry policies for shared contests', async () => {
        const policy = domainPolicy([
            { domainId: 'source', languages: ['cc', 'py3'] },
            { domainId: 'classroom', languages: ['py3'] },
        ]);
        for (const context of [{ entry: 'classroom' }, { enrolledEntry: 'classroom' },
            { entry: 'other-classroom', enrolledEntry: 'classroom' }]) {
            const denied = harness({ policy, shared: true, ...context });
            denied.handler.request.query.entryDomainId = 'other-classroom';
            assert.match((await denied.submit()).error, /老师未允许/);
            assert.deepEqual(denied.events, []);
            const allowed = harness({ policy, shared: true, lang: 'py3', ...context });
            assert.equal((await allowed.submit()).rid, 'new-record-id');
        }
        const noIntersection = harness({ policy: domainPolicy([
            { domainId: 'source', languages: ['cc'] }, { domainId: 'classroom', languages: ['py3'] },
        ]), shared: true, entry: 'classroom', lang: 'py3' });
        assert.match((await noIntersection.submit()).error, /老师未允许/);
        assert.deepEqual(noIntersection.events, []);
    });

    it('uses the account policy over user overlays and fails closed for corrupt policy data', async () => {
        for (const policy of [globalPolicy(['py3']), null, { version: 2 }, globalPolicy([])]) {
            const h = harness({ policy });
            h.handler.user.submissionLanguagePolicy = { version: 1, mode: 'unrestricted', languages: [], domains: [] };
            assert.match((await h.submit()).error, /老师未允许/);
            assert.deepEqual(h.events, []);
        }
    });

    it('keeps objective answers available and preserves the existing invalid-language check', async () => {
        const objective = harness({ policy: globalPolicy(['py3']), type: 'objective' });
        assert.equal((await objective.submit()).rid, 'new-record-id');
        assert.equal(objective.events.find((event) => event.kind === 'add-record').args[3], '_');
        const unsupported = harness({ policy: globalPolicy(['cc']), lang: 'unknown' });
        assert.equal((await unsupported.submit()).error, 'Unsupported language');
        assert.deepEqual(unsupported.events, []);
    });

    it('permits an allowed dry run without creating submissions or counters', async () => {
        const h = harness({ policy: globalPolicy(['py3']), lang: 'py3' });
        assert.match((await h.submit(true)).info, /Language Python 3 \(py3\)/);
        assert.deepEqual(h.events.map((event) => event.kind), ['read-file']);
    });
});
