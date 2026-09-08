const assert = require('node:assert/strict');
const Module = require('node:module');
const { describe, it } = require('node:test');

const legacyDomains = [{ _id: 'system' }, { _id: 'C0001' }, { _id: 'Scratch' }];
const workspaceStub = {
    LEGACY_WORKSPACE_ID: 'tang',
    resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang',
    async getDomains(id) {
        assert.equal(id, 'tang');
        return legacyDomains;
    },
};
const originalLoad = Module._load;
let lottery;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/point_lottery.ts')) {
            if (request === '@hydrooj/utils') return { sleep: async () => {} };
            if (request === '../model/builtin') return { PRIV: {} };
            if (request === '../model/schedule' || request === '../model/system') return {};
            if (request === '../model/user') return { deleteUserCache: async () => {} };
            if (request === '../model/workspace') return workspaceStub;
            if (request === '../service/db') return { collection: () => ({}) };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    lottery = require('../packages/hydrooj/src/lib/point_lottery');
} finally {
    Module._load = originalLoad;
}

const {
    getAvailablePointLotteryPrizes, getPointLotteryPrizesAfterWin,
    pointLotteryPrizeKey, publicPointLotteryBadgeAwardPrize, publicPointLotteryPrize, publicPointLotteryPrizes,
} = lottery;
const normal = (overrides = {}) => ({
    name: '盲盒', image: '/blind-box.png', probability: 20, pointDelta: 0,
    repeatable: false, broadcast: true, kind: 'normal', ...overrides,
});
const badge = (overrides = {}) => normal({
    kind: 'badge', badgeId: 7, name: '嫦娥奔月', image: '/moon.png',
    badgeDurationHours: 24, badgeRepeatEffect: 'duration', ...overrides,
});
const config = (prizes) => ({ enabled: true, cost: 10, prizes });

function makeContext(logs = []) {
    const queries = [];
    return {
        queries,
        db: {
            collection(name) {
                assert.equal(name, 'lottery.draw');
                return {
                    find(query) {
                        queries.push(query);
                        const matches = logs.filter((log) => query.domainId.$in.includes(log.domainId)
                            && log.uid === query.uid && log.deleted !== true
                            && query.$or.some((condition) => (condition['prize.kind'] === 'badge'
                                ? log.prize?.kind === 'badge' && condition['prize.badgeId'].$in.includes(log.prize.badgeId)
                                : condition['prize.name'].$in.includes(log.prize?.name))));
                        return {
                            project(projection) {
                                assert.deepEqual(projection, { prize: 1 });
                                // Deliberately no limit() method: old wins must not be omitted.
                                return { async toArray() { return matches; } };
                            },
                        };
                    },
                };
            },
        },
    };
}

