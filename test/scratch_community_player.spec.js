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
      <iframe data-scratch-player-frame sandbox="allow-scripts"></iframe></main>`, {
        url: 'https://onebyone.test/d/art/scratch/community/123', runScripts: 'outside-only',
    });
    t.after(() => dom.window.close());
    const { window } = dom;
    const root = window.document.querySelector('[data-scratch-public-player]');
    root.dataset.config = JSON.stringify({
        projectUrl: '/d/art/scratch/community/123/project', title: '星球旅行', maxFileSize: 20 * 1024 * 1024,
        memberOnly: true, ...config,
    });
    Object.defineProperty(window.crypto, 'randomUUID', { value: () => 'community-channel' });
    const timers = new Map();
    let timerId = 0;
    window.setTimeout = (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; };
    window.clearTimeout = (id) => timers.delete(id);
    const requests = [];
    window.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    window.eval(playerCode);
    const frame = window.document.querySelector('iframe');
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
        window, frame, outgoing, requests, message, timers,
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
