const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');

const playerCode = fs.readFileSync(path.join(__dirname, '../packages/ui-default/static/scratch-player.js'), 'utf8');
const settle = () => new Promise((resolve) => setImmediate(resolve));
const projectResponse = (overrides = {}) => ({
    ok: true, headers: { get: () => null }, blob: async () => new Blob(['classroom snapshot']), ...overrides,
});

function player(t, config = {}) {
    const dom = new JSDOM(`<main data-scratch-public-player>
      <div data-scratch-player-status><span data-scratch-player-message>加载中</span>
      <button data-scratch-player-retry hidden>重新打开</button></div>
      <iframe data-scratch-player-frame sandbox="allow-scripts"></iframe>
      <span data-community-state-status></span><span data-community-runtime-hint></span></main>`, {
        url: 'https://onebyone.test/d/art/scratch/community/123', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    t.after(() => dom.window.close());
    const { window } = dom;
    const root = window.document.querySelector('[data-scratch-public-player]');
    root.dataset.config = JSON.stringify({
        projectUrl: '/d/art/scratch/community/123/project', title: '星球旅行', maxFileSize: 20 * 1024 * 1024,
        memberOnly: true, ...config,
    });
    let uuid = 0;
    Object.defineProperty(window.crypto, 'randomUUID', { value: () => uuid++ ? `runtime-request-${uuid}` : 'community-channel' });
    const timers = new Map();
    const intervals = new Map();
    let timerId = 0;
    let clock = 0;
    Object.defineProperty(window.performance, 'now', { value: () => clock });
    window.setTimeout = (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; };
    window.clearTimeout = (id) => timers.delete(id);
    window.setInterval = (callback, delay) => { intervals.set(++timerId, { callback, delay }); return timerId; };
    window.clearInterval = (id) => intervals.delete(id);
    const requests = [];
    window.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    const frame = window.document.querySelector('iframe');
    const inputListeners = new Map();
    const addDocumentListener = window.document.addEventListener.bind(window.document);
    window.document.addEventListener = (name, callback, options) => {
        inputListeners.set(name, callback);
        return addDocumentListener(name, callback, options);
    };
    window.eval(playerCode);
    const source = frame.contentWindow;
    const outgoing = [];
    source.postMessage = (data, origin, transfer) => outgoing.push({ data, origin, transfer });
    const message = async (type, overrides = {}) => {
        window.dispatchEvent(new window.MessageEvent('message', {
            source, origin: 'null', data: { type, channel: 'community-channel' }, ...overrides,
        }));
        await settle();
    };
    return {
        window, frame, outgoing, requests, message, timers, intervals,
        activity: (overrides = {}) => message('userActivity', overrides),
        async input(type, trusted = true) {
            inputListeners.get(type)?.({ isTrusted: trusted });
            await settle();
        },
        runtimeHint: window.document.querySelector('[data-community-runtime-hint]'),
        async advance(milliseconds, tick = true) {
            clock += milliseconds;
            if (tick) for (const interval of intervals.values()) interval.callback();
            await settle();
        },
        async visible(value) {
            Object.defineProperty(window.document, 'hidden', { configurable: true, value: !value });
            window.document.dispatchEvent(new window.Event('visibilitychange'));
            await settle();
        },
        run: async (running, overrides = {}) => message('runState', {
            data: { type: 'runState', channel: 'community-channel', running }, ...overrides,
        }),
        status: window.document.querySelector('[data-scratch-player-status]'),
        text: window.document.querySelector('[data-scratch-player-message]'),
        retry: window.document.querySelector('[data-scratch-player-retry]'),
    };
}

describe('classroom-only Scratch player', () => {
    it('authenticates only the same-origin project request and sends bytes alone into the sandbox', async (t) => {
        const h = player(t);
        assert.equal([...h.timers.values()][0].delay, 300000, 'classroom downloads have a five-minute budget');
        await h.message('ready', { source: h.window });
        await h.message('ready', { origin: 'https://onebyone.test' });
        await h.message('ready', { data: { type: 'ready', channel: 'another-channel' } });
        assert.equal(h.requests.length, 1, 'download starts while the iframe is booting');
        assert.equal(h.outgoing.length, 0, 'untrusted ready messages cannot receive project bytes');
        await h.message('ready');
        await h.message('ready');
        assert.equal(h.requests.length, 1);
        assert.match(h.text.textContent, /正在读取作品/);
        const request = h.requests[0];
        assert.equal(request.url, 'https://onebyone.test/d/art/scratch/community/123/project');
        assert.equal(request.options.credentials, 'same-origin');
        assert.equal(request.options.redirect, undefined, 'authorized endpoint can redirect to the signed CDN');
        assert.equal(request.options.cache, 'no-cache', 'revalidate the classroom endpoint on every visit');
        assert.equal(request.options.referrerPolicy, 'no-referrer');
        request.resolve(projectResponse());
        await settle();
        assert.equal(h.outgoing.length, 1);
        assert.match(h.text.textContent, /正在准备舞台/);
        const init = h.outgoing[0];
        assert.deepEqual(Object.keys(init.data).sort(), ['channel', 'mode', 'project', 'readOnly', 'title', 'type']);
        assert.equal(init.data.readOnly, true);
        assert.equal(init.data.mode, 'player');
        assert.equal(init.data.title, '星球旅行');
        assert.equal(Buffer.from(init.data.project).toString(), 'classroom snapshot');
        assert.equal(init.transfer[0], init.data.project);
        for (const type of ['save', 'dirty', 'exported', 'titleChanged']) await h.message(type);
        assert.equal(h.requests.length, 1, 'a player may not write back to the author');
        await h.message('loaded');
        assert.equal(h.status.hidden, true);
        assert.equal(h.timers.size, 0);
    });

    it('rejects cross-origin or non-HTTP sources before sending any authenticated request', async (t) => {
        for (const projectUrl of ['https://elsewhere.test/project', '//elsewhere.test/project', 'data:text/plain,project', 'javascript:alert(1)']) {
            const h = player(t, { projectUrl });
            await h.message('ready');
            assert.equal(h.requests.length, 0, projectUrl);
            assert.equal(h.outgoing.length, 0);
            assert.equal(h.status.dataset.error, 'true');
            assert.equal(h.retry.hidden, false);
        }
    });

    it('keeps public share fetches anonymous, including when a non-boolean flag is supplied', async (t) => {
        for (const memberOnly of [undefined, false, 'true', 1]) {
            const h = player(t, { memberOnly, projectUrl: '/d/art/scratch/share/token/project' });
            assert.equal([...h.timers.values()][0].delay, 120000, 'public share timeout remains unchanged');
            await h.message('ready');
            const request = h.requests[0];
            assert.equal(request.options.credentials, 'omit');
            assert.equal(request.options.redirect, undefined);
            request.resolve(projectResponse({ redirected: true, url: 'https://cdn.test/public-snapshot' }));
            await settle();
            assert.equal(h.outgoing.length, 1, 'existing public asset redirects remain supported');
        }
    });

    it('does not load denied membership or a login HTML response into the VM', async (t) => {
        for (const response of [projectResponse({ ok: false }), projectResponse({ redirected: true, headers: { get: (name) => name === 'content-type' ? 'text/html; charset=utf-8' : null } })]) {
            const h = player(t);
            await h.message('ready');
            h.requests[0].resolve(response);
            await settle();
            assert.equal(h.outgoing.length, 0);
            assert.equal(h.requests[0].options.signal.aborted, true);
            assert.equal(h.frame.isConnected, false);
            assert.match(h.text.textContent, /当前课堂的创作社区/);
            assert.equal(h.retry.hidden, false);
        }
    });

    it('downloads before iframe readiness, follows the authorized CDN and never exposes its signed URL to the VM', async (t) => {
        const h = player(t);
        assert.equal(h.requests.length, 1);
        const signedUrl = 'https://media.onebyone.test/media/v1/project.sb3?auth_key=temporary-token';
        h.requests[0].resolve(projectResponse({ redirected: true, url: signedUrl }));
        await settle();
        assert.equal(h.outgoing.length, 0, 'completed bytes wait until the correct sandbox is ready');
        assert.match(h.text.textContent, /作品已读取/);
        await h.message('ready');
        assert.equal(h.requests.length, 1);
        assert.equal(h.outgoing.length, 1);
        assert(!JSON.stringify(h.outgoing[0]).includes('auth_key'));
        assert(!h.window.document.documentElement.outerHTML.includes('temporary-token'));
    });

    it('handles a failed prefetch immediately even if the iframe never becomes ready', async (t) => {
        const h = player(t);
        h.requests[0].reject(new TypeError('Network failed'));
        await settle();
        assert.equal(h.frame.isConnected, false);
        assert.equal(h.status.dataset.error, 'true');
        assert.equal(h.retry.hidden, false);
        assert.equal(h.timers.size, 0);
        await h.message('ready');
        assert.equal(h.requests.length, 1);
        assert.equal(h.outgoing.length, 0);
    });

    it('cancels a prefetch when leaving before the iframe is ready', async (t) => {
        const h = player(t);
        h.window.dispatchEvent(new h.window.Event('pagehide'));
        assert.equal(h.requests[0].options.signal.aborted, true);
        h.requests[0].resolve(projectResponse());
        await settle();
        await h.message('ready');
        assert.equal(h.outgoing.length, 0);
    });

    it('does not transfer bytes arriving after leaving the classroom page or timing out', async (t) => {
        for (const timedOut of [true, false]) {
            const h = player(t);
            await h.message('ready');
            if (timedOut) [...h.timers.values()][0].callback();
            else h.window.dispatchEvent(new h.window.Event('pagehide'));
            assert.equal(h.requests[0].options.signal.aborted, true);
            h.requests[0].resolve(projectResponse());
            await settle();
            assert.equal(h.outgoing.length, 0);
        }
    });
});

const metricsUrl = '/d/art/scratch/community/123/metrics';
const jsonResponse = (body) => ({ ok: true, json: async () => ({ ok: true, ...body }) });
const body = (request) => Object.fromEntries(request.options.body.entries());
const boot = async (h) => {
    h.requests[0].resolve(projectResponse());
    await h.message('ready');
    await h.message('loaded');
};
const start = async (h, sessionId = 'session-1') => {
    await h.run(true);
    const request = h.requests.at(-1);
    assert.equal(body(request).operation, 'runtimeStart');
    request.resolve(jsonResponse({ sessionId, likes: 2, runtimeSeconds: 10 }));
    await settle();
    return request;
};

describe('authenticated community runtime', () => {
    it('counts actual running only, after loaded, and authenticates the metrics endpoint without sending it to Scratch', async (t) => {
        const h = player(t, { metricsUrl });
        const updates = [];
        h.window.addEventListener('scratch-community-metrics', event => updates.push(event.detail));
        await h.run(true);
        await h.advance(15000);
        assert.equal(h.requests.length, 1, 'loading is not playing');
        await boot(h);
        await h.advance(15000);
        assert.equal(h.requests.length, 1, 'a loaded idle stage is not playing');
        const initial = await start(h);
        assert.equal(initial.url, `https://onebyone.test${metricsUrl}`);
        assert.equal(initial.options.credentials, 'same-origin');
        assert.equal(initial.options.redirect, 'error');
        assert.equal(initial.options.keepalive, true);
        await h.advance(15000);
        const heartbeat = h.requests.at(-1);
        assert.deepEqual(body(heartbeat), { operation: 'runtimeHeartbeat', sessionId: 'session-1', seq: '1', seconds: '15' });
        heartbeat.resolve(jsonResponse({ accepted: true, sessionExpired: false, likes: 2, runtimeSeconds: 25 }));
        await settle();
        assert.equal(updates.at(-1).runtimeSeconds, 25);
        assert.equal(h.outgoing.length, 1);
        assert(!JSON.stringify(h.outgoing).includes('metrics'));
        assert(!JSON.stringify(h.outgoing).includes('session-1'));
    });

    it('rejects running messages from another frame, origin or channel and non-boolean states', async (t) => {
        const h = player(t, { metricsUrl });
        await boot(h);
        await h.run(true, { source: h.window });
        await h.run(true, { origin: 'https://onebyone.test' });
        await h.run(true, { data: { type: 'runState', channel: 'other', running: true } });
        await h.run('true');
        await h.advance(15000);
        assert.equal(h.requests.length, 1);
    });

    it('flushes a stopped run before starting another, excluding the idle gap', async (t) => {
        const h = player(t, { metricsUrl });
        await boot(h);
        await start(h);
        await h.advance(5100, false);
        await h.run(false);
        const flush = h.requests.at(-1);
        assert.equal(body(flush).seconds, '5');
        await h.advance(60000);
        await h.activity();
        await h.run(true);
        assert.equal(h.requests.at(-1), flush, 'the preceding final heartbeat has not completed');
        flush.resolve(jsonResponse({ accepted: true }));
        await settle();
        const second = h.requests.at(-1);
        assert.equal(body(second).operation, 'runtimeStart');
        assert.notEqual(body(second).requestId, body(h.requests[1]).requestId);
        second.resolve(jsonResponse({ sessionId: 'session-2' }));
        await settle();
        await h.advance(3000, false);
        await h.run(false);
        assert.deepEqual(body(h.requests.at(-1)), { operation: 'runtimeHeartbeat', sessionId: 'session-2', seq: '1', seconds: '3' });
    });

    it('flushes when hidden and starts a fresh session when visible, without crediting hidden time', async (t) => {
        const h = player(t, { metricsUrl });
        await boot(h);
        await start(h);
        await h.advance(4000, false);
        await h.visible(false);
        const flush = h.requests.at(-1);
        assert.equal(body(flush).seconds, '4');
        flush.resolve(jsonResponse({ accepted: true }));
        await settle();
        await h.advance(90000);
        assert.equal(h.requests.length, 3);
        await h.visible(true);
        assert.equal(h.requests.length, 3, 'visibility does not grant activity after 60 idle seconds');
        await h.activity();
        assert.equal(body(h.requests.at(-1)).operation, 'runtimeStart');
        h.requests.at(-1).resolve(jsonResponse({ sessionId: 'visible-again' }));
        await settle();
        await h.advance(15000);
        assert.equal(body(h.requests.at(-1)).seconds, '15');
    });

    it('retries an uncertain heartbeat using the identical sequence instead of crediting it twice', async (t) => {
        const h = player(t, { metricsUrl });
        await boot(h);
        await start(h);
        await h.advance(15000);
        const original = body(h.requests.at(-1));
        h.requests.at(-1).reject(new TypeError('response lost'));
        await settle();
        assert.equal(h.status.hidden, true, 'metrics errors must not interrupt playback');
        await h.advance(15000);
        assert.deepEqual(body(h.requests.at(-1)), original);
        h.requests.at(-1).resolve(jsonResponse({ accepted: false, sessionExpired: false, runtimeSeconds: 25 }));
        await settle();
        await h.advance(15000);
        assert.equal(body(h.requests.at(-1)).seq, '2');
        assert.equal(body(h.requests.at(-1)).seconds, '30', 'the unreported active period remains pending');
    });

    it('rotates an expired session and does not turn a delayed timer into unbounded runtime', async (t) => {
        const h = player(t, { metricsUrl });
        await boot(h);
        await start(h);
        await h.advance(3600000);
        assert.equal(body(h.requests.at(-1)).seconds, '15');
        h.requests.at(-1).resolve(jsonResponse({ accepted: false, sessionExpired: true }));
        await settle();
        await h.advance(15000);
        assert.equal(h.requests.length, 3, 'a long-idle run must not rotate sessions automatically');
        await h.activity();
        assert.equal(body(h.requests.at(-1)).operation, 'runtimeStart');
    });

    it('ignores late session-start responses after stop and flushes bounded keepalive data on page exit', async (t) => {
        const h = player(t, { metricsUrl });
        await boot(h);
        await h.run(true);
        const initial = h.requests.at(-1);
        await h.advance(7000, false);
        await h.run(false);
        initial.resolve(jsonResponse({ sessionId: 'late' }));
        await settle();
        await h.advance(15000);
        assert.equal(h.requests.length, 2, 'a stopped run is not revived by its network response');
        await start(h, 'final');
        await h.advance(6500, false);
        h.window.dispatchEvent(new h.window.Event('pagehide'));
        await settle();
        assert.equal(h.intervals.size, 0);
        const flush = h.requests.at(-1);
        assert.equal(body(flush).seconds, '6');
        assert.equal(flush.options.keepalive, true);
        assert.equal(flush.options.signal.aborted, false);
        await h.advance(15000);
        assert.equal(h.requests.at(-1), flush);
    });

    it('stops counting after a player error and leaves public shares and cross-origin metric URLs untracked', async (t) => {
        const h = player(t, { metricsUrl });
        await boot(h);
        await start(h);
        await h.advance(2000, false);
        await h.message('error');
        assert.equal(body(h.requests.at(-1)).seconds, '2');
        assert.equal(h.intervals.size, 0);
        assert.equal(h.frame.isConnected, false);
        for (const config of [{ metricsUrl: 'https://outside.test/metrics' }, { metricsUrl, memberOnly: false }]) {
            const other = player(t, config);
            if (!config.memberOnly && config.memberOnly !== undefined) await other.message('ready');
            await boot(other);
            await other.run(true);
            await other.advance(15000);
            assert.equal(other.requests.length, 1);
            assert.equal(other.intervals.size, 0);
        }
    });
});

const stateUrl = '/d/art/scratch/community/123/state';
const stateFileId = '0123456789abcdef01234567';
const stateConfig = { stateUrl, stateFileId };
const stateResponse = (extra = {}) => jsonResponse({ fileId: stateFileId, revision: 0, values: [], ...extra });
const changedList = [{ key: '["stage","names"]', kind: 'list', before: [], value: ['小明'] }];
const syncState = (h, changes = changedList, extra = {}, overrides = {}) => h.message('communityStateSync', {
    data: { type: 'communityStateSync', channel: 'community-channel', id: 1, baseRevision: 0, changes, ...extra }, ...overrides,
});
const bootState = async (h, extra = {}) => {
    h.requests.find((request) => request.url.endsWith('/state')).resolve(stateResponse(extra));
    h.requests.find((request) => request.url.endsWith('/project')).resolve(projectResponse());
    await h.message('ready');
    await h.message('loaded');
};
const fireTimer = async (h, delay) => {
    for (const [id, timer] of [...h.timers]) if (timer.delay === delay) { h.timers.delete(id); timer.callback(); }
    await settle();
};

describe('authenticated community shared data', () => {
    it('fetches with member credentials in parallel, waits for state before init and keeps endpoint/session identifiers outside the sandbox', async (t) => {
        const h = player(t, stateConfig);
        assert.equal(h.requests.length, 2);
        const state = h.requests.find((request) => request.url.endsWith('/state'));
        const project = h.requests.find((request) => request.url.endsWith('/project'));
        assert.equal(state.options.credentials, 'same-origin');
        assert.equal(state.options.method, 'GET');
        assert.equal(state.options.redirect, 'error');
        assert.equal(state.options.cache, 'no-store');
        assert.equal(state.options.headers['X-Requested-With'], 'XMLHttpRequest');
        project.resolve(projectResponse()); await h.message('ready');
        assert.equal(h.outgoing.length, 0, 'existing leaderboard must be restored before green flag starts');
        state.resolve(stateResponse({ revision: 7, values: changedList.map(({ before, ...entry }) => entry) }));
        await settle();
        const init = h.outgoing[0].data;
        assert.deepEqual(JSON.parse(JSON.stringify(init.communityState)), { revision: 7, values: changedList.map(({ before, ...entry }) => entry) });
        assert(!JSON.stringify(init).includes('/state'));
        assert(!JSON.stringify(init).includes(stateFileId));
        assert(!JSON.stringify(init).includes('runtime-request'));
        assert(!JSON.stringify(init).includes('clientId'));
        assert.equal(init.readOnly, true);
        await h.message('loaded');
        assert.equal(h.status.hidden, true);
    });

    it('rejects foreign state endpoints without credentials or project bytes escaping', async (t) => {
        for (const endpoint of ['https://outside.test/state', '//outside.test/state', 'data:application/json,{}', 'javascript:alert(1)']) {
            const h = player(t, { ...stateConfig, stateUrl: endpoint });
            assert.equal(h.requests.length, 0, endpoint);
            assert.equal(h.status.dataset.error, 'true');
            await h.message('ready');
            assert.equal(h.outgoing.length, 0);
        }
    });

    it('ignores state messages before loaded and from the wrong frame, non-opaque origin or channel', async (t) => {
        const h = player(t, stateConfig);
        await syncState(h); assert.equal(h.requests.length, 2);
        await bootState(h);
        await syncState(h, changedList, {}, { source: h.window });
        await syncState(h, changedList, {}, { origin: 'https://onebyone.test' });
        await syncState(h, changedList, { channel: 'someone-else' });
        for (const bad of [{ id: 0 }, { id: '1' }, { baseRevision: -1 }, { baseRevision: '0' }, { changes: {} }]) await syncState(h, changedList, bad);
        assert.equal(h.requests.length, 2);
        await syncState(h);
        assert.equal(h.requests.length, 3);
        const sent = body(h.requests.at(-1));
        assert.equal(sent.operation, 'sync'); assert.equal(sent.seq, '1'); assert.equal(sent.fileId, stateFileId);
        assert.deepEqual(JSON.parse(sent.changes), changedList);
        assert.equal(h.requests.at(-1).options.keepalive, true);
    });

    it('retries a lost save with identical request UUID, client and sequence, then increments only the next mutation', async (t) => {
        const h = player(t, stateConfig); await bootState(h); await syncState(h);
        const original = h.requests.at(-1); const originalBody = body(original);
        original.reject(new TypeError('response lost')); await settle();
        assert.equal(h.status.hidden, true, 'temporary persistence failures do not interrupt the game');
        assert.match(h.window.document.querySelector('[data-community-state-status]').textContent, /重试/);
        await fireTimer(h, 3000);
        const retryRequest = h.requests.at(-1);
        assert.deepEqual(body(retryRequest), originalBody, 'server idempotency depends on all retry identifiers being unchanged');
        retryRequest.resolve(stateResponse({ revision: 1, values: changedList.map(({ before, ...entry }) => entry) })); await settle();
        const ack = h.outgoing.at(-1).data;
        assert.equal(ack.type, 'communityStateSaved'); assert.equal(ack.id, 1); assert.equal(ack.revision, 1);
        assert(!JSON.stringify(ack).includes('clientId'));
        await syncState(h, changedList, { id: 2, baseRevision: 1 });
        const next = body(h.requests.at(-1));
        assert.equal(next.seq, '2'); assert.equal(next.clientId, originalBody.clientId);
        assert.notEqual(next.requestId, originalBody.requestId);
    });

    it('uses GET for unchanged polls without consuming the server write sequence', async (t) => {
        const h = player(t, stateConfig); await bootState(h);
        await syncState(h, []);
        const poll = h.requests.at(-1); assert.equal(poll.options.method, 'GET'); assert.equal(poll.options.body, undefined);
        poll.resolve(stateResponse({ revision: 3, values: [] })); await settle();
        assert.equal(h.outgoing.at(-1).data.revision, 3);
        await syncState(h, changedList, { id: 2, baseRevision: 3 });
        assert.equal(body(h.requests.at(-1)).seq, '1');
    });

    it('retries a temporary server error without treating its missing file ID as a publication change', async (t) => {
        const h = player(t, stateConfig); await bootState(h); await syncState(h);
        const first = h.requests.at(-1);
        first.resolve({ ok: false, status: 503, json: async () => ({ error: 'temporarily unavailable' }) });
        await settle(); await fireTimer(h, 3000);
        assert.notEqual(h.requests.at(-1), first);
        assert.deepEqual(body(h.requests.at(-1)), body(first));
        h.requests.at(-1).resolve(stateResponse({ revision: 1, values: changedList.map(({ before, ...entry }) => entry) }));
        await settle();
        assert.equal(h.outgoing.at(-1).data.type, 'communityStateSaved');
    });

    it('does not enable shared class data on any external share configuration', async (t) => {
        for (const memberOnly of [false, undefined, 'true', 1]) {
            const h = player(t, { ...stateConfig, memberOnly, projectUrl: '/d/art/scratch/share/token/project' });
            assert.equal(h.requests.length, 0);
            await h.message('ready');
            assert.equal(h.requests.length, 1); assert.equal(h.requests[0].options.credentials, 'omit');
            h.requests[0].resolve(projectResponse()); await settle(); await h.message('loaded'); await syncState(h);
            assert.equal(h.requests.length, 1);
            assert.equal(h.outgoing[0].data.communityState, undefined);
        }
    });

    it('blocks a mismatched initial snapshot or a permanently rejected write instead of overwriting newer data', async (t) => {
        const mismatch = player(t, stateConfig);
        mismatch.requests[0].resolve(stateResponse({ fileId: 'new-snapshot' })); await settle();
        assert.equal(mismatch.status.dataset.error, 'true'); assert.equal(mismatch.frame.isConnected, false);
        assert.equal(mismatch.requests[1].options.signal.aborted, true);
        await mismatch.message('ready'); assert.equal(mismatch.outgoing.length, 0);
        for (const response of [stateResponse({ fileId: 'new-snapshot' }), { ok: false, status: 409, json: async () => ({ ok: false, fileId: stateFileId }) }]) {
            const h = player(t, stateConfig); await bootState(h); await syncState(h);
            h.requests.at(-1).resolve(response); await settle();
            assert.match(h.window.document.querySelector('[data-community-state-status]').textContent, /未保存/);
            const count = h.requests.length;
            await fireTimer(h, 3000); await syncState(h, changedList, { id: 2 });
            assert.equal(h.requests.length, count, 'permanent errors cannot loop writes or advance over an incompatible snapshot');
            assert.equal(h.outgoing.length, 1);
        }
    });

    it('requests a flush on hiding and accepts only trusted final changes after pagehide with keepalive', async (t) => {
        const h = player(t, stateConfig); await bootState(h);
        await h.visible(false);
        assert.equal(h.outgoing.at(-1).data.type, 'flushCommunityState');
        h.window.dispatchEvent(new h.window.Event('pagehide')); await settle();
        const previous = h.requests.length;
        await syncState(h, changedList, {}, { source: h.window });
        await syncState(h, changedList, {}, { origin: 'https://onebyone.test' });
        await syncState(h, changedList, { channel: 'other' });
        await h.message('ready'); await h.run(true);
        assert.equal(h.requests.length, previous);
        await syncState(h);
        assert.equal(h.requests.length, previous + 1, 'child pagehide message is asynchronous and may arrive after the parent pagehide');
        const final = h.requests.at(-1);
        assert.equal(final.options.keepalive, true); assert.equal(final.options.signal.aborted, false);
        final.reject(new TypeError('closing connection')); await settle(); await fireTimer(h, 3000);
        assert.equal(h.requests.at(-1), final, 'navigation does not leave a background retry loop');
    });

    it('flushes an already-pending retry on exit using the original mutation identity and rejects all data after fatal playback failure', async (t) => {
        const h = player(t, stateConfig); await bootState(h); await syncState(h);
        const first = h.requests.at(-1); first.reject(new TypeError('offline')); await settle();
        h.window.dispatchEvent(new h.window.Event('pagehide')); await settle();
        const final = h.requests.at(-1); assert.notEqual(final, first); assert.deepEqual(body(final), body(first));
        assert.equal(final.options.keepalive, true); assert.equal(final.options.signal.aborted, false);
        const failed = player(t, stateConfig); await bootState(failed); await failed.message('error');
        const count = failed.requests.length; await syncState(failed);
        assert.equal(failed.requests.length, count);
    });
});


describe('community shared-data closing and error recovery', () => {
    it('acknowledges a completed closing save so the iframe can flush changes made while it was pending', async (t) => {
        const h = player(t, stateConfig); await bootState(h); await syncState(h);
        const first = h.requests.at(-1);
        h.window.dispatchEvent(new h.window.Event('pagehide')); await settle();
        first.resolve(stateResponse({ revision: 1, values: changedList.map(({ before, ...entry }) => entry) })); await settle();
        assert.equal(h.outgoing.at(-1).data.type, 'communityStateSaved');
        const finalChanges = [{ ...changedList[0], before: ['小明'], value: ['小明', '小红'] }];
        await syncState(h, finalChanges, { id: 2, baseRevision: 1 });
        const final = h.requests.at(-1);
        assert.notEqual(final, first); assert.equal(final.options.keepalive, true);
        assert.equal(body(final).seq, '2'); assert.deepEqual(JSON.parse(body(final).changes), finalChanges);
    });

    it('preserves an unsaved-value warning through an older in-flight save, and clears it only after a later valid write succeeds', async (t) => {
        const h = player(t, stateConfig); await bootState(h); await syncState(h);
        const first = h.requests.at(-1); const label = h.window.document.querySelector('[data-community-state-status]');
        await h.message('communityStateError', { source: h.window });
        assert(!/超出/.test(label.textContent), 'untrusted errors cannot alter the status');
        await h.message('communityStateError');
        assert.match(label.textContent, /尚未保存/); assert.equal(label.dataset.error, 'true');
        first.resolve(stateResponse({ revision: 1, values: [] })); await settle();
        assert.match(label.textContent, /尚未保存/, 'an older successful request does not account for the newly invalid values');
        await syncState(h, [], { id: 2, baseRevision: 1 });
        h.requests.at(-1).resolve(stateResponse({ revision: 1, values: [] })); await settle();
        assert.match(label.textContent, /尚未保存/, 'an unchanged poll is not a successful correction');
        await syncState(h, changedList, { id: 3, baseRevision: 1 });
        assert.match(label.textContent, /尚未保存/);
        h.requests.at(-1).resolve(stateResponse({ revision: 2, values: changedList.map(({ before, ...entry }) => entry) })); await settle();
        assert.equal(label.textContent, '课堂共享数据已同步'); assert.equal(label.dataset.error, 'false');
    });
});

describe('community runtime inactivity cutoff', () => {
    const accept = async (h) => {
        h.requests.at(-1).resolve(jsonResponse({ accepted: true, sessionExpired: false }));
        await settle();
    };
    it('stops exactly at 60 idle seconds and resumes without crediting the idle gap or pausing the game', async (t) => {
        const h = player(t, { metricsUrl }); await boot(h); await start(h);
        for (let i = 0; i < 3; i++) { await h.advance(15000); await accept(h); }
        await h.advance(15000, false); await fireTimer(h, 60000);
        assert.equal(body(h.requests.at(-1)).seconds, '15'); await accept(h);
        assert.match(h.runtimeHint.textContent, /已暂停计时/);
        assert.equal(h.requests.filter(r => r.options.body?.get('operation') === 'runtimeHeartbeat')
            .reduce((sum, r) => sum + +body(r).seconds, 0), 60);
        const count = h.requests.length;
        await h.advance(120000); await h.run(true); await h.message('loaded');
        assert.equal(h.requests.length, count, 'neither VM activity nor duplicate loaded renews a deadline');
        assert.equal(h.frame.isConnected, true); assert.equal(h.status.hidden, true);
        assert.equal(h.outgoing.length, 1, 'no stop/pause command is sent to Scratch');
        await h.activity();
        assert.equal(body(h.requests.at(-1)).operation, 'runtimeStart');
        h.requests.at(-1).resolve(jsonResponse({ sessionId: 'after-idle' })); await settle();
        await h.advance(15000);
        assert.equal(body(h.requests.at(-1)).seconds, '15');
        assert.match(h.runtimeHint.textContent, /正在计时/);
    });

    it('expires against the old deadline before a late input even when the timeout has not fired', async (t) => {
        const h = player(t, { metricsUrl }); await boot(h); await start(h);
        for (let i = 0; i < 3; i++) { await h.advance(15000); await accept(h); }
        await h.advance(25000, false); await h.activity();
        assert.equal(body(h.requests.at(-1)).seconds, '15', 'only 45s to 60s is eligible, not 45s to 70s');
        await accept(h);
        assert.equal(body(h.requests.at(-1)).operation, 'runtimeStart');
        h.requests.at(-1).resolve(jsonResponse({ sessionId: 'new-visible-run' })); await settle();
        await h.advance(3000, false); await h.run(false);
        assert.equal(body(h.requests.at(-1)).seconds, '3');
    });

    it('re-arms the original timeout when intervening input moved the deadline', async (t) => {
        const h = player(t, { metricsUrl }); await boot(h); await start(h);
        for (let i = 0; i < 3; i++) { await h.advance(15000); await accept(h); }
        await h.activity(); // Deadline moves from 60s to 105s.
        await h.advance(15000); await accept(h); await fireTimer(h, 60000);
        assert.match(h.runtimeHint.textContent, /正在计时/);
        assert([...h.timers.values()].some(timer => timer.delay === 45000));
        for (let i = 0; i < 2; i++) { await h.advance(15000); await accept(h); }
        await h.advance(15000, false); await fireTimer(h, 45000);
        assert.equal(body(h.requests.at(-1)).seconds, '15'); await accept(h);
        assert.match(h.runtimeHint.textContent, /已暂停计时/);
    });

    it('accepts real parent keyboard, mouse and touch input but ignores synthetic, foreign-frame and hidden input', async (t) => {
        for (const inputType of ['keydown', 'pointermove', 'touchstart', 'touchend', 'mouseup', 'wheel']) {
            const h = player(t, { metricsUrl }); await boot(h); await start(h);
            await h.advance(60001); await accept(h);
            const count = h.requests.length;
            await h.input(inputType, false);
            await h.activity({ source: h.window });
            await h.activity({ origin: 'https://onebyone.test' });
            await h.activity({ data: { type: 'userActivity', channel: 'other' } });
            await h.visible(false); await h.input(inputType); await h.activity(); await h.visible(true);
            assert.equal(h.requests.length, count, inputType);
            await h.input(inputType);
            assert.equal(body(h.requests.at(-1)).operation, 'runtimeStart', inputType);
        }
    });

    it('keeps extending active play beyond the first minute, and a stopped project earns no time on input', async (t) => {
        const h = player(t, { metricsUrl }); await boot(h); await start(h);
        for (let i = 0; i < 8; i++) {
            await h.advance(15000); await accept(h); await h.activity();
            assert.match(h.runtimeHint.textContent, /正在计时/);
        }
        assert.equal(h.requests.filter(r => r.options.body?.get('operation') === 'runtimeHeartbeat')
            .reduce((sum, r) => sum + +body(r).seconds, 0), 120);
        await h.run(false); const count = h.requests.length;
        await h.input('keydown'); await h.advance(15000);
        assert.equal(h.requests.length, count);
    });

    it('does not revive a start response that arrived after inactivity, and disposes input/timer effects on exit', async (t) => {
        const h = player(t, { metricsUrl }); await boot(h); await h.run(true);
        const slowStart = h.requests.at(-1);
        await h.advance(60001, false);
        slowStart.resolve(jsonResponse({ sessionId: 'too-late' })); await settle();
        await h.advance(15000);
        assert.equal(h.requests.length, 2);
        await h.activity(); assert.equal(body(h.requests.at(-1)).operation, 'runtimeStart');
        h.requests.at(-1).resolve(jsonResponse({ sessionId: 'valid' })); await settle();
        h.window.dispatchEvent(new h.window.Event('pagehide')); await settle();
        const count = h.requests.length;
        await h.input('keydown'); await h.activity(); await h.advance(90000);
        assert.equal(h.requests.length, count); assert.equal(h.intervals.size, 0);
    });
});
