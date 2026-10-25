import { createHash, randomBytes } from 'crypto';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import type { Context } from '../context';
import { ValidationError } from '../error';
import type { DomainDoc } from '../interface';
import storage from '../model/storage';
import { getAchievementScope } from './achievement';
import assetStorage from './asset_storage';

export const ACHIEVEMENT_SOUND_LIMIT = 8 * 1024 * 1024;
const SOUND_TYPES = { '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
type AchievementDomain = Pick<DomainDoc, '_id' | 'workspaceId'>;
interface AchievementSound {
    _id: string;
    scope: string;
    soundPath?: string;
    contentType?: string;
    version?: string;
    filename?: string;
    volume?: number;
    enabled?: boolean;
}

function sounds(ctx: Context) { return (ctx.db as any).collection('achievement.sound'); }

function validWav(bytes: Buffer) {
    if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE'
        || bytes.readUInt32LE(4) + 8 > bytes.length) return false;
    const end = bytes.readUInt32LE(4) + 8;
    let format = false; let data = false;
    for (let offset = 12; offset + 8 <= end;) {
        const kind = bytes.toString('ascii', offset, offset + 4);
        const length = bytes.readUInt32LE(offset + 4);
        if (offset + 8 + length > end) return false;
        if (kind === 'fmt ') format = length >= 16 && bytes.readUInt16LE(offset + 8) > 0
            && bytes.readUInt16LE(offset + 10) > 0 && bytes.readUInt32LE(offset + 12) > 0;
        if (kind === 'data' && length > 0) data = true;
        offset += 8 + length + (length % 2);
    }
    return format && data;
}

