import { hostname } from 'os';
import { BSON } from 'mongodb';
import type { Context } from '../context';
import {
    authorizeRelay, checkShareOrigin, LIVE_SHARE_MAX_BYTES, LiveShareError, ShareRateLimit, ShareSession,
    sessionRole, sharePage, validateRelayData, validateShareMessage,
} from '../lib/live_share';
import { PERM, PRIV } from '../model/builtin';
import * as share from '../model/live_share';
import token from '../model/token';
import workspace from '../model/workspace';
import bus from '../service/bus';
import { ConnectionHandler, Handler, subscribe } from '../service/server';

const cluster = process.env.exec_mode === 'cluster_mode';
const serverId = cluster ? `${hostname()}:${process.env.name || 'hydro'}` : share.opaqueShareId();
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
    private queue = Promise.resolve();
    private outgoing = Promise.resolve();
    private outgoingBytes = 0;
    private currentSession: ShareSession;
    private lastAuthorization = 0;
    private lastPeerCheck = 0;
    private lastLoginCheck = 0;
    private lastDiscovery = 0;
    private paused = false;
    private checking = false;
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
        try {
            validateShareMessage(payload);
            this.limiter.accept(payload);
            if (this.pending >= 16) throw new LiveShareError('BACKPRESSURE', '共享正在重新同步，请稍候。');
        } catch (error) { this.report(error); return; }
        this.pending++;
        this.queue = this.queue.then(async () => { if (!this.disposed) await this.processMessage(payload); })
            .catch((error) => this.report(error)).finally(() => { this.pending--; });
        await this.queue;
    }

    private report(error: any) {
        if (this.disposed) return;
        const known = error instanceof LiveShareError;
        this.send({ type: 'error', code: known ? error.code : 'UNAVAILABLE', message: known ? error.message : '共享暂时不可用，请稍后重新连接。' });
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
            if (!this.canTeach && !await share.verifyPageGrant(this.user._id, this.domain._id, payload.pageGrant, payload.url)) {
                throw new LiveShareError('UNSUPPORTED_PAGE', '当前页面尚未获准共享，请刷新页面。');
            }
            const scope = this.canTeach ? await share.teacherScope(this.user._id, this.domain._id)
                : await share.studentScope(this.user._id, this.domain._id);
            this.peer = await share.connectPresence({ uid: this.user._id, tabId: payload.tabId, pageId: payload.pageId,
                connectionId: this.connectionId, deviceId: payload.deviceId, domainId: this.domain._id, workspaceId: scope.workspaceId,
                url: this.canTeach ? '' : payload.url, title: payload.title, visible: payload.visible, canTeach: this.canTeach, serverId });
            emitLiveShare({ uid: this.peer.uid, tabId: this.peer.tabId,
                message: { type: 'peer-connected', connectionId: this.connectionId } });
            this.lastPeerCheck = Date.now();
            this.send({ type: 'ready', uid: this.user._id, canTeach: this.canTeach });
            await share.followStudentTab(this.peer, emitLiveShare);
            this.currentSession = await share.sessionFor(this.peer);
            await this.checkSession(true);
            return;
        }
        if (!this.peer) throw new LiveShareError('NOT_READY', '共享连接正在准备，请稍候。');
        if (Date.now() - this.lastPeerCheck > 3000 || payload.type !== 'relay') {
            const connected = await share.livePresence(this.peer.uid, this.peer.tabId);
            if (!connected || connected.connectionId !== this.connectionId) {
                this.close(1013, 'Presence expired, reconnect');
                throw new LiveShareError('REPLACED', '页面已重新连接，正在恢复共享。');
            }
            this.lastPeerCheck = Date.now();
        }
        if (payload.type === 'pulse') {
            await share.pulsePresence(this.peer, payload.visible);
            if (!this.canTeach && !payload.visible && this.currentSession) {
                for (const [uid, tabId] of [[this.currentSession.teacherUid, this.currentSession.teacherTabId],
                    [this.currentSession.studentUid, this.currentSession.studentTabId]] as [number, string][]) {
                    emitLiveShare({ uid, tabId, message: { type: 'paused', sessionId: this.currentSession._id,
                        reason: '学员已切换标签页，等待当前学习页面。' } });
                }
            }
            if (!this.canTeach && this.currentSession?.studentTabId !== this.peer.tabId) {
                this.currentSession = await share.followStudentTab(this.peer, emitLiveShare) || this.currentSession;
            }
            await this.checkSession();
        } else if (payload.type === 'list') {
            if (!this.canTeach) throw new LiveShareError('FORBIDDEN', '只有老师可以选择共享学员。');
            this.send({ type: 'students', students: await share.listStudents(this.peer.uid, this.domain._id) });
        } else if (payload.type === 'start') {
            if (!this.canTeach) throw new LiveShareError('FORBIDDEN', '只有老师可以发起共享。');
            await share.teacherScope(this.peer.uid, this.domain._id);
            this.currentSession = await share.startSession(this.peer, payload.studentUid, payload.tabId, emitLiveShare);
            this.lastAuthorization = Date.now();
        } else if (payload.type === 'stop') {
            const session = await share.sessions.findOne({ _id: payload.sessionId });
            if (!session || sessionRole(session, this.peer.uid, this.peer.tabId) !== 'teacher') {
                throw new LiveShareError('FORBIDDEN', '只有当前老师可以结束共享。');
            }
            if (session.active) await share.endSession(session, '老师已结束共享。', emitLiveShare);
            else this.send({ type: 'ended', sessionId: session._id, reason: '共享已结束。' });
        } else if (payload.type === 'relay') await this.relay(payload);
    }

    private async relay(payload: any) {
        let session = this.currentSession?._id === payload.sessionId ? this.currentSession : null;
        if (!session || Date.now() - this.lastAuthorization > 3000) {
            session = await share.sessions.findOne({ _id: payload.sessionId, active: true });
            if (!session || !sessionRole(session, this.peer.uid, this.peer.tabId)) throw new LiveShareError('ENDED', '共享已结束。');
            session = await share.refreshSession(session, emitLiveShare);
            if (!session) throw new LiveShareError('PAUSED', '正在等待对方重新连接。');
            this.currentSession = session;
            this.lastAuthorization = Date.now();
        }
        if (!session) throw new LiveShareError('ENDED', '共享已结束。');
        const role = authorizeRelay(session, this.peer.uid, this.peer.tabId, payload.pageId, payload.kind);
        validateRelayData(role, payload.kind, payload.data, payload.pageId);
        if (this.disposed) return;
        emitLiveShare({ uid: role === 'teacher' ? session.studentUid : session.teacherUid,
            tabId: role === 'teacher' ? session.studentTabId : session.teacherTabId, message: {
            type: 'relay', sessionId: session._id, pageId: session.pageId, kind: payload.kind, data: payload.data,
        } });
    }

    private async checkSession(announce = false) {
        if (!this.peer || this.checking || this.disposed) return;
        await this.checkLogin();
        if (!this.currentSession && !announce && Date.now() - this.lastDiscovery < 30000) return;
        this.checking = true;
        try {
            this.lastDiscovery = Date.now();
            const stored = this.currentSession ? await share.sessions.findOne({ _id: this.currentSession._id, active: true })
                : await share.sessionFor(this.peer);
            if (!stored) {
                if (this.currentSession) this.send({ type: 'ended', sessionId: this.currentSession._id, reason: '共享已结束。' });
                this.currentSession = null;
                return;
            }
            if (!sessionRole(stored, this.peer.uid, this.peer.tabId)) { this.currentSession = null; return; }
            if (+stored.expiresAt <= Date.now()) { await share.endSession(stored, '共享连接已超时，请重新选择学员。', emitLiveShare); return; }
            this.currentSession = stored;
            const refreshed = await share.refreshSession(stored, emitLiveShare);
            this.lastAuthorization = Date.now();
            if (!refreshed) {
                if (!this.paused) this.send({ type: 'paused', sessionId: stored._id, reason: '对方正在切换页面或暂时离线，等待重新连接。' });
                this.paused = true;
                return;
            }
            if (announce || this.paused || stored.pageId !== refreshed.pageId) share.notifySession(refreshed, emitLiveShare);
            this.paused = false;
            this.currentSession = refreshed;
        } finally { this.checking = false; }
    }

    @subscribe('live-share/event')
    async onShareEvent(event: share.ShareEvent) {
        if (this.disposed || !this.peer || event.uid !== this.peer.uid || event.tabId !== this.peer.tabId) return;
        const bytes = Buffer.byteLength(JSON.stringify(event));
        if (this.outgoingBytes + bytes > 2 * 1024 * 1024) { this.close(1013, 'Shared view needs resynchronization'); return; }
        this.outgoingBytes += bytes;
        this.outgoing = this.outgoing.then(() => this.deliver(event)).catch((error) => this.report(error))
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
        if (['ended', 'paused'].includes(event.message.type)) {
            this.currentSession = null; this.lastAuthorization = 0; this.lastDiscovery = 0;
            if (event.message.type === 'paused') this.paused = true;
        }
        if (['started', 'share-start'].includes(event.message.type)) {
            this.currentSession = await share.sessions.findOne({ _id: event.message.sessionId, active: true });
            this.lastAuthorization = 0;
        }
        if (event.message.type === 'relay') {
            if (!this.currentSession || this.currentSession._id !== event.message.sessionId
                || this.currentSession.pageId !== event.message.pageId) return;
        }
        this.send(event.message);
    }

    @subscribe('user/delcache')
    onUserPermissionsChanged() { this.lastAuthorization = 0; }

    @subscribe('domain/delete-cache')
    onDomainPermissionsChanged() { this.lastAuthorization = 0; }

    async cleanup() {
        this.disposed = true;
        if (this.peer) {
            if (!await share.disconnectPresence(this.peer)) return;
            const session = await share.sessionFor(this.peer);
            if (session) {
                const teacher = session.teacherUid === this.peer.uid;
                emitLiveShare({ uid: teacher ? session.studentUid : session.teacherUid,
                    tabId: teacher ? session.studentTabId : session.teacherTabId,
                    message: { type: 'paused', sessionId: session._id, reason: '对方正在切换页面或暂时离线，等待重新连接。' } });
            }
        }
    }
}

export async function injectLiveShare(handler: Handler) {
    if (handler.request.method.toUpperCase() !== 'GET' || handler.response.redirect || handler.response.status >= 400 || !handler.response.template
        || handler.user?._id <= 1 || !handler.user?.hasPriv(PRIV.PRIV_USER_PROFILE) || handler.session.sudoUid) return;
    let domainId = handler.domain._id;
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
            const spaces = [...new Set([workspaceDoc?._id, workspace.resolveDomainWorkspaceId(handler.domain),
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
    }
    handler.UiContext.liveShare = {
        enabled: true, uid: handler.user._id, canTeach, pageGrant, socketUrl: handler.url('live_share_conn', { domainId }),
    };
}

export function apply(ctx: Context) {
    ctx.Connection('live_share_conn', '/live-share/conn', LiveShareConnectionHandler, PRIV.PRIV_USER_PROFILE);
    ctx.on('handler/after', injectLiveShare);
}
