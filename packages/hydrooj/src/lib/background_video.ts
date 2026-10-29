import { randomUUID } from 'crypto';
import { open, stat } from 'fs/promises';
import { extname } from 'path';
import { ValidationError, NotFoundError } from '../error';
import storage from '../model/storage';
import { tryRedirectAsset } from './asset_delivery';
import assetStorage from './asset_storage';
import {
    BACKGROUND_POSTER_MAX_SIZE, BACKGROUND_VIDEO_MAX_SIZE, backgroundVideoMediaType, isBackgroundVideoPrefix,
} from './background_video_path';

export { BACKGROUND_VIDEO_MAX_SIZE, isBackgroundVideoPath } from './background_video_path';
interface Upload { filepath: string; originalFilename?: string; size?: number }

async function uploadHeader(file: Upload, maxBytes: number) {
    if (!file?.filepath) throw new ValidationError('file', null, '请选择视频，并等待首帧生成。');
    const info = await stat(file.filepath);
    if (!info.isFile() || info.size < 12 || info.size > maxBytes) {
        throw new ValidationError('file', null, `文件大小必须在 ${Math.round(maxBytes / 1024 / 1024)} MB 以内。`);
    }
    const handle = await open(file.filepath, 'r');
    try {
        const bytes = Buffer.alloc(Math.min(info.size, 4096));
        await handle.read(bytes, 0, bytes.length, 0);
        return bytes;
    } finally { await handle.close(); }
}

/** Videos never fall back to the website's local storage, including during a config change. */
export async function storeBackgroundVideo(file: Upload, poster: Upload, owner: number, prefix: string) {
    if (!isBackgroundVideoPrefix(prefix)) throw new ValidationError('video', null, '无效的视频背景位置。');
    const extension = extname(file?.originalFilename || '').toLowerCase();
    const video = await uploadHeader(file, BACKGROUND_VIDEO_MAX_SIZE);
    const mp4 = extension === '.mp4' && video.toString('ascii', 4, 8) === 'ftyp'
        && /(?:isom|iso[2-9]|mp4[12]|avc1|M4V |dash)/.test(video.toString('ascii', 8, 80));
    const webm = extension === '.webm' && video.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        && video.subarray(0, 1024).includes(Buffer.from('webm'));
    if (!mp4 && !webm) throw new ValidationError('file', null, '请上传浏览器可播放的 MP4 或 WebM 视频。');
    const frame = await uploadHeader(poster, BACKGROUND_POSTER_MAX_SIZE);
    if (frame[0] !== 0xff || frame[1] !== 0xd8 || frame[2] !== 0xff) {
        throw new ValidationError('poster', null, '视频首帧无效，请重新选择视频。');
    }
    const stamp = `${Date.now()}-${randomUUID()}`;
    const videoPath = `${prefix}-${stamp}${extension}`;
    const videoPosterPath = `${prefix}-poster-${stamp}.jpg`;
    try {
        await storage.put(videoPath, file.filepath, owner, { remoteOnly: true });
        await storage.put(videoPosterPath, poster.filepath, owner, { remoteOnly: true });
    } catch (error) {
        await storage.del([videoPath, videoPosterPath], owner).catch(() => undefined);
        throw error;
    }
    return { videoPath, videoPosterPath, videoUpdatedAt: new Date().toISOString() };
}

export async function deleteBackgroundVideo(paths: string[], owner: number) {
    const valid = paths.filter((path) => !!backgroundVideoMediaType(path));
    if (valid.length) await storage.del(valid, owner);
}

/** Resolve stored server-owned metadata to CDN/OSS. Never load/stream the media through Hydro. */
export async function redirectBackgroundVideo(handler: any, path: string, version = '', publicHomepage = false) {
    const type = backgroundVideoMediaType(path);
    if (!type) throw new NotFoundError(path);
    const meta = await storage.getMeta(path);
    const limit = type === 'image/jpeg' ? BACKGROUND_POSTER_MAX_SIZE : BACKGROUND_VIDEO_MAX_SIZE;
    if (!meta?.remoteAsset || meta['Content-Type'] !== type || meta.remoteAsset.contentType !== type
        || meta.size < 1 || meta.size > limit || meta.remoteAsset.size !== meta.size) throw new NotFoundError(path);
    handler.response.type = 'application/json';
    handler.response.addHeader('X-Content-Type-Options', 'nosniff');
    handler.response.addHeader('Referrer-Policy', 'no-referrer');
    // Only the public homepage handlers opt into the immutable public copy.
    // An unavailable copy is queued and falls back to the original signed URL.
    const publicCopy = publicHomepage && tryRedirectAsset(handler, { path, meta, decoration: 'home-video' });
    if (!publicCopy && !tryRedirectAsset(handler, { path, meta })) {
        handler.response.redirect = await assetStorage.signDownloadLink(meta.remoteAsset);
        handler.response.status = 302;
    }
    // Only an exact version may be cached. Public content-addressed copies can
    // last a year; signed fallbacks and protected backgrounds stay below their
    // signature validity and are isolated by the viewer's credentials.
    const method = `${handler.request?.method || ''}`.toLowerCase();
    const cacheable = ['get', 'head'].includes(method) && typeof version === 'string' && version.length > 0
        && version.length <= 200 && !/[\u0000-\u001f]/.test(version) && handler.request?.query?.v === version;
    handler.response.addHeader('Cache-Control', cacheable
        ? publicCopy ? 'public, max-age=31536000, immutable' : 'private, max-age=300'
        : 'private, no-store');
    if (!publicCopy) handler.response.addHeader('Vary', 'Cookie, Authorization');
}
