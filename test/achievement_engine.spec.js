const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const Module = require('node:module');
const { before, beforeEach, after, describe, it } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { STATUS } = require('@hydrooj/common');
const {
    ACHIEVEMENT_CATALOG, ACHIEVEMENT_SERIES_COUNT, ACHIEVEMENT_EXPANSION_IDS, evaluateAchievementProgress,
    getAchievementSeriesId, getAchievementTier, selectHighestAchievements,
} = require('../packages/hydrooj/src/lib/achievement_catalog');

let database;
let client;
let server;
let engine;
const ctx = { db: { collection: (name) => database.collection(name) } };
const legacy = { _id: 'system', owner: 2 };
const modern = { _id: 'class', workspaceId: 'teacher', owner: 90 };
const activation = new Date('2026-10-25T00:00:00Z');
const now = new Date('2026-10-25T12:00:00Z');
const assigned = new Map();
const originalLoad = Module._load;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/achievement.ts') && request === '../model/workspace') {
            return {
                LEGACY_WORKSPACE_ID: 'tang',
                resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang',
                isAssignedToOtherWorkspace: async (uid, workspaceId) => assigned.has(uid) && assigned.get(uid) !== workspaceId,
                getDomains: async (workspaceId) => database.collection('domain').find(workspaceId === 'tang'
                    ? { $or: [{ workspaceId }, { workspaceId: { $exists: false } }] } : { workspaceId }).toArray(),
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    engine = require('../packages/hydrooj/src/lib/achievement');
} finally { Module._load = originalLoad; }

before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    database = client.db('achievement-test');
});
after(async () => { await client?.close(); await server?.stop(); });
beforeEach(async () => {
    await database.dropDatabase();
    assigned.clear();
    await database.collection('domain').insertMany([legacy, { _id: 'python' }, modern, { _id: 'other', workspaceId: 'other' }]);
    await database.collection('achievement.state').insertOne({ _id: 'activation', activatedAt: activation });
    await database.collection('achievement.state').insertOne({ _id: 'streak-activation', activatedAt: activation });
    await database.collection('achievement.state').insertOne({ _id: 'catalog-expansion-activation', activatedAt: activation });
});

function rid(time) {
    const id = new ObjectId();
    return new ObjectId(`${Math.floor(new Date(time).getTime() / 1000).toString(16).padStart(8, '0')}${id.toString().slice(8)}`);
}
async function acceptance(uid, pid, difficulty, options = {}) {
    const domainId = options.domainId || 'system';
    const at = options.at || '2026-10-25T02:00:00Z';
    await database.collection('document').updateOne({ domainId, docType: 10, docId: pid }, {
        $set: {
            difficulty, ...(options.objectiveKind ? { objectiveKind: options.objectiveKind } : {}),
            ...(options.hidden !== undefined ? { hidden: options.hidden } : {}),
        },
    }, { upsert: true });
    const record = {
        _id: rid(at), uid, pid, domainId, status: STATUS.STATUS_ACCEPTED, judgeAt: new Date(at),
        ...(options.contest ? { contest: options.contest } : {}),
        ...(options.practiceContest ? { practiceContest: options.practiceContest } : {}),
        ...(options.practiceEntryDomain ? { practiceEntryDomain: options.practiceEntryDomain } : {}),
        ...(options.scorePointAward ? { scorePointAward: options.scorePointAward } : {}),
    };
    await database.collection('record').insertOne(record);
    return record;
}
async function competition(uid, pids, extra = {}, participant = {}) {
    const contest = {
        _id: new ObjectId(), docType: 30, docId: new ObjectId(), domainId: 'system', rule: 'acm',
        beginAt: new Date('2026-10-25T01:00:00Z'), endAt: new Date('2026-10-25T03:00:00Z'), pids,
        ...extra,
    };
    await database.collection('document').insertOne(contest);
    await database.collection('document.status').insertOne({
        domainId: contest.domainId, docType: 30, docId: contest.docId, uid, attend: 1, ...participant,
    });
    return contest;
}
const sync = (uid = 11, domain = legacy, options = {}) => engine.syncUserAchievements(ctx, domain, uid, { now, ...options });
const unlocked = (rows) => rows.filter((item) => item.unlocked).map((item) => item.id);
const pending = (uid = 11, domain = legacy, limit = 10) => engine.getPendingAchievements(ctx, domain, uid, limit);
const streak = (rows, target = 100) => rows.find((item) => item.id === `streak-${target}`);
const weekly = (rows, target = 50) => rows.find((item) => item.id === `weekly-ac-${target}`);

describe('achievement catalog', () => {
    it('retains existing names and adds twenty-three milestones with no duplicate identifier', () => {
        assert.equal(ACHIEVEMENT_CATALOG.length, 87);
        assert.equal(new Set(ACHIEVEMENT_CATALOG.map((item) => item.id)).size, 87);
        assert.equal(ACHIEVEMENT_EXPANSION_IDS.size, 23);
        assert.deepEqual(ACHIEVEMENT_CATALOG.slice(0, 10).map((item) => item.name),
            ['初战告捷', '渐入佳境', '锋芒初露', '势如破竹', '强者进阶', '烈火淬锋', '破境而上', '登峰造极', '傲视群雄', '巅峰封神']);
        assert.equal(ACHIEVEMENT_CATALOG.find((item) => item.id === 'mastery-10-100').name, '神域之主');
        assert.equal(ACHIEVEMENT_CATALOG.find((item) => item.id === 'solved-1000').name, '千题封神');
        assert.deepEqual(ACHIEVEMENT_CATALOG.filter((item) => item.category === 'streak').map((item) => [item.target, item.name]), [
            [3, '锋芒初燃'], [7, '持之以恒'], [10, '十日磨剑'], [14, '意志如铁'], [20, '破晓行者'], [25, '不屈斗魂'], [30, '月度战神'],
            [40, '百炼成钢'], [50, '永恒之刃'], [60, '不灭战魂'], [70, '传奇征途'], [80, '超凡入圣'], [90, '九十日神话'], [100, '百日封神'],
        ]);
        assert.ok(ACHIEVEMENT_CATALOG.filter((item) => item.category === 'streak').every((item) => item.id === `streak-${item.target}`
            && item.description === `连续${item.target}天AC题目` && item.category === 'streak'));
        assert.deepEqual(ACHIEVEMENT_CATALOG.filter((item) => item.category === 'weekly_ac').map((item) => [item.target, item.name]), [
            [5, '七日新锐'], [10, '七日疾锋'], [15, '七日破阵'], [20, '七日狂刃'], [25, '七日战魂'],
            [30, '七日统帅'], [40, '七日霸主'], [50, '七日封神'],
        ]);
    });
    it('awards each threshold exactly at its boundary', () => {
        for (const item of ACHIEVEMENT_CATALOG) {
            const make = (value) => ({
                solved: item.category === 'solved' ? value : 0,
                difficulties: item.difficulty ? { [item.difficulty]: value } : {},
                contestAc: item.category === 'contest_ac' ? value : 0,
                contestAk: item.category === 'contest_ak' ? value : 0,
                points: item.category === 'points' ? value : 0,
                streakBest: item.category === 'streak' ? value : 0,
                weeklyAcBest: item.category === 'weekly_ac' ? value : 0,
            });
            assert.equal(evaluateAchievementProgress(make(item.target - 1)).find((row) => row.id === item.id).achieved, false, item.id);
            assert.equal(evaluateAchievementProgress(make(item.target)).find((row) => row.id === item.id).achieved, true, item.id);
        }
    });
    it('has fourteen independent series, ranking first difficulty by level and mastery separately per difficulty', () => {
        assert.equal(ACHIEVEMENT_SERIES_COUNT, 14);
        const selected = selectHighestAchievements(ACHIEVEMENT_CATALOG);
        assert.deepEqual(selected.map((item) => item.id), [
            'difficulty-10', 'solved-1000', 'contest-ak-100', 'contest-ac-500', 'points-100000',
            ...[4, 5, 6, 7, 8, 9, 10].map((difficulty) => `mastery-${difficulty}-100`), 'streak-100', 'weekly-ac-50',
        ]);
        assert.equal(getAchievementTier(selected[0]), 10, 'All first-difficulty targets are 1; difficulty determines their rank');
        assert.equal(getAchievementSeriesId(selected[5]), 'mastery-4');
        assert.equal(getAchievementSeriesId(selected[6]), 'mastery-5');
    });
    it('selects only the highest supplied earned row, keeps stable order and ignores unknown IDs or forged metadata', () => {
        const rows = [
            { id: 'difficulty-8', payload: 'earned difficulty 8' }, { id: 'difficulty-1', payload: 'later lower difficulty' },
            { id: 'mastery-4-10' }, { id: 'solved-100', category: 'mastery', target: 999999 },
            { id: 'mastery-5-10' }, { id: 'mastery-4-50' }, { id: 'solved-10' }, { id: 'unknown-999999' },
        ];
        const result = selectHighestAchievements(rows);
        assert.deepEqual(result.map((row) => row.id), ['difficulty-8', 'solved-100', 'mastery-5-10', 'mastery-4-50']);
        assert.strictEqual(result[0], rows[0]);
        assert.equal(rows.length, 8, 'Selection must not remove or rewrite earned history');
        assert.deepEqual(selectHighestAchievements([]), []);
    });
});

