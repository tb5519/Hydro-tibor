import { hostname } from 'os';
import { BSON } from 'mongodb';
import type { Context } from '../context';
import { checkShareOrigin, LiveShareError } from '../lib/live_share';
import {
    ownsVoice, validateVoiceMessage, VOICE_FRAME_MAX_AGE_MS, VOICE_MAX_MESSAGE_BYTES,
    VoiceCall, VoiceCallError, voiceId, VoiceRateLimit, voiceRole,
} from '../lib/voice_call';
import { PERM, PRIV } from '../model/builtin';
import * as share from '../model/live_share';
import token from '../model/token';
import * as voice from '../model/voice_call';
import workspace from '../model/workspace';
import bus from '../service/bus';
import { ConnectionHandler, Handler, subscribe } from '../service/server';

const cluster = process.env.exec_mode === 'cluster_mode';
const serverId = cluster ? `${hostname()}:${process.env.name || 'hydro'}` : voice.opaqueVoiceId();
let pendingIPCBytes = 0;

/** Ephemeral transport only: audio must never use the durable bus.broadcast/outbox. */
export function emitVoiceCall(event: voice.VoiceEvent) {
    if (!cluster) { void bus.parallel('voice-call/event', event).catch(() => {}); return; }
    if (!process.send || !process.connected) throw new VoiceCallError('UNAVAILABLE', '语音服务暂时不可用，请稍后重试。');
    const payload = BSON.EJSON.stringify([event]);
    const bytes = Buffer.byteLength(payload);
    // Drop old audio rather than queueing seconds of delayed speech.
    const limit = event.message.type === 'audio' ? 256 * 1024 : 512 * 1024;
    if (pendingIPCBytes + bytes > limit) {
        if (event.message.type === 'audio') return;
        throw new VoiceCallError('UNAVAILABLE', '语音连接繁忙，请稍后重试。');
    }
    pendingIPCBytes += bytes;
    try {
        process.send({ type: 'hydro:broadcast', data: { event: 'voice-call/event', payload } }, () => { pendingIPCBytes -= bytes; });
    } catch (error) { pendingIPCBytes -= bytes; throw error; }
}

export class VoiceCallConnectionHandler extends ConnectionHandler {
    maxMessageBytes = VOICE_MAX_MESSAGE_BYTES;
    private readonly connectionId = voice.opaqueVoiceId();
    private readonly limiter = new VoiceRateLimit();
    private peer: voice.VoicePresence;
    private canTeach = false;
    private currentCall: VoiceCall;
    private queue = Promise.resolve();
    private outgoing = Promise.resolve();
    private pending = 0;
    private checking = false;
    private disposed = false;
    private closing = false;
    private lastLoginCheck = 0;
    private lastAuthorization = 0;
    private lastDiscovery = 0;
    private lastSeq = -1;

