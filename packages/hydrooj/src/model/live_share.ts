import { randomBytes } from 'crypto';
import {
    LIVE_SHARE_GRANT_MS, LIVE_SHARE_LEASE_MS, LIVE_SHARE_RECONNECT_MS, LiveShareError,
    ShareConnection, ShareParticipant, ShareSession, sharePage,
} from '../lib/live_share';
import db from '../service/db';
import { BUILTIN_ROLES, PERM, PRIV } from './builtin';
import domain from './domain';
import { coll as users } from './user';
import workspace from './workspace';

export interface SharePresence {
    _id: string; uid: number; tabId: string; pageId: string; connectionId: string; deviceId: string;
    domainId: string; workspaceId: string; url: string; title: string;
    visible: boolean; canTeach: boolean; connected: boolean; expiresAt: Date; serverId: string;
}
interface ShareGrant { _id: string; uid: number; domainId: string; url: string; expiresAt: Date }
export interface ShareEvent {
    uid: number; tabId: string; message: Record<string, any>;
    /** Server-selected broadcast recipients share one IPC payload, never supplied by a client. */
    recipients?: { uid: number, tabId: string }[];
}
interface ShareOccupancy {
    _id: number; roomId: string; kind: 'assist' | 'broadcast'; expiresAt: Date;
    transportId?: string; connectionVersion?: number; closed?: boolean;
    switching?: { requestId: string; expiresAt: Date };
    lastSwitch?: { requestId: string; fromId: string; mode: string; studentUid?: number };
}

declare module '../service/db' {
    interface Collections {
        'live.share.presence': SharePresence;
        'live.share.session': ShareSession;
        'live.share.grant': ShareGrant;
        'live.share.occupancy': ShareOccupancy;
    }
}
declare module '../service/bus' {
    interface EventMap { 'live-share/event': (event: ShareEvent) => void }
}

export const presence = db.collection('live.share.presence');
export const sessions = db.collection('live.share.session');
export const grants = db.collection('live.share.grant');
export const occupancy = db.collection('live.share.occupancy');
export const opaqueShareId = () => randomBytes(24).toString('hex');
export const presenceKey = (uid: number, tabId: string) => `${uid}:${tabId}`;
const profile = (account: any) => account?._id > 1 && (account.priv & PRIV.PRIV_USER_PROFILE) === PRIV.PRIV_USER_PROFILE;
const systemAdmin = (account: any) => (account.priv & PRIV.PRIV_EDIT_SYSTEM) === PRIV.PRIV_EDIT_SYSTEM;
const nameOf = (account: any) => String(account.displayName || account.uname || account._id).slice(0, 80);
type Emit = (event: ShareEvent) => void;

/** A single atomic slot per account prevents assistance and a broadcast racing each other. */
export async function claimParticipants(kind: ShareOccupancy['kind'], roomId: string, uids: number[], now = Date.now()) {
    const claimed: number[] = [];
    try {
        for (const uid of [...new Set(uids)].sort((a, b) => a - b)) {
            // eslint-disable-next-line no-await-in-loop
            await occupancy.findOneAndUpdate({ _id: uid, $or: [{ roomId }, { expiresAt: { $lte: new Date(now) } }] },
                { $set: { roomId, kind, expiresAt: new Date(now + LIVE_SHARE_RECONNECT_MS) } }, { upsert: true });
            claimed.push(uid);
        }
    } catch (error) {
        await occupancy.deleteMany({ _id: { $in: claimed }, roomId });
        if (error.code === 11000) throw new LiveShareError('BUSY', '老师或学员正在共享／分享中，请先结束当前连接。');
        throw error;
    }
}

export async function releaseParticipants(roomId: string, uids?: number[]) {
    await occupancy.deleteMany({ roomId, ...(uids ? { _id: { $in: uids } } : {}) });
}

