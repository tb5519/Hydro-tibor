import { hostname } from 'os';
import { BSON } from 'mongodb';
import type { Context } from '../context';
import { LessonError, LESSON_MAX_MESSAGE_BYTES, LESSON_MEDIA_MAX_AGE_MS, LessonRateLimit, validateLessonMessage } from '../lib/lesson';
import { checkShareOrigin, LiveShareError } from '../lib/live_share';
import { PERM, PRIV } from '../model/builtin';
import * as lesson from '../model/lesson';
import token from '../model/token';
import workspace from '../model/workspace';
import bus from '../service/bus';
import { ConnectionHandler, Handler, subscribe } from '../service/server';

const cluster = process.env.exec_mode === 'cluster_mode';
const serverId = cluster ? `${hostname()}:${process.env.name || 'hydro'}` : lesson.opaqueLessonId();
let pendingIPCBytes = 0;
let pendingVideoIPCBytes = 0;

/** Never use the durable broadcast/outbox for camera or microphone payloads. */
export function emitLesson(event: lesson.LessonEvent) {
    if (!cluster) { void bus.parallel('lesson/event', event).catch(() => {}); return; }
    if (!process.send || !process.connected) throw new LessonError('UNAVAILABLE', '课堂连接暂时不可用。');
    const payload = BSON.EJSON.stringify([event]); const bytes = Buffer.byteLength(payload);
    const video = event.message.type === 'video';
    const audio = event.message.type === 'audio';
    // Camera IPC has its own bounded allowance so a large picture does not
    // consume the original microphone and control-message capacity.
    if (video ? pendingVideoIPCBytes + bytes > 2 * 1024 * 1024
        : pendingIPCBytes + bytes > (audio ? 512 : 768) * 1024) {
        if (video || audio) return;
        throw new LessonError('UNAVAILABLE', '课堂连接繁忙，请稍后重试。');
    }
    if (video) pendingVideoIPCBytes += bytes;
    else pendingIPCBytes += bytes;
    const release = () => {
        if (video) pendingVideoIPCBytes -= bytes;
        else pendingIPCBytes -= bytes;
    };
    try {
        process.send({ type: 'hydro:broadcast', data: { event: 'lesson/event', payload } }, release);
    } catch (error) { release(); throw error; }
}

const knownError = (error: any) => error instanceof LessonError || error instanceof LiveShareError;
function errorBody(error: any) {
    return { error: knownError(error) ? error.code : 'UNAVAILABLE', code: knownError(error) ? error.code : 'UNAVAILABLE',
        message: knownError(error) ? error.message : '课堂服务暂时不可用，请稍后重试。' };
}

export class LessonHandler extends Handler {
    async prepare() {
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('Vary', 'Cookie');
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        if (this.session.sudoUid) throw new LessonError('FORBIDDEN', '代登录状态不能上课。');
        if (this.request.method.toUpperCase() !== 'GET' || this.request.headers.origin) {
            checkShareOrigin(this.request.headers.origin, this.request.host);
        }
        await this.limitRate('lesson_http', 60, this.request.method.toUpperCase() === 'GET' ? 90 : 30);
        const access = await lesson.scope(this.user._id, this.domain._id);
        // Scope checks read fresh membership; the request's user additionally
        // carries the login token's narrower permission scope.
        this.checkPerm(access.canTeach ? PERM.PERM_EDIT_DOMAIN : PERM.PERM_VIEW);
    }

    async get() { this.response.body = await lesson.list(this.user._id, this.domain._id); }

    async post() {
        if (!this.request.body?.operation) throw new LessonError('INVALID_MESSAGE', '请选择课堂操作。');
    }

