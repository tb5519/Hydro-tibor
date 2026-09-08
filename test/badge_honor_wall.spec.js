const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { describe, it } = require('node:test');

const PRIV = { PRIV_USER_PROFILE: 1, PRIV_EDIT_SYSTEM: 2, PRIV_JUDGE: 4, PRIV_MANAGE_ALL_DOMAIN: 8 };
const workspaceStub = {
    LEGACY_WORKSPACE_ID: 'tang',
    resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang',
    async getMembers(id) { return [{ uid: id === 'tang' ? 2 : 3 }]; },
    async getExcludedLegacyUids() { return new Set([90]); },
};
let honor;
const originalLoad = Module._load;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/badge_honor_wall.ts')) {
            if (request === '../model/builtin') return { PRIV };
            if (request === '../model/workspace') return workspaceStub;
            if (request === './avatar') return (value, size) => `/avatar/${value || 'default'}?size=${size}`;
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    honor = require('../packages/hydrooj/src/lib/badge_honor_wall');
} finally {
    Module._load = originalLoad;
}

const now = new Date('2026-09-08T12:00:00Z');
const future = new Date('2026-09-09T12:00:00Z');
const past = new Date('2026-09-07T12:00:00Z');
const badge = (id, extra = {}) => ({ _id: id, short: `徽章 ${id}`, users: [], createAt: past, ...extra });
const account = (id, extra = {}) => ({ _id: id, uname: `学员 ${id}`, priv: 1, ...extra });

function matches(doc, query) {
    return Object.entries(query).every(([key, condition]) => {
        const value = doc[key];
        if (!condition || typeof condition !== 'object' || condition instanceof Date) return value === condition;
        return Object.entries(condition).every(([operator, operand]) => {
            if (operator === '$in') return operand.includes(value);
            if (operator === '$gt') return value > operand;
            if (operator === '$ne') return value !== operand;
            if (operator === '$exists') return Object.hasOwn(doc, key) === operand;
            throw new Error(`Unexpected query operator ${operator}`);
        });
    });
}

function context(fixtures) {
    const queries = [];
    return {
        queries,
        db: {
            collection(name) {
                return {
                    find(query) {
                        queries.push({ name, query });
                        const rows = (fixtures[name] || []).filter((doc) => matches(doc, query));
                        return {
                            project(projection) {
                                queries[queries.length - 1].projection = projection;
                                return { async toArray() {
                                    return rows.map((doc) => Object.fromEntries(Object.keys(projection)
                                        .filter((key) => Object.hasOwn(doc, key)).map((key) => [key, doc[key]])));
                                } };
                            },
                        };
                    },
                    async distinct(field, query) {
                        queries.push({ name, query });
                        return [...new Set((fixtures[name] || []).filter((doc) => matches(doc, query)).map((doc) => doc[field]))];
                    },
                };
            },
        },
    };
}

