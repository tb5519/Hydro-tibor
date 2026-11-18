const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, { module, exports: module.exports, Buffer, URL, Date, process, console,
        require: (name) => dependencies[name] ?? require(name) });
    return module.exports;
}
const protocol = load('packages/hydrooj/src/lib/lesson.ts');
const shareProtocol = load('packages/hydrooj/src/lib/live_share.ts');
const PERM = { PERM_VIEW: 1n, PERM_EDIT_DOMAIN: 2n, PERM_ALL: 3n };
const PRIV = { PRIV_USER_PROFILE: 2 };
const code = (expected) => (error) => error.code === expected;
const audio = Buffer.alloc(640, 127).toString('base64');
// Small baseline JPEG SOF fixture. The protocol bounds dimensions before decode.
function jpeg(width = 320, height = 240, padding = 0) {
    const header = Buffer.from([255, 216, 255, 192, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255,
        1, 1, 17, 0, 255, 217]);
    const bytes = Buffer.concat([header.subarray(0, -2), Buffer.alloc(padding), header.subarray(-2)]);
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}
const tab = (uid) => `lesson-tab-${uid}-testing`;
const scheduled = (studentUid = 10, offsetMinutes = 60, durationMinutes = 60) => ({
    studentUid, tabId: tab(2), startAt: new Date(Math.ceil(Date.now() / 60000) * 60000 + offsetMinutes * 60000).toISOString(), durationMinutes,
});
const quiet = () => {};
const settle = async () => new Promise((resolve) => setTimeout(resolve, 30));
let server; let client; let database; let model; let handlers; let blocked; let workspaceOverrides; let listeners; let logins; let busCalls;
const share = {
    teacherScope: async (uid, domainId) => {
        if (![2, 3].includes(uid) || !['class-a', 'class-b'].includes(domainId) || blocked.has(uid)) {
            throw new shareProtocol.LiveShareError('FORBIDDEN', '老师权限不可用');
        }
        return { workspaceId: workspaceOverrides.get(uid) || 'a', name: `老师-${uid}` };
    },
    studentScope: async (uid, domainId) => {
        if (![10, 11].includes(uid) || !['class-a', 'class-b'].includes(domainId) || blocked.has(uid)) {
            throw new shareProtocol.LiveShareError('FORBIDDEN', '学员权限不可用');
        }
        return { workspaceId: workspaceOverrides.get(uid) || 'a', name: `学员-${uid}` };
    },
    authorizePair: async (teacherUid, studentUid, domainId) => ({
        teacher: await share.teacherScope(teacherUid, domainId), student: await share.studentScope(studentUid, domainId),
    }),
    listStudents: async () => [10, 11].filter((uid) => !blocked.has(uid)).map((uid) => ({ uid, name: `学员-${uid}`, online: false })),
};
let setupPromise;
async function setupDatabase() {
    setupPromise ||= startDatabase();
    return setupPromise;
}
async function startDatabase() {
    server = await MongoMemoryServer.create({ instance: { args: ['--nounixsocket'] } });
    client = await MongoClient.connect(server.getUri()); database = client.db('lesson_tests');
    model = load('packages/hydrooj/src/model/lesson.ts', {
        '../lib/lesson': protocol, '../lib/training_time': load('packages/hydrooj/src/lib/training_time.ts'),
        '../service/db': { collection: (name) => database.collection(name) }, './live_share': share,
        './builtin': { PERM, PRIV, BUILTIN_ROLES: { default: 1n } },
        './domain': { get: async (_id) => ({ _id, roles: { default: 1n } }), collUser: database.collection('domain.user') },
    });
    await model.apply();
    handlers = load('packages/hydrooj/src/handler/lesson.ts', {
        '../lib/lesson': protocol, '../lib/live_share': shareProtocol, '../model/lesson': model,
        '../model/builtin': { PERM, PRIV }, '../model/token': { TYPE_SESSION: 0, get: async (id) => logins.get(id) },
        '../model/workspace': { resolveDomainWorkspaceId: () => 'a', getAssignedWorkspaceIds: async () => ['a'],
            getDomains: async () => [{ _id: 'class-a' }] },
        '../service/bus': { parallel: async (name, event) => {
            busCalls.push({ name, event });
            await Promise.all(listeners.map((instance) => instance.onLessonEvent(event)));
        }, broadcast: () => { throw new Error('Media must not enter the durable outbox'); } },
        '../service/server': { Handler: class {}, ConnectionHandler: class {}, subscribe: () => () => {} },
    });
}
beforeEach(async () => {
    blocked = new Set(); workspaceOverrides = new Map(); listeners = []; busCalls = [];
    logins = new Map([2, 3, 10, 11].map((uid) => [`login-${uid}`, { uid, scope: '3', expireAt: new Date(Date.now() + 60000) }]));
    if (!database) return;
    await Promise.all([model.rooms.deleteMany({}), model.members.deleteMany({}), model.bookingSlots.deleteMany({}), model.resumptions.deleteMany({}),
        database.collection('domain.user').deleteMany({}), database.collection('training.class').deleteMany({})]);
    await database.collection('domain.user').insertMany([10, 11].map((uid) => ({ domainId: 'class-a', uid, role: 'default', join: true })));
});
after(async () => { await client?.close(); await server?.stop(); });

function connection(uid, options = {}) {
    const sent = []; const closed = []; const timers = [];
    const instance = Object.assign(new handlers.LessonConnectionHandler(), {
        user: { _id: uid }, domain: { _id: options.domainId || 'class-a' }, session: { _id: `login-${uid}` },
        request: { host: 'school.test', headers: { origin: options.origin || 'https://school.test' } },
        ctx: { setTimeout() {}, interval(callback) { timers.push(callback); } }, conn: { bufferedAmount: 0 },
        checkPriv() {}, checkPerm(permission) {
            if ((BigInt(logins.get(this.session._id)?.scope || 0) & permission) !== permission) {
                throw new shareProtocol.LiveShareError('FORBIDDEN', '会话权限不足');
            }
        }, limitRate: async () => {}, send: (data) => sent.push(data), close: (status, reason) => closed.push({ status, reason }),
    });
    listeners.push(instance); return { instance, sent, closed, timers };
}
async function connect(fixture, uid, lessonId, tabId = tab(uid)) {
    await fixture.instance.prepare();
    await fixture.instance.message({ type: 'join', lessonId, tabId });
    await settle();
}
async function activePair() {
    const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
    await model.join(10, 'class-a', room._id, tab(10), quiet);
    const teacher = connection(2); const student = connection(10);
    await connect(teacher, 2, room._id); await connect(student, 10, room._id);
    await teacher.instance.message({ type: 'pulse' }); await student.instance.message({ type: 'pulse' }); await settle();
    return { room, teacher, student };
}

