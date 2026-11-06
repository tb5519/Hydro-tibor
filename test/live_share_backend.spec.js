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
const protocol = load('packages/hydrooj/src/lib/live_share.ts');
const { Router } = load('framework/framework/router.ts');
const errorCode = (code) => (error) => error.code === code;
const PERM = { PERM_VIEW: 1n, PERM_EDIT_DOMAIN: 2n, PERM_ALL: 3n };
const PRIV = { PRIV_USER_PROFILE: 2, PRIV_EDIT_SYSTEM: 1, PRIV_JUDGE: 4 };
let server; let client; let database; let model; let handlers; let busListeners; let logins;
let memberships; let accounts; let workspaceStudents; let workspaceMembers;
const rooms = [
    { _id: 'class-a', workspaceId: 'a', domainType: 'oj' },
    { _id: 'class-b', workspaceId: 'a', domainType: 'oj' },
    { _id: 'other', workspaceId: 'b', domainType: 'oj' },
    { _id: 'scratch', workspaceId: 'a', domainType: 'scratch' },
];
const ws = {
    LEGACY_WORKSPACE_ID: 'tang', isPlatformAdmin: (uid) => uid === 99,
    resolveDomainWorkspaceId: (domain) => domain.workspaceId || 'tang',
    get: async (id) => ({ _id: id, status: id === 'disabled' ? 'disabled' : 'active' }),
    getDomains: async (id) => rooms.filter((room) => room.workspaceId === id),
    getMember: async (id, uid) => workspaceMembers.findOne({ workspaceId: id, uid, status: 'active' }),
    getMembers: async (id) => workspaceMembers.find({ workspaceId: id, status: 'active' }).toArray(),
    getAssignedWorkspaceIds: async (uid) => [...new Set([
        ...await workspaceMembers.distinct('workspaceId', { uid, status: 'active' }),
        ...await workspaceStudents.distinct('workspaceId', { uid, status: 'active' }),
    ])],
};
before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    database = client.db('live_share');
    memberships = database.collection('domain.user'); accounts = database.collection('user');
    workspaceStudents = database.collection('workspace.student'); workspaceMembers = database.collection('workspace.member');
    ws.collStudent = workspaceStudents;
    const db = { collection: (name) => database.collection(name), ensureIndexes: (coll, ...indexes) => coll.createIndexes(indexes) };
    model = load('packages/hydrooj/src/model/live_share.ts', {
        '../lib/live_share': protocol, '../service/db': db, './builtin': { PERM, PRIV, BUILTIN_ROLES: { default: 1n, teacher: 3n } },
        './workspace': ws, './user': { coll: accounts },
        './domain': { collUser: memberships, get: async (id) => rooms.find((room) => room._id === id),
            getDomainUser: async (domainId, account) => {
                const member = await memberships.findOne({ domainId, uid: account._id });
                return { ...member, perm: member?.role === 'teacher' ? 3n : member?.join ? 1n : 0n };
            } },
    });
    await model.apply();
    handlers = load('packages/hydrooj/src/handler/live_share.ts', {
        '../lib/live_share': protocol, '../model/live_share': model, '../model/workspace': ws, '../model/builtin': { PERM, PRIV },
        '../model/token': { TYPE_SESSION: 0, get: async (id) => logins.get(id) },
        '../service/bus': { parallel: async (name, event) => {
            await Promise.all(busListeners.map((listener) => listener.onShareEvent(event)));
        } },
        '../service/server': { Handler: class {}, ConnectionHandler: class {}, subscribe: () => () => {} },
    });
});
beforeEach(async () => {
    busListeners = [];
    logins = new Map([2, 3, 10, 11, 12, 99].map((uid) => [`login-${uid}`, { uid, scope: '3', expireAt: new Date(Date.now() + 60000) }]));
    await Promise.all(['live.share.presence', 'live.share.session', 'live.share.grant', 'domain.user', 'user', 'workspace.student', 'workspace.member']
        .map((name) => database.collection(name).deleteMany({})));
    await accounts.insertMany([2, 3, 10, 11, 12, 99].map((_id) => ({ _id, priv: 2, uname: `user-${_id}` })));
    await workspaceMembers.insertMany([
        { workspaceId: 'a', uid: 2, role: 'teacher', status: 'active' },
        { workspaceId: 'a', uid: 3, role: 'teacher', status: 'active' },
    ]);
    await workspaceStudents.insertMany([10, 11].map((uid) => ({ workspaceId: 'a', uid, status: 'active' })).concat(
        { workspaceId: 'b', uid: 12, status: 'active' }));
    await memberships.insertMany([2, 3, 10, 11].flatMap((uid) => ['class-a', 'class-b'].map((domainId) => ({
        uid, domainId, role: uid < 10 ? 'teacher' : 'default', join: true,
    }))).concat({ uid: 12, domainId: 'other', role: 'default', join: true }));
});
after(async () => { await client?.close(); await server?.stop(); });