describe('achievement ledger with actual MongoDB', () => {
    it('silently imports historical ACs and cumulative points, without using the spendable balance', async () => {
        await acceptance(11, 1, 2, { at: '2026-10-24T02:00:00Z' });
        await database.collection('user').insertOne({ _id: 11, lotteryTotalPoints: 3100, lotteryPoints: 12 });
        assert.deepEqual(unlocked(await sync()), ['difficulty-2', 'points-1000', 'points-3000']);
        assert.equal((await pending()).length, 0);
        await database.collection('user').insertOne({ _id: 12, lotteryPoints: 100000, rp: 100000 });
        assert.deepEqual(unlocked(await sync(12)), []);
    });

    it('reads explicit legacy lifetime totals and keeps a later account migration silent', async () => {
        await database.collection('domain.user').insertMany([
            { domainId: 'system', uid: 11, join: true, lotteryTotalPoints: 900, lotteryPoints: 0 },
            { domainId: 'python', uid: 11, join: true, lotteryTotalPoints: 200, lotteryPoints: 0 },
            { domainId: 'system', uid: 12, join: true, lotteryPoints: 100000 },
        ]);
        assert.deepEqual(unlocked(await sync()), ['points-1000']);
        assert.equal((await pending()).length, 0);
        assert.deepEqual(unlocked(await sync(12)), []);
        await database.collection('user').insertOne({ _id: 11, lotteryTotalPoints: 3100, lotteryPoints: 0 });
        assert.deepEqual(unlocked(await sync()), ['points-1000', 'points-3000']);
        assert.equal((await pending()).length, 0);
    });

    it('recognizes first live settled quiz and lottery receipts without replaying historical points', async () => {
        await database.collection('user').insertMany([{ _id: 11, lotteryTotalPoints: 1300 }, { _id: 12, lotteryTotalPoints: 1500 }]);
        await database.collection('lottery.draw').insertOne({ uid: 11, domainId: 'system', createdAt: new Date('2026-10-25T01:00:00Z'), pointDelta: 100 });
        await database.collection('daily.quiz.session').insertMany([
            { _id: '11-day', uid: 11, settledAnswers: 1, items: [{ domainId: 'system', answer: { answeredAt: new Date('2026-10-25T02:00:00Z'), earnedPoints: 400 } }] },
            { _id: '12-day', uid: 12, settledAnswers: 0, items: [{ domainId: 'system', answer: { answeredAt: new Date('2026-10-25T02:00:00Z'), earnedPoints: 1000 } }] },
        ]);
        await sync();
        assert.deepEqual((await pending()).map((item) => item.id), ['points-1000']);
        await sync(12);
        assert.deepEqual(await pending(12), []);
    });

    it('keeps the first live AC pending even if the user had never opened their profile', async () => {
        const record = await acceptance(11, 1, 1);
        const rows = await sync(11, legacy, { record });
        assert.deepEqual(unlocked(rows), ['difficulty-1']);
        assert.deepEqual((await pending()).map((item) => item.id), ['difficulty-1']);
    });

    it('waits for point settlement on new verdicts and rejects stale readiness markers after a rejudge', async () => {
        const historical = await acceptance(11, 1, 1, { at: '2026-10-24T02:00:00Z' });
        assert.equal(await engine.isAchievementRecordReady(ctx, historical), true);
        const record = await acceptance(11, 2, 2);
        assert.equal(await engine.isAchievementRecordReady(ctx, record), false);
        await engine.recordAchievementAcceptance(ctx, record);
        const ready = await database.collection('record').findOne({ _id: record._id });
        assert.equal(await engine.isAchievementRecordReady(ctx, ready), true);
        await database.collection('record').updateOne({ _id: record._id }, { $set: { judgeAt: new Date('2026-10-25T04:00:00Z') } });
        await engine.recordAchievementAcceptance(ctx, record);
        assert.equal(await engine.isAchievementRecordReady(ctx, await database.collection('record').findOne({ _id: record._id })), false);
    });

    it('persists the point-settlement barrier before achievement sync so the owner can retry an interrupted hook', async () => {
        const record = await acceptance(11, 1, 1);
        const interrupted = { db: { collection(name) {
            if (name === 'domain') return { findOne: async () => { throw new Error('interrupted'); } };
            return database.collection(name);
        } } };
        await assert.rejects(engine.recordAchievementAcceptance(interrupted, record), /interrupted/);
        const ready = await database.collection('record').findOne({ _id: record._id });
        assert.equal(await engine.isAchievementRecordReady(ctx, ready), true);
        await sync(11, legacy, { record: ready });
        assert.deepEqual((await pending()).map((item) => item.id), ['difficulty-1']);
    });

    it('deduplicates retries and preserves first-AC difficulty after teacher edits and rejudges', async () => {
        const record = await acceptance(11, 1, 4);
        await sync();
        await database.collection('document').updateOne({ domainId: 'system', docType: 10, docId: 1 }, { $set: { difficulty: 10 } });
        await database.collection('record').updateOne({ _id: record._id }, { $set: { status: STATUS.STATUS_WRONG_ANSWER, judgeAt: now } });
        await acceptance(11, 1, 10, { at: '2026-10-25T04:00:00Z' });
        const rows = await sync();
        assert.deepEqual(unlocked(rows), ['difficulty-4']);
        assert.equal(rows.find((item) => item.id === 'solved-10').progress, 1);
        assert.equal(await database.collection('achievement.solved').countDocuments(), 1);
    });

    it('counts ungraded and malformed ratings as solves without inventing an integer difficulty', async () => {
        const ratings = [undefined, null, 0, -1, 11, 2.8, '8', NaN, Infinity, {}];
        for (const [index, rating] of ratings.entries()) await acceptance(11, index + 1, rating);
        const rows = await sync();
        assert.deepEqual(unlocked(rows), ['solved-10', 'weekly-ac-5', 'weekly-ac-10']);
        assert.equal(rows.filter((item) => item.category === 'difficulty').every((item) => item.progress === 0), true);
        const snapshots = await database.collection('achievement.solved').find({ uid: 11 }).toArray();
        assert.equal(snapshots.length, 10);
        assert.equal(snapshots.every((item) => item.difficulty === 0), true);
        await database.collection('document').updateMany({ domainId: 'system', docType: 10 }, { $set: { difficulty: 10 } });
        assert.deepEqual(unlocked(await sync()), ['solved-10', 'weekly-ac-5', 'weekly-ac-10']);
    });

    it('counts domain + problem once, allowing distinct same-numbered problems in legacy domains', async () => {
        for (let pid = 1; pid <= 9; pid++) await acceptance(11, pid, 5);
        await acceptance(11, 1, 5);
        assert.equal((await sync()).find((item) => item.id === 'solved-10').progress, 9);
        await acceptance(11, 1, 5, { domainId: 'python', at: '2026-10-25T11:59:30Z' });
        assert.ok(unlocked(await sync()).includes('solved-10'));
        assert.ok(unlocked(await sync()).includes('mastery-5-10'));
    });

    it('excludes pretests, generate jobs and objective source questions', async () => {
        await acceptance(11, 1, 1, { contest: new ObjectId('000000000000000000000000') });
        await acceptance(11, 2, 2, { contest: new ObjectId('000000000000000000000001') });
        await acceptance(11, 3, 3, { objectiveKind: 'single' });
        assert.deepEqual(unlocked(await sync()), []);
    });

    it('counts competition ACs per contest + problem and grants AK only for a full formal contest', async () => {
        const first = await competition(11, [1, 2]);
        await acceptance(11, 1, 1, { contest: first.docId });
        await acceptance(11, 1, 1, { contest: first.docId });
        const second = await competition(11, [1]);
        await acceptance(11, 1, 1, { contest: second.docId });
        const rows = await sync();
        assert.equal(rows.find((item) => item.id === 'contest-ac-10').progress, 2);
        assert.equal(rows.find((item) => item.id === 'contest-ak-5').progress, 1);
        assert.ok(unlocked(rows).includes('contest-ak-1'));
        assert.equal(rows.find((item) => item.id === 'solved-10').progress, 1);
    });

    it('does not treat homework, practice, nonparticipants, late or time-limited submissions as competition wins', async () => {
        for (const [extra, participant, at] of [
            [{ rule: 'homework' }, {}, '2026-10-25T02:00:00Z'],
            [{}, { unrank: true }, '2026-10-25T02:00:00Z'],
            [{}, { virtual: true }, '2026-10-25T02:00:00Z'],
            [{}, { practice: true }, '2026-10-25T02:00:00Z'],
            [{}, { attend: 0 }, '2026-10-25T02:00:00Z'],
            [{}, { startAt: new Date('2026-10-25T02:30:00Z') }, '2026-10-25T02:00:00Z'],
            [{}, { endAt: new Date('2026-10-25T01:30:00Z') }, '2026-10-25T02:00:00Z'],
            [{ pids: [2] }, {}, '2026-10-25T02:00:00Z'],
            [{}, {}, '2026-10-25T04:00:00Z'],
            [{ duration: 0.5 }, { startAt: new Date('2026-10-25T01:00:00Z') }, '2026-10-25T02:00:00Z'],
        ]) {
            const contest = await competition(11, [1], extra, participant);
            await acceptance(11, 1, 1, { contest: contest.docId, at });
        }
        const rows = await sync();
        assert.equal(rows.find((item) => item.id === 'contest-ac-1').progress, 0);
        assert.equal(rows.find((item) => item.id === 'contest-ak-1').progress, 0);
        assert.equal(rows.find((item) => item.id === 'solved-10').progress, 1);
    });

    it('awards live hidden-problem, contest and point milestones without waiting for hidden results to be published', async () => {
        const contest = await competition(11, [1], {
            rule: 'oi', hideScoreboard: true, keepScoreboardHidden: true,
            lockAt: new Date('2026-10-25T01:30:00Z'), endAt: new Date('2026-10-26T00:00:00Z'),
        });
        const record = await acceptance(11, 1, 8, { contest: contest.docId, hidden: true, scorePointAward: { points: 1500 } });
        await database.collection('user').insertOne({
            _id: 11, lotteryTotalPoints: 1500, lotteryPoints: 1500, contestScorePointAwards: { [contest.docId.toString()]: 1500 },
        });
        const judgedNow = new Date('2026-10-25T02:00:00Z');
        const rows = await sync(11, legacy, { record, now: judgedNow });
        assert.deepEqual(unlocked(rows), ['difficulty-8', 'contest-ak-1', 'contest-ac-1', 'points-1000']);
        assert.equal(rows.find((item) => item.id === 'solved-10').progress, 1);
        const grants = await pending();
        assert.equal(grants.length, 4);
        assert.ok(grants.every((item) => item.unlockedAt.getTime() === judgedNow.getTime()));
        assert.deepEqual(unlocked(await sync()), unlocked(rows));
        assert.equal((await pending()).length, 4);
    });

    it('counts hidden-rank IOI ACs while the contest runs and still requires every contest problem for AK', async () => {
        const contest = await competition(11, [1, 2, 3, 4], { rule: 'ioi', hideScoreboard: true });
        for (const pid of [1, 2, 3]) await acceptance(11, pid, 2, { contest: contest.docId });
        const rows = await sync(11, legacy, { now: new Date('2026-10-25T02:30:00Z') });
        assert.deepEqual(unlocked(rows), ['difficulty-2', 'contest-ac-1']);
        assert.equal(rows.find((item) => item.id === 'contest-ac-10').progress, 3);
        assert.equal(rows.find((item) => item.id === 'contest-ak-1').progress, 0);
        assert.equal((await pending()).length, 2);
        assert.deepEqual(unlocked(await sync()), unlocked(rows));
        assert.equal((await pending()).length, 2);
    });

    it('backfills old hidden-contest records silently while preserving live milestones and existing notifications', async () => {
        const contest = await competition(11, [1, 2, 3], {
            rule: 'strictioi', hideScoreboard: true, keepScoreboardHidden: true,
            beginAt: new Date('2026-10-24T00:00:00Z'), endAt: new Date('2026-10-26T00:00:00Z'),
        });
        await acceptance(11, 1, 2, { contest: contest.docId, hidden: true, at: '2026-10-24T02:00:00Z', scorePointAward: { points: 1200 } });
        await acceptance(11, 2, 3, { contest: contest.docId, hidden: true, scorePointAward: { points: 2000 } });
        await database.collection('user').insertOne({ _id: 11, lotteryTotalPoints: 3200 });
        const stateId = createHash('sha256').update(JSON.stringify(['user', 'legacy', 11])).digest('hex');
        await database.collection('achievement.state').insertOne({
            _id: stateId, scope: 'legacy', uid: 11, version: 1, importedAt: now, pointSource: 'account', baselinePoints: 0,
        });
        const existing = {
            _id: createHash('sha256').update(JSON.stringify(['unlock', 'legacy', 11, 'contest-ac-1'])).digest('hex'),
            scope: 'legacy', uid: 11, achievementId: 'contest-ac-1',
            unlockedAt: new Date('2026-10-25T10:00:00Z'), historical: false, pending: true,
        };
        await database.collection('achievement.unlock').insertOne(existing);
        const rows = await sync();
        assert.deepEqual(unlocked(rows), ['difficulty-2', 'difficulty-3', 'contest-ac-1', 'points-1000', 'points-3000']);
        assert.equal(rows.find((item) => item.id === 'difficulty-2').historical, true);
        assert.equal(rows.find((item) => item.id === 'points-1000').historical, true);
        assert.equal(rows.find((item) => item.id === 'contest-ak-1').unlocked, false);
        assert.deepEqual((await pending()).map((item) => item.id).sort(), ['contest-ac-1', 'difficulty-3', 'points-3000']);
        assert.deepEqual(await database.collection('achievement.unlock').findOne({ _id: existing._id }), existing);
        assert.equal((await database.collection('achievement.state').findOne({ _id: stateId })).baselinePoints, 1200);
        assert.equal((await database.collection('achievement.state').findOne({ _id: stateId })).version, 4);
    });

    it('awards valid ACs during a running public contest, excluding judgments that have not happened yet', async () => {
        const contest = await competition(11, [1], { endAt: new Date('2026-10-26T00:00:00Z') });
        await acceptance(11, 1, 9, { contest: contest.docId });
        assert.deepEqual(unlocked(await sync(11, legacy, { now: new Date('2026-10-25T01:30:00Z') })), []);
        assert.deepEqual(unlocked(await sync()), ['difficulty-9', 'contest-ak-1', 'contest-ac-1']);
    });

    it('retains real solves and credited points when a contest was deleted, without inventing competition eligibility', async () => {
        const tid = new ObjectId();
        await database.collection('user').insertOne({
            _id: 11, lotteryTotalPoints: 1500, contestScorePointAwards: { [tid.toString()]: 1500 },
        });
        await acceptance(11, 1, 8, { contest: tid, scorePointAward: { points: 1500 } });
        const rows = await sync();
        assert.deepEqual(unlocked(rows), ['difficulty-8', 'points-1000']);
        assert.equal(rows.find((item) => item.id === 'solved-10').progress, 1);
        assert.equal((await pending()).length, 2);
    });

    it('counts hidden library problems toward solve and difficulty milestones with duplicate submissions deduplicated', async () => {
        for (let pid = 1; pid <= 10; pid++) await acceptance(11, pid, 4, { hidden: true });
        await acceptance(11, 1, 4, { hidden: true });
        const rows = await sync();
        assert.deepEqual(unlocked(rows), ['difficulty-4', 'solved-10', 'mastery-4-10', 'weekly-ac-5', 'weekly-ac-10']);
        assert.equal(rows.find((item) => item.id === 'solved-100').progress, 10);
        assert.equal(rows.find((item) => item.id === 'contest-ac-1').progress, 0);
    });

    it('deduplicates simultaneous hidden-contest judge callbacks and preserves dismissal', async () => {
        const contest = await competition(11, [1], {
            rule: 'oi', hideScoreboard: true, keepScoreboardHidden: true,
            endAt: new Date('2026-10-26T00:00:00Z'), lockAt: new Date('2026-10-25T01:30:00Z'),
        });
        const record = await acceptance(11, 1, 4, { contest: contest.docId, hidden: true });
        await Promise.all(Array.from({ length: 6 }, () => engine.recordAchievementAcceptance(ctx, record)));
        assert.equal(await database.collection('achievement.solved').countDocuments({ uid: 11 }), 1);
        assert.equal(await database.collection('achievement.unlock').countDocuments({ uid: 11 }), 3);
        assert.equal((await pending()).length, 3);
        await engine.acknowledgeAchievements(ctx, legacy, 11, ['contest-ac-1']);
        await engine.recordAchievementAcceptance(ctx, record);
        assert.ok(!(await pending()).some((item) => item.id === 'contest-ac-1'));
    });

    it('uses cumulative earned points after spending and recovers a first-live contest point receipt', async () => {
        const contest = await competition(11, [1]);
        const record = await acceptance(11, 1, 1, { contest: contest.docId, scorePointAward: { points: 200 } });
        await database.collection('user').insertOne({ _id: 11, lotteryTotalPoints: 1100, lotteryPoints: 0 });
        await sync(11, legacy, { record });
        assert.ok((await pending()).some((item) => item.id === 'points-1000'));
        await engine.acknowledgeAchievements(ctx, legacy, 11, ['points-1000']);
        await database.collection('user').updateOne({ _id: 11 }, { $set: { lotteryTotalPoints: 3100, lotteryPoints: 0 } });
        await sync();
        assert.ok((await pending()).some((item) => item.id === 'points-3000'));
        assert.ok(!(await pending()).some((item) => item.id === 'points-1000'));
    });

    it('keeps scopes and membership separate, including after a student moves to another workspace', async () => {
        assigned.set(11, 'teacher');
        await database.collection('domain.user').insertOne({ domainId: 'class', uid: 11, join: true });
        await acceptance(11, 1, 5, { domainId: 'class' });
        await acceptance(11, 2, 7, { domainId: 'other' });
        assert.deepEqual(unlocked(await sync(11, modern)), ['difficulty-5']);
        assert.deepEqual(await sync(11, legacy), []);
        assert.deepEqual(await pending(11, legacy), []);
        await engine.acknowledgeAchievements(ctx, legacy, 11, ['difficulty-5']);
        assert.equal((await pending(11, modern)).length, 1);
        await database.collection('domain.user').updateOne({ domainId: 'class', uid: 11 }, { $set: { join: false } });
        assert.deepEqual(await sync(11, modern), []);
        assert.deepEqual(await pending(11, modern), []);
    });

    it('credits shared contests to the entry domain only within the same workspace', async () => {
        assigned.set(11, 'teacher');
        await database.collection('domain').insertOne({ _id: 'source', workspaceId: 'teacher' });
        await database.collection('domain.user').insertMany([
            { domainId: 'class', uid: 11, join: true }, { domainId: 'source', uid: 11, join: true },
        ]);
        const contest = await competition(11, [1], { domainId: 'source', allDomains: true }, { entryDomainId: 'class' });
        const record = await acceptance(11, 1, 4, { domainId: 'source', contest: contest.docId });
        assert.deepEqual(unlocked(await sync(11, modern)), ['difficulty-4', 'contest-ak-1', 'contest-ac-1']);
        const source = { _id: 'source', workspaceId: 'teacher' };
        assert.deepEqual(unlocked(await sync(11, source)), []);
        assert.equal(await engine.getAchievementRecord(ctx, source, 11, record._id), null);
        assert.equal((await engine.getAchievementRecord(ctx, modern, 11, record._id)).uid, 11);
        assert.equal(await engine.getAchievementRecord(ctx, modern, 12, record._id), null);
        assert.deepEqual(await sync(11, { _id: 'other', workspaceId: 'other' }), []);
    });

    it('is idempotent under concurrent callbacks, bounds pending batches and only acknowledges the signed-in owner', async () => {
        for (let difficulty = 1; difficulty <= 10; difficulty++) await acceptance(11, difficulty, difficulty);
        await acceptance(12, 1, 1);
        await Promise.all(Array.from({ length: 12 }, () => sync()));
        await sync(12);
        assert.equal(await database.collection('achievement.unlock').countDocuments({ uid: 11 }), 13);
        assert.deepEqual((await pending(11, legacy, 1000)).map((item) => item.id).sort(), ['difficulty-10', 'solved-10', 'weekly-ac-10']);
        await engine.acknowledgeAchievements(ctx, legacy, 12, ['difficulty-1', 'difficulty-2']);
        assert.ok((await pending()).some((item) => item.id === 'difficulty-10'));
        assert.equal((await pending(12)).length, 0);
        await engine.acknowledgeAchievements(ctx, legacy, 11, ['difficulty-1']);
        await sync();
        assert.ok(!(await pending()).some((item) => item.id === 'difficulty-1'));
        assert.ok((await pending()).some((item) => item.id === 'difficulty-10'), 'acknowledging a lower tier must not dismiss the higher reward');
        await engine.acknowledgeAchievements(ctx, legacy, 11, ['difficulty-10']);
        await sync();
        assert.ok(!(await pending()).some((item) => item.category === 'difficulty'));
    });
});