describe('lesson bookings and consent with real MongoDB', () => {
    before(setupDatabase);
    it('books an offline learner without joining either participant or creating media records', async () => {
        const lesson = await model.create(2, 'class-a', scheduled(), quiet);
        assert.equal(lesson.status, 'scheduled'); assert.equal(lesson.teacherJoined, false); assert.equal(lesson.studentJoined, false);
        assert.equal(await model.members.countDocuments({}), 0);
        const listing = await model.list(10, 'class-a');
        assert.equal(listing.lessons.length, 1); assert.equal(listing.lessons[0]._id, lesson._id);
        const teacherList = await model.list(2, 'class-a');
        assert.equal(teacherList.students.length, 2); assert.equal(teacherList.students[0].online, false);
    });
    it('rejects impossible dates, missing timezone, past dates and invalid duration before reserving', async () => {
        const year = new Date().getUTCFullYear() + 1;
        for (const value of [
            { ...scheduled(), startAt: `${year}-02-30T10:00:00Z` },
            { ...scheduled(), startAt: `${year}-01-01T10:00` },
            { ...scheduled(), startAt: '2000-01-01T10:00:00Z' },
            { ...scheduled(), durationMinutes: 0 }, { ...scheduled(), durationMinutes: 241 },
            { ...scheduled(), studentUid: '10' }, { ...scheduled(), title: 'line\nbreak' },
        ]) await assert.rejects(model.create(2, 'class-a', value, quiet), code('INVALID_MESSAGE'));
        assert.equal(await model.rooms.countDocuments({}), 0); assert.equal(await model.bookingSlots.countDocuments({}), 0);
    });
    it('atomically prevents concurrent overlapping bookings of a student across teachers and domains', async () => {
        const value = scheduled();
        const results = await Promise.allSettled([
            model.create(2, 'class-a', value, quiet), model.create(3, 'class-b', { ...value, tabId: tab(3) }, quiet),
        ]);
        assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
        assert.equal(results.find((item) => item.status === 'rejected').reason.code, 'CONFLICT');
        assert.equal(await model.rooms.countDocuments({}), 1);
        const winner = results.find((item) => item.status === 'fulfilled').value;
        assert.equal(await model.bookingSlots.countDocuments({ lessonId: { $ne: winner._id } }), 0, 'Losing partial reservation is rolled back');
    });
    it('also prevents concurrent double booking of one teacher and permits exact adjacent times', async () => {
        const value = scheduled();
        const results = await Promise.allSettled([model.create(2, 'class-a', value, quiet),
            model.create(2, 'class-a', { ...value, studentUid: 11 }, quiet)]);
        assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
        const first = results.find((item) => item.status === 'fulfilled').value;
        const next = await model.create(2, 'class-a', { ...value, studentUid: 11, startAt: first.endAt }, quiet);
        assert.equal(next.status, 'scheduled');
    });
    it('requires a student click at the booked time even after the teacher enters early', async () => {
        const value = scheduled(); const room = await model.create(2, 'class-a', value, quiet);
        await model.join(2, 'class-a', room._id, tab(2), quiet);
        await assert.rejects(model.join(10, 'class-a', room._id, tab(10), quiet), code('TOO_EARLY'));
        await assert.rejects(model.bind(10, 'class-a', room._id, tab(10), 'connection-testing', 'server-a'), code('TOO_EARLY'));
        const joined = await model.join(10, 'class-a', room._id, tab(10), quiet, Date.parse(value.startAt));
        assert.equal(joined.studentJoined, true);
    });
    it('isolates participants, domain and workspace and rechecks revoked membership', async () => {
        const room = await model.create(2, 'class-a', scheduled(), quiet);
        await assert.rejects(model.authorize(11, 'class-a', room._id), code('NOT_FOUND'));
        await assert.rejects(model.authorize(10, 'class-b', room._id), code('NOT_FOUND'));
        assert.equal((await model.list(11, 'class-a')).lessons.length, 0);
        workspaceOverrides.set(10, 'foreign');
        await assert.rejects(model.authorize(10, 'class-a', room._id), code('FORBIDDEN'));
        assert.equal((await model.list(10, 'class-a')).lessons.length, 0);
        workspaceOverrides.clear(); blocked.add(10);
        await assert.rejects(model.authorize(2, 'class-a', room._id), code('FORBIDDEN'));
        assert.equal((await model.list(2, 'class-a')).lessons.length, 0);
    });
    it('only permits teachers to create or cancel, and cancellation releases all reservations', async () => {
        const value = scheduled(); const room = await model.create(2, 'class-a', value, quiet);
        await assert.rejects(model.create(10, 'class-a', { ...value, studentUid: 11 }, quiet), code('FORBIDDEN'));
        await assert.rejects(model.finish(10, 'class-a', room._id, 'cancelled', quiet), code('FORBIDDEN'));
        await assert.rejects(model.finish(3, 'class-a', room._id, 'cancelled', quiet), code('NOT_FOUND'));
        const cancelled = await model.finish(2, 'class-a', room._id, 'cancelled', quiet);
        assert.equal(cancelled.status, 'cancelled'); assert.equal(await model.bookingSlots.countDocuments({ lessonId: room._id }), 0);
        await assert.rejects(model.join(10, 'class-a', room._id, tab(10), quiet), code('ENDED'));
        await model.create(2, 'class-a', value, quiet);
    });
    it('deducts only confirmed joint native attendance and unions an overlapping external import', async () => {
        const booked = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        const base = Date.now();
        const time = (seconds) => base + seconds * 1000;
        const ledger = database.collection('training.class');
        const { room, peer: teacher } = await model.bind(2, 'class-a', booked._id, tab(2), 'teacher-1', 'server-a', base);
        await model.join(10, 'class-a', booked._id, tab(10), quiet, time(30));
        assert.equal(await ledger.countDocuments(), 0);
        const { peer: student } = await model.bind(10, 'class-a', booked._id, tab(10), 'student-1', 'server-a', time(30));
        await model.pulse(teacher, 'class-a', time(40), time(38));
        await model.pulse(student, 'class-a', time(42), time(41));
        await Promise.all([model.recordAttendance(room, student, teacher, 0), model.recordAttendance(room, student, teacher, 0)]);
        // Server lease renewals alone cannot extend the earlier signal.
        await model.pulse(teacher, 'class-a', time(55), time(38));
        await model.recordAttendance(room, student, teacher, 0);
        const row = await ledger.findOne();
        assert.deepEqual([+row.startAt, +row.endAt, row.durationSeconds], [time(30), time(38), 8]);
        assert.deepEqual([row.uid, row.teacherUid, row.workspaceId, row.domainId, row.lessonId, row.source],
            [10, 2, 'a', 'class-a', room._id, 'lesson']);
        await model.pulse(teacher, 'class-a', time(60), time(60));
        await model.pulse(student, 'class-a', time(60), time(60));
        await model.recordAttendance(room, student, teacher, time(38));
        await model.recordAttendance(room, student, { ...teacher, lastSignalAt: new Date(time(35)) }, 0);
        assert.equal(await ledger.countDocuments(), 1);
        const result = await ledger.findOne();
        assert.equal(result.durationSeconds, 30);
        const clock = load('packages/hydrooj/src/lib/training_time.ts');
        const { mergeLearningTime } = load('packages/hydrooj/src/lib/learning_time.ts', { './training_time': clock });
        const practice = clock.trainingIntervals(time(10), time(70)).map((interval) => ({
            uid: 10, domainId: 'class-a', day: interval.day, seconds: interval.milliseconds / 1000,
            intervals: [{ start: interval.start, end: interval.end, kind: 'problem', pid: 5 }],
        }));
        const external = { ...result, externalId: 'classflow:example', startAt: new Date(time(35)), endAt: new Date(time(65)) };
        const combined = mergeLearningTime(practice, [result, external], base, time(70)).students[0];
        assert.deepEqual([combined.trainingSeconds, combined.classSeconds, combined.seconds], [25, 35, 60]);
    });
    it('does not bridge disconnect, silent sleep, or a different classroom media server', async () => {
        const booked = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        const base = Date.now();
        const time = (seconds) => base + seconds * 1000;
        await model.join(10, 'class-a', booked._id, tab(10), quiet, base);
        const { room, peer: student } = await model.bind(10, 'class-a', booked._id, tab(10), 'student', 'server-a', base);
        let { peer: teacher } = await model.bind(2, 'class-a', booked._id, tab(2), 'teacher-1', 'server-a', base);
        const pairPulse = async (s) => {
            await Promise.all([model.pulse(teacher, 'class-a', time(s)), model.pulse(student, 'class-a', time(s))]);
            await model.recordAttendance(room, student, teacher, 0);
        };
        await pairPulse(10);
        await model.disconnect(teacher);
        assert.equal(await model.otherMember(room, 10, time(11)), null);
        teacher = (await model.bind(2, 'class-a', booked._id, tab(2), 'teacher-2', 'server-a', time(20))).peer;
        await pairPulse(25);
        // Both sockets survive a machine sleep longer than the media lease.
        await pairPulse(100);
        await pairPulse(106);
        teacher = (await model.bind(2, 'class-a', booked._id, tab(2), 'teacher-3', 'different-server', time(107))).peer;
        await pairPulse(112);
        await model.finish(2, 'class-a', booked._id, 'ended', quiet, time(200));
        const ledger = await database.collection('training.class').find({ lessonId: room._id }).sort({ startAt: 1 }).toArray();
        assert.deepEqual(ledger.map((row) => [(+row.startAt - base) / 1000, (+row.endAt - base) / 1000]),
            [[0, 10], [20, 25], [100, 106]]);
        assert.equal(ledger.reduce((sum, row) => sum + row.durationSeconds, 0), 21);
    });
    it('requires REST consent before binding and atomically allows only one media tab per user', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await assert.rejects(model.bind(10, 'class-a', room._id, tab(10), 'connection-testing', 'server-a'), code('JOIN_REQUIRED'));
        const results = await Promise.allSettled([model.join(10, 'class-a', room._id, tab(10), quiet),
            model.join(10, 'class-a', room._id, 'another-lesson-tab', quiet)]);
        assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
        assert.equal(results.find((item) => item.status === 'rejected').reason.code, 'BUSY');
        const owner = await model.members.findOne({ _id: 10 });
        const bound = await model.bind(10, 'class-a', room._id, owner.tabId, 'connection-old', 'server-a');
        await model.bind(10, 'class-a', room._id, owner.tabId, 'connection-new', 'server-a');
        await assert.rejects(model.pulse(bound.peer, 'class-a'), code('REPLACED'));
    });
});

