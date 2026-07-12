import path from 'path';
import { lookup } from 'mime-types';
import moment from 'moment-timezone';
import { ObjectId } from 'mongodb';
import { Context, Handler, NotFoundError, param, PRIV, STATUS, Types, ValidationError } from 'hydrooj';
import { getSharedRankingSnapshot } from 'hydrooj/src/lib/shared_ranking';
import RecordModel from 'hydrooj/src/model/record';
import storage from 'hydrooj/src/model/storage';
import { Time } from 'hydrooj/src/utils';
import { Badge } from './model';

const UserBadgeModel = global.Hydro.model.userBadge;
const BadgeModel = global.Hydro.model.badge;

const user = global.Hydro.model.user;
const SPECIAL_BADGE_TASK = 'badge.autoAssignSpecial';
const SPECIAL_BADGE_TIMEZONE = 'Asia/Shanghai';
const BADGE_BACKGROUND_IMAGE_LIMIT = 8 * 1024 * 1024;
const BADGE_BACKGROUND_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const SPECIAL_BADGES = {
    strongest: {
        title: '最强王者',
        short: '🏆最强王者',
        backgroundColor: 'FFD700',
        fontColor: '000000',
        content: '每周日 22:00 自动分配给排行榜第一名同学。',
    },
    shadow: {
        title: '暗影骑士',
        short: '♞ 暗影骑士',
        backgroundColor: '111111',
        fontColor: 'FFD700',
        content: '每周日 22:00 自动分配给最近一周 AC 数最多的同学。',
    },
};

function getRequestFile(files: any, key: string) {
    const file = files?.[key];
    return Array.isArray(file) ? file[0] : file;
}

function getBadgeBackgroundImageUrl(handler: Handler, badge: Badge) {
    if (!badge?.backgroundImagePath) return '';
    return handler.url('badge_background_image', {
        id: badge._id,
        query: { v: badge.backgroundImageUpdatedAt || '' },
    });
}

function nextSunday22() {
    const now = moment().tz(SPECIAL_BADGE_TIMEZONE);
    const next = now.clone().day(7).hour(22).minute(0).second(0).millisecond(0);
    if (next.isSameOrBefore(now)) next.add(7, 'days');
    return next.toDate();
}

function isStudentPriv(priv = 0) {
    return !!(priv & PRIV.PRIV_USER_PROFILE) && !(priv & PRIV.PRIV_EDIT_SYSTEM);
}

async function getStudentUidSet(ctx: Context, uids: number[]) {
    if (!uids.length) return new Set<number>();
    const udocs = await ctx.db.collection('user').find({ _id: { $in: uids } })
        .project({ _id: 1, priv: 1 })
        .toArray();
    return new Set(udocs.filter((udoc) => isStudentPriv(udoc.priv)).map((udoc) => udoc._id));
}

async function ensureSpecialBadge(ctx: Context, config: typeof SPECIAL_BADGES.strongest) {
    const current = await ctx.db.collection('badge').findOne({ title: config.title });
    if (current) {
        await ctx.db.collection('badge').updateOne({ _id: current._id }, {
            $set: {
                short: config.short,
                backgroundColor: config.backgroundColor,
                fontColor: config.fontColor,
                content: config.content,
            },
        });
        return current._id;
    }
    const max = await ctx.db.collection('badge').find().sort({ _id: -1 }).limit(1).next();
    const badgeId = (max?._id || 0) + 1;
    await ctx.db.collection('badge').insertOne({
        _id: badgeId,
        short: config.short,
        title: config.title,
        backgroundColor: config.backgroundColor,
        fontColor: config.fontColor,
        content: config.content,
        users: [],
        createAt: new Date(),
    });
    return badgeId;
}

async function replaceBadgeOwners(ctx: Context, badgeId: number, owners: number[]) {
    await ctx.db.collection('badge').updateOne({ _id: badgeId }, { $set: { users: owners } });
    await ctx.db.collection('userBadge').deleteMany({ badgeId, owner: { $nin: owners } });
    await ctx.db.collection('user').updateMany(
        { badgeId, _id: { $nin: owners } },
        { $unset: { badgeId: '', badge: '' } },
    );
    for (const uid of owners) {
        const exists = await ctx.db.collection('userBadge').findOne({ owner: uid, badgeId });
        if (!exists) await ctx.db.collection('userBadge').insertOne({ owner: uid, badgeId, getAt: new Date() });
        await UserBadgeModel.userBadgeSel(ctx, uid, badgeId);
    }
    ctx.broadcast('user/delcache', true);
}

async function getStrongestUid(ctx: Context) {
    const rows = await getSharedRankingSnapshot();
    const candidateUids = rows.map((row) => row.uid);
    const studentUidSet = await getStudentUidSet(ctx, candidateUids);
    return rows.find((row) => studentUidSet.has(row.uid))?.uid || null;
}

