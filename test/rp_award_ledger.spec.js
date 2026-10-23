const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { transformSync } = require('esbuild');
let database;
let client;
let server;
const coll = (name) => database.collection(name);
function load(name, dependencies = {}) {
    const mod = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/lib', name), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module: mod, exports: mod.exports, require: (id) => dependencies[id] || require(id),
    });
    return mod.exports;
}
const award = load('rp_award.ts');
let failMarkers = false;
let slowLedgerRead;
const db = {
    collection: (name) => ['ranking.awardEvent', 'ranking.earned'].includes(name) ? new Proxy({}, { get: (_, method) => (...args) => {
        if (name === 'ranking.earned' && method === 'findOne' && slowLedgerRead) {
            const pending = slowLedgerRead; slowLedgerRead = null;
            return coll(name).findOne(...args).then(async (doc) => { pending.captured(); await pending.wait; return doc; });
        }
        if (name === 'ranking.awardEvent' && method === 'updateMany' && failMarkers) { failMarkers = false; throw new Error('simulated marker outage'); }
        return coll(name)[method](...args);
    } }) : coll(name),
    ensureIndexes: async (collection, ...specs) => {
        for (const { key, ...options } of specs) await collection.createIndex(key, options);
    },
};
const ledger = load('rp_award_ledger.ts', {
    '../model/builtin': { STATUS: { STATUS_ACCEPTED: 1 } },
    '../model/domain': {
        get: (id) => coll('domain').findOne({ _id: id }),
        getMulti: (query) => coll('domain').find(query),
        get collUser() { return coll('domain.user'); },
    },
    '../model/problem': {
        getMulti: (domainId, query) => coll('problem').find({ domainId, ...query }),
        getStatus: () => { throw new Error('current canonical status must not seed historic RP'); },
    },
    '../model/record': {
        get coll() { return coll('record'); },
        get collHistory() { return coll('record.history'); },
        RECORD_PRETEST: new ObjectId('000000000000000000000001'),
        RECORD_GENERATE: new ObjectId('000000000000000000000002'),
    },
    '../service/db': db,
    './domain_type': { getOjDomainQuery: () => ({ domainType: { $ne: 'scratch' } }), isScratchDomain: (ddoc) => ddoc?.domainType === 'scratch' },
    './rp_award': award,
});
const rp = (solved) => 52 * Math.log1p(solved);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const visible = async (records) => new Map(records.map((record) => [String(record._id), true]));
let epoch;
before(async () => {
    server = await MongoMemoryServer.create(); client = await MongoClient.connect(server.getUri()); database = client.db('earned-rp-test');
});
after(async () => { await client?.close(); await server?.stop(); });
beforeEach(async () => {
    await database.dropDatabase(); failMarkers = false; slowLedgerRead = null;
    await coll('domain').insertMany([{ _id: 'cpp' }, { _id: 'python' }, { _id: 'scratch', domainType: 'scratch' }]);
    await coll('domain.user').insertMany([
        { uid: 11, domainId: 'cpp', rpInfo: { problem: rp(1) }, sharedRpInfo: { problem: rp(1) }, sharedRp: rp(1) },
        { uid: 11, domainId: 'python', rpInfo: { problem: 0 }, sharedRpInfo: { problem: rp(1) }, sharedRp: rp(1) },
    ]);
    epoch = await ledger.initializeRpAwards();
});
async function source(pid, { score = 100, difficulty = 1, factor = 1, domainId = 'cpp', judgeAt = new Date(+epoch + 1000), rid = new ObjectId(), nAccept = 1, contest, deferred = false } = {}) {
    const pdoc = { domainId, docId: pid, owner: 99, nAccept, difficulty };
    await coll('problem').updateOne({ domainId, docId: pid }, { $set: pdoc }, { upsert: true });
    const rdoc = { _id: rid, uid: 11, domainId, pid, status: score === 100 ? 1 : 2, score, judgeAt, contest };
    await coll('record').updateOne({ _id: rid }, { $set: rdoc }, { upsert: true });
    await ledger.recordRpAward(rdoc, pdoc, factor, deferred);
    return { rdoc, pdoc };
}
const apply = (visibility = visible, domainIds = ['cpp', 'python']) => ledger.applyFrozenRpAwards(11, domainIds, visibility);