describe('lesson live media authorization', () => {
    before(setupDatabase);
    it('rejects forged origins, logged-out tokens and impersonation before joining', async () => {
        await assert.rejects(connection(2, { origin: 'https://attacker.test' }).instance.prepare(), code('ORIGIN'));
        logins.delete('login-2');
        await assert.rejects(connection(2).instance.prepare(), code('FORBIDDEN'));
        const sudo = connection(10); sudo.instance.session.sudoUid = 2;
        await assert.rejects(sudo.instance.prepare(), code('FORBIDDEN'));
    });
    it('a guessed room ID cannot bypass explicit REST join', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        const student = connection(10); await connect(student, 10, room._id);
        assert(student.closed.length); assert.equal(student.sent.at(-1).code, 'JOIN_REQUIRED');
        assert(!student.sent.some((item) => item.type === 'ready'));
    });
    it('writes native attendance through client pulses even with both cameras and microphones off', async () => {
        const { room, teacher, student } = await activePair();
        await teacher.instance.message({ type: 'pulse' });
        await student.instance.message({ type: 'pulse' });
        const rows = await database.collection('training.class').find({ lessonId: room._id }).toArray();
        assert.equal(rows.length, 1);
        assert.ok(rows[0].durationSeconds > 0);
        assert.equal(rows[0].uid, 10);
    });
    it('relays only current participant frames, drops stale/oversized routing and never persists media', async () => {
        const { room, teacher, student } = await activePair();
        const frame = { type: 'video', lessonId: room._id, seq: 0, data: jpeg() };
        await teacher.instance.message(frame); await settle();
        assert(student.sent.some((item) => item.type === 'video' && item.uid === 2 && item.data === frame.data));
        const received = student.sent.filter((item) => item.type === 'video').length;
        await teacher.instance.message(frame); await teacher.instance.message({ ...frame, lessonId: 'different-room', seq: 1 });
        await teacher.instance.message({ ...frame, seq: 2, uid: 11 }); await settle();
        assert.equal(student.sent.filter((item) => item.type === 'video').length, received);
        await student.instance.message({ type: 'audio', lessonId: room._id, seq: 0, data: audio }); await settle();
        assert(teacher.sent.some((item) => item.type === 'audio' && item.uid === 10));
        for (const name of ['lesson.room', 'lesson.member', 'lesson.booking.slot']) {
            const stored = JSON.stringify(await database.collection(name).find({}).toArray());
            assert(!stored.includes(frame.data)); assert(!stored.includes(audio));
        }
        assert(busCalls.every((item) => item.name === 'lesson/event'));
    });
    it('relays larger 720p pictures without weakening microphone backpressure', async () => {
        const { room, teacher, student } = await activePair();
        const data = jpeg(1280, 720, 90000);
        assert(data.length > 64 * 1024 && data.length < protocol.LESSON_VIDEO_MAX_LENGTH);
        assert.equal(teacher.instance.maxMessageBytes, protocol.LESSON_MAX_MESSAGE_BYTES);
        student.instance.conn.bufferedAmount = 80 * 1024;
        await teacher.instance.message({ type: 'video', lessonId: room._id, seq: 0, data }); await settle();
        assert(student.sent.some((item) => item.type === 'video' && item.data === data));
        student.instance.conn.bufferedAmount = 20 * 1024;
        await teacher.instance.message({ type: 'audio', lessonId: room._id, seq: 0, data: audio }); await settle();
        assert(!student.sent.some((item) => item.type === 'audio'), 'The original 16 KiB audio backpressure still applies');
        student.instance.conn.bufferedAmount = 0;
        await teacher.instance.message({ type: 'audio', lessonId: room._id, seq: 1, data: audio }); await settle();
        assert(student.sent.some((item) => item.type === 'audio'));
    });
    it('applies receiver backpressure and packet age limits without queuing old video', async () => {
        const { room, teacher, student } = await activePair();
        student.instance.conn.bufferedAmount = 600 * 1024;
        await teacher.instance.message({ type: 'video', lessonId: room._id, seq: 0, data: jpeg() }); await settle();
        assert(!student.sent.some((item) => item.type === 'video'));
        student.instance.conn.bufferedAmount = 0;
        const sender = await model.members.findOne({ _id: 2 }); const receiver = await model.members.findOne({ _id: 10 });
        await student.instance.onLessonEvent({ uid: 10, lessonId: room._id, connectionId: receiver.connectionId,
            sentAt: Date.now() - 2000, message: { type: 'video', lessonId: room._id, seq: 1, uid: 2, streamId: sender.connectionId, data: jpeg() } });
        assert(!student.sent.some((item) => item.type === 'video'));
    });
    it('leaving removes the media owner and stops relay to the original student socket', async () => {
        const { room, teacher, student } = await activePair();
        await model.leave(10, 'class-a', room._id, tab(10), handlers.emitLesson); await settle();
        await teacher.instance.message({ type: 'pulse' }); await teacher.instance.message({ type: 'video', lessonId: room._id, seq: 0, data: jpeg() });
        await settle();
        assert(!student.sent.some((item) => item.type === 'video')); assert(student.closed.length);
        assert(teacher.sent.some((item) => item.type === 'peer' && item.online === false));
    });
    it('teacher ending the class stops media immediately on both sockets', async () => {
        const { room, teacher, student } = await activePair();
        await model.finish(2, 'class-a', room._id, 'ended', handlers.emitLesson); await settle();
        assert(teacher.sent.some((item) => item.type === 'ended')); assert(student.sent.some((item) => item.type === 'ended'));
        await teacher.instance.message({ type: 'video', lessonId: room._id, seq: 0, data: jpeg() }); await settle();
        assert(!student.sent.some((item) => item.type === 'video')); assert.equal(await model.members.countDocuments({}), 0);
    });
    it('permission revocation prevents outgoing media before the next renewal and closes the socket', async () => {
        const { room, teacher, student } = await activePair();
        blocked.add(2); teacher.instance.onUserPermissionsChanged();
        await teacher.instance.message({ type: 'video', lessonId: room._id, seq: 0, data: jpeg() }); await settle();
        assert(!student.sent.some((item) => item.type === 'video'));
        await teacher.timers[0](); assert(teacher.closed.length);
        await student.timers[0](); assert(student.closed.length);
    });
});


function resumeHttp(uid, body = { tabId: tab(uid) }, currentDomain = 'class-b') {
    const headers = new Map();
    const instance = Object.assign(new handlers.LessonResumeHandler(), {
        user: { _id: uid }, domain: { _id: currentDomain }, session: { _id: 'login-' + uid },
        request: { method: 'POST', body, host: 'school.test', headers: { origin: 'https://school.test' } },
        response: { status: 200, addHeader(key, value) { headers.set(key, value); } },
        checkPriv() {}, checkPerm() { throw new Error('Resume must not check the current page domain role'); },
        limitRate: async () => {},
        url(name, parameters = {}) {
            return '/d/' + parameters.domainId + '/' + (name === 'lesson_conn' ? 'lesson/conn' : name === 'lesson_resume' ? 'lesson/resume' : 'lesson');
        },
    });
    return { instance, headers };
}

async function runResumeHttp(fixture) {
    await fixture.instance.prepare(); await fixture.instance.post(); return fixture.instance.response.body;
}

