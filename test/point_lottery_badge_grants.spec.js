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
                getDomains: async () => [{ _id: 'system' }, { _id: 'Scratch' }],
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

describe('student lottery badge validity from current scoped entitlements', () => {
    const validities = (prizes = [prize()], domain = { _id: 'system' }, uid = 10, now) => (
        lottery.getPointLotteryBadgeValidities(ctx, uid, prizes, domain, now)
    );
    const published = (result, overrides = {}) => lottery.publicPointLotteryBadgeAwardPrize(prize(overrides), result);

    it('exposes the first timed award and leaves configured pool duration unchanged', async () => {
        const result = await grant({ badgeDurationHours: 72 });
        assert.deepEqual(result.badgeValidity, { status: 'active', expiresAt: result.expiresAt.toISOString() });
        assert.equal(result.badgeAwardAction, 'granted');
        assert.equal(result.badgeDurationAddedHours, 72);
        const snapshot = published(result, { badgeDurationHours: 72 });
        assert.equal(snapshot.badgeDurationHours, 72);
        assert.deepEqual(snapshot.badgeValidity, result.badgeValidity);
        assert.deepEqual((await validities())[7], result.badgeValidity);
        assert.equal(Object.hasOwn(lottery.publicPointLotteryPrize(prize()), 'badgeValidity'), false);
    });

    it('refreshes old wins to the cumulative expiry after another timed win', async () => {
        const first = await grant({ badgeDurationHours: 24 });
        const firstSnapshot = published(first);
        const second = await grant({ badgeDurationHours: 72 });
        assert.equal(+second.expiresAt - +first.expiresAt, 72 * 3600 * 1000);
        assert.equal(second.badgeAwardAction, 'extended');
        assert.equal(second.badgeDurationAddedHours, 72);
        assert.deepEqual((await validities([firstSnapshot]))[7], second.badgeValidity);
        assert.notDeepEqual(firstSnapshot.badgeValidity, second.badgeValidity);
    });

    it('retains existing expiry for an upgrade and refreshes earlier reached states', async () => {
        const settings = { badgeDurationHours: 48, badgeRepeatEffect: 'upgrade', badgeUpgradeBadgeIds: [8, 9] };
        const first = await grant(settings);
        const second = await grant(settings);
        assert.equal(second.awardedBadgeId, 8);
        assert.equal(+second.expiresAt, +first.expiresAt);
        const third = await grant(settings);
        assert.equal(third.awardedBadgeId, 9);
        assert.deepEqual(third.badgeValidity, first.badgeValidity);
        assert.equal(first.badgeAwardAction, 'granted');
        assert.equal(first.badgeDurationAddedHours, 48);
        assert.equal(second.badgeAwardAction, 'upgraded');
        assert.equal(second.badgeDurationAddedHours, 0);
        assert.equal(third.badgeDurationAddedHours, 0);
        const result = await validities([published(first, settings), published(second, settings), published(third, settings)]);
        assert.deepEqual(result[7], third.badgeValidity);
        assert.deepEqual(result[8], third.badgeValidity);
        assert.deepEqual(result[9], third.badgeValidity);
    });

    it('uses a permanent manual entitlement even when the latest lottery grant is timed', async () => {
        await database.collection('badge').updateOne({ _id: 7 }, { $set: { users: [10] } });
        const result = await grant({ badgeDurationHours: 72 });
        assert.deepEqual(result.badgeValidity, { status: 'permanent' });
        assert.equal(result.badgeDurationAddedHours, 0);
        assert.deepEqual((await validities())[7], { status: 'permanent' });
        assert.ok((await grants())[0].expiresAt > new Date());
    });

    it('preserves permanent automatic ownership on a later timed win', async () => {
        const first = await grant({ badgeDurationHours: 0 });
        const second = await grant({ badgeDurationHours: 72 });
        assert.deepEqual(first.badgeValidity, { status: 'permanent' });
        assert.deepEqual(second.badgeValidity, { status: 'permanent' });
        assert.deepEqual((await validities())[7], { status: 'permanent' });
    });

    it('re-reads expiry edits and permanent/manual removal instead of trusting the draw snapshot', async () => {
        const result = await grant({ badgeDurationHours: 24 });
        const snapshot = published(result);
        const expiresAt = new Date(Date.now() + 9 * 24 * 3600 * 1000);
        await database.collection('lottery.badgeGrant').updateMany({ uid: 10 }, { $set: { expiresAt } });
        assert.deepEqual((await validities([snapshot]))[7], { status: 'active', expiresAt: expiresAt.toISOString() });
        await database.collection('badge').updateOne({ _id: 7 }, { $set: { users: [10] } });
        assert.deepEqual((await validities([snapshot]))[7], { status: 'permanent' });
        await database.collection('badge').updateOne({ _id: 7 }, { $set: { users: [] } });
        assert.deepEqual((await validities([snapshot]))[7], { status: 'active', expiresAt: expiresAt.toISOString() });
    });

    it('reports elapsed grants as expired before the expiry sweep removes userBadge', async () => {
        const result = await grant({ badgeDurationHours: 1 });
        const now = new Date(+result.expiresAt + 1);
        assert.deepEqual((await validities([published(result)], undefined, undefined, now))[7], {
            status: 'expired', expiresAt: result.expiresAt.toISOString(),
        });
        assert.equal((await owned()).length, 1);
    });

    it('reports revoked future grants as inactive rather than still owned', async () => {
        const result = await grant({ badgeDurationHours: 24 });
        await database.collection('lottery.badgeGrant').updateMany({ uid: 10 }, { $set: { expiredAt: new Date() } });
        assert.deepEqual((await validities())[7], { status: 'expired', expiresAt: result.expiresAt.toISOString() });
    });

    it('does not infer permanent ownership or reconstruct expiry from a legacy draw or stale userBadge', async () => {
        await database.collection('userBadge').insertOne({ owner: 10, badgeId: 7, getAt: new Date() });
        assert.deepEqual((await validities([prize({ badgeDurationHours: undefined })]))[7], { status: 'unknown' });
        assert.deepEqual((await validities([prize({ badgeDurationHours: 0 })]))[7], { status: 'unknown' });
        assert.deepEqual((await validities([{
            ...prize(), badgeValidity: { status: 'permanent' }, badgeExpiresAt: new Date(Date.now() + 999999),
        }]))[7], { status: 'unknown' });
    });

    it('does not interpret malformed grant expiry as permanent or expose an invalid timestamp', async () => {
        await database.collection('lottery.badgeGrant').insertMany([
            { uid: 10, badgeId: 7, expiresAt: null },
            { uid: 10, badgeId: 8, expiresAt: '2026-12-01T00:00:00.000Z' },
        ]);
        assert.deepEqual(await validities([prize(), prize({ badgeId: 8 })]), {
            7: { status: 'unknown' }, 8: { status: 'unknown' },
        });
    });

    it('isolates validity to the authorized uid and exact nonlegacy domain', async () => {
        await database.collection('badge').insertMany([
            badge(17, { domainId: 'class-a' }), badge(18, { domainId: 'class-b', users: [10] }),
        ]);
        const classA = { _id: 'class-a', workspaceId: 'teacher' };
        const classB = { _id: 'class-b', workspaceId: 'teacher' };
        const result = await grant({ badgeId: 17, badgeDurationHours: 24 }, classA);
        assert.deepEqual((await validities([prize({ badgeId: 17 })], classA))[17], result.badgeValidity);
        assert.deepEqual((await validities([prize({ badgeId: 17 })], classA, 11))[17], { status: 'unknown' });
        assert.deepEqual((await validities([prize({ badgeId: 17 })], classB))[17], { status: 'unknown' });
        assert.deepEqual((await validities([prize({ badgeId: 18 })], classA))[18], { status: 'unknown' });
        assert.deepEqual((await validities([prize({ badgeId: 17 })]))[17], { status: 'unknown' });
    });

    it('shares Tang global grants across legacy domains while excluding domain-owned grants', async () => {
        const result = await grant({ badgeDurationHours: 24 });
        assert.deepEqual((await validities([prize()], { _id: 'Scratch', workspaceId: 'tang' }))[7], result.badgeValidity);
        await database.collection('lottery.badgeGrant').insertOne({
            uid: 10, badgeId: 8, domainId: 'Scratch', grantedAt: new Date(),
        });
        assert.deepEqual((await validities([prize({ badgeId: 8 })], { _id: 'Scratch', workspaceId: 'tang' }))[8], {
            status: 'unknown',
        });
    });

    it('batches all badge cards into two ownership queries and skips an empty list', async () => {
        const reads = [];
        const countedCtx = { db: { collection(name) {
            return { find(query) { reads.push({ name, query }); return database.collection(name).find(query); } };
        } } };
        assert.deepEqual(await lottery.getPointLotteryBadgeValidities(countedCtx, 10, []), {});
        assert.equal(reads.length, 0);
        await lottery.getPointLotteryBadgeValidities(countedCtx, 10, Array.from({ length: 24 }, (_, index) => (
            prize({ badgeId: index + 1 })
        )), { _id: 'class-a', workspaceId: 'teacher' });
        assert.equal(reads.length, 2);
        assert.equal(reads.find((read) => read.name === 'badge').query.users, 10);
        assert.equal(reads.find((read) => read.name === 'lottery.badgeGrant').query.uid, 10);
        assert.ok(reads.every((read) => read.query.domainId === 'class-a'));
    });
});


