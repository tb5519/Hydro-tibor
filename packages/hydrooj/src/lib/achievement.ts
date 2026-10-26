/* eslint-disable no-await-in-loop -- User ledgers are serialized and imported in stable first-AC order. */
import { createHash } from 'crypto';
import { Collection, ObjectId } from 'mongodb';
import { STATUS } from '@hydrooj/common';
import { Logger } from '@hydrooj/utils';
import type { Context } from '../context';
import type { DomainDoc, ProblemDoc, RecordDoc } from '../interface';
import type { DailyQuizSession } from '../model/daily_quiz';
import workspace from '../model/workspace';
import {
    ACHIEVEMENT_CATALOG, AchievementMetrics, evaluateAchievementProgress,
} from './achievement_catalog';

type AchievementDomain = Pick<DomainDoc, '_id' | 'workspaceId' | 'owner'>;
const LEASE_MS = 120_000;
const MAX_PENDING = 10;
const STATE_VERSION = 3;
const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MS = 8 * 3600_000;
const logger = new Logger('achievement');

interface SolvedAchievement {
    _id: string;
    scope: string;
    uid: number;
    domainId: string;
    pid: number;
    contestId: string;
    /** Practice retains its source for shared-domain access, never for competition credit. */
    practiceContestId?: string;
    rid: ObjectId;
    difficulty: number;
    acceptedAt: Date;
    submittedAt: Date;
}

interface AchievementUnlock {
    _id: string;
    scope: string;
    uid: number;
    achievementId: string;
    unlockedAt: Date;
    historical: boolean;
    pending: boolean;
    acknowledgedAt?: Date;
}

interface AchievementDay {
    _id: string;
    scope: string;
    uid: number;
    domainId: string;
    contestId: string;
    practiceContestId?: string;
    /** UTC day number shifted to the fixed Beijing UTC+8 calendar. */
    day: number;
    acceptedAt: Date;
}

interface AchievementState {
    _id: string;
    scope?: string;
    uid?: number;
    activatedAt?: Date;
    baselinePoints?: number;
    pointSource?: 'account' | 'legacy';
    importedAt?: Date;
    version?: number;
    lease?: { owner: string, expiresAt: Date };
}

declare module '../service/db' {
    interface Collections {
        'achievement.solved': SolvedAchievement;
        'achievement.day': AchievementDay;
        'achievement.unlock': AchievementUnlock;
        'achievement.state': AchievementState;
    }
}

function hash(parts: unknown[]) {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function nonnegative(value: unknown) {
    return Number.isFinite(+value) ? Math.max(0, Math.floor(+value)) : 0;
}

function achievementDifficulty(value: unknown) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10 ? value : 0;
}

export function getAchievementScope(domain: Pick<DomainDoc, '_id' | 'workspaceId'>) {
    return workspace.resolveDomainWorkspaceId(domain) === workspace.LEGACY_WORKSPACE_ID ? 'legacy' : `domain:${domain._id}`;
}

export async function canViewUserAchievements(ctx: Context, domain: AchievementDomain, uid: number) {
    if (!Number.isSafeInteger(uid) || uid <= 1) return false;
    const workspaceId = workspace.resolveDomainWorkspaceId(domain);
    if (await workspace.isAssignedToOtherWorkspace(uid, workspaceId)) return false;
    if (workspaceId === workspace.LEGACY_WORKSPACE_ID) return true;
    return domain.owner === uid || !!await ctx.db.collection('domain.user').findOne({ domainId: domain._id, uid, join: true });
}

