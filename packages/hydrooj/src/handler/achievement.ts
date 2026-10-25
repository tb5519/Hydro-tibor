import { ObjectId } from 'mongodb';
import type { Context } from '../context';
import { NotFoundError, PermissionError, ValidationError } from '../error';
import {
    acknowledgeAchievements, applyAchievementHooks, getAchievementRecord, getAchievementScope,
    getPendingAchievements, isAchievementRecordReady, syncUserAchievements,
} from '../lib/achievement';
import { ACHIEVEMENT_CATALOG } from '../lib/achievement_catalog';
import {
    ACHIEVEMENT_IMAGE_LIMIT, achievementDefinition, getAchievementArtwork, presentAchievements,
    removeAchievementImage, setAchievementImage,
} from '../lib/achievement_image';
import { tryRedirectAsset } from '../lib/asset_delivery';
import assetStorage from '../lib/asset_storage';
import { isScratchDomain } from '../lib/domain_type';
import { Logger } from '../logger';
import { PERM, PRIV, STATUS } from '../model/builtin';
import storage from '../model/storage';
import workspace from '../model/workspace';
import { Handler, param, Types } from '../service/server';

const logger = new Logger('achievement');

function privateResponse(handler: Handler) {
    handler.response.addHeader('Cache-Control', 'private, no-store');
    handler.context.vary('Cookie');
    handler.context.vary('Authorization');
    handler.response.addHeader('X-Content-Type-Options', 'nosniff');
}

function domainManagement(handler: Handler) { return handler.request.path.startsWith('/domain/achievement'); }

export async function checkAchievementManageAccess(handler: Handler) {
    handler.checkPriv(PRIV.PRIV_USER_PROFILE);
    const legacy = workspace.resolveDomainWorkspaceId(handler.domain) === workspace.LEGACY_WORKSPACE_ID;
    if (domainManagement(handler)) {
        handler.checkPerm(PERM.PERM_EDIT_DOMAIN);
        if (legacy) throw new PermissionError(PERM.PERM_EDIT_DOMAIN);
    } else if (!legacy || (await workspace.getLegacyWorkspace()).ownerUid !== handler.user._id) {
        throw new PermissionError(PERM.PERM_EDIT_DOMAIN);
    }
}

export class AchievementManageHandler extends Handler {
    async prepare() { await checkAchievementManageAccess(this); }

    async get() {
        const scoped = domainManagement(this);
        privateResponse(this);
        this.response.template = 'achievement_manage.html';
        this.response.body = {
            achievements: await presentAchievements(this.ctx, this.domain, ACHIEVEMENT_CATALOG),
            achievementBaseTemplate: scoped ? 'domain_base.html' : 'manage_base.html',
            badgeManageRoute: scoped ? 'domain_badge_manage' : 'badge_manage',
            manageRoute: scoped ? 'domain_achievement_manage' : 'achievement_manage',
            maxImageSize: ACHIEVEMENT_IMAGE_LIMIT,
        };
    }

    async finishImageEdit(id: string) {
        privateResponse(this);
        if (this.request.json) {
            const [achievement] = await presentAchievements(this.ctx, this.domain, [achievementDefinition(id)]);
            this.response.body = { ok: true, achievement };
        } else this.response.redirect = this.url(domainManagement(this) ? 'domain_achievement_manage' : 'achievement_manage');
    }

    @param('id', Types.String)
    async postUpload(_: string, id: string) {
        await checkAchievementManageAccess(this);
        achievementDefinition(id);
        await this.limitRate('achievement_image', 60, 15);
        const image = this.request.files?.image;
        await setAchievementImage(this.ctx, this.domain, id, Array.isArray(image) ? image[0] : image, this.user._id);
        await this.finishImageEdit(id);
    }

    @param('id', Types.String)
    async postRemoveImage(_: string, id: string) {
        await checkAchievementManageAccess(this);
        await removeAchievementImage(this.ctx, this.domain, id, this.user._id);
        await this.finishImageEdit(id);
    }
}

export class AchievementImageHandler extends Handler {
    @param('id', Types.String)
    @param('size', Types.PositiveInt, true)
    async get(_: string, id: string, size?: number) {
        if (size !== undefined && size !== 384) throw new ValidationError('size');
        const artwork = await getAchievementArtwork(this.ctx, this.domain, id);
        const imagePath = size === 384 ? artwork?.thumbnailPath : artwork?.imagePath;
        if (!imagePath) throw new NotFoundError('成就图片尚未上传。');
        const meta = await storage.getMeta(imagePath);
        if (!meta) throw new NotFoundError('成就图片暂不可用。');
        privateResponse(this);
        if (tryRedirectAsset(this, { path: imagePath, meta })) return;
        if (meta.remoteAsset) {
            this.response.redirect = await assetStorage.signDownloadLink(meta.remoteAsset);
            return;
        }
        this.response.type = 'image/png';
        this.response.body = await storage.get(imagePath);
    }
}

function canCelebrate(handler: Handler) {
    return handler.user._id > 1 && handler.user.hasPriv(PRIV.PRIV_USER_PROFILE) && !handler.session?.sudoUid;
}

