const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { it } = require('node:test');
const { PNG } = require('pngjs');
const { validateBadgeIconImage, BADGE_ICON_IMAGE_LIMIT } = require('../addons/badge-for-hydrooj/icon_image');
const badgeImage = require('../packages/hydrooj/src/lib/badge_image');

const png = (width = 320, height = 96) => PNG.sync.write({ width, height, data: Buffer.alloc(width * height * 4, 128) });

it('accepts transparent PNG artwork without changing its pixels or the AC artwork URL', () => {
    const bytes = png();
    assert.deepEqual(validateBadgeIconImage(bytes, '.png'), { width: 320, height: 96, contentType: 'image/png' });
    assert.equal(PNG.sync.read(bytes).data[3], 128);
    const badge = { _id: 7, iconImagePath: 'icon.png', iconImageUpdatedAt: 'v two', acImagePath: 'large.png', acImageUpdatedAt: 'original' };
    assert.equal(badgeImage.getBadgeIconUrl('C++', badge), '/d/C%2B%2B/badge/7/icon-image?v=v%20two');
    assert.equal(badgeImage.getBadgeAcCelebrationUrl('C++', badge), '/d/C%2B%2B/badge/7/ac-image?v=original');
    assert.equal(badgeImage.getBadgeIconUrl('C++', { _id: 7, acImagePath: 'large.png' }), '');
});

it('rejects non-raster content, renamed files, oversized files, malformed and oversized pixel buffers', () => {
    for (const [bytes, ext] of [[Buffer.from('<svg onload="alert(1)"></svg>'), '.png'], [png(), '.webp'],
        [png().subarray(0, -12), '.png'], [png(), '.svg'], [Buffer.alloc(BADGE_ICON_IMAGE_LIMIT + 1), '.png']]) {
        assert.throws(() => validateBadgeIconImage(bytes, ext));
    }
    const giant = png();
    giant.writeUInt32BE(100000, 16);
    assert.throws(() => validateBadgeIconImage(giant, '.png'), /Invalid/);
    const crc = png();
    crc[30] ^= 1;
    assert.throws(() => validateBadgeIconImage(crc, '.png'), /Invalid/);
});

it('recognizes JPEG, GIF and WebP signatures and rejects extension spoofing', () => {
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    assert.deepEqual(validateBadgeIconImage(gif, '.gif'), { width: 1, height: 1, contentType: 'image/gif' });
    const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
    assert.deepEqual(validateBadgeIconImage(webp, '.webp'), { width: 1, height: 1, contentType: 'image/webp' });
    const jpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xC0, 0, 8, 8, 0, 32, 1, 64, 1, 0xFF, 0xD9]);
    assert.deepEqual(validateBadgeIconImage(jpg, '.jpg'), { width: 320, height: 32, contentType: 'image/jpeg' });
    assert.throws(() => validateBadgeIconImage(gif, '.jpg'));
});