async function getWeeklyAcChampionUid(ctx: Context) {
    const since = moment().tz(SPECIAL_BADGE_TIMEZONE).subtract(7, 'days').toDate();
    const rows = await RecordModel.coll.aggregate([
        {
            $match: {
                _id: { $gte: Time.getObjectID(since) },
                uid: { $gt: 1 },
                pid: { $gt: 0 },
                status: STATUS.STATUS_ACCEPTED,
                contest: { $nin: [RecordModel.RECORD_PRETEST, RecordModel.RECORD_GENERATE] },
            },
        },
        {
            $group: {
                _id: '$uid',
                ac: { $sum: 1 },
                lastRecordId: { $max: '$_id' },
            },
        },
        { $sort: { ac: -1, lastRecordId: -1, _id: 1 } },
        { $limit: 50 },
    ]).toArray();
    const candidateUids = rows.map((row) => row._id);
    const studentUidSet = await getStudentUidSet(ctx, candidateUids);
    return rows.find((row) => studentUidSet.has(row._id))?._id || null;
}

async function assignSpecialBadges(ctx: Context) {
    const [strongestBadgeId, shadowBadgeId] = await Promise.all([
        ensureSpecialBadge(ctx, SPECIAL_BADGES.strongest),
        ensureSpecialBadge(ctx, SPECIAL_BADGES.shadow),
    ]);
    const [strongestUid, shadowUid] = await Promise.all([
        getStrongestUid(ctx),
        getWeeklyAcChampionUid(ctx),
    ]);
    await Promise.all([
        replaceBadgeOwners(ctx, strongestBadgeId, strongestUid ? [strongestUid] : []),
        replaceBadgeOwners(ctx, shadowBadgeId, shadowUid ? [shadowUid] : []),
    ]);
}

class UserBadgeManageHandler extends Handler {

    @param('page', Types.PositiveInt, true)
    async get(_: string, page = 1, userId = this.user._id) {
        const [ddocs, dpcount] = await this.ctx.db.paginate(
            await UserBadgeModel.userBadgeGetMulti(this.ctx, userId),
            page,
            10
        );
        const result = await (await BadgeModel.badgeGetMulti(this.ctx)).toArray();
        const bdocs = Object.fromEntries(result.reduce((acc, item) => {
            acc.set(item._id, item);
            return acc;
        }, new Map<number, Badge>()));
        this.response.template = 'user_badge_manage.html';
        const current_badge = (await this.ctx.db.collection('user').findOne({ _id: userId })).badge;
        this.response.body = { ddocs, bdocs, dpcount, page, current_badge };
    }

    @param('badgeId', Types.PositiveInt, true)
    async postEnable(_: string, badgeId: number) {
        await UserBadgeModel.userBadgeSel(this.ctx, this.user._id, badgeId);
        this.response.redirect = this.url('user_badge_manage');
    }

    async postReset(_: string) {
        await UserBadgeModel.userBadgeUnset(this.ctx, this.user._id);
        this.response.redirect = this.url('user_badge_manage');
    }
}

class BadgeManageHandler extends Handler {

    @param('page', Types.PositiveInt, true)
    async get(_: string, page = 1) {
        const[ddocs, dpcount] = await this.ctx.db.paginate(
            await BadgeModel.badgeGetMulti(this.ctx),
            page,
            10
        );
        this.response.template = 'badge_manage.html';
        this.response.body = { ddocs, dpcount, page };
    }
}

class BadgeAddHandler extends Handler {

    async get() {
        this.response.template = 'badge_add.html';
    }

    @param('short', Types.String)
    @param('title', Types.String)
    @param('backgroundColor', Types.String)
    @param('fontColor', Types.String)
    @param('content', Types.Content)
    @param('users', Types.NumericArray, true)
    async postAdd(_: string, short: string, title: string, backgroundColor: string, fontColor: string, content: string, users: [number]) {
        const badgeId = await BadgeModel.badgeAdd(this.ctx, short, title, backgroundColor, fontColor, content, users);
        this.response.redirect = this.url('badge_detail', { id: badgeId });
    }
}

class BadgeEditHandler extends Handler {

    @param('id', Types.PositiveInt, true)
    async get(_: string, id: number) {
        const badge = await BadgeModel.badgeGet(this.ctx, id);
        if (!badge) throw new NotFoundError(`Badge ${id} is not exist!`);
        this.response.template = 'badge_edit.html';
        this.response.body = {
            badge: {
                ...badge,
                backgroundImage: getBadgeBackgroundImageUrl(this, badge),
            },
        };
    }

