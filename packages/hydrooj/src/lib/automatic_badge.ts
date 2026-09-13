/* eslint-disable no-await-in-loop */
// Ownership writes run sequentially under short-lived locks, including startup migrations.
import { createHash } from 'crypto';
import moment from 'moment-timezone';
import { ObjectId } from 'mongodb';
import type { Context } from '../context';
import { BadRequestError, NotFoundError } from '../error';
import type { DomainDoc } from '../interface';
import workspace from '../model/workspace';
import avatar from './avatar';
import {
    addLotteryBadgeToUser, removeLotteryBadgeIfUnreferenced, schedulePointLotteryBadgeExpiry,
    selectLotteryBadgeForUser, userBadgeScopeQuery, withPointLotteryBadgeLock,
} from './point_lottery';

type BadgeDomain = Pick<DomainDoc, '_id' | 'workspaceId'>;
type AutomaticBadgeSource = 'lottery' | 'weekly_rp' | 'weekly_ac';
const sourceNames = { lottery: '积分抽奖', weekly_rp: '每周排行奖励', weekly_ac: '每周刷题奖励' };
const PAGE_SIZE = 12;

export function nextWeeklyAutomaticBadgeExpiry(now = new Date()) {
    const local = moment(now).tz('Asia/Shanghai');
    const next = local.clone().day(0).hour(22).minute(0).second(0).millisecond(0);
    if (next.isSameOrBefore(local)) next.add(7, 'days');
    return next.toDate();
}

function domainScope(domain: BadgeDomain) {
    return workspace.resolveDomainWorkspaceId(domain) === workspace.LEGACY_WORKSPACE_ID ? undefined : domain._id;
}

