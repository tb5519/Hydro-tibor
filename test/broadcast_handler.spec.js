const assert = require('node:assert/strict');
const Module = require('node:module');
const { beforeEach, describe, it } = require('node:test');

const PRIV = { PRIV_USER_PROFILE: 1 };
const PERM = { PERM_EDIT_DOMAIN: 1n };
class PermissionError extends Error {}
const calls = [];
const entries = new Map();
const legacy = { _id: 'system', name: '唐老师课堂' };
const classroom = { _id: 'class-a', name: 'A 班', workspaceId: 'teacher-a' };
const notice = {
    title: '下周课程安排', content: '<p>请带好教材</p>', revision: 'a'.repeat(32),
    enabled: true, updatedAt: new Date('2026-09-13T08:00:00Z'),
};
let stored;
let unread;
const makeUser = (uid, canEdit = false) => ({
    _id: uid,
    hasPriv: (priv) => priv === PRIV.PRIV_USER_PROFILE && uid > 0,
    hasPerm: (perm) => perm === PERM.PERM_EDIT_DOMAIN && canEdit,
});

class Handler {
    constructor({ domain = legacy, uid = 2, canEdit = false, json = true } = {}) {
        this.domain = domain;
        this.user = makeUser(uid, canEdit);
        this.request = { method: 'get', json, headers: {}, body: {}, query: {} };
        this.response = { body: {}, status: null, template: null, redirect: null };
        this.session = { scope: 'request-scope' };
        this.UiContext = {};
    }

    checkPriv(priv) {
        calls.push({ action: 'check-priv', priv });
        if (!this.user.hasPriv(priv)) throw new PermissionError();
    }

    url(route, options = {}) {
        calls.push({ action: 'url', route, options });
        const query = options.query ? `?${new URLSearchParams(options.query)}` : '';
        return `/d/${options.domainId || this.domain._id}/${route}${query}`;
    }
}

const service = {
    async assertCanManageBroadcast(viewer, scope) {
        calls.push({ action: 'authorize', viewer, scope });
        if ((scope === 'global' && viewer._id !== 2)
            || (scope === 'domain' && !viewer.hasPerm(PERM.PERM_EDIT_DOMAIN))) throw new PermissionError();
    },
    async getBroadcast(scope, domainId) {
        calls.push({ action: 'get', scope, domainId });
        return stored;
    },
    presentBroadcast(value) {
        calls.push({ action: 'present', value });
        return value;
    },
    async publishBroadcast(scope, domainId, uid, title, content, revision) {
        calls.push({ action: 'publish', scope, domainId, uid, title, content, revision });
        return { ...notice, title, content };
    },
    async disableBroadcast(scope, domainId, revision) {
        calls.push({ action: 'disable', scope, domainId, revision });
        return { ...notice, enabled: false };
    },
    normalizeBroadcast(title, content) {
        calls.push({ action: 'normalize', title, content });
        return { title: title.trim(), content: '<p>sanitized preview</p>' };
    },
    async acknowledgeBroadcast(viewer, domain, scope, revision) {
        calls.push({ action: 'acknowledge', viewer, domain, scope, revision });
    },
    async getUnreadBroadcasts(viewer, domain) {
        calls.push({ action: 'unread', viewer, domain });
        return unread;
    },
    async ensureBroadcastIndexes() { calls.push({ action: 'indexes' }); },
};
const userModel = {
    async getById(domainId, uid, scope) {
        calls.push({ action: 'entry-user', domainId, uid, scope });
        return entries.get(`${domainId}:${uid}`) || null;
    },
};

