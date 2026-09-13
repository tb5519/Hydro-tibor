const assert = require('node:assert/strict');
const Module = require('node:module');
const { before, beforeEach, after, describe, it } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

let database;
let client;
let server;
const schedules = [];
const warnings = [];
const proxy = { collection: (name) => new Proxy({}, {
    get: (_, method) => (...args) => database.collection(name)[method](...args),
}) };
const ctx = { db: proxy, logger: { warn: (...args) => warnings.push(args) } };
const originalLoad = Module._load;
let lottery;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/point_lottery.ts')) {
            if (request === '@hydrooj/utils') return { sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };
            if (request === '../model/builtin') return { PRIV: {} };
            if (request === '../model/system') return {};
            if (request === '../model/schedule') return { add: async (task) => schedules.push(task) };
            if (request === '../model/user') return { deleteUserCache: () => {} };
            if (request === '../model/workspace') return {
                LEGACY_WORKSPACE_ID: 'tang',
                resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang',
            };
            if (request === '../service/db') return proxy;
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    lottery = require('../packages/hydrooj/src/lib/point_lottery');
} finally {
    Module._load = originalLoad;
}

const prize = (extra = {}) => ({
    kind: 'badge', badgeId: 7, name: '自动徽章', image: '', probability: 10,
    pointDelta: 0, repeatable: true, broadcast: false,
    badgeRepeatEffect: 'duration', badgeDurationHours: 24, ...extra,
});
const badge = (id, extra = {}) => ({
    _id: id, title: `徽章 ${id}`, short: `徽章 ${id}`, users: [],
    backgroundColor: 'eef4ff', fontColor: '2563eb', ...extra,
});
const grant = (extra = {}, domain = { _id: 'system' }, uid = 10) => lottery.grantPointLotteryBadge(
    ctx, uid, prize(extra), domain, new ObjectId(),
);
const grants = () => database.collection('lottery.badgeGrant').find().sort({ _id: 1 }).toArray();
const owned = () => database.collection('userBadge').find({ owner: 10 }).sort({ badgeId: 1 }).toArray();

before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    database = client.db('point-lottery-badge-grants');
});
beforeEach(async () => {
    await database.dropDatabase();
    schedules.length = 0;
    warnings.length = 0;
    await database.collection('badge').insertMany([badge(7), badge(8), badge(9)]);
    await database.collection('user').insertMany([{ _id: 10 }, { _id: 11 }]);
});
after(async () => {
    await client?.close();
    await server?.stop();
});