let state;
class PermissionError extends Error {}
class NotFoundError extends Error {}
class ValidationError extends Error {}
class Handler {
    constructor(domain = { _id: 'Python' }, uid = 2) {
        this.domain = domain;
        this.user = { _id: uid };
        this.request = { files: {}, path: domain.workspaceId ? '/domain/badge/7/edit' : '/badge/7/edit' };
        this.response = { headers: {}, addHeader(key, value) { this.headers[key] = value; } };
        this.ctx = { db: { collection: (name) => ({ updateOne: async (query, update) => {
            assert.equal(name, 'badge');
            state.updates.push({ query, update });
            if (state.databaseFailure) throw new Error('database unavailable');
            Object.assign(state.badge, update.$set || {});
            Object.keys(update.$unset || {}).forEach((key) => delete state.badge[key]);
            if (state.acknowledgementFailure) throw new Error('database acknowledgement lost');
            return { matchedCount: 1 };
        }, findOne: async () => state.badge }) } };
    }
    checkPerm(permission) { if (this.user._id !== 2) throw new PermissionError(permission); }
    url(name, args) { return `/${name}/${args?.id || ''}`; }
}
const badgeModel = {
    async badgeGet(ctx, id, domainId) { return state.badge?._id === id && state.badge.domainId === domainId ? { ...state.badge } : null; },
    async badgeEdit() { state.edited++; },
    async badgeAdd(ctx, short, title, backgroundColor, fontColor, content, users, id, domainId) {
        state.badge = { _id: 7, short, title, backgroundColor, fontColor, content, users, ...(domainId ? { domainId } : {}) };
        return 7;
    },
    async badgeDel() { state.badge = null; state.deleted++; },
};
const storage = {
    async put(filename, bytes, owner) {
        state.uploads.push({ filename, bytes, owner });
        if (state.storageFailure) throw new Error('OSS unavailable');
        state.images[filename] = Buffer.isBuffer(bytes) ? bytes : await fs.readFile(bytes);
    },
    async del(paths) { state.removals.push(...paths); },
    async getMeta(filename) { state.reads.push(filename); return { size: 99, 'Content-Type': 'image/png' }; },
    async get(filename) { return state.images[filename] || Buffer.from(filename); },
};
let addon;
const originalLoad = Module._load;
const previousHydro = global.Hydro;
try {
    global.Hydro = { model: { userBadge: {}, badge: badgeModel, user: {} } };
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/addons/badge-for-hydrooj/index.ts')) {
            if (request === 'hydrooj') return { Handler, PermissionError, NotFoundError, ValidationError,
                param: () => () => {}, Types: {}, PRIV: {}, PERM: { PERM_EDIT_DOMAIN: 7 }, STATUS: {},
                assetDelivery: { tryRedirectAsset(handler, source) {
                    state.delivery.push(source);
                    if (!state.remote) return false;
                    handler.response.redirect = 'https://media.example.test/original-icon.png';
                    return true;
                } } };
            if (request === 'hydrooj/src/lib/badge_image') return badgeImage;
            if (request === 'hydrooj/src/model/storage') return storage;
            if (request === 'hydrooj/src/model/user') return { deleteUserCache() { state.invalidated++; } };
            if (request === 'hydrooj/src/model/workspace') return { LEGACY_WORKSPACE_ID: 'tang',
                resolveDomainWorkspaceId: (domain) => domain.workspaceId || 'tang',
                getLegacyWorkspace: async () => ({ ownerUid: 2 }) };
            if (request.startsWith('hydrooj/src/')) return {};
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    addon = require('../addons/badge-for-hydrooj/index');
} finally {
    Module._load = originalLoad;
    global.Hydro = previousHydro;
}

function setup(extra = {}) {
    state = { badge: { _id: 7, users: [], acImagePath: 'original-ac.png', acImageUpdatedAt: 'unchanged', ...extra },
        uploads: [], removals: [], reads: [], delivery: [], updates: [], images: {}, edited: 0, invalidated: 0, deleted: 0 };
}
async function uploadFile(test, bytes = png(), name = 'custom.png') {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'badge-icon-'));
    test.after(() => fs.rm(directory, { recursive: true, force: true }));
    const filepath = path.join(directory, 'upload');
    await fs.writeFile(filepath, bytes);
    return { size: bytes.length, filepath, originalFilename: name };
}
const update = (handler, remove = false) => handler.postUpdate(handler.domain._id, 7, 'Badge', 'Badge title', '123456', 'ffffff', 'Content', [], false, false, false, remove);

it('inherits the existing legacy owner and domain teacher permissions for icon upload', async () => {
    setup();
    await new addon.BadgeEditHandler().prepare();
    await assert.rejects(new addon.BadgeEditHandler({ _id: 'Python' }, 9).prepare(), PermissionError);
    await new addon.BadgeEditHandler({ _id: 'A', workspaceId: 'teacher' }).prepare();
    await assert.rejects(new addon.BadgeEditHandler({ _id: 'A', workspaceId: 'teacher' }, 9).prepare(), PermissionError);
});