export class AchievementPendingHandler extends Handler {
    async get() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        privateResponse(this);
        if (!canCelebrate(this)) {
            this.response.body = { achievements: [], settled: true };
            return;
        }
        const rid = this.request.query.rid;
        let rdoc;
        if (rid !== undefined) {
            if (typeof rid !== 'string' || !/^[a-f0-9]{24}$/i.test(rid)) throw new ValidationError('rid');
            // Never turn the notification endpoint into a way to inspect other students' records.
            rdoc = await getAchievementRecord(this.ctx, this.domain, this.user._id, new ObjectId(rid));
            if (!rdoc || rdoc.contest?.toString().startsWith('0'.repeat(23))) throw new NotFoundError('Record');
            if (!rdoc.judgeAt || [STATUS.STATUS_WAITING, STATUS.STATUS_FETCHED, STATUS.STATUS_JUDGING, STATUS.STATUS_COMPILING].includes(rdoc.status)) {
                this.response.body = { achievements: [], settled: false };
                return;
            }
            if (!await isAchievementRecordReady(this.ctx, rdoc)) {
                this.response.body = { achievements: [], settled: false };
                return;
            }
        }
        await syncUserAchievements(this.ctx, this.domain, this.user._id, { record: rdoc });
        const pending = await getPendingAchievements(this.ctx, this.domain, this.user._id, 10);
        this.response.body = { achievements: await presentAchievements(this.ctx, this.domain, pending), settled: true };
    }
}

export class AchievementAckHandler extends Handler {
    async post() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        privateResponse(this);
        const ids = this.args.ids;
        if (!Array.isArray(ids) || ids.length > 10 || ids.some((id) => typeof id !== 'string')) throw new ValidationError('ids');
        ids.forEach(achievementDefinition);
        if (canCelebrate(this)) await acknowledgeAchievements(this.ctx, this.domain, this.user._id, ids);
        this.response.body = { ok: true };
    }
}

export async function injectAchievementContext(handler: Handler) {
    if (!handler.response.template || handler.request.json || handler.response.redirect || handler.response.status >= 400
        || handler.request.websocket || isScratchDomain(handler.domain)) return;
    const template = handler.response.template;
    if (template === 'user_detail.html' && handler.response.body.udoc) {
        try {
            const progress = await syncUserAchievements(handler.ctx, handler.domain, handler.response.body.udoc._id);
            const earned = progress.filter((entry) => entry.unlocked);
            handler.response.body.achievementWall = {
                items: await presentAchievements(handler.ctx, handler.domain, earned),
                total: ACHIEVEMENT_CATALOG.length, unlocked: earned.length,
            };
        } catch (error) {
            logger.warn('Unable to load achievement wall: %o', error);
        }
    }
    if (!canCelebrate(handler)) return;
    const selfProfile = template === 'user_detail.html' && handler.response.body.udoc?._id === handler.user._id;
    if (!selfProfile && !['problem_detail.html', 'record_detail.html', 'main.html', 'daily_quiz.html'].includes(template)) return;
    handler.UiContext.achievementPendingUrl = handler.url('achievement_pending');
    handler.UiContext.achievementAckUrl = handler.url('achievement_ack');
    handler.UiContext.achievementScope = `${getAchievementScope(handler.domain)}/${handler.user._id}`;
    handler.UiContext.achievementAutoShow = selfProfile || template === 'main.html';
    if (template === 'record_detail.html') {
        const rdoc = handler.response.body.rdoc;
        const timestamp = rdoc?._id?.getTimestamp?.()?.getTime() || 0;
        handler.UiContext.achievementRecordId = String(rdoc?._id || '');
        handler.UiContext.achievementLive = rdoc?.uid === handler.user._id && !handler.response.body.isPretestRecord
            && !rdoc?.contest?.toString().startsWith('0'.repeat(23)) && !handler.request.query.rev
            && timestamp <= Date.now() && Date.now() - timestamp < 30 * 60_000;
    }
    privateResponse(handler);
}

export async function apply(ctx: Context) {
    await applyAchievementHooks(ctx);
    ctx.Route('achievement_manage', '/manage/achievement', AchievementManageHandler);
    ctx.Route('domain_achievement_manage', '/domain/achievement', AchievementManageHandler);
    ctx.Route('achievement_image', '/achievement/:id/image', AchievementImageHandler);
    ctx.Route('achievement_pending', '/achievement/pending', AchievementPendingHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('achievement_ack', '/achievement/ack', AchievementAckHandler, PRIV.PRIV_USER_PROFILE);
    ctx.injectUI('ControlPanel', 'achievement_manage', { before: 'badge_manage', icon: 'crown' },
        (handler) => workspace.isLegacyOwner(handler.user._id));
    ctx.injectUI('DomainManage', 'domain_achievement_manage', { family: 'Properties', icon: 'crown', before: 'domain_edit' },
        PERM.PERM_EDIT_DOMAIN, (handler) => workspace.resolveDomainWorkspaceId(handler.domain) !== workspace.LEGACY_WORKSPACE_ID);
    ctx.i18n.load('zh', { achievement_manage: '成就系统', domain_achievement_manage: '成就系统' });
    ctx.i18n.load('en', { achievement_manage: 'Achievements', domain_achievement_manage: 'Achievements' });
    ctx.on('handler/after', injectAchievementContext);
}
