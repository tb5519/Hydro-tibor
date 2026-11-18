const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '..');
class PermissionError extends Error {}
class CsrfTokenError extends Error {}
class ValidationError extends Error {}
const errors = { PermissionError, CsrfTokenError, ValidationError };
const load = (name, dependencies = {}) => {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, name), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module, exports: module.exports, Buffer, URL, URLSearchParams, Date, process, require: (id) => dependencies[id] ?? require(id) });
    return module.exports;
};
let mongod; let client; let database; let model; let handlers; let members; let quiz;
let interval;
const startTime = Date.parse('2026-10-24T10:00:00+08:00');
const at = (seconds) => new Date(startTime + seconds * 1000);
const source = { kind: 'problem', pid: 17 };
const PERM = { PERM_VIEW: 1n, PERM_EDIT_DOMAIN: 2n };
const PRIV = { PRIV_USER_PROFILE: 2, PRIV_EDIT_SYSTEM: 1, PRIV_JUDGE: 4 };
let uidCounter = 10;
const nowUid = () => ++uidCounter;
let uid;
const clockLib = load('packages/hydrooj/src/lib/training_time.ts');
const quietLogger = { Logger: class { warn() {} } };
function loadLedger() {
    const db = { collection: (name) => database.collection(name), ensureIndexes: (coll, ...indexes) => coll.createIndexes(indexes) };
    return load('packages/hydrooj/src/model/training_time.ts', {
        '../error': errors, '../lib/training_time': clockLib, '../service/db': db, '../logger': quietLogger,
    });
}
before(async () => {
    mongod = await MongoMemoryServer.create({ instance: { args: ['--nounixsocket'] } });
    client = await MongoClient.connect(mongod.getUri());
    database = client.db('training');
    members = database.collection('domain.user');
    quiz = database.collection('daily.quiz.session');
    model = loadLedger();
    await model.apply({ interval: (fn) => { interval = fn; } });
    handlers = load('packages/hydrooj/src/handler/training_time.ts', {
        '../error': errors, '../lib/training_time': clockLib, '../model/training_time': model,
        '../lib/daily_quiz': load('packages/hydrooj/src/lib/daily_quiz.ts', { '../error': errors }),
        '../lib/domain_type': { isScratchDomain: (domain) => domain?.domainType === 'scratch' },
        '../model/domain': { collUser: members, get: async (id) => ({ _id: id, domainType: id === 'scratch' ? 'scratch' : 'oj' }) },
        '../model/user': { getById: async (domainId, id) => student(id) },
        '../model/record': { RECORD_PRETEST: new ObjectId('000000000000000000000000'),
            RECORD_GENERATE: new ObjectId('000000000000000000000001') },
        '../model/daily_quiz': { sessionColl: quiz }, '../model/builtin': { PERM, PRIV }, '../logger': quietLogger,
        '../service/server': { Handler: class {} },
    });
});
beforeEach(() => { uid = nowUid(); });
after(async () => { await client?.close(); await mongod?.stop(); });
async function start(domainId = 'python', seconds = 0, kind = source) {
    const token = await model.issueSourceGrant(uid, domainId, kind, at(seconds));
    const requestId = `request-${Math.random().toString(36).slice(2)}-activity`;
    const result = await model.startSession(uid, domainId, token, requestId, at(seconds));
    assert.equal(result.accepted, true);
    return { token, requestId, sessionId: result.sessionId, domainId };
}
async function pulse(session, seq, seconds, active = true, discard = false) {
    return model.heartbeat(uid, session.domainId, session.sessionId, seq, active, discard, at(seconds));
}
async function total(domainId = 'python') {
    const rows = await model.daily.find({ uid, domainId }).toArray();
    return rows.reduce((sum, row) => sum + row.seconds, 0);
}
function student(id = uid, teacher = false, priv = 2) {
    return { _id: id, hasPerm: (value) => value === PERM.PERM_VIEW || teacher,
        hasPriv: (value) => (priv & value) === value };
}
function handler(klass = handlers.TrainingTimeSessionHandler, options = {}) {
    const instance = new klass();
    return Object.assign(instance, {
        user: student(), domain: { _id: 'python', domainType: 'oj' }, session: {},
        request: { method: 'POST', host: 'school.test', headers: { origin: 'https://school.test' }, body: {}, query: {}, path: '/training-time/session' },
        response: { body: {}, status: 200, addHeader() {} }, UiContext: {},
        checkPriv(value) { if (!this.user.hasPriv(value)) throw new PermissionError(); },
        limitRate: async () => {}, url: (name, { domainId }) => `/d/${domainId}/${name}`,
        ...options,
    });
}

