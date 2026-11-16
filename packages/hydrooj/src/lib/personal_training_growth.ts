import moment from 'moment-timezone';
import type { Context } from '../context';
import type { DomainDoc } from '../interface';
import workspace from '../model/workspace';
import { calendarWeek } from './calendar_week';
import { mergeLearningTime } from './learning_time';
import { TRAINING_TIME_ZONE, trainingAverageWindow } from './training_dashboard';

/** Personal progress uses the same autonomous-time ledger and completed-week
 * comparison as the teacher dashboard. Imported lessons mask matching activity
 * across classrooms without exposing lesson or other learners' details. */
export async function getPersonalTrainingGrowth(
    ctx: Context, currentDomain: Pick<DomainDoc, '_id' | 'workspaceId'>, uid: number, now = new Date(),
) {
    const week = calendarWeek(now, TRAINING_TIME_ZONE);
    const localNow = moment(now).tz(TRAINING_TIME_ZONE);
    const workspaceId = workspace.resolveDomainWorkspaceId(currentDomain);
    const workspaceDomains = await workspace.getDomains(workspaceId);
    const domainIds = workspaceId === workspace.LEGACY_WORKSPACE_ID
        ? workspaceDomains.map((domain) => domain._id).sort() : [currentDomain._id];
    const classDomainIds = [...new Set(workspaceDomains.map((domain) => domain._id))];
    const metadata = await ctx.db.collection('training.time.meta').findOne({ _id: 'collection' });
    const average = trainingAverageWindow(metadata?.startedAt || null, now);
    const from = Math.min(+week.start, +average.start);
    const to = +now;
    const firstDay = moment(from).tz(TRAINING_TIME_ZONE).format('YYYY-MM-DD');
    const lastDay = localNow.format('YYYY-MM-DD');
    // Read at most the current week plus four completed weeks. No full-history
    // scan or per-visit flush is needed: the existing ledger owns persistence.
    const [rows, lessons] = domainIds.length ? await Promise.all([
        ctx.db.collection('training.time.daily').find({
            uid, domainId: { $in: domainIds }, day: { $gte: firstDay, $lte: lastDay },
        }).toArray(),
        ctx.db.collection('training.class').find({
            uid, workspaceId, domainId: { $in: classDomainIds },
            startAt: { $lt: new Date(to) }, endAt: { $gt: new Date(from) },
        }).toArray(),
    ]) : [[], []];
    const merge = (start: number, end: number) => mergeLearningTime(rows, lessons, start, end, { classDomainIds: domainIds });
    const current = merge(+week.start, to);
    const currentStudent = current.students.find((student) => student._id === uid);
    const completed = average.weeks ? merge(+average.start, +average.end).students.find((student) => student._id === uid) : null;
    const currentDays = new Map(current.days.map((day) => [day._id, day]));
    const days = Array.from({ length: 7 }, (_, index) => {
        const date = moment(week.start).tz(TRAINING_TIME_ZONE).add(index, 'days').format('YYYY-MM-DD');
        const row = currentDays.get(date);
        return { date, seconds: row?.trainingEstimatedSeconds ?? row?.trainingSeconds ?? 0, hasEstimate: !!row?.hasEstimate };
    });
    return {
        thisWeekSeconds: currentStudent?.trainingEstimatedSeconds ?? currentStudent?.trainingSeconds ?? 0,
        thisWeekHasEstimate: !!currentStudent?.hasEstimate,
        averageWeekSeconds: average.weeks
            ? (completed?.trainingEstimatedSeconds ?? completed?.trainingSeconds ?? 0) / average.weeks : null,
        averageWeekHasEstimate: !!completed?.hasEstimate,
        averageWeeks: average.weeks,
        averageStart: average.start.format('YYYY-MM-DD'),
        averageEnd: average.end.format('YYYY-MM-DD'),
        days,
    };
}
