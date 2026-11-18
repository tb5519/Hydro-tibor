const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const moment = require('moment-timezone');
const { JSDOM } = require('jsdom');
const { render } = require('./fixtures/training_dashboard');
const root = path.resolve(__dirname, '..');
class PermissionError extends Error {}
class ValidationError extends Error {}
class DashboardDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow; }
}
const load = (relative, dependencies = {}) => {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, relative), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module, exports: module.exports, URLSearchParams, Date: DashboardDate, require: (id) => dependencies[id] ?? require(id) });
    return module.exports;
};
const PERM = { PERM_EDIT_DOMAIN: 2n, PERM_VIEW_PROBLEM_HIDDEN: 4n };
const PRIV = { PRIV_USER_PROFILE: 2, PRIV_EDIT_SYSTEM: 1, PRIV_JUDGE: 4 };
const STATUS = { STATUS_ACCEPTED: 1 };
const fixedNow = Date.parse('2026-10-25T18:00:00+08:00');
const priorNow = moment.now;
let mongod; let client; let db; let daily; let records; let domains; let accounts; let problems; let classes;
let model; let personalGrowth; let dbContext;
let startedAt = new Date('2026-10-05T00:00:00+08:00');
const classrooms = [
    { _id: 'python', name: 'Python 训练', owner: 10 },
    { _id: 'cpp', name: 'C++ 训练', owner: 10 },
    { _id: 'scratch', name: 'Scratch 创作', domainType: 'scratch', owner: 10 },
];
function account(id, domainId = 'python') {
    return { _id: id,
        hasPriv: (p) => p === PRIV.PRIV_USER_PROFILE || (id === 10 && p === PRIV.PRIV_EDIT_SYSTEM),
        hasPerm: (p) => id === 10 || (p === PERM.PERM_EDIT_DOMAIN && ((id === 11 && domainId === 'python')
            || (id === 12 && ['python', 'scratch'].includes(domainId)) || (id === 13 && domainId === 'scratch'))),
    };
}
function handler(query = {}, id = 10) {
    return { user: account(id), session: {}, domain: { _id: 'python', workspaceId: 'school' }, ctx: dbContext,
        request: { query }, url: (name, params = {}) => `/${name}${params.domainId ? `/${params.domainId}/${params.pid}` : ''}` };
}
let oidSequence = 1;
function oid(day = '2026-10-25') {
    const prefix = Math.floor(Date.parse(`${day}T12:00:00+08:00`) / 1000).toString(16).padStart(8, '0');
    return new ObjectId(prefix + (oidSequence++).toString(16).padStart(16, '0'));
}
function timer(uid, domainId, day, seconds, source = { kind: 'problem', pid: 1 }) {
    return { _id: JSON.stringify([uid, domainId, day]), uid, domainId, day, seconds,
        sources: [{ key: `${source.kind}:${source.pid}`, ...source, seconds }],
        updatedAt: new Date(`${day}T12:00:00+08:00`), startedAt: new Date(`${day}T11:00:00+08:00`), version: 1 };
}
function submission(uid, domainId, pid, status = 1, contest = null, day = '2026-10-25') {
    return { _id: oid(day), uid, domainId, pid, status, contest };
}
before(async () => {
    moment.now = () => fixedNow;
    mongod = await MongoMemoryServer.create({ instance: { args: ['--nounixsocket'] } });
    client = await MongoClient.connect(mongod.getUri());
    db = client.db('training_dashboard');
    daily = db.collection('daily'); records = db.collection('records'); domains = db.collection('domain.user');
    accounts = db.collection('user'); problems = db.collection('problem'); classes = db.collection('classes');
    const helper = load('packages/hydrooj/src/lib/training_dashboard.ts');
    const clock = load('packages/hydrooj/src/lib/training_time.ts');
    const learning = load('packages/hydrooj/src/lib/learning_time.ts', { './training_time': clock });
    dbContext = { db: { collection(name) {
        if (name === 'training.time.meta') return { findOne: async () => startedAt ? { startedAt } : null };
        if (name === 'training.time.daily') return daily;
        if (name === 'training.class') return classes;
        throw new Error('Unexpected growth collection ' + name);
    } } };
    personalGrowth = load('packages/hydrooj/src/lib/personal_training_growth.ts', {
        './calendar_week': load('packages/hydrooj/src/lib/calendar_week.ts'),
        './domain_type': load('packages/hydrooj/src/lib/domain_type.ts'),
        './learning_time': learning, './training_dashboard': helper,
        '../model/workspace': {
            LEGACY_WORKSPACE_ID: 'legacy', resolveDomainWorkspaceId: (domain) => domain.workspaceId,
            getDomains: async () => classrooms,
        },
    });
    const problemAccess = {
        get: (domainId, pid) => problems.findOne({ domainId, docId: pid }),
        async getList(domainId, pids) {
            const found = await problems.find({ domainId, docId: { $in: Array.from(pids) } }).toArray();
            return Object.fromEntries(found.map((row) => [row.docId, row]));
        },
        canViewBy: (pdoc, viewer) => !pdoc.hidden || viewer.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN),
    };
    const userAccess = { getById: async (domainId, uid) => account(uid, domainId), getMulti: (query) => accounts.find(query) };
    const problemDetails = load('packages/hydrooj/src/lib/training_problem_details.ts', {
        './training_dashboard': helper, '../model/problem': problemAccess, '../model/user': userAccess,
    });
    model = load('packages/hydrooj/src/model/training_dashboard.ts', {
        '../error': { PermissionError, ValidationError }, '../lib/domain_type': { isScratchDomain: (d) => d.domainType === 'scratch' },
        '../lib/training_dashboard': helper, './builtin': { PERM, PRIV, STATUS },
        '../lib/learning_time': learning, './class_time': { classes },
        '../lib/personal_training_growth': personalGrowth,
        '../utils': { Time: { getObjectID: (time) => ObjectId.createFromTime(Math.floor(+time / 1000)) } },
        './domain': { collUser: domains },
        '../lib/training_problem_details': problemDetails,
        './problem': problemAccess,
        './record': { coll: records, RECORD_PRETEST: 'pretest', RECORD_GENERATE: 'generate' },
        './training_time': { daily, getTrackingStartedAt: async () => startedAt },
        './user': userAccess,
        './workspace': {
            LEGACY_WORKSPACE_ID: 'legacy', resolveDomainWorkspaceId: (domain) => domain.workspaceId,
            getDomains: async (workspaceId) => workspaceId === 'school' ? classrooms : [],
            getMembers: async () => [{ uid: 10 }, { uid: 11 }], getExcludedLegacyUids: async () => new Set([199]),
        },
    });
});
beforeEach(async () => {
    await Promise.all([daily.deleteMany({}), records.deleteMany({}), domains.deleteMany({}), accounts.deleteMany({}), problems.deleteMany({}), classes.deleteMany({})]);
    startedAt = new Date('2026-10-05T00:00:00+08:00');
    await accounts.insertMany([
        { _id: 101, uname: 'alice', displayName: '小艾', priv: 2 },
        { _id: 102, uname: 'bob', displayName: '小柏', priv: 2 },
        { _id: 103, uname: 'quiet', displayName: '小宁', priv: 2 },
        { _id: 104, uname: 'blocked', priv: 2 }, { _id: 105, uname: 'inactive', priv: 0 },
        { _id: 10, uname: 'teacher', priv: 3 }, { _id: 11, uname: 'pyteacher', priv: 2 },
        { _id: 1, uname: 'root', priv: 3 }, { _id: 199, uname: 'excluded', priv: 2 },
    ]);
    await domains.insertMany([
        { uid: 101, domainId: 'python', join: true }, { uid: 101, domainId: 'cpp', join: true },
        { uid: 102, domainId: 'cpp', join: true }, { uid: 103, domainId: 'python', join: true },
        { uid: 104, domainId: 'python', join: true, blockedByStudentManagement: true },
        { uid: 105, domainId: 'python', join: true }, { uid: 10, domainId: 'python', join: true },
        { uid: 11, domainId: 'python', join: true }, { uid: 1, domainId: 'python', join: true },
    ]);
    await daily.insertMany([
        timer(101, 'python', '2026-10-05', 3600), timer(101, 'cpp', '2026-10-12', 7200),
        timer(101, 'python', '2026-10-19', 600), timer(101, 'cpp', '2026-10-21', 1200),
        timer(101, 'python', '2026-10-25', 900), timer(102, 'cpp', '2026-10-25', 1800, { kind: 'ide', pid: 0 }),
        timer(104, 'python', '2026-10-25', 9999), timer(105, 'python', '2026-10-25', 9999),
        timer(10, 'python', '2026-10-25', 9999), timer(1, 'python', '2026-10-25', 9999),
        timer(101, 'foreign', '2026-10-25', 9999), timer(101, 'scratch', '2026-10-25', 9999),
    ]);
    await records.insertMany([
        submission(101, 'python', 1), submission(101, 'python', 1), submission(101, 'python', 1, 2),
        submission(101, 'cpp', 1), submission(102, 'cpp', 5, 2), submission(102, 'cpp', 5, 2), submission(102, 'cpp', 5, 2),
        submission(101, 'python', 2, 1, 'pretest'), submission(101, 'python', 3, 1, 'generate'),
        submission(101, 'python', -1), submission(101, 'foreign', 1), submission(101, 'scratch', 1),
        submission(104, 'python', 1), submission(10, 'python', 1),
    ]);
    await problems.insertMany([
        { domainId: 'python', docId: 1, pid: 'P1', title: 'Python 题目', hidden: false },
        { domainId: 'cpp', docId: 1, pid: 'P1', title: 'C++ 题目', hidden: false },
        { domainId: 'cpp', docId: 5, pid: 'P5', title: '循环练习', hidden: false },
    ]);
});
after(async () => { moment.now = priorNow; await client?.close(); await mongod?.stop(); });