describe('honor wall effective ownership', () => {
    it('includes active timed, permanent manual, and standalone non-lottery ownership, deduplicated', () => {
        const badges = [badge(1), badge(2, { users: [11] }), badge(3)];
        const rows = [
            { owner: 10, badgeId: 1 }, { owner: 10, badgeId: 1 },
            { owner: 11, badgeId: 2 }, { owner: 12, badgeId: 3 },
        ];
        const grants = [{ uid: 10, badgeId: 1, expiresAt: future }, { uid: 11, badgeId: 2, expiresAt: past }];
        const owners = honor.getEffectiveHonorWallOwners(rows, badges, grants, now);
        assert.deepEqual([...owners].map(([id, users]) => [id, [...users]]), [[1, [10]], [2, [11]], [3, [12]]]);
    });

    it('omits elapsed, exact-deadline, marked expired, and deleted badge rows before cleanup runs', () => {
        const rows = [1, 2, 3, 4].map((badgeId) => ({ owner: 10, badgeId }));
        const grants = [
            { uid: 10, badgeId: 1, expiresAt: past },
            { uid: 10, badgeId: 2, expiresAt: now },
            { uid: 10, badgeId: 3, expiredAt: past, expiresAt: future },
        ];
        assert.equal(honor.getEffectiveHonorWallOwners(rows, [badge(1), badge(2), badge(3)], grants, now).size, 0);
    });

    it('shows only current upgrade state, not historic or old awarded states', () => {
        const rows = [1, 2, 3].map((badgeId) => ({ owner: 10, badgeId }));
        const grants = [{
            uid: 10, badgeId: 3, sourceBadgeId: 1, repeatEffect: 'upgrade', expiresAt: future,
            lotteryBadgeIds: [3], awardedBadgeIds: [1, 2, 3], stateHistory: [{ badgeId: 1 }, { badgeId: 2 }],
        }];
        const owners = honor.getEffectiveHonorWallOwners(rows, [badge(1), badge(2), badge(3)], grants, now);
        assert.deepEqual([...owners.keys()], [3]);
    });

    it('keeps an independent active duration entitlement after another chain upgrades away', () => {
        const rows = [{ owner: 10, badgeId: 1 }, { owner: 10, badgeId: 2 }];
        const grants = [
            { uid: 10, badgeId: 2, sourceBadgeId: 1, repeatEffect: 'upgrade', stateHistory: [{ badgeId: 1 }] },
            { uid: 10, badgeId: 1, repeatEffect: 'duration', expiresAt: future },
        ];
        assert.deepEqual([...honor.getEffectiveHonorWallOwners(rows, [badge(1), badge(2)], grants, now).keys()], [1, 2]);
    });

    it('uses the newest active upgrade grant if a legacy duplicate remains', () => {
        const rows = [1, 2, 3].map((badgeId) => ({ owner: 10, badgeId }));
        const grants = [
            { _id: 'old', uid: 10, badgeId: 2, sourceBadgeId: 1, repeatEffect: 'upgrade', grantedAt: past },
            { _id: 'new', uid: 10, badgeId: 3, sourceBadgeId: 1, repeatEffect: 'upgrade', grantedAt: now },
        ];
        assert.deepEqual([...honor.getEffectiveHonorWallOwners(rows, [badge(1), badge(2), badge(3)], grants, now).keys()], [3]);
    });
});

