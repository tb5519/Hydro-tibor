import { FindCursor, WithId } from 'mongodb';
import { Context, ObjectId } from 'hydrooj';
import { deleteUserCache } from 'hydrooj/src/model/user';

export interface UserBadge {
    _id: ObjectId;
    owner: number;
    badgeId: number;
    /** Missing means the legacy Tang all-domain scope. */
    domainId?: string;
    getAt: Date;
}

export interface Badge {
    _id: number;
    short: string;
    title: string;
    backgroundColor: string;
    fontColor: string;
    /** Missing means the legacy Tang all-domain scope. */
    domainId?: string;
    backgroundImagePath?: string;
    backgroundImageUpdatedAt?: string;
    acImagePath?: string;
    acImageUpdatedAt?: string;
    themeSoundPath?: string;
    themeSoundUpdatedAt?: string;
    content: string;
    users: number[];
    createAt: Date;
}

declare module 'hydrooj' {
    interface Model {
        userBadge: typeof UserBadgeModel;
        badge: typeof BadgeModel;
    }
}

function scopeQuery(domainId?: string) {
    return domainId ? { domainId } : { domainId: { $exists: false } };
}

async function setUserBadge(
    ctx: Context, userId: number, badgeId: number, badge: string, domainId?: string,
): Promise<number> {
    const scopeUpdate = domainId ? { badgeDomainId: domainId } : { badgeDomainId: null };
    const result = await ctx.db.collection('user').findOneAndUpdate(
        { _id: userId },
        { $set: { badgeId, badge, ...scopeUpdate } },
    );
    if (result) deleteUserCache(result);
    return result?._id || 0;
}

async function resetBadge(ctx: Context, badgeId: number, badge: string, domainId?: string): Promise<number> {
    const query: any = { badgeId };
    if (domainId) query.badgeDomainId = domainId;
    else query.$or = [{ badgeDomainId: null }, { badgeDomainId: { $exists: false } }];
    const result = (await ctx.db.collection('user').updateMany(query, { $set: { badge } })).modifiedCount;
    if (result) deleteUserCache(true);
    return result;
}

async function unsetUserBadge(ctx: Context, userId: number, domainId?: string): Promise<number> {
    const query: any = { _id: userId };
    if (domainId) query.badgeDomainId = domainId;
    else query.$or = [{ badgeDomainId: null }, { badgeDomainId: { $exists: false } }];
    const result = await ctx.db.collection('user').findOneAndUpdate(
        query,
        { $unset: { badgeId: '', badge: '', badgeDomainId: '' } },
    );
    if (result) deleteUserCache(result);
    return result?._id || 0;
}

async function unsetBadge(ctx: Context, badgeId: number, domainId?: string): Promise<number> {
    const query: any = { badgeId };
    if (domainId) query.badgeDomainId = domainId;
    else query.$or = [{ badgeDomainId: null }, { badgeDomainId: { $exists: false } }];
    const result = (await ctx.db.collection('user').updateMany(
        query,
        { $unset: { badgeId: '', badge: '', badgeDomainId: '' } },
    )).modifiedCount;
    if (result) deleteUserCache(true);
    return result;
}

async function userBadgeAdd(ctx: Context, userId: number, badgeId: number, domainId?: string): Promise<ObjectId> {
    const query: any = { owner: userId, badgeId, ...scopeQuery(domainId) };
    const existing = await ctx.db.collection('userBadge').findOne(query);
    if (existing) return existing._id;
    const result = await ctx.db.collection('userBadge').insertOne({
        _id: new ObjectId(),
        owner: userId,
        badgeId,
        ...(domainId ? { domainId } : {}),
        getAt: new Date(),
    });
    return result.insertedId;
}

async function userBadgeGetMulti(
    ctx: Context, userId: number, domainId?: string,
): Promise<FindCursor<WithId<UserBadge>>> {
    return ctx.db.collection('userBadge').find({ owner: userId, ...scopeQuery(domainId) }).sort({ badgeId: 1 });
}

async function userBadgeDel(ctx: Context, userId: number, badgeId: number, domainId?: string): Promise<number> {
    const current = await ctx.db.collection('user').findOne({ _id: userId });
    if (current?.badgeId === badgeId && (domainId ? current.badgeDomainId === domainId : !current.badgeDomainId)) {
        await unsetUserBadge(ctx, userId, domainId);
    }
    return (await ctx.db.collection('userBadge').deleteOne({
        owner: userId,
        badgeId,
        ...scopeQuery(domainId),
    })).deletedCount;
}

