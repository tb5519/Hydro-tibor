import { trainingDay, TrainingInterval, TrainingSource } from './training_time';

interface DailyTime {
    uid: number;
    domainId: string;
    day: string;
    seconds: number;
    updatedAt?: Date;
    sources?: (TrainingSource & { seconds: number })[];
    intervals?: TrainingInterval[];
}

export interface LearningLesson {
    uid: number;
    domainId: string;
    startAt: Date;
    endAt: Date;
    externalId?: string;
    title?: string;
}

interface Span {
    start: number;
    end: number;
    domainId: string;
    kind?: TrainingSource['kind'];
    pid?: number;
}

interface TimeStats {
    seconds: number;
    trainingSeconds: number;
    classSeconds: number;
    overlapSeconds: number;
    legacySeconds: number;
    last: number;
}

const emptyStats = (): TimeStats => ({ seconds: 0, trainingSeconds: 0, classSeconds: 0, overlapSeconds: 0, legacySeconds: 0, last: 0 });
const duration = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
const spanKey = (span: Span) => JSON.stringify([span.domainId, span.kind || '', span.pid ?? 0]);

/** Deterministic interval union. Attribution only breaks ties between
 * overlapping classrooms; it never increases a learner's elapsed time. */
function unionSpans(spans: Span[]) {
    const events = spans.flatMap((span) => [{ at: span.start, delta: 1, span }, { at: span.end, delta: -1, span }])
        .sort((a, b) => a.at - b.at);
    const active = new Map<string, { count: number, span: Span }>();
    const result: Span[] = [];
    let cursor = events[0]?.at;
    for (let index = 0; index < events.length;) {
        const at = events[index].at;
        if (at > cursor && active.size) {
            const key = [...active.keys()].sort()[0];
            const source = active.get(key).span;
            const previous = result[result.length - 1];
            if (previous?.end === cursor && spanKey(previous) === key) previous.end = at;
            else result.push({ ...source, start: cursor, end: at });
        }
        while (index < events.length && events[index].at === at) {
            const event = events[index++];
            const key = spanKey(event.span);
            const count = (active.get(key)?.count || 0) + event.delta;
            if (count) active.set(key, { count, span: event.span });
            else active.delete(key);
        }
        cursor = at;
    }
    return result;
}

function splitDays(start: number, end: number, visit: (day: string, seconds: number, end: number) => void) {
    for (let cursor = start; cursor < end;) {
        const day = trainingDay(cursor);
        const next = Math.min(end, Date.parse(`${day}T00:00:00+08:00`) + 86400_000);
        visit(day, (next - cursor) / 1000, next);
        cursor = next;
    }
}

/** Merge server-measured training with imported class windows. Query bounds
 * are inclusive/exclusive. Dashboard requests use whole Shanghai days;
 * daily-only historical counters are retained and reported as unaligned,
 * because their timestamps cannot truthfully be reconstructed. */
