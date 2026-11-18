import { hostname } from 'os';
import { BSON } from 'mongodb';
import type { Context } from '../context';
import {
    authorizeRelay, checkShareOrigin, LIVE_SHARE_MAX_BYTES, LiveShareError, ShareRateLimit, ShareSession,
    sessionRole, sharePage, validateRelayData, validateShareMessage,
} from '../lib/live_share';
import { broadcastDrawing, validateBroadcastMessage, validateBroadcastRelay } from '../lib/teacher_broadcast';
import { PERM, PRIV } from '../model/builtin';
import * as share from '../model/live_share';
import { switchDirection } from '../model/live_share_switch';
import * as broadcast from '../model/teacher_broadcast';
import token from '../model/token';
import workspace from '../model/workspace';
import bus from '../service/bus';
import { ConnectionHandler, Handler, subscribe } from '../service/server';

const cluster = process.env.exec_mode === 'cluster_mode';
const serverId = cluster ? `${hostname()}:${process.env.name || 'hydro'}` : share.opaqueShareId();
const MAX_PENDING_MESSAGES = 160;
const MAX_PENDING_BYTES = 1024 * 1024;
let pendingIPCBytes = 0;

/** Learning payloads must not enter the generic durable Mongo event outbox. */
export function emitLiveShare(event: share.ShareEvent) {
    if (!cluster) {
        void bus.parallel('live-share/event', event);
        return;
    }
    if (!process.send || !process.connected) throw new LiveShareError('UNAVAILABLE', '共享连接暂时不可用，请重新连接。');
    const payload = BSON.EJSON.stringify([event]);
    const bytes = Buffer.byteLength(payload);
    if (pendingIPCBytes + bytes > 4 * 1024 * 1024) throw new LiveShareError('BACKPRESSURE', '共享正在重新同步，请稍候。');
    pendingIPCBytes += bytes;
    try {
        process.send({ type: 'hydro:broadcast', data: { event: 'live-share/event', payload } }, () => { pendingIPCBytes -= bytes; });
    } catch (error) { pendingIPCBytes -= bytes; throw error; }
}

export class LiveShareConnectionHandler extends ConnectionHandler {
    maxMessageBytes = LIVE_SHARE_MAX_BYTES;
    private peer: share.SharePresence;
    private canTeach = false;
    private readonly connectionId = share.opaqueShareId();
    private readonly limiter = new ShareRateLimit();
    private pending = 0;
    private pendingBytes = 0;
    private queue = Promise.resolve();
    private outgoing = Promise.resolve();
    private outgoingBytes = 0;
    private currentSession: ShareSession;
    private currentBroadcast: broadcast.BroadcastRoom;
    private lastBroadcastAuthorization = 0;
    private lastBroadcastDiscovery = 0;
    private checkingBroadcast = false;
    private broadcastPaused = false;
    private lastAuthorization = 0;
    private lastPeerCheck = 0;
    private lastLoginCheck = 0;
    private activePageGrant: string;
    private lastGrantRenewal = 0;
    private lastDiscovery = 0;
    private paused = false;
    private announcedAssist = '';
    // A cached learner page can display its code without supporting
    // learner-priority conflict resolution. Track only the current page.
    private editorScope = '';
    private versionedEditors = new Set<string>();
    private lastObservationSync = { key: '', at: 0 };
    private sessionCheck: Promise<void>;
    private disposed = false;

