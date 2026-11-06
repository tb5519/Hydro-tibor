/** Shared, dependency-free protocol checks. Never interpret a peer payload as HTML or execute it here. */
export const LIVE_SHARE_MAX_BYTES = 384 * 1024;
export const LIVE_SHARE_LEASE_MS = 45_000;
export const LIVE_SHARE_RECONNECT_MS = 120_000;
export const LIVE_SHARE_GRANT_MS = 12 * 60 * 60 * 1000;

export class LiveShareError extends Error {
    constructor(public code: string, message: string) { super(message); }
}

export function shareId(value: unknown): value is string {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(value);
}

/** Positive allowlist: account, administration, payments and arbitrary URLs are never shared. */
export function sharePage(value: unknown): { path: string; domainId?: string } | null {
    if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')
        || /[\\\u0000-\u001f]/.test(value)) return null;
    let url: URL;
    try { url = new URL(value, 'https://live-share.invalid'); } catch { return null; }
    if (url.origin !== 'https://live-share.invalid') return null;
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
    if (/[\\\u0000-\u001f]/.test(pathname) || pathname.includes('//')) return null;
    const match = /^\/d\/([^/]+)(\/.*)$/.exec(pathname);
    const path = match ? match[2] : pathname;
    const safe = path === '/' || /^\/(?:p|record|training|homework|contest|ranking|ide|mistakes|daily-quiz)\/?$/.test(path)
        || /^\/p\/[^/]+(?:\/submit|\/solution(?:\/[^/]+)?)?\/?$/.test(path)
        || /^\/(?:record|training|homework|contest)\/[a-zA-Z0-9_-]+(?:\/(?:scoreboard|code))?\/?$/.test(path);
    if (!safe) return null;
    for (const key of url.searchParams.keys()) {
        if (/password|passwd|secret|token|credential|auth|sid|reviewUid|mergedUid/i.test(key)) return null;
    }
    return { path: `${url.pathname}${url.search}`, domainId: match?.[1] };
}

export function checkShareOrigin(origin: unknown, host: string) {
    try {
        const source = typeof origin === 'string' ? new URL(origin) : null;
        if (!source || !['http:', 'https:'].includes(source.protocol) || source.host !== host
            || source.username || source.password) throw new Error();
    } catch { throw new LiveShareError('ORIGIN', '共享连接来源不正确，请刷新页面。'); }
}

export type ShareRole = 'teacher' | 'student';
export type ShareRelayKind = 'mirror' | 'editor' | 'command' | 'ack';

export function relayAllowed(role: ShareRole, kind: unknown) {
    return role === 'teacher' ? kind === 'editor' || kind === 'command' : ['mirror', 'editor', 'ack'].includes(String(kind));
}

