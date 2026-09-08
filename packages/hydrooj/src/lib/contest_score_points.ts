import type { DomainDoc } from '../interface';
import domain from '../model/domain';
import workspace from '../model/workspace';
import db from '../service/db';
import { getEffectiveHonorWallOwners } from './badge_honor_wall';
import {
    buildPointLotteryBadgeStyle, ensureGlobalPointLotteryState, POINT_LOTTERY_POINTS_FIELD,
    POINT_LOTTERY_TOTAL_POINTS_FIELD, pointLotteryUserColl,
} from './point_lottery';

export interface ContestPointBadge {
    id: number;
    name: string;
    backgroundColor: string;
    fontColor: string;
}

export interface ContestScorePointAward {
    recordId: string;
    basePoints: number;
    bonusPoints: number;
    points: number;
    contestPoints: number;
    badgePercent: number;
    badges: ContestPointBadge[];
}

/** Use the participant's entry domain, with the same isolation as their badges. */
export async function getContestPointBadges(
    sourceDomainId: string, entryDomainId: string | undefined, uid: number, now = new Date(),
): Promise<ContestPointBadge[]> {
    const source = await domain.get(sourceDomainId);
    if (!source) return [];
    let badgeDomain: Pick<DomainDoc, '_id' | 'workspaceId'> = source;
    if (entryDomainId && entryDomainId !== sourceDomainId) {
        const entry = await domain.get(entryDomainId);
        if (entry && workspace.resolveDomainWorkspaceId(entry) === workspace.resolveDomainWorkspaceId(source)) badgeDomain = entry;
    }
    const legacy = workspace.resolveDomainWorkspaceId(badgeDomain) === workspace.LEGACY_WORKSPACE_ID;
    const scope = legacy ? { domainId: { $exists: false } } : { domainId: badgeDomain._id };
    const owned = await db.collection('userBadge').find({ ...scope, owner: uid }).toArray();
    if (!owned.length) return [];
    const [badges, grants] = await Promise.all([
        db.collection('badge').find({ ...scope, _id: { $in: owned.map((item) => item.badgeId) } }).toArray(),
        db.collection('lottery.badgeGrant').find({ ...scope, uid }).toArray(),
    ]);
    const effectiveOwners = getEffectiveHonorWallOwners(owned, badges, grants, now);
    return badges.filter((badge) => effectiveOwners.get(badge._id)?.has(uid))
        .sort((left, right) => left._id - right._id)
        .map((badge) => {
            const style = buildPointLotteryBadgeStyle(badgeDomain._id, badge as any);
            return { id: badge._id, name: style.tooltip, backgroundColor: style.backgroundColor, fontColor: style.fontColor };
        });
}

/**
 * Base score remains a high-water mark. Only newly earned points get today's
 * badge bonus; retries, rejudges, and later badge changes cannot re-award old
 * scores. Keep twentieths of a point so small gains do not lose their bonus.
 */
export async function creditContestScorePoints(
    uid: number, contestId: string, recordId: string, score: number, badges: ContestPointBadge[],
): Promise<ContestScorePointAward> {
    await ensureGlobalPointLotteryState(uid);
    const baseField = `contestScorePointAwards.${contestId}`;
    const bonusField = `contestScorePointBonusUnits.${contestId}`;
    const receiptField = `contestScorePointReceipts.${contestId}`;
    const base = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
    const previous = { $ifNull: [`$${baseField}`, 0] };
    const previousUnits = { $ifNull: [`$${bonusField}`, 0] };
    const baseDelta = { $subtract: [base, previous] };
    const bonusUnits = { $add: [previousUnits, { $multiply: [baseDelta, badges.length] }] };
    const bonusTotal = { $floor: { $divide: [bonusUnits, 20] } };
    const bonusDelta = { $subtract: [bonusTotal, { $floor: { $divide: [previousUnits, 20] } }] };
    const delta = { $add: [baseDelta, bonusDelta] };
    const currentPoints = { $ifNull: [`$${POINT_LOTTERY_POINTS_FIELD}`, 0] };
    const totalPoints = { $ifNull: [`$${POINT_LOTTERY_TOTAL_POINTS_FIELD}`, currentPoints] };
    const receipt = {
        recordId: { $literal: recordId },
        basePoints: baseDelta,
        bonusPoints: bonusDelta,
        points: delta,
        contestPoints: { $add: [base, bonusTotal] },
        badgePercent: badges.length * 5,
        badges: { $literal: badges },
    };
    const updated = await (pointLotteryUserColl as any).findOneAndUpdate({
        _id: uid,
        $expr: { $lt: [previous, base] },
    }, [{
        $set: {
            [POINT_LOTTERY_POINTS_FIELD]: { $add: [currentPoints, delta] },
            [POINT_LOTTERY_TOTAL_POINTS_FIELD]: { $add: [totalPoints, delta] },
            [baseField]: base,
            [bonusField]: bonusUnits,
            [receiptField]: receipt,
            // Retain in-flight receipts until their record write is acknowledged.
            // A later result cannot overwrite the only copy after an interruption.
            ...(recordId ? {
                contestScorePointPendingReceipts: {
                    $concatArrays: [
                        { $ifNull: ['$contestScorePointPendingReceipts', []] },
                        [{ contestId: { $literal: contestId }, award: receipt }],
                    ],
                },
            } : {}),
        },
    }], { returnDocument: 'after' });
    const account = updated || await pointLotteryUserColl.findOne({ _id: uid }, {
        projection: { [baseField]: 1, [bonusField]: 1, [receiptField]: 1, contestScorePointPendingReceipts: 1 },
    });
    const saved = account?.contestScorePointReceipts?.[contestId];
    // The receipt is written with the balance, so a retry after an interrupted
    // record write still returns the original, already-paid award.
    if (saved?.recordId === recordId) return saved;
    const pending = account?.contestScorePointPendingReceipts?.find((item) => (
        item.contestId === contestId && item.award.recordId === recordId
    ));
    if (pending) return pending.award;
    return {
        recordId, basePoints: 0, bonusPoints: 0, points: 0,
        contestPoints: (account?.contestScorePointAwards?.[contestId] || 0)
            + Math.floor((account?.contestScorePointBonusUnits?.[contestId] || 0) / 20),
        badgePercent: 0, badges: [],
    };
}

export async function acknowledgeContestScorePoints(uid: number, recordId: string) {
    await pointLotteryUserColl.updateOne({ _id: uid }, {
        $pull: { contestScorePointPendingReceipts: { 'award.recordId': recordId } },
    } as any);
}
