/* eslint-disable no-await-in-loop */
import { randomBytes } from 'crypto';
import type { Context } from '../context';
import { ValidationError } from '../error';
import {
    TRAINING_GRANT_MS, trainingDay, TrainingInterval, trainingIntervals, TrainingSource, trainingSourceKey,
} from '../lib/training_time';
import { Logger } from '../logger';
import db from '../service/db';

interface TrainingGrant {
    _id: string; uid: number; domainId: string; source: TrainingSource; expiresAt: Date;
}
interface TrainingBucket {
    domainId: string; day: string; milliseconds: number; startedAt: Date; updatedAt: Date;
    sources: { key: string, kind: TrainingSource['kind'], pid: number, milliseconds: number }[];
    intervals?: TrainingInterval[];
}
interface TrainingState {
    _id: number; version: number; dirty: boolean; buckets: TrainingBucket[]; updatedAt: Date;
    lease: { sessionId: string, domainId: string, source: TrainingSource, lastAt: Date, lastSeq: number, expiresAt: Date } | null;
    starts: { requestId: string, grant: string, sessionId: string }[];
}
export interface TrainingDaily {
    _id: string; uid: number; domainId: string; day: string; seconds: number; version: number;
    sources: { key: string, kind: TrainingSource['kind'], pid: number, seconds: number }[];
    startedAt: Date; updatedAt: Date;
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
            await daily.replaceOne({ _id: snapshot._id, version: { $lt: state.version } }, snapshot, { upsert: true });
        } catch (error) {
            // A newer (or identical) projection won the race; it already
            // includes this entire state version, never only its last delta.
            if (error.code !== 11000) throw error;
        }
    }
    await states.updateOne({ _id: state._id, version: state.version }, { $set: { dirty: false } });
}

async function project(state: TrainingState) {
    try { await flushState(state); } catch (error) { logger.warn('Training snapshot will be retried', error); }
}

async function mutate<T>(uid: number, now: Date, update: (state: TrainingState) => T | null): Promise<T | null> {
    for (let attempt = 0; attempt < 8; attempt++) {
        const previous = await states.findOne({ _id: uid });
        const state: TrainingState = previous || {
            _id: uid, version: 0, dirty: false, buckets: [], updatedAt: now, lease: null, starts: [],
        };
        // A flushed previous day's snapshot is now permanent in daily. Never
        // discard unflushed dates, including after a failed database write.
        const openDay = state.lease ? trainingDay(Math.min(+state.lease.lastAt, +now)) : trainingDay(now);
        if (!state.dirty) state.buckets = state.buckets.filter((bucket) => bucket.day >= openDay);
        const result = update(state);
        if (result === null) {
            if (state.dirty) await project(state);
            return null;
        }
        const previousVersion = state.version;
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
        return result;
    }
    // Contention drops this estimate rather than inflating another lease.
    return null;
}

export async function startSession(uid: number, domainId: string, token: unknown, requestId: unknown, now = new Date()) {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) throw new ValidationError('requestId');
    const grant = await getSourceGrant(uid, domainId, token, now);
    if (!grant) return { accepted: false };
    const result = await mutate(uid, now, (state) => {
        const prior = state.starts.find((start) => start.requestId === requestId && start.grant === grant._id);
        if (prior) {
            // Replayed start requests may never reclaim a newer tab/device.
            return state.lease?.sessionId === prior.sessionId
                ? { accepted: true, sessionId: prior.sessionId } : { accepted: false };
        }
        const sessionId = opaque();
        state.lease = { sessionId, domainId, source: grant.source,
            lastAt: new Date(Math.max(+state.updatedAt, +now)), lastSeq: 0, expiresAt: grant.expiresAt };
        state.starts = [...state.starts.slice(-63), { requestId, grant: grant._id, sessionId }];
        return { accepted: true, sessionId };
    });
    return result || { accepted: false };
}

export async function heartbeat(
    uid: number, domainId: string, sessionId: unknown, seq: unknown, active: unknown, discard = false, now = new Date(),
) {
    if (!isOpaque(sessionId) || !Number.isSafeInteger(seq) || (seq as number) < 1 || (seq as number) > 1_000_000_000
        || typeof active !== 'boolean' || typeof discard !== 'boolean' || (discard && active)) throw new ValidationError('heartbeat');
    const result = await mutate(uid, now, (state) => {
        const lease = state.lease;
        if (!lease || lease.domainId !== domainId || lease.sessionId !== sessionId || +lease.expiresAt <= +now) return null;
        if ((seq as number) <= lease.lastSeq) return { accepted: true };
        for (const interval of trainingIntervals(+lease.lastAt, +now, discard)) {
            let bucket = state.buckets.find((entry) => entry.domainId === domainId && entry.day === interval.day);
            if (!bucket) {
                if (state.buckets.length >= 100) continue;
                bucket = { domainId, day: interval.day, milliseconds: 0, sources: [], startedAt: lease.lastAt,
                    updatedAt: new Date(interval.end) };
                state.buckets.push(bucket);
            }
            const key = trainingSourceKey(lease.source);
            let source = bucket.sources.find((entry) => entry.key === key);
            if (!source) {
                if (bucket.sources.length >= 2000
                    || state.buckets.reduce((count, item) => count + item.sources.length, 0) >= 5000) continue;
                source = { key, ...lease.source, milliseconds: 0 };
                bucket.sources.push(source);
            }
            source.milliseconds += interval.milliseconds;
            bucket.milliseconds += interval.milliseconds;
            bucket.intervals ||= [];
            const previous = bucket.intervals[bucket.intervals.length - 1];
            if (previous?.end === interval.start && previous.kind === lease.source.kind && previous.pid === lease.source.pid) {
                previous.end = interval.end;
            } else if (state.buckets.reduce((count, item) => count + (item.intervals?.length || 0), 0) < 10_000) {
                // Bound the durable outbox even during prolonged projection
                // failures. Counters beyond this cap remain explicitly
                // unaligned, like historical daily-only measurements.
                bucket.intervals.push({ start: interval.start, end: interval.end, ...lease.source });
            }
            bucket.updatedAt = new Date(interval.end);
        }
        // A backwards server clock never credits the intervening span.
        lease.lastAt = new Date(Math.max(+lease.lastAt, +now));
        lease.lastSeq = seq as number;
        if (!active) state.lease = null;
        return { accepted: true };
    });
    return result || { accepted: false };
}

export async function drainPending(limit = 50) {
    const pending = await states.find({ dirty: true }).limit(limit).toArray();
    for (const state of pending) await project(state);
}

export async function apply(ctx: Context) {
    await Promise.all([
        db.ensureIndexes(grants, { key: { expiresAt: 1 }, name: 'training_grant_expiry', expireAfterSeconds: 0 }),
        db.ensureIndexes(states, { key: { dirty: 1 }, name: 'training_pending' }),
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
