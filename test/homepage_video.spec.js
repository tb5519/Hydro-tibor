const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const domainSource = read('packages/hydrooj/src/handler/domain.ts');
const homeSource = read('packages/hydrooj/src/handler/home.ts');
function load(source, globals = {}, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(source, {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, { module, exports: module.exports, Date, Buffer, ...globals,
        require: (id) => { if (id in dependencies) return dependencies[id]; throw Error(`Unexpected import ${id}`); },
    });
    return module.exports;
}
const config = (globalValue) => load(read('packages/hydrooj/src/lib/home_poster.ts'), {}, {
    '../model/system': { __esModule: true, default: { get: () => globalValue } },
});
const { getHomePosterConfig } = config();
const isBackgroundVideoPath = (prefix, value, poster = false) => typeof value === 'string'
    && value.startsWith(`${prefix}${poster ? '-poster-' : '-'}`)
    && !value.slice(prefix.length).includes('/')
    && (poster ? /\.jpg$/.test(value) : /\.(mp4|webm)$/.test(value));
const paths = {
    videoPath: 'domain/class-a/home-video-123-valid.mp4',
    videoPosterPath: 'domain/class-a/home-video-poster-123-valid.jpg',
    videoUpdatedAt: '2026-10-12T00:00:00.000Z',
};
const oldConfig = {
    image: '/home/poster?v=old', storagePath: 'domain/class-a/home-poster-old.png', updatedAt: 'old',
    video: '/home/video?v=old', videoPath: 'domain/class-a/home-video-100-old.webm',
    videoPoster: '/home/video-poster?v=old', videoPosterPath: 'domain/class-a/home-video-poster-100-old.jpg',
    videoUpdatedAt: 'old',
};
class ValidationError extends Error {}
class NotFoundError extends Error {}
function admin(options = {}) {
    const calls = { permission: [], get: [], edit: [], saved: [], migrate: [], storeVideo: [], deleteVideo: [], put: [], del: [] };
    const current = { _id: 'class-a', homePoster: Object.hasOwn(options, 'config') ? options.config : { ...oldConfig } };
    const readConfig = config(options.globalPoster).getHomePosterConfig;
    class Handler {}
    const { DomainHomePosterHandler } = load(`${domainSource.slice(domainSource.indexOf('class ManageHandler'), domainSource.indexOf('class DomainNavigationSettingHandler'))}\nexport { DomainHomePosterHandler };`, {
        Handler, ValidationError, path, getHomePosterConfig: readConfig, isBackgroundVideoPath,
        BACKGROUND_VIDEO_MAX_SIZE: 40 * 1024 * 1024,
        param: () => () => {}, Types: { Range: () => {}, Int: {}, String: {} }, PERM: { PERM_EDIT_DOMAIN: 128n },
        storeBackgroundVideo: async (...args) => {
            calls.storeVideo.push(args);
            if (options.storageFails) throw new Error('Object storage unavailable');
            if (!args[0] || !args[1]) throw new ValidationError('video');
            return { ...paths };
        },
        deleteBackgroundVideo: async (...args) => calls.deleteVideo.push(args),
        domain: {
            get: async (id) => { calls.get.push(id); return { _id: id, homePoster: structuredClone(current.homePoster) }; },
            coll: { updateOne: async (query, pipeline) => {
                calls.migrate.push([query, pipeline]);
                if (options.concurrentFields) current.homePoster = { ...current.homePoster, ...options.concurrentFields };
                if (!current.homePoster || typeof current.homePoster !== 'object') {
                    current.homePoster = typeof current.homePoster === 'string'
                        ? { image: current.homePoster } : structuredClone(pipeline[0].$set.homePoster.$cond[2].$literal);
                }
            } },
            edit: async (...args) => {
                calls.edit.push(args);
                if (options.editFails) throw new Error('Database unavailable');
                for (const [key, value] of Object.entries(args[1])) {
                    assert.ok(key.startsWith('homePoster.'), 'only individual media fields may be changed');
                    current.homePoster[key.slice('homePoster.'.length)] = value;
                }
                calls.saved.push(structuredClone(current.homePoster));
                return current;
            },
        },
        storage: { put: async (...args) => calls.put.push(args), del: async (...args) => calls.del.push(args) },
    });
    const h = new DomainHomePosterHandler();
    h.user = { _id: 9 };
    h.domain = { _id: 'class-a', homePoster: structuredClone(current.homePoster) };
    h.request = { headers: { accept: options.json ? 'application/json' : 'text/html' }, files: {
        file: { filepath: '/tmp/video', originalFilename: options.image ? 'poster.png' : 'video.mp4', size: 1024 },
        ...(options.noPoster ? {} : { poster: { filepath: '/tmp/frame', originalFilename: 'poster.jpg', size: 100 } }),
    } };
    h.response = {};
    h.url = (route, params) => `/${route}?${new URLSearchParams(params?.query || {})}`;
    h.checkPerm = (value) => { calls.permission.push(value); if (options.denied) throw new Error('Permission denied'); };
    return { h, calls, current };
}
function serving(value = oldConfig, options = {}) {
    class Handler {}
    const calls = [];
    const publications = [];
    const classes = load(`${homeSource.slice(homeSource.indexOf('class HomeBackgroundVideoHandler'), homeSource.indexOf('class ServiceWorkerConfigHandler'))}\nexport { HomeBackgroundVideoHandler, HomeBackgroundVideoPosterHandler };`, {
        Handler, NotFoundError, getHomePosterConfig, isBackgroundVideoPath,
        redirectBackgroundVideo: async (h, target, version, publicHomepage) => {
            calls.push(target);
            publications.push({ version, publicHomepage });
            if (options.unavailable) throw new Error('Object storage unavailable');
            h.response.redirect = `https://media.example.test/${target}`;
        },
    });
    const make = (Type) => Object.assign(new Type(), {
        domain: { _id: 'class-a', homePoster: value }, response: { addHeader: () => {} },
    });
    return { video: make(classes.HomeBackgroundVideoHandler), poster: make(classes.HomeBackgroundVideoPosterHandler), calls, publications };
}

describe('homepage image and video compatibility', () => {
    it('preserves legacy image configuration and does not leak global posters to other domains', () => {
        const { getHomePosterConfig: readConfig } = config('https://example.test/legacy.jpg');
        assert.equal(readConfig({ _id: 'system' }).image, 'https://example.test/legacy.jpg');
        assert.equal(readConfig({ _id: 'other' }).image, '');
        assert.equal(readConfig({ _id: 'system', homePoster: { image: '' } }).image, '');
        assert.equal(readConfig({ _id: 'other', homePoster: 'https://example.test/class.jpg' }).image, 'https://example.test/class.jpg');
        assert.equal(getHomePosterConfig({ homePoster: oldConfig }).videoPath, oldConfig.videoPath);
    });

    it('requires existing domain administration permission before reads and mutations', async () => {
        const { h, calls } = admin({ denied: true });
        await assert.rejects(h.prepare({ domainId: 'class-a' }), /Permission denied/);
        assert.deepEqual(calls.permission, [128n]);
        assert.equal(calls.get.length, 0);
        assert.equal(calls.storeVideo.length, 0);
    });

    it('uploads video and generated cover to the current domain, preserves the image and only then removes old media', async () => {
        const { h, calls } = admin({ json: true });
        await h.prepare({ domainId: 'class-a' });
        await h.postUploadVideo('other-domain');
        assert.equal(calls.storeVideo[0][3], 'domain/class-a/home-video');
        assert.equal(calls.storeVideo[0][2], 9);
        assert.equal(calls.edit[0][0], 'class-a');
        const next = calls.saved[0];
        assert.equal(next.image, oldConfig.image);
        assert.equal(next.storagePath, oldConfig.storagePath);
        assert.equal(next.videoPath, paths.videoPath);
        assert.deepEqual(Array.from(calls.deleteVideo[0][0]), [oldConfig.videoPath, oldConfig.videoPosterPath]);
        assert.equal(h.response.body.success, true);
        assert.match(h.response.body.url, /domain_home_poster\?saved=1/);
        assert.equal(calls.put.length, 0, 'new video is never written through ordinary local-fallback storage');
    });

    it('does not modify configuration if object storage fails or a generated poster is missing', async () => {
        for (const options of [{ storageFails: true }, { noPoster: true }]) {
            const { h, calls } = admin(options);
            await assert.rejects(h.postUploadVideo());
            assert.equal(calls.edit.length, 0);
            assert.equal(calls.deleteVideo.length, 0);
        }
    });

    it('cleans newly uploaded media after a failed save without deleting the current video', async () => {
        const { h, calls } = admin({ editFails: true });
        await assert.rejects(h.postUploadVideo(), /Database unavailable/);
        assert.deepEqual(Array.from(calls.deleteVideo[0][0]), [paths.videoPath, paths.videoPosterPath]);
        assert.equal(calls.deleteVideo.length, 1);
    });

    it('image replacement and image removal preserve the video and generated cover', async () => {
        for (const operation of ['postUpload', 'postClear']) {
            const { h, calls } = admin({ image: true });
            await h[operation]('class-a');
            const next = calls.saved[0];
            assert.equal(next.videoPath, oldConfig.videoPath);
            assert.equal(next.videoPosterPath, oldConfig.videoPosterPath);
            assert.equal(calls.deleteVideo.length, 0);
            if (operation === 'postClear') assert.equal(next.image, '');
            else assert.notEqual(next.storagePath, oldConfig.storagePath);
        }
    });

    it('removing video preserves the static poster, and never deletes a path from another domain', async () => {
        const { h, calls } = admin({ config: { ...oldConfig,
            videoPath: 'domain/other/home-video-100-old.webm', videoPosterPath: 'domain/other/home-video-poster-100-old.jpg',
        } });
        await h.postClearVideo('other-domain');
        assert.equal(calls.edit[0][0], 'class-a');
        assert.equal(calls.saved[0].image, oldConfig.image);
        assert.equal(calls.saved[0].videoPath, '');
        assert.equal(calls.deleteVideo[0][0].length, 0);
    });

    it('admin preview receives separate versioned image, video and generated-cover URLs', async () => {
        const { h } = admin();
        await h.get('class-a');
        assert.match(h.response.body.config.image, /home_poster_image\?v=old/);
        assert.match(h.response.body.config.video, /home_background_video\?v=old/);
        assert.match(h.response.body.config.videoPoster, /home_background_video_poster\?v=old/);
        assert.equal(h.response.body.videoMaxSizeMb, 40);
    });

    it('concurrent image and video edits preserve the other tab\'s newly saved medium for upload and clear', async () => {
        for (const operation of ['postUploadVideo', 'postClearVideo', 'postUpload', 'postClear']) {
            const editsVideo = operation.endsWith('Video');
            const concurrentFields = editsVideo
                ? { image: '/new-image', storagePath: 'domain/class-a/home-poster-new.png', updatedAt: 'new-image' }
                : { video: '/new-video', videoPath: 'domain/class-a/home-video-new.mp4', videoUpdatedAt: 'new-video' };
            const { h, calls } = admin({ concurrentFields, image: !editsVideo });
            await h[operation]('class-a');
            for (const [field, value] of Object.entries(concurrentFields)) assert.equal(calls.saved[0][field], value, operation);
            const changed = Object.keys(calls.edit[0][1]);
            assert.equal(changed.includes('homePoster'), false);
            assert.equal(changed.some((key) => editsVideo ? !key.startsWith('homePoster.video') : key.startsWith('homePoster.video')), false);
        }
    });

    it('migrates string and missing legacy settings while preserving their effective image', async () => {
        for (const legacy of ['https://example.test/legacy.jpg', undefined, null]) {
            const { h, calls } = admin({ config: legacy });
            await h.postUploadVideo();
            assert.equal(calls.saved[0].image, typeof legacy === 'string' ? legacy : '');
            assert.equal(calls.saved[0].videoPath, paths.videoPath);
            assert.equal(calls.migrate[0][0]._id, 'class-a');
            assert.equal(calls.migrate[0][0].$expr.$ne[1], 'object', 'migration may never replace a modern media config');
        }
        const { h, calls } = admin({ config: undefined, globalPoster: { image: '/global-legacy.jpg', storagePath: 'domain/system/home-poster-old.png' } });
        h.domain._id = 'system';
        await h.postUploadVideo();
        assert.equal(calls.saved[0].image, '/global-legacy.jpg');
        assert.equal(calls.saved[0].storagePath, 'domain/system/home-poster-old.png');
    });
});

describe('homepage background video delivery', () => {
    it('redirects GET and HEAD for the selected domain video and its generated frame without streaming local bytes', async () => {
        const f = serving();
        await f.video.get();
        await f.poster.head();
        assert.deepEqual(f.calls, [oldConfig.videoPath, oldConfig.videoPosterPath]);
        assert.deepEqual(f.publications, [
            { version: oldConfig.videoUpdatedAt, publicHomepage: true },
            { version: oldConfig.videoUpdatedAt, publicHomepage: true },
        ]);
        assert.match(f.video.response.redirect, /^https:\/\/media\.example\.test\//);
        assert.equal(f.video.response.body, undefined);
    });

    it('rejects missing, cross-domain and arbitrary storage paths before delivery', async () => {
        for (const value of [{ image: '' }, { ...oldConfig, videoPath: 'user/1/private.mp4' },
            { ...oldConfig, videoPath: 'domain/class-b/home-video-100-old.mp4' }]) {
            const f = serving(value);
            await assert.rejects(f.video.get(), NotFoundError);
            assert.equal(f.calls.length, 0);
        }
        const f = serving({ ...oldConfig, videoPosterPath: 'domain/class-b/home-video-poster-100-old.jpg' });
        await assert.rejects(f.poster.get(), NotFoundError);
        assert.equal(f.calls.length, 0);
    });

    it('fails closed with a minimal public error when remote delivery is unavailable', async () => {
        const f = serving(oldConfig, { unavailable: true });
        await assert.rejects(f.video.get(), /Object storage unavailable/);
        await f.video.onerror();
        assert.equal(f.video.response.status, 404);
        assert.equal(f.video.response.type, 'text/plain');
        assert.equal(f.video.response.body, 'Video not available');
    });

    it('only bypasses domain-page admission for exact GET/HEAD decorative routes', () => {
        const { isHomePosterImageRequest } = load(read('packages/hydrooj/src/lib/decorative_image_access.ts'));
        for (const route of ['/home/poster', '/home/video', '/home/video-poster']) {
            assert.equal(isHomePosterImageRequest(route, 'GET'), true);
            assert.equal(isHomePosterImageRequest(route, 'HEAD'), true);
            assert.equal(isHomePosterImageRequest(route, 'POST'), false);
            assert.equal(isHomePosterImageRequest(`${route}/extra`, 'GET'), false);
        }
    });
});

it('admin preview renders image-only, video-only and mixed media without losing separate upload controls', () => {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(root, 'packages/ui-default/templates')), { autoescape: true });
    const template = read('packages/ui-default/templates/domain_home_poster.html').replace('{% extends "domain_base.html" %}', '');
    for (const value of [{ image: '/static.jpg' }, { image: '', video: '/video', videoPoster: '/frame.jpg', videoPath: paths.videoPath },
        { image: '/static.jpg', video: '/video', videoPoster: '/frame.jpg', videoPath: paths.videoPath }]) {
        const dom = new JSDOM(env.renderString(template, {
            config: value, recommendedRatio: '18:5', recommendedSize: '2160 × 600', videoMaxSizeMb: 40, _: (text) => text,
        }));
        const doc = dom.window.document;
        assert.equal(doc.querySelector('.domain-poster__preview img').getAttribute('src'), value.image || value.videoPoster);
        assert.equal(!!doc.querySelector('[data-loop-background]'), !!value.video);
        assert.equal(doc.querySelector('[data-background-video-upload] input[name="operation"]').value, 'upload_video');
        assert.ok(doc.querySelector('input[name="operation"][value="upload"]'), 'legacy image upload stays available');
        dom.window.close();
    }
});

