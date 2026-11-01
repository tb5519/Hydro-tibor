const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '..');
function load(filename, dependencies, globals = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, filename), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, setTimeout, clearTimeout,
        require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), ...globals,
    });
    return module.exports;
}
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
async function until(predicate, message = 'condition was not reached') {
    const deadline = Date.now() + 3000;
    while (!await predicate()) {
        assert(Date.now() < deadline, message);
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}
let mongod;
let client;
let database;
let tasks;
let model;
let consumers = [];
let gates = [];
const sleeps = [];
const errors = [];
before(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    database = client.db('judge-task-fairness');
    tasks = database.collection('task');
    model = load('packages/hydrooj/src/model/task.ts', {
        cac: () => ({ parse: () => ({ options: {} }) }),
        nanoid: { nanoid: () => 'test-consumer' },
        '@hydrooj/utils/lib/utils': { sleep: (ms) => {
            sleeps.push(ms);
            return new Promise((resolve) => setTimeout(resolve, ms).unref());
        } },
        '../logger': { Logger: class { debug() {} info() {} error(error) { errors.push(error); } } },
        '../service/bus': { on() {} },
        '../service/db': { collection: (name) => database.collection(name) },
    }, { process: { env: {} }, global: { Hydro: { model: {} } } }).default;
});
beforeEach(async () => {
    await tasks.deleteMany({});
    sleeps.length = 0;
    errors.length = 0;
});
after(async () => {
    await client?.close();
    await mongod?.stop();
});
function hold() {
    const gate = deferred();
    gates.push(gate);
    return gate;
}
function consume(t, callback, options = { concurrencyKey: 'uid' }, concurrency = 2, filter = { type: 'judge' }) {
    const consumer = model.consume(filter, callback, false, concurrency, options);
    consumers.push(consumer);
    t.after(async () => {
        await consumer.destroy();
        gates.forEach((gate) => gate.resolve());
        await until(() => consumer.processing.size === 0, 'active tasks did not finish during cleanup');
        gates = [];
        consumers = consumers.filter((item) => item !== consumer);
    });
    return consumer;
}
const task = (name, uid, priority, extra = {}) => ({ _id: new ObjectId(), name, uid, priority, type: 'judge', ...extra });

describe('Judge task admission fairness', () => {
    it('lets a second learner run while the first learner has multiple higher-priority submissions', async (t) => {
        await tasks.insertMany([task('loop-1', 20, 100), task('loop-2', 20, 90), task('normal', 21, 10)]);
        const first = hold();
        const normal = hold();
        const started = [];
        const consumer = consume(t, async (item) => {
            started.push(item.name);
            if (item.name === 'loop-1') await first.promise;
            if (item.name === 'normal') await normal.promise;
        });
        await until(() => started.length === 2);
        assert.deepEqual(started, ['loop-1', 'normal']);
        assert.equal(consumer.processing.size, 2);
        assert.equal(await tasks.countDocuments({ name: 'loop-2' }), 1, 'blocked work must remain waiting in Mongo');
        normal.resolve();
        await until(() => consumer.processing.size === 1);
        await new Promise((resolve) => setTimeout(resolve, 40));
        assert(!started.includes('loop-2'));
        assert(sleeps.length > 0 && sleeps.every((ms) => ms >= 500), 'blocked-only work must wait instead of busy polling');
        assert(sleeps.length <= 2);
        first.resolve();
        await until(() => started.includes('loop-2'), 'a finished learner must immediately become eligible again');
    });

    it('preserves existing UID, domain, priority and task-type filters while choosing the highest eligible priority', async (t) => {
        await tasks.insertMany([
            task('wrong-domain', 9, 900, { domainId: 'other' }),
            task('wrong-type', 9, 800, { domainId: 'python', type: 'generate' }),
            task('wrong-uid', 8, 700, { domainId: 'python' }),
            task('first', 7, 100, { domainId: 'python' }),
            task('same-uid', 7, 90, { domainId: 'python' }),
            task('eligible', 9, 50, { domainId: 'python' }),
            task('below-priority', 9, 0, { domainId: 'python' }),
        ]);
        const gate = hold();
        const started = [];
        consume(t, async (item) => { started.push(item.name); await gate.promise; }, { concurrencyKey: 'uid' }, 2,
            { type: 'judge', domainId: 'python', uid: { $in: [7, 9] }, priority: { $gte: 10 } });
        await until(() => started.length === 2);
        assert.deepEqual(started, ['first', 'eligible']);
        assert.equal(await tasks.countDocuments({}), 5);
    });

    it('releases the learner key after a synchronous callback failure', async (t) => {
        await tasks.insertMany([task('throws', 30, 20), task('after-error', 30, 10)]);
        const started = [];
        consume(t, (item) => {
            started.push(item.name);
            if (item.name === 'throws') throw new Error('fixture failure');
            return Promise.resolve();
        });
        await until(() => started.length === 2);
        assert.deepEqual(started, ['throws', 'after-error']);
        assert.equal(errors.length, 1);
    });

    it('releases the learner key after an asynchronous rejection without blocking another learner', async (t) => {
        await tasks.insertMany([task('rejects', 30, 30), task('after-error', 30, 20), task('other-learner', 31, 10)]);
        const gate = hold();
        const started = [];
        consume(t, async (item) => {
            started.push(item.name);
            if (item.name === 'rejects') { await gate.promise; throw new Error('async fixture failure'); }
        });
        await until(() => started.includes('other-learner'));
        assert(!started.includes('after-error'));
        gate.resolve();
        await until(() => started.includes('after-error'));
        assert.equal(errors.length, 1);
    });

    it('leaves consumers without a fairness option unchanged', async (t) => {
        await tasks.insertMany([task('first', 40, 20), task('second', 40, 10)]);
        const gate = hold();
        const started = [];
        consume(t, async (item) => { started.push(item.name); await gate.promise; }, {});
        await until(() => started.length === 2);
        assert.deepEqual(started, ['first', 'second']);
    });

    it('does not group legacy tasks with missing or null UIDs into one artificial learner', async (t) => {
        const missing = task('missing', undefined, 20);
        delete missing.uid;
        await tasks.insertMany([missing, task('null', null, 10)]);
        const gate = hold();
        const started = [];
        consume(t, async (item) => { started.push(item.name); await gate.promise; });
        await until(() => started.length === 2);
        assert.deepEqual(started, ['missing', 'null']);
    });

    it('wakes on concurrency and query changes without lifting the per-learner restriction', async (t) => {
        await tasks.insertMany([task('first', 50, 30), task('same-uid', 50, 20), task('other', 51, 10)]);
        const gate = hold();
        const started = [];
        const consumer = consume(t, async (item) => { started.push(item.name); await gate.promise; }, { concurrencyKey: 'uid' }, 1,
            { type: 'judge', uid: 50 });
        await until(() => started.length === 1);
        consumer.setConcurrency(2);
        consumer.setQuery({ type: 'judge', uid: { $in: [50, 51] } });
        await until(() => started.length === 2);
        assert.deepEqual(started, ['first', 'other']);
    });
});

