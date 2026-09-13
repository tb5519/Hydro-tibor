import { Filter, ObjectId } from 'mongodb';
import { PermissionError, ProblemNotFoundError, RecordNotFoundError, ValidationError } from '../error';
import type { RecordDoc } from '../interface';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import problem, { type ProblemDoc } from '../model/problem';
import record from '../model/record';
import { langs } from '../model/setting';
import user from '../model/user';
import type { Handler } from '../service/server';
import { buildObjectiveMergedReview } from './objective_merged_review';
import { buildObjectiveInitialSubmission, loadObjectiveSubmissionConfig } from './objective_submission';
import { canManageRecordList } from './record_list_scope';
import { appendHiddenSuperAdminFilter, getHiddenSuperAdminUids } from './record_visibility';

export function canUseProblemRecordPicker(viewer: Handler['user']) {
    return viewer.hasPriv(PRIV.PRIV_USER_PROFILE) && viewer.hasPerm(PERM.PERM_VIEW_PROBLEM)
        && viewer.hasPerm(PERM.PERM_VIEW_RECORD) && canManageRecordList(viewer);
}

export function assertRecordReplayRequest(fromRecord?: ObjectId, tid?: ObjectId, reviewUid?: number, mergedUid?: number) {
    if (fromRecord && (tid !== undefined || reviewUid !== undefined || mergedUid !== undefined)) throw new ValidationError('fromRecord');
    if (mergedUid !== undefined && (tid !== undefined || reviewUid !== undefined
        || !Number.isSafeInteger(mergedUid) || mergedUid <= 1)) throw new ValidationError('mergedUid');
}

export function isFormalProblemRecord(rdoc: RecordDoc | null, domainId: string, pid: number) {
    return !!rdoc && rdoc.domainId === domainId && rdoc.pid === pid
        && rdoc.input === undefined && rdoc.hackTarget === undefined && rdoc.files?.hack === undefined
        && ![record.RECORD_PRETEST, record.RECORD_GENERATE].some((id) => id.equals(rdoc.contest));
}

export function problemRecordListFilter(pid: number, accepted = false, cursor?: ObjectId): Filter<RecordDoc> {
    return {
        pid,
        contest: { $nin: [record.RECORD_PRETEST, record.RECORD_GENERATE] },
        input: { $exists: false },
        hackTarget: { $exists: false },
        'files.hack': { $exists: false },
        ...(accepted ? { status: STATUS.STATUS_ACCEPTED } : {}),
        ...(cursor ? { _id: { $lt: cursor } } : {}),
    };
}

/** Match RecordDetail's result and source permissions before exposing a snapshot. */
async function createRecordReader(handler: Handler, domainId: string, pdoc: ProblemDoc) {
    if (!canUseProblemRecordPicker(handler.user)) throw new PermissionError(PERM.PERM_VIEW_RECORD);
    if (pdoc.domainId !== domainId) throw new ProblemNotFoundError(domainId, pdoc.docId);
    if (!problem.canViewBy(pdoc, handler.user)) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
    const [hiddenUids, self] = await Promise.all([
        getHiddenSuperAdminUids(handler.user),
        problem.getStatus(domainId, pdoc.docId, handler.user._id),
    ]);
    const contestCache = new Map<string, Promise<{
        tdoc: Awaited<ReturnType<typeof contest.get>>;
        tsdoc: Awaited<ReturnType<typeof contest.getStatus>>;
    }>>();
    async function read(rdoc: RecordDoc) {
        if (!isFormalProblemRecord(rdoc, domainId, pdoc.docId) || hiddenUids.includes(rdoc.uid)) return null;
        let visibleRecord = rdoc;
        let canViewCode = rdoc.uid === handler.user._id
            || handler.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)
            || handler.user.hasPerm(PERM.PERM_READ_RECORD_CODE)
            || (handler.user.hasPerm(PERM.PERM_READ_RECORD_CODE_ACCEPT) && self?.status === STATUS.STATUS_ACCEPTED);
        if (rdoc.contest) {
            const key = rdoc.contest.toString();
            if (!contestCache.has(key)) {
                contestCache.set(key, Promise.all([
                    contest.get(domainId, rdoc.contest),
                    contest.getStatus(domainId, rdoc.contest, handler.user._id),
                ]).then(([tdoc, tsdoc]) => ({ tdoc, tsdoc })));
            }
            const { tdoc, tsdoc } = await contestCache.get(key);
            if (!tdoc || tdoc.domainId !== domainId || !tdoc.pids.includes(pdoc.docId)) return null;
            const canView = handler.user.own(tdoc) || contest.canShowRecord.call(handler, tdoc)
                || (rdoc.uid === handler.user._id && contest.canShowSelfRecord.call(handler, tdoc, true));
            if (!canView) return null;
            visibleRecord = handler.user.own(tdoc) || handler.user.hasPerm(PERM.PERM_EDIT_CONTEST)
                ? rdoc : contest.applyProjection(tdoc, { ...rdoc }, handler.user);
            // A partially projected result must not leak its original grade through the picker.
            if (visibleRecord.status === undefined || (rdoc.score !== undefined && visibleRecord.score === undefined)
                || (visibleRecord.testCases?.length || 0) !== (rdoc.testCases?.length || 0)) return null;
            canViewCode ||= handler.user.own(tdoc)
                || (tdoc.allowViewCode && contest.isDone(tdoc) && !!tsdoc?.attend);
        }
        return { rdoc: visibleRecord, canImport: canViewCode && typeof rdoc.code === 'string' && !rdoc.files?.code };
    }
    return { hiddenUids, read };
}

