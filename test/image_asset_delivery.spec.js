const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const nunjucks = require('nunjucks');

const root = path.resolve(__dirname, '..');
const hydro = path.join(root, 'packages/hydrooj/src');
function load(source, globals = {}, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(source, {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, {
        module, exports: module.exports, Buffer, URL, process, console,
        require: (name) => dependencies[name] || require(name), ...globals,
    });
    return module.exports;
}
const read = (file) => fs.readFileSync(path.join(hydro, file), 'utf8');
const { isInlineRasterImage } = load(read('lib/inline_image.ts'));
const mediaCache = load(read('lib/media_cache.ts'));
const { isPublicHomePosterPath } = load(read('lib/decorative_image_access.ts'));
class NotFoundError extends Error {}
class Handler {
    constructor() {
        this.domain = { _id: 'class-a' };
        this.request = { method: 'get', headers: {}, query: {}, path: '/file/42/image.png', querystring: '' };
        this.context = {};
        this.response = { headers: {}, addHeader(key, value) { this.headers[key] = value; } };
    }
}

function handlers(options = {}) {
    const calls = { metadata: [], read: [], delivery: [], signed: [], log: [] };
    const bytes = Buffer.from('existing image');
    const storage = {
        async getMeta(target) {
            calls.metadata.push(target);
            return options.missing ? null : { size: bytes.length, etag: options.version || 'image-v1', 'Content-Type': options.type || 'image/png' };
        },
        async get(target) { calls.read.push(target); return bytes; },
        async signDownloadLink(...args) { calls.signed.push(args); return '/storage?existing-signature'; },
    };
    const shared = {
        Handler, NotFoundError, storage, isPublicHomePosterPath, param: () => () => {}, Types: { Range: () => [] }, isInlineRasterImage,
        ...mediaCache,
        lookup: () => 'image/png',
        tryRedirectAsset(handler, source) {
            calls.delivery.push(source);
            if (options.delivery) return options.delivery.tryRedirectAsset(handler, source);
            if (mediaCache.validateMediaCacheRequest(handler, source) || mediaCache.respondMediaCache(handler, source)) return true;
            if (!options.ready) return false;
            handler.response.status = 302;
            handler.response.redirect = 'https://media.example.test/image.png?auth_key=short-lived';
            handler.response.addHeader('Cache-Control', 'private, no-store');
            return true;
        },
    };
    const home = read('handler/home.ts');
    const homeHandlers = load(`${home.slice(home.indexOf('class HomePosterImageHandler'), home.indexOf('class PointLotteryDrawHandler'))}
        export { HomePosterImageHandler, PointLotteryPrizeImageHandler };`, {
        ...shared,
        getHomePosterConfig: (domain) => ({
            storagePath: options.noPoster ? '' : options.posterPath || `domain/${domain._id}/home-poster-123.png`,
        }),
        getPointLotteryStoragePrefix: (domain) => `domain/${domain._id}/point-lottery`,
    });
    const misc = read('handler/misc.ts');
    const fileHandlers = load(misc.slice(misc.indexOf('export class FSDownloadHandler'), misc.indexOf('export class StorageHandler')), {
        ...shared, oplog: { log: async (...args) => { calls.log.push(args); } },
    });
    const signedHandlers = load(misc.slice(misc.indexOf('export class StorageHandler'), misc.indexOf('export class SwitchAccountHandler')), {
        ...shared, AccessDeniedError: class extends Error {}, lookup: require('mime-types').lookup,
        encodeRFC5987ValueChars: encodeURIComponent,
    });
    const problemSource = read('handler/problem.ts');
    class ProblemDetailHandler extends Handler {
        constructor() {
            super();
            this.pdoc = { domainId: 'class-a', docId: 10, ...(options.reference ? { reference: { domainId: 'library', pid: 30 } } : {}) };
            this.user = { own: () => true };
        }

        checkPerm() { if (options.denied) throw new Error('Permission denied'); }
    }
    const problemHandlers = load(problemSource.slice(problemSource.indexOf('export class ProblemFileDownloadHandler'),
        problemSource.indexOf('export class ProblemSolutionHandler')), {
        ...shared, ProblemDetailHandler, query: () => () => {}, PERM: {}, PRIV: {},
        isScratchObjectiveTeacher: () => false,
        oplog: { log: async (...args) => { calls.log.push(args); } },
        problem: { get: async () => ({ domainId: 'library', docId: 30 }) },
        ProblemIsReferencedError: class extends Error {}, ProblemNotFoundError: NotFoundError,
    });
    return { ...homeHandlers, ...fileHandlers, ...signedHandlers, ...problemHandlers, calls, bytes };
}

describe('authorized image handler delivery', () => {
    it('retired mobile homepage routes and storage paths are not exposed through desktop image delivery', async () => {
        const source = read('handler/home.ts');
        assert.equal(source.includes("ctx.Route('home_poster_mobile_image'"), false);
        const f = handlers({ posterPath: 'domain/class-a/home-poster-mobile-123.png' });
        await assert.rejects(new f.HomePosterImageHandler().get(), NotFoundError);
        assert.equal(f.calls.metadata.length, 0);
    });

    it('keeps original image responses when delivery is disabled or the mirror is not ready', async () => {
        const h = handlers();
        const poster = new h.HomePosterImageHandler();
        await poster.get();
        const prize = new h.PointLotteryPrizeImageHandler();
        await prize.get({ domainId: 'attacker-domain' }, 'lottery-prize-123.png');
        assert.strictEqual(poster.response.body, h.bytes);
        assert.strictEqual(prize.response.body, h.bytes);
        assert.equal(poster.response.type, 'image/png');
        assert.deepEqual(h.calls.read, [
            'domain/class-a/home-poster-123.png', 'domain/class-a/point-lottery/lottery-prize-123.png',
        ]);
        assert.deepEqual(h.calls.delivery.map((item) => item.path), h.calls.read);
        assert.equal(poster.response.redirect, undefined);
    });

    it('redirects ready images after metadata checks and preserves the current domain', async () => {
        const h = handlers({ ready: true });
        const poster = new h.HomePosterImageHandler();
        const prize = new h.PointLotteryPrizeImageHandler();
        await poster.get();
        await prize.get({ domainId: 'attacker-domain' }, 'lottery-prize-123.png');
        assert.deepEqual(h.calls.read, []);
        assert.equal(h.calls.delivery.length, 2);
        for (const handler of [poster, prize]) {
            assert.equal(handler.response.status, 302);
            assert.equal(handler.response.headers['Cache-Control'], 'private, no-store');
            assert.equal(handler.response.body, undefined);
        }
        assert.equal(h.calls.delivery[1].path, 'domain/class-a/point-lottery/lottery-prize-123.png');
    });

    it('never queues an absent or unconfigured image', async () => {
        const h = handlers({ missing: true, ready: true });
        await assert.rejects(new h.HomePosterImageHandler().get(), NotFoundError);
        await assert.rejects(new h.PointLotteryPrizeImageHandler().get({}, 'missing.png'), NotFoundError);
        assert.deepEqual(h.calls.delivery, []);
        assert.deepEqual(h.calls.read, []);
        const absent = handlers({ noPoster: true });
        await assert.rejects(new absent.HomePosterImageHandler().get(), NotFoundError);
        assert.deepEqual(absent.calls.metadata, []);
    });

    it('limits file delivery to actual account-avatar image metadata and retains the audit log', async () => {
        const h = handlers({ ready: true });
        const avatar = new h.FSDownloadHandler();
        await avatar.get('class-a', 42, '.avatar.png');
        assert.equal(avatar.response.status, 302);
        assert.equal(h.calls.delivery[0].path, 'user/42/.avatar.png');
        assert.equal(h.calls.log.length, 1);
        assert.deepEqual(h.calls.signed, []);
        for (const filename of ['submission.png', 'private.sb3', '.avatar.svg', '.avatar.png.backup']) {
            const file = new h.FSDownloadHandler();
            await file.get('class-a', 42, filename); // eslint-disable-line no-await-in-loop
            assert.equal(file.response.redirect, '/storage?existing-signature');
        }
        assert.equal(h.calls.delivery.length, 1);
        const disguised = handlers({ ready: true, type: 'application/octet-stream' });
        await new disguised.FSDownloadHandler().get('class-a', 42, '.avatar.png');
        assert.deepEqual(disguised.calls.delivery, []);
        assert.equal(disguised.calls.signed.length, 1);
        const cold = handlers();
        await new cold.FSDownloadHandler().get('class-a', 42, '.avatar.jpg', true);
        assert.deepEqual(cold.calls.signed[0], ['user/42/.avatar.jpg', undefined, false, 'user',
            { size: cold.bytes.length, etag: 'image-v1', 'Content-Type': 'image/png' }]);
    });

    it('delivers requested inline raster user images while keeping missing files and other content in the old flow', async () => {
        const h = handlers({ ready: true });
        const image = new h.FSDownloadHandler();
        await image.get('class-a', 42, 'lesson.png', true);
        assert.equal(image.response.status, 302);
        assert.equal(h.calls.delivery[0].path, 'user/42/lesson.png');
        assert.equal(h.calls.log.length, 1);
        for (const filename of ['lesson.svg', 'lesson.html', 'private.sb3']) {
            await new h.FSDownloadHandler().get('class-a', 42, filename, true); // eslint-disable-line no-await-in-loop
        }
        assert.equal(h.calls.delivery.length, 1);
        const missing = handlers({ ready: true, missing: true });
        await new missing.FSDownloadHandler().get('class-a', 42, 'missing.png', true);
        assert.deepEqual(missing.calls.delivery, []);
        assert.equal(missing.calls.signed.length, 1);
    });

    it('delivers authorized inline problem images after the audit log, including authorized reference targets', async () => {
        const h = handlers({ ready: true, reference: true });
        const image = new h.ProblemFileDownloadHandler();
        await image.get({}, 'additional_file', 'diagram.png', true);
        assert.equal(image.response.status, 302);
        assert.equal(h.calls.delivery[0].path, 'problem/library/30/additional_file/diagram.png');
        assert.equal(h.calls.log[0][1], 'download.problem.single');
        assert.deepEqual(h.calls.signed, []);
        const cold = handlers();
        await new cold.ProblemFileDownloadHandler().get({}, 'additional_file', 'diagram.png', true);
        assert.deepEqual(cold.calls.signed[0], ['problem/class-a/10/additional_file/diagram.png', undefined, false, 'user',
            { size: cold.bytes.length, etag: 'image-v1', 'Content-Type': 'image/png' }]);
    });

    it('never delivers problem testdata, ordinary downloads, missing files or denied requests', async () => {
        const h = handlers({ ready: true });
        await new h.ProblemFileDownloadHandler().get({}, 'testdata', 'diagram.png', true);
        await new h.ProblemFileDownloadHandler().get({}, 'additional_file', 'diagram.png', false);
        assert.deepEqual(h.calls.delivery, []);
        assert.equal(h.calls.signed.length, 2);
        const missing = handlers({ ready: true, missing: true });
        await new missing.ProblemFileDownloadHandler().get({}, 'additional_file', 'missing.png', true);
        assert.deepEqual(missing.calls.delivery, []);
        const denied = handlers({ ready: true, denied: true });
        await assert.rejects(new denied.ProblemFileDownloadHandler().get({}, 'additional_file', 'secret.png', true), /Permission denied/);
        assert.deepEqual(denied.calls.metadata, []);
        assert.deepEqual(denied.calls.delivery, []);
        assert.deepEqual(denied.calls.signed, []);
    });

    it('resolves inline audio and video after authorization and changes cache identity when a filename is replaced', async () => {
        for (const [filename, type] of [['lesson.mp4', 'video/mp4'], ['voice.mp3', 'audio/mpeg']]) {
            const before = handlers({ type, version: 'before' });
            const original = new before.ProblemFileDownloadHandler();
            original.request.headers['x-hydro-media-cache'] = 'resolve-v1';
            original.request.path = `/p/10/file/${filename}`;
            original.request.querystring = 'noDisposition=1';
            await original.get({}, 'additional_file', filename, true);
            assert.equal(original.response.type, 'application/json');
            assert.equal(original.response.headers['Cache-Control'], 'private, no-store');
            assert.equal(original.response.body.mediaCache.type, type);
            assert.equal(before.calls.read.length, 0);
            assert.equal(before.calls.signed.length, 0);

            const after = handlers({ type, version: 'after' });
            const current = new after.ProblemFileDownloadHandler();
            current.request.headers['x-hydro-media-cache'] = 'resolve-v1';
            await current.get({}, 'additional_file', filename, true);
            assert.notEqual(current.response.body.mediaCache.version, original.response.body.mediaCache.version);
            const stale = new after.ProblemFileDownloadHandler();
            stale.request.query = Object.fromEntries(new URL(original.response.body.mediaCache.url, 'https://oj.test').searchParams);
            await stale.get({}, 'additional_file', filename, true);
            assert.equal(stale.response.status, 409);
            assert.equal(after.calls.signed.length, 0);
        }
    });

    it('keeps media resolution behind problem access and preserves SVG and attachment delivery', async () => {
        const denied = handlers({ type: 'video/mp4', denied: true });
        const request = new denied.ProblemFileDownloadHandler();
        request.request.headers['x-hydro-media-cache'] = 'resolve-v1';
        await assert.rejects(request.get({}, 'additional_file', 'lesson.mp4', true), /Permission denied/);
        assert.equal(denied.calls.delivery.length, 0);
        const svg = handlers({ type: 'image/svg+xml' });
        const image = new svg.FSDownloadHandler();
        image.request.headers['x-hydro-media-cache'] = 'resolve-v1';
        await image.get('class-a', 42, 'drawing.svg', true);
        assert.equal(image.response.body, undefined);
        assert.equal(svg.calls.signed.length, 1);
        const download = new svg.FSDownloadHandler();
        download.request.headers['x-hydro-media-cache'] = 'resolve-v1';
        await download.get('class-a', 42, 'drawing.svg', false);
        assert.equal(svg.calls.signed[1][1], 'drawing.svg');
    });

    it('reads signed local image bytes with the real delivery layer disabled', async (t) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-local-image-'));
        t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
        const { AssetDelivery } = load(read('lib/asset_delivery.ts'), { __dirname: path.join(hydro, 'lib') }, { './media_cache': mediaCache });
        const h = handlers({ delivery: new AssetDelivery({ configPath: path.join(directory, 'absent.json') }) });
        const request = new h.StorageHandler();
        request.ctx = { get: () => ({
            isLinkValid: async () => true,
            getMeta: async () => ({ size: h.bytes.length, etag: 'physical-image-v1' }),
        }) };
        await request.get({}, 'ab/poster.png', '', Date.now() + 10000, 'valid');
        assert.strictEqual(request.response.body, h.bytes);
        assert.equal(request.response.type, 'image/png');
        assert.equal(request.response.redirect, undefined);
        assert.equal(request.response.headers['Cache-Control'], 'private, max-age=31536000, immutable');
        assert.deepEqual(h.calls.read, ['ab/poster.png']);
    });

    it('serves byte ranges from signed local media only after signature and expiry validation', async () => {
        const h = handlers();
        const make = (valid = true) => {
            const request = new h.StorageHandler();
            request.ctx = { get: () => ({
                isLinkValid: async () => valid,
                getMeta: async () => ({ size: h.bytes.length, etag: 'physical-file-v1' }),
            }) };
            request.request.headers.range = 'bytes=2-5';
            return request;
        };
        const good = make();
        await good.get({}, 'ab/movie.mp4', '', Date.now() + 10000, 'valid');
        assert.equal(good.response.status, 206);
        assert.equal(good.response.headers['Content-Range'], `bytes 2-5/${h.bytes.length}`);
        assert.equal(good.response.headers['Content-Length'], '4');
        assert.equal(good.response.headers['Cache-Control'], 'private, max-age=31536000, immutable');
        assert.deepEqual(good.response.body, h.bytes.subarray(2, 6));
        const reads = h.calls.read.length;
        await assert.rejects(make(false).get({}, 'ab/movie.mp4', '', Date.now() + 10000, 'invalid'));
        await assert.rejects(make().get({}, 'ab/movie.mp4', '', Date.now() - 1, 'expired'));
        assert.equal(h.calls.read.length, reads);
    });
});