async function peer(uid, options = {}) {
    return model.connectPresence({ uid, tabId: `tab-${uid}-testing`, pageId: `page-${uid}-testing`, connectionId: `conn-${uid}-testing`,
        deviceId: `device-${uid}-testing`,
        domainId: 'class-a', workspaceId: 'a', url: '/d/class-a/p/1000', title: '题目', visible: true, canTeach: uid < 10,
        serverId: 'same-server', ...options });
}
function connection(uid, domainId = 'class-a') {
    const sent = []; const closed = [];
    const instance = Object.assign(new handlers.LiveShareConnectionHandler(), {
        user: { _id: uid }, domain: rooms.find((room) => room._id === domainId), session: { _id: `login-${uid}` },
        request: { host: 'school.test', headers: { origin: 'https://school.test' } },
        ctx: { setTimeout() {}, interval() {} }, conn: { bufferedAmount: 0 },
        checkPriv() {}, limitRate: async () => {}, send: (data) => sent.push(data), close: (code, reason) => closed.push({ code, reason }),
    });
    busListeners.push(instance);
    return { instance, sent, closed };
}
async function hello(f, uid, overrides = {}) {
    const url = `/d/${f.instance.domain._id}/p/1000`;
    const pageGrant = await model.issuePageGrant(uid, f.instance.domain._id, url);
    await f.instance.prepare();
    await f.instance.message({ type: 'hello', tabId: `tab-${uid}-testing`, pageId: `page-${uid}-testing`, pageGrant, url,
        title: '题目', visible: true, deviceId: `device-${uid}-testing`, ...overrides });
}
const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 20)); };

