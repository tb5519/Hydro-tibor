import { getBadgeAcDisplayUrl } from './badge_image';
import workspace from '../model/workspace';

/** Bounded, read-only catalog using the same scope as authorized badge image handlers. */
export async function getImageWarmupPage(ctx: any, domain: { _id: string; workspaceId?: string }, uid: number, after = 0) {
    if (uid <= 1 || !Number.isSafeInteger(after) || after < 0) return { items: [], next: null };
    const legacy = workspace.resolveDomainWorkspaceId(domain) === workspace.LEGACY_WORKSPACE_ID;
    const rows = await ctx.db.collection('badge').find({
        ...(legacy ? { domainId: { $exists: false } } : { domainId: domain._id }), _id: { $gt: after },
    }).project({ _id: 1, backgroundImagePath: 1, backgroundImageUpdatedAt: 1, acImagePath: 1, acImageUpdatedAt: 1 })
        .sort({ _id: 1 }).limit(9).toArray();
    const page = rows.slice(0, 8);
    const candidates = page.flatMap((badge) => [
        { path: badge.backgroundImagePath, url: `/d/${encodeURIComponent(domain._id)}/badge/${badge._id}/background?v=${encodeURIComponent(badge.backgroundImageUpdatedAt || '')}` },
        { path: badge.acImagePath, url: getBadgeAcDisplayUrl(domain._id, badge) },
    ].filter((item) => item.path && item.url));
    const metadata = candidates.length ? await ctx.db.collection('storage').find({
        path: { $in: candidates.map((item) => item.path) }, autoDelete: null,
    }).project({ path: 1, size: 1 }).toArray() : [];
    const sizes = new Map<string, number>(metadata.map((item) => [item.path, item.size]));
    const items = candidates.filter((item) => Number.isSafeInteger(sizes.get(item.path))
        && sizes.get(item.path) > 0 && sizes.get(item.path) <= 8 * 1024 * 1024)
        .map((item) => ({ url: item.url, size: sizes.get(item.path) }));
    return { items, next: rows.length > 8 ? page[page.length - 1]._id : null };
}
