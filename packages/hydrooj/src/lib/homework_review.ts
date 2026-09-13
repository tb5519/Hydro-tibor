import { ObjectId } from 'mongodb';
import { PermissionError, UserNotFoundError, ValidationError } from '../error';
import type { DomainDoc, RecordDoc, Tdoc, User } from '../interface';
import { PERM, PRIV } from '../model/builtin';
import domain from '../model/domain';
import record from '../model/record';
import user from '../model/user';
import workspace from '../model/workspace';
import { canViewRecordOwner } from './record_visibility';

export function canManageHomeworkReview(viewer: User, homework?: Tdoc) {
    return homework?.rule === 'homework' && (
        viewer.hasPerm(PERM.PERM_EDIT_HOMEWORK)
        || viewer.own(homework, PERM.PERM_EDIT_HOMEWORK_SELF)
    );
}

export function assertHomeworkReviewScope(viewer: User, homework: Tdoc, pid: number, uid: number) {
    if (!Number.isSafeInteger(uid) || uid <= 1) throw new ValidationError('reviewUid');
    if (!canManageHomeworkReview(viewer, homework)
        || !homework.pids.includes(pid)
        || !(homework.assignedUsers || []).includes(uid)) {
        throw new PermissionError(PERM.PERM_EDIT_HOMEWORK);
    }
}

export async function authorizeHomeworkReview(viewer: User, ddoc: DomainDoc, homework: Tdoc, pid: number, uid: number) {
    assertHomeworkReviewScope(viewer, homework, pid, uid);
    const invalidTarget = () => new UserNotFoundError(uid.toString());
    const account = await user.coll.findOne({ _id: uid });
    if (!account || !(account.priv & PRIV.PRIV_USER_PROFILE)
        || (account.priv & (PRIV.PRIV_EDIT_SYSTEM | PRIV.PRIV_MANAGE_ALL_DOMAIN | PRIV.PRIV_JUDGE))
        || workspace.isPlatformAdmin(uid)
        || !(await canViewRecordOwner(viewer, uid))) throw invalidTarget();
    const workspaceId = workspace.resolveDomainWorkspaceId(ddoc);
    const [domains, members, excludedLegacyUids] = await Promise.all([
        workspace.getDomains(workspaceId),
        workspace.getMembers(workspaceId),
        workspaceId === workspace.LEGACY_WORKSPACE_ID ? workspace.getExcludedLegacyUids() : Promise.resolve(new Set<number>()),
    ]);
    if (members.some((member) => member.uid === uid) || excludedLegacyUids.has(uid)
        || (workspaceId !== workspace.LEGACY_WORKSPACE_ID && await workspace.isAssignedToOtherWorkspace(uid, workspaceId))) {
        throw invalidTarget();
    }
    const membership = await domain.collUser.findOne({
        uid, join: true, domainId: { $in: domains.map((item) => item._id) },
    });
    const target = membership ? await user.getById(ddoc._id, uid) : null;
    if (!target || target.hasPerm(PERM.PERM_EDIT_DOMAIN)) throw invalidTarget();
    return target;
}

export function rejectHomeworkReviewMutation(request: { query?: any, body?: any, method?: string }) {
    if (['reviewUid', 'mergedUid'].some((field) => request.query?.[field] !== undefined || request.body?.[field] !== undefined)) {
        throw new PermissionError(PERM.PERM_SUBMIT_PROBLEM);
    }
}

export function isHomeworkReviewRecord(rdoc: RecordDoc | null, domainId: string, pid: number, uid: number, tid: ObjectId) {
    return rdoc && rdoc.domainId === domainId && rdoc.pid === pid && rdoc.uid === uid
        && (!rdoc.contest || rdoc.contest.toString() === tid.toString())
        && rdoc.hackTarget === undefined && rdoc.input === undefined && rdoc.files?.hack === undefined;
}

/** Caller must authorizeHomeworkReview first; all ordinary practice and this homework's formal attempts are included. */
export async function loadHomeworkReviewRecords(domainId: string, pid: number, uid: number, homework: Tdoc) {
    if (homework.domainId !== domainId || homework.rule !== 'homework' || !homework.pids.includes(pid)) {
        throw new PermissionError(PERM.PERM_EDIT_HOMEWORK);
    }
    const records: RecordDoc[] = [];
    for await (const rdoc of record.getMulti(domainId, {
        uid, pid,
        contest: { $in: [null, homework.docId] },
        hackTarget: { $exists: false }, input: { $exists: false }, 'files.hack': { $exists: false },
    }).sort({ _id: 1 })) {
        if (isHomeworkReviewRecord(rdoc, domainId, pid, uid, homework.docId)
            && typeof rdoc.code === 'string' && !rdoc.files?.code) records.push(rdoc);
    }
    return records;
}

export async function loadHomeworkReviewRecord(domainId: string, pid: number, uid: number, homework: Tdoc, status: any) {
    const bestRid = status?.detail?.[pid]?.rid;
    if (bestRid && ObjectId.isValid(bestRid)) {
        const best = await record.get(domainId, new ObjectId(bestRid));
        if (isHomeworkReviewRecord(best, domainId, pid, uid, homework.docId)) return best;
    }
    // Ordinary problem ACs also contribute to assigned long-term homework.
    // Never pull an answer from a different contest, pretest or generated run.
    const latest = await record.getMulti(domainId, {
        uid,
        pid,
        contest: { $in: [null, homework.docId] },
        hackTarget: { $exists: false },
        input: { $exists: false },
        'files.hack': { $exists: false },
    }).sort({ _id: -1 }).limit(1).toArray();
    return isHomeworkReviewRecord(latest[0], domainId, pid, uid, homework.docId) ? latest[0] : null;
}

export function publicHomeworkReviewRecord(rdoc: RecordDoc | null) {
    if (!rdoc) return null;
    return {
        _id: rdoc._id,
        uid: rdoc.uid,
        pid: rdoc.pid,
        status: rdoc.status,
        score: rdoc.score,
        time: rdoc.time,
        memory: rdoc.memory,
        contest: rdoc.contest,
        testCases: (rdoc.testCases || []).map(({ id, subtaskId, status, score, time, memory }) => ({
            id, subtaskId, status, score, time, memory,
        })),
    };
}
