import { load } from 'js-yaml';
import type { ObjectId } from 'mongodb';
import { PermissionError, ProblemConfigError, ProblemNotFoundError, RecordNotFoundError } from '../error';
import type { RecordDoc } from '../interface';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import problem, { type ProblemDoc } from '../model/problem';
import record from '../model/record';
import type { Handler } from '../service/server';
import { buildObjectiveFeedback, type ObjectiveFeedback, parseObjectiveConfig } from './objective_feedback';

export interface ObjectiveInitialSubmission {
    answers: Record<string, string | string[]>;
    feedback: ObjectiveFeedback;
}

/** Only copy the student's answer values, never grading keys or judge messages. */
export function buildObjectiveInitialSubmission(
    rdoc: RecordDoc, config: unknown, feedback?: ObjectiveFeedback,
): ObjectiveInitialSubmission {
    const parsedConfig = parseObjectiveConfig(config);
    const grading = parsedConfig?.answers;
    const answers: Record<string, string | string[]> = Object.create(null);
    try {
        const submitted = load(rdoc.code || '{}');
        if (submitted && typeof submitted === 'object' && !Array.isArray(submitted)
            && grading && typeof grading === 'object' && !Array.isArray(grading)) {
            for (const [id, value] of Object.entries(submitted)) {
                if (!Object.hasOwn(grading, id)) continue;
                if (typeof value === 'string') answers[id] = value;
                else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) answers[id] = [...value];
            }
        }
    } catch { /* Malformed submissions must not prevent opening the answer sheet. */ }
    return { answers, feedback: feedback || buildObjectiveFeedback(rdoc, parsedConfig || {}) };
}

/** Read the same raw/reference config used by the objective feedback endpoint. */
export async function loadObjectiveSubmissionConfig(domainId: string, pid: number) {
    const pdoc = await problem.get(domainId, pid, problem.PROJECTION_PUBLIC, true);
    if (!pdoc) throw new ProblemNotFoundError(domainId, pid);
    const source = pdoc.reference
        ? await problem.get(pdoc.reference.domainId, pdoc.reference.pid, problem.PROJECTION_PUBLIC, true)
        : pdoc;
    const config = parseObjectiveConfig(source?.config);
    if (!config) throw new ProblemConfigError();
    return { pdoc, config };
}

/** Owner-only restoration and polling share exactly the same grade visibility. */
export async function loadOwnObjectiveRecordSubmission(
    handler: Handler, domainId: string, rdoc: RecordDoc | null,
): Promise<ObjectiveInitialSubmission> {
    handler.checkPriv(PRIV.PRIV_USER_PROFILE);
    if (!rdoc || rdoc.domainId !== domainId || rdoc.uid !== handler.user._id
        || rdoc.input !== undefined || rdoc.hackTarget
        || [record.RECORD_GENERATE, record.RECORD_PRETEST].some((id) => id.equals(rdoc.contest))) {
        throw new RecordNotFoundError(domainId, rdoc?._id);
    }
    const { pdoc, config } = await loadObjectiveSubmissionConfig(domainId, rdoc.pid);
    let visibleRecord = rdoc;
    if (rdoc.contest) {
        const tdoc = await contest.get(domainId, rdoc.contest);
        if (!tdoc) throw new RecordNotFoundError(domainId, rdoc._id);
        const tsdoc = await contest.getStatus(domainId, tdoc.docId, handler.user._id);
        if (!tsdoc?.attend && !problem.canViewBy(pdoc, handler.user)) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        const canView = handler.user.own(tdoc)
            || contest.canShowRecord.call(handler, tdoc)
            || contest.canShowSelfRecord.call(handler, tdoc);
        const projected = handler.user.own(tdoc) || handler.user.hasPerm(PERM.PERM_EDIT_CONTEST)
            ? rdoc : contest.applyProjection(tdoc, { ...rdoc }, handler.user);
        if (!canView || projected.score === undefined || projected.status === undefined
            || (projected.testCases?.length || 0) !== (rdoc.testCases?.length || 0)) {
            return buildObjectiveInitialSubmission(rdoc, config, { rid: rdoc._id.toString(), state: 'hidden' });
        }
        visibleRecord = { ...projected, code: rdoc.code };
    } else if (!problem.canViewBy(pdoc, handler.user)) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
    return buildObjectiveInitialSubmission(visibleRecord, config);
}

/** Restore the latest attempt in this scope, rather than a historical best score. */
export async function loadOwnObjectiveSubmission(
    handler: Handler, domainId: string, pdoc: ProblemDoc, tid?: ObjectId,
): Promise<ObjectiveInitialSubmission | null> {
    if (!handler.user.hasPriv(PRIV.PRIV_USER_PROFILE)) return null;
    const homeworkIds = tid ? [] : (await contest.getMulti(domainId, { rule: 'homework', pids: pdoc.docId })
        .project({ docId: 1 }).toArray()).map((tdoc) => tdoc.docId);
    const rdoc = await record.getMulti(domainId, {
        uid: handler.user._id,
        pid: pdoc.docId,
        input: { $exists: false },
        hackTarget: { $exists: false },
        // Practice may reuse homework attempts, never another contest's answers.
        contest: tid || { $in: [null, ...homeworkIds] },
    }).sort({ _id: -1 }).limit(1).next();
    if (!rdoc) return null;
    return loadOwnObjectiveRecordSubmission(handler, domainId, rdoc);
}
