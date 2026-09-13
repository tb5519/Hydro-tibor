const assert = require('node:assert/strict');
const Module = require('node:module');
const { beforeEach, describe, it } = require('node:test');

const PERM = { PERM_EDIT_DOMAIN: 1n << 12n };
class PermissionError extends Error {}
class NotFoundError extends Error {}
class ValidationError extends Error {}
const calls = [];
const params = new Map();
let platformTimeZone;
const manualBadges = [{ _id: 7, title: '手动徽章' }];
const autoRows = { autoBadgeRows: [{ key: 'automatic-record-key' }], autoBadgeTotal: 1 };
const ctx = { db: {
    async paginate(cursor, page, size) {
        calls.push({ action: 'paginate', cursor, page, size });
        return [manualBadges, 3];
    },
} };
class Handler {
    constructor({ domain = { _id: 'system' }, uid = 2, path = '/manage/badge', canEditDomain = false } = {}) {
        this.domain = domain;
        this.user = { _id: uid };
        this.ctx = ctx;
        this.request = { path, query: {}, body: {} };
        this.response = {};
        this.canEditDomain = canEditDomain;
    }

    checkPerm(permission) {
        calls.push({ action: 'permission', permission });
        if (permission !== PERM.PERM_EDIT_DOMAIN || !this.canEditDomain) throw new PermissionError('permission denied');
    }
}
const badgeModel = {
    async badgeGetMulti(actualCtx, domainId) {
        assert.equal(actualCtx, ctx);
        calls.push({ action: 'manual-list', domainId });
        return { scopedDomainId: domainId };
    },
};
const automaticService = {
    async getAutomaticBadgeManagement(actualCtx, domain, options) {
        assert.equal(actualCtx, ctx);
        calls.push({ action: 'automatic-list', domain, options });
        return autoRows;
    },
    async updateAutomaticBadge(actualCtx, domain, options) {
        assert.equal(actualCtx, ctx);
        calls.push({ action: 'automatic-update', domain, options });
    },
};
const originalLoad = Module._load;
const previousHydro = global.Hydro;
let BadgeManageHandler;
try {
    global.Hydro = { model: { userBadge: {}, badge: badgeModel, user: {} } };
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/addons/badge-for-hydrooj/index.ts')) {
            if (request === 'hydrooj') return {
                Handler, PermissionError, NotFoundError, ValidationError, PERM, PRIV: {}, STATUS: {},
                Types: { String: 'string', PositiveInt: 'positive-int', Boolean: 'boolean' },
                param: (...args) => (target, method) => {
                    const key = `${target.constructor.name}.${method}`;
                    if (!params.has(key)) params.set(key, []);
                    params.get(key).unshift(args);
                },
            };
            if (request === 'hydrooj/src/lib/automatic_badge') return automaticService;
            if (request === 'hydrooj/src/model/system') return { get: (key) => (key === 'timeZone' ? platformTimeZone : undefined) };
            if (request === 'hydrooj/src/model/workspace') return {
                LEGACY_WORKSPACE_ID: 'tang',
                resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang',
                getLegacyWorkspace: async () => ({ ownerUid: 2 }),
            };
            if (request.startsWith('hydrooj/src/')) return {};
            if (request === './ac_image_cache') return {};
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    ({ BadgeManageHandler } = require('../addons/badge-for-hydrooj/index'));
} finally {
    Module._load = originalLoad;
    global.Hydro = previousHydro;
}

// Exercise the handler's real prepare lifecycle before each method, matching
// Hydro's request dispatch: rejected requests must never reach the service.
async function dispatch(handler, method, ...args) {
    await handler.prepare();
    return handler[method](...args);
}
const serviceCalls = () => calls.filter((call) => call.action.startsWith('automatic-'));
const modern = { _id: 'class-a', name: 'A 班', workspaceId: 'teacher-workspace' };

beforeEach(() => {
    calls.length = 0;
    platformTimeZone = 'Asia/Shanghai';
});

