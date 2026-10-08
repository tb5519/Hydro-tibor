const assert = require('node:assert/strict');
const Module = require('node:module');
const { describe, it } = require('node:test');

let getUserBadgeGallery;
const originalLoad = Module._load;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/user_badge_gallery.ts') && request === '../model/workspace') {
            return { LEGACY_WORKSPACE_ID: 'tang', resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang' };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    ({ getUserBadgeGallery } = require('../packages/hydrooj/src/lib/user_badge_gallery'));
} finally {
    Module._load = originalLoad;
}

const now = new Date('2026-10-08T12:00:00Z');
const yesterday = new Date('2026-10-07T12:00:00Z');
const tomorrow = new Date('2026-10-09T12:00:00Z');
const later = new Date('2026-10-12T05:30:00Z');
const domain = { _id: 'Python', workspaceId: 'tang' };
const modernDomain = { _id: 'A', workspaceId: 'teacher' };
const uid = 10;
const badge = (id, extra = {}) => ({ _id: id, title: `徽章 ${id}`, short: `B${id}`, users: [], ...extra });
const owned = (id, extra = {}) => ({ owner: uid, badgeId: id, getAt: yesterday, ...extra });
const grant = (id, extra = {}) => ({ _id: `grant-${id}`, uid, badgeId: id, source: 'lottery', grantedAt: yesterday, ...extra });

function matches(doc, query) {
    return Object.entries(query).every(([key, condition]) => {
        const value = doc[key];
        if (!condition || typeof condition !== 'object' || condition instanceof Date) return value === condition;
        return Object.entries(condition).every(([operator, operand]) => {
            if (operator === '$in') return operand.includes(value);
            if (operator === '$exists') return Object.hasOwn(doc, key) === operand;
            throw new Error(`Unexpected query operator ${operator}`);
        });
    });
}

function project(doc, projection) {
    if (!doc) return null;
    return Object.fromEntries(Object.keys(projection).filter((key) => Object.hasOwn(doc, key)).map((key) => [key, doc[key]]));
}

function context(fixtures) {
    const queries = [];
    return {
        queries,
        db: {
            collection(name) {
                // Deliberately no mutation APIs: gallery reads must never repair or grant ownership.
                return {
                    find(query) {
                        const queryLog = { name, query };
                        queries.push(queryLog);
                        const rows = (fixtures[name] || []).filter((doc) => matches(doc, query));
                        return { project(projection) {
                            queryLog.projection = projection;
                            return { async toArray() { return rows.map((doc) => project(doc, projection)); } };
                        } };
                    },
                    async findOne(query, options) {
                        queries.push({ name, query, projection: options.projection });
                        return project((fixtures[name] || []).find((doc) => matches(doc, query)), options.projection);
                    },
                };
            },
        },
    };
}

const gallery = (fixtures, currentDomain = domain) => getUserBadgeGallery(context(fixtures), currentDomain, uid, now);

