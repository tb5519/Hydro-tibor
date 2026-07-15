import type { Context } from '../context';
import type { User } from '../interface';

type RouteUrl = (routeName: string, args?: any) => string;

export interface BadgeAcTheme {
    id: number;
    name: string;
    acImage: string;
    themeSound: string;
}

/**
 * Resolve the signed-in user's currently selected badge theme.  This lives
 * outside the problem handler because a normal submission reaches the record
 * detail page before its result is available.
 */
export async function getActiveBadgeAcTheme(
    ctx: Context,
    currentUser: User,
    routeUrl: RouteUrl,
): Promise<BadgeAcTheme | null> {
    const db = ctx.db as any;
    const selectedBadgeId = Number((currentUser as any).badgeProfileBackgroundBadgeId)
        || Number((currentUser as any).badgeId);
    const userBadges = await db.collection('userBadge')
        .find({ owner: currentUser._id })
        .project({ badgeId: 1 })
        .toArray();
    const badgeIds = Array.from(new Set(userBadges
        .map((badge: any) => Number(badge.badgeId))
        .filter((badgeId) => Number.isSafeInteger(badgeId) && badgeId > 0)));
    if (!badgeIds.length) return null;

    const badges = await db.collection('badge')
        .find({ _id: { $in: badgeIds } })
        .project({
            _id: 1,
            short: 1,
            title: 1,
            backgroundImagePath: 1,
            acImagePath: 1,
            acImageUpdatedAt: 1,
            themeSoundPath: 1,
            themeSoundUpdatedAt: 1,
        })
        .toArray();
    const themedBadges = badges.filter((badge: any) => (
        badge.backgroundImagePath || badge.acImagePath || badge.themeSoundPath
    ));
    const activeBadge = themedBadges.find((badge: any) => Number(badge._id) === selectedBadgeId)
        || themedBadges[0];
    if (!activeBadge || (!activeBadge.acImagePath && !activeBadge.themeSoundPath)) return null;

    return {
        id: activeBadge._id,
        name: activeBadge.short || activeBadge.title || '徽章主题',
        acImage: activeBadge.acImagePath
            ? routeUrl('badge_ac_image', {
                id: activeBadge._id,
                query: { v: activeBadge.acImageUpdatedAt || '' },
            })
            : '',
        themeSound: activeBadge.themeSoundPath
            ? routeUrl('badge_theme_sound', {
                id: activeBadge._id,
                query: { v: activeBadge.themeSoundUpdatedAt || '' },
            })
            : '',
    };
}