describe('consecutive AC milestones', () => {
    it('initializes one dedicated streak rollout clock without modifying the original activation', async () => {
        await database.collection('achievement.state').deleteOne({ _id: 'streak-activation' });
        const before = Date.now();
        const timestamps = await Promise.all(Array.from({ length: 5 }, () => engine.initializeStreakAchievements(ctx)));
        assert.ok(timestamps.every((time) => +time === +timestamps[0] && +time >= before && +time <= Date.now()));
        assert.equal(+await engine.initializeAchievementSystem(ctx), +activation);
        assert.equal(await database.collection('achievement.state').countDocuments({ _id: 'streak-activation' }), 1);
    });

    it('uses Beijing midnight, counts repeat-problem submissions on new days, and never adds days for a rejudge', async () => {
        const first = await acceptance(11, 1, 2, { at: '2026-10-22T15:59:59Z' });
        await acceptance(11, 1, 2, { at: '2026-10-22T16:00:00Z' });
        await acceptance(11, 1, 2, { at: '2026-10-22T16:05:00Z' });
        await acceptance(11, 1, 2, { at: '2026-10-23T16:00:00Z' });
        let rows = await sync();
        assert.equal(streak(rows).progress, 3);
        assert.equal(streak(rows).nextAcProgress, 4); // The latest AC was yesterday in Beijing.
        assert.equal(streak(rows, 3).historical, true);
        assert.equal(await database.collection('achievement.solved').countDocuments({ uid: 11 }), 1);
        assert.equal(await database.collection('achievement.day').countDocuments({ uid: 11 }), 3);
        const days = await database.collection('achievement.day').find({ uid: 11 }).sort({ day: 1 }).toArray();
        assert.equal(days[2].day - days[0].day, 2);

        await database.collection('record').updateOne({ _id: first._id }, { $set: { judgeAt: new Date('2026-10-25T10:00:00Z') } });
        rows = await sync(11, legacy, { record: first });
        assert.equal(streak(rows).progress, 3);
        assert.equal(streak(rows).nextAcProgress, 4);
        assert.deepEqual(await database.collection('achievement.day').find({ uid: 11 }).sort({ day: 1 }).toArray(), days);
        const today = await acceptance(11, 1, 2, { at: '2026-10-24T16:00:00Z' });
        rows = await sync(11, legacy, { record: today });
        assert.equal(streak(rows).progress, 4);
        assert.equal(streak(rows).nextAcProgress, 4); // A second AC today cannot make five days.
        assert.equal((await pending()).filter((item) => item.category === 'streak').length, 0);
    });

    it('retains historical best and awards after a break but predicts only the current run', async () => {
        for (let day = 1; day <= 6; day++) await acceptance(11, 1, 1, { at: `2026-10-${String(day).padStart(2, '0')}T02:00:00Z` });
        await acceptance(11, 1, 1, { at: '2026-10-24T02:00:00Z' });
        let rows = await sync();
        assert.equal(streak(rows).progress, 6);
        assert.equal(streak(rows, 7).unlocked, false);
        assert.equal(streak(rows, 7).nextAcProgress, 2);
        assert.equal(streak(rows, 3).unlocked, true);
        const today = await acceptance(11, 1, 1, { at: '2026-10-25T02:00:00Z' });
        rows = await sync(11, legacy, { record: today });
        assert.equal(streak(rows, 7).nextAcProgress, 2);
        rows = await sync(11, legacy, { now: new Date('2026-10-27T02:00:00Z') });
        assert.equal(streak(rows, 7).nextAcProgress, 1);
        assert.equal(streak(rows).progress, 6);
        assert.equal(streak(rows, 3).unlocked, true);
    });

    it('silently imports pre-rollout streaks once, preserves older baselines, then notifies only a newly reached tier', async () => {
        const rollout = new Date('2026-11-01T00:00:00Z');
        await database.collection('achievement.state').updateOne({ _id: 'streak-activation' }, { $set: { activatedAt: rollout } });
        for (let day = 26; day <= 31; day++) await acceptance(11, 1, 2, { at: `2026-10-${day}T02:00:00Z` });
        const stateId = createHash('sha256').update(JSON.stringify(['user', 'legacy', 11])).digest('hex');
        await database.collection('achievement.state').insertOne({
            _id: stateId, scope: 'legacy', uid: 11, version: 2, importedAt: rollout, pointSource: 'account', baselinePoints: 800,
        });
        await database.collection('user').insertOne({ _id: 11, lotteryTotalPoints: 1000 });
        let rows = await sync(11, legacy, { now: new Date('2026-11-01T00:30:00Z') });
        assert.equal(streak(rows).progress, 6);
        assert.equal(streak(rows, 3).historical, true);
        assert.equal(streak(rows, 3).nextAcProgress, 7);
        assert.equal((await pending()).some((item) => item.category === 'streak'), false);
        assert.equal((await pending()).some((item) => item.id === 'points-1000'), true);
        assert.equal((await database.collection('achievement.state').findOne({ _id: stateId })).baselinePoints, 800);
        assert.equal((await database.collection('achievement.state').findOne({ _id: 'activation' })).activatedAt.getTime(), +activation);
        const seventh = await acceptance(11, 1, 2, { at: '2026-11-01T02:00:00Z' });
        rows = await sync(11, legacy, { record: seventh, now: new Date('2026-11-01T03:00:00Z') });
        assert.equal(streak(rows, 7).unlocked, true);
        assert.equal(streak(rows, 7).historical, false);
        assert.deepEqual((await pending()).filter((item) => item.category === 'streak').map((item) => item.id), ['streak-7']);
        await engine.acknowledgeAchievements(ctx, legacy, 11, ['streak-7']);
        await sync(11, legacy, { now: new Date('2026-11-03T03:00:00Z') });
        assert.equal((await pending()).some((item) => item.id === 'streak-7'), false);
    });

    it('counts hidden active-contest ACs but excludes pretests, hack records, objective sources and non-AC verdicts', async () => {
        await acceptance(11, 1, 2, { hidden: true, at: '2026-10-23T02:00:00Z' });
        await acceptance(11, 1, 2, { hidden: true, at: '2026-10-25T02:00:00Z' });
        await acceptance(11, 2, 2, { at: '2026-10-24T02:00:00Z', objectiveKind: 'single' });
        await acceptance(11, 3, 2, { at: '2026-10-24T02:00:00Z', contest: new ObjectId('000000000000000000000000') });
        const hack = await acceptance(11, 4, 2, { at: '2026-10-24T02:00:00Z' });
        await database.collection('record').updateOne({ _id: hack._id }, { $set: { hackTarget: new ObjectId() } });
        const failed = await acceptance(11, 5, 2, { at: '2026-10-24T02:00:00Z' });
        await database.collection('record').updateOne({ _id: failed._id }, { $set: { status: STATUS.STATUS_WRONG_ANSWER } });
        assert.equal(streak(await sync()).progress, 1);
        const contest = await competition(11, [6], {
            rule: 'oi', beginAt: new Date('2026-10-22T00:00:00Z'), endAt: new Date('2026-10-26T00:00:00Z'),
            hideScoreboard: true, keepScoreboardHidden: true, lockAt: new Date('2026-10-22T01:00:00Z'),
        });
        const valid = await acceptance(11, 6, 2, { hidden: true, at: '2026-10-24T02:00:00Z', contest: contest.docId });
        const rows = await sync(11, legacy, { record: valid });
        assert.equal(streak(rows).progress, 3);
        assert.equal(streak(rows, 3).historical, false);
        assert.equal(await database.collection('achievement.day').countDocuments({ uid: 11 }), 3);
    });

    it('combines legacy-domain days without combining other accounts or workspaces', async () => {
        await acceptance(11, 1, 1, { domainId: 'system', at: '2026-10-23T02:00:00Z' });
        await acceptance(11, 1, 1, { domainId: 'python', at: '2026-10-24T02:00:00Z' });
        await acceptance(11, 1, 1, { domainId: 'system', at: '2026-10-25T02:00:00Z' });
        await acceptance(12, 1, 1, { domainId: 'system', at: '2026-10-22T02:00:00Z' });
        await acceptance(11, 1, 1, { domainId: 'other', at: '2026-10-22T02:00:00Z' });
        assert.equal(streak(await sync()).progress, 3);
        assert.equal(streak(await sync(12)).progress, 1);
        assert.equal(await database.collection('achievement.day').countDocuments({ uid: 11 }), 3);
    });

    it('attributes shared-contest days only to the participant’s entry domain within the same workspace', async () => {
        assigned.set(11, 'teacher');
        await database.collection('domain').insertOne({ _id: 'source', workspaceId: 'teacher' });
        await database.collection('domain.user').insertMany([
            { domainId: 'class', uid: 11, join: true }, { domainId: 'source', uid: 11, join: true },
        ]);
        await acceptance(11, 1, 1, { domainId: 'class', at: '2026-10-23T02:00:00Z' });
        await acceptance(11, 1, 1, { domainId: 'class', at: '2026-10-24T02:00:00Z' });
        const contest = await competition(11, [1], { domainId: 'source', allDomains: true }, { entryDomainId: 'class' });
        await acceptance(11, 1, 1, { domainId: 'source', contest: contest.docId });
        assert.equal(streak(await sync(11, modern)).progress, 3);
        assert.equal(streak(await sync(11, { _id: 'source', workspaceId: 'teacher' })).progress, 0);
        assert.deepEqual(await sync(11, legacy), []);
        assert.deepEqual(await sync(11, { _id: 'other', workspaceId: 'other' }), []);
        assert.equal(await database.collection('achievement.day').countDocuments({ scope: 'domain:class', uid: 11 }), 3);
        assert.equal(await database.collection('achievement.day').countDocuments({ scope: 'domain:source', uid: 11 }), 0);
    });

    it('imports all one hundred days of the same problem and grants all fourteen historical tiers', async () => {
        for (let offset = 0; offset < 100; offset++) {
            await acceptance(11, 1, 1, { at: new Date(Date.parse('2026-06-01T02:00:00Z') + offset * 86400000).toISOString() });
        }
        const rows = await sync();
        assert.equal(rows.filter((item) => item.category === 'streak' && item.unlocked && item.historical).length, 14);
        assert.equal(streak(rows).progress, 100);
        assert.equal(streak(rows).nextAcProgress, 1);
        assert.equal(await database.collection('achievement.day').countDocuments({ uid: 11 }), 100);
        assert.equal(await database.collection('achievement.solved').countDocuments({ uid: 11 }), 1);
        assert.deepEqual(await pending(), []);
    });

    it('deduplicates concurrent daily imports and awards one new streak notification', async () => {
        await acceptance(11, 1, 1, { at: '2026-10-24T02:00:00Z' });
        await acceptance(11, 1, 1, { at: '2026-10-25T02:00:00Z' });
        const third = await acceptance(11, 1, 1, { at: '2026-10-26T02:00:00Z' });
        await Promise.all(Array.from({ length: 8 }, () => sync(11, legacy, { record: third, now: new Date('2026-10-26T03:00:00Z') })));
        assert.equal(await database.collection('achievement.day').countDocuments({ uid: 11 }), 3);
        assert.equal(await database.collection('achievement.unlock').countDocuments({ uid: 11, achievementId: 'streak-3' }), 1);
        assert.deepEqual((await pending()).filter((item) => item.category === 'streak').map((item) => item.id), ['streak-3']);
    });

    it('filters displayable pending IDs before the batch limit without consuming missing artwork or crossing scope', async () => {
        const candidates = ACHIEVEMENT_CATALOG.filter((item) => item.category === 'streak');
        await database.collection('achievement.unlock').insertMany(candidates.map((item, index) => ({
            _id: `pending-${index}`, scope: 'legacy', uid: 11, achievementId: item.id,
            unlockedAt: new Date(+now + index * 1000), historical: false, pending: true,
        })));
        const result = await engine.getPendingAchievements(ctx, legacy, 11, 10, ['streak-100', 'invalid', 'streak-100']);
        assert.deepEqual(result.map((item) => item.id), ['streak-100']);
        assert.equal((await pending()).length, 1);
        assert.equal(result[0].seriesId, 'streak');
        assert.equal(result[0].seriesRank, 100);
        assert.deepEqual(await engine.getPendingAchievements(ctx, legacy, 11, 10, ['streak-90']), [],
            'Unavailable top-tier artwork must not fall back to an obsolete lower-tier image');
        assert.deepEqual(await engine.getPendingAchievements(ctx, legacy, 11, 10, []), []);
        assert.deepEqual(await engine.getPendingAchievements(ctx, legacy, 11, 10, ['invalid']), []);
        assert.deepEqual(await engine.getPendingAchievements(ctx, legacy, 12, 10, ['streak-100']), []);
        assert.deepEqual(await engine.getPendingAchievements(ctx, modern, 11, 10, ['streak-100']), []);
        assert.equal(await database.collection('achievement.unlock').countDocuments({ uid: 11, pending: true }), 14);
        await engine.acknowledgeAchievements(ctx, legacy, 11, ['streak-100']);
        assert.deepEqual(await engine.getPendingAchievements(ctx, legacy, 11, 10, ['streak-100']), []);
        assert.equal(await database.collection('achievement.unlock').countDocuments({ uid: 11, pending: true }), 0);
        assert.equal(await database.collection('achievement.unlock').countDocuments({ uid: 11 }), 14, 'all earned levels remain in history');
    });
});

