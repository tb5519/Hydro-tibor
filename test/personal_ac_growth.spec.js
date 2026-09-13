const assert = require('node:assert/strict');
const Module = require('node:module');
const { before, beforeEach, after, describe, it } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
global.Hydro ||= { model: {} };
const { PRIV, PERM, STATUS } = require('../packages/hydrooj/src/model/builtin');

let database;
let client;
let server;
let aggregateCalls = 0;
let nextAggregateError;
let recordSequence = 0;
const platformAdmins = new Set();
const databaseProxy = {
    collection: (name) => new Proxy({}, {
        get: (_, method) => (...args) => {
            if (name === 'record' && method === 'aggregate') {
                aggregateCalls++;
                if (nextAggregateError) {
                    const error = nextAggregateError;
                    nextAggregateError = null;
                    return { toArray: async () => { throw error; } };
                }
            }
            return database.collection(name)[method](...args);
        },
    }),
};
const ctx = { db: databaseProxy };
const domainProxy = {
    coll: databaseProxy.collection('domain'),
    collUser: databaseProxy.collection('domain.user'),
    get: (id) => database.collection('domain').findOne({ _id: id }),
    getMulti: (query) => database.collection('domain').find(query),
};
const settings = {
    get: (key) => ({
        'workspace.enabled': true,
        'workspace.platformAdminUids': [...platformAdmins],
    })[key],
};
const recordTypes = {
    RECORD_PRETEST: new ObjectId('000000000000000000000000'),
    RECORD_GENERATE: new ObjectId('000000000000000000000001'),
};
let growth;
const originalLoad = Module._load;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/packages/hydrooj/src/model/workspace.ts')) {
            if (request === '../service/db') return databaseProxy;
            if (request === './domain') return domainProxy;
            if (request === './system') return settings;
        }
        if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/personal_ac_growth.ts')
            && request === '../model/record') return recordTypes;
        return originalLoad.call(this, request, parent, isMain);
    };
    growth = require('../packages/hydrooj/src/lib/personal_ac_growth');
} finally {
    Module._load = originalLoad;
}

const now = new Date('2026-09-13T12:00:00.000Z');
const recent = '2026-09-12T12:00:00.000Z';
const tangDomain = { _id: 'cpp', workspaceId: 'tang' };
const modernDomain = { _id: 'modern-a', workspaceId: 'modern' };
const getGrowth = (uid = 10, domain = tangDomain, zone = 'Asia/Shanghai', time = now) => (
    growth.getPersonalAcGrowth(ctx, domain, uid, zone, time)
);

function ac(uid, pid, domainId = 'cpp', date = recent, extra = {}) {
    const seconds = Math.floor(new Date(date).getTime() / 1000).toString(16).padStart(8, '0');
    return {
        _id: new ObjectId(`${seconds}${(++recordSequence).toString(16).padStart(16, '0')}`),
        uid, pid, domainId, status: STATUS.STATUS_ACCEPTED,
        ...extra,
    };
}

async function addStudent(uid, domainId = 'cpp', role = 'default', extra = {}) {
    await database.collection('user').updateOne({ _id: uid }, { $set: { priv: PRIV.PRIV_USER_PROFILE, ...extra } }, { upsert: true });
    await database.collection('domain.user').insertOne({ uid, domainId, join: true, role });
}

before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    database = client.db('personal-ac-growth-test');
});

beforeEach(async () => {
    await database.dropDatabase();
    growth.invalidatePersonalAcGrowth();
    aggregateCalls = 0;
    nextAggregateError = null;
    recordSequence = 0;
    platformAdmins.clear();
    await database.collection('domain').insertMany([
        { _id: 'system', owner: 2, roles: {} },
        { _id: 'cpp', owner: 2, workspaceId: 'tang', roles: {} },
        { _id: 'python', owner: 2, roles: {} },
        { _id: 'modern-a', owner: 50, workspaceId: 'modern', roles: {} },
        { _id: 'modern-b', owner: 50, workspaceId: 'modern', roles: {} },
        { _id: 'foreign', owner: 60, workspaceId: 'other', roles: {} },
    ]);
    await database.collection('workspace').insertMany([
        { _id: 'modern', code: 'modern', ownerUid: 50, status: 'active' },
        { _id: 'other', code: 'other', ownerUid: 60, status: 'active' },
    ]);
    await database.collection('workspace.member').insertMany([
        { workspaceId: 'modern', uid: 50, role: 'owner', status: 'active' },
        { workspaceId: 'other', uid: 60, role: 'owner', status: 'active' },
    ]);
    await addStudent(10);
    await addStudent(11);
});

