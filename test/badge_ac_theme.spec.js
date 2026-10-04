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
        module, exports: module.exports, require: (name) => {
            if (!(name in dependencies)) throw Error(name);
            return dependencies[name];
        },
    });
    return module.exports;
}
const badgeImage = load('packages/hydrooj/src/lib/badge_image.ts');
const dependencies = { './badge_image': badgeImage, '../model/workspace': {
    LEGACY_WORKSPACE_ID: 'tang', resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang',
} };
const { getActiveBadgeAcTheme } = load('packages/hydrooj/src/lib/badge_ac_theme.ts', dependencies);
const { getImageWarmupPage } = load('packages/hydrooj/src/lib/image_prewarm.ts', dependencies);
function fixture(badges) {
    const calls = []; const state = { selected: 7, badgeIds: [9, 7] };
    const ctx = { db: { collection: (name) => ({
        find(query) {
            calls.push({ name, query });
            return { project() { return this; }, sort() { return this; }, limit() { return this; },
                async toArray() {
                    if (name === 'userBadge') return state.badgeIds.map((badgeId) => ({ badgeId }));
                    if (name === 'badge') return badges;
                    if (name === 'storage') return badges.map((badge) => ({ path: badge.acImagePath, size: 1000 }));
                    return [];
                } };
        },
        async findOne(query) { calls.push({ name, query }); return { badgeProfileBackgroundBadgeId: state.selected }; },
    }) } };
    const route = (name, args) => `/${name}/${args.id}?${new URLSearchParams(args.query)}`;
    return { ctx, state, calls, route };
}
it('the active celebration uses the exact warmup display URL with encoded domain and current image version', async () => {
    const badge = { _id: 7, short: '勇者', acImagePath: 'badge/7/ac.png', acImageUpdatedAt: 'v 1&new' };
    const f = fixture([badge]); const domain = { _id: 'C++', workspaceId: 'classroom' };
    const theme = await getActiveBadgeAcTheme(f.ctx, { _id: 42 }, f.route, domain);
    const warm = await getImageWarmupPage(f.ctx, domain, 42);
    assert.equal(theme.acImage, '/d/C%2B%2B/badge/7/ac-image?size=384&v=v%201%26new');
    assert.equal(theme.acImage, warm.items[0].url, 'full-size originals cannot bypass the prewarmed display variant');
    assert.equal(f.calls[0].query.owner, 42); assert.equal(f.calls[0].query.domainId, 'C++');
    assert.equal(f.calls[1].query.domainId, 'C++');
    badge.acImageUpdatedAt = 'v2';
    const changed = await getActiveBadgeAcTheme(f.ctx, { _id: 42 }, f.route, domain);
    assert.notEqual(changed.acImage, theme.acImage); assert.match(changed.acImage, /v=v2$/);
});
it('theme switching follows the current user and preserves legacy badge scope and versioned audio', async () => {
    const f = fixture([
        { _id: 7, short: '勇者', acImagePath: 'badge/7/ac.png', acImageUpdatedAt: 'v1' },
        { _id: 9, title: '星空', themeSoundPath: 'badge/9/sound.mp3', themeSoundUpdatedAt: 's2' },
    ]);
    const first = await getActiveBadgeAcTheme(f.ctx, { _id: 42 }, f.route, { _id: 'system' });
    assert.equal(first.id, 7); assert.equal(first.acImage, '/d/system/badge/7/ac-image?size=384&v=v1');
    assert.equal(f.calls[0].query.domainId.$exists, false); assert.equal(f.calls[1].query.domainId.$exists, false);
    f.state.selected = 9;
    const switched = await getActiveBadgeAcTheme(f.ctx, { _id: 42 }, f.route, { _id: 'system' });
    assert.equal(switched.id, 9); assert.equal(switched.acImage, ''); assert.equal(switched.themeSound, '/badge_theme_sound/9?v=s2');
    f.state.badgeIds = [];
    assert.equal(await getActiveBadgeAcTheme(f.ctx, { _id: 43 }, f.route, { _id: 'system' }), null);
});
it('callers without a domain still request the display variant through their authorized route helper', async () => {
    const f = fixture([{ _id: 7, acImagePath: 'badge/7/ac.png', acImageUpdatedAt: 'v1' }]);
    const theme = await getActiveBadgeAcTheme(f.ctx, { _id: 42 }, f.route);
    assert.equal(theme.acImage, '/badge_ac_image/7?size=384&v=v1');
});