    async prepare() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        if (this.session.sudoUid) throw new VoiceCallError('FORBIDDEN', '代登录状态不能使用语音通话。');
        checkShareOrigin(this.request.headers.origin, this.request.host);
        await this.limitRate('voice_call_connect', 60, 60);
        try { await share.teacherScope(this.user._id, this.domain._id); this.canTeach = true; }
        catch { await share.studentScope(this.user._id, this.domain._id); }
        await this.checkLogin();
        this.ctx.setTimeout(() => { if (!this.peer) this.close(4000, 'Hello timeout'); }, 15_000);
        this.ctx.interval(() => this.checkSession().catch((error) => this.report(error)), 3000);
    }

    private report(error: any, request?: any) {
        if (this.disposed || this.closing) return;
        const known = error instanceof VoiceCallError || error instanceof LiveShareError;
        this.send({ type: 'error', code: known ? error.code : 'UNAVAILABLE',
            ...(request?.type === 'dial' && voiceId(request.requestId) ? { requestId: request.requestId } : {}),
            ...(['accept', 'reject', 'hangup'].includes(request?.type) && voiceId(request.callId) ? { callId: request.callId } : {}),
            message: known ? error.message : '语音服务暂时不可用，请稍后重试。' });
    }

    private closeVoice(code: number, reason: string) {
        if (this.disposed || this.closing) return;
        // Stop queued controls and audio immediately; the framework still
        // invokes cleanup after the actual socket close.
        this.closing = true; this.lastAuthorization = 0;
        this.close(code, reason);
    }

    private async checkLogin() {
        if (Date.now() - this.lastLoginCheck < 2000) return;
        const login = this.session._id ? await token.get(this.session._id, token.TYPE_SESSION) : null;
        const permission = this.canTeach ? PERM.PERM_EDIT_DOMAIN : PERM.PERM_VIEW;
        let allowed = false;
        try {
            allowed = login && login.uid === this.user._id && !login.sudoUid && +login.expireAt > Date.now()
                && (BigInt(login.scope ?? PERM.PERM_ALL) & permission) === permission;
        } catch { /* Malformed or revoked login fails closed. */ }
        if (!allowed) {
            this.lastAuthorization = 0;
            if (this.currentCall && this.peer && ownsVoice(this.currentCall, this.peer)) {
                await voice.endCall(this.currentCall, '账号已退出登录，通话已结束。', emitVoiceCall);
            }
            this.closeVoice(4003, 'Login revoked');
            throw new VoiceCallError('FORBIDDEN', '登录已失效，请重新登录。');
        }
        this.lastLoginCheck = Date.now();
    }

    async message(payload: any) {
        if (this.disposed || this.closing) return;
        try {
            validateVoiceMessage(payload);
            if (!this.limiter.accept(payload.type)) return;
            if (payload.type === 'audio') { this.relayAudio(payload); return; }
            if (this.pending >= 8) throw new VoiceCallError('RATE_LIMIT', '请等待当前操作完成。');
        } catch (error) { this.report(error, payload); return; }
        this.pending += 1;
        this.queue = this.queue.then(async () => {
            if (!this.disposed && !this.closing) await this.processMessage(payload);
        }).catch((error) => this.report(error, payload)).finally(() => { this.pending -= 1; });
        await this.queue;
    }

    private async processMessage(payload: any) {
        await this.checkLogin();
        if (this.disposed || this.closing) return;
        if (payload.type === 'hello') {
            if (this.peer && (this.peer.tabId !== payload.tabId || this.peer.deviceId !== payload.deviceId
                || this.peer.mediaOwner !== !!payload.mediaOwner)) throw new VoiceCallError('FORBIDDEN', '不能更换语音窗口身份。');
            const scope = this.canTeach ? await share.teacherScope(this.user._id, this.domain._id)
                : await share.studentScope(this.user._id, this.domain._id);
            if (this.disposed || this.closing) return;
            this.peer = await voice.connectPresence({ uid: this.user._id, tabId: payload.tabId, deviceId: payload.deviceId,
                connectionId: this.connectionId, domainId: this.domain._id, workspaceId: scope.workspaceId, serverId,
                canTeach: this.canTeach, mediaOwner: !!payload.mediaOwner, visible: payload.visible });
            if (this.disposed || this.closing) { await voice.disconnectPresence(this.peer); return; }
            emitVoiceCall({ uid: this.peer.uid, tabId: this.peer.tabId,
                message: { type: 'peer-connected', connectionId: this.connectionId } });
            this.send({ type: 'ready', uid: this.peer.uid, canTeach: this.canTeach, mediaOwner: this.peer.mediaOwner });
            await voice.resumeOwner(this.peer, emitVoiceCall);
            await this.checkSession(true);
            return;
        }
        if (!this.peer) throw new VoiceCallError('HELLO_REQUIRED', '请先连接语音服务。');
        try {
            // A control message is also activity. The normal heartbeat now
            // needs one conditional write, rather than a read then a write.
            await voice.pulsePresence(this.peer, payload.type === 'pulse' ? payload.visible ?? this.peer.visible : this.peer.visible);
        } catch (error) {
            if (error.code === 'REPLACED') this.closeVoice(4002, 'Tab reconnected');
            else if (error.code === 'FORBIDDEN') this.closeVoice(4003, 'Classroom revoked');
            else this.closeVoice(4008, 'Presence recovery required');
            return;
        }
        if (this.disposed || this.closing) {
            // A close may finish while a recovery write is in flight.
            await voice.disconnectPresence(this.peer);
            return;
        }
        if (payload.type === 'pulse') {
            await this.checkSession();
        } else if (payload.type === 'list') {
            if (!this.canTeach) throw new VoiceCallError('FORBIDDEN', '只有老师可以选择学员拨号。');
            await this.limitRate('voice_call_list', 10, 15);
            this.send({ type: 'students', students: await voice.listStudents(this.peer.uid, this.peer.domainId) });
        } else if (payload.type === 'dial') {
            await this.limitRate('voice_call_dial', 60, 12);
            this.currentCall = await voice.dial(this.peer, payload.studentUid, emitVoiceCall, Date.now(), payload.requestId);
            this.lastAuthorization = Date.now(); this.lastSeq = -1;
            this.send(voice.snapshot(this.currentCall, this.peer));
        } else if (payload.type === 'accept') {
            this.currentCall = await voice.accept(this.peer, payload.callId, emitVoiceCall);
            this.lastAuthorization = Date.now(); this.lastSeq = -1;
            this.send(voice.snapshot(this.currentCall, this.peer));
        } else if (['reject', 'hangup'].includes(payload.type)) {
            const call = await voice.participantCall(this.peer, payload.callId);
            if (payload.type === 'reject' && (call.studentUid !== this.peer.uid || call.status !== 'ringing')) {
                throw new VoiceCallError('FORBIDDEN', '只能拒绝自己的未接来电。');
            }
            await voice.endCall(call, payload.type === 'reject' ? '学员暂时不方便接听。' : '通话已结束。', emitVoiceCall);
        }
    }

    private relayAudio(payload: any) {
        const call = this.currentCall;
        // No DB round-trip on the audio path. Short cached leases are revalidated
        // independently, and revocation/ended events immediately stop forwarding.
        if (this.disposed || this.closing || !this.peer || !call || call._id !== payload.callId || call.status !== 'active' || !call.active
            || !ownsVoice(call, this.peer) || +call.expiresAt <= Date.now() || Date.now() - this.lastAuthorization > 6500
            || Date.now() - this.lastLoginCheck > 6500 || payload.seq <= this.lastSeq) return;
        this.lastSeq = payload.seq;
        const role = voiceRole(call, this.peer.uid);
        const other = role === 'teacher' ? call.studentOwner : call.teacherOwner;
        if (!other) return;
        emitVoiceCall({ uid: role === 'teacher' ? call.studentUid : call.teacherUid, tabId: other.tabId,
            connectionId: other.connectionId, sentAt: Date.now(), message: {
                type: 'audio', callId: call._id, streamId: this.connectionId, seq: payload.seq, data: payload.data,
            } });
    }

    private async checkSession(announce = false) {
        if (!this.peer || this.disposed || this.closing || this.checking) return;
        // Incoming events are immediate. Idle tabs only need occasional recovery
        // discovery, rather than polling MongoDB as frequently as active calls.
        if (!this.currentCall && !announce && Date.now() - this.lastDiscovery < 30_000) return;
        this.checking = true;
        try {
            this.lastDiscovery = Date.now();
            await this.checkLogin();
            const stored = await voice.callFor(this.peer);
            if (this.disposed || this.closing) return;
            if (!stored) {
                if (this.currentCall) this.send({ type: 'ended', callId: this.currentCall._id,
                    requestId: this.currentCall.dialRequestId, reason: '通话已结束。' });
                this.currentCall = null; this.lastAuthorization = 0; return;
            }
            const call = await voice.refreshCall(stored, emitVoiceCall);
            if (this.disposed || this.closing) return;
            if (!call) { this.currentCall = null; this.lastAuthorization = 0; return; }
            const changed = !this.currentCall || this.currentCall._id !== call._id || this.currentCall.status !== call.status
                || ownsVoice(this.currentCall, this.peer) !== ownsVoice(call, this.peer);
            if (!this.currentCall || this.currentCall._id !== call._id) this.lastSeq = -1;
            this.currentCall = call; this.lastAuthorization = Date.now();
            if (announce || changed) this.send(voice.snapshot(call, this.peer));
        } finally { this.checking = false; }
    }

    @subscribe('voice-call/event')
    async onVoiceEvent(event: voice.VoiceEvent) {
        if (this.disposed || this.closing || !this.peer || event.uid !== this.peer.uid
            || (event.tabId && event.tabId !== this.peer.tabId)
            || (event.connectionId && event.connectionId !== this.connectionId)) return;
        if (event.message.type === 'audio') {
            if (!event.sentAt || Date.now() - event.sentAt > VOICE_FRAME_MAX_AGE_MS || this.conn.bufferedAmount > 16 * 1024
                || !this.currentCall || this.currentCall._id !== event.message.callId || this.currentCall.status !== 'active'
                || !ownsVoice(this.currentCall, this.peer) || Date.now() - this.lastAuthorization > 6500
                || Date.now() - this.lastLoginCheck > 6500) return;
            const other = this.currentCall.teacherUid === this.peer.uid ? this.currentCall.studentOwner : this.currentCall.teacherOwner;
            if (event.message.streamId !== other?.connectionId) return;
            this.send(event.message);
            return;
        }
        if (event.message.type === 'peer-connected') {
            if (event.message.connectionId !== this.connectionId) this.closeVoice(4002, 'Tab reconnected');
            return;
        }
        if (event.message.type === 'ended') {
            if (this.currentCall?._id === event.message.callId) { this.currentCall = null; this.lastAuthorization = 0; }
            this.send(event.message); return;
        }
        // Serialize metadata refreshes, without putting audio into the queue.
        if (event.message.type === 'changed') {
            this.outgoing = this.outgoing.then(() => this.checkSession(true)).catch((error) => this.report(error));
            await this.outgoing;
        }
    }

    @subscribe('user/delcache')
    onUserPermissionsChanged() { this.lastAuthorization = 0; this.lastLoginCheck = 0; }

    @subscribe('domain/delete-cache')
    onDomainPermissionsChanged() { this.lastAuthorization = 0; }

    async cleanup() {
        this.disposed = true; this.lastAuthorization = 0;
        if (this.peer) await voice.disconnectPresence(this.peer);
    }
}

