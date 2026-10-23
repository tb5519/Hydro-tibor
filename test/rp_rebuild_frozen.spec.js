const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { transformSync } = require('esbuild');

let database;
let client;
let server;
let snapshot;
let writer = false;
let freezes;
let publications;
const collection = (name) => database.collection(name);
const counter = () => new Proxy({}, { get: (object, key) => object[key] || 0 });
const domain = {
    get: (id) => collection('domain').findOne({ _id: id }),
    getMulti: (query) => collection('domain').find(query),
    get collUser() { return collection('domain.user'); },
    getMultiUserInDomain(domainId, query) { return collection('domain.user').find({ ...(domainId ? { domainId } : {}), ...query }); },
    setMultiUserInDomain(domainId, query, values) { return collection('domain.user').updateMany({ domainId, ...query }, { $set: values }); },
};
const dependencies = {
    '@hydrooj/utils': { Counter: counter },
    '../lib/difficulty': () => { throw new Error('Difficulty must not be consulted during a rebuild'); },
    '../lib/domain_type': { getOjDomainQuery: () => ({ domainType: { $ne: 'scratch' } }), isScratchDomain: (ddoc) => ddoc?.domainType === 'scratch' },
    '../lib/shared_ranking': { invalidateSharedRankingSnapshot() {} },
    '../lib/incremental_ranking': {
        async withRankingRebuild(callback) {
            assert.equal(writer, false);
            writer = true;
            try { return await callback(); } finally { writer = false; }
        },
        async freezeProblemRpForRebuild(domainIds) {
            freezes.push({ domainIds: Array.from(domainIds), writer, rows: await collection('domain.user').find({}).toArray() });
            return snapshot;
        },
        publishRankingUpdate: async (domainIds) => { publications.push(Array.from(domainIds)); },
    },
    '../model/builtin': { PRIV: { PRIV_USER_PROFILE: 1 }, STATUS: { STATUS_ACCEPTED: 1 } },
    '../model/domain': domain,
    '../model/user': { getById: async () => ({ hasPriv: () => true }) },
    '../service/db': { collection },
};
function loadRating() {
    const mod = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/script/rating.ts'), 'utf8');
    vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
        module: mod, exports: mod.exports,
        require: (name) => dependencies[name] || require(name),
        global: { Hydro: { model: { builtin: { LEVELS: [100, 50, 10] } } } },
    });
    return mod.exports;
}
let rating;
async function member(uid, domainId, problemRp, delta = 0, extra = {}) {
    await collection('domain.user').insertOne({ uid, domainId, join: true, rp: problemRp + delta, rpdelta: delta, rpInfo: { problem: problemRp, delta }, ...extra });
}
const membership = (uid, domainId) => collection('domain.user').findOne({ uid, domainId });
const report = () => {};

before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    database = client.db('rp-rebuild-frozen');
});
after(async () => { await client?.close(); await server?.stop(); });
beforeEach(async () => {
    await database.dropDatabase();
    freezes = []; publications = []; writer = false;
    snapshot = { local: new Map(), shared: new Map() };
    rating = loadRating();
});

