import type { DomainDoc } from '../interface';
import { PERM, PRIV, STATUS } from '../model/builtin';
import domain from '../model/domain';
import problem, { ProblemDoc } from '../model/problem';
import type { User } from '../model/user';
import workspace from '../model/workspace';
import { DomainRankingMode, getDomainRankingMode } from './domain_ranking';
import { getOjDomainQuery } from './domain_type';
import { getSharedRankingSnapshot } from './shared_ranking';

export interface ProfileStatistics {
    rp: number;
    rank: number | null;
    nAccept: number;
    nSubmit: number;
    nLiked: number;
    level: number;
    rpInfo: Record<string, number>;
}

const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

function localStatistics(target: User): ProfileStatistics {
    return {
        rp: number(target.rp),
        rank: typeof target.rank === 'number' ? target.rank : null,
        nAccept: number(target.nAccept),
        nSubmit: number(target.nSubmit),
        nLiked: number(target.nLiked),
        level: number(target.level),
        rpInfo: { ...(target.rpInfo || {}) },
    };
}

async function acceptedProblems(domainId: string, uid: number, viewer: User, permissions?: bigint): Promise<ProblemDoc[]> {
    const hasPerm = (permission: bigint) => (permissions === undefined
        ? viewer.hasPerm(permission)
        : (permissions & viewer.scope & permission) === permission);
    if (!hasPerm(PERM.PERM_VIEW_PROBLEM)) return [];
    const statuses = await problem.getMultiStatus(domainId, { uid, status: STATUS.STATUS_ACCEPTED }).toArray();
    const ids = [...new Set(statuses.map((status) => status.docId))];
    const docs = await problem.getList(
        domainId, ids, hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || viewer._id,
        false, problem.PROJECTION_LIST, true,
    );
    return Object.values(docs);
}

/** Read the same persisted totals as ranking; never recalculate or write RP. */
export async function getProfileStatistics(
    currentDomain: Pick<DomainDoc, '_id' | 'domainType' | 'rankingMode'>,
    viewer: User, target: User,
): Promise<{ rankingMode: DomainRankingMode, stats: ProfileStatistics, acceptedProblems: ProblemDoc[] }> {
    const rankingMode = getDomainRankingMode(currentDomain);
    if (rankingMode !== 'all') {
        return {
            rankingMode,
            stats: localStatistics(target),
            acceptedProblems: await acceptedProblems(currentDomain._id, target._id, viewer),
        };
    }

    const [domains, rows] = await Promise.all([
        domain.getMulti(getOjDomainQuery()).project<Pick<DomainDoc, '_id' | 'workspaceId'>>({ _id: 1, workspaceId: 1 }).toArray(),
        getSharedRankingSnapshot(),
    ]);
    const memberships = await domain.collUser.find({
        domainId: { $in: domains.map((ddoc) => ddoc._id) }, uid: target._id, join: true,
    }).project({ domainId: 1, nAccept: 1, nSubmit: 1, nLiked: 1, rp: 1, rpInfo: 1, sharedRp: 1, sharedRpInfo: 1 }).toArray();
    const row = rows.find((candidate) => candidate.uid === target._id);
    const hasSharedRp = memberships.some((member) => typeof member.sharedRp === 'number');
    let fallbackRp = 0;
    let fallbackRpInfo: Record<string, number> = {};
    for (const member of memberships) {
        const rp = Math.max(0, number(hasSharedRp ? member.sharedRp : member.rp));
        if (rp > fallbackRp) {
            fallbackRp = rp;
            fallbackRpInfo = { ...((hasSharedRp ? member.sharedRpInfo : member.rpInfo) || {}) };
        }
    }
    const stats: ProfileStatistics = {
        rp: row?.totalRp ?? fallbackRp,
        rank: row?.rank ?? null,
        nAccept: row?.totalAccept ?? memberships.reduce((sum, member) => sum + number(member.nAccept), 0),
        nSubmit: row?.totalSubmit ?? memberships.reduce((sum, member) => sum + number(member.nSubmit), 0),
        nLiked: memberships.reduce((sum, member) => sum + number(member.nLiked), 0),
        level: row?.level ?? 0,
        rpInfo: { ...(row?.rpInfo || fallbackRpInfo) },
    };

    // A current classroom's teacher permission must never unlock another
    // classroom's hidden problems, removed membership, or teacher workspace.
    const restrictWorkspace = workspace.isEnabled() && viewer._id > 1 && !workspace.isPlatformAdmin(viewer._id);
    const assignedWorkspaces = restrictWorkspace ? await workspace.getAssignedWorkspaceIds(viewer._id) : null;
    const joinedDomainIds = new Set(memberships.map((member) => member.domainId));
    const lists = await Promise.all(domains.filter((ddoc) => joinedDomainIds.has(ddoc._id)).map(async (ddoc) => {
        if (ddoc._id === currentDomain._id) return acceptedProblems(ddoc._id, target._id, viewer);
        if (assignedWorkspaces) {
            const workspaceId = workspace.resolveDomainWorkspaceId(ddoc);
            if (assignedWorkspaces.length
                ? !assignedWorkspaces.includes(workspaceId)
                : workspaceId !== workspace.LEGACY_WORKSPACE_ID) return [];
        }
        const membership = await domain.getDomainUser(ddoc._id, viewer);
        if (viewer._id > 1 && membership.join === false && membership.blockedByStudentManagement) return [];
        const permissions = BigInt(membership.perm || 0);
        if (!viewer.hasPriv(PRIV.PRIV_VIEW_ALL_DOMAIN) && (permissions & viewer.scope & PERM.PERM_VIEW) !== PERM.PERM_VIEW) return [];
        return acceptedProblems(ddoc._id, target._id, viewer, permissions);
    }));
    const seen = new Set<string>();
    const visible = lists.flat().filter((pdoc) => {
        const key = JSON.stringify([pdoc.domainId, pdoc.docId]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return { rankingMode, stats, acceptedProblems: visible };
}