async function userBadgeSel(ctx: Context, userId: number, badgeId: number, domainId?: string): Promise<number> {
    const userBadge = await ctx.db.collection('userBadge').findOne({
        owner: userId,
        badgeId,
        ...scopeQuery(domainId),
    });
    if (!userBadge) return 0;
    const badge = await ctx.db.collection('badge').findOne({ _id: badgeId, ...scopeQuery(domainId) });
    if (!badge) return 0;
    const payload = `${badge._id}#${badge.short}#${badge.backgroundColor}#${badge.fontColor}#${badge.title}`;
    return setUserBadge(ctx, userId, badge._id, payload, domainId);
}

async function badgeGetMulti(ctx: Context, domainId?: string): Promise<FindCursor<WithId<Badge>>> {
    return ctx.db.collection('badge').find(scopeQuery(domainId));
}

async function badgeAdd(
    ctx: Context,
    short: string,
    title: string,
    backgroundColor: string,
    fontColor: string,
    content: string,
    users: number[] = [],
    badgeId?: number,
    domainId?: string,
): Promise<number> {
    if (typeof badgeId !== 'number') {
        const badge = await ctx.db.collection('badge').find().sort({ _id: -1 }).limit(1).next();
        badgeId = Math.max((badge?._id || 0) + 1, 1);
    }
    await ctx.db.collection('badge').insertOne({
        _id: badgeId,
        short,
        title,
        backgroundColor,
        fontColor,
        content,
        users,
        ...(domainId ? { domainId } : {}),
        createAt: new Date(),
    });
    for (const userId of users) {
        await userBadgeAdd(ctx, userId, badgeId, domainId); // eslint-disable-line no-await-in-loop
        await userBadgeSel(ctx, userId, badgeId, domainId); // eslint-disable-line no-await-in-loop
    }
    return badgeId;
}

async function badgeGet(ctx: Context, badgeId: number, domainId?: string): Promise<Badge> {
    return ctx.db.collection('badge').findOne({ _id: badgeId, ...scopeQuery(domainId) });
}

async function badgeEdit(
    ctx: Context,
    badgeId: number,
    short: string,
    title: string,
    backgroundColor: string,
    fontColor: string,
    content: string,
    users: number[] = [],
    usersOld: number[] = [],
    domainId?: string,
): Promise<number> {
    const result = await ctx.db.collection('badge').updateOne({ _id: badgeId, ...scopeQuery(domainId) }, {
        $set: { short, title, backgroundColor, fontColor, content, users },
    });
    for (const userId of usersOld) {
        if (!users.includes(userId)) {
            await userBadgeDel(ctx, userId, badgeId, domainId); // eslint-disable-line no-await-in-loop
        }
    }
    for (const userId of users) {
        if (!usersOld.includes(userId)) {
            await userBadgeAdd(ctx, userId, badgeId, domainId); // eslint-disable-line no-await-in-loop
        }
        await userBadgeSel(ctx, userId, badgeId, domainId); // eslint-disable-line no-await-in-loop
    }
    const payload = `${badgeId}#${short}#${backgroundColor}#${fontColor}#${title}`;
    await resetBadge(ctx, badgeId, payload, domainId);
    return result.modifiedCount;
}

async function badgeDel(ctx: Context, badgeId: number, domainId?: string): Promise<number> {
    const result = await ctx.db.collection('badge').deleteOne({ _id: badgeId, ...scopeQuery(domainId) });
    await ctx.db.collection('userBadge').deleteMany({ badgeId, ...scopeQuery(domainId) });
    await unsetBadge(ctx, badgeId, domainId);
    return result.deletedCount;
}

const UserBadgeModel = {
    userBadgeAdd,
    userBadgeGetMulti,
    userBadgeDel,
    userBadgeSel,
    userBadgeUnset: unsetUserBadge,
};
const BadgeModel = { badgeGetMulti, badgeAdd, badgeGet, badgeEdit, badgeDel };
global.Hydro.model.userBadge = UserBadgeModel;
global.Hydro.model.badge = BadgeModel;
