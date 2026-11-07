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
    { _id: 'system', workspaceId: 'tang', domainType: 'oj' },
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
    it('accepts platform page views while excluding external URLs and credential-bearing routes', () => {
        for (const value of ['/', '/ide', '/d/class-a/p/1000?tid=contest', '/homework/123/code', '/record/123',
            '/home', '/home/profile', '/home/domain', '/home/messages', '/user/10', '/manage', '/workspace/a',
            '/scratch/editor', '/d/scratch/scratch/works', '/contest/abc/problems', '/contest/abc/scoreboard/html',
            '/discussion?author=10']) assert.ok(protocol.sharePage(value), value);
        for (const value of ['/login', '/logout', '/user/sudo', '/user/tfa', '/user/webauthn', '/register/code',
            '/lostpass/code', '/oauth/test/callback?code=secret', '/d/class-a/home/changeMail/secret-code',
            'https://evil.test/p/1', '//evil.test/p/1', '/p/1?sid=secret', '/p/1?reviewUid=10', '/home?access_token=secret',
            '/home?password=secret', '/p/../account/10', '/p/%2e%2e/account/10', '/d/class-a/p/%5c/private']) {
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
    it('validates bounded temporary ink and binds Scratch commands to the current child frame', () => {
        const base = { id: 'command-testing', pageId: 'page-testing', nodeId: 1 };
        const drawing = { strokeId: 'stroke-testing', phase: 'start', sequence: 0, points: [[30, 50], [60, 80]] };
        const ink = { ...base, action: 'draw', drawing };
        protocol.validateRelayData('teacher', 'command', ink, base.pageId);
        protocol.validateRelayData('teacher', 'command', { ...ink, drawing: { ...drawing, phase: 'end', sequence: 1, points: [] } }, base.pageId);
        const note = { text: '先读入\n再求和', x: 150, y: 220, width: 96, height: 72 };
        const pinned = { ...ink, drawing: { ...drawing, phase: 'note', sequence: 2, points: [], note } };
        protocol.validateRelayData('teacher', 'command', pinned, base.pageId);
        protocol.validateRelayData('teacher', 'command', { ...ink, drawing: { ...drawing, phase: 'delete', sequence: 3, points: [] } }, base.pageId);
        for (const patch of [{ text: 'x'.repeat(1001) }, { text: {} }, { x: -1 }, { y: 10001 }, { width: 35 },
            { width: 961 }, { height: 35 }, { height: 801 }, { x: Infinity }, { html: '<script>run()</script>' }]) {
            assert.throws(() => protocol.validateRelayData('teacher', 'command',
                { ...pinned, drawing: { ...pinned.drawing, note: { ...note, ...patch } } }, base.pageId), errorCode('INVALID_RELAY'));
        }
        for (const patch of [{ note: undefined }, { note: null }, { note: [] }, { points: [[1, 2]] }, { phase: 'delete' }, { phase: 'end' }]) {
            assert.throws(() => protocol.validateRelayData('teacher', 'command',
                { ...pinned, drawing: { ...pinned.drawing, ...patch } }, base.pageId), errorCode('INVALID_RELAY'));
        }
        assert.throws(() => protocol.validateRelayData('student', 'command', pinned, base.pageId), errorCode('INVALID_RELAY'));
        assert.throws(() => protocol.validateRelayData('teacher', 'command', pinned, 'stale-page'), errorCode('INVALID_RELAY'));
        for (const patch of [{ points: [[NaN, 1]] }, { points: [[10001, 0]] }, { points: Array(33).fill([1, 1]) },
            { points: [[1, 2, 3]] }, { points: [] }, { sequence: 1 }, { sequence: 4097 }, { phase: 'eval' },
            { strokeId: '../invalid' }, { html: '<script>run()</script>' }]) {
            assert.throws(() => protocol.validateRelayData('teacher', 'command', { ...ink, drawing: { ...drawing, ...patch } }, base.pageId), errorCode('INVALID_RELAY'));
        }
        assert.throws(() => protocol.validateRelayData('student', 'command', ink, base.pageId), errorCode('INVALID_RELAY'));
        assert.throws(() => protocol.validateRelayData('teacher', 'command', { ...ink, target: 'other-node' }, base.pageId), errorCode('INVALID_RELAY'));
        const child = { id: 'child-command', pageId: 'frame-testing', nodeId: 12, action: 'scratch', target: 'node-fingerprint',
            input: { type: 'pointer', phase: 'down', gesture: 'gesture-testing', x: 100, y: 200 } };
        const frame = { ...base, action: 'frame', frameId: 'frame-testing', command: child };
        for (const input of [child.input, { ...child.input, phase: 'move' }, { ...child.input, phase: 'up' },
            { type: 'wheel', x: 100, y: 200, dx: 0, dy: 300 }, { type: 'text', value: '100 步' }, { type: 'key', key: 'Enter' }]) {
            protocol.validateRelayData('teacher', 'command', { ...frame, command: { ...child, input } }, base.pageId);
        }
        for (const patch of [{ pageId: 'other-frame' }, { action: 'frame', command: child }, { action: 'click' }, { nodeId: 0 },
            { target: '' }, { script: 'run()' }, { input: { ...child.input, button: 2 } }, { input: { ...child.input, phase: 'click' } },
            { input: { ...child.input, x: -1 } }, { input: { ...child.input, y: 16385 } },
            { input: { type: 'wheel', x: 1, y: 1, dx: 3001, dy: 0 } }, { input: { type: 'text', value: 'x'.repeat(1001) } },
            { input: { type: 'text', value: 'a', key: 'Enter' } }, { input: { type: 'key', key: 'F12' } }, { input: { type: 'eval' } }]) {
            assert.throws(() => protocol.validateRelayData('teacher', 'command', { ...frame, command: { ...child, ...patch } }, base.pageId), errorCode('INVALID_RELAY'));
        }
        assert.throws(() => protocol.validateRelayData('student', 'command', frame, base.pageId), errorCode('INVALID_RELAY'));
        assert.throws(() => protocol.validateRelayData('teacher', 'command', frame, 'old-page'), errorCode('INVALID_RELAY'));
        assert.throws(() => protocol.validateRelayData('teacher', 'command', { ...frame, frameId: 'other-frame' }, base.pageId), errorCode('INVALID_RELAY'));
        assert.throws(() => protocol.validateRelayData('teacher', 'command', { ...frame, action: 'scratch' }, base.pageId), errorCode('INVALID_RELAY'));
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
    it('isolates code annotation documents from editor layout and limits source initialization to learners', () => {
        const common = { pageId: 'page-testing', editorId: 'editor-testing', document: 'annotations' };
        protocol.validateRelayData('student', 'editor', { ...common, type: 'edit:init', state: 'YQ==' }, common.pageId);
        protocol.validateRelayData('teacher', 'editor', { ...common, type: 'edit:update', update: 'YQ==', opId: 'note-update-1' }, common.pageId);
        protocol.validateRelayData('student', 'editor', { ...common, type: 'edit:ack', opId: 'note-update-1' }, common.pageId);
        for (const change of [{ document: 'code' }, { document: true }, { kind: 'textarea' }, { readOnly: false },
            { rect: { x: 0, y: 0, width: 100, height: 100 } }, { type: 'edit:cursor', anchor: 'YQ==', head: 'YQ==' },
            { type: 'edit:sync' }, { type: 'edit:scroll', scrollTop: 0, scrollLeft: 0, scrollSeq: 1 }]) {
            assert.throws(() => protocol.validateRelayData('teacher', 'editor', {
                ...common, type: 'edit:update', update: 'YQ==', ...change,
            }, common.pageId), errorCode('INVALID_RELAY'));
        }
        assert.throws(() => protocol.validateRelayData('teacher', 'editor', { ...common, type: 'edit:init', state: 'YQ==' }, common.pageId), errorCode('INVALID_RELAY'));
    });
    it('relays editor scrolling and source appearance while rejecting invalid options and directions', () => {
        const scroll = { type: 'edit:scroll', pageId: 'page-testing', editorId: 'editor-testing', scrollTop: 172.5, scrollLeft: 0, scrollSeq: 3 };
        protocol.validateRelayData('teacher', 'editor', scroll, 'page-testing');
        for (const change of [{ scrollTop: -1 }, { scrollTop: Infinity }, { scrollLeft: '0' }, { scrollSeq: 0 }, { scrollSeq: 0.5 }, { scrollSeq: undefined }]) {
            assert.throws(() => protocol.validateRelayData('teacher', 'editor', { ...scroll, ...change }, 'page-testing'), errorCode('INVALID_RELAY'));
        }
        assert.throws(() => protocol.validateRelayData('student', 'editor', scroll, 'page-testing'), errorCode('INVALID_RELAY'));
        const layout = { type: 'edit:layout', pageId: 'page-testing', editorId: 'editor-testing', scrollSeq: 3,
            view: { wordWrap: 'bounded', wordWrapColumn: 80, tabSize: 4, insertSpaces: true, glyphMargin: true,
                lineNumbers: 'on', lineNumbersMinChars: 5, lineDecorationsWidth: '2ch', scrollBeyondLastLine: false,
                letterSpacing: 0.5, fontWeight: '500', padding: { top: 4, bottom: 8 },
                minimap: { enabled: true, side: 'right', size: 'proportional', showSlider: 'mouseover', renderCharacters: false, maxColumn: 120, scale: 1 } },
            theme: { base: 'vs-dark', inherit: true, colors: { 'editor.background': '#101020', 'editor.lineHighlightBackground': '#FFFFFF08' },
                rules: [{ token: 'comment', foreground: '808080', fontStyle: 'italic' }, { token: 'text', fontStyle: 'normal' }],
                encodedTokensColors: ['#101020', '#808080'] } };
        protocol.validateRelayData('student', 'editor', layout, 'page-testing');
        protocol.validateRelayData('student', 'editor', { ...layout, view: { tabSize: 64, lineNumbersMinChars: 300, wordWrapColumn: 1073741824 } }, 'page-testing');
        for (const change of [{ view: { tabSize: 0 } }, { view: { wordWrap: 'eval' } }, { view: { minimap: { enabled: 'true' } } },
            { view: { padding: { top: Infinity } } }, { view: { arbitraryCallback: 'run()' } }, { view: { lineDecorationsWidth: 'url(https://invalid)' } },
            { theme: { ...layout.theme, colors: { 'editor.background': 'url(https://invalid)' } } },
            { theme: { ...layout.theme, rules: [{ token: 'comment', fontStyle: 'position:absolute' }] } },
            { theme: { ...layout.theme, rules: Array(4097).fill({ token: 'comment' }) } }]) {
            assert.throws(() => protocol.validateRelayData('student', 'editor', { ...layout, ...change }, 'page-testing'), errorCode('INVALID_RELAY'));
        }
        assert.throws(() => protocol.validateRelayData('teacher', 'editor', { ...scroll, view: layout.view }, 'page-testing'), errorCode('INVALID_RELAY'));
        assert.throws(() => protocol.validateRelayData('student', 'editor', { ...layout, type: 'edit:cursor' }, 'page-testing'), errorCode('INVALID_RELAY'));
    });
    it('accepts bounded learner focus geometry only and rejects malformed or excessive snapshots', () => {
        const selection = { noteId: 'note-testing', anchor: 'YQ==', head: 'Yg==', rects: [{ x: 20, y: 30, width: 100, height: 24 }] };
        const focus = { width: 640, height: 320, scrollTop: 0, scrollLeft: 0, revision: 'AA==:12:abcdef:123456', selections: [selection] };
        const message = { type: 'edit:focus', pageId: 'page-testing', editorId: 'editor-testing', focus };
        protocol.validateRelayData('student', 'editor', message, message.pageId);
        protocol.validateRelayData('student', 'editor', { ...message, focus: { ...focus, selections: [] } }, message.pageId);
        protocol.validateRelayData('student', 'editor', { ...message, focus: { ...focus, selections: [{ ...selection, rects: [] }] } }, message.pageId);
        assert.throws(() => protocol.validateRelayData('teacher', 'editor', message, message.pageId), errorCode('INVALID_RELAY'));
        for (const change of [{ width: -1 }, { height: 10001 }, { scrollTop: -1 }, { revision: '' }, { revision: '<script>' },
            { selections: Array.from({ length: 42 }, (_, i) => ({ ...selection, noteId: `n-${i}` })) },
            { selections: [selection, selection] }, { selections: [{ ...selection, anchor: '' }] },
            { selections: [{ ...selection, rects: Array(257).fill(selection.rects[0]) }] },
            { selections: Array.from({ length: 9 }, (_, i) => ({ ...selection, noteId: `n-${i}`, rects: Array(256).fill(selection.rects[0]) })) },
            { selections: [{ ...selection, rects: [{ x: -1, y: 0, width: 20, height: 20 }] }] },
            { selections: [{ ...selection, rects: [{ x: 620, y: 0, width: 40, height: 20 }] }] },
            { selections: [{ ...selection, rects: [{ x: 0, y: 0, width: 0, height: 20 }] }] },
            { selections: [{ ...selection, html: '<script>' }] }]) {
            assert.throws(() => protocol.validateRelayData('student', 'editor', { ...message, focus: { ...focus, ...change } }, message.pageId), errorCode('INVALID_RELAY'));
        }
        assert.throws(() => protocol.validateRelayData('student', 'editor', { ...message, document: 'annotations' }, message.pageId), errorCode('INVALID_RELAY'));
        assert.throws(() => protocol.validateRelayData('student', 'editor', { ...message, type: 'edit:layout' }, message.pageId), errorCode('INVALID_RELAY'));
    });
    it('allows only learner textarea layout fields and rejects arbitrary styles', () => {
        const textStyle = { wrap: 'soft', fontWeight: '400', fontStyle: 'italic', paddingTop: 18, paddingRight: 24, paddingBottom: 18, paddingLeft: 24,
            borderTopWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderLeftWidth: 2,
            scrollbarWidth: 15, scrollbarHeight: 0, letterSpacing: 0.4, wordSpacing: 0, textIndent: 0, tabSize: 4 };
        const message = { type: 'edit:layout', pageId: 'page-testing', editorId: 'editor-testing', textStyle };
        protocol.validateRelayData('student', 'editor', message, message.pageId);
        assert.throws(() => protocol.validateRelayData('teacher', 'editor', { ...message, type: 'edit:update', update: 'YQ==' }, message.pageId), errorCode('INVALID_RELAY'));
        for (const change of [{ wrap: 'eval' }, { fontWeight: 'url(https://invalid)' }, { fontStyle: 'position:absolute' }, { paddingLeft: -1 },
            { borderLeftWidth: 257 }, { scrollbarWidth: -1 }, { scrollbarHeight: Infinity }, { tabSize: 0 }, { letterSpacing: 2001 },
            { transform: 'scale(0)' }, { onerror: 'alert(1)' }]) {
            assert.throws(() => protocol.validateRelayData('student', 'editor', { ...message, textStyle: { ...textStyle, ...change } }, message.pageId), errorCode('INVALID_RELAY'));
        }
    });
    it('allows only bounded teacher splitter resizing with an exact command shape', () => {
        const command = { id: 'resize-command-testing', pageId: 'page-testing', nodeId: 42, action: 'resize', target: 'safe-sash-hash', x: 0.5 };
        for (const x of [0, 0.125, 0.5, 1]) protocol.validateRelayData('teacher', 'command', { ...command, x }, 'page-testing');
        assert.throws(() => protocol.validateRelayData('student', 'command', command, 'page-testing'), errorCode('INVALID_RELAY'));
        for (const change of [{ x: -0.01 }, { x: 1.01 }, { x: Infinity }, { x: NaN }, { x: '0.5' }, { x: null }, { x: undefined },
            { target: '' }, { target: undefined }, { target: 'x'.repeat(33) }, { target: 42 }, { y: 0 }, { value: 'script' },
            { html: '<script>run()</script>' }, { onclick: 'run()' }, { action: 'eval' }, { action: 'delete' }, { pageId: 'old-page' }]) {
            assert.throws(() => protocol.validateRelayData('teacher', 'command', { ...command, ...change }, 'page-testing'), errorCode('INVALID_RELAY'));
        }
    });
    it('allows bounded teacher text annotations and clearing, rejecting malformed anchors and executable options', () => {
        const annotation = { startNodeId: 12, endNodeId: 14, startOffset: 2, endOffset: 9,
            quote: '从输出固定内容开始', text: '先看这里', noteOpen: true, offsetX: 18.5, offsetY: -72 };
        const command = { id: 'annotation-command', pageId: 'page-testing', nodeId: 1, action: 'annotate', annotationId: 'note-testing-1', annotation };
        protocol.validateRelayData('teacher', 'command', command, 'page-testing');
        protocol.validateRelayData('teacher', 'command', { ...command, annotation: null }, 'page-testing');
        protocol.validateRelayData('teacher', 'command', { ...command, annotation: { ...annotation, text: '' } }, 'page-testing');
        protocol.validateRelayData('teacher', 'command', { ...command, annotation: { ...annotation, noteOpen: false, text: '' } }, 'page-testing');
        // Existing notes remain valid without dimensions; resized notes use bounded CSS pixels.
        for (const dimensions of [{ width: 36 }, { height: 36 }, { width: 960, height: 800 }, { width: 320.5, height: 180.25 }]) {
            protocol.validateRelayData('teacher', 'command', { ...command, annotation: { ...annotation, ...dimensions } }, 'page-testing');
        }
        // HTML-looking content is permitted as inert note text; no HTML/style fields are accepted.
        protocol.validateRelayData('teacher', 'command', { ...command, annotation: { ...annotation, text: '<img onerror="alert(1)">' } }, 'page-testing');
        for (const change of [
            { startNodeId: 0 }, { endNodeId: -1 }, { startNodeId: '12' }, { endNodeId: 1.5 },
            { startOffset: -1 }, { endOffset: 1_000_001 }, { startOffset: 0.5 },
            { endNodeId: 12, endOffset: 2 }, { endNodeId: 12, endOffset: 1 },
            { quote: '' }, { quote: ' \n ' }, { quote: 'x'.repeat(4001) }, { text: 'x'.repeat(1001) },
            { text: null }, { noteOpen: undefined }, { noteOpen: null }, { noteOpen: 'true' }, { noteOpen: 1 },
            { offsetX: Infinity }, { offsetY: NaN }, { offsetX: '5' }, { offsetY: 10001 },
            { width: 35.99 }, { width: 960.01 }, { height: 35.99 }, { height: 800.01 },
            { width: Infinity }, { width: NaN }, { width: '300' }, { width: null }, { height: -Infinity }, { height: '180' }, { height: false },
            { html: '<script>alert(1)</script>' }, { style: 'position:fixed' }, { onclick: 'run()' },
        ]) {
            assert.throws(() => protocol.validateRelayData('teacher', 'command', {
                ...command, annotation: { ...annotation, ...change },
            }, 'page-testing'), errorCode('INVALID_RELAY'));
        }
        for (const invalidAnnotation of [undefined, [], 'text', 5]) {
            assert.throws(() => protocol.validateRelayData('teacher', 'command', { ...command, annotation: invalidAnnotation }, 'page-testing'), errorCode('INVALID_RELAY'));
        }
        for (const change of [{ target: 'node' }, { value: 'text' }, { x: 1 }, { script: 'run()' }, { pageId: 'old-page' },
            { annotationId: undefined }, { annotationId: '' }, { annotationId: 'short' }, { annotationId: 1 },
            { annotationId: 'note<script>' }, { annotationId: 'x'.repeat(97) }]) {
            assert.throws(() => protocol.validateRelayData('teacher', 'command', { ...command, ...change }, 'page-testing'), errorCode('INVALID_RELAY'));
        }
        for (const value of [annotation, null]) {
            assert.throws(() => protocol.validateRelayData('student', 'command', { ...command, annotation: value }, 'page-testing'), errorCode('INVALID_RELAY'));
        }
    });
    it('allows bounded child-frame display packets only from the learner, without nesting or actions', () => {
        const id = '0123456789abcdef0123456789abcdef';
        const packets = [
            { type: 'rrweb', sequence: 1, event: { type: 2, data: { node: {} } } },
            { type: 'rrweb-batch', sequence: 2, events: [{ type: 3, data: {} }] },
            { type: 'rrweb-chunk', sequence: 3, id: 'chunk-id', index: 0, total: 1, chunk: 'part', encoding: 'json' },
        ];
        for (const packet of packets) {
            const data = { type: 'frame', id, packet };
            protocol.validateRelayData('student', 'mirror', data, 'page-testing');
            assert.throws(() => protocol.validateRelayData('teacher', 'mirror', data, 'page-testing'), errorCode('INVALID_RELAY'));
        }
        const removal = { type: 'frame-remove', id };
        protocol.validateRelayData('student', 'mirror', removal, 'page-testing');
        assert.throws(() => protocol.validateRelayData('teacher', 'mirror', removal, 'page-testing'), errorCode('INVALID_RELAY'));
        for (const packet of [{ type: 'frame', id, packet: packets[0] }, removal, { type: 'edit:update', update: 'YQ==' },
            { type: 'command', action: 'click' }, { ...packets[0], sequence: -1 }, { ...packets[1], events: Array(257).fill({}) },
            { ...packets[2], total: 1025 }, { ...packets[2], index: 1 }, { ...packets[2], chunk: 'x'.repeat(128 * 1024 + 1) },
            { ...packets[2], encoding: 'html' }, null, [], 'script']) {
            assert.throws(() => protocol.validateRelayData('student', 'mirror', { type: 'frame', id, packet }, 'page-testing'), errorCode('INVALID_RELAY'));
        }
        for (const invalidId of ['', 'x'.repeat(129), 'frame[secret]', '../frame', 'frame with spaces']) {
            assert.throws(() => protocol.validateRelayData('student', 'mirror', { type: 'frame', id: invalidId, packet: packets[0] },
                'page-testing'), errorCode('INVALID_RELAY'));
        }
        assert.throws(() => protocol.validateRelayData('student', 'mirror', { ...removal, packet: packets[0] }, 'page-testing'), errorCode('INVALID_RELAY'));
        assert.throws(() => protocol.validateRelayData('student', 'mirror', { type: 'frame', id, packet: packets[0], script: 'run()' },
            'page-testing'), errorCode('INVALID_RELAY'));
        assert.throws(() => protocol.validateShareMessage({ type: 'relay', sessionId: 'session-testing', pageId: 'page-testing',
            kind: 'mirror', data: { type: 'frame', id, packet: { ...packets[0], event: { text: 'x'.repeat(384 * 1024) } } } }),
        errorCode('MESSAGE_TOO_LARGE'));
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
        const rootToken = await model.issuePageGrant(10, 'class-a', '/home/profile');
        assert.equal(await model.verifyPageGrant(10, 'class-a', rootToken, '/home/profile'), true);
        assert.equal(await model.verifyPageGrant(10, 'class-b', rootToken, '/home/profile'), false);
        await assert.rejects(model.issuePageGrant(10, 'class-a', '/d/other'), errorCode('UNSUPPORTED_PAGE'));
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
    it('lists and follows authorized Scratch and personal pages without leaving the selected workspace or device', async () => {
        await memberships.insertMany([2, 10, 11].map((uid) => ({ uid, domainId: 'scratch', join: true,
            role: uid === 2 ? 'teacher' : 'default' })));
        const teacher = await peer(2);
        const student = await peer(10, { domainId: 'scratch', url: '/d/scratch/scratch/works', title: '我的作品' });
        assert.equal((await model.listStudents(2, 'class-a')).find((entry) => entry.uid === 10).online, true);
        const session = await model.startSession(teacher, 10, undefined, () => {});
        assert.equal(session.domainId, 'scratch');
        const personal = await peer(10, { tabId: 'personal-tab-testing', pageId: 'personal-page-testing',
            domainId: 'class-b', url: '/d/class-b/home/profile', title: '个人中心' });
        const followed = await model.followStudentTab(personal, () => {});
        assert.equal(followed._id, session._id);
        assert.equal(followed.studentTabId, personal.tabId);
        assert.equal(followed.domainId, 'class-b');
        const otherDevice = await peer(10, { tabId: 'device-two-testing', deviceId: 'other-device-testing', url: '/user/10' });
        assert.equal(await model.followStudentTab(otherDevice, () => {}), null);
        const foreign = await peer(10, { tabId: 'foreign-tab-testing', domainId: 'other', workspaceId: 'b', url: '/d/other/home' });
        await assert.rejects(model.followStudentTab(foreign, () => {}), errorCode('FORBIDDEN'));
        assert.equal((await model.sessions.findOne({ _id: session._id })).studentTabId, personal.tabId);
        assert.equal(student.deviceId, personal.deviceId);
    });
});

describe('live share websocket integration', () => {
    it('binds global daily quiz pages to an actually joined classroom without granting foreign-domain access', async () => {
        const make = (path = '/daily-quiz', uid = 10) => ({
            user: { _id: uid, hasPriv: () => true }, domain: rooms.find((room) => room._id === 'system'),
            session: {}, UiContext: {}, request: { method: 'GET', originalPath: path },
            context: { request: { querystring: 'return=%2Fd%2Fclass-a%2Fp' } },
            response: { status: 200, template: 'daily_quiz.html' },
            url: (_name, options) => `/d/${options.domainId}/live-share/conn`,
        });
        const quiz = make(); await handlers.injectLiveShare(quiz);
        assert.equal(quiz.UiContext.liveShare.canTeach, false);
        assert.equal(quiz.UiContext.liveShare.socketUrl, '/d/class-a/live-share/conn');
        const url = '/daily-quiz?return=%2Fd%2Fclass-a%2Fp';
        assert.equal(await model.verifyPageGrant(10, 'class-a', quiz.UiContext.liveShare.pageGrant, url), true);
        assert.equal(await model.verifyPageGrant(11, 'class-a', quiz.UiContext.liveShare.pageGrant, url), false);
        assert.equal(await model.verifyPageGrant(10, 'class-b', quiz.UiContext.liveShare.pageGrant, url), false);
        assert.equal(await model.verifyPageGrant(10, 'class-a', quiz.UiContext.liveShare.pageGrant, '/p'), false);
        const quizSocket = connection(10); await quizSocket.instance.prepare();
        await quizSocket.instance.message({ type: 'hello', tabId: 'quiz-tab-testing', pageId: 'quiz-page-testing',
            deviceId: 'quiz-device-testing', pageGrant: quiz.UiContext.liveShare.pageGrant, url, title: '每日问答', visible: true });
        assert.equal(quizSocket.sent.find((message) => message.type === 'ready')?.canTeach, false);
        const teacher = connection(2); await hello(teacher, 2);
        await teacher.instance.message({ type: 'start', studentUid: 10, tabId: 'quiz-tab-testing' });
        await settle();
        assert.ok(teacher.sent.some((message) => message.type === 'started'), 'a teacher can start sharing the quiz tab');
        const explicit = make('/d/system/daily-quiz'); await handlers.injectLiveShare(explicit);
        assert.equal(explicit.UiContext.liveShare, undefined, 'an explicit unjoined domain never falls back');
        const denied = make(); denied.response.status = 403; await handlers.injectLiveShare(denied);
        assert.equal(denied.UiContext.liveShare, undefined, 'an unauthorized HTTP response never gets a page grant');
        await workspaceStudents.updateOne({ uid: 10 }, { $set: { status: 'disabled' } });
        const removed = make(); await handlers.injectLiveShare(removed);
        assert.equal(removed.UiContext.liveShare, undefined, 'disabled students cannot use global-page fallback');
    });

    it('injects a page-bound learner grant only after an authorized rendered GET response', async () => {
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
        for (const path of ['/home', '/home/profile', '/home/domain', '/home/messages', '/user/10',
            '/contest/abc', '/contest/abc/problems', '/contest/abc/scoreboard/html']) {
            const page = make(10, path); await handlers.injectLiveShare(page);
            assert.ok(page.UiContext.liveShare?.pageGrant, path);
            assert.equal(await model.verifyPageGrant(10, 'class-a', page.UiContext.liveShare.pageGrant,
                `${path}?tid=contest`), true, path);
        }
        for (const path of ['/login', '/user/sudo', '/register/secret', '/home/changeMail/secret']) {
            const privatePage = make(10, path); await handlers.injectLiveShare(privatePage);
            assert.equal(privatePage.UiContext.liveShare, undefined);
        }
        const secret = make(10, '/home/security'); secret.context.request.querystring = 'token=private';
        await handlers.injectLiveShare(secret); assert.equal(secret.UiContext.liveShare, undefined);
        const json = make(10, '/home'); delete json.response.template; await handlers.injectLiveShare(json);
        assert.equal(json.UiContext.liveShare, undefined);
        const post = make(10, '/home/profile'); post.request.method = 'post'; await handlers.injectLiveShare(post);
        assert.equal(post.UiContext.liveShare, undefined);
        await memberships.insertMany([2, 10].map((uid) => ({ uid, domainId: 'scratch', join: true,
            role: uid === 2 ? 'teacher' : 'default' })));
        const scratch = make(10, '/d/scratch/scratch/works'); scratch.domain = rooms.find((room) => room._id === 'scratch');
        await handlers.injectLiveShare(scratch); assert.ok(scratch.UiContext.liveShare?.pageGrant);
        assert.equal(scratch.UiContext.liveShare.socketUrl, '/d/scratch/live-share/conn');
        const wrongDomain = make(10, '/d/other/home'); await handlers.injectLiveShare(wrongDomain);
        assert.equal(wrongDomain.UiContext.liveShare, undefined);
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
    it('routes live annotations only to the selected learner and rejects stale pages and learner-authored notes', async () => {
        const teacher = connection(2); const student = connection(10); const other = connection(11);
        await hello(teacher, 2); await hello(student, 10); await hello(other, 11);
        await teacher.instance.message({ type: 'start', studentUid: 10 }); await settle();
        const started = teacher.sent.find((message) => message.type === 'started'); assert.ok(started);
        const relay = { type: 'relay', sessionId: started.sessionId, pageId: started.pageId, kind: 'command',
            data: { id: 'annotation-command', pageId: started.pageId, nodeId: 1, action: 'annotate', annotationId: 'note-testing-1', annotation: {
                startNodeId: 2, endNodeId: 2, startOffset: 0, endOffset: 4,
                quote: '重点内容', text: '仔细读这一句', noteOpen: true, offsetX: 24, offsetY: -80,
            } } };
        await teacher.instance.message(relay); await settle();
        assert.equal(student.sent.filter((message) => message.type === 'relay' && message.data?.action === 'annotate').length, 1);
        assert.equal(other.sent.filter((message) => message.type === 'relay').length, 0);
        await teacher.instance.message({ ...relay, data: { ...relay.data, id: 'annotation-command-2', annotationId: 'note-testing-2',
            annotation: { ...relay.data.annotation, text: '第二处重点' } } }); await settle();
        const firstNotes = student.sent.filter((message) => message.type === 'relay' && message.data?.action === 'annotate');
        assert.deepEqual(firstNotes.map((message) => message.data.annotationId), ['note-testing-1', 'note-testing-2']);
        await student.instance.message(relay);
        assert.equal(student.sent.at(-1).code, 'FORBIDDEN');
        await teacher.instance.message({ ...relay, pageId: 'old-page', data: { ...relay.data, pageId: 'old-page' } });
        assert.equal(teacher.sent.at(-1).code, 'STALE_PAGE');
        await teacher.instance.message({ ...relay, data: { ...relay.data, id: 'annotation-cleared', annotation: null } }); await settle();
        const received = student.sent.filter((message) => message.type === 'relay' && message.data?.action === 'annotate');
        assert.equal(received.length, 3); assert.equal(received.at(-1).data.annotation, null);
        assert.equal(received.at(-1).data.annotationId, 'note-testing-1');
        const notes = new Map();
        for (const message of received) {
            if (message.data.annotation === null) notes.delete(message.data.annotationId);
            else notes.set(message.data.annotationId, message.data.annotation);
        }
        assert.deepEqual([...notes.keys()], ['note-testing-2'], 'clearing one annotation leaves the second independently addressed');
        assert.equal(other.sent.filter((message) => message.type === 'relay').length, 0);
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
