const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
function setup(initial) {
    let rows = initial;
    let queries = 0;
    let delay;
    const dependencies = {
        '../model/builtin': { LEVELS: [100, 50, 10] },
        './domain_type': { getOjDomainQuery: () => ({ domainType: { $ne: 'scratch' } }) },
        '../model/domain': {
            getMulti: () => ({ project: () => ({ toArray: async () => [{ _id: 'cpp' }, { _id: 'python' }] }) }),
            collUser: { find: () => ({ project: () => ({ toArray: async () => {
                queries++;
                const snapshot = JSON.parse(JSON.stringify(rows));
                if (delay) { const current = delay; delay = null; await current; }
                return snapshot;
            } }) }) },
        },
    };
    const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/lib/shared_ranking.ts'), 'utf8');
    const mod = { exports: {} };
    vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
        module: mod, exports: mod.exports, require: (name) => dependencies[name],
    });
    return { ...mod.exports, setRows: (next) => { rows = next; }, delayNext: (promise) => { delay = promise; }, queries: () => queries };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

describe('shared ranking freshness and migration', () => {
    it('keeps legacy students visible when only another student has migrated', async () => {
        const ranking = setup([
            { uid: 11, rp: 30, sharedRp: 45, sharedRpInfo: { problem: 45 }, nAccept: 1 },
            { uid: 11, rp: 90, nAccept: 2 },
            { uid: 12, rp: 60, rpInfo: { problem: 60 }, nAccept: 3 },
            { uid: 12, rp: 20, nAccept: 1 },
        ]);
        const rows = plain(await ranking.getSharedRankingSnapshot());
        assert.deepEqual(rows.map((row) => [row.uid, row.totalRp, row.totalAccept]), [[12, 60, 4], [11, 45, 3]]);
    });
    it('deduplicates a burst of clients on the same generation', async () => {
        const ranking = setup([{ uid: 11, rp: 35 }]);
        await Promise.all(Array.from({ length: 20 }, () => ranking.getSharedRankingSnapshot()));
        assert.equal(ranking.queries(), 1);
    });
    it('never returns or caches an old in-flight snapshot after an AC invalidation', async () => {
        const ranking = setup([{ uid: 11, rp: 35 }]);
        let release;
        ranking.delayNext(new Promise((resolve) => { release = resolve; }));
        const before = ranking.getSharedRankingSnapshot();
        await new Promise((resolve) => setImmediate(resolve));
        ranking.setRows([{ uid: 11, rp: 55 }]); ranking.invalidateSharedRankingSnapshot();
        const after = ranking.getSharedRankingSnapshot();
        release();
        assert.equal((await before)[0].totalRp, 55);
        assert.equal((await after)[0].totalRp, 55);
        assert.equal((await ranking.getSharedRankingSnapshot())[0].totalRp, 55);
        assert.equal(ranking.queries(), 2);
    });
});
