const assert = require('node:assert/strict');
const Module = require('node:module');
const { before, beforeEach, after, describe, it } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const moment = require('moment-timezone');

global.Hydro ||= { model: {} };
const { PRIV } = require('../packages/hydrooj/src/model/builtin');
let database;
let client;
let server;
let cacheInvalidations = 0;
const scheduled = [];
const warnings = [];
const databaseProxy = {
    collection: (name) => new Proxy({}, {
        get: (_, method) => (...args) => database.collection(name)[method](...args),
    }),
};
const domainProxy = {
    coll: databaseProxy.collection('domain'),
    collUser: databaseProxy.collection('domain.user'),
    get: (id) => database.collection('domain').findOne({ _id: id }),
    getMulti: (query) => database.collection('domain').find(query),
};
const settings = { get: (key) => ({ 'workspace.enabled': true, 'workspace.platformAdminUids': [] })[key] };
const ctx = {
    db: databaseProxy, logger: { warn: (...args) => warnings.push(args) },
    broadcast: (event) => { if (event === 'user/delcache') cacheInvalidations++; },
};
const now = new Date();
const past = new Date(now.getTime() - 86400000);
const future = new Date(now.getTime() + 86400000);
const later = new Date(now.getTime() + 3 * 86400000);
const dateInput = (value, zone = 'Asia/Shanghai') => moment(value).tz(zone).format('YYYY-MM-DDTHH:mm');
const tangDomain = { _id: 'cpp', workspaceId: 'tang' };
const modernDomain = { _id: 'modern-a', workspaceId: 'modern' };
let automatic;
let lottery;
const originalLoad = Module._load;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        const filename = parent?.filename || '';
        if (filename.endsWith('/packages/hydrooj/src/model/workspace.ts')) {
            if (request === '../service/db') return databaseProxy;
            if (request === './domain') return domainProxy;
            if (request === './system') return settings;
        }
        if (/\/packages\/hydrooj\/src\/lib\/(automatic_badge|point_lottery)\.ts$/.test(filename)) {
            if (request === '../service/db') return databaseProxy;
            if (request === '../model/domain') return domainProxy;
            if (request === '../model/system') return settings;
            if (request === '../model/schedule') return { add: async (task) => { scheduled.push(task); } };
            if (request === '../model/user') return { deleteUserCache: () => { cacheInvalidations++; } };
            if (request === './avatar') return (value) => `/avatar/${value || 'default'}`;
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    automatic = require('../packages/hydrooj/src/lib/automatic_badge');
    lottery = require('../packages/hydrooj/src/lib/point_lottery');
} finally {
    Module._load = originalLoad;
}

const list = (options = {}, domain = tangDomain) => automatic.getAutomaticBadgeManagement(ctx, domain, options, now);
const update = (key, options, domain = tangDomain) => automatic.updateAutomaticBadge(ctx, domain, {
    key, operatorUid: domain.workspaceId === 'modern' ? 50 : 2, timeZone: 'Asia/Shanghai', ...options,
}, now);

async function student(uid, domainId = 'cpp', uname = `学员 ${uid}`) {
    await database.collection('user').updateOne({ _id: uid }, { $set: { uname, avatar: '', priv: PRIV.PRIV_USER_PROFILE } }, { upsert: true });
    await database.collection('domain.user').updateOne({ uid, domainId }, { $set: { join: true, role: 'default' } }, { upsert: true });
}

async function badge(badgeId, extra = {}) {
    await database.collection('badge').insertOne({
        _id: badgeId, title: `徽章 ${badgeId}`, short: `★ ${badgeId}`, users: [],
        backgroundColor: '#eff6ff', fontColor: '#2563eb', ...extra,
    });
}

async function grant(uid, badgeId, extra = {}) {
    const doc = {
        _id: new ObjectId(), drawId: new ObjectId(), uid, badgeId, sourceBadgeId: badgeId,
        source: 'lottery', repeatEffect: 'duration', grantedAt: past, expiresAt: future, ...extra,
    };
    await database.collection('lottery.badgeGrant').insertOne(doc);
    await database.collection('userBadge').updateOne({
        owner: uid, badgeId, ...(doc.domainId ? { domainId: doc.domainId } : { domainId: { $exists: false } }),
    }, { $setOnInsert: {
        owner: uid, badgeId, ...(doc.domainId ? { domainId: doc.domainId } : {}), getAt: past,
    } }, { upsert: true });
    return doc;
}

