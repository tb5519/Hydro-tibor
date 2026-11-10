const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}, globals = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, { module, exports: module.exports, Buffer, URL, Date, process, console,
        require: (name) => dependencies[name] ?? require(name), ...globals });
    return module.exports;
}
const protocol = load('packages/hydrooj/src/lib/voice_call.ts');
const sharingProtocol = load('packages/hydrooj/src/lib/live_share.ts');
const errorCode = (code) => (error) => error.code === code;
const frame = Buffer.alloc(640, 127).toString('base64');
const PERM = { PERM_VIEW: 1n, PERM_EDIT_DOMAIN: 2n, PERM_ALL: 3n };
const PRIV = { PRIV_USER_PROFILE: 2 };
let server; let client; let database; let model; let handlers; let listeners; let logins; let blocked;
const share = {
    teacherScope: async (uid, domainId) => {
        if (![2, 3].includes(uid) || !['class-a', 'class-b'].includes(domainId) || blocked.has(uid)) {
            throw new sharingProtocol.LiveShareError('FORBIDDEN', '老师权限不可用');
        }
        return { workspaceId: 'a', name: `老师-${uid}` };
    },
    studentScope: async (uid, domainId) => {
        if (![10, 11].includes(uid) || !['class-a', 'class-b'].includes(domainId) || blocked.has(uid)) {
            throw new sharingProtocol.LiveShareError('FORBIDDEN', '学员权限不可用');
        }
        return { workspaceId: 'a', name: `学员-${uid}` };
    },
    authorizePair: async (teacherUid, studentUid, domainId) => ({
        teacher: await share.teacherScope(teacherUid, domainId), student: await share.studentScope(studentUid, domainId),
    }),
    listStudents: async () => [10, 11].map((uid) => ({ uid, name: `学员-${uid}`, online: false })),
};
before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri()); database = client.db('voice_tests');
    model = load('packages/hydrooj/src/model/voice_call.ts', {
        '../lib/voice_call': protocol, '../service/db': { collection: (name) => database.collection(name) }, './live_share': share,
    });
    await model.apply();
    handlers = load('packages/hydrooj/src/handler/voice_call.ts', {
        '../lib/live_share': sharingProtocol, '../lib/voice_call': protocol, '../model/live_share': share, '../model/voice_call': model,
        '../model/builtin': { PERM, PRIV }, '../model/token': { TYPE_SESSION: 0, get: async (id) => logins.get(id) },
        '../model/workspace': { getDomains: async () => [{ _id: 'class-a' }],
            resolveDomainWorkspaceId: () => 'a', getAssignedWorkspaceIds: async () => ['a'] },
        '../service/bus': { parallel: async (_name, event) => Promise.all(listeners.map((instance) => instance.onVoiceEvent(event))) },
        '../service/server': { Handler: class {}, ConnectionHandler: class {}, subscribe: () => () => {} },
    });
});
beforeEach(async () => {
    listeners = []; blocked = new Set();
    logins = new Map([2, 3, 10, 11].map((uid) => [`login-${uid}`, { uid, scope: '3', expireAt: new Date(Date.now() + 60000) }]));
    await Promise.all([model.calls.deleteMany({}), model.presence.deleteMany({})]);
});
after(async () => { await client?.close(); await server?.stop(); });
const emit = () => {};
const settle = async () => new Promise((resolve) => setTimeout(resolve, 40));
async function peer(uid, options = {}, now = Date.now()) {
    return model.connectPresence({ uid, tabId: `tab-${uid}-testing`, deviceId: `device-${uid}-testing`, connectionId: `conn-${uid}-testing`,
        domainId: 'class-a', workspaceId: 'a', serverId: 'same-server', canTeach: uid < 10, mediaOwner: true, visible: true, ...options }, now);
}
function connection(uid) {
    const sent = []; const closed = []; const timers = [];
    const instance = Object.assign(new handlers.VoiceCallConnectionHandler(), {
        user: { _id: uid }, domain: { _id: 'class-a' }, session: { _id: `login-${uid}` },
        request: { host: 'school.test', headers: { origin: 'https://school.test' } },
        ctx: { setTimeout() {}, interval(callback) { timers.push(callback); } }, conn: { bufferedAmount: 0 },
        checkPriv() {}, limitRate: async () => {}, send: (data) => sent.push(data), close: (code, reason) => closed.push({ code, reason }),
    });
    listeners.push(instance);
    return { instance, sent, closed, timers };
}
async function hello(fixture, uid, options = {}) {
    await fixture.instance.prepare();
    await fixture.instance.message({ type: 'hello', tabId: `tab-${uid}-testing`, deviceId: `device-${uid}-testing`,
        visible: true, mediaOwner: true, ...options });
}
async function activeCall() {
    const teacher = connection(2); const student = connection(10);
    await hello(teacher, 2); await hello(student, 10);
    await teacher.instance.message({ type: 'dial', studentUid: 10 }); await settle();
    const callId = teacher.sent.find((item) => item.type === 'snapshot').callId;
    await student.instance.message({ type: 'accept', callId }); await settle();
    return { teacher, student, callId };
}

