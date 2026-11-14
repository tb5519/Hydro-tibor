/* eslint-disable no-control-regex -- Reject control characters in lesson titles. */
import { randomBytes } from 'crypto';
import moment from 'moment-timezone';
import { LessonError, lessonId, LESSON_JOIN_MS, LESSON_LEASE_MS } from '../lib/lesson';
import db from '../service/db';
import { BUILTIN_ROLES, PERM } from './builtin';
import domain from './domain';
import * as share from './live_share';

export interface Lesson {
    _id: string; participantUids: number[]; domainId: string; workspaceId: string;
    teacherUid: number; studentUid: number; teacherName: string; studentName: string; title: string;
    startAt: Date; endAt: Date; createdAt: Date; updatedAt: Date;
    status: 'scheduled' | 'active' | 'ended' | 'cancelled';
}
export interface LessonMember {
    _id: number; lessonId: string; tabId: string; joinedAt: Date; expiresAt: Date;
    connectionId?: string; serverId?: string; connected?: boolean;
}
interface BookingSlot { _id: string; lessonId: string; expiresAt: Date }
export interface LessonEvent {
    uid: number; lessonId: string; connectionId?: string; sentAt?: number;
    message: Record<string, any>;
}
declare module '../service/db' {
    interface Collections { 'lesson.room': Lesson; 'lesson.member': LessonMember; 'lesson.booking.slot': BookingSlot }
}
declare module '../service/bus' {
    interface EventMap { 'lesson/event': (event: LessonEvent) => void }
}
export const rooms = db.collection('lesson.room');
export const members = db.collection('lesson.member');
export const bookingSlots = db.collection('lesson.booking.slot');
export const opaqueLessonId = () => randomBytes(24).toString('hex');
type Emit = (event: LessonEvent) => void;

export async function scope(uid: number, domainId: string) {
    try { return { ...await share.teacherScope(uid, domainId), canTeach: true }; }
    catch { return { ...await share.studentScope(uid, domainId), canTeach: false }; }
}

export async function authorize(uid: number, domainId: string, id: unknown, now = Date.now()) {
    if (!lessonId(id)) throw new LessonError('INVALID_MESSAGE', '课程编号无效。');
    const room = await rooms.findOne({ _id: id, domainId, participantUids: uid });
    if (!room) throw new LessonError('NOT_FOUND', '没有找到这节课。');
    const pair = await share.authorizePair(room.teacherUid, room.studentUid, room.domainId);
    if (pair.teacher.workspaceId !== room.workspaceId || pair.student.workspaceId !== room.workspaceId) {
        throw new LessonError('FORBIDDEN', '这节课已不在你的工作区中。');
    }
    if (room.status === 'ended' || room.status === 'cancelled' || +room.endAt + 2 * 3600_000 < now) {
        throw new LessonError('ENDED', '这节课已经结束或取消。');
    }
    return room;
}

export async function snapshot(room: Lesson, now = Date.now()) {
    const joined = await members.find({ lessonId: room._id, expiresAt: { $gt: new Date(now) } }).toArray();
    return { _id: room._id, domainId: room.domainId, workspaceId: room.workspaceId,
        teacherUid: room.teacherUid, studentUid: room.studentUid, teacherName: room.teacherName, studentName: room.studentName,
        title: room.title, startAt: room.startAt.toISOString(), endAt: room.endAt.toISOString(), status: room.status,
        teacherJoined: joined.some((item) => item._id === room.teacherUid), studentJoined: joined.some((item) => item._id === room.studentUid) };
}

export async function list(uid: number, domainId: string, now = Date.now()) {
    const access = await scope(uid, domainId);
    const candidates = await rooms.find({ participantUids: uid, domainId, workspaceId: access.workspaceId,
        status: { $in: ['scheduled', 'active'] }, endAt: { $gt: new Date(now - 2 * 3600_000) } })
        .sort({ startAt: 1 }).limit(100).toArray();
    const lessons = (await Promise.all(candidates.map(async (room) => {
        try { return await snapshot(await authorize(uid, domainId, room._id, now), now); } catch { return null; }
    }))).filter(Boolean);
    let students;
    if (access.canTeach) {
        const available = await share.listStudents(uid, domainId, now);
        const classroom = await domain.get(domainId);
        const joined = await domain.collUser.find({ domainId, uid: { $in: available.map((item) => item.uid) },
            join: true, blockedByStudentManagement: { $ne: true } }).toArray();
        const ids = new Set(joined.filter((member) => {
            const permissions = BigInt(classroom?.roles?.[member.role || 'default'] ?? BUILTIN_ROLES[member.role || 'default'] ?? 0);
            return (permissions & PERM.PERM_VIEW) === PERM.PERM_VIEW && (permissions & PERM.PERM_EDIT_DOMAIN) !== PERM.PERM_EDIT_DOMAIN;
        }).map((member) => member.uid));
        students = available.filter((item) => ids.has(item.uid)).map(({ uid: studentUid, name, online }) => ({ uid: studentUid, name, online }));
    }
    return { lessons, ...(students ? { students } : {}), serverNow: new Date(now).toISOString() };
}