describe('automatic lottery badge entitlements using actual MongoDB', () => {
    it('records permanent wins separately from manual assignments', async () => {
        const result = await grant({ badgeDurationHours: 0 });
        const [saved] = await grants();
        assert.equal(saved.source, 'lottery');
        assert.equal(saved.uid, 10);
        assert.equal(saved.badgeId, 7);
        assert.equal(saved.repeatEffect, 'duration');
        assert.equal(Object.hasOwn(saved, 'expiresAt'), false);
        assert.equal(Object.hasOwn(result, 'expiresAt'), false);
        assert.deepEqual((await database.collection('badge').findOne({ _id: 7 })).users, []);
        assert.deepEqual((await owned()).map((row) => row.badgeId), [7]);
        assert.equal(schedules.length, 0);
        await database.collection('lottery.badgeGrant').updateOne({ _id: saved._id }, { $set: { expiredAt: new Date() } });
        await lottery.removeLotteryBadgeIfUnreferenced(ctx, 10, 7, undefined, new Date());
        assert.equal((await owned()).length, 0);
        assert.equal((await database.collection('user').findOne({ _id: 10 })).badgeId, undefined);
    });

    it('keeps every concurrent duration win and accumulates the expiration once per win', async () => {
        await Promise.all(Array.from({ length: 4 }, () => grant({ badgeDurationHours: 1 })));
        const saved = await grants();
        assert.equal(saved.length, 4);
        assert.ok(saved.every((row) => row.source === 'lottery'));
        assert.equal(saved.at(-1).expiresAt - saved[0].expiresAt, 3 * 3600 * 1000);
        assert.equal((await owned()).length, 1);
        assert.equal(schedules.length, 4);
        assert.equal(await database.collection('lottery.badgeGrantLock').countDocuments({}), 0);
    });

    it('retains automatic permanent ownership on later timed draws without adding manual owners', async () => {
        await grant({ badgeDurationHours: 0 });
        const result = await grant({ badgeDurationHours: 1 });
        assert.equal((await grants()).length, 2);
        assert.ok((await grants()).every((row) => !row.expiresAt));
        assert.equal(result.expiresAt, undefined);
        assert.deepEqual((await database.collection('badge').findOne({ _id: 7 })).users, []);
    });

    it('keeps a timed automatic entitlement independent when the same badge was assigned manually', async () => {
        await database.collection('badge').updateOne({ _id: 7 }, { $set: { users: [10] } });
        const result = await grant({ badgeDurationHours: 1 });
        const [saved] = await grants();
        assert.equal(result.expiresAt, undefined);
        assert.ok(saved.expiresAt > new Date());
        await database.collection('lottery.badgeGrant').updateOne({ _id: saved._id }, { $set: { expiresAt: new Date(0) } });
        await lottery.expirePointLotteryBadgeGrant(ctx, { grantId: saved._id });
        assert.deepEqual((await owned()).map((row) => row.badgeId), [7]);
        assert.deepEqual((await database.collection('badge').findOne({ _id: 7 })).users, [10]);
        assert.equal((await database.collection('user').findOne({ _id: 10 })).badgeId, 7);
    });

    it('upgrades a permanent automatic badge into a manageable current-state grant', async () => {
        await grant({ badgeDurationHours: 0 });
        const result = await grant({ badgeRepeatEffect: 'upgrade', badgeUpgradeBadgeIds: [8, 9] });
        assert.equal(result.awardedBadgeId, 8);
        assert.equal(result.expiresAt, undefined);
        const chain = (await grants()).find((row) => row.repeatEffect === 'upgrade');
        assert.equal(chain.source, 'lottery');
        assert.equal(chain.badgeId, 8);
        assert.equal(chain.expiresAt, undefined);
        assert.deepEqual(chain.lotteryBadgeIds, [8]);
        assert.deepEqual((await database.collection('badge').find({}).toArray()).map((row) => row.users), [[], [], []]);
        assert.deepEqual((await owned()).map((row) => row.badgeId), [8]);
        const prior = (await grants()).find((row) => row.repeatEffect === 'duration');
        assert.ok(prior.expiredAt);
        assert.equal(String(prior.supersededByGrantId), String(chain._id));
    });

    it('preserves permanent awards from another automatic source when consuming a same-prize upgrade', async () => {
        await grant({ badgeDurationHours: 0 });
        const weekly = {
            _id: new ObjectId(), uid: 10, source: 'weekly_rp', sourceBadgeId: 7,
            badgeId: 7, repeatEffect: 'duration', grantedAt: new Date(),
        };
        await database.collection('lottery.badgeGrant').insertOne(weekly);
        await grant({ badgeRepeatEffect: 'upgrade', badgeUpgradeBadgeIds: [8, 9] });
        assert.deepEqual((await owned()).map((row) => row.badgeId), [7, 8]);
        assert.equal((await database.collection('lottery.badgeGrant').findOne({ _id: weekly._id })).expiredAt, undefined);
        const duration = (await grants()).find((row) => row.source === 'lottery' && row.repeatEffect === 'duration');
        assert.ok(duration.expiredAt);
    });

    it('does not mistake projected timed entitlements for permanent during an upgrade', async () => {
        const first = await grant({ badgeDurationHours: 2 });
        const upgraded = await grant({ badgeRepeatEffect: 'upgrade', badgeUpgradeBadgeIds: [8, 9] });
        assert.equal(upgraded.awardedBadgeId, 8);
        assert.equal(+upgraded.expiresAt, +first.expiresAt);
        const upgradedAgain = await grant({ badgeRepeatEffect: 'upgrade', badgeUpgradeBadgeIds: [8, 9] });
        assert.equal(upgradedAgain.awardedBadgeId, 9);
        assert.equal(+upgradedAgain.expiresAt, +first.expiresAt);
        const chain = (await grants()).find((row) => row.repeatEffect === 'upgrade');
        assert.deepEqual(chain.lotteryBadgeIds, [9]);
        assert.equal(+chain.expiresAt, +first.expiresAt);
        assert.deepEqual((await database.collection('badge').findOne({ _id: 9 })).users, []);
    });

    it('preserves the existing exclusive upgrade behavior for a teacher-assigned chain state', async () => {
        await database.collection('badge').updateOne({ _id: 7 }, { $set: { users: [10] } });
        await lottery.addLotteryBadgeToUser(ctx, 10, 7);
        const result = await grant({ badgeRepeatEffect: 'upgrade', badgeUpgradeBadgeIds: [8, 9] });
        assert.equal(result.awardedBadgeId, 8);
        assert.equal(result.expiresAt, undefined);
        assert.deepEqual((await database.collection('badge').findOne({ _id: 7 })).users, []);
        assert.deepEqual((await database.collection('badge').findOne({ _id: 8 })).users, [10]);
        assert.deepEqual((await owned()).map((row) => row.badgeId), [8]);
        const [saved] = await grants();
        await database.collection('lottery.badgeGrant').updateOne({ _id: saved._id }, { $set: { expiredAt: new Date() } });
        await lottery.removeLotteryBadgeIfUnreferenced(ctx, 10, 8, undefined, new Date());
        assert.deepEqual((await owned()).map((row) => row.badgeId), [8]);
    });

    it('reconciles automatic permanent upgrade chains without converting them into manual ownership', async () => {
        await grant({ badgeRepeatEffect: 'upgrade', badgeUpgradeBadgeIds: [8, 9], badgeDurationHours: 0 });
        await grant({ badgeRepeatEffect: 'upgrade', badgeUpgradeBadgeIds: [8, 9], badgeDurationHours: 0 });
        const [saved] = await grants();
        await database.collection('lottery.badgeGrant').updateOne({ _id: saved._id }, { $unset: { replacementStateVersion: '' } });
        await lottery.reconcileActivePointLotteryUpgradeBadgeStates(ctx);
        assert.deepEqual((await owned()).map((row) => row.badgeId), [8]);
        assert.deepEqual((await database.collection('badge').find({}).toArray()).map((row) => row.users), [[], [], []]);
        assert.equal((await grants())[0].replacementStateVersion, 1);
    });

    it('isolates grants, cleanup, and selected badges by exact badge scope', async () => {
        await database.collection('badge').insertOne(badge(17, { domainId: 'class-a' }));
        const domain = { _id: 'class-a', workspaceId: 'teacher' };
        await grant({ badgeId: 17, badgeDurationHours: 0 }, domain);
        const [saved] = await grants();
        assert.equal(saved.domainId, 'class-a');
        await lottery.removeLotteryBadgeIfUnreferenced(ctx, 10, 17, 'class-b', new Date());
        assert.equal((await owned()).length, 1);
        await database.collection('lottery.badgeGrant').updateOne({ _id: saved._id }, { $set: { expiredAt: new Date() } });
        await lottery.removeLotteryBadgeIfUnreferenced(ctx, 10, 17, 'class-a', new Date());
        assert.equal((await owned()).length, 0);
        assert.equal((await database.collection('user').findOne({ _id: 10 })).badgeId, undefined);
    });

    it('reschedules stale expiry tasks after a teacher extends the current entitlement', async () => {
        await grant({ badgeDurationHours: 1 });
        const [saved] = await grants();
        const extended = new Date(Date.now() + 5 * 3600 * 1000);
        await database.collection('lottery.badgeGrant').updateOne({ _id: saved._id }, { $set: { expiresAt: extended } });
        await lottery.expirePointLotteryBadgeGrant(ctx, { grantId: saved._id });
        assert.equal(+schedules.at(-1).executeAfter, +extended);
        assert.equal((await grants())[0].expiredAt, undefined);
        assert.equal((await owned()).length, 1);
    });
});
