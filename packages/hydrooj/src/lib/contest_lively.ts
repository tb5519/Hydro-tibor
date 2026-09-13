import { randomInt } from 'node:crypto';
import type { Collection, ObjectId } from 'mongodb';
import type { Context } from '../context';
import * as document from '../model/document';
import db from '../service/db';

const MINUTE = 60 * 1000;
const SHANGHAI_OFFSET = 8 * 60 * MINUTE;

export interface ContestLivelyState {
    attend?: number;
    lively?: boolean;
    livelyBonus?: number;
    livelyEnabledAt?: Date;
    livelyDay?: string;
    livelyScheduledAt?: Date;
}

interface LivelyContestDocument extends ContestLivelyState {
    _id: ObjectId;
    docType: number;
    rule: string;
    endAt: Date;
}

/** China uses UTC+8 all year; the schedule must not depend on the server's timezone. */
export function getContestLivelyWindow(now: Date) {
    const day = new Date(now.getTime() + SHANGHAI_OFFSET).toISOString().slice(0, 10);
    return {
        day,
        startAt: new Date(`${day}T19:00:00+08:00`),
        endAt: new Date(`${day}T23:00:00+08:00`),
    };
}

function count(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Display-only decoration. Actual attendance remains the sole input to judging and points. */
export function getDisplayAttend(tdoc: ContestLivelyState) {
    return count(tdoc.attend) + (tdoc.lively ? count(tdoc.livelyBonus) : 0);
}

/**
 * Plan and apply at most one increment per China calendar day. Each update uses
 * compare-and-set conditions, so parallel workers, retries and restarts cannot
 * count a day twice. Clearing the pending date also records a zero-increment day.
 */
export async function runContestLively(
    now = new Date(),
    random: (max: number) => number = (max) => randomInt(max),
    collection = document.coll as unknown as Collection<LivelyContestDocument>,
) {
    const window = getContestLivelyWindow(now);
    const result = { scheduled: 0, awarded: 0, added: 0 };
    // Do not backfill missed days or apply a delayed increment after 23:00.
    if (now < window.startAt || now >= window.endAt) return result;
    const active = {
        docType: document.TYPE_CONTEST,
        rule: { $ne: 'homework' },
        lively: true,
        livelyEnabledAt: { $lte: now },
        endAt: { $gt: now },
    };
    const candidates = collection.find({
        ...active,
        $or: [
            { livelyDay: { $ne: window.day } },
            { livelyDay: window.day, livelyScheduledAt: { $lte: now } },
        ],
    }, {
        projection: { _id: 1, livelyEnabledAt: 1, livelyDay: 1 },
    });
    for await (const tdoc of candidates) {
        const unchanged = { ...active, _id: tdoc._id, livelyEnabledAt: tdoc.livelyEnabledAt };
        if (tdoc.livelyDay !== window.day) {
            const earliest = Math.max(window.startAt.getTime(), tdoc.livelyEnabledAt.getTime());
            // Use minute-sized slots so the last slot is picked up before 23:00.
            const slots = Math.max(1, Math.floor((window.endAt.getTime() - MINUTE - earliest) / MINUTE) + 1);
            const scheduledAt = new Date(earliest + random(slots) * MINUTE);
            const planned = await collection.updateOne({
                ...unchanged, livelyDay: { $ne: window.day },
            }, {
                $set: { livelyDay: window.day, livelyScheduledAt: scheduledAt },
            });
            result.scheduled += planned.modifiedCount;
        }
        const increment = random(3);
        const awarded = await collection.updateOne({
            ...unchanged,
            livelyDay: window.day,
            livelyScheduledAt: { $gte: window.startAt, $lte: now },
        }, {
            $inc: { livelyBonus: increment },
            $unset: { livelyScheduledAt: '' },
        });
        result.awarded += awarded.modifiedCount;
        result.added += awarded.modifiedCount * increment;
    }
    return result;
}

export async function applyContestLively(ctx: Context) {
    await db.ensureIndexes(document.coll, {
        name: 'contest_lively_active',
        key: { docType: 1, lively: 1, endAt: 1 },
    });
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            await runContestLively();
        } catch (error) {
            ctx.logger.warn('Unable to update contest display attendance: %o', error);
        } finally {
            running = false;
        }
    };
    ctx.interval(tick, MINUTE);
    await tick();
}