    async prepare() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        if (this.session.sudoUid) throw new LiveShareError('FORBIDDEN', '请退出账号代看后使用共享。');
        checkShareOrigin(this.request.headers.origin, this.request.host);
        await this.limitRate('live_share_connect', 60, 60);
        try { await share.teacherScope(this.user._id, this.domain._id); this.canTeach = true; } catch {
            await share.studentScope(this.user._id, this.domain._id);
        }
        await this.checkLogin();
        this.ctx.setTimeout(() => { if (!this.peer) this.close(4000, 'Hello timeout'); }, 15000);
        this.ctx.interval(() => this.checkSession().catch(() => {}), 5000);
    }

    async message(payload: any) {
        if (this.disposed) return;
        let bytes = 0;
        try {
            if (typeof payload?.type === 'string' && payload.type.startsWith('broadcast:')) validateBroadcastMessage(payload);
            else validateShareMessage(payload);
            bytes = this.limiter.accept(payload);
            // WebSocket callbacks can deliver an entire small-frame burst while
            // the first permission lookup is awaiting I/O. Bound actual queued
            // bytes and the existing 160-event burst, not an arbitrary 16 frames.
            if (this.pending >= MAX_PENDING_MESSAGES || this.pendingBytes + bytes > MAX_PENDING_BYTES) {
                throw new LiveShareError('BACKPRESSURE', '共享正在重新同步，请稍候。');
            }
        } catch (error) { this.report(error, payload?.type?.startsWith?.('broadcast:'), payload); return; }
        this.pending++;
        this.pendingBytes += bytes;
        this.queue = this.queue.then(async () => { if (!this.disposed) await this.processMessage(payload); })
            .catch((error) => this.report(error, payload?.type?.startsWith?.('broadcast:'), payload)).finally(() => {
                this.pending--; this.pendingBytes -= bytes;
            });
        await this.queue;
    }

    private report(error: any, isBroadcast = false, payload?: any) {
        if (this.disposed) return;
        const known = error instanceof LiveShareError;
        this.send({ type: isBroadcast ? 'broadcast:error' : 'error', code: known ? error.code : 'UNAVAILABLE', message: known ? error.message : '共享暂时不可用，请稍后重新连接。',
            ...(['page', 'switch'].includes(payload?.type) ? { operation: payload.type,
                requestId: typeof payload.requestId === 'string' ? payload.requestId.slice(0, 96) : undefined } : {}) });
    }

    private async checkLogin() {
        if (Date.now() - this.lastLoginCheck < 3000) return;
        const login = this.session._id ? await token.get(this.session._id, token.TYPE_SESSION) : null;
        const permission = this.canTeach ? PERM.PERM_EDIT_DOMAIN : PERM.PERM_VIEW;
        let allowed = false;
        try {
            allowed = login && login.uid === this.user._id && !login.sudoUid && +login.expireAt > Date.now()
                && (BigInt(login.scope ?? PERM.PERM_ALL) & permission) === permission;
        } catch { /* Invalid or revoked session scope is never trusted. */ }
        if (!allowed) {
            if (this.currentSession) await share.endSession(this.currentSession, '账号登录已失效，共享已结束。', emitLiveShare);
            if (this.currentBroadcast && broadcast.role(this.currentBroadcast, this.peer) === 'teacher') {
                await broadcast.end(this.currentBroadcast, '老师登录已失效，分享已结束。', emitLiveShare);
            }
            this.close(4003, 'Login revoked');
            throw new LiveShareError('FORBIDDEN', '登录已失效或权限已改变，请重新登录。');
        }
        this.lastLoginCheck = Date.now();
    }

    private async processMessage(payload: any) {
        await this.checkLogin();
        if (payload.type === 'hello') {
            if (this.peer && (this.peer.tabId !== payload.tabId || this.peer.pageId !== payload.pageId)) {
                throw new LiveShareError('INVALID_HELLO', '页面已切换，请重新连接。');
            }
            const pageAllowed = await share.verifyPageGrant(this.user._id, this.domain._id, payload.pageGrant, payload.url);
            if (!this.canTeach && !pageAllowed) {
                throw new LiveShareError('UNSUPPORTED_PAGE', '当前页面尚未获准共享，请刷新页面。');
            }
            const scope = this.canTeach ? await share.teacherScope(this.user._id, this.domain._id)
                : await share.studentScope(this.user._id, this.domain._id);
            this.peer = await share.connectPresence({ uid: this.user._id, tabId: payload.tabId, pageId: payload.pageId,
                connectionId: this.connectionId, deviceId: payload.deviceId, domainId: this.domain._id, workspaceId: scope.workspaceId,
                url: pageAllowed ? payload.url : '', title: payload.title, visible: payload.visible, canTeach: this.canTeach, serverId });
            this.activePageGrant = pageAllowed ? payload.pageGrant : undefined;
            this.lastGrantRenewal = Date.now();
            emitLiveShare({ uid: this.peer.uid, tabId: this.peer.tabId,
                message: { type: 'peer-connected', connectionId: this.connectionId } });
            this.lastPeerCheck = Date.now();
            this.send({ type: 'ready', uid: this.user._id, canTeach: this.canTeach });
            await share.followStudentTab(this.peer, emitLiveShare);
            await broadcast.follow(this.peer, emitLiveShare);
            this.currentSession = await share.sessionFor(this.peer);
            if (!this.currentSession) this.send({ type: 'assist:idle' });
            this.currentBroadcast = await broadcast.roomFor(this.peer);
            await this.checkSession(true);
            return;
        }
        if (!this.peer) throw new LiveShareError('NOT_READY', '共享连接正在准备，请稍候。');
        if (Date.now() - this.lastPeerCheck > 3000 || !['relay', 'broadcast:relay'].includes(payload.type)) {
            const connected = await share.livePresence(this.peer.uid, this.peer.tabId);
            if (!connected || connected.connectionId !== this.connectionId) {
                this.close(1013, 'Presence expired, reconnect');
                throw new LiveShareError('REPLACED', '页面已重新连接，正在恢复共享。');
            }
            this.lastPeerCheck = Date.now();
        }
        if (payload.type === 'page') {
            this.peer = await share.updatePresencePage(this.peer, payload);
            this.activePageGrant = payload.url ? payload.pageGrant : undefined;
            this.lastGrantRenewal = Date.now();
            this.lastAuthorization = 0; this.lastBroadcastAuthorization = 0;
            this.send({ type: 'page-ready', pageId: this.peer.pageId, requestId: payload.requestId });
            await this.checkSession(true);
            return;
        }
        if (payload.type === 'pulse') {
            const wasVisible = this.peer.visible;
            await share.pulsePresence(this.peer, payload.visible && (!!this.peer.url || this.canTeach));
            if (this.activePageGrant && Date.now() - this.lastGrantRenewal >= 60 * 60 * 1000) {
                if (!await share.renewPageGrant(this.peer, this.activePageGrant)) this.activePageGrant = undefined;
                this.lastGrantRenewal = Date.now();
            }
            const followed = await broadcast.follow(this.peer, emitLiveShare);
            if (followed) this.currentBroadcast = followed;
            if (!this.canTeach && wasVisible && !this.peer.visible && this.currentSession) {
                for (const [uid, tabId] of [[this.currentSession.teacherUid, this.currentSession.teacherTabId],
                    [this.currentSession.studentUid, this.currentSession.studentTabId]] as [number, string][]) {
                    emitLiveShare({ uid, tabId, message: { type: 'paused', sessionId: this.currentSession._id, pageId: this.currentSession.pageId,
                        reason: '学员已切换标签页，等待当前学习页面。' } });
                }
            }
            if (!this.canTeach && this.currentSession?.studentTabId !== this.peer.tabId) {
                this.currentSession = await share.followStudentTab(this.peer, emitLiveShare) || this.currentSession;
            }
            await this.checkSession();
        } else if (payload.type === 'switch') {
            const room = await switchDirection(this.peer, payload, emitLiveShare);
            this.currentSession = 'viewers' in room ? null : room;
            this.currentBroadcast = 'viewers' in room ? room : null;
            this.lastAuthorization = 0; this.lastBroadcastAuthorization = 0;
            this.send({ type: 'switch:ready', requestId: payload.requestId, mode: payload.mode,
                sessionId: room._id, ...share.connectionInfo(room) });
        } else if (payload.type.startsWith('broadcast:')) await this.processBroadcast(payload);
        else if (payload.type === 'list') {
            if (!this.canTeach) throw new LiveShareError('FORBIDDEN', '只有老师可以选择共享学员。');
            this.send({ type: 'students', students: await share.listStudents(this.peer.uid, this.peer.domainId) });
        } else if (payload.type === 'start') {
            if (!this.canTeach) throw new LiveShareError('FORBIDDEN', '只有老师可以发起共享。');
            await share.teacherScope(this.peer.uid, this.peer.domainId);
            this.currentSession = await share.startSession(this.peer, payload.studentUid, payload.tabId, emitLiveShare, undefined, payload.mode);
            this.lastAuthorization = Date.now();
        } else if (payload.type === 'stop') {
            const session = await share.sessions.findOne({ _id: payload.sessionId });
            const role = session && sessionRole(session, this.peer.uid, this.peer.tabId);
            if (!session || (role !== 'teacher' && !(role === 'student' && session.mode === 'observe'))) {
                throw new LiveShareError('FORBIDDEN', '没有权限结束这个画面连接。');
            }
            if (session.active) await share.endSession(session, session.mode === 'observe'
                ? role === 'student' ? '学员已停止画面查看。' : '老师已结束画面查看。' : '老师已结束共享。', emitLiveShare);
            else this.send({ type: 'ended', sessionId: session._id, ...await share.connectionDeparture(session), reason: '共享已结束。' });
        } else if (payload.type === 'observe:sync') await this.synchronizeObservation(payload);
        else if (payload.type === 'relay') await this.relay(payload);
    }

    /** Request sanitized source snapshots, never relay a teacher editing payload. */
    private async synchronizeObservation(payload: { sessionId: string, pageId: string }) {
        const session = await share.sessions.findOne({ _id: payload.sessionId, active: true });
        if (!session || session.mode !== 'observe' || sessionRole(session, this.peer.uid, this.peer.tabId) !== 'teacher'
            || !await share.currentTransport(session)) throw new LiveShareError('FORBIDDEN', '没有权限同步这个学员画面。');
        const current = await share.refreshSession(session, emitLiveShare);
        if (!current) throw new LiveShareError('PAUSED', '学员正在切换页面，请稍后重试。');
        if (current.pageId !== payload.pageId) throw new LiveShareError('STALE_PAGE', '学员已切换页面，正在重新同步。');
        const key = `${current._id}:${current.pageId}`;
        if (this.lastObservationSync.key === key && Date.now() - this.lastObservationSync.at < 1000) return;
        this.lastObservationSync = { key, at: Date.now() };
        this.currentSession = current; this.lastAuthorization = Date.now();
        emitLiveShare({ uid: current.studentUid, tabId: current.studentTabId, message: {
            type: 'observe:sync', sessionId: current._id, pageId: current.pageId, mode: 'observe',
        } });
    }

    private async relay(payload: any) {
        if (share.transportRetired(payload.sessionId)) return;
        let session = this.currentSession?._id === payload.sessionId ? this.currentSession : null;
        if (!session || Date.now() - this.lastAuthorization > 3000) {
            session = await share.sessions.findOne({ _id: payload.sessionId, active: true });
            if (!session || !sessionRole(session, this.peer.uid, this.peer.tabId)
                || !await share.currentTransport(session)) throw new LiveShareError('ENDED', '共享已结束。');
            session = await share.refreshSession(session, emitLiveShare);
            if (!session) throw new LiveShareError('PAUSED', '正在等待对方重新连接。');
            this.currentSession = session;
            this.lastAuthorization = Date.now();
        }
        if (!session) throw new LiveShareError('ENDED', '共享已结束。');
        const role = authorizeRelay(session, this.peer.uid, this.peer.tabId, payload.pageId, payload.kind);
        validateRelayData(role, payload.kind, payload.data, payload.pageId);
        if (role === 'teacher' && payload.kind === 'editor' && payload.data.type === 'edit:update' && !payload.data.document
            && (this.editorScope !== `${session._id}:${session.pageId}` || !this.versionedEditors.has(payload.data.editorId))) {
            throw new LiveShareError('EDITOR_NOT_READY', '请等待学员编辑器同步。如仍为只读，请学员刷新页面。');
        }
        if (this.disposed || share.transportRetired(session._id)) return;
        emitLiveShare({ uid: role === 'teacher' ? session.studentUid : session.teacherUid,
            tabId: role === 'teacher' ? session.studentTabId : session.teacherTabId, message: {
            type: 'relay', sessionId: session._id, pageId: session.pageId, kind: payload.kind, data: payload.data,
        } });
    }

    private async authorizeBroadcast(sessionId: string) {
        if (share.transportRetired(sessionId)) throw new LiveShareError('STALE_SESSION', '共享方向已切换。');
        let room = this.currentBroadcast?._id === sessionId ? this.currentBroadcast : null;
        if (!room || Date.now() - this.lastBroadcastAuthorization > 3000) {
            room = await broadcast.rooms.findOne({ _id: sessionId, active: true });
            if (!room || +room.expiresAt <= Date.now() || !broadcast.role(room, this.peer) || !await share.currentTransport(room)) {
                throw new LiveShareError('ENDED', '分享已结束。');
            }
            const teacher = await share.livePresence(room.teacherUid, room.teacherTabId);
            if (!teacher || !teacher.visible || !teacher.url || teacher.pageId !== room.pageId) {
                throw new LiveShareError('PAUSED', '老师正在切换页面，稍后自动恢复。');
            }
            if (teacher.serverId !== this.peer.serverId || teacher.workspaceId !== room.workspaceId
                || this.peer.workspaceId !== room.workspaceId) throw new LiveShareError('FORBIDDEN', '分享范围已改变。');
            const scope = await share.teacherScope(room.teacherUid, teacher.domainId);
            if (scope.workspaceId !== room.workspaceId) throw new LiveShareError('FORBIDDEN', '分享范围已改变。');
            if (broadcast.role(room, this.peer) === 'student') {
                const viewer = room.viewers.find((v) => v.uid === this.peer.uid);
                await share.authorizePair(room.teacherUid, this.peer.uid, viewer.domainId);
            }
            this.currentBroadcast = room; this.lastBroadcastAuthorization = Date.now();
        }
        if (!room || +room.expiresAt <= Date.now() || !broadcast.role(room, this.peer)) throw new LiveShareError('ENDED', '分享已结束。');
        return room;
    }

    private async processBroadcast(payload: any) {
        if (payload.type === 'broadcast:start') {
            if (!this.canTeach) throw new LiveShareError('FORBIDDEN', '只有老师可以发起分享。');
            this.currentBroadcast = await broadcast.start(this.peer, payload.studentUids, emitLiveShare);
            this.lastBroadcastAuthorization = 0;
            return;
        }
        if (payload.type === 'broadcast:stop') {
            const room = await broadcast.rooms.findOne({ _id: payload.sessionId });
            if (!room || broadcast.role(room, this.peer) !== 'teacher') throw new LiveShareError('FORBIDDEN', '只有当前老师可以结束分享。');
            if (room.active) await broadcast.end(room, '老师已结束分享。', emitLiveShare);
            else this.send({ type: 'broadcast:ended', sessionId: room._id, ...await share.connectionDeparture(room), reason: '分享已结束。' });
            return;
        }
        if (payload.type === 'broadcast:relay' && share.transportRetired(payload.sessionId)) return;
        const room = await this.authorizeBroadcast(payload.sessionId);
        if (payload.pageId !== room.pageId) throw new LiveShareError('STALE_PAGE', '老师已切换页面，正在重新同步。');
        if (payload.type === 'broadcast:sync') {
            await broadcast.requestSnapshot(room, emitLiveShare);
            return;
        }
        const isTeacher = broadcast.role(room, this.peer) === 'teacher';
        if (isTeacher && (this.peer.pageId !== room.pageId || !this.peer.visible || !this.peer.url)) {
            throw new LiveShareError('STALE_PAGE', '请在当前分享的教学页面继续操作。');
        }
        validateBroadcastRelay(isTeacher, payload.kind, payload.data, room.pageId);
        const message = { type: 'broadcast:relay', sessionId: room._id, pageId: room.pageId, kind: payload.kind,
            data: payload.kind === 'drawing' ? broadcastDrawing(this.peer.uid, payload.data) : payload.data,
            senderUid: this.peer.uid, senderName: isTeacher ? room.teacherName : room.viewers.find((v) => v.uid === this.peer.uid)?.name };
        // A full DOM snapshot can span many chunks. Fan out after IPC delivery,
        // not before: sending each chunk 30 times exhausts the shared IPC budget
        // and leaves later learners with incomplete snapshots.
        if (share.transportRetired(room._id)) return;
        const recipients = room.viewers.filter((viewer) => viewer.uid !== this.peer.uid)
            .map(({ uid, tabId }) => ({ uid, tabId }));
        if (!isTeacher) recipients.unshift({ uid: room.teacherUid, tabId: room.teacherTabId });
        if (recipients.length) emitLiveShare({ uid: 0, tabId: '', recipients, message });
    }

    private async checkBroadcast(announce = false) {
        if (this.checkingBroadcast || (!this.currentBroadcast && !announce && Date.now() - this.lastBroadcastDiscovery < 10000)) return;
        this.checkingBroadcast = true;
        try {
            this.lastBroadcastDiscovery = Date.now();
            const stored = this.currentBroadcast ? await broadcast.rooms.findOne({ _id: this.currentBroadcast._id, active: true })
                : await broadcast.roomFor(this.peer);
            if (!stored || !broadcast.role(stored, this.peer)) {
                if (this.currentBroadcast) this.send({ type: 'broadcast:ended', sessionId: this.currentBroadcast._id,
                    ...await share.connectionDeparture(this.currentBroadcast), reason: '分享已结束。' });
                this.currentBroadcast = null; return;
            }
            if (+stored.expiresAt <= Date.now()) { await broadcast.end(stored, '分享连接已超时。', emitLiveShare); this.currentBroadcast = null; return; }
            this.currentBroadcast = stored;
            const refreshed = broadcast.role(stored, this.peer) === 'teacher' ? await broadcast.refresh(stored, emitLiveShare) : stored;
            const teacher = refreshed && await share.livePresence(refreshed.teacherUid, refreshed.teacherTabId);
            if (!refreshed || !teacher || !teacher.visible || !teacher.url) {
                if (!this.broadcastPaused) this.send({ type: 'broadcast:paused', sessionId: stored._id, reason: '老师正在切换页面或暂时离线，等待重新连接。' });
                this.broadcastPaused = true; return;
            }
            this.lastBroadcastAuthorization = 0;
            await this.authorizeBroadcast(refreshed._id);
            if (announce || this.broadcastPaused || stored.pageId !== refreshed.pageId
                || stored.viewers.length !== refreshed.viewers.length) await broadcast.notify(refreshed, emitLiveShare);
            this.currentBroadcast = refreshed; this.broadcastPaused = false;
        } catch (error) { this.report(error, true); }
        finally { this.checkingBroadcast = false; }
    }

    private async checkSession(announce = false): Promise<void> {
        if (!this.peer || this.disposed) return;
        if (this.sessionCheck) {
            // A page acknowledgement must publish the new binding even when a
            // periodic check was already reading the previous page.
            if (!announce) return;
            await this.sessionCheck;
            return this.checkSession(true);
        }
        this.sessionCheck = this.refreshConnection(announce);
        try { await this.sessionCheck; } finally { this.sessionCheck = undefined; }
    }

    private async refreshConnection(announce: boolean) {
        await this.checkLogin();
        await this.checkBroadcast(announce);
        if (!this.currentSession && !announce && Date.now() - this.lastDiscovery < 30000) return;
        this.lastDiscovery = Date.now();
        const previous = this.currentSession;
        const stored = previous ? await share.sessions.findOne({ _id: previous._id, active: true }) : await share.sessionFor(this.peer);
        if (this.currentSession !== previous || this.disposed) return;
        if (!stored) {
            if (this.currentSession) this.send({ type: 'ended', sessionId: this.currentSession._id,
                ...await share.connectionDeparture(this.currentSession), reason: '共享已结束。' });
            this.currentSession = null;
            return;
        }
        if (!sessionRole(stored, this.peer.uid, this.peer.tabId)) { this.currentSession = null; return; }
        if (+stored.expiresAt <= Date.now()) {
            const reason = '共享连接已超时，请重新选择学员。';
            if (!await share.endSession(stored, reason, emitLiveShare) && this.currentSession?._id === stored._id) {
                // The occupancy lease can already have been removed by Mongo's TTL index.
                this.currentSession = null;
                this.send({ type: 'ended', sessionId: stored._id, ...await share.connectionDeparture(stored), reason });
            }
            return;
        }
        this.currentSession = stored;
        const refreshed = await share.refreshSession(stored, emitLiveShare);
        if (this.currentSession !== stored || this.disposed) return;
        this.lastAuthorization = refreshed ? Date.now() : 0;
        if (!refreshed) {
            if (!this.paused) this.send({ type: 'paused', sessionId: stored._id, reason: '对方正在切换页面或暂时离线，等待重新连接。' });
            this.paused = true;
            return;
        }
        // A concurrent relay can refresh the database page binding before the
        // periodic check runs. Compare against the page actually sent to this tab.
        if (announce || this.paused || this.announcedAssist !== `${refreshed._id}:${refreshed.pageId}`) {
            share.notifySession(refreshed, emitLiveShare);
        }
        this.paused = false;
        this.currentSession = refreshed;
    }

    @subscribe('live-share/event')
    async onShareEvent(event: share.ShareEvent) {
        if (this.disposed || !this.peer) return;
        const addressed = event.recipients
            ? event.recipients.some((recipient) => recipient.uid === this.peer.uid && recipient.tabId === this.peer.tabId)
            : event.uid === this.peer.uid && event.tabId === this.peer.tabId;
        if (!addressed) return;
        const bytes = Buffer.byteLength(JSON.stringify(event));
        if (this.outgoingBytes + bytes > 2 * 1024 * 1024) { this.close(1013, 'Shared view needs resynchronization'); return; }
        this.outgoingBytes += bytes;
        this.outgoing = this.outgoing.then(() => this.deliver(event)).catch((error) => this.report(error, event.message.type?.startsWith('broadcast:')))
            .finally(() => { this.outgoingBytes -= bytes; });
        await this.outgoing;
    }

    private async deliver(event: share.ShareEvent) {
        if (this.disposed) return;
        if (event.message.type === 'peer-connected') {
            if (event.message.connectionId !== this.connectionId) this.close(4002, 'Tab reconnected');
            return;
        }
        if (this.conn.bufferedAmount > 2 * 1024 * 1024) {
            this.close(1013, 'Shared view is too far behind');
            return;
        }
        if (event.message.type.startsWith('broadcast:')) {
            const message = event.message;
            if (message.type !== 'broadcast:ended' && share.transportRetired(message.sessionId)) return;
            if (message.type === 'broadcast:ended') {
                if (message.switched) share.retireTransport(message.sessionId);
                if (this.currentBroadcast?._id === message.sessionId) this.currentBroadcast = null;
                this.lastBroadcastAuthorization = 0; this.lastBroadcastDiscovery = 0;
            } else if (message.type === 'broadcast:paused') {
                const room = await broadcast.rooms.findOne({ _id: message.sessionId, active: true });
                if (!room || !broadcast.role(room, this.peer)) return;
                this.broadcastPaused = true; this.lastBroadcastAuthorization = 0;
            } else {
                if (['broadcast:started', 'broadcast:view', 'broadcast:resync'].includes(message.type)) this.lastBroadcastAuthorization = 0;
                const room = await this.authorizeBroadcast(message.sessionId);
                if (message.pageId && room.pageId !== message.pageId) return;
            }
            this.send(message); return;
        }
        if (['ended', 'paused'].includes(event.message.type)) {
            if (event.message.switched) share.retireTransport(event.message.sessionId);
            if (event.message.type === 'paused') {
                if (this.currentSession?._id !== event.message.sessionId
                    || (event.message.pageId && this.currentSession.pageId !== event.message.pageId)) return;
                this.paused = true;
            } else if (this.currentSession?._id === event.message.sessionId) {
                this.currentSession = null;
                this.paused = false;
            }
            this.lastAuthorization = 0; this.lastDiscovery = 0;
        }
        if (['started', 'share-start'].includes(event.message.type)) {
            const current = await share.sessions.findOne({ _id: event.message.sessionId, active: true });
            if (!current || current.pageId !== event.message.pageId || current.studentTabId !== event.message.tabId
                || !sessionRole(current, this.peer.uid, this.peer.tabId) || !await share.currentTransport(current)) return;
            this.currentSession = current;
            this.announcedAssist = `${current._id}:${current.pageId}`;
            this.paused = false;
            this.lastAuthorization = 0;
        }
        if (event.message.type === 'observe:sync') {
            // Recheck the persisted mode and original page after asynchronous
            // delivery, so a queued request cannot revive a stopped capture.
            const current = await share.sessions.findOne({ _id: event.message.sessionId, active: true });
            if (!current || current.mode !== 'observe' || current.pageId !== event.message.pageId
                || sessionRole(current, this.peer.uid, this.peer.tabId) !== 'student'
                || this.peer.pageId !== current.pageId || !this.peer.visible || !this.peer.url
                || !await share.currentTransport(current)) return;
            await this.checkLogin();
            await share.authorizePair(current.teacherUid, current.studentUid, this.peer.domainId);
            if (!await share.verifyPageGrant(this.peer.uid, this.peer.domainId, this.activePageGrant, this.peer.url)) return;
        }
        if (event.message.type === 'relay') {
            if (this.paused || !this.currentSession || this.currentSession._id !== event.message.sessionId
                || this.currentSession.pageId !== event.message.pageId) return;
            const { data, kind } = event.message;
            if (this.canTeach && this.currentSession.mode !== 'observe' && kind === 'editor' && !data.document) {
                const scope = `${event.message.sessionId}:${event.message.pageId}`;
                if (scope !== this.editorScope) { this.editorScope = scope; this.versionedEditors.clear(); }
                if (data.type === 'edit:init') {
                    if (Number.isSafeInteger(data.studentVersion) && this.versionedEditors.size < 256) this.versionedEditors.add(data.editorId);
                    else if (data.studentVersion === undefined) this.versionedEditors.delete(data.editorId);
                } else if (data.type === 'edit:remove') this.versionedEditors.delete(data.editorId);
                if (['edit:init', 'edit:layout'].includes(data.type) && !this.versionedEditors.has(data.editorId)) {
                    this.send({ ...event.message, data: { ...data, readOnly: true } });
                    return;
                }
            }
        }
        this.send(event.message);
    }

    @subscribe('user/delcache')
    onUserPermissionsChanged() { this.lastAuthorization = 0; this.lastBroadcastAuthorization = 0; }

    @subscribe('domain/delete-cache')
    onDomainPermissionsChanged() { this.lastAuthorization = 0; this.lastBroadcastAuthorization = 0; }

    async cleanup() {
        this.disposed = true;
        if (this.peer) {
            if (!await share.disconnectPresence(this.peer)) return;
            const room = await broadcast.roomFor(this.peer);
            if (room && broadcast.role(room, this.peer) === 'teacher') {
                for (const viewer of room.viewers) emitLiveShare({ uid: viewer.uid, tabId: viewer.tabId, message: {
                    type: 'broadcast:paused', sessionId: room._id, reason: '老师正在切换页面，稍后自动恢复。',
                } });
            }
            const session = await share.sessionFor(this.peer);
            if (session) {
                const teacher = session.teacherUid === this.peer.uid;
                emitLiveShare({ uid: teacher ? session.studentUid : session.teacherUid,
                    tabId: teacher ? session.studentTabId : session.teacherTabId,
                    message: { type: 'paused', sessionId: session._id, pageId: session.pageId, reason: '对方正在切换页面或暂时离线，等待重新连接。' } });
            }
        }
    }
}