it('keeps media requests behind existing guest and workspace access rules', async () => {
    const avatarAccess = load(read('lib/domain_avatar_access.ts'));
    const shareAccess = load(read('lib/scratch_share_access.ts'));
    const posterAccess = load(read('lib/decorative_image_access.ts'));
    const server = read('service/server.ts');
    const guestSource = server.slice(server.indexOf('const GUEST_ACCESSIBLE_PATHS'), server.indexOf("declare module '@hydrooj/framework'"));
    const guest = load(`${guestSource}\nexport { isGuestAccessiblePath };`, { ...avatarAccess, ...shareAccess, ...posterAccess });
    const workspace = load(read('service/layers/workspace.ts'), {}, {
        '../../lib/domain_avatar_access': avatarAccess,
        '../../lib/decorative_image_access': posterAccess,
        '../../lib/scratch_share_access': shareAccess,
        '../../model/workspace': {
            isEnabled: () => true, isPlatformAdmin: () => false,
            getAssignedWorkspaceIds: async () => ['own-workspace'],
            resolveDomainWorkspaceId: () => 'other-workspace', getDomains: async () => [{ _id: 'own-class' }],
            LEGACY_WORKSPACE_ID: 'legacy',
        },
    });
    assert.equal(guest.isGuestAccessiblePath('/home/poster', 'GET'), true);
    assert.equal(guest.isGuestAccessiblePath('/home/poster', 'POST'), false);
    for (const route of ['/image-warmup', '/lottery/prize/lottery-prize-123.png', '/badge/2/background',
        '/badge/2/ac-image', '/file/42/.avatar.png', '/file/42/private.sb3']) {
        assert.equal(guest.isGuestAccessiblePath(route, 'GET'), false, route);
        const result = await workspace.resolveWorkspaceAccess({ // eslint-disable-line no-await-in-loop
            HydroContext: { user: { _id: 40 } }, domainInfo: { _id: 'other-class' },
            request: { path: route, method: 'GET', querystring: '' }, originalPath: `/d/other-class${route}`,
        });
        assert.equal(result.allowed, false, route);
    }
});

