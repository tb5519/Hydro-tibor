import type { KoaContext } from '@hydrooj/framework';
import { isHomePosterImageRequest } from '../../lib/decorative_image_access';
import { isDomainAvatarImageRequest } from '../../lib/domain_avatar_access';
import { isScratchShareRequest } from '../../lib/scratch_share_access';
import workspace from '../../model/workspace';

const WORKSPACE_NEUTRAL_PATHS = [
    /^\/login$/,
    /^\/logout$/,
    /^\/register(?:\/[^/]+)?$/,
    /^\/lostpass(?:\/[^/]+)?$/,
    /^\/oauth\/[^/]+\/(?:login|callback)$/,
    /^\/user\/(?:sudo|tfa|webauthn)$/,
    /^\/language\/[^/]+$/,
    /^\/(?:workspace|platform)(?:\/|$)/,
    /^\/(?:lazy|resource)\/[^/]+\/[^/]+$/,
    /^\/service-worker-config$/,
];

function isWorkspaceNeutralPath(path: string, method: string) {
    return isDomainAvatarImageRequest(path, method) || isHomePosterImageRequest(path, method) || isScratchShareRequest(path, method)
        || WORKSPACE_NEUTRAL_PATHS.some((pattern) => pattern.test(path));
}

/**
 * Enforce the teacher-workspace boundary for every domain request. Membership
 * in system is retained for Hydro compatibility, but it no longer grants a
 * modern workspace account access to the legacy Tang teaching data.
 */
export async function resolveWorkspaceAccess(ctx: KoaContext) {
    const currentUser = ctx.HydroContext.user;
    if (!currentUser || currentUser._id <= 1 || workspace.isPlatformAdmin(currentUser._id)
        || isWorkspaceNeutralPath(ctx.request.path, ctx.request.method)) {
        return { allowed: true, redirect: '' };
    }
    // A student removed by management has an explicit membership tombstone.
    // The normal guest role can still view public domain pages, so block the
    // removed account at the shared HTTP/WS gate until an administrator joins
    // them again. Never-joined visitors have no tombstone and keep existing access.
    const membership = (currentUser as typeof currentUser & {
        _dudoc?: { domainId?: string, join?: boolean, blockedByStudentManagement?: boolean };
    })._dudoc;
    if (membership?.domainId === ctx.domainInfo?._id && membership.join === false
        && membership.blockedByStudentManagement) {
        return { allowed: false, redirect: '' };
    }
    if (!workspace.isEnabled()) return { allowed: true, redirect: '' };
    const assignedWorkspaceIds = await workspace.getAssignedWorkspaceIds(currentUser._id);
    const currentWorkspaceId = workspace.resolveDomainWorkspaceId(ctx.domainInfo);
    const allowed = assignedWorkspaceIds.length
        ? assignedWorkspaceIds.includes(currentWorkspaceId)
        : currentWorkspaceId === workspace.LEGACY_WORKSPACE_ID;
    if (!allowed && assignedWorkspaceIds.length && ['GET', 'HEAD'].includes(ctx.request.method)) {
        const domains = await workspace.getDomains(assignedWorkspaceIds[0]);
        const preferredDomain = domains.find((item) => item._id === (currentUser as any).defaultDomain) || domains[0];
        if (preferredDomain) {
            const path = ctx.originalPath.replace(/^\/d\/[^/]+\//, '/');
            const query = ctx.request.querystring ? `?${ctx.request.querystring}` : '';
            return { allowed: false, redirect: `/d/${preferredDomain._id}${path}${query}` };
        }
    }
    return { allowed, redirect: '' };
}
