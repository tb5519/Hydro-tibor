const assert = require('node:assert/strict');
const Module = require('node:module');
const { beforeEach, describe, it } = require('node:test');
const { ObjectId } = require('mongodb');
const { STATUS } = require('@hydrooj/common');
const { ACHIEVEMENT_CATALOG } = require('../packages/hydrooj/src/lib/achievement_catalog');

class PermissionError extends Error {}
class ValidationError extends Error {}
class NotFoundError extends Error {}
const PRIV = { PRIV_USER_PROFILE: 1 };
const PERM = { PERM_EDIT_DOMAIN: 2n };
let fixtures;
let calls;
const legacy = { _id: 'system', owner: 2 };
const modern = { _id: 'class', workspaceId: 'teacher', owner: 90 };
const definition = (id) => {
    const value = ACHIEVEMENT_CATALOG.find((item) => item.id === id);
    if (!value) throw new ValidationError('id');
    return value;
};
class Handler {
    constructor(options = {}) {
        this.domain = options.domain || legacy;
        this.user = {
            _id: options.uid ?? 11,
            hasPriv: () => options.profile !== false && (options.uid ?? 11) > 1,
        };
        this.checkPriv = () => { if (!this.user.hasPriv()) throw new PermissionError('profile'); };
        this.checkPerm = () => { if (!options.canManage) throw new PermissionError('domain'); };
        this.request = {
            path: options.path || '/manage/achievement', query: {}, files: {}, headers: {}, method: 'get', ...options.request,
        };
        this.response = { body: {}, status: 200, headers: { Vary: 'Accept' }, addHeader(key, value) { this.headers[key] = value; } };
        this.context = { vary: (name) => {
            const previous = this.response.headers.Vary.split(',').map((item) => item.trim());
            if (!previous.includes(name)) previous.push(name);
            this.response.headers.Vary = previous.join(', ');
        } };
        this.args = options.args || {};
        this.session = options.session || {};
        this.UiContext = {};
        this.ctx = {};
        this.url = (route) => `/d/${this.domain._id}/${route}`;
        this.limitRate = async (...args) => calls.push(['rate', ...args]);
    }
}

