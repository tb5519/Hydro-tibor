import moment from 'moment-timezone';
import type { Context } from '../context';
import type { DomainDoc } from '../interface';
import workspace from '../model/workspace';
import { getBadgeAcDisplayUrl } from './badge_image';

export interface UserBadgeCard {
    id: number;
    title: string;
    short: string;
    acImage: string;
    backgroundColor: string;
    fontColor: string;
    getAt: Date | null;
    expiresAt: string | null;
    expiryLabel: string;
    isCurrent: boolean;
    detailUrl: string;
}

export interface UserBadgeGallery {
    badgeCards: UserBadgeCard[];
    badgeCollection: { total: number, permanent: number, temporary: number, currentName: string };
}

function badgeColor(value: unknown, fallback: string) {
    const color = `${value || ''}`.replace(/^#/, '');
    return `#${/^(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color) ? color : fallback}`;
}

function validDate(value: unknown) {
    if (!(value instanceof Date) && typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function validBadgeId(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) > 0;
}

function grantIsActive(grant: any, now: Date) {
    if (['expiredAt', 'revokedAt', 'supersededAt'].some((field) => Object.hasOwn(grant, field))) return false;
    if (!Object.hasOwn(grant, 'expiresAt')) return true;
    // Invalid expiry data must never silently turn a temporary grant permanent.
    return grant.expiresAt instanceof Date && grant.expiresAt.getTime() > now.getTime();
}

function newerGrant(left: any, right: any) {
    const time = (grant: any) => validDate(grant.grantedAt)?.getTime() || 0;
    return time(left) > time(right) || (time(left) === time(right) && `${left._id}` > `${right._id}`);
}

/** Current ownership after expiry, revocation and upgrade chains are resolved. */
export function resolveBadgeLifetimes(uid: number, badges: any[], grants: any[], now: Date) {
    const referenced = new Set<number>();
    const latestChains = new Map<number, any>();
    const activeByBadge = new Map<number, any[]>();
    const addActiveGrant = (grant: any) => {
        if (!validBadgeId(grant.badgeId) || !grantIsActive(grant, now)) return;
        if (!activeByBadge.has(grant.badgeId)) activeByBadge.set(grant.badgeId, []);
        activeByBadge.get(grant.badgeId)!.push(grant);
    };
    for (const grant of grants) {
        // Historical references identify stale rows; only badgeId grants current ownership.
        const references = [grant.badgeId, grant.sourceBadgeId,
            ...(Array.isArray(grant.lotteryBadgeIds) ? grant.lotteryBadgeIds : []),
            ...(Array.isArray(grant.awardedBadgeIds) ? grant.awardedBadgeIds : []),
            ...(Array.isArray(grant.stateHistory) ? grant.stateHistory.map((state: any) => state?.badgeId) : []),
        ];
        for (const id of references) if (validBadgeId(id)) referenced.add(id);
        if (grant.repeatEffect !== 'upgrade') {
            addActiveGrant(grant);
            continue;
        }
        if (Object.hasOwn(grant, 'supersededAt')) continue;
        const chainId = validBadgeId(grant.sourceBadgeId) ? grant.sourceBadgeId : grant.badgeId;
        if (!validBadgeId(chainId)) continue;
        const previous = latestChains.get(chainId);
        // Select before checking validity, so a revoked/latest state cannot resurrect an old state.
        if (!previous || newerGrant(grant, previous)) latestChains.set(chainId, grant);
    }
    for (const grant of latestChains.values()) addActiveGrant(grant);
    const lifetimes = new Map<number, Date | null>();
    for (const badge of badges) {
        const active = activeByBadge.get(badge._id) || [];
        const manual = Array.isArray(badge.users) && badge.users.includes(uid);
        const permanent = manual || active.some((grant) => !Object.hasOwn(grant, 'expiresAt')) || !referenced.has(badge._id);
        if (!permanent && !active.length) continue;
        lifetimes.set(badge._id, permanent ? null : new Date(Math.max(...active.map((grant) => grant.expiresAt.getTime()))));
    }
    return lifetimes;
}

/** Read only: ownership and current expiry are resolved from this user's exact badge scope. */
export async function getUserBadgeGallery(
    ctx: Context,
    currentDomain: Pick<DomainDoc, '_id' | 'workspaceId'>,
    uid: number,
    now = new Date(),
): Promise<UserBadgeGallery> {
    const empty = (): UserBadgeGallery => ({
        badgeCards: [], badgeCollection: { total: 0, permanent: 0, temporary: 0, currentName: '' },
    });
    if (!Number.isSafeInteger(uid) || uid <= 0) return empty();
    const legacy = workspace.resolveDomainWorkspaceId(currentDomain) === workspace.LEGACY_WORKSPACE_ID;
    const scope = legacy ? { domainId: { $exists: false } } : { domainId: currentDomain._id };
    const db = ctx.db as any;
    const owned: any[] = await db.collection('userBadge').find({ owner: uid, ...scope })
        .project({ badgeId: 1, getAt: 1 }).toArray();
    const ownedDates = new Map<number, Date | null>();
    for (const row of owned) {
        if (!validBadgeId(row.badgeId)) continue;
        const getAt = validDate(row.getAt);
        if (!ownedDates.has(row.badgeId) || (getAt?.getTime() || 0) > (ownedDates.get(row.badgeId)?.getTime() || 0)) {
            ownedDates.set(row.badgeId, getAt);
        }
    }
    if (!ownedDates.size) return empty();
    const [badges, grants, account] = await Promise.all([
        db.collection('badge').find({ _id: { $in: [...ownedDates.keys()] }, ...scope }).project({
            _id: 1, title: 1, short: 1, users: 1, acImagePath: 1, acImageUpdatedAt: 1, backgroundColor: 1, fontColor: 1,
        }).toArray(),
        db.collection('lottery.badgeGrant').find({ uid, ...scope }).project({
            _id: 1, badgeId: 1, sourceBadgeId: 1, repeatEffect: 1, grantedAt: 1,
            expiresAt: 1, expiredAt: 1, revokedAt: 1, supersededAt: 1,
            lotteryBadgeIds: 1, awardedBadgeIds: 1, stateHistory: 1,
        }).toArray(),
        db.collection('user').findOne({ _id: uid }, { projection: { badgeId: 1, badgeDomainId: 1 } }),
    ]);
    const lifetimes = resolveBadgeLifetimes(uid, badges, grants, now);
    const selectedId = (legacy ? !account?.badgeDomainId : account?.badgeDomainId === currentDomain._id)
        ? account?.badgeId : undefined;
    const badgeCards: UserBadgeCard[] = [];
    for (const badge of badges) {
        if (!lifetimes.has(badge._id)) continue;
        const expiresAt = lifetimes.get(badge._id);
        const title = `${badge.title || badge.short || `徽章 ${badge._id}`}`;
        badgeCards.push({
            id: badge._id,
            title,
            short: `${badge.short || title}`,
            acImage: getBadgeAcDisplayUrl(currentDomain._id, badge, 768),
            backgroundColor: badgeColor(badge.backgroundColor, 'eff6ff'),
            fontColor: badgeColor(badge.fontColor, '2563eb'),
            getAt: ownedDates.get(badge._id) || null,
            expiresAt: expiresAt?.toISOString() || null,
            expiryLabel: expiresAt ? moment(expiresAt).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm') : '永久',
            isCurrent: badge._id === selectedId,
            detailUrl: `/d/${encodeURIComponent(currentDomain._id)}/badge/${badge._id}`,
        });
    }
    badgeCards.sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent)
        || (right.getAt?.getTime() || 0) - (left.getAt?.getTime() || 0) || right.id - left.id);
    const permanent = badgeCards.filter((card) => card.expiresAt === null).length;
    return {
        badgeCards,
        badgeCollection: {
            total: badgeCards.length,
            permanent,
            temporary: badgeCards.length - permanent,
            currentName: badgeCards.find((card) => card.isCurrent)?.title || '',
        },
    };
}