it('the real Mongo migration and independent field updates preserve legacy images under concurrent saves', async (t) => {
    const mongo = await MongoMemoryServer.create();
    const client = await MongoClient.connect(mongo.getUri());
    t.after(async () => { await client.close(); await mongo.stop(); });
    const collection = client.db('home_video_atomic').collection('domain');
    await collection.insertMany([
        { _id: 'legacy', homePoster: 'https://example.test/legacy.jpg' },
        { _id: 'system' },
        { _id: 'modern', homePoster: { image: '/already-saved.jpg', videoPath: '/already-saved.mp4' } },
    ]);
    let modelEdits = 0;
    const start = domainSource.indexOf('    private async savePosterFields');
    const end = domainSource.indexOf("    @param('saved'", start);
    const { PosterWriter } = load(`class PosterWriter {\n${domainSource.slice(start, end)}\n}\nexport { PosterWriter };`, {
        getHomePosterConfig: config({ image: '/global-fallback.jpg' }).getHomePosterConfig,
        domain: { coll: collection, edit: async (id, update) => {
            modelEdits++;
            return collection.findOneAndUpdate({ _id: id }, { $set: update }, { returnDocument: 'after' });
        } },
    });
    const writer = (id) => Object.assign(new PosterWriter(), { domain: { _id: id } });
    await Promise.all([
        writer('legacy').savePosterFields({ videoPath: '/new-video.mp4' }),
        writer('legacy').savePosterFields({ image: '/new-image.jpg' }),
    ]);
    assert.deepEqual((await collection.findOne({ _id: 'legacy' })).homePoster, { image: '/new-image.jpg', videoPath: '/new-video.mp4' });
    await writer('system').savePosterFields({ videoPath: '/system-video.mp4' });
    assert.equal((await collection.findOne({ _id: 'system' })).homePoster.image, '/global-fallback.jpg');
    await writer('modern').savePosterFields({ videoPath: '/replacement-video.mp4' });
    assert.equal((await collection.findOne({ _id: 'modern' })).homePoster.image, '/already-saved.jpg');
    assert.equal(modelEdits, 4, 'all saves still go through the domain model hooks/cache invalidation path');
});
