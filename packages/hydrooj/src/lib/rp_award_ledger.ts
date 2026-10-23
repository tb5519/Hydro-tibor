/* eslint-disable no-await-in-loop */
import { createHash } from 'crypto';
import type { ObjectId } from 'mongodb';
import type { ProblemDoc, RecordDoc } from '../interface';
import { STATUS } from '../model/builtin';
import domain from '../model/domain';
import problem from '../model/problem';
import record from '../model/record';
import db from '../service/db';
import { getOjDomainQuery, isScratchDomain } from './domain_type';
import {
    calculateProblemRpAward, getLegacyRpDifficultyMultiplier, getRpDifficultyMultiplier, normalizeRpDifficulty,
} from './rp_award';

interface EarnedDomain {
    domainId: string;
    baselineRp: number;
    awardedRp: number;
    solved: number;
}
interface EarnedQuestion { domainId: string; pid: number; value: number }
interface EarnedLedger {
    _id: number;
    uid: number;
    version: 1;
    epoch: Date;
    domains: EarnedDomain[];
    sharedBaselineRp: number;
    sharedAwardedRp: number;
    sharedSolved: number;
    questions: EarnedQuestion[];
    seededDomains: string[];
}
interface AwardEvent {
    _id: string;
    rid: ObjectId;
    uid: number;
    domainId: string;
    pid: number;
    score: number;
    status: number;
    difficulty: number;
    /** Numeric coefficient is immutable, including across later policy upgrades. */
    difficultyMultiplier?: number;
    awardPolicy?: 'pre-earned-rp-v1' | 'earned-rp-v1' | 'challenge-rp-v2';
    contestFactor: 1 | 2;
    contest?: ObjectId;
    judgeAt: Date;
    owner: number;
    processed: boolean;
    deferred: boolean;
}
interface AwardPolicy { _id: string; version: 1 | 2; epoch: Date; baselinesFrozen?: boolean }
export type RpAwardVisibility = (records: any[]) => Promise<Map<string, boolean>>;
export interface FrozenRpSnapshot {
    local: Map<string, Map<number, number>>;
    shared: Map<number, number>;
}

declare module '../service/db' {
    interface Collections {
        'ranking.earned': EarnedLedger;
        'ranking.awardEvent': AwardEvent;
        'ranking.awardPolicy': AwardPolicy;
    }
}

const earned = () => db.collection('ranking.earned');
const events = () => db.collection('ranking.awardEvent');
const policies = () => db.collection('ranking.awardPolicy');
const key = (domainId: string, pid: number) => JSON.stringify([domainId, pid]);
const finite = (value: unknown) => Number.isFinite(+value) ? Math.max(0, +value) : 0;
const ratio = (value: unknown) => Math.min(1, finite(value));
const excludedContests = () => [record.RECORD_PRETEST, record.RECORD_GENERATE].filter(Boolean);

