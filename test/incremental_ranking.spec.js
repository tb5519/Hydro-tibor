const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { ObjectId, MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { transformSync } = require('esbuild');
let database;
let client;
let server;
let invalidated = 0;
const events = [];
const cacheDeletes = [];
const reads = [];
const profileDenied = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const collection = (name) => database.collection(name);
const domain = {
    getMulti: (query) => collection('domain').find(query),
    get collUser() { return collection('domain.user'); },
};
const problem = {
    getMultiStatus(domainId, query) { reads.push({ type: 'statuses', domainId, query }); return collection('statuses').find({ domainId, ...query }); },
    getMulti(domainId, query) { reads.push({ type: 'problems', domainId, query }); return collection('problems').find({ domainId, ...query }); },
    getStatus: (domainId, docId, uid) => collection('statuses').findOne({ domainId, docId, uid }),
    get: (domainId, docId) => collection('problems').findOne({ domainId, docId }),
};
const dependencies = {
    '@hydrooj/utils': { sleep },
    '../model/builtin': { STATUS: { STATUS_ACCEPTED: 1 }, PRIV: { PRIV_USER_PROFILE: 1 }, LEVELS: [100, 50, 10] },
    '../model/domain': domain,
    '../model/problem': problem,
    '../model/record': { get coll() { return collection('record'); } },
    '../model/user': {
        getById: async (_, uid) => ({ _id: uid, hasPriv: () => !profileDenied.has(uid) }),
        deleteUserCache: (key) => cacheDeletes.push(key),
    },
    '../model/contest': { get: (domainId, docId) => collection('contests').findOne({ domainId, docId }), isLocked: (tdoc) => !!tdoc.locked },
    '../service/bus': { broadcast: (name, payload) => events.push({ name, payload }) },
    '../service/db': { collection, ensureIndexes: async () => {} },
    './domain_type': { getOjDomainQuery: () => ({ domainType: { $ne: 'scratch' } }) },
    './shared_ranking': { invalidateSharedRankingSnapshot: () => { invalidated++; } },
};
const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/lib/incremental_ranking.ts'), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module: mod, exports: mod.exports,
    require: (name) => dependencies[name] || require(name), setInterval, clearInterval, Date,
});
const ranking = mod.exports;
const rp = (solved) => Math.log(solved + 1) * 52;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    database = client.db('incremental-ranking');
});
after(async () => { await client?.close(); await server?.stop(); });
beforeEach(async () => {
    await database.dropDatabase();
    events.length = 0; cacheDeletes.length = 0; reads.length = 0; profileDenied.clear(); invalidated = 0;
    await collection('domain').insertMany([{ _id: 'cpp' }, { _id: 'python', rankingMode: 'all' }, { _id: 'scratch', domainType: 'scratch' }]);
});
async function member(uid, domainId = 'cpp', extra = {}) {
    await collection('domain.user').insertOne({ domainId, uid, join: true, nAccept: 0, nSubmit: 1, rp: 0, rpInfo: { problem: 0, delta: 7, bonus: 3 }, ...extra });
}
async function result(uid, pid, score = 100, options = {}) {
    const domainId = options.domainId || 'cpp';
    const _id = options.rid || new ObjectId();
    const status = options.status || (score === 100 ? 1 : 2);
    const rdoc = { _id, uid, pid, domainId, status, score, judgeAt: new Date(), ...options };
    await collection('record').updateOne({ _id }, { $set: rdoc }, { upsert: true });
    await collection('statuses').updateOne({ uid, domainId, docId: pid }, {
        $set: { uid, domainId, docId: pid, status, score, rid: _id },
    }, { upsert: true });
    await collection('problems').updateOne({ domainId, docId: pid }, {
        $setOnInsert: { domainId, docId: pid, owner: options.owner || 99, nAccept: options.nAccept ?? 1 },
    }, { upsert: true });
    return { rdoc, pdoc: await problem.get(domainId, pid) };
}
async function judged(item) { return ranking.updateIncrementalRanking(item.rdoc, item.pdoc); }
const membership = (uid, domainId = 'cpp') => collection('domain.user').findOne({ uid, domainId });

