const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
function load(file, deps = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs',
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, { module, exports: module.exports, URL, AbortController, console, require: (name) => {
        if (!(name in deps)) throw Error(name); return deps[name];
    } });
    return module.exports;
}
const { bindLiveRanking } = load('packages/ui-default/components/ranking_live.ts');
const settle = () => new Promise((resolve) => setImmediate(resolve));
function fixture(kind = 'ranking') {
    const dom = new JSDOM(kind === 'homepage'
        ? '<table><tbody data-ranking-live="homepage" data-ranking-limit="10"><tr><td>Old</td></tr></tbody></table>'
        : '<div data-ranking-live="ranking" data-ranking-page="2">Old</div>',
    { url: 'https://onebyone.test/d/class-a/ranking?page=2' });
    const { window: win } = dom;
    Object.defineProperty(win.document, 'hidden', { configurable: true, value: false });
    const socket = { close() { this.closed = true; } };
    const requests = []; const lifecycle = [];
    win.fetch = async (url, options) => {
        requests.push({ url, options });
        return { ok: true, headers: new Headers({ 'Content-Type': 'application/json' }),
            json: async () => ({ view: kind, html: kind === 'homepage' ? '<tr><td>Updated</td></tr>' : 'Updated' }) };
    };
    const binding = bindLiveRanking({ doc: win.document, win, socket, url: '/d/class-a/ranking/live',
        onRemove: () => lifecycle.push('remove'), onNew: () => lifecycle.push('new') });
    const message = (revision, type = 'ranking-update') => socket.onmessage(null, JSON.stringify({ type, revision }));
    return { dom, win, socket, requests, lifecycle, binding, message };
}
for (const kind of ['ranking', 'homepage']) it(`${kind} receives persisted updates without timers, full-page refresh or navigation`, async () => {
    const f = fixture(kind);
    await settle(); assert.equal(f.requests.length, 0, 'no polling');
    f.message('one'); await settle();
    assert.equal(f.requests.length, 1);
    const url = new URL(f.requests[0].url);
    assert.equal(url.searchParams.get('view'), kind);
    assert.equal(url.searchParams.get(kind === 'homepage' ? 'limit' : 'page'), kind === 'homepage' ? '10' : '2');
    assert.equal(f.win.document.querySelector('[data-ranking-live]').textContent, 'Updated');
    assert.deepEqual(f.lifecycle, ['remove', 'new']);
    if (kind === 'homepage') assert.equal(f.win.document.querySelectorAll('tbody tr td').length, 1);
    f.message('one'); f.message('ignored', 'record-change'); await settle(); assert.equal(f.requests.length, 1);
    assert.equal(f.win.location.search, '?page=2');
    f.socket.onopen(); await settle(); assert.equal(f.requests.length, 2, 'reconnect resynchronizes once');
    f.binding.dispose(); assert.equal(f.socket.closed, true); f.dom.window.close();
});
it('concurrent judge messages collapse into one follow-up; hidden updates refresh when visible', async () => {
    const f = fixture();
    let finish;
    f.win.fetch = (url, options) => { f.requests.push({ url, options }); return new Promise((resolve) => { finish = () => resolve({
        ok: true, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => ({ view: 'ranking', html: 'Fresh' }),
    }); }); };
    f.message('1'); f.message('2'); f.message('3'); assert.equal(f.requests.length, 1);
    finish(); await settle(); assert.equal(f.requests.length, 2);
    finish(); await settle(); assert.equal(f.requests.length, 2);
    Object.defineProperty(f.win.document, 'hidden', { value: true });
    f.message('4'); await settle(); assert.equal(f.requests.length, 2);
    Object.defineProperty(f.win.document, 'hidden', { value: false });
    f.win.document.dispatchEvent(new f.win.Event('visibilitychange')); assert.equal(f.requests.length, 3);
    finish(); await settle(); f.binding.dispose(); f.dom.window.close();
});
it('failed requests retain the previous complete ranking and navigation cancels pending work', async () => {
    const f = fixture(); f.win.fetch = async () => { throw Error('offline'); };
    f.message('1'); await settle(); assert.equal(f.win.document.querySelector('[data-ranking-live]').textContent, 'Old');
    f.win.fetch = (_url, options) => { f.requests.push({ options }); return new Promise(() => {}); };
    f.message('2'); f.win.dispatchEvent(new f.win.Event('pagehide'));
    assert.equal(f.requests[0].options.signal.aborted, true); assert.equal(f.socket.closed, true); f.dom.window.close();
});
it('push endpoint filters local-domain events and publishes only an invalidation token', async () => {
    let invalidations = 0; const sent = []; const reads = [];
    class Handler {}
    const { RankingLiveConnectionHandler, RankingLiveHandler } = load('packages/hydrooj/src/handler/ranking_live.ts', {
        '../error': { ValidationError: Error }, '../lib/domain_ranking': { getDomainRankingMode: (domain) => domain.rankingMode || 'single' },
        '../lib/shared_ranking': { invalidateSharedRankingSnapshot: () => invalidations++ },
        '../model/builtin': { PERM: { PERM_VIEW_RANKING: 1n } }, '../model/system': { get: () => 50 },
        '../service/server': { Handler, ConnectionHandler: Handler, subscribe: () => () => {} },
        './domain': { getRankingPage: async (_handler, domain, page, limit) => { reads.push({ domain, page, limit }); return { udocs: [{ _id: 42, rp: 100 }] }; } },
    });
    const conn = Object.assign(new RankingLiveConnectionHandler(), { domain: { _id: 'a' }, send: (value) => sent.push(value), checkPerm() {} });
    conn.onRankingUpdate({ domainIds: ['b'], revision: '1', uid: 42 }); assert.equal(sent.length, 0);
    conn.onRankingUpdate({ domainIds: ['a'], revision: '2', uid: 42 });
    assert.equal(JSON.stringify(sent[0]), JSON.stringify({ type: 'ranking-update', revision: '2' }));
    assert.equal(invalidations, 1);
    conn.domain.rankingMode = 'all'; conn.onRankingUpdate({ domainIds: ['b'], revision: '3' }); assert.equal(sent.length, 2);
    const response = { headers: {}, addHeader(name, value) { this.headers[name] = value; } };
    const handler = Object.assign(new RankingLiveHandler(), { request: { query: { view: 'homepage', limit: '10' } }, response,
        checkPerm() {}, renderHTML: async (template, data) => `${template}:${data.payload[0]}` });
    await handler.get('a'); assert.equal(reads[0].limit, 10);
    assert.equal(response.body.view, 'homepage'); assert.equal(response.headers['Cache-Control'], 'private, no-store');
    handler.request.query.limit = '-1'; await assert.rejects(handler.get('a'));
    handler.request.query = { view: 'private' }; await assert.rejects(handler.get('a'));
});
