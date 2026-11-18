import { trainingDay, TrainingInterval, TrainingSource, trainingSourceKey } from './training_time';

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
    problemDomainId?: string;
}

interface TimeStats {
    seconds: number;
    trainingSeconds: number;
    trainingUpperSeconds: number;
    trainingEstimatedSeconds: number;
    estimatedSeconds: number;
    hasEstimate: boolean;
    estimationMethod?: EstimationMethod;
    uncertainSeconds: number;
    classSeconds: number;
    overlapSeconds: number;
    overlapUpperSeconds: number;
    overlapEstimatedSeconds: number;
    unattributedEstimatedSeconds: number;
    unattributedClassTrainingEstimatedSeconds: number;
    legacySeconds: number;
    last: number;
}

type EstimationMethod = 'activity-window' | 'bounds-midpoint' | 'mixed';
const emptyStats = (): TimeStats => ({ seconds: 0, trainingSeconds: 0, trainingUpperSeconds: 0, trainingEstimatedSeconds: 0,
    estimatedSeconds: 0, hasEstimate: false, uncertainSeconds: 0, classSeconds: 0,
    overlapSeconds: 0, overlapUpperSeconds: 0, overlapEstimatedSeconds: 0,
    unattributedEstimatedSeconds: 0, unattributedClassTrainingEstimatedSeconds: 0, legacySeconds: 0, last: 0 });
const duration = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
const spanKey = (span: Span) => JSON.stringify([span.domainId, span.kind || '', span.pid ?? 0, span.problemDomainId || '']);

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

/** Estimate missing timestamps, never missing active seconds. With a credible
 * activity window, use its available time as a uniform-activity assumption.
 * Without that window, the feasible midpoint avoids pretending the learner
 * was uniformly active over an entire day. Neither is a measured interval. */
function counterEstimate(bounds: { lower: number, upper: number }, seconds: number, capacity: number,
    targetCapacity: number, hasEnvelope: boolean) {
    const estimate = hasEnvelope && capacity > 0 ? seconds * targetCapacity / capacity : (bounds.lower + bounds.upper) / 2;
    return Math.max(bounds.lower, Math.min(bounds.upper, estimate));
}

function mergeMethod(previous?: EstimationMethod, next?: EstimationMethod): EstimationMethod | undefined {
    if (!next) return previous;
    return !previous || previous === next ? next : 'mixed';
}

interface LegacyAllocation {
    seconds: number;
    available: Span[];
    autonomous: ReturnType<typeof counterBounds>;
    overlap: ReturnType<typeof counterBounds>;
    autonomousEstimate: number;
    overlapEstimate: number;
}

/** Legacy counters share one learner lease even across classrooms. When
 * complete counters have overlapping windows, their combined estimates must
 * fit the available clock time on either side of the lessons. */
