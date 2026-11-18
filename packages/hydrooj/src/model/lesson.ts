/* eslint-disable no-control-regex -- Reject control characters in lesson titles. */
import { createHash, randomBytes } from 'crypto';
import moment from 'moment-timezone';
import { LessonError, lessonId, LESSON_JOIN_MS, LESSON_LEASE_MS } from '../lib/lesson';
import { trainingDay } from '../lib/training_time';
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
    connectionId?: string; serverId?: string; connected?: boolean; ownerVersion?: number;
    signalSince?: Date; lastSignalAt?: Date;
}
interface LessonResumption {
    _id: number; lessonId: string | null; domainId?: string; tabId?: string;
    version: number; accepted: boolean; joinedAt?: Date;
}
interface BookingSlot { _id: string; lessonId: string; expiresAt: Date }
export interface LessonEvent {
    uid: number; lessonId: string; connectionId?: string; sentAt?: number;
    message: Record<string, any>;
}
declare module '../service/db' {
    interface Collections {
        'lesson.room': Lesson; 'lesson.member': LessonMember; 'lesson.booking.slot': BookingSlot;
        'lesson.resume': LessonResumption;
    }
}
declare module '../service/bus' {
    interface EventMap { 'lesson/event': (event: LessonEvent) => void }
}
export const rooms = db.collection('lesson.room');
export const members = db.collection('lesson.member');
export const bookingSlots = db.collection('lesson.booking.slot');
// This is deliberate participation, not online presence. It must never expire
// with the short media lease or disappear when a server process restarts.
export const resumptions = db.collection('lesson.resume');
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
    if (room.status === 'ended' || room.status === 'cancelled'
        || (room.status === 'scheduled' && +room.endAt + 2 * 3600_000 < now)) {
        throw new LessonError('ENDED', '这节课已经结束或取消。');
    }
    return room;
}

export async function snapshot(room: Lesson, now = Date.now()) {
    const joined = room.status === 'ended' || room.status === 'cancelled' ? []
        : await members.find({ lessonId: room._id, expiresAt: { $gt: new Date(now) } }).toArray();
    return { _id: room._id, domainId: room.domainId, workspaceId: room.workspaceId,
        teacherUid: room.teacherUid, studentUid: room.studentUid, teacherName: room.teacherName, studentName: room.studentName,
        title: room.title, startAt: room.startAt.toISOString(), endAt: room.endAt.toISOString(), status: room.status,
        teacherJoined: joined.some((item) => item._id === room.teacherUid), studentJoined: joined.some((item) => item._id === room.studentUid) };
}

export async function list(uid: number, domainId: string, now = Date.now()) {
    const access = await scope(uid, domainId);
    const currentScope = { participantUids: uid, domainId, workspaceId: access.workspaceId };
    // Future bookings cannot push an unfinished live class out of the list.
    const [active, scheduled] = await Promise.all([
        rooms.find({ ...currentScope, status: 'active' }).sort({ startAt: 1 }).toArray(),
        rooms.find({ ...currentScope, status: 'scheduled', endAt: { $gt: new Date(now - 2 * 3600_000) } })
            .sort({ startAt: 1 }).limit(100).toArray(),
    ]);
    const candidates = [...active, ...scheduled];
    const lessons = (await Promise.all(candidates.map(async (room) => {
        try { return await snapshot(await authorize(uid, domainId, room._id, now), now); } catch { return null; }
    }))).filter(Boolean);
    let students;
    let history: (Awaited<ReturnType<typeof snapshot>> & { domainName: string })[] = [];
    let historyHasMore = false;
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
        const recordedDomains = await rooms.distinct('domainId', { teacherUid: uid });
        const manageable = (await Promise.all(recordedDomains.map(async (id) => {
            try {
                const teacher = await share.teacherScope(uid, id);
                const classroomDoc = await domain.get(id);
                return { domainId: id, workspaceId: teacher.workspaceId,
                    domainName: typeof classroomDoc?.name === 'string' && classroomDoc.name ? classroomDoc.name : id };
            } catch { return null; }
        }))).filter((item): item is NonNullable<typeof item> => !!item);
        if (manageable.length) {
            const ownedScope = { teacherUid: uid, $or: manageable.map(({ domainId: id, workspaceId }) => ({ domainId: id, workspaceId })) };
            const [unfinished, completed] = await Promise.all([
                rooms.find({ ...ownedScope, status: { $in: ['scheduled', 'active'] } }).sort({ startAt: -1 }).toArray(),
                rooms.find({ ...ownedScope, status: { $in: ['ended', 'cancelled'] } }).sort({ startAt: -1 }).limit(101).toArray(),
            ]);
            historyHasMore = completed.length > 100;
            const names = new Map(manageable.map((item) => [item.domainId, item.domainName]));
            history = await Promise.all([...unfinished, ...completed.slice(0, 100)]
                .sort((a, b) => +b.startAt - +a.startAt)
                .map(async (room) => ({ ...await snapshot(room, now), domainName: names.get(room.domainId) || room.domainId })));
        }
    }
    return { lessons, history, historyHasMore, ...(students ? { students } : {}), serverNow: new Date(now).toISOString() };
}

