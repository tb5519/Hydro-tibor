const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const moment = require('moment-timezone');
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
let model;
let startedAt = new Date('2026-10-05T00:00:00+08:00');
const classrooms = [
    { _id: 'python', name: 'Python 训练', owner: 10 },
    { _id: 'cpp', name: 'C++ 训练', owner: 10 },
    { _id: 'scratch', name: 'Scratch 创作', domainType: 'scratch', owner: 10 },
];
function account(id, domainId = 'python') {
    return { _id: id,
        hasPriv: (p) => p === PRIV.PRIV_USER_PROFILE || (id === 10 && p === PRIV.PRIV_EDIT_SYSTEM),
        hasPerm: (p) => id === 10 || (id === 11 && domainId === 'python' && p === PERM.PERM_EDIT_DOMAIN),
    };
}
function handler(query = {}, id = 10) {
    return { user: account(id), session: {}, domain: { _id: 'python', workspaceId: 'school' },
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
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    db = client.db('training_dashboard');
    daily = db.collection('daily'); records = db.collection('records'); domains = db.collection('domain.user');
    accounts = db.collection('user'); problems = db.collection('problem'); classes = db.collection('classes');
    const helper = load('packages/hydrooj/src/lib/training_dashboard.ts');
    const clock = load('packages/hydrooj/src/lib/training_time.ts');
    const learning = load('packages/hydrooj/src/lib/learning_time.ts', { './training_time': clock });
    model = load('packages/hydrooj/src/model/training_dashboard.ts', {
        '../error': { PermissionError, ValidationError }, '../lib/domain_type': { isScratchDomain: (d) => d.domainType === 'scratch' },
        '../lib/training_dashboard': helper, './builtin': { PERM, PRIV, STATUS },
        '../lib/learning_time': learning, './class_time': { classes },
        '../utils': { Time: { getObjectID: (time) => ObjectId.createFromTime(Math.floor(+time / 1000)) } },
        './domain': { collUser: domains },
        './problem': {
            get: (domainId, pid) => problems.findOne({ domainId, docId: pid }),
            canViewBy: (pdoc, viewer) => !pdoc.hidden || viewer.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN),
        },
        './record': { coll: records, RECORD_PRETEST: 'pretest', RECORD_GENERATE: 'generate' },
        './training_time': { daily, getTrackingStartedAt: async () => startedAt },
        './user': { getById: async (domainId, uid) => account(uid, domainId), getMulti: (query) => accounts.find(query) },
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
    it('administrator merges only OJ classrooms in current workspace', async () => {
        const result = await model.loadTrainingDashboard(handler());
        assert.deepEqual(Array.from(result.selectedDomainIds), ['python', 'cpp']);
        assert.equal(result.summary.seconds, 4500);
        assert.equal(result.summary.studentCount, 3);
        assert.equal(result.summary.activeStudents, 2);
        assert.equal(result.summary.submits, 7);
        assert.equal(result.summary.acceptedProblems, 2);
        assert.equal(result.domains.find((d) => d.id === 'python').seconds, 1500);
        assert.equal(result.domains.find((d) => d.id === 'cpp').seconds, 3000);
        assert.equal(result.daily.length, 7);
    });
    it('classroom selection updates time, roster, submissions and distinct AC together', async () => {
        const result = await model.loadTrainingDashboard(handler({ domains: 'python' }));
        assert.equal(result.summary.seconds, 1500);
        assert.equal(result.summary.studentCount, 2);
        assert.equal(result.summary.acceptedProblems, 1);
        assert.equal(result.summary.submits, 3);
        assert.deepEqual(Array.from(result.rows.map((row) => row.uid)).sort(), [101, 103]);
        assert.equal(result.domains.find((d) => d.id === 'cpp').selected, false);
        assert.equal(result.domains.find((d) => d.id === 'cpp').seconds, 0);
    });
    it('does not double count repeated AC but keeps equal problem ids in separate domains', async () => {
        const result = await model.loadTrainingDashboard(handler({ student: '101' }));
        const row = result.rows.find((entry) => entry.uid === 101);
        assert.equal(row.acceptedProblems, 2);
        assert.equal(row.submits, 4);
        assert.equal(result.detail.problems.filter((entry) => entry.accepted).length, 2);
    });
    it('ordinary teacher sees only domains they actually manage', async () => {
        const result = await model.loadTrainingDashboard(handler({ domains: 'all' }, 11));
        assert.deepEqual(Array.from(result.selectedDomainIds), ['python']);
        assert.equal(result.summary.seconds, 1500);
        assert(result.rows.every((row) => row.uid !== 102));
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
        assert.equal(result.daily.length, 90);
    });
    it('detail shows per-domain times, recent 7 days, month and complete-week average', async () => {
        const result = await model.loadTrainingDashboard(handler({ student: '101' }));
        assert.equal(result.detail.name, '小艾');
        assert.equal(result.detail.overview[0].value, '45 分钟');
        assert.equal(result.detail.overview[1].value, '45 分钟');
        assert.equal(result.detail.overview[2].value, '3 小时 45 分钟');
        assert.equal(result.detail.overview[3].value, '1 小时 30 分钟');
        assert.match(result.detail.overview[3].helper, /2 个完整自然周/);
        assert.equal(result.detail.domains.find((entry) => entry.id === 'python').seconds, 1500);
        assert.equal(result.detail.domains.find((entry) => entry.id === 'cpp').seconds, 1200);
    });
    it('historical custom detail reads only the selected and recent windows, not intervening years', async (t) => {
        await daily.insertMany([
            timer(101, 'python', '2024-01-10', 60),
            timer(101, 'python', '2025-07-01', 999999),
        ]);
        const originalFind = daily.find;
        let loadedDays = [];
        daily.find = function (...args) {
            const cursor = originalFind.apply(this, args);
            const originalToArray = cursor.toArray;
            cursor.toArray = async function () {
                const documents = await originalToArray.call(this);
                loadedDays = documents.map((item) => item.day);
                return documents;
            };
            return cursor;
        };
        t.after(() => { daily.find = originalFind; });
        const result = await model.loadTrainingDashboard(handler({
            student: '101', period: 'custom', start: '2024-01-01', end: '2024-03-30',
        }));
        assert.equal(result.daily.length, 90);
        assert.equal(result.detail.overview[0].value, '1 分钟');
        assert.equal(result.detail.overview[1].value, '45 分钟');
        assert.equal(result.detail.overview[2].value, '3 小时 45 分钟');
        assert(loadedDays.includes('2024-01-10'));
        assert(loadedDays.includes('2026-10-25'));
        assert(!loadedDays.includes('2025-07-01'));
    });
    it('detail selected-domain metrics never reintroduce unselected classroom totals', async () => {
        const result = await model.loadTrainingDashboard(handler({ student: '101', domains: 'python' }));
        assert.equal(result.detail.overview[0].value, '25 分钟');
        assert.equal(result.detail.overview[2].value, '1 小时 25 分钟');
        assert.equal(result.detail.overview[3].value, '30 分钟');
        assert(result.detail.problems.every((entry) => entry.domainId === 'python'));
    });
    it('does not misrepresent prelaunch or partial-week periods as zero training', async () => {
        startedAt = new Date('2026-10-24T18:00:00+08:00');
        const result = await model.loadTrainingDashboard(handler({ student: '101' }));
        assert.equal(result.detail.overview[3].value, '—');
        assert.match(result.detail.overview[3].helper, /完整自然周/);
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
    it('keeps standalone IDE and daily quiz sources separate from programming problem ids', async () => {
        await daily.updateOne({ uid: 101, domainId: 'python', day: '2026-10-25' }, { $set: { seconds: 1500 }, $push: { sources: {
            key: 'daily:1', kind: 'daily', pid: 1, seconds: 600,
        } } });
        const first = await model.loadTrainingDashboard(handler({ student: '101', domains: 'python' }));
        assert(first.detail.problems.some((entry) => entry.title === '每日一练' && !entry.url));
        assert(first.detail.problems.some((entry) => entry.title === 'Python 题目' && entry.url));
        const second = await model.loadTrainingDashboard(handler({ student: '102' }));
        assert(second.detail.problems.some((entry) => entry.title === '在线编程' && !entry.url));
    });
    it('attention filters and search act on computed scoped students', async () => {
        const stuck = await model.loadTrainingDashboard(handler({ attention: 'stuck' }));
        assert.deepEqual(Array.from(stuck.rows.map((row) => row.uid)), [102]);
        const quiet = await model.loadTrainingDashboard(handler({ attention: 'quiet' }));
        assert.deepEqual(Array.from(quiet.rows.map((row) => row.uid)), [103]);
        const search = await model.loadTrainingDashboard(handler({ q: '小艾' }));
        assert.deepEqual(Array.from(search.rows.map((row) => row.uid)), [101]);
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
        assert.equal(result.summary.seconds, 10800);
        assert.equal(result.summary.trainingSeconds, 1800);
        assert.equal(result.summary.classSeconds, 9000);
        assert.equal(result.summary.overlapSeconds, 3600);
        assert.equal(result.summary.legacySeconds, 0);
        assert.equal(result.summary.activeStudents, 2);
        assert.equal(result.daily[0].seconds, 10800);
        assert.equal(result.domains.find((item) => item.id === 'python').seconds, 10800);
        const classOnly = result.rows.find((item) => item.uid === 103);
        assert.equal(classOnly.classSeconds, 3600);
        assert.equal(classOnly.attentionKind, 'normal');
        assert.equal(result.detail.timeBreakdown.seconds, 7200);
        assert.equal(result.detail.timeBreakdown.trainingSeconds, 1800);
        assert.equal(result.detail.lessons.length, 2);
        assert.equal(result.detail.lessons[0].title, '重复时间段');
        assert.equal(result.detail.problems[0].timeLabel, '30 分钟');
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
        assert.equal(result.summary.trainingSeconds, 0);
        assert.equal(result.summary.classSeconds, 0, 'The visible scope does not import another classroom’s class totals');
        assert.equal(result.summary.overlapSeconds, 1200);
        assert.equal(result.summary.activeStudents, 1);
        assert.equal(result.detail.lessons.length, 0);
        assert.equal(result.detail.problems[0].classTrainingLabel, '20 分钟');
        assert.equal(result.detail.problems[0].timeLabel, '0 分钟');
        const restricted = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }, 11));
        assert.equal(restricted.summary.trainingSeconds, 1200, 'An unauthorized classroom must not become a hidden data source');
        assert.equal(restricted.summary.overlapSeconds, 0);
    });
    it('corrects fully classroom-bound legacy counters and shows a range for a historical lesson crossing', async () => {
        await daily.deleteMany({ uid: 101, day: '2026-10-25' });
        await daily.insertMany([
            { ...timer(101, 'cpp', '2026-10-25', 2780.026),
                startedAt: new Date('2026-10-25T19:18:28+08:00'), updatedAt: new Date('2026-10-25T21:01:52+08:00') },
            { ...timer(101, 'python', '2026-10-25', 947.863),
                startedAt: new Date('2026-10-25T21:02:14.019+08:00'), updatedAt: new Date('2026-10-25T21:22:26.173+08:00') },
        ]);
        await classes.insertOne({ workspaceId: 'school', domainId: 'cpp', uid: 101, externalId: 'evening-lesson', title: '晚间课',
            startAt: new Date('2026-10-25T19:15:00+08:00'), endAt: new Date('2026-10-25T21:15:00+08:00') });
        const result = await model.loadTrainingDashboard(handler({ period: 'today', student: '101' }));
        const time = result.detail.timeBreakdown;
        assert.equal(time.classSeconds, 7200);
        assert.ok(Math.abs(time.trainingSeconds - 181.882) < 0.001);
        assert.ok(Math.abs(time.trainingUpperSeconds - 446.173) < 0.001);
        assert.equal(time.trainingLabel, '3～8 分钟');
        assert.equal(time.timeLabel, '2 小时 3～8 分钟');
        assert.equal(result.detail.daily[0].trainingLabel, time.trainingLabel);
        assert.equal(result.rows.find((item) => item.uid === 101).trainingLabel, time.trainingLabel);
        const cpp = result.detail.problems.find((item) => item.domainId === 'cpp');
        assert.equal(cpp.timeLabel, '0 分钟');
        assert.equal(cpp.classTrainingLabel, '46 分钟');
        const pythonOnly = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }));
        assert.equal(pythonOnly.detail.timeBreakdown.trainingLabel, '3～8 分钟');
        assert.equal(pythonOnly.detail.timeBreakdown.classSeconds, 0);
        assert.equal(pythonOnly.detail.lessons.length, 0);
    });
    it('does not label uncertain legacy practice with no submissions as inactive', async () => {
        await daily.updateOne({ uid: 101, domainId: 'python', day: '2026-10-25' }, {
            $set: { seconds: 600, sources: [{ key: 'problem:1', kind: 'problem', pid: 1, seconds: 600 }] },
            $unset: { startedAt: '', updatedAt: '' },
        });
        await records.deleteMany({ uid: 101 });
        await classes.insertOne({ workspaceId: 'school', domainId: 'cpp', uid: 101, externalId: 'unknown-boundary',
            startAt: new Date('2026-10-25T10:00:00+08:00'), endAt: new Date('2026-10-25T11:00:00+08:00') });
        const result = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }));
        assert.equal(result.summary.activeStudents, 1);
        assert.equal(result.rows.find((item) => item.uid === 101).attentionKind, 'normal');
        assert.equal(result.detail.timeBreakdown.trainingLabel, '0～10 分钟');
        assert.equal(result.detail.problems[0].timeLabel, '0～10 分钟');
    });
    it('clips midnight classes to the selected days and keeps nonoverlapping historical practice unchanged', async () => {
        await classes.insertOne({ workspaceId: 'school', domainId: 'python', uid: 101, externalId: 'overnight', title: '跨日课堂',
            startAt: new Date('2026-10-24T23:30:00+08:00'), endAt: new Date('2026-10-25T01:00:00+08:00') });
        const result = await model.loadTrainingDashboard(handler({ period: 'today', domains: 'python', student: '101' }));
        assert.equal(result.summary.classSeconds, 3600);
        assert.equal(result.summary.trainingSeconds, 900);
        assert.equal(result.summary.legacySeconds, 900);
        assert.equal(result.summary.seconds, 4500);
        assert.equal(result.detail.lessons[0].timeLabel, '1 小时');
        assert.equal(result.detail.overview[0].value, '1 小时 15 分钟');
        assert.equal(result.detail.daily[0].classSeconds, 3600);
        const restricted = await model.loadTrainingDashboard(handler({ domains: 'python' }, 11));
        assert.equal(restricted.summary.classSeconds, 5400);
    });
});
