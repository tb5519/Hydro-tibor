const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const nunjucks = require('nunjucks');
const vary = require('vary');

function load(file, deps = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module, exports: module.exports, Date, console,
        require(name) { if (!(name in deps)) throw Error(name); return deps[name]; },
    });
    return module.exports;
}
const workspace = { LEGACY_WORKSPACE_ID: 'legacy', resolveDomainWorkspaceId: (domain) => domain.workspaceId || 'legacy' };
const images = load('packages/hydrooj/src/lib/badge_image.ts');
const { resolveBadgeLifetimes } = load('packages/hydrooj/src/lib/user_badge_gallery.ts', {
    'moment-timezone': {}, '../model/workspace': workspace, './badge_image': images,
});
const { getBadgeIconPreloads } = load('packages/hydrooj/src/lib/badge_icon_prewarm.ts', {
    '../model/workspace': workspace, './badge_image': images, './user_badge_gallery': { resolveBadgeLifetimes },
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const now = new Date('2026-10-21T00:00:00Z');

function fixture(options = {}) {
    const calls = [];
    const owned = options.owned || Array.from({ length: 8 }, (_, index) => ({ badgeId: index + 1 }));
    const badges = options.badges || owned.map((row) => ({ _id: row.badgeId,
        iconImagePath: `badge/${row.badgeId}/icon.png`, iconImageUpdatedAt: `v${row.badgeId}` }));
    const metadata = options.metadata || badges.map((badge) => ({ path: badge.iconImagePath, size: 128 * 1024 }));
    const ctx = { db: { collection: (name) => ({ find(query) {
        const call = { name, query }; calls.push(call);
        return {
            project(value) { call.projection = value; return this; },
            sort(value) { call.sort = value; return this; },
            async toArray() { return ({ userBadge: owned, badge: badges, 'lottery.badgeGrant': options.grants || [], storage: metadata })[name]; },
        };
    } }) } };
    return { ctx, calls };
}
const domain = { _id: 'class-a', workspaceId: 'workspace-a' };

it('prioritizes the selected owned icon, bounds head hints to four and never queries a site-wide badge catalog', async () => {
    const f = fixture();
    const urls = await getBadgeIconPreloads(f.ctx, domain, 42, 4, now);
    assert.deepEqual(plain(urls), [4, 1, 2, 3].map((id) => `/d/class-a/badge/${id}/icon-image?v=v${id}`));
    assert.equal(f.calls.length, 4);
    assert.deepEqual(plain(f.calls[0].query), { owner: 42, domainId: 'class-a' });
    assert.deepEqual(plain(f.calls[1].query), { _id: { $in: [1, 2, 3, 4, 5, 6, 7, 8] }, domainId: 'class-a' });
    assert.deepEqual(plain(f.calls[2].query), { uid: 42, domainId: 'class-a' });
    assert.equal(f.calls[3].name, 'storage');
    assert.equal(f.calls[3].query.autoDelete, null);
    assert.deepEqual(plain(f.calls[3].projection), { path: 1, size: 1 });
    assert.equal(JSON.stringify(f.calls).includes('acImage'), false, 'AC media is not part of icon warming');
});

it('uses active ownership, skips revoked and expired grants and cannot prioritize an unowned badge', async () => {
    const f = fixture({
        owned: [{ badgeId: 8 }, { badgeId: 7 }, { badgeId: 6 }, { badgeId: 5 }, { badgeId: 5 }],
        grants: [
            { badgeId: 8, expiresAt: new Date(now.getTime() - 1) },
            { badgeId: 7, revokedAt: now },
            { badgeId: 6, expiresAt: new Date(now.getTime() + 1000) },
        ],
    });
    const urls = await getBadgeIconPreloads(f.ctx, domain, 42, 999, now);
    assert.deepEqual(plain(urls), ['/d/class-a/badge/6/icon-image?v=v6', '/d/class-a/badge/5/icon-image?v=v5']);
    assert.equal(f.calls[3].query.path.$in.length, 2);
});

it('deduplicates shared artwork, excludes oversized or missing files and keeps total high-priority bytes below one MB', async () => {
    const badges = Array.from({ length: 8 }, (_, index) => ({ _id: index + 1,
        iconImagePath: index === 1 ? 'badge/1/icon.png' : `badge/${index + 1}/icon.png`, iconImageUpdatedAt: 'v1' }));
    const f = fixture({ badges, metadata: [
        { path: 'badge/1/icon.png', size: 400 * 1024 },
        { path: 'badge/3/icon.png', size: 600 * 1024 },
        { path: 'badge/4/icon.png', size: 400 * 1024 },
        { path: 'badge/5/icon.png', size: 300 * 1024 },
        { path: 'badge/6/icon.png', size: 200 * 1024 },
        { path: 'badge/7/icon.png', size: 0 },
    ] });
    const urls = await getBadgeIconPreloads(f.ctx, domain, 42, undefined, now);
    assert.deepEqual(plain(urls), [1, 4, 6].map((id) => `/d/class-a/badge/${id}/icon-image?v=v1`));
});

it('does no work for guests or empty ownership and preserves the exact legacy scope', async () => {
    const f = fixture();
    for (const uid of [0, 1, -1, NaN, '42']) assert.deepEqual(plain(await getBadgeIconPreloads(f.ctx, domain, uid)), []);
    assert.equal(f.calls.length, 0);
    const empty = fixture({ owned: [] });
    assert.deepEqual(plain(await getBadgeIconPreloads(empty.ctx, domain, 42)), []);
    assert.equal(empty.calls.length, 1);
    await getBadgeIconPreloads(f.ctx, { _id: 'system' }, 42, undefined, now);
    assert.deepEqual(plain(f.calls[0].query.domainId), { $exists: false });
    assert.match((await getBadgeIconPreloads(f.ctx, { _id: 'class a' }, 42, undefined, now))[0], /^\/d\/class%20a\/badge\//);
});

const requests = [];
let fail = false;
const { injectBadgeIconPreloads, apply } = load('packages/hydrooj/src/handler/badge_icon_prewarm.ts', {
    '../model/builtin': { PRIV: { PRIV_USER_PROFILE: 1 }, PERM: { PERM_VIEW: 1n } },
    '../lib/badge_icon_prewarm': { async getBadgeIconPreloads(...args) {
        requests.push(args); if (fail) throw Error('unavailable');
        return ['/d/class-a/badge/7/icon-image?v=current'];
    } },
});
function handler(overrides = {}) {
    const value = {
        request: { method: 'GET', headers: {} },
        response: { template: 'daily_quiz.html', status: 200, headers: {}, addHeader(key, value) { this.headers[key] = value; } },
        user: { _id: 42, hasPriv: () => true, hasPerm: () => true, selectedBadgePresentation: { id: 7 } },
        UiContext: {}, ctx: {}, domain, ...overrides,
    };
    value.context = { vary(name) { value.response.headers.Vary = vary.append(value.response.headers.Vary || '', name); } };
    return value;
}

it('injects authenticated personalized head hints on daily practice before idle media catalogs start', async () => {
    requests.length = 0;
    const f = handler(); await injectBadgeIconPreloads(f);
    assert.equal(requests.length, 1);
    assert.equal(requests[0][2], 42); assert.equal(requests[0][3], 7);
    assert.equal(f.UiContext.badgeIconPreloads.length, 1);
    assert.equal(f.response.headers['Cache-Control'], 'private, no-store');
    assert.equal(f.response.headers.Vary, 'Cookie, Authorization');
    let binding;
    apply({ on: (name, callback) => { assert.equal(name, 'handler/after'); binding = callback; } });
    assert.equal(binding, injectBadgeIconPreloads);
});

it('merges authentication Vary tokens without replacing existing negotiation or wildcard headers', async () => {
    for (const before of ['Accept-Encoding, Accept-Language', 'accept-encoding, cookie, AUTHORIZATION', '*']) {
        const f = handler();
        f.response.headers.Vary = before;
        await injectBadgeIconPreloads(f);
        const after = f.response.headers.Vary;
        if (before === '*') assert.equal(after, '*');
        else {
            const tokens = after.toLowerCase().split(',').map((item) => item.trim());
            for (const original of before.toLowerCase().split(',').map((item) => item.trim())) assert.ok(tokens.includes(original));
            assert.equal(tokens.filter((item) => item === 'cookie').length, 1);
            assert.equal(tokens.filter((item) => item === 'authorization').length, 1);
        }
    }
});

it('respects Save-Data, denied permissions and non-page requests without issuing decoration queries', async () => {
    const base = handler(); requests.length = 0;
    const cases = [
        { request: { method: 'POST', headers: {} } },
        { request: { method: 'GET', headers: { 'save-data': 'On' } } },
        { request: { method: 'GET', headers: { 'x-pjax': 'true' } } },
        { request: { method: 'GET', headers: {}, json: true } },
        { request: { method: 'GET', headers: {}, websocket: true } },
        { response: { ...base.response, template: '' } },
        { response: { ...base.response, redirect: '/' } },
        { response: { ...base.response, status: 403 } },
        { user: { ...base.user, _id: 0 } },
        { user: { ...base.user, hasPerm: () => false } },
        { user: { ...base.user, hasPriv: () => false } },
    ];
    for (const item of cases) {
        const f = handler(item); await injectBadgeIconPreloads(f);
        assert.equal(f.UiContext.badgeIconPreloads, undefined);
    }
    assert.equal(requests.length, 0);
    fail = true;
    await injectBadgeIconPreloads(handler());
    fail = false;
});

it('renders same-origin versioned image preloads after critical CSS without scripts or remote URL rewriting', () => {
    const layout = fs.readFileSync('packages/ui-default/templates/layout/html5.html', 'utf8');
    const block = layout.match(/{% for badgeIconUrl in UiContext\.badgeIconPreloads %}[\s\S]*?{% endfor %}/)[0];
    assert.ok(layout.indexOf(block) > layout.indexOf('rel="stylesheet"'));
    assert.ok(layout.indexOf(block) < layout.indexOf('window.UiContext'));
    const env = new nunjucks.Environment(null, { autoescape: true });
    const html = env.renderString(block, { UiContext: { badgeIconPreloads: ['/d/class-a/badge/7/icon-image?v=current'] } });
    assert.match(html, /rel="preload" as="image" href="\/d\/class-a\/badge\/7\/icon-image\?v=current" fetchpriority="high"/);
    assert.equal(/script|crossorigin|ac-image/.test(html), false);
    assert.equal(env.renderString(block, { UiContext: {} }).trim(), '');
});

it('the daily-practice gate exempts only icon GET/HEAD reads and never uploads or management mutations', () => {
    const source = fs.readFileSync('packages/hydrooj/src/handler/daily_quiz.ts', 'utf8');
    const declaration = source.match(/export function isDailyQuizMediaRead\([\s\S]*?\n}/)[0];
    const module = { exports: {} };
    vm.runInNewContext(transformSync(declaration, { loader: 'ts', format: 'cjs' }).code, { module, exports: module.exports });
    const allow = module.exports.isDailyQuizMediaRead;
    assert.equal(allow('/badge/7/icon-image', 'GET'), true);
    assert.equal(allow('/badge/7/icon-image', 'HEAD'), true);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(allow('/badge/7/icon-image', method), false);
    for (const path of ['/badge/7', '/badge/7/manage', '/badge/7/icon-image/upload']) assert.equal(allow(path, 'GET'), false);
});
