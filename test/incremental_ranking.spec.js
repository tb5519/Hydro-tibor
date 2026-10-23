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
    get: (domainId) => collection('domain').findOne({ _id: domainId }),
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
    '../model/record': {
        get coll() { return collection('record'); },
        get collHistory() { return collection('record.history'); },
        RECORD_PRETEST: new ObjectId('000000000000000000000001'),
        RECORD_GENERATE: new ObjectId('000000000000000000000002'),
    },
    '../model/user': {
        getById: async (_, uid) => ({ _id: uid, hasPriv: () => !profileDenied.has(uid) }),
        deleteUserCache: (key) => cacheDeletes.push(key),
    },
    '../model/contest': { get: (domainId, docId) => collection('contests').findOne({ domainId, docId }), isLocked: (tdoc) => !!tdoc.locked },
    '../service/bus': { broadcast: (name, payload) => events.push({ name, payload }) },
    '../service/db': { collection, ensureIndexes: async () => {} },
    './domain_type': { getOjDomainQuery: () => ({ domainType: { $ne: 'scratch' } }), isScratchDomain: (ddoc) => ddoc?.domainType === 'scratch' },
    './shared_ranking': { invalidateSharedRankingSnapshot: () => { invalidated++; } },
};
const modules = new Map();
function loadLib(name) {
    if (modules.has(name)) return modules.get(name).exports;
    const source = fs.readFileSync(path.join(__dirname, `../packages/hydrooj/src/lib/${name}.ts`), 'utf8');
    const mod = { exports: {} };
    modules.set(name, mod);
    vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
        module: mod, exports: mod.exports,
        require: (dependency) => dependencies[dependency]
            || (dependency.startsWith('./') ? loadLib(dependency.slice(2)) : require(dependency)),
        setInterval, clearInterval, Date,
    });
    return mod.exports;
}
const ranking = loadLib('incremental_ranking');
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
    await startup();
});
async function startup() {
    await ranking.applyIncrementalRanking({ inject: async (_, callback) => callback({ worker: { addHandler() {} } }), on() {} });
    await sleep(2); // Keep fixture verdict times strictly after the durable rollout epoch.
}
async function legacyStartup() {
    await Promise.all(['ranking.earned', 'ranking.awardPolicy', 'ranking.awardEvent'].map((name) => collection(name).deleteMany({})));
    await startup();
}
async function useLinearPolicy() {
    await collection('ranking.awardPolicy').updateOne({ _id: 'challenge-rp-v2' }, {
        $set: { version: 2, epoch: new Date(Date.now() + 60_000) },
    }, { upsert: true });
}
async function upgradeToChallengePolicy() {
    await collection('ranking.awardPolicy').deleteOne({ _id: 'challenge-rp-v2' });
    await startup();
}
async function failAwardEventInsert(item) {
    const originalCollection = dependencies['../service/db'].collection;
    let fail = true;
    let source;
    dependencies['../service/db'].collection = (name) => {
        const target = originalCollection(name);
        if (name !== 'ranking.awardEvent') return target;
        return new Proxy(target, {
            get(collectionTarget, property) {
                if (property === 'updateOne') return async (...args) => {
                    if (fail) { fail = false; throw new Error('simulated award-event insert failure'); }
                    return collectionTarget.updateOne(...args);
                };
                const value = Reflect.get(collectionTarget, property);
                return typeof value === 'function' ? value.bind(collectionTarget) : value;
            },
        });
    };
    try {
        await assert.rejects(judged(item), (error) => {
            assert.match(error.cause?.message || error.message, /simulated award-event insert failure/);
            source = error.rankingAwardSource;
            assert.ok(source, 'the judge must receive enough immutable evidence to retry the lost event');
            return true;
        });
    } finally { dependencies['../service/db'].collection = originalCollection; }
    return source;
}
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
        $setOnInsert: { domainId, docId: pid, owner: options.owner || 99, nAccept: options.nAccept ?? 1, ...(options.difficulty === undefined ? {} : { difficulty: options.difficulty }) },
    }, { upsert: true });
    return { rdoc, pdoc: await problem.get(domainId, pid) };
}
async function judged(item) { return ranking.updateIncrementalRanking(item.rdoc, item.pdoc); }
const membership = (uid, domainId = 'cpp') => collection('domain.user').findOne({ uid, domainId });

