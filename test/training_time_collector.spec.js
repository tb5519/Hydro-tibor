const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');
const code = transformSync(fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/components/training_time.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code;
const exportsFor = (FunctionType = Function) => {
    const module = { exports: {} };
    new FunctionType('module', 'exports', code)(module, module.exports);
    return module.exports;
};
const { createTrainingTimeCollector } = exportsFor();
const config = {
    enabled: true, startUrl: '/training-time/start', heartbeatUrl: '/training-time/heartbeat',
    sourceToken: 'server-grant-python-42', contextKey: 'python:problem:42', heartbeatSeconds: 30, idleSeconds: 300,
};
const settle = () => new Promise((resolve) => setImmediate(resolve));
function harness(send, refreshSource) {
    let mono = 0;
    let wall = 1000000;
    let foreground = true;
    let online = true;
    let serial = 0;
    const calls = [];
    const collector = createTrainingTimeCollector({
        now: () => ({ monotonic: mono, wall }),
        isForeground: () => foreground,
        isOnline: () => online,
        refreshSource,
        requestId: () => `request-${++serial}`,
        send: async (url, data, keepalive) => {
            calls.push({ url, data, keepalive });
            return send ? send(url, data) : { accepted: true, sessionId: 'session-one' };
        },
    });
    return {
        collector, calls,
        foreground(value) { foreground = value; },
        online(value) {
            online = value;
            if (value) collector.tick();
            else collector.disconnected();
        },
        jump(ms, wallMs = ms) { mono += ms; wall += wallMs; },
        async advance(ms) {
            for (let elapsed = 0; elapsed < ms; elapsed += 5000) {
                mono += Math.min(5000, ms - elapsed);
                wall += Math.min(5000, ms - elapsed);
                collector.tick();
                await settle();
            }
        },
    };
}

test('read-only foreground study sends one start and one small heartbeat per 30 seconds', async () => {
    const h = harness();
    h.collector.setContext(config);
    await settle();
    await h.advance(60000);
    assert.equal(h.calls.length, 3);
    assert.deepEqual(h.calls[0].data, { sourceToken: config.sourceToken, requestId: 'request-1' });
    assert.deepEqual(h.calls.slice(1).map((call) => call.data), [
        { sessionId: 'session-one', seq: 1, active: true },
        { sessionId: 'session-one', seq: 2, active: true },
    ]);
    assert(!JSON.stringify(h.calls).includes('duration'));
});

test('many learning operations refresh idle deadline without per-keystroke requests', async () => {
    const h = harness();
    h.collector.setContext(config);
    await settle();
    for (let i = 0; i < 400; i++) h.collector.activity();
    assert.equal(h.calls.length, 1);
    await h.advance(295000);
    h.collector.activity();
    await h.advance(10000);
    assert(h.calls.every((call) => call.data.active !== false));
});

test('five minutes of inactivity releases once; no restart without actual activity', async () => {
    const h = harness();
    h.collector.setContext(config);
    await settle();
    await h.advance(300000);
    assert.deepEqual(h.calls.at(-1).data, { sessionId: 'session-one', seq: 10, active: false, discard: false });
    const count = h.calls.length;
    await h.advance(60000);
    assert.equal(h.calls.length, count);
    h.collector.activity();
    await settle();
    assert.equal(h.calls.at(-1).url, config.startUrl);
});

test('hidden/blurred page stops and never credits heartbeats until foreground interaction', async () => {
    const h = harness();
    h.collector.setContext(config);
    await settle();
    await h.advance(10000);
    h.foreground(false);
    h.collector.pause();
    assert.equal(h.calls.at(-1).data.active, false);
    assert.equal(h.calls.at(-1).keepalive, true);
    const count = h.calls.length;
    await h.advance(120000);
    h.collector.activity();
    assert.equal(h.calls.length, count);
    h.foreground(true);
    h.collector.activity();
    await settle();
    assert.equal(h.calls.at(-1).url, config.startUrl);
});

test('a second tab taking the server lease does not start a heartbeat tug of war', async () => {
    const h = harness((url) => ({ accepted: url === config.startUrl, sessionId: 'session-one' }));
    h.collector.setContext(config);
    await settle();
    await h.advance(30000);
    assert.equal(h.calls.filter((call) => call.url === config.startUrl).length, 1);
    await h.advance(120000);
    assert.equal(h.calls.filter((call) => call.url === config.startUrl).length, 1);
    h.collector.activity();
    await settle();
    assert.equal(h.calls.filter((call) => call.url === config.startUrl).length, 2);
});

test('laptop suspension, frozen timers and wall-clock changes discard the unobserved gap', async () => {
    for (const [mono, wall] of [[40000, 40000], [5000, 3600000], [5000, -3600000], [-10, 5000]]) {
        const h = harness();
        h.collector.setContext(config);
        await settle();
        h.jump(mono, wall);
        h.collector.tick();
        assert.equal(h.calls.at(-1).data.active, false);
        assert.equal(h.calls.at(-1).data.discard, true);
        assert.equal(h.calls.filter((call) => call.url === config.startUrl).length, 1);
    }
});

test('blur immediately after suspend also discards rather than closing a long counted interval', async () => {
    const h = harness();
    h.collector.setContext(config);
    await settle();
    h.jump(40000);
    h.collector.pause();
    assert.equal(h.calls.at(-1).data.discard, true);
});

test('daily question change closes its old domain and starts the new authorized context', async () => {
    const h = harness();
    h.collector.setContext(config);
    await settle();
    h.collector.setContext({ ...config, sourceToken: 'refreshed-grant' });
    assert.equal(h.calls.length, 1, 'answer/status refresh for same question does not restart');
    h.collector.setContext({ ...config, sourceToken: 'cpp-grant', contextKey: 'cpp:daily:77' });
    await settle();
    assert.equal(h.calls[1].data.active, false);
    assert.equal(h.calls[2].data.sourceToken, 'cpp-grant');
    h.collector.setContext(null);
    const count = h.calls.length;
    await h.advance(60000);
    assert.equal(h.calls.length, count, 'completed daily quiz is no longer a learning surface');
});

test('late start response after page exit is released without accumulating training', async () => {
    let resolve;
    const h = harness((url) => url === config.startUrl ? new Promise((done) => { resolve = done; }) : { accepted: true });
    h.collector.setContext(config);
    await settle();
    h.collector.dispose();
    resolve({ accepted: true, sessionId: 'late-session' });
    await settle();
    assert.deepEqual(h.calls.at(-1).data, { sessionId: 'late-session', seq: 1, active: false, discard: true });
});

test('next daily question cannot overtake the previous short question release', async () => {
    let release;
    const h = harness((url, data) => data.active === false
        ? new Promise((done) => { release = done; }) : { accepted: true, sessionId: 'session-one' });
    h.collector.setContext(config);
    await settle();
    await h.advance(10000);
    h.collector.setContext({ ...config, contextKey: 'cpp:daily:2', sourceToken: 'next-grant' });
    await settle();
    assert.equal(h.calls.length, 2, 'next start waits while the previous stop is in flight');
    assert.equal(h.calls.at(-1).data.active, false);
    release({ accepted: true });
    await settle();
    assert.equal(h.calls.length, 3);
    assert.equal(h.calls.at(-1).data.sourceToken, 'next-grant');
});

test('reader retries a transient start failure after backoff with the very same request ID', async () => {
    let attempts = 0;
    const h = harness(() => {
        if (++attempts === 1) throw new Error('temporarily unavailable');
        return { accepted: true, sessionId: 'recovered' };
    });
    h.collector.setContext(config);
    await settle();
    for (let i = 0; i < 20; i++) h.collector.activity();
    await h.advance(25000);
    assert.equal(h.calls.length, 1);
    await h.advance(5000);
    assert.equal(h.calls.length, 2);
    assert.deepEqual(h.calls[1].data, h.calls[0].data);
    await h.advance(30000);
    assert.deepEqual(h.calls.at(-1).data, { sessionId: 'recovered', seq: 1, active: true });
});

test('a transient pulse failure retries the existing lease while the learner is reading', async () => {
    const h = harness((url, data) => {
        if (data.seq === 1) throw new Error('unavailable');
        return { accepted: true, sessionId: 'same-lease' };
    });
    h.collector.setContext(config);
    await settle();
    await h.advance(60000);
    assert.equal(h.calls.length, 3);
    assert.deepEqual(h.calls.at(-1).data, { sessionId: 'same-lease', seq: 2, active: true });
});

test('reconnection resets the original lease clock without crediting offline time or taking a new lease', async () => {
    for (const stolen of [false, true]) {
        const h = harness((url, data) => ({ accepted: !data.discard || !stolen, sessionId: 'original' }));
        h.collector.setContext(config);
        await settle();
        await h.advance(30000);
        h.online(false);
        await h.advance(45000);
        assert.equal(h.calls.length, 2);
        h.online(true);
        await settle();
        assert.deepEqual(h.calls[2].data, { sessionId: 'original', seq: 2, active: true, discard: true });
        await h.advance(30000);
        assert.equal(h.calls.filter(call => call.url === config.startUrl).length, 1);
        if (!stolen) assert.deepEqual(h.calls.at(-1).data, { sessionId: 'original', seq: 3, active: true });
        else assert.equal(h.calls.filter(call => call.data.active).length, 2);
    }
});

test('reconnecting a tab that went idle or blurred cannot restart its clock by itself', async () => {
    for (const idle of [false, true]) {
        const h = harness();
        h.collector.setContext(config);
        await settle();
        h.online(false);
        if (idle) await h.advance(300000);
        else { h.foreground(false); h.collector.pause(); }
        const before = h.calls.length;
        h.online(true);
        await h.advance(30000);
        assert.equal(h.calls.length, before);
    }
});

test('expired page grant is renewed only for the same authenticated study context', async () => {
    for (const fresh of [null, { ...config, contextKey: 'other-problem' }, { ...config, scope: 'different-account' }, { ...config, sourceToken: 'new' }]) {
        let renewals = 0;
        const h = harness((url, data) => data.sourceToken === config.sourceToken
            ? { accepted: false, refreshSource: true } : { accepted: true, sessionId: 'renewed' },
        () => { renewals++; return fresh; });
        h.collector.setContext(config);
        await settle();
        await h.advance(30000);
        assert.equal(renewals, 1);
        if (fresh?.sourceToken === 'new') {
            assert.equal(h.calls[1].data.sourceToken, 'new');
            assert.equal(h.calls.at(-1).data.sessionId, 'renewed');
        } else {
            assert.equal(h.calls.length, 1);
        }
    }
});

test('a delayed grant renewal after navigation cannot start the old page', async () => {
    let finish;
    const h = harness(() => ({ accepted: false, refreshSource: true }), () => new Promise(resolve => { finish = resolve; }));
    h.collector.setContext(config);
    await settle();
    h.collector.setContext(null);
    finish({ ...config, sourceToken: 'old-page-renewal' });
    await settle();
    assert.equal(h.calls.length, 1);
});

test('expired grants or permissions also back off instead of retrying every keystroke', async () => {
    const h = harness(() => ({ accepted: false }));
    h.collector.setContext(config);
    await settle();
    for (let i = 0; i < 40; i++) h.collector.activity();
    assert.equal(h.calls.length, 1);
    await h.advance(30000);
    assert.equal(h.calls.length, 1);
    h.collector.activity();
    await settle();
    assert.equal(h.calls.length, 2);
});

test('a slow heartbeat followed by blur sends an increasing stop sequence and ignores late response', async () => {
    let resolve;
    const h = harness((url, data) => data.active === true
        ? new Promise((done) => { resolve = done; }) : { accepted: true, sessionId: 'session-one' });
    h.collector.setContext(config);
    await settle();
    await h.advance(30000);
    h.collector.pause();
    assert.deepEqual(h.calls.slice(-2).map((call) => call.data.seq), [1, 2]);
    resolve({ accepted: true });
    await settle();
    const count = h.calls.length;
    await h.advance(30000);
    assert.equal(h.calls.length, count);
});

function browser(t, initial = config, { page = 'problem_detail', url = 'https://onebyone.test/d/python/p/42', respond } = {}) {
    const dom = new JSDOM('<html data-page="problem_detail"><body><main class="main"><div class="problem-content-container">题目</div></main></body></html>', {
        url, runScripts: 'outside-only', pretendToBeVisual: true,
    });
    t.after(() => dom.window.close());
    const { window } = dom;
    window.document.documentElement.dataset.page = page;
    let focused = true;
    let visibility = 'visible';
    Object.defineProperty(window.document, 'hasFocus', { value: () => focused });
    Object.defineProperty(window.document, 'visibilityState', { get: () => visibility });
    const calls = [];
    window.fetch = async (url, options) => {
        const data = options.body ? JSON.parse(options.body) : null;
        calls.push({ url, options, data });
        const body = respond ? respond(url, options, data) : { accepted: true, sessionId: 'browser-session' };
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body };
    };
    const module = exportsFor(window.Function);
    const binding = module.bindTrainingTime(initial, window);
    t.after(() => binding.dispose());
    return { ...module, window, calls, binding, focus: (value) => { focused = value; }, visibility: (value) => { visibility = value; } };
}