describe('immediate incremental ranking with real MongoDB writes', () => {
    it('seeds only the affected legacy user, preserves other RP types and computes shared RP once', async () => {
        await member(11); await member(11, 'python'); await member(12);
        await result(11, 2, 50, { domainId: 'python' });
        await result(12, 99);
        await judged(await result(11, 1));
        const local = await membership(11);
        const other = await membership(11, 'python');
        near(local.rpInfo.problem, rp(1)); near(other.rpInfo.problem, rp(0.5));
        near(local.rp, rp(1) + 10); near(other.rp, rp(0.5) + 10);
        near(local.sharedRp, rp(1.5) + 20); near(other.sharedRp, local.sharedRp);
        assert.deepEqual(local.rpInfo, { problem: rp(1), delta: 7, bonus: 3 });
        assert.equal(local.nAccept, 1); assert.equal(other.nAccept, 0);
        assert.ok(reads.filter((read) => read.type === 'statuses').every((read) => read.query.uid === 11));
        assert.ok(reads.filter((read) => read.type === 'problems').every((read) => read.query.docId.$in.length === 1));
        assert.equal((await membership(12)).rp, 0);
        assert.equal(events.length, 1); assert.equal(invalidated, 1);
        assert.deepEqual(Array.from(events[0].payload.domainIds), ['cpp', 'python']);
        assert.equal(events[0].name, 'ranking/update'); assert.equal(events[0].payload.uid, 11);
    });

    it('repeated ACs and duplicate judge callbacks never add the same problem twice', async () => {
        await member(11);
        const first = await result(11, 1); await judged(first);
        reads.length = 0;
        const second = await result(11, 1); await judged(second); await judged(second);
        near((await membership(11)).rpInfo.problem, rp(1));
        assert.equal((await membership(11)).nAccept, 1);
        assert.equal(reads.length, 0, 'steady-state callbacks never scan user statuses or problem lists');
        assert.equal(await collection('ranking.problem').countDocuments({ uid: 11 }), 1);
    });

    it('partial scores mirror canonical status, allowing score increases, decreases and rejudges', async () => {
        await member(11);
        await judged(await result(11, 1, 40)); near((await membership(11)).rpInfo.problem, rp(0.4));
        await judged(await result(11, 1, 70)); near((await membership(11)).rpInfo.problem, rp(0.7));
        await judged(await result(11, 1, 20)); near((await membership(11)).rpInfo.problem, rp(0.2));
        const accepted = await result(11, 1); await judged(accepted);
        await judged(await result(11, 1, 0, { rid: accepted.rdoc._id }));
        near((await membership(11)).rpInfo.problem, 0); assert.equal((await membership(11)).nAccept, 0);
    });

    it('serializes simultaneous questions and duplicate results across independent callback promises', async () => {
        await member(11);
        const first = await result(11, 1); const second = await result(11, 2);
        await Promise.all([judged(first), judged(second), judged(first), judged(second)]);
        near((await membership(11)).rpInfo.problem, rp(2)); assert.equal((await membership(11)).nAccept, 2);
        await judged(await result(11, 3)); near((await membership(11)).rpInfo.problem, rp(3));
    });

    it('keeps another student’s progress isolated and ranks only cheap domain-user rows', async () => {
        await member(11); await member(12);
        await judged(await result(11, 1));
        await judged(await result(12, 1)); await judged(await result(12, 2));
        assert.equal((await membership(12)).rank, 1); assert.equal((await membership(11)).rank, 2);
        near((await membership(11)).rpInfo.problem, rp(1));
        assert.ok(cacheDeletes.includes('cpp'), 'rank and level changes invalidate other students’ cached profiles');
    });

    it('excludes problem owner RP and questions without an accepted solution, while retaining accepted counts', async () => {
        await member(11);
        await judged(await result(11, 1, 100, { owner: 11 })); near((await membership(11)).rpInfo.problem, 0);
        assert.equal((await membership(11)).nAccept, 1);
        await judged(await result(11, 2, 60, { nAccept: 0 })); near((await membership(11)).rpInfo.problem, 0);
    });

    it('does not touch RP for pretests, generated submissions, Scratch or accounts without profiles', async () => {
        await member(11); await member(11, 'scratch'); profileDenied.add(12); await member(12);
        const item = await result(11, 1);
        await judged({ ...item, rdoc: { ...item.rdoc, contest: new ObjectId('000000000000000000000001') } });
        await judged(await result(11, 1, 100, { domainId: 'scratch' }));
        await judged(await result(12, 1));
        assert.equal(events.length, 0); assert.equal((await membership(11)).rp, 0);
    });

    it('repairs only the affected user after an interrupted write and removes stale contributions', async () => {
        await member(11); await judged(await result(11, 1));
        await collection('ranking.progress').updateOne({ _id: 'user:11' }, { $set: { dirty: true } });
        await collection('statuses').deleteMany({ uid: 11 });
        reads.length = 0;
        await judged(await result(11, 2));
        near((await membership(11)).rpInfo.problem, rp(1));
        assert.equal(await collection('ranking.problem').countDocuments({ uid: 11 }), 1);
        assert.ok(reads.filter((read) => read.type === 'statuses').every((read) => read.query.uid === 11));
    });

    it('waits for maintenance, then resets the affected user’s baseline generation instead of double counting', async () => {
        await member(11); await judged(await result(11, 1));
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        let entered;
        const ready = new Promise((resolve) => { entered = resolve; });
        const rebuilding = ranking.withRankingRebuild(async () => { entered(); await gate; });
        await ready;
        const second = await result(11, 2);
        let completed = false;
        const update = judged(second).then(() => { completed = true; });
        await sleep(80); assert.equal(completed, false);
        release(); await rebuilding; await update;
        near((await membership(11)).rpInfo.problem, rp(2));
        assert.equal((await collection('ranking.progress').findOne({ _id: 'user:11' })).generation, 2);
    });

    it('does not expose active or hidden contest scores, and publishes affected users at contest end', async () => {
        await member(11);
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', endAt: new Date(Date.now() + 60_000) });
        await judged(await result(11, 1, 100, { contest: tid }));
        assert.equal(events.length, 0); assert.equal((await membership(11)).rp, 0);
        const task = await collection('schedule').findOne({ subType: 'ranking.contest' }); assert.ok(task);
        await judged(await result(11, 2));
        near((await membership(11)).rpInfo.problem, rp(1), 'a public result must not reveal a private contest result during migration');
        await collection('contests').updateOne({ docId: tid }, { $set: { endAt: new Date(Date.now() - 1000) } });
        await ranking.publishContestRanking('cpp', tid);
        near((await membership(11)).rpInfo.problem, rp(2)); assert.equal((await membership(11)).nAccept, 2);
        assert.equal(await collection('ranking.pendingContest').countDocuments({}), 0);
    });

    it('homework submissions update immediately and remain idempotent', async () => {
        await member(11); const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'homework', endAt: new Date(Date.now() + 60_000) });
        const item = await result(11, 1, 100, { contest: tid }); await judged(item); await judged(item);
        near((await membership(11)).rpInfo.problem, rp(1)); assert.equal((await membership(11)).nAccept, 1);
    });

    it('keeps a verified shared bonus unchanged instead of adding each membership’s duplicate shared RP', async () => {
        await member(11, 'cpp', { sharedRpInfo: { problem: 10, delta: 4, contestBonus: 18 }, sharedRp: 32 });
        await member(11, 'python', { sharedRpInfo: { problem: 10, delta: 4, contestBonus: 18 }, sharedRp: 32 });
        await judged(await result(11, 1));
        near((await membership(11)).sharedRp, rp(1) + 22);
        near((await membership(11, 'python')).sharedRp, rp(1) + 22);
    });
});

