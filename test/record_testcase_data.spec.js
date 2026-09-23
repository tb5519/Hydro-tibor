const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const common = require('@hydrooj/common');
const commonCases = require('@hydrooj/common/cases');

const source = fs.readFileSync(path.join(
    __dirname, '../packages/hydrooj/src/lib/record_testcase_data.ts',
), 'utf8');

function loadModule({ problemGet, storageGet }) {
    const compiled = esbuild.transformSync(source, {
        loader: 'ts', format: 'cjs', target: 'es2022',
    }).code;
    const mod = { exports: {} };
    const imports = {
        '@hydrooj/common': common,
        '@hydrooj/common/cases': commonCases,
        'js-yaml': require('js-yaml'),
        '../model/builtin': { PERM: common.PERM, PRIV: common.PRIV },
        '../model/problem': { get: problemGet },
        '../model/storage': { get: storageGet },
    };
    vm.runInNewContext(compiled, {
        module: mod,
        exports: mod.exports,
        Buffer,
        require(id) {
            if (Object.hasOwn(imports, id)) return imports[id];
            throw new Error(`Unexpected dependency: ${id}`);
        },
    }, { filename: 'record_testcase_data.ts' });
    return mod.exports;
}

function viewer({ uid = 8, perm = 0n, priv = 0 } = {}) {
    return {
        _id: uid,
        hasPerm: (value) => (perm & value) === value,
        hasPriv: (value) => (priv & value) === value,
        own: (doc) => doc.owner === uid || (doc.maintainer || []).includes(uid),
    };
}

function fixtures(overrides = {}) {
    const access = {
        domainId: 'cpp', docId: 12, pid: 'P12', owner: 99, maintainer: [],
        ...overrides.access,
    };
    const data = {
        domainId: 'cpp', docId: 12,
        config: [
            'subtasks:',
            '  - id: 2',
            '    type: sum',
            '    cases:',
            '      - id: 4',
            '        input: case.in',
            '        output: case.out',
            '',
        ].join('\n'),
        data: [
            { name: 'case.in', size: 4 },
            { name: 'case.out', size: 3 },
        ],
        ...overrides.data,
    };
    return { access, data };
}