/** Only appearance data crosses the connection; Monaco callbacks/options are never accepted. */
function validEditorAppearance(view: any) {
    const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
    const integer = (value: any, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;
    const checks: Record<string, (value: any) => boolean> = {
        wordWrap: (v) => ['off', 'on', 'wordWrapColumn', 'bounded'].includes(v),
        wordWrapColumn: (v) => integer(v, 1, 1073741824),
        tabSize: (v) => integer(v, 1, 2147483647),
        insertSpaces: (v) => typeof v === 'boolean',
        glyphMargin: (v) => typeof v === 'boolean',
        lineNumbers: (v) => ['on', 'off', 'relative', 'interval'].includes(v),
        lineNumbersMinChars: (v) => integer(v, 0, 300),
        lineDecorationsWidth: (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000)
            || (typeof v === 'string' && /^\d{1,3}(?:\.\d{1,2})?ch$/.test(v)),
        scrollBeyondLastLine: (v) => typeof v === 'boolean',
        letterSpacing: (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100,
        fontWeight: (v) => typeof v === 'string' && /^(?:normal|bold|[1-9]\d{0,2}|1000)$/.test(v),
        padding: (v) => object(v) && Object.entries(v).every(([key, value]) => ['top', 'bottom'].includes(key) && integer(value, 0, 1000)),
        minimap: (v) => {
            const options: Record<string, (value: any) => boolean> = {
                enabled: (x) => typeof x === 'boolean', renderCharacters: (x) => typeof x === 'boolean',
                side: (x) => ['left', 'right'].includes(x), size: (x) => ['proportional', 'fill', 'fit'].includes(x),
                showSlider: (x) => ['always', 'mouseover'].includes(x), maxColumn: (x) => integer(x, 1, 10000), scale: (x) => integer(x, 1, 10),
            };
            return object(v) && Object.entries(v).every(([key, value]) => Object.hasOwn(options, key) && options[key](value));
        },
    };
    return object(view) && Object.entries(view).every(([key, value]) => Object.hasOwn(checks, key) && checks[key](value));
}

function validEditorTheme(theme: any) {
    const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
    const color = (value: any) => typeof value === 'string' && /^#?(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
    if (!object(theme) || Object.keys(theme).some((key) => !['base', 'inherit', 'colors', 'rules', 'encodedTokensColors'].includes(key))
        || !['vs', 'vs-dark', 'hc-black', 'hc-light'].includes(theme.base) || typeof theme.inherit !== 'boolean'
        || !object(theme.colors) || Object.keys(theme.colors).length > 1024
        || !Object.entries(theme.colors).every(([key, value]) => /^[\w.\-]{1,128}$/.test(key) && color(value))
        || !Array.isArray(theme.rules) || theme.rules.length > 4096) return false;
    if (!theme.rules.every((rule: any) => object(rule) && typeof rule.token === 'string' && rule.token.length <= 256
        && Object.keys(rule).every((key) => ['token', 'foreground', 'background', 'fontStyle'].includes(key))
        && (rule.foreground === undefined || color(rule.foreground)) && (rule.background === undefined || color(rule.background))
        && (rule.fontStyle === undefined || (typeof rule.fontStyle === 'string' && rule.fontStyle.length <= 64
            && rule.fontStyle.split(' ').every((value: string) => ['', 'normal', 'italic', 'bold', 'underline', 'strikethrough'].includes(value)))))) return false;
    return theme.encodedTokensColors === undefined || (Array.isArray(theme.encodedTokensColors)
        && theme.encodedTokensColors.length <= 4096 && theme.encodedTokensColors.every(color));
}

export function validateRelayData(role: ShareRole, kind: ShareRelayKind, data: any, pageId: string) {
    const invalid = () => { throw new LiveShareError('INVALID_RELAY', '共享内容格式不正确。'); };
    const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 10_000_000;
    const short = (value: unknown, limit = 96) => typeof value === 'string' && value.length <= limit;
    if (kind === 'command') {
        if (!shareId(data.id) || data.pageId !== pageId || !Number.isSafeInteger(data.nodeId) || data.nodeId < 1
            || !['click', 'scroll', 'select', 'search'].includes(data.action)
            || (data.target !== undefined && !short(data.target, 32))
            || (data.value !== undefined && !short(data.value, 4096))
            || (data.x !== undefined && !finite(data.x)) || (data.y !== undefined && !finite(data.y))) invalid();
    } else if (kind === 'ack') {
        if (!shareId(data.id) || data.pageId !== pageId || typeof data.ok !== 'boolean'
            || (data.reason !== undefined && !short(data.reason, 512))) invalid();
    } else if (kind === 'editor') {
        const allowed = role === 'teacher' ? ['edit:update', 'edit:cursor', 'edit:sync', 'edit:scroll']
            : ['edit:init', 'edit:layout', 'edit:remove', 'edit:update', 'edit:cursor', 'edit:ack'];
        if (!allowed.includes(data.type) || data.pageId !== pageId || !short(data.editorId, 128)
            || (!data.editorId && data.type !== 'edit:sync')) invalid();
        for (const key of ['update', 'state', 'anchor', 'head']) {
            if (data[key] !== undefined && (!short(data[key], 320 * 1024) || !/^[a-zA-Z0-9+/]*={0,2}$/.test(data[key]))) invalid();
        }
        if ((data.type === 'edit:update' && !data.update) || (data.type === 'edit:init' && !data.state)) invalid();
        if (data.kind !== undefined && !['monaco', 'textarea'].includes(data.kind)) invalid();
        for (const key of ['fontSize', 'lineHeight', 'scrollTop', 'scrollLeft']) if (data[key] !== undefined && !finite(data[key])) invalid();
        if (data.scrollSeq !== undefined && (!Number.isSafeInteger(data.scrollSeq) || data.scrollSeq < 0)) invalid();
        if (data.type === 'edit:scroll' && (!finite(data.scrollTop) || data.scrollTop < 0
            || !finite(data.scrollLeft) || data.scrollLeft < 0 || !(data.scrollSeq > 0))) invalid();
        if (data.view !== undefined || data.theme !== undefined) {
            if (role !== 'student' || !['edit:init', 'edit:layout'].includes(data.type)
                || (data.view !== undefined && !validEditorAppearance(data.view))
                || (data.theme !== undefined && !validEditorTheme(data.theme))) invalid();
        }
        if (data.rect && !['x', 'y', 'width', 'height'].every((key) => finite(data.rect[key]))) invalid();
    } else if (kind === 'mirror') {
        if (!['rrweb', 'rrweb-chunk', 'rrweb-batch'].includes(data.type) || !Number.isSafeInteger(data.sequence) || data.sequence < 0) invalid();
        if (data.type === 'rrweb' && (!data.event || typeof data.event !== 'object')) invalid();
        if (data.type === 'rrweb-batch' && (!Array.isArray(data.events) || data.events.length > 256)) invalid();
        if (data.type === 'rrweb-chunk' && (!short(data.id) || !data.id || !Number.isSafeInteger(data.index) || !Number.isSafeInteger(data.total)
            || data.total < 1 || data.total > 1024 || data.index < 0 || data.index >= data.total
            || !short(data.chunk, 128 * 1024) || (data.encoding !== undefined && !['gzip', 'json'].includes(data.encoding)))) invalid();
    }
}

export function validateShareMessage(payload: any) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || !['hello', 'list', 'start', 'stop', 'relay', 'pulse'].includes(payload.type)) {
        throw new LiveShareError('INVALID_MESSAGE', '无法识别共享消息。');
    }
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > LIVE_SHARE_MAX_BYTES) {
        throw new LiveShareError('MESSAGE_TOO_LARGE', '共享内容过大，请稍后重试。');
    }
    if (payload.type === 'hello') {
        if (!shareId(payload.tabId) || !shareId(payload.pageId) || !shareId(payload.deviceId) || typeof payload.url !== 'string' || payload.url.length > 2048
            || typeof payload.title !== 'string' || payload.title.length > 160 || typeof payload.visible !== 'boolean') {
            throw new LiveShareError('INVALID_HELLO', '共享页面信息不完整，请刷新页面。');
        }
    }
    if (payload.type === 'start' && (!Number.isSafeInteger(payload.studentUid) || payload.studentUid <= 1
        || (payload.tabId !== undefined && !shareId(payload.tabId)))) {
        throw new LiveShareError('INVALID_STUDENT', '请选择有效的学员。');
    }
    if (['stop', 'relay'].includes(payload.type) && !shareId(payload.sessionId)) {
        throw new LiveShareError('INVALID_SESSION', '共享已失效，请重新连接。');
    }
    if (payload.type === 'relay' && (!shareId(payload.pageId) || !['mirror', 'editor', 'command', 'ack'].includes(payload.kind)
        || payload.data === null || typeof payload.data !== 'object' || Array.isArray(payload.data))) {
        throw new LiveShareError('INVALID_RELAY', '共享内容格式不正确。');
    }
    if (payload.type === 'pulse' && typeof payload.visible !== 'boolean') {
        throw new LiveShareError('INVALID_PULSE', '共享页面状态不正确。');
    }
    return payload;
}

