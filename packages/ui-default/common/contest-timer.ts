export interface ActiveContestTimer {
  id: string;
  title: string;
  url: string;
  beginAt: number;
  endAt: number;
}

export interface ContestTimerSnapshot {
  serverNow: number;
  contests: ActiveContestTimer[];
}

type Timestamp = Date | string | number;

/** Match the judge's deadline, including individual duration and early hand-in. */
export function getContestTimerWindow(
  contest: { rule: string, beginAt: Timestamp, endAt: Timestamp, duration?: number },
  status: { attend?: number, startAt?: Timestamp, endAt?: Timestamp } | null | undefined,
  now: number,
) {
  if (!status?.attend || contest.rule === 'homework') return null;
  const contestBegin = new Date(contest.beginAt).getTime();
  const contestEnd = new Date(contest.endAt).getTime();
  if (!Number.isFinite(contestBegin) || !Number.isFinite(contestEnd) || contestBegin > now) return null;
  let beginAt = contestBegin;
  let endAt = contestEnd;
  if (contest.duration) {
    if (!status.startAt || !Number.isFinite(contest.duration) || contest.duration <= 0) return null;
    beginAt = Math.max(contestBegin, new Date(status.startAt).getTime());
    endAt = Math.min(endAt, new Date(status.startAt).getTime() + Math.floor(contest.duration * 3600000));
  }
  if (status.endAt) endAt = Math.min(endAt, new Date(status.endAt).getTime());
  if (!Number.isFinite(beginAt) || !Number.isFinite(endAt) || beginAt > now || endAt <= now) return null;
  return { beginAt, endAt };
}

export function formatContestCountdown(remainingMs: number) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