const originalLoad = Module._load;
let handlers;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/packages/hydrooj/src/handler/achievement.ts')) {
            if (request === '../error') return { PermissionError, ValidationError, NotFoundError };
            if (request === '../logger') return { Logger: class { warn() {} } };
            if (request === '../model/builtin') return { PRIV, PERM, STATUS };
            if (request === '../model/workspace') return {
                LEGACY_WORKSPACE_ID: 'tang', resolveDomainWorkspaceId: (domain) => domain?.workspaceId || 'tang',
                getLegacyWorkspace: async () => ({ ownerUid: 2 }), isLegacyOwner: (uid) => uid === 2,
            };
            if (request === '../service/server') return { Handler, param: () => () => {}, Types: { String: 'string', PositiveInt: 'positive-int', UnsignedInt: 'unsigned-int', Boolean: 'boolean' } };
            if (request === '../lib/domain_type') return { isScratchDomain: (domain) => domain.domainType === 'scratch' };
            if (request === '../lib/achievement') return {
                applyAchievementHooks: async () => { await new Promise((resolve) => setTimeout(resolve, 1)); calls.push(['initialized']); },
                getAchievementScope: (domain) => domain.workspaceId && domain.workspaceId !== 'tang' ? `domain:${domain._id}` : 'legacy',
                isAchievementRecordReady: async (ctx, record) => { calls.push(['ready', record._id.toString()]); return record.pointsSettled !== false; },
                getAchievementRecord: async (ctx, domain, uid, rid) => {
                    calls.push(['record', domain._id, uid, rid.toString()]);
                    return (fixtures.records || []).find((record) => record.uid === uid && record._id.equals(rid) && record.allowed !== false) || null;
                },
                syncUserAchievements: async (ctx, domain, uid, options) => {
                    calls.push(['sync', domain._id, uid, options]);
                    if (fixtures.wallReadError) throw new Error('achievement database unavailable');
                    return fixtures.rows || [];
                },
                getPendingAchievements: async (ctx, domain, uid, limit) => {
                    calls.push(['pending', domain._id, uid, limit]);
                    return fixtures.pending || [];
                },
                acknowledgeAchievements: async (ctx, domain, uid, ids) => calls.push(['ack', domain._id, uid, ids]),
            };
            if (request === '../lib/achievement_image') return {
                ACHIEVEMENT_IMAGE_LIMIT: 8 * 1024 * 1024, achievementDefinition: definition,
                presentAchievements: async (ctx, domain, entries) => {
                    if (fixtures.artworkReadError) throw new Error('artwork database unavailable');
                    return entries.map((item) => ({ ...item, imageUrl: `/d/${domain._id}/${item.id}.png` }));
                },
                getAchievementArtwork: async (ctx, domain, id) => { definition(id); calls.push(['art', domain._id, id]); return fixtures.artwork; },
                setAchievementImage: async (ctx, domain, id, file, owner) => calls.push(['upload', domain._id, id, file, owner]),
                removeAchievementImage: async (ctx, domain, id, owner) => { definition(id); calls.push(['remove', domain._id, id, owner]); },
            };
            if (request === '../lib/achievement_sound') return {
                ACHIEVEMENT_SOUND_LIMIT: 8 * 1024 * 1024,
                presentAchievementSound: async (ctx, domain) => {
                    if (fixtures.soundReadError) throw new Error('sound database unavailable');
                    return fixtures.soundPresentation || { soundUrl: '', volume: 70, enabled: true, filename: '' };
                },
                getAchievementSound: async (ctx, domain) => { calls.push(['sound', domain._id]); return fixtures.sound; },
                setAchievementSound: async (ctx, domain, file, owner) => calls.push(['uploadSound', domain._id, file, owner]),
                removeAchievementSound: async (ctx, domain, owner) => calls.push(['removeSound', domain._id, owner]),
                saveAchievementSound: async (ctx, domain, volume, enabled, owner) => calls.push(['saveSound', domain._id, volume, enabled, owner]),
            };
            if (request === '../model/storage') return {
                getMeta: async (path) => { calls.push(['meta', path]); return fixtures.meta; },
                get: async (path) => {
                    calls.push(['download', path]);
                    if (fixtures.storageReadError) throw new Error('object storage unavailable');
                    return Buffer.from('png');
                },
            };
            if (request === '../lib/asset_delivery') return { tryRedirectAsset: (handler, source) => {
                calls.push(['delivery', source.path]);
                if (!fixtures.cdn) return false;
                handler.response.redirect = fixtures.cdn;
                return true;
            } };
            if (request === '../lib/asset_storage') return { signDownloadLink: async (asset) => { calls.push(['sign', asset]); return 'https://objects.test/signed'; } };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    handlers = require('../packages/hydrooj/src/handler/achievement');
} finally { Module._load = originalLoad; }

beforeEach(() => { fixtures = {}; calls = []; });

