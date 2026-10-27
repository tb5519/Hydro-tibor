import { createHash, randomBytes } from 'crypto';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import type { Context } from '../context';
import { ValidationError } from '../error';
import type { DomainDoc } from '../interface';
import storage from '../model/storage';
import { ACHIEVEMENT_CATALOG } from './achievement_catalog';
import { getAchievementScope } from './achievement';
import { createAchievementThumbnail } from './achievement_image_worker';
import assetStorage from './asset_storage';

export const ACHIEVEMENT_IMAGE_LIMIT = 8 * 1024 * 1024;
export const ACHIEVEMENT_CATEGORY_NAMES = {
    difficulty: '初次突破', solved: '解题里程碑', contest_ak: '全场制霸',
    contest_ac: '赛场征程', points: '星光积累', mastery: '难度专精', streak: '连续 AC', weekly_ac: '七日冲刺',
};

type AchievementDomain = Pick<DomainDoc, '_id' | 'workspaceId'>;
interface Artwork {
    _id: string;
    scope: string;
    achievementId: string;
    imagePath?: string;
    thumbnailPath?: string;
    version?: string;
}

function images(ctx: Context) { return (ctx.db as any).collection('achievement.image'); }
function imageKey(domain: AchievementDomain, id: string) { return `${getAchievementScope(domain)}/${id}`; }
let imageQueue: Promise<unknown> = Promise.resolve();
let queuedImages = 0;

async function thumbnailFor(bytes: Buffer) {
    if (queuedImages >= 8) throw new Error('Achievement image processing is busy');
    queuedImages++;
    const job = imageQueue.then(() => createAchievementThumbnail(bytes));
    imageQueue = job.catch(() => {}).finally(() => { queuedImages--; });
    return job;
}

export function achievementDefinition(id: unknown) {
    const definition = ACHIEVEMENT_CATALOG.find((entry) => entry.id === id);
    if (!definition) throw new ValidationError('id', null, '请选择有效的成就。');
    return definition;
}

export async function getAchievementArtwork(ctx: Context, domain: AchievementDomain, id: string): Promise<Artwork | null> {
    achievementDefinition(id);
    return images(ctx).findOne({ _id: imageKey(domain, id), scope: getAchievementScope(domain) });
}

export async function presentAchievements(ctx: Context, domain: AchievementDomain, entries: readonly any[]) {
    const scope = getAchievementScope(domain);
    const artwork: Artwork[] = await images(ctx).find({ scope }).toArray();
    const byId = new Map(artwork.map((entry) => [entry.achievementId, entry]));
    return entries.map((entry) => {
        const art = byId.get(entry.id);
        const base = `/d/${encodeURIComponent(domain._id)}/achievement/${encodeURIComponent(entry.id)}/image`;
        const version = encodeURIComponent(art?.version || '');
        return {
            ...entry, categoryLabel: ACHIEVEMENT_CATEGORY_NAMES[entry.category] || entry.category,
            imageUrl: art?.imagePath ? `${base}?v=${version}` : '',
            thumbnailUrl: art?.thumbnailPath ? `${base}?size=384&v=${version}` : '',
        };
    });
}

/** Validate and resize off the event loop, using the same transparent PNG pipeline as AC artwork. */
export async function prepareAchievementImage(file: any) {
    const invalid = () => new ValidationError('image', null, '请上传有效的 PNG 图片，大小不超过 8 MB。');
    if (!file?.filepath || !file.size || file.size > ACHIEVEMENT_IMAGE_LIMIT
        || path.extname(file.originalFilename || '').toLowerCase() !== '.png') throw invalid();
    try {
        const info = await stat(file.filepath);
        if (!info.isFile() || info.size <= 0 || info.size > ACHIEVEMENT_IMAGE_LIMIT) throw invalid();
        const original = await readFile(file.filepath);
        const thumbnail = await thumbnailFor(original);
        return { original, thumbnail };
    } catch { throw invalid(); }
}

/** Both originals and thumbnails are primary objects; no full-size image is used in the wall. */
export async function setAchievementImage(ctx: Context, domain: AchievementDomain, id: string, file: any, owner: number) {
    achievementDefinition(id);
    const bytes = await prepareAchievementImage(file);
    const scope = getAchievementScope(domain);
    const version = randomBytes(16).toString('hex');
    const scopeHash = createHash('sha256').update(scope).digest('hex').slice(0, 32);
    const prefix = `achievement/${scopeHash}/${id}/${version}`;
    const imagePath = `${prefix}.png`;
    const thumbnailPath = `${prefix}-384.png`;
    if (!assetStorage.shouldStore(imagePath, 'image/png')) {
        throw new ValidationError('image', null, '成就图片需要已启用的对象存储，请先检查对象存储配置。');
    }
    const uploaded: string[] = [];
    let writeStarted = false;
    let old: Artwork | null;
    try {
        await storage.put(imagePath, bytes.original, owner, { remoteOnly: true });
        uploaded.push(imagePath);
        await storage.put(thumbnailPath, bytes.thumbnail, owner, { remoteOnly: true });
        uploaded.push(thumbnailPath);
        writeStarted = true;
        // Return the replaced version atomically: simultaneous edits cannot retire the winner's artwork.
        old = await images(ctx).findOneAndUpdate({ _id: imageKey(domain, id) }, {
            $set: { scope, achievementId: id, imagePath, thumbnailPath, version, updatedAt: new Date(), updatedBy: owner },
        }, { upsert: true, returnDocument: 'before' });
    } catch (error) {
        let disposable = uploaded;
        if (writeStarted) {
            try {
                const current = await getAchievementArtwork(ctx, domain, id);
                disposable = uploaded.filter((item) => item !== current?.imagePath && item !== current?.thumbnailPath);
            } catch { disposable = []; }
        }
        if (disposable.length) await storage.del(disposable, owner).catch(() => {});
        throw error;
    }
    const obsolete = [old?.imagePath, old?.thumbnailPath].filter(Boolean) as string[];
    if (obsolete.length) await storage.del(obsolete, owner).catch(() => {});
}

export async function removeAchievementImage(ctx: Context, domain: AchievementDomain, id: string, owner: number) {
    achievementDefinition(id);
    const old: Artwork | null = await images(ctx).findOneAndUpdate({ _id: imageKey(domain, id) }, {
        $unset: { imagePath: '', thumbnailPath: '', version: '' },
        $set: { updatedAt: new Date(), updatedBy: owner },
    }, { returnDocument: 'before' });
    const obsolete = [old?.imagePath, old?.thumbnailPath].filter(Boolean) as string[];
    if (obsolete.length) await storage.del(obsolete, owner).catch(() => {});
}