describe('persistent frozen RP ledger', () => {
    it('freezes existing balances without touching projections or reading new canonical state', async () => {
        const before = await coll('domain.user').find({}).toArray();
        const snapshot = await ledger.getFrozenRpSnapshot(['cpp', 'python']);
        near(snapshot.local.get('cpp').get(11), rp(1)); near(snapshot.shared.get(11), rp(1));
        assert.deepEqual(await coll('domain.user').find({}).toArray(), before);
        assert.equal((await coll('ranking.earned').findOne({ _id: 11 })).seededDomains.length, 0);
    });

    it('awards a first new AC after the cutoff even though its canonical result is already stored', async () => {
        await source(2, { difficulty: 10 });
        const result = await apply();
        near(result.local.get('cpp'), rp(1) + 52 * Math.log(3 / 2) * 4);
        near(result.shared, result.local.get('cpp'));
    });

    it('never changes old balances on difficulty edits, generation changes or maintenance projection', async () => {
        await source(2, { difficulty: 4 }); const first = await apply();
        await coll('problem').updateMany({}, { $set: { difficulty: 10 } });
        await coll('ranking.progress').insertOne({ _id: 'gate', generation: 99 });
        await coll('domain.user').updateMany({}, { $set: { 'rpInfo.problem': 999 } });
        await ledger.initializeRpAwards();
        const snapshot = await ledger.getFrozenRpSnapshot(['cpp', 'python']);
        near(snapshot.local.get('cpp').get(11), first.local.get('cpp'));
        near((await apply()).shared, first.shared);
    });

    it('keeps the first event difficulty snapshot and does not pay duplicate AC or ordinary-to-contest repeats', async () => {
        const item = await source(2, { difficulty: 3 }); const first = await apply();
        await ledger.recordRpAward(item.rdoc, { ...item.pdoc, difficulty: 10 }, 2);
        await source(2, { difficulty: 10, factor: 2 });
        const repeated = await apply();
        near(repeated.local.get('cpp'), first.local.get('cpp'));
        const original = await coll('ranking.awardEvent').findOne({ rid: item.rdoc._id });
        assert.equal(original.difficulty, 3); assert.equal(original.contestFactor, 1);
    });

    it('commits high-water values and balances atomically before source markers, allowing safe replay', async () => {
        await source(2, { difficulty: 6, factor: 2 }); failMarkers = true;
        await assert.rejects(apply(), /marker outage/);
        const stored = await coll('ranking.earned').findOne({ _id: 11 });
        const result = await apply();
        near(result.local.get('cpp'), stored.domains.find((item) => item.domainId === 'cpp').baselineRp + stored.domains.find((item) => item.domainId === 'cpp').awardedRp);
        assert.equal(await coll('ranking.awardEvent').countDocuments({ processed: false }), 0);
    });

    it('holds hidden events with their contest and difficulty snapshots until publication', async () => {
        await source(2, { difficulty: 8, factor: 2, contest: new ObjectId() });
        const hidden = await apply(async (records) => new Map(records.map((record) => [String(record._id), false])));
        near(hidden.local.get('cpp'), rp(1));
        await coll('problem').updateMany({}, { $set: { difficulty: 1 } });
        const result = await apply();
        near(result.local.get('cpp'), rp(1) + 52 * Math.log(3 / 2) * 2.5 * 2);
    });

    it('retains ineligible old partial events, then uses only legacy factors when the question becomes eligible', async () => {
        await source(2, { score: 40, difficulty: 10, factor: 2, nAccept: 0, judgeAt: new Date(+epoch - 1000) });
        near((await apply()).local.get('cpp'), rp(1));
        assert.equal(await coll('ranking.awardEvent').countDocuments({ processed: false }), 1);
        await coll('problem').updateMany({}, { $set: { nAccept: 1 } });
        near((await apply()).local.get('cpp'), rp(1) + 52 * Math.log(2.4 / 2));
    });

    it('uses a v1 historical zero instead of the newly written canonical result as a baseline', async () => {
        await coll('ranking.problem').insertOne({ uid: 11, domainId: 'cpp', pid: 2, value: 0, generation: 1 });
        await source(2, { score: 100, difficulty: 1 });
        near((await apply()).local.get('cpp'), rp(1) + 52 * Math.log(3 / 2));
    });

    it('keeps local and shared marginal sums independent', async () => {
        await database.dropDatabase();
        await coll('domain').insertMany([{ _id: 'cpp' }, { _id: 'python' }]);
        await coll('domain.user').insertMany([
            { uid: 11, domainId: 'cpp', rpInfo: { problem: rp(1) }, sharedRpInfo: { problem: rp(9) } },
            { uid: 11, domainId: 'python', rpInfo: { problem: rp(2) }, sharedRpInfo: { problem: rp(9) } },
        ]);
        epoch = await ledger.initializeRpAwards(); await source(2, { difficulty: 5 });
        const result = await apply();
        near(result.local.get('cpp'), rp(1) + 52 * Math.log(3 / 2) * 1.5);
        near(result.shared, rp(9) + 52 * Math.log(11 / 10) * 1.5);
    });

    it('credits only the newly earned part of a same-record rejudge and never deducts later regressions', async () => {
        const first = await source(2, { score: 40, difficulty: 3 }); const partial = await apply();
        await source(2, { score: 100, difficulty: 3, rid: first.rdoc._id, judgeAt: new Date(+epoch + 2000) });
        const full = await apply(); assert.ok(full.local.get('cpp') > partial.local.get('cpp'));
        await source(2, { score: 0, rid: first.rdoc._id, judgeAt: new Date(+epoch + 3000) });
        near((await apply()).local.get('cpp'), full.local.get('cpp'));
    });
});