describe('highest earned achievement announcements', () => {
    const seed = (ids, uid = 11, scope = 'legacy') => database.collection('achievement.unlock').insertMany(ids.map((achievementId, index) => ({
        _id: `${scope}:${uid}:${achievementId}`, scope, uid, achievementId, historical: false, pending: true,
        unlockedAt: new Date(+now + index * 1000),
    })));

    it('a same-sync multi-tier streak grants history but announces only the highest earned tier', async () => {
        for (let day = 25; day <= 31; day++) await acceptance(11, 1, 4, { at: `2026-10-${day}T02:00:00Z` });
        const rows = await sync(11, legacy, { now: new Date('2026-10-31T03:00:00Z') });
        assert.ok(unlocked(rows).includes('streak-3'));
        assert.ok(unlocked(rows).includes('streak-7'));
        assert.deepEqual((await pending()).filter((item) => item.category === 'streak').map((item) => item.id), ['streak-7']);
        const lower = await database.collection('achievement.unlock').findOne({ uid: 11, achievementId: 'streak-3' });
        assert.equal(lower.pending, false);
        assert.equal(lower.supersededBy, 'streak-7');
        assert.ok(lower.supersededAt instanceof Date);
        assert.equal(lower.acknowledgedAt, undefined, 'suppressed artwork is not recorded as viewed by the student');
    });

    it('ranks all earned grants before artwork and pending filters, including acknowledged and historical higher tiers', async () => {
        await seed(['solved-10', 'solved-100', 'points-1000', 'points-3000', 'mastery-4-10', 'mastery-5-10']);
        await database.collection('achievement.unlock').updateOne({ achievementId: 'solved-100' }, {
            $set: { pending: false, acknowledgedAt: now },
        });
        await database.collection('achievement.unlock').updateOne({ achievementId: 'points-3000' }, {
            $set: { pending: false, historical: true },
        });
        assert.deepEqual((await pending()).map((item) => item.id), ['mastery-4-10', 'mastery-5-10']);
        assert.deepEqual(await engine.getPendingAchievements(ctx, legacy, 11, 10, ['solved-10', 'points-1000']), []);
        assert.deepEqual((await pending()).map((item) => item.seriesId), ['mastery-4', 'mastery-5']);
    });

    it('applies the batch limit after ranking so old lower-tier backlog cannot starve other series', async () => {
        await seed(ACHIEVEMENT_CATALOG.map((item) => item.id));
        const first = await pending(11, legacy, 1000);
        assert.equal(first.length, 10);
        assert.equal(new Set(first.map((item) => item.seriesId)).size, 10);
        assert.equal(first[0].id, 'difficulty-10');
        assert.equal(first[0].seriesRank, 10);
        assert.equal(first[1].id, 'solved-1000');
        await engine.acknowledgeAchievements(ctx, legacy, 11, first.map((item) => item.id));
        const next = await pending();
        assert.equal(next.length, 4);
        assert.ok(next.every((item) => !first.some((seen) => seen.seriesId === item.seriesId)));
        assert.equal(await database.collection('achievement.unlock').countDocuments({ uid: 11 }), 87);
    });

    it('acknowledgements cannot use unearned high IDs or another scope to silence a real pending reward', async () => {
        await seed(['solved-10', 'mastery-4-10', 'mastery-5-10']);
        await seed(['solved-100'], 12);
        await seed(['solved-100'], 11, 'domain:class');
        await engine.acknowledgeAchievements(ctx, legacy, 11, ['solved-100', 'mastery-4-100']);
        assert.deepEqual((await pending()).map((item) => item.id), ['solved-10', 'mastery-4-10', 'mastery-5-10']);
        await engine.acknowledgeAchievements(ctx, modern, 11, ['solved-100']);
        assert.ok((await pending()).some((item) => item.id === 'solved-10'));
        await engine.acknowledgeAchievements(ctx, legacy, 11, ['mastery-4-10']);
        assert.ok((await pending()).some((item) => item.id === 'mastery-5-10'));
        assert.equal((await pending(12))[0].id, 'solved-100');
    });

    it('later lower-difficulty ACs remain earned but never replace or reannounce an already acknowledged higher difficulty', async () => {
        const higher = await acceptance(11, 1, 8);
        await sync(11, legacy, { record: higher });
        await engine.acknowledgeAchievements(ctx, legacy, 11, ['difficulty-8']);
        const lower = await acceptance(11, 2, 1, { at: '2026-10-25T13:00:00Z' });
        const rows = await sync(11, legacy, { record: lower, now: new Date('2026-10-25T14:00:00Z') });
        assert.ok(unlocked(rows).includes('difficulty-1'));
        assert.ok(unlocked(rows).includes('difficulty-8'));
        assert.deepEqual(await pending(), []);
        assert.equal((await database.collection('achievement.unlock').findOne({ uid: 11, achievementId: 'difficulty-1' })).supersededBy,
            'difficulty-8');
    });
});