    private async mutate(operation: string) {
        const body = this.request.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LessonError('INVALID_MESSAGE', '课堂请求格式不正确。');
        const allowed = operation === 'create' ? ['operation', 'studentUid', 'startAt', 'durationMinutes', 'title', 'tabId']
            : ['operation', 'lessonId', 'tabId'];
        if (Object.keys(body).some((key) => !allowed.includes(key))) throw new LessonError('INVALID_MESSAGE', '课堂请求含有无效字段。');
        const uid = this.user._id; const domainId = this.domain._id;
        const result = operation === 'create' ? await lesson.create(uid, domainId, body, emitLesson)
            : operation === 'join' ? await lesson.join(uid, domainId, body.lessonId, body.tabId, emitLesson)
                : operation === 'leave' ? await lesson.leave(uid, domainId, body.lessonId, body.tabId, emitLesson)
                    : await lesson.finish(uid, domainId, body.lessonId, operation === 'cancel' ? 'cancelled' : 'ended', emitLesson);
        this.response.body = { lesson: result };
    }

    async postCreate() { await this.mutate('create'); }
    async postJoin() { await this.mutate('join'); }
    async postLeave() { await this.mutate('leave'); }
    async postEnd() { await this.mutate('end'); }
    async postCancel() { await this.mutate('cancel'); }

    async onerror(error: any) {
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.status = knownError(error)
            ? ({ FORBIDDEN: 403, ORIGIN: 403, NOT_FOUND: 404, CONFLICT: 409, BUSY: 409, ENDED: 410, TOO_EARLY: 409 }[error.code] || 400) : 503;
        this.response.body = errorBody(error);
    }
}

/** Recovery belongs to the authenticated account, independent of the page's
 * current teaching domain. The target room supplies its fresh access checks. */
export class LessonResumeHandler extends Handler {
    async prepare() {
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.addHeader('Vary', 'Cookie');
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        if (this.session.sudoUid) throw new LessonError('FORBIDDEN', '代登录状态不能上课。');
        checkShareOrigin(this.request.headers.origin, this.request.host);
        await this.limitRate('lesson_resume', 60, 60);
        const login = this.session._id ? await token.get(this.session._id, token.TYPE_SESSION) : null;
        if (!login || login.uid !== this.user._id || login.sudoUid || !(+login.expireAt > Date.now())) {
            throw new LessonError('FORBIDDEN', '登录已失效，请重新登录。');
        }
    }

    async post() {
        const body = this.request.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)
            || Object.keys(body).some((key) => !['tabId', 'expectedUid'].includes(key))) {
            throw new LessonError('INVALID_MESSAGE', '课堂恢复请求格式不正确。');
        }
        const uid = this.user._id;
        if (body.expectedUid !== undefined && body.expectedUid !== uid) {
            throw new LessonError('FORBIDDEN', '登录账号已改变，请刷新页面。');
        }
        const restored = await lesson.resume(uid, body.tabId, emitLesson, Date.now(), async (room) => {
            const login = this.session._id ? await token.get(this.session._id, token.TYPE_SESSION) : null;
            const permission = room.teacherUid === uid ? PERM.PERM_EDIT_DOMAIN : PERM.PERM_VIEW;
            let allowed = false;
            try { allowed = login && login.uid === uid && !login.sudoUid && +login.expireAt > Date.now()
                && (BigInt(login.scope ?? PERM.PERM_ALL) & permission) === permission; } catch { /* Fail closed. */ }
            if (!allowed) throw new LessonError('FORBIDDEN', '登录或课堂权限已失效，请重新登录。');
        });
        this.response.body = { uid, lesson: restored, ...(restored ? {
            apiUrl: this.url('lesson', { domainId: restored.domainId }),
            socketUrl: this.url('lesson_conn', { domainId: restored.domainId }),
            canTeach: restored.teacherUid === uid,
        } : {}), serverNow: new Date().toISOString() };
    }

    async onerror(error: any) {
        this.response.type = 'application/json';
        this.response.addHeader('Cache-Control', 'private, no-store');
        this.response.status = knownError(error)
            ? ({ FORBIDDEN: 403, ORIGIN: 403, NOT_FOUND: 404, CONFLICT: 409, BUSY: 409, REPLACED: 409, ENDED: 410 }[error.code] || 400) : 503;
        this.response.body = errorBody(error);
    }
}

