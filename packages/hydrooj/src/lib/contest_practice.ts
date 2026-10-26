import type { Tdoc } from '../interface';

/** Only a participant's finished flexible contest can become ordinary practice. */
export function getContestPracticeWindow(tdoc?: Tdoc, status?: any, now = Date.now()) {
    if (!tdoc || !['acm', 'oi', 'ioi', 'ledo', 'strictioi'].includes(tdoc.rule)
        || !Number.isFinite(tdoc.duration) || tdoc.duration <= 0 || !status?.attend || !status.startAt) return null;
    const startAt = +new Date(status.startAt);
    const beginAt = +new Date(tdoc.beginAt);
    const contestEndAt = +new Date(tdoc.endAt);
    const personalEndAt = status.endAt ? +new Date(status.endAt) : Infinity;
    if (![startAt, beginAt, contestEndAt].every(Number.isFinite) || Number.isNaN(personalEndAt)
        || startAt > now || beginAt > now) return null;
    const endAt = Math.min(contestEndAt, personalEndAt, startAt + tdoc.duration * 3600_000);
    return { active: now >= endAt, endAt, contestId: String(tdoc.docId) };
}