export async function injectLiveShare(handler: Handler) {
    if (handler.request.method.toUpperCase() !== 'GET' || handler.response.redirect || handler.response.status >= 400 || !handler.response.template
        || handler.user?._id <= 1 || !handler.user?.hasPriv(PRIV.PRIV_USER_PROFILE) || handler.session.sudoUid) return;
    // A shared contest reads and judges in its source domain, but the browser
    // stays in the classroom that admitted the participant. Bind capture to
    // that server-validated classroom, not to the storage domain or a query hint.
    const pageDomain = handler.contestEntryContext?.domain || handler.domain;
    let domainId = pageDomain._id;
    let canTeach = false;
    try { await share.teacherScope(handler.user._id, domainId); canTeach = true; } catch {
        const workspaceDoc = (handler as Handler & { workspaceDoc?: { _id: string } }).workspaceDoc;
        if (workspaceDoc) {
            const domains = await workspace.getDomains(workspaceDoc._id);
            for (const item of domains) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    await share.teacherScope(handler.user._id, item._id);
                    canTeach = true; domainId = item._id; break;
                } catch { /* Try the next authorized classroom. */ }
            }
        }
    }
    let pageGrant: string;
    if (!canTeach) {
        const path = `${handler.request.originalPath}${handler.context.request.querystring ? `?${handler.context.request.querystring}` : ''}`;
        const page = sharePage(path);
        if (!page) return;
        try {
            await share.studentScope(handler.user._id, domainId);
        } catch {
            // Site-wide pages such as /daily-quiz resolve to the system domain,
            // which is not necessarily one of this learner's joined classrooms.
            // The HTTP page has already passed its own authorization. Bind only
            // unqualified pages to a currently permitted classroom; an explicit
            // /d/... page must never fall back to a different domain.
            if (page.domainId) return;
            const workspaceDoc = (handler as Handler & { workspaceDoc?: { _id: string } }).workspaceDoc;
            const spaces = [...new Set([workspaceDoc?._id, workspace.resolveDomainWorkspaceId(pageDomain),
                ...await workspace.getAssignedWorkspaceIds(handler.user._id)].filter(Boolean))];
            let found = false;
            for (const space of spaces) {
                // eslint-disable-next-line no-await-in-loop
                for (const item of await workspace.getDomains(space)) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        await share.studentScope(handler.user._id, item._id);
                        domainId = item._id; found = true; break;
                    } catch { /* Only an actually joined, active classroom may provide the grant. */ }
                }
                if (found) break;
            }
            if (!found) return;
        }
        try { pageGrant = await share.issuePageGrant(handler.user._id, domainId, path); } catch { return; }
    } else {
        const path = `${handler.request.originalPath}${handler.context.request.querystring ? `?${handler.context.request.querystring}` : ''}`;
        // Teachers may still assist from a private page, but cannot broadcast it
        // without the same rendered-GET, exact-path grant used by learners.
        try { pageGrant = await share.issuePageGrant(handler.user._id, domainId, path); } catch { /* Assistance remains available. */ }
    }
    handler.UiContext.liveShare = {
        enabled: true, uid: handler.user._id, canTeach, pageGrant, domainId, socketUrl: handler.url('live_share_conn', { domainId }),
    };
}

export function apply(ctx: Context) {
    ctx.Connection('live_share_conn', '/live-share/conn', LiveShareConnectionHandler, PRIV.PRIV_USER_PROFILE);
    ctx.on('handler/after', injectLiveShare);
}