it('stores the independent icon, keeps AC bytes untouched, cleans replaced objects and invalidates selected-label cache', async (test) => {
    setup({ iconImagePath: 'old-icon.png', iconImageUpdatedAt: 'old' });
    const handler = new addon.BadgeEditHandler();
    handler.request.files.iconImage = await uploadFile(test);
    await update(handler);
    assert.equal(state.uploads.length, 1);
    assert.match(state.uploads[0].filename, /^badge\/7\/badge-icon-\d+-[a-f0-9]{16}\.png$/);
    assert.deepEqual(state.uploads[0].bytes, png());
    assert.equal(state.badge.acImagePath, 'original-ac.png');
    assert.equal(state.badge.acImageUpdatedAt, 'unchanged');
    assert.deepEqual(state.removals, ['old-icon.png']);
    assert.equal(state.badge.iconImagePath, state.uploads[0].filename);
    assert.equal(state.invalidated, 1);
    assert.deepEqual(state.updates[0].query.domainId, { $exists: false });
});

it('simultaneous small-icon and AC uploads retain separate storage fields, versions and exact delivered bytes', async (test) => {
    setup({ iconImagePath: 'old-icon.png', iconImageUpdatedAt: 'old-icon-version' });
    const iconBytes = png(320, 96);
    const acBytes = png(1200, 1200);
    const handler = new addon.BadgeEditHandler();
    handler.request.files.iconImage = await uploadFile(test, iconBytes, 'label.png');
    handler.request.files.acImage = await uploadFile(test, acBytes, 'celebration.png');
    await update(handler);
    const saved = { ...state.badge };
    assert.match(saved.iconImagePath, /^badge\/7\/badge-icon-/);
    assert.match(saved.acImagePath, /^badge\/7\/ac-effect-/);
    assert.equal(typeof saved.iconImageUpdatedAt, 'string');
    assert.equal(typeof saved.acImageUpdatedAt, 'string');
    assert.notEqual(saved.iconImageUpdatedAt, 'old-icon-version');
    assert.notEqual(saved.acImageUpdatedAt, 'unchanged');
    assert.equal(state.updates[0].update.$set.iconImagePath, saved.iconImagePath);
    assert.equal(state.updates[0].update.$set.acImagePath, saved.acImagePath);
    assert.deepEqual(state.removals.sort(), ['old-icon.png', 'original-ac.png']);
    const icon = new addon.BadgeIconImageHandler();
    const ac = new addon.BadgeAcImageHandler();
    await icon.get('Python', 7);
    await ac.get('Python', 7);
    assert.deepEqual(icon.response.body, iconBytes);
    assert.deepEqual(ac.response.body, acBytes);
    assert.equal(PNG.sync.read(icon.response.body).width, 320);
    assert.equal(PNG.sync.read(ac.response.body).width, 1200);
    assert.deepEqual(state.delivery.map((item) => item.path), [saved.iconImagePath, saved.acImagePath]);
    assert.equal(badgeImage.getBadgeAcCelebrationUrl('Python', saved).includes('/icon-image'), false);
    assert.equal(badgeImage.getBadgeIconUrl('Python', saved).includes('/ac-image'), false);
    assert.deepEqual(state.badge, saved, 'delivery and URL generation never rewrite saved artwork');
});

it('replacing or removing only AC artwork never replaces or removes the small-icon label', async (test) => {
    setup({ iconImagePath: 'label.png', iconImageUpdatedAt: 'label-version' });
    const handler = new addon.BadgeEditHandler();
    handler.request.files.acImage = await uploadFile(test, png(600, 800), 'new-ac.png');
    await update(handler);
    assert.equal(state.badge.iconImagePath, 'label.png');
    assert.equal(state.badge.iconImageUpdatedAt, 'label-version');
    assert.deepEqual(state.removals, ['original-ac.png']);
    const acPath = state.badge.acImagePath;
    await new addon.BadgeEditHandler().postUpdate('Python', 7, 'Badge', 'Badge title', '123456', 'ffffff', 'Content', [], false, true, false, false);
    assert.equal(state.badge.acImagePath, undefined);
    assert.equal(state.badge.acImageUpdatedAt, undefined);
    assert.equal(state.badge.iconImagePath, 'label.png');
    assert.equal(state.badge.iconImageUpdatedAt, 'label-version');
    assert.deepEqual(state.removals, ['original-ac.png', acPath]);
});

it('removal restores the original badge label without removing AC effects', async () => {
    setup({ iconImagePath: 'old-icon.png', iconImageUpdatedAt: 'old' });
    await update(new addon.BadgeEditHandler(), true);
    assert.equal(state.badge.iconImagePath, undefined);
    assert.equal(state.badge.iconImageUpdatedAt, undefined);
    assert.equal(state.badge.acImagePath, 'original-ac.png');
    assert.deepEqual(state.removals, ['old-icon.png']);
    assert.equal(state.uploads.length, 0);
});

