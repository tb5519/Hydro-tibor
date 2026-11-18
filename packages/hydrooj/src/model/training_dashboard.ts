import moment from 'moment-timezone';
import { PermissionError, ValidationError } from '../error';
import { isScratchDomain } from '../lib/domain_type';
import { mergeLearningTime } from '../lib/learning_time';
import { loadPersonalTrainingSnapshot } from '../lib/personal_training_growth';
import {
    TRAINING_PERIODS, TRAINING_TIME_ZONE, trainingDomainSelection, trainingDuration, trainingDurationEstimate,
    trainingRange, trainingStudentPeriods,
} from '../lib/training_dashboard';
import { loadTrainingProblemDetails, type ProblemRecord } from '../lib/training_problem_details';
import type { Handler } from '../service/server';
import { Time } from '../utils';
import { PERM, PRIV, STATUS } from './builtin';
import domain from './domain';
import record from './record';
import user from './user';
import workspace from './workspace';

const dayString = (date: moment.Moment) => date.format('YYYY-MM-DD');
const studentNames = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const PAGE_SIZE = 25;

function presentTime(value: any = {}) {
    const seconds = value.seconds || 0;
    const trainingSeconds = value.trainingSeconds || 0;
    const trainingUpperSeconds = Math.max(trainingSeconds, value.trainingUpperSeconds ?? trainingSeconds);
    const classSeconds = value.classSeconds || 0;
    const overlapSeconds = value.overlapSeconds || 0;
    const overlapUpperSeconds = Math.max(overlapSeconds, value.overlapUpperSeconds ?? overlapSeconds);
    const uncertainSeconds = trainingUpperSeconds - trainingSeconds;
    const secondsUpper = seconds + uncertainSeconds;
    const trainingEstimatedSeconds = value.trainingEstimatedSeconds ?? trainingSeconds;
    const estimatedSeconds = classSeconds + trainingEstimatedSeconds;
    const overlapEstimatedSeconds = value.overlapEstimatedSeconds ?? overlapSeconds;
    const hasEstimate = !!value.hasEstimate;
    return { ...value, seconds, secondsUpper, trainingSeconds, trainingUpperSeconds, uncertainSeconds,
        trainingEstimatedSeconds, estimatedSeconds, overlapEstimatedSeconds, hasEstimate,
        classSeconds, overlapSeconds, overlapUpperSeconds, legacySeconds: value.legacySeconds || 0,
        timeLabel: trainingDurationEstimate(estimatedSeconds, hasEstimate), trainingLabel: trainingDurationEstimate(trainingEstimatedSeconds, hasEstimate),
        classLabel: trainingDuration(classSeconds), overlapLabel: trainingDurationEstimate(overlapEstimatedSeconds, overlapUpperSeconds - overlapSeconds > 0.001) };
}

export async function trainingDashboardScope(handler: Handler) {
    if (handler.session?.sudoUid || !handler.user.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new PermissionError('教师训练看板');
    const workspaceId = workspace.resolveDomainWorkspaceId(handler.domain);
    const candidates = await workspace.getDomains(workspaceId);
    // Resolve permissions against each actual domain, never query/body domainId.
    const admin = handler.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM);
    const authorized = admin ? candidates : (await Promise.all(candidates.map(async (item) => (
        (await user.getById(item._id, handler.user._id)).hasPerm(PERM.PERM_EDIT_DOMAIN) ? item : null
    )))).filter(Boolean);
    const domains = authorized.filter((item) => !isScratchDomain(item))
        .map((item) => ({ id: item._id, name: item.name || item._id, owner: item.owner }));
    if (!admin && !domains.length) throw new PermissionError('教师训练看板');
    // Only OJ domains have training ledgers. Live lessons can also take place
    // in a managed Scratch domain while the learner practices in another.
    return { workspaceId, domains, classDomainIds: authorized.map((item) => item._id) };
}