after(async () => {
    await client?.close();
    await server?.stop();
});

describe('personal AC growth using actual MongoDB aggregates', () => {
    it('counts each first AC once, excluding repeat passes of problems first solved before the window', async () => {
        await database.collection('record').insertMany([
            ac(10, 1, 'cpp', '2026-07-01T00:00:00Z'), ac(10, 1),
            ac(10, 2), ac(10, 2), ac(10, 2),
            ac(10, 3, 'cpp', '2026-09-01T00:00:00Z'), ac(10, 3),
            ac(10, 4),
            ac(11, 2), ac(11, 3), ac(11, 4), ac(11, 5),
        ]);
        assert.deepEqual(await getGrowth(), {
            newAc7: 2, newAc30: 3,
            weeklyAc: { eligible: true, isTop: false, topCount: 4, gap: 2, scope: 'workspace' },
        });
    });

    it('uses local calendar-day boundaries for both windows, including DST changes', async () => {
        await database.collection('record').insertMany([
            ac(10, 1, 'cpp', '2026-09-06T15:59:59Z'),
            ac(10, 2, 'cpp', '2026-09-06T16:00:00Z'),
            ac(10, 3, 'cpp', '2026-08-14T15:59:59Z'),
            ac(10, 4, 'cpp', '2026-08-14T16:00:00Z'),
        ]);
        const shanghai = await getGrowth();
        assert.equal(shanghai.newAc7, 1);
        assert.equal(shanghai.newAc30, 3);
        const utc = await getGrowth(10, tangDomain, 'UTC');
        assert.equal(utc.newAc7, 0);
        assert.equal(utc.newAc30, 2);

        await database.collection('record').deleteMany({});
        growth.invalidatePersonalAcGrowth();
        await database.collection('record').insertMany([
            ac(10, 1, 'cpp', '2026-03-07T04:59:59Z'),
            ac(10, 2, 'cpp', '2026-03-07T05:00:00Z'),
        ]);
        const dst = await getGrowth(10, tangDomain, 'America/New_York', new Date('2026-03-13T12:00:00Z'));
        assert.equal(dst.newAc7, 1);
        assert.equal(dst.newAc30, 2);
    });

    it('rejects non-formal, non-AC, invalid-problem and future records while including formal contest ACs', async () => {
        await database.collection('record').insertMany([
            ac(10, 1, 'cpp', recent, { contest: recordTypes.RECORD_PRETEST }),
            ac(10, 2, 'cpp', recent, { contest: recordTypes.RECORD_GENERATE }),
            ac(10, 3, 'cpp', recent, { input: '' }),
            ac(10, 4, 'cpp', recent, { hackTarget: new ObjectId() }),
            ac(10, 5, 'cpp', recent, { files: { hack: 'input.txt' } }),
            ac(10, 6, 'cpp', recent, { status: STATUS.STATUS_WRONG_ANSWER }),
            ac(10, 0), ac(10, -1),
            ac(10, 7, 'cpp', '2026-09-14T12:00:00Z'),
            ac(10, 8, 'cpp', now),
            ac(10, 9, 'cpp', recent, { contest: new ObjectId() }),
        ]);
        const result = await getGrowth();
        assert.equal(result.newAc7, 2);
        assert.equal(result.newAc30, 2);
    });

    it('compares Tang students across all legacy domains without counting another workspace', async () => {
        await database.collection('record').insertMany([
            ac(10, 1, 'cpp'), ac(10, 1, 'python'), ac(10, 1, 'system'),
            ac(10, 2, 'modern-a'), ac(10, 3, 'foreign'),
            ac(11, 1, 'python'), ac(11, 2, 'python'), ac(11, 3, 'python'), ac(11, 4, 'python'),
        ]);
        const result = await getGrowth();
        assert.equal(result.newAc7, 3);
        assert.equal(result.weeklyAc.topCount, 4);
        assert.equal(result.weeklyAc.gap, 1);
        assert.equal(result.weeklyAc.scope, 'workspace');
        assert.deepEqual(await getGrowth(10, { _id: 'python' }), result);
    });

    it('limits a modern workspace to the current domain and keeps cache scopes separate', async () => {
        await addStudent(10, 'modern-a');
        await addStudent(11, 'modern-a');
        await database.collection('record').insertMany([
            ac(10, 1, 'modern-a'), ac(10, 2, 'modern-a'),
            ac(10, 3, 'modern-b'), ac(10, 4, 'cpp'), ac(10, 5, 'foreign'),
            ac(11, 1, 'modern-a'), ac(11, 2, 'modern-b'), ac(11, 3, 'modern-b'),
        ]);
        const result = await getGrowth(10, modernDomain);
        assert.equal(result.newAc7, 2);
        assert.deepEqual(result.weeklyAc, { eligible: true, isTop: true, topCount: 2, gap: 0, scope: 'domain' });
        assert.equal((await getGrowth()).newAc7, 1);
        assert.equal(aggregateCalls, 2);
    });

    it('excludes system admins, domain owners/root/custom admins, workspace staff and other-workspace users', async () => {
        await database.collection('domain').updateOne({ _id: 'python' }, { $set: { 'roles.class-manager': PERM.PERM_EDIT_DOMAIN.toString() } });
        await database.collection('domain').updateOne({ _id: 'cpp' }, { $set: { 'roles.student-helper': PERM.PERM_VIEW_PROBLEM.toString() } });
        const invalid = [2, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        for (const uid of invalid) await addStudent(uid);
        await database.collection('user').updateOne({ _id: 20 }, { $set: { priv: PRIV.PRIV_USER_PROFILE | PRIV.PRIV_EDIT_SYSTEM } });
        await database.collection('user').updateOne({ _id: 21 }, { $set: { priv: PRIV.PRIV_USER_PROFILE | PRIV.PRIV_MANAGE_ALL_DOMAIN } });
        await database.collection('user').updateOne({ _id: 22 }, { $set: { priv: PRIV.PRIV_USER_PROFILE | PRIV.PRIV_JUDGE } });
        platformAdmins.add(23);
        await database.collection('domain.user').updateOne({ uid: 24, domainId: 'cpp' }, { $set: { role: 'root' } });
        await database.collection('domain.user').insertOne({ uid: 25, domainId: 'python', role: 'class-manager', join: true });
        await database.collection('workspace.member').insertMany([
            { workspaceId: 'tang', uid: 26, role: 'teacher', status: 'active' },
            { workspaceId: 'tang', uid: 27, role: 'assistant', status: 'active' },
            { workspaceId: 'modern', uid: 28, role: 'assistant', status: 'active' },
        ]);
        await database.collection('workspace.student').insertOne({ workspaceId: 'modern', uid: 29, status: 'active' });
        await database.collection('domain.user').insertOne({ domainId: 'foreign', uid: 30, join: true, role: 'default' });
        await database.collection('user').updateOne({ _id: 31 }, { $set: { priv: 0 } });
        await database.collection('user').deleteOne({ _id: 32 });
        await database.collection('domain.user').updateOne({ uid: 33 }, { $set: { join: false } });
        await database.collection('domain.user').deleteOne({ uid: 34 });
        await addStudent(12, 'cpp', 'student-helper');
        await database.collection('record').insertMany([
            ac(10, 1), ac(12, 1), ac(12, 2),
            ...invalid.flatMap((uid) => Array.from({ length: 6 }, (_, index) => ac(uid, index + 1))),
        ]);
        const student = await getGrowth();
        assert.equal(student.weeklyAc.topCount, 2);
        assert.equal(student.weeklyAc.gap, 1);
        for (const uid of invalid) {
            const excluded = await getGrowth(uid);
            assert.equal(excluded.weeklyAc.eligible, false, `uid ${uid} must not be a ranked student`);
            assert.equal(excluded.weeklyAc.isTop, false, `uid ${uid} must not receive TOP1`);
            assert.equal(excluded.weeklyAc.topCount, 2);
        }
        assert.equal((await getGrowth(2)).newAc7, 6, 'an administrator can still see their own progress');
    });

    it('awards tied positive first places and does not award an empty or all-zero leaderboard', async () => {
        const empty = await getGrowth();
        assert.deepEqual(empty.weeklyAc, { eligible: true, isTop: false, topCount: 0, gap: 0, scope: 'workspace' });
        await database.collection('record').insertMany([ac(10, 1), ac(11, 1)]);
        growth.invalidatePersonalAcGrowth();
        assert.equal((await getGrowth(10)).weeklyAc.isTop, true);
        assert.equal((await getGrowth(11)).weeklyAc.isTop, true);
        await database.collection('domain.user').deleteMany({});
        const noStudents = await getGrowth(10);
        assert.equal(noStudents.newAc7, 1);
        assert.deepEqual(noStudents.weeklyAc, { eligible: false, isTop: false, topCount: 0, gap: 0, scope: 'workspace' });
    });

    it('shares one in-flight count aggregate between students and refreshes immediately when invalidated', async () => {
        await database.collection('record').insertOne(ac(10, 1));
        const results = await Promise.all([getGrowth(10), getGrowth(11), getGrowth(10)]);
        assert.equal(aggregateCalls, 1);
        assert.equal(results[0].newAc7, 1);
        assert.equal(results[1].weeklyAc.gap, 1);
        await database.collection('record').insertOne(ac(11, 2));
        assert.equal((await getGrowth(11)).newAc7, 0, 'cached result is reused before a record invalidation');
        growth.invalidatePersonalAcGrowth();
        assert.equal((await getGrowth(11)).newAc7, 1);
        assert.equal(aggregateCalls, 2);
    });

    it('rechecks privilege, role and workspace membership changes while a count cache is warm', async () => {
        await database.collection('record').insertMany([ac(10, 1), ac(11, 1), ac(11, 2)]);
        assert.equal((await getGrowth(11)).weeklyAc.isTop, true);
        await database.collection('domain.user').updateOne({ uid: 11, domainId: 'cpp' }, { $set: { role: 'root' } });
        const promoted = await getGrowth(11);
        assert.equal(promoted.newAc7, 2);
        assert.equal(promoted.weeklyAc.eligible, false);
        assert.equal(promoted.weeklyAc.topCount, 1);
        assert.equal(aggregateCalls, 1, 'role eligibility is refreshed even when the requested UID keeps the count cache key unchanged');
        await database.collection('domain.user').updateOne({ uid: 11, domainId: 'cpp' }, { $set: { role: 'default' } });
        await database.collection('user').updateOne({ _id: 11 }, { $set: { priv: PRIV.PRIV_USER_PROFILE | PRIV.PRIV_EDIT_SYSTEM } });
        assert.equal((await getGrowth(11)).weeklyAc.eligible, false);
        await database.collection('user').updateOne({ _id: 11 }, { $set: { priv: PRIV.PRIV_USER_PROFILE } });
        await database.collection('workspace.student').insertOne({ workspaceId: 'modern', uid: 11, status: 'active' });
        assert.equal((await getGrowth(11)).weeklyAc.eligible, false);
        await database.collection('workspace.student').deleteOne({ uid: 11 });
        assert.equal((await getGrowth(11)).weeklyAc.isTop, true);
        assert.equal(aggregateCalls, 1);
    });

    it('expires cached counts after 30 seconds without requiring another submission', async (t) => {
        const realNow = Date.now();
        t.mock.method(Date, 'now', () => realNow);
        await database.collection('record').insertOne(ac(10, 1));
        assert.equal((await getGrowth()).newAc7, 1);
        await database.collection('record').insertOne(ac(10, 2));
        Date.now.mock.mockImplementation(() => realNow + 30_001);
        assert.equal((await getGrowth()).newAc7, 2);
        assert.equal(aggregateCalls, 2);
    });

    it('changes the window at local midnight even while yesterday\'s cache remains warm', async () => {
        await database.collection('record').insertOne(ac(10, 1, 'cpp', '2026-09-06T17:00:00Z'));
        const beforeMidnight = await getGrowth(10, tangDomain, 'Asia/Shanghai', new Date('2026-09-13T15:59:59Z'));
        const afterMidnight = await getGrowth(10, tangDomain, 'Asia/Shanghai', new Date('2026-09-13T16:00:00Z'));
        assert.equal(beforeMidnight.newAc7, 1);
        assert.equal(afterMidnight.newAc7, 0);
        assert.equal(afterMidnight.newAc30, 1);
        assert.equal(aggregateCalls, 2);
    });

    it('removes rejected aggregates from cache so a transient database failure can recover', async () => {
        nextAggregateError = new Error('temporary database failure');
        await assert.rejects(getGrowth(), /temporary database failure/);
        await database.collection('record').insertOne(ac(10, 1));
        assert.equal((await getGrowth()).newAc7, 1);
        assert.equal(aggregateCalls, 2);
    });
});
