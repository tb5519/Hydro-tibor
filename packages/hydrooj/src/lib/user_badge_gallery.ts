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
    const selectedId = (legacy ? !account?.badgeDomainId : account?.badgeDomainId === currentDomain._id)
        ? account?.badgeId : undefined;
    const badgeCards: UserBadgeCard[] = [];
    for (const badge of badges) {
        const active = activeByBadge.get(badge._id) || [];
        const manual = Array.isArray(badge.users) && badge.users.includes(uid);
        const permanent = manual || active.some((grant) => !Object.hasOwn(grant, 'expiresAt')) || !referenced.has(badge._id);
        if (!permanent && !active.length) continue;
        const expiresAt = permanent ? null : new Date(Math.max(...active.map((grant) => grant.expiresAt.getTime())));
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
