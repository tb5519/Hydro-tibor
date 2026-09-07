import { ObjectId } from 'mongodb';
import { sleep } from '@hydrooj/utils';
import type { Context } from '../context';
import type { DomainDoc } from '../interface';
import { PRIV } from '../model/builtin';
import ScheduleModel from '../model/schedule';
import system from '../model/system';
import { deleteUserCache } from '../model/user';
import workspace from '../model/workspace';
import db from '../service/db';

export const POINT_LOTTERY_CONFIG_KEY = 'pointLottery.config';
export const POINT_LOTTERY_POINTS_FIELD = 'lotteryPoints';
export const POINT_LOTTERY_TOTAL_POINTS_FIELD = 'lotteryTotalPoints';
export const POINT_LOTTERY_BADGE_EXPIRY_TASK = 'pointLottery.badgeExpiry';
export const POINT_LOTTERY_BADGE_EXPIRY_SWEEP_TASK = 'pointLottery.badgeExpirySweep';

const POINT_LOTTERY_BADGE_MAX_DURATION_HOURS = 24 * 365 * 100;
const POINT_LOTTERY_BADGE_REPLACEMENT_VERSION = 1;
const POINT_LOTTERY_BADGE_LOCK_LEASE_MS = 30 * 1000;
const POINT_LOTTERY_BADGE_LOCK_WAIT_MS = 15 * 1000;

export const pointLotteryUserColl = db.collection('user');

function normalizePoints(value: any) {
    const points = Math.floor(+value || 0);
    return Math.max(0, Number.isFinite(points) ? points : 0);
}

/**
 * Lottery points are account-wide. Older installations stored them in each
 * domain membership; migrate those legacy balances once, on first access.
 */
export async function ensureGlobalPointLotteryState(uid: number) {
    const projection = {
        [POINT_LOTTERY_POINTS_FIELD]: 1,
        [POINT_LOTTERY_TOTAL_POINTS_FIELD]: 1,
        contestScorePointAwards: 1,
    };
    const current = await pointLotteryUserColl.findOne({ _id: uid }, { projection });
    if (current && (
        current[POINT_LOTTERY_POINTS_FIELD] !== undefined
        || current[POINT_LOTTERY_TOTAL_POINTS_FIELD] !== undefined
        || current.contestScorePointAwards !== undefined
    )) return current;

    const legacy = await db.collection('domain.user').find(
        { uid, join: true },
        { projection },
    ).toArray();
    let points = 0;
    let totalPoints = 0;
    const contestScorePointAwards: Record<string, number> = {};
    for (const dudoc of legacy) {
        const currentPoints = normalizePoints(dudoc[POINT_LOTTERY_POINTS_FIELD]);
        points += currentPoints;
        totalPoints += normalizePoints(dudoc[POINT_LOTTERY_TOTAL_POINTS_FIELD] ?? currentPoints);
        for (const [tid, score] of Object.entries(dudoc.contestScorePointAwards || {})) {
            contestScorePointAwards[tid] = Math.max(contestScorePointAwards[tid] || 0, normalizePoints(score));
        }
    }
    await pointLotteryUserColl.updateOne({
        _id: uid,
        [POINT_LOTTERY_POINTS_FIELD]: { $exists: false },
        [POINT_LOTTERY_TOTAL_POINTS_FIELD]: { $exists: false },
    }, {
        $set: {
            [POINT_LOTTERY_POINTS_FIELD]: points,
            [POINT_LOTTERY_TOTAL_POINTS_FIELD]: totalPoints,
            contestScorePointAwards,
        },
    });
    return await pointLotteryUserColl.findOne({ _id: uid }, { projection });
}

export async function migrateGlobalPointLotteryStates() {
    const uids = await db.collection('domain.user').distinct('uid', {
        uid: { $gt: 1 },
        $or: [
            { [POINT_LOTTERY_POINTS_FIELD]: { $exists: true } },
            { [POINT_LOTTERY_TOTAL_POINTS_FIELD]: { $exists: true } },
            { contestScorePointAwards: { $exists: true } },
        ],
    });
    for (const uid of uids) await ensureGlobalPointLotteryState(uid); // eslint-disable-line no-await-in-loop
    return uids.length;
}

export interface PointLotteryPrize {
    name: string;
    image: string;
    probability: number;
    pointDelta: number;
    repeatable: boolean;
    broadcast: boolean;
    /** A regular prize, or a badge that has already been created in this scope. */
    kind: 'normal' | 'badge';
    /** Present only for badge prizes. */
    badgeId?: number;
    /** Optional validity period for a badge prize. 0 means permanent. */
    badgeDurationHours?: number;
    /** How a repeat win changes a badge prize. */
    badgeRepeatEffect?: 'duration' | 'upgrade';
    /** State-2 onward badge ids when badgeRepeatEffect is upgrade. */
    badgeUpgradeBadgeIds?: number[];
}

export interface PointLotteryConfig {
    enabled: boolean;
    cost: number;
    prizes: PointLotteryPrize[];
}

export const DEFAULT_POINT_LOTTERY_CONFIG: PointLotteryConfig = {
    enabled: false,
    cost: 10,
    prizes: [],
};

function toNumber(value: any, fallback = 0) {
    const number = +value;
    return Number.isFinite(number) ? number : fallback;
}

function normalizeBadgeId(value: any) {
    const badgeId = Math.floor(toNumber(value, 0));
    return Number.isSafeInteger(badgeId) && badgeId > 0 ? badgeId : undefined;
}

function normalizeBadgeDurationHours(value: any) {
    return Math.min(
        POINT_LOTTERY_BADGE_MAX_DURATION_HOURS,
        Math.max(0, Math.floor(toNumber(value, 0))),
    );
}

function normalizeBadgeUpgradeBadgeIds(value: any) {
    const items = Array.isArray(value) ? value : [];
    // Preserve submitted order here so validation can reject a duplicate
    // state explicitly instead of silently changing the teacher's chain.
    return items.map(normalizeBadgeId).filter(Boolean) as number[];
}

function isBadgePrize(prize: Pick<PointLotteryPrize, 'kind'> | any) {
    return prize?.kind === 'badge';
}