describe('point lottery displayed prize availability', () => {
    it('keeps the original weighted pool without reading history when all prizes repeat', async () => {
        const prizes = [normal({ repeatable: true }), badge({ repeatable: true })];
        const ctx = makeContext();
        assert.equal(await getAvailablePointLotteryPrizes(ctx, 24, config(prizes)), prizes);
        assert.deepEqual(ctx.queries, []);
    });

    it('uses the complete legacy domain scope, current student, and non-deleted wins', async () => {
        const prizes = [normal(), badge()];
        const ctx = makeContext([
            { uid: 25, domainId: 'system', prize: prizes[0] },
            { uid: 24, domainId: 'system', deleted: true, prize: prizes[0] },
            { uid: 24, domainId: 'OTHER', prize: prizes[0] },
            { uid: 24, domainId: 'Scratch', prize: prizes[1] },
        ]);
        assert.deepEqual(await getAvailablePointLotteryPrizes(ctx, 24, config(prizes), { _id: 'C0001' }), [prizes[0]]);
        assert.deepEqual(ctx.queries[0], {
            domainId: { $in: ['system', 'C0001', 'Scratch'] }, uid: 24, deleted: { $ne: true },
            $or: [{ 'prize.kind': 'badge', 'prize.badgeId': { $in: [7] } }, { 'prize.name': { $in: ['盲盒'] } }],
        });
    });

    it('isolates other teachers by domain even within the same workspace', async () => {
        const prizes = [badge()];
        const ctx = makeContext([{ uid: 24, domainId: 'TEACHER-B', prize: prizes[0] }]);
        assert.deepEqual(await getAvailablePointLotteryPrizes(
            ctx, 24, config(prizes), { _id: 'TEACHER-A', workspaceId: 'teacher-workspace' },
        ), prizes);
        assert.deepEqual(ctx.queries[0].domainId, { $in: ['TEACHER-A'] });
    });

    it('matches normal prizes by name plus image, while keeping repeatable entries', async () => {
        const prizes = [normal(), normal({ image: '/different.png' }), normal({ repeatable: true })];
        const ctx = makeContext([{ uid: 24, domainId: 'system', prize: prizes[0] }]);
        assert.deepEqual(await getAvailablePointLotteryPrizes(ctx, 24, config(prizes)), prizes.slice(1));
    });

    it('matches badge IDs despite changed display name, image, or duration', async () => {
        const prizes = [badge(), badge({ badgeDurationHours: 72 }), badge({ repeatable: true, badgeDurationHours: 0 }), badge({ badgeId: 8 })];
        const ctx = makeContext([
            ...Array.from({ length: 30 }, () => ({ uid: 24, domainId: 'system', prize: normal() })),
            { uid: 24, domainId: 'system', prize: badge({ name: '旧名称', image: '/old.png', badgeDurationHours: 1 }) },
        ]);
        assert.deepEqual(await getAvailablePointLotteryPrizes(ctx, 24, config(prizes)), prizes.slice(2));
    });

    it('retains separate same-badge durations and original order, weights, and fields', () => {
        const prizes = [badge(), badge({ badgeDurationHours: 72, probability: 5 }), badge({ badgeDurationHours: 0, probability: 1 })];
        const before = JSON.stringify(prizes);
        const badgeStyle = {
            id: 7,
            displayName: '月宫使者',
            tooltip: '月宫使者勋章',
            backgroundColor: '#123456',
            fontColor: '#ffffff',
            image: '/d/system/badge/7/ac-image?size=384&v=one',
            resultImage: '/d/system/badge/7/ac-image?size=768&v=one',
        };
        const published = publicPointLotteryPrizes(prizes, [prizes[0], prizes[2]], { 7: badgeStyle });
        assert.deepEqual(published.map((prize) => prize.available), [true, false, true]);
        assert.deepEqual(published.map((prize) => prize.probability), [20, 5, 1]);
        assert.deepEqual(published.map((prize) => prize.badgeDurationHours), [24, 72, 0]);
        assert.deepEqual(published.map((prize) => prize.image), Array(3).fill(badgeStyle.image));
        assert.deepEqual(published.map((prize) => prize.resultImage), Array(3).fill(badgeStyle.resultImage));
        assert.equal(JSON.stringify(prizes), before);
        assert.equal(Object.hasOwn(publicPointLotteryPrize(prizes[0]), 'available'), false);
        assert.equal(publicPointLotteryPrize(prizes[0]).image, '');
    });

    it('snapshots the actual upgrade badge without changing the source prize identity', () => {
        const source = badge({ name: '幸运女神奖品', image: '/legacy-upload.png', badgeUpgradeBadgeIds: [8, 9] });
        const badgeStyle = {
            id: 9,
            displayName: '状态三',
            tooltip: '幸运女神状态三',
            backgroundColor: '#222222',
            fontColor: '#eeeeee',
            image: '/d/system/badge/9/ac-image?size=384&v=three',
            resultImage: '/d/system/badge/9/ac-image?size=768&v=three',
        };
        const snapshot = publicPointLotteryBadgeAwardPrize(source, {
            awardedBadgeId: 9,
            badgeLevel: 3,
            badgeStyle,
        });
        assert.equal(snapshot.badgeId, 7);
        assert.equal(snapshot.sourceBadgeId, 7);
        assert.equal(snapshot.awardedBadgeId, 9);
        assert.equal(snapshot.badgeLevel, 3);
        assert.equal(snapshot.name, '幸运女神状态三');
        assert.equal(snapshot.sourcePrizeName, '幸运女神奖品');
        assert.equal(snapshot.awardedBadgeName, '幸运女神状态三');
        assert.equal(snapshot.image, badgeStyle.image);
        assert.equal(snapshot.resultImage, badgeStyle.resultImage);
        assert.deepEqual(snapshot.badgeStyle, badgeStyle);
        assert.equal(pointLotteryPrizeKey(snapshot), 'badge:7');
    });

    it('keeps the configured prize name when the awarded state is still the base badge', () => {
        const source = badge({ name: '十小时幸运奖' });
        const badgeStyle = {
            id: 7,
            displayName: '幸运女神',
            tooltip: '幸运女神勋章',
            backgroundColor: '#222222',
            fontColor: '#eeeeee',
            image: '/d/system/badge/7/ac-image?size=384&v=base',
            resultImage: '/d/system/badge/7/ac-image?size=768&v=base',
        };
        const snapshot = publicPointLotteryBadgeAwardPrize(source, {
            awardedBadgeId: 7,
            badgeLevel: 1,
            badgeStyle,
        });
        assert.equal(snapshot.name, '十小时幸运奖');
        assert.equal(snapshot.awardedBadgeName, '幸运女神勋章');
        assert.equal(pointLotteryPrizeKey(snapshot), 'badge:7');
    });

    it('removes a newly won non-repeatable entry without mutating the configured pool', () => {
        const prizes = [normal(), badge()];
        const remaining = getPointLotteryPrizesAfterWin(prizes, prizes[0]);
        assert.deepEqual(remaining, [prizes[1]]);
        assert.equal(prizes.length, 2);
        assert.deepEqual(publicPointLotteryPrizes(prizes, remaining).map((prize) => prize.available), [false, true]);
    });

    it('winning a repeatable entry also excludes matching non-repeatable badge entries', () => {
        const prizes = [badge({ repeatable: true }), badge({ badgeDurationHours: 72 }), badge({ badgeId: 8 })];
        assert.equal(pointLotteryPrizeKey(prizes[0]), pointLotteryPrizeKey(prizes[1]));
        assert.deepEqual(getPointLotteryPrizesAfterWin(prizes, prizes[0]), [prizes[0], prizes[2]]);
    });

    it('never restores previously unavailable prizes and marks exhausted pools unavailable', () => {
        const prizes = [normal(), badge()];
        const remaining = getPointLotteryPrizesAfterWin([prizes[1]], prizes[1]);
        assert.deepEqual(remaining, []);
        assert.deepEqual(publicPointLotteryPrizes(prizes, remaining).map((prize) => prize.available), [false, false]);
    });
});
