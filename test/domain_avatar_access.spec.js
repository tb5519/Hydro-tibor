const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const root = path.resolve(__dirname, '../packages/hydrooj/src');

function load(source, dependencies = {}, globals = {}) {
    const mod = { exports: {} };
    vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
        module: mod, exports: mod.exports, require: (name) => dependencies[name] || require(name), ...globals,
    });
    return mod.exports;
}
const helpers = load(fs.readFileSync(path.join(root, 'lib/domain_avatar_access.ts'), 'utf8'));
const avatarPath = '/domain/avatar/avatar-00000000-0000-4000-8000-000000000001.png';
const server = fs.readFileSync(path.join(root, 'service/server.ts'), 'utf8');
const guestSource = server.slice(server.indexOf('const GUEST_ACCESSIBLE_PATHS'), server.indexOf("declare module '@hydrooj/framework'"));
const guest = load(`${guestSource}\nexport { isGuestAccessiblePath };`, {}, helpers);
const workspace = load(fs.readFileSync(path.join(root, 'service/layers/workspace.ts'), 'utf8'), {
    '../../lib/domain_avatar_access': helpers,
    '../../model/workspace': {
        isEnabled: () => true,
        isPlatformAdmin: () => false,
        getAssignedWorkspaceIds: async () => ['own-workspace'],
        resolveDomainWorkspaceId: () => 'other-workspace',
        getDomains: async () => [{ _id: 'own-domain' }],
        LEGACY_WORKSPACE_ID: 'legacy',
    },
});
const context = (route, method) => ({
    HydroContext: { user: { _id: 40 } }, request: { path: route, method, querystring: '' },
    domainInfo: { _id: 'other-domain' }, originalPath: `/d/other-domain${route}`,
});

describe('public domain avatar access', () => {
    it('allows only exact avatar images on GET and HEAD for guests', () => {
        assert.equal(guest.isGuestAccessiblePath(avatarPath, 'get'), true);
        assert.equal(guest.isGuestAccessiblePath(avatarPath, 'HEAD'), true);
        for (const method of ['POST', 'put', 'DELETE', 'PATCH']) assert.equal(guest.isGuestAccessiblePath(avatarPath, method), false);
        for (const route of ['/domain/avatar', '/domain/edit', '/domain/dashboard', '/domain/avatar/other.png',
            '/domain/avatar/../private.png', `${avatarPath}/extra`, `${avatarPath}.svg`]) {
            assert.equal(guest.isGuestAccessiblePath(route, 'GET'), false);
        }
        assert.equal(guest.isGuestAccessiblePath('/login', 'post'), true);
    });

    it('allows the same public image across workspaces without allowing upload or management requests', async () => {
        for (const method of ['GET', 'HEAD']) {
            assert.equal((await workspace.resolveWorkspaceAccess(context(avatarPath, method))).allowed, true);
        }
        for (const [route, method] of [[avatarPath, 'POST'], ['/domain/avatar', 'POST'], ['/domain/edit', 'GET'],
            ['/domain/dashboard', 'GET'], ['/domain/avatar/private.png', 'GET']]) {
            assert.equal((await workspace.resolveWorkspaceAccess(context(route, method))).allowed, false);
        }
    });
});
