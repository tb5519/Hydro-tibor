const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '../packages/hydrooj/src');
const plain = (value) => JSON.parse(JSON.stringify(value));
const PRIV = { PRIV_USER_PROFILE: 1, PRIV_VIEW_ALL_DOMAIN: 2, PRIV_MANAGE_ALL_DOMAIN: 4 };
const PERM = { PERM_ALL: 15n, PERM_EDIT_DOMAIN: 2n };
let mongod;
let client;
let database;
let domain;
let users;
let workspace;
let membership;
let options;
let commands;

class ValidationError extends Error {
    constructor(...params) {
        super(params[2] || 'Validation failed');
        this.params = params;
    }
}

function load(filename, dependencies, source) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(source || fs.readFileSync(path.join(root, filename), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, {
        module, exports: module.exports, global: { Hydro: { model: {} } }, Date,
        require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
    });
    return module.exports;
}

function account(uid = 20, extra = {}) {
    return { _id: uid, uname: `student-${uid}`, unameLower: `student-${uid}`, mail: `${uid}@test.invalid`,
        mailLower: `${uid}@test.invalid`, salt: '', hash: '', priv: PRIV.PRIV_USER_PROFILE, ip: [], ...extra };
}

async function addDomains(ids, uid = 20, extra = {}) {
    await domain.coll.insertMany(ids.map((id) => ({ _id: id, lower: id, name: id, owner: 10, roles: {}, ...extra })));
    await domain.collUser.insertMany(ids.map((domainId) => ({ domainId, uid, join: true, role: 'default' })));
}

async function privateUser(uid = 20, extra = {}) {
    return new users.User(account(uid, extra), { domainId: 'system', perm: PERM.PERM_ALL }).private();
}

const ids = (user) => Array.from(user.domains, (item) => item._id);
const writes = () => commands.filter((name) => ['insert', 'update', 'delete', 'findAndModify'].includes(name));

before(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri(), { monitorCommands: true });
    database = client.db('joined_domains_test');
    client.on('commandStarted', (event) => {
        if (event.databaseName === database.databaseName) commands?.push(event.commandName);
    });
});

beforeEach(async () => {
    await database.dropDatabase();
    commands = [];
    options = { 'workspace.enabled': false, 'workspace.platformAdminUids': [] };
    const userRef = { __esModule: true, default: null, deleteUserCache: null };
    const domainRef = { __esModule: true };
    const listeners = new Map();
    const bus = { on: (event, callback) => listeners.set(event, callback), parallel: async () => {},
        broadcast: (event, value) => listeners.get(event)?.(value) };
    const db = { collection: (name) => database.collection(name),
        ensureIndexes: (collection, ...indexes) => collection.createIndexes(indexes) };
    const system = { get: (key) => options[key] };
    const utils = {
        ArgMethod: () => {}, randomstring: () => 'random', buildProjection: () => ({}),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    };
    const domainModule = load('model/domain.ts', {
        '../service/db': db, '../service/bus': bus, '../utils': utils,
        '../lib/domain_type': { getDomainType: (doc) => doc.domainType || 'oj' },
        './builtin': { PRIV, BUILTIN_ROLES: { guest: 0n, default: 1n, root: PERM.PERM_ALL } }, './user': userRef,
    });
    domain = domainModule.default;
    Object.assign(domainRef, domainModule);
    workspace = load('model/workspace.ts', {
        '../service/db': db, './builtin': { PRIV }, './system': system, './domain': domainRef,
    }).default;
    const userModule = load('model/user.ts', {
        '../error': { UserNotFoundError: class extends Error {} },
        '../lib/avatar': () => 'avatar', '../lib/hash.hydro': async () => 'hash',
        '../lib/student_level': { normalizeStudentLevel: () => 1 },
        '../service/bus': bus, '../service/db': db, '../utils': utils,
        './builtin': { PERM, PRIV }, './domain': domainRef, './system': system, './token': {}, './workspace': workspace,
        './setting': { SETTINGS_BY_KEY: { pinnedDomains: { value: [], flag: 0 } }, DOMAIN_USER_SETTINGS_BY_KEY: {} },
    });
    users = userModule.default;
    Object.assign(userRef, userModule);
    membership = load('lib/domain_membership.ts', {
        '../error': { ValidationError },
        '../model/domain': { __esModule: true, default: domain },
        '../model/user': { __esModule: true, default: users },
        '../utils': { sleep: utils.sleep },
    });
    await domainModule.apply({ on: bus.on });
    await users.coll.insertOne(account());
    commands = [];
});

