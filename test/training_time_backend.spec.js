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
        { module, exports: module.exports, Buffer, URL, Date, process, require: (id) => dependencies[id] ?? require(id) });
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
before(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    database = client.db('training');
    members = database.collection('domain.user');
    quiz = database.collection('daily.quiz.session');
    const db = { collection: (name) => database.collection(name), ensureIndexes: (coll, ...indexes) => coll.createIndexes(indexes) };
    model = load('packages/hydrooj/src/model/training_time.ts', {
        '../error': errors, '../lib/training_time': clockLib, '../service/db': db, '../logger': quietLogger,
    });
    await model.apply({ interval: (fn) => { interval = fn; } });
    handlers = load('packages/hydrooj/src/handler/training_time.ts', {
        '../error': errors, '../lib/training_time': clockLib, '../model/training_time': model,
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
        assert.equal((await model.startSession(uid, 'python', session.token, 'expired-request-12345678', at(86401))).accepted, false);
        assert.equal((await pulse(session, 1, 86401)).accepted, false);
        assert.equal(await total(), 0);
    });
    it('rejects client-supplied malformed sequences and activity flags', async () => {
        const session = await start();
        for (const seq of [-1, 0, 1.5, '1', Infinity, 1000000001]) {
            await assert.rejects(() => model.heartbeat(uid, 'python', session.sessionId, seq, true, false, at(30)), ValidationError);
        }
        await assert.rejects(() => model.heartbeat(uid, 'python', session.sessionId, 1, 'true', false, at(30)), ValidationError);
        await assert.rejects(() => model.heartbeat(uid, 'python', session.sessionId, 1, true, true, at(30)), ValidationError);
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

describe('training time authorization and private reporting boundary', () => {
    beforeEach(async () => { await members.insertOne({ uid, domainId: 'python', join: true }); });
    it('accepts only authenticated joined students using same-origin POST', async () => {
        await handler().prepare();
        const h = handler();
        h.request.headers = { referer: 'https://school.test/d/python/p/17' };
        await h.prepare();
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