it('maps only allowlisted static images and preserves disabled, external and protected URLs', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-static-images-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.mkdirSync(path.join(directory, 'components/profile/backgrounds'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'favicon.svg'), '<svg/>');
    fs.writeFileSync(path.join(directory, 'components/profile/backgrounds/1.jpg'), 'image');
    fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
        background: '/components/profile/backgrounds/1.jpg?v=hash',
    }));
    const { AssetDelivery } = load(read('lib/asset_delivery.ts'), { __dirname: path.join(hydro, 'lib') }, { './media_cache': mediaCache });
    const config = path.join(directory, 'assets.json');
    const disabled = new AssetDelivery({ configPath: config, publicRoot: directory });
    const helpers = (delivery) => load(fs.readFileSync(path.join(root, 'packages/ui-default/backendlib/asset_url.ts'), 'utf8'), {}, {
        hydrooj: { assetDelivery: delivery },
    });
    assert.equal(helpers(disabled).assetUrl('/favicon.svg', 'https://existing.example/favicon.svg'), 'https://existing.example/favicon.svg');
    fs.writeFileSync(config, JSON.stringify({ enabled: true, publicBaseUrl: 'https://static.example/static/release-1/' }));
    const enabled = new AssetDelivery({ configPath: config, publicRoot: directory });
    const { assetUrl } = helpers(enabled);
    assert.equal(assetUrl('/favicon.svg?v=brand'), 'https://static.example/static/release-1/favicon.svg?v=brand');
    assert.equal(assetUrl('/components/profile/backgrounds/1.jpg'), 'https://static.example/static/release-1/components/profile/backgrounds/1.jpg?v=hash');
    for (const url of ['https://photos.example/portrait.png', '//photos.example/portrait.png', '/file/42/.avatar.png',
        '/d/private/badge/1/background', '/resource/private.png', '/components/profile/backgrounds/../../private.jpg']) {
        assert.equal(assetUrl(url), url);
    }
    const avatars = load(read('lib/avatar.ts'), {}, {
        '@hydrooj/framework/validator': { Types: {} }, '../utils': { md5: () => 'hash' },
        './asset_delivery': { staticAssetUrl: (value) => enabled.staticAssetUrl(value) },
    });
    assert.equal(avatars.default('url:/favicon.svg'), 'https://static.example/static/release-1/favicon.svg');
    assert.equal(avatars.default('url:/file/42/.avatar.png'), '/file/42/.avatar.png');
    assert.equal(avatars.default('url:https://photos.example/portrait.png'), 'https://photos.example/portrait.png');
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(root, 'packages/ui-default/templates')), { autoescape: true });
    env.addGlobal('assetUrl', assetUrl);
    const errorPage = env.render('scratch_share_error.html', { message: '<please retry>' });
    assert.match(errorPage, /https:\/\/static\.example\/static\/release-1\/favicon\.svg\?v=onebyone-one-20260920/);
    assert.match(errorPage, /&lt;please retry&gt;/);
});

