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
