/** Classroom media is live-only: bounded JPEG camera frames and 16 kHz μ-law audio. */
export const LESSON_LEASE_MS = 45_000;
export const LESSON_JOIN_MS = 120_000;
export const LESSON_MAX_MESSAGE_BYTES = 258 * 1024;
export const LESSON_VIDEO_MAX_LENGTH = 262144;
export const LESSON_MEDIA_MAX_AGE_MS = 600;

export class LessonError extends Error {
    constructor(public code: string, message: string) { super(message); }
}

export function lessonId(value: unknown): value is string {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(value);
}

function validJpeg(value: string) {
    const prefix = 'data:image/jpeg;base64,';
    if (!value.startsWith(prefix) || value.length > LESSON_VIDEO_MAX_LENGTH) return false;
    const encoded = value.slice(prefix.length);
    if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return false;
    const data = Buffer.from(encoded, 'base64');
    if (data.toString('base64') !== encoded || data.length < 12 || data[0] !== 0xff || data[1] !== 0xd8
        || data[data.length - 2] !== 0xff || data[data.length - 1] !== 0xd9) return false;
    // Bound decoded dimensions as well as compressed bytes; never forward image bombs.
    let offset = 2;
    while (offset + 3 < data.length) {
        if (data[offset++] !== 0xff) return false;
        while (data[offset] === 0xff) offset++;
        const marker = data[offset++];
        if (marker === 0xda || marker === 0xd9) return false;
        if (marker >= 0xd0 && marker <= 0xd7) continue;
        if (offset + 2 > data.length) return false;
        const length = data.readUInt16BE(offset);
        if (length < 2 || offset + length > data.length) return false;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
            if (length < 8) return false;
            const height = data.readUInt16BE(offset + 3); const width = data.readUInt16BE(offset + 5);
            return width > 0 && height > 0 && width <= 1280 && height <= 720;
        }
        offset += length;
    }
    return false;
}

export function validateLessonMessage(value: any) {
    const invalid = () => { throw new LessonError('INVALID_MESSAGE', '课堂消息格式不正确。'); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    const fields: Record<string, string[]> = {
        join: ['type', 'lessonId', 'tabId'], pulse: ['type'],
        video: ['type', 'lessonId', 'seq', 'data'], audio: ['type', 'lessonId', 'seq', 'data'],
    };
    if (!Object.hasOwn(fields, value.type) || Object.keys(value).some((key) => !fields[value.type].includes(key))) invalid();
    if (value.type === 'join' && (!lessonId(value.lessonId) || !lessonId(value.tabId))) invalid();
    if (['video', 'audio'].includes(value.type) && (!lessonId(value.lessonId) || !Number.isSafeInteger(value.seq)
        || value.seq < 0 || typeof value.data !== 'string')) invalid();
    if (value.type === 'video' && !validJpeg(value.data)) invalid();
    if (value.type === 'audio' && (value.data.length !== 856 || !/^[A-Za-z0-9+/]{854}==$/.test(value.data)
        || Buffer.from(value.data, 'base64').length !== 640 || Buffer.from(value.data, 'base64').toString('base64') !== value.data)) invalid();
}

/** Separate budgets keep a camera burst from delaying audio and heartbeat. */
export class LessonRateLimit {
    private audio = { tokens: 8, at: 0 };
    private video = { tokens: 3, at: 0 };
    private bytes = { tokens: 512 * 1024, at: 0 };
    private controls: number[] = [];
    accept(type: string, length = 0, now = Date.now()) {
        if (type === 'audio' || type === 'video') {
            const bucket = this[type]; const rate = type === 'audio' ? .03 : .04;
            bucket.tokens = Math.min(type === 'audio' ? 8 : 3, bucket.tokens + Math.max(0, now - bucket.at) * rate);
            bucket.at = now;
            if (bucket.tokens < 1) return false;
            if (type === 'video') {
                this.bytes.tokens = Math.min(512 * 1024, this.bytes.tokens + Math.max(0, now - this.bytes.at) * (3 * 1024 * 1024 / 1000));
                this.bytes.at = now;
                if (this.bytes.tokens < length) return false;
                this.bytes.tokens -= length;
            }
            bucket.tokens--;
            return true;
        }
        this.controls = this.controls.filter((at) => now - at < 10000);
        if (this.controls.length >= 35) throw new LessonError('RATE_LIMIT', '操作太快，请稍后重试。');
        this.controls.push(now); return true;
    }
}
