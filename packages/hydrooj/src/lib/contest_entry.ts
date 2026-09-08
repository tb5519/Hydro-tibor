import { ObjectId } from 'mongodb';
import { NotFoundError } from '../error';
import type { DomainDoc, Tdoc } from '../interface';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import domain from '../model/domain';
import record from '../model/record';
import user from '../model/user';
import workspace from '../model/workspace';
import type { ConnectionHandler, Handler } from '../service/server';

export interface ContestEntryContext {
    domain: DomainDoc;
    contest: Tdoc;
}

function asObjectId(value: unknown) {
    if (value instanceof ObjectId) return value;
    return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null;
}

/** Resolve only contest-related routes; ordinary problem IDs remain domain-local. */
export async function resolveContestEntry(handler: Handler | ConnectionHandler) {
    const path = handler.request.path.replace(/^\/d\/[^/]+\//, '/');
    const contestPath = /^\/contest\/([a-f\d]{24})(?:\/|$)/i.exec(path);
    const problemPath = /^\/p\/[^/]+(?:\/(?:submit|file(?:\/.*)?))?$/.test(path);
    const recordPath = /^\/record(?:\/([a-f\d]{24}))?$/i.exec(path)
        || /^\/(?:record-conn|record-detail-conn|contest-submit-feedback(?:-conn)?|objective-submit-feedback)$/i.exec(path);
    if (!contestPath && !problemPath && !recordPath) return;
    if (!handler.user.hasPriv(PRIV.PRIV_USER_PROFILE)) return;

    // The domain in the URL has already passed the workspace access check.
    // Query/body parameters must not change that boundary.
    const entryDomain = handler.domain;
    if (!handler.request.websocket || handler.context.originalPath?.startsWith('/d/')) {
        handler.args.domainId = entryDomain._id;
    }

    let tid = asObjectId(contestPath?.[1] || handler.args.tid);
    const rid = recordPath && asObjectId(recordPath[1] || handler.args.rid);
    let rdoc: Awaited<ReturnType<typeof record.get>>;
    if (rid) {
        rdoc = await record.get(rid);
        if (!rdoc) return;
        if (rdoc.contest && ![record.RECORD_PRETEST, record.RECORD_GENERATE].some((id) => id.equals(rdoc.contest))) {
            if (tid && !tid.equals(rdoc.contest)) throw new NotFoundError(rid);
            tid = rdoc.contest;
        } else if (!tid || rdoc.uid !== handler.user._id) return;
    }
    if (!tid) return;

    const tdoc = await (await contest.getMultiVisibleInDomain(entryDomain._id, {
        docId: tid, allDomains: true, rule: { $ne: 'homework' },
    })).next();
    if (!tdoc) return;
    if (rdoc && (rdoc.domainId !== tdoc.domainId || !tdoc.pids.includes(rdoc.pid))) throw new NotFoundError(rid);

    const entryUser = await user.getById(entryDomain._id, handler.user._id, handler.session.scope);
    if (!entryUser?.hasPriv(PRIV.PRIV_VIEW_ALL_DOMAIN) && !entryUser?.hasPerm(PERM.PERM_VIEW)) {
        throw new NotFoundError(entryDomain._id);
    }
    const [sourceDomain, sourceUser] = await Promise.all([
        domain.get(tdoc.domainId),
        user.getById(tdoc.domainId, handler.user._id, handler.session.scope),
    ]);
    if (!sourceDomain || !sourceUser) throw new NotFoundError(tid);
    if (workspace.resolveDomainWorkspaceId(sourceDomain) !== workspace.resolveDomainWorkspaceId(entryDomain)) {
        throw new NotFoundError(tid);
    }

    // Keep all reads, judging and status updates in the original contest domain.
    // UI links and language preference use the domain from which the user entered.
    handler.contestEntryContext = { domain: entryDomain, contest: tdoc };
    handler.args.domainId = tdoc.domainId;
    handler.args.entryDomainId = entryDomain._id;
    if (!contestPath) handler.args.tid = tid;
    handler.domain = sourceDomain;
    handler.user = await sourceUser.private();
    // Sharing a contest grants participant access through the entry domain,
    // but never carries that domain's teacher/administrator rights to its source.
    const participantPermissions = PERM.PERM_VIEW_CONTEST | PERM.PERM_VIEW_CONTEST_SCOREBOARD | PERM.PERM_VIEW_RECORD;
    handler.user.perm |= entryUser.perm & participantPermissions;
    handler.ctx = handler.ctx.extend({ domain: sourceDomain });
    handler.UiContext.domainId = entryDomain._id;
    handler.UiContext.domain = entryDomain;
}

/** Apply the same entry domain to links, including editor polling and sockets. */
export function applyContestEntryUrl(
    entry: ContestEntryContext | undefined, name: string, args: Record<string, any>, query: Record<string, any>,
) {
    if (!entry) return;
    const sourceId = entry.contest.domainId;
    const entryId = entry.domain._id;
    const tid = entry.contest.docId.toString();
    const sameContest = (!args.tid || args.tid === tid) && (!query.tid || query.tid === tid);
    const contestRoute = name.startsWith('contest_') && !['contest_main', 'contest_create'].includes(name);
    const problemRoute = ['problem_detail', 'problem_submit', 'problem_file_download'].includes(name) && query.tid === tid;
    const recordRoute = ['record_main', 'record_detail', 'record_conn', 'record_detail_conn', 'objective_submit_feedback'].includes(name);
    if ((contestRoute || problemRoute || recordRoute) && sameContest && (!args.domainId || args.domainId === sourceId)) {
        args.domainId = entryId;
        query.entryDomainId = entryId;
        if (problemRoute || recordRoute || name.startsWith('contest_submit_feedback')) query.tid = tid;
    } else if (name.startsWith('problem_') && !args.domainId) {
        args.domainId = sourceId;
    }
}
