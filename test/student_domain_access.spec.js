const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '../packages/hydrooj/src');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function load(source, dependencies = {}, globals = {}) {
    const mod = { exports: {} };
    vm.runInNewContext(transformSync(source, {
        loader: 'ts', format: 'cjs',
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, {
        module: mod, exports: mod.exports,
        require: (name) => dependencies[name] || require(name), ...globals,
    });
    return mod.exports;
}

const allowAsset = () => false;
const layer = load(read('service/layers/workspace.ts'), {
    '../../lib/decorative_image_access': {
        isHomePosterImageRequest: allowAsset,
    },
    '../../lib/domain_avatar_access': { isDomainAvatarImageRequest: allowAsset },
    '../../lib/scratch_share_access': { isScratchShareRequest: allowAsset },
    '../../model/workspace': {
        isEnabled: () => true,
        isPlatformAdmin: (uid) => uid === 2,
        getAssignedWorkspaceIds: async () => [],
        resolveDomainWorkspaceId: () => 'legacy',
        LEGACY_WORKSPACE_ID: 'legacy',
    },
});

function context(membership, route = '/p/1000', method = 'GET', uid = 20, domainId = 'class-a') {
    return {
        HydroContext: { user: { _id: uid, _dudoc: membership } },
        request: { path: route, method, querystring: '' },
        domainInfo: { _id: domainId },
        originalPath: `/d/${domainId}${route}`,
    };
}

function joinHandler(membership) {
    const source = read('handler/domain.ts');
    const start = source.indexOf('class DomainJoinHandler extends Handler {');
    const end = source.indexOf('\nclass DomainSearchHandler', start);
    assert.ok(start >= 0 && end > start);
    class DomainJoinForbiddenError extends Error {}
    class DomainJoinAlreadyMemberError extends Error {}
    const Handler = class {
        constructor() { this.user = { _id: 20, hasPriv: () => false }; }
    };
    const domain = {
        get: async () => ({ _id: 'class-a', roles: { default: 1 } }),
        collUser: { findOne: async () => membership },
        getRoles: async () => [{ _id: 'default' }],
        getJoinSettings: () => ({ method: 1, role: 'default' }),
    };
    const workspace = {
        getAssignedWorkspaceIds: async () => [],
        resolveDomainWorkspaceId: () => 'legacy',
        LEGACY_WORKSPACE_ID: 'legacy',
        isPlatformAdmin: () => false,
    };
    const Constructor = load(`${source.slice(start, end)}\nmodule.exports = DomainJoinHandler;`, {}, {
        Handler, domain, workspace, param: () => () => {}, Types: { DomainId: {}, Content: {} },
        PRIV: { PRIV_MANAGE_ALL_DOMAIN: 4 },
        NotFoundError: Error, DomainJoinForbiddenError, DomainJoinAlreadyMemberError,
    });
    return { handler: new Constructor(), DomainJoinForbiddenError };
}

describe('management removal blocks access while preserving normal guest behavior', () => {
    it('rejects existing and new HTTP/WS requests for the removed domain, then restores joined access', async () => {
        const membership = { domainId: 'class-a', join: false, role: 'guest', blockedByStudentManagement: true };
        const blockedRequests = await Promise.all([
            ['/p/1000', 'GET'], ['/p/1000/submit', 'POST'], ['/record-detail-conn', 'GET'],
        ].map(async ([route, method]) => (await layer.resolveWorkspaceAccess(context(membership, route, method))).allowed));
        assert.deepEqual(blockedRequests, [false, false, false]);
        assert.equal((await layer.resolveWorkspaceAccess(context(membership, '/login', 'GET'))).allowed, true);
        assert.equal((await layer.resolveWorkspaceAccess(context(membership, '/p/1000', 'GET', 2))).allowed, true);
        assert.equal((await layer.resolveWorkspaceAccess(context(membership, '/p/1000', 'GET', 20, 'class-b'))).allowed, true);
        assert.equal((await layer.resolveWorkspaceAccess(context({ domainId: 'class-a', role: 'guest' }))).allowed, true);

        membership.join = true;
        membership.role = 'default';
        membership.blockedByStudentManagement = false;
        assert.equal((await layer.resolveWorkspaceAccess(context(membership))).allowed, true);
        assert.equal((await layer.resolveWorkspaceAccess(context(membership, '/record-detail-conn'))).allowed, true);
    });

    it('blocks a removed student from self joining via a different domain', async () => {
        const { handler, DomainJoinForbiddenError } = joinHandler({
            domainId: 'class-a', join: false, role: 'guest', blockedByStudentManagement: true,
        });
        await assert.rejects(handler.prepare({ domainId: 'class-b' }, 'class-a'), DomainJoinForbiddenError);
        const unblocked = joinHandler(null);
        await unblocked.handler.prepare({ domainId: 'class-b' }, 'class-a');
        assert.equal(unblocked.handler.joinSettings.role, 'default');
    });

    it('uses the same access gate for HTTP and WebSocket handler creation', () => {
        const server = read('service/server.ts');
        assert.match(server, /on\('handler\/create\/http',[\s\S]*?resolveWorkspaceAccess\(h\.context\)/);
        assert.match(server, /on\('handler\/create\/ws',[\s\S]*?resolveWorkspaceAccess\(h\.context\)/);
    });
});
