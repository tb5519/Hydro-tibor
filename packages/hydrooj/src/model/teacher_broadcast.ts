import { clearTimeout, setTimeout } from 'timers';
import { LIVE_SHARE_RECONNECT_MS, LiveShareError } from '../lib/live_share';
import { BROADCAST_MAX_STUDENTS } from '../lib/teacher_broadcast';
import db from '../service/db';
import * as share from './live_share';

export interface BroadcastViewer { uid: number; tabId: string; deviceId: string; domainId: string; name: string }
export interface BroadcastRoom {
    _id: string; teacherUid: number; teacherTabId: string; teacherDeviceId: string; teacherName: string;
    workspaceId: string; domainId: string; pageId: string; viewers: BroadcastViewer[]; studentUids: number[];
    active: boolean; revision: number; lastSnapshotAt?: Date; createdAt: Date; expiresAt: Date;
}
declare module '../service/db' { interface Collections { 'live.broadcast.room': BroadcastRoom } }
export const rooms = db.collection('live.broadcast.room');
type Emit = (event: share.ShareEvent) => void;
const pendingSnapshots = new Map<string, ReturnType<typeof setTimeout>>();

export function role(room: BroadcastRoom, peer: share.SharePresence) {
    if (room.teacherUid === peer.uid && room.teacherTabId === peer.tabId) return 'teacher';
    return room.viewers.some((v) => v.uid === peer.uid && v.tabId === peer.tabId) ? 'student' : null;
}
export async function roomFor(peer: share.SharePresence, now = Date.now()) {
    return rooms.findOne({ active: true, expiresAt: { $gt: new Date(now) }, $or: [
        { teacherUid: peer.uid, teacherTabId: peer.tabId }, { viewers: { $elemMatch: { uid: peer.uid, tabId: peer.tabId } } },
    ] });
}
export async function notify(room: BroadcastRoom, emit: Emit, now = Date.now()) {
    const online = await share.presence.find({ uid: { $in: room.studentUids }, connected: true,
        expiresAt: { $gt: new Date(now) } }).project({ uid: 1, tabId: 1 }).toArray();
    const info = { sessionId: room._id, teacherUid: room.teacherUid, teacherName: room.teacherName,
        pageId: room.pageId, studentUids: room.studentUids, viewers: room.viewers.map((v) => ({
            uid: v.uid, name: v.name, online: online.some((p) => p.uid === v.uid && p.tabId === v.tabId),
        })) };
    emit({ uid: room.teacherUid, tabId: room.teacherTabId, message: { type: 'broadcast:started', ...info } });
    for (const viewer of room.viewers) emit({ uid: viewer.uid, tabId: viewer.tabId, message: { type: 'broadcast:view', ...info } });
    emit({ uid: room.teacherUid, tabId: room.teacherTabId, message: { type: 'broadcast:resync', sessionId: room._id, pageId: room.pageId } });
}
export async function end(room: BroadcastRoom, reason: string, emit: Emit) {
    const result = await rooms.updateOne({ _id: room._id, active: true },
        { $set: { active: false, expiresAt: new Date(Date.now() + LIVE_SHARE_RECONNECT_MS) } });
    if (!result.modifiedCount) return;
    clearTimeout(pendingSnapshots.get(room._id));
    pendingSnapshots.delete(room._id);
    await share.releaseParticipants(room._id);
    for (const [uid, tabId] of [[room.teacherUid, room.teacherTabId], ...room.viewers.map((v) => [v.uid, v.tabId])] as [number, string][]) {
        emit({ uid, tabId, message: { type: 'broadcast:ended', sessionId: room._id, reason } });
    }
}
export async function requestSnapshot(room: BroadcastRoom, emit: Emit, now = Date.now(), trailing = false) {
    // Thirty reconnecting viewers still cause at most one full-source capture a
    // second, rather than thirty snapshots competing with ordinary updates.
    const requested = await rooms.updateOne({ _id: room._id, active: true, pageId: room.pageId, $or: [
        { lastSnapshotAt: { $exists: false } }, { lastSnapshotAt: { $lte: new Date(now - 1000) } },
    ] }, { $set: { lastSnapshotAt: new Date(now) } });
    if (requested.modifiedCount) {
        emit({ uid: room.teacherUid, tabId: room.teacherTabId,
            message: { type: 'broadcast:resync', sessionId: room._id, pageId: room.pageId } });
    } else if (!trailing && !pendingSnapshots.has(room._id)) {
        // A late-loading viewer may have missed the first capture. Coalesce its
        // request rather than discard it, and re-read the active page at delivery.
        const timer = setTimeout(async () => {
            pendingSnapshots.delete(room._id);
            try {
                const current = await rooms.findOne({ _id: room._id, active: true, expiresAt: { $gt: new Date() } });
                if (current) await requestSnapshot(current, emit, Date.now(), true);
            } catch { /* Reconnecting clients request another capture. */ }
        }, 1100);
        timer.unref();
        pendingSnapshots.set(room._id, timer);
    }
}
export async function start(teacher: share.SharePresence, uids: number[], emit: Emit, now = Date.now()) {
    await apply();
    if (!teacher.canTeach || !teacher.url) throw new LiveShareError('UNSUPPORTED_PAGE', '请在可分享的教学页面开启分享模式。');
    if (!Array.isArray(uids) || !uids.length || uids.length > BROADCAST_MAX_STUDENTS
        || uids.some((uid) => !Number.isSafeInteger(uid) || uid <= 1 || uid === teacher.uid)
        || new Set(uids).size !== uids.length) throw new LiveShareError('INVALID_STUDENT', '请选择 1 至 30 位学员。');
    const scope = await share.teacherScope(teacher.uid, teacher.domainId);
    if (scope.workspaceId !== teacher.workspaceId) throw new LiveShareError('FORBIDDEN', '不能跨工作区分享。');
    const viewers: BroadcastViewer[] = [];
    for (const uid of uids) {
        // eslint-disable-next-line no-await-in-loop
        const student = await share.presence.find({ uid, canTeach: false, connected: true, workspaceId: teacher.workspaceId,
            expiresAt: { $gt: new Date(now) } }).sort({ visible: -1, expiresAt: -1 }).limit(1).next();
        if (!student) throw new LiveShareError('OFFLINE', '所选学员有暂时离线的，请刷新列表后重试。');
        if (student.serverId !== teacher.serverId) throw new LiveShareError('DIFFERENT_SERVER', '当前分享仅支持同一服务实例。');
        // eslint-disable-next-line no-await-in-loop
        const pair = await share.authorizePair(teacher.uid, uid, student.domainId);
        if (pair.teacher.workspaceId !== teacher.workspaceId) throw new LiveShareError('FORBIDDEN', '不能跨工作区分享。');
        viewers.push({ uid, tabId: student.tabId, deviceId: student.deviceId, domainId: student.domainId, name: pair.student.name });
    }
    await rooms.updateMany({ active: true, expiresAt: { $lte: new Date(now) } }, { $set: { active: false } });
    const old = await rooms.findOne({ teacherUid: teacher.uid, active: true });
    if (old) throw new LiveShareError('BUSY', '你已在分享中，请先结束当前分享。');
    // Rooms created before the shared occupancy table was introduced still count.
    if (await share.sessions.findOne({ active: true, expiresAt: { $gt: new Date(now) }, $or: [
        { teacherUid: { $in: [teacher.uid, ...uids] } }, { studentUid: { $in: [teacher.uid, ...uids] } },
    ] })) throw new LiveShareError('BUSY', '老师或学员正在共享中，请先结束当前连接。');
    const room: BroadcastRoom = { _id: share.opaqueShareId(), teacherUid: teacher.uid, teacherTabId: teacher.tabId,
        teacherDeviceId: teacher.deviceId, teacherName: scope.name, workspaceId: teacher.workspaceId,
        domainId: teacher.domainId, pageId: teacher.pageId, viewers, studentUids: [...uids], active: true, revision: 0,
        createdAt: new Date(now), expiresAt: new Date(now + LIVE_SHARE_RECONNECT_MS) };
    await share.claimParticipants('broadcast', room._id, [teacher.uid, ...uids], now);
    try { await rooms.insertOne(room); } catch (error) {
        await share.releaseParticipants(room._id);
        if (error.code === 11000) throw new LiveShareError('BUSY', '老师或学员已经在分享中。');
        throw error;
    }
    await notify(room, emit, now);
    return room;
}

