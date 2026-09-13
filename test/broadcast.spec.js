const assert = require('node:assert/strict');
const Module = require('node:module');
const { beforeEach, describe, it } = require('node:test');
const { sanitizeBroadcastHtml } = require('../packages/ui-default/backendlib/broadcast.ts');

const PERM = { PERM_EDIT_DOMAIN: 1n, PERM_VIEW: 2n };
const PRIV = {
    PRIV_USER_PROFILE: 4, PRIV_EDIT_SYSTEM: 8, PRIV_MANAGE_ALL_DOMAIN: 16, PRIV_JUDGE: 32, PRIV_ALL: -1,
};
class ValidationError extends Error {}
class PermissionError extends Error {}
class UserFacingError extends Error {}
function CreateError(name, Base, message, code) {
    return class extends Base {
        constructor() { super(message); this.name = name; this.code = code; }
    };
}

function matches(doc, query) {
    return Object.entries(query).every(([key, value]) => {
        if (value && typeof value === 'object' && '$in' in value) return value.$in.includes(doc[key]);
        return doc[key] === value;
    });
}
function collection() {
    const documents = new Map();
    return {
        documents,
        beforeUpdate: null,
        async findOne(query) { return structuredClone([...documents.values()].find((doc) => matches(doc, query)) || null); },
        find(query) { return { toArray: async () => structuredClone([...documents.values()].filter((doc) => matches(doc, query))) }; },
        async insertOne(doc) {
            if (documents.has(doc._id)) throw Object.assign(new Error('Duplicate key'), { code: 11000 });
            documents.set(doc._id, structuredClone(doc));
            return { insertedId: doc._id };
        },
        async updateOne(query, update, options) {
            if (this.beforeUpdate) {
                const hook = this.beforeUpdate;
                this.beforeUpdate = null;
                hook();
            }
            const previous = [...documents.values()].find((doc) => matches(doc, query));
            if (previous) {
                documents.set(previous._id, { ...previous, ...structuredClone(update.$set || {}) });
                return { matchedCount: 1 };
            }
            if (options?.upsert) await this.insertOne({ ...query, ...update.$setOnInsert });
            return { matchedCount: 0 };
        },
    };
}
const broadcasts = collection();
const receipts = collection();
const domainCollection = collection();
const domainMembers = collection();
const workspaceMembers = collection();
const database = {
    collection(name) { return name === 'broadcast' ? broadcasts : receipts; },
    async ensureIndexes() {},
};
const legacy = { ownerUid: 10 };
const workspace = {
    collMember: workspaceMembers,
    async getLegacyWorkspace() { return legacy; },
    isPlatformAdmin(uid) { return uid === 11; },
};
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/broadcast.ts')) {
        if (request === '../error') return { CreateError, PermissionError, UserFacingError, ValidationError };
        if (request === '../model/builtin') return { PERM, PRIV };
        if (request === '../model/domain') return { coll: domainCollection, collUser: domainMembers };
        if (request === '../model/workspace') return workspace;
        if (request === '../service/db') return database;
    }
    return originalLoad.call(this, request, parent, isMain);
};
const libPath = require.resolve('../packages/hydrooj/src/lib/broadcast.ts');
const broadcast = require(libPath);
Module._load = originalLoad;

const student = (uid, options = {}) => ({
    _id: uid,
    hasPriv: (priv) => ((options.priv ?? PRIV.PRIV_USER_PROFILE) & priv) === priv,
    hasPerm: (perm) => ((options.perm ?? PERM.PERM_VIEW) & perm) === perm,
});
const domainA = { _id: 'A', name: '甲班' };
const domainB = { _id: 'B', name: '乙班', workspaceId: 'other-teacher' };
const publish = (scope = 'global', domainId = 'A', title = '课程公告', content = '<p>明天按时上课。</p>', revision = '') => (
    broadcast.publishBroadcast(scope, domainId, 10, title, content, revision)
);

