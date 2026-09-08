const assert = require('node:assert/strict');
const Module = require('node:module');
const { before, after, describe, it } = require('node:test');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

let database;
let client;
let server;
const databaseProxy = { collection: (name) => database.collection(name) };
const domains = {
    system: { _id: 'system' },
    Python: { _id: 'Python' },
    teacher: { _id: 'teacher', workspaceId: 'teacher' },
    classroom: { _id: 'classroom', workspaceId: 'teacher' },
    other: { _id: 'other', workspaceId: 'other' },
};
const workspace = { LEGACY_WORKSPACE_ID: 'tang', resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang' };
let points;
const originalLoad = Module._load;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/contest_score_points.ts')) {
            if (request === '../model/domain') return { get: async (id) => domains[id] };
            if (request === '../model/workspace') return workspace;
            if (request === '../service/db') return databaseProxy;
            if (request === './point_lottery') return {
                POINT_LOTTERY_POINTS_FIELD: 'lotteryPoints',
                POINT_LOTTERY_TOTAL_POINTS_FIELD: 'lotteryTotalPoints',
                ensureGlobalPointLotteryState: async () => {},
                pointLotteryUserColl: {
                    findOneAndUpdate: (...args) => database.collection('user').findOneAndUpdate(...args),
                    findOne: (...args) => database.collection('user').findOne(...args),
                    updateOne: (...args) => database.collection('user').updateOne(...args),
                },
                buildPointLotteryBadgeStyle: (domainId, badge) => ({
                    tooltip: badge.title,
                    backgroundColor: '#dbeafe',
                    fontColor: '#1e40af',
                }),
            };
        }
        if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/badge_honor_wall.ts')) {
            if (request === '../model/builtin') return { PRIV: {} };
            if (request === '../model/workspace') return workspace;
            if (request === './avatar') return () => '';
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    points = require('../packages/hydrooj/src/lib/contest_score_points');
} finally {
    Module._load = originalLoad;
}

before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    database = client.db('contest-points-test');
});
after(async () => {
    await client?.close();
    await server?.stop();
});

const badge = (id) => ({ id, name: `勋章 ${id}`, backgroundColor: '#dbeafe', fontColor: '#1e40af' });
const award = (uid, rid, score, badges = [badge(1), badge(2)]) => points.creditContestScorePoints(uid, 'contest', rid, score, badges);