describe('achievement management and image handlers', () => {
    it('allows the legacy owner and the current modern-domain manager, with no cross-scope management', async () => {
        await handlers.checkAchievementManageAccess(new Handler({ uid: 2 }));
        await handlers.checkAchievementManageAccess(new Handler({ domain: modern, path: '/domain/achievement', uid: 90, canManage: true }));
        for (const handler of [
            new Handler({ uid: 99, canManage: true }),
            new Handler({ domain: modern, uid: 2 }),
            new Handler({ path: '/domain/achievement', uid: 2, canManage: true }),
            new Handler({ domain: modern, path: '/domain/achievement', uid: 90 }),
            new Handler({ uid: 1 }),
        ]) await assert.rejects(handlers.checkAchievementManageAccess(handler), PermissionError);
    });

    it('renders all 50 achievements with the correct menu context and private cache headers', async () => {
        const handler = new handlers.AchievementManageHandler({ domain: modern, path: '/domain/achievement', uid: 90, canManage: true });
        await handler.prepare();
        await handler.get();
        assert.equal(handler.response.template, 'achievement_manage.html');
        assert.equal(handler.response.body.achievements.length, 50);
        assert.equal(handler.response.body.achievementBaseTemplate, 'domain_base.html');
        assert.equal(handler.response.body.badgeManageRoute, 'domain_badge_manage');
        assert.deepEqual(handler.response.body.achievementSound, { soundUrl: '', volume: 70, enabled: true, filename: '' });
        assert.equal(handler.response.body.maxSoundSize, 8 * 1024 * 1024);
        assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(handler.response.headers.Vary, 'Accept, Cookie, Authorization');
    });

    it('rechecks access before upload, uses the real signed-in owner and returns the JSON card', async () => {
        const file = { filepath: '/tmp/image.png', size: 30 };
        const handler = new handlers.AchievementManageHandler({ uid: 2, args: { uid: 99 }, request: { json: true, files: { image: [file] } } });
        await handler.postUpload('system', 'difficulty-1');
        assert.deepEqual(calls.find((call) => call[0] === 'upload'), ['upload', 'system', 'difficulty-1', file, 2]);
        assert.equal(handler.response.body.ok, true);
        assert.equal(handler.response.body.achievement.id, 'difficulty-1');
        assert.equal(handler.response.redirect, undefined);
        const denied = new handlers.AchievementManageHandler({ uid: 11, request: { files: { image: file } } });
        await assert.rejects(denied.postUpload('system', 'difficulty-1'), PermissionError);
        await assert.rejects(handler.postUpload('system', 'made-up'), ValidationError);
    });

    it('removes only artwork and redirects a regular form submission back to its scoped manager', async () => {
        const handler = new handlers.AchievementManageHandler({ domain: modern, path: '/domain/achievement', uid: 90, canManage: true });
        await handler.postRemoveImage('class', 'difficulty-1');
        assert.deepEqual(calls, [['remove', 'class', 'difficulty-1', 90]]);
        assert.equal(handler.response.redirect, '/d/class/domain_achievement_manage');
    });

    it('serves only the requested stored thumbnail, preserving negotiation headers', async () => {
        fixtures.artwork = { imagePath: 'original.png', thumbnailPath: 'thumb.png' };
        fixtures.meta = { size: 20 };
        const handler = new handlers.AchievementImageHandler();
        await handler.get('system', 'difficulty-1', 384);
        assert.deepEqual(calls.map((call) => call[0]), ['art', 'meta', 'delivery', 'download']);
        assert.equal(calls.at(-1)[1], 'thumb.png');
        assert.equal(handler.response.type, 'image/png');
        assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(handler.response.headers.Vary, 'Accept, Cookie, Authorization');
        await assert.rejects(handler.get('system', 'difficulty-1', 768), ValidationError);
    });

    it('caches only the current versioned thumbnail privately at a stable URL instead of an expiring redirect', async () => {
        fixtures.artwork = { imagePath: 'original.png', thumbnailPath: 'thumb.png', version: 'revision1' };
        fixtures.meta = { size: 20, remoteAsset: { key: 'object' } };
        fixtures.cdn = 'https://cdn.test/thumb.png?auth_key=short-lived';
        const handler = new handlers.AchievementImageHandler({
            domain: modern, args: { domainId: 'system', imagePath: 'other.png' },
            request: { query: { v: 'revision1', domainId: 'system' } },
        });
        await handler.get('system', 'difficulty-1', 384);
        assert.deepEqual(calls, [['art', 'class', 'difficulty-1'], ['meta', 'thumb.png'], ['download', 'thumb.png']]);
        assert.equal(handler.response.redirect, undefined);
        assert.equal(handler.response.type, 'image/png');
        assert.deepEqual(handler.response.body, Buffer.from('png'));
        assert.equal(handler.response.headers['Cache-Control'], 'private, max-age=604800, immutable');
        assert.equal(handler.response.headers.Vary, 'Accept, Cookie, Authorization');
        assert.equal(handler.response.headers['X-Content-Type-Options'], 'nosniff');
        assert.equal(handler.response.headers.ETag, '"revision1-384"');
        assert.equal(handler.response.etag, undefined); // Generic etag handling would make this response public.
    });

    it('revalidates the version and stored thumbnail before returning a private 304 without reading image bytes', async () => {
        fixtures.artwork = { imagePath: 'original.png', thumbnailPath: 'thumb.png', version: 'revision1' };
        fixtures.meta = { size: 20 };
        const handler = new handlers.AchievementImageHandler({
            request: { query: { v: 'revision1' }, headers: { 'if-none-match': '"older-384", W/"revision1-384"' } },
        });
        await handler.get('system', 'difficulty-1', 384);
        assert.deepEqual(calls, [['art', 'system', 'difficulty-1'], ['meta', 'thumb.png']]);
        assert.equal(handler.response.status, 304);
        assert.equal(handler.context.status, 304);
        assert.equal(handler.response.body, '');
        assert.equal(handler.response.headers['Cache-Control'], 'private, max-age=604800, immutable');
        assert.equal(handler.response.headers.Vary, 'Accept, Cookie, Authorization');
        fixtures.meta = null;
        const missing = new handlers.AchievementImageHandler({
            request: { query: { v: 'revision1' }, headers: { 'if-none-match': '"revision1-384"' } },
        });
        await assert.rejects(missing.get('system', 'difficulty-1', 384), NotFoundError);
        assert.equal(missing.response.headers['Cache-Control'], 'private, no-store');
    });

    it('does not store a replacement thumbnail under a stale or malformed requested version', async () => {
        fixtures.artwork = { imagePath: 'new-original.png', thumbnailPath: 'new-thumb.png', version: 'revision2' };
        fixtures.meta = { size: 20 };
        for (const v of ['revision1', ['revision2'], { value: 'revision2' }]) {
            const handler = new handlers.AchievementImageHandler({ request: { query: { v }, headers: { 'if-none-match': '*' } } });
            await assert.rejects(handler.get('system', 'difficulty-1', 384), NotFoundError);
            assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
            assert.equal(handler.response.headers.Vary, 'Accept, Cookie, Authorization');
        }
        assert.equal(calls.some((call) => ['meta', 'download', 'delivery', 'sign'].includes(call[0])), false);
        const updated = new handlers.AchievementImageHandler({
            request: { query: { v: 'revision2' }, headers: { 'if-none-match': '"revision1-384"' } },
        });
        await updated.get('system', 'difficulty-1', 384);
        assert.equal(updated.response.status, 200);
        assert.equal(updated.response.headers.ETag, '"revision2-384"');
        assert.deepEqual(calls.at(-1), ['download', 'new-thumb.png']);
    });

    it('preserves no-store CDN delivery for originals and thumbnails without a requested version', async () => {
        fixtures.artwork = { imagePath: 'original.png', thumbnailPath: 'thumb.png', version: 'revision1' };
        fixtures.meta = { size: 20, remoteAsset: { key: 'object' } };
        fixtures.cdn = 'https://cdn.test/image.png?auth_key=short-lived';
        for (const [query, size] of [[{}, 384], [{ v: '' }, 384], [{ v: 'revision1' }, undefined]]) {
            const handler = new handlers.AchievementImageHandler({ request: { query } });
            await handler.get('system', 'difficulty-1', size);
            assert.equal(handler.response.redirect, fixtures.cdn);
            assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
            assert.equal(handler.response.headers.ETag, undefined);
        }
        assert.equal(calls.some((call) => call[0] === 'download'), false);
    });

    it('does not cache a failure when the stored thumbnail cannot be streamed', async () => {
        fixtures.artwork = { thumbnailPath: 'thumb.png', version: 'revision1' };
        fixtures.meta = { size: 20 };
        fixtures.storageReadError = true;
        const handler = new handlers.AchievementImageHandler({ request: { query: { v: 'revision1' } } });
        await assert.rejects(handler.get('system', 'difficulty-1', 384), /object storage unavailable/);
        assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(handler.response.headers.ETag, undefined);
    });

    it('uses the prepared CDN or signed object URL and does not download originals for thumbnails', async () => {
        fixtures.artwork = { imagePath: 'original.png', thumbnailPath: 'thumb.png' };
        fixtures.meta = { remoteAsset: { key: 'object' } };
        const signed = new handlers.AchievementImageHandler();
        await signed.get('system', 'difficulty-1');
        assert.equal(signed.response.redirect, 'https://objects.test/signed');
        assert.equal(calls.some((call) => call[0] === 'download'), false);
        fixtures.cdn = 'https://cdn.test/thumb.png';
        const cdn = new handlers.AchievementImageHandler();
        await cdn.get('system', 'difficulty-1', 384);
        assert.equal(cdn.response.redirect, fixtures.cdn);
        fixtures.artwork = null;
        await assert.rejects(cdn.get('system', 'difficulty-1'), NotFoundError);
    });

    it('checks sound-management permissions and uses only the authenticated owner and current domain', async () => {
        const file = { filepath: '/tmp/sound.mp3', size: 100 };
        const handler = new handlers.AchievementManageHandler({ uid: 2, args: { uid: 99 }, request: { json: true, files: { sound: [file] } } });
        await handler.postUploadSound();
        assert.deepEqual(calls.find((call) => call[0] === 'uploadSound'), ['uploadSound', 'system', file, 2]);
        assert.deepEqual(handler.response.body, { ok: true, achievementSound: { soundUrl: '', volume: 70, enabled: true, filename: '' } });
        await handler.postSaveSound('system', 35, false);
        assert.deepEqual(calls.find((call) => call[0] === 'saveSound'), ['saveSound', 'system', 35, false, 2]);
        await handler.postRemoveSound();
        assert.deepEqual(calls.find((call) => call[0] === 'removeSound'), ['removeSound', 'system', 2]);
        const denied = new handlers.AchievementManageHandler({ uid: 11 });
        await assert.rejects(denied.postUploadSound(), PermissionError);
        await assert.rejects(denied.postRemoveSound(), PermissionError);
        await assert.rejects(denied.postSaveSound('system', 35, true), PermissionError);
        const modernHandler = new handlers.AchievementManageHandler({ domain: modern, path: '/domain/achievement', uid: 90, canManage: true });
        await modernHandler.postRemoveSound();
        assert.deepEqual(calls.at(-1), ['removeSound', 'class', 90]);
        assert.equal(modernHandler.response.redirect, '/d/class/domain_achievement_manage');
    });

    it('delivers only the current scope sound with private headers and never reads another scope from request arguments', async () => {
        fixtures.sound = { soundPath: 'achievement/scoped/sound.wav', contentType: 'audio/wav' }; fixtures.meta = { size: 46 };
        const handler = new handlers.AchievementSoundHandler({ domain: modern, args: { domainId: 'system', soundPath: 'elsewhere.mp3' } });
        await handler.get();
        assert.deepEqual(calls[0], ['sound', 'class']);
        assert.deepEqual(calls.at(-1), ['download', 'achievement/scoped/sound.wav']);
        assert.equal(handler.response.type, 'audio/wav');
        assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(handler.response.headers['X-Content-Type-Options'], 'nosniff');
        fixtures.meta = { remoteAsset: { key: 'scoped-sound' } }; calls = [];
        await handler.get();
        assert.equal(handler.response.redirect, 'https://objects.test/signed');
        assert.equal(calls.some((call) => call[0] === 'download'), false);
        fixtures.cdn = 'https://cdn.test/sound.wav';
        await handler.get(); assert.equal(handler.response.redirect, fixtures.cdn);
        fixtures.sound = null; await assert.rejects(handler.get(), NotFoundError);
        fixtures.sound = { soundPath: 'lost.wav' }; fixtures.meta = null;
        await assert.rejects(handler.get(), NotFoundError);
    });
});