test('browser binding is silent, keeps requests same-origin and exposes no student metrics', async (t) => {
    const h = browser(t);
    await settle();
    assert.equal(h.window.document.body.textContent, '题目');
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].options.credentials, 'same-origin');
    assert.equal(h.calls[0].options.headers['X-Requested-With'], 'XMLHttpRequest');
    assert.deepEqual(Object.keys(h.calls[0].data).sort(), ['requestId', 'sourceToken']);
});

test('browser lifecycle stops on visibility and BFCache pagehide, resumes on pageshow', async (t) => {
    const h = browser(t);
    await settle();
    h.visibility('hidden');
    h.window.document.dispatchEvent(new h.window.Event('visibilitychange'));
    assert.equal(h.calls.at(-1).data.active, false);
    h.visibility('visible');
    h.window.dispatchEvent(new h.window.Event('pageshow'));
    await settle();
    assert.equal(h.calls.at(-1).data.sourceToken, config.sourceToken);
    h.window.dispatchEvent(new h.window.Event('pagehide'));
    assert.equal(h.calls.at(-1).options.keepalive, true);
});

test('unrelated PJAX fragments preserve collection while replacing study root cleans all listeners', async (t) => {
    const h = browser(t);
    await settle();
    const unrelated = h.window.document.createElement('section');
    h.binding.contentRemoved(unrelated);
    assert.equal(h.calls.length, 1);
    h.binding.contentRemoved(h.window.document.querySelector('.main'));
    assert.equal(h.calls.at(-1).data.active, false);
    const count = h.calls.length;
    h.window.dispatchEvent(new h.window.Event('focus'));
    h.setTrainingTimeContext({ ...config, contextKey: 'cpp:problem:52' }, h.window);
    await settle();
    assert.equal(h.calls.length, count);
});