function normalizedCreate(value: any, now: number) {
    if (!value || !Number.isSafeInteger(value.studentUid) || value.studentUid <= 1 || !lessonId(value.tabId)) {
        throw new LessonError('INVALID_MESSAGE', '请选择学员后再安排上课。');
    }
    const duration = value.durationMinutes ?? 60;
    if (!Number.isSafeInteger(duration) || duration < 1 || duration > 240) throw new LessonError('INVALID_MESSAGE', '课程时长须为 1 至 240 分钟。');
    if (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > 100 || /[\u0000-\u001f\u007f]/.test(value.title))) {
        throw new LessonError('INVALID_MESSAGE', '课程标题过长或含有无效字符。');
    }
    const immediate = value.startAt === undefined;
    if (!immediate && (typeof value.startAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value.startAt))) {
        throw new LessonError('INVALID_MESSAGE', '预约时间须包含时区。');
    }
    const parsedTime = immediate ? null : moment.parseZone(value.startAt, moment.ISO_8601, true);
    const parsed = immediate ? now : parsedTime?.isValid() ? +parsedTime : NaN;
    if (!Number.isFinite(parsed) || (!immediate && (parsed <= now || parsed > now + 366 * 86400_000))) {
        throw new LessonError('INVALID_MESSAGE', '请选择一年以内的将来时间。');
    }
    return { studentUid: value.studentUid as number, tabId: value.tabId as string, immediate,
        startAt: new Date(parsed), endAt: new Date(parsed + duration * 60_000), title: value.title?.trim() || '一对一课堂' };
}

export async function notify(room: Lesson, emit: Emit, now = Date.now()) {
    const lesson = await snapshot(room, now);
    for (const uid of room.participantUids) emit({ uid, lessonId: room._id, message: { type: 'lesson', lesson } });
}

export async function create(teacherUid: number, domainId: string, value: any, emit: Emit, now = Date.now()) {
    await apply();
    const normalized = normalizedCreate(value, now);
    const pair = await share.authorizePair(teacherUid, normalized.studentUid, domainId);
    if (pair.teacher.workspaceId !== pair.student.workspaceId) throw new LessonError('FORBIDDEN', '无法跨工作区安排上课。');
    const room: Lesson = { _id: opaqueLessonId(), participantUids: [teacherUid, normalized.studentUid],
        teacherUid, studentUid: normalized.studentUid, teacherName: pair.teacher.name, studentName: pair.student.name,
        domainId, workspaceId: pair.teacher.workspaceId, title: normalized.title, startAt: normalized.startAt, endAt: normalized.endAt,
        createdAt: new Date(now), updatedAt: new Date(now), status: normalized.immediate ? 'active' : 'scheduled' };
    // Unique minute reservations cover BOTH accounts, across domains/workspaces.
    // Minute precision matches the booking form; no multi-document transaction is required.
    const reservations: BookingSlot[] = [];
    for (let minute = Math.floor(+room.startAt / 60000); minute < Math.ceil(+room.endAt / 60000); minute++) {
        for (const uid of room.participantUids) reservations.push({ _id: `${uid}:${minute}`, lessonId: room._id,
            expiresAt: new Date(+room.endAt + 2 * 3600_000) });
    }
    try {
        await bookingSlots.insertMany(reservations, { ordered: true });
        await rooms.insertOne(room);
        if (normalized.immediate) await join(teacherUid, domainId, room._id, normalized.tabId, emit, now);
    } catch (error) {
        await bookingSlots.deleteMany({ lessonId: room._id });
        await members.deleteMany({ lessonId: room._id });
        await rooms.deleteOne({ _id: room._id });
        if (error.code === 11000) throw new LessonError('CONFLICT', '老师或学员在这个时间已有课程，请换个时间。');
        throw error;
    }
    await notify(room, emit, now);
    return snapshot(room, now);
}

export async function join(uid: number, domainId: string, id: unknown, tabId: unknown, emit: Emit, now = Date.now()) {
    if (!lessonId(tabId)) throw new LessonError('INVALID_MESSAGE', '请刷新页面后再进入课堂。');
    const room = await authorize(uid, domainId, id, now);
    if (uid === room.studentUid && +room.startAt > now) throw new LessonError('TOO_EARLY', '还没到上课时间，稍后再来。');
    try {
        await members.findOneAndUpdate({ _id: uid, $or: [{ lessonId: room._id, tabId }, { expiresAt: { $lte: new Date(now) } }] },
            { $set: { lessonId: room._id, tabId, joinedAt: new Date(now), expiresAt: new Date(now + LESSON_JOIN_MS) } }, { upsert: true });
    } catch (error) {
        if (error.code === 11000) throw new LessonError('BUSY', '你已经在其他页面上课，请先退出原来的课堂。');
        throw error;
    }
    const activated = await rooms.findOneAndUpdate({ _id: room._id, status: { $in: ['scheduled', 'active'] } },
        { $set: { status: 'active', updatedAt: new Date(now) } }, { returnDocument: 'after' });
    if (!activated) { await members.deleteOne({ _id: uid, lessonId: room._id, tabId }); throw new LessonError('ENDED', '这节课已经结束或取消。'); }
    await notify(activated, emit, now);
    return snapshot(activated, now);
}