export async function loadTrainingDashboard(
    handler: Handler, time = new Date(), resolvedScope?: Awaited<ReturnType<typeof trainingDashboardScope>>,
) {
    const scope = resolvedScope ?? await trainingDashboardScope(handler);
    const now = moment(time).tz(TRAINING_TIME_ZONE);
    const query = handler.request.query || {};
    let range: ReturnType<typeof trainingRange>;
    let selection: ReturnType<typeof trainingDomainSelection>;
    try {
        range = trainingRange(query, time);
        selection = trainingDomainSelection(query.domains ?? query.domain, scope.domains.map((item) => item.id));
    } catch (error) { throw new ValidationError(error.message); }
    const { start, end, period } = range;
    const { ids } = selection;
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
    const requested = query.student === undefined ? null : Number(query.student);
    if (requested !== null && (!Number.isSafeInteger(requested) || requested <= 1)) throw new ValidationError('student');
    const [joined, members, excluded] = await Promise.all([
        ids.length ? domain.collUser.find({ domainId: { $in: ids }, uid: { $gt: 1 }, join: true, blockedByStudentManagement: { $ne: true } })
            .project({ uid: 1, domainId: 1, displayName: 1 }).toArray() : [],
        workspace.getMembers(scope.workspaceId),
        scope.workspaceId === workspace.LEGACY_WORKSPACE_ID ? workspace.getExcludedLegacyUids() : new Set<number>(),
    ]);
    const teachers = new Set([...members.map((item) => item.uid), ...scope.domains.map((item) => item.owner)]);
    const candidateUids = [...new Set(joined.map((item) => item.uid))].filter((uid) => !teachers.has(uid) && !excluded.has(uid));
    const accounts = candidateUids.length ? await user.getMulti({ _id: { $in: candidateUids } }, ['_id', 'priv', 'uname', 'displayName']).toArray() : [];
    const students = accounts.filter((item) => (item.priv & PRIV.PRIV_USER_PROFILE)
        && !(item.priv & PRIV.PRIV_EDIT_SYSTEM) && !(item.priv & PRIV.PRIV_JUDGE));
    const aliases = new Map<number, string[]>();
    // A student can have different names in two classrooms. Prefer the current
    // classroom, then a stable classroom order; all visible aliases are searchable.
    const namedMembers = joined.filter((entry) => typeof entry.displayName === 'string' && entry.displayName.trim())
        .sort((a, b) => Number(b.domainId === handler.domain._id) - Number(a.domainId === handler.domain._id)
            || a.domainId.localeCompare(b.domainId));
    for (const entry of namedMembers) {
        const names = aliases.get(entry.uid) || [];
        names.push(entry.displayName.trim());
        aliases.set(entry.uid, names);
    }
    const eligible = students.map((item) => ({
        uid: item._id, name: aliases.get(item._id)?.[0] || item.displayName || item.uname, uname: item.uname,
    }));
    if (requested !== null && !eligible.some((item) => item.uid === requested)) throw new PermissionError('所选课堂的学员');
    const search = q.toLowerCase();
    const filtered = eligible.filter((item) => !q || [item.name, item.uname, item.uid, ...(aliases.get(item.uid) || [])]
        .some((value) => String(value).toLowerCase().includes(search)))
        .sort((a, b) => studentNames.compare(a.name, b.name) || a.uid - b.uid);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const index = filtered.findIndex((item) => item.uid === requested);
    const page = index >= 0 ? Math.floor(index / PAGE_SIZE) + 1 : Math.min(pageCount, Math.max(1, Math.floor(Number(query.page) || 1)));
    const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const selected = index >= 0 ? filtered[index] : visible[0];
    const currentQuery = {
        period, start: dayString(start), end: dayString(end), domains: selection.all ? 'all' : ids.join(','), q, page,
        ...(selected && { student: selected.uid }),
    };
    const url = (updates: Record<string, any>, anchor = '') => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries({ ...currentQuery, ...updates })) {
            if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
        }
        return `${handler.url('manage_training_dashboard')}?${params}${anchor}`;
    };
    const periodIds = [...new Set(['7d', 'thisWeek', period])];
    const periodLinks = periodIds.map((id) => ({
        id, label: TRAINING_PERIODS[id], active: period === id,
        url: url({ period: id, ...(id !== 'custom' && { start: null, end: null }) }, '#training-problems'),
    }));
    const dashboard: any = {
        ...currentQuery, currentQuery, periodLabel: range.label, periodLinks,
        allDomains: selection.all, scopeLabel: selection.all ? '全部课堂' : '所选课堂',
        selectedDomainIds: ids, queryDomains: selection.all ? ['all'] : ids,
        domains: scope.domains.map((item) => ({ ...item, selected: ids.includes(item.id) })),
        rows: visible.map((item) => ({ ...item, selected: item.uid === selected?.uid, detailUrl: url({ student: item.uid }, '#training-student') })),
        pagination: {
            page, pageCount, total: filtered.length,
            prevUrl: page > 1 ? url({ page: page - 1, student: null }, '#training-roster') : '',
            nextUrl: page < pageCount ? url({ page: page + 1, student: null }, '#training-roster') : '',
        },
        detail: null,
    };
    if (!selected) return dashboard;

    const uid = selected.uid;
    const trendStart = now.clone().startOf('month').subtract(5, 'months');
    const rangeStart = +start;
    const rangeEnd = Math.min(+end.clone().add(1, 'day'), +now);
    // ObjectIds have second precision. Include the observation second for today's records
    // while keeping the next calendar midnight exclusive for a completed range.
    const submissionEnd = Math.min(+end.clone().add(1, 'day'), (Math.floor(+now / 1000) + 1) * 1000);
    const [snapshot, submissions] = await Promise.all([
        loadPersonalTrainingSnapshot(handler.ctx, {
            workspaceId: scope.workspaceId, uid, domainIds: ids, authorizedDomainIds: scope.classDomainIds,
        }, time, { start: rangeStart, end: rangeEnd, recentStart: +trendStart, includeEarlierClasses: true }),
        record.coll.aggregate<ProblemRecord>([
            { $match: {
                uid, pid: { $gt: 0 }, contest: { $nin: [record.RECORD_PRETEST, record.RECORD_GENERATE] },
                $or: [{ practiceEntryDomain: { $in: ids } }, { practiceEntryDomain: { $in: [null, ''] }, domainId: { $in: ids } }],
                _id: { $gte: Time.getObjectID(start.toDate()), $lt: Time.getObjectID(new Date(submissionEnd)) },
            } },
            { $group: { _id: { domainId: '$domainId', pid: '$pid' }, submits: { $sum: 1 },
                accepted: { $max: { $cond: [{ $eq: ['$status', STATUS.STATUS_ACCEPTED] }, 1, 0] } } } },
        ]).toArray(),
    ]);
    // A lesson in any authorized classroom masks simultaneous practice; only selected
    // classrooms contribute visible class time or establish the learner's chart history.
    const merge = (firstDay: string, lastDay: string, from: number, to: number) => mergeLearningTime(
        snapshot.rows.filter((row) => row.day >= firstDay && row.day <= lastDay),
        snapshot.lessons.filter((lesson) => +lesson.startAt < to && +lesson.endAt > from),
        from, to, { classDomainIds: ids, observedAt: +now },
    );
    const measured = merge(dayString(trendStart), dayString(now), +trendStart, +now);
    const selectedTimes = merge(dayString(start), dayString(end), rangeStart, rangeEnd);
    const selectedLessons = snapshot.lessons.filter((lesson) => ids.includes(lesson.domainId)
        && +lesson.startAt < +lesson.endAt && +lesson.startAt < +now);
    let firstRecordedAt = snapshot.collectionStartedAt;
    for (const lesson of selectedLessons) {
        if (firstRecordedAt === null || +lesson.startAt < firstRecordedAt) firstRecordedAt = +lesson.startAt;
    }
    const { periods, trends } = trainingStudentPeriods(measured.days, firstRecordedAt, time);
    const { averageWeekSeconds, averageWeekHasEstimate, averageWeeks, averageStart, averageEnd } = snapshot.growth;
    const lifetime = presentTime(snapshot.lifetime || undefined);
    const lessonsInRange = selectedLessons.filter((lesson) => +lesson.startAt < rangeEnd && +lesson.endAt > rangeStart)
        .sort((a, b) => +b.startAt - +a.startAt || a.externalId.localeCompare(b.externalId));
    dashboard.detail = {
        ...selected, periods, trends, periodLinks,
        timeBreakdown: presentTime(selectedTimes.students[0]),
        lifetimeEffort: {
            trainingSeconds: lifetime.trainingEstimatedSeconds, classSeconds: lifetime.classSeconds, totalSeconds: lifetime.estimatedSeconds,
            trainingLabel: lifetime.trainingLabel, totalLabel: lifetime.timeLabel, weekCount: averageWeeks, averageStart, averageEnd,
            averageWeeklyTrainingLabel: averageWeekSeconds === null ? '暂无记录' : trainingDurationEstimate(averageWeekSeconds, averageWeekHasEstimate),
        },
        averageTraining: { averageWeekSeconds, averageWeekHasEstimate, averageWeeks, averageStart, averageEnd },
        domains: selectedTimes.domains.map((item) => ({ ...presentTime(item), id: item._id, name: scope.domains.find((d) => d.id === item._id)?.name })),
        lessons: lessonsInRange.slice(0, 100).map((lesson) => ({
            title: lesson.title || '编程课堂', sourceLabel: lesson.source === 'lesson' ? '站内课堂' : '外部课堂',
            domainName: scope.domains.find((d) => d.id === lesson.domainId)?.name || lesson.domainId,
            startLabel: moment(lesson.startAt).tz(TRAINING_TIME_ZONE).format('YYYY-MM-DD HH:mm'),
            endLabel: moment(lesson.endAt).tz(TRAINING_TIME_ZONE).format('YYYY-MM-DD HH:mm'),
            timeLabel: trainingDuration((Math.min(+lesson.endAt, rangeEnd) - Math.max(+lesson.startAt, rangeStart)) / 1000),
        })),
        lessonCount: lessonsInRange.length, lessonLimit: lessonsInRange.length > 100,
        ...await loadTrainingProblemDetails(handler, selectedTimes, submissions, scope.domains),
    };
    return dashboard;
}
