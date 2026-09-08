const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const Koa = require('koa');
const staticCache = require('koa-static-cache');
const request = require('supertest');

const filename = path.join(__dirname, '../packages/hydrooj/src/service/server.ts');
const compiled = esbuild.transformSync(fs.readFileSync(filename, 'utf8'), {
    loader: 'ts', format: 'cjs', target: 'es2022',
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).code;

async function createApp(t, nodeEnv) {
    const addon = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-static-reload-'));
    t.after(() => fs.rmSync(addon, { recursive: true, force: true }));
    const publicDir = path.join(addon, 'public');
    fs.mkdirSync(publicDir);
    fs.writeFileSync(path.join(publicDir, '604.before.chunk.js'), 'window.before = true;');
    fs.writeFileSync(path.join(addon, 'private.txt'), 'private addon source');

    // Run the real server plugin's public-layer registration. Only unrelated
    // database, authentication, and framework services are stubbed.
    const imports = {
        path,
        cac: () => ({ parse: () => ({ options: {} }) }),
        'fs-extra': fs,
        'koa-static-cache': staticCache,
        mongodb: {},
        '@hydrooj/framework': {
            Handler: class {}, ConnectionHandler: class {}, applyApiHandler() {},
        },
        '@hydrooj/framework/api': {},
        '@hydrooj/framework/decorators': {},
        '@hydrooj/framework/validator': {},
        '@hydrooj/utils': {},
        '../error': {},
        '../logger': { Logger: class {} },
        '../model/builtin': {},
        '../model/opcount': {},
        '../model/oplog': {},
        '../model/system': { get() {} },
        './db': {},
        './layers/base': {},
        './layers/domain': {},
        './layers/user': {},
        './layers/workspace': {},
    };
    const sandbox = {
        module: { exports: {} }, exports: {},
        process: { env: { NODE_ENV: nodeEnv, DEV: 'on' } },
        global: { addons: { fixture: addon } },
        require(name) {
            assert.ok(Object.hasOwn(imports, name), `Unexpected server dependency: ${name}`);
            return imports[name];
        },
    };
    vm.runInNewContext(compiled, sandbox, { filename });
    const app = new Koa();
    const childContext = {
        server: {
            addServerLayer(name, middleware) {
                if (name.endsWith('_public')) app.use(middleware);
            },
            addHandlerLayer() {}, setDefaultContext() {}, addWSLayer() {},
            addLayer() {}, handlerMixin() {}, httpHandlerMixin() {}, wsHandlerMixin() {},
        },
        on() {}, oauth: {}, i18n: { translate() {} },
    };
    await sandbox.module.exports.apply({
        plugin() {}, i18n: childContext.i18n,
        inject: async (_dependencies, callback) => callback(childContext),
    });
    // A missed public asset follows Hydro's guest login fallback, reproducing
    // the browser's failed chunk load instead of hiding it behind a fixture 404.
    app.use((ctx) => ctx.redirect('/login'));
    return { publicDir, client: request(app.callback()) };
}

describe('public assets after local UI rebuilds', () => {
    it('serves a newly generated hash without restarting the development server', async (t) => {
        const { publicDir, client } = await createApp(t, 'development');
        await client.get('/604.before.chunk.js').expect(200, 'window.before = true;');
        fs.writeFileSync(path.join(publicDir, '604.after.chunk.js'), 'window.after = true;');
        const response = await client.get('/604.after.chunk.js')
            .expect('Content-Type', /javascript/).expect(200, 'window.after = true;');
        assert.equal(response.headers.location, undefined);
        await client.head('/604.after.chunk.js').expect(200);
    });

    it('keeps production preloading unchanged even when DEV is enabled', async (t) => {
        const { publicDir, client } = await createApp(t, 'production');
        await client.get('/604.before.chunk.js').expect(200, 'window.before = true;');
        fs.writeFileSync(path.join(publicDir, '604.after.chunk.js'), 'window.after = true;');
        await client.get('/604.after.chunk.js').expect('Location', '/login').expect(302);
    });

    it('confines development discovery to public files and preserves the login fallback', async (t) => {
        const { publicDir, client } = await createApp(t, 'development');
        fs.writeFileSync(path.join(publicDir, '.private'), 'hidden file');
        await client.get('/private.txt').expect('Location', '/login').expect(302);
        await client.get('/.private').expect('Location', '/login').expect(302);
        await client.get('/missing.chunk.js').expect('Location', '/login').expect(302);
    });
});