export const connectionKey = (room: ShareConnection) => room.connectionId || room._id;
export const connectionInfo = (room: ShareConnection) => ({ connectionId: connectionKey(room), connectionVersion: room.connectionVersion || 0 });
const retiredTransports = new Map<string, number>();
export function retireTransport(id: string) {
    const now = Date.now();
    for (const [key, until] of retiredTransports) if (until < now) retiredTransports.delete(key);
    retiredTransports.set(id, now + LIVE_SHARE_RECONNECT_MS);
}
export const transportRetired = (id: string) => (retiredTransports.get(id) || 0) > Date.now();

/** The teacher's single occupancy row is the atomic authority across both room collections. */
export async function currentTransport(room: ShareConnection) {
    if (transportRetired(room._id)) return false;
    const slot = await occupancy.findOne({ _id: room.teacherUid });
    if (!slot) return false;
    return slot.roomId === connectionKey(room) && !slot.closed && (!slot.transportId || slot.transportId === room._id);
}

export async function bindTransport(room: ShareConnection) {
    const updated = await occupancy.updateOne({ _id: room.teacherUid, roomId: connectionKey(room), closed: { $ne: true },
        $or: [{ transportId: room._id }, { transportId: { $exists: false } }] },
    { $set: { transportId: room._id, connectionVersion: room.connectionVersion || 0 } });
    if (!updated.matchedCount) throw new LiveShareError('STALE_SESSION', '共享方向已切换，请等待当前画面。');
}

export async function pulseParticipants(room: ShareConnection, kind: ShareOccupancy['kind'], uids: number[], now: number) {
    const updated = await occupancy.updateOne({ _id: room.teacherUid, roomId: connectionKey(room), closed: { $ne: true },
        $or: [{ transportId: room._id }, { transportId: { $exists: false } }] },
    { $set: { expiresAt: new Date(now + LIVE_SHARE_RECONNECT_MS), transportId: room._id } });
    if (!updated.matchedCount) throw new LiveShareError('STALE_SESSION', '共享方向已切换，请等待当前画面。');
    // Never overwrite the teacher authority from a stale asynchronous heartbeat.
    const members = [...new Set(uids.filter((uid) => uid !== room.teacherUid))];
    const renewed = await occupancy.updateMany({ _id: { $in: members }, roomId: connectionKey(room) },
        { $set: { expiresAt: new Date(now + LIVE_SHARE_RECONNECT_MS) } });
    if (renewed.matchedCount !== members.length) throw new LiveShareError('STALE_SESSION', '原连接已结束，请重新连接。');
}

export async function connectionDeparture(room: ShareConnection) {
    const slot = await occupancy.findOne({ _id: room.teacherUid, roomId: connectionKey(room), closed: { $ne: true } });
    return { ...connectionInfo(room), ...(slot?.transportId && slot.transportId !== room._id ? {
        switched: true, connectionVersion: slot.connectionVersion || 0,
    } : {}) };
}

export async function closeConnection(room: ShareConnection, participants: ShareParticipant[], emit: Emit) {
    const result = await occupancy.findOneAndUpdate({ _id: room.teacherUid, roomId: connectionKey(room), closed: { $ne: true },
        $or: [{ transportId: room._id }, { transportId: { $exists: false } }] }, { $set: { closed: true } });
    if (!result && room.connectionId) return false;
    if (!result && !await currentTransport(room)) return false;
    retireTransport(room._id);
    await releaseParticipants(connectionKey(room));
    const online = await presence.find({ uid: { $in: participants.map((p) => p.uid) }, connected: true }).toArray();
    const audience = new Map([[`${room.teacherUid}:${room.teacherTabId}`, { uid: room.teacherUid, tabId: room.teacherTabId }],
        ...participants.map((p) => [`${p.uid}:${p.tabId}`, { uid: p.uid, tabId: p.tabId }] as const),
        ...online.filter((p) => participants.some((member) => member.uid === p.uid && member.deviceId === p.deviceId))
            .map((p) => [`${p.uid}:${p.tabId}`, { uid: p.uid, tabId: p.tabId }] as const)]);
    for (const { uid, tabId } of audience.values()) emit({ uid, tabId, message: { type: 'connection:ended', ...connectionInfo(room) } });
    return true;
}

