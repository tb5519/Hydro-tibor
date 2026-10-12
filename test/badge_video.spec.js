const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

let state;
class Handler {
    constructor(domain = { _id: 'system' }, route = '/badge/7/edit', uid = 2) {
        this.domain = domain;
        this.user = { _id: uid };
        this.request = { path: route, files: { file: { size: 900 }, poster: { size: 120 } } };
        this.response = { headers: {}, addHeader(key, value) { this.headers[key] = value; } };
        this.ctx = { db: { collection: () => ({ updateOne: async (query, update) => {
            state.updates.push({ query, update });
            if (state.databaseFailure) throw new Error('database unavailable');
            if (state.concurrentChange) return { matchedCount: 0 };
            Object.assign(state.badge, update.$set || {});
            Object.keys(update.$unset || {}).forEach((key) => delete state.badge[key]);
            return { matchedCount: 1 };
        } }) } };
    }

    checkPerm(permission) {
        if (this.user._id !== 2) throw new PermissionError(permission);
    }

    url(name, args) { return `/${name}/${args?.id || ''}`; }
}
class PermissionError extends Error {}
class NotFoundError extends Error {}
class ValidationError extends Error {}
const helpers = {
    isBackgroundVideoPath(prefix, storagePath, poster = false) {
        return storagePath === `${prefix}${poster ? '-poster' : ''}-123-example.${poster ? 'jpg' : 'mp4'}`;
    },
    async storeBackgroundVideo(file, poster, owner, prefix) {
        state.uploads.push({ file, poster, owner, prefix });
        if (state.storageFailure) throw new Error('OSS unavailable');
        return { videoPath: `${prefix}-new.mp4`, videoPosterPath: `${prefix}-new.jpg`, videoUpdatedAt: 'v2' };
    },
    async deleteBackgroundVideo(paths, owner) { state.deletions.push({ paths: [...paths], owner }); },
    async redirectBackgroundVideo(handler, storagePath) {
        state.redirects.push(storagePath);
        if (state.storageFailure) throw new Error('OSS unavailable');
        handler.response.status = 302;
        handler.response.redirect = `https://oss.example.test/${storagePath}`;
    },
};
const badgeModel = {
    async badgeGet(ctx, id, domainId) {
        return state.badge?._id === id && state.badge.domainId === domainId ? { ...state.badge } : null;
    },
};
const originalLoad = Module._load;
const previousHydro = global.Hydro;
let addon;
try {
    global.Hydro = { model: { userBadge: {}, badge: badgeModel, user: {} } };
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/addons/badge-for-hydrooj/index.ts')) {
            if (request === 'hydrooj') return { Handler, PermissionError, NotFoundError, ValidationError,
                param: () => () => {}, Types: {}, PRIV: {}, PERM: { PERM_EDIT_DOMAIN: 7 }, STATUS: {} };
            if (request === 'hydrooj/src/lib/background_video') return helpers;
            if (request === 'hydrooj/src/model/workspace') return { LEGACY_WORKSPACE_ID: 'tang',
                resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang',
                getLegacyWorkspace: async () => ({ ownerUid: 2 }) };
            if (request.startsWith('hydrooj/src/') || request === './ac_image_cache') return {};
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    addon = require('../addons/badge-for-hydrooj/index');
} finally {
    Module._load = originalLoad;
    global.Hydro = previousHydro;
}

function setup(extra = {}) {
    state = { badge: { _id: 7, backgroundImagePath: 'original.jpg', backgroundVideoPath: 'old.mp4',
        backgroundVideoPosterPath: 'old.jpg', backgroundVideoUpdatedAt: 'v1', ...extra },
    uploads: [], updates: [], deletions: [], redirects: [] };
}