export async function injectVoiceCall(handler: Handler) {
    if (handler.request.method.toUpperCase() !== 'GET' || handler.response.redirect || handler.response.status >= 400
        || !handler.response.template || handler.user?._id <= 1 || !handler.user?.hasPriv(PRIV.PRIV_USER_PROFILE)
        || handler.session.sudoUid) return;
    // Voice captures microphone audio only, never the page or its form fields.
    // Keep calls available on personal/admin pages without sharing's page-grant restrictions.
    const path = handler.request.originalPath.replace(/^\/d\/[^/]+(?=\/|$)/, '') || '/';
    if (/^\/(?:login|logout|register|lostpass|oauth)(?:\/|$)/i.test(path)
        || /^\/user\/(?:sudo|tfa|webauthn)(?:\/|$)/i.test(path)
        || /^\/home\/changeMail(?:\/|$)/i.test(path)) return;
    let domainId = handler.domain._id; let canTeach = false;
    try { await share.teacherScope(handler.user._id, domainId); canTeach = true; } catch {
        try { await share.studentScope(handler.user._id, domainId); } catch {
            // Account pages commonly resolve to the system domain. Select an
            // actually joined classroom, rather than disconnecting that student.
            const workspaceDoc = (handler as Handler & { workspaceDoc?: { _id: string } }).workspaceDoc;
            const spaces = [...new Set([workspaceDoc?._id, workspace.resolveDomainWorkspaceId(handler.domain),
                ...await workspace.getAssignedWorkspaceIds(handler.user._id)].filter(Boolean))];
            let found = false;
            for (const space of spaces) {
                // eslint-disable-next-line no-await-in-loop
                for (const item of await workspace.getDomains(space)) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await share.teacherScope(handler.user._id, item._id);
                        domainId = item._id; canTeach = true; found = true; break;
                    } catch {
                        try {
                            // eslint-disable-next-line no-await-in-loop
                            await share.studentScope(handler.user._id, item._id);
                            domainId = item._id; found = true; break;
                        } catch { /* Try the next permitted classroom. */ }
                    }
                }
                if (found) break;
            }
            if (!found) return;
        }
    }
    handler.UiContext.voiceCall = { enabled: true, uid: handler.user._id, canTeach, socketUrl: handler.url('voice_call_conn', { domainId }) };
}

export function apply(ctx: Context) {
    ctx.Connection('voice_call_conn', '/voice-call/conn', VoiceCallConnectionHandler, PRIV.PRIV_USER_PROFILE);
    ctx.on('handler/after', injectVoiceCall);
}