async function policyEpoch() {
    try {
        await policies().updateOne({ _id: 'earned-rp-v1' }, {
            $setOnInsert: { version: 1, epoch: new Date() },
        }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
    return (await policies().findOne({ _id: 'earned-rp-v1' })).epoch;
}

/** A separate cutover never resets the original earned-RP epoch or balances. */
async function challengePolicyEpoch() {
    try {
        await policies().updateOne({ _id: 'challenge-rp-v2' }, {
            $setOnInsert: { version: 2, epoch: new Date() },
        }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
    return (await policies().findOne({ _id: 'challenge-rp-v2' })).epoch;
}

function frozenDifficultyMultiplier(event: AwardEvent) {
    // Missing numeric fields identify deployed v1 events, even when they only
    // become visible after v2. They must never inherit the newer curve.
    return typeof event.difficultyMultiplier === 'number' && Number.isFinite(event.difficultyMultiplier) && event.difficultyMultiplier >= 1
        ? event.difficultyMultiplier : getLegacyRpDifficultyMultiplier(event.difficulty);
}

async function ojDomains() {
    return (await domain.getMulti(getOjDomainQuery()).project<{ _id: string }>({ _id: 1 }).toArray())
        .map((ddoc) => ddoc._id).sort();
}

export interface FrozenProblemBalanceSource {
    rp?: unknown;
    rpInfo?: Record<string, unknown>;
    sharedRp?: unknown;
    sharedRpInfo?: Record<string, unknown>;
}

/** Old installations can have a total RP but no typed problem component.
 * Preserve its remainder after other signed RP types, rather than zeroing it. */
export function frozenProblemBalance(source: FrozenProblemBalanceSource, shared = false) {
    const info = shared ? source.sharedRpInfo : source.rpInfo;
    if (typeof info?.problem === 'number' && Number.isFinite(info.problem)) return Math.max(0, info.problem);
    const total = shared ? source.sharedRp : source.rp;
    if (typeof total !== 'number' || !Number.isFinite(total)) return 0;
    const other = Object.entries(info || {}).filter(([name, value]) => name !== 'problem' && typeof value === 'number' && Number.isFinite(value))
        .reduce((sum, [, value]) => sum + (value as number), 0);
    return Math.max(0, total - other);
}

function freshLedger(uid: number, memberships: any[], epoch: Date): EarnedLedger {
    const domains = memberships.map((membership) => ({
        domainId: membership.domainId,
        baselineRp: frozenProblemBalance(membership),
        awardedRp: 0,
        solved: 0,
    }));
    const sharedCandidates = memberships.filter((membership) => (typeof membership.sharedRp === 'number' && Number.isFinite(membership.sharedRp))
        || (typeof membership.sharedRpInfo?.problem === 'number' && Number.isFinite(membership.sharedRpInfo.problem)))
        .map((membership) => frozenProblemBalance(membership, true));
    const sharedBaselineRp = Math.max(0, ...(sharedCandidates.length ? sharedCandidates : domains.map((item) => item.baselineRp)));
    return {
        _id: uid, uid, version: 1, epoch, domains, sharedBaselineRp,
        sharedAwardedRp: 0, sharedSolved: 0, questions: [], seededDomains: [],
    };
}

/** Startup freezes only balances already displayed. No history scan, new award
 * or ranking projection is performed, and an existing policy is never reset. */
export async function initializeRpAwards(): Promise<Date> {
    const epoch = await policyEpoch();
    await challengePolicyEpoch();
    if ((await policies().findOne({ _id: 'earned-rp-v1' }))?.baselinesFrozen) return epoch;
    const domainIds = await ojDomains();
    const memberships = await domain.collUser.find({ uid: { $gt: 1 }, domainId: { $in: domainIds } })
        .project({ uid: 1, domainId: 1, rp: 1, rpInfo: 1, sharedRpInfo: 1, sharedRp: 1 }).toArray();
    const groups = new Map<number, any[]>();
    for (const membership of memberships) {
        if (!groups.has(membership.uid)) groups.set(membership.uid, []);
        groups.get(membership.uid).push(membership);
    }
    if (groups.size) await earned().bulkWrite([...groups].map(([uid, docs]) => ({
        updateOne: { filter: { _id: uid }, update: { $setOnInsert: freshLedger(uid, docs, epoch) }, upsert: true },
    })));
    await db.ensureIndexes(events(), {
        name: 'pendingUser', key: { uid: 1, processed: 1, domainId: 1, judgeAt: 1, rid: 1 },
    });
    await policies().updateOne({ _id: 'earned-rp-v1' }, { $set: { baselinesFrozen: true } });
    return epoch;
}

/** The caller provides proof of the contest factor before any visibility gate.
 * Each judge revision retains its original difficulty and contest snapshot. */
export async function recordRpAward(rdoc: RecordDoc, pdoc: ProblemDoc, contestFactor: 1 | 2, deferred = false): Promise<void> {
    if (!pdoc || rdoc.uid <= 1 || rdoc.contest?.toString().startsWith('0'.repeat(23))) return;
    if (isScratchDomain(await domain.get(rdoc.domainId))) return;
    const epoch = await policyEpoch();
    const challengeEpoch = await challengePolicyEpoch();
    if (!rdoc.judgeAt) throw new Error('RP award requires a completed judge timestamp');
    const judgeAt = new Date(rdoc.judgeAt);
    if (!Number.isFinite(+judgeAt)) throw new Error('RP award requires a completed judge timestamp');
    const score = ratio(finite(rdoc.score) / 100);
    const _id = createHash('sha256').update(JSON.stringify([String(rdoc._id), +judgeAt, score])).digest('hex');
    const difficulty = normalizeRpDifficulty(pdoc.difficulty);
    const awardPolicy = +judgeAt < +epoch ? 'pre-earned-rp-v1'
        : +judgeAt < +challengeEpoch ? 'earned-rp-v1' : 'challenge-rp-v2';
    const difficultyMultiplier = awardPolicy === 'pre-earned-rp-v1' ? 1
        : awardPolicy === 'earned-rp-v1' ? getLegacyRpDifficultyMultiplier(difficulty) : getRpDifficultyMultiplier(difficulty);
    const event: AwardEvent = {
        _id, rid: rdoc._id, uid: rdoc.uid, domainId: rdoc.domainId, pid: rdoc.pid,
        score, status: rdoc.status, difficulty, difficultyMultiplier, awardPolicy,
        contestFactor: contestFactor === 2 ? 2 : 1, contest: rdoc.contest,
        judgeAt, owner: pdoc.owner, processed: false, deferred: !!deferred,
    };
    try {
        await events().updateOne({ _id }, { $setOnInsert: event }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
}

async function userBaseline(uid: number, domainIds: string[], epoch: Date) {
    const memberships = await domain.collUser.find({ uid, domainId: { $in: domainIds } })
        .project({ uid: 1, domainId: 1, rp: 1, rpInfo: 1, sharedRpInfo: 1, sharedRp: 1 }).toArray();
    try {
        await earned().updateOne({ _id: uid }, { $setOnInsert: freshLedger(uid, memberships, epoch) }, { upsert: true });
    } catch (error) {
        if (error.code !== 11000) throw error;
    }
    const ledger = await earned().findOne({ _id: uid });
    const known = new Set(ledger.domains.map((item) => item.domainId));
    for (const membership of memberships) {
        if (known.has(membership.domainId)) continue;
        ledger.domains.push({ domainId: membership.domainId, baselineRp: frozenProblemBalance(membership), awardedRp: 0, solved: 0 });
        known.add(membership.domainId);
    }
    return ledger;
}

function solvedFloor(balance: number) {
    // Historical records can have been removed. Keep their balance, and avoid
    // treating the next question as the student's very first solved question.
    const value = Math.expm1(finite(balance) / 52);
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

async function loadProblems(domainIds: string[], questions: { domainId: string; pid: number }[]) {
    const result = new Map<string, ProblemDoc>();
    for (const domainId of domainIds) {
        const pids = [...new Set(questions.filter((question) => question.domainId === domainId).map((question) => question.pid))];
        if (!pids.length) continue;
        const docs = await problem.getMulti(domainId, { docId: { $in: pids } }, undefined, true).toArray();
        for (const pdoc of docs) result.set(key(domainId, pdoc.docId), pdoc);
    }
    return result;
}

/** Seed only pre-policy evidence. The new canonical status has already been
 * written when a judge callback arrives and is never a safe historical seed. */
async function historicalVisibility(records: any[], uid: number, epoch: Date, visibility: RpAwardVisibility) {
    const result = await visibility(records);
    const deferred = records.length ? await events().find({
        uid: { $in: [...new Set(records.map((rdoc) => rdoc.uid || uid))] },
        rid: { $in: records.map((rdoc) => rdoc._id) }, deferred: true,
    }).project({ rid: 1 }).toArray() : [];
    const deferredIds = new Set(deferred.map((event) => String(event.rid)));
    const contests = new Map<string, boolean>();
    for (const rdoc of records) {
        if (deferredIds.has(String(rdoc._id))) result.set(String(rdoc._id), false);
        if (!rdoc.contest) continue;
        const sourceUid = rdoc.uid || uid;
        const id = JSON.stringify([rdoc.domainId, String(rdoc.contest), sourceUid]);
        if (!contests.has(id)) {
            // An old pending contest is direct evidence that these results had
            // not been credited at rollout. Its later unlock must not turn it
            // into a historical, already-paid high-water value.
            const [pending, tdoc] = await Promise.all([
                db.collection('ranking.pendingContest').findOne({ domainId: rdoc.domainId, tid: rdoc.contest, uids: sourceUid }),
                db.collection('document').findOne({ domainId: rdoc.domainId, docType: 30, docId: rdoc.contest }),
            ]);
            contests.set(id, !!pending || (!!tdoc && tdoc.rule !== 'homework' && +new Date(tdoc.endAt) > +epoch));
        }
        if (contests.get(id)) result.set(String(rdoc._id), false);
    }
    return result;
}

async function seedHistoricalValues(ledger: EarnedLedger, domainIds: string[], visibility: RpAwardVisibility) {
    const missing = domainIds.filter((domainId) => !ledger.seededDomains.includes(domainId));
    if (!missing.length) return;
    const old = await db.collection('ranking.problem').find({ uid: ledger.uid, domainId: { $in: missing } }).toArray();
    const values = new Map<string, EarnedQuestion>();
    for (const entry of old) values.set(key(entry.domainId, entry.pid), {
        domainId: entry.domainId, pid: entry.pid, value: ratio(entry.value),
    });
    // Record history keeps the old judged version when a pre-policy record is
    // rejudged after deployment. Limit both reads to this user's record IDs.
    const current = await record.coll.find({ uid: ledger.uid, domainId: { $in: missing }, contest: { $nin: excludedContests() } })
        .project({ _id: 1, uid: 1, domainId: 1, pid: 1, score: 1, status: 1, judgeAt: 1, contest: 1 }).toArray();
    const parents = new Map(current.map((rdoc) => [String(rdoc._id), rdoc]));
    const histories = current.length ? await record.collHistory.find({ rid: { $in: current.map((rdoc) => rdoc._id) }, judgeAt: { $lt: ledger.epoch } })
        .project({ rid: 1, score: 1, status: 1, judgeAt: 1 }).toArray() : [];
    const revisions = current.filter((rdoc) => rdoc.judgeAt && +new Date(rdoc.judgeAt) < +ledger.epoch)
        .concat(histories.map((history) => ({ ...parents.get(String(history.rid)), ...history, _id: history.rid })));
    revisions.sort((a, b) => +new Date(a.judgeAt) - +new Date(b.judgeAt) || String(a._id).localeCompare(String(b._id)));
    const publicRecords = await historicalVisibility(revisions, ledger.uid, ledger.epoch, visibility);
    const canonical = new Map<string, any>();
    for (const rdoc of revisions) {
        if (publicRecords.get(String(rdoc._id)) === false) continue;
        const id = key(rdoc.domainId, rdoc.pid);
        if (values.has(id)) continue; // v1 ledger is direct evidence, including zero.
        const previous = canonical.get(id);
        if (!previous || rdoc.status === STATUS.STATUS_ACCEPTED || previous.status !== STATUS.STATUS_ACCEPTED || String(previous._id) === String(rdoc._id)) canonical.set(id, rdoc);
    }
    const problems = await loadProblems(missing, [...canonical.values()].map((rdoc) => ({ domainId: rdoc.domainId, pid: rdoc.pid })));
    for (const domainId of missing) {
        const candidates = [...canonical.values()].filter((rdoc) => rdoc.domainId === domainId);
        const pids = candidates.map((rdoc) => rdoc.pid);
        const historicalAcs = pids.length ? await record.coll.find({
            domainId, pid: { $in: pids }, status: STATUS.STATUS_ACCEPTED,
            judgeAt: { $lt: ledger.epoch }, contest: { $nin: excludedContests() },
        }).project({ _id: 1, uid: 1, domainId: 1, pid: 1, contest: 1 }).toArray() : [];
        const publicAcs = await historicalVisibility(historicalAcs, ledger.uid, ledger.epoch, visibility);
        const eligible = new Set(historicalAcs.filter((rdoc) => publicAcs.get(String(rdoc._id)) !== false).map((rdoc) => rdoc.pid));
        // A record rejudged after rollout can now be WA, while its history
        // proves the student's pre-policy AC was already eligible and paid.
        for (const rdoc of candidates) if (rdoc.status === STATUS.STATUS_ACCEPTED) eligible.add(rdoc.pid);
        for (const rdoc of candidates) {
            const pdoc = problems.get(key(domainId, rdoc.pid));
            const hadBalance = (ledger.domains.find((item) => item.domainId === domainId)?.baselineRp || 0) > 0;
            const value = hadBalance && pdoc && pdoc.owner !== ledger.uid && eligible.has(rdoc.pid) ? ratio(finite(rdoc.score) / 100) : 0;
            values.set(key(domainId, rdoc.pid), { domainId, pid: rdoc.pid, value });
        }
    }
    for (const item of values.values()) ledger.questions.push(item);
    const domainMap = new Map(ledger.domains.map((item) => [item.domainId, item]));
    for (const domainId of missing) {
        if (!domainMap.has(domainId)) {
            const item = { domainId, baselineRp: 0, awardedRp: 0, solved: 0 };
            ledger.domains.push(item); domainMap.set(domainId, item);
        }
        const local = domainMap.get(domainId);
        const known = [...values.values()].filter((item) => item.domainId === domainId).reduce((sum, item) => sum + item.value, 0);
        local.solved = Math.max(known, solvedFloor(local.baselineRp));
    }
    ledger.sharedSolved = Math.max(ledger.sharedSolved, ledger.domains.reduce((sum, item) => sum + item.solved, 0), solvedFloor(ledger.sharedBaselineRp));
    ledger.seededDomains.push(...missing);
}

function balances(ledger: EarnedLedger, domainIds: string[]) {
    return {
        local: new Map(ledger.domains.filter((item) => domainIds.includes(item.domainId))
            .map((item) => [item.domainId, item.baselineRp + item.awardedRp])),
        shared: ledger.sharedBaselineRp + ledger.sharedAwardedRp,
    };
}

/** Caller holds the existing per-user lease. The complete ledger (high-water
 * values and both balances) commits atomically before marking source events.
 * A crash before the markers only replays zero-delta high-water events. */
export async function applyFrozenRpAwards(uid: number, domainIds: string[], visibility: RpAwardVisibility) {
    const epoch = await policyEpoch();
    const ledger = await userBaseline(uid, domainIds, epoch);
    await seedHistoricalValues(ledger, domainIds, visibility);
    const pending = await events().find({ uid, domainId: { $in: domainIds }, processed: { $ne: true } })
        .sort({ judgeAt: 1, rid: 1, _id: 1 }).toArray();
    const visible = await visibility(pending.map((event) => ({ ...event, _id: event.rid })));
    const pdocs = await loadProblems(domainIds, pending);
    const questions = new Map(ledger.questions.map((question) => [key(question.domainId, question.pid), question]));
    const locals = new Map(ledger.domains.map((item) => [item.domainId, item]));
    const processed: string[] = [];
    for (const event of pending) {
        const id = key(event.domainId, event.pid);
        const previous = questions.get(id)?.value || 0;
        if (event.score <= previous || event.score <= 0 || event.owner === uid) { processed.push(event._id); continue; }
        if (visible.get(String(event.rid)) === false) continue;
        const pdoc = pdocs.get(id);
        if (!pdoc || pdoc.owner === uid) { processed.push(event._id); continue; }
        if (!(pdoc.nAccept > 0)) continue;
        const local = locals.get(event.domainId);
        const oldSource = +event.judgeAt < +epoch;
        const input = {
            previousValue: previous, nextValue: event.score,
            difficulty: oldSource ? 1 : event.difficulty,
            difficultyMultiplier: oldSource ? 1 : frozenDifficultyMultiplier(event),
            contestMultiplier: (oldSource ? 1 : event.contestFactor) as 1 | 2,
        };
        const localAward = calculateProblemRpAward({ ...input, solvedBefore: local.solved });
        const sharedAward = calculateProblemRpAward({ ...input, solvedBefore: ledger.sharedSolved });
        local.solved = localAward.solvedAfter;
        local.awardedRp += localAward.award;
        ledger.sharedSolved = sharedAward.solvedAfter;
        ledger.sharedAwardedRp += sharedAward.award;
        if (!questions.has(id)) { const question = { domainId: event.domainId, pid: event.pid, value: event.score }; questions.set(id, question); ledger.questions.push(question); }
        else questions.get(id).value = event.score;
        processed.push(event._id);
    }
    const committed = await earned().replaceOne({ _id: uid }, ledger);
    if (committed.matchedCount !== 1) throw new Error('RP award ledger disappeared before commit');
    if (processed.length) await events().updateMany({ _id: { $in: processed } }, { $set: { processed: true } });
    return balances(ledger, domainIds);
}

/** Maintenance only projects frozen balances. It cannot emit a new award or
 * reprice any question, even after difficulty edits or generation changes. */
export async function getFrozenRpSnapshot(domainIds: string[]): Promise<FrozenRpSnapshot> {
    const epoch = await initializeRpAwards();
    const memberships = await domain.collUser.find({ uid: { $gt: 1 }, domainId: { $in: domainIds } }).project({ uid: 1 }).toArray();
    const result: FrozenRpSnapshot = { local: new Map(domainIds.map((domainId) => [domainId, new Map()])), shared: new Map() };
    for (const uid of new Set(memberships.map((membership) => membership.uid))) {
        const ledger = await userBaseline(uid, domainIds, epoch);
        // Keep this read path free of replacements: an ad-hoc snapshot can
        // overlap a live award. The user-lease apply path persists new domains.
        const values = balances(ledger, domainIds);
        for (const [domainId, value] of values.local) result.local.get(domainId)?.set(uid, value);
        result.shared.set(uid, values.shared);
    }
    return result;
}
