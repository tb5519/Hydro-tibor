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
function jpeg(width = 320, height = 240) {
    const bytes = Buffer.from([255, 216, 255, 192, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255,
        1, 1, 17, 0, 255, 217]);
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
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri()); database = client.db('lesson_tests');
    model = load('packages/hydrooj/src/model/lesson.ts', {
        '../lib/lesson': protocol, '../service/db': { collection: (name) => database.collection(name) }, './live_share': share,
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
    await Promise.all([model.rooms.deleteMany({}), model.members.deleteMany({}), model.bookingSlots.deleteMany({}),
        database.collection('domain.user').deleteMany({})]);
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
    it('applies receiver backpressure and packet age limits without queuing old video', async () => {
        const { room, teacher, student } = await activePair();
        student.instance.conn.bufferedAmount = 80 * 1024;
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