function recordMetadata(handler: Handler, pdoc: ProblemDoc, rdoc: RecordDoc, name: string) {
    return {
        rid: rdoc._id.toString(),
        uid: rdoc.uid,
        name,
        status: rdoc.status,
        ...(Number.isFinite(rdoc.score) ? { score: rdoc.score } : {}),
        lang: rdoc.lang,
        langName: langs[rdoc.lang]?.display || rdoc.lang,
        submittedAt: rdoc._id.getTimestamp().toISOString(),
        recordUrl: handler.url('record_detail', { domainId: pdoc.domainId, rid: rdoc._id }),
    };
}

export async function listProblemSubmissionRecords(
    handler: Handler, domainId: string, pdoc: ProblemDoc, accepted = false, cursor?: ObjectId,
) {
    const reader = await createRecordReader(handler, domainId, pdoc);
    const filter = appendHiddenSuperAdminFilter(problemRecordListFilter(pdoc.docId, accepted, cursor), reader.hiddenUids);
    const records = [];
    const names = new Map<number, string>();
    for await (const candidate of record.getMulti(domainId, filter).sort({ _id: -1 })) {
        const visible = await reader.read(candidate);
        if (!visible) continue;
        // Only visible record IDs are used as pagination cursors.
        if (records.length === 20) return { records, nextCursor: records[19].rid };
        if (!names.has(candidate.uid)) {
            const owner = await user.getById(domainId, candidate.uid);
            names.set(candidate.uid, owner?.displayName || owner?.uname || '已注销学员');
        }
        records.push({
            ...recordMetadata(handler, pdoc, visible.rdoc, names.get(candidate.uid)),
            canImport: visible.canImport,
            importUrl: visible.canImport ? handler.url('problem_detail', {
                domainId, pid: pdoc.pid || pdoc.docId, query: { fromRecord: candidate._id.toString() },
            }) : '',
        });
    }
    return { records, nextCursor: null };
}

async function isObjectiveProblem(pdoc: ProblemDoc) {
    const source = pdoc.reference ? await problem.get(pdoc.reference.domainId, pdoc.reference.pid) : pdoc;
    return typeof source?.config === 'object' && source.config?.type === 'objective';
}

