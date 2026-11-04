const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const Koa = require('koa');
const staticCache = require('koa-static-cache');

const filename = path.join(__dirname, '../packages/hydrooj/src/lib/public_media_cache.ts');
const compiled = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const moduleValue = { exports: {} };
vm.runInNewContext(compiled, { module: moduleValue, exports: moduleValue.exports, require, Buffer, URLSearchParams });
const { publicMediaCache, publicMediaSnapshot } = moduleValue.exports;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function release(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-public-media-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const write = (name, body) => {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    };
    write('background.png', 'background one');
    write('unlisted.png', 'unlisted');
    write('app.js', 'javascript');
    write('editor.html', 'html');
    write('img/avatar.png', 'avatar');
    write('scratch-editor/static/blocks-media/default/click.wav', '0123456789');
    write('scratch-editor/static/assets/cat.svg', '<svg/>');
    write('scratch-editor/editor.html', '<html/>');
    write('manifest.json', JSON.stringify({ image: '/background.png?oldhash', script: '/app.js', entry: '/editor.html' }));
    write('scratch-editor/build-manifest.json', JSON.stringify({ files: {
        'static/blocks-media/default/click.wav': hash('0123456789'),
        'static/assets/cat.svg': hash('<svg/>'),
        'editor.html': hash('<html/>'),
    } }));
    return { dir, write };
}

async function serve(t, directory) {
    const app = new Koa();
    app.use(async (ctx, next) => {
        await next();
        if (ctx.path.startsWith('/scratch-editor/')) ctx.set('Access-Control-Allow-Origin', '*');
    });
    app.use(publicMediaCache(directory));
    app.use(staticCache(directory, { maxAge: 86400000 }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { get: (url, options = {}) => fetch(new URL(url, origin), { redirect: 'manual', ...options }) };
}

test('public images resolve to content versions and support one-year GET, HEAD and revalidation', async (t) => {
    const files = release(t);
    const app = await serve(t, files.dir);
    const first = await app.get('/background.png?oldhash');
    assert.equal(first.status, 302);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const location = first.headers.get('location');
    assert.equal(new URL(location, 'https://oj.test').searchParams.get('__public_media'), hash('background one'));
    const image = await app.get(location);
    assert.equal(image.status, 200);
    assert.equal(await image.text(), 'background one');
    assert.equal(image.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const head = await app.get(location, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '14');
    assert.equal(await head.text(), '');
    const unchanged = await app.get(location, { cache: 'force-cache', headers: { 'If-None-Match': image.headers.get('etag') } });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const avatar = await app.get('/img/avatar.png');
    assert.equal(avatar.status, 302, 'release-owned default avatars also have a content version');
});

test('Scratch opaque frames retain CORS and versioned audio supports ranges', async (t) => {
    const files = release(t);
    const app = await serve(t, files.dir);
    const sound = await app.get('/scratch-editor/static/blocks-media/default/click.wav');
    assert.equal(sound.status, 302);
    assert.equal(sound.headers.get('access-control-allow-origin'), '*');
    const url = sound.headers.get('location');
    const partial = await app.get(url, { headers: { Range: 'bytes=2-5', Origin: 'null' } });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(partial.headers.get('content-length'), '4');
    assert.equal(partial.headers.get('access-control-allow-origin'), '*');
    assert.equal(await partial.text(), '2345');
    const invalid = await app.get(url, { headers: { Range: 'bytes=20-' } });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('cache-control'), 'no-store');
    const svg = await app.get('/scratch-editor/static/assets/cat.svg');
    assert.equal(svg.status, 302, 'only release-owned static SVGs qualify');
});

test('replacement cannot fill the old content key, and a restarted release redirects to the new bytes', async (t) => {
    const files = release(t);
    const old = await serve(t, files.dir);
    const first = await old.get('/background.png');
    const oldUrl = first.headers.get('location');
    files.write('background.png', 'background two');
    const duringUpdate = await old.get(oldUrl);
    assert.equal(duringUpdate.status, 409);
    assert.equal(duringUpdate.headers.get('cache-control'), 'no-store');
    assert.notEqual(await duringUpdate.text(), 'background two');
    const current = await serve(t, files.dir);
    const stale = await current.get(oldUrl);
    assert.equal(stale.status, 302);
    assert.notEqual(stale.headers.get('location'), oldUrl);
    const latest = await current.get(stale.headers.get('location'));
    assert.equal(await latest.text(), 'background two');
    assert.equal(latest.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});

test('HTML, JavaScript, unlisted files, API routes and mutations keep ordinary handling', async (t) => {
    const files = release(t);
    const app = await serve(t, files.dir);
    for (const url of ['/editor.html', '/app.js', '/unlisted.png', '/scratch-editor/editor.html']) {
        const response = await app.get(url);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'public, max-age=86400000');
    }
    assert.equal((await app.get('/file/2/private.png')).status, 404);
    assert.equal((await app.get('/background.png', { method: 'POST' })).status, 404);
});

test('snapshots reject path escape, symlinks and mismatched Scratch manifest hashes', (t) => {
    const files = release(t);
    files.write('scratch-editor/static/assets/cat.svg', 'changed');
    fs.symlinkSync(path.join(files.dir, 'background.png'), path.join(files.dir, 'linked.png'));
    files.write('manifest.json', JSON.stringify({
        image: '/background.png?version=1', symlink: '/linked.png', escape: '/%2e%2e/outside.png',
        remote: '//example.com/image.png', script: '/app.js',
    }));
    const snapshot = publicMediaSnapshot(files.dir);
    assert.equal(snapshot.has('/background.png'), true);
    assert.equal(snapshot.has('/linked.png'), false);
    assert.equal(snapshot.has('/../outside.png'), false);
    assert.equal(snapshot.has('/scratch-editor/static/assets/cat.svg'), false);
    assert.equal(snapshot.has('/app.js'), false);
});