it('extracts typed frozen balances and preserves legacy totals with signed other RP types', () => {
    assert.equal(ledger.frozenProblemBalance({ rp: 100 }), 100);
    assert.equal(ledger.frozenProblemBalance({ rp: 100, rpInfo: { delta: 7, extra: 3 } }), 90);
    assert.equal(ledger.frozenProblemBalance({ rp: 100, rpInfo: { delta: -7, extra: 3 } }), 104);
    assert.equal(ledger.frozenProblemBalance({ rp: 100, rpInfo: { problem: 41, delta: 7 } }), 41);
    assert.equal(ledger.frozenProblemBalance({ rp: 100, rpInfo: { problem: 0, delta: 7 } }), 0);
    assert.equal(ledger.frozenProblemBalance({ rp: 100, rpInfo: { problem: Number.NaN, delta: 7 } }), 93);
    assert.equal(ledger.frozenProblemBalance({ rpInfo: { delta: -7 } }), 0);
    assert.equal(ledger.frozenProblemBalance({ sharedRp: 120, sharedRpInfo: { delta: -10 } }, true), 130);
});

it('freezes legacy local and shared balances instead of dropping an account without rpInfo', async () => {
    await coll('ranking.earned').deleteMany({});
    await coll('ranking.awardPolicy').deleteMany({});
    await coll('domain.user').deleteMany({});
    await coll('domain.user').insertMany([
        { uid: 11, domainId: 'cpp', rp: 100, sharedRp: 150, sharedRpInfo: { delta: 10 } },
        { uid: 11, domainId: 'python', rp: 80, rpInfo: { delta: -5 }, sharedRp: 145, sharedRpInfo: { delta: 10 } },
    ]);
    await ledger.initializeRpAwards();
    const snapshot = await ledger.getFrozenRpSnapshot(['cpp', 'python']);
    assert.equal(snapshot.local.get('cpp').get(11), 100);
    assert.equal(snapshot.local.get('python').get(11), 85);
    assert.equal(snapshot.shared.get(11), 140);
});


