const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { before, beforeEach, after, describe, it } = require('node:test');
const { buildSync } = require('esbuild');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/domain.ts'), 'utf8');
const modelSource = fs.readFileSync(path.join(root, 'packages/hydrooj/src/model/domain.ts'), 'utf8');
const section = (text, start, end) => {
    const from = text.indexOf(start);
    const to = text.indexOf(end, from);
    assert(from >= 0 && to > from, `Missing source section ${start}`);
    return text.slice(from, to);
};
const handlerSource = `
    import { param } from './framework/framework/decorators';
    import { Types } from './framework/framework/validator';
    import { CreateError, ForbiddenError, NotFoundError, ValidationError, CsrfTokenError } from './framework/framework/error';
    const DomainJoinForbiddenError = CreateError('DomainJoinForbiddenError', ForbiddenError);
    const DomainJoinAlreadyMemberError = CreateError('DomainJoinAlreadyMemberError', ForbiddenError);
    const InvalidJoinInvitationCodeError = CreateError('InvalidJoinInvitationCodeError', ForbiddenError);
    class DomainModel {
        static JOIN_METHOD_NONE = 0;
        ${section(modelSource, '    static getJoinSettings(', '    @ArgMethod\n    static async getPrefixSearch')}
    }
    ${section(source, 'class ManageHandler extends Handler', 'const DOMAIN_RANKING_MODES')}
    ${section(source, 'class DomainJoinApplicationsHandler', 'class DomainAddStudentHandler')}
    ${section(source, 'class DomainJoinHandler', 'export const DomainApi')}
    export { DomainJoinApplicationsHandler, DomainJoinHandler, DomainSearchHandler, DomainModel };
`;
const compiled = buildSync({
    stdin: { contents: handlerSource, loader: 'ts', resolveDir: root },
    bundle: true, packages: 'external', platform: 'node', format: 'cjs', write: false,
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).outputFiles[0].text;
let mongod;
let client;
let db;
let domain;
let classes;
let assignedWorkspaceIds;
let platformAdmin;
let groupUpdates;
let auditLogs;
const plain = (value) => JSON.parse(JSON.stringify(value));
const OPEN = { method: 1, role: 'default', expire: null };
const CODE = { method: 2, role: 'default', code: '一起编程', expire: null };
const ids = (items) => Array.from(items, (item) => item._id);

before(async () => {
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    db = client.db('domain_self_join_test');
});
beforeEach(async () => {
    await db.dropDatabase();
    assignedWorkspaceIds = ['teacherA'];
    platformAdmin = false;
    groupUpdates = [];
    auditLogs = [];
    domain = {
        JOIN_METHOD_NONE: 0, JOIN_METHOD_ALL: 1, JOIN_METHOD_CODE: 2,
        coll: db.collection('domain'), collUser: db.collection('domain.user'),
        get: (id) => db.collection('domain').findOne({ lower: id.toLowerCase() }),
        getMulti: (query) => db.collection('domain').find(query),
        getRoles: async (ddoc) => ['default', 'guest', 'root', ...Object.keys(ddoc.roles || {})].map((_id) => ({ _id })),
        edit: (id, data) => db.collection('domain').updateOne({ _id: id }, { $set: data }),
        setUserInDomain: (domainId, uid, data) => db.collection('domain.user').updateOne({ domainId, uid }, { $set: data }, { upsert: true }),
        getDictUserByDomainId: async (uid) => Object.fromEntries((await db.collection('domain.user').find({ uid, join: true }).toArray())
            .map((item) => [item.domainId, item])),
        getPrefixSearch: (q, limit) => db.collection('domain').find({ name: new RegExp(q, 'i') }).limit(limit).toArray(),
    };
    const mod = { exports: {} };
    vm.runInNewContext(compiled, {
        module: mod, exports: mod.exports, require, Date, URL,
        Handler: class {}, domain,
        PERM: { PERM_EDIT_DOMAIN: 2n },
        workspace: {
            LEGACY_WORKSPACE_ID: 'tang',
            getAssignedWorkspaceIds: async () => assignedWorkspaceIds,
            isPlatformAdmin: () => platformAdmin,
            resolveDomainWorkspaceId: (ddoc) => ddoc?.workspaceId || 'tang',
            getDomainQuery: (workspaceId) => workspaceId === 'tang'
                ? { $or: [{ workspaceId: 'tang' }, { workspaceId: { $exists: false } }] }
                : { workspaceId },
        },
        avatar: (value) => `/avatar/${encodeURIComponent(value)}`,
        isScratchDomain: (ddoc) => ddoc.domainType === 'scratch',
        user: {
            getById: async (_, uid) => ({ _id: uid, uname: '老师' }),
            listGroup: async () => [{ name: 'existing', uids: [7] }],
            updateGroup: async (...args) => groupUpdates.push(args),
        },
        oplog: { log: async (...args) => auditLogs.push(args.slice(1)) },
    });
    classes = mod.exports;
    domain.getJoinSettings = classes.DomainModel.getJoinSettings;
    await seed('ClassA', { _join: OPEN });
});
after(async () => {
    await client?.close();
    await mongod?.stop();
});
async function seed(_id, extra = {}) {
    await domain.coll.insertOne({ _id, lower: _id.toLowerCase(), name: _id, workspaceId: 'teacherA', owner: 10, roles: {}, ...extra });
}
function handler(name, options = {}) {
    const h = new classes[name]();
    h.user = { _id: 20, hasPriv: () => false };
    h.domain = { _id: 'ClassA', workspaceId: 'teacherA' };
    h.args = { domainId: 'ClassA' };
    h.request = {
        method: options.method || 'GET', host: 'onebyone.test',
        headers: { origin: 'https://onebyone.test', accept: options.json === false ? 'text/html' : 'application/json' },
        query: {}, body: {}, json: options.json !== false,
    };
    h.response = { headers: {}, addHeader(name, value) { this.headers[name] = value; } };
    h.checkPerm = (perm) => {
        assert.equal(perm, 2n);
        if (options.denied) throw new Error('Permission denied');
    };
    h.url = (name, args = {}) => `/d/${args.domainId || 'ClassA'}/${name}${args.query ? `?${new URLSearchParams(args.query)}` : ''}`;
    return h;
}
async function settings(body, options = {}) {
    const h = handler('DomainJoinApplicationsHandler', { method: 'POST', ...options });
    h.request.body = body;
    await h.prepare({ domainId: 'ClassA' });
    await h.post({ domainId: 'ClassA', ...body });
    return h;
}
async function join(target = 'ClassA', code, extra = {}) {
    const h = handler('DomainJoinHandler', { method: 'POST', ...extra });
    const args = { domainId: 'ClassA', target, code, ...extra.args };
    h.request.body = args;
    await h.prepare(args);
    await h.post(args);
    return h;
}
async function candidates(q = '', purpose = 'join') {
    const h = handler('DomainSearchHandler');
    await h.get({ domainId: 'ClassA', q, purpose });
    assert.equal(h.response.headers['Cache-Control'], 'private, no-store');
    return h.response.body;
}

describe('domain self-join settings and real request binding', () => {
    it('reads legacy state, keeps a private response and enables with only the simple fields', async () => {
        await domain.edit('ClassA', { _join: { ...CODE, group: 'existing' } });
        const get = handler('DomainJoinApplicationsHandler');
        await get.prepare({ domainId: 'ClassA' });
        await get.get();
        assert.equal(get.response.body.enabled, true);
        assert.equal(get.response.body.invitationCode, '一起编程');
        assert.equal(get.response.headers['Cache-Control'], 'private, no-store');
        const h = await settings({ enabled: 'on', invitationCode: '  新指令  ', role: 'root', expire: 3, group: 'existing' });
        assert.deepEqual(plain((await domain.get('ClassA'))._join), { method: 2, role: 'default', expire: null, code: '新指令' });
        assert.deepEqual(plain(h.response.body), { saved: true, enabled: true, invitationCode: '新指令' });
        assert.equal(h.response.redirect, undefined);
    });

    it('allows no-code joining, preserves the code when disabled, and leaves existing students intact', async () => {
        await domain.collUser.insertOne({ domainId: 'ClassA', uid: 99, join: true, role: 'default' });
        await settings({ enabled: 'on', invitationCode: '   ' });
        assert.equal((await domain.get('ClassA'))._join.method, 1);
        const h = await settings({ invitationCode: '以后使用' }, { json: false });
        assert.deepEqual(plain((await domain.get('ClassA'))._join), { method: 0, role: 'default', expire: null, code: '以后使用' });
        assert.match(h.response.redirect, /saved=1/);
        assert.equal((await domain.collUser.findOne({ uid: 99 })).join, true);
        await assert.rejects(join(), { name: 'DomainJoinForbiddenError' });
    });

    it('rejects non-teachers, foreign origins, body-domain overrides, invalid flags and oversized codes', async () => {
        const denied = handler('DomainJoinApplicationsHandler', { denied: true });
        await assert.rejects(denied.prepare({ domainId: 'ClassA' }), /Permission denied/);
        const forged = handler('DomainJoinApplicationsHandler', { method: 'POST' });
        await assert.rejects(forged.prepare({ domainId: 'Other' }), { name: 'ValidationError' });
        forged.request.headers.origin = 'https://elsewhere.test';
        await assert.rejects(forged.prepare({ domainId: 'ClassA' }), { name: 'CsrfTokenError' });
        for (const body of [{ enabled: [] }, { enabled: 'maybe' }, { enabled: true, invitationCode: [] }, { invitationCode: 'a'.repeat(65) }]) {
            await assert.rejects(settings(body), { name: 'ValidationError' });
        }
        assert.equal((await domain.get('ClassA'))._join.method, 1);
    });
});

describe('scoped discoverable classrooms', () => {
    it('lists only open, valid, unjoined classrooms from the assigned teacher and keeps codes private', async () => {
        await seed('Coded', { name: 'Scratch 课堂', domainType: 'scratch', avatar: 'cat', _join: CODE });
        await seed('Closed', { _join: { ...CODE, method: 0 } });
        await seed('Expired', { _join: { ...OPEN, expire: new Date(0) } });
        await seed('BadRole', { _join: { ...OPEN, role: 'missing-role' } });
        await seed('OtherTeacher', { workspaceId: 'teacherB', _join: OPEN });
        await seed('Blocked', { _join: OPEN });
        await seed('Banned', { _join: OPEN });
        await seed('Already', { _join: OPEN });
        await domain.collUser.insertMany([
            { domainId: 'Blocked', uid: 20, join: false, role: 'default', blockedByStudentManagement: true },
            { domainId: 'Banned', uid: 20, join: false, role: 'guest' },
            { domainId: 'Already', uid: 20, join: true, role: 'default' },
        ]);
        const result = await candidates();
        assert.deepEqual(ids(result), ['ClassA', 'Coded']);
        assert.deepEqual(Object.keys(result[1]).sort(), ['_id', 'avatarUrl', 'domainType', 'joinUrl', 'name', 'requiresCode']);
        assert.equal(result[1].requiresCode, true);
        assert.equal(result[1].domainType, 'scratch');
        assert.match(result[1].joinUrl, /target=Coded/);
        assert(!JSON.stringify(result).includes('一起编程'));
        assert.deepEqual(ids(await candidates('scratch')), ['Coded']);
        assert.deepEqual(ids(await candidates('nobody')), []);
    });

    it('includes all eligible domains rather than truncating before scope filtering', async () => {
        await domain.coll.insertMany(Array.from({ length: 25 }, (_, i) => ({
            _id: `Else${i}`, lower: `else${i}`, name: `Class ${i}`, workspaceId: 'teacherB', _join: OPEN,
        })));
        await seed('LastClass', { name: 'Class that belongs to this teacher', _join: OPEN });
        assert.deepEqual(ids(await candidates('class')), ['ClassA', 'LastClass']);
    });

    it('supports unassigned legacy students and keeps administrator discovery in the current teacher workspace', async () => {
        await seed('Legacy', { workspaceId: 'tang', _join: OPEN });
        await seed('NoWorkspace', { _join: OPEN });
        await domain.coll.updateOne({ _id: 'NoWorkspace' }, { $unset: { workspaceId: '' } });
        assignedWorkspaceIds = [];
        assert.deepEqual(ids(await candidates()), ['Legacy', 'NoWorkspace']);
        platformAdmin = true;
        assert.deepEqual(ids(await candidates()), ['ClassA']);
    });

    it('does not disclose invitation settings through the existing general-purpose search', async () => {
        await domain.edit('ClassA', { _join: CODE });
        await domain.collUser.insertOne({ domainId: 'ClassA', uid: 20, join: true });
        const h = handler('DomainSearchHandler');
        await h.get({ domainId: 'ClassA', q: '' });
        assert.deepEqual(ids(h.response.body), ['ClassA']);
        assert(!JSON.stringify(h.response.body).includes('一起编程'));
        assert.equal(h.response.body[0]._join, undefined);
    });
});

describe('one-click and code-based self joining', () => {
    it('joins once with the default role through real decorated args and refuses replay', async () => {
        const h = await join();
        assert.equal(h.response.body.success, true);
        assert.match(h.response.body.url, /\/d\/ClassA\/homepage/);
        assert.equal(h.response.redirect, undefined);
        const entry = await domain.collUser.findOne({ uid: 20 });
        assert.equal(entry.domainId, 'ClassA');
        assert.equal(entry.role, 'default');
        assert.equal(auditLogs.length, 1);
        await assert.rejects(join(), { name: 'DomainJoinAlreadyMemberError' });
        assert.equal(await domain.collUser.countDocuments({ uid: 20 }), 1);
    });

    it('rejects missing or wrong codes without writing membership and navigates Scratch joins correctly', async () => {
        await domain.edit('ClassA', { _join: CODE, domainType: 'scratch' });
        await assert.rejects(join(), { name: 'InvalidJoinInvitationCodeError' });
        await assert.rejects(join('ClassA', '错误'), { name: 'InvalidJoinInvitationCodeError' });
        assert.equal(await domain.collUser.countDocuments({ uid: 20 }), 0);
        const h = await join('ClassA', '  一起编程  ');
        assert.match(h.response.body.url, /\/scratch_main/);
    });

    it('keeps actual code secret on the direct join page while accepting a user-supplied prefill', async () => {
        await domain.edit('ClassA', { _join: CODE });
        const h = handler('DomainJoinHandler');
        await h.prepare({ domainId: 'ClassA', target: 'classa' });
        await h.get({ domainId: 'ClassA', target: 'classa', code: '用户输入' });
        assert.equal(h.response.body.target, 'ClassA');
        assert.equal(h.response.body.code, '用户输入');
        assert.deepEqual(plain(h.response.body.joinSettings), { method: 2 });
        assert(!JSON.stringify(h.response.body).includes('一起编程'));
    });

    it('blocks closed or expired links even for a pre-assigned role', async () => {
        await domain.collUser.insertOne({ domainId: 'ClassA', uid: 20, role: 'root', join: false });
        for (const config of [null, { ...OPEN, method: 0 }, { ...OPEN, expire: new Date(0) }]) {
            await domain.edit('ClassA', { _join: config });
            await assert.rejects(join(), { name: 'DomainJoinForbiddenError' });
        }
        assert.equal((await domain.collUser.findOne({ uid: 20 })).join, false);
    });

    it('blocks other teachers, legacy crossover, bans and removals, including lowercase ID aliases', async () => {
        await seed('OtherTeacher', { workspaceId: 'teacherB', _join: OPEN });
        await seed('Legacy', { workspaceId: 'tang', _join: OPEN });
        await assert.rejects(join('OtherTeacher'), { name: 'NotFoundError' });
        await assert.rejects(join('Legacy'), { name: 'NotFoundError' });
        assignedWorkspaceIds = [];
        await assert.rejects(join('ClassA'), { name: 'NotFoundError' });
        assignedWorkspaceIds = ['teacherA'];
        await domain.collUser.insertOne({ domainId: 'ClassA', uid: 20, role: 'guest', join: false });
        await assert.rejects(join('classa'), { name: 'DomainJoinForbiddenError' });
        await domain.collUser.updateOne({ uid: 20 }, { $set: { role: 'default', blockedByStudentManagement: true } });
        await assert.rejects(join('classa'), { name: 'DomainJoinForbiddenError' });
        assert.equal(await domain.collUser.countDocuments({ domainId: 'classa' }), 0);
    });

    it('writes only the resolved canonical domain even if later raw args differ', async () => {
        const h = handler('DomainJoinHandler', { method: 'POST' });
        await h.prepare({ domainId: 'ClassA', target: 'classa' });
        await h.post({ domainId: 'ClassA', target: 'OtherTeacher' });
        assert.equal((await domain.collUser.findOne({ uid: 20 })).domainId, 'ClassA');
    });

    it('rejects foreign-origin posts and unsafe redirects while retaining ordinary form joins', async () => {
        const h = handler('DomainJoinHandler', { method: 'POST' });
        h.request.headers.origin = 'https://malicious.test';
        await assert.rejects(h.prepare({ domainId: 'ClassA' }), { name: 'CsrfTokenError' });
        const joined = await join('ClassA', undefined, { json: false, args: { redirect: '//malicious.test' } });
        assert.match(joined.response.redirect, /^\/d\/ClassA\/homepage/);
        assert.equal(joined.response.body, undefined);
    });

    it('retains valid legacy group assignment without exposing or escalating the submitted role', async () => {
        await domain.edit('ClassA', { _join: { ...OPEN, group: 'existing' } });
        await join('ClassA', undefined, { args: { role: 'root' } });
        assert.deepEqual(plain(groupUpdates), [['ClassA', 'existing', [7, 20]]]);
        assert.equal((await domain.collUser.findOne({ uid: 20 })).role, 'default');
    });
});