function constrainLegacyEstimates(entries: LegacyAllocation[], lessons: Span[]) {
    if (entries.length < 2) return;
    const available = unionSpans(entries.flatMap((entry) => entry.available));
    const capacity = spanSeconds(available);
    const independent = subtractSpans(available, lessons);
    const independentCapacity = spanSeconds(independent);
    const total = entries.reduce((n, entry) => n + entry.seconds, 0);
    const lowerSum = entries.reduce((n, entry) => n + entry.autonomous.lower, 0);
    const upperSum = entries.reduce((n, entry) => n + entry.autonomous.upper, 0);
    const lower = Math.max(lowerSum, total - (capacity - independentCapacity));
    const upper = Math.min(upperSum, independentCapacity);
    if (lower > upper + 0.000001) return; // Inconsistent input cannot justify tighter bounds.
    const first = (entry: LegacyAllocation) => entry.available[0].start;
    const last = (entry: LegacyAllocation) => entry.available[entry.available.length - 1].end;
    const boundaries = [...new Set(entries.flatMap((entry) => [first(entry), last(entry)]))].sort((a, b) => a - b);
    const slots = boundaries.slice(1).map((end, i) => {
        const start = boundaries[i];
        const all = spanSeconds(available, start, end);
        const training = spanSeconds(independent, start, end);
        return { start, end, all, training, lesson: all - training };
    });
    // Known intervals are excluded from every window. Between any two window
    // endpoints, all covering counters can use the same three capacities.
    // Earliest-deadline first assigns a feasible amount when one exists.
    const allocate = (kind: 'training' | 'lesson' | 'all', backward = false) => {
        const order = entries.map((_, i) => i).sort((a, b) => backward
            ? first(entries[b]) - first(entries[a]) : last(entries[a]) - last(entries[b]));
        const cells = (backward ? [...slots].reverse() : slots).map((slot) => ({ ...slot, free: slot[kind] }));
        const allocated = entries.map(() => 0);
        for (const i of order) {
            const entry = entries[i];
            let needed = kind === 'all' ? entry.seconds : kind === 'training' ? entry.autonomousEstimate : entry.overlapEstimate;
            for (const cell of cells) {
                if (!needed) break;
                if (!cell.free || cell.start < first(entry) || cell.end > last(entry)) continue;
                const use = Math.min(needed, cell.free);
                // For 'all', keep the estimate proportional within this slot.
                allocated[i] += use * cell.training / cell.all;
                needed -= use;
                cell.free -= use;
            }
            if (needed > 0.000001) return null;
        }
        return allocated;
    };
    if (!allocate('training') || !allocate('lesson')) {
        const early = allocate('all');
        const late = allocate('all', true);
        if (!early || !late) return;
        // Both allocations fit all window capacities. Their closest weighted
        // average to the original estimates also fits, without storing or
        // presenting a made-up activity timeline.
        const delta = late.map((value, i) => value - early[i]);
        const square = delta.reduce((n, d) => n + d * d, 0);
        const weight = square ? Math.max(0, Math.min(1, entries.reduce((n, entry, i) => (
            n + (entry.autonomousEstimate - early[i]) * delta[i]
        ), 0) / square)) : 0;
        entries.forEach((entry, i) => {
            entry.autonomousEstimate = early[i] + delta[i] * weight;
            entry.overlapEstimate = entry.seconds - entry.autonomousEstimate;
        });
    }
    for (const entry of entries) {
        const minimum = Math.max(entry.autonomous.lower, lower - (upperSum - entry.autonomous.upper));
        const maximum = Math.max(minimum, Math.min(entry.autonomous.upper, upper - (lowerSum - entry.autonomous.lower)));
        Object.assign(entry.autonomous, { lower: minimum, upper: maximum });
        Object.assign(entry.overlap, { lower: entry.seconds - maximum, upper: entry.seconds - minimum });
    }
}

interface MergeOptions {
    /** All lessons mask training, but only these classrooms contribute class
     * totals. This preserves cross-classroom de-duplication under a filter. */
    classDomainIds?: string[];
    /** Counter-only activity in a live snapshot has already occurred by this time. */
    observedAt?: number;
}

/** Merge server-measured training with imported class windows. Query bounds
 * are inclusive/exclusive. Dashboard requests use whole Shanghai days;
 * daily-only historical counters retain provable bounds and a separately
 * marked point estimate. Their timestamps are never reconstructed. */