describe('immediate incremental ranking with real MongoDB writes', () => {
    it('seeds only the affected legacy user, preserves other RP types and computes shared RP once', async () => {
        const sharedBaseline = { sharedRp: rp(0.5) + 20, sharedRpInfo: { problem: rp(0.5), delta: 14, bonus: 6 } };
        await member(11, 'cpp', sharedBaseline);
        await member(11, 'python', { ...sharedBaseline, rp: rp(0.5) + 10, rpInfo: { problem: rp(0.5), delta: 7, bonus: 3 } });
        await member(12);
        await result(11, 2, 50, { domainId: 'python', judgeAt: new Date(Date.now() - 60_000) });
        await result(99, 2, 100, { domainId: 'python', judgeAt: new Date(Date.now() - 60_000) });
        await result(12, 99, 100, { judgeAt: new Date(Date.now() - 60_000) });
        await legacyStartup(); reads.length = 0;
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
        assert.equal(reads.filter((read) => read.type === 'statuses').length, 0, 'steady-state callbacks never scan user status lists');
        assert.ok(reads.filter((read) => read.type === 'problems').every((read) => read.query.docId.$in.length <= 1), 'award snapshots fetch only the affected question');
        assert.equal(await collection('ranking.problem').countDocuments({ uid: 11 }), 1);
    });

    it('credits only partial-score high-water increases and freezes earned RP through lower scores and rejudges', async () => {
        await member(11);
        await judged(await result(11, 1, 40)); near((await membership(11)).rpInfo.problem, rp(0.4));
        await judged(await result(11, 1, 70)); near((await membership(11)).rpInfo.problem, rp(0.7));
        await judged(await result(11, 1, 20)); near((await membership(11)).rpInfo.problem, rp(0.7));
        const accepted = await result(11, 1); await judged(accepted);
        await judged(await result(11, 1, 0, { rid: accepted.rdoc._id }));
        near((await membership(11)).rpInfo.problem, rp(1)); assert.equal((await membership(11)).nAccept, 0);
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

    it('repairs only the affected user after an interrupted write without revoking already earned RP', async () => {
        await member(11); await judged(await result(11, 1));
        await collection('ranking.progress').updateOne({ _id: 'user:11' }, { $set: { dirty: true } });
        await collection('statuses').deleteMany({ uid: 11 });
        reads.length = 0;
        await judged(await result(11, 2));
        near((await membership(11)).rpInfo.problem, rp(2));
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
        near((await membership(11)).rpInfo.problem, rp(1) + 2 * (rp(2) - rp(1))); assert.equal((await membership(11)).nAccept, 2);
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
        const frozenShared = 10 + 52 * Math.log1p(1 / Math.exp(10 / 52)) + 22;
        near((await membership(11)).sharedRp, frozenShared);
        near((await membership(11, 'python')).sharedRp, frozenShared);
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
    await judged(await result(11, 1));
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
    near((await membership(11)).rpInfo.problem, rp(1)); // Previously earned RP survives a lower rejudge.
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

describe('immutable difficulty and contest RP awards', () => {
    it('freezes an existing displayed balance even after a teacher edits difficulty and maintenance runs', async () => {
        const baseline = 123.456;
        await member(11, 'cpp', { rp: baseline + 10, rpInfo: { problem: baseline, delta: 7, bonus: 3 }, sharedRpInfo: { problem: baseline, delta: 14 } });
        const old = await result(11, 1, 100, { difficulty: 1, judgeAt: new Date(Date.now() - 60_000) });
        await collection('problems').updateOne({ domainId: 'cpp', docId: 1 }, { $set: { difficulty: 10 } });
        await legacyStartup();
        await judged(await result(11, 1, 100));
        near((await membership(11)).rpInfo.problem, baseline);
        await judged(old);
        near((await membership(11)).rpInfo.problem, baseline);
        const snapshot = await ranking.withRankingRebuild(() => ranking.freezeProblemRpForRebuild(['cpp', 'python']));
        near(snapshot.local.get('cpp').get(11), baseline);
        near(snapshot.shared.get(11), baseline);
        await collection('problems').updateOne({ domainId: 'cpp', docId: 1 }, { $set: { difficulty: 1 } });
        await collection('ranking.progress').updateOne({ _id: 'user:11' }, { $set: { dirty: true } });
        await judged(await result(11, 1, 100));
        near((await membership(11)).rpInfo.problem, baseline);
    });

    it('awards only a legacy partial score increase with the new difficulty and contest multiplier', async () => {
        const baseline = rp(0.4);
        await member(11, 'cpp', { rp: baseline + 10, rpInfo: { problem: baseline, delta: 7, bonus: 3 }, sharedRpInfo: { problem: baseline } });
        const oldAt = new Date(Date.now() - 60_000);
        await result(11, 1, 40, { difficulty: 1, judgeAt: oldAt });
        await result(99, 1, 100, { judgeAt: oldAt });
        await legacyStartup();
        await collection('problems').updateOne({ domainId: 'cpp', docId: 1 }, { $set: { difficulty: 6 } });
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', endAt: new Date(Date.now() - 1000) });
        await judged(await result(11, 1, 100, { contest: tid }));
        const expected = baseline + (rp(1) - rp(0.4)) * 1.75 * 2;
        near((await membership(11)).rpInfo.problem, expected);
        near((await membership(11)).sharedRpInfo.problem, expected);
        await judged(await result(11, 1, 100, { contest: tid }));
        near((await membership(11)).rpInfo.problem, expected);
    });

    it('does not reprice an awarded question after difficulty edits or a later contest AC', async () => {
        await member(11);
        await judged(await result(11, 1, 100, { difficulty: 6 }));
        near((await membership(11)).rpInfo.problem, rp(1) * 1.75);
        await collection('problems').updateOne({ domainId: 'cpp', docId: 1 }, { $set: { difficulty: 10 } });
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', endAt: new Date(Date.now() - 1000) });
        await judged(await result(11, 1, 100, { contest: tid }));
        near((await membership(11)).rpInfo.problem, rp(1) * 1.75);
        await judged(await result(11, 2, 100, { difficulty: 1 }));
        near((await membership(11)).rpInfo.problem, rp(1) * 1.75 + rp(2) - rp(1));
    });

    it('snapshots a hidden contest result at judge time and keeps its difficulty when the teacher publishes later', async () => {
        await member(11);
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', keepScoreboardHidden: true, endAt: new Date(Date.now() - 1000) });
        await judged(await result(11, 1, 100, { contest: tid, difficulty: 6 }));
        near((await membership(11)).rpInfo.problem, 0);
        await collection('problems').updateOne({ domainId: 'cpp', docId: 1 }, { $set: { difficulty: 10 } });
        await collection('contests').updateOne({ docId: tid }, { $set: { keepScoreboardHidden: false } });
        await ranking.publishContestRanking('cpp', tid);
        near((await membership(11)).rpInfo.problem, rp(1) * 1.75 * 2);
        await ranking.publishContestRanking('cpp', tid);
        near((await membership(11)).rpInfo.problem, rp(1) * 1.75 * 2);
    });

    it('computes local and shared marginal awards independently without duplicating shared balances', async () => {
        await member(11); await member(11, 'python');
        await judged(await result(11, 1, 100, { difficulty: 1 }));
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'python', docId: tid, rule: 'acm', endAt: new Date(Date.now() - 1000) });
        await judged(await result(11, 2, 100, { domainId: 'python', contest: tid, difficulty: 10 }));
        near((await membership(11)).rpInfo.problem, rp(1));
        near((await membership(11, 'python')).rpInfo.problem, rp(1) * 4 * 2);
        const shared = rp(1) + (rp(2) - rp(1)) * 4 * 2;
        near((await membership(11)).sharedRpInfo.problem, shared);
        near((await membership(11, 'python')).sharedRpInfo.problem, shared);
    });

    it('keeps a hidden contest private and awards only the remaining increase after an ordinary result', async () => {
        await member(11);
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', keepScoreboardHidden: true, endAt: new Date(Date.now() - 1000) });
        await judged(await result(11, 1, 90, { contest: tid, difficulty: 6 }));
        await judged(await result(11, 1, 30));
        near((await membership(11)).rpInfo.problem, rp(0.3) * 1.75);
        await collection('contests').updateOne({ docId: tid }, { $set: { keepScoreboardHidden: false } });
        await ranking.publishContestRanking('cpp', tid);
        near((await membership(11)).rpInfo.problem, (rp(0.3) + 2 * (rp(0.9) - rp(0.3))) * 1.75);
    });

    it('does not give the new bonus retroactively to an old hidden contest published after rollout', async () => {
        await member(11);
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', keepScoreboardHidden: true, endAt: new Date(Date.now() - 1000) });
        const old = await result(11, 1, 100, { contest: tid, difficulty: 10, judgeAt: new Date(Date.now() - 60_000) });
        await legacyStartup();
        await judged(old);
        await collection('contests').updateOne({ docId: tid }, { $set: { keepScoreboardHidden: false } });
        await ranking.publishContestRanking('cpp', tid);
        near((await membership(11)).rpInfo.problem, rp(1));
    });

    it('replays committed events after a crash with zero extra RP and retains awards after a maintenance generation', async () => {
        await member(11);
        const item = await result(11, 1, 100, { difficulty: 8 });
        await judged(item);
        const expected = rp(1) * 2.5;
        await collection('ranking.awardEvent').updateMany({ uid: 11 }, { $set: { processed: false } });
        await collection('ranking.progress').updateOne({ _id: 'user:11' }, { $set: { dirty: true } });
        await judged(item);
        near((await membership(11)).rpInfo.problem, expected);
        const frozen = await ranking.withRankingRebuild(() => ranking.freezeProblemRpForRebuild(['cpp', 'python']));
        near(frozen.local.get('cpp').get(11), expected);
        await judged(item);
        near((await membership(11)).rpInfo.problem, expected);
        assert.equal(await collection('ranking.awardEvent').countDocuments({ uid: 11 }), 1);
    });

    it('repairs a projection failure after the durable award commit without granting the same increment twice', async () => {
        await member(11);
        const item = await result(11, 1, 100, { difficulty: 5 });
        const descriptor = Object.getOwnPropertyDescriptor(domain, 'collUser');
        let fail = true;
        Object.defineProperty(domain, 'collUser', {
            configurable: true,
            get() {
                const target = collection('domain.user');
                return new Proxy(target, {
                    get(collectionTarget, property) {
                        if (property === 'updateOne') return async (...args) => {
                            if (fail && Array.isArray(args[1])) { fail = false; throw new Error('simulated display projection failure'); }
                            return collectionTarget.updateOne(...args);
                        };
                        const value = Reflect.get(collectionTarget, property);
                        return typeof value === 'function' ? value.bind(collectionTarget) : value;
                    },
                });
            },
        });
        try { await assert.rejects(judged(item), /simulated display projection failure/); }
        finally { Object.defineProperty(domain, 'collUser', descriptor); }
        near((await membership(11)).rpInfo.problem, 0);
        const expected = rp(1) * 1.5;
        const ledger = await collection('ranking.earned').findOne({ _id: 11 });
        near(ledger.domains.find((item) => item.domainId === 'cpp').awardedRp, expected);
        await ranking.scheduleRankingRecovery(11);
        const retry = await collection('schedule').findOne({ uid: 11 });
        const handlers = {};
        await ranking.applyIncrementalRanking({ inject: async (_, callback) => callback({ worker: { addHandler: (name, handler) => { handlers[name] = handler; } } }), on() {} });
        await handlers['ranking.user'](retry);
        near((await membership(11)).rpInfo.problem, expected);
        near((await membership(11)).sharedRpInfo.problem, expected);
        await judged(item);
        near((await membership(11)).rpInfo.problem, expected);
    });

    it('durably retries a failed award-event insert with its original difficulty and contest snapshot', async () => {
        await member(11);
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', endAt: new Date(Date.now() - 1000) });
        const item = await result(11, 1, 100, { contest: tid, difficulty: 4 });
        const source = await failAwardEventInsert(item);
        assert.equal(await collection('ranking.awardEvent').countDocuments({ uid: 11 }), 0);
        near((await membership(11)).rpInfo.problem, 0);
        await ranking.scheduleRankingRecovery(11, undefined, source);
        await ranking.scheduleRankingRecovery(11, undefined, source);
        await collection('problems').updateOne({ domainId: 'cpp', docId: 1 }, { $set: { difficulty: 10 } });
        const retry = await collection('schedule').findOne({ uid: 11 });
        const handlers = {};
        await ranking.applyIncrementalRanking({ inject: async (_, callback) => callback({ worker: { addHandler: (name, handler) => { handlers[name] = handler; } } }), on() {} });
        await handlers['ranking.user'](retry);
        const expected = rp(1) * 1.35 * 2;
        near((await membership(11)).rpInfo.problem, expected);
        near((await membership(11)).sharedRpInfo.problem, expected);
        await handlers['ranking.user'](retry);
        await judged(item);
        near((await membership(11)).rpInfo.problem, expected);
        assert.equal(await collection('ranking.awardEvent').countDocuments({ uid: 11 }), 1);
    });
});

describe('linear-policy to challenge-curve upgrade', () => {
    it('preserves already paid linear RP, never tops up an old AC, and uses the new curve only for a new question', async () => {
        await useLinearPolicy();
        await member(11);
        await judged(await result(11, 1, 100, { difficulty: 10 }));
        const paid = rp(1) * 1.9;
        near((await membership(11)).rpInfo.problem, paid);
        await collection('ranking.awardEvent').updateMany({ uid: 11 }, { $unset: { difficultyMultiplier: '', awardPolicy: '' } });
        const originalEpoch = (await collection('ranking.awardPolicy').findOne({ _id: 'earned-rp-v1' })).epoch;
        await upgradeToChallengePolicy();
        assert.equal(+(await collection('ranking.awardPolicy').findOne({ _id: 'earned-rp-v1' })).epoch, +originalEpoch);
        near((await membership(11)).rpInfo.problem, paid);
        const snapshot = await ranking.withRankingRebuild(() => ranking.freezeProblemRpForRebuild(['cpp', 'python']));
        near(snapshot.local.get('cpp').get(11), paid);
        near(snapshot.shared.get(11), paid);
        await judged(await result(11, 1, 100));
        near((await membership(11)).rpInfo.problem, paid);
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', endAt: new Date(Date.now() - 1000) });
        await judged(await result(11, 2, 100, { contest: tid, difficulty: 10 }));
        near((await membership(11)).rpInfo.problem, paid + (rp(2) - rp(1)) * 4 * 2);
        near((await membership(11)).sharedRpInfo.problem, paid + (rp(2) - rp(1)) * 4 * 2);
        const event = await collection('ranking.awardEvent').findOne({ uid: 11, pid: 2 });
        assert.equal(event.difficultyMultiplier, 4);
        assert.equal(event.awardPolicy, 'challenge-rp-v2');
    });

    it('publishes an old hidden contest with its linear snapshot even when its event lacks the new multiplier field', async () => {
        await useLinearPolicy();
        await member(11);
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', keepScoreboardHidden: true, endAt: new Date(Date.now() - 1000) });
        await judged(await result(11, 1, 100, { contest: tid, difficulty: 10 }));
        near((await membership(11)).rpInfo.problem, 0);
        await collection('ranking.awardEvent').updateMany({ uid: 11 }, { $unset: { difficultyMultiplier: '', awardPolicy: '' } });
        await upgradeToChallengePolicy();
        await collection('problems').updateOne({ domainId: 'cpp', docId: 1 }, { $set: { difficulty: 1 } });
        await collection('contests').updateOne({ docId: tid }, { $set: { keepScoreboardHidden: false } });
        await ranking.publishContestRanking('cpp', tid);
        near((await membership(11)).rpInfo.problem, rp(1) * 1.9 * 2);
        await judged(await result(11, 1, 100, { contest: tid }));
        near((await membership(11)).rpInfo.problem, rp(1) * 1.9 * 2);
    });

    it('retries an unpersisted linear-policy source after upgrade without switching it to the challenge curve', async () => {
        await useLinearPolicy();
        await member(11);
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', endAt: new Date(Date.now() - 1000) });
        const item = await result(11, 1, 100, { contest: tid, difficulty: 10 });
        const source = await failAwardEventInsert(item);
        await ranking.scheduleRankingRecovery(11, undefined, source);
        await upgradeToChallengePolicy();
        await collection('problems').updateOne({ domainId: 'cpp', docId: 1 }, { $set: { difficulty: 1 } });
        const handlers = {};
        await ranking.applyIncrementalRanking({ inject: async (_, callback) => callback({ worker: { addHandler: (name, handler) => { handlers[name] = handler; } } }), on() {} });
        const retry = await collection('schedule').findOne({ uid: 11 });
        await handlers['ranking.user'](retry);
        near((await membership(11)).rpInfo.problem, rp(1) * 1.9 * 2);
        await handlers['ranking.user'](retry);
        near((await membership(11)).rpInfo.problem, rp(1) * 1.9 * 2);
        assert.equal(await collection('ranking.awardEvent').countDocuments({ uid: 11 }), 1);
        const event = await collection('ranking.awardEvent').findOne({ uid: 11 });
        assert.equal(event.difficultyMultiplier, 1.9);
        assert.equal(event.awardPolicy, 'earned-rp-v1');
    });

    it('keeps the linear reward for an old 40 percent result and applies the challenge curve only to the remaining 60 percent', async () => {
        await useLinearPolicy();
        await member(11);
        await judged(await result(11, 1, 40, { difficulty: 10 }));
        const paid = rp(0.4) * 1.9;
        near((await membership(11)).rpInfo.problem, paid);
        await collection('ranking.awardEvent').updateMany({ uid: 11 }, { $unset: { difficultyMultiplier: '', awardPolicy: '' } });
        await upgradeToChallengePolicy();
        const tid = new ObjectId();
        await collection('contests').insertOne({ domainId: 'cpp', docId: tid, rule: 'oi', endAt: new Date(Date.now() - 1000) });
        await judged(await result(11, 1, 100, { contest: tid }));
        const expected = paid + (rp(1) - rp(0.4)) * 4 * 2;
        near((await membership(11)).rpInfo.problem, expected);
        near((await membership(11)).sharedRpInfo.problem, expected);
        await judged(await result(11, 1, 20));
        await judged(await result(11, 1, 100, { contest: tid }));
        near((await membership(11)).rpInfo.problem, expected);
    });
});