describe('incremental training time ledger', () => {
    it('starts without credit and never returns private totals', async () => {
        const session = await start();
        assert.equal(await total(), 0);
        const reply = await pulse(session, 1, 30);
        assert.deepEqual(Object.keys(reply), ['accepted']);
        assert.equal(await total(), 30);
    });
    it('retains fractional seconds rather than rounding each heartbeat', async () => {
        const session = await start();
        await pulse(session, 1, 30.25);
        await pulse(session, 2, 60.75);
        assert.equal(await total(), 60.75);
    });
    it('deduplicates duplicate and out-of-order heartbeats', async () => {
        const session = await start();
        await pulse(session, 2, 30);
        await pulse(session, 2, 31);
        await pulse(session, 1, 35);
        await pulse(session, 3, 60);
        assert.equal(await total(), 60);
    });
    it('deduplicates truly concurrent retry requests with optimistic CAS', async () => {
        const session = await start();
        const replies = await Promise.all(Array.from({ length: 8 }, () => pulse(session, 1, 30)));
        assert(replies.every((reply) => reply.accepted));
        assert.equal(await total(), 30);
    });
    it('projects exact credited intervals and coalesces contiguous same-source heartbeats', async () => {
        const session = await start();
        await pulse(session, 1, 30);
        await Promise.all(Array.from({ length: 5 }, () => pulse(session, 2, 60)));
        const row = await model.daily.findOne({ uid });
        assert.deepEqual(row.intervals, [{ start: +at(0), end: +at(60), ...source }]);
        assert.equal(row.seconds, 60);
    });
    it('captures only the bounded credited tail and never fills sleeping gaps', async () => {
        const session = await start();
        await pulse(session, 1, 80);
        await pulse(session, 2, 400);
        await pulse(session, 3, 430);
        const row = await model.daily.findOne({ uid });
        assert.deepEqual(row.intervals, [{ start: +at(20), end: +at(80), ...source }, { start: +at(400), end: +at(430), ...source }]);
    });
    it('preserves legacy counters and records only subsequent precise intervals after upgrade', async () => {
        const session = await start();
        await pulse(session, 1, 30);
        const state = await model.states.findOne({ _id: uid });
        for (const bucket of state.buckets) delete bucket.intervals;
        await model.states.replaceOne({ _id: uid }, state);
        await pulse(session, 2, 60);
        const row = await model.daily.findOne({ uid });
        assert.equal(row.seconds, 60);
        assert.deepEqual(row.intervals, [{ start: +at(30), end: +at(60), ...source }]);
    });
    it('one global learner lease deduplicates tabs, devices and domains', async () => {
        const python = await start();
        await pulse(python, 1, 30);
        const cpp = await start('cpp', 35);
        assert.equal((await pulse(python, 2, 60)).accepted, false);
        await pulse(cpp, 1, 65);
        assert.equal(await total('python'), 30);
        assert.equal(await total('cpp'), 30);
    });
    it('settles a late page-exit once up to the handoff, without releasing the new tab or rewinding its last activity', async () => {
        const first = await start();
        const second = await start('python', 10, { kind: 'problem', pid: 25 });
        await pulse(second, 1, 15);
        assert.equal((await pulse(first, 1, 16)).accepted, false);
        await Promise.all(Array.from({ length: 4 }, () => pulse(first, 2, 19, false)));
        assert.equal(await total(), 15);
        const row = await model.daily.findOne({ uid });
        assert.equal(+row.startedAt, +at(0));
        assert.equal(+row.updatedAt, +at(15));
        assert.deepEqual(row.intervals, [{ start: +at(0), end: +at(10), ...source },
            { start: +at(10), end: +at(15), kind: 'problem', pid: 25 }]);
        assert.equal((await pulse(second, 2, 40)).accepted, true);
        assert.equal(await total(), 40);
    });
    it('a stale or discarded displaced tab cannot create retroactive credit', async () => {
        const old = await start();
        const next = await start('cpp', 30);
        await pulse(old, 1, 31, false, true);
        assert.equal(await total(), 0);
        const latest = await start('python', 50);
        await pulse(next, 1, 125, false);
        assert.equal(await total('cpp'), 0);
        await pulse(latest, 1, 125, false);
        assert.equal(await total(), 60);
    });
    it('preserves the previous day bucket until an out-of-order midnight handoff settles', async () => {
        const midnight = (Date.parse('2026-10-25T00:00:00+08:00') - startTime) / 1000;
        const old = await start('python', midnight - 45);
        await pulse(old, 1, midnight - 15);
        const next = await start('python', midnight + 5, { kind: 'problem', pid: 25 });
        await pulse(next, 1, midnight + 15);
        await pulse(old, 2, midnight + 17, false);
        await pulse(next, 2, midnight + 25);
        const rows = await model.daily.find({ uid }).sort({ day: 1 }).toArray();
        assert.deepEqual(rows.map((row) => row.seconds), [45, 25]);
        assert.equal(+rows[1].startedAt, +at(midnight));
    });
    it('reanchors the current lease after a brief offline interval without crediting offline time or stealing another lease', async () => {
        const session = await start();
        await pulse(session, 1, 30);
        assert.equal((await pulse(session, 2, 70, true, true)).accepted, true);
        assert.equal(await total(), 30);
        await pulse(session, 3, 80);
        assert.equal(await total(), 40);
        await start('cpp', 85);
        assert.equal((await pulse(session, 4, 90, true, true)).accepted, false);
        assert.equal(await total(), 40);
    });
    it('another domain and duplicate retries never refresh a classroom last active timestamp', async () => {
        const python = await start();
        await pulse(python, 1, 30);
        await pulse(python, 1, 35);
        const cpp = await start('cpp', 40);
        await pulse(cpp, 1, 70);
        const rows = await model.daily.find({ uid }).toArray();
        assert.equal(+rows.find((row) => row.domainId === 'python').updatedAt, +at(30));
        assert.equal(+rows.find((row) => row.domainId === 'cpp').updatedAt, +at(70));
    });
    it('replayed old start cannot steal a new tab lease', async () => {
        const first = await start();
        const second = await start('cpp', 10);
        const reply = await model.startSession(uid, 'python', first.token, first.requestId, at(20));
        assert.equal(reply.accepted, false);
        await pulse(second, 1, 40);
        assert.equal(await total('cpp'), 30);
    });
    it('retrying a start returns original session without resetting elapsed', async () => {
        const first = await start();
        const retry = await model.startSession(uid, 'python', first.token, first.requestId, at(10));
        assert.equal(retry.sessionId, first.sessionId);
        await pulse(first, 1, 30);
        assert.equal(await total(), 30);
    });
    it('bounds credit, drops sleep gaps and resumes at the next heartbeat', async () => {
        const session = await start();
        await pulse(session, 1, 80);
        assert.equal(await total(), 60);
        await pulse(session, 2, 400);
        assert.equal(await total(), 60);
        await pulse(session, 3, 430);
        assert.equal(await total(), 90);
    });
    it('a normal stop credits the last interval then releases', async () => {
        const session = await start();
        await pulse(session, 1, 13, false);
        assert.equal(await total(), 13);
        assert.equal((await pulse(session, 2, 30)).accepted, false);
    });
    it('a discard stop for device sleep adds no elapsed time', async () => {
        const session = await start();
        await pulse(session, 1, 30);
        await pulse(session, 2, 50, false, true);
        assert.equal(await total(), 30);
    });
    it('attributes each actual source independently without duplicate daily totals', async () => {
        const first = await start();
        await pulse(first, 1, 30, false);
        const second = await start('python', 30, { kind: 'problem', pid: 25 });
        await pulse(second, 1, 60, false);
        const third = await start('python', 60, { kind: 'daily', pid: 25 });
        await pulse(third, 1, 90, false);
        const row = await model.daily.findOne({ uid });
        assert.equal(row.seconds, 90);
        assert.deepEqual(row.sources.map((item) => [item.key, item.seconds]), [['problem:17', 30], ['problem:25', 30], ['daily:25', 30]]);
    });
    it('splits midnight precisely in Asia/Shanghai', async () => {
        const base = new Date('2026-10-24T23:59:50+08:00');
        const token = await model.issueSourceGrant(uid, 'python', source, base);
        const session = await model.startSession(uid, 'python', token, 'midnight-request-12345', base);
        await model.heartbeat(uid, 'python', session.sessionId, 1, true, false, new Date(+base + 30_000));
        const rows = await model.daily.find({ uid }).sort({ day: 1 }).toArray();
        assert.deepEqual(rows.map((row) => [row.day, row.seconds]), [['2026-10-24', 10], ['2026-10-25', 20]]);
    });
    it('midnight preserves the prior day accumulated total before the final split interval', async () => {
        const base = new Date('2026-10-24T23:58:50+08:00');
        const token = await model.issueSourceGrant(uid, 'python', source, base);
        const session = await model.startSession(uid, 'python', token, 'midnight-existing-12345', base);
        for (let seq = 1; seq <= 4; seq++) {
            await model.heartbeat(uid, 'python', session.sessionId, seq, true, false, new Date(+base + seq * 30_000));
        }
        const rows = await model.daily.find({ uid }).sort({ day: 1 }).toArray();
        assert.deepEqual(rows.map((row) => [row.day, row.seconds]), [['2026-10-24', 70], ['2026-10-25', 50]]);
        assert.equal((await model.states.findOne({ _id: uid })).buckets.length, 1);
    });
    it('does not revisit historical days when next day advances', async () => {
        const first = await start();
        await pulse(first, 1, 30);
        const second = await start('python', 86400);
        await pulse(second, 1, 86430);
        assert.equal(await total(), 60);
        assert.equal((await model.states.findOne({ _id: uid })).buckets.length, 1);
    });
    it('source grants cannot be transferred to another learner or domain', async () => {
        const first = await start();
        assert.equal((await model.startSession(uid + 999, 'python', first.token, 'unauthorized-request-123', at(10))).accepted, false);
        assert.equal((await model.startSession(uid, 'cpp', first.token, 'unauthorized-request-123', at(10))).accepted, false);
    });
    it('expired grants and leases reject new credit', async () => {
        const session = await start();
        const expired = await model.startSession(uid, 'python', session.token, 'expired-request-12345678', at(86401));
        assert.equal(expired.accepted, false);
        assert.equal(expired.refreshSource, true);
        const version = (await model.states.findOne({ _id: uid })).version;
        const reply = await pulse(session, 1, 86401);
        assert.equal(reply.accepted, false);
        assert.equal(reply.refreshSource, true);
        assert.equal((await pulse(session, 1, 86401, false)).refreshSource, undefined);
        const otherDomain = await model.heartbeat(uid, 'cpp', session.sessionId, 1, true, false, at(86401));
        assert.equal(otherDomain.refreshSource, undefined);
        assert.equal((await model.states.findOne({ _id: uid })).version, version);
        await start('cpp', 86402);
        assert.equal((await pulse(session, 1, 86403)).refreshSource, undefined);
        assert.equal(await total(), 0);
    });
    it('settles the recent authorized tail at grant expiry, exactly once', async () => {
        const session = await start();
        await pulse(session, 1, 86385);
        assert.equal((await pulse(session, 2, 86408)).refreshSource, true);
        assert.equal(await total(), 15);
        await pulse(session, 2, 86412);
        await pulse(session, 3, 86415, false);
        assert.equal(await total(), 15);
        assert.equal(+(await model.daily.findOne({ uid })).updatedAt, +at(86400));
    });

    it('settles a displaced tab through grant expiry when the new tab starts just afterwards', async () => {
        const old = await start();
        await pulse(old, 1, 86385);
        const fresh = await start('cpp', 86402);
        await pulse(old, 2, 86403, false);
        await pulse(fresh, 1, 86412, false);
        assert.equal(await total(), 15);
        assert.equal(await total('cpp'), 10);
        assert.equal(+(await model.daily.findOne({ uid, domainId: 'python' })).updatedAt, +at(86400));
    });

    it('signals transient write contention instead of retiring the correct lease', async () => {
        const session = await start();
        const replace = model.states.replaceOne.bind(model.states);
        model.states.replaceOne = async () => ({ matchedCount: 0 });
        try { await assert.rejects(() => pulse(session, 1, 30)); }
        finally { model.states.replaceOne = replace; }
        assert.equal((await pulse(session, 1, 35)).accepted, true);
        assert.equal(await total(), 35);
    });

    it('keeps measured seconds when the per-day source breakdown reaches its cap', async () => {
        const session = await start('python', 3, { kind: 'problem', pid: 3001 });
        const sources = Array.from({ length: 2000 }, (_, i) => ({ kind: 'problem', pid: i + 1, key: 'problem:' + (i + 1), milliseconds: 1 }));
        await model.states.updateOne({ _id: uid }, { $set: { buckets: [{
            domainId: 'python', day: clockLib.trainingDay(at(3)), startedAt: at(0), updatedAt: at(2), milliseconds: 2000, sources,
        }] } });
        await pulse(session, 1, 33, false);
        const row = await model.daily.findOne({ uid, domainId: 'python' });
        assert.equal(row.seconds, 32);
        assert.equal(row.intervals[0].pid, 3001);
        assert.equal(row.intervals[0].end - row.intervals[0].start, 30000);
    });

    it('evicts and reloads a projected day at the outbox bucket limit without losing earlier totals', async () => {
        const old = await start('python');
        await pulse(old, 1, 10, false);
        const session = await start('next', 10);
        const day = clockLib.trainingDay(at(0));
        const idleBuckets = Array.from({ length: 99 }, (_, i) => ({
            domainId: 'other-' + i, day, startedAt: at(0), updatedAt: at(0), milliseconds: 0, sources: [], intervals: [],
        }));
        await model.states.updateOne({ _id: uid }, { $push: { buckets: { $each: idleBuckets } } });
        await pulse(session, 1, 20, false);
        const back = await start('python', 20);
        await pulse(back, 1, 30, false);
        assert.equal(await total('next'), 10);
        assert.equal(await total('python'), 20);
        assert((await model.states.findOne({ _id: uid })).buckets.length <= 100);
    });

    it('continues counting a recovered daily snapshot with a higher ledger version', async () => {
        const old = await start();
        await pulse(old, 1, 10);
        await pulse(old, 2, 30, false);
        await model.states.deleteOne({ _id: uid });
        const fresh = await start('python', 40);
        await pulse(fresh, 1, 50, false);
        const row = await model.daily.findOne({ uid, domainId: 'python' });
        assert.equal(row.seconds, 40);
        assert.equal(row.sources[0].seconds, 40);
        assert.deepEqual(row.intervals.map(({ start, end }) => [start, end]), [[+at(0), +at(30)], [+at(40), +at(50)]]);
    });

    it('rejects client-supplied malformed sequences and activity flags', async () => {
        const session = await start();
        for (const seq of [-1, 0, 1.5, '1', Infinity, 1000000001]) {
            await assert.rejects(() => model.heartbeat(uid, 'python', session.sessionId, seq, true, false, at(30)), ValidationError);
        }
        await assert.rejects(() => model.heartbeat(uid, 'python', session.sessionId, 1, 'true', false, at(30)), ValidationError);
        await assert.rejects(() => model.heartbeat(uid, 'python', session.sessionId, 1, true, 'true', at(30)), ValidationError);
        assert.equal(await total(), 0);
    });
    it('backwards server clock cannot create overlapping training intervals', async () => {
        const first = await start();
        await pulse(first, 1, 30);
        const second = await start('cpp', 10);
        await pulse(second, 1, 40);
        assert.equal(await total(), 30);
        assert.equal(await total('cpp'), 10);
    });
    it('projection is idempotent and an old snapshot cannot overwrite a new snapshot', async () => {
        const session = await start();
        await pulse(session, 1, 30);
        const old = await model.states.findOne({ _id: uid });
        await pulse(session, 2, 60);
        old.dirty = true;
        await model.flushState(old);
        await model.flushState(old);
        assert.equal(await total(), 60);
    });
    it('a projection failure is repaired without another learner request', async () => {
        const session = await start();
        const replace = model.daily.replaceOne.bind(model.daily);
        model.daily.replaceOne = async () => { throw new Error('temporary disk failure'); };
        try { await pulse(session, 1, 30); } finally { model.daily.replaceOne = replace; }
        assert.equal(await total(), 0);
        assert.equal((await model.states.findOne({ _id: uid })).dirty, true);
        await model.drainPending();
        assert.equal(await total(), 30);
        assert.equal((await model.states.findOne({ _id: uid })).dirty, false);
        await model.drainPending();
        assert.equal(await total(), 30);
    });
    it('does not mark a rejected projection clean until the same or newer version is actually stored', async () => {
        const session = await start();
        await pulse(session, 1, 30);
        const replace = model.daily.replaceOne.bind(model.daily);
        model.daily.replaceOne = async () => { throw Object.assign(new Error('racing unique key'), { code: 11000 }); };
        try { await pulse(session, 2, 60); } finally { model.daily.replaceOne = replace; }
        assert.equal((await model.states.findOne({ _id: uid })).dirty, true);
        await model.drainPending();
        assert.equal(await total(), 60);
    });

    it('a repeatedly failing projection does not starve the next learner in a bounded drain', async () => {
        const first = await start();
        const blockedUid = uid;
        const replace = model.daily.replaceOne.bind(model.daily);
        model.daily.replaceOne = async () => { throw new Error('write not ready'); };
        try {
            await pulse(first, 1, 10, false);
            uid = nowUid();
            const second = await start();
            await pulse(second, 1, 15, false);
            model.daily.replaceOne = async (filter, row, options) => {
                if (row.uid === blockedUid) throw new Error('persistent failure for first learner');
                return replace(filter, row, options);
            };
            await model.drainPending(1);
            await model.drainPending(1);
            assert.equal(await total(), 15);
        } finally { model.daily.replaceOne = replace; await model.drainPending(); }
    });

    it('unflushed historical snapshot survives day rollover and process replacement', async () => {
        const session = await start();
        const replace = model.daily.replaceOne.bind(model.daily);
        model.daily.replaceOne = async () => { throw new Error('temporary disk failure'); };
        try { await pulse(session, 1, 30); } finally { model.daily.replaceOne = replace; }
        await start('cpp', 86400);
        const oldDay = await model.daily.findOne({ uid, day: '2026-10-24' });
        assert.equal(oldDay.seconds, 30);
        assert.equal((await model.states.findOne({ _id: uid })).dirty, false);
    });
    it('keeps a persistent feature launch timestamp rather than resetting it at restart', async () => {
        const first = await model.getTrackingStartedAt();
        assert(first instanceof Date);
        await model.apply({ interval: (fn) => { interval = fn; } });
        assert.equal(+await model.getTrackingStartedAt(), +first);
        assert.equal(typeof interval, 'function');
    });
});