export function normalizePointLotteryConfig(raw: any): PointLotteryConfig {
    const source = raw && typeof raw === 'object' ? raw : {};
    const prizes = Array.isArray(source.prizes) ? source.prizes : [];
    return {
        enabled: source.enabled === true || source.enabled === 'on' || source.enabled === 'true',
        cost: Math.max(0, Math.floor(toNumber(source.cost, DEFAULT_POINT_LOTTERY_CONFIG.cost))),
        prizes: prizes.map((prize) => {
            const kind = prize?.kind === 'badge' ? 'badge' : 'normal';
            return {
                name: `${prize?.name || ''}`.trim(),
                image: `${prize?.image || ''}`.trim(),
                probability: Math.max(0, toNumber(prize?.probability, 0)),
                pointDelta: Math.max(0, Math.floor(toNumber(prize?.pointDelta, 0))),
                repeatable: prize?.repeatable !== false && prize?.repeatable !== 'false' && prize?.repeatable !== '0',
                // Older configurations predate this option and should keep broadcasting by default.
                broadcast: prize?.broadcast !== false && prize?.broadcast !== 'false' && prize?.broadcast !== '0',
                kind,
                ...(kind === 'badge' ? {
                    badgeId: normalizeBadgeId(prize?.badgeId),
                    badgeDurationHours: normalizeBadgeDurationHours(prize?.badgeDurationHours),
                    badgeRepeatEffect: prize?.badgeRepeatEffect === 'upgrade' ? 'upgrade' : 'duration',
                    badgeUpgradeBadgeIds: normalizeBadgeUpgradeBadgeIds(prize?.badgeUpgradeBadgeIds),
                } : {}),
            };
        }).filter((prize) => prize.probability > 0
            && (isBadgePrize(prize) ? !!prize.badgeId : !!prize.name)),
    };
}

export function isDomainPointLottery(domain?: Pick<DomainDoc, 'workspaceId'> | null) {
    return !!domain?.workspaceId && workspace.resolveDomainWorkspaceId(domain) !== workspace.LEGACY_WORKSPACE_ID;
}

export function getPointLotteryConfig(domain?: Pick<DomainDoc, 'workspaceId' | 'pointLottery'> | null) {
    if (isDomainPointLottery(domain)) return normalizePointLotteryConfig(domain?.pointLottery);
    return normalizePointLotteryConfig(system.get(POINT_LOTTERY_CONFIG_KEY));
}

export function getPointLotteryStoragePrefix(domain?: Pick<DomainDoc, '_id' | 'workspaceId'> | null) {
    return isDomainPointLottery(domain) ? `domain/${domain._id}/point-lottery` : 'system/point-lottery';
}

/** The badge scope always follows the lottery scope. */
export function getPointLotteryBadgeDomainId(domain?: Pick<DomainDoc, '_id' | 'workspaceId'> | null) {
    return isDomainPointLottery(domain) ? domain?._id : undefined;
}

export function getPointLotteryBadgeScopeQuery(domain?: Pick<DomainDoc, '_id' | 'workspaceId'> | null) {
    const domainId = getPointLotteryBadgeDomainId(domain);
    return domainId ? { domainId } : { domainId: { $exists: false } };
}

export async function getPointLotteryBadges(ctx: Context, domain?: Pick<DomainDoc, '_id' | 'workspaceId'> | null) {
    return ctx.db.collection('badge').find(getPointLotteryBadgeScopeQuery(domain))
        .project({ _id: 1, short: 1, title: 1, backgroundColor: 1, fontColor: 1 })
        .sort({ _id: 1 })
        .toArray();
}

export interface PointLotteryBadgeStyle {
    id: number;
    displayName: string;
    backgroundColor: string;
    fontColor: string;
    tooltip: string;
}