it('badge video management inherits legacy-owner and domain-admin authorization', async () => {
    setup();
    await new addon.BadgeEditHandler().prepare();
    await assert.rejects(new addon.BadgeEditHandler({ _id: 'system' }, '/badge/7/edit', 3).prepare(), PermissionError);
    await new addon.BadgeEditHandler({ _id: 'A', workspaceId: 'teacher' }, '/domain/badge/7/edit').prepare();
    await assert.rejects(new addon.BadgeEditHandler({ _id: 'A', workspaceId: 'teacher' }, '/domain/badge/7/edit', 3).prepare(), PermissionError);
    await assert.rejects(new addon.BadgeEditHandler({ _id: 'system' }, '/domain/badge/7/edit').prepare(), PermissionError);
});

it('stores video and first frame together while retaining a separately uploaded background image', async () => {
    setup();
    const handler = new addon.BadgeEditHandler();
    await handler.postUploadBackgroundVideo('system', 7);
    assert.equal(state.uploads[0].prefix, 'badge/7/profile-video');
    assert.equal(state.uploads[0].file, handler.request.files.file);
    assert.equal(state.uploads[0].poster, handler.request.files.poster);
    assert.equal(state.uploads[0].owner, 2);
    assert.equal(state.badge.backgroundImagePath, 'original.jpg');
    assert.equal(state.badge.backgroundVideoPath, 'badge/7/profile-video-new.mp4');
    assert.equal(state.badge.backgroundVideoPosterPath, 'badge/7/profile-video-new.jpg');
    assert.deepEqual(state.deletions[0].paths, ['old.mp4', 'old.jpg']);
    assert.deepEqual(state.updates[0].query.domainId, { $exists: false });
    assert.equal(state.updates[0].query.backgroundVideoPath, 'old.mp4');
    assert.equal(handler.response.body.url, '/badge_edit/7');
});

it('keeps modern-domain assets and updates scoped to the owning domain', async () => {
    setup({ domainId: 'A' });
    const wrongDomain = new addon.BadgeEditHandler({ _id: 'B', workspaceId: 'teacher' }, '/domain/badge/7/edit');
    await assert.rejects(wrongDomain.postUploadBackgroundVideo('B', 7), NotFoundError);
    await assert.rejects(new addon.BadgeEditHandler().postClearBackgroundVideo('system', 7), NotFoundError);
    assert.equal(state.uploads.length, 0);
    const handler = new addon.BadgeEditHandler({ _id: 'A', workspaceId: 'teacher' }, '/domain/badge/7/edit');
    await handler.postUploadBackgroundVideo('A', 7);
    assert.equal(state.uploads[0].prefix, 'domain/A/badge/7/profile-video');
    assert.equal(state.updates[0].query.domainId, 'A');
    assert.equal(handler.response.body.url, '/domain_badge_edit/7');
});

it('does not destroy an existing video or its cover after failed storage or concurrent updates', async () => {
    for (const failure of ['storageFailure', 'databaseFailure', 'concurrentChange']) {
        setup();
        state[failure] = true;
        await assert.rejects(new addon.BadgeEditHandler().postUploadBackgroundVideo('system', 7));
        assert.equal(state.badge.backgroundVideoPath, 'old.mp4');
        assert.equal(state.badge.backgroundVideoPosterPath, 'old.jpg');
        assert.equal(state.badge.backgroundImagePath, 'original.jpg');
        assert(!state.deletions.some((entry) => entry.paths.includes('old.mp4')));
        if (failure !== 'storageFailure') assert.deepEqual(state.deletions[0].paths, [
            'badge/7/profile-video-new.mp4', 'badge/7/profile-video-new.jpg',
        ]);
    }
});

it('removing a video retains the ordinary image and removes both remote video assets', async () => {
    setup();
    const handler = new addon.BadgeEditHandler();
    await handler.postClearBackgroundVideo('system', 7);
    assert.equal(state.badge.backgroundImagePath, 'original.jpg');
    assert.equal(state.badge.backgroundVideoPath, undefined);
    assert.equal(state.badge.backgroundVideoPosterPath, undefined);
    assert.equal(state.badge.backgroundVideoUpdatedAt, undefined);
    assert.deepEqual(state.deletions[0].paths, ['old.mp4', 'old.jpg']);
    assert.equal(handler.response.redirect, '/badge_edit/7');
});