describe('reconciles two devices, a Beijing week boundary and projection recovery', () => {
    const midnight = Date.parse('2026-10-26T00:00:00+08:00');
    const when = (seconds) => new Date(midnight + seconds * 1000);
    const request = (device, n) => device.repeat(32) + '_' + String(n).padStart(10, '0');
    for (const handoff of [-2, 0, 5]) {
        for (const finalFirst of [false, true]) {
            for (const failure of ['none', 'before write', 'after write', 'duplicate key']) {
                it(`handoff ${handoff}s, ${finalFirst ? 'release' : 'new pulse'} arrives first, ${failure}`, async () => {
                    const python = await model.issueSourceGrant(uid, 'python', { kind: 'problem', pid: 11 }, when(-45));
                    const cpp = await model.issueSourceGrant(uid, 'cpp', { kind: 'problem', pid: 12 }, when(-45));
                    const next = await model.issueSourceGrant(uid, 'python', { kind: 'problem', pid: 13 }, when(-45));
                    const begin = (domain, grant, id, t) => model.startSession(uid, domain, grant, id, when(t));
                    const a = await begin('python', python, request('a', 2), -44);
                    const beat = (domain, session, seq, t, active = true, delay = 0) =>
                        model.heartbeat(uid, domain, session.sessionId, seq, active, false, when(t), delay * 1000);
                    await beat('python', a, 1, -27);
                    const older = await model.states.findOne({ _id: uid });
                    older.dirty = true;
                    const replace = model.daily.replaceOne.bind(model.daily);
                    model.daily.replaceOne = async (...args) => {
                        if (failure === 'before write') throw new Error('write unavailable');
                        if (failure === 'duplicate key') throw Object.assign(new Error('competing insert'), { code: 11000 });
                        const written = await replace(...args);
                        if (failure === 'after write') throw new Error('acknowledgement lost');
                        return written;
                    };
                    try {
                        const b = await begin('cpp', cpp, request('b', 1), handoff);
                        assert.equal(b.accepted, true);
                        const release = (t) => beat('python', a, 2, t, false, t - (handoff - 2));
                        if (finalFirst) await release(handoff + 5);
                        await beat('cpp', b, 1, handoff + 10);
                        if (!finalFirst) await release(handoff + 11);
                        await release(handoff + 12);
                        assert.equal((await begin('python', python, request('a', 1), handoff + 13)).accepted, false);
                        assert.equal((await begin('python', python, request('a', 2), handoff + 14)).accepted, false);
                        await beat('cpp', b, 1, handoff + 16);
                        await beat('cpp', b, 2, handoff + 29, false);
                        await model.closePendingStart(uid, 'cpp', cpp, request('b', 3), false, when(handoff + 30));
                        assert.equal((await begin('cpp', cpp, request('b', 3), handoff + 31)).accepted, false);
                        const c = await begin('python', next, request('a', 3), handoff + 35);
                        assert.equal(c.accepted, true);
                        await beat('python', c, 1, handoff + 45);
                        await beat('python', c, 2, handoff + 50, false);
                        if (failure !== 'none') assert.equal((await model.states.findOne({ _id: uid })).dirty, true);
                    } finally { model.daily.replaceOne = replace; }

                    const restarted = loadLedger();
                    await restarted.flushState(older);
                    await restarted.drainPending();
                    await restarted.drainPending();
                    await restarted.flushState(older);
                    assert.equal((await restarted.states.findOne({ _id: uid })).dirty, false);
                    const rows = await restarted.daily.find({ uid }).sort({ day: 1, domainId: 1 }).toArray();
                    // Independent oracle: seconds of known foreground activity,
                    // intersected directly with Sunday/Monday using the fixed boundary.
                    const expected = [];
                    const spans = [['python', 11, -44, handoff - 2], ['cpp', 12, handoff, handoff + 29],
                        ['python', 13, handoff + 35, handoff + 50]];
                    for (const [day, from, to] of [['2026-10-25', -86400, 0], ['2026-10-26', 0, 86400]]) {
                        for (const domain of ['cpp', 'python']) {
                            const intervals = spans.filter(([owner]) => owner === domain).map(([, pid, start, end]) =>
                                [pid, Math.max(start, from), Math.min(end, to)]).filter(([, start, end]) => end > start);
                            if (intervals.length) expected.push([day, domain, intervals.reduce((n, [, start, end]) => n + end - start, 0),
                                intervals, intervals.map(([pid, start, end]) => [pid, end - start])]);
                        }
                    }
                    const relative = (ms) => (ms - midnight) / 1000;
                    assert.deepEqual(rows.map((row) => [row.day, row.domainId, row.seconds,
                        row.intervals.map((span) => [span.pid, relative(span.start), relative(span.end)]),
                        row.sources.map((item) => [item.pid, item.seconds]).sort(([a], [b]) => a - b)]), expected);
                });
            }
        }
    }
});

