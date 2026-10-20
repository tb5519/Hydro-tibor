const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const source = fs.readFileSync('packages/hydrooj/src/handler/domain.ts', 'utf8');
const fn = source.slice(source.indexOf('export async function getRankingPage'), source.indexOf('\nclass DomainRankHandler'));
function fixture(shared = false) {
    const queries = []; const badges = [];
    const sourceUser = { _id: 42, uname: 'Student', rp: 1, hasPriv() { return true; } };
    const membership = { uid: 42, rp: 111, nAccept: 8, nSubmit: 15, rank: 2, level: 5, rpInfo: { problem: 106, delta: 5 } };
    const domain = {
        getMultiUserInDomain(domainId, filter) {
            const query = { domainId, filter }; queries.push(query);
            return { sort(value) { query.sort = value; return this; }, skip(value) { query.skip = value; return this; },
                limit(value) { query.limit = value; return this; }, async toArray() { return [membership]; } };
        }, collUser: { countDocuments: async (filter) => { queries.push({ count: filter }); return 101; },
            findOne: async (filter) => { queries.push({ current: filter }); return membership; } },
    };
    const handler = { user: { ...sourceUser, rp: 0 }, ctx: {}, domain: { _id: 'cpp' } };
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fn, { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, domain,
        getDomainRankingMode: () => shared ? 'all' : 'single',
        getSharedRankingRows: async () => ({ udocs: [{ ...sourceUser, rp: 222 }], ucount: 30, upcount: 3, currentUser: { ...sourceUser, rp: 223 } }),
        user: { getList: async () => ({ 42: sourceUser }) },
        cloneUserForDisplay: (value) => value && Object.assign(Object.create(Object.getPrototypeOf(value)), value),
        workspace: { resolveDomainWorkspaceId: () => 'legacy', LEGACY_WORKSPACE_ID: 'legacy' },
        attachOwnedBadges: async (_ctx, users, domain, scope) => badges.push({ users, domain, scope }),
    });
    return { run: (page, limit) => module.exports.getRankingPage(handler, 'cpp', page, limit), queries, badges, handler, sourceUser };
}
it('local ranking uses only persisted membership aggregates, keeps fresh current-user counters and deterministic ordering', async () => {
    const f = fixture(); const result = await f.run(2, 50);
    assert.equal(result.udocs[0].rp, 111); assert.equal(result.udocs[0].nAccept, 8);
    assert.equal(result.upcount, 3); assert.equal(result.ucount, 101);
    assert.equal(f.handler.user.rp, 111); assert.equal(f.handler.user.rank, 2);
    assert.equal(f.sourceUser.rp, 1, 'does not mutate a cached user instance');
    assert.equal(f.queries[0].skip, 50); assert.equal(f.queries[0].limit, 50);
    assert.deepEqual(JSON.parse(JSON.stringify(f.queries[0].sort)), { rp: -1, nAccept: -1, nSubmit: 1, uid: 1 });
    assert.equal(f.queries[0].filter.join, true); assert.equal(f.badges[0].users.length, 2);
});
it('shared ranking uses the same snapshot for both table and current user without exposing another user object in the payload', async () => {
    const f = fixture(true); const result = await f.run(1, 10);
    assert.equal(result.udocs[0].rp, 222); assert.equal(f.handler.user.rp, 223);
    assert.equal(result.currentUser, undefined); assert.equal(result.rankingMode, 'all'); assert.equal(f.queries.length, 0);
});