export class LessonConnectionHandler extends ConnectionHandler {
    maxMessageBytes = LESSON_MAX_MESSAGE_BYTES;
    private readonly connectionId = lesson.opaqueLessonId();
    private readonly limiter = new LessonRateLimit();
    private peer: lesson.LessonMember;
    private other: lesson.LessonMember;
    private room: lesson.Lesson;
    private closing = false;
    private checking = false;
    private lastAuthorization = 0;
    private lastLoginCheck = 0;
    private lastActivity = Date.now();
    private canTeach = false;
    private authorizationVersion = 0;
    private sequences = { audio: -1, video: -1 };
    private queue = Promise.resolve();
    private pending = 0;

    async prepare() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        if (this.session.sudoUid) throw new LessonError('FORBIDDEN', '代登录状态不能上课。');
        checkShareOrigin(this.request.headers.origin, this.request.host);
        await this.limitRate('lesson_connect', 60, 30);
        const access = await lesson.scope(this.user._id, this.domain._id);
        this.canTeach = access.canTeach;
        this.checkPerm(this.canTeach ? PERM.PERM_EDIT_DOMAIN : PERM.PERM_VIEW);
        await this.checkLogin();
        this.ctx.setTimeout(() => { if (!this.peer) this.stop('请重新点击上课。', 'JOIN_REQUIRED'); }, 15000);
        this.ctx.interval(() => this.checkSession().catch((error) => this.stop(error.message, knownError(error) ? error.code : 'UNAVAILABLE')), 3000);
    }

    private stop(message: string, code = 'ENDED') {
        if (this.closing) return;
        this.closing = true; this.lastAuthorization = 0; this.other = null;
        this.send({ type: 'error', code, message });
        this.close(4003, code);
    }

    private async checkLogin() {
        if (Date.now() - this.lastLoginCheck < 2000) return;
        const login = this.session._id ? await token.get(this.session._id, token.TYPE_SESSION) : null;
        const permission = (this.room ? this.room.teacherUid === this.user._id : this.canTeach)
            ? PERM.PERM_EDIT_DOMAIN : PERM.PERM_VIEW;
        let allowed = false;
        try { allowed = login && login.uid === this.user._id && !login.sudoUid && +login.expireAt > Date.now()
            && (BigInt(login.scope ?? PERM.PERM_ALL) & permission) === permission; } catch { /* Revoked/malformed token fails closed. */ }
        if (!allowed) throw new LessonError('FORBIDDEN', '登录已失效，请重新登录。');
        this.lastLoginCheck = Date.now();
    }

    async message(payload: any) {
        if (this.closing) return;
        try {
            validateLessonMessage(payload);
            if (!this.limiter.accept(payload.type, payload.data?.length || 0)) return;
            this.lastActivity = Date.now();
            if (payload.type === 'video' || payload.type === 'audio') { this.relay(payload); return; }
            if (this.pending >= 6) throw new LessonError('RATE_LIMIT', '请等待课堂连接准备完成。');
        } catch (error) { this.send({ type: 'error', ...errorBody(error) }); return; }
        this.pending++;
        this.queue = this.queue.then(async () => {
            if (this.closing) return;
            await this.checkLogin();
            if (payload.type === 'join') {
                if (this.peer) throw new LessonError('CONFLICT', '课堂已经连接。');
                const bound = await lesson.bind(this.user._id, this.domain._id, payload.lessonId, payload.tabId, this.connectionId, serverId);
                if (this.closing) { await lesson.disconnect(bound.peer); return; }
                this.peer = bound.peer; this.room = bound.room;
                this.lastLoginCheck = 0; await this.checkSession(true);
                emitLesson({ uid: this.user._id, lessonId: this.room._id,
                    message: { type: 'owner', connectionId: this.connectionId, ownerVersion: this.peer.ownerVersion } });
                const otherUid = this.user._id === this.room.teacherUid ? this.room.studentUid : this.room.teacherUid;
                emitLesson({ uid: otherUid, lessonId: this.room._id, message: { type: 'peer', online: true, streamId: this.connectionId } });
            } else {
                if (!this.peer) throw new LessonError('JOIN_REQUIRED', '请先点击上课按钮。');
                await this.checkSession();
                if (!this.closing) this.send({ type: 'pulse' });
            }
        }).catch((error) => {
            if (knownError(error) && ['FORBIDDEN', 'ENDED', 'REPLACED', 'JOIN_REQUIRED'].includes(error.code)) this.stop(error.message, error.code);
            else this.send({ type: 'error', ...errorBody(error) });
        }).finally(() => { this.pending--; });
        await this.queue;
    }

    private relay(payload: any) {
        if (!this.room || !this.peer || !this.other || this.closing || payload.lessonId !== this.room._id
            || Date.now() - this.lastAuthorization > 6500 || Date.now() - this.lastLoginCheck > 6500
            || payload.seq <= this.sequences[payload.type] || this.other.serverId !== serverId) return;
        this.sequences[payload.type] = payload.seq;
        emitLesson({ uid: this.other._id, lessonId: this.room._id, connectionId: this.other.connectionId,
            sentAt: Date.now(), message: { ...payload, uid: this.user._id, streamId: this.connectionId } });
    }

    private async checkSession(announce = false) {
        if (!this.peer || this.closing || this.checking) return;
        if (Date.now() - this.lastActivity > 90_000) throw new LessonError('OFFLINE', '课堂连接已中断，请重新进入。');
        this.checking = true;
        const version = this.authorizationVersion;
        try {
            await this.checkLogin();
            const room = await lesson.pulse(this.peer, this.domain._id);
            let other = await lesson.otherMember(room, this.user._id);
            if (this.closing || version !== this.authorizationVersion) return;
            // The other browser can still have a short lease from the previous
            // server process. Wait for its fresh binding instead of repeatedly
            // disconnecting the participant who has already recovered.
            if (other && other.serverId !== serverId) other = null;
            const changed = this.other?.connectionId !== other?.connectionId;
            this.room = room; this.other = other; this.lastAuthorization = Date.now();
            if (announce) this.send({ type: 'ready', lesson: await lesson.snapshot(room), peerOnline: !!other });
            else if (changed) this.send({ type: 'peer', online: !!other, ...(other ? { streamId: other.connectionId } : {}) });
        } finally {
            this.checking = false;
            if (!this.closing && version !== this.authorizationVersion) {
                void this.checkSession(announce).catch((error) => this.stop(knownError(error) ? error.message : '课堂连接已暂停。',
                    knownError(error) ? error.code : 'UNAVAILABLE'));
            }
        }
    }

    @subscribe('lesson/event')
    async onLessonEvent(event: lesson.LessonEvent) {
        if (this.closing || !this.peer || !this.room || event.uid !== this.user._id || event.lessonId !== this.room._id
            || (event.connectionId && event.connectionId !== this.connectionId)) return;
        const message = event.message;
        if (message.type === 'video' || message.type === 'audio') {
            if (!event.sentAt || Date.now() - event.sentAt > LESSON_MEDIA_MAX_AGE_MS
                || this.conn.bufferedAmount > (message.type === 'audio' ? 16 : 512) * 1024
                || Date.now() - this.lastAuthorization > 6500 || Date.now() - this.lastLoginCheck > 6500
                || !this.other || message.streamId !== this.other.connectionId || message.uid !== this.other._id) return;
            this.send(message); return;
        }
        if (message.type === 'owner') {
            const owner = await lesson.members.findOne({ _id: this.user._id, lessonId: this.room._id });
            if (this.closing || !owner) return;
            // IPC delivery can reorder two bindings of the SAME admission
            // version. Only the owner currently recorded by Mongo may replace
            // this socket; a delayed notification from its predecessor cannot.
            if (Number.isSafeInteger(message.ownerVersion) && message.ownerVersion !== owner.ownerVersion) return;
            if (message.connectionId && message.connectionId !== owner.connectionId) return;
            if (owner.connectionId !== this.connectionId || owner.ownerVersion !== this.peer.ownerVersion) {
                this.stop('课堂已重新连接。', 'REPLACED');
            }
            return;
        }
        if (message.type === 'ended') {
            this.send(message); this.closing = true; this.lastAuthorization = 0; this.other = null;
            this.close(4000, 'Ended'); return;
        }
        // Invalidate an in-flight authorization as well as its cached lease.
        // A late heartbeat must not revive media after leave/replacement.
        this.authorizationVersion++; this.lastAuthorization = 0;
        try {
            await this.checkSession();
            if (!this.closing && message.type === 'lesson') this.send(message);
        } catch (error) { this.stop(knownError(error) ? error.message : '课堂连接已暂停。', knownError(error) ? error.code : 'UNAVAILABLE'); }
    }

    @subscribe('user/delcache')
    onUserPermissionsChanged() { this.authorizationVersion++; this.lastAuthorization = 0; this.lastLoginCheck = 0; }

    @subscribe('domain/delete-cache')
    onDomainPermissionsChanged() { this.authorizationVersion++; this.lastAuthorization = 0; }

    async cleanup() {
        this.closing = true; this.lastAuthorization = 0;
        if (!this.peer || !this.room) return;
        const current = await lesson.members.findOne({ _id: this.user._id, lessonId: this.room._id, connectionId: this.connectionId });
        await lesson.disconnect(this.peer);
        if (current) emitLesson({ uid: this.user._id === this.room.teacherUid ? this.room.studentUid : this.room.teacherUid,
            lessonId: this.room._id, message: { type: 'peer', online: false } });
    }
}

