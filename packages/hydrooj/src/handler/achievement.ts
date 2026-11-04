import { ObjectId } from 'mongodb';
import type { Context } from '../context';
import { NotFoundError, PermissionError, ValidationError } from '../error';
import {
    acknowledgeAchievements, applyAchievementHooks, getAchievementRecord, getAchievementScope,
    getPendingAchievements, getStoredAchievementArtProgress, isAchievementContestSubmission, isAchievementRecordReady, syncUserAchievements,
} from '../lib/achievement';
import {
    ACHIEVEMENT_CATALOG, ACHIEVEMENT_SERIES_COUNT, getAchievementSeriesId,
    getAchievementTier, selectHighestAchievements,
} from '../lib/achievement_catalog';
import {
    ACHIEVEMENT_IMAGE_LIMIT, achievementDefinition, getAchievementArtwork, presentAchievements,
    removeAchievementImage, setAchievementImage,
} from '../lib/achievement_image';
import {
    ACHIEVEMENT_SOUND_LIMIT, getAchievementSound, presentAchievementSound,
    removeAchievementSound, saveAchievementSound, setAchievementSound,
} from '../lib/achievement_sound';
import { tryRedirectAsset } from '../lib/asset_delivery';
import assetStorage from '../lib/asset_storage';
import { isScratchDomain } from '../lib/domain_type';
import { isMediaCacheRequest, setMediaCacheHeaders } from '../lib/media_cache';
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
            achievementSound: await presentAchievementSound(this.ctx, this.domain),
            maxSoundSize: ACHIEVEMENT_SOUND_LIMIT,
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

    async finishSoundEdit() {
        privateResponse(this);
        if (this.request.json) {
            this.response.body = { ok: true, achievementSound: await presentAchievementSound(this.ctx, this.domain) };
        } else this.response.redirect = this.url(domainManagement(this) ? 'domain_achievement_manage' : 'achievement_manage');
    }

    async postUploadSound() {
        await checkAchievementManageAccess(this);
        await this.limitRate('achievement_sound', 60, 15);
        const sound = this.request.files?.sound;
        await setAchievementSound(this.ctx, this.domain, Array.isArray(sound) ? sound[0] : sound, this.user._id);
        await this.finishSoundEdit();
    }

    async postRemoveSound() {
        await checkAchievementManageAccess(this);
        await removeAchievementSound(this.ctx, this.domain, this.user._id);
        await this.finishSoundEdit();
    }

    @param('volume', Types.UnsignedInt)
    @param('enabled', Types.Boolean)
    async postSaveSound(_: string, volume: number, enabled: boolean) {
        await checkAchievementManageAccess(this);
        await saveAchievementSound(this.ctx, this.domain, volume, enabled, this.user._id);
        await this.finishSoundEdit();
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
        privateResponse(this);
        const version = this.request.query.v;
        const versionedImage = typeof version === 'string' && !!version && version === artwork.version;
        // Never put replacement artwork in the cache under an old version's URL.
        if (version && !versionedImage) throw new NotFoundError('成就图片版本已更新。');
        const meta = await storage.getMeta(imagePath);
        if (!meta) throw new NotFoundError('成就图片暂不可用。');
        if ((isMediaCacheRequest(this) || this.request.query.__media_version)
            && tryRedirectAsset(this, { path: imagePath, meta })) return;
        if (versionedImage) {
            // Keep the versioned image URL stable: caching a redirect would
            // eventually point to an expired CDN/OSS signature. storage.get streams
            // only the requested object, so thumbnails never download the original.
            const etag = `"${version}-${size === 384 ? '384' : 'original'}"`;
            const condition = this.request.headers?.['if-none-match'];
            const notModified = typeof condition === 'string' && condition.split(',').some((value) => {
                const tag = value.trim().replace(/^W\//, '');
                return tag === etag || tag === '*';
            });
            // Failed object reads must keep no-store instead of caching an error page.
            if (!notModified) this.response.body = await storage.get(imagePath, undefined, meta);
            this.response.type = 'image/png';
            this.response.addHeader('Cache-Control', 'private, max-age=31536000, immutable');
            this.response.addHeader('ETag', etag);
            if (notModified) {
                this.response.status = 304;
                this.response.body = '';
                this.context.status = 304;
            } else setMediaCacheHeaders(this, { path: imagePath, meta });
            return;
        }
        if (tryRedirectAsset(this, { path: imagePath, meta })) return;
        if (meta.remoteAsset) {
            this.response.redirect = await assetStorage.signDownloadLink(meta.remoteAsset);
            return;
        }
        this.response.type = 'image/png';
        this.response.body = await storage.get(imagePath, undefined, meta);
        setMediaCacheHeaders(this, { path: imagePath, meta });
    }
}