describe('learner whole-screen media authorization', () => {
    before(setupDatabase);
    const screens = fixture => fixture.sent.filter(message => message.type === 'screen');
    async function shareScreen(pair) {
        await pair.teacher.instance.message({ type: 'screen-view', lessonId: pair.room._id, watching: true });
        await settle();
        await pair.student.instance.message({ type: 'screen-state', lessonId: pair.room._id, state: 'sharing' });
        await settle();
    }
    const screenFrame = (pair, seq = 0) => ({ type: 'screen', lessonId: pair.room._id, seq, data: jpeg(1280, 720) });
    it('requires both the teacher view request and learner sharing state before sending only to that teacher', async () => {
        const pair = await activePair();
        const teacherMember = await model.members.findOne({ _id: 2 });
        const studentReady = pair.student.sent.find(message => message.type === 'ready');
        assert.equal(studentReady.peerOnline, true);
        assert.equal(studentReady.peerStreamId, teacherMember.connectionId,
            'The student ready message identifies the already bound teacher for the initial screen handshake');
        await pair.student.instance.message(screenFrame(pair)); await settle();
        assert.equal(screens(pair.teacher).length, 0);
        await pair.teacher.instance.message({ type: 'screen-view', lessonId: pair.room._id, watching: true }); await settle();
        assert(pair.student.sent.some(message => message.type === 'screen-view' && message.watching && message.uid === 2));
        await pair.student.instance.message(screenFrame(pair, 1)); await settle();
        assert.equal(screens(pair.teacher).length, 0, 'A teacher request cannot grant learner screen consent');
        await pair.student.instance.message({ type: 'screen-state', lessonId: pair.room._id, state: 'sharing' }); await settle();
        assert(pair.teacher.sent.some(message => message.type === 'screen-state' && message.state === 'sharing' && message.uid === 10));
        await pair.student.instance.message(screenFrame(pair, 2)); await settle();
        assert.equal(screens(pair.teacher).length, 1);
        assert.equal(screens(pair.teacher)[0].uid, 10); assert.equal(screens(pair.student).length, 0);
        for (const name of ['lesson.room', 'lesson.member', 'lesson.booking.slot', 'lesson.resumption']) {
            assert(!JSON.stringify(await database.collection(name).find({}).toArray()).includes(screenFrame(pair).data));
        }
    });
    it('rejects learner view requests, teacher sharing states and frames, and forged routing without stopping camera or audio', async () => {
        const pair = await activePair(); await shareScreen(pair);
        const before = pair.student.sent.length;
        await pair.student.instance.message({ type: 'screen-view', lessonId: pair.room._id, watching: true });
        await pair.teacher.instance.message({ type: 'screen-state', lessonId: pair.room._id, state: 'sharing' });
        await pair.teacher.instance.message(screenFrame(pair));
        await pair.student.instance.message({ ...screenFrame(pair), uid: 11 });
        await pair.student.instance.message({ type: 'screen-state', lessonId: pair.room._id, state: 'sharing', connectionId: 'forged-owner' });
        await settle();
        assert.equal(screens(pair.teacher).length, 0); assert.equal(screens(pair.student).length, 0);
        assert(pair.student.sent.slice(before).some(message => message.type === 'error'));
        assert(pair.teacher.sent.some(message => message.type === 'error'));
        await pair.teacher.instance.message({ type: 'video', lessonId: pair.room._id, seq: 0, data: jpeg() });
        await pair.student.instance.message({ type: 'audio', lessonId: pair.room._id, seq: 0, data: audio }); await settle();
        assert(pair.student.sent.some(message => message.type === 'video' && message.uid === 2));
        assert(pair.teacher.sent.some(message => message.type === 'audio' && message.uid === 10));
        assert.equal(pair.student.closed.length, 0); assert.equal(pair.teacher.closed.length, 0);
    });
    it('drops screen frames immediately when the teacher returns to the camera or learner stops sharing', async () => {
        const pair = await activePair(); await shareScreen(pair);
        await pair.student.instance.message(screenFrame(pair)); await settle();
        assert.equal(screens(pair.teacher).length, 1);
        await pair.teacher.instance.message({ type: 'screen-view', lessonId: pair.room._id, watching: false }); await settle();
        await pair.student.instance.message(screenFrame(pair, 1)); await settle();
        assert.equal(screens(pair.teacher).length, 1);
        assert(pair.student.sent.some(message => message.type === 'screen-view' && message.watching === false));
        await pair.teacher.instance.message({ type: 'screen-view', lessonId: pair.room._id, watching: true }); await settle();
        await pair.student.instance.message({ type: 'screen-state', lessonId: pair.room._id, state: 'stopped' }); await settle();
        await pair.student.instance.message(screenFrame(pair, 2)); await settle();
        assert.equal(screens(pair.teacher).length, 1);
        assert(pair.teacher.sent.some(message => message.type === 'screen-state' && message.state === 'stopped'));
    });
    it('keeps declined screen sharing idle until a later explicit learner sharing state', async () => {
        const pair = await activePair();
        await pair.teacher.instance.message({ type: 'screen-view', lessonId: pair.room._id, watching: true }); await settle();
        await pair.student.instance.message({ type: 'screen-state', lessonId: pair.room._id, state: 'declined' }); await settle();
        await pair.student.instance.message(screenFrame(pair)); await settle();
        assert.equal(screens(pair.teacher).length, 0);
        assert(pair.teacher.sent.some(message => message.type === 'screen-state' && message.state === 'declined'));
        await pair.student.instance.message({ type: 'screen-state', lessonId: pair.room._id, state: 'sharing' }); await settle();
        await pair.student.instance.message(screenFrame(pair, 1)); await settle();
        assert.equal(screens(pair.teacher).length, 1);
    });
    it('drops stale or backpressured screen frames and does not replay them after congestion clears', async () => {
        const pair = await activePair(); await shareScreen(pair);
        pair.teacher.instance.conn.bufferedAmount = 600 * 1024;
        await pair.student.instance.message(screenFrame(pair)); await settle();
        assert.equal(screens(pair.teacher).length, 0);
        pair.teacher.instance.conn.bufferedAmount = 0;
        const sender = await model.members.findOne({ _id: 10 }); const receiver = await model.members.findOne({ _id: 2 });
        await pair.teacher.instance.onLessonEvent({ uid: 2, lessonId: pair.room._id, connectionId: receiver.connectionId,
            sentAt: Date.now() - 2000, message: { ...screenFrame(pair, 1), uid: 10, streamId: sender.connectionId } });
        await settle(); assert.equal(screens(pair.teacher).length, 0);
        await pair.student.instance.message(screenFrame(pair, 2)); await settle();
        assert.equal(screens(pair.teacher).length, 1); assert.equal(screens(pair.teacher)[0].seq, 2);
    });
    it('fences old teacher view requests after a replacement media socket and requires the new pair handshake', async () => {
        const pair = await activePair(); await shareScreen(pair);
        const oldTeacher = await model.members.findOne({ _id: 2 });
        await model.resume(2, 'new-screen-teacher-tab', handlers.emitLesson); await settle();
        const replacement = connection(2); await connect(replacement, 2, pair.room._id, 'new-screen-teacher-tab');
        await pair.student.instance.message({ type: 'pulse' }); await replacement.instance.message({ type: 'pulse' }); await settle();
        const student = await model.members.findOne({ _id: 10 });
        const teacherReady = replacement.sent.find(message => message.type === 'ready');
        assert.equal(teacherReady.peerOnline, true);
        assert.equal(teacherReady.peerStreamId, student.connectionId,
            'A rebound teacher immediately receives the current learner stream identity');
        await pair.student.instance.message({ type: 'screen-state', lessonId: pair.room._id, state: 'sharing' }); await settle();
        await pair.student.instance.onLessonEvent({ uid: 10, lessonId: pair.room._id, connectionId: student.connectionId, sentAt: Date.now(),
            message: { type: 'screen-view', lessonId: pair.room._id, watching: true, uid: 2, streamId: oldTeacher.connectionId } });
        await pair.student.instance.message(screenFrame(pair)); await settle();
        assert.equal(screens(replacement).length, 0);
        await replacement.instance.message({ type: 'screen-view', lessonId: pair.room._id, watching: true }); await settle();
        await pair.student.instance.message({ type: 'screen-state', lessonId: pair.room._id, state: 'sharing' }); await settle();
        await pair.student.instance.message(screenFrame(pair, 1)); await settle();
        assert.equal(screens(replacement).length, 1); assert.equal(screens(pair.teacher).length, 0);
    });
    it('ignores stale control envelopes and cross-room routing even after explicit sharing', async () => {
        const pair = await activePair(); await shareScreen(pair);
        const sender = await model.members.findOne({ _id: 2 }); const receiver = await model.members.findOne({ _id: 10 });
        await pair.teacher.instance.message({ type: 'screen-view', lessonId: pair.room._id, watching: false }); await settle();
        for (const overrides of [{ sentAt: Date.now() - 2000 }, { lessonId: 'different-screen-room' }, { connectionId: 'different-screen-connection' }]) {
            await pair.student.instance.onLessonEvent({ uid: 10, lessonId: pair.room._id, connectionId: receiver.connectionId,
                sentAt: Date.now(), message: { type: 'screen-view', lessonId: pair.room._id, watching: true,
                    uid: 2, streamId: sender.connectionId }, ...overrides });
        }
        await pair.student.instance.message(screenFrame(pair)); await settle();
        assert.equal(screens(pair.teacher).length, 0);
    });
    it('does not let a reordered sharing control revive screen packets after a newer learner stop', async () => {
        const pair = await activePair(); await shareScreen(pair);
        const sharing = busCalls.filter(item => item.event.message.type === 'screen-state' && item.event.message.state === 'sharing').at(-1).event;
        await pair.student.instance.message(screenFrame(pair)); await settle();
        const frame = busCalls.filter(item => item.event.message.type === 'screen').at(-1).event;
        assert.equal(screens(pair.teacher).length, 1);
        await pair.student.instance.message({ type: 'screen-state', lessonId: pair.room._id, state: 'stopped' }); await settle();
        await pair.teacher.instance.onLessonEvent(sharing);
        await pair.teacher.instance.onLessonEvent(frame);
        assert.equal(screens(pair.teacher).length, 1, 'A delayed same-socket sharing control must not override the newer stop');
    });
    it('stops screen relay when a learner leaves, even from the original still-open socket', async () => {
        const pair = await activePair(); await shareScreen(pair);
        await model.leave(10, 'class-a', pair.room._id, tab(10), handlers.emitLesson); await settle();
        await pair.student.instance.message(screenFrame(pair)); await settle();
        assert.equal(screens(pair.teacher).length, 0); assert(pair.student.closed.length);
    });
    it('ends screen transport immediately for both participants when the teacher ends class', async () => {
        const pair = await activePair(); await shareScreen(pair);
        await model.finish(2, 'class-a', pair.room._id, 'ended', handlers.emitLesson); await settle();
        await pair.student.instance.message(screenFrame(pair)); await settle();
        assert.equal(screens(pair.teacher).length, 0); assert(pair.student.closed.length); assert(pair.teacher.closed.length);
    });
    it('invalidates screen sending and receiving immediately on learner permission revocation', async () => {
        const pair = await activePair(); await shareScreen(pair);
        blocked.add(10); pair.student.instance.onUserPermissionsChanged(); pair.teacher.instance.onUserPermissionsChanged();
        await pair.student.instance.message(screenFrame(pair)); await settle();
        assert.equal(screens(pair.teacher).length, 0);
        await pair.student.timers[0](); await pair.teacher.timers[0]();
        assert(pair.student.closed.length); assert(pair.teacher.closed.length);
    });
});