async function row(uid, badgeId, domain = tangDomain, options = {}) {
    const result = await list({ status: 'all', ...options }, domain);
    const found = result.autoBadgeRows.find((item) => item.uid === uid && item.badgeId === badgeId);
    assert.ok(found, `Expected an automatic badge row for ${uid}/${badgeId}`);
    assert.equal(typeof found.key, 'string');
    assert.ok(found.key.length > 0);
    return found;
}

before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    database = client.db('automatic-badge-management-test');
});

beforeEach(async () => {
    await database.dropDatabase();
    cacheInvalidations = 0;
    scheduled.length = 0;
    warnings.length = 0;
    await database.collection('domain').insertMany([
        { _id: 'system', owner: 2 }, { _id: 'cpp', owner: 2, workspaceId: 'tang' },
        { _id: 'python', owner: 2 }, { _id: 'modern-a', owner: 50, workspaceId: 'modern' },
        { _id: 'modern-b', owner: 50, workspaceId: 'modern' }, { _id: 'foreign', owner: 60, workspaceId: 'other' },
    ]);
    await database.collection('workspace').insertMany([
        { _id: 'modern', code: 'modern', ownerUid: 50, status: 'active' },
        { _id: 'other', code: 'other', ownerUid: 60, status: 'active' },
    ]);
    await database.collection('workspace.member').insertMany([
        { workspaceId: 'modern', uid: 50, role: 'owner', status: 'active' },
        { workspaceId: 'other', uid: 60, role: 'owner', status: 'active' },
    ]);
    await student(10, 'cpp', '君豪');
    await student(11, 'python', '小明');
    await student(20, 'modern-a');
    await student(21, 'modern-b');
    await badge(1);
    await badge(2);
    await badge(3);
});

after(async () => {
    await client?.close();
    await server?.stop();
});