/** Batch the same valid ownership used by the gallery, without loading images or account settings. */
export async function getUserBadgeCounts(
    ctx: Context,
    currentDomain: Pick<DomainDoc, '_id' | 'workspaceId'>,
    uids: number[],
    now = new Date(),
): Promise<Map<number, number>> {
    const ids = [...new Set(uids.filter(validBadgeId))];
    if (!ids.length) return new Map();
    const legacy = workspace.resolveDomainWorkspaceId(currentDomain) === workspace.LEGACY_WORKSPACE_ID;
    const scope = legacy ? { domainId: { $exists: false } } : { domainId: currentDomain._id };
    const db = ctx.db as any;
    // Visible user profiles are available for existing accounts, including users without
    // a domain membership. Use that same boundary, and never expose stale deleted accounts.
    const accounts: any[] = await db.collection('user').find({ _id: { $in: ids } }).project({ _id: 1 }).toArray();
    const counts = new Map<number, number>(accounts.map((account) => [account._id, 0]));
    if (!counts.size) return counts;
    const owned: any[] = await db.collection('userBadge').find({ owner: { $in: [...counts.keys()] }, ...scope })
        .project({ owner: 1, badgeId: 1 }).toArray();
    const ownedByUser = new Map<number, Set<number>>();
    const badgeIds = new Set<number>();
    for (const row of owned) {
        if (!validBadgeId(row.badgeId)) continue;
        if (!ownedByUser.has(row.owner)) ownedByUser.set(row.owner, new Set());
        ownedByUser.get(row.owner)!.add(row.badgeId);
        badgeIds.add(row.badgeId);
    }
    if (!badgeIds.size) return counts;
    const [badges, grants] = await Promise.all([
        db.collection('badge').find({ _id: { $in: [...badgeIds] }, ...scope }).project({ _id: 1, users: 1 }).toArray(),
        db.collection('lottery.badgeGrant').find({ uid: { $in: [...ownedByUser.keys()] }, ...scope }).project({
            _id: 1, uid: 1, badgeId: 1, sourceBadgeId: 1, repeatEffect: 1, grantedAt: 1,
            expiresAt: 1, expiredAt: 1, revokedAt: 1, supersededAt: 1,
            lotteryBadgeIds: 1, awardedBadgeIds: 1, stateHistory: 1,
        }).toArray(),
    ]);
    const badgeById = new Map<number, any>(badges.map((badge: any) => [badge._id, badge]));
    const grantsByUser = new Map<number, any[]>();
    for (const grant of grants) {
        if (!grantsByUser.has(grant.uid)) grantsByUser.set(grant.uid, []);
        grantsByUser.get(grant.uid)!.push(grant);
    }
    for (const [uid, ownedIds] of ownedByUser) {
        const userBadges = [...ownedIds].map((id) => badgeById.get(id)).filter(Boolean);
        counts.set(uid, resolveBadgeLifetimes(uid, userBadges, grantsByUser.get(uid) || [], now).size);
    }
    return counts;
}