describe('durable classroom recovery', () => {
    before(setupDatabase);
    async function legacyStudent() {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        await model.resumptions.deleteOne({ _id: 10 });
        await model.members.updateOne({ _id: 10 }, { $unset: { ownerVersion: '' } });
        return room;
    }
    it('migrates an unexpired legacy explicit-join lease into one durable new-tab recovery owner', async () => {
        const room = await legacyStudent();
        const result = await model.resume(10, 'migrated-student-tab', quiet);
        assert.equal(result._id, room._id);
        const intent = await model.resumptions.findOne({ _id: 10 });
        const member = await model.members.findOne({ _id: 10 });
        assert.equal(intent.accepted, true); assert.equal(intent.lessonId, room._id);
        assert.equal(intent.tabId, 'migrated-student-tab'); assert(intent.version > 0);
        assert.equal(member.tabId, intent.tabId); assert.equal(member.ownerVersion, intent.version);
        await model.bind(10, 'class-a', room._id, intent.tabId, 'migrated-owner-connection', 'server-a');
    });
    it('never migrates missing, expired, fenced or tombstoned legacy participation', async () => {
        await legacyStudent();
        const original = await model.members.findOne({ _id: 10 });
        await model.members.deleteOne({ _id: 10 });
        assert.equal(await model.resume(10, 'missing-legacy-tab', quiet), null);
        await model.members.insertOne({ ...original, expiresAt: new Date(Date.now() - 1) });
        assert.equal(await model.resume(10, 'expired-legacy-tab', quiet), null);
        await model.members.updateOne({ _id: 10 }, { $set: { expiresAt: new Date(Date.now() + 60000), ownerVersion: 3 } });
        assert.equal(await model.resume(10, 'fenced-legacy-tab', quiet), null);
        await model.members.updateOne({ _id: 10 }, { $unset: { ownerVersion: '' } });
        await model.resumptions.insertOne({ _id: 10, lessonId: null, accepted: false, version: 4 });
        assert.equal(await model.resume(10, 'tombstoned-legacy-tab', quiet), null);
        assert.equal((await model.members.findOne({ _id: 10 })).tabId, original.tabId);
        assert.equal((await model.resumptions.findOne({ _id: 10 })).accepted, false);
    });
    it('rejects narrowed token or failed target access before migrating a legacy owner', async () => {
        await legacyStudent();
        const original = await model.members.findOne({ _id: 10 });
        await assert.rejects(model.resume(10, 'denied-legacy-tab', quiet, Date.now(), async () => {
            throw new protocol.LessonError('FORBIDDEN', 'Target access was revoked');
        }), code('FORBIDDEN'));
        assert.equal(await model.resumptions.findOne({ _id: 10 }), null);
        assert.deepEqual(await model.members.findOne({ _id: 10 }), original);
        logins.get('login-10').scope = '0';
        await assert.rejects(runResumeHttp(resumeHttp(10, { tabId: 'narrow-legacy-tab', expectedUid: 10 })), code('FORBIDDEN'));
        assert.equal(await model.resumptions.findOne({ _id: 10 }), null);
        assert.deepEqual(await model.members.findOne({ _id: 10 }), original);
    });
    it('honors a legacy tab leave and cannot resurrect its lease during migration', async () => {
        const room = await legacyStudent();
        const result = await Promise.allSettled([model.resume(10, 'legacy-leave-race-tab', quiet, Date.now(), async () => {
            await model.leave(10, 'class-a', room._id, tab(10), quiet);
        })]);
        assert(result[0].status === 'rejected' || result[0].value === null);
        assert.equal(await model.members.findOne({ _id: 10 }), null);
        assert.equal(await model.resumptions.countDocuments({ _id: 10, accepted: true }), 0);
        assert.equal(await model.resume(10, 'legacy-after-leave-tab', quiet), null);
        assert.equal((await model.rooms.findOne({ _id: room._id })).status, 'active');
    });
    it('checks the original page account before recovery even when both accounts belong to the same room', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        const teacherOwner = await model.members.findOne({ _id: 2 });
        const studentOwner = await model.members.findOne({ _id: 10 });
        await assert.rejects(runResumeHttp(resumeHttp(10, { tabId: 'old-teacher-page-tab', expectedUid: 2 })), code('FORBIDDEN'));
        await assert.rejects(runResumeHttp(resumeHttp(2, { tabId: 'old-student-page-tab', expectedUid: 10 })), code('FORBIDDEN'));
        assert.deepEqual(await model.members.findOne({ _id: 2 }), teacherOwner);
        assert.deepEqual(await model.members.findOne({ _id: 10 }), studentOwner);
        const restored = await runResumeHttp(resumeHttp(10, { tabId: 'correct-student-page-tab', expectedUid: 10 }));
        assert.equal(restored.uid, 10); assert.equal(restored.lesson._id, room._id);
        const absent = await runResumeHttp(resumeHttp(11, { tabId: 'not-attending-page-tab', expectedUid: 11 }));
        assert.equal(absent.uid, 11); assert.equal(absent.lesson, null);
    });

    it('never grants automatic recovery to an invited learner before their first explicit click', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        assert.equal(await model.resume(10, 'new-student-tab', quiet), null);
        assert.equal(await model.resumptions.countDocuments({ _id: 10, accepted: true }), 0);
        const resumedTeacher = await model.resume(2, 'new-teacher-tab', quiet);
        assert.equal(resumedTeacher._id, room._id);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        assert.equal((await model.resume(10, 'new-student-tab', quiet))._id, room._id);
    });
    it('recovers both participants after media leases are removed and long after the planned lesson end', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        const teacherVersion = (await model.resumptions.findOne({ _id: 2 })).version;
        await model.members.deleteMany({ lessonId: room._id });
        const later = Date.parse(room.endAt) + 8 * 3600000;
        assert.equal((await model.authorize(2, 'class-a', room._id, later)).status, 'active');
        assert((await model.list(10, 'class-a', later)).lessons.some(item => item._id === room._id));
        const teacher = await model.resume(2, 'reopened-teacher-tab', quiet, later);
        const student = await model.resume(10, 'reopened-student-tab', quiet, later);
        assert.equal(teacher._id, room._id); assert.equal(student._id, room._id);
        assert((await model.resumptions.findOne({ _id: 2 })).version > teacherVersion);
        assert.equal((await model.members.findOne({ _id: 10 })).tabId, 'reopened-student-tab');
    });
    it('transfers the owner to a new tab and an old tab leave cannot revoke the new recovery intent', async () => {
        const { room, student } = await activePair();
        const events = [];
        const old = await model.members.findOne({ _id: 10 });
        await model.resume(10, 'replacement-student-tab', event => { events.push(event); handlers.emitLesson(event); });
        await settle();
        assert(events.some(event => event.uid === 10 && event.message.type === 'owner'));
        assert(student.closed.some(event => event.reason === 'REPLACED'));
        const current = await model.bind(10, 'class-a', room._id, 'replacement-student-tab', 'replacement-connection', 'server-a');
        await model.leave(10, 'class-a', room._id, old.tabId, quiet);
        assert.equal((await model.resumptions.findOne({ _id: 10 })).accepted, true);
        assert.equal((await model.members.findOne({ _id: 10 })).tabId, 'replacement-student-tab');
        await model.pulse(current.peer, 'class-a');
        await assert.rejects(model.bind(10, 'class-a', room._id, old.tabId, 'stale-tab-connection', 'server-a'), code('REPLACED'));
    });
    it('ignores late owner messages from older admissions without closing the current recovered socket', async () => {
        const { room } = await activePair();
        await model.resume(10, 'recovered-owner-tab', handlers.emitLesson);
        const recovered = connection(10);
        await connect(recovered, 10, room._id, 'recovered-owner-tab');
        const member = await model.members.findOne({ _id: 10 });
        assert.equal(recovered.closed.length, 0);
        await recovered.instance.onLessonEvent({ uid: 10, lessonId: room._id,
            message: { type: 'owner', ownerVersion: member.ownerVersion - 1, connectionId: 'older-owner-connection' } });
        await recovered.instance.onLessonEvent({ uid: 10, lessonId: room._id,
            message: { type: 'owner', ownerVersion: member.ownerVersion } });
        assert.equal(recovered.closed.length, 0);
        await recovered.instance.message({ type: 'pulse' });
        assert(recovered.sent.some(message => message.type === 'pulse'));
        await recovered.instance.onLessonEvent({ uid: 10, lessonId: room._id,
            message: { type: 'owner', ownerVersion: member.ownerVersion + 1 } });
        assert.equal(recovered.closed.length, 0, 'a future notice must match an actual database owner');
        await model.resume(10, 'newer-owner-notice-tab', quiet);
        await recovered.instance.onLessonEvent({ uid: 10, lessonId: room._id,
            message: { type: 'owner', ownerVersion: member.ownerVersion + 1 } });
        assert(recovered.closed.some(event => event.reason === 'REPLACED'));
    });
    it('ignores an old connection notice after the same admission version binds a replacement socket', async () => {
        const { room } = await activePair();
        const oldOwner = await model.members.findOne({ _id: 10 });
        const replacement = connection(10);
        await connect(replacement, 10, room._id, tab(10));
        const current = await model.members.findOne({ _id: 10 });
        assert.equal(current.ownerVersion, oldOwner.ownerVersion);
        assert.notEqual(current.connectionId, oldOwner.connectionId);
        await replacement.instance.onLessonEvent({ uid: 10, lessonId: room._id,
            message: { type: 'owner', ownerVersion: oldOwner.ownerVersion, connectionId: oldOwner.connectionId } });
        assert.equal(replacement.closed.length, 0);
        await replacement.instance.message({ type: 'pulse' });
        assert(replacement.sent.some(message => message.type === 'pulse'));
        assert.equal((await model.members.findOne({ _id: 10 })).connectionId, current.connectionId);
    });
    it('classifies an expired media lease as recoverable and recreates it without ending the classroom', async () => {
        const { room, student } = await activePair();
        const previous = await model.members.findOne({ _id: 10 });
        await model.members.deleteOne({ _id: 10 });
        await assert.rejects(model.pulse(previous, 'class-a'), code('JOIN_REQUIRED'));
        await student.instance.message({ type: 'pulse' });
        assert(student.sent.some(message => message.type === 'error' && message.code === 'JOIN_REQUIRED'));
        assert(student.closed.some(event => event.reason === 'JOIN_REQUIRED'));
        const resumed = await model.resume(10, 'lease-recreated-tab', handlers.emitLesson);
        assert.equal(resumed._id, room._id);
        assert.equal((await model.rooms.findOne({ _id: room._id })).status, 'active');
        const recovered = connection(10);
        await connect(recovered, 10, room._id, 'lease-recreated-tab');
        assert(recovered.sent.some(message => message.type === 'ready'));
        assert.equal(recovered.closed.length, 0);
    });
    it('labels a late old-tab bind as replaced instead of asking that old page to recover ownership again', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        const events = [];
        await model.resume(10, 'latest-student-page-tab', event => { events.push(event); handlers.emitLesson(event); });
        const intent = await model.resumptions.findOne({ _id: 10 });
        const admission = events.find(event => event.uid === 10 && event.message.type === 'owner');
        assert(admission); assert.equal(admission.message.ownerVersion, intent.version);
        assert.equal(admission.message.connectionId, undefined);
        await assert.rejects(model.bind(10, 'class-a', room._id, tab(10), 'old-delayed-bind', 'server-a'), code('REPLACED'));
        const stale = connection(10);
        await connect(stale, 10, room._id, tab(10));
        assert(stale.closed.some(event => event.reason === 'REPLACED'));
        assert.equal((await model.resumptions.findOne({ _id: 10 })).version, intent.version);
        assert.equal((await model.members.findOne({ _id: 10 })).tabId, 'latest-student-page-tab');
        const latest = connection(10);
        await connect(latest, 10, room._id, 'latest-student-page-tab');
        assert(latest.sent.some(message => message.type === 'ready'));
        assert(busCalls.some(call => call.event.uid === 10 && call.event.message.type === 'owner'
            && call.event.message.ownerVersion === intent.version && typeof call.event.message.connectionId === 'string'));
    });
    it('keeps one recovery classroom per account and never silently replaces another active class', async () => {
        const original = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2), durationMinutes: 15 }, quiet);
        const future = await model.create(2, 'class-a', scheduled(11), quiet);
        await assert.rejects(model.join(2, 'class-a', future._id, tab(2), quiet), code('BUSY'));
        assert.equal((await model.resume(2, 'reopened-teacher-tab', quiet))._id, original._id);
    });
    it('honors an explicit learner leave and clears both recovery intentions when the teacher ends class', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        await model.leave(10, 'class-a', room._id, tab(10), quiet);
        assert.equal(await model.resume(10, 'later-student-tab', quiet), null);
        assert.equal((await model.rooms.findOne({ _id: room._id })).status, 'active');
        await model.finish(2, 'class-a', room._id, 'ended', quiet);
        assert.equal(await model.resume(2, 'later-teacher-tab', quiet), null);
        assert.equal(await model.resume(10, 'later-student-tab', quiet), null);
        assert.equal(await model.members.countDocuments({ lessonId: room._id }), 0);
    });
    it('rechecks membership, workspace and request token scope before changing recovery ownership', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        blocked.add(10);
        await assert.rejects(model.resume(10, 'blocked-student-tab', quiet), code('FORBIDDEN'));
        blocked.delete(10);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        workspaceOverrides.set(10, 'different-workspace');
        await assert.rejects(model.resume(10, 'cross-workspace-tab', quiet), code('FORBIDDEN'));
        workspaceOverrides.delete(10);
        logins.get('login-2').scope = '1';
        await assert.rejects(runResumeHttp(resumeHttp(2, { tabId: 'narrow-teacher-tab' })), code('FORBIDDEN'));
        assert.equal((await model.members.findOne({ _id: 2 })).tabId, tab(2));
    });
    it('resumes the original classroom from another page domain while rejecting forged or malformed requests', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        const fixture = resumeHttp(2, { tabId: 'another-page-teacher-tab' }, 'unrelated-page-domain');
        const result = await runResumeHttp(fixture);
        assert.equal(result.lesson._id, room._id); assert.equal(result.canTeach, true);
        assert.equal(result.apiUrl, '/d/class-a/lesson'); assert.equal(result.socketUrl, '/d/class-a/lesson/conn');
        assert.equal(fixture.headers.get('Cache-Control'), 'private, no-store');
        const forged = resumeHttp(2); forged.instance.request.headers.origin = 'https://attacker.test';
        await assert.rejects(runResumeHttp(forged), code('ORIGIN'));
        const sudo = resumeHttp(2); sudo.instance.session.sudoUid = 10;
        await assert.rejects(runResumeHttp(sudo), code('FORBIDDEN'));
        await assert.rejects(runResumeHttp(resumeHttp(2, { tabId: 'malformed-request-tab', uid: 10 })), code('INVALID_MESSAGE'));
        logins.delete('login-2');
        await assert.rejects(runResumeHttp(resumeHttp(2)), code('FORBIDDEN'));
    });
    it('does not revive a lesson when the teacher ends it while recovery is awaiting authorization', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        const result = await Promise.allSettled([model.resume(10, 'racing-student-tab', quiet, Date.now(), async () => {
            await model.finish(2, 'class-a', room._id, 'ended', quiet);
        })]);
        assert(result[0].status === 'rejected' || result[0].value === null);
        assert.equal((await model.rooms.findOne({ _id: room._id })).status, 'ended');
        assert.equal(await model.members.countDocuments({ lessonId: room._id }), 0);
        assert.equal(await model.resumptions.countDocuments({ lessonId: room._id, accepted: true }), 0);
        assert.equal(await model.resume(10, 'after-ended-tab', quiet), null);
    });
    it('removes a delayed recovery lease that arrives after the teacher has ended the room', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        let release; let reached;
        const blockedWrite = new Promise(resolve => { release = resolve; });
        const writeReached = new Promise(resolve => { reached = resolve; });
        const original = model.members.findOneAndUpdate;
        model.members.findOneAndUpdate = async function delayedOwner(query, update, options) {
            if (update.$set?.tabId === 'delayed-recovery-tab') { reached(); await blockedWrite; }
            return original.call(this, query, update, options);
        };
        try {
            const recovery = model.resume(10, 'delayed-recovery-tab', quiet).then(value => ({ value }), error => ({ error }));
            await writeReached;
            await model.finish(2, 'class-a', room._id, 'ended', quiet);
            release();
            const result = await recovery;
            assert(result.error || result.value === null);
            assert.equal((await model.rooms.findOne({ _id: room._id })).status, 'ended');
            assert.equal(await model.members.countDocuments({ lessonId: room._id }), 0);
            assert.equal(await model.resumptions.countDocuments({ lessonId: room._id, accepted: true }), 0);
        } finally { release(); model.members.findOneAndUpdate = original; }
    });
    it('a delayed earlier recovery write cannot overwrite or remove the newer tab owner', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        let release; let reached;
        const blockedWrite = new Promise(resolve => { release = resolve; });
        const writeReached = new Promise(resolve => { reached = resolve; });
        const original = model.members.findOneAndUpdate;
        model.members.findOneAndUpdate = async function delayedOwner(query, update, options) {
            if (update.$set?.tabId === 'delayed-old-recovery-tab') { reached(); await blockedWrite; }
            return original.call(this, query, update, options);
        };
        try {
            const older = model.resume(10, 'delayed-old-recovery-tab', quiet).then(value => ({ value }), error => ({ error }));
            await writeReached;
            await model.resume(10, 'newer-recovery-tab', quiet);
            release();
            const outcome = await older;
            assert.equal(outcome.error?.code, 'REPLACED');
            const intent = await model.resumptions.findOne({ _id: 10 });
            const member = await model.members.findOne({ _id: 10 });
            assert.equal(intent.tabId, 'newer-recovery-tab'); assert.equal(member.tabId, 'newer-recovery-tab');
            assert.equal(member.ownerVersion, intent.version);
            await model.bind(10, 'class-a', room._id, 'newer-recovery-tab', 'latest-owner-connection', 'server-a');
        } finally { release(); model.members.findOneAndUpdate = original; }
    });
    it('keeps a newer owner when two replacement pages race to resume the same classroom', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await model.join(10, 'class-a', room._id, tab(10), quiet);
        await Promise.allSettled([model.resume(10, 'racing-page-first', quiet), model.resume(10, 'racing-page-second', quiet)]);
        const intent = await model.resumptions.findOne({ _id: 10 });
        const current = await model.members.findOne({ _id: 10 });
        assert.equal(current.tabId, intent.tabId); assert.equal(current.ownerVersion, intent.version);
        const results = await Promise.allSettled(['racing-page-first', 'racing-page-second'].map((id, index) =>
            model.bind(10, 'class-a', room._id, id, 'racing-connection-' + index, 'server-a')));
        assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    });
    it('acknowledges a healthy pulse even when no camera or audio frames are flowing', async () => {
        const { teacher } = await activePair(); teacher.sent.length = 0;
        await teacher.instance.message({ type: 'pulse' });
        assert(teacher.sent.some(message => message.type === 'pulse'));
        assert.equal(teacher.closed.length, 0);
    });
    it('treats a previous server instance peer as offline until that participant reconnects', async () => {
        const { room, teacher } = await activePair(); teacher.sent.length = 0;
        await model.members.updateOne({ _id: 10 }, { $set: { serverId: 'previous-server-instance' } });
        await teacher.instance.message({ type: 'pulse' });
        assert.equal(teacher.closed.length, 0);
        assert(teacher.sent.some(message => message.type === 'peer' && message.online === false));
        await model.resume(10, 'student-after-server-restart', handlers.emitLesson);
        const replacement = connection(10);
        await connect(replacement, 10, room._id, 'student-after-server-restart');
        await teacher.instance.message({ type: 'pulse' });
        assert(teacher.sent.some(message => message.type === 'peer' && message.online === true));
    });
});