export function mergeLearningTime(rows: DailyTime[], lessons: LearningLesson[], fromMs: number, toMs: number, options: MergeOptions = {}) {
    const students = new Map<number, TimeStats & { _id: number }>();
    const domains = new Map<string, TimeStats & { _id: string }>();
    const days = new Map<string, TimeStats & { _id: string }>();
    const sources = new Map<string, TrainingSource & { uid: number, domainId: string,
        seconds: number, trainingUpperSeconds: number, estimatedSeconds: number, hasEstimate: boolean,
        estimationMethod?: EstimationMethod, uncertainSeconds: number,
        classTrainingSeconds: number, classTrainingUpperSeconds: number, classTrainingEstimatedSeconds: number }>();
    const precise = new Map<number, Span[]>();
    const captured = new Map<number, Span[]>();
    const classes = new Map<number, Span[]>();
    const countedClasses = new Map<number, Span[]>();
    const countedDomains = options.classDomainIds ? new Set(options.classDomainIds) : null;
    const historical: { row: DailyTime, seconds: number, dayStart: number, dayEnd: number,
        sources: (TrainingSource & { seconds: number })[] }[] = [];
    const add = (uid: number, domainId: string, day: string, values: Partial<TimeStats>) => {
        const targets = [
            students.get(uid) || students.set(uid, { _id: uid, ...emptyStats() }).get(uid),
            domains.get(domainId) || domains.set(domainId, { _id: domainId, ...emptyStats() }).get(domainId),
            days.get(day) || days.set(day, { _id: day, ...emptyStats() }).get(day),
        ];
        for (const target of targets) {
            target.trainingSeconds += values.trainingSeconds || 0;
            target.trainingUpperSeconds += values.trainingUpperSeconds ?? values.trainingSeconds ?? 0;
            target.trainingEstimatedSeconds += values.trainingEstimatedSeconds ?? values.trainingSeconds ?? 0;
            target.uncertainSeconds = Math.max(0, target.trainingUpperSeconds - target.trainingSeconds);
            target.hasEstimate ||= values.hasEstimate || false;
            target.estimationMethod = mergeMethod(target.estimationMethod, values.estimationMethod);
            target.classSeconds += values.classSeconds || 0;
            target.overlapSeconds += values.overlapSeconds || 0;
            target.overlapUpperSeconds += values.overlapUpperSeconds ?? values.overlapSeconds ?? 0;
            target.overlapEstimatedSeconds += values.overlapEstimatedSeconds ?? values.overlapSeconds ?? 0;
            target.unattributedEstimatedSeconds += values.unattributedEstimatedSeconds || 0;
            target.unattributedClassTrainingEstimatedSeconds += values.unattributedClassTrainingEstimatedSeconds || 0;
            target.legacySeconds += values.legacySeconds || 0;
            target.last = Math.max(target.last, values.last || 0);
            target.seconds = target.trainingSeconds + target.classSeconds;
            target.estimatedSeconds = target.trainingEstimatedSeconds + target.classSeconds;
        }
    };
    const addSource = (uid: number, domainId: string, source: TrainingSource, seconds: number, overlap = 0,
        upper = seconds, overlapUpper = overlap, estimate = seconds, overlapEstimate = overlap, method?: EstimationMethod,
        normalized = false) => {
        const key = JSON.stringify([uid, domainId, trainingSourceKey(source)]);
        const entry = sources.get(key) || { uid, domainId, ...source, seconds: 0, trainingUpperSeconds: 0,
            estimatedSeconds: 0, hasEstimate: false, estimationMethod: undefined, uncertainSeconds: 0,
            classTrainingSeconds: 0, classTrainingUpperSeconds: 0, classTrainingEstimatedSeconds: 0 };
        entry.seconds += seconds;
        entry.trainingUpperSeconds += upper;
        entry.estimatedSeconds += estimate;
        entry.uncertainSeconds = Math.max(0, entry.trainingUpperSeconds - entry.seconds);
        entry.hasEstimate ||= upper - seconds > 0.000001 || normalized;
        entry.estimationMethod = mergeMethod(entry.estimationMethod, method);
        entry.classTrainingSeconds += overlap;
        entry.classTrainingUpperSeconds += overlapUpper;
        entry.classTrainingEstimatedSeconds += overlapEstimate;
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
            const key = trainingSourceKey(span);
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
            const unaligned = Math.max(0, duration(source.seconds) - (capturedBySource.get(trainingSourceKey(source)) || 0) / 1000);
            if (unaligned) oldSources.push({ kind: source.kind, pid: source.pid, ...(source.problemDomainId && { problemDomainId: source.problemDomainId }),
                seconds: Math.min(unaligned, legacy) });
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
    const prepared = historical.map(({ row, seconds, dayStart, dayEnd, sources: oldSources }) => {
        const start = row.startedAt == null ? NaN : +row.startedAt;
        const end = row.updatedAt == null ? NaN : +row.updatedAt;
        const hasStart = Number.isFinite(start);
        const hasEnd = Number.isFinite(end);
        const observedEnd = Math.min(dayEnd, options.observedAt ?? dayEnd);
        const support = (from: number, to: number) => subtractSpans([{
            start: from, end: to, domainId: row.domainId,
        }], captured.get(row.uid) || []);
        // A missing first timestamp does not invalidate a known last heartbeat
        // (or vice versa). Use both bounds for a uniform-window estimate only
        // when the complete window can actually hold the recorded counter.
        let reliableEnvelope = hasStart && hasEnd && start < end;
        let available = support(hasStart ? Math.max(dayStart, start) : dayStart, hasEnd ? Math.min(dayEnd, end) : observedEnd);
        if (spanSeconds(available) + 0.000001 < seconds) {
            reliableEnvelope = false;
            available = support(dayStart, observedEnd);
        }
        const capacity = Math.max(seconds, spanSeconds(available));
        const inQuery = spanSeconds(available, fromMs, toMs);
        const autonomousCapacity = spanSeconds(subtractSpans(available, classes.get(row.uid) || []), fromMs, toMs);
        const classCapacity = Math.max(0, inQuery - autonomousCapacity);
        const autonomous = counterBounds(seconds, capacity, autonomousCapacity);
        const overlap = counterBounds(seconds, capacity, classCapacity);
        const autonomousEstimate = counterEstimate(autonomous, seconds, capacity, autonomousCapacity, reliableEnvelope);
        const overlapEstimate = counterEstimate(overlap, seconds, capacity, classCapacity, reliableEnvelope);
        const method: EstimationMethod = reliableEnvelope ? 'activity-window' : 'bounds-midpoint';
        return { row, seconds, dayStart, oldSources, available, capacity, autonomousCapacity, classCapacity, autonomous, overlap,
            autonomousEstimate, overlapEstimate, method, inQuery, end,
            complete: available.length > 0 && capacity - inQuery < 0.000001 && seconds <= inQuery + 0.000001 };
    });
    const byLearnerDay = new Map<string, typeof prepared>();
    for (const entry of prepared) {
        if (!entry.complete) continue;
        const key = JSON.stringify([entry.row.uid, entry.row.day]);
        if (!byLearnerDay.has(key)) byLearnerDay.set(key, []);
        byLearnerDay.get(key).push(entry);
    }
    for (const entries of byLearnerDay.values()) {
        if (entries.length < 2) continue;
        entries.sort((a, b) => a.available[0].start - b.available[0].start || a.row.domainId.localeCompare(b.row.domainId));
        let group: typeof prepared = [];
        let groupEnd = -Infinity;
        const masks = classes.get(entries[0].row.uid) || [];
        for (const entry of entries) {
            if (entry.available[0].start >= groupEnd) {
                constrainLegacyEstimates(group, masks);
                group = [];
            }
            group.push(entry);
            groupEnd = Math.max(groupEnd, entry.available[entry.available.length - 1].end);
        }
        constrainLegacyEstimates(group, masks);
    }
    for (const { row, seconds, dayStart, oldSources, capacity, autonomousCapacity, classCapacity, autonomous, overlap, autonomousEstimate,
        overlapEstimate, method, inQuery, end } of prepared) {
        const needsEstimate = autonomous.upper - autonomous.lower > 0.000001;
        const sourceSeconds = oldSources.reduce((total, source) => total + source.seconds, 0);
        const sourceScale = sourceSeconds - seconds > 0.000001 ? seconds / sourceSeconds : 1;
        const unreportedSeconds = Math.max(0, seconds - sourceSeconds * sourceScale);
        const unreportedShare = unreportedSeconds > 0.000001 ? unreportedSeconds / seconds : 0;
        add(row.uid, row.domainId, row.day, {
            trainingSeconds: autonomous.lower, trainingUpperSeconds: autonomous.upper,
            trainingEstimatedSeconds: autonomousEstimate, hasEstimate: needsEstimate,
            estimationMethod: needsEstimate ? method : undefined,
            overlapSeconds: overlap.lower, overlapUpperSeconds: overlap.upper,
            overlapEstimatedSeconds: overlapEstimate,
            unattributedEstimatedSeconds: autonomousEstimate * unreportedShare,
            unattributedClassTrainingEstimatedSeconds: overlapEstimate * unreportedShare,
            legacySeconds: Math.min(seconds, inQuery),
            last: inQuery > 0 ? (Number.isFinite(end) ? Math.min(end, toMs) : dayStart) : 0,
        });
        for (const source of oldSources) {
            // Timing is absent at question level. Reuse the day's estimated
            // activity proportions so source estimates conserve the counter;
            // normalize inconsistent source totals rather than invent time.
            const normalizedSeconds = source.seconds * sourceScale;
            const trainingBounds = counterBounds(normalizedSeconds, capacity, autonomousCapacity);
            const classBounds = counterBounds(normalizedSeconds, capacity, classCapacity);
            const share = normalizedSeconds / seconds;
            addSource(row.uid, row.domainId, source, trainingBounds.lower, classBounds.lower,
                trainingBounds.upper, classBounds.upper, autonomousEstimate * share, overlapEstimate * share,
                trainingBounds.upper - trainingBounds.lower > 0.000001 || sourceScale !== 1 ? method : undefined,
                sourceScale !== 1);
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
                addSource(uid, span.domainId, { kind: span.kind, pid: span.pid,
                    ...(span.problemDomainId && { problemDomainId: span.problemDomainId }) }, overlap ? 0 : seconds, overlap ? seconds : 0);
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
