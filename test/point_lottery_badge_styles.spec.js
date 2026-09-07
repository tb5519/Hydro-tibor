const assert = require('node:assert/strict');
const Module = require('node:module');
const { describe, it } = require('node:test');

const originalLoad = Module._load;
let getPointLotteryBadgeStyles;
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
    ({ getPointLotteryBadgeStyles } = require('../packages/hydrooj/src/lib/point_lottery'));
} finally {
    Module._load = originalLoad;
}

function context(badges = []) {
    const queries = [];
    const projection = { _id: 1, short: 1, title: 1, backgroundColor: 1, fontColor: 1 };
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
                                return {
                                    async toArray() {
                                        return badges.filter((badge) => query._id.$in.includes(badge._id)
                                            && (typeof query.domainId === 'string'
                                                ? badge.domainId === query.domainId
                                                : badge.domainId === undefined));
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
            content: 'private implementation details', users: [42], backgroundImagePath: '/badge/private.png',
        }]);
        assert.deepEqual(await getPointLotteryBadgeStyles(ctx, [prize(7, { name: '奖励一天', image: '/prize.png' })]), {
            7: { id: 7, displayName: '⭐幸运女神', tooltip: '幸运女神称号', backgroundColor: '#48348b', fontColor: '#FFFFFF' },
        });
    });

    it('deduplicates repeated duration prizes and only loads configured base badge ids', async () => {
        const ctx = context([{ _id: 7 }, { _id: 8 }, { _id: 9 }]);
        const styles = await getPointLotteryBadgeStyles(ctx, [prize(7), prize(7), prize(8, { badgeUpgradeBadgeIds: [9] })]);
        assert.deepEqual(Object.keys(styles), ['7', '8']);
        assert.deepEqual(ctx.queries, [{ _id: { $in: [7, 8] }, domainId: { $exists: false } }]);
    });

    it('shares Tang legacy appearance across domains without exposing domain-owned badges', async () => {
        const ctx = context([{ _id: 7, short: '唐老师勋章' }, { _id: 8, domainId: 'Python', short: '其他老师' }]);
        const styles = await getPointLotteryBadgeStyles(ctx, [prize(7), prize(8)], { _id: 'Scratch', workspaceId: 'tang' });
        assert.deepEqual(Object.keys(styles), ['7']);
        assert.deepEqual(ctx.queries[0].domainId, { $exists: false });
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
});