describe('live share protocol boundaries', () => {
    it('uses a positive learning-page allowlist and never shares private/admin routes', () => {
        for (const value of ['/', '/ide', '/d/class-a/p/1000?tid=contest', '/homework/123/code', '/record/123']) assert.ok(protocol.sharePage(value), value);
        for (const value of ['/manage', '/home/account', '/account/10', '/workspace/a', '/scratch/editor', '/p/1/edit',
            'https://evil.test/p/1', '//evil.test/p/1', '/p/1?sid=secret', '/p/1?reviewUid=10', '/p/../account/10']) {
            assert.equal(protocol.sharePage(value), null, value);
        }
        assert.throws(() => protocol.checkShareOrigin('https://evil.test', 'school.test'), errorCode('ORIGIN'));
        assert.throws(() => protocol.checkShareOrigin(undefined, 'school.test'), errorCode('ORIGIN'));
        protocol.checkShareOrigin('https://school.test', 'school.test');
    });
    it('rejects forged direction, wrong tabs, old pages and expired rooms', () => {
        const session = { _id: 'session-testing', teacherUid: 2, teacherTabId: 'teacher-tab', studentUid: 10,
            studentTabId: 'student-tab', pageId: 'current-page', active: true, expiresAt: new Date(Date.now() + 10000) };
        assert.equal(protocol.authorizeRelay(session, 2, 'teacher-tab', 'current-page', 'editor'), 'teacher');
        for (const args of [[10, 'student-tab', 'current-page', 'command'], [2, 'wrong-tab', 'current-page', 'editor'],
            [11, 'student-tab', 'current-page', 'mirror'], [2, 'teacher-tab', 'current-page', 'mirror']]) {
            assert.throws(() => protocol.authorizeRelay(session, ...args), errorCode('FORBIDDEN'));
        }
        assert.throws(() => protocol.authorizeRelay(session, 2, 'teacher-tab', 'old-page', 'command'), errorCode('STALE_PAGE'));
        assert.throws(() => protocol.authorizeRelay({ ...session, expiresAt: new Date(0) }, 2, 'teacher-tab', 'current-page', 'editor'), errorCode('FORBIDDEN'));
    });
    it('rejects destructive commands, editor initialization by teachers and excessive data', () => {
        const command = { id: 'command-testing', pageId: 'page-testing', nodeId: 12, action: 'click' };
        protocol.validateRelayData('teacher', 'command', command, 'page-testing');
        for (const action of ['submit', 'delete', 'save', 'navigate', 'eval']) {
            assert.throws(() => protocol.validateRelayData('teacher', 'command', { ...command, action }, 'page-testing'), errorCode('INVALID_RELAY'));
        }
        assert.throws(() => protocol.validateRelayData('teacher', 'editor', {
            type: 'edit:init', pageId: 'page-testing', editorId: 'editor-testing', state: 'YQ==',
        }, 'page-testing'), errorCode('INVALID_RELAY'));
        assert.throws(() => protocol.validateShareMessage({ type: 'relay', sessionId: 'session-testing', pageId: 'page-testing',
            kind: 'editor', data: { value: 'x'.repeat(384 * 1024) } }), errorCode('MESSAGE_TOO_LARGE'));
        const limit = new protocol.ShareRateLimit(0);
        for (let index = 0; index < 12; index++) limit.accept({ type: 'list' }, 0);
        assert.throws(() => limit.accept({ type: 'list' }, 0), errorCode('RATE_LIMIT'));
        limit.accept({ type: 'list' }, 1000);
    });
    it('enforces the connection byte budget before JSON parsing while preserving unrestricted routes', async () => {
        const source = fs.readFileSync(path.join(root, 'framework/framework/server.ts'), 'utf8');
        const start = source.indexOf('conn.onmessage = async (e) => {');
        const end = source.indexOf('\n            } else ctx.body = stream;', start);
        assert.ok(start > 0 && end > start);
        const body = source.slice(start, end);
        let parses = 0;
        const factory = loadFromSource(`module.exports = (h, conn, clean) => {
            let lastHeartbeat = 0; const logger = { error() {} }; ${body} return conn.onmessage;
        };`, { JSON: { parse(value) { parses++; return JSON.parse(value); } } });
        const frames = []; const closes = []; let cleaned = 0;
        const h = { maxMessageBytes: 32, message: (frame) => frames.push(frame) };
        const conn = { close: (...args) => closes.push(args), send() {} };
        const onmessage = factory(h, conn, async () => { cleaned++; });
        await onmessage({ data: 'x'.repeat(33) });
        assert.equal(parses, 0); assert.equal(cleaned, 1); assert.equal(closes[0][0], 1009); assert.equal(frames.length, 0);
        await onmessage({ data: '{"value":"ok"}' });
        assert.equal(parses, 1); assert.equal(frames[0].value, 'ok');
        delete h.maxMessageBytes;
        await onmessage({ data: JSON.stringify({ value: 'x'.repeat(1000) }) });
        assert.equal(parses, 2); assert.equal(frames[1].value.length, 1000); assert.equal(closes.length, 1);
    });
});

function loadFromSource(source, globals = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code,
        { module, exports: module.exports, Date, Buffer, ...globals });
    return module.exports;
}