async function accountAndDomain(uid: number, domainId: string) {
    const [account, classroom] = await Promise.all([
        users.findOne({ _id: uid }, { projection: { _id: 1, priv: 1, uname: 1, displayName: 1 } }), domain.get(domainId),
    ]);
    if (!profile(account) || !classroom) throw new LiveShareError('FORBIDDEN', '账号或课堂已不可用。');
    const workspaceId = workspace.resolveDomainWorkspaceId(classroom);
    const space = await workspace.get(workspaceId);
    if (!space || space.status !== 'active') throw new LiveShareError('FORBIDDEN', '老师工作区已不可用。');
    return { account, classroom, workspaceId };
}

/** Fresh DB membership checks deliberately bypass the 5-minute User cache. */
export async function teacherScope(uid: number, domainId: string) {
    const scope = await accountAndDomain(uid, domainId);
    const [member, domainMember, assigned] = await Promise.all([
        workspace.getMember(scope.workspaceId, uid), domain.getDomainUser(domainId, scope.account), workspace.getAssignedWorkspaceIds(uid),
    ]);
    const platform = workspace.isPlatformAdmin(uid);
    const legacyAdmin = scope.workspaceId === workspace.LEGACY_WORKSPACE_ID && systemAdmin(scope.account);
    const teacherMember = member && ['owner', 'admin', 'teacher'].includes(member.role);
    const editsDomain = (BigInt(domainMember.perm || 0) & PERM.PERM_EDIT_DOMAIN) === PERM.PERM_EDIT_DOMAIN;
    const legacyTeacher = scope.workspaceId === workspace.LEGACY_WORKSPACE_ID && domainMember.join && editsDomain;
    if ((!platform && assigned.length && !assigned.includes(scope.workspaceId))
        || (!platform && !legacyAdmin && !legacyTeacher && (!teacherMember || !editsDomain))
        || (!platform && domainMember.blockedByStudentManagement)) {
        throw new LiveShareError('FORBIDDEN', '你没有权限共享这个课堂的学员页面。');
    }
    return { ...scope, name: nameOf(scope.account) };
}

export async function studentScope(uid: number, domainId: string) {
    const scope = await accountAndDomain(uid, domainId);
    const [member, staff, student, assigned] = await Promise.all([
        domain.getDomainUser(domainId, scope.account), workspace.getMember(scope.workspaceId, uid),
        workspace.collStudent.findOne({ workspaceId: scope.workspaceId, uid }), workspace.getAssignedWorkspaceIds(uid),
    ]);
    if (systemAdmin(scope.account) || (scope.account.priv & PRIV.PRIV_JUDGE) === PRIV.PRIV_JUDGE || staff
        || !member.join || member.blockedByStudentManagement || student?.status === 'disabled'
        || (BigInt(member.perm || 0) & PERM.PERM_VIEW) !== PERM.PERM_VIEW
        || (BigInt(member.perm || 0) & PERM.PERM_EDIT_DOMAIN) === PERM.PERM_EDIT_DOMAIN
        || (assigned.length && !assigned.includes(scope.workspaceId))) {
        throw new LiveShareError('FORBIDDEN', '该学员已不在可共享的课堂范围内。');
    }
    return { ...scope, name: nameOf(scope.account) };
}

export async function authorizePair(teacherUid: number, studentUid: number, domainId: string) {
    if (teacherUid === studentUid) throw new LiveShareError('FORBIDDEN', '请选择学员账号。');
    const [teacher, student] = await Promise.all([teacherScope(teacherUid, domainId), studentScope(studentUid, domainId)]);
    return { teacher, student };
}

export async function issuePageGrant(uid: number, domainId: string, url: string, now = Date.now()) {
    const page = sharePage(url);
    if (!page || (page.domainId && page.domainId !== domainId)) throw new LiveShareError('UNSUPPORTED_PAGE', '当前页面不支持共享。');
    const grant: ShareGrant = { _id: opaqueShareId(), uid, domainId, url: page.path, expiresAt: new Date(now + LIVE_SHARE_GRANT_MS) };
    await grants.insertOne(grant);
    return grant._id;
}

