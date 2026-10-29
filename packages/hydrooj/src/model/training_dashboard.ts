import moment from 'moment-timezone';
import { PermissionError, ValidationError } from '../error';
import { isScratchDomain } from '../lib/domain_type';
import { mergeLearningTime } from '../lib/learning_time';
import {
    TRAINING_PERIODS, TRAINING_TIME_ZONE, trainingAttention, trainingAverageWindow, trainingDailyBars,
    trainingDomainSelection, trainingDuration, trainingDurationRange, trainingRange,
} from '../lib/training_dashboard';
import type { Handler } from '../service/server';
import { Time } from '../utils';
import { PERM, PRIV, STATUS } from './builtin';
import { classes } from './class_time';
import domain from './domain';
import problem from './problem';
import record from './record';
import * as training from './training_time';
import user from './user';
import workspace from './workspace';

const COLORS = ['#60a7b1', '#7e8cc7', '#ba91b1', '#c8a66b', '#79a990', '#839ba9'];
const SORTS = { time: '学习总时长', accepted: '通过题目', submit: '提交次数', lastActive: '最近活跃' };
const ATTENTION = { all: '全部学员', stuck: '投入较多，待了解', quiet: '暂无记录' };
const sum = (items: any[], key = 'seconds') => items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
const dayString = (date: moment.Moment) => date.format('YYYY-MM-DD');
const timestamp = (value: any) => value?.getTimestamp ? +value.getTimestamp() : value ? +new Date(value) : 0;
const activityLabel = (value: number) => (value ? moment(value).tz(TRAINING_TIME_ZONE).format('MM-DD HH:mm') : '暂无记录');

function presentTime(value: any = {}) {
    const seconds = value.seconds || 0;
    const trainingSeconds = value.trainingSeconds || 0;
    const trainingUpperSeconds = Math.max(trainingSeconds, value.trainingUpperSeconds ?? trainingSeconds);
    const classSeconds = value.classSeconds || 0;
    const overlapSeconds = value.overlapSeconds || 0;
    const overlapUpperSeconds = Math.max(overlapSeconds, value.overlapUpperSeconds ?? overlapSeconds);
    const uncertainSeconds = trainingUpperSeconds - trainingSeconds;
    const secondsUpper = seconds + uncertainSeconds;
    return { ...value, seconds, secondsUpper, trainingSeconds, trainingUpperSeconds, uncertainSeconds,
        classSeconds, overlapSeconds, overlapUpperSeconds, legacySeconds: value.legacySeconds || 0,
        timeLabel: trainingDurationRange(seconds, secondsUpper), trainingLabel: trainingDurationRange(trainingSeconds, trainingUpperSeconds),
        classLabel: trainingDuration(classSeconds), overlapLabel: trainingDurationRange(overlapSeconds, overlapUpperSeconds) };
}

function dailyBars(start: moment.Moment, end: moment.Moment, stats: any[]) {
    const byDay = new Map(stats.map((item) => [item._id, item]));
    return trainingDailyBars(start, end, Object.fromEntries(stats.map((item) => [item._id, item.seconds])))
        .map((item) => ({ ...item, ...presentTime(byDay.get(item.date)), barPercent: item.barPercent }));
}

export async function trainingDashboardScope(handler: Handler) {
    if (handler.session?.sudoUid || !handler.user.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new PermissionError('教师训练看板');
    const workspaceId = workspace.resolveDomainWorkspaceId(handler.domain);
    const candidates = (await workspace.getDomains(workspaceId)).filter((item) => !isScratchDomain(item));
    // Resolve permissions against each actual domain, never query/body domainId.
    const admin = handler.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM);
    const authorized = admin ? candidates : (await Promise.all(candidates.map(async (item) => (
        (await user.getById(item._id, handler.user._id)).hasPerm(PERM.PERM_EDIT_DOMAIN) ? item : null
    )))).filter(Boolean);
    if (!admin && !authorized.length) throw new PermissionError('教师训练看板');
    return { workspaceId, domains: authorized.map((item) => ({ id: item._id, name: item.name || item._id, owner: item.owner })) };
}