export async function injectLesson(handler: Handler) {
    if (handler.request.method.toUpperCase() !== 'GET' || handler.response.redirect || handler.response.status >= 400
        || !handler.response.template || handler.user?._id <= 1 || !handler.user?.hasPriv(PRIV.PRIV_USER_PROFILE)
        || handler.session.sudoUid) return;
    const path = handler.request.originalPath.replace(/^\/d\/[^/]+(?=\/|$)/, '') || '/';
    if (/^\/(?:login|logout|register|lostpass|oauth)(?:\/|$)/i.test(path)
        || /^\/user\/(?:sudo|tfa|webauthn)(?:\/|$)/i.test(path) || /^\/home\/changeMail(?:\/|$)/i.test(path)) return;
    let domainId = handler.domain._id;
    let access: Awaited<ReturnType<typeof lesson.scope>>;
    try { access = await lesson.scope(handler.user._id, domainId); } catch {
        // Account pages may resolve to system while the learner belongs to a
        // teaching domain. Resolve independently of asynchronous injection order.
        const workspaceDoc = (handler as Handler & { workspaceDoc?: { _id: string } }).workspaceDoc;
        const spaces = [...new Set([workspaceDoc?._id, workspace.resolveDomainWorkspaceId(handler.domain),
            ...await workspace.getAssignedWorkspaceIds(handler.user._id)].filter(Boolean))];
        for (const space of spaces) {
            // eslint-disable-next-line no-await-in-loop
            for (const classroom of await workspace.getDomains(space)) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    access = await lesson.scope(handler.user._id, classroom._id); domainId = classroom._id; break;
                } catch { /* Try another joined classroom. */ }
            }
            if (access) break;
        }
        if (!access) return;
    }
    handler.UiContext.lesson = { enabled: true, uid: handler.user._id, canTeach: access.canTeach,
        apiUrl: handler.url('lesson', { domainId }), socketUrl: handler.url('lesson_conn', { domainId }),
        resumeUrl: handler.url('lesson_resume', { domainId }) };
}

export function apply(ctx: Context) {
    ctx.Route('lesson', '/lesson', LessonHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('lesson_resume', '/lesson/resume', LessonResumeHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Connection('lesson_conn', '/lesson/conn', LessonConnectionHandler, PRIV.PRIV_USER_PROFILE);
    ctx.on('handler/after', injectLesson);
}