export async function verifyPageGrant(uid: number, domainId: string, token: string, url: string, now = Date.now()) {
    const page = sharePage(url);
    if (!page || (page.domainId && page.domainId !== domainId) || typeof token !== 'string') return false;
    return !!await grants.findOne({ _id: token, uid, domainId, url: page.path, expiresAt: { $gt: new Date(now) } });
}

/** Keep the currently rendered page reconnectable while its authenticated host stays open. */
export async function renewPageGrant(item: SharePresence, token: string, now = Date.now()) {
    const page = sharePage(item.url);
    if (!page || (page.domainId && page.domainId !== item.domainId) || typeof token !== 'string') return false;
    const scope = item.canTeach ? await teacherScope(item.uid, item.domainId) : await studentScope(item.uid, item.domainId);
    if (scope.workspaceId !== item.workspaceId) throw new LiveShareError('FORBIDDEN', '不能共享其他工作区的页面。');
    // Extend only the same unexpired token issued by authorized HTTP rendering.
    // This cannot mint a grant, change its route, or revive an expired grant.
    const result = await grants.updateOne({ _id: token, uid: item.uid, domainId: item.domainId, url: page.path,
        expiresAt: { $gt: new Date(now) } }, { $max: { expiresAt: new Date(now + LIVE_SHARE_GRANT_MS) } });
    return !!result.matchedCount;
}

export async function connectPresence(value: Omit<SharePresence, '_id' | 'expiresAt' | 'connected'>, now = Date.now()) {
    if (await presence.countDocuments({ uid: value.uid, tabId: { $ne: value.tabId }, connected: true,
        expiresAt: { $gt: new Date(now) } }) >= 8) throw new LiveShareError('TOO_MANY_TABS', '打开的学习页面较多，请关闭部分标签页后重试。');
    const item: SharePresence = { ...value, _id: presenceKey(value.uid, value.tabId), connected: true, expiresAt: new Date(now + LIVE_SHARE_LEASE_MS) };
    await presence.replaceOne({ _id: item._id }, item, { upsert: true });
    return item;
}

export async function pulsePresence(item: SharePresence, visible: boolean, now = Date.now()) {
    const updated = await presence.updateOne({ _id: item._id, connectionId: item.connectionId },
        { $set: { visible, connected: true, expiresAt: new Date(now + LIVE_SHARE_LEASE_MS) } });
    if (!updated.matchedCount) throw new LiveShareError('REPLACED', '此标签页已重新连接。');
    item.visible = visible;
    item.expiresAt = new Date(now + LIVE_SHARE_LEASE_MS);
}

/** A persistent browser host changes its granted page without replacing its connection. */
export async function updatePresencePage(item: SharePresence, page: {
    pageId: string; domainId?: string; pageGrant?: string; url: string; title: string; visible: boolean;
}, now = Date.now()) {
    const domainId = page.domainId || item.domainId;
    const scope = item.canTeach ? await teacherScope(item.uid, domainId) : await studentScope(item.uid, domainId);
    if (scope.workspaceId !== item.workspaceId) throw new LiveShareError('FORBIDDEN', '不能共享其他工作区的页面。');
    // An empty URL explicitly pauses capture during navigation or a sensitive page.
    // A nonempty URL always requires a new exact-path grant from authorized HTTP rendering.
    if (page.url && !await verifyPageGrant(item.uid, domainId, page.pageGrant, page.url, now)) {
        throw new LiveShareError('UNSUPPORTED_PAGE', '当前页面尚未获准共享。');
    }
    const change = { pageId: page.pageId, domainId, url: page.url, title: page.title,
        visible: page.visible && (!!page.url || item.canTeach), expiresAt: new Date(now + LIVE_SHARE_LEASE_MS) };
    const result = await presence.updateOne({ _id: item._id, connectionId: item.connectionId, connected: true }, { $set: change });
    if (!result.matchedCount) throw new LiveShareError('REPLACED', '此标签页已重新连接。');
    return Object.assign(item, change);
}

export async function disconnectPresence(item: SharePresence) {
    const result = await presence.updateOne({ _id: item._id, connectionId: item.connectionId }, { $set: { connected: false } });
    return !!result.matchedCount;
}

