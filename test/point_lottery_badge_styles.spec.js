const assert = require('node:assert/strict');
const Module = require('node:module');
const { describe, it } = require('node:test');

const originalLoad = Module._load;
let getPointLotteryBadgeStyles;
let getPointLotteryBadges;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/point_lottery.ts')) {
            if (request === '@hydrooj/utils') return { sleep: async () => {} };
            if (request === '../model/builtin') return { PRIV: {} };
            if (request === '../model/schedule' || request === '../model/system') return {};
            if (request === '../model/user') return { deleteUserCache: async () => {} };
            if (request === '../model/workspace') {
                return { LEGACY_WORKSPACE_ID: 'tang', resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang' };
            }
            if (request === '../service/db') return { collection: () => ({}) };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    ({ getPointLotteryBadgeStyles, getPointLotteryBadges } = require('../packages/hydrooj/src/lib/point_lottery'));
} finally {
    Module._load = originalLoad;
}

function context(badges = []) {
    const queries = [];
    const projection = {
        _id: 1,
        short: 1,
        title: 1,
        backgroundColor: 1,
        fontColor: 1,
        acImagePath: 1,
        acImageUpdatedAt: 1,
    };
    const matches = (badge, query) => (!query._id?.$in || query._id.$in.includes(badge._id))
        && (typeof query.domainId === 'string'
            ? badge.domainId === query.domainId
            : badge.domainId === undefined);
    return {
        queries,
        db: {
            collection(name) {
                assert.equal(name, 'badge');
                return {
                    find(query) {
                        queries.push(query);
                        return {
                            project(fields) {
                                assert.deepEqual(fields, projection);
                                const toArray = async () => badges.filter((badge) => matches(badge, query))
                                    .map((badge) => Object.fromEntries(Object.keys(projection)
                                        .filter((key) => badge[key] !== undefined)
                                        .map((key) => [key, badge[key]])));
                                return {
                                    toArray,
                                    sort(fields) {
                                        assert.deepEqual(fields, { _id: 1 });
                                        return { toArray };
                                    },
                                };
                            },
                        };
                    },
                };
            },
        },
    };
}

const prize = (badgeId, overrides = {}) => ({ kind: 'badge', badgeId, ...overrides });

