import type { Context } from '../context';
import type { DomainDoc } from '../interface';
import { PRIV } from '../model/builtin';
import workspace from '../model/workspace';
import avatar from './avatar';
import { getBadgeAcDisplayUrl } from './badge_image';

export interface HonorWallStudent {
    uid: number;
    displayName: string;
    avatar: string;
    href: string;
}

export interface HonorWallBadge {
    id: number;
    name: string;
    acImage: string;
    badgeHref: string;
    backgroundColor: string;
    fontColor: string;
    students: HonorWallStudent[];
}

function color(value: unknown, fallback: string) {
    const text = `${value || ''}`;
    return /^#?(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(text)
        ? `#${text.replace(/^#/, '')}` : `#${fallback}`;
}

function specialBadgePriority(badge: any) {
    const names = [badge.title, badge.short].map((name) => `${name || ''}`
        .replace(/^[\s\p{S}\p{P}\uFE0F]+/u, '').trim());
    if (names.includes('最强王者')) return 0;
    if (names.includes('暗影骑士')) return 1;
    return 2;
}

export function compareHonorWallBadges(left: any, right: any) {
    const priority = specialBadgePriority(left) - specialBadgePriority(right);
    if (priority) return priority;
    const createdAt = (badge: any) => new Date(badge.createAt || 0).getTime() || 0;
    return createdAt(right) - createdAt(left) || right._id - left._id;
}

function grantIsActive(grant: any, now: Date) {
    return !Object.hasOwn(grant, 'expiredAt')
        && (!Object.hasOwn(grant, 'expiresAt')
            || new Date(grant.expiresAt).getTime() > now.getTime());
}

/**
 * userBadge is the ownership list, not the user's one selected badge. Reads
 * must also ignore expired rows awaiting the periodic cleanup job. Historical
 * upgrade states identify stale lottery rows, but never grant ownership.
 */
export function getEffectiveHonorWallOwners(userBadges: any[], badges: any[], grants: any[], now: Date) {
    const key = (uid: number, badgeId: number) => `${uid}:${badgeId}`;
    const badgeMap = new Map(badges.map((badge) => [badge._id, badge]));
    const lotteryReferences = new Set<string>();
    const activeEntitlements = new Set<string>();
    const latestUpgrade = new Map<string, any>();
    for (const grant of grants) {
        const previousIds = [grant.badgeId, grant.sourceBadgeId,
            ...(Array.isArray(grant.lotteryBadgeIds) ? grant.lotteryBadgeIds : []),
            ...(Array.isArray(grant.awardedBadgeIds) ? grant.awardedBadgeIds : []),
            ...(Array.isArray(grant.stateHistory) ? grant.stateHistory.map((state: any) => state?.badgeId) : []),
        ];
        for (const badgeId of previousIds) {
            if (Number.isSafeInteger(badgeId)) lotteryReferences.add(key(grant.uid, badgeId));
        }
        if (!grantIsActive(grant, now)) continue;
        if (grant.repeatEffect !== 'upgrade') {
            activeEntitlements.add(key(grant.uid, grant.badgeId));
            continue;
        }
        const chainKey = key(grant.uid, grant.sourceBadgeId || grant.badgeId);
        const previous = latestUpgrade.get(chainKey);
        const order = (item: any) => new Date(item.grantedAt || 0).getTime() || 0;
        if (!previous || order(grant) > order(previous)
            || (order(grant) === order(previous) && `${grant._id}` > `${previous._id}`)) {
            latestUpgrade.set(chainKey, grant);
        }
    }
    for (const grant of latestUpgrade.values()) activeEntitlements.add(key(grant.uid, grant.badgeId));
    const owners = new Map<number, Set<number>>();
    for (const owned of userBadges) {
        const badge = badgeMap.get(owned.badgeId);
        if (!badge) continue;
        const ownershipKey = key(owned.owner, owned.badgeId);
        const permanent = Array.isArray(badge.users) && badge.users.includes(owned.owner);
        if (!permanent && !activeEntitlements.has(ownershipKey) && lotteryReferences.has(ownershipKey)) continue;
        if (!owners.has(owned.badgeId)) owners.set(owned.badgeId, new Set());
        owners.get(owned.badgeId)!.add(owned.owner);
    }
    return owners;
}

