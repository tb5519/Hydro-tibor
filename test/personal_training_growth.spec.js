const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.join(__dirname, '..');
const load = (file, dependencies = {}) => {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module, exports: module.exports, Date, require: (name) => dependencies[name] ?? require(name) });
    return module.exports;
};
const clocks = load('packages/hydrooj/src/lib/training_time.ts');
const learning = load('packages/hydrooj/src/lib/learning_time.ts', { './training_time': clocks });
const dashboard = load('packages/hydrooj/src/lib/training_dashboard.ts');
const weeks = load('packages/hydrooj/src/lib/calendar_week.ts');
let database;
let client;
let server;
const queries = [];
const ctx = { db: { collection(name) {
    const collection = database.collection(name);
    return new Proxy(collection, { get(target, key) {
        if (key === 'find') return (query, ...args) => { queries.push({ name, query }); return target.find(query, ...args); };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
} } };
const workspaces = {
    LEGACY_WORKSPACE_ID: 'tang',
    resolveDomainWorkspaceId: (domain) => domain.workspaceId || 'tang',
    getDomains: (id) => database.collection('domain').find(id === 'tang'
        ? { $or: [{ workspaceId: 'tang' }, { workspaceId: { $exists: false } }] } : { workspaceId: id }).toArray(),
};
const growth = load('packages/hydrooj/src/lib/personal_training_growth.ts', {
    '../model/workspace': workspaces, './calendar_week': weeks, './learning_time': learning, './training_dashboard': dashboard,
});
const date = (value) => new Date(value + '+08:00');
const now = date('2026-11-17T12:00:00');
const get = (uid = 10, domain = { _id: 'python' }, time = now) => growth.getPersonalTrainingGrowth(ctx, domain, uid, time);
function row(day, from, to, extra = {}) {
    const start = +date(`${day}T${from}`); const end = +date(`${day}T${to}`);
    return { uid: 10, domainId: 'python', day, seconds: (end - start) / 1000,
        startedAt: new Date(start), updatedAt: new Date(end),
        intervals: [{ start, end, kind: 'problem', pid: 1 }], ...extra };
}
function lesson(day, from, to, extra = {}) {
    return { uid: 10, workspaceId: 'tang', domainId: 'python',
        startAt: date(`${day}T${from}`), endAt: date(`${day}T${to}`), ...extra };
}
before(async () => {
    server = await MongoMemoryServer.create({ instance: { args: ['--nounixsocket'] } });
    client = await MongoClient.connect(server.getUri());
    database = client.db('personal-training-growth-test');
});
beforeEach(async () => {
    await database.dropDatabase(); queries.length = 0;
    await database.collection('domain').insertMany([
        { _id: 'python' }, { _id: 'cpp', workspaceId: 'tang' },
        { _id: 'modern-a', workspaceId: 'modern' }, { _id: 'modern-b', workspaceId: 'modern' },
        { _id: 'foreign', workspaceId: 'foreign' },
    ]);
    await database.collection('training.time.meta').insertOne({ _id: 'collection', startedAt: date('2026-10-19T00:00:00') });
});
after(async () => { await client?.close(); await server?.stop(); });

describe('personal autonomous training growth', () => {
    it('uses the full Shanghai natural week, including Sunday after the AC award cutoff', async () => {
        await database.collection('training.time.daily').insertMany([
            row('2026-11-15', '20:00:00', '21:00:00'),
            row('2026-11-16', '09:00:00', '10:00:00'),
            row('2026-11-22', '22:15:00', '22:45:00'),
            row('2026-11-23', '00:00:00', '01:00:00'),
        ]);
        const result = await get(10, { _id: 'python' }, date('2026-11-22T23:00:00'));
        assert.equal(result.thisWeekSeconds, 5400);
        assert.deepEqual(Array.from(result.days, (day) => day.date), [
            '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22',
        ]);
        assert.equal(result.days[6].seconds, 1800);
        assert.equal((await get(10, { _id: 'python' }, date('2026-11-23T00:00:00'))).thisWeekSeconds, 0);
    });
    it('clips current-day activity to server now and excludes other learners', async () => {
        await database.collection('training.time.daily').insertMany([
            row('2026-11-17', '11:00:00', '13:00:00'),
            row('2026-11-17', '09:00:00', '10:00:00', { uid: 11 }),
        ]);
        assert.equal((await get()).thisWeekSeconds, 3600);
        assert.equal((await get(11)).thisWeekSeconds, 3600);
        assert.equal((await get(12)).thisWeekSeconds, 0);
        for (const { name, query } of queries) if (name !== 'domain') assert.ok([10, 11, 12].includes(query.uid));
    });
    it('unions simultaneous classroom activity and removes imported class overlaps', async () => {
        await database.collection('training.time.daily').insertMany([
            row('2026-11-17', '09:00:00', '12:00:00'),
            row('2026-11-17', '10:00:00', '11:00:00', { domainId: 'cpp' }),
        ]);
        await database.collection('training.class').insertMany([
            lesson('2026-11-17', '10:00:00', '11:00:00', { domainId: 'cpp' }),
            lesson('2026-11-17', '10:30:00', '11:30:00'),
        ]);
        const result = await get();
        assert.equal(result.thisWeekSeconds, 5400);
        assert.equal(result.thisWeekHasEstimate, false);
        assert.equal(result.days[1].seconds, 5400);
    });
    it('limits modern progress to the current classroom while other workspace lessons still mask it', async () => {
        await database.collection('training.time.daily').insertMany([
            row('2026-11-17', '09:00:00', '12:00:00', { domainId: 'modern-a' }),
            row('2026-11-17', '13:00:00', '15:00:00', { domainId: 'modern-b' }),
            row('2026-11-17', '09:00:00', '16:00:00', { domainId: 'foreign' }),
        ]);
        await database.collection('training.class').insertMany([
            lesson('2026-11-17', '10:00:00', '11:00:00', { workspaceId: 'modern', domainId: 'modern-b' }),
            lesson('2026-11-17', '09:00:00', '10:00:00', { workspaceId: 'foreign', domainId: 'foreign' }),
            lesson('2026-11-17', '11:00:00', '12:00:00', { workspaceId: 'modern', domainId: 'modern-b', uid: 11 }),
        ]);
        const result = await get(10, { _id: 'modern-a', workspaceId: 'modern' });
        assert.equal(result.thisWeekSeconds, 7200);
        const daily = queries.find((item) => item.name === 'training.time.daily').query;
        assert.deepEqual(Array.from(daily.domainId.$in), ['modern-a']);
        const classes = queries.find((item) => item.name === 'training.class').query;
        assert.equal(classes.workspaceId, 'modern'); assert.equal(classes.uid, 10);
        assert.deepEqual(Array.from(classes.domainId.$in).sort(), ['modern-a', 'modern-b']);
    });
    it('averages four completed weeks including quiet weeks, excluding the partial current week', async () => {
        await database.collection('training.time.daily').insertMany([
            row('2026-10-20', '09:00:00', '13:00:00'),
            row('2026-11-13', '09:00:00', '13:00:00'),
            row('2026-11-17', '09:00:00', '10:00:00'),
        ]);
        const result = await get();
        assert.equal(result.thisWeekSeconds, 3600); assert.equal(result.averageWeekSeconds, 7200);
        assert.equal(result.averageWeeks, 4); assert.equal(result.averageStart, '2026-10-19');
        assert.equal(result.averageEnd, '2026-11-16');
        const query = queries.find((item) => item.name === 'training.time.daily').query;
        assert.equal(query.day.$gte, '2026-10-19'); assert.equal(query.day.$lte, '2026-11-17');
    });
    it('excludes an incompletely tracked launch week from the comparison denominator', async () => {
        await database.collection('training.time.meta').updateOne({ _id: 'collection' }, { $set: { startedAt: date('2026-10-28T10:00:00') } });
        await database.collection('training.time.daily').insertMany([
            row('2026-10-30', '09:00:00', '19:00:00'),
            row('2026-11-03', '09:00:00', '11:00:00'),
        ]);
        const result = await get();
        assert.equal(result.averageWeeks, 2); assert.equal(result.averageWeekSeconds, 3600);
        assert.equal(result.averageStart, '2026-11-02');
        assert.equal(queries.find((item) => item.name === 'training.time.daily').query.day.$gte, '2026-11-02');
    });
    it('does not invent a weekly average before one fully tracked week exists', async () => {
        for (const startedAt of [date('2026-11-17T00:00:00'), null]) {
            if (startedAt) await database.collection('training.time.meta').updateOne({ _id: 'collection' }, { $set: { startedAt } });
            else await database.collection('training.time.meta').deleteMany({});
            queries.length = 0;
            const result = await get();
            assert.equal(result.thisWeekSeconds, 0); assert.equal(result.averageWeekSeconds, null); assert.equal(result.averageWeeks, 0);
            assert.equal(queries.find((item) => item.name === 'training.time.daily').query.day.$gte, '2026-11-16');
        }
    });
    it('returns an actual zero average once complete quiet weeks are tracked', async () => {
        const result = await get();
        assert.equal(result.averageWeeks, 4); assert.equal(result.averageWeekSeconds, 0);
        assert.equal(result.averageWeekHasEstimate, false);
    });
    it('preserves uncertainty for historical counters instead of presenting estimated time as measured', async () => {
        const historical = { uid: 10, domainId: 'python', day: '2026-11-17', seconds: 3600,
            startedAt: date('2026-11-17T09:00:00'), updatedAt: date('2026-11-17T11:00:00') };
        await database.collection('training.time.daily').insertOne(historical);
        await database.collection('training.class').insertOne(lesson('2026-11-17', '09:00:00', '10:00:00'));
        const result = await get();
        assert.equal(result.thisWeekSeconds, 1800); assert.equal(result.thisWeekHasEstimate, true);
        assert.equal(result.days[1].hasEstimate, true); assert.equal(result.days[1].seconds, 1800);
    });
});