function historyRoom(id, changes = {}) {
    const startAt = new Date(Date.now() - 2 * 86400000);
    return { _id: 'history-lesson-' + id, participantUids: [2, 10], teacherUid: 2, studentUid: 10,
        teacherName: '老师-2', studentName: '学员-10', domainId: 'class-a', workspaceId: 'a',
        title: '旧课程 ' + id, startAt, endAt: new Date(+startAt + 3600000),
        createdAt: startAt, updatedAt: startAt, status: 'ended', ...changes };
}
function historyHttp(uid, domainId = 'class-a') {
    const fixture = resumeHttp(uid, {}, domainId);
    fixture.instance = Object.assign(new handlers.LessonHandler(), fixture.instance);
    fixture.instance.request.method = 'GET';
    fixture.instance.checkPerm = function checkPermission(permission) {
        if ((BigInt(logins.get(this.session._id)?.scope || 0) & permission) !== permission) {
            throw new shareProtocol.LiveShareError('FORBIDDEN', '会话权限不足');
        }
    };
    return fixture;
}

describe('teacher classroom history and historical cleanup', () => {
    before(setupDatabase);
    it('lists owned history across authorized original domains and workspaces without student access', async () => {
        const original = share.teacherScope;
        share.teacherScope = async (uid, domainId) => ({ ...await original(uid, domainId), workspaceId: domainId === 'class-b' ? 'b' : 'a' });
        try {
            const a = historyRoom('owned-a');
            const b = historyRoom('owned-b', { domainId: 'class-b', workspaceId: 'b', status: 'scheduled' });
            const other = historyRoom('other-teacher', { teacherUid: 3, participantUids: [3, 10] });
            const misplaced = historyRoom('wrong-workspace', { domainId: 'class-b', workspaceId: 'different' });
            const unknown = historyRoom('unknown-domain', { domainId: 'not-an-authorized-domain' });
            await model.rooms.insertMany([a, b, other, misplaced, unknown]);
            blocked.add(10); workspaceOverrides.set(10, 'removed-student-workspace');
            const result = await model.list(2, 'class-a');
            assert.deepEqual(new Set(result.history.map(item => item._id)), new Set([a._id, b._id]));
            assert(result.history.every(item => item.domainName === item.domainId));
            assert.equal(result.historyHasMore, false);
            const httpFixture = historyHttp(2); await httpFixture.instance.prepare(); await httpFixture.instance.get();
            for (const item of httpFixture.instance.response.body.history) assert.equal(item.apiUrl, '/d/' + item.domainId + '/lesson');
            await assert.rejects(model.join(2, 'class-b', b._id, tab(2), quiet), code('FORBIDDEN'));
            assert.equal((await model.finish(2, 'class-b', b._id, 'cancelled', quiet)).status, 'cancelled');
        } finally { share.teacherScope = original; }
    });
    it('keeps every unfinished course and the newest hundred terminal courses with an accurate more flag', async () => {
        const now = Date.now();
        const scheduledRows = Array.from({ length: 125 }, (_, index) => historyRoom('scheduled-' + index,
            { status: 'scheduled', startAt: new Date(now + (index + 1) * 60000), endAt: new Date(now + (index + 61) * 60000) }));
        const activeRows = Array.from({ length: 2 }, (_, index) => historyRoom('active-' + index,
            { status: 'active', startAt: new Date(now + 180 * 86400000 + index * 60000), endAt: new Date(now + 181 * 86400000) }));
        const endedRows = Array.from({ length: 105 }, (_, index) => historyRoom('terminal-' + index,
            { status: index % 2 ? 'ended' : 'cancelled', startAt: new Date(now - (105 - index) * 60000), endAt: new Date(now - 60000) }));
        await model.rooms.insertMany([...scheduledRows, ...activeRows, ...endedRows]);
        const result = await model.list(2, 'class-a', now);
        const unfinished = result.history.filter(item => item.status === 'active' || item.status === 'scheduled');
        const terminal = result.history.filter(item => item.status === 'ended' || item.status === 'cancelled');
        assert.equal(unfinished.length, 127); assert.equal(terminal.length, 100); assert.equal(result.historyHasMore, true);
        assert.deepEqual(Array.from(terminal, item => item._id), endedRows.slice(5).reverse().map(item => item._id));
        for (const item of activeRows) assert(result.lessons.some(lesson => lesson._id === item._id), 'future schedules cannot crowd out an active class');
        assert.equal(result.lessons.filter(item => item.status === 'scheduled').length, 100);
    });
    it('does not count unfinished courses toward the completed-history page limit', async () => {
        const now = Date.now();
        const scheduledRows = Array.from({ length: 120 }, (_, index) => historyRoom('open-limit-' + index,
            { status: 'scheduled', startAt: new Date(now + (index + 1) * 60000), endAt: new Date(now + (index + 61) * 60000) }));
        const endedRows = Array.from({ length: 100 }, (_, index) => historyRoom('ended-limit-' + index,
            { startAt: new Date(now - (index + 1) * 60000) }));
        await model.rooms.insertMany([...scheduledRows, ...endedRows]);
        const result = await model.list(2, 'class-a', now);
        assert.equal(result.history.length, 220); assert.equal(result.historyHasMore, false);
    });
    it('does not expose another teacher history or student history and rechecks original teacher authority', async () => {
        const row = historyRoom('private-owner', { domainId: 'class-b', status: 'active' });
        await model.rooms.insertOne(row);
        const student = await model.list(10, 'class-a');
        const other = await model.list(3, 'class-a');
        assert.equal(student.history.length, 0); assert.equal(other.history.length, 0);
        await assert.rejects(model.finish(10, 'class-b', row._id, 'ended', quiet), code('FORBIDDEN'));
        await assert.rejects(model.finish(3, 'class-b', row._id, 'ended', quiet), code('NOT_FOUND'));
        await assert.rejects(model.finish(2, 'class-a', row._id, 'ended', quiet), code('NOT_FOUND'));
        const original = share.teacherScope;
        share.teacherScope = async (uid, domainId) => {
            if (uid === 2 && domainId === 'class-b') throw new shareProtocol.LiveShareError('FORBIDDEN', '原课堂权限已撤销');
            return original(uid, domainId);
        };
        try {
            assert(!(await model.list(2, 'class-a')).history.some(item => item._id === row._id));
            await assert.rejects(model.finish(2, 'class-b', row._id, 'ended', quiet), code('FORBIDDEN'));
        } finally { share.teacherScope = original; }
        await model.rooms.updateOne({ _id: row._id }, { $set: { workspaceId: 'moved-workspace' } });
        assert(!(await model.list(2, 'class-a')).history.some(item => item._id === row._id));
        await assert.rejects(model.finish(2, 'class-b', row._id, 'ended', quiet), code('FORBIDDEN'));
    });
    it('finishes expired scheduled courses and keeps an existing terminal status on repeat cleanup', async () => {
        const old = historyRoom('expired-schedule', { status: 'scheduled' });
        const cancelled = historyRoom('already-cancelled', { status: 'cancelled' });
        await model.rooms.insertMany([old, cancelled]);
        await model.members.insertOne({ _id: 10, lessonId: cancelled._id, tabId: tab(10), expiresAt: new Date(Date.now() + 60000) });
        blocked.add(10);
        const result = await model.finish(2, 'class-a', old._id, 'ended', quiet);
        assert.equal(result.status, 'ended');
        assert.equal((await model.finish(2, 'class-a', cancelled._id, 'ended', quiet)).status, 'cancelled');
        assert.equal((await model.finish(2, 'class-a', cancelled._id, 'cancelled', quiet)).status, 'cancelled');
        assert.equal((await model.rooms.findOne({ _id: cancelled._id })).status, 'cancelled');
        assert.equal(await model.members.countDocuments({ lessonId: cancelled._id }), 0);
        const completed = (await model.list(2, 'class-a')).history.find(item => item._id === cancelled._id);
        assert.equal(completed.teacherJoined, false); assert.equal(completed.studentJoined, false);
    });
    it('does not cancel or clean a course that becomes active during the scheduled cancellation race', async () => {
        const room = await model.create(2, 'class-a', scheduled(), quiet);
        const original = model.rooms.findOneAndUpdate;
        model.rooms.findOneAndUpdate = async function activateBeforeCancellation(query, update, options) {
            if (query._id === room._id && update.$set?.status === 'cancelled') {
                await model.join(2, 'class-a', room._id, tab(2), quiet);
            }
            return original.call(this, query, update, options);
        };
        try {
            await assert.rejects(model.finish(2, 'class-a', room._id, 'cancelled', quiet), code('CONFLICT'));
            assert.equal((await model.rooms.findOne({ _id: room._id })).status, 'active');
            assert.equal((await model.members.findOne({ _id: 2 })).lessonId, room._id);
            assert.equal((await model.resumptions.findOne({ _id: 2 })).accepted, true);
            assert(await model.bookingSlots.countDocuments({ lessonId: room._id }) > 0);
        } finally { model.rooms.findOneAndUpdate = original; }
    });
    it('closing an old classroom only cleans that lesson and removes its old learner reminder', async () => {
        const current = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        await model.join(10, 'class-a', current._id, tab(10), quiet);
        const currentMembers = await model.members.find({ lessonId: current._id }).toArray();
        const currentIntents = await model.resumptions.find({ lessonId: current._id }).toArray();
        const currentReservations = await model.bookingSlots.countDocuments({ lessonId: current._id });
        const old = historyRoom('old-unclosed-room', { domainId: 'class-b', status: 'active' });
        await model.rooms.insertOne(old);
        await model.bookingSlots.insertOne({ _id: 'old-test-reservation', lessonId: old._id, expiresAt: new Date(Date.now() + 60000) });
        assert((await model.list(10, 'class-b')).lessons.some(item => item._id === old._id));
        await model.finish(2, 'class-b', old._id, 'ended', quiet);
        await model.finish(2, 'class-b', old._id, 'ended', quiet);
        assert.deepEqual(await model.members.find({ lessonId: current._id }).toArray(), currentMembers);
        assert.deepEqual(await model.resumptions.find({ lessonId: current._id }).toArray(), currentIntents);
        assert.equal(await model.bookingSlots.countDocuments({ lessonId: current._id }), currentReservations);
        assert.equal(await model.bookingSlots.countDocuments({ lessonId: old._id }), 0);
        assert(!(await model.list(10, 'class-b')).lessons.some(item => item._id === old._id));
        assert.equal((await model.resume(2, 'still-current-teacher-tab', quiet))._id, current._id);
    });
});