describe('training time authorization and private reporting boundary', () => {
    beforeEach(async () => { await members.insertOne({ uid, domainId: 'python', join: true }); });
    it('accepts only authenticated joined students using same-origin POST', async () => {
        await handler().prepare();
        const h = handler();
        h.request.headers = { referer: 'https://school.test/d/python/p/17' };
        await h.prepare();
    });
    it('students sharing an IP have independent accounting request limits', async () => {
        const limits = [];
        const h = handler();
        const grant = await model.issueSourceGrant(uid, 'python', source);
        h.limitRate = async (...args) => limits.push(args);
        h.request.body = { sourceToken: grant, requestId: 'shared-school-network' };
        await h.prepare();
        await h.post();
        const beat = handler(handlers.TrainingTimeHeartbeatHandler);
        beat.limitRate = h.limitRate;
        beat.request.body = { sessionId: h.response.body.sessionId, seq: 1, active: true };
        await beat.prepare();
        await beat.post();
        assert.deepEqual(limits, [['training_time_start', 60, 30, '{{user}}'], ['training_time_pulse', 60, 30, '{{user}}']]);
    });
    it('refreshes only the currently authorized study page as a private response', async () => {
        const hooks = {};
        handlers.apply({ Route() {}, on: (name, fn) => { hooks[name] = fn; } });
        async function refresh(review = false) {
            const h = handler();
            const headers = {};
            h.response.addHeader = (key, value) => { headers[key] = value; };
            h.request.method = 'GET';
            h.request.query = { __trainingTimeGrant: '1', ...(review ? { reviewUid: 42 } : {}) };
            h.response.template = 'problem_detail.html';
            h.pdoc = { docId: 17 };
            await hooks['handler/after'](h);
            await hooks['handler/finish'](h);
            assert.equal(headers['Cache-Control'], 'private, no-store');
            assert.equal(h.response.type, 'application/json');
            assert.deepEqual(Object.keys(h.response.body), ['trainingTime']);
            return h.response.body.trainingTime;
        }
        const config = await refresh();
        assert.equal(config.contextKey, 'python:problem:17');
        assert((await model.getSourceGrant(uid, 'python', config.sourceToken)));
        assert.equal(await refresh(true), null);
        await members.deleteOne({ uid, domainId: 'python' });
        assert.equal(await refresh(), null);
    });
    it('rejects unjoined or blocked accounts immediately', async () => {
        await members.updateOne({ uid }, { $set: { blockedByStudentManagement: true } });
        await assert.rejects(() => handler().prepare(), PermissionError);
        await members.updateOne({ uid }, { $set: { blockedByStudentManagement: false, join: false } });
        await assert.rejects(() => handler().prepare(), PermissionError);
    });
    it('rejects teachers, system admins and teacher impersonation', async () => {
        await assert.rejects(() => handler(undefined, { user: student(uid, true) }).prepare(), PermissionError);
        await assert.rejects(() => handler(undefined, { user: student(uid, false, 3) }).prepare(), PermissionError);
        await assert.rejects(() => handler(undefined, { session: { sudoUid: 1 } }).prepare(), PermissionError);
    });
    it('does not collect Scratch activity or generic page browsing', async () => {
        await assert.rejects(() => handler(undefined, { domain: { _id: 'python', domainType: 'scratch' } }).prepare(), PermissionError);
        const h = handler();
        h.request.method = 'GET';
        h.response.template = 'main.html';
        await handlers.injectTrainingConfig(h);
        assert.equal(h.UiContext.trainingTime, undefined);
    });
    it('rejects cross-origin and missing CSRF source', async () => {
        for (const headers of [{}, { origin: 'https://evil.test' }, { origin: 'null' }, { referer: 'https://school.test.evil.test' }]) {
            const h = handler(); h.request.headers = headers;
            await assert.rejects(() => h.prepare(), CsrfTokenError);
        }
    });
    it('GET cannot expose stored student totals or sessions', async () => {
        const h = handler(); h.request.method = 'GET';
        await assert.rejects(() => h.prepare(), PermissionError);
        assert.equal(typeof h.get, 'undefined');
    });
    it('rejects arbitrary client durations and target users in both APIs', async () => {
        const h = handler(); h.request.body = { sourceToken: 'a'.repeat(48), requestId: 'request-1234567890', uid: 999 };
        await assert.rejects(() => h.post(), ValidationError);
        const pulseHandler = handler(handlers.TrainingTimeHeartbeatHandler);
        pulseHandler.request.body = { sessionId: 'a'.repeat(48), seq: 1, active: true, seconds: 99999 };
        await assert.rejects(() => pulseHandler.post(), ValidationError);
    });
    it('only authorized problem responses receive an opaque grant', async () => {
        const h = handler(); h.request.method = 'GET'; h.response.template = 'problem_detail.html'; h.pdoc = { docId: 17 };
        await handlers.injectTrainingConfig(h);
        assert.equal(h.UiContext.trainingTime.contextKey, 'python:problem:17');
        const grant = await model.grants.findOne({ _id: h.UiContext.trainingTime.sourceToken });
        assert.equal(grant.uid, uid);
        assert.equal(grant.source.pid, 17);
        assert(!Object.hasOwn(h.UiContext.trainingTime, 'seconds'));
    });
    it('does not mint a grant for denied, redirected or teacher review pages', async () => {
        for (const change of [{ status: 403 }, { redirect: '/login' }, { query: { reviewUid: 99 } }, { query: { mergedUid: 99 } }]) {
            const h = handler(); h.request.method = 'GET'; h.response.template = 'problem_detail.html'; h.pdoc = { docId: 17 };
            if (change.query) h.request.query = change.query; else Object.assign(h.response, change);
            await handlers.injectTrainingConfig(h);
            assert.equal(h.UiContext.trainingTime, undefined);
        }
    });
    it('tracks only the learner own authorized formal record against its actual problem domain', async () => {
        await members.insertOne({ uid, domainId: 'cpp', join: true });
        const h = handler(); h.request.method = 'GET'; h.response.template = 'record_detail.html';
        h.response.body = { rdoc: { uid, pid: 29, domainId: 'cpp' }, pdoc: { docId: 29, domainId: 'cpp' } };
        await handlers.injectTrainingConfig(h);
        assert.equal(h.UiContext.trainingTime.contextKey, 'cpp:problem:29');
        assert.equal(h.UiContext.trainingTime.scope, `${uid}:cpp`);
        const grant = await model.grants.findOne({ _id: h.UiContext.trainingTime.sourceToken });
        assert.equal(grant.source.kind, 'problem');
        assert.equal(grant.domainId, 'cpp');
    });
    it('never counts another learner record, pretest/generate, deleted problems or restricted summaries', async () => {
        const cases = [
            { rdoc: { uid: uid + 1, pid: 29, domainId: 'python' } },
            { rdoc: { uid, pid: 29, domainId: 'python', contest: new ObjectId('000000000000000000000000') } },
            { rdoc: { uid, pid: 29, domainId: 'python', contest: new ObjectId('000000000000000000000001') } },
            { isPretestRecord: true }, { pdoc: null }, { pdoc: { docId: 30, domainId: 'python' } },
            { rdoc: { _id: 'limited-summary', lang: 'cpp', code: 'int main(){}' } },
            { rdoc: { uid, pid: 0, domainId: 'python' }, pdoc: { docId: 0, domainId: 'python' } },
            { rdoc: { uid, pid: 29, domainId: 'unjoined' }, pdoc: { docId: 29, domainId: 'unjoined' } },
            { rdoc: { uid, pid: 29, domainId: 'scratch' }, pdoc: { docId: 29, domainId: 'scratch' } },
        ];
        for (const changed of cases) {
            const h = handler(); h.request.method = 'GET'; h.response.template = 'record_detail.html';
            h.response.body = { rdoc: { uid, pid: 29, domainId: 'python' }, pdoc: { docId: 29, domainId: 'python' }, ...changed };
            await handlers.injectTrainingConfig(h);
            assert(!h.UiContext.trainingTime, JSON.stringify(changed));
        }
    });
    it('record list, download responses and unauthorized record pages receive no training grant', async () => {
        for (const changed of [{ template: 'record_main.html' }, { template: null }, { status: 403 }, { redirect: '/login' }]) {
            const h = handler(); h.request.method = 'GET'; h.response.template = 'record_detail.html';
            h.response.body = { rdoc: { uid, pid: 29, domainId: 'python' }, pdoc: { docId: 29, domainId: 'python' } };
            Object.assign(h.response, changed);
            await handlers.injectTrainingConfig(h);
            assert.equal(h.UiContext.trainingTime, undefined);
        }
    });
    it('daily quiz uses actual question domain and source rather than current domain', async () => {
        await members.insertOne({ uid, domainId: 'cpp', join: true });
        await quiz.insertOne({ _id: `quiz-${uid}`, uid, items: [{ id: 1, domainId: 'cpp', sourceId: 81 }] });
        const h = handler(); h.request.path = '/daily-quiz'; h.response.body = { state: {
            enabled: true, required: true, sessionId: `quiz-${uid}`, current: { id: 1, domainId: 'cpp' },
        } };
        await handlers.injectTrainingConfig(h);
        assert.equal(h.response.body.trainingTime.contextKey, 'cpp:daily:81');
        assert.equal(h.response.body.trainingTime.scope, `${uid}:cpp`);
    });
    it('completed daily quiz explicitly stops the collector', async () => {
        const h = handler(); h.request.path = '/daily-quiz'; h.response.body = { state: { required: false, completed: true } };
        await handlers.injectTrainingConfig(h);
        assert.equal(h.response.body.trainingTime, null);
    });
    it('daily quiz cannot mint grants to a nonjoined or Scratch classroom', async () => {
        for (const domainId of ['unjoined', 'scratch']) {
            const id = `quiz-${uid}-${domainId}`;
            await quiz.insertOne({ _id: id, uid, items: [{ id: 1, domainId, sourceId: 81 }] });
            const h = handler(); h.request.path = '/daily-quiz'; h.response.body = { state: {
                enabled: true, required: true, sessionId: id, current: { id: 1, domainId },
            } };
            await handlers.injectTrainingConfig(h);
            assert.equal(h.response.body.trainingTime, null);
        }
    });
    it('continues final-question explanation until the learner leaves it', async () => {
        await quiz.insertOne({ _id: `quiz-final-${uid}`, uid, items: [{ id: 1, domainId: 'python', sourceId: 81 }] });
        const h = handler(); h.request.path = '/daily-quiz'; h.response.body = { state: {
            enabled: true, required: false, completed: true, sessionId: `quiz-final-${uid}`,
            current: { id: 1, domainId: 'python', feedback: { correct: false } },
        } };
        await handlers.injectTrainingConfig(h);
        assert.equal(h.response.body.trainingTime.contextKey, 'python:daily:81');
    });
    it('tracks standalone IDE as a distinct source without inventing a problem', async () => {
        const h = handler(); h.request.method = 'GET'; h.response.template = 'online_ide.html';
        await handlers.injectTrainingConfig(h);
        assert.equal(h.UiContext.trainingTime.contextKey, 'python:ide:0');
        const session = await start('python', 0, { kind: 'ide', pid: 0 });
        await pulse(session, 1, 30);
        const row = await model.daily.findOne({ uid });
        assert.equal(row.sources[0].key, 'ide:0');
    });
});