describe('automatic badge management handler authorization and request scope', () => {
    it('allows only the legacy workspace owner to list and change shared automatic badges', async () => {
        for (const method of ['get', 'postAutoBadgeUpdate', 'postAutoBadgeRemove']) {
            const args = method === 'get' ? ['system'] : ['system', 'record-key'];
            const owner = new BadgeManageHandler();
            await dispatch(owner, method, ...args);
            const beforeDenied = serviceCalls().length;
            for (const uid of [1, 10, 50]) {
                const other = new BadgeManageHandler({ uid, canEditDomain: true });
                await assert.rejects(dispatch(other, method, ...args), PermissionError);
                assert.equal(serviceCalls().length, beforeDenied);
            }
        }
        assert.deepEqual(serviceCalls().map((call) => call.action), ['automatic-list', 'automatic-update', 'automatic-update']);
    });

    it('requires edit-domain permission for both modern reads and writes', async () => {
        for (const method of ['get', 'postAutoBadgeUpdate', 'postAutoBadgeRemove']) {
            const handler = new BadgeManageHandler({ domain: modern, uid: 50, path: '/domain/badge' });
            await assert.rejects(dispatch(handler, method, 'class-a', 'record-key'), PermissionError);
        }
        assert.equal(serviceCalls().length, 0);
        assert.ok(calls.every((call) => call.action === 'permission' && call.permission === PERM.PERM_EDIT_DOMAIN));
        const teacher = new BadgeManageHandler({ domain: modern, uid: 50, path: '/domain/badge', canEditDomain: true });
        await dispatch(teacher, 'get', 'class-a');
        assert.equal(teacher.response.body.badgeBaseTemplate, 'domain_base.html');
        assert.equal(teacher.response.body.manageRoute, 'domain_badge_manage');
        assert.equal(teacher.response.body.badgeScopeTitle, 'A 班 · 域内徽章');
        assert.deepEqual(calls.find((call) => call.action === 'manual-list'), { action: 'manual-list', domainId: 'class-a' });
    });

    it('rejects the domain-management route in legacy domains even when edit-domain permission is present', async () => {
        for (const domain of [{ _id: 'system' }, { _id: 'legacy', workspaceId: 'tang' }]) {
            for (const method of ['get', 'postAutoBadgeUpdate', 'postAutoBadgeRemove']) {
                const handler = new BadgeManageHandler({ domain, uid: 2, path: '/domain/badge', canEditDomain: true });
                await assert.rejects(dispatch(handler, method, domain._id, 'record-key'), PermissionError);
            }
        }
        assert.equal(serviceCalls().length, 0);
    });

    it('does not let a modern workspace teacher reach the owner-only global route', async () => {
        const teacher = new BadgeManageHandler({ domain: modern, uid: 50, path: '/manage/badge', canEditDomain: true });
        await assert.rejects(dispatch(teacher, 'get', 'class-a'), PermissionError);
        assert.equal(serviceCalls().length, 0);
    });

    it('passes independent automatic-list pagination and filters with the platform timezone', async () => {
        platformTimeZone = 'America/New_York';
        const handler = new BadgeManageHandler();
        handler.request.query = { scope: 'foreign', domainId: 'foreign', timeZone: 'UTC' };
        await dispatch(handler, 'get', 'forged-domain', 2, 4, '君豪', 'expired');
        assert.deepEqual(calls.find((call) => call.action === 'paginate'), {
            action: 'paginate', cursor: { scopedDomainId: undefined }, page: 2, size: 10,
        });
        assert.deepEqual(serviceCalls()[0], {
            action: 'automatic-list', domain: handler.domain,
            options: { query: '君豪', status: 'expired', page: 4, timeZone: 'America/New_York' },
        });
        assert.equal(handler.response.template, 'badge_manage.html');
        assert.equal(handler.response.body.page, 2);
        assert.equal(handler.response.body.dpcount, 3);
        assert.equal(handler.response.body.badgeBaseTemplate, 'manage_base.html');
        assert.strictEqual(handler.response.body.autoBadgeRows, autoRows.autoBadgeRows);
    });

    it('defaults automatic list parameters and timezone without relying on student preferences', async () => {
        platformTimeZone = undefined;
        const handler = new BadgeManageHandler();
        handler.user.timeZone = 'Europe/London';
        await dispatch(handler, 'get', 'system');
        assert.deepEqual(serviceCalls()[0].options, {
            query: '', status: 'active', page: 1, timeZone: 'Asia/Shanghai',
        });
    });

    it('uses the authenticated domain and operator for updates, ignoring submitted scope and actor fields', async () => {
        platformTimeZone = 'Asia/Tokyo';
        const handler = new BadgeManageHandler({ domain: modern, uid: 50, path: '/domain/badge', canEditDomain: true });
        handler.request.body = { domainId: 'foreign', scope: 'global', uid: 10, operatorUid: 2, timeZone: 'UTC' };
        await dispatch(handler, 'postAutoBadgeUpdate', 'forged-domain', '10:7:verified-key', '2026-10-02T18:30', false);
        assert.deepEqual(serviceCalls()[0], {
            action: 'automatic-update', domain: modern,
            options: {
                key: '10:7:verified-key', expiresAt: '2026-10-02T18:30', permanent: false,
                operatorUid: 50, timeZone: 'Asia/Tokyo',
            },
        });
        assert.deepEqual(handler.response.body, { ok: true });
        await dispatch(handler, 'postAutoBadgeUpdate', 'forged-domain', '10:7:verified-key', '', true);
        assert.equal(serviceCalls()[1].options.permanent, true);
    });

    it('uses the authenticated domain and operator for removal and exposes no submitted arbitrary badge/owner mutation', async () => {
        const handler = new BadgeManageHandler({ domain: modern, uid: 50, path: '/domain/badge', canEditDomain: true });
        handler.request.body = { domainId: 'system', scope: 'global', uid: 2, badgeId: 999, operatorUid: 2 };
        await dispatch(handler, 'postAutoBadgeRemove', 'system', '10:7:verified-key');
        assert.deepEqual(serviceCalls()[0], {
            action: 'automatic-update', domain: modern,
            options: { key: '10:7:verified-key', remove: true, operatorUid: 50 },
        });
        assert.deepEqual(handler.response.body, { ok: true });
    });

    it('declares only the intended parsed route parameters for list, edit, and removal', () => {
        assert.deepEqual(params.get('BadgeManageHandler.get'), [
            ['page', 'positive-int', true], ['autoPage', 'positive-int', true],
            ['autoQuery', 'string', true], ['autoStatus', 'string', true],
        ]);
        assert.deepEqual(params.get('BadgeManageHandler.postAutoBadgeUpdate'), [
            ['key', 'string'], ['expiresAt', 'string', true], ['permanent', 'boolean', true],
        ]);
        assert.deepEqual(params.get('BadgeManageHandler.postAutoBadgeRemove'), [['key', 'string']]);
    });
});
