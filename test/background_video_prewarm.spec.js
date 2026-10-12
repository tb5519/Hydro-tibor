const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
function load(relative, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, relative), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, Date, URL, console,
        require: (name) => { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw Error(name); },
    });
    return module.exports;
}
const workspace = { LEGACY_WORKSPACE_ID: 'tang', resolveDomainWorkspaceId: (domain) => domain.workspaceId || 'tang' };
const paths = load('packages/hydrooj/src/lib/background_video_path.ts');
const { resolveBadgeLifetimes } = load('packages/hydrooj/src/lib/user_badge_gallery.ts', {
    'moment-timezone': {}, '../model/workspace': workspace, './badge_image': {},
});
const { getHomePosterConfig } = load('packages/hydrooj/src/lib/home_poster.ts', { '../model/system': { get: () => undefined } });
const { getBackgroundVideoWarmup, getHomeBackgroundVideoWarmup } = load('packages/hydrooj/src/lib/background_video_prewarm.ts', {
    '../model/builtin': { PERM: { PERM_VIEW: 1n }, PRIV: { PRIV_USER_PROFILE: 1 } },
    '../model/workspace': workspace, './background_video_path': paths, './home_poster': { getHomePosterConfig },
    './user_badge_gallery': { resolveBadgeLifetimes },
});
const stamp = '1791763200000-12345678-1234-4234-8234-123456789abc';
const version = '2026-10-12T01:02:03.000Z';
function media(prefix) {
    return { videoPath: `${prefix}-${stamp}.mp4`, videoPosterPath: `${prefix}-poster-${stamp}.jpg`, videoUpdatedAt: version };
}
function badge(id, legacy = false, extra = {}) {
    const m = media(legacy ? `badge/${id}/profile-video` : `domain/class-a/badge/${id}/profile-video`);
    return { _id: id, users: [], backgroundVideoPath: m.videoPath, backgroundVideoPosterPath: m.videoPosterPath,
        backgroundVideoUpdatedAt: m.videoUpdatedAt, ...extra };
}
function fixture(options = {}) {
    const calls = [];
    const owned = options.owned || [{ badgeId: 7, getAt: new Date('2026-10-11') }];
    const ctx = { db: { collection(name) {
        return { find(query) {
            const call = { name, query }; calls.push(call);
            return { project(value) { call.projection = value; return this; }, async toArray() {
                return name === 'userBadge' ? owned : name === 'badge' ? options.badges || [badge(7, !!options.legacy)] : options.grants || [];
            } };
        }, async findOne(query, projection) { calls.push({ name, query, projection }); return options.account || { badgeProfileBackgroundBadgeId: 7 }; } };
    } } };
    const user = { _id: options.uid ?? 42, hasPriv: () => options.profile !== false, hasPerm: () => options.canView !== false };
    const domain = { _id: 'class-a', workspaceId: options.legacy ? 'tang' : 'workspace-a', homePoster: options.home ?? { image: '/photo.jpg', ...media('domain/class-a/home-video') } };
    const routes = { home_background_video: '/home/video', home_background_video_poster: '/home/video-poster',
        badge_background_video: '/badge/:id/background-video', badge_background_video_poster: '/badge/:id/background-video-poster' };
    const url = (name, args) => `/d/${domain._id}${routes[name].replace(':id', args?.id || '')}?v=${encodeURIComponent(args.query.v)}`;
    return { ctx, domain, user, calls, run: () => getBackgroundVideoWarmup(ctx, domain, user, url, new Date('2026-10-12T02:00:00Z')) };
}

it('warms only current homepage and own selected theme, using stable versioned routes and a minimal data shape', async () => {
    const f = fixture();
    const result = await f.run();
    assert.equal(result.scope, '42:class-a');
    assert.equal(result.items.length, 2);
    assert.match(result.items[0].url, /^\/d\/class-a\/home\/video\?v=/);
    assert.match(result.items[1].url, /^\/d\/class-a\/badge\/7\/background-video\?v=/);
    for (const item of result.items) {
        assert.deepEqual(Object.keys(item).sort(), ['poster', 'url']);
        assert.equal(new URL(item.url, 'https://onebyone.test').searchParams.get('v'), version);
        assert.equal(new URL(item.poster, 'https://onebyone.test').searchParams.get('v'), version);
    }
    for (const call of f.calls.filter((call) => call.name !== 'user')) {
        assert.equal(call.query.domainId, 'class-a');
        if (call.name === 'userBadge') assert.equal(call.query.owner, 42);
        if (call.name === 'lottery.badgeGrant') assert.equal(call.query.uid, 42);
    }
    const serialized = JSON.stringify(result);
    for (const secret of ['videoPath', 'profile-video-', 'media/v1/', 'auth_key', 'users']) assert.equal(serialized.includes(secret), false);
});

it('guests and members without domain view permission never query badge data', async () => {
    for (const options of [{ uid: 0 }, { uid: 1 }, { profile: false }, { canView: false }]) {
        const f = fixture(options);
        assert.equal((await f.run()).items.length, 1);
        assert.equal(f.calls.length, 0);
    }
});

it('rejects arbitrary or cross-domain homepage paths, and absent versions', async () => {
    for (const home of [{ image: '/photo.jpg' }, { ...media('domain/class-b/home-video') },
        { ...media('user/42/private') }, { ...media('domain/class-a/home-video'), videoUpdatedAt: '' }]) {
        const f = fixture({ uid: 0, home });
        assert.equal((await f.run()).items.length, 0);
    }
});