describe('achievement pending and acknowledgement handlers', () => {
    it('requires a signed-in profile and does not show or dismiss awards while impersonating a student', async () => {
        await assert.rejects(new handlers.AchievementPendingHandler({ uid: 1 }).get(), PermissionError);
        const pending = new handlers.AchievementPendingHandler({ session: { sudoUid: 2 } });
        await pending.get();
        assert.deepEqual(pending.response.body, { achievements: [], settled: true });
        const ack = new handlers.AchievementAckHandler({ session: { sudoUid: 2 }, args: { ids: ['difficulty-1'] } });
        await ack.post();
        assert.deepEqual(calls, []);
    });

    it('waits for all active judge states and never imports a partial verdict', async () => {
        for (const status of [STATUS.STATUS_WAITING, STATUS.STATUS_FETCHED, STATUS.STATUS_JUDGING, STATUS.STATUS_COMPILING]) {
            const record = { _id: new ObjectId(), uid: 11, status, judgeAt: new Date() };
            fixtures.records = [record];
            const handler = new handlers.AchievementPendingHandler({ request: { query: { rid: record._id.toString() } } });
            await handler.get();
            assert.deepEqual(handler.response.body, { achievements: [], settled: false });
        }
        assert.equal(calls.some((call) => call[0] === 'sync'), false);
    });

    it('rejects invalid, another owner, out-of-scope and pretest record IDs before syncing', async () => {
        for (const record of [
            { _id: new ObjectId(), uid: 12, judgeAt: new Date() },
            { _id: new ObjectId(), uid: 11, allowed: false, judgeAt: new Date() },
            { _id: new ObjectId(), uid: 11, contest: new ObjectId('000000000000000000000000'), judgeAt: new Date() },
        ]) {
            fixtures.records = [record];
            const handler = new handlers.AchievementPendingHandler({ request: { query: { rid: record._id.toString() } } });
            await assert.rejects(handler.get(), NotFoundError);
        }
        for (const rid of ['bad', [], {}, 11]) {
            await assert.rejects(new handlers.AchievementPendingHandler({ request: { query: { rid } } }).get(), ValidationError);
        }
        assert.equal(calls.some((call) => call[0] === 'sync'), false);
    });

    it('settles an owned completed verdict before retrieving at most ten pending images', async () => {
        const record = { _id: new ObjectId(), uid: 11, status: STATUS.STATUS_ACCEPTED, judgeAt: new Date(), domainId: 'system', pid: 1 };
        fixtures.records = [record]; fixtures.pending = [definition('difficulty-1')];
        const handler = new handlers.AchievementPendingHandler({ args: { uid: 12 }, request: { query: { rid: record._id.toString(), uid: 12 } } });
        await handler.get();
        assert.deepEqual(calls.map((call) => call[0]), ['record', 'ready', 'sync', 'pending']);
        assert.equal(calls[2][2], 11);
        assert.equal(calls[2][3].record, record);
        assert.deepEqual(calls[3], ['pending', 'system', 11, 10]);
        assert.equal(handler.response.body.settled, true);
        assert.equal(handler.response.body.achievements[0].imageUrl, '/d/system/difficulty-1.png');
    });

    it('waits when AC is final but the contest-point callback has not reached record/judge', async () => {
        const record = { _id: new ObjectId(), uid: 11, status: STATUS.STATUS_ACCEPTED, judgeAt: new Date(), pointsSettled: false };
        fixtures.records = [record];
        const handler = new handlers.AchievementPendingHandler({ request: { query: { rid: record._id.toString() } } });
        await handler.get();
        assert.deepEqual(handler.response.body, { achievements: [], settled: false });
        assert.deepEqual(calls.map((call) => call[0]), ['record', 'ready']);
    });

    it('validates finite catalogue IDs and always acknowledges the session owner', async () => {
        const handler = new handlers.AchievementAckHandler({ args: { uid: 99, ids: ['difficulty-1'] } });
        await handler.post();
        assert.deepEqual(calls, [['ack', 'system', 11, ['difficulty-1']]]);
        for (const ids of [undefined, 'difficulty-1', [null], [{}], ['fake'], Array(11).fill('difficulty-1')]) {
            await assert.rejects(new handlers.AchievementAckHandler({ args: { ids } }).post(), ValidationError);
        }
    });
});