it('enables per-learner admission only for remote Judge consumers', async () => {
    const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/judge.ts'), 'utf8');
    const start = source.indexOf('    async message(msg)', source.indexOf('export class JudgeConnectionHandler'));
    const end = source.indexOf('    async cleanup()', start);
    const factory = new vm.Script(`class JudgeHarness { ${source.slice(start, end)} } JudgeHarness;`);
    const calls = [];
    const Handler = factory.runInNewContext({ task: { consume: (...args) => { calls.push(args); return {}; } },
        logger: { info() {}, debug() {} }, BadRequestError: Error, omit: (value) => value });
    const handler = new Handler();
    handler.newTask = async () => {};
    handler.concurrency = 2;
    handler.query = { type: { $in: ['judge', 'generate'] } };
    await handler.message({ key: 'start' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], handler.query);
    assert.equal(calls[0][3], 2);
    assert.equal(calls[0][4].concurrencyKey, 'uid');
});

it('keeps sum-scored later cases after an earlier TLE instead of losing partial credit', async () => {
    const Queue = require('p-queue').default;
    const { STATUS } = load('packages/common/status.ts', {});
    const { runFlow } = load('packages/hydrojudge/src/flow.ts', {
        'p-queue': Queue, '@hydrooj/common': { STATUS }, './config': { getConfig: () => 1 }, './error': { FormatError: Error },
    });
    const reports = [];
    let result;
    const context = {
        config: { detail: 'full', count: 2, subtasks: [{ id: 1, type: 'sum', score: 100, cases: [{ id: 1 }, { id: 2 }] }] },
        meta: {}, next: (report) => reports.push(report), end: (report) => { result = report; },
        startChildSpan: () => ({ setAttributes() {}, [Symbol.dispose]() {} }),
    };
    await runFlow(context, { compile: async () => {}, judgeCase: (item) => async () => ({ id: item.id,
        status: item.id === 1 ? STATUS.STATUS_TIME_LIMIT_EXCEEDED : STATUS.STATUS_ACCEPTED,
        score: item.id === 1 ? 0 : 50, time: item.id === 1 ? 1000 : 1, memory: 1024 }) });
    assert.deepEqual(reports.filter((report) => report.case).map((report) => report.case.id), [1, 2]);
    assert.equal(result.status, STATUS.STATUS_TIME_LIMIT_EXCEEDED);
    assert.equal(result.score, 50);
});