test('no authorized config means no homepage/ranking telemetry; daily completion stays stopped', async (t) => {
    const h = browser(t, null);
    await settle();
    assert.equal(h.calls.length, 0);
    h.setTrainingTimeContext(config, h.window);
    await settle();
    assert.equal(h.calls.length, 1);
    h.setTrainingTimeContext(null, h.window);
    const count = h.calls.length;
    h.window.dispatchEvent(new h.window.Event('focus'));
    await settle();
    assert.equal(h.calls.length, count);
});

test('browser renews an expired problem grant with all original page parameters and no redirect or cache', async (t) => {
    const h = browser(t, config, {
        url: 'https://onebyone.test/d/python/p/42?tid=contest123',
        respond(url, options, data) {
            if (options.method === 'GET') return { trainingTime: { ...config, sourceToken: 'fresh-page-grant' } };
            return data?.sourceToken === config.sourceToken ? { accepted: false, refreshSource: true }
                : { accepted: true, sessionId: 'renewed-session' };
        },
    });
    await settle();
    assert.equal(h.calls.length, 3);
    const renewal = h.calls[1];
    assert.equal(renewal.url, 'https://onebyone.test/d/python/p/42?tid=contest123&__trainingTimeGrant=1');
    assert.equal(renewal.options.credentials, 'same-origin');
    assert.equal(renewal.options.redirect, 'error');
    assert.equal(renewal.options.cache, 'no-store');
    assert.equal(h.calls[2].data.sourceToken, 'fresh-page-grant');
});

