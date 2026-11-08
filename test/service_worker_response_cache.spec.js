const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const Koa = require('koa');
const staticCache = require('koa-static-cache');
const request = require('supertest');

async function fixture(t) {
    const addon = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-worker-cache-'));
    t.after(() => fs.rmSync(addon, { recursive: true, force: true }));
    const publicDir = path.join(addon, 'public'); fs.mkdirSync(publicDir);
    fs.writeFileSync(path.join(publicDir, 'service-worker.js'), 'self.currentWorker = true;');
    fs.writeFileSync(path.join(publicDir, 'asset.abcdef.chunk.js'), 'window.reusableAsset = true;');
    const imports = {
        path, cac: () => ({ parse: () => ({ options: {} }) }), 'fs-extra': fs, 'koa-static-cache': staticCache, mongodb: {},
        '@hydrooj/framework': { Handler: class {}, ConnectionHandler: class {}, applyApiHandler() {} },
        '@hydrooj/framework/api': {}, '@hydrooj/framework/decorators': {}, '@hydrooj/framework/validator': {}, '@hydrooj/utils': {},
        '../error': {}, '../lib/decorative_image_access': { isHomePosterImageRequest: () => false },
        '../lib/domain_avatar_access': { isDomainAvatarImageRequest: () => false },
        '../lib/scratch_share_access': { isScratchShareRequest: () => false },
        '../lib/domain_type': require('../packages/hydrooj/src/lib/domain_type'),
        '../lib/public_media_cache': require('../packages/hydrooj/src/lib/public_media_cache'),
        '../logger': { Logger: class {} }, '../model/builtin': {}, '../model/opcount': {}, '../model/oplog': {},
        '../model/system': { get() {} }, './db': {}, './layers/base': {}, './layers/domain': {}, './layers/user': {}, './layers/workspace': {},
    };
    const filename = path.join(__dirname, '../packages/hydrooj/src/service/server.ts');
    const compiled = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022',
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }).code;
    const sandbox = { module: { exports: {} }, exports: {}, process: { env: { NODE_ENV: 'production', DEV: 'on' } },
        global: { addons: { fixture: addon } }, require: (name) => {
            assert.ok(Object.hasOwn(imports, name), `Unexpected server dependency: ${name}`); return imports[name];
        } };
    vm.runInNewContext(compiled, sandbox, { filename });
    const app = new Koa(); const registered = [];
    const childContext = { server: {
        addServerLayer(name, middleware) {
            registered.push(name);
            if (name === 'service-worker-cache' || name.endsWith('_public_media') || name.endsWith('_public')) app.use(middleware);
        },
        addHandlerLayer() {}, setDefaultContext() {}, addWSLayer() {}, addLayer() {}, handlerMixin() {}, httpHandlerMixin() {}, wsHandlerMixin() {},
    }, on() {}, oauth: {}, i18n: { translate() {} } };
    await sandbox.module.exports.apply({ plugin() {}, i18n: childContext.i18n,
        inject: async (_dependencies, callback) => callback(childContext) });
    return { client: request(app.callback()), registered };
}

test('mutable service worker responses cannot inherit static, browser or intermediary cache lifetimes', async (t) => {
    const { client, registered } = await fixture(t);
    assert.ok(registered.indexOf('service-worker-cache') < registered.findIndex((name) => name.endsWith('_public_media')));
    for (const url of ['/service-worker.js', '/service-worker.js?version=release123']) {
        for (const method of ['get', 'head']) {
            const response = await client[method](url).set('Accept-Encoding', 'gzip, deflate, br, zstd').expect(200);
            assert.equal(response.headers['cache-control'], 'no-store, no-cache, max-age=0, must-revalidate');
            assert.equal(response.headers['cdn-cache-control'], 'no-store');
            assert.equal(response.headers['surrogate-control'], 'no-store');
            assert.equal(response.headers.expires, undefined);
            assert.match(response.headers['content-type'], /javascript/);
            if (method === 'get') assert.equal(response.text, 'self.currentWorker = true;');
        }
    }
    const asset = await client.get('/asset.abcdef.chunk.js').expect(200);
    assert.match(asset.headers['cache-control'], /max-age=86400/);
    assert.equal(asset.headers['cdn-cache-control'], undefined);
    const worker = await client.get('/service-worker.js').expect(200);
    assert.ok(worker.headers.etag);
    const unchanged = await client.get('/service-worker.js').set('If-None-Match', worker.headers.etag).expect(304);
    assert.match(unchanged.headers['cache-control'], /no-store/);
    assert.equal(unchanged.headers['cdn-cache-control'], 'no-store');
});
