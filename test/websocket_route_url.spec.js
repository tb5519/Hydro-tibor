const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

const moduleUnderTest = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../framework/framework/router.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: moduleUnderTest, exports: moduleUnderTest.exports, require, URL });
const { Router } = moduleUnderTest.exports;

it('resolves named WebSocket URLs without exposing an HTTP/SSE route', () => {
    const router = new Router();
    router.ws('/live-share/conn', undefined, 'live_share_conn');
    router.ws('/ranking/live-conn', undefined, 'ranking_live_conn');
    assert.equal(router.url('live_share_conn'), '/live-share/conn');
    assert.equal(router.url('ranking_live_conn'), '/ranking/live-conn');
    assert.equal(router.stack.length, 0, 'URL metadata must not enable HTTP access');
    assert.equal(router.match('/live-share/conn', 'GET').route, false);
    assert.equal(new URL(`/d/system${router.url('live_share_conn')}`, 'http://192.168.1.5:8888').href,
        'http://192.168.1.5:8888/d/system/live-share/conn');
});

it('preserves route parameter escaping and query strings for WebSocket URLs', () => {
    const router = new Router();
    router.ws('/rooms/:room/conn', undefined, 'room_conn');
    assert.equal(router.url('room_conn', { room: 'a b' }, { query: { mode: 'live', search: 'a&b' } }),
        '/rooms/a%20b/conn?mode=live&search=a%26b');
    assert.throws(() => router.url('room_conn', {}), /room/);
    assert.match(router.url('missing_conn').message, /No route found/);
});

it('keeps existing HTTP routes authoritative when an SSE fallback has the same name', () => {
    const router = new Router();
    router.ws('/rooms/:room/conn', undefined, 'room_conn');
    const disposeWS = router.disposeLastOp;
    router.get('room_conn', '/rooms/:room/conn', () => {});
    const disposeHTTP = router.disposeLastOp;
    assert.equal(router.url('room_conn', { room: 'one' }), '/rooms/one/conn');
    assert.equal(router.match('/rooms/one/conn', 'GET').route, true);
    disposeHTTP();
    assert.equal(router.url('room_conn', { room: 'one' }), '/rooms/one/conn');
    disposeWS();
    assert.match(router.url('room_conn', { room: 'one' }).message, /No route found/);
    assert.equal(router.wsStack.length, 0);
});

it('disposes only its own WebSocket name and closes its clients', () => {
    const router = new Router();
    const first = router.ws('/first', undefined, 'shared_name');
    const disposeFirst = router.disposeLastOp;
    router.ws('/second', undefined, 'shared_name');
    const disposeSecond = router.disposeLastOp;
    let closed = false;
    first.clients.add({ close() { closed = true; } });
    assert.equal(router.url('shared_name'), '/first');
    disposeFirst();
    assert.equal(closed, true);
    assert.equal(router.url('shared_name'), '/second');
    disposeSecond();
    assert.match(router.url('shared_name').message, /No route found/);
});

it('continues accepting unnamed WebSocket routes', () => {
    const router = new Router();
    const route = router.ws('/existing/:id');
    assert.equal(route.regexp.test('/existing/3'), true);
    router.disposeLastOp();
    assert.equal(router.wsStack.length, 0);
});