    @param('id', Types.PositiveInt, true)
    @param('short', Types.String)
    @param('title', Types.String)
    @param('backgroundColor', Types.String)
    @param('fontColor', Types.String)
    @param('content', Types.Content)
    @param('users', Types.NumericArray, true)
    @param('removeBackground', Types.Boolean, true)
    async postUpdate(
        _: string,
        id: number,
        short: string,
        title: string,
        backgroundColor: string,
        fontColor: string,
        content: string,
        users: [number],
        removeBackground = false,
    ) {
        const badge = await BadgeModel.badgeGet(this.ctx, id);
        if (!badge) throw new NotFoundError(`Badge ${id} is not exist!`);
        const file = getRequestFile(this.request.files, 'backgroundImage');
        if (file?.size > BADGE_BACKGROUND_IMAGE_LIMIT) throw new ValidationError('backgroundImage');
        const ext = file?.size ? path.extname(file.originalFilename || '').toLowerCase() : '';
        if (file?.size && !BADGE_BACKGROUND_IMAGE_EXTS.includes(ext)) throw new ValidationError('backgroundImage');

        const users_old = badge.users;
        await BadgeModel.badgeEdit(this.ctx, id, short, title, backgroundColor, fontColor, content, users, users_old);
        if (file?.size) {
            const storagePath = `badge/${id}/profile-background-${Date.now()}${ext}`;
            await storage.put(storagePath, file.filepath, this.user._id);
            const updatedAt = new Date().toISOString();
            await this.ctx.db.collection('badge').updateOne({ _id: id }, {
                $set: { backgroundImagePath: storagePath, backgroundImageUpdatedAt: updatedAt },
            });
            if (badge.backgroundImagePath && badge.backgroundImagePath !== storagePath) {
                storage.del([badge.backgroundImagePath], this.user._id).catch(() => {});
            }
        } else if (removeBackground && badge.backgroundImagePath) {
            await this.ctx.db.collection('badge').updateOne({ _id: id }, {
                $unset: { backgroundImagePath: '', backgroundImageUpdatedAt: '' },
            });
            storage.del([badge.backgroundImagePath], this.user._id).catch(() => {});
        }
        this.response.redirect = this.url('badge_detail', { id });
    }

    @param('id', Types.PositiveInt, true)
    async postDelete(_: string, id: number) {
        const badge = await BadgeModel.badgeGet(this.ctx, id);
        await BadgeModel.badgeDel(this.ctx, id);
        if (badge?.backgroundImagePath) {
            storage.del([badge.backgroundImagePath], this.user._id).catch(() => {});
        }
        this.response.redirect = this.url('badge_manage');
    }
}

class BadgeBackgroundImageHandler extends Handler {
    noCheckPermView = true;

    @param('id', Types.PositiveInt, true)
    async get(_: string, id: number) {
        const badge = await BadgeModel.badgeGet(this.ctx, id);
        if (!badge?.backgroundImagePath) throw new NotFoundError(`Badge background ${id} is not exist!`);
        const meta = await storage.getMeta(badge.backgroundImagePath);
        if (!meta) throw new NotFoundError(`Badge background ${id} is not exist!`);
        this.response.body = await storage.get(badge.backgroundImagePath);
        this.response.type = meta['Content-Type'] || lookup(badge.backgroundImagePath) || 'application/octet-stream';
        this.response.addHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
}

class BadgeDetailHandler extends Handler {
    