function inboxHttp(uid, options = {}) {
    const fixture = resumeHttp(uid, {}, options.domainId || 'unrelated-current-page');
    fixture.instance = Object.assign(new handlers.LessonInboxHandler(), fixture.instance);
    fixture.instance.request.method = 'GET';
    if (options.noOrigin) delete fixture.instance.request.headers.origin;
    if (options.origin) fixture.instance.request.headers.origin = options.origin;
    return fixture;
}
async function readInbox(fixture) {
    await fixture.instance.prepare(); await fixture.instance.get(); return fixture.instance.response.body;
}
function notification(uid, options = {}) {
    const sent = []; const closed = []; const timers = [];
    const instance = Object.assign(new handlers.LessonNotificationHandler(), {
        user: { _id: uid }, domain: { _id: options.domainId || 'unrelated-current-page' }, session: { _id: 'login-' + uid },
        request: { host: 'school.test', headers: { origin: options.origin || 'https://school.test' } },
        ctx: { setTimeout() {}, interval(callback, milliseconds) { timers.push({ callback, milliseconds }); } },
        conn: { bufferedAmount: 0 }, checkPriv() {},
        checkPerm() { throw new Error('Notifications must not use the current page domain role'); },
        limitRate: async () => {}, send: data => sent.push(data), close: (status, reason) => closed.push({ status, reason }),
    });
    listeners.push(instance); return { instance, sent, closed, timers };
}
async function subscribeNotifications(fixture, uid) {
    await fixture.instance.prepare(); await fixture.instance.message({ type: 'subscribe', expectedUid: uid }); await settle();
}