async function initializeAchievementClock(ctx: Context, id: string) {
    const coll = ctx.db.collection('achievement.state');
    try {
        await coll.updateOne({ _id: id }, { $setOnInsert: { activatedAt: new Date() } }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
    return (await coll.findOne({ _id: id }))!.activatedAt!;
}

export function initializeAchievementSystem(ctx: Context) { return initializeAchievementClock(ctx, 'activation'); }

/** New streak milestones have their own rollout baseline; the original fifty keep theirs. */
export function initializeStreakAchievements(ctx: Context) { return initializeAchievementClock(ctx, 'streak-activation'); }

async function withUserLock<T>(ctx: Context, scope: string, uid: number, callback: () => Promise<T>) {
    const coll = ctx.db.collection('achievement.state');
    const _id = hash(['user', scope, uid]);
    const owner = new ObjectId().toHexString();
    try {
        await coll.updateOne({ _id }, { $setOnInsert: { scope, uid } }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
    const deadline = Date.now() + 30_000;
    while (true) {
        const result = await coll.findOneAndUpdate({
            _id, $or: [{ lease: { $exists: false } }, { 'lease.expiresAt': { $lte: new Date() } }],
        }, { $set: { lease: { owner, expiresAt: new Date(Date.now() + LEASE_MS) } } }, { returnDocument: 'after' });
        if (result?.lease?.owner === owner) break;
        if (Date.now() >= deadline) throw new Error('Achievement update is busy; retry shortly.');
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    // Large first imports retain their lease, even across multiple application workers.
    const heartbeat = setInterval(() => {
        coll.updateOne({ _id, 'lease.owner': owner }, { $set: { 'lease.expiresAt': new Date(Date.now() + LEASE_MS) } }).catch(() => {});
    }, LEASE_MS / 3);
    heartbeat.unref?.();
    try {
        return await callback();
    } finally {
        clearInterval(heartbeat);
        await coll.updateOne({ _id, 'lease.owner': owner }, { $unset: { lease: '' } });
    }
}

export function isAchievementCompetition(contest: any, participant: any) {
    return !!contest && ['acm', 'oi', 'ioi', 'ledo', 'strictioi'].includes(contest.rule)
        && !!participant?.attend && !participant.unrank && !participant.virtual && !participant.practice
        && Array.isArray(contest.pids) && contest.pids.length > 0;
}

export function isAchievementContestSubmission(contest: any, participant: any, solved: Pick<SolvedAchievement, 'submittedAt' | 'pid'>) {
    if (!isAchievementCompetition(contest, participant) || !contest.pids.includes(solved.pid)) return false;
    const start = Math.max(new Date(contest.beginAt).getTime(), participant.startAt ? new Date(participant.startAt).getTime() : 0);
    const deadlines = [new Date(contest.endAt).getTime()];
    if (participant.endAt) deadlines.push(new Date(participant.endAt).getTime());
    if (contest.duration && participant.startAt) deadlines.push(new Date(participant.startAt).getTime() + contest.duration * 3600_000);
    return solved.submittedAt.getTime() >= start && solved.submittedAt.getTime() <= Math.min(...deadlines);
}

async function getScopeData(ctx: Context, domain: AchievementDomain, uid: number) {
    const legacy = getAchievementScope(domain) === 'legacy';
    const domains = legacy ? await workspace.getDomains(workspace.LEGACY_WORKSPACE_ID) : [domain];
    const domainIds = domains.map((item) => item._id);
    const allLocalStatuses = await (ctx.db.collection('document.status') as Collection<any>).find({
        docType: 30, uid, domainId: { $in: domainIds },
    }).toArray();
    const redirected = legacy ? [] : allLocalStatuses.filter((item) => item.entryDomainId && item.entryDomainId !== domain._id);
    const localStatuses = allLocalStatuses.filter((item) => !redirected.includes(item));
    const sharedStatuses = legacy ? [] : await (ctx.db.collection('document.status') as Collection<any>).find({
        docType: 30, uid, entryDomainId: domain._id, domainId: { $nin: domainIds }, attend: { $gt: 0 },
    }).toArray();
    const sourceIds = [...new Set(sharedStatuses.map((item) => item.domainId))];
    const sourceDomains = sourceIds.length ? await ctx.db.collection('domain').find({ _id: { $in: sourceIds } }).toArray() : [];
    const allowedSources = new Set(sourceDomains.filter((source) => (
        workspace.resolveDomainWorkspaceId(source) === workspace.resolveDomainWorkspaceId(domain)
    )).map((source) => source._id));
    const shared = sharedStatuses.filter((item) => allowedSources.has(item.domainId));
    const localContestFilter = { domainId: { $in: domainIds }, docId: { $in: localStatuses.map((item) => item.docId) } };
    const contestFilter = shared.length ? {
        $or: [localContestFilter, ...shared.map((item) => ({ domainId: item.domainId, docId: item.docId, allDomains: true }))],
    } : localContestFilter;
    const contests = await (ctx.db.collection('document') as Collection<any>).find({ docType: 30, ...contestFilter }).toArray();
    const contestIds = new Set(contests.map((item) => `${item.domainId}:${item.docId}`));
    const sharedRecords = shared.filter((item) => contestIds.has(`${item.domainId}:${item.docId}`));
    const localRecordScope = {
        domainId: { $in: domainIds }, ...(redirected.length ? { contest: { $nin: redirected.map((item) => item.docId) } } : {}),
        ...(!legacy ? { $or: [{ practiceEntryDomain: { $exists: false } }, { practiceEntryDomain: domain._id }] } : {}),
    };
    const recordScope = sharedRecords.length ? {
        $or: [localRecordScope, ...sharedRecords.map((item) => ({
            domainId: item.domainId,
            $or: [{ contest: item.docId }, { practiceContest: item.docId, practiceEntryDomain: domain._id }],
        }))],
    } : localRecordScope;
    const statuses = [...localStatuses, ...sharedRecords];
    return {
        domainIds, recordScope, contests,
        contestsById: new Map(contests.map((item) => [`${item.domainId}:${item.docId}`, item])),
        statusesById: new Map(statuses.map((item) => [`${item.domainId}:${item.docId}`, item])),
    };
}

function isRealAcceptance(record: any) {
    return record?.status === STATUS.STATUS_ACCEPTED && record.pid > 0 && !!record._id
        && !record.contest?.toString().startsWith('0'.repeat(23)) && !record.hackTarget;
}

async function importAcceptances(ctx: Context, scope: string, uid: number, records: any[], problems: Map<string, any>) {
    const collection = ctx.db.collection('achievement.solved');
    const existing = await collection.find({ scope, uid }).sort({ acceptedAt: 1, rid: 1 }).toArray();
    const byId = new Map(existing.map((solved) => [solved._id, solved]));
    const firstDifficulty = new Map<string, number>();
    for (const solved of existing) {
        const key = `${solved.domainId}:${solved.pid}`;
        if (!firstDifficulty.has(key)) firstDifficulty.set(key, solved.difficulty);
    }
    const additions: SolvedAchievement[] = [];
    const time = (record: any) => (record.judgeAt || record._id.getTimestamp()).getTime();
    for (const record of records.sort((left, right) => time(left) - time(right) || `${left._id}`.localeCompare(`${right._id}`))) {
        const key = `${record.domainId}:${record.pid}`;
        const problem = problems.get(key);
        if (!isRealAcceptance(record) || !problem || problem.objectiveKind) continue;
        const practiceContestId = record.practiceContest?.toString();
        const contestId = practiceContestId ? '' : record.contest?.toString() || '';
        const _id = hash(['solve', scope, uid, record.domainId, record.pid, contestId, ...(practiceContestId ? [practiceContestId] : [])]);
        if (byId.has(_id)) continue;
        // Once captured, difficulty is immutable even after edits and rejudges.
        const difficulty = firstDifficulty.get(key) ?? achievementDifficulty(problem.difficulty);
        firstDifficulty.set(key, difficulty);
        const solved: SolvedAchievement = {
            _id, scope, uid, domainId: record.domainId, pid: record.pid, contestId, rid: record._id, difficulty,
            ...(practiceContestId ? { practiceContestId } : {}),
            acceptedAt: record.judgeAt || record._id.getTimestamp(), submittedAt: record._id.getTimestamp(),
        };
        byId.set(_id, solved);
        additions.push(solved);
    }
    if (additions.length) await collection.bulkWrite(additions.map((solved) => ({
        updateOne: { filter: { _id: solved._id }, update: { $setOnInsert: solved }, upsert: true },
    })));
    return [...byId.values()];
}

function beijingDay(time: Date) { return Math.floor((time.getTime() + BEIJING_OFFSET_MS) / DAY_MS); }

/** Import raw AC records: solving the same problem on another day still sustains a streak. */
async function importAchievementDays(ctx: Context, scope: string, uid: number, records: any[], problems: Map<string, any>) {
    const collection = ctx.db.collection('achievement.day');
    const additions = new Map<string, AchievementDay>();
    for (const record of records) {
        const problem = problems.get(`${record.domainId}:${record.pid}`);
        if (!isRealAcceptance(record) || !problem || problem.objectiveKind) continue;
        // An ObjectId retains the original submission instant across every rejudge.
        const submittedAt = record._id.getTimestamp();
        const day = beijingDay(submittedAt);
        const acceptedAt = record.judgeAt || submittedAt;
        const practiceContestId = record.practiceContest?.toString();
        const contestId = practiceContestId ? '' : record.contest?.toString() || '';
        const _id = hash(['day', scope, uid, record.domainId, contestId, day, ...(practiceContestId ? [practiceContestId] : [])]);
        const previous = additions.get(_id);
        if (!previous || previous.acceptedAt > acceptedAt) {
            additions.set(_id, {
                _id, scope, uid, domainId: record.domainId, contestId, day, acceptedAt,
                ...(practiceContestId ? { practiceContestId } : {}),
            });
        }
    }
    if (additions.size) await collection.bulkWrite([...additions.values()].map(({ acceptedAt, ...entry }) => ({
        updateOne: {
            filter: { _id: entry._id }, update: { $setOnInsert: entry, $min: { acceptedAt } }, upsert: true,
        },
    })));
    return collection.find({ scope, uid }).sort({ day: 1 }).toArray();
}

function streakMetrics(days: AchievementDay[], data: Awaited<ReturnType<typeof getScopeData>>, now: Date) {
    const today = beijingDay(now);
    const local = new Set(data.domainIds);
    const available = [...new Set(days.filter((entry) => {
        if (entry.acceptedAt > now || entry.day > today) return false;
        if (local.has(entry.domainId)) return true;
        return !!data.contestsById.get(`${entry.domainId}:${entry.practiceContestId || entry.contestId}`)?.allDomains;
    }).map((entry) => entry.day))].sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    let previous = -Infinity;
    for (const day of available) {
        run = day === previous + 1 ? run + 1 : 1;
        best = Math.max(best, run);
        previous = day;
    }
    // A record today does not add another day; a run ending yesterday can grow
    // by one. Older best runs must never prewarm an unreachable next milestone.
    const next = previous === today ? run : previous === today - 1 ? run + 1 : 1;
    return { streakBest: best, streakNextAc: next };
}

function metricsFromSolves(
    solves: SolvedAchievement[], data: Awaited<ReturnType<typeof getScopeData>>, now: Date, points: number,
): AchievementMetrics {
    const unique = new Map<string, SolvedAchievement>();
    const competition = new Map<string, Set<number>>();
    const domainIds = new Set(data.domainIds);
    for (const solved of solves) {
        if (solved.acceptedAt > now) continue;
        const key = `${solved.domainId}:${solved.practiceContestId || solved.contestId}`;
        const contest = data.contestsById.get(key);
        if (!domainIds.has(solved.domainId) && (!contest || !contest.allDomains)) continue;
        // Every real AC counts toward solving milestones, including hidden
        // problems and active/sealed contests. Competition milestones below
        // still require a known contest and a valid formal submission window.
        const problemKey = `${solved.domainId}:${solved.pid}`;
        if (!unique.has(problemKey) || unique.get(problemKey)!.acceptedAt > solved.acceptedAt) unique.set(problemKey, solved);
        // A later deadline extension or rejudge cannot turn practice into a competition result.
        if (solved.practiceContestId) continue;
        const participant = data.statusesById.get(key);
        if (solved.contestId && isAchievementContestSubmission(contest, participant, solved)) {
            if (!competition.has(key)) competition.set(key, new Set());
            competition.get(key)!.add(solved.pid);
        }
    }
    const difficulties: Record<number, number> = {};
    for (const solved of unique.values()) difficulties[solved.difficulty] = (difficulties[solved.difficulty] || 0) + 1;
    let contestAc = 0;
    let contestAk = 0;
    for (const [key, accepted] of competition) {
        contestAc += accepted.size;
        if (data.contestsById.get(key).pids.every((pid: number) => accepted.has(pid))) contestAk++;
    }
    return { solved: unique.size, difficulties, contestAc, contestAk, points };
}

async function pointMetrics(ctx: Context, uid: number, data: Awaited<ReturnType<typeof getScopeData>>, activatedAt: Date) {
    const account: any = await ctx.db.collection('user').findOne({ _id: uid }, { projection: {
        lotteryTotalPoints: 1,
    } });
    const source: 'account' | 'legacy' = account?.lotteryTotalPoints === undefined ? 'legacy' : 'account';
    // Old installations stored the explicit lifetime counter on each membership.
    // Never use the spendable balance or RP as evidence of earned points.
    const legacyStates = source === 'legacy' ? await (ctx.db.collection('domain.user') as Collection<any>).find({
        uid, join: true, lotteryTotalPoints: { $exists: true },
    }, { projection: { lotteryTotalPoints: 1 } }).toArray() : [];
    const points = source === 'account' ? nonnegative(account?.lotteryTotalPoints)
        : legacyStates.reduce((sum, state) => sum + nonnegative(state.lotteryTotalPoints), 0);
    // Credited points count immediately, regardless of contest visibility.
    const recentRecords = await (ctx.db.collection('record') as Collection<any>).find({
        uid, ...data.recordScope, judgeAt: { $gt: activatedAt }, 'scorePointAward.points': { $gt: 0 },
    }, { projection: { scorePointAward: 1 } }).toArray();
    let recent = recentRecords.reduce((sum, record) => sum + nonnegative(record.scorePointAward?.points), 0);
    const draws = await (ctx.db.collection('lottery.draw') as Collection<any>).find({
        uid, domainId: { $in: data.domainIds }, createdAt: { $gt: activatedAt }, deleted: { $ne: true },
    }, { projection: { pointDelta: 1, prize: 1 } }).toArray();
    recent += draws.reduce((sum, draw) => sum + nonnegative(draw.pointDelta ?? draw.prize?.pointDelta), 0);
    const sessions = await (ctx.db.collection('daily.quiz.session') as Collection<DailyQuizSession>).find({
        uid, 'items.answer.answeredAt': { $gt: activatedAt },
    }, { projection: { items: 1, settledAnswers: 1 } }).toArray();
    for (const session of sessions) {
        for (const item of (session.items || []).filter((candidate) => candidate.answer).slice(0, session.settledAnswers || 0)) {
            if (data.domainIds.includes(item.domainId) && item.answer?.answeredAt > activatedAt) recent += nonnegative(item.answer.earnedPoints);
        }
    }
    return { points: Math.max(0, points), historicalPoints: Math.max(0, points - recent), source };
}

export interface SyncAchievementOptions {
    /** Default true. Historical thresholds are always silent. */
    notify?: boolean;
    /** The authenticated caller may request immediate completion for their own judged record. */
    record?: RecordDoc;
    /** Judge-time problem snapshot; only accepted for this exact record's problem. */
    problem?: ProblemDoc;
    now?: Date;
}

/** Validate ownership and the current entry-domain scope before revealing even a verdict's readiness. */
export async function getAchievementRecord(ctx: Context, domain: AchievementDomain, uid: number, rid: ObjectId) {
    if (!await canViewUserAchievements(ctx, domain, uid)) return null;
    const data = await getScopeData(ctx, domain, uid);
    return ctx.db.collection('record').findOne({ _id: rid, uid, ...data.recordScope });
}

/** A finalized verdict is broadcast before contest points settle; record/judge supplies this durable barrier. */
export async function isAchievementRecordReady(ctx: Context, record: RecordDoc) {
    if (!record.judgeAt) return false;
    const activatedAt = await initializeAchievementSystem(ctx);
    const judgeAt = new Date(record.judgeAt).getTime();
    const readyAt = (record as RecordDoc & { achievementReadyJudgeAt?: Date }).achievementReadyJudgeAt;
    return judgeAt <= activatedAt.getTime() || !!readyAt && new Date(readyAt).getTime() === judgeAt;
}

export async function syncUserAchievements(ctx: Context, domain: AchievementDomain, uid: number, options: SyncAchievementOptions = {}) {
    if (!await canViewUserAchievements(ctx, domain, uid)) return [];
    const [activatedAt, streakActivatedAt] = await Promise.all([
        initializeAchievementSystem(ctx), initializeStreakAchievements(ctx),
    ]);
    const scope = getAchievementScope(domain);
    return withUserLock(ctx, scope, uid, async () => {
        const now = options.now || new Date();
        const stateId = hash(['user', scope, uid]);
        const state = await ctx.db.collection('achievement.state').findOne({ _id: stateId });
        const data = await getScopeData(ctx, domain, uid);
        const recordColl = ctx.db.collection('record') as Collection<any>;
        const query: any = { uid, ...data.recordScope, status: STATUS.STATUS_ACCEPTED };
        // Keep a one-minute overlap for a result committed during the previous import.
        if (state?.version === STATE_VERSION && state.importedAt) query.judgeAt = { $gte: new Date(state.importedAt.getTime() - 60_000) };
        const records = await recordColl.find(query, { projection: {
            _id: 1, uid: 1, domainId: 1, pid: 1, contest: 1, practiceContest: 1, practiceEntryDomain: 1,
            status: 1, judgeAt: 1, hackTarget: 1,
        } }).sort({ _id: 1 }).toArray();
        const actualRecord = options.record && await recordColl.findOne({ _id: options.record._id, uid, ...data.recordScope });
        if (actualRecord && isRealAcceptance(actualRecord) && !records.some((item) => item._id.equals(actualRecord._id))) records.push(actualRecord);
        const pids = [...new Set(records.filter(isRealAcceptance).map((record) => record.pid))];
        const problemDomains = [...new Set(records.map((record) => record.domainId))];
        const problems = pids.length ? await (ctx.db.collection('document') as Collection<any>).find({
            docType: 10, domainId: { $in: problemDomains }, docId: { $in: pids },
        }, { projection: { domainId: 1, docId: 1, difficulty: 1, objectiveKind: 1 } }).toArray() : [];
        const problemMap = new Map(problems.map((problem) => [`${problem.domainId}:${problem.docId}`, problem]));
        if (actualRecord && options.problem?.domainId === actualRecord.domainId && options.problem.docId === actualRecord.pid) {
            problemMap.set(`${actualRecord.domainId}:${actualRecord.pid}`, options.problem);
        }
        const solves = await importAcceptances(ctx, scope, uid, records, problemMap);
        const days = await importAchievementDays(ctx, scope, uid, records, problemMap);
        const { points, historicalPoints, source: pointSource } = await pointMetrics(ctx, uid, data, activatedAt);
        // The former visibility filter excluded historical contest points from
        // the baseline. Reconcile it once without rewriting existing grants.
        const refreshBaseline = !state?.version || state.version < 2 || (state?.pointSource === 'legacy' && pointSource === 'account');
        const baselinePoints = refreshBaseline
            ? Math.max(state?.baselinePoints || 0, historicalPoints) : (state?.baselinePoints ?? historicalPoints);
        const progress = evaluateAchievementProgress({
            ...metricsFromSolves(solves, data, now, points), ...streakMetrics(days, data, now),
        });
        const historical = new Set(evaluateAchievementProgress({
            ...metricsFromSolves(solves, data, activatedAt, baselinePoints), ...streakMetrics(days, data, streakActivatedAt),
        })
            .filter((item) => item.achieved).map((item) => item.id));
        for (const achievement of progress.filter((item) => item.achieved)) {
            const old = historical.has(achievement.id);
            await ctx.db.collection('achievement.unlock').updateOne({ _id: hash(['unlock', scope, uid, achievement.id]) }, { $setOnInsert: {
                scope, uid, achievementId: achievement.id, unlockedAt: now,
                historical: old, pending: !old && options.notify !== false,
            } }, { upsert: true });
        }
        await ctx.db.collection('achievement.state').updateOne({ _id: stateId }, {
            $set: { baselinePoints, pointSource, importedAt: now, version: STATE_VERSION },
        });
        const unlocked = new Map((await ctx.db.collection('achievement.unlock').find({ scope, uid }).toArray())
            .map((item) => [item.achievementId, item]));
        return progress.map(({ achieved, ...achievement }) => ({
            ...achievement, progress: unlocked.has(achievement.id) ? achievement.target : achievement.progress,
            unlocked: unlocked.has(achievement.id), unlockedAt: unlocked.get(achievement.id)?.unlockedAt,
            historical: unlocked.get(achievement.id)?.historical || false,
        }));
    });
}

/** The route must take uid from its authenticated session, never from a posted field. */
export async function getPendingAchievements(
    ctx: Context, domain: AchievementDomain, uid: number, limit = 5, achievementIds?: readonly string[],
) {
    if (!await canViewUserAchievements(ctx, domain, uid)) return [];
    const definitions = new Map(ACHIEVEMENT_CATALOG.map((item) => [item.id, item]));
    const selected = achievementIds === undefined ? undefined
        : [...new Set((Array.isArray(achievementIds) ? achievementIds : []).filter((id) => definitions.has(id)))];
    if (selected && !selected.length) return [];
    const grants = await ctx.db.collection('achievement.unlock').find({
        scope: getAchievementScope(domain), uid, pending: true,
        ...(selected ? { achievementId: { $in: selected } } : {}),
    }).sort({ unlockedAt: 1, _id: 1 }).limit(Math.max(1, Math.min(MAX_PENDING, nonnegative(limit) || 5))).toArray();
    return grants.filter((item) => definitions.has(item.achievementId)).map((item) => ({
        ...definitions.get(item.achievementId)!, unlocked: true, unlockedAt: item.unlockedAt,
    }));
}

export async function acknowledgeAchievements(ctx: Context, domain: AchievementDomain, uid: number, ids: string[]) {
    if (!await canViewUserAchievements(ctx, domain, uid)) return;
    const allowed = new Set(ACHIEVEMENT_CATALOG.map((item) => item.id));
    const selected = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && allowed.has(id)))].slice(0, MAX_PENDING);
    if (!selected.length) return;
    await ctx.db.collection('achievement.unlock').updateMany({
        scope: getAchievementScope(domain), uid, achievementId: { $in: selected }, pending: true,
    }, { $set: { pending: false, acknowledgedAt: new Date() } });
}

export async function recordAchievementAcceptance(ctx: Context, record: RecordDoc, problem?: ProblemDoc) {
    if (!record || record.uid <= 1 || record.contest?.toString().startsWith('0'.repeat(23))) return;
    if (record.judgeAt) {
        // Entering record/judge proves score-point settlement has completed. Write
        // this first so an interrupted achievement sync can be retried by the owner.
        // Match judgeAt: a delayed callback must not mark a newer rejudge as ready.
        await (ctx.db.collection('record') as Collection<any>).updateOne({
            _id: record._id, uid: record.uid, domainId: record.domainId, judgeAt: record.judgeAt,
        }, { $set: { achievementReadyJudgeAt: record.judgeAt } });
    }
    let domain = await ctx.db.collection('domain').findOne({ _id: record.domainId });
    if (!domain) return;
    if (record.practiceContest && record.practiceEntryDomain && record.practiceEntryDomain !== domain._id) {
        const entry = await ctx.db.collection('domain').findOne({ _id: record.practiceEntryDomain });
        if (entry && workspace.resolveDomainWorkspaceId(entry) === workspace.resolveDomainWorkspaceId(domain)) domain = entry;
    } else if (record.contest) {
        const participant: any = await (ctx.db.collection('document.status') as Collection<any>).findOne({
            domainId: record.domainId, docType: 30, docId: record.contest, uid: record.uid,
        });
        if (participant?.entryDomainId && participant.entryDomainId !== domain._id) {
            const entry = await ctx.db.collection('domain').findOne({ _id: participant.entryDomainId });
            if (entry && workspace.resolveDomainWorkspaceId(entry) === workspace.resolveDomainWorkspaceId(domain)) domain = entry;
        }
    }
    await syncUserAchievements(ctx, domain, record.uid, { record, problem });
}

export async function applyAchievementHooks(ctx: Context) {
    await Promise.all([initializeAchievementSystem(ctx), initializeStreakAchievements(ctx)]);
    await Promise.all([
        ctx.db.ensureIndexes(ctx.db.collection('achievement.solved'), {
            key: { scope: 1, uid: 1, domainId: 1, pid: 1 }, name: 'achievement_user_solves',
        }),
        ctx.db.ensureIndexes(ctx.db.collection('achievement.unlock'), {
            key: { scope: 1, uid: 1, pending: 1, unlockedAt: 1 }, name: 'achievement_pending',
        }),
        ctx.db.ensureIndexes(ctx.db.collection('achievement.day'), {
            key: { scope: 1, uid: 1, day: 1 }, name: 'achievement_user_days',
        }),
    ]);
    ctx.on('record/judge', async (record, _updated, problem) => {
        try {
            await recordAchievementAcceptance(ctx, record, problem);
        } catch (error) {
            // A poll/profile visit retries the durable verdict import after an interruption.
            logger.error('Unable to settle achievements for %s/%d: %o', record.domainId, record.uid, error);
        }
    });
}
