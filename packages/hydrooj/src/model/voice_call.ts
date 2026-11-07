import { randomBytes } from 'crypto';
import {
    ownsVoice, VOICE_LEASE_MS, VOICE_PRESENCE_MS, VOICE_RECONNECT_MS, VOICE_RING_MS,
    VoiceCall, VoiceCallError, VoiceOwner, voiceRole,
} from '../lib/voice_call';
import db from '../service/db';
import * as share from './live_share';

export interface VoicePresence extends VoiceOwner {
    _id: string; uid: number; domainId: string; workspaceId: string; serverId: string;
    canTeach: boolean; mediaOwner: boolean; visible: boolean; connected: boolean; expiresAt: Date;
}
export interface VoiceEvent {
    uid: number; tabId?: string; connectionId?: string; sentAt?: number; message: Record<string, any>;
}
type Emit = (event: VoiceEvent) => void;
declare module '../service/db' {
    interface Collections { 'voice.call.presence': VoicePresence; 'voice.call.session': VoiceCall }
}
declare module '../service/bus' {
    interface EventMap { 'voice-call/event': (event: VoiceEvent) => void }
}
export const presence = db.collection('voice.call.presence');
export const calls = db.collection('voice.call.session');
export const opaqueVoiceId = () => randomBytes(24).toString('hex');
const ownerOf = (peer: VoicePresence): VoiceOwner => ({ tabId: peer.tabId, deviceId: peer.deviceId, connectionId: peer.connectionId });

export async function connectPresence(value: Omit<VoicePresence, '_id' | 'connected' | 'expiresAt'>, now = Date.now()) {
    if (await presence.countDocuments({ uid: value.uid, tabId: { $ne: value.tabId }, connected: true,
        expiresAt: { $gt: new Date(now) } }) >= 12) throw new VoiceCallError('TOO_MANY_TABS', '打开的页面较多，请关闭部分页面再试。');
    const peer: VoicePresence = { ...value, _id: `${value.uid}:${value.tabId}`, connected: true, expiresAt: new Date(now + VOICE_PRESENCE_MS) };
    await presence.replaceOne({ _id: peer._id }, peer, { upsert: true });
    return peer;
}

export async function pulsePresence(peer: VoicePresence, visible: boolean, now = Date.now()) {
    const expiresAt = new Date(now + VOICE_PRESENCE_MS);
    const result = await presence.updateOne({ _id: peer._id, connectionId: peer.connectionId }, { $set: { visible, expiresAt, connected: true } });
    if (!result.matchedCount) throw new VoiceCallError('REPLACED', '此语音页面已重新连接。');
    peer.visible = visible; peer.expiresAt = expiresAt;
}

export async function disconnectPresence(peer: VoicePresence) {
    return !!(await presence.updateOne({ _id: peer._id, connectionId: peer.connectionId }, { $set: { connected: false } })).matchedCount;
}

export async function callFor(peer: VoicePresence, now = Date.now()) {
    return calls.findOne({ participantUids: peer.uid, workspaceId: peer.workspaceId, active: true, expiresAt: { $gt: new Date(now) } });
}

export function snapshot(call: VoiceCall, peer: VoicePresence) {
    return { type: 'snapshot', callId: call._id, requestId: call.dialRequestId, status: call.status, teacherUid: call.teacherUid, teacherName: call.teacherName,
        studentUid: call.studentUid, studentName: call.studentName, createdAt: call.createdAt, acceptedAt: call.acceptedAt,
        ringExpiresAt: call.ringExpiresAt, isOwner: ownsVoice(call, peer) };
}

export function notifyCall(call: VoiceCall, emit: Emit) {
    for (const uid of call.participantUids) emit({ uid, message: { type: 'changed', callId: call._id } });
}

export async function endCall(call: VoiceCall, reason: string, emit: Emit, now = Date.now()) {
    const ended = await calls.updateOne({ _id: call._id, active: true }, { $set: { active: false, expiresAt: new Date(now + 60_000) } });
    if (ended.modifiedCount) for (const uid of call.participantUids) emit({ uid,
        message: { type: 'ended', callId: call._id, requestId: call.dialRequestId, reason } });
}

