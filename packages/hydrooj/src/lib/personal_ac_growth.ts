import moment from 'moment-timezone';
import { ObjectId } from 'mongodb';
import type { Context } from '../context';
import type { DomainDoc } from '../interface';
import { BUILTIN_ROLES, PERM, PRIV, STATUS } from '../model/builtin';
import record from '../model/record';
import workspace from '../model/workspace';

interface AcCounts {
    _id: number;
    newAc7: number;
    newAc30: number;
}

interface GrowthCacheEntry {
    expiresAt: number;
    rows: Promise<AcCounts[]>;
}

// Share one aggregate between homepage visits, but refresh immediately after
// a record changes. Membership/administrator checks are always read afresh.
let growthCache = new WeakMap<object, Map<string, GrowthCacheEntry>>();

export function invalidatePersonalAcGrowth() {
    growthCache = new WeakMap();
}

export function personalAcGrowthPipeline(domainIds: string[], uids: number[], start7: Date, start30: Date, now: Date) {
    const first7 = ObjectId.createFromTime(Math.floor(start7.getTime() / 1000));
    const first30 = ObjectId.createFromTime(Math.floor(start30.getTime() / 1000));
    return [
        {
            $match: {
                domainId: { $in: domainIds },
                uid: { $in: uids },
                pid: { $gt: 0 },
                status: STATUS.STATUS_ACCEPTED,
                _id: { $lt: ObjectId.createFromTime(Math.floor(now.getTime() / 1000) + 1) },
                contest: { $nin: [record.RECORD_PRETEST, record.RECORD_GENERATE] },
                input: { $exists: false },
                hackTarget: { $exists: false },
                'files.hack': { $exists: false },
            },
        },
        {
            $group: {
                _id: { uid: '$uid', domainId: '$domainId', pid: '$pid' },
                firstRecordId: { $min: '$_id' },
            },
        },
        // Filter after grouping: passing an old solved problem again is not a new AC.
        { $match: { firstRecordId: { $gte: first30 } } },
        {
            $group: {
                _id: '$_id.uid',
                newAc30: { $sum: 1 },
                newAc7: { $sum: { $cond: [{ $gte: ['$firstRecordId', first7] }, 1, 0] } },
            },
        },
    ];
}

function isDomainAdministrator(ddoc: Pick<DomainDoc, 'roles'>, role = 'default') {
    if (role === 'root') return true;
    const permissions = BigInt(ddoc.roles?.[role] ?? BUILTIN_ROLES[role] ?? 0);
    return !!(permissions & PERM.PERM_EDIT_DOMAIN);
}

export async function getPersonalAcGrowth(
    ctx: Context, currentDomain: Pick<DomainDoc, '_id' | 'workspaceId'>, uid: number,
    timeZone = 'Asia/Shanghai', now = new Date(),
) {
    const workspaceId = workspace.resolveDomainWorkspaceId(currentDomain);
    const legacy = workspaceId === workspace.LEGACY_WORKSPACE_ID;
    const [ddocs, members, explicitMembers, excluded] = await Promise.all([
        ctx.db.collection('domain').find(legacy ? workspace.getDomainQuery(workspaceId) : { _id: currentDomain._id })
            .project<Pick<DomainDoc, '_id' | 'owner' | 'roles'>>({ _id: 1, owner: 1, roles: 1 }).toArray(),
        workspace.getMembers(workspaceId),
        ctx.db.collection('workspace.member').find({ workspaceId, status: 'active' }).project({ uid: 1 }).toArray(),
        legacy ? workspace.getExcludedLegacyUids() : Promise.resolve(new Set<number>()),
    ]);
    const domainIds = ddocs.map((ddoc) => ddoc._id).sort();
    const domainMap = new Map(ddocs.map((ddoc) => [ddoc._id, ddoc]));
    const memberships = await ctx.db.collection('domain.user').find({
        domainId: { $in: domainIds }, uid: { $gt: 1 }, join: true,
    }).project({ domainId: 1, uid: 1, role: 1 }).toArray();
    const staff = new Set([
        ...members.map((member) => member.uid),
        ...explicitMembers.map((member) => member.uid),
        ...ddocs.map((ddoc) => ddoc.owner),
    ]);
    for (const membership of memberships) {
        if (isDomainAdministrator(domainMap.get(membership.domainId), membership.role)) staff.add(membership.uid);
    }
    const candidateUids = [...new Set(memberships.map((membership) => membership.uid))];
    const accounts = candidateUids.length ? await ctx.db.collection('user').find({ _id: { $in: candidateUids } })
        .project({ _id: 1, priv: 1 }).toArray() : [];
    const adminPrivs = PRIV.PRIV_EDIT_SYSTEM | PRIV.PRIV_MANAGE_ALL_DOMAIN | PRIV.PRIV_JUDGE;
    const studentUids = accounts.filter((account) => (
        (account.priv & PRIV.PRIV_USER_PROFILE)
        && !(account.priv & adminPrivs)
        && !workspace.isPlatformAdmin(account._id)
        && !staff.has(account._id)
        && !excluded.has(account._id)
    )).map((account) => account._id);
    const eligible = studentUids.includes(uid);
    // An administrator can still see their own progress, without setting the student target.
    const countUids = [...new Set([...studentUids, uid])].sort((a, b) => a - b);
    const localNow = moment(now).tz(timeZone);
    const start7 = localNow.clone().subtract(6, 'days').startOf('day').toDate();
    const start30 = localNow.clone().subtract(29, 'days').startOf('day').toDate();
    const key = JSON.stringify([domainIds, countUids, start7, start30]);
    let cache = growthCache.get(ctx.db);
    if (!cache) {
        cache = new Map();
        growthCache.set(ctx.db, cache);
    }
    let entry = cache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
        entry = {
            expiresAt: Date.now() + 30_000,
            rows: ctx.db.collection('record').aggregate<AcCounts>(
                personalAcGrowthPipeline(domainIds, countUids, start7, start30, now),
                { allowDiskUse: true },
            ).toArray(),
        };
        cache.set(key, entry);
        if (cache.size > 32) cache.delete(cache.keys().next().value);
    }
    let rows: AcCounts[];
    try {
        rows = await entry.rows;
    } catch (error) {
        if (cache.get(key) === entry) cache.delete(key);
        throw error;
    }
    const counts = new Map(rows.map((row) => [row._id, row]));
    const own = counts.get(uid);
    const newAc7 = own?.newAc7 || 0;
    const topCount = studentUids.reduce((top, studentUid) => Math.max(top, counts.get(studentUid)?.newAc7 || 0), 0);
    return {
        newAc7,
        newAc30: own?.newAc30 || 0,
        weeklyAc: {
            eligible,
            isTop: eligible && topCount > 0 && newAc7 === topCount,
            topCount,
            gap: Math.max(0, topCount - newAc7),
            scope: legacy ? 'workspace' : 'domain',
        },
    };
}
