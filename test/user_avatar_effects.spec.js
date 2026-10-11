const assert = require('node:assert/strict');
const Module = require('node:module');
const { describe, it } = require('node:test');

let getUserAvatarEffects;
let parseAvatarEffectUids;
let getUserBadgeGallery;
const originalLoad = Module._load;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/user_badge_gallery.ts') && request === '../model/workspace') {
            return { LEGACY_WORKSPACE_ID: 'tang', resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang' };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    ({ getUserAvatarEffects, parseAvatarEffectUids } = require('../packages/hydrooj/src/lib/user_avatar_effects'));
    ({ getUserBadgeGallery } = require('../packages/hydrooj/src/lib/user_badge_gallery'));
} finally {
    Module._load = originalLoad;
}

const now = new Date('2026-10-11T12:00:00Z');
const yesterday = new Date('2026-10-10T12:00:00Z');
const tomorrow = new Date('2026-10-12T12:00:00Z');
const legacy = { _id: 'Python', workspaceId: 'tang' };
const modern = { _id: 'Scratch', workspaceId: 'teacher-a' };
function matches(doc, query) {
    return Object.entries(query).every(([key, condition]) => {
        if (!condition || typeof condition !== 'object') return doc[key] === condition;
        return Object.entries(condition).every(([operator, operand]) => {
            if (operator === '$in') return operand.includes(doc[key]);
            if (operator === '$exists') return Object.hasOwn(doc, key) === operand;
            throw new Error(`Unexpected query operator ${operator}`);
        });
    });
}
function project(doc, fields) {
    return doc ? Object.fromEntries(Object.keys(fields).filter((key) => Object.hasOwn(doc, key)).map((key) => [key, doc[key]])) : null;
}
function context(fixtures) {
    const reads = [];
    return {
        reads,
        db: {
            collection(name) {
                return {
                    find(query) {
                        return { project(fields) {
                            reads.push({ name, query, fields });
                            return { async toArray() { return (fixtures[name] || []).filter((doc) => matches(doc, query)).map((doc) => project(doc, fields)); } };
                        } };
                    },
                    async findOne(query, options) {
                        reads.push({ name, query, fields: options.projection });
                        return project((fixtures[name] || []).find((doc) => matches(doc, query)), options.projection);
                    },
                };
            },
        },
    };
}
const fixturesFor = (counts) => ({
    user: counts.map((_, index) => ({ _id: index + 10, password: 'never expose' })),
    badge: Array.from({ length: Math.max(...counts, 0) }, (_, index) => ({ _id: index + 1 })),
    userBadge: counts.flatMap((count, index) => Array.from({ length: count }, (_, id) => ({ owner: index + 10, badgeId: id + 1 }))),
});

describe('avatar effect input boundary', () => {
    it('accepts 1–100 unique positive IDs, preserves request order and deduplicates', () => {
        assert.deepEqual(parseAvatarEffectUids('12, 10,12,11'), [12, 10, 11]);
        assert.equal(parseAvatarEffectUids(Array.from({ length: 100 }, (_, i) => i + 1).join(',')).length, 100);
    });
    it('rejects malformed, nonpositive, unsafe, missing and excessive input', () => {
        for (const value of ['', null, undefined, 10, ['1'], '0', '-1', '1.5', '1e3', '1,,2', '1,', 'Infinity',
            '9007199254740992', '01', '1,'.repeat(1001), Array.from({ length: 101 }, (_, i) => i + 1).join(',')]) {
            assert.equal(parseAvatarEffectUids(value), null, `${value}`);
        }
    });
});