describe('teacher dashboard real data aggregation and authorization', () => {
    it('carries a late quick-exit through the real ledger, a week boundary and both reporting surfaces', async () => {
        const uid = 103;
        const domainId = 'python';
        const midnight = Date.parse('2026-10-19T00:00:00+08:00');
        const at = (seconds) => new Date(midnight + seconds * 1000);
        const ledger = load('packages/hydrooj/src/model/training_time.ts', {
            '../lib/training_time': load('packages/hydrooj/src/lib/training_time.ts'),
            '../service/db': { collection: (name) => name === 'training.time.daily' ? daily : db.collection(name) },
            '../error': { ValidationError }, '../logger': { Logger: class { warn() {} } },
        });
        const problem = await ledger.issueSourceGrant(uid, domainId, { kind: 'problem', pid: 1 }, at(-10));
        const ide = await ledger.issueSourceGrant(uid, domainId, { kind: 'ide', pid: 0 }, at(-10));
        const request = 'quick-problem-before-midnight';
        await ledger.startSession(uid, domainId, problem, request, at(-9));
        const next = await ledger.startSession(uid, domainId, ide, 'next-ide-at-midnight', at(-4));
        // The browser has already moved on when the first exit arrives. Its
        // original stop preceded midnight, and its duplicate cannot add time.
        for (let copy = 0; copy < 2; copy++) {
            await ledger.closePendingStart(uid, domainId, problem, request, false, at(1), 5000);
        }
        await ledger.heartbeat(uid, domainId, next.sessionId, 1, false, false, at(10));
        const byDay = await daily.find({ uid }).sort({ day: 1 }).toArray();
        assert.deepEqual(byDay.map((day) => [day.day, day.seconds]), [['2026-10-18', 9], ['2026-10-19', 10]]);

        await classes.insertMany(['lesson', 'import'].map((source) => ({
            uid, domainId, workspaceId: 'school', externalId: source, source,
            startAt: at(-2), endAt: at(5),
        })));
        const home = await personalGrowth.getPersonalTrainingGrowth(dbContext, { _id: domainId, workspaceId: 'school' }, uid, new Date(fixedNow));
        const report = await model.loadTrainingDashboard(handler({ domains: domainId, student: String(uid), period: 'thisWeek' }));
        assert.equal(home.thisWeekSeconds, 5);
        assert.equal(report.detail.periods.week.trainingSeconds, 5);
        assert.equal(report.detail.timeBreakdown.trainingSeconds, 5);
        assert.equal(report.detail.timeBreakdown.classSeconds, 5);
        assert.equal(report.detail.trends.weeks.at(-1).value, 10);
        // 19 recorded seconds - 7 taught seconds, across three calendar weeks.
        assert.equal(home.averageWeekSeconds, 4);
        assert.equal(report.detail.averageTraining.averageWeekSeconds, 4);
        assert.equal(report.detail.lifetimeEffort.trainingSeconds, 12);
        assert.equal(report.detail.lifetimeEffort.classSeconds, 7);
        assert.equal(report.detail.lifetimeEffort.totalSeconds, 19);
        assert.equal(home.thisWeekHasEstimate, false);
        assert.equal(report.detail.timeBreakdown.hasEstimate, false);
    });
    it('renders the first authorized learner and follows the displayed roster link to the second without combining their statistics', async (t) => {
        const first = await model.loadTrainingDashboard(handler());
        assert.deepEqual(Array.from(first.selectedDomainIds), ['python', 'cpp']);
        assert.deepEqual(Array.from(first.rows, (row) => row.uid), [101, 102, 103]);
        assert.deepEqual(Array.from(first.rows, (row) => row.selected), [true, false, false]);
        assert.equal(first.detail.uid, 101);
        assert.equal(first.detail.timeBreakdown.seconds, 2700);
        assert.equal(first.detail.periods.week.trainingSeconds, 2700);
        const firstPage = new JSDOM(render(first), { url: 'https://school.test' });
        t.after(() => firstPage.window.close());
        const doc = firstPage.window.document;
        assert.match(doc.querySelector('[data-training-student-link][aria-current="page"]').textContent, /小艾/);
        assert.equal(doc.querySelector('[data-time="independent"]').textContent, '45 分钟');
        assert.deepEqual(Array.from(doc.querySelectorAll('[data-training-problem] [data-problem-time]'), (cell) => cell.textContent),
            ['25 分钟', '20 分钟']);
        assert.equal(doc.querySelectorAll('[data-effort-series="weeks"] [data-effort-point]').length, first.detail.trends.weeks.length);
        assert.equal(doc.querySelectorAll('[data-effort-series="months"] [data-effort-point]').length, first.detail.trends.months.length);
        const next = new URL(doc.querySelectorAll('[data-training-student-link]')[1].href);
        const second = await model.loadTrainingDashboard(handler(Object.fromEntries(next.searchParams)));
        assert.equal(second.detail.uid, 102);
        assert.equal(second.detail.timeBreakdown.seconds, 1800);
        assert.deepEqual(Array.from(second.rows, (row) => row.selected), [false, true, false]);
        assert(second.detail.problems.every((problem) => problem.title !== 'Python 题目'));
        const secondPage = new JSDOM(render(second), { url: next.href });
        t.after(() => secondPage.window.close());
        const secondDoc = secondPage.window.document;
        assert.match(secondDoc.querySelector('[data-training-student-link][aria-current="page"]').textContent, /小柏/);
        assert.equal(secondDoc.querySelector('[data-time="independent"]').textContent, '30 分钟');
        assert.match(secondDoc.querySelector('[data-training-problem]').textContent, /循环练习/);
    });
    it('rebuilds the eligible roster and selected student detail inside the authorized classrooms', async () => {
        const result = await model.loadTrainingDashboard(handler({ domains: 'python' }));
        assert.deepEqual(Array.from(result.rows, (row) => row.uid), [101, 103]);
        assert.equal(result.detail.uid, 101);
        assert.equal(result.detail.timeBreakdown.seconds, 1500);
        assert.equal(result.detail.problems.length, 1);
        assert.equal(result.detail.problems[0].title, 'Python 题目');
        assert.equal(result.detail.problems[0].submits, 3);
        const teacher = await model.loadTrainingDashboard(handler({ domains: 'all' }, 11));
        assert.deepEqual(Array.from(teacher.selectedDomainIds), ['python']);
        assert.deepEqual(Array.from(teacher.rows, (row) => row.uid), [101, 103]);
        assert.equal(teacher.detail.periods.week.seconds, 1500);
    });
    it('keeps submissions separate from AC and separates matching problem IDs in different banks', async () => {
        const result = await model.loadTrainingDashboard(handler({ student: '101' }));
        assert.equal(result.detail.problems.length, 2);
        assert.equal(result.detail.problems.filter((entry) => entry.accepted).length, 2);
        assert.deepEqual(Array.from(result.detail.problems, (entry) => [entry.domainId, entry.submits]), [['python', 3], ['cpp', 1]]);
    });
    it('student and teacher impersonation cannot read dashboard statistics', async () => {
        await assert.rejects(() => model.loadTrainingDashboard(handler({}, 101)), PermissionError);
        const h = handler(); h.session.sudoUid = 1;
        await assert.rejects(() => model.loadTrainingDashboard(h), PermissionError);
    });
    it('forged classroom selections never expand permission scope', async () => {
        for (const query of [{ domains: 'cpp' }, { domains: ['all', 'cpp'] }, { domain: 'cpp' }, { domains: 'python,foreign' }]) {
            await assert.rejects(() => model.loadTrainingDashboard(handler(query, 11)), ValidationError);
        }
        await assert.rejects(() => model.loadTrainingDashboard(handler({ domains: 'foreign' })), ValidationError);
        await assert.rejects(() => model.loadTrainingDashboard(handler({ domains: 'scratch' })), ValidationError);
    });
    it('forged UID cannot inspect nonmember, blocked, teacher or another selected classroom student', async () => {
        for (const target of ['999', '104', '105', '10', '11']) {
            await assert.rejects(() => model.loadTrainingDashboard(handler({ student: target })), PermissionError);
        }
        await assert.rejects(() => model.loadTrainingDashboard(handler({ student: '102', domains: 'python' })), PermissionError);
        for (const target of ['1', '0', '-1', '2.5', 'abc']) {
            await assert.rejects(() => model.loadTrainingDashboard(handler({ student: target })), ValidationError);
        }
    });
    it('caps custom queries at 90 calendar days and rejects future dates', async () => {
        await assert.rejects(() => model.loadTrainingDashboard(handler({ period: 'custom', start: '2026-07-01', end: '2026-10-25' })), ValidationError);
        await assert.rejects(() => model.loadTrainingDashboard(handler({ period: 'custom', start: '2026-10-25', end: '2026-10-26' })), ValidationError);
        const result = await model.loadTrainingDashboard(handler({ period: 'custom', start: '2026-07-28', end: '2026-10-25' }));
        assert.equal(result.detail.timeBreakdown.seconds, 13500);
    });
    it('reuses the selected learner when switching the problem ranking between recent seven days and this natural week', async () => {
        const now = new Date('2026-10-28T08:00:00+08:00');
        await daily.insertOne(timer(101, 'python', '2026-10-27', 120));
        const recent = await model.loadTrainingDashboard(handler({ student: '101', period: '7d' }), now);
        assert.equal(recent.detail.periods.recent.trainingSeconds, 1020);
        assert.equal(recent.detail.periods.week.trainingSeconds, 120);
        assert.equal(recent.detail.problems.find((row) => row.domainId === 'python').estimatedSeconds, 1020);
        const weekLink = recent.periodLinks.find((link) => link.id === 'thisWeek');
        const query = Object.fromEntries(new URL(weekLink.url, 'https://school.test').searchParams);
        const week = await model.loadTrainingDashboard(handler(query), now);
        assert.equal(week.detail.uid, 101);
        assert.equal(week.detail.problems.length, 1);
        assert.equal(week.detail.problems[0].estimatedSeconds, 120);
        assert.equal(week.detail.problems[0].submits, 0);
        assert.equal(week.detail.trends.weeks.at(-1).trainingSeconds, 120);
        assert.equal(week.detail.trends.months.at(-1).trainingSeconds, 13620);
        assert.equal(week.detail.averageTraining.averageWeeks, 4);
        assert.equal(week.detail.averageTraining.averageWeekSeconds, 3405);
    });
    it('one authorized learner history supplies all metrics even for a noncontiguous old problem period', async (t) => {
        await daily.insertMany([
            timer(101, 'python', '2024-01-10', 60),
            timer(101, 'python', '2025-07-01', 999999),
            timer(102, 'cpp', '2025-07-01', 888888),
            timer(101, 'foreign', '2025-07-01', 777777),
        ]);
        const originalFind = daily.find;
        const reads = [];
        daily.find = function (...args) {
            const cursor = originalFind.apply(this, args);
            const originalToArray = cursor.toArray;
            cursor.toArray = async function () {
                const documents = await originalToArray.call(this);
                reads.push({ query: args[0], documents });
                return documents;
            };
            return cursor;
        };
        t.after(() => { daily.find = originalFind; });
        const result = await model.loadTrainingDashboard(handler({
            student: '101', period: 'custom', start: '2024-01-01', end: '2024-03-30',
        }));
        assert.equal(result.detail.timeBreakdown.seconds, 60);
        assert.equal(result.detail.periods.recent.seconds, 2700);
        assert.equal(result.detail.trends.months.at(-1).value, 13500);
        const cumulative = reads.find((read) => read.query.uid === 101 && read.query.day?.$lte && !read.query.day.$gte);
        assert.ok(cumulative, 'the selected learner history supplies the cumulative average');
        assert.deepEqual(Array.from(cumulative.query.domainId.$in), ['cpp', 'python']);
        assert(cumulative.documents.some((item) => item.day === '2025-07-01'));
        assert(cumulative.documents.every((item) => item.uid === 101 && ['python', 'cpp'].includes(item.domainId)));
        assert(cumulative.documents.some((item) => item.day === '2024-01-10'));
        assert(cumulative.documents.some((item) => item.day === '2026-10-25'));
        assert.equal(reads.filter((read) => read.query.uid === 101 || read.query.uid?.$in?.includes(101)).length, 1);
        assert(reads.every((read) => read.query.uid === 101), 'no activity reads for roster peers');
    });
    it('includes early imported teaching in the monthly series and quiet weeks without shifting the independent-training baseline', async () => {
        await classes.insertMany([
            { workspaceId: 'school', domainId: 'python', uid: 101, externalId: 'older-than-telemetry',
                startAt: new Date('2026-08-16T23:45:00+08:00'), endAt: new Date('2026-08-17T00:15:00+08:00') },
            { workspaceId: 'other-school', domainId: 'python', uid: 101, externalId: 'foreign-early',
                startAt: new Date('2026-07-01T09:00:00+08:00'), endAt: new Date('2026-07-01T10:00:00+08:00') },
        ]);
        const result = await model.loadTrainingDashboard(handler({ domains: 'python', student: '101' }));
        assert.deepEqual(Array.from(result.detail.trends.months, (month) => [month.trainingSeconds, month.classSeconds]),
            [[0, 1800], [0, 0], [5100, 0]]);
        assert.equal(result.detail.lifetimeEffort.trainingSeconds, 5100);
        assert.equal(result.detail.lifetimeEffort.totalSeconds, 6900);
        assert.equal(result.detail.lifetimeEffort.weekCount, 3);
        assert.equal(result.detail.lifetimeEffort.averageWeeklyTrainingLabel, '28 分钟');
        assert.equal(result.detail.trends.months[0].partial, true);
        assert.equal(result.detail.trends.months[1].partial, false);
        assert.equal(result.detail.trends.weeks.length, 8);
        assert(result.detail.trends.weeks.some((week) => week.value === 0 && !week.partial));
        assert.equal(result.detail.averageTraining.averageWeeks, 3);
    });
    it('does not show a made-up trend baseline for an idle learner before any known collection start', async () => {
        startedAt = null;
        const result = await model.loadTrainingDashboard(handler({ student: '103' }));
        assert.equal(result.detail.periods.week.seconds, 0);
        assert.equal(result.detail.periods.recent.seconds, 0);
        assert.equal(result.detail.trends.weeks.length, 0);
        assert.equal(result.detail.trends.months.length, 0);
        assert.equal(result.detail.averageTraining.averageWeekSeconds, null);
    });
    it('a heartbeat committed during reporting appears consistently across both period cards, chart, detail and lifetime average', async (t) => {
        await daily.deleteMany({});
        startedAt = new Date('2026-10-25T00:00:00+08:00');
        const day = '2026-10-25';
        const source = timer(101, 'python', day, 30);
        const start = +new Date(day + 'T11:00:00+08:00');
        source.intervals = [{ kind: 'problem', pid: 1, start, end: start + 30000 }];
        await daily.insertOne(source);
        const find = daily.find;
        let committed = false;
        daily.find = function (query, ...args) {
            const cursor = find.call(this, query, ...args);
            if (query.uid === 101 || query.uid?.$in?.includes(101)) {
                const toArray = cursor.toArray.bind(cursor);
                cursor.toArray = async () => {
                    const result = await toArray();
                    if (!committed) {
                        committed = true;
                        await daily.updateOne({ _id: source._id }, { $set: {
                            seconds: 60, 'intervals.0.end': start + 60000, 'sources.0.seconds': 60,
                        } });
                    }
                    return result;
                };
            }
            return cursor;
        };
        t.after(() => { daily.find = find; });
        const read = () => model.loadTrainingDashboard(handler({ student: '101' }));
        for (const expected of [30, 60]) {
            const page = await read();
            assert.equal(committed, true);
            assert.equal(page.detail.periods.recent.trainingSeconds, expected);
            assert.equal(page.detail.periods.week.trainingSeconds, expected);
            assert.equal(page.detail.timeBreakdown.trainingSeconds, expected);
            assert.equal(page.detail.trends.weeks.at(-1).trainingSeconds, expected);
            assert.equal(page.detail.averageTraining.averageWeekSeconds, expected);
        }
    });
    it('detail selected-domain metrics never reintroduce unselected classroom totals', async () => {
        const result = await model.loadTrainingDashboard(handler({ student: '101', domains: 'python' }));
        assert.equal(result.detail.periods.recent.trainingSeconds, 1500);
        assert.equal(result.detail.trends.months.at(-1).trainingSeconds, 5100);
        assert.equal(result.detail.averageTraining.averageWeekSeconds, 1700);
        assert(result.detail.problems.every((entry) => entry.domainId === 'python'));
    });
    it('includes the first partial natural week immediately instead of waiting for a completed week', async () => {
        startedAt = new Date('2026-10-24T18:00:00+08:00');
        await daily.deleteMany({ uid: 101, day: { $lt: '2026-10-24' } });
        const result = await model.loadTrainingDashboard(handler({ student: '101' }));
        assert.equal(result.detail.averageTraining.averageWeekSeconds, 900);
        assert.equal(result.detail.averageTraining.averageWeeks, 1);
        assert.equal(result.detail.periods.week.trainingSeconds, 900);
    });
    it('homepage and dashboard averages are exactly equal for the same authorized scope and observation time', async () => {
        await classes.insertMany([
            { workspaceId: 'school', domainId: 'cpp', uid: 101, externalId: 'cross-domain-average-mask',
                startAt: new Date('2026-10-25T11:30:00+08:00'), endAt: new Date('2026-10-25T11:45:00+08:00') },
            { workspaceId: 'other-school', domainId: 'python', uid: 101, externalId: 'foreign-average-mask',
                startAt: new Date('2026-10-25T11:00:00+08:00'), endAt: new Date('2026-10-25T12:00:00+08:00') },
            { workspaceId: 'school', domainId: 'python', uid: 103, externalId: 'other-student-average-mask',
                startAt: new Date('2026-10-25T11:00:00+08:00'), endAt: new Date('2026-10-25T12:00:00+08:00') },
        ]);
        for (const now of [new Date(fixedNow), new Date('2026-11-02T10:00:00+08:00')]) {
            // The modern homepage is scoped to Python, with the same two
            // authorized OJ classrooms available to this dashboard teacher.
            const homepage = await personalGrowth.getPersonalTrainingGrowth(dbContext, { _id: 'python', workspaceId: 'school' }, 101, now);
            const result = await model.loadTrainingDashboard(handler({ domains: 'python', student: '101' }), now);
            const average = result.detail.averageTraining;
            for (const key of ['averageWeekSeconds', 'averageWeekHasEstimate', 'averageWeeks', 'averageStart', 'averageEnd']) {
                assert.equal(average[key], homepage[key], key);
            }
            assert.equal(result.detail.periods.week.trainingSeconds, homepage.thisWeekSeconds);
            assert.equal(average.averageWeekHasEstimate, true, 'both views preserve the marked historical point estimate');
            assert.equal(average.averageWeeks, now.getTime() === fixedNow ? 3 : 5, 'current and zero-training weeks stay in the denominator');
        }
    });
    it('a learner with no training uses zero for every collected week instead of omitting quiet weeks', async () => {
        const result = await model.loadTrainingDashboard(handler({ student: '103' }));
        assert.equal(result.detail.periods.week.trainingLabel, '0 分钟');
        assert(result.detail.trends.weeks.every((point) => point.value === 0));
        assert.equal(result.detail.averageTraining.averageWeekSeconds, 0);
        assert.equal(result.detail.averageTraining.averageWeeks, 3);
    });
    it('credits the entry classroom and separates shared contest problems with the same local pid', async () => {
        const start = Date.parse('2026-10-25T10:00:00+08:00');
        const local = { kind: 'problem', pid: 1 }, shared = { ...local, problemDomainId: 'cpp' };
        const sharedTime = timer(103, 'python', '2026-10-25', 90);
        sharedTime.sources = [{ ...local, seconds: 30 }, { ...shared, seconds: 60 }];
        sharedTime.intervals = [{ ...local, start, end: start + 30000 }, { ...shared, start: start + 30000, end: start + 90000 }];
        await daily.insertOne(sharedTime);
        await records.insertMany([
            { ...submission(103, 'cpp', 1), practiceEntryDomain: 'python' },
            { ...submission(103, 'python', 1), practiceEntryDomain: 'cpp' },
            submission(103, 'cpp', 1), submission(103, 'python', 1, 2),
        ]);
        const query = { domains: 'python', student: 103 };
        const admin = await model.loadTrainingDashboard(handler(query));
        assert.equal(admin.detail.problems.length, 2);
        const abroad = admin.detail.problems.find((item) => item.title === 'C++ 题目');
        assert.equal(abroad.seconds, 60);
        assert.equal(abroad.domainId, 'cpp');
        assert.equal(abroad.submits, 1);
        assert.equal(abroad.accepted, true);
        const localQuestion = admin.detail.problems.find((item) => item.title === 'Python 题目');
        assert.equal(localQuestion.submits, 1);
        assert.equal(localQuestion.accepted, false);
        assert.equal(admin.detail.timeBreakdown.seconds, 90);
        assert.match(abroad.url, /cpp/);
        assert.equal(admin.detail.problems.find((item) => item.title === 'Python 题目').seconds, 30);
        const teacher = await model.loadTrainingDashboard(handler(query, 11));
        assert.equal(teacher.detail.problems.length, 1);
        assert.equal(teacher.detail.problems[0].title, 'Python 题目');
        assert.equal(teacher.detail.otherPracticeSeconds, 60);
        assert(!JSON.stringify(teacher.detail.problems).includes('cpp'));
    });
    it('hides restricted problem titles and links for limited domain teachers', async () => {
        await problems.updateOne({ domainId: 'python', docId: 1 }, { $set: { hidden: true, title: '未公开竞赛题目' } });
        const restricted = await model.loadTrainingDashboard(handler({ student: '101' }, 11));
        assert.equal(restricted.detail.problems[0].title, '暂不可查看的题目');
        assert.equal(restricted.detail.problems[0].url, '');
        assert(!JSON.stringify(restricted).includes('未公开竞赛题目'));
        const admin = await model.loadTrainingDashboard(handler({ student: '101', domains: 'python' }));
        assert.equal(admin.detail.problems[0].title, '未公开竞赛题目');
    });
    it('attributes daily practice to the actual question and keeps standalone IDE time outside ranked questions', async () => {
        await daily.updateOne({ uid: 101, domainId: 'python', day: '2026-10-25' }, { $set: { seconds: 1500 }, $push: { sources: {
            key: 'daily:1', kind: 'daily', pid: 1, seconds: 600,
        } } });
        const first = await model.loadTrainingDashboard(handler({ student: '101', domains: 'python' }));
        assert.equal(first.detail.problems.length, 1);
        assert.equal(first.detail.problems[0].title, 'Python 题目');
        assert.equal(first.detail.problems[0].estimatedSeconds, 2100);
        assert.equal(first.detail.otherPracticeSeconds, 0);
        const second = await model.loadTrainingDashboard(handler({ student: '102' }));
        assert.equal(second.detail.otherPracticeSeconds, 1800);
        assert.equal(second.detail.periods.week.seconds, 1800);
        assert(!second.detail.problems.some((entry) => entry.title === '在线编程'));
    });
    it('reads only the selected UID across training, lessons and submissions, and skips activity completely on empty or denied selections', async (t) => {
        const queries = [];
        for (const [collection, name] of [[daily, 'training'], [classes, 'lessons'], [records, 'submissions']]) {
            for (const op of ['find', 'aggregate', 'countDocuments', 'distinct']) {
                const original = collection[op];
                collection[op] = function (...args) {
                    const filter = op === 'aggregate' ? args[0][0]?.$match : op === 'distinct' ? args[1] : args[0];
                    queries.push({ name, uid: filter?.uid });
                    return original.apply(this, args);
                };
                t.after(() => { collection[op] = original; });
            }
        }
        for (const [query, uid] of [[{}, 101], [{ student: '102' }, 102], [{ q: '小宁' }, 103]]) {
            queries.length = 0;
            const page = await model.loadTrainingDashboard(handler(query));
            assert.equal(page.detail.uid, uid);
            const names = new Set(queries.map((entry) => entry.name));
            assert.deepEqual([...names].sort(), ['lessons', 'submissions', 'training']);
            for (const call of queries) {
                assert.deepEqual(call.uid?.$in ? Array.from(call.uid.$in) : [call.uid], [uid],
                    'every ' + call.name + ' query must include only the selected authorized UID');
            }
        }
        queries.length = 0;
        const noMatches = await model.loadTrainingDashboard(handler({ q: 'unknown-person' }));
        assert.equal(noMatches.detail, null);
        assert.equal(noMatches.rows.length, 0);
        await assert.rejects(model.loadTrainingDashboard(handler({ student: '102', domains: 'python' })), PermissionError);
        assert.deepEqual(queries, []);
    });
    it('uses only visible classroom aliases for roster names and search', async () => {
        await domains.updateOne({ uid: 101, domainId: 'python' }, { $set: { displayName: 'Python 班小艾' } });
        await domains.updateOne({ uid: 101, domainId: 'cpp' }, { $set: { displayName: 'C++ 班小艾' } });
        const all = await model.loadTrainingDashboard(handler({ q: 'C++ 班小艾' }));
        assert.deepEqual(Array.from(all.rows, (row) => row.uid), [101]);
        assert.equal(all.detail.name, 'Python 班小艾');
        const cpp = await model.loadTrainingDashboard(handler({ q: 'C++ 班小艾', domains: 'cpp' }));
        assert.equal(cpp.detail.name, 'C++ 班小艾');
        const limited = await model.loadTrainingDashboard(handler({ q: 'C++ 班小艾' }, 11));
        assert.equal(limited.rows.length, 0);
        assert.equal(limited.detail, null);
    });
    it('sorts duplicate names consistently and defaults to the first visible learner on the second page', async () => {
        const extra = Array.from({ length: 27 }, (_, i) => ({ _id: 200 + i, uname: 'new' + i, displayName: '同名学生', priv: 2 }));
        await accounts.insertMany(extra.slice().reverse());
        await domains.insertMany(extra.map((row) => ({ uid: row._id, domainId: 'python', join: true })));
        const pageOne = await model.loadTrainingDashboard(handler({ q: '同名学生' }));
        assert.deepEqual(Array.from(pageOne.rows, (row) => row.uid), extra.slice(0, 25).map((row) => row._id));
        const next = new URL(pageOne.pagination.nextUrl, 'https://school.test');
        const pageTwo = await model.loadTrainingDashboard(handler(Object.fromEntries(next.searchParams)));
        assert.deepEqual(Array.from(pageTwo.rows, (row) => row.uid), [225, 226]);
        assert.equal(pageTwo.detail.uid, 225);
        assert.deepEqual(Array.from(pageTwo.rows, (row) => row.selected), [true, false]);
    });
    it('merges imported classes into all dashboard views and removes only precise training overlap', async () => {
        const start = Date.parse('2026-10-25T10:00:00+08:00');
        await daily.updateOne({ uid: 101, domainId: 'python', day: '2026-10-25' }, { $set: {
            seconds: 5400, intervals: [{ start, end: start + 5400_000, kind: 'problem', pid: 1 }],
            sources: [{ key: 'problem:1', kind: 'problem', pid: 1, seconds: 5400 }],
        } });
        await classes.insertMany([
            { workspaceId: 'school', domainId: 'python', uid: 101, externalId: 'lesson-a', title: 'Python 课堂',
                startAt: new Date(start + 1800_000), endAt: new Date(start + 7200_000) },
            { workspaceId: 'school', domainId: 'python', uid: 101, externalId: 'lesson-overlap', title: '重复时间段',
                startAt: new Date(start + 3600_000), endAt: new Date(start + 5400_000) },
            { workspaceId: 'school', domainId: 'python', uid: 103, externalId: 'class-only', title: '入门课',
                startAt: new Date(start + 14400_000), endAt: new Date(start + 18000_000) },
            { workspaceId: 'other-school', domainId: 'python', uid: 101, externalId: 'foreign',
                startAt: new Date(start), endAt: new Date(start + 20000_000) },
            { workspaceId: 'school', domainId: 'python', uid: 104, externalId: 'blocked',
                startAt: new Date(start), endAt: new Date(start + 20000_000) },
        ]);
        const result = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }));
        const time = result.detail.timeBreakdown;
        assert.equal(time.seconds, 7200);
        assert.equal(time.trainingSeconds, 1800);
        assert.equal(time.classSeconds, 5400);
        assert.equal(time.overlapSeconds, 3600);
        assert.equal(time.legacySeconds, 0);
        const classOnly = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '103' }));
        assert.equal(classOnly.detail.timeBreakdown.classSeconds, 3600);
        assert.equal(classOnly.detail.timeBreakdown.trainingSeconds, 0);
        assert.equal(classOnly.detail.problems.length, 0);
        assert.equal(result.detail.problems[0].timeLabel, '1 小时 30 分钟');
        assert.equal(result.detail.problems[0].autonomousSeconds, 1800);
        assert.equal(result.detail.problems[0].classTrainingLabel, '1 小时');
    });
    it('masks Python practice with authorized C++ classes even when only Python is selected', async () => {
        const start = Date.parse('2026-10-25T10:00:00+08:00');
        await daily.updateOne({ uid: 101, domainId: 'python', day: '2026-10-25' }, { $set: {
            seconds: 1200, intervals: [{ start, end: start + 1200_000, kind: 'problem', pid: 1 }],
            sources: [{ key: 'problem:1', kind: 'problem', pid: 1, seconds: 1200 }],
        } });
        await classes.insertOne({ workspaceId: 'school', domainId: 'cpp', uid: 101, externalId: 'cpp-lesson', title: 'C++课',
            startAt: new Date(start), endAt: new Date(start + 3600_000) });
        const result = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }));
        assert.equal(result.detail.timeBreakdown.trainingSeconds, 0);
        assert.equal(result.detail.timeBreakdown.classSeconds, 0, 'The visible scope does not import another classroom’s class totals');
        assert.equal(result.detail.timeBreakdown.overlapSeconds, 1200);
        assert.equal(result.detail.lessons.length, 0);
        assert.equal(result.detail.problems[0].classTrainingLabel, '20 分钟');
        assert.equal(result.detail.problems[0].timeLabel, '20 分钟');
        assert.equal(result.detail.problems[0].autonomousSeconds, 0);
        const restricted = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }, 11));
        assert.equal(restricted.detail.timeBreakdown.trainingSeconds, 1200, 'An unauthorized classroom must not become a hidden data source');
        assert.equal(restricted.detail.timeBreakdown.overlapSeconds, 0);
        assert.equal(result.detail.averageTraining.averageWeekSeconds, 1400);
        assert.equal(restricted.detail.averageTraining.averageWeekSeconds, 1800, 'the lifetime average also excludes unauthorized class masks');
    });
    it('masks a managed native Scratch lesson without exposing Scratch practice or granting its dashboard', async () => {
        const start = Date.parse('2026-10-25T10:00:00+08:00');
        await daily.deleteMany({ uid: 101 });
        await daily.insertMany([
            { ...timer(101, 'python', '2026-10-25', 2400),
                intervals: [{ start, end: start + 2400_000, kind: 'problem', pid: 1 }] },
            timer(101, 'scratch', '2026-10-25', 3600),
        ]);
        await classes.insertOne({ workspaceId: 'school', uid: 101, domainId: 'scratch', source: 'lesson',
            externalId: 'native-scratch', title: 'Scratch 站内课', startAt: new Date(start), endAt: new Date(start + 900_000) });
        const personal = await personalGrowth.getPersonalTrainingGrowth(dbContext, { _id: 'python', workspaceId: 'school' }, 101, new Date(fixedNow));
        assert.equal(personal.thisWeekSeconds, 1500);
        for (const teacher of [10, 12]) {
            const result = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }, teacher));
            assert.equal(result.detail.timeBreakdown.trainingSeconds, 1500);
            assert.equal(result.detail.timeBreakdown.overlapSeconds, 900);
            assert.equal(result.detail.timeBreakdown.classSeconds, 0);
            assert.equal(result.detail.averageTraining.averageWeekSeconds, personal.averageWeekSeconds);
            assert.equal(result.detail.lessons.length, 0);
            assert(!result.domains.some((item) => item.id === 'scratch'));
            await assert.rejects(model.loadTrainingDashboard(handler({ domains: 'scratch' }, teacher)), ValidationError);
        }
        const restricted = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }, 11));
        assert.equal(restricted.detail.timeBreakdown.trainingSeconds, 2400);
        assert.equal(restricted.detail.timeBreakdown.overlapSeconds, 0);
        await assert.rejects(model.loadTrainingDashboard(handler({}, 13)), PermissionError);
    });
    it('uses the observation time for today, recent, month, source and class totals', async () => {
        const start = fixedNow - 15 * 60_000;
        const end = fixedNow + 45 * 60_000;
        await daily.deleteMany({ uid: 101 });
        await daily.insertOne({ ...timer(101, 'python', '2026-10-25', 3600),
            intervals: [{ start, end, kind: 'problem', pid: 1 }] });
        await classes.insertOne({ workspaceId: 'school', domainId: 'python', uid: 101, externalId: 'ongoing', source: 'lesson',
            startAt: new Date(fixedNow - 5 * 60_000), endAt: new Date(end) });
        const result = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }));
        assert.equal(result.detail.timeBreakdown.trainingSeconds, 600);
        assert.equal(result.detail.timeBreakdown.classSeconds, 300);
        assert.equal(result.detail.timeBreakdown.seconds, 900);
        assert.equal(result.detail.periods.recent.seconds, 900);
        assert.equal(result.detail.problems[0].seconds, 600);
        assert.equal(result.detail.lessons[0].timeLabel, '5 分钟');
        assert.equal(result.detail.lessons[0].sourceLabel, '站内课堂');
        assert.equal(result.detail.periods.week.seconds, 900);
        assert.equal(result.detail.trends.months.at(-1).value, 900);
    });
    it('includes submissions up to the observation time and excludes later submissions on the same Shanghai date', async () => {
        const reportAt = new Date('2026-10-25T14:00:00+08:00');
        const later = submission(101, 'python', 1);
        later._id = ObjectId.createFromTime(+new Date('2026-10-25T17:00:00+08:00') / 1000);
        await records.insertOne(later);
        const result = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: 101 }), reportAt);
        assert.equal(result.detail.problems.length, 1);
        assert.equal(result.detail.problems[0].submits, 3);
    });
    it('corrects classroom-bound legacy counters and displays one marked estimate for a historical lesson crossing', async () => {
        await daily.deleteMany({ uid: 101, day: '2026-10-25' });
        await daily.insertMany([
            { ...timer(101, 'cpp', '2026-10-25', 2780.026),
                startedAt: new Date('2026-10-25T19:18:28+08:00'), updatedAt: new Date('2026-10-25T21:01:52+08:00') },
            { ...timer(101, 'python', '2026-10-25', 947.863),
                startedAt: new Date('2026-10-25T21:02:14.019+08:00'), updatedAt: new Date('2026-10-25T21:22:26.173+08:00') },
        ]);
        await classes.insertOne({ workspaceId: 'school', domainId: 'cpp', uid: 101, externalId: 'evening-lesson', title: '晚间课',
            startAt: new Date('2026-10-25T19:15:00+08:00'), endAt: new Date('2026-10-25T21:15:00+08:00') });
        const afterLesson = new Date('2026-10-25T22:00:00+08:00');
        const result = await model.loadTrainingDashboard(handler({ period: 'today', student: '101' }), afterLesson);
        const time = result.detail.timeBreakdown;
        assert.equal(time.classSeconds, 7200);
        assert.ok(Math.abs(time.trainingSeconds - 181.882) < 0.001);
        assert.ok(Math.abs(time.trainingUpperSeconds - 446.173) < 0.001);
        assert.ok(Math.abs(time.trainingEstimatedSeconds - 348.8920370982614) < 0.001);
        assert.ok(Math.abs(time.estimatedSeconds - 7548.8920370982614) < 0.001);
        assert.equal(time.hasEstimate, true);
        assert.equal(time.trainingLabel, '约 6 分钟');
        assert.equal(time.timeLabel, '约 2 小时 6 分钟');
        assert.equal(result.detail.periods.week.hasEstimate, true);
        assert.equal(result.detail.trends.weeks.at(-1).value, result.detail.periods.week.seconds);
        const cpp = result.detail.problems.find((item) => item.domainId === 'cpp');
        assert.equal(cpp.autonomousSeconds, 0);
        assert.equal(cpp.timeLabel, '46 分钟');
        assert.equal(cpp.classTrainingLabel, '46 分钟');
        const pythonOnly = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }), afterLesson);
        assert.equal(pythonOnly.detail.timeBreakdown.trainingLabel, '约 6 分钟');
        assert.equal(pythonOnly.detail.timeBreakdown.classSeconds, 0);
        assert.equal(pythonOnly.detail.lessons.length, 0);
        assert.ok(Math.abs(result.detail.problems.reduce((total, item) => total + (item.autonomousSeconds || 0), 0)
            - time.trainingEstimatedSeconds) < 0.001);
        assert.ok(Math.abs(result.detail.domains.reduce((total, item) => total + item.estimatedSeconds, 0)
            - time.estimatedSeconds) < 0.001);
    });
    it('retains genuine historical time with unknown lesson boundaries and no submitted solutions', async () => {
        await daily.updateOne({ uid: 101, domainId: 'python', day: '2026-10-25' }, {
            $set: { seconds: 600, sources: [{ key: 'problem:1', kind: 'problem', pid: 1, seconds: 600 }] },
            $unset: { startedAt: '', updatedAt: '' },
        });
        await records.deleteMany({ uid: 101 });
        await classes.insertOne({ workspaceId: 'school', domainId: 'cpp', uid: 101, externalId: 'unknown-boundary',
            startAt: new Date('2026-10-25T10:00:00+08:00'), endAt: new Date('2026-10-25T11:00:00+08:00') });
        const result = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }));
        assert.equal(result.detail.timeBreakdown.trainingLabel, '约 5 分钟');
        assert.equal(result.detail.timeBreakdown.trainingEstimatedSeconds, 300);
        assert.equal(result.detail.timeBreakdown.estimationMethod, 'bounds-midpoint');
        assert.equal(result.detail.problems[0].autonomousLabel, '约 5 分钟');
    });
    it('preserves missing question attribution separately while conserving the historical estimate', async () => {
        await daily.updateOne({ uid: 101, domainId: 'python', day: '2026-10-25' }, { $set: {
            seconds: 900, sources: [{ key: 'problem:1', kind: 'problem', pid: 1, seconds: 300 }],
        } });
        await classes.insertOne({ workspaceId: 'school', domainId: 'python', uid: 101, externalId: 'partial-sources',
            startAt: new Date('2026-10-25T11:30:00+08:00'), endAt: new Date('2026-10-25T12:00:00+08:00') });
        const result = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }));
        assert.equal(result.detail.timeBreakdown.trainingEstimatedSeconds, 450);
        assert.equal(result.detail.problems[0].autonomousSeconds, 150);
        assert.equal(result.detail.problems[0].estimatedSeconds, 300);
        assert.equal(result.detail.otherPracticeLabel, '约 10 分钟');
        assert.equal(result.detail.otherPracticeSeconds, 600);
        const domainTime = result.detail.domains.find((item) => item.id === 'python');
        assert.equal(result.detail.problems[0].autonomousSeconds + domainTime.unattributedEstimatedSeconds, 450);
        assert.equal(result.detail.timeBreakdown.classSeconds, 1800, 'Estimated practice is not added to the lesson again');
    });
    it('ranks by total time spent on each question even when the most-solved question or the longest class differs', async () => {
        const start = Date.parse('2026-10-25T10:00:00+08:00');
        await daily.deleteMany({ uid: 101 });
        const lessonProblem = { kind: 'problem', pid: 5 }, independent = { kind: 'problem', pid: 1 };
        const row = timer(101, 'cpp', '2026-10-25', 360);
        row.sources = [{ ...lessonProblem, seconds: 240 }, { ...independent, seconds: 120 }];
        row.intervals = [{ ...lessonProblem, start, end: start + 240000 },
            { ...independent, start: start + 3600000, end: start + 3720000 }];
        await daily.insertOne(row);
        await classes.insertOne({ workspaceId: 'school', domainId: 'cpp', uid: 101, externalId: 'long-class',
            startAt: new Date(start), endAt: new Date(start + 3600000) });
        for (let i = 0; i < 4; i++) await records.insertOne(submission(101, 'cpp', 1));
        const { detail } = await model.loadTrainingDashboard(handler({ domains: 'cpp', student: '101' }));
        assert.deepEqual(Array.from(detail.problems, (problem) => problem.title), ['循环练习', 'C++ 题目']);
        assert.deepEqual(Array.from(detail.problems, (problem) => problem.estimatedSeconds), [240, 120]);
        assert.deepEqual(Array.from(detail.problems, (problem) => problem.autonomousSeconds), [0, 120]);
        assert.equal(detail.timeBreakdown.classSeconds, 3600);
        assert.equal(detail.timeBreakdown.seconds, 3720);
        assert.equal(detail.problems[0].classTrainingLabel, '4 分钟');
        assert.equal(detail.problems[1].submits, 5);
    });
    it('limits only the displayed ranking, breaks equal-time ties deterministically and fetches titles in one classroom read', async (t) => {
        await Promise.all([daily.deleteMany({ uid: 101 }), records.deleteMany({ uid: 101 })]);
        const row = timer(101, 'python', '2026-10-25', 53 * 60);
        row.sources = Array.from({ length: 53 }, (_, i) => ({ key: `problem:${53 - i}`, kind: 'problem', pid: 53 - i, seconds: 60 }));
        await daily.insertOne(row);
        // One removed problem (docId 2) must retain its time but cannot have an active link.
        await problems.insertMany(row.sources.filter(({ pid }) => pid > 2).map(({ pid }) =>
            ({ domainId: 'python', docId: pid, pid: 'P' + pid, title: '题 ' + pid, hidden: false })));
        await records.insertOne(submission(101, 'python', 53, 2));
        const lookups = [];
        const find = problems.find;
        problems.find = function (filter, ...args) {
            lookups.push(filter);
            return find.call(this, filter, ...args);
        };
        t.after(() => { problems.find = find; });
        const { detail } = await model.loadTrainingDashboard(handler({ student: 101, domains: 'python' }));
        assert.equal(detail.problems.length, 50);
        assert.equal(detail.problemLimit, 50);
        assert.equal(detail.timeBreakdown.trainingSeconds, 53 * 60);
        assert.equal(detail.otherPracticeSeconds, 0);
        assert.deepEqual(Array.from(detail.problems.slice(0, 4), (item) => item.title),
            ['题 53', 'Python 题目', '题目已移除', '题 3']);
        assert.equal(detail.problems[2].url, '');
        assert.equal(detail.problems[2].estimatedSeconds, 60);
        assert.equal(lookups.length, 1);
        assert.equal(lookups[0].domainId, 'python');
        assert.equal(lookups[0].docId.$in.length, 50);
    });
    it('renders only the selected learner’s authorized lesson rows in a closed reconciliation disclosure, with a bounded list and a complete total', async (t) => {
        const h = handler({ period: 'today', domains: 'python', student: 103 });
        const start = Date.parse('2026-10-25T09:00:00+08:00');
        const row = (i) => ({
            workspaceId: 'school', uid: 103, domainId: 'python', source: i % 2 ? 'lesson' : 'import',
            externalId: 'private-external-reference-' + i, title: '课堂 ' + i,
            startAt: new Date(start + i * 60000), endAt: new Date(start + (i + 1) * 60000),
            fingerprint: 'private-source-metadata',
        });
        await classes.insertMany([
            ...Array.from({ length: 103 }, (_, i) => row(i)),
            { ...row(103), workspaceId: 'another-school', title: '其他工作区课堂' },
            { ...row(104), domainId: 'cpp', title: '其他域课堂' },
            { ...row(105), uid: 101, title: '其他学员课堂' },
            { ...row(-1440), title: '昨天课堂' }, { ...row(1440), title: '明天课堂' },
        ]);
        const page = await model.loadTrainingDashboard(h);
        assert.equal(page.detail.lessonCount, 103);
        assert.equal(page.detail.lessonLimit, true);
        assert.equal(page.detail.timeBreakdown.classSeconds, 103 * 60);
        assert.deepEqual(Array.from(page.detail.lessons, (lesson) => lesson.title), Array.from({ length: 100 }, (_, i) => '课堂 ' + (102 - i)));
        assert.deepEqual(Object.keys(page.detail.lessons[0]).sort(), ['domainName', 'endLabel', 'sourceLabel', 'startLabel', 'timeLabel', 'title']);
        const dom = new JSDOM(render(page));
        t.after(() => dom.window.close());
        const disclosure = dom.window.document.querySelector('details[data-training-lessons]');
        assert.equal(disclosure.open, false);
        const summary = disclosure.querySelector('summary');
        assert.match(summary.textContent, /上课记录/);
        assert.match(summary.textContent, /103 条/);
        summary.click();
        assert.equal(disclosure.open, true);
        assert.equal(disclosure.querySelectorAll('li').length, 100);
        assert.match(disclosure.textContent, /最近 100 条/);
        assert.match(disclosure.textContent, /外部课堂/);
        assert.match(disclosure.textContent, /站内课堂/);
        assert.match(disclosure.querySelector('li').textContent, /2026-10-25 10:42 至 2026-10-25 10:43/);
        assert.doesNotMatch(disclosure.textContent, /其他工作区课堂|其他域课堂|其他学员课堂|昨天课堂|明天课堂|private-/);
        const yesterday = await model.loadTrainingDashboard(handler({ period: 'custom', start: '2026-10-24',
            end: '2026-10-24', domains: 'python', student: 103 }));
        assert.deepEqual(Array.from(yesterday.detail.lessons, (lesson) => lesson.title), ['昨天课堂']);
    });
    it('clips midnight classes to the selected days and keeps nonoverlapping historical practice unchanged', async () => {
        await classes.insertOne({ workspaceId: 'school', domainId: 'python', uid: 101, externalId: 'overnight', title: '跨日课堂',
            startAt: new Date('2026-10-24T23:30:00+08:00'), endAt: new Date('2026-10-25T01:00:00+08:00') });
        const result = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }));
        assert.equal(result.detail.timeBreakdown.classSeconds, 3600);
        assert.equal(result.detail.timeBreakdown.trainingSeconds, 900);
        assert.equal(result.detail.timeBreakdown.legacySeconds, 900);
        assert.equal(result.detail.timeBreakdown.seconds, 4500);
        assert.equal(result.detail.lessons[0].timeLabel, '1 小时');
        assert.equal(result.detail.timeBreakdown.timeLabel, '1 小时 15 分钟');
        const restricted = await model.loadTrainingDashboard(handler({ domains: 'python' }, 11));
        assert.equal(restricted.detail.timeBreakdown.classSeconds, 5400);
    });
});