describe('seven-day distinct AC milestones', () => {
    it('uses exactly seven Beijing calendar dates and retains a repeated problem when its older AC leaves the window', async () => {
        await acceptance(11, 1, 1, { at: '2026-10-18T16:00:00Z' }); // Beijing October 19: A, C.
        await acceptance(11, 3, 1, { at: '2026-10-18T16:00:01Z' });
        await acceptance(11, 1, 1, { at: '2026-10-24T16:00:00Z' }); // October 25: A remains in-window.
        await acceptance(11, 2, 1, { at: '2026-10-25T15:59:59Z' }); // Still October 25: A, B, C in seven dates.
        let rows = await sync(11, legacy, { now: new Date('2026-10-25T15:59:59Z') });
        assert.equal(weekly(rows).progress, 3);
        assert.equal(weekly(rows).currentWindowProgress, 3);
        rows = await sync(11, legacy, { now: new Date('2026-10-25T16:00:00Z') }); // October 26 drops C, keeps newer A and B.
        assert.equal(weekly(rows).progress, 3, 'Historical best survives the rolling window moving on');
        assert.equal(weekly(rows).currentWindowProgress, 2);
    });

    it('five distinct ACs on one day earn the first weekly milestone without requiring daily ACs', async () => {
        for (let pid = 1; pid <= 5; pid++) await acceptance(11, pid, 4, { hidden: true });
        for (let repeat = 0; repeat < 8; repeat++) await acceptance(11, 1, 4, { hidden: true });
        const rows = await sync();
        assert.equal(weekly(rows, 5).unlocked, true);
        assert.equal(weekly(rows).progress, 5);
        assert.equal(weekly(rows).currentWindowProgress, 5);
        assert.equal(streak(rows).progress, 1);
        assert.equal(await database.collection('achievement.weekly').countDocuments({ uid: 11 }), 5);
        assert.deepEqual((await pending()).filter((row) => row.category === 'weekly_ac').map((row) => row.id), ['weekly-ac-5']);
    });

    it('upgrades V3 with all raw repeat AC days once, then uses the judge watermark and keeps the historical record permanently', async () => {
        for (let pid = 1; pid <= 5; pid++) {
            await acceptance(11, pid, 1, { at: new Date(Date.parse('2026-01-01T02:00:00Z') + pid * 10 * 86400000).toISOString() });
            await acceptance(11, pid, 1, { at: '2026-10-24T02:00:00Z' });
        }
        const stateId = createHash('sha256').update(JSON.stringify(['user', 'legacy', 11])).digest('hex');
        await database.collection('achievement.state').insertOne({ _id: stateId, scope: 'legacy', uid: 11, version: 3, importedAt: now });
        const queries = [];
        const probeCtx = { db: { collection(name) {
            const coll = database.collection(name);
            return name === 'record' ? new Proxy(coll, { get(target, property) {
                if (property === 'find') return (query, options) => { queries.push(query); return target.find(query, options); };
                const value = Reflect.get(target, property);
                return typeof value === 'function' ? value.bind(target) : value;
            } }) : coll;
        } } };
        let rows = await engine.syncUserAchievements(probeCtx, legacy, 11, { now });
        assert.equal(weekly(rows).progress, 5, 'Later repeated ACs restore a dense week even though original first ACs were far apart');
        assert.equal(weekly(rows, 5).historical, true);
        assert.equal(queries.find((query) => query.status === STATUS.STATUS_ACCEPTED).judgeAt, undefined);
        assert.equal(await database.collection('achievement.weekly').countDocuments({ uid: 11 }), 10);
        queries.length = 0;
        rows = await engine.syncUserAchievements(probeCtx, legacy, 11, { now: new Date('2026-11-10T02:00:00Z') });
        assert.equal(+queries.find((query) => query.status === STATUS.STATUS_ACCEPTED).judgeAt.$gte, +now - 60000);
        assert.equal(weekly(rows).progress, 5);
        assert.equal(weekly(rows).currentWindowProgress, 0);
        await database.collection('record').updateMany({ uid: 11 }, { $set: { status: STATUS.STATUS_WRONG_ANSWER } });
        rows = await sync(11, legacy, { now: new Date('2026-11-11T02:00:00Z') });
        assert.equal(weekly(rows, 5).unlocked, true);
        assert.equal((await database.collection('achievement.state').findOne({ _id: stateId })).weeklyBest, 5);
    });

    it('uses submission date across delayed judging and rejudges, but never grants before the verdict exists', async () => {
        const record = await acceptance(11, 1, 1, { at: '2024-02-29T15:59:59Z' }); // Beijing leap day.
        await database.collection('record').updateOne({ _id: record._id }, { $set: { judgeAt: new Date('2024-03-01T02:00:00Z') } });
        let rows = await sync(11, legacy, { now: new Date('2024-02-29T16:00:00Z') });
        assert.equal(weekly(rows).progress, 0);
        rows = await sync(11, legacy, { now: new Date('2024-03-01T03:00:00Z') });
        assert.equal(weekly(rows).progress, 1);
        const ledger = await database.collection('achievement.weekly').findOne({ uid: 11 });
        assert.equal(new Date(ledger.day * 86400000).toISOString().slice(0, 10), '2024-02-29');
        await database.collection('record').updateOne({ _id: record._id }, { $set: { judgeAt: new Date('2024-03-08T02:00:00Z') } });
        rows = await sync(11, legacy, { now: new Date('2024-03-08T03:00:00Z'), record });
        assert.equal(weekly(rows).currentWindowProgress, 0, 'Rejudging cannot move the original submission into a new week');
        assert.equal(await database.collection('achievement.weekly').countDocuments({ uid: 11 }), 1);
    });

    it('includes hidden formal and post-contest practice ACs, deduplicates the same problem, and excludes generated or non-code records', async () => {
        const contest = await competition(11, [1, 2, 3], { hideScoreboard: true, keepScoreboardHidden: true });
        await acceptance(11, 1, 4, { hidden: true });
        await acceptance(11, 1, 4, { contest: contest.docId, hidden: true });
        await acceptance(11, 1, 4, { practiceContest: contest.docId, hidden: true });
        await acceptance(11, 2, 4, { practiceContest: contest.docId, hidden: true });
        await acceptance(11, 1, 4, { domainId: 'python' });
        await acceptance(11, 1, 4, { domainId: 'other' });
        await acceptance(12, 99, 4);
        await acceptance(11, 4, 4, { contest: new ObjectId('000000000000000000000000') });
        await acceptance(11, 5, 4, { objectiveKind: 'choice' });
        const hack = await acceptance(11, 6, 4);
        await database.collection('record').updateOne({ _id: hack._id }, { $set: { hackTarget: new ObjectId() } });
        const wrong = await acceptance(11, 7, 4);
        await database.collection('record').updateOne({ _id: wrong._id }, { $set: { status: STATUS.STATUS_WRONG_ANSWER } });
        const rows = await sync();
        assert.equal(weekly(rows).progress, 3, 'system/1, system/2 and python/1 are three distinct problems');
        assert.equal(weekly(await sync(12)).progress, 1);
        assert.equal(weekly(await sync(11, modern))?.progress, undefined, 'Another workspace has no authority to import these ACs');
    });

    it('silently backfills all added thresholds at their rollout clock, then announces only a newly earned higher tier', async () => {
        const rollout = new Date('2026-10-26T00:00:00Z');
        await database.collection('achievement.state').updateOne({ _id: 'catalog-expansion-activation' }, { $set: { activatedAt: rollout } });
        const contest = await competition(11, Array.from({ length: 30 }, (_, index) => index + 1));
        for (let pid = 1; pid <= 30; pid++) await acceptance(11, pid, 4, { contest: contest.docId });
        let rows = await sync(11, legacy, { now: new Date('2026-10-26T01:00:00Z') });
        for (const id of ['solved-30', 'contest-ac-5', 'contest-ac-20', 'contest-ac-30', 'weekly-ac-5', 'weekly-ac-30']) {
            assert.equal(rows.find((row) => row.id === id).historical, true, id);
        }
        assert.equal((await pending()).some((row) => ACHIEVEMENT_EXPANSION_IDS.has(row.id)), false);
        for (let pid = 31; pid <= 40; pid++) await acceptance(11, pid, 4, { at: '2026-10-26T02:00:00Z' });
        rows = await sync(11, legacy, { now: new Date('2026-10-26T03:00:00Z') });
        assert.equal(weekly(rows, 40).unlocked, true);
        assert.equal(weekly(rows, 40).historical, false);
        assert.deepEqual((await pending()).filter((row) => row.category === 'weekly_ac').map((row) => row.id), ['weekly-ac-40']);
        assert.equal(+await engine.initializeAchievementExpansion(ctx), +rollout);
    });
});

