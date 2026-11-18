/* eslint-disable no-await-in-loop */
import { randomBytes } from 'crypto';
import type { Context } from '../context';
import { ValidationError } from '../error';
import {
    TRAINING_GRANT_MS, TRAINING_MAX_GAP_MS, trainingDay, TrainingInterval, trainingIntervals, TrainingSource, trainingSourceKey,
} from '../lib/training_time';
import { Logger } from '../logger';
import db from '../service/db';

interface TrainingGrant {
    _id: string; uid: number; domainId: string; source: TrainingSource; expiresAt: Date;
}
interface TrainingBucket {
    domainId: string; day: string; milliseconds: number; startedAt?: Date; updatedAt?: Date;
    sources: (TrainingSource & { key: string, milliseconds: number })[];
    intervals?: TrainingInterval[];
}
interface TrainingLease {
    sessionId: string; domainId: string; source: TrainingSource; lastAt: Date; lastSeq: number; expiresAt: Date;
}
interface TrainingState {
    _id: number; version: number; dirty: boolean; buckets: TrainingBucket[]; updatedAt: Date;
    lease: TrainingLease | null;
    replaced?: (TrainingLease & { replacedAt: Date })[];
    starts: { requestId: string, grant: string, sessionId: string | null }[];
}
export interface TrainingDaily {
    _id: string; uid: number; domainId: string; day: string; seconds: number; version: number;
    sources: (TrainingSource & { key: string, seconds: number })[];
    startedAt?: Date; updatedAt?: Date;
    intervals?: TrainingInterval[];
}

declare module '../service/db' {
    interface Collections {
        'training.time.grant': TrainingGrant;
        'training.time.state': TrainingState;
        'training.time.daily': TrainingDaily;
        'training.time.meta': { _id: string, startedAt: Date };
    }
}

export const grants = db.collection('training.time.grant');
export const states = db.collection('training.time.state');
export const daily = db.collection('training.time.daily');
export const meta = db.collection('training.time.meta');
const MAX_OPEN_BUCKETS = 100;
const logger = new Logger('training-time');
const opaque = () => randomBytes(24).toString('hex');
const isOpaque = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);

export async function getTrackingStartedAt() {
    return (await meta.findOne({ _id: 'collection' }))?.startedAt || null;
}

/** Called only after a page's own problem/contest/daily-quiz authorization. */
export async function issueSourceGrant(uid: number, domainId: string, source: TrainingSource, now = new Date()) {
    if (!Number.isSafeInteger(uid) || uid <= 1 || !domainId || !['problem', 'daily', 'ide'].includes(source.kind)
        || !Number.isSafeInteger(source.pid) || (source.kind === 'ide' ? source.pid !== 0 : source.pid < 1)) {
        throw new ValidationError('trainingSource');
    }
    const grant: TrainingGrant = { _id: opaque(), uid, domainId, source, expiresAt: new Date(+now + TRAINING_GRANT_MS) };
    await grants.insertOne(grant);
    return grant._id;
}

export async function getSourceGrant(uid: number, domainId: string, token: unknown, now = new Date()) {
    if (!isOpaque(token)) throw new ValidationError('sourceToken');
    return grants.findOne({ _id: token, uid, domainId, expiresAt: { $gt: now } });
}

/** Durable outbox: state owns the cumulative counters. Daily rows are absolute
 * versioned projections, so a crash/retry cannot add an interval twice. The
 * indexed background drain repairs a final pulse even if the learner leaves. */
export async function flushState(state: TrainingState) {
    if (!state?.dirty) return;
    for (const bucket of state.buckets) {
        const snapshot: TrainingDaily = {
            _id: JSON.stringify([state._id, bucket.domainId, bucket.day]),
            uid: state._id, domainId: bucket.domainId, day: bucket.day,
            seconds: bucket.milliseconds / 1000, version: state.version,
            sources: bucket.sources.map(({ milliseconds, ...source }) => ({ ...source, seconds: milliseconds / 1000 })),
            intervals: bucket.intervals || [],
            startedAt: bucket.startedAt, updatedAt: bucket.updatedAt || bucket.startedAt,
        };
        try {
            await daily.replaceOne({ _id: snapshot._id, $or: [
                { version: { $lt: state.version } }, { version: { $exists: false } },
            ] }, snapshot, { upsert: true });
        } catch (error) {
            // A competing insert can also win with an older snapshot. Only an
            // already durable equivalent or newer version completes our write.
            if (error.code !== 11000 || !await daily.findOne(
                { _id: snapshot._id, version: { $gte: state.version } }, { projection: { _id: 1 } },
            )) throw error;
        }
    }
    await states.updateOne({ _id: state._id, version: state.version }, { $set: { dirty: false } });
}

