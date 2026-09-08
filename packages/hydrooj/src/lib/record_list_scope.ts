import { PERM, PRIV } from '../model/builtin';

interface RecordListUser {
    hasPriv(priv: number): boolean;
    hasPerm(perm: bigint): boolean;
}

// Students also have PERM_VIEW_RECORD and several *_SELF permissions. Only
// actual administrative capabilities enable browsing other users' submissions.
// These checks use the current domain's permissions, not another workspace's.
export function canManageRecordList(udoc: RecordListUser) {
    return [
        PRIV.PRIV_EDIT_SYSTEM,
        PRIV.PRIV_MANAGE_ALL_DOMAIN,
        PRIV.PRIV_READ_RECORD_CODE,
        PRIV.PRIV_REJUDGE,
    ].some((priv) => udoc.hasPriv(priv)) || [
        PERM.PERM_EDIT_DOMAIN,
        PERM.PERM_READ_RECORD_CODE,
        PERM.PERM_REJUDGE,
        PERM.PERM_REJUDGE_PROBLEM,
        PERM.PERM_EDIT_CONTEST,
        PERM.PERM_EDIT_HOMEWORK,
    ].some((perm) => udoc.hasPerm(perm));
}