function recordMatch(ids: string[], uids: number[], start: moment.Moment, end: moment.Moment) {
    return {
        domainId: { $in: ids }, uid: { $in: uids }, pid: { $gt: 0 },
        contest: { $nin: [record.RECORD_PRETEST, record.RECORD_GENERATE] },
        _id: { $gte: Time.getObjectID(start.toDate()), $lt: Time.getObjectID(end.clone().add(1, 'day').toDate()) },
    };
}

function domainBreakdown(domains: any[], ids: string[], stats: any[]) {
    const max = Math.max(1, ...stats.map((item) => item.seconds || 0));
    return domains.map((item, index) => {
        const time = presentTime(stats.find((row) => row._id === item.id));
        return { ...item, ...time, selected: ids.includes(item.id), color: COLORS[index % COLORS.length], barPercent: Math.round(time.seconds / max * 100) };
    });
}

export async function loadTrainingDashboard(handler: Handler) {
    const scope = await trainingDashboardScope(handler);
    const query = handler.request.query || {};
    let range: ReturnType<typeof trainingRange>;
    let selection: ReturnType<typeof trainingDomainSelection>;
    try {
        range = trainingRange(query);
        selection = trainingDomainSelection(query.domains ?? query.domain, scope.domains.map((item) => item.id));
    } catch (error) { throw new ValidationError(error.message); }
    const { start, end, period } = range;
    const { ids } = selection;
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    const sort = typeof query.sort === 'string' && Object.hasOwn(SORTS, query.sort) ? query.sort : 'time';
    const attention = typeof query.attention === 'string' && Object.hasOwn(ATTENTION, query.attention) ? query.attention : 'all';
    const student = query.student === undefined ? null : Number(query.student);
    if (student !== null && (!Number.isSafeInteger(student) || student <= 1)) throw new ValidationError('student');
    const currentQuery = { period, start: dayString(start), end: dayString(end), domains: selection.all ? 'all' : ids.join(','), q, sort, attention };
    const url = (updates: Record<string, any> = {}, anchor = '') => {
        const params = { ...currentQuery, ...(student ? { student } : {}), ...updates };
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') search.set(key, `${value}`);
        return `${handler.url('manage_training_dashboard')}?${search}${anchor}`;
    };
    const [joined, members, excluded] = await Promise.all([
        ids.length ? domain.collUser.find({ domainId: { $in: ids }, uid: { $gt: 1 }, join: true, blockedByStudentManagement: { $ne: true } })
            .project({ uid: 1, role: 1 }).toArray() : [],
        workspace.getMembers(scope.workspaceId),
        scope.workspaceId === workspace.LEGACY_WORKSPACE_ID ? workspace.getExcludedLegacyUids() : new Set<number>(),
    ]);
    const teachers = new Set([...members.map((item) => item.uid), ...scope.domains.map((item) => item.owner)]);
    const candidateUids = [...new Set(joined.map((item) => item.uid))].filter((uid) => !teachers.has(uid) && !excluded.has(uid));
    const accounts = candidateUids.length ? await user.getMulti({ _id: { $in: candidateUids } }, ['_id', 'priv', 'uname', 'displayName']).toArray() : [];
    const students = accounts.filter((item) => (item.priv & PRIV.PRIV_USER_PROFILE)
        && !(item.priv & PRIV.PRIV_EDIT_SYSTEM) && !(item.priv & PRIV.PRIV_JUDGE));
    const uids = students.map((item) => item._id);
    if (student !== null && !uids.includes(student)) throw new PermissionError('所选课堂的学员');
    const dailyMatch = { domainId: { $in: ids }, uid: { $in: uids }, day: { $gte: dayString(start), $lte: dayString(end) } };
    const rangeStart = +start;
    const rangeEnd = +end.clone().add(1, 'day');
    // Every authorized classroom can mask teacher-led practice, even when the
    // teacher filters the visible statistics to another language/classroom.
    const classMatch = { workspaceId: scope.workspaceId, domainId: { $in: scope.domains.map((item) => item.id) }, uid: { $in: uids } };
    const mergeTimes = (trainingRows: any[], classRows: any[], from: number, to: number) => (
        mergeLearningTime(trainingRows, classRows, from, to, { classDomainIds: ids })
    );
    const [timeRows, lessonRows, recordRows] = uids.length && ids.length ? await Promise.all([
        training.daily.find(dailyMatch).toArray(),
        classes.find({ ...classMatch, startAt: { $lt: new Date(rangeEnd) }, endAt: { $gt: new Date(rangeStart) } }).toArray(),
        record.coll.aggregate([
            { $match: recordMatch(ids, uids, start, end) },
            { $group: { _id: { uid: '$uid', domainId: '$domainId', pid: '$pid' }, submits: { $sum: 1 },
                accepted: { $max: { $cond: [{ $eq: ['$status', STATUS.STATUS_ACCEPTED] }, 1, 0] } }, last: { $max: '$_id' } } },
            { $group: { _id: '$_id.uid', submits: { $sum: '$submits' }, accepted: { $sum: '$accepted' }, last: { $max: '$last' } } },
        ]).toArray(),
    ]) : [[], [], []];
    const times = mergeTimes(timeRows, lessonRows, rangeStart, rangeEnd);
    const timeMap = new Map(times.students.map((item) => [item._id, item]));
    const recordMap = new Map(recordRows.map((item) => [item._id, item]));
    const rows = students.map((item) => {
        const time: any = timeMap.get(item._id) || {};
        const records: any = recordMap.get(item._id) || {};
        const timeView = presentTime(time);
        const submits = records.submits || 0;
        const acceptedProblems = records.accepted || 0;
        const lastActive = Math.max(timestamp(time.last), timestamp(records.last));
        const observation = trainingAttention(timeView.trainingSeconds, submits, acceptedProblems);
        if (timeView.classSeconds && observation.kind === 'quiet') Object.assign(observation, { kind: 'normal', label: '有上课记录' });
        else if (timeView.overlapSeconds && observation.kind === 'quiet') Object.assign(observation, { kind: 'normal', label: '有课堂练习' });
        else if (timeView.uncertainSeconds && observation.kind === 'quiet') Object.assign(observation, { kind: 'normal', label: '历史训练时段待核对' });
        return { uid: item._id, name: item.displayName || item.uname, uname: item.uname, ...timeView,
            timeLabel: timeView.secondsUpper || timeView.overlapUpperSeconds ? timeView.timeLabel : '暂无记录',
            submits, acceptedProblems, lastActive, lastActiveLabel: activityLabel(lastActive),
            attentionKind: observation.kind, attentionLabel: observation.label,
            detailUrl: url({ student: item._id }, '#training-student') };
    });
    const counts = { all: rows.length, stuck: rows.filter((item) => item.attentionKind === 'stuck').length, quiet: rows.filter((item) => item.attentionKind === 'quiet').length };
    const filtered = rows.filter((item) => (!q || [item.name, item.uname, item.uid].some((value) => `${value}`.toLowerCase().includes(q.toLowerCase())))
        && (attention === 'all' || item.attentionKind === attention));
    const sortField = { time: 'seconds', accepted: 'acceptedProblems', submit: 'submits', lastActive: 'lastActive' }[sort];
    filtered.sort((a, b) => b[sortField] - a[sortField] || b.lastActive - a.lastActive || a.uid - b.uid);
    const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
    const page = Math.min(pageCount, Math.max(1, Math.floor(Number(query.page) || 1)));
    const dashboard: any = {
        ...currentQuery, periodLabel: range.label, allDomains: selection.all, scopeLabel: selection.all ? '全部课堂' : '所选课堂',
        selectedDomainIds: ids, queryDomains: selection.all ? ['all'] : ids, currentQuery,
        domains: domainBreakdown(scope.domains, ids, times.domains),
        summary: { ...presentTime({ seconds: sum(rows), trainingSeconds: sum(rows, 'trainingSeconds'),
            trainingUpperSeconds: sum(rows, 'trainingUpperSeconds'), classSeconds: sum(rows, 'classSeconds'),
            overlapSeconds: sum(rows, 'overlapSeconds'), overlapUpperSeconds: sum(rows, 'overlapUpperSeconds'), legacySeconds: sum(rows, 'legacySeconds') }),
        activeStudents: rows.filter((item) => item.secondsUpper || item.overlapUpperSeconds || item.submits).length,
            studentCount: rows.length, acceptedProblems: sum(rows, 'acceptedProblems'), submits: sum(rows, 'submits') },
        daily: dailyBars(start, end, times.days),
        rows: filtered.slice((page - 1) * 25, page * 25),
        pagination: { page, pageCount, total: filtered.length, prevUrl: page > 1 ? url({ page: page - 1 }) : '', nextUrl: page < pageCount ? url({ page: page + 1 }) : '' },
        periodLinks: Object.entries(TRAINING_PERIODS).map(([id, label]) => ({ id, label, url: url({ period: id }), active: period === id })),
        sortLinks: Object.entries(SORTS).map(([id, label]) => ({ id, label, url: url({ sort: id }), active: sort === id })),
        attentionLinks: Object.entries(ATTENTION).map(([id, label]) => ({ id, label, url: url({ attention: id }), active: attention === id, count: counts[id] })),
        closeDetailUrl: url({ student: null }, '#training-roster'), detail: null,
    };
    if (!student) return dashboard;
    const now = moment().tz(TRAINING_TIME_ZONE);
    const startedAt = await training.getTrackingStartedAt();
    const average = trainingAverageWindow(startedAt, now.toDate());
    const recentStart = now.clone().subtract(6, 'days').startOf('day');
    const monthStart = now.clone().startOf('month');
    const recentHistoryStart = moment.min(recentStart, monthStart, average.start);
    // A historical custom range and today's comparison windows can be far
    // apart. Read their union, never all the intervening months/years.
    const historyWindows = [
        { day: { $gte: dayString(start), $lte: dayString(end) } },
        { day: { $gte: dayString(recentHistoryStart), $lte: dayString(now) } },
    ];
    const lessonWindows = [
        { startAt: { $lt: new Date(rangeEnd) }, endAt: { $gt: new Date(rangeStart) } },
        { startAt: { $lt: now.clone().add(1, 'day').startOf('day').toDate() }, endAt: { $gt: recentHistoryStart.toDate() } },
    ];
    const [history, lessonHistory, problemRecords] = await Promise.all([
        training.daily.find({ domainId: { $in: ids }, uid: student, $or: historyWindows }).toArray(),
        classes.find({ ...classMatch, uid: student, $or: lessonWindows }).toArray(),
        record.coll.aggregate([
            { $match: recordMatch(ids, [student], start, end) },
            { $group: { _id: { domainId: '$domainId', pid: '$pid' }, submits: { $sum: 1 },
                accepted: { $max: { $cond: [{ $eq: ['$status', STATUS.STATUS_ACCEPTED] }, 1, 0] } }, last: { $max: '$_id' } } },
        ]).toArray(),
    ]);
    const studentRow = rows.find((item) => item.uid === student);
    const selectedTimes = mergeTimes(history, lessonHistory, rangeStart, rangeEnd);
    const problems = new Map<string, any>();
    for (const source of selectedTimes.sources) {
        // Daily quizzes are grouped per classroom; problem ids are a separate namespace.
        const key = JSON.stringify([source.domainId, source.kind, source.kind === 'problem' ? source.pid : 0]);
        const entry = problems.get(key) || { domainId: source.domainId, kind: source.kind, pid: source.kind === 'problem' ? source.pid : null,
            seconds: 0, trainingUpperSeconds: 0, classTrainingSeconds: 0, classTrainingUpperSeconds: 0, submits: 0, accepted: false };
        entry.seconds += source.seconds;
        entry.trainingUpperSeconds += source.trainingUpperSeconds ?? source.seconds;
        entry.classTrainingSeconds += source.classTrainingSeconds || 0;
        entry.classTrainingUpperSeconds += source.classTrainingUpperSeconds ?? source.classTrainingSeconds ?? 0;
        problems.set(key, entry);
    }
    for (const item of problemRecords) {
        const key = JSON.stringify([item._id.domainId, 'problem', item._id.pid]);
        const entry = problems.get(key) || { ...item._id, kind: 'problem', seconds: 0 };
        Object.assign(entry, { submits: item.submits, accepted: !!item.accepted, lastActiveLabel: activityLabel(timestamp(item.last)) });
        problems.set(key, entry);
    }
    const orderedProblems = [...problems.values()].sort((a, b) => (b.trainingUpperSeconds ?? b.seconds) - (a.trainingUpperSeconds ?? a.seconds)
        || b.submits - a.submits).slice(0, 50);
    const domainViewers = new Map(await Promise.all(ids.map(async (id) => [id, await user.getById(id, handler.user._id)] as const)));
    const problemRows = await Promise.all(orderedProblems.map(async (item) => {
        const found = item.kind === 'problem'
            ? await problem.get(item.domainId, item.pid, ['docId', 'pid', 'title', 'hidden', 'owner', 'maintainer', 'objectiveKind']) : null;
        const pdoc = found && problem.canViewBy(found, domainViewers.get(item.domainId)) ? found : null;
        return { ...item, domainName: scope.domains.find((d) => d.id === item.domainId)?.name,
            pid: pdoc?.pid || item.pid, title: pdoc?.title || (item.kind === 'daily' ? '每日一练' : item.kind === 'ide' ? '在线编程'
                : found ? '暂不可查看的题目' : '题目已移除'),
            url: pdoc ? handler.url('problem_detail', { domainId: item.domainId, pid: pdoc.pid || pdoc.docId }) : '',
            timeLabel: trainingDurationRange(item.seconds, item.trainingUpperSeconds ?? item.seconds),
            uncertainSeconds: Math.max(0, (item.trainingUpperSeconds ?? item.seconds) - item.seconds),
            classTrainingLabel: item.classTrainingUpperSeconds ? trainingDurationRange(item.classTrainingSeconds, item.classTrainingUpperSeconds) : '' };
    }));
    const averageTimes = mergeTimes(history, lessonHistory, +average.start, +average.end).students;
    const recentTime = presentTime(mergeTimes(history, lessonHistory, +recentStart, +now.clone().add(1, 'day').startOf('day')).students[0]);
    const monthTime = presentTime(mergeTimes(history, lessonHistory, +monthStart, +now.clone().add(1, 'day').startOf('day')).students[0]);
    const averageLabel = average.weeks
        ? trainingDurationRange(sum(averageTimes, 'trainingSeconds') / average.weeks, sum(averageTimes, 'trainingUpperSeconds') / average.weeks) : '—';
    const selectedLessons = lessonHistory.filter((item) => ids.includes(item.domainId) && +item.startAt < rangeEnd && +item.endAt > rangeStart)
        .sort((a, b) => +b.startAt - +a.startAt || a.externalId.localeCompare(b.externalId));
    dashboard.detail = {
        uid: student, name: studentRow.name,
        timeBreakdown: presentTime(selectedTimes.students[0]),
        lessons: selectedLessons.slice(0, 100).map((item) => ({ externalId: item.externalId, title: item.title || '编程课堂',
            domainName: scope.domains.find((d) => d.id === item.domainId)?.name || item.domainId,
            startLabel: moment(item.startAt).tz(TRAINING_TIME_ZONE).format('YYYY-MM-DD HH:mm'),
            endLabel: moment(item.endAt).tz(TRAINING_TIME_ZONE).format('YYYY-MM-DD HH:mm'),
            timeLabel: trainingDuration((Math.min(+item.endAt, rangeEnd) - Math.max(+item.startAt, rangeStart)) / 1000) })),
        lessonLimit: selectedLessons.length > 100,
        overview: [
            { label: range.label, value: studentRow.timeLabel, helper: '自主训练与上课合并后的学习总时长' },
            { label: '最近 7 天', value: recentTime.timeLabel, helper: `${dayString(recentStart)} 至今 · 学习总时长` },
            { label: '本月已记录', value: monthTime.timeLabel, helper: `${now.format('M')} 月 · 学习总时长` },
            { label: '平均周自主训练', value: averageLabel,
                helper: average.weeks ? `最近 ${average.weeks} 个完整自然周（${average.start.format('M/D')}—${average.end.clone().subtract(1, 'day').format('M/D')}）` : '统计满一个完整自然周后显示' },
        ],
        daily: dailyBars(start, end, selectedTimes.days),
        domains: domainBreakdown(scope.domains, ids, selectedTimes.domains),
        problems: problemRows, problemLimit: problems.size > 50 ? 50 : null,
    };
    return dashboard;
}
