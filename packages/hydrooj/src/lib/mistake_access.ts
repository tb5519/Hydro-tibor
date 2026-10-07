import { ObjectId } from 'mongodb';
import { ContestNotFoundError } from '../error';
import type { ProblemDoc, Tdoc, User } from '../interface';
import { PERM } from '../model/builtin';
import * as contest from '../model/contest';
import type { MistakeDoc } from '../model/mistake';
import problem from '../model/problem';
import user from '../model/user';
import { canManageHomeworkReview } from './homework_review';

/** The saved source is a navigation hint, never an independent grant to a hidden problem. */
export async function canAccessHomeworkProblem(viewer: User, domainId: string, pdoc: ProblemDoc, homework: Tdoc, status: any) {
    if (!homework || homework.domainId !== domainId || homework.rule !== 'homework'
        || !homework.pids.includes(pdoc.docId) || problem.isObjectiveSource(pdoc)
        || !viewer.hasPerm(PERM.PERM_VIEW_HOMEWORK) || contest.isNotStarted(homework)) return false;
    if (!viewer.own(homework) && !viewer.hasPerm(PERM.PERM_VIEW_HIDDEN_HOMEWORK)
        && !canManageHomeworkReview(viewer, homework) && !(homework.assignedUsers || []).includes(viewer._id)) return false;
    if (homework.assign?.length && !viewer.own(homework) && !viewer.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST)) {
        const groups = await user.listGroup(domainId, viewer._id);
        if (!groups.some((group) => homework.assign.includes(group.name))) return false;
    }
    return contest.isDone(homework, status) || !!(status?.attend && status.startAt);
}

export async function loadMistakeHomework(viewer: User, domainId: string, mdoc: MistakeDoc, pdoc: ProblemDoc) {
    if (mdoc.uid !== viewer._id || mdoc.domainId !== domainId || mdoc.pid !== pdoc.docId
        || !mdoc.homeworkId || !ObjectId.isValid(mdoc.homeworkId)) return null;
    try {
        const [homework, status] = await Promise.all([
            contest.get(domainId, mdoc.homeworkId),
            contest.getStatus(domainId, mdoc.homeworkId, viewer._id),
        ]);
        return await canAccessHomeworkProblem(viewer, domainId, pdoc, homework, status) ? { homework, status } : null;
    } catch (error) {
        if (error instanceof ContestNotFoundError) return null;
        throw error;
    }
}
