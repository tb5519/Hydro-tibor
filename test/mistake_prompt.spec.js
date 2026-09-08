const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { ObjectId } = require('mongodb');

const root = path.resolve(__dirname, '..');
const AC = 1;
const WA = 2;
const CE = 7;
const PRETEST = '000000000000000000000000';
const GENERATE = '000000000000000000000001';
function record(index, status, extra = {}) {
    return {
        _id: new ObjectId(`66e00000${index.toString(16).padStart(16, '0')}`),
        status, uid: 12, pid: 1000, domainId: 'class-a', ...extra,
    };
}

function loadState(records) {
    const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/mistake_prompt.ts'), 'utf8');
    const module = { exports: {} };
    const model = {
        RECORD_PRETEST: PRETEST,
        RECORD_GENERATE: GENERATE,
        getMulti(domainId, query) {
            const filtered = records.filter((r) => r.domainId === domainId && r.uid === query.uid && r.pid === query.pid
                && query.status.$in.includes(r.status) && !Object.hasOwn(r, 'input')
                && !query.contest.$nin.includes(r.contest?.toString()));
            const cursor = {
                project() { return cursor; },
                sort(order) {
                    filtered.sort((a, b) => order._id * a._id.toString().localeCompare(b._id.toString()));
                    return cursor;
                },
                limit() { return cursor; },
                async next() { return filtered[0] || null; },
            };
            return cursor;
        },
    };
    vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports,
        require(name) {
            if (name === '../model/builtin') return { NORMAL_STATUS: [AC, WA, 3, 4, 5, 6, CE], STATUS: { STATUS_ACCEPTED: AC } };
            if (name === '../model/record') return model;
            throw new Error(`Unexpected import ${name}`);
        },
    });
    return module.exports.getMistakePromptState('class-a', 12, 1000);
}

describe('mistake prompt formal submission history', () => {
    it('stays hidden for no submissions, failed submissions and first-try AC', async () => {
        await Promise.all([[], [record(1, WA)], [record(1, AC)], [record(1, AC), record(2, AC)]].map(async (records) => {
            assert.equal((await loadState(records)).eligible, false);
        }));
    });
    it('appears after a second or later submission is accepted, including a compile-error retry', async () => {
        await Promise.all([
            [record(1, WA), record(2, AC)],
            [record(1, CE), record(2, AC)],
            [record(1, WA), record(2, WA), record(3, AC)],
        ].map(async (records) => {
            const state = await loadState(records);
            assert.equal(state.eligible, true);
            assert.equal(state.latestRid, records.at(-1)._id.toString());
        }));
    });
    it('never changes a first-try AC into a mistake because of later failed retries', async () => {
        assert.equal((await loadState([record(1, AC), record(2, WA), record(3, AC)])).eligible, false);
        assert.equal((await loadState([record(1, WA), record(2, AC), record(3, WA)])).eligible, false);
    });
    it('excludes input tests, special records, other users, problems, domains and system errors', async () => {
        const excluded = [
            { input: '' }, { contest: new ObjectId(PRETEST) }, { contest: new ObjectId(GENERATE) },
            { uid: 13 }, { pid: 1001 }, { domainId: 'class-b' }, { status: 8 }, { status: 0 },
        ];
        await Promise.all(excluded.map(async (extra) => {
            assert.equal((await loadState([record(1, WA, extra), record(2, AC)])).eligible, false);
        }));
    });
    it('counts real competition submissions and queries by chronological order', async () => {
        assert.equal((await loadState([
            record(2, AC), record(1, WA, { contest: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa') }),
        ])).eligible, true);
    });
});

describe('live mistake prompt', () => {
    const source = fs.readFileSync(path.join(root, 'packages/ui-default/pages/problem_detail.page.tsx'), 'utf8');
    const start = source.indexOf('  async function maybeRevealMistakePrompt(');
    const end = source.indexOf('  function getRecordDetailConnUrl(', start);
    function harness(response = { showMistakePrompt: true }) {
        let calls = 0;
        let reveals = 0;
        let records = [];
        const context = {
            UiContext: { isMistakeSupported: true, canUseMistake: true, mistakePromptUrl: '/p/1000' },
            $: () => ({ length: 1, hasClass: () => true, attr: () => '' }),
            STATUS: { STATUS_ACCEPTED: AC },
            normalStatuses: new Set([AC, WA, 3, 4, 5, 6, CE]),
            mistakePromptChecks: new Set(),
            getKnownFormalRecords: () => records,
            getRecordId: (r) => r._id,
            isFormalRecord: (r) => r.formal,
            isCurrentFormalSubmitRecord: (store, r) => r.current,
            revealMistakePrompt: () => { reveals++; },
            request: { async post() { calls++; return response; } },
            console,
        };
        vm.createContext(context);
        vm.runInContext(transformSync(source.slice(start, end), { loader: 'tsx' }).code, context);
        return {
            check: (r) => context.maybeRevealMistakePrompt({}, r),
            setRecords: (items) => { records = items; },
            counts: () => ({ calls, reveals }),
        };
    }
    it('asks the server once for the current formal AC and respects its answer', async () => {
        await Promise.all([true, false].map(async (eligible) => {
            const h = harness({ showMistakePrompt: eligible });
            const accepted = { _id: 'a', status: AC, formal: true, current: true };
            await Promise.all([h.check(accepted), h.check(accepted)]);
            assert.deepEqual(h.counts(), { calls: 1, reveals: eligible ? 1 : 0 });
        }));
    });
    it('does not trigger for old results, test runs, or non-AC results', async () => {
        const h = harness();
        await Promise.all([{ status: WA }, { formal: false }, { current: false }].map((extra) =>
            h.check({ _id: 'a', status: AC, formal: true, current: true, ...extra })));
        assert.deepEqual(h.counts(), { calls: 0, reveals: 0 });
    });
    it('rechecks the accepted retry when an earlier attempt finishes late', async () => {
        const response = { showMistakePrompt: false };
        const h = harness(response);
        const accepted = { _id: 'b', status: AC, formal: true, current: true };
        h.setRecords([accepted]);
        await h.check(accepted);
        assert.deepEqual(h.counts(), { calls: 1, reveals: 0 });

        response.showMistakePrompt = true;
        const earlierFailure = { _id: 'a', status: WA, formal: true, current: true };
        // The pushed record can arrive before the Redux store contains it.
        await h.check(earlierFailure);
        assert.deepEqual(h.counts(), { calls: 2, reveals: 1 });
        h.setRecords([accepted, earlierFailure]);
        await h.check(earlierFailure);
        await h.check(accepted);
        assert.deepEqual(h.counts(), { calls: 2, reveals: 1 });
    });
    it('removes the old DOM scan which could count test-run rows as mistakes', () => {
        const template = fs.readFileSync(path.join(root, 'packages/ui-default/templates/problem_detail.html'), 'utf8');
        assert.doesNotMatch(template, /scanScratchpadRecords|sawWrongRecord|MISTAKE_PROMPT_INLINE/);
    });
});