async function project(state: TrainingState) {
    try { await flushState(state); } catch (error) { logger.warn('Training snapshot will be retried', error); }
}

interface SessionReply { accepted: boolean; sessionId?: string; refreshSource?: boolean }
type Transition = { reply: SessionReply, write: boolean } | null;

async function mutate(uid: number, now: Date, update: (state: TrainingState) => Transition | Promise<Transition>): Promise<SessionReply | null> {
    for (let attempt = 0; attempt < 8; attempt++) {
        const previous = await states.findOne({ _id: uid });
        const state: TrainingState = previous || {
            _id: uid, version: 0, dirty: false, buckets: [], updatedAt: now, lease: null, starts: [],
        };
        const previousVersion = state.version;
        // A flushed previous day's snapshot is now permanent in daily. Never
        // discard unflushed dates, including after a failed database write.
        state.replaced = (state.replaced || []).filter((lease) => +now - +lease.replacedAt <= TRAINING_MAX_GAP_MS);
        // A displaced tab's final keepalive may arrive after the next page
        // starts. Keep both sides of a midnight handoff in the outbox until
        // its previous-day absolute projection can no longer be amended.
        const openDay = trainingDay(Math.min(+now, +(state.lease?.lastAt || now), ...state.replaced.map((lease) => +lease.lastAt)));
        if (!state.dirty) state.buckets = state.buckets.filter((bucket) => bucket.day >= openDay);
        const transition = await update(state);
        if (!transition?.write) {
            if (state.dirty) await project(state);
            return transition?.reply || null;
        }
        state.version++;
        state.updatedAt = new Date(Math.max(+state.updatedAt, +now));
        state.dirty = true;
        if (!previous) {
            try { await states.insertOne(state); } catch (error) {
                if (error.code === 11000) continue;
                throw error;
            }
        } else if (!(await states.replaceOne({ _id: uid, version: previousVersion }, state)).matchedCount) continue;
        await project(state);
        return transition.reply;
    }
    // A busy document is a temporary storage failure, not a lost lease. The
    // client retries the same start or sends a later pulse after a 5xx.
    throw new Error('Training ledger write contention');
}

const isRequestId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value);

export async function startSession(uid: number, domainId: string, token: unknown, requestId: unknown, now = new Date()) {
    if (!isRequestId(requestId)) throw new ValidationError('requestId');
    const grant = await getSourceGrant(uid, domainId, token, now);
    if (!grant) return { accepted: false, refreshSource: true };
    const result = await mutate(uid, now, (state) => {
        const prior = state.starts.find((start) => start.requestId === requestId && start.grant === grant._id);
        if (prior) {
            // Replayed start requests may never reclaim a newer tab/device.
            return { reply: prior.sessionId && state.lease?.sessionId === prior.sessionId
                ? { accepted: true, sessionId: prior.sessionId } : { accepted: false }, write: false };
        }
        // Older clients have plain random request IDs. New clients add a
        // fixed-width ordinal per binding so a delayed START cannot steal a
        // lease already granted to the next question in the same binding.
        const stream = /^([a-f0-9]{32}_)\d{10}$/.exec(requestId)?.[1];
        if (stream && state.starts.some((item) => item.requestId.length === requestId.length
            && item.requestId.startsWith(stream) && item.requestId > requestId)) {
            return { reply: { accepted: false }, write: false };
        }
        const sessionId = opaque();
        const handoff = new Date(Math.max(+state.updatedAt, +now));
        if (state.lease && +state.lease.lastAt < Math.min(+handoff, +state.lease.expiresAt)
            && +handoff - +state.lease.lastAt <= TRAINING_MAX_GAP_MS) {
            state.replaced = [...state.replaced.slice(-63), { ...state.lease, replacedAt: handoff }];
        }
        state.lease = { sessionId, domainId, source: grant.source,
            lastAt: handoff, lastSeq: 0, expiresAt: grant.expiresAt };
        state.starts = [...state.starts.slice(-63), { requestId, grant: grant._id, sessionId }];
        return { reply: { accepted: true, sessionId }, write: true };
    });
    return result || { accepted: false };
}