/** Public, read-only data for the current domain's lazily loaded footer. */
export async function getBadgeHonorWall(
    ctx: Context,
    currentDomain: Pick<DomainDoc, '_id' | 'workspaceId'>,
    now = new Date(),
): Promise<{ badges: HonorWallBadge[] }> {
    const workspaceId = workspace.resolveDomainWorkspaceId(currentDomain);
    const legacy = workspaceId === workspace.LEGACY_WORKSPACE_ID;
    const scope = legacy ? { domainId: { $exists: false } } : { domainId: currentDomain._id };
    const db = ctx.db as any;
    const badges: any[] = await db.collection('badge').find(scope).project({
        _id: 1, short: 1, title: 1, users: 1, createAt: 1,
        acImagePath: 1, acImageUpdatedAt: 1, backgroundColor: 1, fontColor: 1,
    }).toArray();
    if (!badges.length) return { badges: [] };
    const userBadges: any[] = await db.collection('userBadge').find({
        ...scope, badgeId: { $in: badges.map((badge) => badge._id) }, owner: { $gt: 1 },
    }).project({ owner: 1, badgeId: 1 }).toArray();
    const candidateUids = Array.from(new Set(userBadges.map((owned) => owned.owner)));
    if (!candidateUids.length) return { badges: [] };
    const [members, excluded, joined] = await Promise.all([
        workspace.getMembers(workspaceId),
        legacy ? workspace.getExcludedLegacyUids() : Promise.resolve(new Set<number>()),
        legacy ? Promise.resolve(candidateUids) : db.collection('domain.user').distinct('uid', {
            domainId: currentDomain._id, uid: { $in: candidateUids }, join: true, role: { $ne: 'root' },
        }),
    ]);
    const memberUids = new Set(members.map((member) => member.uid));
    const eligibleUids = joined.filter((uid: number) => !memberUids.has(uid) && !excluded.has(uid));
    if (!eligibleUids.length) return { badges: [] };
    const accounts: any[] = await db.collection('user').find({ _id: { $in: eligibleUids } })
        .project({ _id: 1, uname: 1, avatar: 1, priv: 1 }).toArray();
    const students = accounts.filter((account) => (
        (account.priv & PRIV.PRIV_USER_PROFILE)
        && !(account.priv & (PRIV.PRIV_EDIT_SYSTEM | PRIV.PRIV_JUDGE | PRIV.PRIV_MANAGE_ALL_DOMAIN))
    ));
    if (!students.length) return { badges: [] };
    // Inspect only grants for candidate students in this exact badge scope.
    // No expiry/repair writes are triggered by viewing the honor wall.
    const grants: any[] = await db.collection('lottery.badgeGrant').find({
        ...scope, uid: { $in: students.map((student) => student._id) },
    }).project({
        _id: 1, uid: 1, badgeId: 1, sourceBadgeId: 1, repeatEffect: 1,
        expiresAt: 1, expiredAt: 1, grantedAt: 1, lotteryBadgeIds: 1, awardedBadgeIds: 1, stateHistory: 1,
    }).toArray();
    const owners = getEffectiveHonorWallOwners(userBadges, badges, grants, now);
    const domainPrefix = `/d/${encodeURIComponent(currentDomain._id)}`;
    const studentMap = new Map<number, HonorWallStudent>(students.map((student) => [student._id, {
        uid: student._id,
        // Match the public ranking. Private displayName, mail, and real names
        // are intentionally neither queried nor sent to this public endpoint.
        displayName: `${student.uname || student._id}`,
        avatar: avatar(student.avatar || '', 64),
        href: `${domainPrefix}/user/${student._id}`,
    }]));
    const result: HonorWallBadge[] = [];
    for (const badge of badges.sort(compareHonorWallBadges)) {
        const holders = Array.from(owners.get(badge._id) || [])
            .map((uid) => studentMap.get(uid)).filter((student): student is HonorWallStudent => !!student)
            .sort((left, right) => left.uid - right.uid);
        if (!holders.length) continue;
        result.push({
            id: badge._id,
            name: `${badge.short || badge.title || badge._id}`,
            acImage: getBadgeAcDisplayUrl(currentDomain._id, badge),
            badgeHref: `${domainPrefix}/badge/${badge._id}`,
            backgroundColor: color(badge.backgroundColor, 'e5edf5'),
            fontColor: color(badge.fontColor, '1f2937'),
            students: holders,
        });
    }
    return { badges: result };
}