/** Read-only account inbox: an invitation must reach the learner even while
 * they are viewing a different classroom. It never grants media admission. */
export async function inbox(uid: number, now = Date.now(), checkAccess?: (room: Lesson) => Promise<void>) {
    const candidates = await rooms.find({ participantUids: uid,
        $or: [{ status: 'active' }, { status: 'scheduled', endAt: { $gt: new Date(now - 2 * 3600_000) } }] })
        .sort({ startAt: 1 }).toArray();
    return (await Promise.all(candidates.map(async (room) => {
        try {
            const current = await authorize(uid, room.domainId, room._id, now);
            await checkAccess?.(current);
            return await snapshot(current, now);
        } catch (error) {
            if (['FORBIDDEN', 'NOT_FOUND', 'ENDED'].includes(error.code)) return null;
            throw error;
        }
    }))).filter((item): item is NonNullable<typeof item> => !!item);
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
        await clearRoomResumptions(room);
        await rooms.deleteOne({ _id: room._id });
        if (error.code === 11000) throw new LessonError('CONFLICT', '老师或学员在这个时间已有课程，请换个时间。');
        throw error;
    }
    await notify(room, emit, now);
    return snapshot(room, now);
}

async function clearResumption(intent: LessonResumption) {
    await resumptions.updateOne({ _id: intent._id, lessonId: intent.lessonId, version: intent.version },
        { $set: { lessonId: null, accepted: false }, $unset: { domainId: '', tabId: '', joinedAt: '' }, $inc: { version: 1 } });
}

async function clearRoomResumptions(room: Lesson) {
    await Promise.all(room.participantUids.map((_id) => resumptions.updateOne({ _id, lessonId: room._id },
        { $set: { lessonId: null, accepted: false }, $unset: { domainId: '', tabId: '', joinedAt: '' }, $inc: { version: 1 } })));
}