export async function livePresence(uid: number, tabId: string, now = Date.now()) {
    return presence.findOne({ _id: presenceKey(uid, tabId), connected: true, expiresAt: { $gt: new Date(now) } });
}

export function notifySession(session: ShareSession, emit: Emit) {
    emit({ uid: session.teacherUid, tabId: session.teacherTabId, message: {
        type: 'started', sessionId: session._id, studentUid: session.studentUid, studentName: session.studentName,
        ...connectionInfo(session),
        teacherName: session.teacherName, tabId: session.studentTabId, pageId: session.pageId, pageUrl: session.pageUrl,
    } });
    emit({ uid: session.studentUid, tabId: session.studentTabId, message: {
        type: 'share-start', sessionId: session._id, teacherUid: session.teacherUid, teacherName: session.teacherName,
        ...connectionInfo(session),
        tabId: session.studentTabId, pageId: session.pageId, pageUrl: session.pageUrl,
    } });
}

export async function endSession(session: ShareSession, reason: string, emit: Emit) {
    const participants = session.returnAudience || [{ uid: session.studentUid, tabId: session.studentTabId,
        deviceId: session.studentDeviceId, domainId: session.domainId, name: session.studentName }];
    if (!await closeConnection(session, participants, emit)) return;
    const result = await sessions.updateOne({ _id: session._id, active: true },
        { $set: { active: false, expiresAt: new Date(Date.now() + LIVE_SHARE_RECONNECT_MS) } });
    if (!result.modifiedCount) return;
    for (const [uid, tabId] of [[session.teacherUid, session.teacherTabId], [session.studentUid, session.studentTabId]] as [number, string][]) {
        emit({ uid, tabId, message: { type: 'ended', sessionId: session._id, reason, ...connectionInfo(session) } });
    }
}

export async function sessionFor(item: SharePresence, now = Date.now()) {
    const session = await sessions.findOne({ active: true, expiresAt: { $gt: new Date(now) }, $or: [
        { teacherUid: item.uid, teacherTabId: item.tabId }, { studentUid: item.uid, studentTabId: item.tabId },
    ] });
    return session && await currentTransport(session) ? session : null;
}

export async function startSession(teacher: SharePresence, studentUid: number, tabId: string | undefined, emit: Emit, now = Date.now()) {
    await apply();
    const tabs = await presence.find({ uid: studentUid, canTeach: false, connected: true, workspaceId: teacher.workspaceId,
        expiresAt: { $gt: new Date(now) }, ...(tabId ? { tabId } : {}) }).sort({ visible: -1, expiresAt: -1 }).limit(1).toArray();
    const student = tabs[0];
    if (!student) throw new LiveShareError('OFFLINE', '学员当前没有在线的平台页面。');
    if (student.serverId !== teacher.serverId) throw new LiveShareError('DIFFERENT_SERVER', '当前共享仅支持同一服务实例，请重新连接后再试。');
    const scope = await authorizePair(teacher.uid, studentUid, student.domainId);
    if (scope.teacher.workspaceId !== teacher.workspaceId) throw new LiveShareError('FORBIDDEN', '无法跨工作区共享。');
    // Expired leases must not keep the unique active-participant indexes occupied.
    await sessions.updateMany({ active: true, expiresAt: { $lte: new Date(now) } }, { $set: { active: false } });
    const old = await sessions.findOne({ teacherUid: teacher.uid, active: true });
    if (old && old.teacherTabId === teacher.tabId && old.studentUid === studentUid && old.studentTabId === student.tabId) {
        const resumed = await refreshSession(old, emit, now);
        if (!resumed) throw new LiveShareError('OFFLINE', '学员正在切换页面，请稍后重试。');
        notifySession(resumed, emit);
        return resumed;
    }
    if (old) await endSession(old, '老师已切换共享对象。', emit);
    const session: ShareSession = {
        _id: opaqueShareId(), teacherUid: teacher.uid, teacherTabId: teacher.tabId, studentUid, studentTabId: student.tabId,
        studentDeviceId: student.deviceId,
        teacherDeviceId: teacher.deviceId,
        workspaceId: teacher.workspaceId, domainId: student.domainId, pageId: student.pageId, pageUrl: student.url,
        teacherName: scope.teacher.name, studentName: scope.student.name, active: true,
        createdAt: new Date(now), expiresAt: new Date(now + LIVE_SHARE_RECONNECT_MS),
    };
    session.connectionId = session._id; session.connectionVersion = 0;
    await claimParticipants('assist', session._id, [teacher.uid, studentUid], now);
    try { await bindTransport(session); await sessions.insertOne(session); } catch (error) {
        await releaseParticipants(session._id);
        if (error.code === 11000) throw new LiveShareError('BUSY', '该学员已经在共享中，请稍后再试。');
        throw error;
    }
    notifySession(session, emit);
    return session;
}