describe('automatic badge management with actual MongoDB documents and expiry worker', () => {
    it('expires Sunday morning weekly awards at 22:00 that same Sunday in Shanghai', () => {
        assert.equal(
            automatic.nextWeeklyAutomaticBadgeExpiry(new Date('2026-09-13T00:00:00.000Z')).toISOString(),
            '2026-09-13T14:00:00.000Z',
        );
    });

    it('starts a fresh weekly period at the exact Sunday 22:00 boundary in Shanghai', () => {
        assert.equal(
            automatic.nextWeeklyAutomaticBadgeExpiry(new Date('2026-09-13T14:00:00.000Z')).toISOString(),
            '2026-09-20T14:00:00.000Z',
        );
    });

    it('expires Wednesday weekly awards at 22:00 on the upcoming Sunday in Shanghai', () => {
        assert.equal(
            automatic.nextWeeklyAutomaticBadgeExpiry(new Date('2026-09-09T00:00:00.000Z')).toISOString(),
            '2026-09-13T14:00:00.000Z',
        );
    });

    it('merges repeat timed awards and updates every effective source to the selected deadline', async () => {
        const first = await grant(10, 1);
        const second = await grant(10, 1, { expiresAt: later });
        const expired = await grant(10, 1, { expiresAt: past, expiredAt: past });
        const result = await list();
        assert.equal(result.autoBadgeTotal, 1);
        assert.equal(result.autoBadgeRows.length, 1);
        const entry = await row(10, 1);
        await update(entry.key, { expiresAt: dateInput(later) });
        const expected = moment.tz(dateInput(later), 'Asia/Shanghai').toDate();
        for (const id of [first._id, second._id]) {
            const changed = await database.collection('lottery.badgeGrant').findOne({ _id: id });
            assert.equal(changed.expiresAt.getTime(), expected.getTime());
            assert.equal(changed.expiredAt, undefined);
        }
        const unchanged = await database.collection('lottery.badgeGrant').findOne({ _id: expired._id });
        assert.equal(unchanged.expiredAt.getTime(), past.getTime());
        assert.equal(unchanged.expiresAt.getTime(), past.getTime());
        assert.ok(cacheInvalidations > 0);
        assert.equal(scheduled.length, 2);
    });

    it('makes automatic ownership permanent without adding a manual teacher assignment', async () => {
        const first = await grant(10, 1);
        const second = await grant(10, 1, { expiresAt: later });
        await update((await row(10, 1)).key, { permanent: true });
        const sources = await database.collection('lottery.badgeGrant').find({ _id: { $in: [first._id, second._id] } }).toArray();
        assert.ok(sources.every((item) => !item.expiresAt && !item.expiredAt));
        assert.deepEqual((await database.collection('badge').findOne({ _id: 1 })).users, []);
        assert.equal(await database.collection('userBadge').countDocuments({ owner: 10, badgeId: 1 }), 1);
        assert.equal(scheduled.length, 0);
        assert.equal((await list()).autoBadgeTotal, 1);
    });

    it('renews an expired group and restores its visible entitlement', async () => {
        const old = await grant(10, 1, { expiresAt: past, expiredAt: past });
        await database.collection('userBadge').deleteMany({ owner: 10, badgeId: 1 });
        assert.equal((await list({ status: 'active' })).autoBadgeTotal, 0);
        assert.equal((await list({ status: 'expired' })).autoBadgeTotal, 1);
        await update((await row(10, 1)).key, { expiresAt: dateInput(later) });
        const renewed = await database.collection('lottery.badgeGrant').findOne({ _id: old._id });
        assert.equal(renewed.expiredAt, undefined);
        assert.ok(renewed.expiresAt > now);
        assert.equal(await database.collection('userBadge').countDocuments({ owner: 10, badgeId: 1 }), 1);
        assert.equal((await list({ status: 'active' })).autoBadgeTotal, 1);
        assert.equal((await list({ status: 'expired' })).autoBadgeTotal, 0);
    });

    it('removes all automatic sources and the selected badge while retaining the award history', async () => {
        const first = await grant(10, 1);
        const second = await grant(10, 1);
        await database.collection('user').updateOne({ _id: 10 }, { $set: { badgeId: 1, badge: 'selected', badgeDomainId: null } });
        const entry = await row(10, 1);
        await update(entry.key, { remove: true });
        assert.equal(await database.collection('lottery.badgeGrant').countDocuments({ uid: 10, badgeId: 1 }), 2);
        assert.equal(await database.collection('userBadge').countDocuments({ owner: 10, badgeId: 1 }), 0);
        assert.equal((await database.collection('user').findOne({ _id: 10 })).badgeId, undefined);
        for (const id of [first._id, second._id]) {
            const history = await database.collection('lottery.badgeGrant').findOne({ _id: id });
            assert.ok(history.expiredAt);
        }
        assert.equal((await list({ status: 'active' })).autoBadgeTotal, 0);
        assert.ok(cacheInvalidations > 0);
    });

    it('preserves a teacher assignment when automatic ownership overlaps or is removed', async () => {
        await database.collection('badge').updateOne({ _id: 1 }, { $set: { users: [10] } });
        await grant(10, 1);
        await database.collection('user').updateOne({ _id: 10 }, { $set: { badgeId: 1, badge: 'selected', badgeDomainId: null } });
        await update((await row(10, 1)).key, { remove: true });
        assert.deepEqual((await database.collection('badge').findOne({ _id: 1 })).users, [10]);
        assert.equal(await database.collection('userBadge').countDocuments({ owner: 10, badgeId: 1 }), 1);
        assert.equal((await database.collection('user').findOne({ _id: 10 })).badgeId, 1);
        assert.equal((await list({ status: 'active' })).autoBadgeTotal, 0);
    });

    it('does not offer obsolete upgraded states for renewal or revive them using an old row key', async () => {
        const old = await grant(10, 1, { repeatEffect: 'upgrade', sourceBadgeId: 1, lotteryBadgeIds: [1], level: 1 });
        const oldKey = (await row(10, 1)).key;
        await database.collection('lottery.badgeGrant').updateOne({ _id: old._id }, {
            $set: { expiredAt: now, supersededAt: now },
        });
        await grant(10, 2, {
            repeatEffect: 'upgrade', sourceBadgeId: 1, lotteryBadgeIds: [2], awardedBadgeIds: [1, 2],
            stateHistory: [{ badgeId: 1, level: 1 }, { badgeId: 2, level: 2 }], level: 2,
        });
        const all = await list({ status: 'all' });
        assert.deepEqual(all.autoBadgeRows.map((item) => item.badgeId), [2]);
        await assert.rejects(update(oldKey, { permanent: true }));
        assert.ok((await database.collection('lottery.badgeGrant').findOne({ _id: old._id })).supersededAt);
        assert.equal((await row(10, 2)).badgeId, 2);
    });

    it('rejects missing, malformed, impossible and elapsed expiry values without changing ownership', async () => {
        const original = await grant(10, 1);
        const key = (await row(10, 1)).key;
        const invalid = ['', 'tomorrow', '2026-02-30T10:00', '2026-13-01T10:00', dateInput(past)];
        for (const expiresAt of invalid) await assert.rejects(update(key, { expiresAt }));
        await assert.rejects(update(key, {}));
        const current = await database.collection('lottery.badgeGrant').findOne({ _id: original._id });
        assert.equal(current.expiresAt.getTime(), original.expiresAt.getTime());
        assert.equal(current.expiredAt, undefined);
        assert.equal(cacheInvalidations, 0);
    });

    it('ignores a stale expiry job after renewal and after conversion to permanent ownership', async () => {
        const old = await grant(10, 1, { expiresAt: past });
        const key = (await row(10, 1)).key;
        await update(key, { expiresAt: dateInput(later) });
        await lottery.expirePointLotteryBadgeGrant(ctx, { grantId: old._id });
        let current = await database.collection('lottery.badgeGrant').findOne({ _id: old._id });
        assert.equal(current.expiredAt, undefined);
        assert.equal(await database.collection('userBadge').countDocuments({ owner: 10, badgeId: 1 }), 1);
        assert.ok(scheduled.length >= 2);
        await update((await row(10, 1)).key, { permanent: true });
        const scheduledBefore = scheduled.length;
        await lottery.expirePointLotteryBadgeGrant(ctx, { grantId: old._id });
        current = await database.collection('lottery.badgeGrant').findOne({ _id: old._id });
        assert.equal(current.expiresAt, undefined);
        assert.equal(current.expiredAt, undefined);
        assert.equal(scheduled.length, scheduledBefore);
    });

    it('uses Tang’s shared scope across legacy domains while excluding other workspaces', async () => {
        await grant(10, 1);
        await grant(11, 1);
        await grant(20, 1);
        await grant(21, 1);
        await badge(20, { domainId: 'modern-a' });
        await grant(20, 20, { domainId: 'modern-a' });
        const cpp = await list({ status: 'all' });
        const python = await list({ status: 'all' }, { _id: 'python' });
        assert.deepEqual(cpp.autoBadgeRows.map((item) => item.uid).sort(), [10, 11]);
        assert.deepEqual(python.autoBadgeRows.map((item) => item.key).sort(), cpp.autoBadgeRows.map((item) => item.key).sort());
        const foreignKey = (await row(20, 20, modernDomain)).key;
        await assert.rejects(update(foreignKey, { remove: true }));
        assert.equal(await database.collection('userBadge').countDocuments({ owner: 20, badgeId: 20, domainId: 'modern-a' }), 1);
    });

    it('keeps modern domain management isolated, including when a guessed or foreign key is posted', async () => {
        await badge(20, { domainId: 'modern-a' });
        await badge(21, { domainId: 'modern-b' });
        await grant(20, 20, { domainId: 'modern-a' });
        await grant(21, 21, { domainId: 'modern-b' });
        await grant(10, 1);
        const mine = await list({ status: 'all' }, modernDomain);
        assert.equal(mine.autoBadgeTotal, 1);
        assert.equal(mine.autoBadgeRows[0].uid, 20);
        const siblingKey = (await row(21, 21, { _id: 'modern-b', workspaceId: 'modern' })).key;
        const globalKey = (await row(10, 1)).key;
        await assert.rejects(update(siblingKey, { remove: true }, modernDomain));
        await assert.rejects(update(globalKey, { remove: true }, modernDomain));
        await assert.rejects(update('not-a-real-key', { permanent: true }, modernDomain));
        assert.equal(await database.collection('userBadge').countDocuments({ owner: 21, badgeId: 21, domainId: 'modern-b' }), 1);
    });

    it('rejects a stale key after the student has moved into another workspace', async () => {
        await badge(20, { domainId: 'modern-a' });
        await grant(20, 20, { domainId: 'modern-a' });
        const key = (await row(20, 20, modernDomain)).key;
        // An old joined-domain row can remain after the primary workspace changes.
        await database.collection('workspace.student').insertOne({ workspaceId: 'other', uid: 20, status: 'active' });
        assert.equal((await list({ status: 'all' }, modernDomain)).autoBadgeTotal, 0);
        await assert.rejects(update(key, { remove: true }, modernDomain));
        assert.equal(await database.collection('userBadge').countDocuments({ owner: 20, badgeId: 20, domainId: 'modern-a' }), 1);
    });

    it('rejects stale revisions after another teacher changes the same automatic award', async () => {
        const original = await grant(10, 1);
        const key = (await row(10, 1)).key;
        await update(key, { expiresAt: dateInput(later) });
        await assert.rejects(update(key, { remove: true }));
        const current = await database.collection('lottery.badgeGrant').findOne({ _id: original._id });
        assert.equal(current.revokedAt, undefined);
        assert.equal(current.updatedBy, 2);
        assert.equal((await list()).autoBadgeTotal, 1);
    });

    it('searches student and badge labels literally and paginates without duplicates', async () => {
        await database.collection('badge').updateOne({ _id: 1 }, { $set: { title: '幸运女神 [A]' } });
        await grant(10, 1);
        await grant(11, 2);
        assert.equal((await list({ query: '君豪' })).autoBadgeTotal, 1);
        assert.equal((await list({ query: '幸运女神' })).autoBadgeTotal, 1);
        assert.equal((await list({ query: '[A]' })).autoBadgeTotal, 1);
        assert.equal((await list({ query: '.*' })).autoBadgeTotal, 0);
        for (let uid = 100; uid < 165; uid++) {
            await student(uid);
            await grant(uid, 1);
        }
        const first = await list({ page: 1 });
        assert.equal(first.autoBadgeTotal, 67);
        assert.ok(first.autoBadgePageCount > 1);
        assert.equal(first.autoBadgePage, 1);
        const seen = new Set();
        for (let page = 1; page <= first.autoBadgePageCount; page++) {
            const result = await list({ page });
            for (const entry of result.autoBadgeRows) {
                assert.equal(seen.has(entry.key), false);
                seen.add(entry.key);
            }
        }
        assert.equal(seen.size, 67);
    });

    it('omits manual-only assignments, deleted badge definitions and missing students', async () => {
        await database.collection('badge').updateOne({ _id: 1 }, { $set: { users: [10] } });
        await database.collection('userBadge').insertOne({ owner: 10, badgeId: 1 });
        await grant(11, 2);
        await grant(10, 999);
        await grant(999, 3);
        const result = await list({ status: 'all' });
        assert.equal(result.autoBadgeTotal, 1);
        assert.equal(result.autoBadgeRows[0].uid, 11);
        assert.equal(result.autoBadgeRows[0].badgeId, 2);
    });

    it('migrates existing weekly automatic owners exactly once and leaves later manual assignments alone', async () => {
        await database.collection('badge').updateOne({ _id: 1 }, { $set: { users: [10, 11] } });
        await database.collection('userBadge').insertMany([
            { owner: 10, badgeId: 1, getAt: past }, { owner: 11, badgeId: 1, getAt: now },
        ]);
        await automatic.migrateWeeklyAutomaticBadge(ctx, 1, 'weekly_ac', future);
        const grants = await database.collection('lottery.badgeGrant').find({ badgeId: 1 }).toArray();
        assert.equal(grants.length, 2);
        assert.deepEqual(grants.map((item) => item.uid).sort(), [10, 11]);
        assert.ok(grants.every((item) => item.source === 'weekly_ac' && item.expiresAt.getTime() === future.getTime()));
        assert.deepEqual((await database.collection('badge').findOne({ _id: 1 })).users, []);
        assert.equal(await database.collection('userBadge').countDocuments({ badgeId: 1 }), 2);
        await database.collection('badge').updateOne({ _id: 1 }, { $addToSet: { users: 20 } });
        await automatic.migrateWeeklyAutomaticBadge(ctx, 1, 'weekly_ac', later);
        assert.equal(await database.collection('lottery.badgeGrant').countDocuments({ badgeId: 1 }), 2);
        assert.deepEqual((await database.collection('badge').findOne({ _id: 1 })).users, [20]);
        assert.equal(scheduled.length, 2);
    });

    it('makes weekly grants idempotent and does not let a scheduled retry resurrect a teacher removal', async () => {
        await automatic.awardWeeklyAutomaticBadge(ctx, 1, 10, 'weekly_rp', future);
        await automatic.awardWeeklyAutomaticBadge(ctx, 1, 10, 'weekly_rp', future);
        assert.equal(await database.collection('lottery.badgeGrant').countDocuments({ uid: 10, badgeId: 1 }), 1);
        assert.equal(await database.collection('userBadge').countDocuments({ owner: 10, badgeId: 1 }), 1);
        assert.equal((await row(10, 1)).sourcesText, '每周排行奖励');
        const entry = await row(10, 1);
        await update(entry.key, { remove: true });
        await automatic.awardWeeklyAutomaticBadge(ctx, 1, 10, 'weekly_rp', future);
        assert.equal(await database.collection('userBadge').countDocuments({ owner: 10, badgeId: 1 }), 0);
        assert.equal((await list()).autoBadgeTotal, 0);
        assert.equal(await database.collection('lottery.badgeGrant').countDocuments({ uid: 10, badgeId: 1 }), 1);
        assert.equal(scheduled.length, 1);
    });

    it('keeps a teacher-extended weekly badge when a new weekly award rotates to another student', async () => {
        await automatic.awardWeeklyAutomaticBadge(ctx, 1, 10, 'weekly_ac', future);
        const original = await database.collection('lottery.badgeGrant').findOne({ uid: 10, badgeId: 1 });
        await update((await row(10, 1)).key, { expiresAt: dateInput(later) });
        await automatic.awardWeeklyAutomaticBadge(ctx, 1, 11, 'weekly_ac', later);
        await lottery.expirePointLotteryBadgeGrant(ctx, { grantId: original._id });
        const previous = await database.collection('lottery.badgeGrant').findOne({ _id: original._id });
        assert.equal(previous.expiredAt, undefined);
        assert.ok(previous.teacherAdjustedAt);
        assert.equal(previous.expiresAt.getTime(), moment.tz(dateInput(later), 'Asia/Shanghai').valueOf());
        assert.deepEqual((await list()).autoBadgeRows.map((item) => item.uid).sort(), [10, 11]);
        assert.equal(await database.collection('userBadge').countDocuments({ badgeId: 1 }), 2);
        assert.deepEqual((await database.collection('badge').findOne({ _id: 1 })).users, []);
    });

    it('imports legacy permanent lottery provenance conservatively and never consumes a manual assignment', async () => {
        await database.collection('badge').updateOne({ _id: 1 }, { $set: { users: [10] } });
        await database.collection('userBadge').insertOne({ owner: 10, badgeId: 1, getAt: past });
        await database.collection('lottery.draw').insertMany([
            { _id: new ObjectId(), domainId: 'cpp', uid: 10, createdAt: past, prize: { kind: 'badge', badgeId: 1, badgeDurationHours: 0 } },
            { _id: new ObjectId(), domainId: 'python', uid: 10, createdAt: past, prize: { kind: 'badge', badgeId: 1, badgeDurationHours: 0 } },
        ]);
        await automatic.importLegacyLotteryAutomaticBadges(ctx, tangDomain);
        await automatic.importLegacyLotteryAutomaticBadges(ctx, tangDomain);
        const imported = await database.collection('lottery.badgeGrant').find({ uid: 10, badgeId: 1 }).toArray();
        assert.equal(imported.length, 1);
        assert.equal(imported[0].source, 'lottery');
        assert.equal(imported[0].legacyManualOverlap, true);
        assert.equal(imported[0].expiresAt, undefined);
        const entry = await row(10, 1);
        assert.equal(entry.manualOverlap, true);
        await update(entry.key, { remove: true });
        await automatic.importLegacyLotteryAutomaticBadges(ctx, tangDomain);
        assert.equal((await list()).autoBadgeTotal, 0);
        assert.deepEqual((await database.collection('badge').findOne({ _id: 1 })).users, [10]);
        assert.equal(await database.collection('userBadge').countDocuments({ owner: 10, badgeId: 1 }), 1);
    });

    it('does not import timed, superseded upgrade, unowned or other-workspace lottery history', async () => {
        await database.collection('badge').updateMany({ _id: { $in: [1, 2, 3] } }, { $set: { users: [10, 11, 20] } });
        await database.collection('userBadge').insertMany([
            { owner: 10, badgeId: 1 }, { owner: 10, badgeId: 2 }, { owner: 20, badgeId: 3 },
        ]);
        await database.collection('lottery.draw').insertMany([
            { _id: new ObjectId(), domainId: 'cpp', uid: 10, prize: { kind: 'badge', badgeId: 1, badgeDurationHours: 24 } },
            { _id: new ObjectId(), domainId: 'cpp', uid: 10, prize: { kind: 'badge', badgeId: 2, badgeDurationHours: 0, badgeRepeatEffect: 'upgrade' } },
            { _id: new ObjectId(), domainId: 'python', uid: 11, prize: { kind: 'badge', badgeId: 3, badgeDurationHours: 0 } },
            { _id: new ObjectId(), domainId: 'cpp', uid: 20, prize: { kind: 'badge', badgeId: 3, badgeDurationHours: 0 } },
        ]);
        await automatic.importLegacyLotteryAutomaticBadges(ctx, tangDomain);
        assert.equal(await database.collection('lottery.badgeGrant').countDocuments({}), 0);
    });
});