export class AchievementSoundHandler extends Handler {
    async get() {
        const sound = await getAchievementSound(this.ctx, this.domain);
        if (!sound?.soundPath) throw new NotFoundError('成就音效尚未上传。');
        const meta = await storage.getMeta(sound.soundPath);
        if (!meta) throw new NotFoundError('成就音效暂不可用。');
        privateResponse(this);
        if (tryRedirectAsset(this, { path: sound.soundPath, meta })) return;
        if (meta.remoteAsset) {
            this.response.redirect = await assetStorage.signDownloadLink(meta.remoteAsset);
            return;
        }
        this.response.type = sound.contentType || 'application/octet-stream';
        this.response.body = await storage.get(sound.soundPath, undefined, meta);
        setMediaCacheHeaders(this, { path: sound.soundPath, meta });
    }
}

function canCelebrate(handler: Handler) {
    return handler.user._id > 1 && handler.user.hasPriv(PRIV.PRIV_USER_PROFILE) && !handler.session?.sudoUid;
}

type AchievementProgress = Awaited<ReturnType<typeof syncUserAchievements>>;

type ArtProgress = Omit<AchievementProgress[number], 'historical'>[];
type Artwork = Awaited<ReturnType<typeof presentAchievements>>[number];

// One typical programming problem is worth 100 points. Prefer actual configured
// rewards on pages that know the question weight, possible quiz points or prizes.
function reachablePointGain(handler: Handler) {
    const { dailyQuiz, pointLottery, tdoc, pdoc, rdoc } = handler.response.body;
    if (dailyQuiz?.state) {
        const quiz = dailyQuiz.state;
        return quiz.completed ? 0 : Math.max(0, quiz.possiblePoints - quiz.earnedPoints);
    }
    let gain = Math.max(100, Number(tdoc?.score?.[pdoc?.docId]) || 0, Number(rdoc?.scorePointAward?.points) || 0);
    if (pointLottery?.enabled && pointLottery.canDraw && pointLottery.points >= pointLottery.cost) {
        for (const prize of pointLottery.prizes || []) {
            if (prize.available !== false && prize.probability > 0) gain = Math.max(gain, Number(prize.pointDelta) || 0);
        }
    }
    return gain;
}

