import type { Context } from '../context';
import type { DomainDoc } from '../interface';
import { getUserBadgeCounts } from './user_badge_gallery';

export const AVATAR_EFFECT_BATCH_LIMIT = 100;

export function parseAvatarEffectUids(value: unknown): number[] | null {
    if (typeof value !== 'string' || !value.length || value.length > 2000) return null;
    const values = value.split(',').map((item) => item.trim());
    if (values.some((item) => !/^[1-9]\d*$/.test(item) || !Number.isSafeInteger(Number(item)))) return null;
    const ids = [...new Set(values.map(Number))];
    return ids.length <= AVATAR_EFFECT_BATCH_LIMIT ? ids : null;
}

export async function getUserAvatarEffects(
    ctx: Context,
    currentDomain: Pick<DomainDoc, '_id' | 'workspaceId'>,
    uids: number[],
    now = new Date(),
) {
    const counts = await getUserBadgeCounts(ctx, currentDomain, uids, now);
    return {
        users: [...new Set(uids)].filter((uid) => counts.has(uid)).map((uid) => ({
            uid,
            badgeCount: counts.get(uid)!,
            effect: counts.get(uid)! >= 5 ? 'electric-arc' as const : null,
        })),
    };
}