describe('account-scoped classroom invitation notifications', () => {
    before(setupDatabase);
    it('signals a new invitation immediately to an unjoined learner and keeps inbox reads free of consent or media writes', async () => {
        const learner = notification(10); await subscribeNotifications(learner, 10);
        assert(learner.sent.some(message => message.type === 'ready' && message.uid === 10 && message.revision === 0));
        const room = await model.create(2, 'class-b', { studentUid: 10, tabId: tab(2) }, handlers.emitLesson);
        await settle();
        const changed = learner.sent.filter(message => message.type === 'changed');
        assert(changed.length > 0);
        for (let index = 0; index < changed.length; index++) {
            assert.equal(changed[index].uid, 10); assert(changed[index].revision > (index ? changed[index - 1].revision : 0));
        }
        const response = await readInbox(inboxHttp(10));
        assert.equal(response.uid, 10); assert(response.lessons.some(item => item._id === room._id));
        const entry = response.lessons.find(item => item._id === room._id);
        assert.equal(entry.apiUrl, '/d/class-b/lesson'); assert.equal(entry.socketUrl, '/d/class-b/lesson/conn'); assert.equal(entry.canTeach, false);
        await model.inbox(10); await readInbox(inboxHttp(10, { noOrigin: true }));
        assert.equal(await model.members.findOne({ _id: 10 }), null);
        assert.equal(await model.resumptions.findOne({ _id: 10 }), null);
    });
    it('reads invitations across authorized domains and filters terminal, expired, revoked and mismatched workspace rows', async () => {
        const now = Date.now();
        const a = historyRoom('inbox-a', { status: 'active', startAt: new Date(now - 12 * 3600000), endAt: new Date(now - 11 * 3600000) });
        const b = historyRoom('inbox-b', { domainId: 'class-b', status: 'scheduled', startAt: new Date(now + 60000), endAt: new Date(now + 3600000) });
        const expired = historyRoom('inbox-expired', { status: 'scheduled', endAt: new Date(now - 3 * 3600000) });
        const terminal = historyRoom('inbox-ended');
        const mismatch = historyRoom('inbox-workspace', { domainId: 'class-b', workspaceId: 'other', status: 'active' });
        const another = historyRoom('inbox-other-student', { participantUids: [2, 11], studentUid: 11, status: 'active' });
        await model.rooms.insertMany([a, b, expired, terminal, mismatch, another]);
        assert.deepEqual(new Set((await model.inbox(10, now)).map(item => item._id)), new Set([a._id, b._id]));
        const original = share.studentScope;
        share.studentScope = async (uid, domainId) => {
            if (uid === 10 && domainId === 'class-b') throw new shareProtocol.LiveShareError('FORBIDDEN', 'Classroom membership was revoked');
            return original(uid, domainId);
        };
        try { assert.deepEqual(Array.from(await model.inbox(10, now), item => item._id), [a._id]); }
        finally { share.studentScope = original; }
        assert.deepEqual(Array.from(await model.inbox(10, now, async room => {
            if (room._id === a._id) throw new protocol.LessonError('FORBIDDEN', 'Token scope denied');
        }), item => item._id), [b._id]);
        await assert.rejects(model.inbox(10, now, async () => { throw new Error('Unexpected access database failure'); }), /Unexpected access database failure/);
    });
    it('checks the authenticated account, origin and token role before exposing an inbox or subscribing', async () => {
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, quiet);
        const forged = notification(10, { origin: 'https://attacker.test' });
        await assert.rejects(forged.instance.prepare(), code('ORIGIN'));
        await assert.rejects(readInbox(inboxHttp(10, { origin: 'https://attacker.test' })), code('ORIGIN'));
        const impersonating = notification(10); await impersonating.instance.prepare();
        await impersonating.instance.message({ type: 'subscribe', expectedUid: 11 });
        assert(impersonating.closed.some(event => event.reason === 'FORBIDDEN'));
        assert(!impersonating.sent.some(message => message.type === 'ready'));
        logins.get('login-2').scope = '1';
        assert.equal((await readInbox(inboxHttp(2))).lessons.length, 0, 'VIEW scope cannot expose a teacher EDIT invitation');
        logins.get('login-10').scope = '1';
        assert((await readInbox(inboxHttp(10))).lessons.some(item => item._id === room._id));
        logins.delete('login-10');
        await assert.rejects(notification(10).instance.prepare(), code('FORBIDDEN'));
        await assert.rejects(readInbox(inboxHttp(10)), code('FORBIDDEN'));
    });
    it('forwards only account change hints and never copies another account, room, owner or media payload', async () => {
        const learner = notification(10); await subscribeNotifications(learner, 10); learner.sent.length = 0;
        const event = { uid: 10, lessonId: 'private-room-event', message: {} };
        for (const type of ['video', 'audio', 'owner', 'peer', 'ready']) {
            await learner.instance.onLessonEvent({ ...event, message: { type, secret: 'private-media-sentinel', data: jpeg() } });
        }
        await learner.instance.onLessonEvent({ ...event, uid: 11, message: { type: 'lesson', secret: 'other-account-sentinel' } });
        assert.equal(learner.sent.length, 0);
        await learner.instance.onLessonEvent({ ...event, message: { type: 'lesson', lesson: { _id: event.lessonId, secret: 'private-room-sentinel' } } });
        await learner.instance.onLessonEvent({ ...event, message: { type: 'ended', lessonId: event.lessonId, reason: 'private-end-reason' } });
        assert.equal(learner.sent.length, 2);
        for (const message of learner.sent) {
            assert.equal(message.type, 'changed'); assert.equal(message.uid, 10);
            assert.deepEqual(Object.keys(message).sort(), ['revision', 'type', 'uid']);
        }
        assert(!JSON.stringify(learner.sent).includes('private-')); assert(!JSON.stringify(learner.sent).includes('other-account'));
    });
    it('latches an invitation arriving between prepare and subscribe and announces it after ready', async () => {
        const learner = notification(10); await learner.instance.prepare();
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, handlers.emitLesson);
        await settle(); assert(!learner.sent.some(message => message.type === 'changed'));
        await learner.instance.message({ type: 'subscribe', expectedUid: 10 }); await settle();
        assert.equal(learner.sent[0].type, 'ready'); assert.equal(learner.sent[0].revision, 0);
        assert(learner.sent.slice(1).some(message => message.type === 'changed' && message.revision > 0));
        assert((await model.inbox(10)).some(item => item._id === room._id));
    });
    it('signals endings and cancellations so an independent inbox no longer contains their invitations', async () => {
        const learner = notification(10); await subscribeNotifications(learner, 10);
        const active = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, handlers.emitLesson);
        const future = await model.create(2, 'class-b', scheduled(), handlers.emitLesson);
        assert.equal((await model.inbox(10)).length, 2); learner.sent.length = 0;
        await model.finish(2, 'class-a', active._id, 'ended', handlers.emitLesson);
        await model.finish(2, 'class-b', future._id, 'cancelled', handlers.emitLesson); await settle();
        assert(learner.sent.some(message => message.type === 'changed')); assert.equal((await model.inbox(10)).length, 0);
        assert.equal(await model.members.findOne({ _id: 10 }), null); assert.equal(await model.resumptions.findOne({ _id: 10 }), null);
    });
    it('a reconnect ready followed by an inbox snapshot recovers an invitation missed while offline', async () => {
        const first = notification(10); await subscribeNotifications(first, 10); await first.instance.cleanup();
        first.sent.length = 0;
        const room = await model.create(2, 'class-b', { studentUid: 10, tabId: tab(2) }, handlers.emitLesson); await settle();
        assert.equal(first.sent.length, 0);
        const restored = notification(10); await subscribeNotifications(restored, 10);
        assert(restored.sent.some(message => message.type === 'ready' && message.uid === 10));
        assert((await readInbox(inboxHttp(10))).lessons.some(item => item._id === room._id));
    });
    it('invalidates a revoked classroom invitation without exposing its old private room data', async () => {
        const learner = notification(10); await subscribeNotifications(learner, 10);
        const room = await model.create(2, 'class-a', { studentUid: 10, tabId: tab(2) }, handlers.emitLesson); await settle();
        assert((await readInbox(inboxHttp(10))).lessons.some(item => item._id === room._id));
        learner.sent.length = 0; blocked.add(10);
        await learner.instance.onDomainPermissionsChanged();
        assert(learner.sent.some(message => message.type === 'changed'));
        assert.equal((await readInbox(inboxHttp(10))).lessons.length, 0);
        assert(learner.sent.every(message => !Object.hasOwn(message, 'lesson') && !Object.hasOwn(message, 'lessonId')));
        assert.equal(await model.members.findOne({ _id: 10 }), null);
    });
    it('rechecks expired sessions and revoked token permissions before notifications or heartbeats', async () => {
        const learner = notification(10); await subscribeNotifications(learner, 10); learner.sent.length = 0;
        logins.get('login-10').scope = '0';
        await learner.instance.onLessonEvent({ uid: 10, lessonId: 'forbidden-room-event', message: { type: 'lesson' } });
        assert(learner.closed.some(event => event.reason === 'FORBIDDEN'));
        assert(!learner.sent.some(message => message.type === 'changed'));
        logins.get('login-10').scope = '3';
        const heartbeat = notification(10); await subscribeNotifications(heartbeat, 10); heartbeat.sent.length = 0;
        const timer = heartbeat.timers.find(item => item.milliseconds === 20000); assert(timer);
        await timer.callback(); assert(heartbeat.sent.some(message => message.type === 'pulse' && message.uid === 10));
        heartbeat.sent.length = 0; logins.delete('login-10'); await timer.callback();
        assert(heartbeat.closed.some(event => event.reason === 'FORBIDDEN'));
        assert(!heartbeat.sent.some(message => message.type === 'pulse'));
    });
    it('accepts only bounded notification controls and stops malformed or flooding clients', async () => {
        for (const payload of [null, [], {}, { type: 'video', data: jpeg() }, { type: 'subscribe', expectedUid: 10, uid: 11 },
            { type: 'subscribe', expectedUid: 10, extra: 'x'.repeat(2048) }, { type: 'pulse', expectedUid: 10 }]) {
            const fixture = notification(10); await fixture.instance.prepare();
            assert.equal(fixture.instance.maxMessageBytes, 1024);
            await fixture.instance.message(payload);
            assert(fixture.closed.some(event => event.reason === 'INVALID_MESSAGE'));
            assert(!fixture.sent.some(message => message.type === 'ready'));
        }
        const valid = notification(10); await subscribeNotifications(valid, 10); valid.sent.length = 0;
        await valid.instance.message({ type: 'pulse' });
        assert(valid.sent.some(message => message.type === 'pulse' && message.uid === 10));
        for (let index = 0; index < 50 && !valid.closed.length; index++) await valid.instance.message({ type: 'pulse' });
        assert(valid.closed.some(event => event.reason === 'RATE_LIMIT'));
    });
});