/** Revalidate both participants and bind the room to the learner's newest page. */
export async function refreshSession(session: ShareSession, emit: Emit, now = Date.now()) {
    try {
        if (!await currentTransport(session)) return null;
        const student = await livePresence(session.studentUid, session.studentTabId, now);
        if (!student || !student.visible || !student.url) return null;
        const pair = await authorizePair(session.teacherUid, session.studentUid, student.domainId);
        if (student.workspaceId !== session.workspaceId || pair.teacher.workspaceId !== session.workspaceId) {
            throw new LiveShareError('FORBIDDEN', '学员已离开当前工作区。');
        }
        const teacher = await livePresence(session.teacherUid, session.teacherTabId, now);
        if (!teacher) return null;
        if (teacher.serverId !== student.serverId) throw new LiveShareError('DIFFERENT_SERVER', '共享双方连接到了不同服务实例，请重新连接。');
        await pulseParticipants(session, 'assist', [session.teacherUid, session.studentUid,
            ...(session.returnAudience || []).map((viewer) => viewer.uid)], now);
        const updated = await sessions.findOneAndUpdate({ _id: session._id, active: true, studentTabId: session.studentTabId,
            pageId: session.pageId, expiresAt: { $gt: new Date(now) } }, {
            $set: { pageId: student.pageId, pageUrl: student.url, domainId: student.domainId, expiresAt: new Date(now + LIVE_SHARE_RECONNECT_MS) },
        }, { returnDocument: 'after' });
        const current = updated || await sessions.findOne({ _id: session._id, active: true, studentTabId: session.studentTabId,
            expiresAt: { $gt: new Date(now) } });
        return current;
    } catch (error) {
        if (error instanceof LiveShareError && error.code === 'STALE_SESSION') return null;
        if (error instanceof LiveShareError) await endSession(session, error.message, emit);
        throw error;
    }
}

/** The authenticated learner may move this room only within the originally selected browser/device. */
export async function followStudentTab(item: SharePresence, emit: Emit, now = Date.now()) {
    if (item.canTeach || !item.visible) return null;
    const session = await sessions.findOne({ studentUid: item.uid, studentDeviceId: item.deviceId, active: true,
        expiresAt: { $gt: new Date(now) } });
    if (!session || session.studentTabId === item.tabId) return null;
    if (!await currentTransport(session)) return null;
    const pair = await authorizePair(session.teacherUid, item.uid, item.domainId);
    const teacher = await livePresence(session.teacherUid, session.teacherTabId, now);
    if (!teacher) return null;
    if (pair.teacher.workspaceId !== session.workspaceId || item.workspaceId !== session.workspaceId || teacher.serverId !== item.serverId) {
        throw new LiveShareError('FORBIDDEN', '不能跟随到其他工作区或服务实例。');
    }
    const updated = await sessions.findOneAndUpdate({ _id: session._id, active: true, studentTabId: session.studentTabId,
        pageId: session.pageId, studentDeviceId: item.deviceId, expiresAt: { $gt: new Date(now) } }, {
        $set: { studentTabId: item.tabId, pageId: item.pageId, pageUrl: item.url, domainId: item.domainId, expiresAt: new Date(now + LIVE_SHARE_RECONNECT_MS) },
    }, { returnDocument: 'after' });
    if (!updated) return null;
    // End just the old tab's source adapters; the room itself remains active.
    emit({ uid: session.studentUid, tabId: session.studentTabId,
        message: { type: 'ended', sessionId: session._id, followed: true, reason: '已跟随到你的当前学习页面。' } });
    notifySession(updated, emit);
    return updated;
}