/** Per-connection token buckets also bound a malicious sender before any DB work. */
export class ShareRateLimit {
    private events = 160;
    private bytes = 2 * 1024 * 1024;
    private controls = 12;
    private updated: number;

    constructor(now = Date.now()) { this.updated = now; }

    accept(payload: any, now = Date.now()) {
        const elapsed = Math.max(0, now - this.updated) / 1000;
        this.updated = now;
        this.events = Math.min(160, this.events + elapsed * 80);
        this.bytes = Math.min(2 * 1024 * 1024, this.bytes + elapsed * 1024 * 1024);
        this.controls = Math.min(12, this.controls + elapsed * 2);
        const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
        const control = ['list', 'start', 'stop', 'hello'].includes(payload.type);
        if (this.events < 1 || this.bytes < bytes || (control && this.controls < 1)) {
            throw new LiveShareError('RATE_LIMIT', '共享操作过于频繁，请稍候。');
        }
        this.events--;
        this.bytes -= bytes;
        if (control) this.controls--;
    }
}

export interface ShareSession {
    _id: string;
    teacherUid: number;
    teacherTabId: string;
    studentUid: number;
    studentTabId: string;
    studentDeviceId: string;
    workspaceId: string;
    domainId: string;
    pageId: string;
    teacherName: string;
    studentName: string;
    active: boolean;
    createdAt: Date;
    expiresAt: Date;
}

export function sessionRole(session: ShareSession, uid: number, tabId: string): ShareRole | null {
    if (session.teacherUid === uid && session.teacherTabId === tabId) return 'teacher';
    if (session.studentUid === uid && session.studentTabId === tabId) return 'student';
    return null;
}

export function authorizeRelay(session: ShareSession, uid: number, tabId: string, pageId: string, kind: ShareRelayKind, now = Date.now()) {
    const role = sessionRole(session, uid, tabId);
    if (!session.active || +session.expiresAt <= now || !role || !relayAllowed(role, kind)) {
        throw new LiveShareError('FORBIDDEN', '没有权限操作这个共享会话。');
    }
    if (pageId !== session.pageId) throw new LiveShareError('STALE_PAGE', '学员已切换页面，正在重新同步。');
    return role;
}
