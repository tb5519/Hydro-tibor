const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const PERM = { PERM_VIEW: 1n, PERM_VIEW_PROBLEM: 2n, PERM_VIEW_PROBLEM_HIDDEN: 4n, PERM_ALL: 7n };
const PRIV = { PRIV_VIEW_ALL_DOMAIN: 1 };
const plain = (value) => JSON.parse(JSON.stringify(value, (key, item) => (typeof item === 'bigint' ? item.toString() : item)));
const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/lib/profile_statistics.ts'), 'utf8');
const makeUser = (id, fields = {}, permissions = 3n) => ({
    _id: id, scope: 7n, priv: 0,
    rp: 999, rank: 77, nAccept: 88, nSubmit: 99, nLiked: 7, level: 8, rpInfo: { problem: 999 },
    hasPerm(permission) { return (permissions & this.scope & permission) === permission; },
    hasPriv(privilege) { return (this.priv & privilege) === privilege; },
    ...fields,
});

function setup({
    domains = [{ _id: 'cpp' }, { _id: 'python' }, { _id: 'scratch', domainType: 'scratch' }],
    memberships = [], rows = [], statuses = {}, problems = {}, permissions = {},
    workspaceEnabled = false, assignedWorkspaces = [],
} = {}) {
    const calls = { domains: 0, snapshots: 0, memberQueries: [], permissions: [], statuses: [], lists: [] };
    const dependencies = {
        '../model/builtin': { PERM, PRIV, STATUS: { STATUS_ACCEPTED: 1 } },
        '../model/domain': {
            getMulti(query) {
                calls.domains++;
                assert.equal(query.domainType.$ne, 'scratch');
                return { project: () => ({ toArray: async () => domains.filter((domain) => domain.domainType !== 'scratch') }) };
            },
            collUser: {
                find(query) {
                    calls.memberQueries.push(plain(query));
                    return { project: () => ({ toArray: async () => memberships.filter((member) => (
                        query.domainId.$in.includes(member.domainId) && member.uid === query.uid && member.join === true
                    )) }) };
                },
            },
            async getDomainUser(domainId) {
                calls.permissions.push(domainId);
                return { perm: 3n, join: true, ...permissions[domainId] };
            },
        },
        '../model/problem': {
            PROJECTION_LIST: ['domainId', 'docId', 'difficulty', 'hidden', 'owner'],
            getMultiStatus(domainId, query) {
                calls.statuses.push({ domainId, query: plain(query) });
                assert.equal(query.status, 1);
                return { toArray: async () => (statuses[domainId] || []).filter((status) => status.uid === query.uid && status.status === 1) };
            },
            async getList(domainId, ids, hidden, doThrow, projection, byId) {
                calls.lists.push({ domainId, ids: [...ids], hidden, doThrow, projection: [...projection], byId });
                return Object.fromEntries((problems[domainId] || []).filter((problem) => (
                    ids.includes(problem.docId) && !problem.objectiveKind
                    && (!problem.hidden || hidden === true || problem.owner === hidden)
                )).map((problem) => [problem.docId, { ...problem, domainId }]));
            },
        },
        '../model/workspace': {
            isEnabled: () => workspaceEnabled,
            isPlatformAdmin: () => false,
            getAssignedWorkspaceIds: async () => assignedWorkspaces,
            resolveDomainWorkspaceId: (domain) => domain.workspaceId || 'legacy',
            LEGACY_WORKSPACE_ID: 'legacy',
        },
        './domain_ranking': { getDomainRankingMode: (domain) => domain.domainType !== 'scratch' && domain.rankingMode === 'all' ? 'all' : 'single' },
        './domain_type': { getOjDomainQuery: () => ({ domainType: { $ne: 'scratch' } }) },
        './shared_ranking': { getSharedRankingSnapshot: async () => { calls.snapshots++; return rows; } },
    };
    const mod = { exports: {} };
    vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
        module: mod, exports: mod.exports, require: (name) => {
            assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
            return dependencies[name];
        },
    });
    return { ...mod.exports, calls };
}

