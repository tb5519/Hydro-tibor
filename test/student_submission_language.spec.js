const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

class ValidationError extends Error {}
const mod = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,
    '../packages/hydrooj/src/lib/student_submission_language.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module: mod, exports: mod.exports, require: () => ({ ValidationError }),
});
const { defaultStudentSubmissionLanguagePolicy: defaults, listSubmissionLanguageOptions: options,
    parseStudentSubmissionLanguagePolicy: parse, getStudentSubmissionLanguages: allowed } = mod.exports;
const langs = { 'py.py3': { display: 'Python 3' }, 'cc.cc17': { display: 'C++17' },
    old: { disabled: true }, internal: { hidden: true }, remote: { remote: true }, _: {} };
const clean = (value) => JSON.parse(JSON.stringify(value));
const globalPolicy = { version: 1, mode: 'global', languages: ['py.py3'], domains: [] };
const domainPolicy = { version: 1, mode: 'per-domain', languages: [], domains: [{ domainId: 'class-a', languages: ['cc.cc17'] }] };

describe('teacher-managed programming language policy', () => {
    it('lists only enabled local visible programming languages and supplies fresh unrestricted defaults', () => {
        assert.deepEqual(clean(options(langs)), [{ id: 'py.py3', name: 'Python 3' }, { id: 'cc.cc17', name: 'C++17' }]);
        const first = defaults();
        first.languages.push('py.py3');
        assert.deepEqual(clean(defaults()), { version: 1, mode: 'unrestricted', languages: [], domains: [] });
    });
    it('normalizes JSON policies without mutating inputs and scopes them to all or selected domains', () => {
        assert.deepEqual(clean(parse(JSON.stringify(globalPolicy), ['class-a'], langs)), globalPolicy);
        assert.deepEqual(clean(parse(domainPolicy, ['class-a'], langs)), domainPolicy);
        const noDomainLimits = { ...domainPolicy, domains: [] };
        assert.deepEqual(clean(parse(noDomainLimits, ['class-a'], langs)), noDomainLimits);
        assert.equal(allowed({ submissionLanguagePolicy: noDomainLimits }, 'class-a'), null);
        assert.equal(allowed({}, 'class-a'), null);
        assert.equal(allowed({ submissionLanguagePolicy: defaults() }, 'class-a'), null);
        assert.deepEqual(clean(allowed({ submissionLanguagePolicy: globalPolicy }, 'class-b')), ['py.py3']);
        assert.deepEqual(clean(allowed({ submissionLanguagePolicy: domainPolicy }, 'CLASS-A')), ['cc.cc17']);
        assert.equal(allowed({ submissionLanguagePolicy: domainPolicy }, 'class-b'), null);
        const copy = allowed({ submissionLanguagePolicy: globalPolicy }, 'class-a');
        copy.push('cc.cc17');
        assert.deepEqual(globalPolicy.languages, ['py.py3']);
    });
    it('reads the account policy instead of membership overlays', () => {
        assert.deepEqual(clean(allowed({ _udoc: { submissionLanguagePolicy: globalPolicy },
            submissionLanguagePolicy: defaults() }, 'class-a')), ['py.py3']);
        assert.equal(allowed({ _udoc: {}, submissionLanguagePolicy: globalPolicy }, 'class-a'), null);
    });
    it('rejects malformed or contradictory structures, empty selections and unknown languages or domains', () => {
        for (const invalid of [undefined, null, [], '{}', '{', 'x'.repeat(30001),
            { ...globalPolicy, version: 2 }, { ...globalPolicy, mode: 'all' }, { ...globalPolicy, extra: true },
            { ...globalPolicy, languages: [] }, { ...globalPolicy, languages: 'py.py3' },
            ...['', 'missing', 'old', 'internal', 'remote', '_', 1, null].map((lang) => ({ ...globalPolicy, languages: [lang] })),
            { ...globalPolicy, languages: ['py.py3', 'py.py3'] },
            { ...globalPolicy, domains: domainPolicy.domains },
            { ...domainPolicy, languages: ['py.py3'] },
            { ...domainPolicy, domains: [{ domainId: 'class-b', languages: ['py.py3'] }] },
            { ...domainPolicy, domains: [domainPolicy.domains[0], domainPolicy.domains[0]] },
            { ...domainPolicy, domains: [{ domainId: 'class-a', languages: [] }] },
            { ...domainPolicy, domains: [{ domainId: 'class-a', languages: ['py.py3'], extra: true }] },
            { ...globalPolicy, mode: 'unrestricted' },
        ]) assert.throws(() => parse(invalid, ['class-a'], langs), ValidationError);
    });
    it('does not grant unrestricted access when stored restrictive policies are corrupt', () => {
        for (const policy of [null, {}, { ...globalPolicy, version: 3 }, { ...globalPolicy, languages: [] },
            { ...globalPolicy, languages: [null] }, { ...domainPolicy, domains: [null] },
            { ...domainPolicy, domains: [domainPolicy.domains[0], domainPolicy.domains[0]] }]) {
            assert.deepEqual(clean(allowed({ submissionLanguagePolicy: policy }, 'class-a')), []);
        }
    });
});