describe('RP maintenance projects frozen awards rather than revaluing old solutions', () => {
    it('freezes all OJ baselines before clearing projections and preserves earned local/shared RP after difficulty edits', async () => {
        await collection('domain').insertMany([{ _id: 'cpp' }, { _id: 'python', rankingMode: 'all' }, { _id: 'scratch', domainType: 'scratch' }]);
        await member(11, 'cpp', 123.125, 7, { sharedRp: 207.75, sharedRpInfo: { problem: 197.75, delta: 10 } });
        await member(11, 'python', 87.25, 3, { sharedRp: 207.75, sharedRpInfo: { problem: 197.75, delta: 10 } });
        await member(11, 'scratch', 999, 99);
        snapshot = { local: new Map([['cpp', new Map([[11, 123.125]])], ['python', new Map([[11, 87.25]])]]), shared: new Map([[11, 197.75]]) };
        await collection('problems').insertOne({ domainId: 'cpp', docId: 1, difficulty: 10, nAccept: 100000 });
        await rating.run({}, report);
        assert.equal(freezes.length, 1);
        assert.equal(freezes[0].writer, true);
        assert.deepEqual(freezes[0].domainIds, ['cpp', 'python']);
        assert.equal(freezes[0].rows.find((row) => row.domainId === 'cpp').rpInfo.problem, 123.125);
        assert.equal(freezes[0].rows.find((row) => row.domainId === 'cpp').sharedRpInfo.problem, 197.75);
        assert.deepEqual((await membership(11, 'cpp')).rpInfo, { problem: 123.125, delta: 7 });
        assert.equal((await membership(11, 'cpp')).rp, 130.125);
        assert.equal((await membership(11, 'python')).rp, 90.25);
        assert.equal((await membership(11, 'cpp')).sharedRp, 207.75);
        assert.equal((await membership(11, 'python')).sharedRp, 207.75);
        assert.equal((await membership(11, 'scratch')).rp, 1098);
        assert.deepEqual(publications, [['cpp', 'python']]);
        await collection('problems').updateOne({}, { $set: { difficulty: 1, nAccept: 0 } });
        await rating.run({}, report);
        assert.equal((await membership(11, 'cpp')).rpInfo.problem, 123.125);
        assert.equal((await membership(11, 'python')).sharedRpInfo.problem, 197.75);
        assert.equal(freezes.length, 2, 'one immutable snapshot is taken for each maintenance job');
    });

    it('repairs damaged display fields from the ledger while retaining current manual adjustments and other RP types', async () => {
        await collection('domain').insertMany([{ _id: 'cpp' }, { _id: 'python', rankingMode: 'all' }]);
        await member(11, 'cpp', 99999, -5);
        await member(11, 'python', 88888, 8);
        snapshot = { local: new Map([['cpp', new Map([[11, 140]])], ['python', new Map([[11, 80]])]]), shared: new Map([[11, 180]]) };
        rating.RpTypes.extra = { base: 0, hidden: false, async run(ids, output) { output[11] = ids.length * 4; } };
        await rating.run({ domainId: 'cpp' }, report);
        assert.deepEqual((await membership(11, 'cpp')).rpInfo, { problem: 140, delta: -5, extra: 4 });
        assert.equal((await membership(11, 'cpp')).rp, 139);
        assert.deepEqual((await membership(11, 'cpp')).sharedRpInfo, { problem: 180, delta: 3, extra: 8 });
        assert.equal((await membership(11, 'cpp')).sharedRp, 191);
        assert.equal((await membership(11, 'python')).rpInfo.problem, 88888, 'a domain-scoped rebuild leaves other local fields alone');
        assert.equal((await membership(11, 'python')).sharedRp, 191);
    });

    it('uses the independent shared baseline even when only one OJ domain exists', async () => {
        await collection('domain').insertOne({ _id: 'cpp', rankingMode: 'all' });
        await member(11, 'cpp', 35, 2);
        snapshot = { local: new Map([['cpp', new Map([[11, 35]])]]), shared: new Map([[11, 97]]) };
        await rating.run({}, report);
        assert.equal((await membership(11, 'cpp')).rpInfo.problem, 35);
        assert.equal((await membership(11, 'cpp')).sharedRpInfo.problem, 97);
        assert.equal((await membership(11, 'cpp')).sharedRp, 99);
    });

    it('keeps direct problem RP callers on the frozen snapshot without scanning problems or statuses', async () => {
        snapshot = { local: new Map([['cpp', new Map([[11, 42.5]])]]), shared: new Map([[11, 77.25]]) };
        const local = {};
        const shared = {};
        await rating.RpTypes.problem.run(['cpp'], local, report);
        await rating.RpTypes.problem.run(['cpp', 'python'], shared, report);
        assert.deepEqual(local, { 11: 42.5 });
        assert.deepEqual(shared, { 11: 77.25 });
        assert.equal(freezes.length, 2);
    });
});