it('redirects video and first-frame requests to OSS only after validating badge scope, without a local fallback', async () => {
    const videoPath = 'domain/A/badge/7/profile-video-123-example.mp4';
    const posterPath = 'domain/A/badge/7/profile-video-poster-123-example.jpg';
    setup({ domainId: 'A', backgroundVideoPath: videoPath, backgroundVideoPosterPath: posterPath });
    const domain = { _id: 'A', workspaceId: 'teacher' };
    const video = new addon.BadgeBackgroundVideoHandler(domain);
    await video.get('A', 7);
    assert.equal(video.response.redirect, `https://oss.example.test/${videoPath}`);
    assert.equal(video.response.body, undefined);
    const poster = new addon.BadgeBackgroundVideoPosterHandler(domain);
    await poster.get('A', 7);
    assert.equal(poster.response.redirect, `https://oss.example.test/${posterPath}`);
    await assert.rejects(new addon.BadgeBackgroundVideoHandler({ _id: 'B', workspaceId: 'teacher' }).get('B', 7), NotFoundError);
    assert.deepEqual(state.redirects, [videoPath, posterPath]);
    state.storageFailure = true;
    await assert.rejects(new addon.BadgeBackgroundVideoHandler(domain).get('A', 7), /OSS unavailable/);
    state.badge.backgroundVideoPath = 'domain/B/badge/7/profile-video-123-example.mp4';
    await assert.rejects(new addon.BadgeBackgroundVideoHandler(domain).get('A', 7), NotFoundError);
    assert.equal(state.redirects.length, 3, 'a wrong-scope storage path never reaches remote delivery');
});

function loadProfileFunctions() {
    const source = fs.readFileSync(path.resolve(__dirname, '../packages/hydrooj/src/handler/user.ts'), 'utf8');
    const relevant = source.slice(source.indexOf('function normalizeBadgeColor'), source.indexOf('async function successfulAuth'));
    const module = { exports: {} };
    vm.runInNewContext(transformSync(`${relevant}\nexport { attachOwnedBadges, getBadgeProfileBackground };`, {
        loader: 'ts', format: 'cjs',
    }).code, { module, exports: module.exports });
    return module.exports;
}

it('video-only owned badges are selectable themes with scoped media and first-frame URLs', async () => {
    const { attachOwnedBadges, getBadgeProfileBackground } = loadProfileFunctions();
    const queries = [];
    const fixtures = { user: [{ _id: 12, badgeDomainId: 'C++' }], userBadge: [{ owner: 12, badgeId: 7, getAt: '2026-10-12' }],
        badge: [{ _id: 7, backgroundVideoPath: 'video.mp4', backgroundVideoPosterPath: 'frame.jpg', backgroundVideoUpdatedAt: 'v 2' }] };
    const ctx = { db: { collection: (name) => ({ find(query) {
        queries.push({ name, query });
        return { project() { return this; }, sort() { return this; }, async toArray() { return fixtures[name]; } };
    } }) } };
    const student = { _id: 12 };
    await attachOwnedBadges(ctx, [student], 'C++', 'C++');
    assert.equal(student.ownedBadges[0].isTheme, true);
    assert.equal(student.ownedBadges[0].backgroundImage, '');
    const profile = getBadgeProfileBackground(student);
    assert.equal(profile.selectedId, 7);
    assert.equal(profile.video, '/d/C%2B%2B/badge/7/background-video?v=v%202');
    assert.equal(profile.videoPoster, '/d/C%2B%2B/badge/7/background-video-poster?v=v%202');
    assert.equal(profile.image, '');
    assert.equal(queries.find((query) => query.name === 'badge').query.domainId, 'C++');
    student.ownedBadges[0].backgroundImage = '/image.jpg';
    assert.equal(getBadgeProfileBackground(student).image, '/image.jpg');
    assert.equal(getBadgeProfileBackground(student).videoPoster, profile.videoPoster);
});
