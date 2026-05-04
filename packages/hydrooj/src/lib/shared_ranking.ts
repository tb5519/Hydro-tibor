import { Dictionary } from 'lodash';
import domain from '../model/domain';
import { RpTypes } from '../script/rating';

export type SharedRankingRow = {
    uid: number;
    totalRp: number;
    totalAccept: number;
    totalSubmit: number;
    maxLevel: number;
    rpInfo: Record<string, number>;
    rank?: number;
};

type SharedRankingCache = {
    key: string;
    expiresAt: number;
    rows: SharedRankingRow[];
};

const SHARED_RANKING_CACHE_TTL = 5 * 60 * 1000;
let sharedRankingCache: SharedRankingCache | null = null;

function createRpDict(base: number) {
    return new Proxy({} as Dictionary<number>, {
        get(self, key) {
            if (typeof key !== 'string') return self[key as any];
            return self[key] ?? base;
        },
    });
}

export async function getSharedRankingSnapshot() {
    const domains = await domain.getMulti().project<{ _id: string }>({ _id: 1 }).toArray();
    const domainIds = domains.map((ddoc) => ddoc._id).filter(Boolean).sort();
    const cacheKey = domainIds.join('\n');
    if (sharedRankingCache?.key === cacheKey && sharedRankingCache.expiresAt > Date.now()) return sharedRankingCache.rows;

    const dudocs = await domain.collUser.find({
        uid: { $gt: 1 },
        join: true,
    }).project({
        uid: 1,
        nAccept: 1,
        nSubmit: 1,
        level: 1,
    }).toArray();
    const merged = new Map<number, SharedRankingRow>();
    for (const dudoc of dudocs) {
        if (!merged.has(dudoc.uid)) {
            merged.set(dudoc.uid, {
                uid: dudoc.uid,
                totalRp: 0,
                totalAccept: 0,
                totalSubmit: 0,
                maxLevel: 0,
                rpInfo: {},
            });
        }
        const row = merged.get(dudoc.uid)!;
        row.totalAccept += dudoc.nAccept || 0;
        row.totalSubmit += dudoc.nSubmit || 0;
        row.maxLevel = Math.max(row.maxLevel, dudoc.level || 0);
    }

    for (const type in RpTypes) {
        const result = createRpDict(RpTypes[type].base);
        await RpTypes[type].run(domainIds, result, async () => {});
        for (const uidText in result) {
            const uid = +uidText;
            const row = merged.get(uid);
            if (!row) continue;
            const value = result[uidText] || 0;
            row.rpInfo[type] = value;
            row.totalRp += value;
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
    rows.forEach((row, index) => { row.rank = index + 1; });
    sharedRankingCache = {
        key: cacheKey,
        expiresAt: Date.now() + SHARED_RANKING_CACHE_TTL,
        rows,
    };
    return rows;
}
