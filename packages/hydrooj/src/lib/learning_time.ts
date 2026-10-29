import { trainingDay, TrainingInterval, TrainingSource } from './training_time';

interface DailyTime {
    uid: number;
    domainId: string;
    day: string;
    seconds: number;
    startedAt?: Date;
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
    trainingUpperSeconds: number;
    uncertainSeconds: number;
    classSeconds: number;
    overlapSeconds: number;
    overlapUpperSeconds: number;
    legacySeconds: number;
    last: number;
}

const emptyStats = (): TimeStats => ({ seconds: 0, trainingSeconds: 0, trainingUpperSeconds: 0, uncertainSeconds: 0,
    classSeconds: 0, overlapSeconds: 0, overlapUpperSeconds: 0, legacySeconds: 0, last: 0 });
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

/** Both inputs are ordered, non-overlapping unions. Retain the attribution of
 * the source while removing occupied time; no gaps are turned into activity. */
function subtractSpans(spans: Span[], masks: Span[]) {
    const result: Span[] = [];
    let index = 0;
    for (const span of spans) {
        let cursor = span.start;
        while (index < masks.length && masks[index].end <= cursor) index++;
        let maskIndex = index;
        while (maskIndex < masks.length && masks[maskIndex].start < span.end) {
            const mask = masks[maskIndex++];
            if (mask.start > cursor) result.push({ ...span, start: cursor, end: Math.min(mask.start, span.end) });
            cursor = Math.max(cursor, Math.min(mask.end, span.end));
        }
        if (cursor < span.end) result.push({ ...span, start: cursor });
    }
    return result;
}

function spanSeconds(spans: Span[], from = -Infinity, to = Infinity) {
    return spans.reduce((total, span) => total + Math.max(0, Math.min(span.end, to) - Math.max(span.start, from)) / 1000, 0);
}

/** A counter's activity can be anywhere in its available window. Bounds follow
 * from capacity alone, never proportional distribution or invented intervals. */
function counterBounds(seconds: number, capacity: number, targetCapacity: number) {
    return {
        lower: Math.max(0, seconds - Math.max(0, capacity - targetCapacity)),
        upper: Math.min(seconds, targetCapacity),
    };
}

interface MergeOptions {
    /** All lessons mask training, but only these classrooms contribute class
     * totals. This preserves cross-classroom de-duplication under a filter. */
    classDomainIds?: string[];
}

/** Merge server-measured training with imported class windows. Query bounds
 * are inclusive/exclusive. Dashboard requests use whole Shanghai days;
 * daily-only historical counters use their recorded activity envelope to
 * report provable bounds. Their timestamps are never reconstructed. */
