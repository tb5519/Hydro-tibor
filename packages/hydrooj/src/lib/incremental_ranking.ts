/* eslint-disable no-await-in-loop */
import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import { sleep } from '@hydrooj/utils';
import type { Context } from '../context';
import type { ProblemDoc, RecordDoc } from '../interface';
import { LEVELS, PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import domain from '../model/domain';
import problem from '../model/problem';
import record from '../model/record';
import UserModel, { deleteUserCache } from '../model/user';
import bus from '../service/bus';
import db from '../service/db';
import { getOjDomainQuery } from './domain_type';
import { invalidateSharedRankingSnapshot } from './shared_ranking';
import {
    initializeRpAwards, recordRpAward, applyFrozenRpAwards, getFrozenRpSnapshot,
} from './rp_award_ledger';

interface DomainProgress { domainId: string; solved: number; accepted: number }
interface RankingProgress {
    _id: string;
    generation?: number;
    scope?: string;
    dirty?: boolean;
    domains?: DomainProgress[];
    lease?: { owner: string; expiresAt: Date };
    rebuilding?: { owner: string; expiresAt: Date };
    readers?: { owner: string; expiresAt: Date }[];
}
interface ProblemProgress {
    _id: string;
    uid: number;
    domainId: string;
    pid: number;
    generation: number;
    value: number;
    accepted: boolean;
}
interface PendingContest {
    _id: string;
    domainId: string;
    tid: ObjectId;
    uids: number[];
}

export interface RankingAwardSource {
    rdoc: Pick<RecordDoc, '_id' | 'uid' | 'pid' | 'domainId' | 'status' | 'score' | 'judgeAt' | 'contest'>;
    pdoc: Pick<ProblemDoc, 'domainId' | 'docId' | 'owner' | 'nAccept' | 'difficulty'>;
    contestFactor: 1 | 2;
    deferred: boolean;
}

declare module '../service/db' {
    interface Collections {
        'ranking.progress': RankingProgress;
        'ranking.problem': ProblemProgress;
        'ranking.pendingContest': PendingContest;
    }
}

const LEASE_MS = 120_000;
const LEASE_WAIT_MS = 5_000;
const progress = () => db.collection('ranking.progress');
const contributions = () => db.collection('ranking.problem');
const pendingContests = () => db.collection('ranking.pendingContest');
const identity = (uid: number, domainId: string, pid: number) => JSON.stringify([uid, domainId, pid]);
export const problemRpFromSolved = (solved: number) => Math.log(Math.max(0, solved) + 1) * 52;

async function ensureGate() {
    try {
        await progress().updateOne({ _id: 'gate' }, { $setOnInsert: { generation: 1, readers: [] } }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
}

async function withLease<T>(id: string, callback: () => Promise<T>) {
    const owner = new ObjectId().toHexString();
    try {
        await progress().updateOne({ _id: id }, { $setOnInsert: {} }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
    const deadline = Date.now() + LEASE_WAIT_MS;
    while (true) {
        const locked = await progress().findOneAndUpdate({
            _id: id,
            $or: [{ lease: { $exists: false } }, { 'lease.expiresAt': { $lte: new Date() } }],
        }, { $set: { lease: { owner, expiresAt: new Date(Date.now() + LEASE_MS) } } }, { returnDocument: 'after' });
        if (locked?.lease?.owner === owner) break;
        if (Date.now() >= deadline) throw new Error('Timed out waiting for ranking user update');
        await sleep(20);
    }
    const heartbeat = setInterval(() => {
        progress().updateOne({ _id: id, 'lease.owner': owner }, {
            $set: { 'lease.expiresAt': new Date(Date.now() + LEASE_MS) },
        }).catch(() => {});
    }, LEASE_MS / 3);
    heartbeat.unref?.();
    try {
        return await callback();
    } finally {
        clearInterval(heartbeat);
        await progress().updateOne({ _id: id, 'lease.owner': owner }, { $unset: { lease: '' } });
    }
}

async function withRankingReader<T>(callback: (generation: number) => Promise<T>) {
    await ensureGate();
    const owner = new ObjectId().toHexString();
    // Live verdict delivery must not wait behind a long maintenance task.
    // The judge catches this short timeout and persists a user-only retry.
    const deadline = Date.now() + 2_000;
    let generation: number;
    while (true) {
        const now = new Date();
        const gate = await progress().findOneAndUpdate({
            _id: 'gate',
            $or: [{ rebuilding: { $exists: false } }, { 'rebuilding.expiresAt': { $lte: now } }],
        }, {
            $push: { readers: { owner, expiresAt: new Date(Date.now() + LEASE_MS) } },
        }, { returnDocument: 'after' });
        if (gate) { generation = gate.generation; break; }
        if (Date.now() >= deadline) throw new Error('Timed out waiting for ranking rebuild');
        await sleep(50);
    }
    const heartbeat = setInterval(() => {
        progress().updateOne({ _id: 'gate', 'readers.owner': owner }, {
            $set: { 'readers.$.expiresAt': new Date(Date.now() + LEASE_MS) },
        }).catch(() => {});
    }, LEASE_MS / 3);
    heartbeat.unref?.();
    try {
        return await callback(generation);
    } finally {
        clearInterval(heartbeat);
        await progress().updateOne({ _id: 'gate' }, { $pull: { readers: { owner } } });
    }
}

/** Full maintenance jobs are rare. Hold a writer lease so they cannot overwrite
 * a freshly persisted judge delta; invalidate only the lazy user baselines. */
export async function withRankingRebuild<T>(callback: () => Promise<T>) {
    await ensureGate();
    const owner = new ObjectId().toHexString();
    const deadline = Date.now() + 20 * 60_000;
    while (true) {
        const gate = await progress().findOneAndUpdate({
            _id: 'gate',
            $or: [{ rebuilding: { $exists: false } }, { 'rebuilding.expiresAt': { $lte: new Date() } }],
        }, { $set: { rebuilding: { owner, expiresAt: new Date(Date.now() + LEASE_MS) } } });
        if (gate) break;
        if (Date.now() >= deadline) throw new Error('Timed out waiting for ranking rebuild');
        await sleep(50);
    }
    const heartbeat = setInterval(() => {
        progress().updateOne({ _id: 'gate', 'rebuilding.owner': owner }, {
            $set: { 'rebuilding.expiresAt': new Date(Date.now() + LEASE_MS) },
        }).catch(() => {});
    }, LEASE_MS / 3);
    heartbeat.unref?.();
    try {
        while (await progress().countDocuments({ _id: 'gate', readers: { $elemMatch: { expiresAt: { $gt: new Date() } } } })) {
            if (Date.now() >= deadline) throw new Error('Timed out draining ranking updates');
            await sleep(20);
        }
        return await callback();
    } finally {
        clearInterval(heartbeat);
        await progress().updateOne({ _id: 'gate', 'rebuilding.owner': owner }, {
            $inc: { generation: 1 }, $unset: { rebuilding: '' }, $set: { readers: [] },
        });
    }
}

function canPublishContest(tdoc: any, now = Date.now()) {
    // Removing an old homework must not revoke already earned public credit.
    return !tdoc || (tdoc.rule === 'homework'
        || (!tdoc.keepScoreboardHidden && !contest.isLocked(tdoc) && +new Date(tdoc.endAt) <= now));
}

export async function rankingStatusVisibility(statuses: any[]) {
    const rids = statuses.map((status) => status.rid).filter(Boolean);
    const records = rids.length ? await record.coll.find({ _id: { $in: rids } })
        .project({ _id: 1, contest: 1, domainId: 1 }).toArray() : [];
    return recordVisibility(records);
}

async function recordVisibility(records: any[]) {
    const visibility = new Map<string, boolean>();
    const contestVisibility = new Map<string, boolean>();
    for (const rdoc of records) {
        const key = rdoc.contest && `${rdoc.domainId}/${rdoc.contest}`;
        if (key && !contestVisibility.has(key)) {
            const tdoc = await contest.get(rdoc.domainId, rdoc.contest);
            contestVisibility.set(key, canPublishContest(tdoc));
        }
        visibility.set(String(rdoc._id), !key || contestVisibility.get(key));
    }
    return visibility;
}

function contribution(uid: number, status: any, pdoc: Partial<ProblemDoc>, visible: boolean) {
    const accepted = visible && status?.status === STATUS.STATUS_ACCEPTED;
    const value = visible && pdoc && pdoc.owner !== uid && +pdoc.nAccept > 0 && status?.rid
        ? Math.max(0, Math.min(100, +status.score || 0)) / 100 : 0;
    return { value, accepted };
}

async function publicHistory(domainId: string, uid: number, hiddenPids: number[]) {
    const publicFallback = new Map<number, any>();
    if (hiddenPids.length) {
        // A private contest can replace the canonical rid even when an
        // earlier public AC exists. Recover only these questions' public
        // results, through the user's history index, during lazy seeding.
        const history = await record.coll.find({
            domainId, uid, pid: { $in: hiddenPids }, judgeAt: { $ne: null },
            contest: { $nin: [record.RECORD_PRETEST, record.RECORD_GENERATE].filter(Boolean) },
        }).project({ _id: 1, domainId: 1, pid: 1, status: 1, score: 1, contest: 1, judgeAt: 1 })
            .sort({ judgeAt: 1, _id: 1 }).toArray();
        const publicRecords = await recordVisibility(history);
        for (const rdoc of history) {
            if (publicRecords.get(String(rdoc._id)) === false) continue;
            const previous = publicFallback.get(rdoc.pid);
            if (!previous || previous.status !== STATUS.STATUS_ACCEPTED || rdoc.status === STATUS.STATUS_ACCEPTED) {
                publicFallback.set(rdoc.pid, { ...rdoc, uid, rid: rdoc._id, docId: rdoc.pid });
            }
        }
    }
    return publicFallback;
}

export async function publicRankingStatuses(statuses: any[]) {
    const visibility = await rankingStatusVisibility(statuses);
    const groups = new Map<string, { domainId: string; uid: number; pids: number[] }>();
    for (const status of statuses) {
        if (visibility.get(String(status.rid)) !== false) continue;
        const key = JSON.stringify([status.domainId, status.uid]);
        if (!groups.has(key)) groups.set(key, { domainId: status.domainId, uid: status.uid, pids: [] });
        groups.get(key).pids.push(status.docId);
    }
    const fallbacks = new Map<string, Map<number, any>>();
    for (const [key, group] of groups) fallbacks.set(key, await publicHistory(group.domainId, group.uid, group.pids));
    return statuses.map((status) => visibility.get(String(status.rid)) === false
        ? fallbacks.get(JSON.stringify([status.domainId, status.uid]))?.get(status.docId) : status).filter(Boolean);
}

async function publicAcceptedPids(uid: number, domainId: string, pids: number[]) {
    if (!pids.length) return new Set<number>();
    const accepted = await record.coll.find({
        domainId, uid, pid: { $in: pids }, status: STATUS.STATUS_ACCEPTED, judgeAt: { $ne: null },
        contest: { $nin: [record.RECORD_PRETEST, record.RECORD_GENERATE].filter(Boolean) },
    }).project({ _id: 1, pid: 1, domainId: 1, contest: 1 }).toArray();
    const visibility = await recordVisibility(accepted);
    return new Set(accepted.filter((rdoc) => visibility.get(String(rdoc._id)) !== false).map((rdoc) => rdoc.pid));
}

async function seedUser(uid: number, domainIds: string[], generation: number) {
    const entries: ProblemProgress[] = [];
    const sums: DomainProgress[] = [];
    for (const domainId of domainIds) {
        // This index starts with domainId/docType/uid; never walk every question
        // or another student's status when initializing an existing account.
        const statuses = await problem.getMultiStatus(domainId, { uid, rid: { $ne: null } }).toArray();
        const pids = statuses.map((status) => status.docId);
        const pdocs = pids.length ? await problem.getMulti(domainId, { docId: { $in: pids } }, undefined, true).toArray() : [];
        const pdict = new Map(pdocs.map((pdoc) => [pdoc.docId, pdoc]));
        const publicStatuses = await publicRankingStatuses(statuses);
        const earlierAccepted = await publicAcceptedPids(uid, domainId, publicStatuses
            .filter((status) => status.status !== STATUS.STATUS_ACCEPTED).map((status) => status.docId));
        let solved = 0;
        let accepted = 0;
        for (const status of publicStatuses) {
            const pdoc = pdict.get(status.docId);
            if (!pdoc) continue;
            const value = contribution(uid, status, pdoc, true);
            value.accepted ||= earlierAccepted.has(status.docId);
            solved += value.value;
            accepted += +value.accepted;
            entries.push({
                _id: identity(uid, domainId, status.docId), uid, domainId, pid: status.docId, generation, ...value,
            });
        }
        sums.push({ domainId, solved, accepted });
    }
    await contributions().deleteMany({ uid });
    if (entries.length) await contributions().bulkWrite(entries.map((entry) => ({
        replaceOne: { filter: { _id: entry._id }, replacement: entry, upsert: true },
    })));
    return sums;
}

const totalFromInfo = (field: string) => ({
    $max: [0, { $sum: { $map: {
        input: { $objectToArray: { $ifNull: [`$${field}`, {}] } }, as: 'item',
        in: { $convert: { input: '$$item.v', to: 'double', onError: 0, onNull: 0 } },
    } } }],
});

async function refreshLocalRanksUnlocked(domainId: string) {
    const rows = await domain.collUser.find({ domainId, uid: { $nin: [0, 1], $gt: -1000 }, rp: { $gt: 0 } })
        .project({ _id: 1, rp: 1, rank: 1, level: 1 }).sort({ rp: -1, nAccept: -1, nSubmit: 1, uid: 1 }).toArray();
    const changes = [];
    let previousRp: number;
    let rank = 0;
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (row.rp !== previousRp) rank = index + 1;
        previousRp = row.rp;
        let level = 0;
        for (let i = 0; i < LEVELS.length; i++) {
            if (rank <= LEVELS[i] * rows.length / 100
                && (i === LEVELS.length - 1 || rank > LEVELS[i + 1] * rows.length / 100)) { level = i; break; }
        }
        if (rank !== row.rank || level !== row.level) changes.push({
            updateOne: { filter: { _id: row._id }, update: { $set: { rank, level } } },
        });
    }
    if (changes.length) {
        await domain.collUser.bulkWrite(changes);
        // Other students can move a rank or level as a consequence of this AC.
        deleteUserCache(domainId);
    }
    await domain.collUser.updateMany({ domainId, rp: { $lte: 0 }, $or: [{ rank: { $ne: null } }, { level: { $ne: 0 } }] }, {
        $set: { rank: null, level: 0 },
    });
}

async function refreshLocalRanks(domainId: string) {
    return withLease(`ranks:${domainId}`, () => refreshLocalRanksUnlocked(domainId));
}

export async function publishRankingUpdate(domainIds: string[], uid?: number) {
    invalidateSharedRankingSnapshot();
    // Cached User objects also contain RP and level. Clear them before live
    // clients fetch a new ranking, including in other Hydro workers.
    if (uid) {
        const udoc = await UserModel.getById(domainIds[0], uid);
        deleteUserCache(udoc);
    } else for (const domainId of domainIds) deleteUserCache(domainId);
    bus.broadcast('ranking/update', { uid, domainIds, revision: new ObjectId().toHexString() });
}

async function updateUser(uid: number, affected?: { domainId: string; pid: number }, forceSeed = false) {
    return withRankingReader((generation) => withLease(`user:${uid}`, async () => {
        const domains = await domain.getMulti(getOjDomainQuery()).project({ _id: 1 }).toArray();
        const domainIds = domains.map((ddoc) => ddoc._id).sort();
        if (!domainIds.length || (affected && !domainIds.includes(affected.domainId))) return false;
        const udoc = await UserModel.getById(affected?.domainId || domainIds[0], uid);
        if (!udoc?.hasPriv(PRIV.PRIV_USER_PROFILE)) return false;
        const stateId = `user:${uid}`;
        const previous = await progress().findOne({ _id: stateId });
        const scope = JSON.stringify(domainIds);
        const seed = forceSeed || previous.generation !== generation || previous.scope !== scope || previous.dirty;
        await progress().updateOne({ _id: stateId }, { $set: { dirty: true } });
        // This durable balance is independent of disposable canonical-status
        // caches. Read/advance it before seeding can replace legacy entries.
        const frozen = await applyFrozenRpAwards(uid, domainIds, recordVisibility);
        const sums = seed ? await seedUser(uid, domainIds, generation) : previous.domains;
        if (!seed && affected) {
            const key = identity(uid, affected.domainId, affected.pid);
            const [old, status, pdoc] = await Promise.all([
                contributions().findOne({ _id: key, generation }),
                problem.getStatus(affected.domainId, affected.pid, uid),
                problem.get(affected.domainId, affected.pid, undefined, true),
            ]);
            const visibility = await rankingStatusVisibility(status ? [status] : []);
            const visible = visibility.get(String(status?.rid)) !== false;
            // A hidden contest must not remove or reveal an earlier public result.
            const value = visible ? contribution(uid, status, pdoc, true) : { value: old?.value || 0, accepted: !!old?.accepted };
            if (visible && !value.accepted) value.accepted = (await publicAcceptedPids(uid, affected.domainId, [affected.pid])).has(affected.pid);
            const local = sums.find((item) => item.domainId === affected.domainId);
            local.solved = Math.max(0, local.solved + value.value - (old?.value || 0));
            local.accepted = Math.max(0, local.accepted + +value.accepted - +(old?.accepted || false));
            await contributions().updateOne({ _id: key }, {
                $set: { uid, ...affected, generation, ...value },
            }, { upsert: true });
        }
        const memberships = await domain.collUser.find({ uid, domainId: { $in: domainIds } }).toArray();
        const sharedInfo = memberships.find((item) => item.sharedRpInfo)?.sharedRpInfo
            || Object.fromEntries(Object.keys(memberships.reduce((all, item) => ({ ...all, ...item.rpInfo }), {}))
                .filter((key) => key !== 'problem').map((key) => [key, memberships.reduce((sum, item) => sum + (+item.rpInfo?.[key] || 0), 0)]));
        const sharedProblemRp = frozen.shared;
        const changedDomains: string[] = [];
        for (const membership of memberships) {
            const local = sums.find((item) => item.domainId === membership.domainId);
            if (!local) continue;
            const problemRp = frozen.local.get(membership.domainId) || 0;
            if (membership.rpInfo?.problem !== problemRp) changedDomains.push(membership.domainId);
            const $set: any = { 'rpInfo.problem': problemRp, nAccept: local.accepted };
            if (membership.join) $set.sharedRpInfo = { ...sharedInfo, problem: sharedProblemRp };
            await domain.collUser.updateOne({ _id: membership._id }, [
                { $set }, { $set: { rp: totalFromInfo('rpInfo'), ...(membership.join ? { sharedRp: totalFromInfo('sharedRpInfo') } : {}) } },
            ]);
        }
        await progress().updateOne({ _id: stateId }, {
            $set: { generation, scope, domains: sums, dirty: false },
        });
        await Promise.all(changedDomains.map(refreshLocalRanks));
        await publishRankingUpdate(domainIds, uid);
        return true;
    }));
}

const contestKey = (domainId: string, tid: ObjectId) => JSON.stringify([domainId, String(tid)]);
function contestTaskId(domainId: string, tid: ObjectId) {
    return new ObjectId(createHash('sha256').update(`ranking/${contestKey(domainId, tid)}`).digest('hex').slice(0, 24));
}
async function scheduleContest(domainId: string, tdoc: any) {
    if (!tdoc?.endAt || tdoc.keepScoreboardHidden) return;
    // A scoreboard can intentionally remain locked after the deadline. Keep
    // its durable pending users and wait for the teacher's contest/edit event.
    if (contest.isLocked(tdoc) && +new Date(tdoc.endAt) <= Date.now()) return;
    await db.collection('schedule').updateOne({ _id: contestTaskId(domainId, tdoc.docId) }, {
        $set: { domainId, tid: tdoc.docId, type: 'schedule', subType: 'ranking.contest', executeAfter: new Date(Math.max(Date.now(), +new Date(tdoc.endAt)) + 10) },
    }, { upsert: true });
}

/** Called after the canonical problem status and counters have been persisted. */
export async function updateIncrementalRanking(rdoc: RecordDoc, pdoc?: ProblemDoc, firstAccepted = false) {
    if (rdoc.uid <= 1 || !pdoc || rdoc.contest?.toString().startsWith('0'.repeat(23))) return false;
    await initializeRpAwards();
    const tdoc = rdoc.contest ? await contest.get(rdoc.domainId, rdoc.contest) : null;
    // Homework shares the contest storage model but earns the ordinary rate.
    // Capture at judgement, even for a hidden scoreboard: later edits cannot
    // change the difficulty or competition bonus of an already judged result.
    const awardSource: RankingAwardSource = {
        rdoc: { _id: rdoc._id, uid: rdoc.uid, pid: rdoc.pid, domainId: rdoc.domainId,
            status: rdoc.status, score: rdoc.score, judgeAt: rdoc.judgeAt, contest: rdoc.contest },
        pdoc: { domainId: pdoc.domainId, docId: pdoc.docId, owner: pdoc.owner, nAccept: pdoc.nAccept, difficulty: pdoc.difficulty },
        contestFactor: tdoc && tdoc.rule !== 'homework' ? 2 : 1,
        deferred: !!rdoc.contest && !canPublishContest(tdoc),
    };
    try {
        await recordRpAward(rdoc, pdoc, awardSource.contestFactor, awardSource.deferred);
    } catch (error) {
        // Keep the original award context even if persisting its event failed.
        // A retry after a teacher edit must not silently use the new difficulty.
        throw Object.assign(new Error('Unable to persist RP award source', { cause: error }), { rankingAwardSource: awardSource });
    }
    if (rdoc.contest) {
        if (!canPublishContest(tdoc)) {
            await pendingContests().updateOne({ _id: contestKey(rdoc.domainId, rdoc.contest) }, {
                $set: { domainId: rdoc.domainId, tid: rdoc.contest }, $addToSet: { uids: rdoc.uid },
            }, { upsert: true });
            await scheduleContest(rdoc.domainId, tdoc);
            return false;
        }
    }
    const updated = await updateUser(rdoc.uid, { domainId: rdoc.domainId, pid: rdoc.pid });
    if (updated && firstAccepted && pdoc.nAccept === 1) {
        // A question enters the existing RP formula at its first AC. Only the
        // other students with a partial result on this question are affected.
        const partials = await problem.getMultiStatus(rdoc.domainId, {
            docId: rdoc.pid, uid: { $nin: [rdoc.uid, pdoc.owner] }, rid: { $ne: null }, score: { $gt: 0 },
        }).project({ uid: 1, rid: 1 }).toArray();
        for (const status of partials) {
            try {
                // An older partial first becomes eligible when this question
                // receives its first AC. Credit its own source, not the first
                // solver's difficulty/competition context.
                const source = await record.coll.findOne({ _id: status.rid });
                if (source) {
                    const sourceContest = source.contest ? await contest.get(source.domainId, source.contest) : null;
                    await recordRpAward(source, pdoc, sourceContest && sourceContest.rule !== 'homework' ? 2 : 1,
                        !!source.contest && !canPublishContest(sourceContest));
                }
                await updateUser(status.uid, { domainId: rdoc.domainId, pid: rdoc.pid });
            } catch {
                await scheduleRankingRecovery(status.uid);
            }
        }
    }
    return updated;
}

/** A maintenance rebuild projects immutable earned balances, never current difficulty. */
export async function freezeProblemRpForRebuild(domainIds: string[]) {
    await initializeRpAwards();
    return getFrozenRpSnapshot(domainIds);
}

export async function publishContestRanking(domainId: string, tid: ObjectId) {
    const pending = await pendingContests().findOne({ _id: contestKey(domainId, tid) });
    if (!pending) return;
    const tdoc = await contest.get(domainId, tid);
    if (!canPublishContest(tdoc)) { await scheduleContest(domainId, tdoc); return; }
    for (const uid of pending.uids) await updateUser(uid, undefined, true);
    await pendingContests().deleteOne({ _id: pending._id });
}

export async function scheduleRankingRecovery(uid: number, question?: { domainId: string; pid: number }, awardSource?: RankingAwardSource) {
    const _id = new ObjectId(createHash('sha256').update(`ranking/user/${uid}`).digest('hex').slice(0, 24));
    await db.collection('schedule').updateOne({ _id }, {
        $set: { uid, type: 'schedule', subType: 'ranking.user', executeAfter: new Date(Date.now() + 10_000) },
        ...((question || awardSource) ? { $addToSet: {
            ...(question ? { questions: question } : {}), ...(awardSource ? { awards: awardSource } : {}),
        } } : {}),
    }, { upsert: true });
}

export async function applyIncrementalRanking(ctx: Context) {
    // This metadata-only migration freezes existing displayed RP before any
    // post-deployment judgement can earn a new difficulty/contest bonus.
    await initializeRpAwards();
    await db.ensureIndexes(contributions(), { key: { uid: 1, domainId: 1 }, name: 'byUser' });
    await db.ensureIndexes(record.coll, { key: { domainId: 1, uid: 1, pid: 1, status: 1, _id: -1 }, name: 'rankingUserProblem' });
    await ctx.inject(['worker'], (c) => {
        c.worker.addHandler('ranking.contest', async ({ domainId, tid }) => {
            try { await publishContestRanking(domainId, tid); } catch (error) {
                const tdoc = await contest.get(domainId, tid);
                await scheduleContest(domainId, { ...tdoc, endAt: new Date(Date.now() + 10_000) });
                throw error;
            }
        });
        c.worker.addHandler('ranking.user', async ({ uid, questions = [], awards = [] }) => {
            try {
                for (const source of awards as RankingAwardSource[]) {
                    await recordRpAward(source.rdoc as RecordDoc, source.pdoc as ProblemDoc, source.contestFactor, source.deferred);
                    if (source.deferred && source.rdoc.contest) {
                        const tdoc = await contest.get(source.rdoc.domainId, source.rdoc.contest);
                        if (!canPublishContest(tdoc)) {
                            await pendingContests().updateOne({ _id: contestKey(source.rdoc.domainId, source.rdoc.contest) }, {
                                $set: { domainId: source.rdoc.domainId, tid: source.rdoc.contest }, $addToSet: { uids: uid },
                            }, { upsert: true });
                            await scheduleContest(source.rdoc.domainId, tdoc);
                        }
                    }
                }
                await updateUser(uid, undefined, true);
                for (const question of questions) {
                    const statuses = await problem.getMultiStatus(question.domainId, { docId: question.pid, score: { $gt: 0 } }).project({ uid: 1 }).toArray();
                    for (const status of statuses) {
                        try { await updateUser(status.uid, question); } catch { await scheduleRankingRecovery(status.uid); }
                    }
                }
            } catch (error) {
                await scheduleRankingRecovery(uid);
                for (const source of awards as RankingAwardSource[]) await scheduleRankingRecovery(uid, undefined, source);
                for (const question of questions) await scheduleRankingRecovery(uid, question);
                throw error;
            }
        });
    });
    ctx.on('contest/edit', async (tdoc) => {
        const pending = await pendingContests().findOne({ _id: contestKey(tdoc.domainId, tdoc.docId) });
        if (pending) await scheduleContest(tdoc.domainId, tdoc);
    });
}