async function openBucket(state: TrainingState, domainId: string, day: string, keepDays: string[], start: number) {
    const current = state.buckets.find((bucket) => bucket.domainId === domainId && bucket.day === day);
    if (current) return current;
    if (state.buckets.length >= MAX_OPEN_BUCKETS) {
        const index = state.buckets.findIndex((bucket) => bucket.domainId !== domainId || !keepDays.includes(bucket.day));
        state.buckets.splice(index, 1);
    }
    // A clean bucket can be evicted when a learner visits many classrooms in
    // one day. Its next absolute projection must build on the durable total.
    const row = await daily.findOne({ _id: JSON.stringify([state._id, domainId, day]) });
    if (row) state.version = Math.max(state.version, row.version || 0);
    const bucket: TrainingBucket = row ? {
        domainId, day, milliseconds: Math.round(row.seconds * 1000),
        startedAt: row.startedAt, updatedAt: row.updatedAt, intervals: row.intervals || [],
        sources: (row.sources || []).map(({ seconds, ...source }) => ({ ...source, milliseconds: Math.round(seconds * 1000) })),
    } : { domainId, day, milliseconds: 0, sources: [], startedAt: new Date(start), updatedAt: new Date(start) };
    state.buckets.push(bucket);
    return bucket;
}

export async function heartbeat(
    uid: number, domainId: string, sessionId: unknown, seq: unknown, active: unknown, discard = false, now = new Date(), delayedByMs = 0,
) {
    if (!isOpaque(sessionId)) throw new ValidationError('heartbeat');
    return settleHeartbeat(uid, domainId, sessionId, seq, active, discard, now, delayedByMs);
}

export async function closePendingStart(
    uid: number, domainId: string, token: unknown, requestId: unknown, discard = false, now = new Date(), delayedByMs = 0,
) {
    if (!isOpaque(token) || !isRequestId(requestId)) throw new ValidationError('heartbeat');
    return settleHeartbeat(uid, domainId, { token, requestId }, 1, false, discard, now, delayedByMs);
}