/** Predict within the current scope; a cold prediction is never a prerequisite for presentation. */
async function nextAchievementImages(handler: Handler, progress: ArtProgress, artwork: Artwork[]) {
    const earned = selectHighestAchievements(progress.filter((item) => item.unlocked));
    const earnedTiers = new Map(earned.map((item) => [getAchievementSeriesId(item), getAchievementTier(item)]));
    const pending = earned.filter((item) => item.pending).sort((a, b) => Number(a.unlockedAt) - Number(b.unlockedAt));
    const pointGain = reachablePointGain(handler);
    const points = progress.filter((item) => item.category === 'points' && !item.unlocked
        && item.target > (earnedTiers.get('points') || 0) && item.target - item.progress <= pointGain);
    // Small and large rewards on this page may unlock different top tiers.
    const nearestPoint = points.filter((item) => item.progress >= item.target).pop() || points[0];
    const highestPoint = points[points.length - 1];
    const byId = new Map(artwork.filter((item) => item.imageUrl).map((item) => [item.id, item]));
    const shortlist = (next: ArtProgress = []) => [...new Set([
        ...pending, ...(nearestPoint ? [nearestPoint, highestPoint] : []), ...selectHighestAchievements(next),
    ].map((item) => byId.get(item.id)).filter((item): item is Artwork => !!item))].slice(0, 6);
    const close = progress.filter((item) => {
        if (item.unlocked || getAchievementTier(item) <= (earnedTiers.get(getAchievementSeriesId(item)) ?? 0)) return false;
        if (item.category === 'streak') return Number.isFinite(item.nextAcProgress) && item.nextAcProgress >= item.target;
        const value = item.category === 'weekly_ac' ? item.currentWindowProgress : item.progress;
        return Number.isFinite(value) && item.target - value === 1;
    });
    let candidates: ArtProgress;
    if (handler.response.template === 'main.html') {
        // Do not fetch all ten first-difficulty originals for a new account.
        candidates = close.filter((item) => ['streak', 'weekly_ac'].includes(item.category)
            || (item.progress > 0 && ['solved', 'mastery', 'contest_ac', 'contest_ak'].includes(item.category)));
    } else if (handler.response.template === 'problem_detail.html') {
        const { pdoc, tdoc, mode } = handler.response.body;
        if (!pdoc || !Number.isInteger(pdoc.docId) || pdoc.docId <= 0
            || ['review', 'view', 'none'].includes(mode)) return [];
        const scope = getAchievementScope(handler.domain);
        const uid = handler.user._id;
        const domainId = pdoc.domainId || handler.domain._id;
        // Cross-domain linked questions cannot change this independent domain's progress.
        if (scope !== 'legacy' && domainId !== handler.domain._id) return [];
        if (pdoc.objectiveKind || !close.length) return shortlist();
        const now = new Date();
        const today = Math.floor((now.getTime() + 8 * 3600_000) / 86_400_000);
        const solved = handler.ctx.db.collection('achievement.solved');
        const [alreadySolved, participant, alreadySolvedThisWeek] = await Promise.all([
            solved.findOne({ scope, uid, domainId, pid: pdoc.docId, acceptedAt: { $lte: now } }),
            tdoc?.docId ? (handler.ctx.db.collection('document.status') as any).findOne({
                docType: 30, domainId: tdoc.domainId || domainId, docId: tdoc.docId, uid,
            }) : null,
            close.some((item) => item.category === 'weekly_ac')
                ? handler.ctx.db.collection('achievement.weekly').findOne({
                    scope, uid, domainId, pid: pdoc.docId, day: { $gte: today - 6, $lte: today }, acceptedAt: { $lte: now },
                }) : null,
        ]);
        if (tdoc && scope !== 'legacy' && participant?.entryDomainId && participant.entryDomainId !== handler.domain._id) return [];
        candidates = close.filter((item) => item.category === 'streak'
            || (item.category === 'weekly_ac' && !alreadySolvedThisWeek)
            || (!alreadySolved && (item.category === 'solved'
            || (['difficulty', 'mastery'].includes(item.category) && item.difficulty === pdoc.difficulty))));
        if (tdoc && (tdoc.domainId || domainId) === domainId
            && isAchievementContestSubmission(tdoc, participant, { pid: pdoc.docId, submittedAt: now })) {
            const contestSolves = await solved.find({ scope, uid, domainId, contestId: String(tdoc.docId), acceptedAt: { $lte: now } }).toArray();
            const accepted = new Set(contestSolves.filter((entry) => isAchievementContestSubmission(tdoc, participant, entry))
                .map((entry) => entry.pid));
            if (!accepted.has(pdoc.docId)) {
                candidates.push(...close.filter((item) => item.category === 'contest_ac'
                    || (item.category === 'contest_ak' && tdoc.pids.every((pid) => pid === pdoc.docId || accepted.has(pid)))));
            }
        }
    } else return shortlist();
    return shortlist(candidates);
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
        const artwork = await presentAchievements(this.ctx, this.domain, ACHIEVEMENT_CATALOG);
        const available = new Map(artwork.filter((item) => item.imageUrl).map((item) => [item.id, item]));
        // Unconfigured rewards keep their notification for a later visit after
        // upload, without blocking configured rewards behind the display limit.
        const pending = await getPendingAchievements(this.ctx, this.domain, this.user._id, 10, [...available.keys()]);
        this.response.body = { achievements: pending.map((item) => ({ ...available.get(item.id), ...item })), settled: true };
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
    let ownProgress: AchievementProgress;
    let wallThumbnails: string[] = [];
    const homeWall = template === 'main.html' && handler.user._id > 1 && handler.user.hasPriv(PRIV.PRIV_USER_PROFILE);
    const wallUid = homeWall ? handler.user._id : template === 'user_detail.html' ? handler.response.body.udoc?._id : undefined;
    if (wallUid !== undefined) {
        privateResponse(handler);
        try {
            const progress = await syncUserAchievements(handler.ctx, handler.domain, wallUid);
            if (wallUid === handler.user._id) ownProgress = progress;
            const earned = selectHighestAchievements(progress.filter((entry) => entry.unlocked));
            const items = await presentAchievements(handler.ctx, handler.domain, earned);
            wallThumbnails = items.map((item) => item.thumbnailUrl).filter(Boolean);
            handler.UiContext.achievementThumbnailPreload = wallThumbnails;
            handler.response.body.achievementWall = {
                items,
                total: ACHIEVEMENT_SERIES_COUNT, unlocked: earned.length,
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
    try {
        handler.UiContext.achievementSound = await presentAchievementSound(handler.ctx, handler.domain);
    } catch (error) {
        handler.UiContext.achievementSound = { soundUrl: '', volume: 70, enabled: false, filename: '' };
        logger.warn('Unable to load achievement sound: %o', error);
    }
    if (template === 'record_detail.html') {
        const rdoc = handler.response.body.rdoc;
        const timestamp = rdoc?._id?.getTimestamp?.()?.getTime() || 0;
        handler.UiContext.achievementRecordId = String(rdoc?._id || '');
        handler.UiContext.achievementLive = rdoc?.uid === handler.user._id && !handler.response.body.isPretestRecord
            && !rdoc?.contest?.toString().startsWith('0'.repeat(23)) && !handler.request.query.rev
            && timestamp <= Date.now() && Date.now() - timestamp < 30 * 60_000;
    }
    if (template !== 'record_detail.html' || handler.UiContext.achievementLive) {
        try {
            // Problem/home rendering already needs full progress for predictions.
            // On quiz and record pages read only the stored grants and lifetime points.
            const progress = ownProgress ?? (template === 'problem_detail.html'
                ? await syncUserAchievements(handler.ctx, handler.domain, handler.user._id)
                : await getStoredAchievementArtProgress(handler.ctx, handler.domain, handler.user._id));
            const artwork = await presentAchievements(handler.ctx, handler.domain, ACHIEVEMENT_CATALOG);
            const candidates = await nextAchievementImages(handler, progress, artwork);
            handler.UiContext.achievementImagePreload = candidates.map((item) => item.imageUrl);
            handler.UiContext.achievementThumbnailPreload = [...new Set([
                ...wallThumbnails, ...candidates.map((item) => item.thumbnailUrl).filter(Boolean),
            ])];
        } catch (error) {
            logger.warn('Unable to predict achievement images: %o', error);
        }
    }
    privateResponse(handler);
}

export async function apply(ctx: Context) {
    await applyAchievementHooks(ctx);
    ctx.Route('achievement_manage', '/manage/achievement', AchievementManageHandler);
    ctx.Route('domain_achievement_manage', '/domain/achievement', AchievementManageHandler);
    ctx.Route('achievement_image', '/achievement/:id/image', AchievementImageHandler);
    ctx.Route('achievement_sound', '/achievement/sound', AchievementSoundHandler);
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
