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

/** Viewing requires a grant from a successful rendered GET; this is not an action/navigation allowlist. */
export function sharePage(value: unknown): { path: string; domainId?: string } | null {
    if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')
        || /[\\\u0000-\u001f]/.test(value)) return null;
    let url: URL;
    try { url = new URL(value, 'https://live-share.invalid'); } catch { return null; }
    if (url.origin !== 'https://live-share.invalid') return null;
    let pathname: string;
    try {
        if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(decodeURIComponent(value.split(/[?#]/, 1)[0]))) return null;
        pathname = decodeURIComponent(url.pathname);
    } catch { return null; }
    if (/[\\\u0000-\u001f]/.test(pathname) || pathname.includes('//')) return null;
    const match = /^\/d\/([^/]+)(\/.*)?$/.exec(pathname);
    const path = match ? match[2] || '/' : pathname;
    // These URLs can themselves contain login challenges or one-use secrets.
    // Ordinary personal/contest/Scratch pages remain viewable after their own
    // HTTP authorization. Sensitive fields inside them are masked by capture.
    if (/^\/(?:login|logout|register|lostpass|oauth)(?:\/|$)/i.test(path)
        || /^\/user\/(?:sudo|tfa|webauthn)(?:\/|$)/i.test(path)
        || /^\/home\/changeMail(?:\/|$)/i.test(path)) return null;
    for (const key of url.searchParams.keys()) {
        if (/password|passwd|secret|token|credential|authorization|session|reviewUid|mergedUid/i.test(key)
            || /^(?:auth|sid)$/i.test(key)) return null;
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
            || !['click', 'scroll', 'select', 'search', 'annotate', 'resize', 'frame', 'draw'].includes(data.action)
            || (data.target !== undefined && !short(data.target, 32))
            || (data.value !== undefined && !short(data.value, 4096))
            || (data.x !== undefined && !finite(data.x)) || (data.y !== undefined && !finite(data.y))) invalid();
        if (data.action === 'draw') {
            if (role !== 'teacher' || data.nodeId !== 1
                || Object.keys(data).some((key) => !['id', 'pageId', 'nodeId', 'action', 'drawing'].includes(key))) invalid();
            const stroke = data.drawing;
            if (!stroke || typeof stroke !== 'object' || Array.isArray(stroke)
                || Object.keys(stroke).some((key) => !['strokeId', 'phase', 'sequence', 'points', 'note', 'anchor'].includes(key))
                || !shareId(stroke.strokeId) || !['start', 'move', 'end', 'note', 'delete'].includes(stroke.phase)
                || !Number.isSafeInteger(stroke.sequence) || stroke.sequence < 0 || stroke.sequence > 4096
                || (stroke.phase === 'start' && stroke.sequence !== 0)
                || !Array.isArray(stroke.points) || stroke.points.length > 32
                || (['start', 'move'].includes(stroke.phase) && !stroke.points.length)
                || (['note', 'delete'].includes(stroke.phase) && stroke.points.length)
                || stroke.points.some((point) => !Array.isArray(point) || point.length !== 2
                    || point.some((value) => !finite(value) || value < 0 || value > 10000))) invalid();
            if (Object.hasOwn(stroke, 'anchor')) {
                const anchor = stroke.anchor;
                if (stroke.phase !== 'start' || !anchor || typeof anchor !== 'object' || Array.isArray(anchor)
                    || !['dom', 'editor'].includes(anchor.kind)
                    || Object.keys(anchor).some((key) => !['kind', 'mode', 'nodeId', 'editorId', 'frameId', 'matrix'].includes(key))
                    || !Array.isArray(anchor.matrix) || anchor.matrix.length !== 6
                    || anchor.matrix.some((value, index) => !finite(value) || (index < 4 && Math.abs(value) > 100))
                    || Math.abs(anchor.matrix[0] * anchor.matrix[3] - anchor.matrix[1] * anchor.matrix[2]) < 0.000001) invalid();
                if (anchor.kind === 'dom') {
                    if (!['element', 'scroll', 'svg'].includes(anchor.mode)
                        || !Number.isSafeInteger(anchor.nodeId) || anchor.nodeId < 1 || Object.hasOwn(anchor, 'editorId')
                        || (Object.hasOwn(anchor, 'frameId') && !shareId(anchor.frameId))) invalid();
                } else if (anchor.mode !== 'scroll' || !shareId(anchor.editorId)
                    || Object.hasOwn(anchor, 'nodeId') || Object.hasOwn(anchor, 'frameId')) invalid();
            }
            if (stroke.phase === 'note') {
                const note = stroke.note;
                if (!note || typeof note !== 'object' || Array.isArray(note)
                    || Object.keys(note).some((key) => !['text', 'x', 'y', 'width', 'height'].includes(key))
                    || !short(note.text, 1000)
                    || ![note.x, note.y].every((value) => finite(value) && value >= 0 && value <= 10000)
                    || !finite(note.width) || note.width < 36 || note.width > 960
                    || !finite(note.height) || note.height < 36 || note.height > 800) invalid();
            } else if (Object.hasOwn(stroke, 'note')) invalid();
        }
        if (data.action === 'frame') {
            if (role !== 'teacher' || data.nodeId !== 1 || !shareId(data.frameId)
                || Object.keys(data).some((key) => !['id', 'pageId', 'nodeId', 'action', 'frameId', 'command'].includes(key))) invalid();
            const command = data.command;
            if (!command || typeof command !== 'object' || Array.isArray(command)
                || Object.keys(command).some((key) => !['id', 'pageId', 'nodeId', 'action', 'target', 'input'].includes(key))
                || !shareId(command.id) || command.pageId !== data.frameId || command.action !== 'scratch'
                || !Number.isSafeInteger(command.nodeId) || command.nodeId < 1
                || !short(command.target, 32) || !command.target) invalid();
            const input = command.input;
            if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
            const fields = {
                pointer: ['type', 'phase', 'gesture', 'x', 'y'], wheel: ['type', 'x', 'y', 'dx', 'dy'],
                text: ['type', 'value'], key: ['type', 'key'],
            };
            if (!Object.hasOwn(fields, input.type) || Object.keys(input).some((key) => !fields[input.type].includes(key))) invalid();
            if (['pointer', 'wheel'].includes(input.type)
                && ![input.x, input.y].every((value) => finite(value) && value >= 0 && value <= 16384)) invalid();
            if (input.type === 'pointer' && (!['down', 'move', 'up', 'cancel'].includes(input.phase) || !shareId(input.gesture))) invalid();
            if (input.type === 'wheel' && ![input.dx, input.dy].every((value) => finite(value) && Math.abs(value) <= 3000)) invalid();
            if (input.type === 'text' && !short(input.value, 1000)) invalid();
            if (input.type === 'key' && !['Enter', 'Escape', 'Tab', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(input.key)) invalid();
        }
        if (data.action === 'resize' && (role !== 'teacher' || !short(data.target, 32) || !data.target
            || !finite(data.x) || data.x < 0 || data.x > 1
            || Object.keys(data).some((key) => !['id', 'pageId', 'nodeId', 'action', 'target', 'x'].includes(key)))) invalid();
        if (data.action === 'annotate') {
            // Annotation messages carry a text range and plain note text only.
            // They must never become arbitrary DOM, style, navigation or editor operations.
            if (role !== 'teacher' || !shareId(data.annotationId)
                || Object.keys(data).some((key) => !['id', 'pageId', 'nodeId', 'action', 'annotationId', 'annotation'].includes(key))) invalid();
            const note = data.annotation;
            if (note !== null) {
                if (!note || typeof note !== 'object' || Array.isArray(note)
                    || Object.keys(note).some((key) => !['startNodeId', 'endNodeId', 'startOffset', 'endOffset', 'quote', 'text', 'noteOpen', 'offsetX', 'offsetY', 'width', 'height'].includes(key))
                    || ![note.startNodeId, note.endNodeId].every((id) => Number.isSafeInteger(id) && id > 0)
                    || ![note.startOffset, note.endOffset].every((offset) => Number.isSafeInteger(offset) && offset >= 0 && offset <= 1_000_000)
                    || (note.startNodeId === note.endNodeId && note.startOffset >= note.endOffset)
                    || !short(note.quote, 4000) || !note.quote.trim() || !short(note.text, 1000)
                    || typeof note.noteOpen !== 'boolean'
                    || (note.width !== undefined && (!finite(note.width) || note.width < 36 || note.width > 960))
                    || (note.height !== undefined && (!finite(note.height) || note.height < 36 || note.height > 800))
                    || ![note.offsetX, note.offsetY].every((offset) => finite(offset) && Math.abs(offset) <= 10000)) invalid();
            }
        }
    } else if (kind === 'ack') {
        if (!shareId(data.id) || data.pageId !== pageId || typeof data.ok !== 'boolean'
            || (data.reason !== undefined && !short(data.reason, 512))) invalid();
    } else if (kind === 'editor') {
        const allowed = role === 'teacher' ? ['edit:update', 'edit:cursor', 'edit:sync', 'edit:scroll']
            : ['edit:init', 'edit:layout', 'edit:remove', 'edit:update', 'edit:cursor', 'edit:ack', 'edit:focus'];
        if (!allowed.includes(data.type) || data.pageId !== pageId || !short(data.editorId, 128)
            || (!data.editorId && data.type !== 'edit:sync')) invalid();
        if (data.type === 'edit:focus') {
            const focus = data.focus;
            if (Object.keys(data).some((key) => !['type', 'pageId', 'editorId', 'focus'].includes(key))
                || !focus || typeof focus !== 'object' || Array.isArray(focus)
                || Object.keys(focus).some((key) => !['width', 'height', 'scrollTop', 'scrollLeft', 'revision', 'selections'].includes(key))
                || ![focus.width, focus.height].every((value) => finite(value) && value >= 0 && value <= 10000)
                || ![focus.scrollTop, focus.scrollLeft].every((value) => finite(value) && value >= 0)
                || !short(focus.revision, 4096) || !/^[a-zA-Z0-9+/=:]+$/.test(focus.revision)
                || !Array.isArray(focus.selections) || focus.selections.length > 41) invalid();
            const ids = new Set<string>(); let count = 0;
            for (const selection of focus.selections) {
                if (!selection || typeof selection !== 'object' || Array.isArray(selection)
                    || Object.keys(selection).some((key) => !['noteId', 'anchor', 'head', 'rects'].includes(key))
                    || (selection.noteId !== undefined && (typeof selection.noteId !== 'string' || !/^[\w-]{1,128}$/.test(selection.noteId)))
                    || ids.has(selection.noteId || '')
                    || ![selection.anchor, selection.head].every((value) => short(value, 4096) && /^[a-zA-Z0-9+/]+={0,2}$/.test(value))
                    || !Array.isArray(selection.rects) || selection.rects.length > 256) invalid();
                ids.add(selection.noteId || ''); count += selection.rects.length;
                for (const rect of selection.rects) {
                    if (!rect || typeof rect !== 'object' || Array.isArray(rect) || Object.keys(rect).length !== 4
                        || !['x', 'y', 'width', 'height'].every((key) => finite(rect[key]) && rect[key] >= 0)
                        || !(rect.width > 0) || !(rect.height > 0)
                        || rect.x + rect.width > focus.width + 1 || rect.y + rect.height > focus.height + 1) invalid();
                }
            }
            if (count > 2048) invalid();
        } else if (data.focus !== undefined) invalid();
        if (data.textStyle !== undefined) {
            const style = data.textStyle;
            const pixels = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
                'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'scrollbarWidth', 'scrollbarHeight'];
            if (role !== 'student' || !['edit:init', 'edit:layout'].includes(data.type)
                || !style || typeof style !== 'object' || Array.isArray(style)
                || Object.keys(style).some((key) => ![...pixels, 'wrap', 'fontWeight', 'fontStyle', 'letterSpacing', 'wordSpacing', 'textIndent', 'tabSize'].includes(key))
                || !['off', 'soft', 'hard'].includes(style.wrap) || !['normal', 'italic', 'oblique'].includes(style.fontStyle)
                || typeof style.fontWeight !== 'string' || !/^(?:normal|bold|[1-9]\d{0,2}|1000)$/.test(style.fontWeight)
                || !pixels.every((key) => finite(style[key]) && style[key] >= 0 && style[key] <= 256)
                || !['letterSpacing', 'wordSpacing', 'textIndent'].every((key) => finite(style[key]) && Math.abs(style[key]) <= 2000)
                || !finite(style.tabSize) || style.tabSize < 1 || style.tabSize > 64) invalid();
        }
        // Annotation state uses an independent document so writing a note cannot
        // modify the learner's code, including read-only editor models.
        if (data.document !== undefined && (data.document !== 'annotations'
            || !['edit:init', 'edit:update', 'edit:ack'].includes(data.type)
            || Object.keys(data).some((key) => !['type', 'pageId', 'editorId', 'document', 'state', 'update', 'opId'].includes(key)))) invalid();
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
        if (role !== 'student') invalid();
        if (data.type === 'frame' || data.type === 'frame-remove') {
            if (typeof data.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.id)
                || Object.keys(data).some((key) => !['type', 'id', ...(data.type === 'frame' ? ['packet'] : [])].includes(key))) invalid();
            if (data.type === 'frame-remove') return;
            if (!data.packet || typeof data.packet !== 'object' || Array.isArray(data.packet)) invalid();
        }
        // One child document layer only. It carries display packets, never
        // executable actions, editor messages or recursively nested frames.
        const packet = data.type === 'frame' ? data.packet : data;
        if (!['rrweb', 'rrweb-chunk', 'rrweb-batch'].includes(packet.type) || !Number.isSafeInteger(packet.sequence) || packet.sequence < 0) invalid();
        if (packet.type === 'rrweb' && (!packet.event || typeof packet.event !== 'object')) invalid();
        if (packet.type === 'rrweb-batch' && (!Array.isArray(packet.events) || packet.events.length > 256)) invalid();
        if (packet.type === 'rrweb-chunk' && (!short(packet.id) || !packet.id || !Number.isSafeInteger(packet.index) || !Number.isSafeInteger(packet.total)
            || packet.total < 1 || packet.total > 1024 || packet.index < 0 || packet.index >= packet.total
            || !short(packet.chunk, 128 * 1024) || (packet.encoding !== undefined && !['gzip', 'json'].includes(packet.encoding)))) invalid();
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