    @param('id', Types.PositiveInt, true)
    async get(domainId: string, id: number) {
        const badge = await BadgeModel.badgeGet(this.ctx, id);
        if (!badge) throw new NotFoundError(`Badge ${id} is not exist!`);
        const udict = await user.getList(domainId, badge.users);
        this.response.template = 'badge_detail.html';
        this.response.body = { badge, udict };
    }
}


export async function apply(ctx: Context) {
    await ctx.inject(['worker'], (c) => {
        c.worker.addHandler(SPECIAL_BADGE_TASK, async () => assignSpecialBadges(ctx));
    });
    if (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0') {
        const exists = await ctx.db.collection('schedule').countDocuments({ type: 'schedule', subType: SPECIAL_BADGE_TASK });
        if (!exists) {
            await ctx.db.collection('schedule').insertOne({
                _id: new ObjectId(),
                type: 'schedule',
                subType: SPECIAL_BADGE_TASK,
                executeAfter: nextSunday22(),
                interval: [1, 'week'],
            });
        }
    }

    ctx.Route('badge_manage', '/manage/badge', BadgeManageHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('badge_add', '/badge/add', BadgeAddHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('badge_edit', '/badge/:id/edit', BadgeEditHandler, PRIV.PRIV_MANAGE_ALL_DOMAIN);
    ctx.Route('badge_background_image', '/badge/:id/background', BadgeBackgroundImageHandler);
    ctx.Route('badge_detail', '/badge/:id', BadgeDetailHandler);
    ctx.Route('user_badge_manage', '/mybadge', UserBadgeManageHandler, PRIV.PRIV_USER_PROFILE);
    ctx.injectUI('ControlPanel', 'badge_manage');
    ctx.injectUI('UserDropdown', 'user_badge_manage', () => ({ icon: 'crown', displayName: 'user_badge_manage' }));
    ctx.i18n.load('zh', {
        'Badge': '徽章',
        'badge_manage': '徽章管理',
        'badge_add': '添加徽章',
        'badge_edit': '编辑徽章',
        'badge_detail': '徽章详情',
        'create at': '创建于',
        'badge ID': '徽章ID',
        'badge title': '徽章标题',
        'badge short': '徽章简称',
        'user_badge_manage': '我的徽章',
        'get at': '获取时间',
        'Enable': '启用',
        'badge background color': '徽章背景色',
        'badge font color': '徽章字体色',
        'Badge profile background': '徽章个人主页背景图',
        'Upload a wide image to display behind the holder\'s profile information.':
            '上传横向图片，作为获得者个人主页顶部的背景。',
        'Recommended size: 1600 x 500 (16:5), JPG, PNG, WebP or GIF, up to 8 MB.':
            '建议尺寸：1600 x 500（16:5），支持 JPG、PNG、WebP、GIF，最大 8 MB。GIF 将在个人主页背景中自动播放。',
        'Current profile background': '当前个人主页背景图',
        'Remove current profile background': '移除当前个人主页背景图',
        'hex color code': '十六进制颜色代码',
        'badge preview': '徽章预览',
        'badge assignment': '徽章分配',
        'User to assign this badge': '欲分配此徽章的用户',
        'Display name, max 3 chars recommended': '显示名，建议3字以内',
        'Also used as badge hover text': '另作徽章悬停时内容',
        'Badge Owners': '持有徽章',
        'Sorry, there are no badges.': '抱歉，这里没有徽章。',
        'Sorry, You don\'t have any badge.': '抱歉，你还没有徽章。',
        'Hover over a badge to view its title; click a badge to open its introduction page.': '鼠标悬停至徽章可查看徽章标题，单击徽章可打开徽章介绍页。',
        'If you have any questions about badge validity, please contact the administrator.': '对徽章存续等有任何问题的，请联系站点管理员。',
        'Current Badge': '当前徽章',
        'No Badge Enabled': '您暂未启用任何徽章',
        'Reset Badge': '重置徽章',
    });
    ctx.i18n.load('en', {
        'Badge': 'Badge',
        'badge_manage': 'Badge Manage',
        'badge_add': 'Badge Add',
        'badge_edit': 'Badge Edit',
        'badge_detail': 'Badge Detail',
        'create at': 'Create At',
        'badge id': 'Badge ID',
        'badge title': 'Badge Title',
        'badge short': 'Badge Short',
        'user_badge_manage': 'My Badge',
        'get at': 'Get At',
        'enable': 'Enable',
        'badge background color': 'Badge Background Color',
        'badge font color': 'Badge Font Color',
        'Badge profile background': 'Badge Profile Background',
        'Upload a wide image to display behind the holder\'s profile information.':
            'Upload a wide image to display behind the holder\'s profile information.',
        'Recommended size: 1600 x 500 (16:5), JPG, PNG, WebP or GIF, up to 8 MB.':
            'Recommended size: 1600 x 500 (16:5), JPG, PNG, WebP or GIF, up to 8 MB. '
            + 'GIFs play automatically on the profile background.',
        'Current profile background': 'Current Profile Background',
        'Remove current profile background': 'Remove current profile background',
        'hex color code': 'Hex Color Code',
        'badge preview': 'Badge Preview',
        'badge assignment': 'Badge Assignment',
        'User to assign this badge': 'User to assign this badge',
        'Display name, max 3 chars recommended': 'Display name, max 3 chars recommended',
        'Also used as badge hover text': 'Also used as badge hover text',
        'Badge Owners': 'Badge Owners',
        'Sorry, there are no badges.': 'Sorry, there are no badges.',
        'Sorry, You don\'t have any badge.': 'Sorry, You don\'t have any badge.',
        'Hover over a badge to view its title; click a badge to open its introduction page.': 'Hover over a badge to view its title; click a badge to open its introduction page.',
        'If you have any questions about badge validity, please contact the administrator.': 'If you have any questions about badge validity, please contact the administrator.',
        'Current Badge': 'Current Badge',
        'No Badge Enabled': 'No Badge Enabled',
        'Reset Badge': 'Reset Badge',
    });
}