describe('voice protocol', () => {
    it('only accepts bounded, exact audio frames and known fields', () => {
        protocol.validateVoiceMessage({ type: 'audio', callId: 'call-testing', seq: 0, data: frame });
        for (const payload of [
            { type: 'audio', callId: 'call-testing', seq: -1, data: frame },
            { type: 'audio', callId: 'call-testing', seq: 1, data: Buffer.alloc(641).toString('base64') },
            { type: 'audio', callId: 'call-testing', seq: 1, data: frame, recipient: 11 },
            { type: 'hello', tabId: 'tab-testing', deviceId: 'device-testing', visible: true, teacherUid: 2 },
            { type: 'dial', studentUid: '10' }, { type: 'unknown' }, [], null,
            { type: 'dial', studentUid: 10, requestId: '<script>not-an-id</script>' },
        ]) assert.throws(() => protocol.validateVoiceMessage(payload), errorCode('INVALID_MESSAGE'));
    });
    it('drops excessive audio without consuming the hang-up control budget', () => {
        const limiter = new protocol.VoiceRateLimit();
        let accepted = 0;
        for (let i = 0; i < 100; i++) if (limiter.accept('audio', 100000)) accepted++;
        assert.equal(accepted, 12);
        assert.equal(limiter.accept('hangup', 100000), true);
        assert.equal(limiter.accept('audio', 100040), true);
    });
});

