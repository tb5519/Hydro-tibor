const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { before, after, beforeEach, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, { module, exports: module.exports, Buffer, URL, Date, setTimeout, console,
        require: (name) => dependencies[name] ?? require(name) });
    return module.exports;
}
const lib = load('packages/hydrooj/src/lib/class_chat.ts');
const solutionLib = load('packages/hydrooj/src/lib/class_chat_solution.ts', { './class_chat': lib });
const cppModeLib = load('packages/hydrooj/src/lib/cpp_editor_mode.ts');
let mongo; let client; let database; let model; let solutions; let handlers; let accounts; let directory; let storage;
let revoked; let documents; let failDelete; let logins; let events;
let staffMembers; let teacherUids; let studentUids;
const rooms = [{ _id: 'python', workspaceId: 'a', owner: 2 }, { _id: 'cpp', workspaceId: 'a', owner: 2 },
    { _id: 'other', workspaceId: 'b', owner: 3 }];
const workspace = {
    LEGACY_WORKSPACE_ID: 'tang', getDomains: async (id) => rooms.filter((r) => r.workspaceId === id),
    getMembers: async (id) => staffMembers.filter((member) => member.workspaceId === id),
    getExcludedLegacyUids: async () => new Set(),
};
async function scope(uid, domainId, teacher) {
    const classroom = rooms.find((r) => r._id === domainId);
    if (!classroom || revoked.has(uid)
        || !(teacher ? teacherUids : studentUids).get(classroom.workspaceId)?.has(uid)) throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
    return { account: await accounts.findOne({ _id: uid }), classroom, workspaceId: classroom.workspaceId };
}
const share = {
    teacherScope: (uid, id) => scope(uid, id, true), studentScope: (uid, id) => scope(uid, id, false),
    authorizePair: async (teacher, student, id) => ({ teacher: await scope(teacher, id, true), student: await scope(student, id, false) }),
};
const err = (code) => (value) => value.code === code;
before(async () => {
    mongo = await MongoMemoryServer.create(); client = await MongoClient.connect(mongo.getUri()); database = client.db('class-chat');
    accounts = database.collection('user'); directory = fs.mkdtempSync(path.join(os.tmpdir(), 'class-chat-test-'));
    workspace.collStudent = database.collection('workspace.student');
    const storageColl = database.collection('test.storage');
    storage = {
        coll: storageColl,
        put: async (storagePath, file) => storageColl.insertOne({ _id: storagePath, path: storagePath, size: fs.statSync(file).size }),
        del: async (paths) => storageColl.updateMany({ path: { $in: paths } }, { $set: { autoDelete: new Date(Date.now() + 100000) } }),
        cleanFiles: async (paths) => {
            if (failDelete) throw new Error('Storage outage');
            await storageColl.deleteMany({ path: { $in: paths }, autoDelete: { $lte: new Date() } });
        },
        getMeta: (storagePath) => storageColl.findOne({ path: storagePath, autoDelete: null }),
        get: async (storagePath) => `private:${storagePath}`,
    };
    model = load('packages/hydrooj/src/model/class_chat.ts', {
        '../lib/avatar': (value) => `/avatar/${value || 'default'}`,
        '../lib/class_chat': lib, '../lib/class_chat_solution': solutionLib, '../service/db': { collection: (name) => database.collection(name) },
        '../lib/cpp_editor_mode': cppModeLib,
        '../service/bus': { broadcast: (name, value) => events.push({ name, value }) },
        './builtin': { PRIV: { PRIV_EDIT_SYSTEM: 1, PRIV_USER_PROFILE: 2, PRIV_JUDGE: 4, PRIV_MANAGE_ALL_DOMAIN: 8 },
            PERM: { PERM_VIEW: 1n, PERM_EDIT_DOMAIN: 2n }, BUILTIN_ROLES: { default: 1n, teacher: 3n, root: 3n } },
        './live_share': share, './workspace': workspace, './storage': storage,
        './user': { coll: accounts, default: { getById: async (domainId, uid) => ({ ...await accounts.findOne({ _id: uid }), domainId }) },
            getById: async (domainId, uid) => ({ ...await accounts.findOne({ _id: uid }), domainId }) },
        './domain': { collUser: database.collection('domain.user') },
        './problem': { get: async (id, pid) => documents.find((p) => p.domainId === id && `${p.docId}` === `${pid}`),
            isObjectiveSource: (p) => !!p.objective, canViewBy: (p, account) => !p.hidden || account._id === 2 },
    });
    solutions = load('packages/hydrooj/src/model/class_chat_solution.ts', {
        '../lib/class_chat': lib, '../lib/class_chat_solution': solutionLib,
        '../service/db': { collection: (name) => database.collection(name) }, './class_chat': model,
    });
    const noop = () => () => {};
    handlers = load('packages/hydrooj/src/handler/class_chat.ts', {
        '../lib/avatar': (value) => `/avatar/${value || 'default'}`, '../lib/class_chat': lib,
        '../lib/live_share': { checkShareOrigin: (origin, host) => { if (new URL(origin).host !== host) throw new Error('Origin denied'); } },
        '../model/builtin': { PRIV: { PRIV_USER_PROFILE: 2 } }, '../model/class_chat': model, '../model/storage': storage,
        '../model/class_chat_solution': solutions, '../lib/class_chat_solution': solutionLib,
        '../lib/cpp_editor_mode': cppModeLib,
        '../model/token': { TYPE_SESSION: 0, get: async (id) => logins.get(id) }, '../model/user': { coll: accounts },
        '../service/bus': { broadcast: (name, value) => events.push({ name, value }) },
        '../service/server': { Handler: class {}, ConnectionHandler: class {}, subscribe: noop },
    });
    await model.apply();
    await solutions.apply();
});
beforeEach(async () => {
    await Promise.all(['class.chat.message', 'class.chat.conversation', 'class.chat.asset', 'class.chat.grant', 'class.chat.presence',
        'class.chat.solution.draft', 'class.chat.solution.standard', 'user', 'domain.user', 'workspace.student', 'test.storage']
        .map((name) => database.collection(name).deleteMany({})));
    revoked = new Set(); failDelete = false; events = [];
    staffMembers = [{ workspaceId: 'a', uid: 2, role: 'teacher' }, { workspaceId: 'b', uid: 3, role: 'teacher' }];
    teacherUids = new Map([['a', new Set([2])], ['b', new Set([3])]]);
    studentUids = new Map([['a', new Set([10, 11])], ['b', new Set([12])]]);
    workspace.LEGACY_WORKSPACE_ID = 'tang';
    rooms[0].owner = 2; rooms[1].owner = 2;
    model.clearRosterCache();
    logins = new Map([2, 3, 10, 11, 12].map((uid) => [`login-${uid}`, { uid, expireAt: new Date(Date.now() + 60000) }]));
    await accounts.insertMany([2, 3, 10, 11, 12].map((_id) => ({ _id, uname: `user${_id}`, priv: 2, avatar: `photo${_id}` })));
    await database.collection('domain.user').insertMany([2, 10, 11].flatMap((uid) => ['python', 'cpp'].map((domainId) => ({ uid, domainId,
        join: true, role: uid === 2 ? 'teacher' : 'default' }))));
    documents = [{ domainId: 'python', docId: 5, title: 'A + B', content: 'Original question', html: false },
        { domainId: 'python', docId: 6, title: 'Hidden contest', content: 'Hidden content', hidden: true }];
});
after(async () => { await client?.close(); await mongo?.stop(); fs.rmSync(directory, { recursive: true, force: true }); });
async function pair(uid = 10, peer = 2, domain = 'python') { return model.authorizePair(uid, peer, domain); }
const send = (text, clientId = `message_${Math.random().toString(36).slice(2)}`) => ({ text, clientId });