async function admit(uid: number, room: Lesson, tabId: string, emit: Emit, now: number,
    recovering?: LessonResumption, legacy?: LessonMember) {
    let previous = recovering || await resumptions.findOne({ _id: uid });
    if (legacy && previous) throw new LessonError('REPLACED', '课堂已在另一个页面继续。');
    if (previous?.lessonId && previous.lessonId !== room._id) {
        try {
            await authorize(uid, previous.domainId, previous.lessonId, now);
            throw new LessonError('BUSY', '你还有未结束的课堂，请先结束原来的课堂。');
        } catch (error) {
            if (!['ENDED', 'NOT_FOUND', 'FORBIDDEN'].includes(error.code)) throw error;
            await clearResumption(previous);
            previous = await resumptions.findOne({ _id: uid });
        }
    }
    if (!recovering && !legacy) {
        const owner = await members.findOne({ _id: uid, expiresAt: { $gt: new Date(now) } });
        if (owner && (owner.lessonId !== room._id || owner.tabId !== tabId)) {
            throw new LessonError('BUSY', '你已经在其他页面上课，请先退出原来的课堂。');
        }
    }
    let intent: LessonResumption;
    try {
        // The persistent per-account version is also the media admission fence.
        // A delayed request can never overwrite a newer tab's owner record.
        intent = await resumptions.findOneAndUpdate(previous
            ? { _id: uid, version: previous.version, lessonId: previous.lessonId, ...(recovering ? { accepted: true } : {}) }
            : { _id: uid, lessonId: { $exists: false } },
        { $set: { lessonId: room._id, domainId: room.domainId, tabId,
            accepted: !!legacy || (previous?.lessonId === room._id && previous.accepted === true),
            joinedAt: previous?.lessonId === room._id ? previous.joinedAt || new Date(now) : new Date(now) },
        $inc: { version: 1 } }, { upsert: !recovering, returnDocument: 'after' });
    } catch (error) {
        if (error.code === 11000) throw new LessonError('BUSY', '课堂正在另一个页面进入，请稍后重试。');
        throw error;
    }
    if (!intent) throw new LessonError('REPLACED', '课堂已在另一个页面继续。');
    try {
        const claimed = await members.findOneAndUpdate(legacy
            ? { _id: uid, lessonId: legacy.lessonId, tabId: legacy.tabId,
                expiresAt: { $gt: new Date(now) }, ownerVersion: { $exists: false } }
            : { _id: uid, $or: [
            { ownerVersion: { $lte: intent.version } }, { ownerVersion: { $exists: false } },
        ] }, { $set: { lessonId: room._id, tabId, joinedAt: intent.joinedAt,
            ownerVersion: intent.version, connected: false, expiresAt: new Date(now + LESSON_JOIN_MS) },
        $unset: { connectionId: '', serverId: '' } }, { upsert: !legacy, returnDocument: 'after' });
        if (!claimed) throw new LessonError('REPLACED', '原课堂连接已经离开，请重新点击上课。');
        const activated = await rooms.findOneAndUpdate({ _id: room._id, status: { $in: ['scheduled', 'active'] } },
            { $set: { status: 'active', updatedAt: new Date(now) } }, { returnDocument: 'after' });
        if (!activated) throw new LessonError('ENDED', '这节课已经结束或取消。');
        const accepted = await resumptions.updateOne({ _id: uid, lessonId: room._id, version: intent.version, tabId },
            { $set: { accepted: true } });
        if (!accepted.matchedCount) throw new LessonError('REPLACED', '课堂已在另一个页面继续。');
        await authorize(uid, room.domainId, room._id, now);
        if (!await resumptions.findOne({ _id: uid, lessonId: room._id, version: intent.version, accepted: true })) {
            throw new LessonError('REPLACED', '课堂已在另一个页面继续。');
        }
        emit({ uid, lessonId: room._id, message: { type: 'owner', ownerVersion: intent.version } });
        await notify(activated, emit, now);
        return snapshot(activated, now);
    } catch (error) {
        await members.deleteOne({ _id: uid, lessonId: room._id, ownerVersion: intent.version });
        if (legacy || !intent.accepted || ['ENDED', 'NOT_FOUND', 'FORBIDDEN'].includes(error.code)) await clearResumption(intent);
        if (error.code === 11000) throw new LessonError('REPLACED', '课堂已在另一个页面继续。');
        throw error;
    }
}

export async function join(uid: number, domainId: string, id: unknown, tabId: unknown, emit: Emit, now = Date.now()) {
    if (!lessonId(tabId)) throw new LessonError('INVALID_MESSAGE', '请刷新页面后再进入课堂。');
    const room = await authorize(uid, domainId, id, now);
    if (uid === room.studentUid && +room.startAt > now) throw new LessonError('TOO_EARLY', '还没到上课时间，稍后再来。');
    return admit(uid, room, tabId, emit, now);
}

export async function resume(uid: number, tabId: unknown, emit: Emit, now = Date.now(), checkAccess?: (room: Lesson) => Promise<void>) {
    if (!lessonId(tabId)) throw new LessonError('INVALID_MESSAGE', '课堂窗口身份无效，请刷新页面。');
    await apply();
    const intent = await resumptions.findOne({ _id: uid });
    if (!intent) {
        // One-time upgrade compatibility: an unexpired pre-recovery media
        // member is itself the result of the previous version's explicit REST
        // join. Never infer a learner's consent merely from an active room.
        const legacy = await members.findOne({ _id: uid, expiresAt: { $gt: new Date(now) }, ownerVersion: { $exists: false } });
        if (!legacy) return null;
        const previousRoom = await rooms.findOne({ _id: legacy.lessonId, participantUids: uid, status: 'active' });
        if (!previousRoom) return null;
        const room = await authorize(uid, previousRoom.domainId, previousRoom._id, now);
        await checkAccess?.(room);
        return admit(uid, room, tabId, emit, now, undefined, legacy);
    }
    if (!intent.accepted || !intent.lessonId) return null;
    let room: Lesson;
    try {
        room = await authorize(uid, intent.domainId, intent.lessonId, now);
        if (room.status !== 'active') return null;
    } catch (error) {
        if (['ENDED', 'NOT_FOUND', 'FORBIDDEN'].includes(error.code)) await clearResumption(intent);
        if (['ENDED', 'NOT_FOUND'].includes(error.code)) return null;
        throw error;
    }
    // A narrower/expired login on this request must not erase another valid
    // browser's durable participation. It simply cannot recover this owner.
    await checkAccess?.(room);
    return admit(uid, room, tabId, emit, now, intent);
}

