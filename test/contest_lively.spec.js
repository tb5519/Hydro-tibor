/* eslint-disable no-await-in-loop */
const assert = require('node:assert/strict');
const Module = require('node:module');
const { after, before, beforeEach, describe, it } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

let database;
let client;
let server;
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
    if (parent?.filename.endsWith('/packages/hydrooj/src/lib/contest_lively.ts')) {
        if (request === '../model/document') return { TYPE_CONTEST: 30 };
        if (request === '../service/db') return {};
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { getContestLivelyWindow, getDisplayAttend, runContestLively } = require('../packages/hydrooj/src/lib/contest_lively');
Module._load = originalLoad;

const at = (time, day = '2026-09-13') => new Date(`${day}T${time}+08:00`);
const coll = () => database.collection('document');
const run = (time, random = () => 0, day) => runContestLively(at(time, day), random, coll());
async function seed(extra = {}) {
    const tdoc = {
        _id: new ObjectId(), docId: new ObjectId(), docType: 30, rule: 'ioi',
        domainId: 'system', attend: 12, lively: true, livelyBonus: 0,
        livelyEnabledAt: at('12:00:00'), beginAt: at('15:00:00'),
        endAt: at('23:59:00', '2026-09-30'),
        ...extra,
    };
    await coll().insertOne(tdoc);
    return tdoc;
}
async function read(tdoc) {
    return coll().findOne({ _id: tdoc._id });
}

before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    database = client.db('contest-lively-test');
});
beforeEach(async () => { await database.dropDatabase(); });
after(async () => {
    await client?.close();
    await server?.stop();
});