function digest(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function badgeColor(value: unknown, fallback: string) {
    const color = `${value || ''}`.replace(/^#/, '');
    return `#${/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(color) ? color : fallback}`;
}

async function scopedAccounts(ctx: Context, domain: BadgeDomain, uids: number[]) {
    const domainId = domainScope(domain);
    const allowed = domainId
        ? await ctx.db.collection('domain.user').distinct('uid', { domainId, uid: { $in: uids }, join: true })
        : uids.filter((uid) => uid > 1 && Number.isSafeInteger(uid));
    const excluded = domainId
        ? new Set((await Promise.all(allowed.map(async (uid) => (
            await workspace.isAssignedToOtherWorkspace(uid, workspace.resolveDomainWorkspaceId(domain)) ? uid : 0
        )))).filter(Boolean))
        : await workspace.getExcludedLegacyUids();
    return ctx.db.collection('user').find({ _id: { $in: allowed.filter((uid) => !excluded.has(uid)) } })
        .project({ _id: 1, uname: 1, avatar: 1 }).toArray();
}

async function automaticGroups(ctx: Context, domain: BadgeDomain) {
    const scope = userBadgeScopeQuery(domainScope(domain));
    const grants = await ctx.db.collection('lottery.badgeGrant').find(scope).sort({ grantedAt: -1, _id: -1 }).toArray();
    const [badges, accounts] = await Promise.all([
        ctx.db.collection('badge').find({ ...scope, _id: { $in: [...new Set(grants.map((g) => g.badgeId))] } }).toArray(),
        scopedAccounts(ctx, domain, [...new Set(grants.map((g) => g.uid))]),
    ]);
    const badgeMap = new Map(badges.map((b) => [b._id, b]));
    const accountMap = new Map(accounts.map((a) => [a._id, a]));
    const latestChains = new Set<string>();
    const groups = new Map<string, { uid: number, badge: any, account: any, grants: any[], key?: string }>();
    for (const grant of grants) {
        if (grant.supersededAt) continue;
        if (grant.repeatEffect === 'upgrade') {
            const chain = `${grant.uid}:${grant.sourceBadgeId || grant.badgeId}`;
            // A replaced upgrade state is history, never a renewable entitlement.
            if (latestChains.has(chain)) continue;
            latestChains.add(chain);
        }
        if (grant.revokedAt) continue;
        if (!badgeMap.has(grant.badgeId) || !accountMap.has(grant.uid)) continue;
        const key = `${grant.uid}:${grant.badgeId}`;
        if (!groups.has(key)) {
            groups.set(key, {
                uid: grant.uid, badge: badgeMap.get(grant.badgeId), account: accountMap.get(grant.uid), grants: [],
            });
        }
        groups.get(key)!.grants.push(grant);
    }
    for (const [key, group] of groups) {
        group.key = `${key}:${digest(group.grants.map((g) => [
            g._id, g.badgeId, g.expiresAt, g.updatedAt, g.grantedAt,
        ])).slice(0, 24)}`;
    }
    return [...groups.values()];
}

function isActive(grant: any, now: Date) {
    return !grant.expiredAt && (!grant.expiresAt || grant.expiresAt > now);
}

export async function getAutomaticBadgeManagement(
    ctx: Context, domain: BadgeDomain,
    options: { query?: string, status?: string, page?: number, timeZone?: string } = {}, now = new Date(),
) {
    const timeZone = moment.tz.zone(options.timeZone || '') ? options.timeZone! : 'Asia/Shanghai';
    const query = `${options.query || ''}`.trim().slice(0, 100);
    const status = ['active', 'expired', 'all'].includes(options.status || '') ? options.status! : 'active';
    const dateText = (date: Date) => moment(date).tz(timeZone).format('YYYY-MM-DD HH:mm');
    const rows = (await automaticGroups(ctx, domain)).map((group) => {
        const active = group.grants.filter((g) => isActive(g, now));
        const relevant = active.length ? active : group.grants;
        const permanent = active.some((g) => !g.expiresAt);
        const expiry = relevant.reduce((last, g) => Math.max(last, g.expiresAt?.getTime?.() || 0), 0);
        const state = !active.length ? 'expired' : (!permanent && expiry - now.getTime() <= 72 * 3600_000 ? 'expiring' : 'active');
        const sources = [...new Set(relevant.map((g) => sourceNames[g.source as AutomaticBadgeSource] || sourceNames.lottery))];
        const awarded = Math.max(...relevant.map((g) => new Date(g.grantedAt || g._id.getTimestamp()).getTime()));
        return {
            key: group.key!, uid: group.uid, userName: group.account.uname || `${group.uid}`,
            userAvatar: avatar(group.account.avatar || '', 64), userUrl: `/d/${encodeURIComponent(domain._id)}/user/${group.uid}`,
            badgeId: group.badge._id, badgeName: group.badge.title || group.badge.short,
            badgeShort: group.badge.short || group.badge.title,
            backgroundColor: badgeColor(group.badge.backgroundColor, 'eff6ff'),
            fontColor: badgeColor(group.badge.fontColor, '2563eb'), sourcesText: sources.join(' · '),
            grantedAtText: dateText(new Date(awarded)),
            expiresAtText: permanent ? '永久有效' : (expiry ? dateText(new Date(expiry)) : '已到期'),
            expiresAtInput: expiry && !permanent ? moment(expiry).tz(timeZone).format('YYYY-MM-DDTHH:mm') : '',
            permanent, status: state, statusText: state === 'expired' ? '已到期' : (state === 'expiring' ? '即将到期' : '生效中'),
            manualOverlap: !!group.badge.users?.includes(group.uid),
            sortExpiry: permanent ? Number.MAX_SAFE_INTEGER : expiry,
        };
    }).filter((row) => (status === 'all' || (status === 'active' ? row.status !== 'expired' : row.status === 'expired'))
        && (!query || `${row.userName} ${row.badgeName} ${row.badgeShort}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())))
        .sort((a, b) => a.sortExpiry - b.sortExpiry || a.uid - b.uid || a.badgeId - b.badgeId);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, Math.floor(options.page || 1)));
    return {
        autoBadgeRows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), autoBadgeTotal: rows.length,
        autoBadgePage: page, autoBadgePageCount: pages, autoBadgeQuery: query, autoBadgeStatus: status, autoBadgeTimezone: timeZone,
    };
}

export async function updateAutomaticBadge(
    ctx: Context, domain: BadgeDomain,
    options: { key: string, expiresAt?: string, permanent?: boolean, remove?: boolean, operatorUid: number, timeZone?: string },
    now = new Date(),
) {
    const group = (await automaticGroups(ctx, domain)).find((g) => g.key === options.key);
    if (!group) throw new NotFoundError('这条自动徽章记录已发生变化，请刷新后重试。');
    let expiresAt: Date | undefined;
    if (!options.remove && !options.permanent) {
        const zone = options.timeZone || 'Asia/Shanghai';
        const parsed = moment.tz(options.expiresAt || '', 'YYYY-MM-DDTHH:mm', true, zone);
        if (!moment.tz.zone(zone) || !parsed.isValid() || parsed.format('YYYY-MM-DDTHH:mm') !== options.expiresAt
            || parsed.valueOf() <= now.getTime() || parsed.valueOf() > now.getTime() + 100 * 366 * 86400_000) {
            throw new BadRequestError('请选择有效的未来到期时间。');
        }
        expiresAt = parsed.toDate();
    }
    const domainId = domainScope(domain);
    const scope = userBadgeScopeQuery(domainId);
    const sourceIds = [...new Set(group.grants.map((g) => +g.sourceBadgeId || +g.badgeId))].sort((a, b) => a - b);
    const lock = async (index: number): Promise<void> => {
        if (index < sourceIds.length) {
            await withPointLotteryBadgeLock(ctx, group.uid, sourceIds[index], domainId, () => lock(index + 1));
            return;
        }
        const fresh = (await automaticGroups(ctx, domain)).find((g) => g.key === options.key);
        if (!fresh) throw new BadRequestError('学员的徽章刚刚发生了变化，请刷新后重试。');
        const active = fresh.grants.filter((g) => isActive(g, now));
        const targets = options.remove ? fresh.grants : (active.length ? active : [fresh.grants[0]]);
        const ids = targets.map((g) => g._id);
        const set: any = { updatedAt: new Date(), updatedBy: options.operatorUid };
        const unset: any = {};
        if (options.remove) Object.assign(set, { revokedAt: now, revokedBy: options.operatorUid, expiresAt: now });
        else {
            if (options.permanent) unset.expiresAt = '';
            else set.expiresAt = expiresAt;
            unset.expiredAt = '';
            // Explicit teacher extensions survive the next weekly rotation.
            set.teacherAdjustedAt = now;
        }
        await ctx.db.collection('lottery.badgeGrant').updateMany({ _id: { $in: ids }, ...scope }, {
            $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}),
        });
        if (options.remove) {
            await removeLotteryBadgeIfUnreferenced(ctx, fresh.uid, fresh.badge._id, domainId, now);
            await ctx.db.collection('lottery.badgeGrant').updateMany({ _id: { $in: ids }, ...scope }, { $set: { expiredAt: now } });
        } else {
            await addLotteryBadgeToUser(ctx, fresh.uid, fresh.badge._id, domainId);
            if (expiresAt) {
                for (const id of ids) await schedulePointLotteryBadgeExpiry(ctx, expiresAt, id);
            }
            ctx.broadcast('user/delcache', true);
        }
    };
    await lock(0);
}

/** Existing weekly badges were exclusively rotated by the weekly scheduler. */
export async function migrateWeeklyAutomaticBadge(
    ctx: Context, badgeId: number, source: 'weekly_rp' | 'weekly_ac', expiresAt: Date,
) {
    await withPointLotteryBadgeLock(ctx, 0, badgeId, undefined, async () => {
        const badge = await ctx.db.collection('badge').findOne({ _id: badgeId, domainId: { $exists: false } });
        if (!badge || badge.automaticGrantVersion || (badge.manualAssignmentVersion && !badge.legacyAutomaticOwners)) return;
        // Freeze the original automatic owners, so a retry never consumes later manual assignments.
        const owners: number[] = badge.legacyAutomaticOwners || badge.users || [];
        await ctx.db.collection('badge').updateOne({ _id: badgeId }, { $set: { legacyAutomaticOwners: owners, automaticSource: source } });
        for (const uid of owners) {
            const owned = await ctx.db.collection('userBadge').findOne({ owner: uid, badgeId, domainId: { $exists: false } });
            const id = new ObjectId(digest(['legacy-weekly', badgeId, uid]).slice(0, 24));
            await ctx.db.collection('lottery.badgeGrant').updateOne({ _id: id }, { $setOnInsert: {
                uid, badgeId, sourceBadgeId: badgeId, source, repeatEffect: 'duration',
                grantedAt: owned?.getAt || new Date(), expiresAt,
            } }, { upsert: true });
            await schedulePointLotteryBadgeExpiry(ctx, expiresAt, id);
        }
        await ctx.db.collection('badge').updateOne({ _id: badgeId }, {
            $pull: { users: { $in: owners } }, $set: { automaticGrantVersion: 1 },
        } as any);
    });
}

export async function awardWeeklyAutomaticBadge(
    ctx: Context, badgeId: number, uid: number, source: 'weekly_rp' | 'weekly_ac', expiresAt: Date,
) {
    await withPointLotteryBadgeLock(ctx, uid, badgeId, undefined, async () => {
        const badge = await ctx.db.collection('badge').findOne({ _id: badgeId, domainId: { $exists: false } });
        if (!badge) return;
        const id = new ObjectId(digest([source, badgeId, uid, expiresAt]).slice(0, 24));
        const existing = await ctx.db.collection('lottery.badgeGrant').findOne({ _id: id });
        if (existing) return; // Includes teacher removal: a scheduler retry must not re-grant it.
        await ctx.db.collection('lottery.badgeGrant').insertOne({
            _id: id, uid, badgeId, sourceBadgeId: badgeId, source, repeatEffect: 'duration',
            grantedAt: new Date(), expiresAt,
        });
        await addLotteryBadgeToUser(ctx, uid, badgeId);
        await selectLotteryBadgeForUser(ctx, uid, badge);
        await schedulePointLotteryBadgeExpiry(ctx, expiresAt, id);
    });
}

/** Old permanent wins had no grant. Preserve ambiguous manual ownership while adding their known source. */
export async function importLegacyLotteryAutomaticBadges(ctx: Context, domain: BadgeDomain) {
    const domainId = domainScope(domain);
    const domains = domainId ? [domainId] : (await workspace.getDomains(workspace.LEGACY_WORKSPACE_ID)).map((d) => d._id);
    const draws = await ctx.db.collection('lottery.draw').find({
        domainId: { $in: domains }, 'prize.kind': 'badge',
        'prize.badgeRepeatEffect': { $ne: 'upgrade' },
        'prize.badgeDurationHours': { $in: [0, null] },
    }).toArray();
    const scope = userBadgeScopeQuery(domainId);
    const accounts = new Set((await scopedAccounts(ctx, domain, draws.map((d) => d.uid))).map((a) => a._id));
    for (const draw of draws) {
        if (!accounts.has(draw.uid)) continue;
        const badgeId = +draw.prize?.awardedBadgeId || +draw.prize?.badgeId;
        if (!badgeId) continue;
        await withPointLotteryBadgeLock(ctx, draw.uid, badgeId, domainId, async () => {
            const recorded = await ctx.db.collection('lottery.badgeGrant').countDocuments({ drawId: draw._id, ...scope });
            if (recorded) return;
            const badge = await ctx.db.collection('badge').findOne({ _id: badgeId, users: draw.uid, ...scope });
            const held = await ctx.db.collection('userBadge').countDocuments({ owner: draw.uid, badgeId, ...scope });
            if (!badge || !held) return;
            const id = new ObjectId(digest(['legacy-lottery', domainId, draw.uid, badgeId]).slice(0, 24));
            // The stable imported row is also a tombstone after removal.
            const imported = await ctx.db.collection('lottery.badgeGrant').countDocuments({ _id: id });
            const permanentGrant = await ctx.db.collection('lottery.badgeGrant').countDocuments({
                uid: draw.uid, badgeId, ...scope, expiresAt: { $exists: false },
            });
            if (imported || permanentGrant) return;
            await ctx.db.collection('lottery.badgeGrant').updateOne({ _id: id }, { $setOnInsert: {
                uid: draw.uid, badgeId, sourceBadgeId: badgeId, source: 'lottery', repeatEffect: 'duration',
                drawId: draw._id, grantedAt: draw.createdAt || draw._id.getTimestamp(), legacyManualOverlap: true,
                ...(domainId ? { domainId } : {}),
            } }, { upsert: true });
        });
    }
}