export async function listStudents(teacherUid: number, domainId: string, now = Date.now()) {
    const scope = await share.teacherScope(teacherUid, domainId);
    const students = await share.listStudents(teacherUid, domainId, now);
    const ids = students.map((item) => item.uid);
    const [online, busy] = await Promise.all([
        presence.distinct('uid', { uid: { $in: ids }, workspaceId: scope.workspaceId, canTeach: false,
            connected: true, expiresAt: { $gt: new Date(now) } }),
        calls.distinct('studentUid', { studentUid: { $in: ids }, active: true, expiresAt: { $gt: new Date(now) } }),
    ]);
    return students.map(({ uid, name }) => ({ uid, name, online: online.includes(uid), busy: busy.includes(uid) }))
        .sort((a, b) => Number(b.online) - Number(a.online) || a.uid - b.uid);
}

export async function dial(teacher: VoicePresence, studentUid: number, emit: Emit, now = Date.now(), requestId?: string) {
    if (!teacher.canTeach || !teacher.mediaOwner) throw new VoiceCallError('FORBIDDEN', '请在老师语音窗口发起通话。');
    await apply();
    const scope = await share.teacherScope(teacher.uid, teacher.domainId);
    const tabs = await presence.find({ uid: studentUid, workspaceId: scope.workspaceId, canTeach: false,
        connected: true, expiresAt: { $gt: new Date(now) } }).sort({ visible: -1, expiresAt: -1 }).limit(12).toArray();
    let student: VoicePresence; let pair: Awaited<ReturnType<typeof share.authorizePair>>;
    for (const tab of tabs) {
        try {
            // eslint-disable-next-line no-await-in-loop
            pair = await share.authorizePair(teacher.uid, studentUid, tab.domainId);
            if (pair.teacher.workspaceId === scope.workspaceId) { student = tab; break; }
        } catch { /* Try a currently authorized classroom tab. */ }
    }
    if (!student) throw new VoiceCallError('OFFLINE', '学员当前不在线，或已不在你的课堂中。');
    if (student.serverId !== teacher.serverId) throw new VoiceCallError('UNAVAILABLE', '语音暂时无法连接，请刷新页面后重试。');
    await calls.updateMany({ active: true, $or: [{ expiresAt: { $lte: new Date(now) } },
        { status: 'ringing', ringExpiresAt: { $lte: new Date(now) } }] }, { $set: { active: false } });
    const call: VoiceCall = {
        _id: opaqueVoiceId(), participantUids: [teacher.uid, studentUid], teacherUid: teacher.uid, studentUid, dialRequestId: requestId,
        teacherName: pair.teacher.name, studentName: pair.student.name, teacherOwner: ownerOf(teacher),
        domainId: student.domainId, workspaceId: scope.workspaceId, serverId: teacher.serverId,
        status: 'ringing', active: true, createdAt: new Date(now), ringExpiresAt: new Date(now + VOICE_RING_MS),
        expiresAt: new Date(now + VOICE_RING_MS + VOICE_LEASE_MS),
    };
    try { await calls.insertOne(call); } catch (error) {
        if (error.code === 11000) throw new VoiceCallError('BUSY', '你或这位学员正在通话，请结束当前通话后再试。');
        throw error;
    }
    notifyCall(call, emit);
    return call;
}

export async function participantCall(peer: VoicePresence, callId: string, now = Date.now()) {
    const call = await calls.findOne({ _id: callId, active: true, participantUids: peer.uid,
        workspaceId: peer.workspaceId, expiresAt: { $gt: new Date(now) } });
    if (!call) throw new VoiceCallError('NOT_FOUND', '这次通话已结束。');
    return call;
}

