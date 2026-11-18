import moment from 'moment-timezone';

export const TRAINING_TIME_ZONE = 'Asia/Shanghai';
export const TRAINING_PERIODS = {
    today: '今天', '7d': '最近 7 天', '30d': '最近 30 天', thisWeek: '本周', thisMonth: '本月', custom: '自选日期',
};

export function trainingRange(query: Record<string, any>, now = new Date()) {
    const today = moment(now).tz(TRAINING_TIME_ZONE).startOf('day');
    const period = query.period || '7d';
    if (typeof period !== 'string' || !Object.hasOwn(TRAINING_PERIODS, period)) throw new Error('period');
    let start = today.clone();
    let end = today.clone();
    if (period === '7d') start.subtract(6, 'days');
    if (period === '30d') start.subtract(29, 'days');
    if (period === 'thisWeek') start.startOf('isoWeek');
    if (period === 'thisMonth') start.startOf('month');
    if (period === 'custom') {
        if (typeof query.start !== 'string' || typeof query.end !== 'string') throw new Error('dates');
        start = moment.tz(query.start, 'YYYY-MM-DD', true, TRAINING_TIME_ZONE);
        end = moment.tz(query.end, 'YYYY-MM-DD', true, TRAINING_TIME_ZONE);
        if (!start.isValid() || !end.isValid() || start.isAfter(end) || end.isAfter(today)
            || end.diff(start, 'days') >= 90) throw new Error('dates');
    }
    return { period, label: TRAINING_PERIODS[period], start, end };
}