export async function leave(uid: number, domainId: string, id: unknown, tabId: unknown, emit: Emit, now = Date.now()) {
    const room = await authorize(uid, domainId, id, now);
    if (!lessonId(tabId)) throw new LessonError('INVALID_MESSAGE', '课堂窗口身份无效。');
    const removed = await members.deleteOne({ _id: uid, lessonId: room._id, tabId });
    if (removed.deletedCount) {
        const other = uid === room.teacherUid ? room.studentUid : room.teacherUid;
        emit({ uid: other, lessonId: room._id, message: { type: 'peer', online: false } });
        await notify(room, emit, now);
    }
    return snapshot(room, now);
}

export async function finish(uid: number, domainId: string, id: unknown, status: 'ended' | 'cancelled', emit: Emit, now = Date.now()) {
    const room = await authorize(uid, domainId, id, now);
    if (room.teacherUid !== uid) throw new LessonError('FORBIDDEN', '只有这节课的老师可以结束或取消课程。');
    if (status === 'cancelled' && room.status !== 'scheduled') throw new LessonError('CONFLICT', '正在进行的课程请使用结束上课。');
    await rooms.updateOne({ _id: room._id, status: { $in: ['scheduled', 'active'] } }, { $set: { status, updatedAt: new Date(now) } });
    await Promise.all([members.deleteMany({ lessonId: room._id }), bookingSlots.deleteMany({ lessonId: room._id })]);
    for (const participant of room.participantUids) emit({ uid: participant, lessonId: room._id,
        message: { type: 'ended', lessonId: room._id, reason: status === 'cancelled' ? '课程已取消。' : '老师已结束上课。' } });
    return snapshot({ ...room, status }, now);
}

export async function bind(uid: number, domainId: string, id: string, tabId: string, connectionId: string, serverId: string, now = Date.now()) {
    const room = await authorize(uid, domainId, id, now);
    if (uid === room.studentUid && +room.startAt > now) throw new LessonError('TOO_EARLY', '还没到上课时间。');
    const peer = await members.findOneAndUpdate({ _id: uid, lessonId: id, tabId, expiresAt: { $gt: new Date(now) } },
        { $set: { connectionId, serverId, connected: true, expiresAt: new Date(now + LESSON_LEASE_MS) } }, { returnDocument: 'after' });
    if (!peer) throw new LessonError('JOIN_REQUIRED', '请先点击上课按钮进入课堂。');
    return { room, peer };
}

export async function pulse(peer: LessonMember, domainId: string, now = Date.now()) {
    const room = await authorize(peer._id, domainId, peer.lessonId, now);
    const updated = await members.updateOne({ _id: peer._id, lessonId: peer.lessonId, tabId: peer.tabId,
        connectionId: peer.connectionId, connected: true }, { $set: { expiresAt: new Date(now + LESSON_LEASE_MS) } });
    if (!updated.matchedCount) throw new LessonError('REPLACED', '此课堂已在另一个连接中打开。');
    return room;
}

export async function disconnect(peer: LessonMember) {
    await members.updateOne({ _id: peer._id, lessonId: peer.lessonId, connectionId: peer.connectionId },
        { $set: { connected: false, expiresAt: new Date(Date.now() + LESSON_LEASE_MS) } });
}

export async function otherMember(room: Lesson, uid: number, now = Date.now()) {
    return members.findOne({ _id: uid === room.teacherUid ? room.studentUid : room.teacherUid,
        lessonId: room._id, connected: true, expiresAt: { $gt: new Date(now) } });
}

let indexesReady: Promise<any>;
export function apply() {
    indexesReady ||= Promise.all([
        rooms.createIndexes([{ key: { participantUids: 1, domainId: 1, startAt: 1 }, name: 'lesson_participants_schedule' }]),
        members.createIndexes([{ key: { expiresAt: 1 }, name: 'lesson_member_expiry', expireAfterSeconds: 0 },
            { key: { lessonId: 1 }, name: 'lesson_member_room' }]),
        bookingSlots.createIndexes([{ key: { expiresAt: 1 }, name: 'lesson_booking_expiry', expireAfterSeconds: 0 },
            { key: { lessonId: 1 }, name: 'lesson_booking_room' }]),
    ]).catch((error) => { indexesReady = undefined; throw error; });
    return indexesReady;
}