describe('point lottery ranking-style badge catalog', () => {
    it('does not query when the pool has no valid badge prizes', async () => {
        const ctx = context();
        assert.deepEqual(await getPointLotteryBadgeStyles(ctx, []), {});
        assert.deepEqual(await getPointLotteryBadgeStyles(ctx, [
            prize(7, { kind: 'normal' }), prize(0), prize(-1), prize(undefined), prize(Infinity),
        ]), {});
        assert.deepEqual(ctx.queries, []);
    });

    it('uses live badge appearance rather than the independently named prize or image', async () => {
        const ctx = context([{
            _id: 7, short: '⭐幸运女神', title: '幸运女神称号', backgroundColor: '48348b', fontColor: '#FFFFFF',
            acImagePath: 'badge/ac.png', acImageUpdatedAt: '2026-09-08T08:09:10.000Z',
            content: 'private implementation details', users: [42], backgroundImagePath: '/badge/private.png',
        }]);
        assert.deepEqual(await getPointLotteryBadgeStyles(ctx, [prize(7, { name: '奖励一天', image: '/prize.png' })]), {
            7: {
                id: 7,
                displayName: '⭐幸运女神',
                tooltip: '幸运女神称号',
                backgroundColor: '#48348b',
                fontColor: '#FFFFFF',
                image: '/d/system/badge/7/ac-image?size=384&v=2026-09-08T08%3A09%3A10.000Z',
                resultImage: '/d/system/badge/7/ac-image?size=768&v=2026-09-08T08%3A09%3A10.000Z',
            },
        });
    });

    it('deduplicates repeated prizes and loads every configured upgrade state', async () => {
        const ctx = context([{ _id: 7 }, { _id: 8 }, { _id: 9 }]);
        const styles = await getPointLotteryBadgeStyles(ctx, [prize(7), prize(7), prize(8, { badgeUpgradeBadgeIds: [9] })]);
        assert.deepEqual(Object.keys(styles), ['7', '8', '9']);
        assert.deepEqual(ctx.queries, [{ _id: { $in: [7, 8, 9] }, domainId: { $exists: false } }]);
    });

    it('shares Tang legacy appearance across domains without exposing domain-owned badges', async () => {
        const ctx = context([{ _id: 7, short: '唐老师勋章' }, { _id: 8, domainId: 'Python', short: '其他老师' }]);
        const styles = await getPointLotteryBadgeStyles(ctx, [prize(7), prize(8)], { _id: 'Scratch', workspaceId: 'tang' });
        assert.deepEqual(Object.keys(styles), ['7']);
        assert.deepEqual(ctx.queries[0].domainId, { $exists: false });
        assert.equal(styles[7].image, '');
    });

    it('isolates non-Tang teachers by current domain including within one workspace', async () => {
        const ctx = context([
            { _id: 7, short: '全域' }, { _id: 8, domainId: 'Python', short: 'Python 勋章' },
            { _id: 9, domainId: 'Scratch', short: 'Scratch 勋章' },
        ]);
        const styles = await getPointLotteryBadgeStyles(ctx, [prize(7), prize(8), prize(9)], {
            _id: 'Python', workspaceId: 'another-teacher',
        });
        assert.deepEqual(Object.keys(styles), ['8']);
        assert.equal(ctx.queries[0].domainId, 'Python');
    });

    it('uses ranking defaults for missing fields and accepts supported hex color lengths', async () => {
        const ctx = context([
            { _id: 7 }, { _id: 8, short: '勋章八', backgroundColor: 'abc', fontColor: 'abcd' },
            { _id: 9, backgroundColor: '#11223344', fontColor: 'AABBCC' },
        ]);
        const styles = await getPointLotteryBadgeStyles(ctx, [prize(7), prize(8), prize(9)]);
        assert.deepEqual(styles[7], {
            id: 7, displayName: '7', tooltip: '7', backgroundColor: '#e5edf5', fontColor: '#1f2937',
            image: '', resultImage: '',
        });
        assert.equal(styles[8].tooltip, '勋章八');
        assert.equal(styles[8].backgroundColor, '#abc');
        assert.equal(styles[8].fontColor, '#abcd');
        assert.equal(styles[9].backgroundColor, '#11223344');
        assert.equal(styles[9].fontColor, '#AABBCC');
    });

    it('never permits CSS declarations or markup to enter the style color fields', async () => {
        const ctx = context([{
            _id: 7, backgroundColor: 'fff;background-image:url(https://example.invalid/a)', fontColor: '\"><img src=x>',
        }]);
        const styles = await getPointLotteryBadgeStyles(ctx, [prize(7)]);
        assert.equal(styles[7].backgroundColor, '#e5edf5');
        assert.equal(styles[7].fontColor, '#1f2937');
    });

    it('returns the same lazy AC image contract to the lottery editor', async () => {
        const ctx = context([{
            _id: 8,
            short: '状态二',
            title: '状态二说明',
            domainId: 'Python',
            acImagePath: 'badge/ac-state-2.png',
            acImageUpdatedAt: 'v two',
        }]);
        assert.deepEqual(await getPointLotteryBadges(ctx, { _id: 'Python', workspaceId: 'teacher-workspace' }), [{
            _id: 8,
            id: 8,
            short: '状态二',
            title: '状态二说明',
            acImagePath: 'badge/ac-state-2.png',
            acImageUpdatedAt: 'v two',
            displayName: '状态二',
            tooltip: '状态二说明',
            backgroundColor: '#e5edf5',
            fontColor: '#1f2937',
            image: '/d/Python/badge/8/ac-image?size=384&v=v%20two',
            resultImage: '/d/Python/badge/8/ac-image?size=768&v=v%20two',
        }]);
        assert.deepEqual(ctx.queries, [{ domainId: 'Python' }]);
    });
});