export async function listProblemMergedSubmissions(handler: Handler, domainId: string, pdoc: ProblemDoc, cursor?: ObjectId) {
    const reader = await createRecordReader(handler, domainId, pdoc);
    if (!(await isObjectiveProblem(pdoc))) throw new ValidationError('mode');
    const filter = appendHiddenSuperAdminFilter(problemRecordListFilter(pdoc.docId), reader.hiddenUids);
    const students = new Map<number, { rid: ObjectId, uid: number, submissionCount: number }>();
    // Group before applying the cursor, otherwise an older attempt would repeat its student on the next page.
    for await (const candidate of record.getMulti(domainId, filter, {
        projection: { compilerTexts: 0, judgeTexts: 0, 'testCases.message': 0 },
    }).sort({ _id: -1 })) {
        const visible = await reader.read(candidate);
        if (!visible?.canImport) continue;
        const existing = students.get(candidate.uid);
        if (existing) existing.submissionCount++;
        else students.set(candidate.uid, { rid: candidate._id, uid: candidate.uid, submissionCount: 1 });
    }
    const page = [...students.values()].filter((item) => !cursor || item.rid.toString() < cursor.toString()).slice(0, 21);
    const records = await Promise.all(page.slice(0, 20).map(async ({ rid, uid, submissionCount }) => {
        const owner = await user.getById(domainId, uid);
        return {
            rid: rid.toString(),
            uid,
            name: owner?.displayName || owner?.uname || '已注销学员',
            submittedAt: rid.getTimestamp().toISOString(),
            submissionCount,
            canImport: true,
            importUrl: handler.url('problem_detail', { domainId, pid: pdoc.pid || pdoc.docId, query: { mergedUid: uid } }),
        };
    }));
    return { mode: 'merged' as const, records, nextCursor: page.length > 20 ? records[19].rid : null };
}

export async function loadProblemMergedReview(handler: Handler, domainId: string, pdoc: ProblemDoc, uid: number) {
    assertRecordReplayRequest(undefined, undefined, undefined, uid);
    const reader = await createRecordReader(handler, domainId, pdoc);
    if (!(await isObjectiveProblem(pdoc))) throw new ValidationError('mergedUid');
    const filter = appendHiddenSuperAdminFilter({ ...problemRecordListFilter(pdoc.docId), uid }, reader.hiddenUids);
    const records: RecordDoc[] = [];
    for await (const candidate of record.getMulti(domainId, filter).sort({ _id: 1 })) {
        if (candidate.uid !== uid) continue;
        const visible = await reader.read(candidate);
        if (visible?.canImport) records.push({ ...visible.rdoc, code: candidate.code });
    }
    if (!records.length) throw new RecordNotFoundError(domainId, uid.toString());
    const [owner, { config }] = await Promise.all([
        user.getById(domainId, uid), loadObjectiveSubmissionConfig(domainId, pdoc.docId),
    ]);
    return buildObjectiveMergedReview(records, config, { uid, name: owner?.displayName || owner?.uname || '已注销学员' });
}

function publicReplayRecord(rdoc: RecordDoc) {
    return {
        _id: rdoc._id, uid: rdoc.uid, pid: rdoc.pid, status: rdoc.status,
        score: rdoc.score, time: rdoc.time, memory: rdoc.memory, contest: rdoc.contest,
        testCases: (rdoc.testCases || []).map(({ id, subtaskId, status, score, time, memory }) => ({
            id, subtaskId, status, score, time, memory,
        })),
    };
}

export async function loadProblemRecordReplay(handler: Handler, domainId: string, pdoc: ProblemDoc, rid: ObjectId) {
    const reader = await createRecordReader(handler, domainId, pdoc);
    const rdoc = await record.get(domainId, rid);
    if (!isFormalProblemRecord(rdoc, domainId, pdoc.docId)) throw new RecordNotFoundError(domainId, rid);
    const visible = await reader.read(rdoc);
    if (!visible?.canImport) throw new RecordNotFoundError(domainId, rid);
    const owner = await user.getById(domainId, rdoc.uid);
    const publicRecord = publicReplayRecord(visible.rdoc);
    const objective = typeof pdoc.config === 'object' && pdoc.config?.type === 'objective'
        ? buildObjectiveInitialSubmission({ ...publicRecord, code: rdoc.code } as RecordDoc,
            (await loadObjectiveSubmissionConfig(domainId, pdoc.docId)).config)
        : undefined;
    return {
        ...recordMetadata(handler, pdoc, visible.rdoc, owner?.displayName || owner?.uname || '已注销学员'),
        code: rdoc.code,
        record: publicRecord,
        ...(objective ? { objective } : {}),
    };
}