describe('voice call model with real MongoDB', () => {
    it('atomically allows only one call per participant under simultaneous dialing', async () => {
        const [a, b] = await Promise.all([peer(2), peer(3)]); await peer(10); await peer(11);
        const result = await Promise.allSettled([model.dial(a, 10, emit), model.dial(b, 10, emit)]);
        assert.equal(result.filter((item) => item.status === 'fulfilled').length, 1);
        assert.equal(result.find((item) => item.status === 'rejected').reason.code, 'BUSY');
        const winner = result.find((item) => item.status === 'fulfilled').value;
        await assert.rejects(model.dial(winner.teacherUid === 2 ? a : b, 11, emit), errorCode('BUSY'));
        await model.endCall(winner, 'done', emit);
        await model.dial(a, 11, emit);
    });
    it('requires explicit student acceptance and atomically assigns one media tab', async () => {
        const teacher = await peer(2); const student = await peer(10);
        const other = await peer(10, { tabId: 'second-tab-testing', connectionId: 'second-connection-testing' });
        const call = await model.dial(teacher, 10, emit);
        assert.equal(call.status, 'ringing'); assert.equal(call.studentOwner, undefined);
        await assert.rejects(model.accept(teacher, call._id, emit), errorCode('FORBIDDEN'));
        const attempts = await Promise.allSettled([model.accept(student, call._id, emit), model.accept(other, call._id, emit)]);
        assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 1);
        assert.equal(attempts.find((item) => item.status === 'rejected').reason.code, 'ALREADY_ANSWERED');
    });
    it('requires media-owner windows, prevents outsider access and revalidates permissions', async () => {
        const teacher = await peer(2); const student = await peer(10, { mediaOwner: false });
        await assert.rejects(model.dial({ ...teacher, mediaOwner: false }, 10, emit), errorCode('FORBIDDEN'));
        const call = await model.dial(teacher, 10, emit);
        await assert.rejects(model.accept(student, call._id, emit), errorCode('FORBIDDEN'));
        await assert.rejects(model.participantCall(await peer(11), call._id), errorCode('NOT_FOUND'));
        blocked.add(10);
        assert.equal(await model.refreshCall(call, emit), null);
        assert.equal((await model.calls.findOne({ _id: call._id })).active, false);
    });
    it('rings for at most 45 seconds and releases busy locks after timeout', async () => {
        const now = Date.now(); const teacher = await peer(2, {}, now); await peer(10, {}, now);
        const call = await model.dial(teacher, 10, emit, now);
        const events = [];
        assert.equal(await model.refreshCall(call, (event) => events.push(event), now + 45001), null);
        assert.equal(events[0].message.type, 'ended');
        await peer(10, {}, now + 46000);
        await model.dial(teacher, 10, emit, now + 46000);
    });
    it('reconnects only the original tab/device, and eventually ends disconnected calls', async () => {
        const now = Date.now(); const teacher = await peer(2, {}, now); const student = await peer(10, {}, now);
        const ringing = await model.dial(teacher, 10, emit, now);
        const call = await model.accept(student, ringing._id, emit, now);
        const thief = await peer(10, { tabId: 'different-tab-testing', connectionId: 'different-conn-testing' }, now);
        assert.equal(protocol.ownsVoice(await model.resumeOwner(thief, emit, now), thief), false);
        const resumed = await peer(10, { connectionId: 'new-conn-testing' }, now);
        const updated = await model.resumeOwner(resumed, emit, now);
        assert.equal(protocol.ownsVoice(updated, resumed), true);
        assert.equal(protocol.ownsVoice(updated, student), false);
        await model.disconnectPresence(resumed);
        await model.refreshCall(updated, emit, now + 100);
        const disconnected = await model.calls.findOne({ _id: call._id });
        assert.equal(await model.refreshCall(disconnected, emit, now + 20200), null);
    });
    it('reports voice online status independently of screen-sharing presence', async () => {
        await peer(10, { mediaOwner: false });
        const students = await model.listStudents(2, 'class-a');
        assert.equal(students.find((item) => item.uid === 10).online, true);
        assert.equal(students.find((item) => item.uid === 11).online, false);
    });
    it('renews an expired presence and restores a TTL-deleted one without changing socket ownership', async () => {
        const now = Date.now(); const student = await peer(10, {}, now - 60000);
        await model.pulsePresence(student, false, now);
        assert.equal(+(await model.presence.findOne({ _id: student._id })).expiresAt, now + protocol.VOICE_PRESENCE_MS);
        await model.presence.deleteOne({ _id: student._id });
        await model.pulsePresence(student, true, now + 100);
        const restored = await model.presence.findOne({ _id: student._id });
        assert.equal(restored.connectionId, student.connectionId);
        assert.equal(restored.deviceId, student.deviceId); assert.equal(restored.tabId, student.tabId);
        assert.equal(restored.workspaceId, student.workspaceId); assert.equal(restored.connected, true);
        assert.equal(restored.visible, true); assert.equal(+restored.expiresAt, now + 100 + protocol.VOICE_PRESENCE_MS);
    });
    it('never restores over a newer connection, including one arriving during the recovery check', async (t) => {
        const old = await peer(10); const replacement = await peer(10, { connectionId: 'newer-connection-testing' });
        await assert.rejects(model.pulsePresence(old, true), errorCode('REPLACED'));
        assert.equal((await model.presence.findOne({ _id: old._id })).connectionId, replacement.connectionId);
        await model.presence.deleteOne({ _id: old._id });
        const original = share.studentScope;
        t.after(() => { share.studentScope = original; });
        share.studentScope = async (...args) => {
            const scope = await original(...args);
            await peer(10, { connectionId: 'racing-connection-testing' });
            return scope;
        };
        await assert.rejects(model.pulsePresence(old, true), errorCode('REPLACED'));
        assert.equal((await model.presence.findOne({ _id: old._id })).connectionId, 'racing-connection-testing');
    });
    it('revalidates teacher and learner scope before restoring a missing presence', async () => {
        for (const uid of [2, 10]) {
            const original = await peer(uid);
            await model.presence.deleteOne({ _id: original._id }); blocked.add(uid);
            await assert.rejects(model.pulsePresence(original, true), errorCode('FORBIDDEN'));
            assert.equal(await model.presence.findOne({ _id: original._id }), null);
        }
    });
    it('does not restore a presence into a different workspace or revive explicitly disconnected presence', async () => {
        const student = await peer(10, { workspaceId: 'former-workspace' });
        await model.presence.deleteOne({ _id: student._id });
        await assert.rejects(model.pulsePresence(student, true), errorCode('FORBIDDEN'));
        assert.equal(await model.presence.findOne({ _id: student._id }), null);
        const disconnected = await peer(10); await model.disconnectPresence(disconnected);
        await assert.rejects(model.pulsePresence(disconnected, true), errorCode('REPLACED'));
        assert.equal((await model.presence.findOne({ _id: disconnected._id })).connected, false);
    });
});

