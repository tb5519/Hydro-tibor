/** Activity is estimated from foreground learner interaction, never from a
 * client-supplied duration. All calendar buckets use the classroom timezone. */
export const TRAINING_HEARTBEAT_SECONDS = 30;
export const TRAINING_IDLE_SECONDS = 300;
export const TRAINING_MAX_GAP_MS = 90_000;
export const TRAINING_MAX_CREDIT_MS = 60_000;
export const TRAINING_GRANT_MS = 24 * 60 * 60 * 1000;

export interface TrainingSource {
    kind: 'problem' | 'daily' | 'ide';
    pid: number;
}

export function trainingDay(time: Date | number = Date.now()) {
    return new Date(+time + 8 * 3600_000).toISOString().slice(0, 10);
}

export function trainingSourceKey(source: TrainingSource) {
    return `${source.kind}:${source.pid}`;
}

/** Split the bounded interval rather than assigning midnight's whole pulse
 * to the following day. Fractional seconds remain intact across heartbeats. */
export function trainingIntervals(from: number, to: number, discard = false) {
    const gap = to - from;
    if (discard || gap <= 0 || gap > TRAINING_MAX_GAP_MS) return [];
    let cursor = Math.max(from, to - TRAINING_MAX_CREDIT_MS);
    const result: { day: string, milliseconds: number, end: number }[] = [];
    while (cursor < to) {
        const day = trainingDay(cursor);
        const boundary = Date.parse(`${day}T00:00:00+08:00`) + 86400_000;
        const end = Math.min(boundary, to);
        result.push({ day, milliseconds: end - cursor, end });
        cursor = end;
    }
    return result;
}
