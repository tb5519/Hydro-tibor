import moment from 'moment-timezone';
import type { Context } from '../context';
import type { DomainDoc } from '../interface';
import workspace from '../model/workspace';
import { calendarWeek } from './calendar_week';
import { isScratchDomain } from './domain_type';
import { mergeLearningTime } from './learning_time';
import { TRAINING_TIME_ZONE } from './training_dashboard';

export interface PersonalTrainingGrowthScope {
    workspaceId: string;
    uid: number;
    /** Selected domains, already authorized by the calling handler. */
    domainIds: string[];
    /** The complete server-authorized scope; also limits class-time masks. */
    authorizedDomainIds: string[];
}

/** Reuse the autonomous-time ledger, but average over every natural week
 * covered since collection began, including quiet and partial weeks. Imported
 * lessons mask matching activity without exposing other learners' details. */
export async function getPersonalTrainingGrowth(
    ctx: Context, currentDomain: Pick<DomainDoc, '_id' | 'workspaceId'>, uid: number, now = new Date(),
) {
    const workspaceId = workspace.resolveDomainWorkspaceId(currentDomain);
    const workspaceDomains = await workspace.getDomains(workspaceId);
    const domainIds = workspaceDomains.filter((domain) => !isScratchDomain(domain)
        && (workspaceId === workspace.LEGACY_WORKSPACE_ID || domain._id === currentDomain._id)).map((domain) => domain._id);
    return getScopedPersonalTrainingGrowth(ctx, {
        workspaceId, uid, domainIds, authorizedDomainIds: workspaceDomains.map((domain) => domain._id),
    }, now);
}

/** Shared by personal growth and the teacher dashboard. The caller must derive
 * authorizedDomainIds from server-side permissions, never request parameters.
 * Filtering the visible domains must not expand the class-time mask scope. */
export async function getScopedPersonalTrainingGrowth(
    ctx: Context, scope: PersonalTrainingGrowthScope, now = new Date(),
) {
    return (await loadPersonalTrainingSnapshot(ctx, scope, now)).growth;
}

/** Keep the selected learner's roster, charts and lifetime average on the
 * same ledger read, even when a heartbeat is persisted during the request. */
export async function loadPersonalTrainingSnapshot(
    ctx: Context, scope: PersonalTrainingGrowthScope, now: Date, detail?: { start: number, end: number, recentStart: number },
) {
    if (!scope || !Number.isSafeInteger(scope.uid) || scope.uid <= 0
        || typeof scope.workspaceId !== 'string' || !scope.workspaceId
        || !Array.isArray(scope.domainIds) || !Array.isArray(scope.authorizedDomainIds)
        || scope.authorizedDomainIds.some((id) => typeof id !== 'string' || !id)
        || !Number.isFinite(+now)) throw new Error('Invalid personal training growth scope');
    const authorized = new Set(scope.authorizedDomainIds);
    if (scope.domainIds.some((id) => typeof id !== 'string' || !id || !authorized.has(id))) {
        throw new Error('Selected training domains exceed the authorized scope');
    }
    const { workspaceId, uid } = scope;
    const domainIds = [...new Set(scope.domainIds)].sort();
    const classDomainIds = [...authorized].sort();
    const week = calendarWeek(now, TRAINING_TIME_ZONE);
    const localNow = moment(now).tz(TRAINING_TIME_ZONE);
    const to = +now;
    const lastDay = localNow.format('YYYY-MM-DD');
    // Read only this learner's scoped ledger, with no rolling history cutoff.
    // Collection metadata counts quiet weeks before their first activity too.
    const [metadata, rows] = await Promise.all([
        ctx.db.collection('training.time.meta').findOne({ _id: 'collection' }),
        domainIds.length ? ctx.db.collection('training.time.daily').find({
            uid, domainId: { $in: domainIds }, day: { $lte: lastDay },
        }).toArray() : [],
    ]);
    const collectionStart = metadata?.startedAt ? +new Date(metadata.startedAt) : NaN;
    let firstRecordedAt = Number.isFinite(collectionStart) && collectionStart <= to ? collectionStart : Infinity;
    for (const row of rows) {
        // Earlier legacy rows remain part of the lifetime total if metadata
        // was introduced later. Invalid or empty rows cannot invent history.
        if (!Number.isFinite(row.seconds) || row.seconds <= 0) continue;
        const day = moment.tz(row.day, 'YYYY-MM-DD', true, TRAINING_TIME_ZONE);
        if (day.isValid() && +day <= to) firstRecordedAt = Math.min(firstRecordedAt, +day);
    }
    const averageStart = Number.isFinite(firstRecordedAt) ? moment(firstRecordedAt).tz(TRAINING_TIME_ZONE).startOf('isoWeek') : null;
    const averageWeeks = averageStart ? Math.max(1, moment(week.start).diff(averageStart, 'weeks') + 1) : 0;
    const from = averageStart ? Math.min(+week.start, +averageStart) : +week.start;
    const historyFrom = Math.min(from, detail?.recentStart ?? from);
    const classWindow = (start: number, end: number) => ({ startAt: { $lt: new Date(end) }, endAt: { $gt: new Date(start) } });
    const windows = detail && detail.end < historyFrom
        ? { $or: [classWindow(detail.start, detail.end), classWindow(historyFrom, to)] }
        : classWindow(Math.min(historyFrom, detail?.start ?? historyFrom), to);
    const lessons = domainIds.length && classDomainIds.length ? await ctx.db.collection('training.class').find({
        uid, workspaceId, domainId: { $in: classDomainIds }, ...windows,
    }).toArray() : [];
    const merge = (start: number, end: number) => mergeLearningTime(rows, lessons, start, end, { classDomainIds: domainIds, observedAt: to });
    const current = merge(+week.start, to);
    const currentStudent = current.students.find((student) => student._id === uid);
    const lifetime = averageWeeks ? merge(from, to).students.find((student) => student._id === uid) : null;
    const currentDays = new Map(current.days.map((day) => [day._id, day]));
    const days = Array.from({ length: 7 }, (_, index) => {
        const date = moment(week.start).tz(TRAINING_TIME_ZONE).add(index, 'days').format('YYYY-MM-DD');
        const row = currentDays.get(date);
        return { date, seconds: row?.trainingEstimatedSeconds ?? row?.trainingSeconds ?? 0, hasEstimate: !!row?.hasEstimate };
    });
    const growth = {
        thisWeekSeconds: currentStudent?.trainingEstimatedSeconds ?? currentStudent?.trainingSeconds ?? 0,
        thisWeekHasEstimate: !!currentStudent?.hasEstimate,
        averageWeekSeconds: averageWeeks
            ? (lifetime?.trainingEstimatedSeconds ?? lifetime?.trainingSeconds ?? 0) / averageWeeks : null,
        averageWeekHasEstimate: !!lifetime?.hasEstimate,
        averageWeeks,
        averageStart: averageStart?.format('YYYY-MM-DD') || '',
        averageEnd: lastDay,
        days,
    };
    return { rows, lessons, growth };
}