export function trainingDuration(seconds = 0) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0 分钟';
    if (seconds < 60) return '不足 1 分钟';
    const minutes = Math.floor(seconds / 60);
    return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}` : `${minutes} 分钟`;
}

/** Historical point estimates are deliberately rounded and marked, unlike measured intervals. */
export function trainingDurationEstimate(seconds = 0, estimated = false) {
    if (!estimated || !Number.isFinite(seconds) || seconds <= 0) return trainingDuration(seconds);
    if (seconds < 60) return '约不足 1 分钟';
    return `约 ${trainingDuration(Math.round(seconds / 60) * 60)}`;
}

/** Round uncertain historical bounds outwards; never present a guessed exact duration. */
export function trainingDurationRange(lower = 0, upper = lower) {
    const minimum = Number.isFinite(lower) ? Math.max(0, lower) : 0;
    const maximum = Number.isFinite(upper) ? Math.max(minimum, upper) : minimum;
    if (maximum - minimum < 0.001) return trainingDuration(minimum);
    const lowMinutes = Math.floor(minimum / 60);
    const highMinutes = Math.ceil(maximum / 60);
    if (highMinutes < 60) return `${lowMinutes}～${highMinutes} 分钟`;
    if (Math.floor(lowMinutes / 60) === Math.floor(highMinutes / 60)) {
        return `${Math.floor(lowMinutes / 60)} 小时 ${lowMinutes % 60}～${highMinutes % 60} 分钟`;
    }
    return `${trainingDuration(lowMinutes * 60)}～${trainingDuration(highMinutes * 60)}`;
}

export function trainingDomainSelection(raw: unknown, available: string[]) {
    const values = raw === undefined ? ['all'] : (Array.isArray(raw) ? raw : [raw]);
    if (values.some((value) => typeof value !== 'string')) throw new Error('domains');
    const selected = [...new Set((values as string[]).flatMap((value) => value.split(',')).filter(Boolean))];
    if (selected.some((id) => id !== 'all' && !available.includes(id))) throw new Error('domains');
    if (!selected.length || selected.includes('all')) return { all: true, ids: available };
    return { all: false, ids: available.filter((id) => selected.includes(id)) };
}

export function trainingAttention(seconds: number, submits: number, accepted: number) {
    if (seconds >= 1800 && submits >= 3 && !accepted) return { kind: 'stuck', label: '投入较多，待了解' };
    if (!seconds && !submits) return { kind: 'quiet', label: '暂无记录' };
    return { kind: 'normal', label: '有训练记录' };
}

/** Average only completed calendar weeks fully covered by collection. */
export function trainingAverageWindow(startedAt: Date | null, now = new Date()) {
    const end = moment(now).tz(TRAINING_TIME_ZONE).startOf('isoWeek');
    const start = end.clone().subtract(4, 'weeks');
    if (!startedAt) return { start: end.clone(), end, weeks: 0 };
    const launch = moment(startedAt).tz(TRAINING_TIME_ZONE);
    const firstFullWeek = launch.clone().startOf('isoWeek');
    if (launch.isAfter(firstFullWeek)) firstFullWeek.add(1, 'week');
    if (firstFullWeek.isAfter(start)) start.set({ year: firstFullWeek.year(), month: firstFullWeek.month(), date: firstFullWeek.date() });
    return { start, end, weeks: Math.max(0, end.diff(start, 'weeks')) };
}

export function trainingDailyBars(start: moment.Moment, end: moment.Moment, values: Record<string, number>) {
    const rows = [];
    for (const day = start.clone(); !day.isAfter(end); day.add(1, 'day')) {
        const date = day.format('YYYY-MM-DD');
        const seconds = values[date] || 0;
        rows.push({ date, label: day.format('M/D'), seconds, timeLabel: trainingDuration(seconds), barPercent: 0 });
    }
    const max = Math.max(1, ...rows.map((row) => row.seconds));
    return rows.map((row) => ({ ...row, barPercent: Math.round(row.seconds / max * 100) }));
}

interface StudentLearningDay {
    _id: string;
    trainingSeconds: number;
    trainingEstimatedSeconds: number;
    classSeconds: number;
    hasEstimate: boolean;
}

/** A single learner's merged Shanghai days already exclude classroom overlap
 * and stop at observedAt. Sum the same days for both cards and both charts. */
export function trainingStudentPeriods(days: StudentLearningDay[], startedAt: Date | number | null, now: Date) {
    const stop = moment(now).tz(TRAINING_TIME_ZONE);
    const today = stop.clone().startOf('day');
    const lastDay = today.format('YYYY-MM-DD');
    const byDay = new Map(days.map((day) => [day._id, day]));
    const start = startedAt != null && Number.isFinite(+startedAt) && +startedAt <= +stop
        ? moment(+startedAt).tz(TRAINING_TIME_ZONE) : null;
    let first = start;
    for (const day of days) {
        if (day._id > lastDay || !(day.trainingEstimatedSeconds || day.classSeconds)) continue;
        if (!first || day._id < first.format('YYYY-MM-DD')) first = moment.tz(day._id, 'YYYY-MM-DD', TRAINING_TIME_ZONE);
    }

    function summarize(from: moment.Moment, until: moment.Moment, endDay = until) {
        let trainingSeconds = 0;
        let classSeconds = 0;
        let hasEstimate = false;
        for (const day = from.clone().startOf('day'); day.isBefore(until); day.add(1, 'day')) {
            const row = byDay.get(day.format('YYYY-MM-DD'));
            if (!row) continue;
            trainingSeconds += row.trainingEstimatedSeconds ?? row.trainingSeconds;
            classSeconds += row.classSeconds;
            hasEstimate ||= row.hasEstimate;
        }
        const seconds = trainingSeconds + classSeconds;
        const dateLabel = from.isSame(endDay, 'day') ? from.format('M/D') : `${from.format('M/D')}–${endDay.format('M/D')}`;
        const rangeLabel = from.isSame(endDay, 'day') ? from.format('YYYY-MM-DD')
            : `${from.format('YYYY-MM-DD')} 至 ${endDay.format('YYYY-MM-DD')}`;
        return {
            seconds, timeLabel: trainingDurationEstimate(seconds, hasEstimate),
            trainingSeconds, trainingLabel: trainingDurationEstimate(trainingSeconds, hasEstimate),
            classSeconds, classLabel: trainingDuration(classSeconds), hasEstimate, dateLabel, rangeLabel,
        };
    }
    function points(unit: 'week' | 'month', count: number) {
        if (!first) return [];
        const floor = unit === 'week' ? 'isoWeek' : 'month';
        const earliest = stop.clone().startOf(floor).subtract(count - 1, unit);
        const result = [];
        for (const period = moment.max(earliest, first.clone().startOf(floor)); !period.isAfter(stop); period.add(1, unit)) {
            const end = period.clone().add(1, unit);
            const from = moment.max(period, first);
            // Completed ranges end at an exclusive midnight, even when the
            // report opens at the very first instant of a new week or month.
            const complete = !end.isAfter(stop);
            const data = summarize(from, complete ? end : stop, complete ? end.clone().subtract(1, 'millisecond') : stop);
            result.push({
                ...data, value: data.seconds, label: period.format(unit === 'week' ? 'M/D' : 'M月'),
                shortLabel: data.timeLabel.replace('不足 1 分钟', '<1分').replace(/\s+/g, '').replace('小时', '时').replace('分钟', '分'),
                partial: from.isAfter(period) || end.isAfter(stop),
            });
        }
        return result;
    }

    return {
        periods: { recent: summarize(today.clone().subtract(6, 'days'), stop), week: summarize(today.clone().startOf('isoWeek'), stop) },
        trends: { weeks: points('week', 8), months: points('month', 6) },
    };
}