describe('post-deadline contest practice remains ordinary achievement progress', () => {
    it('counts practice AC days and difficulty but never competition awards, including after extending the deadline', async () => {
        const contest = await competition(11, [1, 2, 3], {
            duration: 2, beginAt: new Date('2026-10-20T01:00:00Z'), endAt: new Date('2026-10-23T03:00:00Z'),
        }, { startAt: new Date('2026-10-20T01:00:00Z') });
        await acceptance(11, 1, 4, { contest: contest.docId, at: '2026-10-20T02:00:00Z' });
        const practices = [];
        for (const [index, day] of ['23', '24', '25'].entries()) {
            practices.push(await acceptance(11, index + 1, 4, {
                practiceContest: contest.docId, practiceEntryDomain: 'system', hidden: true,
                at: `2026-10-${day}T04:00:00Z`,
            }));
        }
        let rows = await sync();
        assert.ok(unlocked(rows).includes('difficulty-4'));
        assert.ok(unlocked(rows).includes('streak-3'));
        assert.equal(rows.find((item) => item.id === 'solved-10').progress, 3);
        assert.equal(rows.find((item) => item.id === 'contest-ac-10').progress, 1);
        assert.ok(!unlocked(rows).includes('contest-ak-1'));
        await database.collection('document').updateOne({ docType: 30, docId: contest.docId }, {
            $set: { duration: 1000, endAt: new Date('2026-12-01T00:00:00Z') },
        });
        await database.collection('record').updateOne({ _id: practices[2]._id }, { $set: { judgeAt: now } });
        rows = await sync(11, legacy, { record: practices[2] });
        assert.equal(rows.find((item) => item.id === 'contest-ac-10').progress, 1);
        assert.ok(!unlocked(rows).includes('contest-ak-1'));
        assert.equal(await database.collection('achievement.solved').countDocuments({ uid: 11, practiceContestId: String(contest.docId), contestId: '' }), 3);
    });

    it('attributes shared practice only to its authorized entry domain and keeps it out of contest achievements', async () => {
        assigned.set(11, 'teacher');
        const source = { _id: 'source', workspaceId: 'teacher', owner: 91 };
        await database.collection('domain').insertOne(source);
        await database.collection('domain.user').insertMany([
            { domainId: 'class', uid: 11, join: true }, { domainId: 'source', uid: 11, join: true },
        ]);
        const contest = await competition(11, [1], {
            domainId: 'source', allDomains: true, duration: 2,
            beginAt: new Date('2026-10-20T01:00:00Z'), endAt: new Date('2026-10-21T03:00:00Z'),
        }, { entryDomainId: 'class', startAt: new Date('2026-10-20T01:00:00Z') });
        let latest;
        for (const day of ['23', '24', '25']) {
            latest = await acceptance(11, 1, 5, {
                domainId: 'source', practiceContest: contest.docId, practiceEntryDomain: 'class',
                at: `2026-10-${day}T02:00:00Z`, hidden: true,
            });
        }
        await engine.recordAchievementAcceptance(ctx, latest);
        const rows = await sync(11, modern);
        assert.ok(unlocked(rows).includes('difficulty-5'));
        assert.ok(unlocked(rows).includes('streak-3'));
        assert.equal(rows.find((item) => item.id === 'solved-10').progress, 1);
        assert.equal(rows.find((item) => item.id === 'contest-ac-1').progress, 0);
        assert.equal(rows.find((item) => item.id === 'contest-ak-1').progress, 0);
        assert.deepEqual(unlocked(await sync(11, source)), []);
        assert.equal(await database.collection('achievement.day').countDocuments({ uid: 11, scope: 'domain:class' }), 3);
        assert.equal(await database.collection('achievement.day').countDocuments({ uid: 11, scope: 'domain:source' }), 0);
        assert.equal(weekly(rows).progress, 1, 'Three AC dates for the same shared problem still contribute one weekly problem');
        assert.equal(await database.collection('achievement.weekly').countDocuments({ uid: 11, scope: 'domain:class' }), 3);
        assert.equal(await database.collection('achievement.weekly').countDocuments({ uid: 11, scope: 'domain:source' }), 0);
        await database.collection('document.status').updateOne({ docType: 30, docId: contest.docId, uid: 11 }, {
            $set: { entryDomainId: 'source' },
        });
        assert.deepEqual(unlocked(await sync(11, source)), [], 'historical practice stays with the stored authorized entry');
    });

    it('does not double-count a library problem solved both in ordinary practice and post-contest practice', async () => {
        const contest = await competition(11, Array.from({ length: 10 }, (_, i) => i + 1), { duration: 2 });
        for (let pid = 1; pid <= 10; pid++) {
            await acceptance(11, pid, 4, { practiceContest: contest.docId, practiceEntryDomain: 'system' });
            await acceptance(11, pid, 4);
        }
        const rows = await sync();
        assert.ok(unlocked(rows).includes('solved-10'));
        assert.equal(rows.find((item) => item.id === 'solved-100').progress, 10);
        assert.equal(rows.find((item) => item.id === 'mastery-4-50').progress, 10);
        assert.equal(rows.find((item) => item.id === 'contest-ac-1').progress, 0);
        assert.equal(rows.find((item) => item.id === 'contest-ak-1').progress, 0);
        assert.equal(weekly(rows).progress, 10, 'Ordinary and practice submissions of each problem deduplicate together');
    });
});