describe('contest badge points in an actual MongoDB pipeline', () => {
    it('awards 110 points for a full score of 100 and two badges, beyond the maximum', async () => {
        await database.collection('user').insertOne({ _id: 11, lotteryPoints: 17, lotteryTotalPoints: 300 });
        const result = await award(11, 'first', 100);
        assert.equal(result.basePoints, 100);
        assert.equal(result.bonusPoints, 10);
        assert.equal(result.points, 110);
        assert.equal(result.contestPoints, 110);
        assert.equal(result.badgePercent, 10);
        assert.deepEqual(result.badges.map((item) => item.name), ['勋章 1', '勋章 2']);
        const account = await database.collection('user').findOne({ _id: 11 });
        assert.equal(account.lotteryPoints, 127);
        assert.equal(account.lotteryTotalPoints, 410);
    });

    it('credits only the score difference and never pays a duplicate or rejudge twice', async () => {
        await database.collection('user').insertOne({ _id: 12 });
        assert.equal((await award(12, 'a', 40)).points, 44);
        assert.equal((await award(12, 'b', 100)).points, 66);
        assert.equal((await award(12, 'c', 100)).points, 0);
        assert.equal((await award(12, 'd', 60)).points, 0);
        assert.equal((await award(12, 'b', 100)).points, 66);
        assert.equal((await database.collection('user').findOne({ _id: 12 })).lotteryPoints, 110);
    });

    it('serializes concurrent updates and retries without inflating the balance', async () => {
        await database.collection('user').insertOne({ _id: 13 });
        await Promise.all(Array.from({ length: 20 }, (_, index) => award(13, `${index}`, (index % 5 + 1) * 20)));
        const account = await database.collection('user').findOne({ _id: 13 });
        assert.equal(account.lotteryPoints, 110);
        assert.equal(account.lotteryTotalPoints, 110);
    });

    it('recovers interrupted record writes even after another submission receives points', async () => {
        await database.collection('user').insertOne({ _id: 16 });
        const first = await award(16, 'interrupted', 40);
        await award(16, 'later', 100);
        assert.deepEqual(await award(16, 'interrupted', 100), first);
        await points.acknowledgeContestScorePoints(16, 'interrupted');
        const account = await database.collection('user').findOne({ _id: 16 });
        assert.equal(account.contestScorePointPendingReceipts.length, 1);
        assert.equal(account.lotteryPoints, 110);
    });

    it('preserves fractional bonus across small gains and uses badges owned when points are earned', async () => {
        await database.collection('user').insertOne({ _id: 14 });
        assert.equal((await award(14, 'a', 1, [badge(1)])).bonusPoints, 0);
        assert.equal((await award(14, 'b', 20, [badge(1)])).bonusPoints, 1);
        assert.equal((await award(14, 'c', 20, [badge(1), badge(2)])).points, 0);
        assert.equal((await award(14, 'd', 30, [badge(1), badge(2)])).bonusPoints, 1);
        assert.equal((await award(14, 'e', 40, [])).bonusPoints, 0);
        assert.equal((await database.collection('user').findOne({ _id: 14 })).lotteryPoints, 42);
    });

    it('preserves the legacy base high-water mark and does not back-pay historic scores', async () => {
        await database.collection('user').insertOne({ _id: 15, lotteryPoints: 5, contestScorePointAwards: { contest: 80 } });
        assert.equal((await award(15, 'a', 80)).points, 0);
        const result = await award(15, 'b', 100);
        assert.equal(result.basePoints, 20);
        assert.equal(result.bonusPoints, 2);
        assert.equal(result.contestPoints, 102);
        assert.equal((await database.collection('user').findOne({ _id: 15 })).lotteryPoints, 27);
    });
});

describe('bonus badge scope and effective ownership', () => {
    it('uses all owned active badges once, excluding expired or old upgraded states', async () => {
        await database.collection('badge').insertMany([1, 2, 3, 4, 5].map((_id) => ({ _id, title: `徽章 ${_id}` })));
        await database.collection('userBadge').insertMany([1, 1, 2, 3, 4, 5].map((badgeId) => ({ owner: 20, badgeId })));
        await database.collection('lottery.badgeGrant').insertMany([
            { uid: 20, badgeId: 2, expiresAt: new Date('2026-09-01') },
            { uid: 20, badgeId: 4, sourceBadgeId: 3, repeatEffect: 'upgrade', stateHistory: [{ badgeId: 3 }] },
            { uid: 20, badgeId: 5, expiresAt: new Date('2026-09-10') },
        ]);
        const result = await points.getContestPointBadges('system', 'Python', 20, new Date('2026-09-08'));
        assert.deepEqual(result.map((item) => item.id), [1, 4, 5]);
    });

    it('selects a shared contest participant’s entry domain and rejects another workspace', async () => {
        await database.collection('badge').insertMany([
            { _id: 10, title: '来源域', domainId: 'teacher' },
            { _id: 11, title: '参赛域', domainId: 'classroom' },
            { _id: 12, title: '其他教师', domainId: 'other' },
        ]);
        await database.collection('userBadge').insertMany([
            { owner: 20, badgeId: 10, domainId: 'teacher' },
            { owner: 20, badgeId: 11, domainId: 'classroom' },
            { owner: 20, badgeId: 12, domainId: 'other' },
        ]);
        assert.deepEqual((await points.getContestPointBadges('teacher', 'classroom', 20)).map((item) => item.id), [11]);
        assert.deepEqual((await points.getContestPointBadges('teacher', 'other', 20)).map((item) => item.id), [10]);
    });
});