describe('voice socket boundaries and relay', () => {
    it('silently recovers a missing presence during an active call and keeps two-way audio on the same sockets', async () => {
        const { teacher, student, callId } = await activeCall();
        const previous = await model.presence.findOne({ uid: 2 });
        await model.presence.deleteOne({ _id: previous._id });
        for (let i = 0; i < 3; i++) await teacher.instance.message({ type: 'pulse', visible: true });
        const recovered = await model.presence.findOne({ _id: previous._id });
        assert.equal(recovered.connectionId, previous.connectionId);
        assert.equal(teacher.closed.length, 0); assert.equal(teacher.sent.filter((item) => item.type === 'error').length, 0);
        await teacher.instance.message({ type: 'audio', callId, seq: 0, data: frame }); await settle();
        await student.instance.message({ type: 'audio', callId, seq: 0, data: frame }); await settle();
        assert.equal(student.sent.filter((item) => item.type === 'audio').length, 1);
        assert.equal(teacher.sent.filter((item) => item.type === 'audio').length, 1);
    });
    it('quietly closes a superseded socket once and ignores its queued controls even if the replacement event was missed', async () => {
        const old = connection(2); await hello(old, 2);
        const original = await model.presence.findOne({ uid: 2 });
        await model.connectPresence({ ...original, connectionId: 'replacement-connection-testing' });
        await Promise.all([
            old.instance.message({ type: 'pulse', visible: true }),
            old.instance.message({ type: 'list' }),
            old.instance.message({ type: 'hello', tabId: original.tabId, deviceId: original.deviceId, visible: true, mediaOwner: true }),
        ]);
        assert.deepEqual(old.closed.map((item) => item.code), [4002]);
        assert.equal(old.sent.filter((item) => item.type === 'error' || item.type === 'students').length, 0);
        await old.instance.cleanup();
        const current = await model.presence.findOne({ _id: original._id });
        assert.equal(current.connectionId, 'replacement-connection-testing'); assert.equal(current.connected, true);
    });
    it('closes with a retryable code for presence database failure without repeating errors', async (t) => {
        const teacher = connection(2); await hello(teacher, 2);
        const original = model.presence.updateOne;
        t.after(() => { model.presence.updateOne = original; });
        model.presence.updateOne = async () => { throw new Error('temporary database failure'); };
        await teacher.instance.message({ type: 'pulse', visible: true });
        await teacher.instance.message({ type: 'list' });
        assert.deepEqual(teacher.closed.map((item) => item.code), [4008]);
        assert.equal(teacher.sent.filter((item) => item.type === 'error').length, 0);
        model.presence.updateOne = original;
        await teacher.instance.cleanup();
        assert.equal((await model.presence.findOne({ uid: 2 })).connected, false);
        const reconnected = connection(2); await hello(reconnected, 2);
        assert.ok(reconnected.sent.some((item) => item.type === 'ready'));
    });
    it('refuses recovery after classroom revocation and leaves the presence absent', async () => {
        const student = connection(10); await hello(student, 10);
        await model.presence.deleteMany({ uid: 10 }); blocked.add(10);
        await student.instance.message({ type: 'pulse', visible: true });
        await student.instance.message({ type: 'pulse', visible: true });
        assert.deepEqual(student.closed.map((item) => item.code), [4003]);
        assert.equal(await model.presence.findOne({ uid: 10 }), null);
        assert.equal(student.sent.filter((item) => item.type === 'error').length, 0);
    });
    it('cleans up a recovery that finishes after the socket has closed', async (t) => {
        const student = connection(10); await hello(student, 10);
        await model.presence.deleteMany({ uid: 10 });
        const original = share.studentScope; let entered; let release;
        const enteredScope = new Promise((resolve) => { entered = resolve; });
        const wait = new Promise((resolve) => { release = resolve; });
        t.after(() => { share.studentScope = original; });
        share.studentScope = async (...args) => { entered(); await wait; return original(...args); };
        const pending = student.instance.message({ type: 'pulse', visible: true });
        await enteredScope; await student.instance.cleanup(); release(); await pending;
        assert.equal((await model.presence.findOne({ uid: 10 })).connected, false);
        assert.equal(student.sent.filter((item) => item.type === 'error').length, 0);
    });
    it('rejects cross-origin connections and impersonation sessions', async () => {
        const foreign = connection(2); foreign.instance.request.headers.origin = 'https://evil.test';
        await assert.rejects(foreign.instance.prepare(), errorCode('ORIGIN'));
        const impersonated = connection(2); impersonated.instance.session.sudoUid = 99;
        await assert.rejects(impersonated.instance.prepare(), errorCode('FORBIDDEN'));
    });
    it('delivers two-way audio only after acceptance and only to the bound owner', async () => {
        const { teacher, student, callId } = await activeCall();
        const observer = connection(10); await hello(observer, 10, { tabId: 'observer-tab-testing', mediaOwner: false });
        await teacher.instance.message({ type: 'audio', callId, seq: 1, data: frame }); await settle();
        assert.equal(student.sent.filter((item) => item.type === 'audio').length, 1);
        assert.equal(observer.sent.filter((item) => item.type === 'audio').length, 0);
        await observer.instance.message({ type: 'audio', callId, seq: 3, data: frame }); await settle();
        assert.equal(teacher.sent.filter((item) => item.type === 'audio').length, 0);
        await student.instance.message({ type: 'audio', callId, seq: 1, data: frame }); await settle();
        assert.equal(teacher.sent.filter((item) => item.type === 'audio').length, 1);
        await teacher.instance.message({ type: 'audio', callId, seq: 1, data: frame }); await settle();
        assert.equal(student.sent.filter((item) => item.type === 'audio').length, 1, 'replayed sequence is dropped');
        assert.equal(await database.collection('event').countDocuments({}), 0);
        assert.equal(JSON.stringify(await model.calls.find({}).toArray()).includes(frame), false);
    });
    it('drops pre-accept, cross-call, delayed and congested audio', async () => {
        const teacher = connection(2); const student = connection(10); await hello(teacher, 2); await hello(student, 10);
        await teacher.instance.message({ type: 'dial', studentUid: 10 }); await settle();
        const callId = teacher.sent.find((item) => item.type === 'snapshot').callId;
        await teacher.instance.message({ type: 'audio', callId, seq: 0, data: frame }); await settle();
        assert.equal(student.sent.filter((item) => item.type === 'audio').length, 0);
        await student.instance.message({ type: 'accept', callId }); await settle();
        student.instance.conn.bufferedAmount = 17000;
        await teacher.instance.message({ type: 'audio', callId, seq: 1, data: frame }); await settle();
        student.instance.conn.bufferedAmount = 0;
        await teacher.instance.message({ type: 'audio', callId: 'other-call-testing', seq: 2, data: frame });
        await student.instance.onVoiceEvent({ uid: 10, sentAt: Date.now() - 1000,
            message: { type: 'audio', callId, seq: 2, data: frame } });
        assert.equal(student.sent.filter((item) => item.type === 'audio').length, 0);
    });
    it('allows either participant to hang up and immediately stops audio', async () => {
        const { teacher, student, callId } = await activeCall();
        await student.instance.message({ type: 'hangup', callId }); await settle();
        assert.ok(teacher.sent.find((item) => item.type === 'ended'));
        await teacher.instance.message({ type: 'audio', callId, seq: 1, data: frame }); await settle();
        assert.equal(student.sent.filter((item) => item.type === 'audio').length, 0);
        assert.equal((await model.calls.findOne({ _id: callId })).active, false);
    });
    it('ends owned calls when the login is revoked', async () => {
        const { teacher, student, callId } = await activeCall();
        logins.delete('login-2'); teacher.instance.lastLoginCheck = 0;
        await teacher.instance.message({ type: 'pulse', visible: true }); await settle();
        assert.ok(teacher.closed.find((item) => item.code === 4003));
        assert.ok(student.sent.find((item) => item.type === 'ended'));
        assert.equal((await model.calls.findOne({ _id: callId })).active, false);
    });
    it('resumes audio after page navigation with a new stream id and rejects the old connection', async () => {
        const { teacher, student, callId } = await activeCall();
        await teacher.instance.message({ type: 'audio', callId, seq: 99, data: frame }); await settle();
        const oldStream = student.sent.find((item) => item.type === 'audio').streamId;
        const refreshed = connection(2); await hello(refreshed, 2); await settle();
        assert.ok(teacher.closed.find((item) => item.code === 4002));
        assert.ok(refreshed.sent.find((item) => item.type === 'snapshot' && item.isOwner));
        await refreshed.instance.message({ type: 'audio', callId, seq: 0, data: frame }); await settle();
        const received = student.sent.filter((item) => item.type === 'audio');
        assert.equal(received.length, 2); assert.equal(received[1].seq, 0);
        assert.notEqual(received[1].streamId, oldStream);
        await teacher.instance.message({ type: 'audio', callId, seq: 100, data: frame }); await settle();
        assert.equal(student.sent.filter((item) => item.type === 'audio').length, 2);
        await student.instance.message({ type: 'audio', callId, seq: 0, data: frame }); await settle();
        assert.equal(refreshed.sent.filter((item) => item.type === 'audio').length, 1);
        assert.equal(teacher.sent.filter((item) => item.type === 'audio').length, 0);
    });
    it('keeps personal/admin pages voice-enabled without sharing page restrictions', async () => {
        const handler = (uid, url) => ({
            request: { method: 'GET', originalPath: url }, response: { template: 'home_profile.html' }, session: {},
            user: { _id: uid, hasPriv: () => true }, domain: { _id: 'system' }, UiContext: {},
            url: (_route, { domainId }) => `/d/${domainId}/voice-call/conn`,
        });
        for (const uid of [2, 10]) {
            const page = handler(uid, '/home/profile'); await handlers.injectVoiceCall(page);
            assert.equal(page.UiContext.voiceCall.enabled, true);
            assert.equal(page.UiContext.voiceCall.canTeach, uid === 2);
            assert.equal(page.UiContext.voiceCall.socketUrl, '/d/class-a/voice-call/conn');
        }
        const sensitive = handler(10, '/user/tfa'); await handlers.injectVoiceCall(sensitive);
        assert.equal(sensitive.UiContext.voiceCall, undefined);
    });
    it('correlates snapshots, endings and request errors without reflecting request payloads', async () => {
        const teacher = connection(2); const student = connection(10);
        await hello(teacher, 2); await hello(student, 10);
        const requestId = 'voice-dial-request-testing';
        await teacher.instance.message({ type: 'dial', studentUid: 10, requestId }); await settle();
        const snapshot = teacher.sent.find((item) => item.type === 'snapshot');
        assert.equal(snapshot.requestId, requestId);
        await teacher.instance.message({ type: 'dial', studentUid: 10, requestId: 'different-dial-request' });
        assert.equal(teacher.sent.find((item) => item.type === 'error').requestId, 'different-dial-request');
        await student.instance.message({ type: 'reject', callId: snapshot.callId }); await settle();
        assert.equal(teacher.sent.find((item) => item.type === 'ended').requestId, requestId);
        await teacher.instance.message({ type: 'hangup', callId: snapshot.callId });
        assert.equal(teacher.sent.at(-1).code, 'NOT_FOUND');
        assert.equal(teacher.sent.at(-1).callId, snapshot.callId);
        assert.equal(teacher.sent.at(-1).data, undefined);
    });
});