export async function leave(uid: number, domainId: string, id: unknown, tabId: unknown, emit: Emit, now = Date.now()) {
    const room = await authorize(uid, domainId, id, now);
    if (!lessonId(tabId)) throw new LessonError('INVALID_MESSAGE', '课堂窗口身份无效。');
    const intent = await resumptions.findOne({ _id: uid, lessonId: room._id, tabId });
    if (intent) {
        const cleared = await resumptions.updateOne({ _id: uid, lessonId: room._id, tabId, version: intent.version },
            { $set: { lessonId: null, accepted: false }, $unset: { domainId: '', tabId: '', joinedAt: '' }, $inc: { version: 1 } });
        if (!cleared.matchedCount) return snapshot(room, now);
        await members.deleteOne({ _id: uid, lessonId: room._id, tabId, ownerVersion: intent.version });
        const other = uid === room.teacherUid ? room.studentUid : room.teacherUid;
        emit({ uid: other, lessonId: room._id, message: { type: 'peer', online: false } });
        await notify(room, emit, now);
    } else if (!await resumptions.findOne({ _id: uid })) {
        // A pre-upgrade browser can still explicitly leave its old lease.
        // Requiring its original tab and absent ownerVersion cannot revoke a
        // newly migrated owner or re-enable a tombstoned participation record.
        const removed = await members.deleteOne({ _id: uid, lessonId: room._id, tabId, ownerVersion: { $exists: false } });
        if (removed.deletedCount) {
            emit({ uid: uid === room.teacherUid ? room.studentUid : room.teacherUid,
                lessonId: room._id, message: { type: 'peer', online: false } });
            await notify(room, emit, now);
        }
    }
    return snapshot(room, now);
}

export async function finish(uid: number, domainId: string, id: unknown, status: 'ended' | 'cancelled', emit: Emit, now = Date.now()) {
    if (!lessonId(id)) throw new LessonError('INVALID_MESSAGE', '课程编号无效。');
    // Managing an owned historical class requires the original teacher's
    // current authority. A removed student must not prevent closing the class.
    const teacher = await share.teacherScope(uid, domainId);
    let room = await rooms.findOne({ _id: id, domainId, teacherUid: uid });
    if (!room) throw new LessonError('NOT_FOUND', '没有找到这节课。');
    if (room.workspaceId !== teacher.workspaceId) throw new LessonError('FORBIDDEN', '这节课已不在你的工作区中。');
    if (room.status === 'scheduled' || room.status === 'active') {
        if (status === 'cancelled' && room.status !== 'scheduled') throw new LessonError('CONFLICT', '正在进行的课程请使用结束上课。');
        room = await rooms.findOneAndUpdate({ _id: room._id, domainId, teacherUid: uid,
            status: status === 'cancelled' ? 'scheduled' : { $in: ['scheduled', 'active'] } },
        { $set: { status, updatedAt: new Date(now) } }, { returnDocument: 'after' })
            || await rooms.findOne({ _id: id, domainId, teacherUid: uid });
        if (!room) throw new LessonError('NOT_FOUND', '没有找到这节课。');
        if (room.status === 'active' || room.status === 'scheduled') throw new LessonError('CONFLICT', '课程状态已改变，请刷新后结束上课。');
    }
    await Promise.all([members.deleteMany({ lessonId: room._id }), bookingSlots.deleteMany({ lessonId: room._id }), clearRoomResumptions(room)]);
    for (const participant of room.participantUids) emit({ uid: participant, lessonId: room._id,
        message: { type: 'ended', lessonId: room._id, reason: room.status === 'cancelled' ? '课程已取消。' : '老师已结束上课。' } });
    return snapshot(room, now);
}

export async function bind(uid: number, domainId: string, id: string, tabId: string, connectionId: string, serverId: string, now = Date.now()) {
    const room = await authorize(uid, domainId, id, now);
    if (uid === room.studentUid && +room.startAt > now) throw new LessonError('TOO_EARLY', '还没到上课时间。');
    const intent = await resumptions.findOne({ _id: uid, lessonId: id, accepted: true });
    if (!intent) throw new LessonError('JOIN_REQUIRED', '请先点击上课按钮进入课堂。');
    if (intent.tabId !== tabId) throw new LessonError('REPLACED', '课堂已在另一个页面继续。');
    const peer = await members.findOneAndUpdate({ _id: uid, lessonId: id, tabId, ownerVersion: intent.version, expiresAt: { $gt: new Date(now) } },
        { $set: { connectionId, serverId, connected: true, signalSince: new Date(now), lastSignalAt: new Date(now),
            expiresAt: new Date(now + LESSON_LEASE_MS) } }, { returnDocument: 'after' });
    if (!peer) throw new LessonError('JOIN_REQUIRED', '请先点击上课按钮进入课堂。');
    return { room, peer };
}