beforeEach(() => {
    for (const coll of [broadcasts, receipts, domainCollection, domainMembers, workspaceMembers]) {
        coll.documents.clear();
        coll.beforeUpdate = null;
    }
    domainMembers.documents.set('24:A', { _id: '24:A', uid: 24, domainId: 'A', join: true, role: 'default' });
    domainMembers.documents.set('25:B', { _id: '25:B', uid: 25, domainId: 'B', join: true, role: 'default' });
    broadcast.configureBroadcastSanitizer(sanitizeBroadcastHtml);
});

describe('broadcast publication and durable acknowledgement', () => {
    it('delivers a global announcement across independent teacher workspaces', async () => {
        await publish();
        assert.equal((await broadcast.getUnreadBroadcasts(student(24), domainA))[0].scope, 'global');
        assert.equal((await broadcast.getUnreadBroadcasts(student(25), domainB))[0].scope, 'global');
    });

    it('shows global first, then only the joined current domain announcement', async () => {
        await publish('domain', 'A');
        await publish('domain', 'B');
        await publish();
        assert.deepEqual((await broadcast.getUnreadBroadcasts(student(24), domainA)).map((item) => item.scope), ['global', 'domain']);
        assert.deepEqual((await broadcast.getUnreadBroadcasts(student(24), domainB)).map((item) => item.scope), ['global']);
        const visible = await broadcast.getUnreadBroadcasts(student(25), domainB);
        assert.equal(visible[1].scopeLabel, '乙班 · 域广播');
        assert.equal(visible[1].domainId, 'B');
    });

    it('stores a read receipt by account, broadcast, and revision without changing other accounts', async () => {
        const published = await publish();
        await broadcast.acknowledgeBroadcast(student(24), domainA, 'global', published.revision);
        assert.equal((await broadcast.getUnreadBroadcasts(student(24), domainA)).length, 0);
        // A separate request/domain/device uses the same durable database receipt.
        assert.equal((await broadcast.getUnreadBroadcasts(student(24), domainB)).length, 0);
        assert.equal((await broadcast.getUnreadBroadcasts(student(25), domainB)).length, 1);
        assert.equal(receipts.documents.size, 1);
        const receipt = [...receipts.documents.values()][0];
        assert.equal(receipt.uid, 24);
        assert.equal(receipt.broadcastId, 'global');
        assert.equal(receipt.revision, published.revision);
        assert.ok(receipt.acknowledgedAt instanceof Date);
    });

    it('leaves a newer revision unread when an older browser tab acknowledges', async () => {
        const first = await publish();
        const second = await publish('global', 'A', '课程公告', '<p>上课时间更新为九点。</p>', first.revision);
        assert.notEqual(first.revision, second.revision);
        await broadcast.acknowledgeBroadcast(student(24), domainA, 'global', first.revision);
        assert.deepEqual((await broadcast.getUnreadBroadcasts(student(24), domainA)).map((item) => item.revision), [second.revision]);
        await broadcast.acknowledgeBroadcast(student(24), domainA, 'global', second.revision);
        await broadcast.acknowledgeBroadcast(student(24), domainA, 'global', first.revision);
        assert.equal((await broadcast.getUnreadBroadcasts(student(24), domainA)).length, 0);
        assert.equal(receipts.documents.size, 2);
    });

    it('does not re-notify on an unchanged publish, disable, or re-enable', async () => {
        const first = await publish();
        await broadcast.acknowledgeBroadcast(student(24), domainA, 'global', first.revision);
        const repeated = await publish('global', 'A', first.title, first.content, first.revision);
        assert.equal(repeated.revision, first.revision);
        assert.deepEqual(repeated.updatedAt, first.updatedAt);
        await broadcast.disableBroadcast('global', 'A', first.revision);
        assert.equal((await broadcast.getUnreadBroadcasts(student(25), domainB)).length, 0);
        const reopened = await publish('global', 'B', first.title, first.content, first.revision);
        assert.equal(reopened.revision, first.revision);
        assert.equal((await broadcast.getUnreadBroadcasts(student(24), domainA)).length, 0);
        assert.equal((await broadcast.getUnreadBroadcasts(student(25), domainB)).length, 1);
    });

    it('keeps independent domain acknowledgements isolated', async () => {
        domainMembers.documents.set('24:B', { _id: '24:B', uid: 24, domainId: 'B', join: true, role: 'default' });
        const a = await publish('domain', 'A');
        const b = await publish('domain', 'B');
        await broadcast.acknowledgeBroadcast(student(24), domainA, 'domain', a.revision);
        assert.equal((await broadcast.getUnreadBroadcasts(student(24), domainA)).length, 0);
        assert.equal((await broadcast.getUnreadBroadcasts(student(24), domainB))[0].revision, b.revision);
    });

    it('rejects stale edits and detects a race after the initial read', async () => {
        const first = await publish();
        await assert.rejects(publish('global', 'A', '旧草稿', '<p>旧内容</p>'), broadcast.BroadcastConflictError);
        broadcasts.beforeUpdate = () => {
            broadcasts.documents.get('global').revision = 'a'.repeat(32);
        };
        await assert.rejects(publish('global', 'A', '同时编辑', '<p>不能覆盖新版本</p>', first.revision), broadcast.BroadcastConflictError);
        assert.equal(broadcasts.documents.get('global').revision, 'a'.repeat(32));
    });

    it('allows exactly one initial publish from simultaneous editors', async () => {
        const results = await Promise.allSettled([publish(), publish('global', 'B', '其他草稿')]);
        assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
        assert.ok(results.find((item) => item.status === 'rejected').reason instanceof broadcast.BroadcastConflictError);
        assert.equal(broadcasts.documents.size, 1);
    });

    it('repeated concurrent acknowledgements are idempotent', async () => {
        const published = await publish();
        await Promise.all(Array.from({ length: 8 }, () => (
            broadcast.acknowledgeBroadcast(student(24), domainA, 'global', published.revision)
        )));
        assert.equal(receipts.documents.size, 1);
    });
});

