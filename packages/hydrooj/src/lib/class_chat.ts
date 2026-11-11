export const CHAT_QUOTA_BYTES = 50 * 1024 * 1024;
export const CHAT_FILE_BYTES = 10 * 1024 * 1024;
export const CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
export const CHAT_TEXT_BYTES = 16 * 1024;
export const CHAT_CODE_BYTES = 256 * 1024;
export const CHAT_PAGE_SIZE = 50;

export class ClassChatError extends Error {
    constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function chatUid(value: unknown) {
    const uid = Number(value);
    if (!Number.isSafeInteger(uid) || uid <= 1) throw new ClassChatError('INVALID_PEER', '请选择一位老师或学员。');
    return uid;
}

export function chatId(value: unknown) {
    if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) throw new ClassChatError('INVALID_MESSAGE', '消息已不存在。', 404);
    return value;
}

export function validateChatSend(value: any) {
    if (!value || typeof value !== 'object' || typeof value.clientId !== 'string'
        || !/^[a-zA-Z0-9_-]{8,96}$/.test(value.clientId)) throw new ClassChatError('INVALID_MESSAGE', '请重新发送这条消息。');
    if (value.text !== undefined && typeof value.text !== 'string') throw new ClassChatError('INVALID_TEXT', '消息内容不正确。');
    const text = (value.text || '').trim();
    if (Buffer.byteLength(text) > CHAT_TEXT_BYTES) throw new ClassChatError('TEXT_TOO_LONG', '文字较长，请分成几条发送。');
    if (value.snapshot !== undefined && (!value.snapshot || typeof value.snapshot !== 'object'
        || typeof value.snapshot.code !== 'string' || Buffer.byteLength(value.snapshot.code) > CHAT_CODE_BYTES
        || typeof value.snapshot.lang !== 'string' || value.snapshot.lang.length > 64
        || typeof value.snapshot.domainId !== 'string' || value.snapshot.domainId.length > 128
        || !['string', 'number'].includes(typeof value.snapshot.pid))) {
        throw new ClassChatError('INVALID_SNAPSHOT', '题目与代码过大或不完整，请重新打开题目后发送。');
    }
    return { text, clientId: value.clientId as string, snapshot: value.snapshot };
}

export function chatFilename(value: unknown) {
    return String(value || '文件').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || '文件';
}

/** Only passive, byte-identified raster images may be displayed inline. */
export function chatImageMime(bytes: Buffer) {
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
    if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
}

export function chatPreview(message: { kind: string, text: string, snapshot?: { title: string }, attachment?: { name: string } }) {
    if (message.kind === 'snapshot') return `题目与代码 · ${message.snapshot?.title || '学习题目'}`;
    if (message.kind === 'solution') return `老师讲解 · ${message.snapshot?.title || '学习题目'}`;
    if (message.kind === 'image') return '[图片]';
    if (message.kind === 'file') return `[文件] ${message.attachment?.name || ''}`.slice(0, 100);
    return message.text.slice(0, 100);
}

export function rewriteChatProblemMedia(content: string, pid: number, filenames: string[], makeUrl: (name: string) => string) {
    const allowed = new Set(filenames);
    // Match the same file:// references as normal problem rendering, and its relative-file output.
    return content.replace(/file:\/\/([^ \n)\\"]+)|\.\/(\d+)\/file\/([^ \n)\\"]+)/g, (whole, file, relativePid, relativeFile) => {
        if (!file && Number(relativePid) !== pid) return whole;
        const source = file || relativeFile;
        let filename = source.split('?')[0];
        try { filename = decodeURIComponent(filename); } catch { return whole; }
        return allowed.has(filename) ? makeUrl(filename) : whole;
    });
}