function validMp3(bytes: Buffer) {
    let offset = 0;
    if (bytes.toString('ascii', 0, 3) === 'ID3') {
        if (bytes.length < 10 || bytes[3] < 2 || bytes[3] > 4 || bytes.subarray(6, 10).some((value) => value > 127)) return false;
        offset = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
        if (bytes[3] === 4 && (bytes[5] & 0x10)) offset += 10;
    }
    // Require complete MPEG layer III frames, not merely an ID3 tag or a file extension.
    let frames = 0;
    while (offset + 4 <= bytes.length && frames < 2) {
        const header = bytes.readUInt32BE(offset);
        const version = (header >>> 19) & 3;
        const bitrateIndex = (header >>> 12) & 15;
        const sampleIndex = (header >>> 10) & 3;
        if ((header >>> 21) !== 0x7ff || version === 1 || ((header >>> 17) & 3) !== 1
            || !bitrateIndex || bitrateIndex === 15 || sampleIndex === 3) return false;
        const bitrate = (version === 3
            ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
            : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrateIndex];
        const sampleRate = [44100, 48000, 32000][sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
        const length = Math.floor((version === 3 ? 144000 : 72000) * bitrate / sampleRate) + ((header >>> 9) & 1);
        if (offset + length > bytes.length) return false;
        offset += length; frames++;
    }
    return frames > 0;
}

function validOgg(bytes: Buffer) {
    if (bytes.length < 35 || bytes.toString('ascii', 0, 4) !== 'OggS' || bytes[4] !== 0 || !(bytes[5] & 2)) return false;
    const segments = bytes[26];
    if (!segments || bytes.length < 27 + segments) return false;
    const length = bytes.subarray(27, 27 + segments).reduce((sum, value) => sum + value, 0);
    const start = 27 + segments;
    if (start + length > bytes.length) return false;
    const opus = length >= 19 && bytes.toString('ascii', start, start + 8) === 'OpusHead' && bytes[start + 9] > 0;
    const vorbis = length >= 30 && bytes[start] === 1 && bytes.toString('ascii', start + 1, start + 7) === 'vorbis'
        && bytes[start + 11] > 0 && bytes.readUInt32LE(start + 12) > 0;
    if (!opus && !vorbis) return false;
    let packets = 0;
    for (let offset = 0; offset < bytes.length;) {
        if (offset + 27 > bytes.length || bytes.toString('ascii', offset, offset + 4) !== 'OggS' || bytes[offset + 4] !== 0) return false;
        const count = bytes[offset + 26];
        if (offset + 27 + count > bytes.length) return false;
        const sizes = bytes.subarray(offset + 27, offset + 27 + count);
        const end = offset + 27 + count + sizes.reduce((sum, value) => sum + value, 0);
        if (end > bytes.length) return false;
        packets += sizes.filter((value) => value < 255).length;
        offset = end;
    }
    return packets >= (opus ? 3 : 4); // Codec headers alone are not a playable sound.
}

function mp4Boxes(bytes: Buffer, start = 0, end = bytes.length) {
    const boxes: { type: string; start: number; end: number }[] = [];
    while (start < end) {
        if (start + 8 > end) throw new Error('Truncated audio container');
        let length = bytes.readUInt32BE(start); let header = 8;
        if (length === 1) {
            if (start + 16 > end) throw new Error('Truncated audio container');
            length = Number(bytes.readBigUInt64BE(start + 8)); header = 16;
        } else if (length === 0) length = end - start;
        if (!Number.isSafeInteger(length) || length < header || start + length > end) throw new Error('Invalid audio container');
        boxes.push({ type: bytes.toString('ascii', start + 4, start + 8), start: start + header, end: start + length });
        start += length;
    }
    return boxes;
}

function validM4a(bytes: Buffer) {
    const boxes = mp4Boxes(bytes);
    const fileType = boxes[0];
    const movie = boxes.find((box) => box.type === 'moov');
    if (fileType?.type !== 'ftyp' || fileType.end - fileType.start < 8 || !movie
        || !boxes.some((box) => box.type === 'mdat' && box.end > box.start)) return false;
    // Read the actual track handler instead of trusting an .m4a extension on an arbitrary MP4.
    return mp4Boxes(bytes, movie.start, movie.end).filter((box) => box.type === 'trak').some((track) => (
        mp4Boxes(bytes, track.start, track.end).filter((box) => box.type === 'mdia').some((media) => (
            mp4Boxes(bytes, media.start, media.end).some((box) => box.type === 'hdlr' && box.end - box.start >= 12
                && bytes.toString('ascii', box.start + 8, box.start + 12) === 'soun')
        ))
    ));
}

export function validateAchievementSound(bytes: Buffer, ext: string) {
    const invalid = () => new ValidationError('sound', null, '请上传有效的 MP3、OGG、WAV 或 M4A 音频，大小不超过 8 MB。');
    try {
        const validator = { '.mp3': validMp3, '.ogg': validOgg, '.wav': validWav, '.m4a': validM4a }[ext];
        if (!bytes.length || bytes.length > ACHIEVEMENT_SOUND_LIMIT || !validator?.(bytes)) throw invalid();
    } catch { throw invalid(); }
}

export async function prepareAchievementSound(file: any) {
    const invalid = () => new ValidationError('sound', null, '请上传有效的 MP3、OGG、WAV 或 M4A 音频，大小不超过 8 MB。');
    const ext = path.extname(file?.originalFilename || '').toLowerCase();
    if (!file?.filepath || !Number.isFinite(file.size) || file.size <= 0 || file.size > ACHIEVEMENT_SOUND_LIMIT || !SOUND_TYPES[ext]) throw invalid();
    try {
        const info = await stat(file.filepath);
        if (!info.isFile() || info.size <= 0 || info.size > ACHIEVEMENT_SOUND_LIMIT) throw invalid();
        const bytes = await readFile(file.filepath);
        validateAchievementSound(bytes, ext);
        const filename = path.basename(file.originalFilename.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200);
        return { bytes, ext, contentType: SOUND_TYPES[ext], filename };
    } catch { throw invalid(); }
}

export async function getAchievementSound(ctx: Context, domain: AchievementDomain): Promise<AchievementSound | null> {
    const scope = getAchievementScope(domain);
    return sounds(ctx).findOne({ _id: scope, scope });
}

export async function presentAchievementSound(ctx: Context, domain: AchievementDomain) {
    const sound = await getAchievementSound(ctx, domain);
    return {
        soundUrl: sound?.soundPath ? `/d/${encodeURIComponent(domain._id)}/achievement/sound?v=${encodeURIComponent(sound.version || '')}` : '',
        volume: Number.isInteger(sound?.volume) && sound.volume >= 0 && sound.volume <= 100 ? sound.volume : 70,
        enabled: sound?.enabled !== false,
        filename: sound?.soundPath ? sound.filename || '' : '',
    };
}

export async function setAchievementSound(ctx: Context, domain: AchievementDomain, file: any, owner: number) {
    const prepared = await prepareAchievementSound(file);
    const scope = getAchievementScope(domain);
    const scopeHash = createHash('sha256').update(scope).digest('hex').slice(0, 32);
    const version = randomBytes(16).toString('hex');
    const soundPath = `achievement/${scopeHash}/sound/${version}${prepared.ext}`;
    if (!assetStorage.shouldStore(soundPath, prepared.contentType)) {
        throw new ValidationError('sound', null, '成就音效需要已启用的对象存储，请先检查对象存储配置。');
    }
    let uploaded = false; let writeStarted = false; let old: AchievementSound | null;
    try {
        await storage.put(soundPath, prepared.bytes, owner, { remoteOnly: true });
        uploaded = true; writeStarted = true;
        old = await sounds(ctx).findOneAndUpdate({ _id: scope }, {
            $set: { scope, soundPath, version, contentType: prepared.contentType, filename: prepared.filename,
                enabled: true, updatedAt: new Date(), updatedBy: owner },
            $setOnInsert: { volume: 70 },
        }, { upsert: true, returnDocument: 'before' });
    } catch (error) {
        let disposable = uploaded;
        if (writeStarted) {
            try { disposable = (await getAchievementSound(ctx, domain))?.soundPath !== soundPath; } catch { disposable = false; }
        }
        if (disposable) await storage.del([soundPath], owner).catch(() => {});
        throw error;
    }
    if (old?.soundPath) await storage.del([old.soundPath], owner).catch(() => {});
}

export async function removeAchievementSound(ctx: Context, domain: AchievementDomain, owner: number) {
    const scope = getAchievementScope(domain);
    const old: AchievementSound | null = await sounds(ctx).findOneAndUpdate({ _id: scope, scope }, {
        $unset: { soundPath: '', contentType: '', filename: '', version: '' },
        $set: { updatedAt: new Date(), updatedBy: owner },
    }, { returnDocument: 'before' });
    if (old?.soundPath) await storage.del([old.soundPath], owner).catch(() => {});
}

export async function saveAchievementSound(ctx: Context, domain: AchievementDomain, volume: number, enabled: boolean, owner: number) {
    if (!Number.isInteger(volume) || volume < 0 || volume > 100) throw new ValidationError('volume', null, '音量应为 0 到 100 的整数。');
    if (typeof enabled !== 'boolean') throw new ValidationError('enabled');
    const scope = getAchievementScope(domain);
    await sounds(ctx).updateOne({ _id: scope }, {
        $set: { scope, volume, enabled, updatedAt: new Date(), updatedBy: owner },
    }, { upsert: true });
}