describe('homepage, profile and live-record integration', () => {
    it('populates the homepage with only the session owner’s unlocked achievements in the current domain', async () => {
        fixtures.rows = [{ ...definition('difficulty-1'), unlocked: true }, { ...definition('difficulty-2'), unlocked: false }];
        const handler = new Handler({ domain: modern, args: { uid: 99 }, request: { query: { uid: 99 } } });
        handler.response.template = 'main.html'; handler.response.body.udoc = { _id: 99 };
        await handlers.injectAchievementContext(handler);
        assert.deepEqual(calls, [['sync', 'class', 11, undefined]]);
        assert.deepEqual(handler.response.body.achievementWall, {
            items: [{ ...fixtures.rows[0], imageUrl: '/d/class/difficulty-1.png' }], total: 50, unlocked: 1,
        });
        assert.equal(handler.UiContext.achievementAutoShow, true);
        assert.equal(handler.UiContext.achievementScope, 'domain:class/11');
        assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(handler.response.headers.Vary, 'Accept, Cookie, Authorization');
    });

    it('shows an empty homepage wall for a new user and no personal wall for anonymous or profile-disabled visitors', async () => {
        const signedIn = new Handler(); signedIn.response.template = 'main.html';
        await handlers.injectAchievementContext(signedIn);
        assert.deepEqual(signedIn.response.body.achievementWall, { items: [], total: 50, unlocked: 0 });
        calls = [];
        for (const options of [{ uid: 1 }, { uid: 0 }, { profile: false }]) {
            const handler = new Handler(options); handler.response.template = 'main.html';
            handler.response.body.udoc = { _id: 99 };
            await handlers.injectAchievementContext(handler);
            assert.equal(handler.response.body.achievementWall, undefined);
            assert.deepEqual(handler.UiContext, {});
        }
        assert.deepEqual(calls, []);
    });

    it('keeps the impersonated student’s homepage wall private without showing or acknowledging celebrations', async () => {
        fixtures.rows = [{ ...definition('difficulty-2'), unlocked: true }];
        const handler = new Handler({ session: { sudoUid: 2 } }); handler.response.template = 'main.html';
        await handlers.injectAchievementContext(handler);
        assert.deepEqual(calls, [['sync', 'system', 11, undefined]]);
        assert.equal(handler.response.body.achievementWall.items[0].id, 'difficulty-2');
        assert.deepEqual(handler.UiContext, {});
        assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(handler.response.headers.Vary, 'Accept, Cookie, Authorization');
    });

    it('keeps homepage and profile pages available when achievement or artwork storage cannot be read', async () => {
        for (const template of ['main.html', 'user_detail.html']) {
            for (const failure of ['wallReadError', 'artworkReadError']) {
                fixtures = { [failure]: true };
                const handler = new Handler(); handler.response.template = template;
                if (template === 'user_detail.html') handler.response.body.udoc = { _id: 11 };
                await handlers.injectAchievementContext(handler);
                assert.equal(handler.response.body.achievementWall, undefined);
                assert.equal(handler.response.status, 200);
                assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
                assert.equal(handler.UiContext.achievementAutoShow, true);
            }
        }
    });

    it('populates another student’s wall without suppressing their new awards or showing the viewer a celebration', async () => {
        fixtures.rows = [{ ...definition('difficulty-1'), unlocked: true }, { ...definition('difficulty-2'), unlocked: false }];
        const handler = new Handler();
        handler.response.template = 'user_detail.html'; handler.response.body.udoc = { _id: 12 };
        await handlers.injectAchievementContext(handler);
        assert.deepEqual(calls, [['sync', 'system', 12, undefined]]);
        assert.equal(handler.response.body.achievementWall.unlocked, 1);
        assert.equal(handler.response.body.achievementWall.items.length, 1);
        assert.equal(handler.UiContext.achievementAutoShow, undefined);
        assert.equal(calls.some((call) => call[0] === 'ack'), false);
        assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(handler.response.headers.Vary, 'Accept, Cookie, Authorization');
    });

    it('enables pending playback on the owner’s profile with the user and domain scope', async () => {
        const handler = new Handler();
        handler.response.template = 'user_detail.html'; handler.response.body.udoc = { _id: 11 };
        await handlers.injectAchievementContext(handler);
        assert.equal(handler.UiContext.achievementAutoShow, true);
        assert.equal(handler.UiContext.achievementPendingUrl, '/d/system/achievement_pending');
        assert.equal(handler.UiContext.achievementAckUrl, '/d/system/achievement_ack');
        assert.equal(handler.UiContext.achievementScope, 'legacy/11');
        assert.deepEqual(handler.UiContext.achievementSound, { soundUrl: '', volume: 70, enabled: true, filename: '' });
    });

    it('keeps ordinary pages available and silently disables sound when optional audio configuration cannot load', async () => {
        fixtures.soundReadError = true;
        const handler = new Handler(); handler.response.template = 'problem_detail.html';
        await handlers.injectAchievementContext(handler);
        assert.equal(handler.UiContext.achievementPendingUrl, '/d/system/achievement_pending');
        assert.deepEqual(handler.UiContext.achievementSound, { soundUrl: '', volume: 70, enabled: false, filename: '' });
        assert.equal(handler.response.status, 200);
    });

    it('injects a passive quiz client and automatic homepage playback with one legacy cross-domain lock', async () => {
        const home = new Handler(); home.response.template = 'main.html';
        await handlers.injectAchievementContext(home);
        assert.equal(home.UiContext.achievementAutoShow, true);
        const quiz = new Handler({ domain: { _id: 'python' } }); quiz.response.template = 'daily_quiz.html';
        await handlers.injectAchievementContext(quiz);
        assert.equal(quiz.UiContext.achievementAutoShow, false);
        assert.equal(quiz.UiContext.achievementScope, home.UiContext.achievementScope);
    });

    it('marks only a recent ordinary owned record live, excluding old, future, revision, hidden and generated views', async () => {
        const make = (rdoc, query = {}, extra = {}) => {
            const handler = new Handler({ request: { query } });
            handler.response.template = 'record_detail.html'; handler.response.body = { rdoc, ...extra };
            return handler;
        };
        const owned = { _id: new ObjectId(), uid: 11, status: STATUS.STATUS_ACCEPTED };
        const current = make(owned);
        await handlers.injectAchievementContext(current);
        assert.equal(current.UiContext.achievementLive, true);
        assert.equal(current.UiContext.achievementAutoShow, false);
        for (const handler of [
            make({ ...owned, uid: 12 }),
            make({ ...owned, _id: ObjectId.createFromTime(Math.floor(Date.now() / 1000) - 3600) }),
            make({ ...owned, _id: ObjectId.createFromTime(Math.floor(Date.now() / 1000) + 3600) }),
            make(owned, { rev: new ObjectId().toString() }),
            make({ _id: owned._id, lang: 'cc' }),
            make({ ...owned, contest: new ObjectId('000000000000000000000001') }),
            make(owned, {}, { isPretestRecord: true }),
        ]) {
            await handlers.injectAchievementContext(handler);
            assert.equal(handler.UiContext.achievementLive, false);
        }
    });

    it('does not inject into JSON, errors, redirects, scratch or websocket responses', async () => {
        for (const template of ['main.html', 'user_detail.html']) {
            for (const options of [{ request: { json: true } }, { request: { websocket: true } }, { domain: { ...legacy, domainType: 'scratch' } }, {}]) {
                const handler = new Handler(options);
                handler.response.template = template; handler.response.body.udoc = { _id: 11 };
                if (!Object.keys(options).length) handler.response.status = 500;
                await handlers.injectAchievementContext(handler);
                assert.deepEqual(handler.UiContext, {});
                assert.equal(handler.response.body.achievementWall, undefined);
            }
            const redirect = new Handler(); redirect.response.template = template; redirect.response.redirect = '/login';
            await handlers.injectAchievementContext(redirect);
        }
        assert.deepEqual(calls, []);
    });

    it('finishes durable initialization before registering authenticated endpoints and profile hooks', async () => {
        const registered = [];
        const ctx = {
            Route: (...args) => { assert.equal(calls[0][0], 'initialized'); registered.push(args); },
            injectUI: (...args) => calls.push(['menu', ...args]),
            i18n: { load: () => {} }, on: (...args) => calls.push(['event', ...args]),
        };
        await handlers.apply(ctx);
        assert.equal(registered.length, 6);
        assert.deepEqual(registered.find((route) => route[0] === 'achievement_sound').slice(1), ['/achievement/sound', handlers.AchievementSoundHandler]);
        assert.deepEqual(registered.find((route) => route[0] === 'achievement_pending').slice(1),
            ['/achievement/pending', handlers.AchievementPendingHandler, PRIV.PRIV_USER_PROFILE]);
        assert.equal(registered.find((route) => route[0] === 'achievement_ack')[3], PRIV.PRIV_USER_PROFILE);
        assert.ok(calls.some((call) => call[0] === 'event' && call[1] === 'handler/after'));
    });
});