export async function pulse(peer: LessonMember, domainId: string, now = Date.now(), lastClientSignal = now) {
    const room = await authorize(peer._id, domainId, peer.lessonId, now);
    const intent = await resumptions.findOne({ _id: peer._id, lessonId: peer.lessonId, tabId: peer.tabId,
        accepted: true, version: peer.ownerVersion });
    if (!intent) throw new LessonError('REPLACED', '此课堂已在另一个连接中打开。');
    // Timers renew a media lease even when a browser has stopped sending. Only
    // a packet actually received from this client advances its attendance.
    const lastSignalAt = new Date(Math.max(+(peer.lastSignalAt || 0), Math.min(lastClientSignal, now)));
    const signalSince = !peer.signalSince || !peer.lastSignalAt || +lastSignalAt - +peer.lastSignalAt > LESSON_LEASE_MS
        ? lastSignalAt : peer.signalSince;
    const updated = await members.updateOne({ _id: peer._id, lessonId: peer.lessonId, tabId: peer.tabId,
        connectionId: peer.connectionId, connected: true }, { $max: { expiresAt: new Date(now + LESSON_LEASE_MS), lastSignalAt, signalSince } });
    if (!updated.matchedCount) {
        const owner = await members.findOne({ _id: peer._id, lessonId: peer.lessonId });
        if (!owner) throw new LessonError('JOIN_REQUIRED', '课堂连接已过期，正在重新恢复。');
        throw new LessonError('REPLACED', '此课堂已在另一个连接中打开。');
    }
    peer.lastSignalAt = lastSignalAt;
    peer.signalSince = signalSince;
    return room;
}

/** Persist only the intersection of the two live connections' confirmed spans.
 * The same interval grows in place. Rebinding or resuming after a long silence
 * starts a separate row, leaving single-party and disconnected time uncounted. */
export async function recordAttendance(room: Lesson, student: LessonMember, teacher: LessonMember, recordedThrough: number) {
    if (!student.signalSince || !student.lastSignalAt || !teacher.signalSince || !teacher.lastSignalAt
        || student._id !== room.studentUid || teacher._id !== room.teacherUid || student.lessonId !== room._id || teacher.lessonId !== room._id
        || !student.connected || !teacher.connected || !student.connectionId || !teacher.connectionId
        || student.serverId !== teacher.serverId) return recordedThrough;
    const start = Math.max(+student.signalSince, +teacher.signalSince);
    const end = Math.min(+student.lastSignalAt, +teacher.lastSignalAt);
    if (end <= start || end <= recordedThrough) return recordedThrough;
    const key = JSON.stringify([room._id, teacher.connectionId, student.connectionId, start]);
    // External imports accept at most 128 characters, keeping this ledger ID
    // in a disjoint namespace even with the unique workspace/externalId index.
    const id = `lesson:${createHash('sha512').update(key).digest('hex')}`;
    await db.collection('training.class').updateOne({ _id: id }, {
        $setOnInsert: { workspaceId: room.workspaceId, teacherUid: room.teacherUid, domainId: room.domainId, uid: room.studentUid,
            source: 'lesson', lessonId: room._id, externalId: id, title: room.title, day: trainingDay(start),
            startAt: new Date(start), createdAt: new Date() },
        $max: { endAt: new Date(end), durationSeconds: (end - start) / 1000 },
    }, { upsert: true });
    return end;
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
        rooms.createIndexes([{ key: { participantUids: 1, domainId: 1, startAt: 1 }, name: 'lesson_participants_schedule' },
            { key: { teacherUid: 1, domainId: 1, workspaceId: 1, status: 1, startAt: -1 }, name: 'lesson_teacher_history' }]),
        members.createIndexes([{ key: { expiresAt: 1 }, name: 'lesson_member_expiry', expireAfterSeconds: 0 },
            { key: { lessonId: 1 }, name: 'lesson_member_room' }]),
        bookingSlots.createIndexes([{ key: { expiresAt: 1 }, name: 'lesson_booking_expiry', expireAfterSeconds: 0 },
            { key: { lessonId: 1 }, name: 'lesson_booking_room' }]),
        resumptions.createIndexes([{ key: { lessonId: 1 }, name: 'lesson_resume_room' }]),
    ]).catch((error) => { indexesReady = undefined; throw error; });
    return indexesReady;
}