const originalLoad = Module._load;
let handlers;
try {
    Module._load = function load(request, parent, isMain) {
        if (parent?.filename?.endsWith('/packages/hydrooj/src/handler/broadcast.ts')) {
            if (request === '../lib/broadcast') return service;
            if (request === '../model/builtin') return { PRIV, PERM };
            if (request === '../model/user') return userModel;
            if (request === '../model/workspace') return { getLegacyWorkspace: async () => ({ ownerUid: 2 }) };
            if (request === '../service/server') return {
                Handler,
                param: () => () => {}, post: () => () => {},
                Types: { Int: 'int', String: 'string', Content: 'content', Range: (values) => values },
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    handlers = require('../packages/hydrooj/src/handler/broadcast');
} finally {
    Module._load = originalLoad;
}
const { BroadcastManageHandler, DomainBroadcastManageHandler, BroadcastAcknowledgeHandler, injectUnreadBroadcasts } = handlers;

async function dispatch(handler, method, ...args) {
    if (handler.prepare) await handler.prepare();
    return handler[method](...args);
}

beforeEach(() => {
    calls.length = 0;
    entries.clear();
    stored = notice;
    unread = [{ ...notice, scope: 'global' }];
});

describe('broadcast administration boundaries', () => {
    it('authorizes the Tang owner and domain teachers before reads, publish, disable, and preview', async () => {
        for (const method of ['get', 'postPublish', 'postDisable', 'postPreview']) {
            for (const handler of [
                new BroadcastManageHandler({ uid: 10, canEdit: true }),
                new DomainBroadcastManageHandler({ domain: classroom, uid: 24 }),
                new BroadcastManageHandler({ uid: 0 }),
            ]) {
                calls.length = 0;
                await assert.rejects(dispatch(handler, method, 'forged-domain', 'title', '<p>body</p>', notice.revision), PermissionError);
                assert.ok(calls.every((call) => ['check-priv', 'authorize'].includes(call.action)));
            }
        }
        const owner = new BroadcastManageHandler();
        await dispatch(owner, 'get', 'system');
        const teacher = new DomainBroadcastManageHandler({ domain: classroom, uid: 10, canEdit: true });
        await dispatch(teacher, 'get', classroom._id);
        assert.equal(owner.response.body.broadcastBaseTemplate, 'manage_base.html');
        assert.equal(owner.response.body.broadcastScope, 'global');
        assert.equal(teacher.response.body.broadcastBaseTemplate, 'domain_base.html');
        assert.equal(teacher.response.body.broadcastScope, 'domain');
        assert.equal(teacher.response.body.broadcastScopeLabel, 'A 班 · 域广播');
    });

    it('uses the URL domain and authenticated operator when submitted scope and user fields are forged', async () => {
        const teacher = new DomainBroadcastManageHandler({ domain: classroom, uid: 10, canEdit: true });
        teacher.request.body = { domainId: 'foreign', scope: 'global', uid: 2, operatorUid: 2 };
        await dispatch(teacher, 'postPublish', 'foreign', notice.title, notice.content, notice.revision);
        assert.deepEqual(calls.find((call) => call.action === 'publish'), {
            action: 'publish', scope: 'domain', domainId: classroom._id, uid: 10,
            title: notice.title, content: notice.content, revision: notice.revision,
        });
        assert.equal(teacher.response.body.saved, true);
        assert.equal(teacher.response.redirect, null);
        calls.length = 0;
        await dispatch(teacher, 'postDisable', 'foreign', notice.revision);
        assert.deepEqual(calls.find((call) => call.action === 'disable'), {
            action: 'disable', scope: 'domain', domainId: classroom._id, revision: notice.revision,
        });
        assert.equal(teacher.response.body.broadcast.enabled, false);
        calls.length = 0;
        await dispatch(teacher, 'get', 'foreign');
        assert.deepEqual(calls.find((call) => call.action === 'get'), { action: 'get', scope: 'domain', domainId: classroom._id });
    });

    it('renders a first-use editor and redirects regular forms after a successful save', async () => {
        stored = null;
        const editor = new BroadcastManageHandler({ json: false });
        await dispatch(editor, 'get', 'system');
        assert.equal(editor.response.template, 'broadcast_manage.html');
        assert.equal(editor.response.body.broadcast.revision, '');
        assert.equal(editor.response.body.broadcast.enabled, false);
        await dispatch(editor, 'postPublish', 'system', notice.title, notice.content, '');
        assert.equal(editor.response.redirect, '/d/system/manage_broadcast?saved=1');
    });

    it('uses server normalization for previews without persisting or acknowledging them', async () => {
        const editor = new DomainBroadcastManageHandler({ domain: classroom, uid: 10, canEdit: true });
        await dispatch(editor, 'postPreview', 'foreign', ' preview ', '<script>unsafe()</script>');
        assert.deepEqual(editor.response.body, { title: 'preview', content: '<p>sanitized preview</p>' });
        assert.ok(!calls.some((call) => ['get', 'publish', 'disable', 'acknowledge'].includes(call.action)));
    });
});

describe('broadcast acknowledgement identity', () => {
    it('binds receipts to the signed-in account and URL domain even with forged body fields', async () => {
        const handler = new BroadcastAcknowledgeHandler({ domain: classroom, uid: 24 });
        handler.request.body = { uid: 999, domainId: 'foreign' };
        await handler.post('foreign', 'domain', notice.revision);
        assert.deepEqual(calls.find((call) => call.action === 'acknowledge'), {
            action: 'acknowledge', viewer: handler.user, domain: classroom, scope: 'domain', revision: notice.revision,
        });
        assert.deepEqual(handler.response.body, { acknowledged: true });
    });

    it('rejects unauthenticated acknowledgement before issuing a receipt', async () => {
        const handler = new BroadcastAcknowledgeHandler({ uid: 0 });
        await assert.rejects(handler.post('system', 'global', notice.revision), PermissionError);
        assert.ok(!calls.some((call) => call.action === 'acknowledge'));
    });
});

describe('unread broadcasts on rendered pages', () => {
    const page = () => {
        const handler = new Handler({ domain: classroom, uid: 24, json: false });
        handler.response.template = 'main.html';
        return handler;
    };

    it('adds notices and the acknowledgement endpoint to an ordinary rendered student page', async () => {
        const handler = page();
        await injectUnreadBroadcasts(handler);
        assert.deepEqual(calls.find((call) => call.action === 'unread'), {
            action: 'unread', viewer: handler.user, domain: classroom,
        });
        assert.strictEqual(handler.UiContext.broadcasts, unread);
        assert.equal(handler.UiContext.broadcastAckUrl, '/d/class-a/broadcast_ack');
    });

    it('uses the entry classroom and entry-user role when a shared contest replaced the handler source domain', async () => {
        const handler = page();
        handler.domain = legacy;
        handler.contestEntryContext = { domain: classroom, contest: { domainId: legacy._id } };
        const entryTeacher = makeUser(24, true);
        entries.set('class-a:24', entryTeacher);
        await injectUnreadBroadcasts(handler);
        assert.deepEqual(calls.find((call) => call.action === 'unread'), {
            action: 'unread', viewer: entryTeacher, domain: classroom,
        });
        assert.equal(handler.UiContext.broadcastAckUrl, '/d/class-a/broadcast_ack');
        assert.equal(handler.domain._id, 'system', 'reading announcements must not change contest model routing');
    });

    it('does not attach the acknowledgement endpoint when no notices are unread', async () => {
        unread = [];
        const handler = page();
        await injectUnreadBroadcasts(handler);
        assert.deepEqual(handler.UiContext.broadcasts, []);
        assert.equal(handler.UiContext.broadcastAckUrl, undefined);
    });

    it('skips JSON, redirects, posts, errors, websockets, fragment requests, and downloads', async () => {
        const variations = [
            (handler) => { handler.request.json = true; },
            (handler) => { handler.response.redirect = '/login'; },
            (handler) => { handler.request.method = 'post'; },
            (handler) => { handler.response.status = 403; },
            (handler) => { handler.request.websocket = true; },
            (handler) => { handler.request.headers['x-pjax'] = 'true'; },
            (handler) => { handler.response.template = null; handler.response.type = 'application/octet-stream'; },
        ];
        for (const mutate of variations) {
            const handler = page();
            mutate(handler);
            await injectUnreadBroadcasts(handler);
            assert.deepEqual(handler.UiContext, {});
        }
        assert.equal(calls.length, 0);
    });
});