describe('voice PM2 ephemeral transport', () => {
    it('uses bounded IPC directly and never persists audio through the durable bus', () => {
        const packets = []; const callbacks = [];
        const fakeProcess = { env: { exec_mode: 'cluster_mode', name: 'hydro' }, connected: true,
            send: (packet, callback) => { packets.push(packet); callbacks.push(callback); } };
        const module = load('packages/hydrooj/src/handler/voice_call.ts', {
            '../lib/live_share': sharingProtocol, '../lib/voice_call': protocol, '../model/live_share': share,
            '../model/voice_call': model, '../model/builtin': { PERM, PRIV }, '../model/token': {}, '../model/workspace': {},
            '../service/bus': { parallel: () => { throw new Error('unexpected bus use'); }, broadcast: () => { throw new Error('durable bus used'); } },
            '../service/server': { Handler: class {}, ConnectionHandler: class {}, subscribe: () => () => {} },
        }, { process: fakeProcess });
        for (let i = 0; i < 1000; i++) module.emitVoiceCall({ uid: 10, message: { type: 'audio', callId: 'call-testing', seq: i, data: frame } });
        assert.ok(packets.length > 0 && packets.length < 300, 'audio queue is bounded');
        module.emitVoiceCall({ uid: 10, message: { type: 'ended', callId: 'call-testing' } });
        assert.equal(packets.at(-1).type, 'hydro:broadcast');
        assert.equal(packets.at(-1).data.event, 'voice-call/event');
        assert.ok(packets.at(-1).data.payload.includes('ended'), 'hang-up has a reserved control budget');
        callbacks.forEach((callback) => callback());
        const count = packets.length;
        module.emitVoiceCall({ uid: 10, message: { type: 'audio', callId: 'call-testing', seq: 1000, data: frame } });
        assert.equal(packets.length, count + 1);
    });
});