describe('batched avatar effect eligibility', () => {
    it('enables only at five valid unique badges and uses four total batch reads for every avatar', async () => {
        const fixtures = fixturesFor([4, 5, 6, 0]);
        fixtures.userBadge.push({ owner: 10, badgeId: 1 }, { owner: 10, badgeId: 2 });
        const ctx = context(fixtures);
        assert.deepEqual(await getUserAvatarEffects(ctx, legacy, [10, 11, 12, 13, 10, 999], now), { users: [
            { uid: 10, badgeCount: 4, effect: null },
            { uid: 11, badgeCount: 5, effect: 'electric-arc' },
            { uid: 12, badgeCount: 6, effect: 'electric-arc' },
            { uid: 13, badgeCount: 0, effect: null },
        ] });
        assert.equal(ctx.reads.length, 4);
        assert.deepEqual(ctx.reads.find((read) => read.name === 'user').fields, { _id: 1 });
        assert(!JSON.stringify(ctx.reads).includes('password'));
    });
    it('removes expired, revoked and deleted badges before cleanup while honoring manual and permanent grants', async () => {
        const fixtures = fixturesFor([10]);
        fixtures.badge = fixtures.badge.filter((badge) => badge._id !== 10);
        fixtures.badge.find((badge) => badge._id === 5).users = [10];
        fixtures['lottery.badgeGrant'] = [
            { uid: 10, badgeId: 1, expiresAt: yesterday },
            { uid: 10, badgeId: 2, expiresAt: now },
            { uid: 10, badgeId: 3, revokedAt: now },
            { uid: 10, badgeId: 4, expiresAt: tomorrow },
            { uid: 10, badgeId: 5, expiresAt: yesterday },
            { uid: 10, badgeId: 6, expiresAt: null },
            { uid: 10, badgeId: 7, expiresAt: '2027-01-01' },
            { uid: 10, badgeId: 8 },
        ];
        const result = await getUserAvatarEffects(context(fixtures), legacy, [10], now);
        assert.deepEqual(result.users, [{ uid: 10, badgeCount: 4, effect: null }]);
        assert.equal(result.users[0].badgeCount, (await getUserBadgeGallery(context(fixtures), legacy, 10, now)).badgeCollection.total);
        const later = await getUserAvatarEffects(context(fixtures), legacy, [10], tomorrow);
        assert.equal(later.users[0].badgeCount, 3);
    });
    it('never counts old upgrade remnants or revives a revoked latest upgrade', async () => {
        const fixtures = fixturesFor([6]);
        fixtures['lottery.badgeGrant'] = [
            { _id: 'a', uid: 10, badgeId: 2, sourceBadgeId: 1, repeatEffect: 'upgrade', grantedAt: yesterday },
            { _id: 'b', uid: 10, badgeId: 3, sourceBadgeId: 1, repeatEffect: 'upgrade', grantedAt: now,
                awardedBadgeIds: [1, 2, 3], stateHistory: [{ badgeId: 1 }, { badgeId: 2 }] },
        ];
        assert.equal((await getUserAvatarEffects(context(fixtures), legacy, [10], now)).users[0].badgeCount, 4);
        fixtures['lottery.badgeGrant'][1].revokedAt = now;
        assert.equal((await getUserAvatarEffects(context(fixtures), legacy, [10], now)).users[0].badgeCount, 3);
    });
    it('isolates each users grants even when badge metadata is shared', async () => {
        const fixtures = fixturesFor([5, 5]);
        fixtures['lottery.badgeGrant'] = [{ uid: 10, badgeId: 1, expiresAt: yesterday }];
        const result = await getUserAvatarEffects(context(fixtures), legacy, [11, 10], now);
        assert.deepEqual(result.users, [
            { uid: 11, badgeCount: 5, effect: 'electric-arc' }, { uid: 10, badgeCount: 4, effect: null },
        ]);
    });
    it('shares legacy ownership across legacy domains but excludes sibling modern domain and grant data', async () => {
        const fixtures = fixturesFor([5]);
        fixtures.badge.push({ _id: 6, domainId: 'Scratch' }, { _id: 7, domainId: 'Other' });
        fixtures.userBadge.push({ owner: 10, badgeId: 6, domainId: 'Scratch' }, { owner: 10, badgeId: 7, domainId: 'Other' });
        fixtures['lottery.badgeGrant'] = [
            { uid: 10, badgeId: 1, domainId: 'Scratch', expiresAt: yesterday },
            { uid: 10, badgeId: 6, domainId: 'Other', expiresAt: yesterday },
        ];
        for (const domain of [legacy, { _id: 'C++', workspaceId: 'tang' }]) {
            assert.equal((await getUserAvatarEffects(context(fixtures), domain, [10], now)).users[0].badgeCount, 5);
        }
        const ctx = context(fixtures);
        assert.deepEqual((await getUserAvatarEffects(ctx, modern, [10], now)).users, [{ uid: 10, badgeCount: 1, effect: null }]);
        for (const read of ctx.reads.filter((item) => item.name !== 'user')) assert.equal(read.query.domainId, 'Scratch');
    });
    it('does not use manual assignment metadata without ownership or nonexistent account remnants', async () => {
        const fixtures = fixturesFor([0]);
        fixtures.badge = Array.from({ length: 5 }, (_, i) => ({ _id: i + 1, users: [10] }));
        fixtures.userBadge = fixtures.badge.map((badge) => ({ owner: 999, badgeId: badge._id }));
        const ctx = context(fixtures);
        assert.deepEqual((await getUserAvatarEffects(ctx, legacy, [10, 999], now)).users, [{ uid: 10, badgeCount: 0, effect: null }]);
        assert.equal(ctx.reads.length, 2);
        assert.deepEqual((await getUserAvatarEffects(context(fixtures), legacy, [], now)).users, []);
    });
});
