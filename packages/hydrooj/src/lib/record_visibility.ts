import { Filter } from 'mongodb';
import { PRIV } from '../model/builtin';
import user from '../model/user';

type UserLike = {
    _id: number;
    priv?: number;
};

const ignoredPrivKeys = new Set(['PRIV_DEFAULT', 'PRIV_NEVER', 'PRIV_NONE', 'PRIV_ALL']);
const allExplicitPriv = Object.entries(PRIV).reduce((sum, [key, value]) => (
    ignoredPrivKeys.has(key) ? sum : sum + value
), 0);
const superAdminPrivs = Array.from(new Set([PRIV.PRIV_ALL, allExplicitPriv]));

export function isSuperAdminPrivilege(priv?: number) {
    return typeof priv === 'number' && superAdminPrivs.includes(priv);
}

export function canViewSuperAdminRecords(viewer: UserLike) {
    return isSuperAdminPrivilege(viewer?.priv);
}

export async function getHiddenSuperAdminUids(viewer: UserLike) {
    if (canViewSuperAdminRecords(viewer)) return [];
    const udocs = await user.getMulti({ _id: { $gt: 1 }, priv: { $in: superAdminPrivs } }, ['_id']).toArray();
    return udocs.map((udoc) => udoc._id).filter((uid) => uid !== viewer?._id);
}

export async function canViewRecordOwner(viewer: UserLike, uid: number) {
    if (uid === viewer?._id || canViewSuperAdminRecords(viewer)) return true;
    const hiddenUids = await getHiddenSuperAdminUids(viewer);
    return !hiddenUids.includes(uid);
}

export function appendHiddenSuperAdminFilter<T extends { uid?: number }>(query: Filter<T>, hiddenUids: number[]) {
    if (!hiddenUids.length) return query;
    const target = query as any;
    target.$and = [...(target.$and || []), { uid: { $nin: hiddenUids } }];
    return query;
}
