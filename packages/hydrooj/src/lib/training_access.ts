import type { User } from '../interface';
import { PERM, PRIV } from '../model/builtin';

// CREATE_TRAINING and EDIT_TRAINING_SELF are included in Hydro's default
// learner role, so neither permission nor ownership establishes teacher access.
export function canManageTrainingPlans(viewer: Pick<User, 'hasPerm' | 'hasPriv'>) {
    return viewer.hasPriv(PRIV.PRIV_EDIT_SYSTEM)
        || viewer.hasPerm(PERM.PERM_EDIT_DOMAIN)
        || viewer.hasPerm(PERM.PERM_EDIT_TRAINING);
}