describe('live share durable session broker', () => {
    it('grants bind authorized user, domain and exact page', async () => {
        const token = await model.issuePageGrant(10, 'class-a', '/d/class-a/p/1');
        assert.equal(await model.verifyPageGrant(10, 'class-a', token, '/d/class-a/p/1'), true);
        for (const args of [[11, 'class-a', '/d/class-a/p/1'], [10, 'class-b', '/d/class-a/p/1'], [10, 'class-a', '/d/class-a/p/2']]) {
            assert.equal(await model.verifyPageGrant(args[0], args[1], token, args[2]), false);
        }
        assert.equal(await model.verifyPageGrant(10, 'class-a', token, '/d/class-a/p/1', Date.now() + protocol.LIVE_SHARE_GRANT_MS + 1), false);
    });
    it('starts one selected room, resumes idempotently, and switches without affecting another learner', async () => {
        const teacher = await peer(2); await peer(10); await peer(11);
        const events = []; const emit = (event) => events.push(event);
        const session = await model.startSession(teacher, 10, undefined, emit);
        assert.deepEqual(events.map((event) => event.uid).sort((a, b) => a - b), [2, 10]);
        const resumed = await model.startSession(teacher, 10, undefined, emit);
        assert.equal(resumed._id, session._id);
        const next = await model.startSession(teacher, 11, undefined, emit);
        assert.notEqual(next._id, session._id);
        assert.equal((await model.sessions.findOne({ _id: session._id })).active, false);
        assert.equal(await model.sessions.countDocuments({ teacherUid: 2, active: true }), 1);
        assert.equal(events.filter((event) => event.uid === 10 && event.message.type === 'ended').length, 1);
    });
    it('lists only own workspace learners and excludes disabled students without per-student permission queries', async () => {
        await peer(10); await peer(12, { domainId: 'other', workspaceId: 'b' });
        const list = await model.listStudents(2, 'class-a');
        assert.deepEqual(Array.from(list, (entry) => entry.uid).sort((a, b) => a - b), [10, 11]);
        assert.equal(list.find((entry) => entry.uid === 10).online, true);
        await workspaceStudents.updateOne({ uid: 10 }, { $set: { status: 'disabled' } });
        assert.equal((await model.listStudents(2, 'class-a')).some((entry) => entry.uid === 10), false);
    });
    it('enforces exclusive student sharing atomically under concurrent teachers', async () => {
        const one = await peer(2); const two = await peer(3); await peer(10);
        const outcomes = await Promise.allSettled([model.startSession(one, 10, undefined, () => {}), model.startSession(two, 10, undefined, () => {})]);
        assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(await model.sessions.countDocuments({ studentUid: 10, active: true }), 1);
        assert.equal(outcomes.find((result) => result.status === 'rejected').reason.code, 'BUSY');
    });
    it('rejects another workspace, stale presence and independent server instances', async () => {
        const teacher = await peer(2);
        await peer(12, { domainId: 'other', workspaceId: 'b' });
        await assert.rejects(model.startSession(teacher, 12, undefined, () => {}), errorCode('OFFLINE'));
        await peer(10, { serverId: 'other-instance' });
        await assert.rejects(model.startSession(teacher, 10, undefined, () => {}), errorCode('DIFFERENT_SERVER'));
        const student = await peer(10); await model.disconnectPresence(student);
        await assert.rejects(model.startSession(teacher, 10, undefined, () => {}), errorCode('OFFLINE'));
    });
    it('ends on removal/disabled membership without trusting cached teacher privileges', async () => {
        const teacher = await peer(2); await peer(10);
        const session = await model.startSession(teacher, 10, undefined, () => {});
        await memberships.updateOne({ domainId: 'class-a', uid: 10 }, { $set: { join: false, blockedByStudentManagement: true } });
        await assert.rejects(model.refreshSession(session, () => {}), errorCode('FORBIDDEN'));
        assert.equal((await model.sessions.findOne({ _id: session._id })).active, false);
        await memberships.updateOne({ domainId: 'class-a', uid: 10 }, { $set: { join: true, blockedByStudentManagement: false } });
        await workspaceMembers.updateOne({ uid: 2 }, { $set: { status: 'disabled' } });
        await assert.rejects(model.authorizePair(2, 10, 'class-a'), errorCode('FORBIDDEN'));
    });
    it('page reconnection replaces only that tab and rejects old commands', async () => {
        const teacher = await peer(2); const old = await peer(10);
        const session = await model.startSession(teacher, 10, undefined, () => {});
        await peer(10, { pageId: 'new-page-testing', connectionId: 'new-connection-testing', domainId: 'class-b' });
        await model.disconnectPresence(old);
        const next = await model.refreshSession(session, () => {});
        assert.equal(next.pageId, 'new-page-testing');
        assert.equal(next.domainId, 'class-b');
        assert.throws(() => protocol.authorizeRelay(next, 2, teacher.tabId, session.pageId, 'command'), errorCode('STALE_PAGE'));
        assert.equal((await model.livePresence(10, old.tabId)).connected, true);
    });
    it('follows the selected learner\'s foreground tab on the same device and never another learner or device', async () => {
        const teacher = await peer(2); const student = await peer(10);
        const session = await model.startSession(teacher, 10, undefined, () => {});
        const events = []; const emit = (event) => events.push(event);
        const second = await peer(10, { tabId: 'second-tab-testing', pageId: 'second-page-testing', domainId: 'class-b' });
        const followed = await model.followStudentTab(second, emit);
        assert.equal(followed._id, session._id); assert.equal(followed.studentTabId, second.tabId);
        assert.equal(followed.pageId, second.pageId); assert.equal(followed.domainId, 'class-b');
        assert.equal(events.find((event) => event.message.type === 'ended').tabId, student.tabId);
        assert.equal(events.some((event) => event.uid === 2 && event.message.type === 'ended'), false);
        assert.equal(await model.refreshSession(session, emit), null, 'a stale old-tab refresh cannot overwrite the new tab/page');
        assert.equal((await model.sessions.findOne({ _id: session._id })).pageId, second.pageId);
        const otherDevice = await peer(10, { tabId: 'other-device-tab', deviceId: 'other-device-testing' });
        assert.equal(await model.followStudentTab(otherDevice, emit), null);
        const otherStudent = await peer(11, { deviceId: second.deviceId });
        assert.equal(await model.followStudentTab(otherStudent, emit), null);
        await memberships.updateOne({ uid: 10, domainId: 'class-a' }, { $set: { join: false } });
        const removedTab = await peer(10, { tabId: 'removed-domain-tab' });
        await assert.rejects(model.followStudentTab(removedTab, emit), errorCode('FORBIDDEN'));
        assert.equal((await model.sessions.findOne({ _id: session._id })).studentTabId, second.tabId);
    });
});