describe('private classroom chat storage', () => {
    it('isolates pairs and workspaces, and rejects revoked membership on reads and writes', async () => {
        const p = await pair(); const value = await model.send(p, 10, send('help'));
        assert.equal((await model.page(await pair(11))).messages.length, 0);
        await assert.rejects(pair(10, 3, 'python'), err('FORBIDDEN'));
        await assert.rejects(model.authorizedMessage(11, 'python', value.message.id), err('NOT_FOUND'));
        revoked.add(10);
        await assert.rejects(model.send(p, 10, send('forbidden')), err('FORBIDDEN'));
        await assert.rejects(model.authorizedMessage(2, 'python', value.message.id), err('FORBIDDEN'));
    });

    it('lists authorized teachers/students with avatars and counts unread until acknowledged', async () => {
        const p = await pair();
        await model.send(p, 10, send('one'));
        const second = await model.send(p, 10, send('two'));
        const roster = await model.peersFor(2, 'cpp');
        assert.equal(roster.unread, 2); assert.equal(roster.peers[0].uid, 10);
        assert.equal(roster.peers[0].avatarUrl, '/avatar/photo10');
        const studentRoster = await model.peersFor(10, 'python');
        assert.equal(studentRoster.peers[0].uid, 2); assert.equal(studentRoster.defaultPeerUid, 2);
        assert.equal(Object.hasOwn(roster, 'defaultPeerUid'), false);
        await model.acknowledge(await pair(2, 10), 2, second.message.id);
        assert.equal((await model.peersFor(2, 'python')).unread, 0);
        await model.send(p, 10, send('new unread'));
        assert.equal((await model.peersFor(2, 'python')).unread, 1);
    });

    it('prefers the actual classroom owner without auto-listing unrelated platform administrators', async () => {
        workspace.LEGACY_WORKSPACE_ID = 'a';
        teacherUids.get('a').add(4).add(5);
        await accounts.insertMany([{ _id: 4, uname: 'platform-admin', priv: 3 }, { _id: 5, uname: 'another-teacher', priv: 2 }]);
        staffMembers.push({ workspaceId: 'a', uid: 4, role: 'admin' }, { workspaceId: 'a', uid: 5, role: 'teacher' });
        await database.collection('domain.user').insertOne({ uid: 5, domainId: 'python', join: true, role: 'teacher' });
        await model.send(await pair(5, 10), 5, send('other teacher unread'));
        const roster = await model.peersFor(10, 'python');
        assert.equal(roster.defaultPeerUid, 2);
        assert.equal(roster.peers.find((peer) => peer.uid === 5).unread, 1);
        assert.equal(roster.peers.some((peer) => peer.uid === 4), false, 'global system privileges are not a teaching assignment');
        assert.ok(roster.peers.every((peer) => !Object.hasOwn(peer, 'online')));
        await model.send(await pair(4, 10), 4, send('existing support conversation'));
        const retained = await model.peersFor(10, 'python');
        assert.equal(retained.defaultPeerUid, 2);
        assert.equal(retained.peers.find((peer) => peer.uid === 4).unread, 1, 'existing authorized conversations remain reachable');
        revoked.add(4);
        assert.equal((await model.peersFor(10, 'python')).peers.some((peer) => peer.uid === 4), false);
    });

    it('reselects the default teacher from the current classroom and falls back only to authorized staff', async () => {
        teacherUids.get('a').add(5);
        await accounts.insertOne({ _id: 5, uname: 'cpp-owner', priv: 2 });
        staffMembers.push({ workspaceId: 'a', uid: 5, role: 'teacher' });
        rooms[1].owner = 5;
        assert.equal((await model.peersFor(10, 'python')).defaultPeerUid, 2);
        assert.equal((await model.peersFor(10, 'cpp')).defaultPeerUid, 5);
        revoked.add(5);
        assert.equal((await model.peersFor(10, 'cpp')).defaultPeerUid, 2);
        revoked.add(2);
        const empty = await model.peersFor(10, 'cpp');
        assert.equal(empty.defaultPeerUid, null); assert.equal(empty.peers.length, 0);
    });

    it('orders teacher contacts by unread-online, unread-offline, online, then most recent contact', async () => {
        const extra = [13, 14, 15]; extra.forEach((uid) => studentUids.get('a').add(uid));
        await accounts.insertMany(extra.map((_id) => ({ _id, uname: `user${_id}`, priv: 2 })));
        await database.collection('domain.user').insertMany(extra.map((uid) => ({ uid, domainId: 'python', join: true, role: 'default' })));
        const time = new Date('2026-11-01T01:00:00Z').getTime();
        for (const [uid, age] of [[10, 0], [11, 5], [13, 1], [14, 3], [15, 4]]) {
            const value = await model.send(await pair(uid), uid, send(`from ${uid}`));
            await model.messages.updateOne({ _id: new ObjectId(value.message.id) }, { $set: { createdAt: new Date(time + age * 1000) } });
            if (uid >= 13) await model.acknowledge(await pair(2, uid), 2, value.message.id);
        }
        await model.connectPresence(10, 'python'); await model.connectPresence(13, 'python');
        const roster = await model.peersFor(2, 'python');
        assert.deepEqual(Array.from(roster.peers, (peer) => peer.uid), [10, 11, 13, 15, 14]);
        assert.equal(roster.unread, 2);
    });

    it('fresh roster filtering removes previews immediately when a cached student is removed or disabled', async () => {
        await model.send(await pair(), 10, send('private preview'));
        assert.ok((await model.peersFor(2, 'python')).peers.some((peer) => peer.uid === 10));
        await database.collection('domain.user').updateMany({ uid: 10 }, { $set: { join: false } });
        assert.equal((await model.peersFor(2, 'python')).peers.some((peer) => peer.uid === 10), false);
        await database.collection('domain.user').updateMany({ uid: 10 }, { $set: { join: true } });
        await workspace.collStudent.insertOne({ workspaceId: 'a', uid: 10, status: 'disabled' });
        assert.equal((await model.peersFor(2, 'python')).peers.some((peer) => peer.uid === 10), false);
    });

    it('serializes simultaneous sends, retries exactly once and keeps read cursors monotonic', async () => {
        const p = await pair();
        const values = await Promise.all(Array.from({ length: 10 }, (_, index) => model.send(p, 10, send(`text${index}`, `parallel_${index}`))));
        assert.equal(new Set(values.map((v) => v.message.seq)).size, 10);
        const duplicate = await Promise.all(Array.from({ length: 3 }, () => model.send(p, 10, send('same', 'duplicate_message'))));
        assert.equal(new Set(duplicate.map((v) => v.message.id)).size, 1);
        assert.equal(await model.messages.countDocuments({ conversation: p.id }), 11);
        const history = await model.page(p);
        assert.equal(history.messages[0].seq, 1); assert.equal(history.messages.at(-1).seq, 11);
        await model.acknowledge(p, 2, history.messages.at(-1).id);
        await model.acknowledge(p, 2, history.messages[0].id);
        assert.equal((await model.conversations.findOne({ _id: p.id })).read[2], 11);
    });

    it('freezes server title/content and exact code; forged titles never replace source content', async () => {
        const p = await pair();
        const value = await model.send(p, 10, { ...send(''), snapshot: { pid: 5, domainId: 'python',
            lang: 'py', code: 'print("draft")', title: 'FORGED', content: 'FORGED' } });
        documents[0].content = 'Changed tomorrow';
        const summary = (await model.page(p)).messages[0];
        assert.equal(summary.snapshot.content, undefined); assert.equal(summary.snapshot.code, undefined);
        assert.equal(summary.snapshot.codePreview, 'print("draft")');
        const stored = model.serialize((await model.authorizedMessage(2, 'python', value.message.id)).item, 'python', true);
        assert.equal(stored.snapshot.title, 'A + B'); assert.equal(stored.snapshot.content, 'Original question');
        assert.equal(stored.snapshot.code, 'print("draft")'); assert.equal(stored.id, value.message.id);
        await assert.rejects(model.send(p, 10, { ...send(''), snapshot: { pid: 6, domainId: 'python', lang: 'py', code: '' } }), err('FORBIDDEN'));
        const grant = await model.issueSnapshotGrant(10, 'python', 6);
        await model.send(p, 10, { ...send(''), snapshot: { pid: 6, domainId: 'python', lang: 'py', code: '', grant } });
        await assert.rejects(model.send(await pair(11), 11, { ...send(''), snapshot: { pid: 6, domainId: 'python', lang: 'py', code: '', grant } }), err('FORBIDDEN'));
    });

    it('paginates without loss and rejects a cursor from a different pair', async () => {
        const p = await pair(); const other = await pair(11);
        await model.send(p, 10, send('start'));
        const conversation = await model.conversations.findOne({ _id: p.id });
        await model.messages.insertMany(Array.from({ length: 60 }, (_, i) => ({ _id: new ObjectId(), conversation: p.id,
            seq: i + 2, from: 10, to: 2, clientId: `page_${i}`, text: `${i}`, kind: 'text', createdAt: new Date(), bytes: 100 })));
        const newest = await model.page(p); const older = await model.page(p, newest.messages[0].id);
        assert.equal(newest.messages.length, 50); assert.equal(newest.hasMore, true);
        assert.equal(older.messages.length, 11); assert.equal(older.hasMore, false);
        await assert.rejects(model.page(other, newest.messages[0].id), err('NOT_FOUND'));
        assert.ok(conversation);
    });

    it('prunes the oldest messages at 50MB and physically removes old attachment bytes', async () => {
        const p = await pair();
        const file = path.join(directory, 'document.txt'); fs.writeFileSync(file, 'private data');
        const old = await model.send(p, 10, send('file'), { filepath: file, originalFilename: '../document.txt' });
        const keep = await model.send(p, 10, send('recent'));
        await model.messages.updateOne({ _id: new ObjectId(old.message.id) }, { $set: { bytes: lib.CHAT_QUOTA_BYTES - 1024 } });
        await model.messages.updateOne({ _id: new ObjectId(keep.message.id) }, { $set: { bytes: 1024 } });
        const newest = await model.send(p, 10, send('newest'));
        for (let i = 0; i < 30 && await model.assets.countDocuments(); i++) {
            await new Promise((r) => setTimeout(r, 20)); await model.cleanupAttachments();
        }
        const history = await model.page(p);
        assert.equal(history.messages.length, 2); assert.equal(history.messages[0].id, keep.message.id);
        assert.equal(history.messages[1].id, newest.message.id); assert.ok(history.usedBytes <= lib.CHAT_QUOTA_BYTES);
        assert.equal(await storage.coll.countDocuments(), 0); assert.equal(await model.assets.countDocuments(), 0);
    });

    it('does not retrieve conversation history when a new message fits the remaining quota', async () => {
        const p = await pair(); await model.send(p, 10, send('previous'));
        await model.cleanupAttachments();
        const original = model.messages.find;
        model.messages.find = function (filter, ...args) {
            if (!filter.clientId && !filter._id) assert.notEqual(filter.conversation, p.id, 'ordinary sends must not fetch every history row');
            return original.call(this, filter, ...args);
        };
        try { await model.send(p, 10, send('fits')); }
        finally { model.messages.find = original; }
        assert.equal(await model.messages.countDocuments({ conversation: p.id }), 2);
    });

    it('streams a large quota prune in bounded batches and preserves the newest messages', async () => {
        const p = await pair(); const keeper = await model.send(p, 10, send('keep me'));
        await model.cleanupAttachments();
        await model.messages.updateOne({ _id: new ObjectId(keeper.message.id) },
            { $set: { seq: 2001, bytes: lib.CHAT_QUOTA_BYTES - 200_000 } });
        await model.conversations.updateOne({ _id: p.id }, { $set: { seq: 2001 } });
        await model.messages.insertMany(Array.from({ length: 2000 }, (_, i) => ({ _id: new ObjectId(), conversation: p.id,
            seq: i + 1, from: 10, to: 2, clientId: `older_${i}`, text: 'old', kind: 'text', createdAt: new Date(), bytes: 100 })));
        const originalFind = model.messages.find; const originalDelete = model.messages.deleteMany; const batches = [];
        model.messages.find = function (filter, ...args) {
            const cursor = originalFind.call(this, filter, ...args);
            if (filter.conversation === p.id) cursor.toArray = () => { throw new Error('pruning must stream rather than materialize history'); };
            return cursor;
        };
        model.messages.deleteMany = function (filter, ...args) {
            if (filter.conversation === p.id && filter._id?.$in) batches.push(filter._id.$in.length);
            return originalDelete.call(this, filter, ...args);
        };
        let sent;
        try {
            sent = await model.send(p, 10, { ...send(''), snapshot: { pid: 5, domainId: 'python', lang: 'py', code: '#'.repeat(64 * 1024) } });
        } finally { model.messages.find = originalFind; model.messages.deleteMany = originalDelete; }
        assert.ok(batches.length >= 3); assert.ok(batches.every((count) => count <= 256));
        assert.ok(sent.usedBytes <= lib.CHAT_QUOTA_BYTES);
        assert.ok(await model.messages.findOne({ _id: new ObjectId(keeper.message.id) }));
        const first = await model.messages.find({ conversation: p.id }).sort({ seq: 1 }).next();
        assert.ok(first.seq > 500 && first.seq < 2000);
        assert.equal(sent.message.seq, 2002);
    });

    it('retains deletion work after a storage failure and retries without leaking a live file', async () => {
        const p = await pair(); const file = path.join(directory, 'retry.txt'); fs.writeFileSync(file, 'private');
        const old = await model.send(p, 10, send(''), { filepath: file, originalFilename: 'retry.txt' });
        const doc = await model.messages.findOne({ _id: new ObjectId(old.message.id) });
        await model.assets.updateOne({ _id: doc.attachment.id }, { $set: { checkAfter: new Date(0) } });
        await model.cleanupAttachments(); assert.equal(await storage.coll.countDocuments(), 1);
        await model.messages.deleteOne({ _id: doc._id }); failDelete = true;
        await model.assets.updateOne({ _id: doc.attachment.id }, { $set: { checkAfter: new Date(0) } });
        await model.cleanupAttachments(); assert.equal(await model.assets.countDocuments(), 1);
        failDelete = false; await model.cleanupAttachments();
        assert.equal(await model.assets.countDocuments(), 0); assert.equal(await storage.coll.countDocuments(), 0);
    });

    it('recovers pruning interrupted before attachment deletion was queued', async () => {
        const p = await pair(); const file = path.join(directory, 'interrupted.txt'); fs.writeFileSync(file, 'private');
        const old = await model.send(p, 10, send(''), { filepath: file, originalFilename: 'interrupted.txt' });
        await model.messages.updateOne({ _id: new ObjectId(old.message.id) }, { $set: { removed: true } });
        for (let i = 0; i < 30 && await model.messages.countDocuments(); i++) {
            await model.cleanupAttachments(); await new Promise((r) => setTimeout(r, 20));
        }
        assert.equal(await model.messages.countDocuments(), 0);
        assert.equal(await model.assets.countDocuments(), 0); assert.equal(await storage.coll.countDocuments(), 0);
    });

    it('rewrites approved problem media to private snapshot URLs and never exposes storage paths', async () => {
        documents[0].content = '![图](file://diagram.png) [audio](file://lesson.mp3?download=1) ![bad](file://answer.txt)';
        documents[0].additional_file = [{ name: 'diagram.png' }, { name: 'lesson.mp3' }];
        await storage.coll.insertMany([
            { _id: 'image', path: 'problem/python/5/additional_file/diagram.png', size: 20, etag: 'original', 'Content-Type': 'image/png' },
            { _id: 'audio', path: 'problem/python/5/additional_file/lesson.mp3', size: 30, etag: 'audio-original', 'Content-Type': 'audio/mpeg' },
        ]);
        const value = await model.send(await pair(), 10, { ...send(''), snapshot: { pid: 5, domainId: 'python', lang: 'py', code: 'print(1)' } });
        const full = model.serialize((await model.authorizedMessage(2, 'python', value.message.id)).item, 'python', true);
        assert.match(full.snapshot.content, /\/class-chat\/snapshot\/[a-f0-9]+\/file\/diagram.png/);
        assert.equal(value.message.snapshot.media, undefined);
        assert.match(full.snapshot.content, /file:\/\/answer.txt/);
        assert.equal(JSON.stringify(value.message).includes('additional_file'), false);
        const h = handler(handlers.ClassChatSnapshotFileHandler, 2); h.args = { id: value.message.id, filename: 'diagram.png' };
        await h.prepare(); await h.get(); assert.equal(h.response.type, 'image/png');
        const stranger = handler(handlers.ClassChatSnapshotFileHandler, 11); stranger.args = h.args;
        await assert.rejects(stranger.get(), err('NOT_FOUND'));
        await storage.coll.updateOne({ _id: 'image' }, { $set: { etag: 'replacement' } });
        await assert.rejects(h.get(), err('NOT_FOUND'));
    });

    it('rejects oversized files/images and makes SVG an inert download', async () => {
        const p = await pair(); const large = path.join(directory, 'large.bin');
        fs.writeFileSync(large, Buffer.alloc(lib.CHAT_FILE_BYTES + 1));
        await assert.rejects(model.send(p, 10, send(''), { filepath: large, originalFilename: 'large' }), err('FILE_TOO_LARGE'));
        const image = path.join(directory, 'large.png'); const content = Buffer.alloc(lib.CHAT_IMAGE_BYTES + 1);
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(content); fs.writeFileSync(image, content);
        await assert.rejects(model.send(p, 10, send(''), { filepath: image, originalFilename: 'image.png' }), err('IMAGE_TOO_LARGE'));
        const svg = path.join(directory, 'image.svg'); fs.writeFileSync(svg, '<svg onload="alert(1)"></svg>');
        const stored = await model.send(p, 10, send(''), { filepath: svg, originalFilename: 'image.svg' });
        assert.equal(stored.message.kind, 'file'); assert.equal(stored.message.attachment.mime, 'application/octet-stream');
        assert.match(stored.message.attachment.url, /^\/d\/python\/class-chat\/attachment\/[a-f0-9]{24}$/);
    });

    it('shows online presence to teachers only, preserving another tab and expiring dropped connections', async () => {
        const first = await model.connectPresence(10, 'python');
        const second = await model.connectPresence(10, 'cpp');
        assert.equal((await model.peersFor(2, 'python')).peers.find((peer) => peer.uid === 10).online, true);
        assert.equal(Object.hasOwn((await model.peersFor(10, 'python')).peers[0], 'online'), false);
        assert.equal(await model.connectPresence(2, 'python'), null);
        await model.disconnectPresence(first);
        assert.equal((await model.peersFor(2, 'python')).peers.find((peer) => peer.uid === 10).online, true);
        await model.expirePresence(Date.now() + model.CHAT_PRESENCE_MS + 1);
        assert.equal((await model.peersFor(2, 'python')).peers.find((peer) => peer.uid === 10).online, false);
        await model.pulsePresence(second);
        assert.equal((await model.peersFor(2, 'python')).peers.find((peer) => peer.uid === 10).online, true);
        assert.ok(events.filter((event) => event.name === 'class-chat/presence').every((event) => Object.keys(event.value).length === 1
            && event.value.workspaceId === 'a'));
    });

    it('returns read receipts only for teacher outgoing messages and not in student JSON', async () => {
        const teacher = await pair(2, 10); const student = await pair();
        const reply = await model.send(teacher, 2, send('teacher reply'));
        assert.equal(reply.message.read, false);
        const studentMessage = await model.send(student, 10, send('student reply'));
        assert.equal(Object.hasOwn(studentMessage.message, 'read'), false);
        assert.ok((await model.page(student)).messages.every((message) => !Object.hasOwn(message, 'read')));
        await model.acknowledge(student, 10, reply.message.id);
        const teacherHistory = (await model.page(teacher)).messages;
        assert.equal(teacherHistory.find((message) => message.id === reply.message.id).read, true);
        assert.equal(Object.hasOwn(teacherHistory.find((message) => message.id === studentMessage.message.id), 'read'), false);
    });
});

