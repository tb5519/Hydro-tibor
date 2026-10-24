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
function harness(send) {
    let mono = 0;
    let wall = 1000000;
    let foreground = true;
    let serial = 0;
    const calls = [];
    const collector = createTrainingTimeCollector({
        now: () => ({ monotonic: mono, wall }),
        isForeground: () => foreground,
        requestId: () => `request-${++serial}`,
        send: async (url, data, keepalive) => {
            calls.push({ url, data, keepalive });
            return send ? send(url, data) : { accepted: true, sessionId: 'session-one' };
        },
    });
    return {
        collector, calls,
        foreground(value) { foreground = value; },
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

test('failed network requests do not create per-keystroke retry storms or offline backlog', async () => {
    const h = harness(() => { throw new Error('offline'); });
    h.collector.setContext(config);
    await settle();
    for (let i = 0; i < 20; i++) h.collector.activity();
    assert.equal(h.calls.length, 1);
    await h.advance(30000);
    assert.equal(h.calls.length, 1);
    h.collector.activity();
    await settle();
    assert.equal(h.calls.length, 2);
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

function browser(t, initial = config) {
    const dom = new JSDOM('<html data-page="problem_detail"><body><main class="main"><div class="problem-content-container">题目</div></main></body></html>', {
        url: 'https://onebyone.test/d/python/p/42', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    t.after(() => dom.window.close());
    const { window } = dom;
    let focused = true;
    let visibility = 'visible';
    Object.defineProperty(window.document, 'hasFocus', { value: () => focused });
    Object.defineProperty(window.document, 'visibilityState', { get: () => visibility });
    const calls = [];
    window.fetch = async (url, options) => {
        calls.push({ url, options, data: JSON.parse(options.body) });
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ accepted: true, sessionId: 'browser-session' }) };
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