describe('record testcase data privacy and mapping', () => {
    it('recognizes only the problem-data permission, global privilege, owner or maintainer', () => {
        const api = loadModule({ problemGet: async () => null, storageGet: async () => null });
        const pdoc = { owner: 9, maintainer: [10] };
        assert.equal(api.canViewRecordTestcaseData(viewer(), pdoc), false);
        assert.equal(api.canViewRecordTestcaseData(viewer({ uid: 9 }), pdoc), true);
        assert.equal(api.canViewRecordTestcaseData(viewer({ uid: 10 }), pdoc), true);
        assert.equal(api.canViewRecordTestcaseData(viewer({ perm: common.PERM.PERM_READ_PROBLEM_DATA }), pdoc), true);
        assert.equal(api.canViewRecordTestcaseData(viewer({ priv: common.PRIV.PRIV_READ_PROBLEM_DATA }), pdoc), true);
        assert.equal(api.canViewRecordTestcaseData(viewer({ perm: common.PERM.PERM_VIEW_RECORD }), pdoc), false);
        assert.equal(api.canViewRecordTestcaseData(viewer({ perm: common.PERM.PERM_READ_RECORD_CODE }), pdoc), false);
    });

    it('matches explicit judge subtask/case ids and filename-discovered cases', async () => {
        const api = loadModule({ problemGet: async () => null, storageGet: async () => null });
        const explicitConfig = [
            'subtasks:',
            '  - id: 3',
            '    cases:',
            '      - id: 7',
            '        input: alpha.in',
            '        output: alpha.out',
            '',
        ].join('\n');
        const explicit = await api.resolveRecordTestcaseFiles(explicitConfig, ['alpha.in', 'alpha.out']);
        assert.equal(explicit.get('3:7').input, 'alpha.in');
        assert.equal(explicit.get('3:7').output, 'alpha.out');

        const discovered = await api.resolveRecordTestcaseFiles('', ['sample1.in', 'sample1.out']);
        assert.equal(discovered.get('1:1').input, 'sample1.in');
        assert.equal(discovered.get('1:1').output, 'sample1.out');
    });

    it('reuses the judge config.ini conversion for legacy testcase names', async () => {
        const api = loadModule({ problemGet: async () => null, storageGet: async () => null });
        const legacy = await api.resolveRecordTestcaseFiles(
            '',
            ['legacy-input.data', 'legacy-answer.data', 'config.ini'],
            '1\nlegacy-input.data|legacy-answer.data|1|100|65536',
        );
        assert.equal(legacy.get('1:1').input, 'legacy-input.data');
        assert.equal(legacy.get('1:1').output, 'legacy-answer.data');
    });

    it('never opens storage for an unauthorized viewer', async () => {
        let storageReads = 0;
        const { access } = fixtures();
        const api = loadModule({
            problemGet: async () => access,
            storageGet: async () => { storageReads++; return Readable.from('secret'); },
        });
        const result = await api.loadRecordTestcaseData(viewer(), 'cpp', 12, [{ subtaskId: 2, id: 4 }]);
        assert.equal(result, null);
        assert.equal(storageReads, 0);
    });

    it('loads only config-whitelisted input/output and keeps them keyed by actual result ids', async () => {
        const { access, data } = fixtures();
        const opened = [];
        const api = loadModule({
            problemGet: async (domainId, pid, projection) => projection.includes('config') ? data : access,
            storageGet: async (target) => {
                opened.push(target);
                return Readable.from(target.endsWith('case.in') ? '<x>\n' : '42\n');
            },
        });
        const result = await api.loadRecordTestcaseData(
            viewer({ perm: common.PERM.PERM_READ_PROBLEM_DATA }),
            'cpp', 12,
            [{ subtaskId: 2, id: 4 }, { subtaskId: 99, id: 99 }],
        );
        assert.equal(result['2']['4'].input.content, '<x>\n');
        assert.equal(result['2']['4'].output.content, '42\n');
        assert.equal(result['99'], undefined);
        assert.deepEqual(opened.sort(), [
            'problem/cpp/12/testdata/case.in',
            'problem/cpp/12/testdata/case.out',
        ]);
    });

    it('caps large previews and refuses to follow reference problems across domains', async () => {
        const { access, data } = fixtures({
            data: {
                data: [{ name: 'case.in', size: 200000 }, { name: 'case.out', size: 3 }],
            },
        });
        let reads = 0;
        const api = loadModule({
            problemGet: async (domainId, pid, projection) => projection.includes('config') ? data : access,
            storageGet: async (target) => {
                reads++;
                return Readable.from(target.endsWith('case.in') ? Buffer.alloc(200000, 97) : 'ok\n');
            },
        });
        const result = await api.loadRecordTestcaseData(
            viewer({ priv: common.PRIV.PRIV_READ_PROBLEM_DATA }), 'cpp', 12, [{ subtaskId: 2, id: 4 }],
        );
        assert.equal(result['2']['4'].input.content.length, 128 * 1024);
        assert.equal(result['2']['4'].input.truncated, true);
        assert.equal(reads, 2);

        const referenceApi = loadModule({
            problemGet: async () => ({ ...access, reference: { domainId: 'private', pid: 77 } }),
            storageGet: async () => { throw new Error('must not read referenced data'); },
        });
        const referenced = await referenceApi.loadRecordTestcaseData(
            viewer({ perm: common.PERM.PERM_READ_PROBLEM_DATA }), 'cpp', 12, [{ subtaskId: 2, id: 4 }],
        );
        assert.deepEqual(Object.keys(referenced), []);
    });

    it('loads config.ini after authorization and maps its nonstandard filenames', async () => {
        const { access, data } = fixtures({
            data: {
                config: '',
                data: [
                    { name: 'config.ini', size: 55 },
                    { name: 'legacy-input.data', size: 3 },
                    { name: 'legacy-answer.data', size: 3 },
                ],
            },
        });
        const opened = [];
        const ini = '1\nlegacy-input.data|legacy-answer.data|1|100|65536';
        data.data[0].size = Buffer.byteLength(ini);
        const api = loadModule({
            problemGet: async (domainId, pid, projection) => projection.includes('config') ? data : access,
            storageGet: async (target) => {
                opened.push(target);
                if (target.endsWith('config.ini')) return Readable.from(ini);
                return Readable.from(target.endsWith('legacy-input.data') ? 'in\n' : 'ok\n');
            },
        });
        const result = await api.loadRecordTestcaseData(
            viewer({ perm: common.PERM.PERM_READ_PROBLEM_DATA }),
            'cpp', 12, [{ subtaskId: 1, id: 1 }],
        );
        assert.equal(result['1']['1'].input.content, 'in\n');
        assert.equal(result['1']['1'].output.content, 'ok\n');
        assert.deepEqual(opened, [
            'problem/cpp/12/testdata/config.ini',
            'problem/cpp/12/testdata/legacy-input.data',
            'problem/cpp/12/testdata/legacy-answer.data',
        ]);
    });

    it('previews at most 200 requested cases and 400 unique testcase files', async () => {
        const { access } = fixtures();
        const cases = Array.from({ length: 250 }, (_, index) => ({
            id: index + 1,
            input: `case-${index + 1}.in`,
            output: `case-${index + 1}.out`,
        }));
        const data = {
            domainId: 'cpp',
            docId: 12,
            config: { subtasks: [{ id: 1, type: 'sum', cases }] },
            data: cases.flatMap((item) => [
                { name: item.input, size: 1 },
                { name: item.output, size: 1 },
            ]),
        };
        let storageReads = 0;
        const api = loadModule({
            problemGet: async (domainId, pid, projection) => projection.includes('config') ? data : access,
            storageGet: async () => {
                storageReads++;
                return Readable.from('x');
            },
        });
        const requested = cases.map(({ id }) => ({ subtaskId: 1, id }));
        const result = await api.loadRecordTestcaseData(
            viewer({ perm: common.PERM.PERM_READ_PROBLEM_DATA }), 'cpp', 12, requested,
        );
        assert.equal(Object.keys(result['1']).length, 200);
        assert.equal(result['1']['201'], undefined);
        assert.equal(storageReads, 400);
    });

    it('bounds repeated rendered previews as well as unique storage reads', async () => {
        const { access } = fixtures();
        const data = {
            domainId: 'cpp', docId: 12,
            config: { subtasks: [{ id: 1, cases: Array.from({ length: 200 }, (_, index) => ({
                id: index + 1, input: 'shared.in', output: 'shared.out',
            })) }] },
            data: [{ name: 'shared.in', size: 128 * 1024 }, { name: 'shared.out', size: 128 * 1024 }],
        };
        let reads = 0;
        const api = loadModule({
            problemGet: async (domainId, pid, projection) => projection.includes('config') ? data : access,
            storageGet: async () => { reads++; return Readable.from(Buffer.alloc(128 * 1024, 97)); },
        });
        const result = await api.loadRecordTestcaseData(
            viewer({ perm: common.PERM.PERM_READ_PROBLEM_DATA }), 'cpp', 12,
        );
        const renderedBytes = Object.values(result['1']).reduce((total, value) => total
            + Buffer.byteLength(value.input.content) + Buffer.byteLength(value.output.content), 0);
        assert.equal(reads, 2);
        assert.equal(renderedBytes, 1024 * 1024);
        assert.equal(result['1']['200'].input.content, '');
        assert.equal(result['1']['200'].input.truncated, true);
        assert.equal(result['1']['1'].input.content.length, 128 * 1024);
    });

    it('prepares configured cases before live results arrive', async () => {
        const { access, data } = fixtures();
        const api = loadModule({
            problemGet: async (domainId, pid, projection) => projection.includes('config') ? data : access,
            storageGet: async (target) => Readable.from(target.endsWith('case.in') ? 'input' : 'answer'),
        });
        const result = await api.loadRecordTestcaseData(
            viewer({ perm: common.PERM.PERM_READ_PROBLEM_DATA }), 'cpp', 12,
        );
        assert.equal(result['2']['4'].input.content, 'input');
        assert.equal(result['2']['4'].output.content, 'answer');
    });

    it('loads configured previews for the websocket instead of only the initial partial results', () => {
        const handlerSource = fs.readFileSync(path.join(
            __dirname, '../packages/hydrooj/src/handler/record.ts',
        ), 'utf8');
        const websocketClass = handlerSource.slice(handlerSource.indexOf('export class RecordDetailConnectionHandler'));
        assert.match(
            websocketClass,
            /loadRecordTestcaseData\(this\.user, rdoc\.domainId, rdoc\.pid\)/,
        );
    });
});