it('domain-scoped upload and delivery cannot access another domain or global badge', async (test) => {
    setup({ domainId: 'A' });
    const handler = new addon.BadgeEditHandler({ _id: 'A', workspaceId: 'teacher' });
    handler.request.files.iconImage = await uploadFile(test);
    await update(handler);
    assert.match(state.uploads[0].filename, /^domain\/A\/badge\/7\/badge-icon-/);
    assert.equal(state.updates[0].query.domainId, 'A');
    await assert.rejects(new addon.BadgeIconImageHandler({ _id: 'B', workspaceId: 'teacher' }).get('B', 7), NotFoundError);
    await assert.rejects(new addon.BadgeIconImageHandler({ _id: 'Python' }).get('Python', 7), NotFoundError);
    assert.equal(state.delivery.length, 0);
});

it('validates raster contents before mutating the badge and preserves previous artwork on upload failure', async (test) => {
    setup({ iconImagePath: 'old-icon.png' });
    const bad = new addon.BadgeEditHandler();
    bad.request.files.iconImage = await uploadFile(test, Buffer.from('<svg>not a PNG</svg>'));
    await assert.rejects(update(bad), ValidationError);
    assert.equal(state.edited, 0);
    assert.equal(state.uploads.length, 0);
    const valid = new addon.BadgeEditHandler();
    valid.request.files.iconImage = await uploadFile(test);
    state.storageFailure = true;
    await assert.rejects(update(valid), /OSS unavailable/);
    assert.equal(state.badge.iconImagePath, 'old-icon.png');
    assert.deepEqual(state.removals, []);
});

it('supports uploading on badge creation, and rolls back an unsuccessful new icon upload', async (test) => {
    setup();
    const handler = new addon.BadgeAddHandler({ _id: 'A', workspaceId: 'teacher' });
    handler.request.files.iconImage = await uploadFile(test);
    await handler.postAdd('A', 'Badge', 'Title', '123456', 'ffffff', 'Content', []);
    assert.match(state.badge.iconImagePath, /^domain\/A\/badge\/7\/badge-icon-/);
    setup();
    state.storageFailure = true;
    await assert.rejects(handler.postAdd('A', 'Badge', 'Title', '123456', 'ffffff', 'Content', []), /OSS unavailable/);
    assert.equal(state.badge, null);
    assert.equal(state.deleted, 1);
});

it('cleans an unreferenced upload after metadata failure but never deletes an ambiguously committed icon', async (test) => {
    setup({ iconImagePath: 'old-icon.png' });
    const handler = new addon.BadgeEditHandler();
    handler.request.files.iconImage = await uploadFile(test);
    state.databaseFailure = true;
    await assert.rejects(update(handler), /database unavailable/);
    assert.deepEqual(state.removals, [state.uploads[0].filename]);
    assert.equal(state.badge.iconImagePath, 'old-icon.png');
    setup({ iconImagePath: 'old-icon.png' });
    state.acknowledgementFailure = true;
    await assert.rejects(update(handler), /acknowledgement lost/);
    assert.equal(state.badge.iconImagePath, state.uploads[0].filename);
    assert.deepEqual(state.removals, [], 'retaining referenced artwork takes precedence over orphan cleanup');
});

it('serves original icon bytes through existing object delivery with private caching fallback', async () => {
    setup({ iconImagePath: 'icon.png' });
    state.images['icon.png'] = png();
    const handler = new addon.BadgeIconImageHandler();
    await handler.get('Python', 7);
    assert.strictEqual(handler.response.body, state.images['icon.png']);
    assert.equal(handler.response.type, 'image/png');
    assert.equal(handler.response.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(handler.response.headers['Cache-Control'], 'private, max-age=300');
    assert.equal(state.delivery[0].decoration, 'badge');
    state.remote = true;
    const remote = new addon.BadgeIconImageHandler();
    await remote.get('Python', 7);
    assert.equal(remote.response.redirect, 'https://media.example.test/original-icon.png');
    assert.equal(remote.response.body, undefined);
});
