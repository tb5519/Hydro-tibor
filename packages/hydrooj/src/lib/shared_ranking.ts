import { LEVELS } from '../model/builtin';
import domain from '../model/domain';

export interface SharedRankingRow {
    uid: number;
    totalRp: number;
    totalAccept: number;
    totalSubmit: number;
    level: number;
    rpInfo: Record<string, number>;
    rank?: number;
}

interface SharedRankingCache {
    key: string;
    expiresAt: number;
    rows: SharedRankingRow[];
}

const SHARED_RANKING_CACHE_TTL = 5 * 60 * 1000;
let sharedRankingCache: SharedRankingCache | null = null;

export function invalidateSharedRankingSnapshot() {
    sharedRankingCache = null;
}

function getLevelByRank(rank: number, count: number) {
    for (let i = 0; i < LEVELS.length; i++) {
        if (
            rank <= (LEVELS[i] * count) / 100
            && (i === LEVELS.length - 1 || rank > (LEVELS[i + 1] * count) / 100)
        ) return i;
    }
    return 0;
}

function assignRanksAndLevels(rows: SharedRankingRow[]) {
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rank = i + 1;
        row.rank = rank;
        row.level = getLevelByRank(rank, rows.length);
    }
}

export async function getSharedRankingSnapshot() {
    const domains = await domain.getMulti().project<{ _id: string }>({ _id: 1 }).toArray();
    const domainIds = domains.map((ddoc) => ddoc._id).filter(Boolean).sort();
    const cacheKey = domainIds.join('\n');
    if (sharedRankingCache?.key === cacheKey && sharedRankingCache.expiresAt > Date.now()) return sharedRankingCache.rows;

    const dudocs = await domain.collUser.find({
        domainId: { $in: domainIds },
        uid: { $gt: 1 },
        join: true,
    }).project({
        uid: 1,
        nAccept: 1,
        nSubmit: 1,
        rp: 1,
        rpInfo: 1,
    }).toArray();
    const merged = new Map<number, SharedRankingRow>();
    for (const dudoc of dudocs) {
        if (!merged.has(dudoc.uid)) {
            merged.set(dudoc.uid, {
                uid: dudoc.uid,
                totalRp: 0,
                totalAccept: 0,
                totalSubmit: 0,
                level: 0,
                rpInfo: {},
            });
        }
        const row = merged.get(dudoc.uid)!;
        row.totalAccept += dudoc.nAccept || 0;
        row.totalSubmit += dudoc.nSubmit || 0;
        const rp = Math.max(0, +dudoc.rp || 0);
        // Shared RP is written identically to every domain membership. Select it
        // once instead of summing the same score for each domain.
        if (rp > row.totalRp) {
            row.totalRp = rp;
            row.rpInfo = { ...(dudoc.rpInfo || {}) };
        }
    }

    const rows = Array.from(merged.values())
        .filter((row) => row.totalRp > 0)
        .map((row) => {
            row.totalRp = Math.max(0, row.totalRp);
            return row;
        })
        .sort((a, b) => (
            b.totalRp - a.totalRp
            || b.totalAccept - a.totalAccept
            || a.totalSubmit - b.totalSubmit
            || a.uid - b.uid
        ));
    assignRanksAndLevels(rows);
    sharedRankingCache = {
        key: cacheKey,
        expiresAt: Date.now() + SHARED_RANKING_CACHE_TTL,
        rows,
    };
    return rows;
}