describe('personal statistics follow the classroom ranking scope', () => {
    it('keeps single-domain totals, permissions and accepted problem scope unchanged', async () => {
        const profile = setup({
            statuses: { cpp: [{ uid: 10, docId: 1, status: 1 }, { uid: 10, docId: 2, status: 1 }] },
            problems: { cpp: [{ docId: 1, owner: 8 }, { docId: 2, owner: 8, hidden: true }] },
        });
        const target = makeUser(10);
        const result = plain(await profile.getProfileStatistics({ _id: 'cpp' }, makeUser(8), target));
        assert.equal(result.rankingMode, 'single');
        assert.deepEqual(result.stats, { rp: 999, rank: 77, nAccept: 88, nSubmit: 99, nLiked: 7, level: 8, rpInfo: { problem: 999 } });
        assert.deepEqual(result.acceptedProblems.map((problem) => problem.docId), [1, 2]);
        assert.equal(profile.calls.domains, 0);
        assert.equal(profile.calls.snapshots, 0);
        assert.deepEqual(profile.calls.permissions, []);
        result.stats.rpInfo.problem = 0;
        assert.equal(target.rpInfo.problem, 999);
    });

    it('uses the shared ranking row and sums solution likes from joined OJ memberships only', async () => {
        const row = { uid: 10, totalRp: 321.5, rank: 3, totalAccept: 12, totalSubmit: 21, level: 4, rpInfo: { problem: 300, contest: 21.5 } };
        const profile = setup({
            rows: [row],
            memberships: [
                { domainId: 'cpp', uid: 10, join: true, nAccept: 7, nSubmit: 11, nLiked: 2 },
                { domainId: 'python', uid: 10, join: true, nAccept: 5, nSubmit: 10, nLiked: 4 },
                { domainId: 'scratch', uid: 10, join: true, nAccept: 900, nSubmit: 1000, nLiked: 100 },
                { domainId: 'python', uid: 11, join: true, nLiked: 500 },
                { domainId: 'other', uid: 10, join: false, nLiked: 500 },
            ],
            statuses: {
                cpp: [{ uid: 10, docId: 1, status: 1 }, { uid: 10, docId: 1, status: 1 }],
                python: [{ uid: 10, docId: 1, status: 1 }],
            },
            problems: { cpp: [{ docId: 1, difficulty: 2 }], python: [{ docId: 1, difficulty: 8 }] },
        });
        const target = makeUser(10);
        const before = plain(target);
        const result = plain(await profile.getProfileStatistics({ _id: 'cpp', rankingMode: 'all' }, makeUser(8), target));
        assert.equal(result.rankingMode, 'all');
        assert.deepEqual(result.stats, { rp: 321.5, rank: 3, nAccept: 12, nSubmit: 21, nLiked: 6, level: 4, rpInfo: row.rpInfo });
        assert.deepEqual(result.acceptedProblems.map((problem) => [problem.domainId, problem.docId]), [['cpp', 1], ['python', 1]]);
        assert.deepEqual(profile.calls.lists.map((call) => call.ids), [[1], [1]]);
        assert.deepEqual(plain(target), before);
        assert.equal(profile.calls.snapshots, 1);
    });

    it('does not leak another domain hidden questions through the current teacher role', async () => {
        const profile = setup({
            memberships: [{ domainId: 'cpp', uid: 10, join: true }, { domainId: 'python', uid: 10, join: true }],
            statuses: { cpp: [{ uid: 10, docId: 1, status: 1 }], python: [1, 2, 3].map((docId) => ({ uid: 10, docId, status: 1 })) },
            problems: {
                cpp: [{ docId: 1, owner: 99, hidden: true }],
                python: [{ docId: 1, owner: 99, hidden: true }, { docId: 2, owner: 8, hidden: true }, { docId: 3, owner: 99 }],
            },
            permissions: { python: { perm: 3n } },
        });
        const result = plain(await profile.getProfileStatistics({ _id: 'cpp', rankingMode: 'all' }, makeUser(8, {}, 7n), makeUser(10)));
        assert.deepEqual(result.acceptedProblems.map((problem) => [problem.domainId, problem.docId]), [['cpp', 1], ['python', 2], ['python', 3]]);
        assert.equal(profile.calls.lists.find((call) => call.domainId === 'python').hidden, 8);
    });

    it('honors source-domain hidden permission when it is genuinely present', async () => {
        const profile = setup({
            memberships: [{ domainId: 'python', uid: 10, join: true }],
            statuses: { python: [{ uid: 10, docId: 1, status: 1 }] },
            problems: { python: [{ docId: 1, owner: 99, hidden: true }] },
            permissions: { python: { perm: 7n } },
        });
        const result = await profile.getProfileStatistics({ _id: 'cpp', rankingMode: 'all' }, makeUser(8), makeUser(10));
        assert.equal(result.acceptedProblems.length, 1);
        assert.equal(profile.calls.lists[0].hidden, true);
    });

    it('checks source-domain view and problem permissions and the visitor scope', async () => {
        for (const [permission, scope] of [[2n, 7n], [1n, 7n], [7n, 1n]]) {
            const profile = setup({
                memberships: [{ domainId: 'python', uid: 10, join: true }],
                permissions: { python: { perm: permission } },
            });
            const result = await profile.getProfileStatistics({ _id: 'cpp', rankingMode: 'all' }, makeUser(8, { scope }), makeUser(10));
            assert.equal(result.acceptedProblems.length, 0);
            assert.deepEqual(profile.calls.statuses, []);
        }
    });

    it('does not query accepted statuses from target memberships that were removed', async () => {
        const profile = setup({ memberships: [{ domainId: 'python', uid: 10, join: false }] });
        const result = await profile.getProfileStatistics({ _id: 'cpp', rankingMode: 'all' }, makeUser(8), makeUser(10));
        assert.equal(result.acceptedProblems.length, 0);
        assert.equal(result.stats.nAccept, 0);
        assert.deepEqual(profile.calls.permissions, []);
        assert.deepEqual(profile.calls.statuses, []);
    });

    it('does not expose documents to a viewer removed by student management', async () => {
        const profile = setup({
            memberships: [{ domainId: 'python', uid: 10, join: true }],
            permissions: { python: { perm: 7n, join: false, blockedByStudentManagement: true } },
        });
        const result = await profile.getProfileStatistics({ _id: 'cpp', rankingMode: 'all' }, makeUser(8), makeUser(10));
        assert.equal(result.acceptedProblems.length, 0);
        assert.deepEqual(profile.calls.statuses, []);
    });

    it('keeps teacher-workspace boundaries when reading source documents', async () => {
        const profile = setup({
            domains: [{ _id: 'cpp' }, { _id: 'python', workspaceId: 'another-teacher' }],
            memberships: [{ domainId: 'python', uid: 10, join: true, nAccept: 3 }],
            workspaceEnabled: true,
        });
        const result = await profile.getProfileStatistics({ _id: 'cpp', rankingMode: 'all' }, makeUser(8), makeUser(10));
        assert.equal(result.stats.nAccept, 3);
        assert.equal(result.acceptedProblems.length, 0);
        assert.deepEqual(profile.calls.permissions, []);
    });

    it('keeps zero-RP global users unranked and ignores stale local totals', async () => {
        const profile = setup({
            memberships: [
                { domainId: 'cpp', uid: 10, join: true, sharedRp: 0, rp: 150, nAccept: 3, nSubmit: 4, nLiked: 1 },
                { domainId: 'python', uid: 10, join: true, rp: 900, nAccept: 5, nSubmit: 6, nLiked: 2 },
            ],
        });
        const result = plain(await profile.getProfileStatistics({ _id: 'cpp', rankingMode: 'all' }, makeUser(8), makeUser(10)));
        assert.deepEqual(result.stats, { rp: 0, rank: null, nAccept: 8, nSubmit: 10, nLiked: 3, level: 0, rpInfo: {} });
    });

    it('uses one shared RP value for a non-ranking account instead of adding copies', async () => {
        const profile = setup({
            memberships: [
                { domainId: 'cpp', uid: 1, join: true, sharedRp: 55, sharedRpInfo: { problem: 55 }, rp: 500 },
                { domainId: 'python', uid: 1, join: true, sharedRp: 55, rp: 900 },
            ],
        });
        const result = plain(await profile.getProfileStatistics({ _id: 'cpp', rankingMode: 'all' }, makeUser(1), makeUser(1)));
        assert.equal(result.stats.rp, 55);
        assert.deepEqual(result.stats.rpInfo, { problem: 55 });
        assert.equal(result.stats.rank, null);
    });

    it('preserves ranking legacy fallback as max local RP, never a sum', async () => {
        const profile = setup({
            memberships: [
                { domainId: 'cpp', uid: 1, join: true, rp: 55, rpInfo: { problem: 55 } },
                { domainId: 'python', uid: 1, join: true, rp: 90, rpInfo: { problem: 90 } },
            ],
        });
        const result = plain(await profile.getProfileStatistics({ _id: 'cpp', rankingMode: 'all' }, makeUser(1), makeUser(1)));
        assert.equal(result.stats.rp, 90);
        assert.deepEqual(result.stats.rpInfo, { problem: 90 });
    });

    it('does not apply the OJ shared ranking to a Scratch profile', async () => {
        const profile = setup();
        const result = await profile.getProfileStatistics({ _id: 'scratch', domainType: 'scratch', rankingMode: 'all' }, makeUser(8), makeUser(10));
        assert.equal(result.rankingMode, 'single');
        assert.equal(profile.calls.snapshots, 0);
        assert.equal(result.stats.rp, 999);
    });

    it('works for a homepage self-profile and excludes objective source teaching material', async () => {
        const profile = setup({
            memberships: [{ domainId: 'cpp', uid: 10, join: true }],
            statuses: { cpp: [{ uid: 10, docId: 1, status: 1 }, { uid: 10, docId: 2, status: 1 }, { uid: 10, docId: 3, status: 2 }] },
            problems: { cpp: [{ docId: 1, difficulty: 8 }, { docId: 2, difficulty: 9, objectiveKind: 'source' }, { docId: 3, difficulty: 10 }] },
        });
        const self = makeUser(10);
        const result = plain(await profile.getProfileStatistics({ _id: 'cpp', rankingMode: 'all' }, self, self));
        assert.deepEqual(result.acceptedProblems.map((problem) => problem.docId), [1]);
    });
});