it('a first AC refreshes only partial scorers on the same newly eligible question', async () => {
    await member(11); await member(12);
    await judged(await result(12, 7, 50, { nAccept: 0 }));
    near((await membership(12)).rpInfo.problem, 0);
    await collection('problems').updateOne({ domainId: 'cpp', docId: 7 }, { $set: { nAccept: 1 } });
    const accepted = await result(11, 7);
    await ranking.updateIncrementalRanking(accepted.rdoc, accepted.pdoc, true);
    near((await membership(12)).rpInfo.problem, rp(0.5));
    near((await membership(11)).rpInfo.problem, rp(1));
    const fanout = reads.filter((read) => read.type === 'statuses' && read.query.docId === 7);
    assert.equal(fanout.length, 1);
    assert.ok(reads.filter((read) => read.type === 'problems').every((read) => read.query.docId.$in));
});

it('a private contest cannot erase an earlier public AC during legacy seeding or crash recovery', async () => {
    await member(11);
    await result(11, 1);
    const tid = new ObjectId();
    await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', endAt: new Date(Date.now() + 60_000) });
    await judged(await result(11, 1, 100, { contest: tid }));
    await judged(await result(11, 2));
    near((await membership(11)).rpInfo.problem, rp(2)); assert.equal((await membership(11)).nAccept, 2);
    await collection('ranking.progress').updateOne({ _id: 'user:11' }, { $set: { dirty: true } });
    await judged(await result(11, 2));
    near((await membership(11)).rpInfo.problem, rp(2)); assert.equal((await membership(11)).nAccept, 2);
});