it('legacy badge selection never queries modern badges or other users', async () => {
    const f = fixture({ legacy: true });
    assert.equal((await f.run()).items.length, 2);
    for (const call of f.calls.filter((call) => call.name !== 'user')) assert.equal(call.query.domainId.$exists, false);
    assert.equal(f.calls.find((call) => call.name === 'user').query._id, 42);
});

it('a selected image/sound-only theme never warms another owned video; newest active theme is the default', async () => {
    const owned = [{ badgeId: 7, getAt: new Date('2026-10-10') }, { badgeId: 8, getAt: new Date('2026-10-11') }];
    const f = fixture({ owned, badges: [badge(7), { _id: 8, acImagePath: 'badge/8/ac.png', users: [] }], account: { badgeProfileBackgroundBadgeId: 8 } });
    assert.equal((await f.run()).items.length, 1);
    const g = fixture({ owned, badges: [badge(7), badge(8)], account: {} });
    assert.match((await g.run()).items[1].url, /badge\/8\/background-video/);
});

it('expired and revoked temporary themes are excluded before selection', async () => {
    for (const grant of [{ expiresAt: new Date('2026-10-11') }, { revokedAt: new Date('2026-10-11') },
        { expiresAt: 'invalid' }, { expiredAt: new Date('2026-10-11') }]) {
        const f = fixture({ grants: [{ _id: 'grant', uid: 42, badgeId: 7, ...grant }] });
        assert.equal((await f.run()).items.length, 1);
    }
    const f = fixture({ grants: [{ _id: 'grant', uid: 42, badgeId: 7, expiresAt: new Date('2026-10-13') }] });
    assert.equal((await f.run()).items.length, 2);
});

it('never warms foreign badge storage paths even for a selected badge', async () => {
    const f = fixture({ badges: [badge(7, false, { backgroundVideoPath: media('domain/class-b/badge/7/profile-video').videoPath })] });
    assert.equal((await f.run()).items.length, 1);
});

it('renders synchronous home-only preload configuration without waiting for ownership/catalog queries', () => {
    const f = fixture();
    const source = fs.readFileSync(path.join(root, 'packages/ui-default/index.ts'), 'utf8');
    const start = source.indexOf('      that.UiContext.backgroundVideoWarmup = ');
    const end = source.indexOf(';\n    }', start);
    const expression = source.slice(start, end).replace('      that.UiContext.backgroundVideoWarmup = ', '');
    assert.equal(expression.includes('await'), false);
    assert.equal(expression.includes('getBackgroundVideoWarmup('), false);
    const transformed = transformSync(`export const build = (that) => (${expression});`, { loader: 'ts', format: 'cjs' }).code;
    const module = { exports: {} };
    vm.runInNewContext(transformed, { module, exports: module.exports, getHomeBackgroundVideoWarmup,
        PRIV: { PRIV_USER_PROFILE: 1 }, PERM: { PERM_VIEW: 1n } });
    const url = (name, args) => name === 'background_video_warmup' ? '/d/class-a/background-video-warmup'
        : `/d/class-a/${name}?v=${encodeURIComponent(args.query.v)}`;
    const config = module.exports.build({ domain: f.domain, user: f.user, url });
    assert.equal(config.items.length, 1);
    assert.equal(config.catalog, '/d/class-a/background-video-warmup');
    assert.equal(f.calls.length, 0);
    const guest = module.exports.build({ domain: f.domain, user: { _id: 0 }, url });
    assert.equal(guest.items.length, 1);
    assert.equal(guest.catalog, '');
    const denied = module.exports.build({ domain: f.domain, user: { ...f.user, hasPerm: () => false }, url });
    assert.equal(denied.catalog, '');
});

it('the idle catalog endpoint enforces authentication/domain view and ignores requested other-user IDs', async () => {
    const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/home.ts'), 'utf8');
    const start = source.indexOf('class BackgroundVideoWarmupHandler');
    const end = source.indexOf('class ImageWarmupHandler', start);
    assert.ok(start >= 0 && end > start);
    const module = { exports: {} };
    const calls = [];
    class Handler {}
    const transformed = transformSync(`export ${source.slice(start, end)}`, { loader: 'ts', format: 'cjs' }).code;
    vm.runInNewContext(transformed, { module, exports: module.exports, Handler,
        PRIV: { PRIV_USER_PROFILE: 1 }, PERM: { PERM_VIEW: 1n },
        getBackgroundVideoWarmup: async (...args) => { calls.push(args); return { scope: '42:class-a', items: [] }; } });
    const create = (denial) => Object.assign(new module.exports.BackgroundVideoWarmupHandler(), {
        domain: { _id: 'class-a' }, user: { _id: 42 }, ctx: { db: {} },
        request: { query: { uid: 99, domainId: 'class-b' } },
        response: { headers: {}, addHeader(name, value) { this.headers[name] = value; } },
        url: () => '/current-authorized-route',
        checkPriv: () => { if (denial === 'priv') throw Error('not authenticated'); },
        checkPerm: () => { if (denial === 'perm') throw Error('no domain access'); },
    });
    for (const denial of ['priv', 'perm']) await assert.rejects(create(denial).get());
    assert.equal(calls.length, 0);
    const handler = create();
    await handler.get();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1]._id, 'class-a');
    assert.equal(calls[0][2]._id, 42);
    assert.equal(handler.response.type, 'application/json');
    assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
    assert.equal(handler.response.headers.Vary, 'Cookie, Authorization');
    assert.match(source, /ctx\.Route\('background_video_warmup', '\/background-video-warmup', BackgroundVideoWarmupHandler, PRIV\.PRIV_USER_PROFILE\)/);
});