describe('broadcast authorization and input boundaries', () => {
    it('reserves the global editor for the legacy owner and respects domain management permission', async () => {
        await broadcast.assertCanManageBroadcast(student(10), 'global');
        await assert.rejects(broadcast.assertCanManageBroadcast(student(11, { priv: -1 }), 'global'), PermissionError);
        await assert.rejects(broadcast.assertCanManageBroadcast(student(24), 'domain'), PermissionError);
        await broadcast.assertCanManageBroadcast(student(30, { perm: PERM.PERM_EDIT_DOMAIN }), 'domain');
    });

    it('excludes guests, platform administrators, domain teachers, workspace teachers, and judge accounts', async () => {
        await publish();
        for (const viewer of [
            student(1), student(24, { priv: 0 }), student(11), student(24, { priv: -1 }),
            student(24, { priv: PRIV.PRIV_USER_PROFILE | PRIV.PRIV_JUDGE }), student(24, { perm: PERM.PERM_EDIT_DOMAIN }),
        ]) {
            assert.equal((await broadcast.getUnreadBroadcasts(viewer, domainA)).length, 0);
        }
        workspaceMembers.documents.set('teacher', { _id: 'teacher', uid: 24, status: 'active', workspaceId: 'B', role: 'teacher' });
        assert.equal((await broadcast.getUnreadBroadcasts(student(24), domainA)).length, 0);
        workspaceMembers.documents.clear();
        domainCollection.documents.set('other', { _id: 'other', owner: 24 });
        assert.equal((await broadcast.getUnreadBroadcasts(student(24), domainA)).length, 0);
        domainCollection.documents.clear();
        domainMembers.documents.set('24:B', { _id: '24:B', uid: 24, domainId: 'B', join: true, role: 'root' });
        assert.equal((await broadcast.getUnreadBroadcasts(student(24), domainA)).length, 0);
    });

    it('rejects unjoined-domain, teacher, malformed revision, and missing announcement acknowledgements', async () => {
        const item = await publish('domain', 'A');
        await assert.rejects(broadcast.acknowledgeBroadcast(student(25), domainA, 'domain', item.revision), PermissionError);
        await assert.rejects(broadcast.acknowledgeBroadcast(student(11), domainA, 'domain', item.revision), PermissionError);
        await assert.rejects(broadcast.acknowledgeBroadcast(student(24), domainA, 'domain', 'not-a-revision'), ValidationError);
        await assert.rejects(broadcast.acknowledgeBroadcast(student(24), domainA, 'global', item.revision), ValidationError);
        assert.equal(receipts.documents.size, 0);
    });

    it('rejects blank or oversized titles/content and invalid scopes', async () => {
        for (const [title, content] of [[' ', '<p>Hi</p>'], ['x'.repeat(101), '<p>Hi</p>'], ['Title', 'x'.repeat(100001)], ['Title', '<p>&nbsp;</p>'], ['Title', '<script>evil()</script>']]) {
            assert.throws(() => broadcast.normalizeBroadcast(title, content), ValidationError);
        }
        assert.throws(() => broadcast.getBroadcastId('arbitrary', 'A'), ValidationError);
        assert.throws(() => broadcast.getBroadcastId('domain', ''), ValidationError);
    });

    it('fails closed when no trusted UI sanitizer is installed', () => {
        const dispose = broadcast.configureBroadcastSanitizer(sanitizeBroadcastHtml);
        dispose();
        assert.throws(() => broadcast.normalizeBroadcast('Title', '<p>Body</p>'), /sanitizer is unavailable/);
    });
});