describe('live share websocket integration', () => {
    it('injects a page-bound learner grant only after an authorized learning GET response', async () => {
        const router = new Router();
        handlers.apply({ Connection: (name, route) => router.ws(route, undefined, name), on() {} });
        const make = (uid, path = '/d/class-a/p/1000') => ({
            user: { _id: uid, hasPriv: () => true }, domain: rooms[0], session: {}, UiContext: {},
            request: { method: 'get', originalPath: path }, context: { request: { querystring: 'tid=contest' } },
            response: { status: 200, template: 'problem_detail.html' },
            url: (name, options) => `/d/${options.domainId}${router.url(name)}`,
        });
        const student = make(10); await handlers.injectLiveShare(student);
        assert.equal(student.UiContext.liveShare.canTeach, false);
        assert.equal(student.UiContext.liveShare.socketUrl, '/d/class-a/live-share/conn');
        assert.equal(await model.verifyPageGrant(10, 'class-a', student.UiContext.liveShare.pageGrant,
            '/d/class-a/p/1000?tid=contest'), true);
        const teacher = make(2, '/manage'); await handlers.injectLiveShare(teacher);
        assert.equal(teacher.UiContext.liveShare.canTeach, true); assert.equal(teacher.UiContext.liveShare.pageGrant, undefined);
        assert.equal(teacher.UiContext.liveShare.socketUrl, '/d/class-a/live-share/conn');
        for (const path of ['/home/account', '/manage', '/scratch/editor', '/account/10']) {
            const privatePage = make(10, path); await handlers.injectLiveShare(privatePage);
            assert.equal(privatePage.UiContext.liveShare, undefined);
        }
        const failed = make(10); failed.response.status = 403; await handlers.injectLiveShare(failed);
        assert.equal(failed.UiContext.liveShare, undefined);
        const sudo = make(2); sudo.session.sudoUid = 2; await handlers.injectLiveShare(sudo);
        assert.equal(sudo.UiContext.liveShare, undefined);
    });
    it('waits for hello, rejects sudo/foreign origins and does not expose a student roster', async () => {
        const teacher = connection(2); await teacher.instance.prepare();
        assert.equal(teacher.sent.length, 0);
        const foreign = connection(2); foreign.instance.request.headers.origin = 'https://wrong.test';
        await assert.rejects(foreign.instance.prepare(), errorCode('ORIGIN'));
        const sudo = connection(2); sudo.instance.session.sudoUid = 2;
        await assert.rejects(sudo.instance.prepare(), errorCode('FORBIDDEN'));
        const student = connection(10); await hello(student, 10);
        await student.instance.message({ type: 'list' });
        assert.equal(student.sent.at(-1).code, 'FORBIDDEN');
    });
    it('routes learner events only to the selected teacher and rejects forged direction/session', async () => {
        const teacher = connection(2); const student = connection(10); const other = connection(11);
        await hello(teacher, 2); await hello(student, 10); await hello(other, 11);
        await teacher.instance.message({ type: 'start', studentUid: 10 }); await settle();
        const started = teacher.sent.find((message) => message.type === 'started'); assert.ok(started);
        const relay = { type: 'relay', sessionId: started.sessionId, pageId: started.pageId, kind: 'mirror',
            data: { type: 'rrweb', sequence: 1, event: { type: 3, data: {} } } };
        await student.instance.message(relay); await settle();
        assert.equal(teacher.sent.filter((message) => message.type === 'relay').length, 1);
        assert.equal(other.sent.filter((message) => message.type === 'relay').length, 0);
        await other.instance.message(relay); assert.ok(['FORBIDDEN', 'ENDED'].includes(other.sent.at(-1).code));
        await student.instance.message({ ...relay, kind: 'command', data: { id: 'command-testing', pageId: started.pageId, nodeId: 1, action: 'click' } });
        assert.equal(student.sent.at(-1).code, 'FORBIDDEN');
        await student.instance.message({ type: 'stop', sessionId: started.sessionId }); assert.equal(student.sent.at(-1).code, 'FORBIDDEN');
        await teacher.instance.message({ type: 'stop', sessionId: started.sessionId }); await settle();
        assert.equal(teacher.sent.at(-1).type, 'ended'); assert.equal(student.sent.at(-1).type, 'ended');
    });
    it('does not query Mongo for every relay and resumes a reconnected teacher room', async () => {
        const teacher = connection(2); const student = connection(10);
        await hello(teacher, 2); await hello(student, 10);
        await teacher.instance.message({ type: 'start', studentUid: 10 }); await settle();
        const started = teacher.sent.find((message) => message.type === 'started');
        const relay = (sequence) => ({ type: 'relay', sessionId: started.sessionId, pageId: started.pageId, kind: 'mirror',
            data: { type: 'rrweb', sequence, event: { type: 3, data: {} } } });
        await student.instance.message(relay(0)); await settle();
        const original = model.sessions.findOne.bind(model.sessions); let reads = 0;
        model.sessions.findOne = (...args) => { reads++; return original(...args); };
        try { for (let seq = 1; seq <= 10; seq++) await student.instance.message(relay(seq)); await settle(); }
        finally { model.sessions.findOne = original; }
        assert.equal(reads, 0, 'healthy relay burst uses the recent authorized room');
        await teacher.instance.cleanup();
        const reconnected = connection(2); await hello(reconnected, 2); await settle();
        assert.equal(reconnected.sent.find((message) => message.type === 'started').sessionId, started.sessionId);
        assert.ok(student.sent.filter((message) => message.type === 'share-start').length >= 2);
    });
    it('an old socket cleanup cannot pause its replacement page', async () => {
        const teacher = connection(2); const oldStudent = connection(10);
        await hello(teacher, 2); await hello(oldStudent, 10);
        await teacher.instance.message({ type: 'start', studentUid: 10 }); await settle();
        const student = connection(10);
        await hello(student, 10, { pageId: 'new-page-testing' }); await settle();
        const pauses = teacher.sent.filter((message) => message.type === 'paused').length;
        await oldStudent.instance.cleanup(); await settle();
        assert.equal(teacher.sent.filter((message) => message.type === 'paused').length, pauses);
        assert.equal((await model.livePresence(10, 'tab-10-testing')).pageId, 'new-page-testing');
        assert.equal(teacher.sent.filter((message) => message.type === 'started').at(-1).pageId, 'new-page-testing');
    });
    it('ends a long connection after logout or account switching and rejects a restricted session', async () => {
        const limited = connection(2); logins.get('login-2').scope = '1';
        await assert.rejects(limited.instance.prepare(), errorCode('FORBIDDEN'));
        logins.get('login-2').scope = '3';
        const teacher = connection(2); const student = connection(10);
        await hello(teacher, 2); await hello(student, 10);
        await teacher.instance.message({ type: 'start', studentUid: 10 }); await settle();
        const started = teacher.sent.find((message) => message.type === 'started');
        logins.get('login-2').uid = 11; teacher.instance.lastLoginCheck = 0;
        await teacher.instance.message({ type: 'list' }); await settle();
        assert.equal((await model.sessions.findOne({ _id: started.sessionId })).active, false);
        assert.ok(teacher.closed.some((entry) => entry.code === 4003));
        assert.equal(student.sent.at(-1).type, 'ended');
    });
});