export function mergeLearningTime(rows: DailyTime[], lessons: LearningLesson[], fromMs: number, toMs: number, options: MergeOptions = {}) {
    const students = new Map<number, TimeStats & { _id: number }>();
    const domains = new Map<string, TimeStats & { _id: string }>();
    const days = new Map<string, TimeStats & { _id: string }>();
    const sources = new Map<string, { uid: number, domainId: string, kind: TrainingSource['kind'], pid: number,
        seconds: number, trainingUpperSeconds: number, uncertainSeconds: number,
        classTrainingSeconds: number, classTrainingUpperSeconds: number }>();
    const precise = new Map<number, Span[]>();
    const captured = new Map<number, Span[]>();
    const classes = new Map<number, Span[]>();
    const countedClasses = new Map<number, Span[]>();
    const countedDomains = options.classDomainIds ? new Set(options.classDomainIds) : null;
    const historical: { row: DailyTime, seconds: number, dayStart: number, dayEnd: number,
        sources: { kind: TrainingSource['kind'], pid: number, seconds: number }[] }[] = [];
    const add = (uid: number, domainId: string, day: string, values: Partial<TimeStats>) => {
        const targets = [
            students.get(uid) || students.set(uid, { _id: uid, ...emptyStats() }).get(uid),
            domains.get(domainId) || domains.set(domainId, { _id: domainId, ...emptyStats() }).get(domainId),
            days.get(day) || days.set(day, { _id: day, ...emptyStats() }).get(day),
        ];
        for (const target of targets) {
            target.trainingSeconds += values.trainingSeconds || 0;
            target.trainingUpperSeconds += values.trainingUpperSeconds ?? values.trainingSeconds ?? 0;
            target.uncertainSeconds = Math.max(0, target.trainingUpperSeconds - target.trainingSeconds);
            target.classSeconds += values.classSeconds || 0;
            target.overlapSeconds += values.overlapSeconds || 0;
            target.overlapUpperSeconds += values.overlapUpperSeconds ?? values.overlapSeconds ?? 0;
            target.legacySeconds += values.legacySeconds || 0;
            target.last = Math.max(target.last, values.last || 0);
            target.seconds = target.trainingSeconds + target.classSeconds;
        }
    };
    const addSource = (uid: number, domainId: string, source: TrainingSource, seconds: number, overlap = 0,
        upper = seconds, overlapUpper = overlap) => {
        const key = JSON.stringify([uid, domainId, source.kind, source.pid]);
        const entry = sources.get(key) || { uid, domainId, ...source, seconds: 0, trainingUpperSeconds: 0, uncertainSeconds: 0,
            classTrainingSeconds: 0, classTrainingUpperSeconds: 0 };
        entry.seconds += seconds;
        entry.trainingUpperSeconds += upper;
        entry.uncertainSeconds = Math.max(0, entry.trainingUpperSeconds - entry.seconds);
        entry.classTrainingSeconds += overlap;
        entry.classTrainingUpperSeconds += overlapUpper;
        sources.set(key, entry);
    };
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
        return { students: [], domains: [], days: [], sources: [], legacySeconds: 0, uncertainSeconds: 0 };
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
            const recorded = captured.get(row.uid) || [];
            recorded.push({ ...span, domainId: row.domainId });
            captured.set(row.uid, recorded);
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
        const oldSources = [];
        for (const source of row.sources || []) {
            const unaligned = Math.max(0, duration(source.seconds) - (capturedBySource.get(`${source.kind}:${source.pid}`) || 0) / 1000);
            if (unaligned) oldSources.push({ kind: source.kind, pid: source.pid, seconds: Math.min(unaligned, legacy) });
        }
        if (legacy) historical.push({ row, seconds: legacy, dayStart, dayEnd, sources: oldSources });
    }
    for (const lesson of lessons) {
        const start = Math.max(+lesson.startAt, fromMs);
        const end = Math.min(+lesson.endAt, toMs);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
        const list = classes.get(lesson.uid) || [];
        list.push({ start, end, domainId: lesson.domainId });
        classes.set(lesson.uid, list);
        if (!countedDomains || countedDomains.has(lesson.domainId)) {
            const counted = countedClasses.get(lesson.uid) || [];
            counted.push({ start, end, domainId: lesson.domainId });
            countedClasses.set(lesson.uid, counted);
        }
    }
    for (const [uid, spans] of classes) classes.set(uid, unionSpans(spans));
    for (const [uid, spans] of captured) captured.set(uid, unionSpans(spans));
    for (const { row, seconds, dayStart, dayEnd, sources: oldSources } of historical) {
        const start = +row.startedAt;
        const end = +row.updatedAt;
        const hasEnvelope = Number.isFinite(start) && Number.isFinite(end) && start < end
            && start < dayEnd && end > dayStart;
        const support = (useEnvelope: boolean) => subtractSpans([{
            start: useEnvelope ? Math.max(dayStart, start) : dayStart,
            end: useEnvelope ? Math.min(dayEnd, end) : dayEnd,
            domainId: row.domainId,
        }], captured.get(row.uid) || []);
        let available = support(hasEnvelope);
        // Inconsistent timestamps cannot prove that all old time was in class.
        if (spanSeconds(available) + 0.000001 < seconds) available = support(false);
        const capacity = Math.max(seconds, spanSeconds(available));
        const inQuery = spanSeconds(available, fromMs, toMs);
        const autonomousCapacity = spanSeconds(subtractSpans(available, classes.get(row.uid) || []), fromMs, toMs);
        const classCapacity = Math.max(0, inQuery - autonomousCapacity);
        const autonomous = counterBounds(seconds, capacity, autonomousCapacity);
        const overlap = counterBounds(seconds, capacity, classCapacity);
        add(row.uid, row.domainId, row.day, {
            trainingSeconds: autonomous.lower, trainingUpperSeconds: autonomous.upper,
            overlapSeconds: overlap.lower, overlapUpperSeconds: overlap.upper,
            legacySeconds: Math.min(seconds, inQuery),
            last: inQuery > 0 ? (Number.isFinite(end) ? Math.min(end, toMs) : dayStart) : 0,
        });
        for (const source of oldSources) {
            // Each source has its own provable bounds. Do not spread the day's
            // total proportionally across questions whose timing is unknown.
            const trainingBounds = counterBounds(source.seconds, capacity, autonomousCapacity);
            const classBounds = counterBounds(source.seconds, capacity, classCapacity);
            addSource(row.uid, row.domainId, source, trainingBounds.lower, classBounds.lower,
                trainingBounds.upper, classBounds.upper);
        }
    }
    for (const [uid, spans] of countedClasses) {
        const union = unionSpans(spans);
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
        uncertainSeconds: [...students.values()].reduce((total, student) => total + student.uncertainSeconds, 0),
    };
}