/** Revalidate membership and source page; only the source extends the room lease. */
export async function refresh(room: BroadcastRoom, emit: Emit, now = Date.now()) {
    if (!room.active || +room.expiresAt <= now) { await end(room, '分享连接已结束。', emit); return null; }
    const teacher = await share.livePresence(room.teacherUid, room.teacherTabId, now);
    if (!teacher || !teacher.visible || !teacher.url) return null;
    try {
        const scope = await share.teacherScope(teacher.uid, teacher.domainId);
        if (scope.workspaceId !== room.workspaceId || teacher.workspaceId !== room.workspaceId) throw new LiveShareError('FORBIDDEN', '老师已离开当前工作区。');
        const viewers: BroadcastViewer[] = [];
        for (const viewer of room.viewers) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const pair = await share.authorizePair(room.teacherUid, viewer.uid, viewer.domainId);
                if (pair.teacher.workspaceId === room.workspaceId) { viewers.push(viewer); continue; }
            } catch { /* Revoked learners leave immediately; keep the other learners' lesson running. */ }
            // eslint-disable-next-line no-await-in-loop
            await share.releaseParticipants(room._id, [viewer.uid]);
            emit({ uid: viewer.uid, tabId: viewer.tabId, message: { type: 'broadcast:ended', sessionId: room._id, reason: '你已不在本次分享的课堂范围。' } });
        }
        if (!viewers.length) { await end(room, '分享学员已全部离开。', emit); return null; }
        await share.claimParticipants('broadcast', room._id, [room.teacherUid, ...viewers.map((v) => v.uid)], now);
        const updated = await rooms.findOneAndUpdate({ _id: room._id, active: true, revision: room.revision }, { $set: {
            pageId: teacher.pageId, domainId: teacher.domainId, viewers, studentUids: viewers.map((v) => v.uid),
            expiresAt: new Date(now + LIVE_SHARE_RECONNECT_MS),
        }, $inc: { revision: 1 } }, { returnDocument: 'after' });
        const current = updated || await rooms.findOne({ _id: room._id, active: true });
        if (!current) await share.releaseParticipants(room._id);
        return current;
    } catch (error) {
        if (error instanceof LiveShareError) await end(room, error.message, emit);
        throw error;
    }
}