export async function accept(peer: VoicePresence, callId: string, emit: Emit, now = Date.now()) {
    const call = await participantCall(peer, callId, now);
    if (voiceRole(call, peer.uid) !== 'student' || !peer.mediaOwner || peer.canTeach) {
        throw new VoiceCallError('FORBIDDEN', '请在学员语音窗口接听。');
    }
    await share.authorizePair(call.teacherUid, call.studentUid, call.domainId);
    if (call.serverId !== peer.serverId) throw new VoiceCallError('UNAVAILABLE', '请刷新语音窗口后重新接听。');
    const accepted = await calls.findOneAndUpdate({ _id: callId, active: true, status: 'ringing', ringExpiresAt: { $gt: new Date(now) } },
        { $set: { status: 'active', studentOwner: ownerOf(peer), acceptedAt: new Date(now), expiresAt: new Date(now + VOICE_LEASE_MS) } },
        { returnDocument: 'after' });
    if (!accepted) throw new VoiceCallError('ALREADY_ANSWERED', '来电已在其他窗口接听或已结束。');
    notifyCall(accepted, emit);
    return accepted;
}

/** Only the exact original tab AND device can reclaim its media after a reconnect. */
export async function resumeOwner(peer: VoicePresence, emit: Emit, now = Date.now()) {
    const call = await callFor(peer, now);
    if (!call || !peer.mediaOwner || call.serverId !== peer.serverId) return call;
    const role = voiceRole(call, peer.uid);
    const owner = call[`${role}Owner`];
    if (!owner || owner.tabId !== peer.tabId || owner.deviceId !== peer.deviceId) return call;
    await share.authorizePair(call.teacherUid, call.studentUid, call.domainId);
    const updated = await calls.findOneAndUpdate({ _id: call._id, active: true,
        [`${role}Owner.connectionId`]: owner.connectionId }, { $set: { [`${role}Owner`]: ownerOf(peer) } }, { returnDocument: 'after' });
    if (updated) notifyCall(updated, emit);
    return updated || call;
}

/** Refresh metadata, permissions and leases; no audio bytes ever enter MongoDB. */
export async function refreshCall(call: VoiceCall, emit: Emit, now = Date.now()) {
    if (+call.expiresAt <= now || (call.status === 'ringing' && +call.ringExpiresAt <= now)) {
        await endCall(call, call.status === 'ringing' ? '学员暂时没有接听。' : '语音连接已超时。', emit, now);
        return null;
    }
    try { await share.authorizePair(call.teacherUid, call.studentUid, call.domainId); } catch {
        await endCall(call, '课堂或账号权限已变更，通话已结束。', emit, now); return null;
    }
    const owners = [call.teacherOwner, ...(call.studentOwner ? [call.studentOwner] : [])];
    const connected = await presence.countDocuments({ connectionId: { $in: owners.map((owner) => owner.connectionId) },
        connected: true, mediaOwner: true, serverId: call.serverId, expiresAt: { $gt: new Date(now) } });
    if (connected !== owners.length) {
        if (call.disconnectedAt && now - +call.disconnectedAt >= VOICE_RECONNECT_MS) {
            await endCall(call, '对方已离线，通话已结束。', emit, now); return null;
        }
        await calls.updateOne({ _id: call._id, active: true, disconnectedAt: { $exists: false } }, { $set: { disconnectedAt: new Date(now) } });
        return call;
    }
    return calls.findOneAndUpdate({ _id: call._id, active: true, expiresAt: { $gt: new Date(now) } },
        { $set: { expiresAt: new Date(now + VOICE_LEASE_MS) }, $unset: { disconnectedAt: '' } }, { returnDocument: 'after' });
}

let indexesReady: Promise<any>;
export function apply() {
    indexesReady ||= Promise.all([
        presence.createIndexes([{ key: { expiresAt: 1 }, name: 'voice_presence_expiry', expireAfterSeconds: 0 },
            { key: { workspaceId: 1, uid: 1 }, name: 'voice_presence_workspace' }]),
        calls.createIndexes([{ key: { expiresAt: 1 }, name: 'voice_call_expiry', expireAfterSeconds: 0 },
            // One atomic multikey unique index locks BOTH participants, including role changes.
            { key: { participantUids: 1 }, name: 'voice_one_call_per_user', unique: true, partialFilterExpression: { active: true } }]),
    ]).catch((error) => { indexesReady = undefined; throw error; });
    return indexesReady;
}
