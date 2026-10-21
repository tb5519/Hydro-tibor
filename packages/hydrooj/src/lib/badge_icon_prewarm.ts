import type { DomainDoc } from '../interface';
import workspace from '../model/workspace';
import { getBadgeIconUrl } from './badge_image';
import { resolveBadgeLifetimes } from './user_badge_gallery';

const MAX_ICONS = 4;
const MAX_ICON_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;

/** A small, current-account-only head start, before idle decorative media warming.
 * Read storage metadata only; the browser still loads the normal authorized URL.
 */
export async function getBadgeIconPreloads(
    ctx: any,
    domain: Pick<DomainDoc, '_id' | 'workspaceId'>,
    uid: number,
    selectedBadgeId?: number,
    now = new Date(),
): Promise<string[]> {
    if (!domain?._id || !Number.isSafeInteger(uid) || uid <= 1) return [];
    const legacy = workspace.resolveDomainWorkspaceId(domain) === workspace.LEGACY_WORKSPACE_ID;
    const scope = legacy ? { domainId: { $exists: false } } : { domainId: domain._id };
    const db = ctx.db;
    const owned: any[] = await db.collection('userBadge').find({ owner: uid, ...scope })
        .project({ badgeId: 1, getAt: 1 }).sort({ getAt: -1, badgeId: -1 }).toArray();
    const ids = [...new Set(owned.map((row) => row.badgeId)
        .filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (!ids.length) return [];
    const [badges, grants] = await Promise.all([
        db.collection('badge').find({ _id: { $in: ids }, ...scope }).project({
            _id: 1, users: 1, iconImagePath: 1, iconImageUpdatedAt: 1,
        }).toArray(),
        db.collection('lottery.badgeGrant').find({ uid, ...scope }).project({
            _id: 1, badgeId: 1, sourceBadgeId: 1, repeatEffect: 1, grantedAt: 1,
            expiresAt: 1, expiredAt: 1, revokedAt: 1, supersededAt: 1,
            lotteryBadgeIds: 1, awardedBadgeIds: 1, stateHistory: 1,
        }).toArray(),
    ]);
    const active = resolveBadgeLifetimes(uid, badges, grants, now);
    const byId = new Map<number, any>(badges.map((badge: any) => [badge._id, badge]));
    const order = [...new Set([selectedBadgeId, ...owned.map((row) => row.badgeId)])];
    // Metadata lookup is bounded even for accounts with a large collection.
    const candidates = order.map((id) => byId.get(id))
        .filter((badge) => badge && active.has(badge._id) && badge.iconImagePath).slice(0, 12);
    if (!candidates.length) return [];
    const metadata = await db.collection('storage').find({
        path: { $in: [...new Set(candidates.map((badge) => badge.iconImagePath))] }, autoDelete: null,
    }).project({ path: 1, size: 1 }).toArray();
    const sizes = new Map<string, number>(metadata.map((row: any) => [row.path, row.size]));
    const urls: string[] = [];
    const seenPaths = new Set<string>();
    let total = 0;
    for (const badge of candidates) {
        const size = sizes.get(badge.iconImagePath);
        if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_ICON_BYTES
            || total + size > MAX_TOTAL_BYTES || seenPaths.has(badge.iconImagePath)) continue;
        const url = getBadgeIconUrl(domain._id, badge);
        if (!url || urls.includes(url)) continue;
        seenPaths.add(badge.iconImagePath);
        urls.push(url);
        total += size;
        if (urls.length >= MAX_ICONS) break;
    }
    return urls;
}