describe('post-draw validity refresh for the student recent-win cards', () => {
    it('refreshes old prizes removed from current config across the shared legacy scope', async () => {
        const result = await grant({ badgeDurationHours: 24 });
        await database.collection('lottery.draw').insertOne({
            uid: 10, domainId: 'Scratch', createdAt: new Date(),
            prize: lottery.publicPointLotteryBadgeAwardPrize(prize(), result),
        });
        const expiresAt = new Date(Date.now() + 8 * 24 * 3600 * 1000);
        await database.collection('lottery.badgeGrant').updateMany({ uid: 10 }, { $set: { expiresAt } });
        const refreshed = await lottery.getPointLotteryRecentBadgeValidities(ctx, 10, [prize({ badgeId: 8 })], {
            _id: 'system', workspaceId: 'tang',
        });
        assert.deepEqual(refreshed[7], { status: 'active', expiresAt: expiresAt.toISOString() });
        assert.deepEqual(refreshed[8], { status: 'unknown' });
    });

    it('limits history to 24 nondeleted wins of the current uid and authorized domain', async () => {
        await database.collection('lottery.draw').insertMany([
            ...Array.from({ length: 25 }, (_, index) => ({
                uid: 10, domainId: 'class-a', createdAt: new Date(index * 1000), prize: prize({ badgeId: 20 + index }),
            })),
            { uid: 11, domainId: 'class-a', createdAt: new Date(), prize: prize({ badgeId: 80 }) },
            { uid: 10, domainId: 'class-b', createdAt: new Date(), prize: prize({ badgeId: 81 }) },
            { uid: 10, domainId: 'system', createdAt: new Date(), prize: prize({ badgeId: 82 }) },
            { uid: 10, domainId: 'class-a', deleted: true, createdAt: new Date(), prize: prize({ badgeId: 83 }) },
        ]);
        const result = await lottery.getPointLotteryRecentBadgeValidities(ctx, 10, [], {
            _id: 'class-a', workspaceId: 'teacher',
        });
        assert.deepEqual(Object.keys(result).map(Number), Array.from({ length: 24 }, (_, index) => index + 21));
        assert.ok(Object.values(result).every((value) => value.status === 'unknown'));
    });
});