it('rejudging one of several AC records does not remove the problem from the passed count', async () => {
    await member(11);
    await judged(await result(11, 1));
    const second = await result(11, 1); await judged(second);
    await judged(await result(11, 1, 0, { rid: second.rdoc._id }));
    assert.equal((await membership(11)).nAccept, 1);
    near((await membership(11)).rpInfo.problem, 0); // RP retains the existing canonical-status formula.
});

it('an ended locked scoreboard waits for an edit instead of scheduling a one-second loop', async () => {
    await member(11); const tid = new ObjectId();
    await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', locked: true, endAt: new Date(Date.now() - 60_000) });
    await judged(await result(11, 1, 100, { contest: tid }));
    await ranking.publishContestRanking('cpp', tid);
    assert.equal(await collection('schedule').countDocuments({}), 0);
    assert.equal(await collection('ranking.pendingContest').countDocuments({}), 1);
    assert.equal(events.length, 0);
});

it('deleting an old homework keeps the student’s already earned AC and RP', async () => {
    await member(11); const tid = new ObjectId();
    await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'homework', endAt: new Date(Date.now() + 60_000) });
    await judged(await result(11, 1, 100, { contest: tid }));
    await collection('contests').deleteOne({ docId: tid });
    await collection('ranking.progress').updateOne({ _id: 'user:11' }, { $set: { dirty: true } });
    await judged(await result(11, 2));
    near((await membership(11)).rpInfo.problem, rp(2)); assert.equal((await membership(11)).nAccept, 2);
});

it('a failed partial scorer is queued individually and repaired without waiting for their next submission', async () => {
    await member(11); await member(12);
    await judged(await result(12, 7, 50, { nAccept: 0 }));
    await collection('problems').updateOne({ domainId: 'cpp', docId: 7 }, { $set: { nAccept: 1 } });
    const getStatus = problem.getStatus;
    let fail = true;
    problem.getStatus = (...args) => {
        if (args[2] === 12 && fail) { fail = false; throw new Error('simulated transient write path failure'); }
        return getStatus(...args);
    };
    try {
        const accepted = await result(11, 7);
        await ranking.updateIncrementalRanking(accepted.rdoc, accepted.pdoc, true);
    } finally { problem.getStatus = getStatus; }
    const retry = await collection('schedule').findOne({ uid: 12 });
    assert.ok(retry, 'recovery belongs to the failed student rather than only the first solver');
    const handlers = {};
    await ranking.applyIncrementalRanking({ inject: async (_, callback) => callback({ worker: { addHandler: (name, callback) => { handlers[name] = callback; } } }), on: () => {} });
    await handlers['ranking.user'](retry);
    near((await membership(12)).rpInfo.problem, rp(0.5));
});

it('durable recovery retains all affected first-AC questions when several callbacks fail', async () => {
    await ranking.scheduleRankingRecovery(11, { domainId: 'cpp', pid: 7 });
    await ranking.scheduleRankingRecovery(11, { domainId: 'cpp', pid: 8 });
    await ranking.scheduleRankingRecovery(11, { domainId: 'cpp', pid: 7 });
    const jobs = await collection('schedule').find({ uid: 11 }).toArray();
    assert.equal(jobs.length, 1);
    assert.deepEqual(jobs[0].questions, [{ domainId: 'cpp', pid: 7 }, { domainId: 'cpp', pid: 8 }]);
});