it('does not mistake an old hidden contest AC with zero frozen balance for an already paid result', async () => {
    await coll('ranking.earned').deleteMany({}); await coll('ranking.awardPolicy').deleteMany({});
    await coll('domain.user').updateMany({}, { $set: { 'rpInfo.problem': 0, 'sharedRpInfo.problem': 0 } });
    epoch = await ledger.initializeRpAwards();
    await source(2, { judgeAt: new Date(+epoch - 1000), difficulty: 10, factor: 2, contest: new ObjectId() });
    const result = await apply();
    near(result.local.get('cpp'), rp(1)); near(result.shared, rp(1));
});


it('a slow snapshot cannot replace a newer atomic earned balance', async () => {
    let captured; let release;
    const ready = new Promise((resolve) => { captured = resolve; });
    const wait = new Promise((resolve) => { release = resolve; });
    slowLedgerRead = { captured, wait };
    const snapshot = ledger.getFrozenRpSnapshot(['cpp', 'python']);
    await ready;
    await source(2, { difficulty: 5 });
    const current = await apply();
    release(); await snapshot;
    const stored = await coll('ranking.earned').findOne({ _id: 11 });
    const cpp = stored.domains.find((item) => item.domainId === 'cpp');
    near(cpp.baselineRp + cpp.awardedRp, current.local.get('cpp'));
    near(stored.sharedBaselineRp + stored.sharedAwardedRp, current.shared);
});

it('an old deferred contest source does not consume the historical high-water slot of another paid question', async () => {
    await source(1, { judgeAt: new Date(+epoch - 2000) });
    await source(2, { judgeAt: new Date(+epoch - 1000), difficulty: 10, factor: 2, contest: new ObjectId(), deferred: true });
    const result = await apply();
    near(result.local.get('cpp'), rp(1) + 52 * Math.log(3 / 2));
});

it('pre-policy AC record history remains credited when its current record has since been rejudged', async () => {
    const rid = new ObjectId();
    await coll('record').insertOne({ _id: rid, uid: 11, domainId: 'cpp', pid: 1, status: 2, score: 0, judgeAt: new Date(+epoch + 1000) });
    await coll('record.history').insertOne({ rid, status: 1, score: 100, judgeAt: new Date(+epoch - 1000) });
    await coll('problem').insertOne({ domainId: 'cpp', docId: 1, owner: 99, nAccept: 0, difficulty: 10 });
    await apply();
    await source(1, { rid, judgeAt: new Date(+epoch + 2000), difficulty: 10, factor: 2 });
    near((await apply()).local.get('cpp'), rp(1));
});

it('adds the v2 cutover before the frozen-baseline fast path without resetting any earned balance', async () => {
    await source(2, { difficulty: 1 }); await apply();
    const before = await coll('ranking.earned').findOne({ _id: 11 });
    const original = await coll('ranking.awardPolicy').findOne({ _id: 'earned-rp-v1' });
    await coll('ranking.awardPolicy').deleteOne({ _id: 'challenge-rp-v2' });
    await ledger.initializeRpAwards();
    const challenge = await coll('ranking.awardPolicy').findOne({ _id: 'challenge-rp-v2' });
    assert.equal(challenge.version, 2);
    assert.equal(+(await coll('ranking.awardPolicy').findOne({ _id: 'earned-rp-v1' })).epoch, +original.epoch);
    assert.deepEqual(await coll('ranking.earned').findOne({ _id: 11 }), before);
    await ledger.initializeRpAwards();
    assert.equal(+(await coll('ranking.awardPolicy').findOne({ _id: 'challenge-rp-v2' })).epoch, +challenge.epoch);
});