/** Follow navigation only on the browser/device explicitly selected at start. */
export async function follow(peer: share.SharePresence, emit: Emit, now = Date.now()) {
    if (!peer.visible) return null;
    const room = await rooms.findOne({ active: true, expiresAt: { $gt: new Date(now) }, ...(peer.canTeach
        ? { teacherUid: peer.uid, teacherDeviceId: peer.deviceId }
        : { viewers: { $elemMatch: { uid: peer.uid, deviceId: peer.deviceId } } }) });
    if (!room) return null;
    const oldTab = peer.canTeach ? room.teacherTabId : room.viewers.find((v) => v.uid === peer.uid)?.tabId;
    if (peer.workspaceId !== room.workspaceId) throw new LiveShareError('FORBIDDEN', '不能跟随到其他工作区。');
    if (peer.canTeach) {
        await share.teacherScope(peer.uid, peer.domainId);
        if (!peer.url) return null;
    } else await share.authorizePair(room.teacherUid, peer.uid, peer.domainId);
    const teacher = peer.canTeach ? peer : await share.livePresence(room.teacherUid, room.teacherTabId, now);
    if (!teacher || teacher.serverId !== peer.serverId) return null;
    if (oldTab === peer.tabId && (!peer.canTeach || room.pageId === peer.pageId)) return room;
    const viewers = room.viewers.map((v) => v.uid === peer.uid && !peer.canTeach ? { ...v, tabId: peer.tabId, domainId: peer.domainId } : v);
    const updated = await rooms.findOneAndUpdate({ _id: room._id, active: true, revision: room.revision },
        { $set: peer.canTeach ? { teacherTabId: peer.tabId, pageId: peer.pageId, domainId: peer.domainId } : { viewers },
            $inc: { revision: 1 } }, { returnDocument: 'after' });
    if (!updated) return null;
    if (oldTab !== peer.tabId) emit({ uid: peer.uid, tabId: oldTab, message: {
        type: 'broadcast:ended', sessionId: room._id, reason: '分享已跟随到当前页面。', followed: true,
    } });
    await notify(updated, emit, now);
    return updated;
}

let ready: Promise<any>;
export function apply() {
    ready ||= Promise.all([share.apply(), rooms.createIndexes([
        { key: { expiresAt: 1 }, name: 'live_broadcast_expiry', expireAfterSeconds: 0 },
        { key: { teacherUid: 1 }, name: 'live_broadcast_teacher', unique: true, partialFilterExpression: { active: true } },
        { key: { studentUids: 1 }, name: 'live_broadcast_viewers', unique: true, partialFilterExpression: { active: true } },
    ])]).catch((error) => { ready = undefined; throw error; });
    return ready;
}