describe('contest display attendance schedule', () => {
    it('uses Shanghai days independently of the server timezone', () => {
        const window = getContestLivelyWindow(new Date('2026-09-13T17:00:00Z'));
        assert.equal(window.day, '2026-09-14');
        assert.equal(window.startAt.toISOString(), '2026-09-14T11:00:00.000Z');
        assert.equal(window.endAt.toISOString(), '2026-09-14T15:00:00.000Z');
    });

    it('adds decoration only when enabled and keeps malformed counts harmless', () => {
        assert.equal(getDisplayAttend({ attend: 12, lively: true, livelyBonus: 8 }), 20);
        assert.equal(getDisplayAttend({ attend: 12, lively: false, livelyBonus: 8 }), 12);
        assert.equal(getDisplayAttend({ attend: 12 }), 12);
        assert.equal(getDisplayAttend({ attend: -3, lively: true, livelyBonus: Infinity }), 0);
    });

    it('does no work before 19:00 or from 23:00 onward', async () => {
        const tdoc = await seed();
        for (const time of ['18:59:59', '23:00:00', '23:59:59']) {
            assert.deepEqual(await run(time), { scheduled: 0, awarded: 0, added: 0 });
        }
        assert.deepEqual(await read(tdoc), tdoc);
    });

    it('persists the random scheduled time and applies only when it is due', async () => {
        const tdoc = await seed();
        assert.deepEqual(await run('19:00:00', (max) => max - 1), { scheduled: 1, awarded: 0, added: 0 });
        let saved = await read(tdoc);
        assert.equal(saved.livelyDay, '2026-09-13');
        assert.equal(saved.livelyScheduledAt.toISOString(), at('22:59:00').toISOString());
        assert.deepEqual(await run('22:58:59', () => 0), { scheduled: 0, awarded: 0, added: 0 });
        assert.deepEqual(await run('22:59:00', (max) => max - 1), { scheduled: 0, awarded: 1, added: 2 });
        saved = await read(tdoc);
        assert.equal(saved.livelyBonus, 2);
        assert.equal(saved.attend, 12);
        assert.equal(saved.livelyScheduledAt, undefined);
    });

    it('completes a zero day once even after repeated polling and re-enabling', async () => {
        const tdoc = await seed();
        assert.deepEqual(await run('19:00:00'), { scheduled: 1, awarded: 1, added: 0 });
        await coll().updateOne({ _id: tdoc._id }, { $set: { lively: false } });
        await run('20:00:00', () => 2);
        await coll().updateOne({ _id: tdoc._id }, { $set: { lively: true, livelyEnabledAt: at('20:30:00') } });
        assert.deepEqual(await run('21:00:00', () => 2), { scheduled: 0, awarded: 0, added: 0 });
        const saved = await read(tdoc);
        assert.equal(saved.livelyBonus, 0);
        assert.equal(saved.livelyScheduledAt, undefined);
    });

    it('supports each of the 0, 1 and 2 outcomes', async () => {
        for (const amount of [0, 1, 2]) {
            const tdoc = await seed({ livelyDay: '2026-09-13', livelyScheduledAt: at('19:00:00') });
            await run('19:01:00', () => amount);
            assert.equal((await read(tdoc)).livelyBonus, amount);
        }
    });

    it('allows only one award under concurrent processes', async () => {
        const tdoc = await seed();
        const outcomes = await Promise.all(Array.from({ length: 20 }, () => run('19:05:00', () => 2)));
        assert.equal(outcomes.reduce((n, item) => n + item.scheduled, 0), 1);
        assert.equal(outcomes.reduce((n, item) => n + item.awarded, 0), 1);
        assert.equal((await read(tdoc)).livelyBonus, 2);
    });

    it('catches up pending work only within the same evening and never missed days', async () => {
        const tdoc = await seed({ livelyDay: '2026-09-13', livelyScheduledAt: at('19:20:00') });
        assert.deepEqual(await run('22:50:00', () => 2), { scheduled: 0, awarded: 1, added: 2 });
        assert.deepEqual(await run('19:05:00', () => 2, '2026-09-18'), { scheduled: 1, awarded: 1, added: 2 });
        const saved = await read(tdoc);
        assert.equal(saved.livelyBonus, 4);
        assert.equal(saved.livelyDay, '2026-09-18');
    });

    it('discards an unprocessed old schedule without awarding the missed day', async () => {
        const tdoc = await seed({ livelyDay: '2026-09-12', livelyScheduledAt: at('19:20:00', '2026-09-12') });
        assert.deepEqual(await run('19:00:00'), { scheduled: 1, awarded: 1, added: 0 });
        assert.equal((await read(tdoc)).livelyBonus, 0);
    });

    it('ignores disabled, ended, homework, non-contest and not-yet-enabled documents', async () => {
        const tdocs = await Promise.all([
            seed({ lively: false }), seed({ endAt: at('19:00:00') }), seed({ rule: 'homework' }),
            seed({ docType: 60 }), seed({ livelyEnabledAt: at('20:00:00') }),
        ]);
        assert.deepEqual(await run('19:00:00'), { scheduled: 0, awarded: 0, added: 0 });
        for (const tdoc of tdocs) assert.deepEqual(await read(tdoc), tdoc);
    });

    it('supports published upcoming contests without scheduling before enablement', async () => {
        const tdoc = await seed({ livelyEnabledAt: at('22:30:15'), beginAt: at('12:00:00', '2026-09-20') });
        await run('22:31:00', (max) => max - 1);
        const saved = await read(tdoc);
        assert.ok(saved.livelyScheduledAt >= saved.livelyEnabledAt);
        assert.ok(saved.livelyScheduledAt < at('23:00:00'));
    });

    it('never modifies real attendance, status, judging records or student points', async () => {
        const tdoc = await seed();
        await database.collection('document.status').insertOne({ uid: 3, attend: 1, score: 100 });
        await database.collection('record').insertOne({ uid: 3, status: 1, score: 100 });
        await database.collection('user').insertOne({ _id: 3, points: 100 });
        const names = ['document.status', 'record', 'user'];
        const beforeDocs = await Promise.all(names.map((name) => database.collection(name).find().toArray()));
        await run('19:05:00', () => 2);
        const afterDocs = await Promise.all(names.map((name) => database.collection(name).find().toArray()));
        assert.deepEqual(afterDocs, beforeDocs);
        const saved = await read(tdoc);
        assert.equal(saved.attend, 12);
        assert.equal(getDisplayAttend(saved), 14);
    });

    it('aborts a stale worker update when enablement changed after its read', async () => {
        const tdoc = await seed();
        let switched = false;
        const racingCollection = {
            find: (...args) => coll().find(...args),
            async updateOne(...args) {
                if (!switched) {
                    switched = true;
                    await coll().updateOne({ _id: tdoc._id }, { $set: { livelyEnabledAt: at('19:01:00') } });
                }
                return coll().updateOne(...args);
            },
        };
        assert.deepEqual(await runContestLively(at('19:05:00'), () => 2, racingCollection), { scheduled: 0, awarded: 0, added: 0 });
        const saved = await read(tdoc);
        assert.equal(saved.livelyDay, undefined);
        assert.equal(saved.livelyBonus, 0);
    });
});
