import type { Tdoc } from '../interface';
import { PERM } from '../model/builtin';
import * as contest from '../model/contest';
import user, { User } from '../model/user';

export interface PinnedContestEntry {
    tdoc: Tdoc;
    tsdoc: any;
}

/**
 * Returns the newest active pinned contest the current user is allowed to see.
 * Keep the visibility rules aligned with the normal contest list.
 */
export async function getLatestVisiblePinnedContest(
    domainId: string,
    currentUser: User,
): Promise<PinnedContestEntry | null> {
    if (!currentUser.hasPerm(PERM.PERM_VIEW_CONTEST)) return null;

    const canViewHidden = currentUser.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST);
    const rules = Object.keys(contest.RULES).filter((rule) => !contest.RULES[rule].hidden);
    const groups = canViewHidden
        ? []
        : (await user.listGroup(domainId, currentUser._id)).map((group) => group.name);
    const query = {
        rule: { $in: rules },
        pinned: true,
        endAt: { $gt: new Date() },
        ...(canViewHidden
            ? {}
            : {
                $or: [
                    { maintainer: currentUser._id },
                    { owner: currentUser._id },
                    { assign: { $in: groups } },
                    { assign: { $size: 0 } },
                ],
            }),
    };
    const [tdoc] = await contest.getMulti(domainId, query)
        .sort({ beginAt: -1, _id: -1 })
        .limit(1)
        .toArray();
    if (!tdoc) return null;

    const tsdict = await contest.getListStatus(domainId, currentUser._id, [tdoc.docId]);
    return { tdoc, tsdoc: tsdict[tdoc.docId.toHexString()] };
}