describe('my badge gallery ownership and validity', () => {
    it('shows manual, automatic permanent, and legacy ownership, with permanent ownership taking precedence', async () => {
        const result = await gallery({
            badge: [badge(1, { users: [uid] }), badge(2), badge(3), badge(4, { users: [uid] })],
            userBadge: [owned(1), owned(2), owned(3)],
            'lottery.badgeGrant': [grant(1, { expiresAt: yesterday }), grant(2), grant(2, { expiresAt: tomorrow })],
        });
        assert.deepEqual(result.badgeCards.map((card) => card.id), [3, 2, 1]);
        assert(result.badgeCards.every((card) => card.expiresAt === null && card.expiryLabel === '永久'));
        assert.deepEqual(result.badgeCollection, { total: 3, permanent: 3, temporary: 0, currentName: '' });
        assert(!result.badgeCards.some((card) => card.id === 4), 'manual metadata alone does not grant a gallery card');
    });

    it('uses the latest active expiry across repeated wins and weekly awards, without adding dates again', async () => {
        const result = await gallery({
            badge: [badge(1)], userBadge: [owned(1)],
            'lottery.badgeGrant': [grant(1, { expiresAt: tomorrow }), grant(1, { source: 'weekly_rp', expiresAt: later }),
                grant(1, { expiresAt: new Date('2027-01-01'), expiredAt: now })],
        });
        assert.equal(result.badgeCards[0].expiresAt, later.toISOString());
        assert.equal(result.badgeCards[0].expiryLabel, '2026-10-12 13:30');
        assert.deepEqual(result.badgeCollection, { total: 1, permanent: 0, temporary: 1, currentName: '' });
    });

    it('does not expose expired, revoked, superseded, or malformed grants before cleanup removes ownership rows', async () => {
        const records = [
            { expiresAt: yesterday }, { expiresAt: now }, { expiresAt: later, expiredAt: yesterday },
            { expiresAt: later, revokedAt: yesterday }, { supersededAt: yesterday },
            { expiresAt: null }, { expiresAt: '2026-11-01T00:00:00Z' }, { expiresAt: new Date('invalid') },
        ];
        const result = await gallery({
            badge: records.map((_, index) => badge(index + 1)), userBadge: records.map((_, index) => owned(index + 1)),
            'lottery.badgeGrant': records.map((extra, index) => grant(index + 1, extra)),
            user: [{ _id: uid, badgeId: 1 }],
        });
        assert.deepEqual(result, { badgeCards: [], badgeCollection: { total: 0, permanent: 0, temporary: 0, currentName: '' } });
    });

    it('uses only the latest upgrade state and never treats state history as current ownership', async () => {
        const result = await gallery({
            badge: [badge(1), badge(2), badge(3)], userBadge: [owned(1), owned(2), owned(3)],
            'lottery.badgeGrant': [
                grant(2, { _id: 'a', sourceBadgeId: 1, repeatEffect: 'upgrade', expiresAt: later }),
                grant(3, { _id: 'b', sourceBadgeId: 1, repeatEffect: 'upgrade', grantedAt: now, expiresAt: tomorrow,
                    lotteryBadgeIds: [3], awardedBadgeIds: [1, 2, 3], stateHistory: [{ badgeId: 1 }, { badgeId: 2 }] }),
            ],
        });
        assert.deepEqual(result.badgeCards.map((card) => card.id), [3]);
        assert.equal(result.badgeCards[0].expiresAt, tomorrow.toISOString());
    });

    it('does not resurrect an older upgrade when the latest state has expired or was revoked', async () => {
        for (const extra of [{ expiresAt: yesterday }, { revokedAt: now }]) {
            const result = await gallery({
                badge: [badge(1), badge(2), badge(3)], userBadge: [owned(1), owned(2), owned(3)],
                'lottery.badgeGrant': [
                    grant(2, { _id: 'a', sourceBadgeId: 1, repeatEffect: 'upgrade', expiresAt: later }),
                    grant(3, { _id: 'b', sourceBadgeId: 1, repeatEffect: 'upgrade', grantedAt: now, ...extra }),
                ],
            });
            assert.equal(result.badgeCards.length, 0);
        }
    });

    it('keeps an independently valid old badge after an upgrade, and honors a permanent manual overlap', async () => {
        const result = await gallery({
            badge: [badge(1), badge(2, { users: [uid] }), badge(3)], userBadge: [owned(1), owned(2), owned(3)],
            'lottery.badgeGrant': [
                grant(3, { sourceBadgeId: 1, repeatEffect: 'upgrade', expiresAt: tomorrow,
                    stateHistory: [{ badgeId: 1 }, { badgeId: 2 }] }),
                grant(1, { repeatEffect: 'duration', expiresAt: later }),
            ],
        });
        assert.deepEqual(result.badgeCards.map((card) => [card.id, card.expiresAt]), [
            [3, tomorrow.toISOString()], [2, null], [1, later.toISOString()],
        ]);
    });

    it('ignores superseded upgrade grants and breaks same-time ties by grant ID', async () => {
        const result = await gallery({
            badge: [badge(1), badge(2), badge(3)], userBadge: [owned(1), owned(2), owned(3)],
            'lottery.badgeGrant': [
                grant(1, { _id: 'c', sourceBadgeId: 1, repeatEffect: 'upgrade', grantedAt: now, supersededAt: now }),
                grant(2, { _id: 'a', sourceBadgeId: 1, repeatEffect: 'upgrade' }),
                grant(3, { _id: 'b', sourceBadgeId: 1, repeatEffect: 'upgrade' }),
            ],
        });
        assert.deepEqual(result.badgeCards.map((card) => card.id), [3]);
    });
});

