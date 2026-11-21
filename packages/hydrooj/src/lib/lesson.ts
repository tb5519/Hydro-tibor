/** Classroom media is live-only: bounded JPEG camera/screen frames and 16 kHz μ-law audio. */
export const LESSON_LEASE_MS = 45_000;
export const LESSON_JOIN_MS = 120_000;
export const LESSON_MAX_MESSAGE_BYTES = 258 * 1024;
export const LESSON_VIDEO_MAX_LENGTH = 262144;
export const LESSON_MEDIA_MAX_AGE_MS = 600;
export const LESSON_NOTIFICATION_MAX_MESSAGE_BYTES = 1024;

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
        video: ['type', 'lessonId', 'seq', 'data', 'ticket'],
        'camera-window': ['type', 'lessonId', 'seq', 'level', 'seen'], audio: ['type', 'lessonId', 'seq', 'data', 'ticket'],
        'screen-window': ['type', 'lessonId', 'seq', 'level', 'seen'],
        screen: ['type', 'lessonId', 'seq', 'data', 'ticket'],
        'screen-view': ['type', 'lessonId', 'watching', 'flow'], 'screen-state': ['type', 'lessonId', 'state', 'flow'],
    };
    if (!Object.hasOwn(fields, value.type) || Object.keys(value).some((key) => !fields[value.type].includes(key))) invalid();
    if (value.type === 'join' && (!lessonId(value.lessonId) || !lessonId(value.tabId))) invalid();
    if (['camera-window', 'screen-window'].includes(value.type) && (!lessonId(value.lessonId) || !Number.isSafeInteger(value.seq) || value.seq <= 0
        || !Number.isInteger(value.level) || value.level < 0 || value.level > 3
        || (value.seen !== undefined && (!Number.isSafeInteger(value.seen) || value.seen < 0)))) invalid();
    if (value.ticket !== undefined && (!Number.isSafeInteger(value.ticket) || value.ticket <= 0)) invalid();
    if (value.flow !== undefined && (value.flow !== true || !(value.watching === true || value.state === 'sharing'))) invalid();
    if (['screen-view', 'screen-state'].includes(value.type) && !lessonId(value.lessonId)) invalid();
    if (value.type === 'screen-view' && typeof value.watching !== 'boolean') invalid();
    if (value.type === 'screen-state' && !['sharing', 'stopped', 'declined'].includes(value.state)) invalid();
    if (['video', 'audio', 'screen'].includes(value.type) && (!lessonId(value.lessonId) || !Number.isSafeInteger(value.seq)
        || value.seq < 0 || typeof value.data !== 'string')) invalid();
    if (['video', 'screen'].includes(value.type) && !validJpeg(value.data)) invalid();
    if (value.type === 'audio' && (value.data.length !== 856 || !/^[A-Za-z0-9+/]{854}==$/.test(value.data)
        || Buffer.from(value.data, 'base64').length !== 640 || Buffer.from(value.data, 'base64').toString('base64') !== value.data)) invalid();
}

/** Account notifications never accept a media join, recipient or room ID. */
export function validateLessonNotificationMessage(value: any) {
    const invalid = () => { throw new LessonError('INVALID_MESSAGE', '课堂通知消息格式不正确。'); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    const fields = value.type === 'subscribe' ? ['type', 'expectedUid'] : value.type === 'pulse' ? ['type'] : null;
    if (!fields || Object.keys(value).some((key) => !fields.includes(key))) invalid();
    if (value.type === 'subscribe' && (!Number.isSafeInteger(value.expectedUid) || value.expectedUid <= 1)) invalid();
}

/** Separate budgets keep a camera burst from delaying audio and heartbeat. */
export class LessonRateLimit {
    private audio = { tokens: 8, at: 0 };
    private video = { tokens: 3, at: 0 };
    private bytes = { tokens: 512 * 1024, at: 0 };
    private screen = { tokens: 3, at: 0 };
    private screenBytes = { tokens: 512 * 1024, at: 0 };
    private lastWindow = { 'camera-window': -Infinity, 'screen-window': -Infinity };
    private controls: number[] = [];
    accept(type: string, length = 0, now = Date.now()) {
        if (type === 'camera-window' || type === 'screen-window') {
            if (now - this.lastWindow[type] < 125) return false;
            this.lastWindow[type] = now; return true;
        }
        if (type === 'audio' || type === 'video' || type === 'screen') {
            const bucket = this[type]; const rate = type === 'audio' ? .03 : type === 'screen' ? .012 : .04;
            bucket.tokens = Math.min(type === 'audio' ? 8 : 3, bucket.tokens + Math.max(0, now - bucket.at) * rate);
            bucket.at = now;
            if (bucket.tokens < 1) return false;
            if (type === 'video' || type === 'screen') {
                const bytes = type === 'screen' ? this.screenBytes : this.bytes;
                const byteRate = type === 'screen' ? 768 * 1024 : 3 * 1024 * 1024;
                bytes.tokens = Math.min(512 * 1024, bytes.tokens + Math.max(0, now - bytes.at) * byteRate / 1000);
                bytes.at = now;
                if (bytes.tokens < length) return false;
                bytes.tokens -= length;
            }
            bucket.tokens--;
            return true;
        }
        this.controls = this.controls.filter((at) => now - at < 10000);
        if (this.controls.length >= 35) throw new LessonError('RATE_LIMIT', '操作太快，请稍后重试。');
        this.controls.push(now); return true;
    }
}