after(async () => {
    await client?.close();
    await mongod?.stop();
});

describe('student domain membership invariants', () => {
    it('creates a managed account in only its selected initial domain while preserving the legacy default', async () => {
        await domain.coll.insertMany(['class-only', 'system'].map((id) => ({
            _id: id, lower: id, name: id, roles: {},
        })));
        const managedUid = await users.createInDomain(
            'class-only', 'managed@test.invalid', 'managed', 'password', 30,
        );
        const legacyUid = await users.create('legacy@test.invalid', 'legacy', 'password', 31);
        assert.equal(managedUid, 30);
        assert.equal(legacyUid, 31);
        assert.deepEqual(
            (await domain.collUser.find({ uid: managedUid, join: true }).toArray()).map((item) => item.domainId),
            ['class-only'],
        );
        assert.equal((await users.coll.findOne({ _id: managedUid })).defaultDomain, 'class-only');
        assert.deepEqual(
            (await domain.collUser.find({ uid: legacyUid, join: true }).toArray()).map((item) => item.domainId),
            ['system'],
        );
        assert.equal((await users.coll.findOne({ _id: legacyUid })).defaultDomain, 'system');
    });

    it('rejects removal of the only joined domain with a clear message and performs no mutation', async () => {
        await addDomains(['class-only']);
        await users.coll.updateOne({ _id: 20 }, { $set: { defaultDomain: 'class-only' } });
        let mutated = false;
        await assert.rejects(
            membership.withDomainMembershipRemoval([20], ['class-only'], async () => {
                mutated = true;
                await domain.setJoin('class-only', 20, false);
            }, 'uids'),
            (error) => error instanceof ValidationError
                && error.message === '学员至少保留一个域，请先加入其他域后再移除。',
        );
        assert.equal(mutated, false);
        assert.equal((await domain.collUser.findOne({ domainId: 'class-only', uid: 20 })).join, true);
    });

    it('moves the login default to an actually joined fallback after removal', async () => {
        await addDomains(['class-a', 'class-b']);
        await users.coll.updateOne({ _id: 20 }, { $set: { defaultDomain: 'class-a' } });
        await membership.withDomainMembershipRemoval([20], ['class-a'], async () => {
            await domain.setJoin('class-a', 20, false);
        }, 'uids');
        assert.equal((await domain.collUser.findOne({ domainId: 'class-a', uid: 20 })).join, false);
        assert.equal((await domain.collUser.findOne({ domainId: 'class-b', uid: 20 })).join, true);
        assert.equal((await users.coll.findOne({ _id: 20 })).defaultDomain, 'class-b');
    });

    it('serializes concurrent removals so two domains cannot both become unjoined', async () => {
        await addDomains(['class-a', 'class-b']);
        await users.coll.updateOne({ _id: 20 }, { $set: { defaultDomain: 'class-a' } });
        const remove = (domainId, delayMs) => membership.withDomainMembershipRemoval(
            [20], [domainId], async () => {
                if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
                await domain.setJoin(domainId, 20, false);
            }, 'uids',
        );
        const results = await Promise.allSettled([
            remove('class-a', 75),
            remove('class-b', 0),
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
        const joined = await domain.collUser.find({ uid: 20, join: true }).toArray();
        assert.equal(joined.length, 1);
        assert.equal((await users.coll.findOne({ _id: 20 })).defaultDomain, joined[0].domainId);
        assert.equal((await users.coll.findOne({ _id: 20 }))._domainMembershipLock, undefined);
    });
});

describe('joined domains are the authoritative automatic favorites', () => {
    it('shows every existing membership beyond ten and preserves old favorites first without migrating accounts', async () => {
        const joined = Array.from({ length: 15 }, (_, index) => `class-${String(index).padStart(2, '0')}`);
        await addDomains(joined);
        await domain.coll.updateOne({ _id: 'class-12' }, { $set: {
            bulletin: 'large private domain bulletin', host: ['internal.invalid'], _join: { code: 'secret' },
            avatar: 'test-avatar', domainType: 'scratch',
        } });
        await addDomains(['another-student'], 21);
        await domain.collUser.insertOne({ domainId: 'deleted-domain', uid: 20, join: true });
        await domain.coll.insertOne({ _id: 'left-domain', lower: 'left-domain', name: 'left', roles: {} });
        await domain.collUser.insertOne({ domainId: 'left-domain', uid: 20, join: false });
        const storedPins = ['class-12', 'deleted-domain', 'class-04', 'another-student', 'left-domain'];
        await users.coll.updateOne({ _id: 20 }, { $set: { pinnedDomains: storedPins } });
        commands = [];
        const current = await privateUser(20, { pinnedDomains: storedPins, domains: [{ _id: 'obsolete-domain' }] });
        assert.deepEqual(ids(current), ['class-12', 'class-04', ...joined.filter((id) => !storedPins.includes(id))]);
        assert.deepEqual(Array.from(current.pinnedDomains), ids(current));
        assert.deepEqual(writes(), []);
        assert.equal(commands.filter((name) => name === 'distinct').length, 1);
        assert.equal(commands.filter((name) => name === 'find').length, 1, 'all domains are loaded by one batch query');
        assert.deepEqual((await users.coll.findOne({ _id: 20 })).pinnedDomains, storedPins);
        assert.deepEqual(Array.from(current.serialize().pinnedDomains), ids(current));
        assert.deepEqual(plain(current.domains[0]), {
            _id: 'class-12', name: 'class-12', owner: 10, avatar: 'test-avatar', domainType: 'scratch',
        }, 'menu metadata never includes domain roles, hosts, invitation settings or bulletin');
    });

    it('automatically includes a new self-join, teacher-added member, and owned domain without storing pins', async () => {
        await domain.coll.insertMany(['self-join', 'teacher-added'].map((id) => ({ _id: id, lower: id, name: id, roles: {} })));
        const cached = new users.User(account(), { domainId: 'system', perm: PERM.PERM_ALL });
        assert.deepEqual(ids(await cached.private()), []);
        await domain.setJoin('self-join', 20, true);
        await domain.setUserRole('teacher-added', 20, 'default', true);
        await domain.add('new-owner-domain', 20, 'Mine', '');
        const current = await cached.private();
        assert.deepEqual(ids(current), ['new-owner-domain', 'self-join', 'teacher-added']);
        assert.deepEqual(Array.from(current.pinnedDomains), ids(current));
        assert.equal((await users.coll.findOne({ _id: 20 })).pinnedDomains, undefined);
    });

    it('removes left and deleted domains immediately even when the user object and old pins were cached', async () => {
        await addDomains(['keep', 'leave', 'delete']);
        const cached = new users.User(account(20, { pinnedDomains: ['leave', 'delete'] }), { domainId: 'system' });
        assert.equal((await cached.private()).domains.length, 3);
        await domain.setJoin('leave', 20, false);
        await domain.del('delete');
        commands = [];
        const current = await cached.private();
        assert.deepEqual(ids(current), ['keep']);
        assert.deepEqual(Array.from(current.pinnedDomains), ['keep']);
        assert.deepEqual(writes(), []);
    });

    it('does not treat a role-only relation or a stale favorite as joining, and never queries for guests', async () => {
        await domain.coll.insertOne({ _id: 'role-only', lower: 'role-only', roles: {} });
        await domain.collUser.insertOne({ domainId: 'role-only', uid: 20, role: 'root' });
        assert.deepEqual(ids(await privateUser(20, { pinnedDomains: ['role-only'] })), []);
        commands = [];
        const guest = await privateUser(0, { pinnedDomains: ['role-only'], domains: [{ _id: 'stale' }] });
        assert.deepEqual(ids(guest), []);
        assert.deepEqual(Array.from(guest.pinnedDomains), []);
        assert.deepEqual(commands, []);
    });

    it('matches modern workspace boundaries while excluding retained system and legacy membership', async () => {
        options['workspace.enabled'] = true;
        await addDomains(['system', 'legacy']);
        await addDomains(['modern-a'], 20, { workspaceId: 'teacher-a' });
        await addDomains(['modern-b'], 20, { workspaceId: 'teacher-b' });
        await addDomains(['not-joined-a'], 21, { workspaceId: 'teacher-a' });
        await workspace.collStudent.insertOne({ workspaceId: 'teacher-a', uid: 20, status: 'active' });
        const current = await privateUser(20, { pinnedDomains: ['system', 'not-joined-a', 'modern-b'] });
        assert.deepEqual(ids(current), ['modern-b', 'modern-a']);
        assert.deepEqual(Array.from(current.pinnedDomains), ids(current));
        await domain.setJoin('modern-b', 20, false);
        assert.deepEqual(ids(await privateUser()), ['modern-a']);
    });

    it('honors active staff assignment even without a joined modern domain, and disabled records do not hide legacy domains', async () => {
        options['workspace.enabled'] = true;
        await addDomains(['system', 'legacy']);
        await workspace.collMember.insertOne({ workspaceId: 'teacher-a', uid: 20, status: 'active' });
        assert.deepEqual(ids(await privateUser()), []);
        await workspace.collMember.updateOne({ uid: 20 }, { $set: { status: 'disabled' } });
        await workspace.collStudent.insertOne({ workspaceId: 'teacher-b', uid: 20, status: 'disabled' });
        assert.deepEqual(ids(await privateUser()), ['legacy', 'system']);
    });

    it('keeps the middleware bypass for platform administrators, built-in uid 1 and disabled workspaces without granting memberships', async () => {
        options['workspace.enabled'] = true;
        options['workspace.platformAdminUids'] = [20];
        await addDomains(['system', 'legacy']);
        await addDomains(['modern'], 20, { workspaceId: 'teacher-a' });
        await addDomains(['unjoined'], 21, { workspaceId: 'teacher-b' });
        assert.deepEqual(ids(await privateUser()), ['legacy', 'modern', 'system']);
        await domain.collUser.insertMany(['legacy', 'modern'].map((domainId) => ({ domainId, uid: 1, join: true })));
        assert.deepEqual(ids(await privateUser(1)), ['legacy', 'modern']);
        options['workspace.platformAdminUids'] = [];
        options['workspace.enabled'] = false;
        assert.deepEqual(ids(await privateUser()), ['legacy', 'modern', 'system']);
    });

    it('uses a constant number of batch reads for modern accounts and has a membership lookup index', async () => {
        options['workspace.enabled'] = true;
        await addDomains(['modern-0'], 20, { workspaceId: 'teacher-a' });
        commands = [];
        await privateUser();
        const initialReads = commands.length;
        await addDomains(Array.from({ length: 24 }, (_, index) => `modern-${index + 1}`), 20, { workspaceId: 'teacher-a' });
        commands = [];
        const current = await privateUser();
        assert.equal(current.domains.length, 25);
        assert.equal(commands.length, initialReads);
        assert.deepEqual(writes(), []);
        const index = (await domain.collUser.indexes()).find((entry) => entry.name === 'joined_domains');
        assert.deepEqual(index.key, { uid: 1, join: 1, domainId: 1 });
    });
});

describe('domain list and legacy favorites endpoint', () => {
    function handlerFor(current) {
        const source = fs.readFileSync(path.join(root, 'handler/home.ts'), 'utf8');
        const from = source.indexOf('class HomeDomainHandler');
        const to = source.indexOf('class HomeDomainCreateHandler', from);
        const prelude = `const { Handler, domain, user, PRIV, PERM, query, param, Types, NotFoundError, BadRequestError } = require('test-dependencies');\n`;
        class NotFoundError extends Error {}
        const HandlerClass = load('', { 'test-dependencies': {
            Handler: class {}, domain, user: users, PRIV, PERM, query: () => () => {}, param: () => () => {}, Types: {},
            NotFoundError, BadRequestError: class extends Error {},
        } }, `${prelude}${source.slice(from, to)}\nmodule.exports = HomeDomainHandler;`);
        const handler = new HandlerClass();
        handler.user = current;
        handler.response = {};
        handler.checkPriv = (priv) => assert.ok(current.hasPriv(priv));
        handler.back = (body) => { handler.response.body = body; };
        return { handler, NotFoundError };
    }

    it('reuses the same complete joined list, while all-domain management does not favorite unjoined domains', async () => {
        await addDomains(['joined']);
        await addDomains(['not-joined'], 21);
        const current = await privateUser(20, { priv: 7 });
        const { handler } = handlerFor(current);
        commands = [];
        await handler.get({}, false);
        assert.deepEqual(Array.from(handler.response.body.ddocs, (item) => item._id), ['joined']);
        assert.deepEqual(commands, [], 'the normal list reuses private user membership data');
        await handler.get({}, true);
        assert.deepEqual(handler.response.body.ddocs.map((item) => item._id).sort(), ['joined', 'not-joined']);
        assert.deepEqual(Array.from(current.pinnedDomains), ['joined']);
    });

    it('keeps joined domains automatically favorited for old clients without allowing stale or unrelated pins', async () => {
        await addDomains(['joined']);
        await addDomains(['not-joined'], 21);
        const current = await privateUser();
        const { handler, NotFoundError } = handlerFor(current);
        commands = [];
        for (const star of [true, false]) {
            await handler.postStar({}, 'joined', star);
            assert.deepEqual(plain(handler.response.body), { star: true });
        }
        for (const id of ['not-joined', 'deleted']) await assert.rejects(handler.postStar({}, id, true), NotFoundError);
        assert.deepEqual(commands, [], 'the compatibility endpoint must not write pins or query foreign domains');
    });
});
