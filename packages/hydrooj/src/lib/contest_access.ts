import type { Tdoc } from '../interface';
import { PERM, PRIV } from '../model/builtin';
import type { User } from '../model/user';
import { normalizeStudentLevel } from './student_level';

type ContestAudience = Pick<Tdoc, 'owner' | 'maintainer' | 'rule' | 'targetStudentLevels'>;

/** Always evaluate management rights in the contest's source domain. */
export function canManageContestAudience(viewer: User, tdoc?: Pick<Tdoc, 'owner' | 'maintainer'>) {
    return viewer.hasPriv(PRIV.PRIV_EDIT_SYSTEM)
        || viewer.hasPerm(PERM.PERM_EDIT_CONTEST)
        || viewer.hasPerm(PERM.PERM_EDIT_DOMAIN)
        || (!!tdoc && viewer.own(tdoc));
}

export function canViewContestLevel(viewer: User, tdoc: ContestAudience) {
    if (tdoc.rule === 'homework' || !tdoc.targetStudentLevels?.length) return true;
    if (canManageContestAudience(viewer, tdoc)) return true;
    return viewer._id > 0 && tdoc.targetStudentLevels.includes(normalizeStudentLevel(viewer.studentLevel));
}

/** Apply before pagination so hidden contests never consume a page's slots. */
export function contestLevelQuery(viewer: User, domainId: string, manageableDomainIds: string[] = []) {
    if (viewer.hasPriv(PRIV.PRIV_EDIT_SYSTEM)) return {};
    const choices: Record<string, any>[] = [
        { rule: 'homework' },
        { targetStudentLevels: { $exists: false } },
        { targetStudentLevels: { $size: 0 } },
        { targetStudentLevels: null },
    ];
    if (viewer._id > 0) {
        choices.push(
            { targetStudentLevels: normalizeStudentLevel(viewer.studentLevel) },
            { owner: viewer._id },
            { maintainer: viewer._id },
        );
    }
    if (canManageContestAudience(viewer)) choices.push({ domainId: { $in: [domainId, ...manageableDomainIds] } });
    return { $or: choices };
}