export function mergeLearningTime(rows: DailyTime[], lessons: LearningLesson[], fromMs: number, toMs: number) {
    const students = new Map<number, TimeStats & { _id: number }>();
    const domains = new Map<string, TimeStats & { _id: string }>();
    const days = new Map<string, TimeStats & { _id: string }>();
    const sources = new Map<string, { uid: number, domainId: string, kind: TrainingSource['kind'], pid: number,
        seconds: number, classTrainingSeconds: number }>();
    const precise = new Map<number, Span[]>();
    const classes = new Map<number, Span[]>();
    const add = (uid: number, domainId: string, day: string, values: Partial<TimeStats>) => {
        const targets = [
            students.get(uid) || students.set(uid, { _id: uid, ...emptyStats() }).get(uid),
            domains.get(domainId) || domains.set(domainId, { _id: domainId, ...emptyStats() }).get(domainId),
            days.get(day) || days.set(day, { _id: day, ...emptyStats() }).get(day),
        ];
        for (const target of targets) {
            target.trainingSeconds += values.trainingSeconds || 0;
            target.classSeconds += values.classSeconds || 0;
            target.overlapSeconds += values.overlapSeconds || 0;
            target.legacySeconds += values.legacySeconds || 0;
            target.last = Math.max(target.last, values.last || 0);
            target.seconds = target.trainingSeconds + target.classSeconds;
        }
    };
    const addSource = (uid: number, domainId: string, source: TrainingSource, seconds: number, overlap = 0) => {
        const key = JSON.stringify([uid, domainId, source.kind, source.pid]);
        const entry = sources.get(key) || { uid, domainId, ...source, seconds: 0, classTrainingSeconds: 0 };
        entry.seconds += seconds;
        entry.classTrainingSeconds += overlap;
        sources.set(key, entry);
    };
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
        return { students: [], domains: [], days: [], sources: [], legacySeconds: 0 };
    }
    for (const row of rows) {
        const dayStart = Date.parse(`${row.day}T00:00:00+08:00`);
        const dayEnd = dayStart + 86400_000;
        if (!Number.isFinite(dayStart) || dayStart >= toMs || dayEnd <= fromMs) continue;
        const valid = (row.intervals || []).filter((span) => Number.isFinite(span.start) && Number.isFinite(span.end)
            && span.end > span.start && span.start >= dayStart && span.end <= dayEnd
            && ['problem', 'daily', 'ide'].includes(span.kind) && Number.isSafeInteger(span.pid));
        const capturedBySource = new Map<string, number>();
        let capturedMilliseconds = 0;
        for (const span of valid) {
            const milliseconds = span.end - span.start;
            capturedMilliseconds += milliseconds;
            const key = `${span.kind}:${span.pid}`;
            capturedBySource.set(key, (capturedBySource.get(key) || 0) + milliseconds);
            const start = Math.max(span.start, fromMs);
            const end = Math.min(span.end, toMs);
            if (start < end) {
                const list = precise.get(row.uid) || [];
                list.push({ ...span, start, end, domainId: row.domainId });
                precise.set(row.uid, list);
            }
        }
        const legacy = Math.max(0, duration(row.seconds) - capturedMilliseconds / 1000);
        if (legacy) add(row.uid, row.domainId, row.day, { trainingSeconds: legacy, legacySeconds: legacy,
            last: Number.isFinite(+row.updatedAt) ? Math.min(+row.updatedAt, toMs) : dayStart });
        for (const source of row.sources || []) {
            const unaligned = Math.max(0, duration(source.seconds) - (capturedBySource.get(`${source.kind}:${source.pid}`) || 0) / 1000);
            if (unaligned) addSource(row.uid, row.domainId, { kind: source.kind, pid: source.pid }, unaligned);
        }
    }
    for (const lesson of lessons) {
        const start = Math.max(+lesson.startAt, fromMs);
        const end = Math.min(+lesson.endAt, toMs);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
        const list = classes.get(lesson.uid) || [];
        list.push({ start, end, domainId: lesson.domainId });
        classes.set(lesson.uid, list);
    }
    for (const [uid, spans] of classes) {
        const union = unionSpans(spans);
        classes.set(uid, union);
        for (const span of union) splitDays(span.start, span.end, (day, seconds, end) => {
            add(uid, span.domainId, day, { classSeconds: seconds, last: end });
        });
    }
    for (const [uid, spans] of precise) {
        const union = unionSpans(spans);
        const classSpans = classes.get(uid) || [];
        let classIndex = 0;
        for (const span of union) {
            let cursor = span.start;
            while (classIndex < classSpans.length && classSpans[classIndex].end <= cursor) classIndex++;
            let index = classIndex;
            const credit = (start: number, end: number, overlap: boolean) => splitDays(start, end, (day, seconds, last) => {
                add(uid, span.domainId, day, { trainingSeconds: overlap ? 0 : seconds, overlapSeconds: overlap ? seconds : 0, last });
                addSource(uid, span.domainId, { kind: span.kind, pid: span.pid }, overlap ? 0 : seconds, overlap ? seconds : 0);
            });
            while (index < classSpans.length && classSpans[index].start < span.end) {
                const lesson = classSpans[index++];
                if (lesson.start > cursor) credit(cursor, Math.min(lesson.start, span.end), false);
                const overlapStart = Math.max(cursor, lesson.start);
                const overlapEnd = Math.min(span.end, lesson.end);
                if (overlapStart < overlapEnd) credit(overlapStart, overlapEnd, true);
                cursor = Math.max(cursor, overlapEnd);
            }
            if (cursor < span.end) credit(cursor, span.end, false);
        }
    }
    return {
        students: [...students.values()], domains: [...domains.values()], days: [...days.values()], sources: [...sources.values()],
        legacySeconds: [...students.values()].reduce((total, student) => total + student.legacySeconds, 0),
    };
}
