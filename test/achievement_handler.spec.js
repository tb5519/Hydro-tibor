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
const progress = (id, value, unlocked = false) => ({ ...definition(id), progress: value, unlocked });
const art = (id, domain = 'system', version = 'v1') => ({
    imageUrl: `/d/${domain}/achievement/${id}/image?v=${version}`,
    thumbnailUrl: `/d/${domain}/achievement/${id}/image?size=384&v=${version}`,
});
const matches = (document, query) => Object.entries(query).every(([key, value]) => {
    if (value && typeof value === 'object' && ('$lte' in value || '$gte' in value)) {
        return (!('$lte' in value) || document[key] <= value.$lte) && (!('$gte' in value) || document[key] >= value.$gte);
    }
    return String(document[key]) === String(value);
});
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
        this.ctx = { db: { collection: (name) => ({
            findOne: async (query) => {
                calls.push(['dbFindOne', name, query]);
                return (fixtures.collections?.[name] || []).find((document) => matches(document, query)) || null;
            },
            find: (query) => ({ toArray: async () => {
                calls.push(['dbFind', name, query]);
                return (fixtures.collections?.[name] || []).filter((document) => matches(document, query));
            } }),
        }) } };
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
                isAchievementContestSubmission: (contest, participant, solve) => {
                    if (!contest || !['acm', 'oi', 'ioi', 'ledo', 'strictioi'].includes(contest.rule)
                        || !participant?.attend || participant.unrank || participant.virtual || participant.practice
                        || !contest.pids?.includes(solve.pid)) return false;
                    const start = Math.max(+contest.beginAt, +(participant.startAt || 0));
                    const end = Math.min(+contest.endAt, +(participant.endAt || contest.endAt),
                        contest.duration && participant.startAt ? +participant.startAt + contest.duration * 3600000 : +contest.endAt);
                    return +solve.submittedAt >= start && +solve.submittedAt <= end;
                },
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
                getPendingAchievements: async (ctx, domain, uid, limit, ids) => {
                    calls.push(['pending', domain._id, uid, limit, ids]);
                    return (fixtures.pending || []).filter((item) => !ids || ids.includes(item.id)).slice(0, limit);
                },
                acknowledgeAchievements: async (ctx, domain, uid, ids) => calls.push(['ack', domain._id, uid, ids]),
            };
            if (request === '../lib/achievement_image') return {
                ACHIEVEMENT_IMAGE_LIMIT: 8 * 1024 * 1024, achievementDefinition: definition,
                presentAchievements: async (ctx, domain, entries) => {
                    if (fixtures.artworkReadError) throw new Error('artwork database unavailable');
                    return entries.map((item) => ({
                        ...item,
                        ...(fixtures.preloadArt ? (fixtures.preloadArt[item.id] || { imageUrl: '', thumbnailUrl: '' })
                            : { imageUrl: `/d/${domain._id}/${item.id}.png` }),
                    }));
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

    it('keeps all 92 achievement levels editable with the correct menu context and private cache headers', async () => {
        const handler = new handlers.AchievementManageHandler({ domain: modern, path: '/domain/achievement', uid: 90, canManage: true });
        await handler.prepare();
        await handler.get();
        assert.equal(handler.response.template, 'achievement_manage.html');
        assert.equal(handler.response.body.achievements.length, 92);
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

    it('caches the matching original at its stable URL and distinguishes its ETag from the thumbnail', async () => {
        fixtures.artwork = { imagePath: 'original.png', thumbnailPath: 'thumb.png', version: 'revision1' };
        fixtures.meta = { size: 2000, remoteAsset: { key: 'original-object' } };
        fixtures.cdn = 'https://cdn.test/original.png?auth_key=short-lived';
        const original = new handlers.AchievementImageHandler({ request: { query: { v: 'revision1' } } });
        await original.get('system', 'difficulty-1');
        assert.deepEqual(calls, [['art', 'system', 'difficulty-1'], ['meta', 'original.png'], ['download', 'original.png']]);
        assert.equal(original.response.redirect, undefined);
        assert.equal(original.response.headers['Cache-Control'], 'private, max-age=604800, immutable');
        assert.equal(original.response.headers.ETag, '"revision1-original"');
        assert.equal(original.response.headers.Vary, 'Accept, Cookie, Authorization');
        calls = [];
        const cached = new handlers.AchievementImageHandler({ request: {
            query: { v: 'revision1' }, headers: { 'if-none-match': 'W/"revision1-original"' },
        } });
        await cached.get('system', 'difficulty-1');
        assert.equal(cached.response.status, 304);
        assert.equal(calls.some((call) => call[0] === 'download'), false);
        const thumbnailTag = new handlers.AchievementImageHandler({ request: {
            query: { v: 'revision1' }, headers: { 'if-none-match': '"revision1-384"' },
        } });
        await thumbnailTag.get('system', 'difficulty-1');
        assert.equal(thumbnailTag.response.status, 200);
        assert.deepEqual(calls.at(-1), ['download', 'original.png']);
        for (const v of ['stale', ['revision1'], { value: 'revision1' }]) {
            const invalid = new handlers.AchievementImageHandler({ request: { query: { v } } });
            await assert.rejects(invalid.get('system', 'difficulty-1'), NotFoundError);
            assert.equal(invalid.response.headers['Cache-Control'], 'private, no-store');
        }
        fixtures.storageReadError = true;
        const failed = new handlers.AchievementImageHandler({ request: { query: { v: 'revision1' } } });
        await assert.rejects(failed.get('system', 'difficulty-1'), /object storage unavailable/);
        assert.equal(failed.response.headers['Cache-Control'], 'private, no-store');
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
        for (const [query, size] of [[{}, 384], [{ v: '' }, 384], [{}, undefined], [{ v: '' }, undefined]]) {
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
        assert.deepEqual(calls[3], ['pending', 'system', 11, 10, ACHIEVEMENT_CATALOG.map((item) => item.id)]);
        assert.equal(handler.response.body.settled, true);
        assert.equal(handler.response.body.achievements[0].imageUrl, '/d/system/difficulty-1.png');
    });

    it('waits for unconfigured artwork without consuming notifications or blocking other configured rewards', async () => {
        fixtures.pending = [...ACHIEVEMENT_CATALOG.filter((item) => item.category === 'streak'), definition('difficulty-1')];
        fixtures.preloadArt = { 'difficulty-1': art('difficulty-1') };
        const handler = new handlers.AchievementPendingHandler();
        await handler.get();
        assert.deepEqual(handler.response.body.achievements.map((item) => item.id), ['difficulty-1']);
        assert.deepEqual(calls.find((call) => call[0] === 'pending')[4], ['difficulty-1']);
        assert.equal(fixtures.pending.length, 15);
        fixtures.preloadArt['streak-3'] = art('streak-3');
        await handler.get();
        assert.deepEqual(handler.response.body.achievements.map((item) => item.id), ['streak-3', 'difficulty-1']);
        assert.equal(handler.response.body.achievements[0].imageUrl, art('streak-3').imageUrl);
        fixtures.preloadArt = {};
        await handler.get();
        assert.deepEqual(handler.response.body, { achievements: [], settled: true });
        assert.equal(calls.some((call) => call[0] === 'ack'), false);
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
    it('shows the highest earned level of each series on both walls while retaining separate difficulty mastery series', async () => {
        fixtures.rows = [
            progress('difficulty-8', 1, true), progress('solved-10', 1000, true),
            progress('streak-3', 30, true), progress('mastery-4-10', 100, true),
            progress('mastery-5-50', 50, true), progress('difficulty-1', 1, true),
            { ...progress('solved-1000', 1000, true), unlockedAt: new Date('2026-10-01') },
            progress('streak-30', 30, true), progress('mastery-4-100', 100, true),
            progress('difficulty-10', 0), progress('streak-40', 30), progress('mastery-5-100', 50),
        ];
        const winners = ['difficulty-8', 'mastery-5-50', 'solved-1000', 'streak-30', 'mastery-4-100'];
        for (const template of ['main.html', 'user_detail.html']) {
            const handler = new Handler(); handler.response.template = template;
            handler.response.body.udoc = { _id: 12 };
            await handlers.injectAchievementContext(handler);
            const wall = handler.response.body.achievementWall;
            assert.deepEqual(wall.items.map((item) => item.id), winners);
            assert.equal(wall.total, 14);
            assert.equal(wall.unlocked, 5);
            assert.deepEqual(wall.items.find((item) => item.id === 'solved-1000').unlockedAt, new Date('2026-10-01'));
        }
        assert.equal(fixtures.rows.filter((item) => item.unlocked).length, 9, 'display does not erase earned history');
        assert.equal(calls.some((call) => call[0] === 'ack'), false);
    });

    it('does not fall back to a covered lower image when the highest earned image is unconfigured', async () => {
        fixtures.rows = [progress('solved-10', 100, true), progress('solved-100', 100, true)];
        fixtures.preloadArt = { 'solved-10': art('solved-10') };
        const handler = new Handler(); handler.response.template = 'user_detail.html';
        handler.response.body.udoc = { _id: 12 };
        await handlers.injectAchievementContext(handler);
        assert.deepEqual(handler.response.body.achievementWall.items.map((item) => [item.id, item.imageUrl]), [['solved-100', '']]);
    });

    it('prewarms only upgrades above the earned series tier, with mastery independent of first difficulty', async () => {
        fixtures.rows = [progress('difficulty-8', 1, true), progress('difficulty-4', 0), progress('mastery-4-10', 9)];
        fixtures.preloadArt = { 'difficulty-4': art('difficulty-4'), 'mastery-4-10': art('mastery-4-10') };
        const handler = new Handler(); handler.response.template = 'problem_detail.html';
        handler.response.body = { pdoc: { docId: 100, domainId: 'system', difficulty: 4 } };
        await handlers.injectAchievementContext(handler);
        assert.deepEqual(handler.UiContext.achievementImagePreload, [art('mastery-4-10').imageUrl]);
    });

    it('prewarms weekly upgrades from the current seven days and excludes questions already counted in that window', async () => {
        fixtures.rows = [{ ...progress('weekly-ac-5', 4), currentWindowProgress: 4 }];
        fixtures.preloadArt = { 'weekly-ac-5': art('weekly-ac-5') };
        const today = Math.floor((Date.now() + 8 * 3600000) / 86400000);
        const entry = { scope: 'legacy', uid: 11, domainId: 'system', pid: 100, acceptedAt: new Date(0) };
        fixtures.collections = { 'achievement.solved': [entry], 'achievement.weekly': [] };
        const make = async (template = 'problem_detail.html') => {
            const handler = new Handler(); handler.response.template = template;
            handler.response.body.pdoc = { domainId: 'system', docId: 100, difficulty: 4 };
            await handlers.injectAchievementContext(handler);
            return handler.UiContext.achievementImagePreload;
        };
        assert.deepEqual(await make(), [art('weekly-ac-5').imageUrl], 'an old lifetime solve can count in a new seven-day window');
        assert.deepEqual(await make('main.html'), [art('weekly-ac-5').imageUrl]);
        fixtures.collections['achievement.weekly'] = [{ ...entry, day: today - 6 }];
        assert.deepEqual(await make(), [], 'the first day of the seven-day window remains included');
        fixtures.collections['achievement.weekly'] = [{ ...entry, day: today - 7 }];
        assert.deepEqual(await make(), [art('weekly-ac-5').imageUrl]);
        fixtures.rows[0].currentWindowProgress = 0;
        assert.deepEqual(await make(), [], 'historical progress cannot prewarm an unreachable upgrade');
        assert.deepEqual(await make('main.html'), []);
        fixtures.rows[0].currentWindowProgress = 4;
        fixtures.rows.push(progress('weekly-ac-10', 10, true));
        assert.deepEqual(await make(), [], 'a covered lower weekly milestone is never prewarmed');
    });

    it('preloads the same configured thumbnail URLs across home, problems, records and different profiles', async () => {
        fixtures.preloadArt = { 'difficulty-2': art('difficulty-2'), 'solved-100': art('solved-100') };
        for (const [template, viewedUid] of [
            ['main.html', 11], ['problem_detail.html'], ['record_detail.html'], ['user_detail.html', 12], ['user_detail.html', 32],
        ]) {
            const handler = new Handler({ args: { uid: 999, domainId: 'elsewhere' } });
            handler.response.template = template;
            if (viewedUid) handler.response.body.udoc = { _id: viewedUid };
            await handlers.injectAchievementContext(handler);
            assert.deepEqual(handler.UiContext.achievementThumbnailPreload,
                [art('difficulty-2').thumbnailUrl, art('solved-100').thumbnailUrl]);
            if (template === 'user_detail.html') assert.equal(handler.UiContext.achievementImagePreload, undefined);
        }
        assert.equal(calls.some((call) => call[0] === 'ack'), false);
    });

    it('prewarms only the current account’s next reachable original at 99 solves and the current difficulty', async () => {
        fixtures.preloadArt = Object.fromEntries(['difficulty-2', 'difficulty-3', 'solved-100'].map((id) => [id, art(id)]));
        fixtures.rows = [progress('difficulty-2', 0), progress('difficulty-3', 0), progress('solved-100', 99)];
        const make = () => {
            const handler = new Handler({ args: { uid: 99 }, request: { query: { uid: 99 } } });
            handler.response.template = 'problem_detail.html';
            handler.response.body = { pdoc: { docId: 100, domainId: 'system', difficulty: 2, hidden: true }, udoc: { _id: 99 } };
            return handler;
        };
        const handler = make();
        await handlers.injectAchievementContext(handler);
        assert.deepEqual(handler.UiContext.achievementImagePreload, [art('difficulty-2').imageUrl, art('solved-100').imageUrl]);
        assert.deepEqual(calls.find((call) => call[0] === 'sync'), ['sync', 'system', 11, undefined]);
        assert.ok(calls.filter((call) => call[0] === 'dbFindOne').every((call) => call[2].uid === 11 && call[2].scope === 'legacy'));
        assert.equal(calls.some((call) => ['ack', 'pending'].includes(call[0])), false);
        fixtures.rows = [progress('difficulty-2', 1, true), progress('solved-100', 98)];
        const farther = make(); await handlers.injectAchievementContext(farther);
        assert.deepEqual(farther.UiContext.achievementImagePreload, []);
        fixtures.rows = [progress('solved-100', 99)];
        fixtures.collections = { 'achievement.solved': [{ scope: 'legacy', uid: 11, domainId: 'system', pid: 100, acceptedAt: new Date(0) }] };
        const repeat = make(); await handlers.injectAchievementContext(repeat);
        assert.deepEqual(repeat.UiContext.achievementImagePreload, []);
        delete fixtures.collections;
        const review = make(); review.response.body.mode = 'review'; await handlers.injectAchievementContext(review);
        assert.deepEqual(review.UiContext.achievementImagePreload, []);
        const objective = make(); objective.response.body.pdoc.objectiveKind = 'single'; await handlers.injectAchievementContext(objective);
        assert.deepEqual(objective.UiContext.achievementImagePreload, []);
    });

    it('prewarms homepage solve and mastery thresholds in a six-image budget without fetching every first-difficulty original', async () => {
        const ids = ['solved-100', ...Array.from({ length: 7 }, (_, index) => `mastery-${index + 4}-10`), 'difficulty-1', 'points-1000'];
        fixtures.preloadArt = Object.fromEntries(ids.map((id) => [id, art(id)]));
        fixtures.rows = ids.map((id) => progress(id, definition(id).target - 1));
        const home = new Handler(); home.response.template = 'main.html';
        await handlers.injectAchievementContext(home);
        assert.equal(home.UiContext.achievementImagePreload.length, 6);
        assert.equal(home.UiContext.achievementImagePreload[0], art('solved-100').imageUrl);
        assert.ok(!home.UiContext.achievementImagePreload.includes(art('difficulty-1').imageUrl));
        assert.ok(!home.UiContext.achievementImagePreload.includes(art('points-1000').imageUrl));
        assert.equal(calls.filter((call) => call[0] === 'sync').length, 1);
    });

    it('prewarms consecutive-day artwork only when today’s next AC can extend the current streak', async () => {
        fixtures.preloadArt = { 'streak-3': art('streak-3'), 'streak-100': art('streak-100') };
        // A fresh AC of an already-solved question can still count for a new day.
        fixtures.collections = { 'achievement.solved': [
            { scope: 'legacy', uid: 11, domainId: 'system', pid: 100, acceptedAt: new Date(0) },
        ] };
        const make = async (row, template = 'problem_detail.html') => {
            fixtures.rows = [row];
            const handler = new Handler();
            handler.response.template = template;
            handler.response.body = { pdoc: { docId: 100, domainId: 'system', difficulty: 2, hidden: true } };
            await handlers.injectAchievementContext(handler);
            return handler.UiContext.achievementImagePreload;
        };
        const nextDay = { ...progress('streak-3', 2), nextAcProgress: 3 };
        assert.deepEqual(await make(nextDay), [art('streak-3').imageUrl]);
        assert.deepEqual(await make(nextDay, 'main.html'), [art('streak-3').imageUrl]);
        assert.deepEqual(await make({ ...nextDay, nextAcProgress: 2 }), [], 'another AC today cannot add a day');
        assert.deepEqual(await make({ ...progress('streak-100', 99), nextAcProgress: 1 }), [], 'a broken record is not a current streak');
        assert.deepEqual(await make({ ...progress('streak-100', 99), nextAcProgress: 100 }), [art('streak-100').imageUrl]);
        assert.deepEqual(await make({ ...nextDay, unlocked: true }), []);
        assert.deepEqual(await make(progress('streak-3', 2)), [], 'missing current-streak evidence must not be guessed');
        assert.equal(calls.some((call) => ['ack', 'pending'].includes(call[0])), false);
    });

    it('prewarms contest AC and AK only for a formal participant whose current problem completes the required threshold', async () => {
        const tid = new ObjectId();
        const present = new Date();
        const start = new Date(+present - 3600000);
        const end = new Date(+present + 3600000);
        const tdoc = { domainId: 'system', docId: tid, rule: 'oi', pids: [1, 2, 3], beginAt: start, endAt: end, hideScoreboard: true, keepScoreboardHidden: true };
        const participant = { docType: 30, domainId: 'system', docId: tid, uid: 11, attend: 1, startAt: start };
        const solves = [1, 2].map((pid) => ({
            scope: 'legacy', uid: 11, domainId: 'system', pid, contestId: String(tid),
            submittedAt: new Date(+present - 10000), acceptedAt: new Date(+present - 9000),
        }));
        fixtures.rows = [progress('contest-ac-10', 9), progress('contest-ak-5', 4)];
        fixtures.preloadArt = { 'contest-ac-10': art('contest-ac-10'), 'contest-ak-5': art('contest-ak-5') };
        const make = async (member = participant, entries = solves, contest = tdoc) => {
            fixtures.collections = { 'document.status': [member], 'achievement.solved': entries };
            const handler = new Handler(); handler.response.template = 'problem_detail.html';
            handler.response.body = { pdoc: { domainId: 'system', docId: 3, difficulty: 4 }, tdoc: contest };
            await handlers.injectAchievementContext(handler);
            return handler.UiContext.achievementImagePreload;
        };
        assert.deepEqual(await make(), [art('contest-ac-10').imageUrl, art('contest-ak-5').imageUrl]);
        assert.deepEqual(await make(participant, [...solves, { ...solves[0], pid: 3, contestId: '' }]),
            [art('contest-ac-10').imageUrl, art('contest-ak-5').imageUrl]);
        assert.deepEqual(await make(participant, solves.slice(0, 1)), [art('contest-ac-10').imageUrl]);
        for (const extra of [{ uid: 99 }, { attend: 0 }, { unrank: true }, { virtual: true }, { practice: true }, { endAt: start }]) {
            assert.deepEqual(await make({ ...participant, ...extra }), []);
        }
        assert.deepEqual(await make(participant, [...solves, { ...solves[0], pid: 3 }]), []);
        assert.deepEqual(await make(participant, solves, { ...tdoc, endAt: start }), []);
        assert.deepEqual(await make(participant, solves, { ...tdoc, pids: [1, 2] }), []);
        assert.deepEqual(await make(participant, solves, { ...tdoc, rule: 'homework' }), []);
    });

    it('keeps prediction scoped to the active domain and disables originals while impersonating or viewing another profile', async () => {
        fixtures.rows = [progress('solved-100', 99)];
        fixtures.preloadArt = { 'solved-100': art('solved-100', 'class') };
        const modernHandler = new Handler({ domain: modern, args: { uid: 99, domainId: 'system' } });
        modernHandler.response.template = 'problem_detail.html';
        modernHandler.response.body = { pdoc: { domainId: 'class', docId: 10, difficulty: 2 } };
        await handlers.injectAchievementContext(modernHandler);
        assert.deepEqual(modernHandler.UiContext.achievementImagePreload, [art('solved-100', 'class').imageUrl]);
        assert.ok(calls.some((call) => call[0] === 'dbFindOne' && call[2].scope === 'domain:class' && call[2].uid === 11));
        const before = calls.length;
        const impersonated = new Handler({ session: { sudoUid: 2 } }); impersonated.response.template = 'problem_detail.html';
        await handlers.injectAchievementContext(impersonated);
        assert.equal(impersonated.UiContext.achievementImagePreload, undefined);
        assert.equal(calls.length, before);
        const foreign = new Handler({ domain: modern }); foreign.response.template = 'problem_detail.html';
        foreign.response.body = { pdoc: { domainId: 'other', docId: 10, difficulty: 2 } };
        await handlers.injectAchievementContext(foreign);
        assert.deepEqual(foreign.UiContext.achievementImagePreload, []);
    });

    it('populates the homepage with only the session owner’s unlocked achievements in the current domain', async () => {
        fixtures.rows = [{ ...definition('difficulty-1'), unlocked: true }, { ...definition('difficulty-2'), unlocked: false }];
        const handler = new Handler({ domain: modern, args: { uid: 99 }, request: { query: { uid: 99 } } });
        handler.response.template = 'main.html'; handler.response.body.udoc = { _id: 99 };
        await handlers.injectAchievementContext(handler);
        assert.deepEqual(calls, [['sync', 'class', 11, undefined]]);
        assert.deepEqual(handler.response.body.achievementWall, {
            items: [{ ...fixtures.rows[0], imageUrl: '/d/class/difficulty-1.png' }], total: 14, unlocked: 1,
        });
        assert.equal(handler.UiContext.achievementAutoShow, true);
        assert.equal(handler.UiContext.achievementScope, 'domain:class/11');
        assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
        assert.equal(handler.response.headers.Vary, 'Accept, Cookie, Authorization');
    });

    it('shows an empty homepage wall for a new user and no personal wall for anonymous or profile-disabled visitors', async () => {
        const signedIn = new Handler(); signedIn.response.template = 'main.html';
        await handlers.injectAchievementContext(signedIn);
        assert.deepEqual(signedIn.response.body.achievementWall, { items: [], total: 14, unlocked: 0 });
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
        assert.deepEqual(handler.UiContext, { achievementThumbnailPreload: [] });
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