describe('server-timed closure before start acknowledgement and delayed terminal retry', () => {
    it('credits a short foreground study before its START acknowledgement and never extends through a retry', async () => {
        const first = await start();
        const stop = (seconds, delayed = 0) => model.closePendingStart(uid, first.domainId, first.token, first.requestId, false, at(seconds), delayed);
        assert.equal((await stop(8, 3000)).accepted, true);
        assert.equal(await total(), 5);
        await stop(12, 7000);
        assert.equal(await total(), 5);
    });

    it('honours a terminal request that overtakes START without taking the other tab or minting time', async () => {
        const token = await model.issueSourceGrant(uid, 'python', source, at(0));
        const requestId = 'pending-request-id-12345';
        const other = await start('cpp', 1);
        await model.closePendingStart(uid, 'python', token, requestId, false, at(2));
        assert.equal((await model.startSession(uid, 'python', token, requestId, at(4))).accepted, false);
        assert.equal((await pulse(other, 1, 10)).accepted, true);
        assert.equal(await total('cpp'), 9);
        assert.equal(await total(), 0);
    });

    it('an older START arriving between a newer question and its own STOP cannot displace the learner', async () => {
        const shared = '1'.repeat(32);
        const firstId = shared + '_0000000001';
        const secondId = shared + '_0000000002';
        const oldToken = await model.issueSourceGrant(uid, 'python', source, at(0));
        const nextToken = await model.issueSourceGrant(uid, 'cpp', source, at(0));
        const next = await model.startSession(uid, 'cpp', nextToken, secondId, at(5));
        assert.equal(next.accepted, true);
        assert.equal((await model.startSession(uid, 'python', oldToken, firstId, at(6))).accepted, false);
        await model.closePendingStart(uid, 'python', oldToken, firstId, false, at(7));
        await model.heartbeat(uid, 'cpp', next.sessionId, 1, true, false, at(15));
        assert.equal(await total(), 0);
        assert.equal(await total('cpp'), 10);
        const other = await model.startSession(uid, 'python', oldToken, '2'.repeat(32) + '_0000000001', at(16));
        assert.equal(other.accepted, true, 'an independent tab can still take over');
    });

    it('all six delivery orders and replays of old START, old STOP and new START keep the new page crediting exactly once', async () => {
        for (const order of ['acb', 'abc', 'cab', 'cba', 'bac', 'bca']) {
            uid = nowUid();
            const prefix = '1'.repeat(32);
            const oldId = prefix + '_0000000001';
            const nextId = prefix + '_0000000002';
            const first = await model.issueSourceGrant(uid, 'python', source, at(0));
            const next = await model.issueSourceGrant(uid, 'cpp', source, at(0));
            const requests = {
                a: time => model.startSession(uid, 'python', first, oldId, at(time)),
                c: time => model.closePendingStart(uid, 'python', first, oldId, false, at(time)),
                b: time => model.startSession(uid, 'cpp', next, nextId, at(time)),
            };
            for (const [index, packet] of [...order].entries()) await requests[packet](5 + index);
            const newOwner = await requests.b(8);
            assert.equal(newOwner.accepted, true, order);
            for (const packet of order) await requests[packet](9);
            await model.heartbeat(uid, 'cpp', newOwner.sessionId, 1, true, false, at(20));
            assert.equal(await total('cpp'), 15 - order.indexOf('b'), order);
            assert.equal(await total(), order[0] === 'a' ? 1 : 0, order);
        }
    });

    it('a newer terminal tombstone prevents even an older different-grant START in the same stream', async () => {
        const idPrefix = 'e'.repeat(32);
        const first = await model.issueSourceGrant(uid, 'python', source, at(0));
        const next = await model.issueSourceGrant(uid, 'cpp', source, at(0));
        await model.closePendingStart(uid, 'cpp', next, idPrefix + '_0000000002', false, at(2));
        const previous = await model.startSession(uid, 'python', first, idPrefix + '_0000000001', at(3));
        assert.equal(previous.accepted, false);
        assert.equal((await model.states.findOne({ _id: uid })).lease, null);
        assert.equal(await total(), 0);
    });

    it('settles a previous page only to its exit and protects the new owner for either delivery order', async () => {
        const old = await start();
        const next = await start('cpp', 10);
        assert.equal((await model.closePendingStart(uid, old.domainId, old.token, old.requestId, false, at(14), 5000)).accepted, true);
        assert.equal(await total(), 9);
        await pulse(next, 1, 20);
        assert.equal(await total('cpp'), 10);
    });

    it('a delayed terminal packet can only shorten a server-observed window, never erase credited activity', async () => {
        const old = await start();
        await pulse(old, 1, 30);
        await model.heartbeat(uid, old.domainId, old.sessionId, 2, false, false, at(35), 7000);
        assert.equal(await total(), 30);
        for (const delay of [-1, '5', 1.5, 100000]) {
            await assert.rejects(model.heartbeat(uid, old.domainId, old.sessionId, 2, false, false, at(35), delay));
        }
        await assert.rejects(model.heartbeat(uid, old.domainId, old.sessionId, 3, true, false, at(35), 2));
    });

    for (const displaced of [false, true]) {
        for (const receiptMs of [90000, 90001]) {
            it(`bounds a delayed STOP for the ${displaced ? 'displaced' : 'current'} device at ${receiptMs}ms of server silence`, async () => {
                const old = await start();
                const next = displaced ? await start('cpp', 45) : null;
                if (next) await pulse(next, 1, 70);
                const receipt = new Date(+at(0) + receiptMs);
                await model.heartbeat(uid, 'python', old.sessionId, 1, false, false, receipt, receiptMs - 40_000);
                assert.equal(await total(), receiptMs === 90000 ? 40 : 0);
                if (next) {
                    await pulse(next, 2, 95, false);
                    assert.equal(await total('cpp'), 50);
                }
            });
        }
    }

    it('a request ID plus token cannot close another learner or classroom or open a lease with a guessed token', async () => {
        const current = await start();
        for (const [claimedUid, claimedDomain] of [[uid + 200, current.domainId], [uid, 'foreign']]) {
            assert.equal((await model.closePendingStart(claimedUid, claimedDomain, current.token, current.requestId, false, at(5))).accepted, false);
        }
        assert.equal((await model.closePendingStart(uid, current.domainId, 'f'.repeat(48), current.requestId, false, at(5))).accepted, false);
        await pulse(current, 1, 13);
        assert.equal(await total(), 13);
    });
});
