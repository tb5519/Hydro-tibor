import system from '../model/system';
import db from '../service/db';

export const POINT_LOTTERY_CONFIG_KEY = 'pointLottery.config';
export const POINT_LOTTERY_POINTS_FIELD = 'lotteryPoints';
export const POINT_LOTTERY_TOTAL_POINTS_FIELD = 'lotteryTotalPoints';

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

export function normalizePointLotteryConfig(raw: any): PointLotteryConfig {
    const source = raw && typeof raw === 'object' ? raw : {};
    const prizes = Array.isArray(source.prizes) ? source.prizes : [];
    return {
        enabled: source.enabled === true || source.enabled === 'on' || source.enabled === 'true',
        cost: Math.max(0, Math.floor(toNumber(source.cost, DEFAULT_POINT_LOTTERY_CONFIG.cost))),
        prizes: prizes.map((prize) => ({
            name: `${prize?.name || ''}`.trim(),
            image: `${prize?.image || ''}`.trim(),
            probability: Math.max(0, toNumber(prize?.probability, 0)),
            pointDelta: Math.max(0, Math.floor(toNumber(prize?.pointDelta, 0))),
            repeatable: prize?.repeatable !== false && prize?.repeatable !== 'false' && prize?.repeatable !== '0',
            // Older configurations predate this option and should keep broadcasting by default.
            broadcast: prize?.broadcast !== false && prize?.broadcast !== 'false' && prize?.broadcast !== '0',
        })).filter((prize) => prize.name && prize.probability > 0),
    };
}

export function getPointLotteryConfig() {
    return normalizePointLotteryConfig(system.get(POINT_LOTTERY_CONFIG_KEY));
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
        });
    }
    return normalizePointLotteryConfig({
        enabled: args.enabled,
        cost: args.cost,
        prizes,
    });
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
    };
}

export function pointLotteryPrizeKey(prize: Pick<PointLotteryPrize, 'name' | 'image'>) {
    return `${prize.name}\n${prize.image || ''}`;
}