it('a source judged before v2 but captured late keeps its v1 linear coefficient', async () => {
    await coll('ranking.awardPolicy').updateOne({ _id: 'challenge-rp-v2' }, { $set: { epoch: new Date(+epoch + 2000) } });
    const item = await source(2, { judgeAt: new Date(+epoch + 1000), difficulty: 10, factor: 2 });
    const event = await coll('ranking.awardEvent').findOne({ rid: item.rdoc._id });
    assert.equal(event.awardPolicy, 'earned-rp-v1'); near(event.difficultyMultiplier, 1.9);
    near((await apply()).local.get('cpp'), rp(1) + 52 * Math.log(3 / 2) * 1.9 * 2);
});

it('a source judged after v2 captures the stronger curve and a separate contest factor', async () => {
    await coll('ranking.awardPolicy').updateOne({ _id: 'challenge-rp-v2' }, { $set: { epoch: new Date(+epoch + 500) } });
    const item = await source(2, { judgeAt: new Date(+epoch + 1000), difficulty: 10, factor: 2 });
    const event = await coll('ranking.awardEvent').findOne({ rid: item.rdoc._id });
    assert.equal(event.awardPolicy, 'challenge-rp-v2'); assert.equal(event.difficultyMultiplier, 4); assert.equal(event.contestFactor, 2);
    near((await apply()).local.get('cpp'), rp(1) + 52 * Math.log(3 / 2) * 8);
});

it('an old hidden event without numeric snapshots never inherits the newer curve after release', async () => {
    await coll('ranking.awardPolicy').updateOne({ _id: 'challenge-rp-v2' }, { $set: { epoch: new Date(+epoch + 2000) } });
    const item = await source(2, { judgeAt: new Date(+epoch + 1000), difficulty: 10, factor: 2, contest: new ObjectId(), deferred: true });
    await coll('ranking.awardEvent').updateOne({ rid: item.rdoc._id }, { $unset: { difficultyMultiplier: '', awardPolicy: '' } });
    near((await apply(async (records) => new Map(records.map((record) => [String(record._id), false])))).local.get('cpp'), rp(1));
    await coll('ranking.awardPolicy').updateOne({ _id: 'challenge-rp-v2' }, { $set: { epoch: new Date(+epoch + 500) } });
    await coll('problem').updateMany({}, { $set: { difficulty: 1 } });
    near((await apply()).local.get('cpp'), rp(1) + 52 * Math.log(3 / 2) * 1.9 * 2);
});

it('an explicit saved numeric coefficient survives later curve changes and duplicate capture', async () => {
    const item = await source(2, { difficulty: 10, factor: 2 });
    await coll('ranking.awardEvent').updateOne({ rid: item.rdoc._id }, { $set: { difficultyMultiplier: 2.75 } });
    await ledger.recordRpAward(item.rdoc, { ...item.pdoc, difficulty: 1 }, 1, false);
    const event = await coll('ranking.awardEvent').findOne({ rid: item.rdoc._id });
    assert.equal(event.difficultyMultiplier, 2.75); assert.equal(event.contestFactor, 2);
    near((await apply()).local.get('cpp'), rp(1) + 52 * Math.log(3 / 2) * 2.75 * 2);
});

it('pre-original-rollout sources retain the unweighted original formula through the v2 upgrade', async () => {
    const item = await source(2, { judgeAt: new Date(+epoch - 1000), difficulty: 10, factor: 2, contest: new ObjectId(), deferred: true });
    const event = await coll('ranking.awardEvent').findOne({ rid: item.rdoc._id });
    assert.equal(event.awardPolicy, 'pre-earned-rp-v1'); assert.equal(event.difficultyMultiplier, 1);
    near((await apply()).local.get('cpp'), rp(1) + 52 * Math.log(3 / 2));
});
