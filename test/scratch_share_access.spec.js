const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const root = path.resolve(__dirname, '../packages/hydrooj/src');
function load(source, dependencies = {}, globals = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, require: (name) => dependencies[name] || require(name), ...globals,
    });
    return module.exports;
}
const share = load(fs.readFileSync(path.join(root, 'lib/scratch_share_access.ts'), 'utf8'));
const avatar = load(fs.readFileSync(path.join(root, 'lib/domain_avatar_access.ts'), 'utf8'));
const poster = load(fs.readFileSync(path.join(root, 'lib/decorative_image_access.ts'), 'utf8'));
const server = fs.readFileSync(path.join(root, 'service/server.ts'), 'utf8');
const guestSource = server.slice(server.indexOf('const GUEST_ACCESSIBLE_PATHS'), server.indexOf("declare module '@hydrooj/framework'"));
const guest = load(`${guestSource}\nexport { isGuestAccessiblePath };`, {}, { ...share, ...avatar, ...poster });
const workspace = load(fs.readFileSync(path.join(root, 'service/layers/workspace.ts'), 'utf8'), {
    '../../lib/decorative_image_access': poster,
    '../../lib/domain_avatar_access': avatar,
    '../../lib/scratch_share_access': share,
    '../../model/workspace': {
        isEnabled: () => true, isPlatformAdmin: () => false,
        getAssignedWorkspaceIds: async () => ['my-workspace'],
        resolveDomainWorkspaceId: () => 'a-different-workspace',
        getDomains: async () => [{ _id: 'my-domain' }], LEGACY_WORKSPACE_ID: 'legacy',
    },
});
const context = (route, method) => ({
    HydroContext: { user: { _id: 50 } }, request: { path: route, method, querystring: '' },
    domainInfo: { _id: 'different-domain' }, originalPath: `/d/different-domain${route}`,
});
const token = 'ab'.repeat(32);
const publicRoutes = [`/scratch/share/${token}`, `/scratch/share/${token}/project`];
const privateRoutes = [
    '/scratch', '/scratch/works', '/scratch/editor', '/scratch/assignments', '/scratch/materials',
    '/scratch/work/123/share', '/scratch/file/123', '/p', '/ranking', '/domain/user',
    '/scratch/share', '/scratch/share/guess', `/scratch/share/${token.slice(1)}`, `/scratch/share/${token}/project/extra`,
    `/scratch/share/${token}/file/123`, `/scratch/share/${token.toUpperCase()}`, `/scratch/share/${token}/../works`,
];

describe('token-scoped public Scratch player access', () => {
    it('allows only exact share and project GET/HEAD requests through the guest login boundary', () => {
        for (const route of publicRoutes) {
            for (const method of ['GET', 'HEAD', 'get', 'head']) assert.equal(guest.isGuestAccessiblePath(route, method), true);
            for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) assert.equal(guest.isGuestAccessiblePath(route, method), false);
        }
        for (const route of privateRoutes) {
            for (const method of ['GET', 'HEAD', 'POST']) assert.equal(guest.isGuestAccessiblePath(route, method), false, `${method} ${route}`);
        }
    });

    it('lets a share recipient in another workspace play only the token-scoped snapshot', async () => {
        for (const route of publicRoutes) {
            for (const method of ['GET', 'HEAD']) assert.equal((await workspace.resolveWorkspaceAccess(context(route, method))).allowed, true);
            assert.equal((await workspace.resolveWorkspaceAccess(context(route, 'POST'))).allowed, false);
        }
        for (const route of privateRoutes) {
            assert.equal((await workspace.resolveWorkspaceAccess(context(route, 'GET'))).allowed, false, route);
        }
    });
});