describe('honor wall scope, public data, and ordering', () => {
    it('keeps Tang badges global but excludes modern workspace accounts, staff, admins, judges, and banned users', async () => {
        const uids = [1, 2, 10, 11, 12, 13, 90];
        const ctx = context({
            badge: [badge(1, { acImagePath: 'private-storage-path.png', acImageUpdatedAt: '2026-09-08T12:00:00Z' }),
                badge(2), badge(3, { domainId: 'other' })],
            userBadge: uids.map((owner) => ({ owner, badgeId: 1 })).concat([{ owner: 10, badgeId: 3, domainId: 'other' }]),
            user: [account(1), account(2), account(10, { displayName: '秘密真名', mail: 'private@example.test', avatar: 'public-avatar' }),
                account(11, { priv: 3 }), account(12, { priv: 5 }), account(13, { priv: 0 }), account(90)],
        });
        const result = await honor.getBadgeHonorWall(ctx, { _id: 'Python' }, now);
        assert.deepEqual(result.badges.map((item) => item.id), [1]);
        assert.deepEqual(result.badges[0].students, [{
            uid: 10, displayName: '学员 10', avatar: '/avatar/public-avatar?size=64', href: '/d/Python/user/10',
        }]);
        assert.equal(result.badges[0].acImage, '/d/Python/badge/1/ac-image?v=2026-09-08T12%3A00%3A00Z');
        assert.equal(JSON.stringify(result).includes('private'), false);
        assert.equal(JSON.stringify(result).includes('秘密'), false);
        for (const query of ctx.queries.filter((item) => ['badge', 'userBadge', 'lottery.badgeGrant'].includes(item.name))) {
            assert.deepEqual(query.query.domainId, { $exists: false });
        }
    });

    it('aggregates Tang students across Python and Scratch regardless of the current Tang domain', async () => {
        const fixtures = {
            badge: [badge(1)],
            userBadge: [{ owner: 10, badgeId: 1 }, { owner: 11, badgeId: 1 }, { owner: 90, badgeId: 1 }],
            'domain.user': [
                { uid: 10, domainId: 'Python', join: true }, { uid: 11, domainId: 'Scratch', join: true },
                { uid: 90, domainId: 'Other teacher', join: true },
            ],
            user: [account(10), account(11), account(90)],
        };
        await Promise.all(['Python', 'Scratch'].map(async (domainId) => {
            const ctx = context(fixtures);
            const result = await honor.getBadgeHonorWall(ctx, { _id: domainId, workspaceId: 'tang' }, now);
            assert.deepEqual(result.badges[0].students.map((student) => student.uid), [10, 11]);
            assert.equal(ctx.queries.some((query) => query.name === 'domain.user'), false);
            assert(result.badges[0].students.every((student) => student.href.startsWith(`/d/${domainId}/`)));
        }));
    });

    it('isolates another teacher to joined students and badges in this exact domain, not sibling domains', async () => {
        const ctx = context({
            badge: [badge(1), badge(2, { domainId: 'A' }), badge(3, { domainId: 'B' })],
            userBadge: [3, 10, 11, 12].map((owner) => ({ owner, badgeId: 2, domainId: 'A' }))
                .concat([{ owner: 10, badgeId: 3, domainId: 'B' }]),
            'domain.user': [
                { uid: 3, domainId: 'A', join: true }, { uid: 10, domainId: 'A', join: true },
                { uid: 11, domainId: 'B', join: true }, { uid: 12, domainId: 'A', join: false },
            ],
            user: [account(3), account(10), account(11), account(12)],
            'lottery.badgeGrant': [{ uid: 10, badgeId: 2, expiresAt: past, domainId: 'B' }],
        });
        const result = await honor.getBadgeHonorWall(ctx, { _id: 'A', workspaceId: 'teacher' }, now);
        assert.deepEqual(result.badges.map((item) => item.id), [2]);
        assert.deepEqual(result.badges[0].students.map((student) => student.uid), [10]);
        assert.equal(result.badges[0].acImage, '');
        for (const query of ctx.queries.filter((item) => ['badge', 'userBadge', 'lottery.badgeGrant'].includes(item.name))) {
            assert.equal(query.query.domainId, 'A');
        }
    });

    it('prioritizes exact strongest and shadow badge names, then newest creation and descending ID', () => {
        const badges = [
            badge(1, { title: '暗影骑士', createAt: past }), badge(2, { short: '🏆最强王者', createAt: past }),
            badge(3, { title: '最强王者体验', createAt: future }), badge(4, { title: '普通勋章', createAt: future }),
            badge(5, { title: '早期勋章', createAt: past }),
        ];
        assert.deepEqual(badges.sort(honor.compareHonorWallBadges).map((item) => item._id), [2, 1, 4, 3, 5]);
        assert(honor.compareHonorWallBadges(badge(6, { short: '♞ 暗影骑士' }), badge(7, { short: '暗影骑士体验' })) < 0);
    });

    it('drops an empty special badge and uses safe badge colors without any database writes', async () => {
        const ctx = context({
            badge: [badge(1, { title: '最强王者' }), badge(2, { backgroundColor: 'fff; background:url(evil)', fontColor: 'aBcD' })],
            userBadge: [{ owner: 10, badgeId: 2 }], user: [account(10)],
        });
        const result = await honor.getBadgeHonorWall(ctx, { _id: 'C++' }, now);
        assert.deepEqual(result.badges.map((item) => item.id), [2]);
        assert.equal(result.badges[0].backgroundColor, '#e5edf5');
        assert.equal(result.badges[0].fontColor, '#aBcD');
        assert.equal(result.badges[0].badgeHref, '/d/C%2B%2B/badge/2');
    });

    it('returns no badges without fetching users or grants if no one owns any', async () => {
        const ctx = context({ badge: [badge(1)] });
        assert.deepEqual(await honor.getBadgeHonorWall(ctx, { _id: 'Python' }, now), { badges: [] });
        assert.deepEqual(ctx.queries.map((query) => query.name), ['badge', 'userBadge']);
    });

    it('registers a same-domain, ranking-permission protected, uncacheable read endpoint', () => {
        const source = fs.readFileSync(require.resolve('../packages/hydrooj/src/handler/home.ts'), 'utf8');
        assert(source.includes("ctx.Route('badge_honor_wall', '/badge-honor-wall', BadgeHonorWallHandler, PERM.PERM_VIEW_RANKING)"));
        assert(source.includes("this.response.addHeader('Cache-Control', 'private, no-store')"));
        assert(!/class BadgeHonorWallHandler[\s\S]*?noCheckPermView[\s\S]*?export class HomeHandler/.test(source));
    });
});