describe('my badge gallery presentation data and scope', () => {
    it('deduplicates ownership, puts current first, then newest earned, with a stable ID tie-break', async () => {
        const result = await gallery({
            badge: [badge(1), badge(2), badge(3), badge(4)],
            userBadge: [owned(1), owned(1, { getAt: now }), owned(2), owned(3, { getAt: now }), owned(4, { getAt: null })],
            user: [{ _id: uid, badgeId: 2, badgeDomainId: null }],
        });
        assert.deepEqual(result.badgeCards.map((card) => card.id), [2, 3, 1, 4]);
        assert.equal(result.badgeCards[2].getAt.toISOString(), now.toISOString());
        assert.equal(result.badgeCards[3].getAt, null);
        assert.equal(result.badgeCollection.currentName, '徽章 2');
        assert.equal(result.badgeCards.filter((card) => card.isCurrent).length, 1);
    });

    it('returns versioned 768px AC URLs, safe colors and missing-image fallback without private storage paths', async () => {
        const result = await gallery({
            badge: [badge(1, { title: '<img src=x onerror=alert(1)>', acImagePath: 'private/object.png',
                acImageUpdatedAt: '2026-10-08T12:00:00Z', backgroundColor: 'abc;url(evil)', fontColor: '#AbC8' }),
            badge(2, { short: '', title: '', backgroundColor: 'fff', fontColor: 'not a color' })],
            userBadge: [owned(1), owned(2)],
        }, { _id: 'C++', workspaceId: 'tang' });
        const imageCard = result.badgeCards.find((card) => card.id === 1);
        assert.equal(imageCard.acImage, '/d/C%2B%2B/badge/1/ac-image?size=768&v=2026-10-08T12%3A00%3A00Z');
        assert.equal(imageCard.detailUrl, '/d/C%2B%2B/badge/1');
        assert.equal(imageCard.backgroundColor, '#eff6ff');
        assert.equal(imageCard.fontColor, '#AbC8');
        assert.equal(imageCard.title, '<img src=x onerror=alert(1)>', 'templates must escape display text');
        const fallback = result.badgeCards.find((card) => card.id === 2);
        assert.equal(fallback.acImage, '');
        assert.equal(fallback.title, '徽章 2');
        assert.equal(fallback.short, '徽章 2');
        assert.equal(fallback.backgroundColor, '#fff');
        assert.equal(fallback.fontColor, '#2563eb');
        assert.equal(JSON.stringify(result).includes('private/object.png'), false);
    });

    it('shares legacy global ownership across Tang domains but excludes other users and modern-domain grants', async () => {
        const fixtures = {
            badge: [badge(1), badge(2), badge(3, { domainId: 'A' })],
            userBadge: [owned(1), owned(2, { owner: 11 }), owned(3, { domainId: 'A' })],
            'lottery.badgeGrant': [grant(1, { uid: 11, expiresAt: yesterday }), grant(1, { domainId: 'A', expiresAt: yesterday })],
            user: [{ _id: uid, badgeId: 1, badgeDomainId: 'A' }, { _id: 11, badgeId: 1 }],
        };
        for (const domainId of ['Python', 'Scratch']) {
            const ctx = context(fixtures);
            const result = await getUserBadgeGallery(ctx, { _id: domainId, workspaceId: 'tang' }, uid, now);
            assert.deepEqual(result.badgeCards.map((card) => card.id), [1]);
            assert.equal(result.badgeCards[0].expiresAt, null);
            assert.equal(result.badgeCards[0].isCurrent, false);
            assert(result.badgeCards[0].detailUrl.startsWith(`/d/${domainId}/`));
            for (const query of ctx.queries.filter((item) => item.name !== 'user')) {
                assert.deepEqual(query.query.domainId, { $exists: false });
            }
            assert.deepEqual(ctx.queries.find((query) => query.name === 'user').query, { _id: uid });
            assert.equal(ctx.queries.find((query) => query.name === 'userBadge').query.owner, uid);
            assert.equal(ctx.queries.find((query) => query.name === 'lottery.badgeGrant').query.uid, uid);
        }
    });

    it('isolates modern domains even in one workspace, including expiry, badge metadata and selected state', async () => {
        const ctx = context({
            badge: [badge(1), badge(2, { domainId: 'A' }), badge(3, { domainId: 'B' })],
            userBadge: [owned(1), owned(2, { domainId: 'A' }), owned(3, { domainId: 'B' })],
            'lottery.badgeGrant': [grant(2, { domainId: 'A', expiresAt: tomorrow }), grant(2, { domainId: 'B' }),
                grant(2, { uid: 11, domainId: 'A' })],
            user: [{ _id: uid, badgeId: 2, badgeDomainId: 'A' }],
        });
        const result = await getUserBadgeGallery(ctx, modernDomain, uid, now);
        assert.deepEqual(result.badgeCards.map((card) => [card.id, card.expiresAt, card.isCurrent]), [[2, tomorrow.toISOString(), true]]);
        for (const query of ctx.queries.filter((item) => item.name !== 'user')) assert.equal(query.query.domainId, 'A');
    });

    it('drops deleted badge metadata and avoids fetching grants or accounts when the user owns nothing', async () => {
        const ctx = context({ badge: [badge(1)], userBadge: [owned(1, { owner: 11 })] });
        const result = await getUserBadgeGallery(ctx, domain, uid, now);
        assert.equal(result.badgeCollection.total, 0);
        assert.deepEqual(ctx.queries.map((query) => query.name), ['userBadge']);
        assert.equal((await gallery({ userBadge: [owned(9)] })).badgeCards.length, 0);
    });

    it('rejects invalid user IDs without reading any collection and never mutates valid fixtures', async () => {
        const fixtures = { badge: [badge(1)], userBadge: [owned(1)], 'lottery.badgeGrant': [grant(1, { expiresAt: tomorrow })] };
        const original = JSON.stringify(fixtures);
        const ctx = context(fixtures);
        for (const id of [0, -1, NaN, '10']) assert.equal((await getUserBadgeGallery(ctx, domain, id, now)).badgeCards.length, 0);
        assert.equal(ctx.queries.length, 0);
        await getUserBadgeGallery(ctx, domain, uid, now);
        assert.equal(JSON.stringify(fixtures), original);
        assert(ctx.queries.every((query) => query.projection));
    });
});
