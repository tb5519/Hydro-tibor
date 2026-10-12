import type { Context } from '../context';
import type { DomainDoc, User } from '../interface';
import { PERM, PRIV } from '../model/builtin';
import workspace from '../model/workspace';
import { isBackgroundVideoPath } from './background_video_path';
import { getHomePosterConfig } from './home_poster';
import { resolveBadgeLifetimes } from './user_badge_gallery';

interface WarmVideo { url: string; poster: string }
type RouteUrl = (routeName: string, args?: any) => string;

/** The current domain's public homepage video needs no extra database reads. */
export function getHomeBackgroundVideoWarmup(
    currentDomain: Pick<DomainDoc, '_id' | 'workspaceId' | 'homePoster'>,
    currentUser: Pick<User, '_id'>,
    routeUrl: RouteUrl,
) {
    const items: WarmVideo[] = [];
    const result = { scope: `${currentUser._id}:${currentDomain._id}`, items };
    const home = getHomePosterConfig(currentDomain);
    const homePrefix = `domain/${currentDomain._id}/home-video`;
    if (home.videoUpdatedAt && isBackgroundVideoPath(homePrefix, home.videoPath)) {
        items.push({
            url: routeUrl('home_background_video', { query: { v: home.videoUpdatedAt } }),
            poster: isBackgroundVideoPath(homePrefix, home.videoPosterPath, true)
                ? routeUrl('home_background_video_poster', { query: { v: home.videoUpdatedAt } }) : '',
        });
    }
    return result;
}

/** Only stable application URLs leave the server; signed object URLs stay transient. */
export async function getBackgroundVideoWarmup(
    ctx: Context,
    currentDomain: Pick<DomainDoc, '_id' | 'workspaceId' | 'homePoster'>,
    currentUser: User,
    routeUrl: RouteUrl,
    now = new Date(),
): Promise<{ scope: string; items: WarmVideo[] }> {
    const result = getHomeBackgroundVideoWarmup(currentDomain, currentUser, routeUrl);
    const { items } = result;
    // The selected homepage decoration already has a deliberately public
    // GET/HEAD route. Never inspect or expose another domain's homepage here.
    if (currentUser._id <= 1 || !currentUser.hasPriv(PRIV.PRIV_USER_PROFILE) || !currentUser.hasPerm(PERM.PERM_VIEW)) return result;
    const legacy = workspace.resolveDomainWorkspaceId(currentDomain) === workspace.LEGACY_WORKSPACE_ID;
    const scope = legacy ? { domainId: { $exists: false } } : { domainId: currentDomain._id };
    const db = ctx.db as any;
    const owned = await db.collection('userBadge').find({ owner: currentUser._id, ...scope })
        .project({ badgeId: 1, getAt: 1 }).toArray();
    const ids = [...new Set<number>(owned.map((row: any) => row.badgeId)
        .filter((id: any) => Number.isSafeInteger(id) && id > 0))];
    if (!ids.length) return result;
    const badges = await db.collection('badge').find({ _id: { $in: ids }, ...scope }).project({
        _id: 1, users: 1, backgroundImagePath: 1, backgroundVideoPath: 1,
        backgroundVideoPosterPath: 1, backgroundVideoUpdatedAt: 1, acImagePath: 1, themeSoundPath: 1,
    }).toArray();
    if (!badges.some((badge: any) => badge.backgroundVideoPath)) return result;
    const [grants, account] = await Promise.all([
        db.collection('lottery.badgeGrant').find({ uid: currentUser._id, ...scope }).project({
            _id: 1, badgeId: 1, sourceBadgeId: 1, repeatEffect: 1, grantedAt: 1,
            expiresAt: 1, expiredAt: 1, revokedAt: 1, supersededAt: 1,
            lotteryBadgeIds: 1, awardedBadgeIds: 1, stateHistory: 1,
        }).toArray(),
        db.collection('user').findOne({ _id: currentUser._id }, { projection: { badgeProfileBackgroundBadgeId: 1 } }),
    ]);
    const lifetimes = resolveBadgeLifetimes(currentUser._id, badges, grants, now);
    const dates = new Map<number, number>();
    for (const row of owned) dates.set(row.badgeId, Math.max(dates.get(row.badgeId) || 0, new Date(row.getAt || 0).getTime() || 0));
    const themes = badges.filter((badge: any) => lifetimes.has(badge._id)
        && (badge.backgroundImagePath || badge.backgroundVideoPath || badge.acImagePath || badge.themeSoundPath))
        .sort((a: any, b: any) => (dates.get(b._id) || 0) - (dates.get(a._id) || 0) || b._id - a._id);
    const theme = themes.find((badge: any) => badge._id === Number(account?.badgeProfileBackgroundBadgeId)) || themes[0];
    const prefix = legacy ? `badge/${theme?._id}/profile-video` : `domain/${currentDomain._id}/badge/${theme?._id}/profile-video`;
    if (theme?.backgroundVideoUpdatedAt && isBackgroundVideoPath(prefix, theme.backgroundVideoPath)) {
        items.push({
            url: routeUrl('badge_background_video', { id: theme._id, query: { v: theme.backgroundVideoUpdatedAt } }),
            poster: isBackgroundVideoPath(prefix, theme.backgroundVideoPosterPath, true)
                ? routeUrl('badge_background_video_poster', { id: theme._id, query: { v: theme.backgroundVideoUpdatedAt } }) : '',
        });
    }
    return result;
}
