const assert = require('node:assert/strict');
const Module = require('node:module');
const { before, beforeEach, after, describe, it } = require('node:test');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { STATUS } = require('@hydrooj/common');
const { ACHIEVEMENT_CATALOG, evaluateAchievementProgress } = require('../packages/hydrooj/src/lib/achievement_catalog');

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
});

function rid(time) {
    const id = new ObjectId();
    return new ObjectId(`${Math.floor(new Date(time).getTime() / 1000).toString(16).padStart(8, '0')}${id.toString().slice(8)}`);
}
async function acceptance(uid, pid, difficulty, options = {}) {
    const domainId = options.domainId || 'system';
    const at = options.at || '2026-10-25T02:00:00Z';
    await database.collection('document').updateOne({ domainId, docType: 10, docId: pid }, {
        $set: { difficulty, ...(options.objectiveKind ? { objectiveKind: options.objectiveKind } : {}) },
    }, { upsert: true });
    const record = {
        _id: rid(at), uid, pid, domainId, status: STATUS.STATUS_ACCEPTED, judgeAt: new Date(at),
        ...(options.contest ? { contest: options.contest } : {}),
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

describe('achievement catalog', () => {
    it('contains the exact 50 named milestones and no duplicate identifier', () => {
        assert.equal(ACHIEVEMENT_CATALOG.length, 50);
        assert.equal(new Set(ACHIEVEMENT_CATALOG.map((item) => item.id)).size, 50);
        assert.deepEqual(ACHIEVEMENT_CATALOG.slice(0, 10).map((item) => item.name),
            ['初战告捷', '渐入佳境', '锋芒初露', '势如破竹', '强者进阶', '烈火淬锋', '破境而上', '登峰造极', '傲视群雄', '巅峰封神']);
        assert.equal(ACHIEVEMENT_CATALOG.at(-1).name, '神域之主');
        assert.equal(ACHIEVEMENT_CATALOG.find((item) => item.id === 'solved-1000').name, '千题封神');
    });
    it('awards each threshold exactly at its boundary', () => {
        for (const item of ACHIEVEMENT_CATALOG) {
            const make = (value) => ({
                solved: item.category === 'solved' ? value : 0,
                difficulties: item.difficulty ? { [item.difficulty]: value } : {},
                contestAc: item.category === 'contest_ac' ? value : 0,
                contestAk: item.category === 'contest_ak' ? value : 0,
                points: item.category === 'points' ? value : 0,
            });
            assert.equal(evaluateAchievementProgress(make(item.target - 1)).find((row) => row.id === item.id).achieved, false, item.id);
            assert.equal(evaluateAchievementProgress(make(item.target)).find((row) => row.id === item.id).achieved, true, item.id);
        }
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
        assert.deepEqual(unlocked(rows), ['solved-10']);
        assert.equal(rows.filter((item) => item.category === 'difficulty').every((item) => item.progress === 0), true);
        const snapshots = await database.collection('achievement.solved').find({ uid: 11 }).toArray();
        assert.equal(snapshots.length, 10);
        assert.equal(snapshots.every((item) => item.difficulty === 0), true);
        await database.collection('document').updateMany({ domainId: 'system', docType: 10 }, { $set: { difficulty: 10 } });
        assert.deepEqual(unlocked(await sync()), ['solved-10']);
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
            [{}, { attend: 0 }, '2026-10-25T02:00:00Z'],
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

    it('reveals neither solves nor earned-point thresholds from a sealed contest, then settles when published', async () => {
        const contest = await competition(11, [1], { rule: 'oi', keepScoreboardHidden: true });
        await acceptance(11, 1, 8, { contest: contest.docId, scorePointAward: { points: 1500 } });
        await database.collection('user').insertOne({
            _id: 11, lotteryTotalPoints: 1500, lotteryPoints: 1500, contestScorePointAwards: { [contest.docId.toString()]: 1500 },
        });
        assert.deepEqual(unlocked(await sync()), []);
        await database.collection('document').updateOne({ _id: contest._id }, { $set: { keepScoreboardHidden: false } });
        const rows = await sync();
        assert.deepEqual(unlocked(rows), ['difficulty-8', 'contest-ak-1', 'contest-ac-1', 'points-1000']);
        assert.equal((await pending()).length, 4);
    });

    it('settles a completed IOI contest with hidden rankings once its records are public', async () => {
        const contest = await competition(11, [1, 2, 3, 4], { rule: 'ioi', hideScoreboard: true });
        for (const pid of [1, 2, 3]) await acceptance(11, pid, 2, { contest: contest.docId });
        await database.collection('user').insertOne({
            _id: 11, lotteryTotalPoints: 1200, contestScorePointAwards: { [contest.docId.toString()]: 1200 },
        });

        // Import the verdicts while the contest is still running. Ending it must
        // unlock the existing ledger without another submission or a full reimport.
        assert.deepEqual(unlocked(await sync(11, legacy, { now: new Date('2026-10-25T02:30:00Z') })), []);
        const rows = await sync();
        assert.deepEqual(unlocked(rows), ['difficulty-2', 'contest-ac-1', 'points-1000']);
        assert.equal(rows.find((item) => item.id === 'contest-ac-10').progress, 3);
        assert.equal(rows.find((item) => item.id === 'contest-ak-1').progress, 0);
        assert.equal((await pending()).length, 3);
        assert.deepEqual(unlocked(await sync()), unlocked(rows));
        assert.equal((await pending()).length, 3);
    });

    it('keeps hidden-rank contests sealed by the result embargo or scoreboard lock', async () => {
        const contest = await competition(11, [1], { rule: 'oi', hideScoreboard: true, keepScoreboardHidden: true });
        await acceptance(11, 1, 8, { contest: contest.docId });
        assert.deepEqual(unlocked(await sync()), []);

        await database.collection('document').updateOne({ _id: contest._id }, {
            $set: { keepScoreboardHidden: false, lockAt: new Date('2026-10-25T02:30:00Z') },
        });
        assert.deepEqual(unlocked(await sync()), []);

        await database.collection('document').updateOne({ _id: contest._id }, { $set: { unlocked: true } });
        assert.deepEqual(unlocked(await sync()), ['difficulty-8', 'contest-ak-1', 'contest-ac-1']);
    });

    it('ignores a running contest even when it already has a visible partial scoreboard', async () => {
        const contest = await competition(11, [1], { endAt: new Date('2026-10-26T00:00:00Z') });
        await acceptance(11, 1, 9, { contest: contest.docId });
        assert.deepEqual(unlocked(await sync()), []);
    });

    it('does not expose cached score-point awards when a sealed contest document was deleted', async () => {
        const tid = new ObjectId();
        await database.collection('user').insertOne({
            _id: 11, lotteryTotalPoints: 1500, contestScorePointAwards: { [tid.toString()]: 1500 },
        });
        await acceptance(11, 1, 8, { contest: tid, scorePointAward: { points: 1500 } });
        assert.deepEqual(unlocked(await sync()), []);
        assert.deepEqual(await pending(), []);
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
        assert.equal(await database.collection('achievement.unlock').countDocuments({ uid: 11 }), 11);
        assert.equal((await pending(11, legacy, 1000)).length, 10);
        await engine.acknowledgeAchievements(ctx, legacy, 12, ['difficulty-1', 'difficulty-2']);
        assert.ok((await pending()).some((item) => item.id === 'difficulty-1'));
        assert.equal((await pending(12)).length, 0);
        await engine.acknowledgeAchievements(ctx, legacy, 11, ['difficulty-1']);
        await sync();
        assert.ok(!(await pending()).some((item) => item.id === 'difficulty-1'));
    });
});
