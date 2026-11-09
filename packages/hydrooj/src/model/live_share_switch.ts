import { LIVE_SHARE_RECONNECT_MS, LiveShareError, ShareParticipant, ShareSession } from '../lib/live_share';
import * as share from './live_share';
import * as broadcast from './teacher_broadcast';

type Room = ShareSession | broadcast.BroadcastRoom;
type Emit = (event: share.ShareEvent) => void;
export interface SwitchRequest {
    sessionId: string; requestId: string; mode: 'assist' | 'broadcast'; studentUid?: number;
}
const isBroadcast = (room: Room): room is broadcast.BroadcastRoom => 'viewers' in room;
const collection = (room: Room) => isBroadcast(room) ? broadcast.rooms : share.sessions;
const participants = (room: Room): ShareParticipant[] => isBroadcast(room) ? room.viewers : room.returnAudience || [{
    uid: room.studentUid, tabId: room.studentTabId, deviceId: room.studentDeviceId, domainId: room.domainId, name: room.studentName,
}];

async function findRoom(id: string): Promise<Room | null> {
    return await share.sessions.findOne({ _id: id }) || await broadcast.rooms.findOne({ _id: id });
}

async function notify(room: Room, emit: Emit, now: number) {
    if (isBroadcast(room)) await broadcast.notify(room, emit, now);
    else share.notifySession(room, emit);
}