export async function listStudents(teacherUid: number, domainId: string, now = Date.now()) {
    const scope = await teacherScope(teacherUid, domainId);
    const allDomains = await workspace.getDomains(scope.workspaceId);
    const permitted = (await Promise.all(allDomains.map(async (item) => {
        try { await teacherScope(teacherUid, item._id); return item._id; } catch { return null; }
    }))).filter(Boolean);
    const memberships = await domain.collUser.find({ domainId: { $in: permitted }, uid: { $gt: 1 }, join: true,
        blockedByStudentManagement: { $ne: true } }).project({ uid: 1, domainId: 1, role: 1 }).toArray();
    const byUid = new Map<number, string[]>();
    for (const item of memberships) {
        const classroom = allDomains.find((value) => value._id === item.domainId);
        const role = item.role || 'default';
        const permissions = BigInt(classroom?.roles?.[role] ?? BUILTIN_ROLES[role] ?? 0);
        if ((permissions & PERM.PERM_VIEW) !== PERM.PERM_VIEW || (permissions & PERM.PERM_EDIT_DOMAIN) === PERM.PERM_EDIT_DOMAIN) continue;
        byUid.set(item.uid, [...byUid.get(item.uid) || [], item.domainId]);
    }
    const candidates = [...byUid.keys()].slice(0, 1000);
    const online = await presence.find({ uid: { $in: candidates }, workspaceId: scope.workspaceId, domainId: { $in: permitted },
        canTeach: false, connected: true, expiresAt: { $gt: new Date(now) } }).limit(3000).toArray();
    const [studentAccounts, staff, disabled] = await Promise.all([
        users.find({ _id: { $in: candidates } }, { projection: { _id: 1, priv: 1, uname: 1, displayName: 1 } }).toArray(),
        workspace.getMembers(scope.workspaceId),
        workspace.collStudent.distinct('uid', { workspaceId: scope.workspaceId, status: 'disabled' }),
    ]);
    const excluded = new Set([...staff.map((item) => item.uid), ...disabled]);
    return studentAccounts.filter((account) => profile(account) && !systemAdmin(account)
        && (account.priv & PRIV.PRIV_JUDGE) !== PRIV.PRIV_JUDGE && !excluded.has(account._id)).map((account) => {
        const tabs = online.filter((item) => item.uid === account._id && byUid.get(account._id).includes(item.domainId))
            .map((item) => ({ tabId: item.tabId, title: item.title, visible: item.visible }));
        return { uid: account._id, name: nameOf(account), online: tabs.length > 0, tabs };
    }).sort((a, b) => Number(b.online) - Number(a.online) || a.uid - b.uid);
}

let indexesReady: Promise<any>;
export function apply() {
    indexesReady ||= Promise.all([
        db.ensureIndexes(presence, { key: { expiresAt: 1 }, name: 'live_share_presence_expiry', expireAfterSeconds: 0 },
            { key: { workspaceId: 1, uid: 1 }, name: 'live_share_presence_workspace' }),
        db.ensureIndexes(grants, { key: { expiresAt: 1 }, name: 'live_share_grant_expiry', expireAfterSeconds: 0 }),
        db.ensureIndexes(occupancy, { key: { expiresAt: 1 }, name: 'live_share_occupancy_expiry', expireAfterSeconds: 0 }),
        // Room exclusivity is a correctness boundary: fail closed if these
        // indexes cannot be installed, rather than relying on a logged warning.
        sessions.createIndexes([{ key: { expiresAt: 1 }, name: 'live_share_session_expiry', expireAfterSeconds: 0 },
            { key: { teacherUid: 1 }, name: 'live_share_one_student_per_teacher', unique: true, partialFilterExpression: { active: true } },
            { key: { studentUid: 1 }, name: 'live_share_one_teacher_per_student', unique: true, partialFilterExpression: { active: true } }]),
    ]).catch((error) => { indexesReady = undefined; throw error; });
    return indexesReady;
}