describe('broadcast rich HTML sanitization', () => {
    it('retains readable rich formatting and safe links while removing scripts and event handlers', () => {
        const input = '<h2>新学期</h2><p style="text-align:center;color:#2563eb;position:fixed" onclick="bad()">请<strong>按时</strong>上课</p>'
            + '<ul><li>带好电脑</li></ul><a href="https://example.com/classes" target="evil" onclick="bad()">课程</a>'
            + '<script>alert(1)</script><iframe src="https://evil.test">evil</iframe><svg onload="bad()"><script>bad()</script></svg>';
        const output = sanitizeBroadcastHtml(input);
        assert.match(output, /<h2>新学期<\/h2>/);
        assert.match(output, /text-align:center/);
        assert.match(output, /color:#2563eb/);
        assert.match(output, /<strong>按时<\/strong>/);
        assert.match(output, /target="_blank" rel="noopener noreferrer"/);
        assert.doesNotMatch(output, /onclick|position|<script|<iframe|<svg|bad\(\)|alert\(/);
        assert.equal(sanitizeBroadcastHtml(output), output);
    });

    it('rejects encoded and whitespace-obfuscated executable links, external protocol-relative URLs, and data images', () => {
        const values = ['javascript:alert(1)', 'java&#x73;cript:alert(1)', 'java&#10;script:alert(1)', '//evil.test', '\\evil.test', 'data:text/html,evil'];
        for (const href of values) {
            const result = sanitizeBroadcastHtml(`<a href="${href}">Open</a>`);
            assert.doesNotMatch(result, /href=/);
        }
        assert.doesNotMatch(sanitizeBroadcastHtml('<img src="data:image/svg+xml,<svg onload=alert(1)>">'), /src=/);
    });

    it('removes layout-breaking attributes and neutralizes unmatched closing tags', () => {
        const output = sanitizeBroadcastHtml('</div><p id="page" class="overlay" style="position:fixed;z-index:999;width:9999px">Safe</p>');
        assert.match(output, /^&lt;\/div&gt;/);
        assert.doesNotMatch(output, /id=|class=|position|z-index|9999/);
    });

    it('sanitizes on read too, so old or imported stored content cannot bypass the whitelist', async () => {
        const published = await publish();
        broadcasts.documents.get('global').content = '<p onmouseover="bad()">Hello</p><script>bad()</script>';
        const [unread] = await broadcast.getUnreadBroadcasts(student(24), domainA);
        assert.equal(unread.content, '<p>Hello</p>');
        assert.equal(unread.revision, published.revision);
    });
});