it('serves only the selected current-domain poster and commits real safe GET/HEAD/errors through the framework', async () => {
    const Koa = require('koa');
    const request = require('supertest');
    const baseLayer = load(fs.readFileSync(path.join(root, 'framework/framework/base.ts'), 'utf8'), { Blob }, {
        '@hydrooj/framework': { serializer: () => (_, value) => value },
        '@hydrooj/utils/lib/utils': { errorMessage: (error) => error },
        './error': { SystemError: Error, UserFacingError: Error },
    }).default;
    const make = (options) => {
        const f = handlers(options); const app = new Koa();
        app.use(async (ctx, next) => { ctx.params = {}; await next(); });
        app.use(baseLayer({ error() {} }, '', ''));
        app.use(async (ctx) => {
            const h = new f.HomePosterImageHandler();
            Object.assign(h, { context: ctx, request: ctx.HydroContext.request, response: ctx.HydroContext.response });
            ctx.handler = h;
            ctx.HydroContext.UiContext = { domain: { owner: 42, privateSetting: 'must-not-leak' } };
            ctx.HydroContext.user = { privateAccount: 'must-not-leak' };
            try { await h[ctx.method.toLowerCase()](); } catch { await h.onerror(); }
        });
        return { http: request(app.callback()), f };
    };
    const origin = make({});
    await origin.http.get('/home/poster').set('X-Hydro-Inject', 'uicontext,usercontext').expect(200).expect('Content-Type', /image\/png/);
    const head = await origin.http.head('/home/poster').expect(200);
    assert.equal(head.text, undefined);
    assert.equal(+head.headers['content-length'], origin.f.bytes.length);
    assert.equal(origin.f.calls.read.length, 1, 'HEAD must not read image bytes');
    const cdn = make({ ready: true });
    const redirected = await cdn.http.get('/home/poster?noTemplate=1').set('Accept', 'application/json')
        .set('X-Hydro-Inject', 'uicontext,usercontext').expect(302);
    assert.deepEqual(Object.keys(redirected.body), ['url']);
    assert.equal(JSON.stringify(redirected.body).includes('must-not-leak'), false);
    for (const options of [{ missing: true }, { type: 'text/html' }, { posterPath: 'domain/other-class/home-poster-123.png' },
        { posterPath: 'user/42/private.png' }, { noPoster: true }]) {
        const missing = make(options);
        for (const accept of ['application/json', 'text/html']) {
            const response = await missing.http.get('/home/poster?noTemplate=1').set('Accept', accept)
                .set('X-Hydro-Inject', 'uicontext,usercontext').expect(404);
            assert.equal(response.text, 'Image not available');
            assert.equal(response.headers['cache-control'], 'no-store');
        }
        assert.equal(missing.f.calls.read.length, 0);
    }
});
