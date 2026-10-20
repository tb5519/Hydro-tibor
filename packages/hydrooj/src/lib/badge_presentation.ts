import type { DomainDoc } from '../interface';
import workspace from '../model/workspace';
import { getBadgeIconUrl } from './badge_image';

/** Presentation only. Keep the existing stored text badge compatible with older clients. */
export function badgePresentation(domainId: string, badge: any) {
    const color = (value: unknown, fallback: string) => {
        const text = `${value || ''}`.replace(/^#/, '');
        return `#${/^(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(text) ? text : fallback}`;
    };
    return {
        id: badge._id,
        displayName: `${badge.short || badge.title || badge._id}`,
        backgroundColor: color(badge.backgroundColor, 'e5edf5'),
        fontColor: color(badge.fontColor, '1f2937'),
        tooltip: `${badge.title || badge.short || badge._id}`,
        href: `/d/${encodeURIComponent(domainId)}/badge/${badge._id}`,
        iconUrl: getBadgeIconUrl(domainId, badge),
    };
}

/** One batched lookup for legacy selected badges in discussions, records and other user labels. */
export async function attachSelectedBadgePresentations(
    ctx: any, udocs: any[], domain: Pick<DomainDoc, '_id' | 'workspaceId'>,
) {
    const candidates = udocs.filter((udoc) => typeof udoc?.badge === 'string' && udoc.badge.split('#').length >= 4);
    const badgeId = (udoc: any) => Number(udoc.badge.split('#')[0]);
    const ids = [...new Set(candidates.map(badgeId).filter((id) => Number.isSafeInteger(id) && id > 0))];
    for (const udoc of udocs) if (udoc) udoc.selectedBadgePresentation = null;
    if (!domain?._id || !ids.length) return;
    const legacy = workspace.resolveDomainWorkspaceId(domain) === workspace.LEGACY_WORKSPACE_ID;
    const badges = await ctx.db.collection('badge').find({
        _id: { $in: ids }, ...(legacy ? { domainId: { $exists: false } } : { domainId: domain._id }),
    }).project({ _id: 1, title: 1, short: 1, backgroundColor: 1, fontColor: 1, iconImagePath: 1, iconImageUpdatedAt: 1 }).toArray();
    const byId = new Map(badges.map((badge: any) => [badge._id, badgePresentation(domain._id, badge)]));
    for (const udoc of candidates) udoc.selectedBadgePresentation = byId.get(badgeId(udoc)) || null;
}