function handler(Class = handlers.ClassChatHandler, uid = 10) {
    const h = new Class(); h.user = { _id: uid }; h.session = { _id: `login-${uid}` }; h.domain = { _id: 'python' };
    h.args = {}; h.UiContext = {}; h.request = { method: 'GET', host: 'onebyone.test', headers: {}, body: {}, files: {}, query: {} };
    h.response = { headers: {}, addHeader(name, value) { this.headers[name] = value; } };
    h.checkPriv = () => {}; h.limitRate = async () => {}; return h;
}
describe('chat HTTP security and transport', () => {
    it('saves independent teacher drafts and standards with revision checks, without altering the learner snapshot', async () => {
        const original = await model.send(await pair(), 10, { ...send(''), snapshot: { pid: 5, domainId: 'python', lang: 'cpp', code: 'student draft' } });
        const id = original.message.id;
        const content = { code: 'int main() {}', lang: 'cpp', annotations: solutionLib.emptyChatSolutionAnnotations() };
        const initial = await solutions.solutionState(2, 'python', id);
        assert.equal(initial.draft.code, 'student draft'); assert.equal(initial.draft.revision, 0); assert.equal(initial.standard, null);
        const changes = await Promise.allSettled([1, 2].map(() => solutions.saveDraft(2, 'python', id, content, 0)));
        assert.equal(changes.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(changes.find((result) => result.status === 'rejected').reason.code, 'CONFLICT');
        await solutions.saveStandard(2, 'python', id, content, 0);
        const another = await model.send(await pair(11), 11, { ...send(''), snapshot: { pid: 5, domainId: 'python', lang: 'cpp', code: 'different student' } });
        const loaded = await solutions.solutionState(2, 'python', another.message.id);
        assert.equal(loaded.draft.code, 'different student'); assert.equal(loaded.standard.code, content.code);
        assert.equal((await model.authorizedMessage(10, 'python', id)).item.snapshot.code, 'student draft');
        await assert.rejects(solutions.solutionState(10, 'python', id), err('FORBIDDEN'));
        await assert.rejects(solutions.solutionState(3, 'python', id), err('NOT_FOUND'));
        revoked.add(10);
        await assert.rejects(solutions.saveDraft(2, 'python', id, content, 1), err('FORBIDDEN'));
    });

    it('sends immutable annotated solutions only to the source learner and handles retries and private reads', async () => {
        const tid = '123456789012345678901234';
        const grant = await model.issueSnapshotGrant(10, 'python', 5, tid);
        const original = await model.send(await pair(), 10, { ...send(''), snapshot: { pid: 5, domainId: 'python', lang: 'cpp', code: 'student draft', tid, grant } });
        const annotations = solutionLib.emptyChatSolutionAnnotations();
        annotations.code.push({ id: 'code-note', editorId: 'code', start: 0, end: 3, quote: 'int', text: '入口', noteOpen: true, offsetX: 0, offsetY: 0 });
        const content = { code: 'int main() {}', lang: 'cpp', annotations };
        const teacher = handler(handlers.ClassChatHandler, 2);
        teacher.request.body = { snapshotId: original.message.id, content, clientId: 'solution_retry' };
        await teacher.postSolutionSend();
        const sent = teacher.response.body.message;
        assert.equal(sent.kind, 'solution'); assert.equal(sent.to, 10);
        assert.match(sent.snapshot.problemUrl, /\?tid=123456789012345678901234$/);
        assert.equal(sent.solution.annotationCount, 1);
        assert.equal(sent.solution.annotations, undefined);
        content.code = 'changed later';
        const full = (await model.authorizedMessage(10, 'python', sent.id)).item;
        assert.equal(full.snapshot.code, 'int main() {}');
        const view = handler(handlers.ClassChatSolutionHandler, 10); view.args.id = sent.id;
        await view.get();
        assert.equal(view.UiContext.classChatSolution.canEdit, false);
        assert.equal(view.UiContext.classChatSolution.draft.annotations.code[0].text, '入口');
        await assert.rejects(model.authorizedMessage(11, 'python', sent.id), err('NOT_FOUND'));
        content.code = 'int main() {}';
        await teacher.postSolutionSend();
        assert.equal(teacher.response.body.message.id, sent.id);
        await assert.rejects(model.sendSolution(10, 'python', original.message.id, content, 'student_forgery'), err('FORBIDDEN'));
        const forged = { ...send(''), snapshot: { pid: 5, domainId: 'python', lang: 'cpp', code: '', tid: '999999999999999999999999', grant } };
        await assert.rejects(model.send(await pair(), 10, forged), err('FORBIDDEN'));
        assert.equal(lib.chatPreview(full), '老师讲解 · A + B');
    });

    it('freezes trusted learner C++ mode and falls back to the learner for old snapshots, leaving the teacher preference intact', async () => {
        await accounts.updateOne({ _id: 2 }, { $set: { cppEditorMode: 'proficient' } });
        await accounts.updateOne({ _id: 10 }, { $set: { cppEditorMode: 'beginner' } });
        const grant = await model.issueSnapshotGrant(10, 'python', 5, undefined, 'beginner');
        const original = await model.send(await pair(), 10, { ...send(''), snapshot: {
            pid: 5, domainId: 'python', lang: 'cc', code: 'cout << 42;', grant, cppEditorMode: 'proficient',
        } });
        assert.equal(original.message.snapshot.cppEditorMode, 'beginner');
        assert.equal(await solutions.executionMode(2, 'python', 5, original.message.id), 'beginner');
        await accounts.updateOne({ _id: 10 }, { $set: { cppEditorMode: 'preset' } });
        assert.equal(await solutions.executionMode(2, 'python', 5, original.message.id), 'beginner');
        await model.messages.updateOne({ _id: new ObjectId(original.message.id) }, { $unset: { 'snapshot.cppEditorMode': '' } });
        assert.equal(await solutions.executionMode(2, 'python', 5, original.message.id), 'preset');
        await assert.rejects(solutions.executionMode(2, 'python', 6, original.message.id), err('FORBIDDEN'));
        await assert.rejects(solutions.executionMode(2, 'cpp', 5, original.message.id), err('FORBIDDEN'));
        assert.equal((await accounts.findOne({ _id: 2 })).cppEditorMode, 'proficient');
    });

    it('cleans orphaned private drafts after source quota removal while retaining reusable standards', async () => {
        const original = await model.send(await pair(), 10, { ...send(''), snapshot: { pid: 5, domainId: 'python', lang: 'cc', code: 'student' } });
        const content = { code: 'int main() {}', lang: 'cc', annotations: solutionLib.emptyChatSolutionAnnotations() };
        await solutions.saveDraft(2, 'python', original.message.id, content, 0);
        await solutions.saveStandard(2, 'python', original.message.id, content, 0);
        await solutions.cleanupDrafts();
        assert.equal(await solutions.drafts.countDocuments({}), 1);
        await model.messages.deleteOne({ _id: new ObjectId(original.message.id) });
        await solutions.cleanupDrafts();
        assert.equal(await solutions.drafts.countDocuments({}), 0);
        assert.equal(await solutions.standards.countDocuments({}), 1);
    });

    it('rejects oversized, malformed or executable-looking annotation structures without exposing other drafts', () => {
        const value = { code: 'int main() {}', lang: 'cpp', annotations: solutionLib.emptyChatSolutionAnnotations() };
        for (const annotations of [{ version: 1, text: {}, code: [], ink: [] }, { ...value.annotations, code: Array(41).fill({}) },
            { ...value.annotations, ink: [{ id: 'bad', anchor: { kind: 'element', key: 'statement', path: [] },
                reference: [1, 0, 0, 1, 0, 0], points: [[Infinity, 1]] }] }]) {
            assert.throws(() => solutionLib.validateChatSolution({ ...value, annotations }), err('INVALID_SOLUTION'));
        }
    });

    it('preserves optional drawing content anchors through drafts, standards and frozen solution messages, including old artifacts', async () => {
        const json = (value) => JSON.parse(JSON.stringify(value));
        const original = await model.send(await pair(), 10, { ...send(''), snapshot: {
            pid: 5, domainId: 'python', lang: 'cc', code: 'line one\nline two\nline three',
        } });
        for (const anchored of [false, true]) {
            const annotations = solutionLib.emptyChatSolutionAnnotations();
            annotations.ink.push(
                { id: 'element-stroke', anchor: { kind: 'element', key: 'statement', path: [0], ...(anchored ? { mode: 'scroll', textOffset: 12 } : {}) },
                    reference: [1, 0, 0, 1, 25, 60], points: [[5, 8], [16, 19]] },
                { id: 'editor-stroke', anchor: { kind: 'editor', editorId: 'code', ...(anchored ? { offset: 9 } : {}) },
                    reference: [1, 0, 0, 1, 40, 120], points: [[1, 2], [12, 18]],
                    note: { text: '这一行', x: 15, y: 25, width: 96, height: 36 } },
            );
            const content = { code: 'line one\nline two\nline three', lang: 'cc', annotations };
            const revision = anchored ? 1 : 0;
            await solutions.saveDraft(2, 'python', original.message.id, content, revision);
            await solutions.saveStandard(2, 'python', original.message.id, content, revision);
            const state = await solutions.solutionState(2, 'python', original.message.id);
            assert.deepEqual(json(state.draft.annotations), json(annotations));
            assert.deepEqual(json(state.standard.annotations), json(annotations));
            assert.deepEqual(json((await solutions.loadStandard(2, 'python', original.message.id)).annotations), json(annotations));
            const result = await model.sendSolution(2, 'python', original.message.id, content, `anchor_roundtrip_${anchored}`);
            const view = handler(handlers.ClassChatSolutionHandler, 10); view.args.id = result.message.id;
            await view.get();
            assert.deepEqual(json(view.UiContext.classChatSolution.draft.annotations), json(annotations));
            assert.equal(view.UiContext.classChatSolution.canEdit, false);
            content.annotations.ink[1].anchor.offset = 0;
            content.annotations.ink[0].anchor.textOffset = 0;
            const stored = (await model.authorizedMessage(10, 'python', result.message.id)).item;
            assert.equal(stored.solution.annotations.ink[1].anchor.offset, anchored ? 9 : undefined);
            assert.equal(stored.solution.annotations.ink[0].anchor.textOffset, anchored ? 12 : undefined);
        }
    });

    it('validates content-anchor modes and offsets without loosening drawing identity or size bounds', () => {
        const stroke = { id: 'editor-stroke', anchor: { kind: 'editor', editorId: 'code', offset: 0 },
            reference: [1, 0, 0, 1, 0, 0], points: [[1, 2]] };
        const value = { code: 'line one\nline two', lang: 'cc', annotations: solutionLib.emptyChatSolutionAnnotations() };
        const check = (anchor) => solutionLib.validateChatSolution({ ...value, annotations: { ...value.annotations, ink: [{ ...stroke, anchor }] } });
        for (const offset of [-1, 0.5, NaN, Infinity, '0', null, value.code.length + 1, 1_000_001]) {
            assert.throws(() => check({ kind: 'editor', editorId: 'code', offset }), err('INVALID_SOLUTION'));
        }
        for (const mode of ['', 'fixed', null, 1]) {
            assert.throws(() => check({ kind: 'element', key: 'statement', path: [], mode }), err('INVALID_SOLUTION'));
        }
        for (const textOffset of [-1, 0.5, NaN, Infinity, '0', null, 1_000_001]) {
            assert.throws(() => check({ kind: 'element', key: 'statement', path: [], textOffset }), err('INVALID_SOLUTION'));
        }
        for (const textOffset of [0, 1_000_000]) {
            assert.equal(check({ kind: 'element', key: 'statement', path: [], textOffset }).annotations.ink[0].anchor.textOffset, textOffset);
        }
        for (const mode of ['element', 'scroll', 'svg']) {
            assert.equal(check({ kind: 'element', key: 'statement', path: [], mode }).annotations.ink[0].anchor.mode, mode);
        }
        assert.equal(check({ kind: 'editor', editorId: 'code', offset: value.code.length }).annotations.ink[0].anchor.offset, value.code.length);
        assert.equal(check({ kind: 'editor', editorId: 'code', offset: 0 }).annotations.ink[0].anchor.offset, 0);
        assert.equal(check({ kind: 'editor', editorId: 'code', mode: 'fixed' }).annotations.ink[0].anchor.mode, undefined);
        assert.equal(check({ kind: 'editor', editorId: 'code', textOffset: 12 }).annotations.ink[0].anchor.textOffset, undefined);
        assert.equal(check({ kind: 'element', key: 'statement', path: [], offset: -1 }).annotations.ink[0].anchor.offset, undefined);
        assert.throws(() => check({ kind: 'editor', editorId: 'other', offset: 0 }), err('INVALID_SOLUTION'));
        assert.throws(() => solutionLib.validateChatSolution({ ...value, annotations: { ...value.annotations,
            ink: [{ ...stroke, id: 'bad' }] } }), err('INVALID_SOLUTION'));
        assert.throws(() => solutionLib.validateChatSolution({ ...value, annotations: { ...value.annotations,
            ink: Array.from({ length: 33 }, (_, i) => ({ ...stroke, id: `stroke_${i}` })) } }), err('INVALID_SOLUTION'));
        const oversized = { ...value.annotations, ink: Array.from({ length: 32 }, (_, i) => ({
            ...stroke, id: `stroke_${i}`, points: Array.from({ length: 2048 }, () => [9999, 9999]),
        })) };
        assert.throws(() => solutionLib.validateChatSolution({ ...value, annotations: oversized }), err('INVALID_SOLUTION'));
    });
    it('student read acknowledgements notify the teacher, while teacher reading does not notify students', async () => {
        const reply = await model.send(await pair(2, 10), 2, send('teacher reply'));
        const student = handler(); student.request.body = { peerUid: 2, domainId: 'python', through: reply.message.id };
        events = []; await student.postRead();
        assert.ok(events.some((event) => event.value.uid === 2));
        const reply2 = await model.send(await pair(), 10, send('student reply'));
        const teacher = handler(handlers.ClassChatHandler, 2); teacher.request.body = { peerUid: 10, domainId: 'python', through: reply2.message.id };
        events = []; await teacher.postRead();
        assert.ok(events.every((event) => event.value.uid === 2));
    });

    it('presence invalidation is delivered only to teachers in the matching workspace', async () => {
        const build = (uid) => {
            const h = handler(handlers.ClassChatConnectionHandler, uid); h.request.headers.origin = 'https://onebyone.test';
            h.frames = []; h.send = (frame) => h.frames.push(frame); h.ctx = { interval() {} }; h.close = () => {};
            return h;
        };
        const teacher = build(2); const student = build(10);
        await teacher.prepare(); await student.prepare(); teacher.frames = []; student.frames = [];
        await teacher.onPresence({ workspaceId: 'a' }); await student.onPresence({ workspaceId: 'a' });
        assert.deepEqual(JSON.parse(JSON.stringify(teacher.frames)), [{ type: 'changed' }]);
        assert.equal(student.frames.length, 0); teacher.frames = [];
        await teacher.onPresence({ workspaceId: 'b' }); assert.equal(teacher.frames.length, 0);
        await student.cleanup(); await teacher.cleanup();
    });
    it('never copies message contents, code snapshots or file names into general operation logs', () => {
        const h = handler(); h.request.originalPath = '/d/python/class-chat';
        const args = { operation: 'send', peerUid: 2, domainId: 'python', text: 'private', snapshot: { code: 'secret' },
            filename: 'private-name.txt', clientId: 'random' };
        handlers.redactClassChatLog('slow_request', h, args);
        assert.deepEqual(args, { operation: 'send', peerUid: 2, domainId: 'python' });
    });
    it('offers problem snapshots on practice, contest/homework and submission editors only', async () => {
        for (const [page, template] of [['/d/python/p/5', 'problem_detail.html'], ['/p/5', 'problem_detail.html'],
            ['/d/python/p/5/submit', 'problem_submit.html'], ['/p/5/edit', 'problem_edit.html'], ['/p/5/solution', 'problem_solution.html']]) {
            const h = handler(); h.UiContext = {}; h.user.hasPriv = () => true;
            h.request.originalPath = page; h.response.template = template;
            h.response.body = { pdoc: documents[0], tdoc: { docId: new ObjectId(), rule: 'homework' } };
            h.url = (name) => `/d/python/${name}`;
            await handlers.injectClassChat(h);
            assert.equal(h.UiContext.classChat.enabled, true);
            assert.equal(!!h.UiContext.classChat.problem, ['problem_detail.html', 'problem_submit.html'].includes(template));
            if (h.UiContext.classChat.problem) assert.ok(await model.grants.findOne({ _id: h.UiContext.classChat.problem.grant, uid: 10, pid: 5 }));
        }
    });
    it('does not accept a logged-out or impersonated session', async () => {
        const h = handler(); logins.delete('login-10'); await assert.rejects(h.prepare(), err('FORBIDDEN'));
        logins.set('login-10', { uid: 10, sudoUid: 2, expireAt: new Date(Date.now() + 60000) });
        await assert.rejects(h.prepare(), err('FORBIDDEN'));
    });
    it('uses explicit peer classroom query and keeps file downloads private with nosniff', async () => {
        const p = await pair(); const file = path.join(directory, 'private.html'); fs.writeFileSync(file, '<script>alert(1)</script>');
        const value = await model.send(p, 10, send(''), { filepath: file, originalFilename: 'private.html' });
        const h = handler(handlers.ClassChatAttachmentHandler, 2); h.args.id = value.message.id;
        await h.prepare(); await h.get();
        assert.equal(h.response.type, 'application/octet-stream'); assert.equal(h.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(h.response.headers['X-Content-Type-Options'], 'nosniff'); assert.match(h.response.disposition, /^attachment;/);
        const stranger = handler(handlers.ClassChatAttachmentHandler, 11); stranger.args.id = value.message.id;
        await assert.rejects(stranger.get(), err('NOT_FOUND'));
        const index = handler(); index.args = { peerUid: 2, domainId: 'other' }; index.request.query.domainId = 'cpp';
        await index.get(); assert.equal(index.response.body.messages.length, 1);
    });
    it('emits metadata only and snapshot view cannot leak to a third student', async () => {
        const h = handler(); h.request.method = 'POST'; h.request.body = { ...send('secret'), peerUid: 2, domainId: 'python' };
        await h.prepare(); await h.postSend();
        assert.equal(events.length, 2); assert.equal(JSON.stringify(events).includes('secret'), false);
        const snapshot = await model.send(await pair(), 10, { ...send(''), snapshot: { pid: 5, domainId: 'python', lang: 'cpp', code: 'return 0;' } });
        const view = handler(handlers.ClassChatSnapshotHandler, 2); view.args.id = snapshot.message.id;
        await view.prepare(); assert.equal(view.response.type, 'application/json');
        await view.get(); assert.equal(view.response.redirect, `/d/python/class-chat/solution/${snapshot.message.id}`);
        const solution = handler(handlers.ClassChatSolutionHandler, 2); solution.args.id = snapshot.message.id;
        await solution.prepare(); await solution.get();
        assert.equal(solution.response.template, 'class_chat_solution.html');
        assert.equal(solution.response.type, undefined, 'framework/base.ts only renders templates when response.type is empty');
        assert.equal(solution.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(solution.response.body.snapshot.code, 'return 0;');
        assert.equal(solution.UiContext.classChatSolution.canEdit, true);
        const stranger = handler(handlers.ClassChatSnapshotHandler, 11); stranger.args.id = snapshot.message.id;
        await assert.rejects(stranger.get(), err('NOT_FOUND'));
    });
});