test('expired daily-quiz grant does not issue an unsolicited GET for a new quiz', async (t) => {
    const h = browser(t, config, {
        page: 'daily_quiz', url: 'https://onebyone.test/d/python/daily-quiz',
        respond: () => ({ accepted: false, refreshSource: true }),
    });
    await settle();
    assert.equal(h.calls.length, 1);
});

test('a lost reconnect acknowledgment retries the same reset sequence only once on the ledger', async () => {
    let resetAttempts = 0;
    const h = harness((url, data) => {
        if (data.discard && ++resetAttempts === 1) throw new Error('lost acknowledgment');
        return { accepted: true, sessionId: 'original' };
    });
    h.collector.setContext(config);
    await settle();
    h.online(false);
    await h.advance(30000);
    h.online(true);
    await settle();
    await h.advance(60000);
    assert.deepEqual(h.calls.filter(c => c.data.discard).map(c => c.data.seq), [1, 1]);
    assert.deepEqual(h.calls.at(-1).data, { sessionId: 'original', seq: 2, active: true });
});

test('mid-read grant expiry reauthorizes an active owner without another click', async () => {
    let oldStarts = 0;
    const h = harness((url, data) => {
        if (data.sourceToken === config.sourceToken && ++oldStarts === 1) return { accepted: true, sessionId: 'previous' };
        if (data.sourceToken === 'renewed') return { accepted: true, sessionId: 'next' };
        if (data.sessionId === 'next' || data.active === false) return { accepted: true };
        return { accepted: false, refreshSource: true };
    }, async () => ({ ...config, sourceToken: 'renewed' }));
    h.collector.setContext(config);
    await settle();
    await h.advance(60000);
    assert.equal(h.calls.at(-1).data.sessionId, 'next');
    assert.equal(h.calls.at(-1).data.active, true);
    assert.equal(oldStarts, 2);
});