/** Direction changes never release the logical connection's participant slots. */
export async function switchDirection(teacher: share.SharePresence, request: SwitchRequest, emit: Emit, now = Date.now()) {
    if (!teacher.canTeach) throw new LiveShareError('FORBIDDEN', '只有老师可以切换共享方向。');
    const old = await findRoom(request.sessionId);
    if (!old || old.teacherUid !== teacher.uid || old.teacherTabId !== teacher.tabId
        || old.workspaceId !== teacher.workspaceId) throw new LiveShareError('FORBIDDEN', '不能切换其他连接。');
    const teacherScope = await share.teacherScope(teacher.uid, teacher.domainId);
    if (teacherScope.workspaceId !== old.workspaceId) throw new LiveShareError('FORBIDDEN', '不能跨工作区切换。');
    const connectionId = share.connectionKey(old);
    const slot = await share.occupancy.findOne({ _id: teacher.uid, roomId: connectionId, closed: { $ne: true } });
    // A retried request acknowledges its already-committed transport; it never
    // toggles back or resurrects an older direction after a later switch.
    if (slot?.lastSwitch?.requestId === request.requestId && slot.lastSwitch.fromId === old._id) {
        const current = slot.transportId && await findRoom(slot.transportId);
        if (!current?.active || +current.expiresAt <= now || slot.lastSwitch.mode !== request.mode
            || (slot.lastSwitch.studentUid ?? undefined) !== request.studentUid || !await share.currentTransport(current)) {
            throw new LiveShareError('STALE_SESSION', '共享方向已经改变。');
        }
        await notify(current, emit, now);
        return current;
    }
    if (!old.active || +old.expiresAt <= now || !await share.currentTransport(old)) {
        throw new LiveShareError('STALE_SESSION', '共享方向已经改变。');
    }
    if (request.mode === (isBroadcast(old) ? 'broadcast' : 'assist')) {
        throw new LiveShareError('INVALID_SWITCH', '当前已经是这个方向。');
    }
    const lock = await share.occupancy.findOneAndUpdate({ _id: teacher.uid, roomId: connectionId, closed: { $ne: true },
        $and: [
            { $or: [{ transportId: old._id }, { transportId: { $exists: false } }] },
            { $or: [{ switching: { $exists: false } }, { 'switching.expiresAt': { $lte: new Date(now) } }] },
        ] }, { $set: { transportId: old._id, switching: { requestId: request.requestId, expiresAt: new Date(now + 15000) } } },
    { returnDocument: 'after' });
    if (!lock) throw new LiveShareError('STALE_SESSION', '正在切换画面，请稍候。');
    let target: Room; let committed = false;
    try {
        // Retire an abandoned prepared transport from an interrupted switch.
        // The single teacher-slot lock means it cannot be another live attempt.
        await Promise.all([share.sessions.updateMany({ teacherUid: teacher.uid, connectionId, _id: { $ne: old._id }, active: true },
            { $set: { active: false } }), broadcast.rooms.updateMany({ teacherUid: teacher.uid, connectionId,
            _id: { $ne: old._id }, active: true }, { $set: { active: false } })]);
        const audience: ShareParticipant[] = [];
        const removed: ShareParticipant[] = [];
        for (const member of participants(old)) {
            // Follow only the selected device, never an unrelated browser login.
            // A temporarily offline original viewer may rejoin after return.
            // eslint-disable-next-line no-await-in-loop
            const peer = await share.presence.find({ uid: member.uid, deviceId: member.deviceId, connected: true,
                workspaceId: old.workspaceId, expiresAt: { $gt: new Date(now) } }).sort({ visible: -1, expiresAt: -1 }).limit(1).next();
            if (peer && peer.serverId !== teacher.serverId) throw new LiveShareError('DIFFERENT_SERVER', '学员正在重新连接，请稍后切换。');
            const domainId = peer?.domainId || member.domainId;
            // eslint-disable-next-line no-await-in-loop
            let pair: Awaited<ReturnType<typeof share.authorizePair>>;
            try {
                // eslint-disable-next-line no-await-in-loop
                pair = await share.authorizePair(teacher.uid, member.uid, domainId);
            } catch (error) {
                if (!(error instanceof LiveShareError) || (request.mode === 'assist'
                    && (request.studentUid === member.uid || participants(old).length === 1))) throw error;
                removed.push(member); continue;
            }
            if (pair.teacher.workspaceId !== old.workspaceId) throw new LiveShareError('FORBIDDEN', '学员已离开当前工作区。');
            audience.push({ uid: member.uid, tabId: peer?.tabId || member.tabId, deviceId: member.deviceId,
                domainId, name: pair.student.name });
        }
        if (!audience.length) throw new LiveShareError('FORBIDDEN', '当前没有可继续连接的学员。');
        const common = { _id: share.opaqueShareId(), connectionId, connectionVersion: (old.connectionVersion || 0) + 1,
            teacherUid: teacher.uid, teacherTabId: teacher.tabId, teacherDeviceId: teacher.deviceId,
            teacherName: teacherScope.name, workspaceId: old.workspaceId, active: true,
            createdAt: old.createdAt, expiresAt: new Date(now + LIVE_SHARE_RECONNECT_MS) };
        if (request.mode === 'assist') {
            const uid = request.studentUid ?? (audience.length === 1 ? audience[0].uid : undefined);
            const member = audience.find((viewer) => viewer.uid === uid);
            if (!member) throw new LiveShareError('INVALID_STUDENT', '请选择当前分享中的一位学员。');
            const student = await share.livePresence(member.uid, member.tabId, now);
            if (!student?.visible || !student.url) throw new LiveShareError('OFFLINE', '学员正在切换页面，请稍后重试。');
            target = { ...common, studentUid: member.uid, studentTabId: member.tabId, studentDeviceId: member.deviceId,
                studentName: member.name, domainId: student.domainId, pageId: student.pageId, pageUrl: student.url,
                returnAudience: audience };
        } else {
            if (!teacher.visible || !teacher.url) throw new LiveShareError('UNSUPPORTED_PAGE', '请先打开可分享的教学页面。');
            target = { ...common, domainId: teacher.domainId, pageId: teacher.pageId,
                viewers: audience, studentUids: audience.map((viewer) => viewer.uid), revision: 0 };
        }
        // Existing reservations cannot be acquired by another teacher during
        // the switch. Revalidate/extend them before preparing the new document.
        await share.pulseParticipants(old, isBroadcast(old) ? 'broadcast' : 'assist',
            [teacher.uid, ...audience.map((viewer) => viewer.uid)], now);
        if (isBroadcast(target)) await broadcast.rooms.insertOne(target);
        else await share.sessions.insertOne(target);
        const changed = await share.occupancy.updateOne({ _id: teacher.uid, roomId: connectionId, closed: { $ne: true },
            transportId: old._id, 'switching.requestId': request.requestId }, {
            $set: { transportId: target._id, kind: request.mode, connectionVersion: target.connectionVersion,
                lastSwitch: { requestId: request.requestId, fromId: old._id, mode: request.mode,
                    ...(request.studentUid === undefined ? {} : { studentUid: request.studentUid }) },
                expiresAt: new Date(now + LIVE_SHARE_RECONNECT_MS) }, $unset: { switching: '' },
        });
        if (!changed.matchedCount) throw new LiveShareError('STALE_SESSION', '原连接已结束，无法切换。');
        committed = true;
        share.retireTransport(old._id);
        if (removed.length) {
            await share.releaseParticipants(connectionId, removed.map((viewer) => viewer.uid));
            for (const viewer of removed) emit({ uid: viewer.uid, tabId: viewer.tabId,
                message: { type: 'connection:ended', ...share.connectionInfo(target) } });
        }
        // Authority has already moved atomically. A delayed heartbeat/stop on
        // the previous document can no longer release this connection.
        await collection(old).updateOne({ _id: old._id }, { $set: { active: false } });
        const departed = isBroadcast(old) ? old.viewers : [{ uid: old.studentUid, tabId: old.studentTabId }];
        for (const [uid, tabId] of [[old.teacherUid, old.teacherTabId], ...departed.map((p) => [p.uid, p.tabId])] as [number, string][]) {
            emit({ uid, tabId, message: { type: isBroadcast(old) ? 'broadcast:ended' : 'ended', sessionId: old._id,
                ...share.connectionInfo(target), switched: true, reason: '已切换共享方向。' } });
        }
        await notify(target, emit, now);
        return target;
    } catch (error) {
        if (target && !committed) await collection(target).deleteOne({ _id: target._id });
        if (committed) {
            // The committed direction remains authoritative even if notifying
            // peers failed. A duplicate request re-sends its current state.
            return target;
        }
        throw error;
    } finally {
        await share.occupancy.updateOne({ _id: teacher.uid, roomId: connectionId, transportId: old._id,
            'switching.requestId': request.requestId }, { $unset: { switching: '' } });
    }
}
