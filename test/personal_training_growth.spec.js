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
    '../model/workspace': workspaces, './domain_type': load('packages/hydrooj/src/lib/domain_type.ts'), './calendar_week': weeks, './learning_time': learning, './training_dashboard': dashboard,
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
    it('legacy home excludes Scratch practice while a native Scratch lesson masks the learners OJ activity', async () => {
        await database.collection('domain').insertOne({ _id: 'scratch', domainType: 'scratch' });
        await database.collection('training.time.daily').insertMany([
            row('2026-11-17', '09:00:00', '10:00:00'),
            row('2026-11-17', '10:00:00', '11:00:00', { domainId: 'scratch' }),
        ]);
        await database.collection('training.class').insertOne(lesson('2026-11-17', '09:00:00', '09:30:00', { domainId: 'scratch', source: 'lesson' }));
        const result = await get();
        assert.equal(result.thisWeekSeconds, 1800);
        assert.equal(result.averageWeekSeconds, 360);
        assert(!queries.find((item) => item.name === 'training.time.daily').query.domainId.$in.includes('scratch'));
        assert(queries.find((item) => item.name === 'training.class').query.domainId.$in.includes('scratch'));
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
    it('averages every covered natural week, including quiet weeks and the partial current week', async () => {
        await database.collection('training.time.daily').insertMany([
            row('2026-10-20', '09:00:00', '13:00:00'),
            row('2026-11-13', '09:00:00', '13:00:00'),
            row('2026-11-17', '09:00:00', '10:00:00'),
        ]);
        const result = await get();
        assert.equal(result.thisWeekSeconds, 3600); assert.equal(result.averageWeekSeconds, 6480);
        assert.equal(result.averageWeeks, 5); assert.equal(result.averageStart, '2026-10-19');
        assert.equal(result.averageEnd, '2026-11-17');
        const query = queries.find((item) => item.name === 'training.time.daily').query;
        assert.equal(query.day.$gte, undefined); assert.equal(query.day.$lte, '2026-11-17');
    });
    it('includes the partial launch week and all subsequent calendar weeks', async () => {
        await database.collection('training.time.meta').updateOne({ _id: 'collection' }, { $set: { startedAt: date('2026-10-28T10:00:00') } });
        await database.collection('training.time.daily').insertMany([
            row('2026-10-30', '09:00:00', '19:00:00'),
            row('2026-11-03', '09:00:00', '11:00:00'),
        ]);
        const result = await get();
        assert.equal(result.averageWeeks, 4); assert.equal(result.averageWeekSeconds, 10800);
        assert.equal(result.averageStart, '2026-10-26');
        assert.equal(queries.find((item) => item.name === 'training.time.daily').query.day.$gte, undefined);
    });
    it('counts a newly tracked current week but does not invent an average when no recording history exists', async () => {
        for (const startedAt of [date('2026-11-17T00:00:00'), null]) {
            if (startedAt) await database.collection('training.time.meta').updateOne({ _id: 'collection' }, { $set: { startedAt } });
            else await database.collection('training.time.meta').deleteMany({});
            queries.length = 0;
            const result = await get();
            assert.equal(result.thisWeekSeconds, 0);
            assert.equal(result.averageWeekSeconds, startedAt ? 0 : null); assert.equal(result.averageWeeks, startedAt ? 1 : 0);
            assert.equal(queries.find((item) => item.name === 'training.time.daily').query.day.$gte, undefined);
        }
    });
    it('counts zero-activity weeks since the platform started recording, even before the learners first activity', async () => {
        const result = await get();
        assert.equal(result.averageWeeks, 5); assert.equal(result.averageWeekSeconds, 0);
        assert.equal(result.averageWeekHasEstimate, false);
    });
    it('keeps all already recorded counter-only time in the current day before the report clock', async () => {
        await database.collection('training.time.daily').insertOne({
            uid: 10, domainId: 'python', day: '2026-11-17', seconds: 600,
        });
        const result = await get();
        assert.equal(result.thisWeekSeconds, 600);
        assert.equal(result.days[1].seconds, 600);
        assert.equal(result.averageWeekSeconds, 120);
        assert.equal(result.thisWeekHasEstimate, false);
    });
    it('preserves uncertainty for historical counters instead of presenting estimated time as measured', async () => {
        const historical = { uid: 10, domainId: 'python', day: '2026-11-17', seconds: 3600,
            startedAt: date('2026-11-17T09:00:00'), updatedAt: date('2026-11-17T11:00:00') };
        await database.collection('training.time.daily').insertOne(historical);
        await database.collection('training.class').insertOne(lesson('2026-11-17', '09:00:00', '10:00:00'));
        const result = await get();
        assert.equal(result.thisWeekSeconds, 1800); assert.equal(result.thisWeekHasEstimate, true);
        assert.equal(result.days[1].hasEstimate, true); assert.equal(result.days[1].seconds, 1800);
        assert.equal(result.averageWeekSeconds, 360); assert.equal(result.averageWeekHasEstimate, true);
    });
    it('keeps activity older than four weeks and older legacy rows predating later collection metadata', async () => {
        await database.collection('training.time.daily').insertMany([
            row('2026-10-06', '09:00:00', '15:00:00'),
            row('2026-11-17', '09:00:00', '10:00:00'),
        ]);
        const result = await get();
        assert.equal(result.averageStart, '2026-10-05'); assert.equal(result.averageWeeks, 7);
        assert.equal(result.averageWeekSeconds, 3600); assert.equal(result.thisWeekSeconds, 3600);
    });
    it('uses scoped existing history when collection metadata is missing, without borrowing another learners earlier activity', async () => {
        await database.collection('training.time.meta').deleteMany({});
        await database.collection('training.time.daily').insertMany([
            row('2026-10-28', '09:00:00', '13:00:00'),
            row('2026-09-01', '09:00:00', '19:00:00', { uid: 11 }),
            row('2026-08-01', '09:00:00', '19:00:00', { domainId: 'foreign' }),
        ]);
        const result = await get();
        assert.equal(result.averageStart, '2026-10-26'); assert.equal(result.averageWeeks, 4);
        assert.equal(result.averageWeekSeconds, 3600); assert.equal(result.averageEnd, '2026-11-17');
    });
    it('deducts lifetime class overlap and duplicate activity before averaging, using all historical weeks', async () => {
        await database.collection('training.time.meta').updateOne({ _id: 'collection' }, { $set: { startedAt: date('2026-10-05T08:00:00') } });
        await database.collection('training.time.daily').insertMany([
            row('2026-10-06', '09:00:00', '13:00:00'),
            row('2026-10-06', '10:00:00', '12:00:00', { domainId: 'cpp' }),
            row('2026-11-17', '09:00:00', '13:00:00'),
        ]);
        await database.collection('training.class').insertOne(lesson('2026-10-06', '10:00:00', '11:00:00', { domainId: 'cpp' }));
        const result = await get(10, { _id: 'python' }, date('2026-11-17T14:00:00'));
        assert.equal(result.averageWeeks, 7); assert.equal(result.averageWeekSeconds, 3600);
        assert.equal(result.thisWeekSeconds, 14400);
    });
    it('personal and explicit authorized scope use exactly the same cumulative calculation for the same time', async () => {
        await database.collection('training.time.daily').insertMany([
            row('2026-10-28', '09:00:00', '13:00:00'),
            row('2026-11-17', '09:00:00', '12:00:00'),
            row('2026-11-17', '10:00:00', '11:00:00', { domainId: 'cpp' }),
        ]);
        await database.collection('training.class').insertOne(lesson('2026-11-17', '10:00:00', '11:00:00', { domainId: 'cpp' }));
        const personal = await get();
        const explicit = await growth.getScopedPersonalTrainingGrowth(ctx, {
            workspaceId: 'tang', uid: 10, domainIds: ['python', 'cpp'], authorizedDomainIds: ['python', 'cpp'],
        }, now);
        assert.deepEqual(JSON.parse(JSON.stringify(explicit)), JSON.parse(JSON.stringify(personal)));
        assert.equal(explicit.averageWeekSeconds, 4320);
    });
    it('modern personal scope and equivalent dashboard selection agree for the same learner and cutoff', async () => {
        await database.collection('training.time.daily').insertMany([
            row('2026-10-28', '09:00:00', '13:00:00', { domainId: 'modern-a' }),
            row('2026-11-17', '09:00:00', '12:00:00', { domainId: 'modern-a' }),
            row('2026-11-17', '09:00:00', '12:00:00', { domainId: 'modern-b' }),
        ]);
        await database.collection('training.class').insertOne(lesson('2026-11-17', '10:00:00', '11:00:00', { workspaceId: 'modern', domainId: 'modern-b' }));
        const personal = await get(10, { _id: 'modern-a', workspaceId: 'modern' });
        const explicit = await growth.getScopedPersonalTrainingGrowth(ctx, {
            workspaceId: 'modern', uid: 10, domainIds: ['modern-a'], authorizedDomainIds: ['modern-a', 'modern-b'],
        }, now);
        assert.deepEqual(JSON.parse(JSON.stringify(explicit)), JSON.parse(JSON.stringify(personal)));
    });
    it('an explicitly authorized mask never expands to another workspace classroom', async () => {
        await database.collection('training.time.daily').insertOne(row('2026-11-17', '09:00:00', '12:00:00'));
        await database.collection('training.class').insertMany([
            lesson('2026-11-17', '09:00:00', '10:00:00', { domainId: 'cpp' }),
            lesson('2026-11-17', '10:00:00', '11:00:00', { workspaceId: 'foreign' }),
            lesson('2026-11-17', '11:00:00', '12:00:00', { uid: 11 }),
        ]);
        const result = await growth.getScopedPersonalTrainingGrowth(ctx, {
            workspaceId: 'tang', uid: 10, domainIds: ['python'], authorizedDomainIds: ['python'],
        }, now);
        assert.equal(result.thisWeekSeconds, 10800);
        assert.equal(result.averageWeekSeconds, 2160);
        const query = queries.find((item) => item.name === 'training.class').query;
        assert.deepEqual(Array.from(query.domainId.$in), ['python']);
        assert.equal(query.workspaceId, 'tang'); assert.equal(query.uid, 10);
    });
    it('rejects selection outside the supplied authorization before reading private ledgers', async () => {
        const unavailableDb = { db: { collection() { throw new Error('Unexpected private database access'); } } };
        await assert.rejects(growth.getScopedPersonalTrainingGrowth(unavailableDb, {
            workspaceId: 'tang', uid: 10, domainIds: ['foreign'], authorizedDomainIds: ['python'],
        }, now), /exceed the authorized scope/);
        for (const uid of [0, -1]) {
            await assert.rejects(growth.getScopedPersonalTrainingGrowth(unavailableDb, {
                workspaceId: 'tang', uid, domainIds: ['python'], authorizedDomainIds: ['python'],
            }, now), /Invalid personal training growth scope/);
        }
    });
    it('keeps the personal wrapper available to the root user without reading another learners activity', async () => {
        await database.collection('training.time.daily').insertMany([
            row('2026-11-17', '11:00:00', '12:00:00', { uid: 1 }),
            row('2026-11-17', '09:00:00', '10:00:00'),
        ]);
        const result = await get(1);
        assert.equal(result.thisWeekSeconds, 3600); assert.equal(result.averageWeekSeconds, 720);
        for (const { query } of queries) assert.equal(query.uid, 1);
    });
});