/** Match ranking badge colors without allowing arbitrary inline CSS. */
function normalizePointLotteryBadgeColor(color: unknown, fallback: string) {
    const value = `${color || fallback}`;
    if (!/^#?(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return `#${fallback}`;
    return value.startsWith('#') ? value : `#${value}`;
}

/**
 * The prize title and its uploaded artwork are independent of the actual
 * badge pill. Read only configured badges in the lottery's existing scope;
 * names, colors and tooltip fallbacks match ranking's owned-badge rendering.
 */
export async function getPointLotteryBadgeStyles(
    ctx: Context,
    prizes: PointLotteryPrize[],
    domain?: Pick<DomainDoc, '_id' | 'workspaceId'> | null,
): Promise<Record<number, PointLotteryBadgeStyle>> {
    const badgeIds = Array.from(new Set(prizes
        .filter((prize) => isBadgePrize(prize))
        .map((prize) => normalizeBadgeId(prize.badgeId))
        .filter((id): id is number => !!id)));
    if (!badgeIds.length) return {};
    const badges = await ctx.db.collection('badge').find({
        _id: { $in: badgeIds },
        ...getPointLotteryBadgeScopeQuery(domain),
    }).project({ _id: 1, short: 1, title: 1, backgroundColor: 1, fontColor: 1 }).toArray();
    return Object.fromEntries(badges.map((badge: any) => [badge._id, {
        id: badge._id,
        displayName: `${badge.short || badge._id}`,
        backgroundColor: normalizePointLotteryBadgeColor(badge.backgroundColor, 'e5edf5'),
        fontColor: normalizePointLotteryBadgeColor(badge.fontColor, '1f2937'),
        tooltip: `${badge.title || badge.short || badge._id}`,
    }]));
}

/** Match the badge module's student-only rules before a special prize is drawn. */
export async function canReceivePointLotteryBadge(
    ctx: Context,
    uid: number,
    domain?: Pick<DomainDoc, '_id' | 'workspaceId'> | null,
) {
    const account = await ctx.db.collection('user').findOne({ _id: uid }, { projection: { priv: 1 } });
    if (!account || !(account.priv & PRIV.PRIV_USER_PROFILE) || (account.priv & PRIV.PRIV_EDIT_SYSTEM)) return false;

    const domainId = getPointLotteryBadgeDomainId(domain);
    if (!domainId) return !(await workspace.getExcludedLegacyUids()).has(uid);

    const joined = await ctx.db.collection('domain.user').countDocuments({ domainId, uid, join: true });
    if (!joined) return false;
    const workspaceId = domain?.workspaceId;
    if (!workspaceId) return false;
    return !(await workspace.getMembers(workspaceId)).some((member) => member.uid === uid);
}

/**
 * A badge prize is stored by id, but its display title is snapshotted into the
 * lottery configuration and draw record. This keeps historical draw records
 * readable if a teacher later edits the badge title.
 */
export function bindPointLotteryBadgePrizes(config: PointLotteryConfig, badges: any[]) {
    const badgeById = new Map(badges.map((badge) => [badge._id, badge]));
    const upgradeChainBadgeIds = new Set<number>();
    const durationBadgeIds = new Set(config.prizes
        .filter((prize) => isBadgePrize(prize) && prize.badgeRepeatEffect !== 'upgrade')
        .map((prize) => prize.badgeId!));
    for (const prize of config.prizes) {
        if (!isBadgePrize(prize)) continue;
        const badge = badgeById.get(prize.badgeId);
        if (!badge) return false;
        if (prize.badgeRepeatEffect === 'upgrade') {
            if (!prize.badgeUpgradeBadgeIds?.length) return false;
            const chainBadgeIds = [prize.badgeId!, ...prize.badgeUpgradeBadgeIds];
            if (new Set(chainBadgeIds).size !== chainBadgeIds.length
                || prize.badgeUpgradeBadgeIds.some((badgeId) => !badgeById.has(badgeId))
                || chainBadgeIds.some((badgeId) => durationBadgeIds.has(badgeId))
                || chainBadgeIds.some((badgeId) => upgradeChainBadgeIds.has(badgeId))) {
                return false;
            }
            for (const badgeId of chainBadgeIds) upgradeChainBadgeIds.add(badgeId);
        }
        prize.name = `${badge.title || badge.short || badge._id}`.trim();
        // A lottery thumbnail is independent from the badge itself. It is
        // only used by the draw UI and never changes the saved badge asset.
    }
    return true;
}

/**
 * Modern teacher lotteries are isolated to the current domain. Tang's legacy
 * lottery is one shared pool, so every legacy domain reads the same draw log.
 */
export async function getPointLotteryScopeDomainIds(
    domain?: Pick<DomainDoc, '_id' | 'workspaceId'> | null,
) {
    if (isDomainPointLottery(domain)) return [domain._id];
    return (await workspace.getDomains(workspace.LEGACY_WORKSPACE_ID)).map((item) => item._id);
}

export function buildPointLotteryConfigFromForm(args: any): PointLotteryConfig {
    const prizes: PointLotteryPrize[] = [];
    const indexedKeys = Object.keys(args)
        .map((key) => /^prize(\d+)Name$/.exec(key)?.[1])
        .filter((index): index is string => index !== undefined)
        .map((index) => +index);
    const count = Math.max(
        Math.floor(toNumber(args.prizeCount, 0)),
        indexedKeys.length ? Math.max(...indexedKeys) + 1 : 0,
        10,
    );
    for (let i = 0; i < count; i++) {
        const upgradeBadgeIds = getPointLotteryBadgeUpgradeBadgeIdsFromForm(args, i);
        const noBroadcast = args[`prize${i}NoBroadcast`];
        prizes.push({
            name: args[`prize${i}Name`],
            image: args[`prize${i}Image`],
            probability: toNumber(args[`prize${i}Probability`], 0),
            pointDelta: toNumber(args[`prize${i}PointDelta`], 0),
            repeatable: args[`prize${i}Repeatable`] === 'on'
                || args[`prize${i}Repeatable`] === 'true'
                || args[`prize${i}Repeatable`] === '1',
            broadcast: noBroadcast !== 'on' && noBroadcast !== 'true' && noBroadcast !== '1',
            kind: args[`prize${i}Kind`] === 'badge' ? 'badge' : 'normal',
            badgeId: args[`prize${i}BadgeId`],
            badgeDurationHours: args[`prize${i}BadgeDurationHours`],
            badgeRepeatEffect: args[`prize${i}BadgeRepeatEffect`],
            badgeUpgradeBadgeIds: upgradeBadgeIds,
        });
    }
    return normalizePointLotteryConfig({
        enabled: args.enabled,
        cost: args.cost,
        prizes,
    });
}

/**
 * Upgrade-state selects are added dynamically in the lottery editor.  Keep a
 * compact JSON value as the authoritative submission format, while accepting
 * the numbered fields from configurations saved by older editor versions.
 */
export function getPointLotteryBadgeUpgradeBadgeIdsFromForm(args: any, prizeIndex: number) {
    const serialized = args[`prize${prizeIndex}BadgeUpgradeBadgeIds`];
    if (typeof serialized === 'string' && serialized) {
        try {
            const values = JSON.parse(serialized);
            if (Array.isArray(values)) return values;
        } catch {
            // Fall through to the legacy numbered fields below.
        }
    }
    return Object.keys(args)
        .map((key) => ({ key, level: new RegExp(`^prize${prizeIndex}BadgeUpgradeBadgeId(\\d+)$`).exec(key)?.[1] }))
        .filter((item): item is { key: string, level: string } => item.level !== undefined)
        .sort((a, b) => +a.level - +b.level)
        .map((item) => args[item.key]);
}

export function pickPointLotteryPrize(config: PointLotteryConfig) {
    const total = config.prizes.reduce((sum, prize) => sum + prize.probability, 0);
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (const prize of config.prizes) {
        roll -= prize.probability;
        if (roll <= 0) return prize;
    }
    return config.prizes[config.prizes.length - 1];
}

export function publicPointLotteryPrize(prize: PointLotteryPrize) {
    return {
        name: prize.name,
        image: prize.image,
        probability: prize.probability,
        pointDelta: prize.pointDelta,
        broadcast: prize.broadcast,
        kind: prize.kind,
        ...(isBadgePrize(prize) ? {
            badgeId: prize.badgeId,
            badgeDurationHours: prize.badgeDurationHours || 0,
            badgeRepeatEffect: prize.badgeRepeatEffect || 'duration',
            badgeUpgradeBadgeIds: prize.badgeUpgradeBadgeIds || [],
        } : {}),
    };
}

export function pointLotteryPrizeKey(prize: Pick<PointLotteryPrize, 'name' | 'image'> & Partial<PointLotteryPrize>) {
    if (isBadgePrize(prize) && prize.badgeId) return `badge:${prize.badgeId}`;
    return `${prize.name}\n${prize.image || ''}`;
}

/** Use the same eligible pool for the draw and the probabilities displayed to its participant. */
export async function getAvailablePointLotteryPrizes(
    ctx: Context,
    uid: number,
    config: PointLotteryConfig,
    domain?: Pick<DomainDoc, '_id' | 'workspaceId'> | null,
) {
    const nonRepeatablePrizes = config.prizes.filter((prize) => !prize.repeatable);
    if (!nonRepeatablePrizes.length) return config.prizes;
    const pointLotteryScopeDomainIds = await getPointLotteryScopeDomainIds(domain);
    const nonRepeatableKeys = new Set(nonRepeatablePrizes.map(pointLotteryPrizeKey));
    const badgeIds = nonRepeatablePrizes
        .filter((item) => item.kind === 'badge')
        .map((item) => item.badgeId);
    const normalNames = nonRepeatablePrizes
        .filter((item) => item.kind !== 'badge')
        .map((item) => item.name);
    const prizeQueries: any[] = [];
    if (badgeIds.length) prizeQueries.push({ 'prize.kind': 'badge', 'prize.badgeId': { $in: badgeIds } });
    if (normalNames.length) prizeQueries.push({ 'prize.name': { $in: normalNames } });
    const wonLogs = await ctx.db.collection('lottery.draw').find({
        domainId: { $in: pointLotteryScopeDomainIds },
        uid,
        deleted: { $ne: true },
        $or: prizeQueries,
    }).project({ prize: 1 }).toArray();
    const wonKeys = new Set(wonLogs
        .map((log: any) => log.prize && pointLotteryPrizeKey(log.prize))
        .filter((key) => key && nonRepeatableKeys.has(key)));
    return config.prizes.filter((prize) => prize.repeatable || !wonKeys.has(pointLotteryPrizeKey(prize)));
}

/** Keep every configured entry in order, including different durations of the same badge. */
export function publicPointLotteryPrizes(prizes: PointLotteryPrize[], availablePrizes: PointLotteryPrize[]) {
    const available = new Set(availablePrizes);
    return prizes.map((prize) => ({ ...publicPointLotteryPrize(prize), available: available.has(prize) }));
}

/** Calculate the next pool without a fallible database read after an award has succeeded. */
export function getPointLotteryPrizesAfterWin(availablePrizes: PointLotteryPrize[], awardedPrize: PointLotteryPrize) {
    const awardedKey = pointLotteryPrizeKey(awardedPrize);
    return availablePrizes.filter((prize) => prize.repeatable || pointLotteryPrizeKey(prize) !== awardedKey);
}

async function getPointLotteryBadge(
    ctx: Context,
    prize: PointLotteryPrize,
    domain?: Pick<DomainDoc, '_id' | 'workspaceId'> | null,
) {
    if (!isBadgePrize(prize) || !prize.badgeId) return null;
    return ctx.db.collection('badge').findOne({
        _id: prize.badgeId,
        ...getPointLotteryBadgeScopeQuery(domain),
    });
}

function userBadgeScopeQuery(domainId?: string) {
    return domainId ? { domainId } : { domainId: { $exists: false } };
}

function selectedBadgeScopeQuery(domainId?: string) {
    return domainId
        ? { badgeDomainId: domainId }
        : { $or: [{ badgeDomainId: null }, { badgeDomainId: { $exists: false } }] };
}

function getBadgePayload(badge: any) {
    return `${badge._id}#${badge.short}#${badge.backgroundColor}#${badge.fontColor}#${badge.title}`;
}

export interface PointLotteryBadgeAward {
    expiresAt?: Date;
}

function activeLotteryBadgeGrantQuery(now: Date) {
    return {
        expiredAt: { $exists: false },
        $or: [
            { expiresAt: { $gt: now } },
            { expiresAt: { $exists: false } },
        ],
    };
}

async function addLotteryBadgeToUser(ctx: Context, uid: number, badgeId: number, domainId?: string) {
    await ctx.db.collection('userBadge').updateOne({
        owner: uid,
        badgeId,
        ...userBadgeScopeQuery(domainId),
    }, {
        $setOnInsert: {
            _id: new ObjectId(),
            owner: uid,
            badgeId,
            ...(domainId ? { domainId } : {}),
            getAt: new Date(),
        },
    }, { upsert: true });
}

async function selectLotteryBadgeForUser(ctx: Context, uid: number, badge: any, domainId?: string) {
    await ctx.db.collection('user').updateOne({ _id: uid }, {
        $set: {
            badgeId: badge._id,
            badge: getBadgePayload(badge),
            ...(domainId ? { badgeDomainId: domainId } : { badgeDomainId: null }),
        },
    });
    deleteUserCache(true);
}

async function schedulePointLotteryBadgeExpiry(ctx: Context, expiresAt: Date, grantId: ObjectId) {
    try {
        await ScheduleModel.add({
            type: 'schedule',
            subType: POINT_LOTTERY_BADGE_EXPIRY_TASK,
            executeAfter: expiresAt,
            grantId,
        });
    } catch (error) {
        // The recurring expiry sweep still guarantees eventual removal, and a
        // transient schedule write must not turn a successful paid draw into
        // an HTTP failure.
        ctx.logger.warn('Unable to schedule point lottery badge expiry: %o', error);
    }
}

async function removeLotteryBadgeIfUnreferenced(
    ctx: Context,
    uid: number,
    badgeId: number,
    domainId: string | undefined,
    now: Date,
    replaceChainState = false,
) {
    const scope = userBadgeScopeQuery(domainId);
    const badgeScope = domainId ? { domainId } : { domainId: { $exists: false } };

    // Replacing an upgrade state revokes its permanent/manual marker first.
    // A separate active lottery entitlement may still keep the visible
    // userBadge until that entitlement expires, but it must not make the old
    // state permanent forever.
    let removedPermanentAssignment = false;
    if (replaceChainState) {
        const result = await ctx.db.collection('badge').updateOne({
            _id: badgeId,
            ...badgeScope,
            users: uid,
        }, { $pull: { users: uid } } as any);
        removedPermanentAssignment = !!result.modifiedCount;
    } else {
        const badge = await ctx.db.collection('badge').findOne({
            _id: badgeId,
            ...badgeScope,
            users: uid,
        }, { projection: { _id: 1 } });
        // An ordinary expiry must never revoke a permanent assignment.
        if (badge) return;
    }

    const activeGrantCount = await ctx.db.collection('lottery.badgeGrant').countDocuments({
        uid,
        ...scope,
        $and: [
            activeLotteryBadgeGrantQuery(now),
            {
                // An upgrade chain owns only its current state. Historical
                // states live in stateHistory and must not keep old badges
                // visible after an upgrade.
                $or: [
                    { badgeId },
                    { repeatEffect: 'upgrade', lotteryBadgeIds: badgeId },
                ],
            },
        ],
    });
    if (activeGrantCount) {
        if (removedPermanentAssignment) deleteUserCache(true);
        return;
    }

    // Old versions did not enforce uniqueness here. Remove every stale copy so
    // one duplicate row cannot keep a replaced chain state visible.
    await ctx.db.collection('userBadge').deleteMany({ owner: uid, badgeId, ...scope });
    await ctx.db.collection('user').updateOne({
        _id: uid,
        badgeId,
        ...selectedBadgeScopeQuery(domainId),
    }, { $unset: { badgeId: '', badge: '', badgeDomainId: '' } });
    deleteUserCache(true);
}

function getLotteryOwnedUpgradeBadgeIds(grant: any) {
    if (Array.isArray(grant.lotteryBadgeIds)) return grant.lotteryBadgeIds;
    // Upgrade grants created before the replacement-state behaviour recorded
    // every reached state here. Treat them as lottery-owned so the repair can
    // remove their obsolete states exactly once.
    if (Array.isArray(grant.awardedBadgeIds)) return grant.awardedBadgeIds;
    return grant.badgeId ? [grant.badgeId] : [];
}

async function retainCurrentLotteryUpgradeBadge(
    ctx: Context,
    grant: any,
    currentBadgeId: number,
    chainBadgeIds: number[],
    domainId: string | undefined,
    now: Date,
    extraSet: Record<string, any> = {},
    unsetExpiresAt = false,
    replaceManualChainStates = true,
) {
    const previousBadgeIds = [
        ...chainBadgeIds,
        ...getLotteryOwnedUpgradeBadgeIds(grant),
    ];
    const update: any = {
        $set: {
            lotteryBadgeIds: [currentBadgeId],
            // Kept for old readers; stateHistory is the complete history.
            awardedBadgeIds: [currentBadgeId],
            ...extraSet,
        },
        // An already-migrated grant can be upgraded again. Clear its completed
        // marker before cleanup so any partial failure is retried by the sweep.
        $unset: { replacementStateVersion: '' },
    };
    if (unsetExpiresAt) update.$unset.expiresAt = '';
    const result = await ctx.db.collection('lottery.badgeGrant').updateOne({
        _id: grant._id,
        ...activeLotteryBadgeGrantQuery(now),
    }, update);
    if (!result.matchedCount) throw new Error('Point lottery upgrade grant changed while consolidating');
    for (const badgeId of new Set(previousBadgeIds.filter((badgeId) => badgeId && badgeId !== currentBadgeId))) {
        await removeLotteryBadgeIfUnreferenced( // eslint-disable-line no-await-in-loop
            ctx, grant.uid, badgeId, domainId, now, replaceManualChainStates,
        );
    }
    // Mark the repair complete only after every obsolete state is gone. If a
    // cleanup write fails, the unversioned grant is picked up by the next
    // reconciliation sweep and the idempotent cleanup is retried.
    const finalized = await ctx.db.collection('lottery.badgeGrant').updateOne({
        _id: grant._id,
        ...activeLotteryBadgeGrantQuery(now),
    }, { $set: {
        replacementStateVersion: POINT_LOTTERY_BADGE_REPLACEMENT_VERSION,
        replacementStateUpdatedAt: now,
    } });
    if (!finalized.matchedCount) throw new Error('Point lottery upgrade grant changed before finalizing');
}

async function withPointLotteryBadgeLock<T>(
    ctx: Context,
    uid: number,
    sourceBadgeId: number,
    domainId: string | undefined,
    callback: () => Promise<T>,
): Promise<T> {
    const lockId = `${domainId || 'global'}:${uid}:${sourceBadgeId}`;
    const owner = new ObjectId().toHexString();
    const deadline = Date.now() + POINT_LOTTERY_BADGE_LOCK_WAIT_MS;
    const locks = ctx.db.collection('lottery.badgeGrantLock');
    while (true) {
        const now = new Date();
        try {
            const lock = await locks.findOneAndUpdate({
                _id: lockId,
                $or: [
                    { expiresAt: { $lte: now } },
                    { expiresAt: { $exists: false } },
                ],
            }, {
                $set: {
                    owner,
                    expiresAt: new Date(now.getTime() + POINT_LOTTERY_BADGE_LOCK_LEASE_MS),
                },
            }, { upsert: true, returnDocument: 'after' });
            if (lock?.owner === owner) break;
        } catch (error: any) {
            // A duplicate _id means another request owns the lock. Other
            // database failures must still surface to the paid draw request.
            if (error?.code !== 11000) throw error;
        }
        if (Date.now() >= deadline) throw new Error('Point lottery badge upgrade is busy');
        await sleep(25);
    }
    try {
        return await callback();
    } finally {
        try {
            await locks.deleteOne({ _id: lockId, owner });
        } catch (error) {
            // The lease expires by itself. A cleanup failure must not turn a
            // successfully granted prize into an apparent failed/refunded draw.
            ctx.logger.warn('Unable to release point lottery badge lock %s: %o', lockId, error);
        }
    }
}

function resolveSavedUpgradeGrantLevel(grant: any, badgeIds: number[]) {
    const savedLevel = Math.floor(+grant?.level || 0);
    if (savedLevel > 0 && badgeIds[savedLevel - 1] === grant?.badgeId) return savedLevel;
    return badgeIds.lastIndexOf(grant?.badgeId) + 1;
}

async function resolvePointLotteryUpgradeState(
    ctx: Context,
    uid: number,
    badgeIds: number[],
    badges: any[],
    domainId: string | undefined,
    now: Date,
    fallbackGrants: any[] = [],
) {
    const scope = userBadgeScopeQuery(domainId);
    const entitlementGrants = await ctx.db.collection('lottery.badgeGrant').find({
        uid,
        ...scope,
        $and: [
            activeLotteryBadgeGrantQuery(now),
            {
                $or: [
                    { badgeId: { $in: badgeIds } },
                    { repeatEffect: 'upgrade', lotteryBadgeIds: { $in: badgeIds } },
                ],
            },
        ],
    }).project({ badgeId: 1, repeatEffect: 1, lotteryBadgeIds: 1 }).toArray();
    const permanentBadgeIds = new Set<number>();
    const entitledBadgeIds = new Set<number>();
    for (const badge of badges) {
        if (badge.users?.includes(uid)) permanentBadgeIds.add(badge._id);
    }
    for (const grant of entitlementGrants as any[]) {
        if (badgeIds.includes(grant.badgeId)) entitledBadgeIds.add(grant.badgeId);
        if (grant.repeatEffect === 'upgrade' && Array.isArray(grant.lotteryBadgeIds)) {
            for (const badgeId of grant.lotteryBadgeIds) {
                if (badgeIds.includes(badgeId)) entitledBadgeIds.add(badgeId);
            }
        }
    }
    let level = 0;
    for (let index = 0; index < badgeIds.length; index++) {
        if (permanentBadgeIds.has(badgeIds[index]) || entitledBadgeIds.has(badgeIds[index])) level = index + 1;
    }
    for (const grant of fallbackGrants) level = Math.max(level, resolveSavedUpgradeGrantLevel(grant, badgeIds));
    return {
        level,
        badgeId: level ? badgeIds[level - 1] : undefined,
        permanent: permanentBadgeIds.size > 0 || fallbackGrants.some((grant) => !grant.expiresAt),
    };
}

async function grantDurationStackingLotteryBadge(
    ctx: Context,
    uid: number,
    prize: PointLotteryPrize,
    badge: any,
    domainId: string | undefined,
    drawId: ObjectId,
    now: Date,
): Promise<PointLotteryBadgeAward> {
    const scope = userBadgeScopeQuery(domainId);
    await addLotteryBadgeToUser(ctx, uid, badge._id, domainId);
    await selectLotteryBadgeForUser(ctx, uid, badge, domainId);

    // Re-read permanent ownership inside the badge lock. Once this badge has
    // been permanently granted, extra timed wins do not shorten it; infinity
    // stacked with any duration remains infinity.
    const permanentBadge = await ctx.db.collection('badge').findOne({
        _id: badge._id,
        ...(domainId ? { domainId } : { domainId: { $exists: false } }),
        users: uid,
    }, { projection: { _id: 1 } });
    if (permanentBadge) return {};

    const durationHours = normalizeBadgeDurationHours(prize.badgeDurationHours);
    if (!durationHours) {
        await ctx.db.collection('badge').updateOne({
            _id: badge._id,
            ...(domainId ? { domainId } : { domainId: { $exists: false } }),
        }, { $addToSet: { users: uid } });
        return {};
    }

    const activeGrants = await ctx.db.collection('lottery.badgeGrant').find({
        uid,
        badgeId: badge._id,
        ...scope,
        expiresAt: { $gt: now },
        expiredAt: { $exists: false },
    }).project({ expiresAt: 1 }).toArray();
    const latestExpiry = activeGrants.reduce(
        (latest: number, grant: any) => Math.max(latest, grant.expiresAt?.getTime?.() || 0),
        now.getTime(),
    );
    const expiresAt = new Date(latestExpiry + durationHours * 60 * 60 * 1000);
    const grantId = new ObjectId();
    await ctx.db.collection('lottery.badgeGrant').insertOne({
        _id: grantId,
        drawId,
        uid,
        sourceBadgeId: prize.badgeId,
        badgeId: badge._id,
        repeatEffect: 'duration',
        ...(domainId ? { domainId } : {}),
        grantedAt: now,
        expiresAt,
    });
    await schedulePointLotteryBadgeExpiry(ctx, expiresAt, grantId);
    return { expiresAt };
}

async function grantUpgradeLotteryBadge(
    ctx: Context,
    uid: number,
    prize: PointLotteryPrize,
    baseBadge: any,
    domainId: string | undefined,
    drawId: ObjectId,
    now: Date,
): Promise<PointLotteryBadgeAward> {
    const scope = userBadgeScopeQuery(domainId);
    const upgradeBadgeIds = prize.badgeUpgradeBadgeIds || [];
    const badgeIds = [baseBadge._id, ...upgradeBadgeIds];
    const badges = await ctx.db.collection('badge').find({
        _id: { $in: badgeIds },
        ...(domainId ? { domainId } : { domainId: { $exists: false } }),
    }).toArray();
    const badgeById = new Map(badges.map((badge: any) => [badge._id, badge]));
    if (badgeIds.some((badgeId) => !badgeById.has(badgeId))) {
        throw new Error('Point lottery upgrade badge is unavailable');
    }

    const activeGrants: any[] = await ctx.db.collection('lottery.badgeGrant').find({
        uid,
        sourceBadgeId: baseBadge._id,
        repeatEffect: 'upgrade',
        ...scope,
        ...activeLotteryBadgeGrantQuery(now),
    }).sort({ grantedAt: -1, _id: -1 }).toArray();
    let currentGrant = activeGrants[0] || null;

    // A legacy race could have created more than one active row for the same
    // chain. Keep one canonical row before cleaning old states so duplicates
    // cannot keep obsolete badges alive indefinitely.
    if (activeGrants.length > 1) {
        await ctx.db.collection('lottery.badgeGrant').updateMany({
            _id: { $in: activeGrants.slice(1).map((grant) => grant._id) },
            expiredAt: { $exists: false },
        }, { $set: { expiredAt: now, supersededAt: now } });
    }

    // Re-read valid ownership on every win. A leftover userBadge whose timed
    // grant has already elapsed is intentionally ignored, while a teacher's
    // permanent assignment or another still-active grant remains effective.
    const resolvedState = await resolvePointLotteryUpgradeState(
        ctx, uid, badgeIds, badges, domainId, now, activeGrants,
    );
    const currentLevel = resolvedState.level;
    const hasExistingState = currentLevel > 0;
    const currentBadgeId = resolvedState.badgeId;
    const targetLevel = hasExistingState ? Math.min(currentLevel + 1, badgeIds.length) : 1;
    const targetBadgeId = badgeIds[targetLevel - 1];
    const targetBadge = badgeById.get(targetBadgeId);

    let expiresAt: Date | undefined;
    let permanent = resolvedState.permanent;
    if (activeGrants.length && !permanent) {
        expiresAt = activeGrants.reduce<Date | undefined>((latest, grant) => (
            !latest || (grant.expiresAt && grant.expiresAt > latest) ? grant.expiresAt : latest
        ), undefined);
    } else if (!activeGrants.length && hasExistingState && !permanent) {
        const existingGrants = await ctx.db.collection('lottery.badgeGrant').find({
            uid,
            badgeId: currentBadgeId,
            ...scope,
            ...activeLotteryBadgeGrantQuery(now),
        }).toArray();
        permanent = existingGrants.some((grant: any) => !grant.expiresAt);
        if (!permanent) {
            expiresAt = existingGrants.reduce<Date | undefined>((latest, grant: any) => (
                !latest || (grant.expiresAt && grant.expiresAt > latest) ? grant.expiresAt : latest
            ), undefined);
        }
    }
    if (!activeGrants.length && !permanent && !expiresAt) {
        const durationHours = normalizeBadgeDurationHours(prize.badgeDurationHours);
        permanent = durationHours === 0;
        expiresAt = durationHours
            ? new Date(now.getTime() + durationHours * 60 * 60 * 1000)
            : undefined;
    }

    await addLotteryBadgeToUser(ctx, uid, targetBadgeId, domainId);
    if (permanent) {
        await ctx.db.collection('badge').updateOne({
            _id: targetBadgeId,
            ...(domainId ? { domainId } : { domainId: { $exists: false } }),
        }, { $addToSet: { users: uid } });
    }

    const history = Array.isArray(currentGrant?.stateHistory) ? [...currentGrant.stateHistory] : [];
    let createdGrant = false;
    const appendHistory = (badgeId: number, level: number, recognized = false) => {
        const last = history[history.length - 1];
        if (last?.badgeId === badgeId && last?.level === level) return;
        history.push({
            badgeId,
            level,
            drawId,
            ...(recognized ? { recognizedAt: now } : { grantedAt: now }),
        });
    };
    if (hasExistingState) appendHistory(currentBadgeId!, currentLevel, true);
    if (!hasExistingState || targetLevel !== currentLevel) appendHistory(targetBadgeId, targetLevel);

    if (!currentGrant) {
        const grantId = new ObjectId();
        createdGrant = true;
        currentGrant = {
            _id: grantId,
            drawId,
            uid,
            sourceBadgeId: baseBadge._id,
            badgeId: targetBadgeId,
            level: targetLevel,
            repeatEffect: 'upgrade',
            badgeUpgradeBadgeIds: upgradeBadgeIds,
            lotteryBadgeIds: [targetBadgeId],
            awardedBadgeIds: [targetBadgeId],
            stateHistory: history,
            ...(domainId ? { domainId } : {}),
            grantedAt: now,
            ...(expiresAt ? { expiresAt } : {}),
        };
        await ctx.db.collection('lottery.badgeGrant').insertOne(currentGrant);
        if (expiresAt) await schedulePointLotteryBadgeExpiry(ctx, expiresAt, grantId);
    } else {
        await retainCurrentLotteryUpgradeBadge(
            ctx,
            currentGrant,
            targetBadgeId,
            badgeIds,
            domainId,
            now,
            {
                badgeId: targetBadgeId,
                level: targetLevel,
                badgeUpgradeBadgeIds: upgradeBadgeIds,
                stateHistory: history,
                upgradedAt: now,
                upgradedByDrawId: drawId,
                ...(expiresAt ? { expiresAt } : {}),
            },
            permanent,
        );
    }

    // New grants also need full-chain consolidation; otherwise a manually
    // assigned starting state would survive beside the upgraded target.
    if (createdGrant) {
        await retainCurrentLotteryUpgradeBadge(
            ctx, currentGrant, targetBadgeId, badgeIds, domainId, now, {}, permanent,
        );
    }
    await selectLotteryBadgeForUser(ctx, uid, targetBadge, domainId);
    return { expiresAt };
}

/**
 * Grant a lottery badge, applying either time stacking or a configured visual
 * state upgrade whenever the same badge prize is drawn again.
 */
export async function grantPointLotteryBadge(
    ctx: Context,
    uid: number,
    prize: PointLotteryPrize,
    domain: Pick<DomainDoc, '_id' | 'workspaceId'> | null | undefined,
    drawId: ObjectId,
    resolvedBadge?: any,
): Promise<PointLotteryBadgeAward> {
    const badge = resolvedBadge || await getPointLotteryBadge(ctx, prize, domain);
    if (!badge || !prize.badgeId) throw new Error('Point lottery badge is unavailable');
    const domainId = getPointLotteryBadgeDomainId(domain);
    return await withPointLotteryBadgeLock(ctx, uid, badge._id, domainId, async () => {
        const now = new Date();
        if (prize.badgeRepeatEffect === 'upgrade') {
            return await grantUpgradeLotteryBadge(ctx, uid, prize, badge, domainId, drawId, now);
        }
        return await grantDurationStackingLotteryBadge(ctx, uid, prize, badge, domainId, drawId, now);
    });
}

async function reconcileExpiredPointLotteryBadgeGrant(ctx: Context, grant: any, now: Date) {
    const domainId = grant.domainId as string | undefined;
    const awardedBadgeIds: number[] = grant.repeatEffect === 'upgrade'
        ? getLotteryOwnedUpgradeBadgeIds(grant)
        : [grant.badgeId];
    for (const badgeId of new Set(awardedBadgeIds.filter(Boolean))) {
        await removeLotteryBadgeIfUnreferenced(ctx, grant.uid, badgeId, domainId, now); // eslint-disable-line no-await-in-loop
    }
}

/**
 * Older upgrade grants retained every reached badge.  Collapse them to their
 * current state so existing students immediately match the replacement-state
 * behaviour. A chain state is exclusive even when it was assigned manually.
 */
export async function reconcileActivePointLotteryUpgradeBadgeStates(ctx: Context) {
    const now = new Date();
    const grants = await ctx.db.collection('lottery.badgeGrant').find({
        repeatEffect: 'upgrade',
        replacementStateVersion: { $ne: POINT_LOTTERY_BADGE_REPLACEMENT_VERSION },
        ...activeLotteryBadgeGrantQuery(now),
    }).sort({ grantedAt: 1, _id: 1 }).limit(100).toArray();
    for (const candidate of grants) {
        const domainId = candidate.domainId as string | undefined;
        const sourceBadgeId = Math.floor(+candidate.sourceBadgeId || 0);
        if (!sourceBadgeId) {
            await ctx.db.collection('lottery.badgeGrant').updateOne({ _id: candidate._id }, { // eslint-disable-line no-await-in-loop
                $set: { replacementStateVersion: POINT_LOTTERY_BADGE_REPLACEMENT_VERSION, replacementStateSkippedAt: now },
            });
            continue;
        }
        try {
            await withPointLotteryBadgeLock( // eslint-disable-line no-await-in-loop
                ctx, candidate.uid, sourceBadgeId, domainId, async () => {
                    const lockedNow = new Date();
                    const activeGrants: any[] = await ctx.db.collection('lottery.badgeGrant').find({
                        uid: candidate.uid,
                        sourceBadgeId,
                        repeatEffect: 'upgrade',
                        ...userBadgeScopeQuery(domainId),
                        ...activeLotteryBadgeGrantQuery(lockedNow),
                    }).sort({ grantedAt: -1, _id: -1 }).toArray();
                    if (!activeGrants.length) return;
                    const grant = activeGrants[0];
                    const chainBadgeIds = [sourceBadgeId, ...(grant.badgeUpgradeBadgeIds || [])]
                        .map((badgeId) => Math.floor(+badgeId || 0))
                        .filter(Boolean);
                    const invalidChain = !chainBadgeIds.length || new Set(chainBadgeIds).size !== chainBadgeIds.length;
                    const badges = invalidChain ? [] : await ctx.db.collection('badge').find({
                        _id: { $in: chainBadgeIds },
                        ...(domainId ? { domainId } : { domainId: { $exists: false } }),
                    }).toArray();
                    if (invalidChain || badges.length !== chainBadgeIds.length) {
                        await ctx.db.collection('lottery.badgeGrant').updateMany({
                            _id: { $in: activeGrants.map((item) => item._id) },
                        }, { $set: {
                            replacementStateVersion: POINT_LOTTERY_BADGE_REPLACEMENT_VERSION,
                            replacementStateSkippedAt: lockedNow,
                        } });
                        return;
                    }
                    const resolvedState = await resolvePointLotteryUpgradeState(
                        ctx, candidate.uid, chainBadgeIds, badges, domainId, lockedNow, activeGrants,
                    );
                    const mergedExpiresAt = resolvedState.permanent
                        ? undefined
                        : activeGrants.reduce<Date | undefined>((latest, item) => (
                            !latest || (item.expiresAt && item.expiresAt > latest) ? item.expiresAt : latest
                        ), undefined);
                    const targetLevel = resolvedState.level || resolveSavedUpgradeGrantLevel(grant, chainBadgeIds);
                    const targetBadgeId = chainBadgeIds[targetLevel - 1];
                    if (!targetBadgeId) {
                        await ctx.db.collection('lottery.badgeGrant').updateMany({
                            _id: { $in: activeGrants.map((item) => item._id) },
                        }, { $set: {
                            replacementStateVersion: POINT_LOTTERY_BADGE_REPLACEMENT_VERSION,
                            replacementStateSkippedAt: lockedNow,
                        } });
                        return;
                    }
                    const cleanupBadgeIds = [
                        ...chainBadgeIds,
                        ...activeGrants.flatMap((item) => getLotteryOwnedUpgradeBadgeIds(item)),
                    ];
                    await addLotteryBadgeToUser(ctx, candidate.uid, targetBadgeId, domainId);
                    if (resolvedState.permanent) {
                        await ctx.db.collection('badge').updateOne({
                            _id: targetBadgeId,
                            ...(domainId ? { domainId } : { domainId: { $exists: false } }),
                        }, { $addToSet: { users: candidate.uid } });
                    }
                    if (activeGrants.length > 1) {
                        await ctx.db.collection('lottery.badgeGrant').updateMany({
                            _id: { $in: activeGrants.slice(1).map((item) => item._id) },
                            expiredAt: { $exists: false },
                        }, { $set: { expiredAt: lockedNow, supersededAt: lockedNow } });
                    }
                    await retainCurrentLotteryUpgradeBadge(
                        ctx,
                        grant,
                        targetBadgeId,
                        cleanupBadgeIds,
                        domainId,
                        lockedNow,
                        {
                            badgeId: targetBadgeId,
                            level: targetLevel,
                            badgeUpgradeBadgeIds: chainBadgeIds.slice(1),
                            replacementStateMigratedAt: lockedNow,
                            ...(mergedExpiresAt ? { expiresAt: mergedExpiresAt } : {}),
                        },
                        resolvedState.permanent,
                    );
                    const account = await ctx.db.collection('user').findOne(
                        { _id: candidate.uid }, { projection: { badgeId: 1, badgeDomainId: 1 } },
                    );
                    const selectedBadgeId = domainId
                        ? (account?.badgeDomainId === domainId ? account.badgeId : undefined)
                        : (!account?.badgeDomainId ? account?.badgeId : undefined);
                    if (!selectedBadgeId || cleanupBadgeIds.includes(selectedBadgeId)) {
                        const targetBadge = badges.find((badge) => badge._id === targetBadgeId);
                        await selectLotteryBadgeForUser(ctx, candidate.uid, targetBadge, domainId);
                    }
                },
            );
        } catch (error) {
            // Transient failures remain unversioned and will be retried by a
            // later sweep; the rest of this batch can still make progress.
            ctx.logger.warn('Unable to reconcile point lottery upgrade grant %s: %o', candidate._id, error);
        }
    }
}

/** Idempotent worker operation for one scheduled temporary-badge expiry. */
export async function expirePointLotteryBadgeGrant(ctx: Context, task: any) {
    const grantId = task?.grantId;
    if (!grantId) return;
    const initialGrant = await ctx.db.collection('lottery.badgeGrant').findOne({
        _id: grantId,
        expiredAt: { $exists: false },
    });
    if (!initialGrant) return;
    const sourceBadgeId = Math.floor(+initialGrant.sourceBadgeId || +initialGrant.badgeId || 0);
    if (!sourceBadgeId) return;
    await withPointLotteryBadgeLock(
        ctx,
        initialGrant.uid,
        sourceBadgeId,
        initialGrant.domainId as string | undefined,
        async () => {
            const now = new Date();
            const grant = await ctx.db.collection('lottery.badgeGrant').findOne({
                _id: grantId,
                expiredAt: { $exists: false },
            });
            if (!grant) return;
            // A timed chain can become permanent when a teacher assigns one
            // of its states permanently. Its old one-shot task is then stale.
            if (!grant.expiresAt) return;
            if (grant.expiresAt > now) {
                await ScheduleModel.add({
                    type: 'schedule',
                    subType: POINT_LOTTERY_BADGE_EXPIRY_TASK,
                    executeAfter: grant.expiresAt,
                    grantId: grant._id,
                });
                return;
            }
            await reconcileExpiredPointLotteryBadgeGrant(ctx, grant, now);
            await ctx.db.collection('lottery.badgeGrant').updateOne({
                _id: grant._id,
                expiredAt: { $exists: false },
            }, { $set: { expiredAt: now } });
        },
    );
}

/** Safety net for a worker restart between a grant expiry and its one-shot task. */
export async function expireDuePointLotteryBadgeGrants(ctx: Context) {
    await reconcileActivePointLotteryUpgradeBadgeStates(ctx);
    const now = new Date();
    const grants = await ctx.db.collection('lottery.badgeGrant').find({
        expiresAt: { $lte: now },
        expiredAt: { $exists: false },
    }).sort({ expiresAt: 1 }).limit(100).toArray();
    for (const grant of grants) {
        await expirePointLotteryBadgeGrant(ctx, { grantId: grant._id }); // eslint-disable-line no-await-in-loop
    }
}