async function settleHeartbeat(
    uid: number, domainId: string, target: string | { token: string, requestId: string }, seq: unknown, active: unknown,
    discard: boolean, now: Date, delayedByMs: number,
) {
    if (!Number.isSafeInteger(seq) || (seq as number) < 1 || (seq as number) > 1_000_000_000
        || typeof active !== 'boolean' || typeof discard !== 'boolean' || !Number.isSafeInteger(delayedByMs)
        || delayedByMs < 0 || delayedByMs > TRAINING_MAX_GAP_MS || (active && delayedByMs)) throw new ValidationError('heartbeat');
    const result = await mutate(uid, now, async (state) => {
        let sessionId: string;
        if (typeof target === 'string') sessionId = target;
        else {
            const prior = state.starts.find((item) => item.requestId === target.requestId && item.grant === target.token);
            if (!prior) {
                // The terminal keepalive overtook START. A valid grant may
                // close only its own request, never create or replace a lease.
                if (!await getSourceGrant(uid, domainId, target.token, now)) return null;
                state.starts = [...state.starts.slice(-63), { grant: target.token, requestId: target.requestId, sessionId: null }];
                return { reply: { accepted: true }, write: true };
            }
            if (!prior.sessionId) return null;
            sessionId = prior.sessionId;
        }
        const ownsLease = state.lease?.sessionId === sessionId;
        const replaced = !ownsLease && !active ? state.replaced.find((entry) => entry.sessionId === sessionId) : null;
        const lease = ownsLease ? state.lease : replaced;
        if (!lease || lease.domainId !== domainId) return null;
        const expired = +lease.expiresAt <= +now;
        const reply = expired ? { accepted: false, ...(ownsLease && active && { refreshSource: true }) } : { accepted: true };
        if ((seq as number) <= lease.lastSeq) return { reply, write: false };
        const end = Math.min(+now - delayedByMs, +lease.expiresAt, replaced ? +replaced.replacedAt : Infinity);
        // The last server-observed event bounds freshness. A claimed retry
        // delay may shorten a recent interval, never revive a stale lease.
        const stale = +now - +lease.lastAt > TRAINING_MAX_GAP_MS;
        const intervals = trainingIntervals(+lease.lastAt, end, discard || stale);
        if (expired && !intervals.length) return { reply, write: false };
        const keepDays = intervals.map((part) => part.day);
        if (state.dirty && state.buckets.length + keepDays.length > MAX_OPEN_BUCKETS) {
            const missing = keepDays.filter((day) => !state.buckets.some((bucket) => bucket.domainId === domainId && bucket.day === day));
            if (state.buckets.length + missing.length > MAX_OPEN_BUCKETS) {
                // Persist the original CAS snapshot before applying either
                // part of a midnight pulse. Only delivered buckets may be evicted.
                await flushState(state);
                state.dirty = false;
            }
        }
        for (const interval of intervals) {
            const bucket = await openBucket(state, domainId, interval.day, keepDays, interval.start);
            const key = trainingSourceKey(lease.source);
            let source = bucket.sources.find((entry) => entry.key === key);
            if (!source && bucket.sources.length < 2000
                && state.buckets.reduce((count, item) => count + item.sources.length, 0) < 5000) {
                source = { key, ...lease.source, milliseconds: 0 };
                bucket.sources.push(source);
            }
            // Even after the source breakdown fills, retain the complete day
            // total and its timed intervals for overlap and question reporting.
            if (source) source.milliseconds += interval.milliseconds;
            bucket.milliseconds += interval.milliseconds;
            bucket.intervals ||= [];
            const previous = bucket.intervals[bucket.intervals.length - 1];
            if (previous?.end === interval.start && trainingSourceKey(previous) === key) {
                previous.end = interval.end;
            } else if (state.buckets.reduce((count, item) => count + (item.intervals?.length || 0), 0) < 10_000) {
                // Bound the durable outbox even during prolonged projection
                // failures. Counters beyond this cap remain explicitly
                // unaligned, like historical daily-only measurements.
                bucket.intervals.push({ start: interval.start, end: interval.end, ...lease.source });
                if (replaced) bucket.intervals.sort((a, b) => a.start - b.start);
            }
            if (bucket.startedAt) bucket.startedAt = new Date(Math.min(+bucket.startedAt, interval.start));
            bucket.updatedAt = new Date(Math.max(+(bucket.updatedAt || 0), interval.end));
        }
        // A backwards server clock never credits the intervening span.
        lease.lastAt = new Date(Math.max(+lease.lastAt, +now));
        lease.lastSeq = seq as number;
        if (replaced) state.replaced = state.replaced.filter((entry) => entry.sessionId !== sessionId);
        else if (!active) state.lease = null;
        return { reply, write: true };
    });
    return result || { accepted: false };
}

let drainCursor = 0;
export async function drainPending(limit = 50) {
    const next = (after: number) => states.find({ dirty: true, _id: { $gt: after } }).sort({ _id: 1 }).limit(limit).toArray();
    let pending = await next(drainCursor);
    if (!pending.length && drainCursor) pending = await next(0);
    // Rotate bounded batches even when the first learner needs repeated retries.
    drainCursor = pending.length === limit ? pending[pending.length - 1]._id : 0;
    for (const state of pending) await project(state);
}

export async function apply(ctx: Context) {
    await Promise.all([
        db.ensureIndexes(grants, { key: { expiresAt: 1 }, name: 'training_grant_expiry', expireAfterSeconds: 0 }),
        db.ensureIndexes(states, { key: { dirty: 1, _id: 1 }, name: 'training_pending_by_learner' }),
        db.ensureIndexes(daily,
            { key: { uid: 1, domainId: 1, day: 1 }, name: 'training_uid_domain_day', unique: true },
            { key: { domainId: 1, day: 1, uid: 1 }, name: 'training_domain_day' }),
        meta.updateOne({ _id: 'collection' }, { $setOnInsert: { startedAt: new Date() } }, { upsert: true }),
    ]);
    // A single small indexed batch, independent of the number of historical
    // days. No process-local interval is created for individual learners.
    if (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0') {
        ctx.interval(() => drainPending().catch((error) => logger.warn('Training projection retry failed', error)), 30_000);
    }
}
