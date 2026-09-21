const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '../packages/ui-default');
const playerCode = fs.readFileSync(path.join(root, 'static/scratch-player.js'), 'utf8');
const actionsCode = transformSync(fs.readFileSync(path.join(root, 'pages/scratch_actions.page.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code;
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(root, 'templates')), { autoescape: true });
env.addGlobal('assetUrl', (value, fallback = value) => fallback);
env.addFilter('json', (value) => JSON.stringify(value));
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

function browser(t, html, url) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const { window } = dom;
    const requests = [];
    const timers = new Map();
    let nextTimer = 0;
    window.setTimeout = (callback, delay) => {
        const id = ++nextTimer;
        timers.set(id, { callback, delay });
        return id;
    };
    window.clearTimeout = (id) => timers.delete(id);
    window.fetch = (requestUrl, options) => {
        const pending = deferred();
        requests.push({ url: requestUrl, options, ...pending });
        // Deliberately do not honor abort in the fake network: late-response
        // protection must work even when a fetch implementation already resolved.
        return pending.promise;
    };
    return { window, document: window.document, requests, timers };
}

function player(t, config = {}) {
    const settings = {
        editorVersion: 'a'.repeat(64),
        projectUrl: '/d/art/scratch/share/public-token/project', title: '小猫的故事', maxFileSize: 20 * 1024 * 1024, ...config,
    };
    const html = env.render('scratch_share.html', { title: settings.title, UiContext: { scratchPlayer: settings } });
    const h = browser(t, html, 'https://onebyone.test/d/art/scratch/share/public-token');
    Object.defineProperty(h.window.crypto, 'randomUUID', { value: () => 'test-player-channel' });
    const navigation = { reloads: 0 };
    new h.window.Function('location', playerCode)({
        href: h.window.location.href, origin: h.window.location.origin,
        reload: () => { navigation.reloads++; },
    });
    const frame = h.document.querySelector('[data-scratch-player-frame]');
    const source = frame.contentWindow;
    const outgoing = [];
    source.postMessage = (data, origin, transfer) => outgoing.push({ data, origin, transfer });
    const message = async (type, data = {}, overrides = {}) => {
        h.window.dispatchEvent(new h.window.MessageEvent('message', {
            source, origin: 'null', data: { channel: 'test-player-channel', type, ...data }, ...overrides,
        }));
        await settle();
    };
    return {
        ...h, frame, outgoing, message, navigation,
        status: h.document.querySelector('[data-scratch-player-status]'),
        text: h.document.querySelector('[data-scratch-player-message]'),
        retry: h.document.querySelector('[data-scratch-player-retry]'),
    };
}
const projectResponse = (data = 'sb3-bytes', headers = {}) => ({
    ok: true,
    headers: { get: (name) => headers[name] || null },
    blob: async () => new Blob([data]),
});
const shareResponse = (data, ok = true) => ({ ok, json: async () => data });

function actions(t) {
    const html = `<button type="button" data-scratch-create>开始创作</button>
      <button type="button" data-scratch-share="/d/art/scratch/work/one/share">分享作品一</button>
      <button type="button" data-scratch-share="/d/art/scratch/work/two/share">分享作品二</button>` +
      env.render('partials/scratch_dialogs.html', { url: () => '/d/art/scratch/works' });
    const h = browser(t, html, 'https://onebyone.test/d/art/scratch/works');
    h.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    h.window.HTMLDialogElement.prototype.close = function () {
        this.removeAttribute('open');
        this.dispatchEvent(new h.window.Event('close'));
    };
    const module = { exports: {} };
    new h.window.Function('require', 'module', 'exports', actionsCode)((name) => {
        assert.equal(name, 'vj/misc/Page');
        return { NamedPage: class { constructor(_, callback) { callback(); } } };
    }, module, module.exports);
    return {
        ...h,
        create: h.document.querySelector('[data-scratch-create]'),
        form: h.document.querySelector('[data-scratch-create-form]'),
        title: h.document.querySelector('input[name=title]'),
        createDialog: h.document.querySelector('[data-scratch-create-dialog]'),
        share: [...h.document.querySelectorAll('[data-scratch-share]')],
        shareDialog: h.document.querySelector('[data-scratch-share-dialog]'),
        text: h.document.querySelector('[data-scratch-share-text]'),
        status: h.document.querySelector('[data-scratch-share-status]'),
        copy: h.document.querySelector('[data-scratch-copy-share]'),
        revoke: h.document.querySelector('[data-scratch-revoke-share]'),
    };
}
async function openShare(h, title = '我的作品') {
    h.share[0].click();
    h.requests.at(-1).resolve(shareResponse({ ok: true, title, url: '/d/art/scratch/share/token' }));
    await settle();
}

describe('public Scratch player template and bridge', () => {
    it('escapes public metadata and requires the exact frame, opaque origin and channel', async (t) => {
        const h = player(t, { title: '"><img src=x onerror=alert(1)> & 小猫' });
        assert.equal(h.document.querySelector('img'), null);
        assert.equal(h.frame.getAttribute('sandbox'), 'allow-scripts');
        assert.equal(h.frame.getAttribute('referrerpolicy'), 'no-referrer');
        assert(!h.document.documentElement.outerHTML.includes('window.UiContext'));
        assert.match(h.frame.src, /#channel=test-player-channel$/);
        assert(h.frame.src.startsWith(`https://onebyone.test/scratch-editor/editor.html?v=${'a'.repeat(64)}&lang=zh-cn#`));
        assert.equal(h.document.querySelector('script[src]').getAttribute('src'), `/scratch-player.js?v=20260921-2-${'a'.repeat(64)}`);
        await h.message('ready', {}, { source: h.window });
        await h.message('ready', {}, { origin: 'https://onebyone.test' });
        await h.message('ready', { channel: 'foreign-channel' });
        assert.equal(h.requests.length, 0);
        await h.message('ready');
        await h.message('ready');
        assert.equal(h.requests.length, 1, 'repeated ready must not fetch twice');
        await h.message('loaded');
        assert.equal(h.status.hidden, false, 'loaded cannot hide the loader before the project was sent');
        const request = h.requests[0];
        assert.equal(request.options.credentials, 'omit');
        assert.equal(request.options.referrerPolicy, 'no-referrer');
        assert.equal(request.url, 'https://onebyone.test/d/art/scratch/share/public-token/project');
        request.resolve(projectResponse());
        await settle();
        assert.equal(h.outgoing.length, 1);
        const init = h.outgoing[0];
        assert.equal(init.data.type, 'init');
        assert.equal(init.data.mode, 'player');
        assert.equal(init.data.readOnly, true);
        assert.equal(init.data.saveUrl, undefined);
        assert.equal(init.transfer[0], init.data.project);
        for (const event of ['dirty', 'titleChanged', 'exported', 'save']) await h.message(event, { file: new ArrayBuffer(3) });
        assert.equal(h.requests.length, 1, 'a public player must never write a project');
        assert.equal(h.outgoing.length, 1, 'a public player must never ask the VM to export');
        await h.message('loaded');
        assert.equal(h.status.hidden, true);
        assert.equal(h.timers.size, 0);
    });

    it('rejects foreign and non-HTTP project URLs before fetching', async (t) => {
        for (const projectUrl of ['https://elsewhere.test/private.sb3', 'javascript:alert(1)', 'data:text/plain,project']) {
            const h = player(t, { projectUrl });
            await h.message('ready');
            assert.equal(h.requests.length, 0, projectUrl);
            assert.equal(h.status.dataset.error, 'true');
            assert.match(h.text.textContent, /分享地址无效/);
            assert.equal(h.retry.hidden, false);
            assert.equal(h.frame.isConnected, false);
        }
    });

    it('accepts bytes after the authorized share endpoint follows a CDN redirect without exposing its signed URL to the VM', async (t) => {
        const h = player(t);
        await h.message('ready');
        const first = h.requests[0];
        assert.equal(first.url, 'https://onebyone.test/d/art/scratch/share/public-token/project');
        assert.equal(first.options.credentials, 'omit');
        const finalUrl = 'https://media.example.test/media/v1/snapshot.sb3?auth_key=short-lived-capability';
        // Browser fetch follows redirects; this is its final response, not a
        // separately trusted project URL supplied by public page metadata.
        first.resolve({ ...projectResponse('mirrored-sb3-bytes'), redirected: true, url: finalUrl });
        await settle();
        assert.equal(h.requests.length, 1);
        assert.equal(h.outgoing.length, 1);
        assert.equal(h.outgoing[0].data.mode, 'player');
        assert.equal(h.outgoing[0].data.readOnly, true);
        assert.equal(Buffer.from(h.outgoing[0].data.project).toString(), 'mirrored-sb3-bytes');
        assert(!JSON.stringify(h.outgoing[0].data).includes('auth_key'));
        assert(!h.document.documentElement.outerHTML.includes('short-lived-capability'));
        await h.message('loaded');
        assert.equal(h.status.hidden, true);
    });

    it('reports revoked shares, oversized files and VM errors without injecting error HTML', async (t) => {
        const revoked = player(t);
        await revoked.message('ready');
        revoked.requests[0].resolve({ ok: false });
        await settle();
        assert.match(revoked.text.textContent, /分享已关闭/);
        assert.equal(revoked.requests[0].options.signal.aborted, true);

        for (const declared of [true, false]) {
            const large = player(t, { maxFileSize: 4 });
            await large.message('ready');
            large.requests[0].resolve(projectResponse('12345', declared ? { 'content-length': '5' } : {}));
            await settle();
            assert.match(large.text.textContent, /文件过大/);
            assert.equal(large.outgoing.length, 0);
        }

        const failed = player(t);
        await failed.message('error', { message: '<img src=x onerror=alert(1)>' });
        assert.match(failed.text.textContent, /暂时无法打开/);
        assert.equal(failed.text.querySelector('img'), null);
        assert.equal(failed.frame.isConnected, false);
    });

    it('aborts on timeout or page departure and ignores a completed fetch arriving afterwards', async (t) => {
        const slow = player(t);
        await slow.message('ready');
        [...slow.timers.values()][0].callback();
        assert.match(slow.text.textContent, /加载有点慢/);
        assert.equal(slow.requests[0].options.signal.aborted, true);
        slow.requests[0].resolve(projectResponse());
        await settle();
        assert.equal(slow.outgoing.length, 0);

        const leaving = player(t);
        await leaving.message('ready');
        leaving.window.dispatchEvent(new leaving.window.Event('pagehide'));
        assert.equal(leaving.requests[0].options.signal.aborted, true);
        assert.equal(leaving.timers.size, 0);
        leaving.requests[0].resolve(projectResponse());
        await settle();
        assert.equal(leaving.outgoing.length, 0);
        leaving.window.dispatchEvent(new leaving.window.PageTransitionEvent('pageshow', { persisted: true }));
        assert.equal(leaving.navigation.reloads, 1, 'restoring a stopped player from BFCache must reload it');
    });
});

describe('Scratch create and share dialogs', () => {
    it('trims new titles, rejects whitespace and overlong names, and restores the create button after navigation', (t) => {
        const h = actions(t);
        h.create.click();
        assert.equal(h.createDialog.open, true);
        assert.equal(h.document.activeElement, h.title);
        const submit = () => h.form.dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
        const button = h.form.querySelector('button[type=submit]');
        for (const title of ['  \n\t  ', '字'.repeat(121)]) {
            h.title.value = title;
            assert.equal(submit(), false);
            assert.equal(h.title.validity.customError, true);
            assert.equal(button.disabled, false);
            h.title.dispatchEvent(new h.window.Event('input'));
            assert.equal(h.title.validity.customError, false);
        }
        h.title.value = '  我的新世界  ';
        assert.equal(submit(), true);
        assert.equal(h.title.value, '我的新世界');
        assert.equal(button.disabled, true);
        assert.equal(submit(), false, 'a repeated submit must not create a second work');
        h.window.dispatchEvent(new h.window.Event('pageshow'));
        assert.equal(button.disabled, false);
        assert.equal(submit(), true, 'BFCache restoration must allow another genuine submission');
    });

    it('creates only plain share text and posts to an authenticated same-origin endpoint', async (t) => {
        const h = actions(t);
        const title = '</textarea><img src=x onerror=alert(1)> & 小猫';
        await openShare(h, title);
        assert.equal(h.requests[0].options.method, 'POST');
        assert.equal(h.requests[0].options.credentials, 'same-origin');
        assert.equal(h.requests[0].options.headers.Accept, 'application/json');
        assert.equal(h.requests[0].options.body.toString(), '');
        assert(h.text.value.includes(title));
        assert(h.text.value.includes('https://onebyone.test/d/art/scratch/share/token'));
        assert.equal(h.document.querySelector('img'), null);
        assert.equal(h.copy.disabled, false);
        assert.equal(h.revoke.hidden, false);
        assert.equal(h.status.dataset.error, 'false');
    });

    it('keeps invalid, foreign and failed share responses out of the copy field', async (t) => {
        for (const result of [
            { ok: false, message: '<img src=x>无法分享' },
            { ok: true, title: '作品' },
            { ok: true, title: '作品', url: 'https://evil.test/shared' },
            { ok: true, title: '作品', url: 'javascript:alert(1)' },
        ]) {
            const h = actions(t);
            h.share[0].click();
            h.requests[0].resolve(shareResponse(result));
            await settle();
            assert.equal(h.text.value, '');
            assert.equal(h.copy.disabled, true);
            assert.equal(h.revoke.hidden, true);
            assert.equal(h.status.dataset.error, 'true');
            assert.equal(h.status.querySelector('img'), null);
        }
        const foreign = actions(t);
        foreign.share[0].dataset.scratchShare = 'https://evil.test/create';
        foreign.share[0].click();
        await settle();
        assert.equal(foreign.requests.length, 0);
        assert.match(foreign.status.textContent, /分享地址无效/);
    });

    it('selects all share text when clipboard access is absent or denied', async (t) => {
        for (const available of [false, true]) {
            const h = actions(t);
            if (available) Object.defineProperty(h.window.navigator, 'clipboard', {
                value: { writeText: async () => { throw new Error('Not allowed'); } },
            });
            await openShare(h);
            h.copy.click();
            await settle();
            assert.equal(h.document.activeElement, h.text);
            assert.equal(h.text.selectionStart, 0);
            assert.equal(h.text.selectionEnd, h.text.value.length);
            assert.match(h.status.textContent, /Ctrl\+C/);
        }
    });

    it('aborts closing requests and prevents late responses or clipboard results from polluting a new dialog', async (t) => {
        const h = actions(t);
        h.share[0].click();
        const first = h.requests[0];
        h.shareDialog.close();
        assert.equal(first.options.signal.aborted, true);
        assert.equal(h.document.activeElement, h.share[0]);
        h.share[1].click();
        const second = h.requests[1];
        second.resolve(shareResponse({ ok: true, title: '作品二', url: '/d/art/scratch/share/two' }));
        await settle();
        first.resolve(shareResponse({ ok: true, title: '过期作品一', url: '/d/art/scratch/share/one' }));
        await settle();
        assert(h.text.value.includes('作品二'));
        assert(!h.text.value.includes('过期作品一'));
        const pendingCopy = deferred();
        Object.defineProperty(h.window.navigator, 'clipboard', { value: { writeText: () => pendingCopy.promise } });
        h.copy.click();
        h.shareDialog.close();
        h.share[0].click();
        pendingCopy.resolve();
        await settle();
        assert.equal(h.status.textContent, '正在准备分享链接…');
        assert.equal(h.text.value, '');
        h.window.dispatchEvent(new h.window.Event('pagehide'));
        assert.equal(h.requests[2].options.signal.aborted, true);
        h.requests[2].resolve(shareResponse({ ok: true, title: '离开后到达', url: '/d/art/scratch/share/late' }));
        await settle();
        assert.equal(h.text.value, '');
    });

    it('revokes links explicitly, preserves the valid text after a failed revoke, and clears it after success', async (t) => {
        const h = actions(t);
        await openShare(h);
        const validText = h.text.value;
        h.revoke.click();
        assert.equal(h.requests[1].options.body.get('operation'), 'revoke');
        assert.equal(h.copy.disabled, true);
        h.requests[1].resolve(shareResponse({ ok: false, message: '服务暂时不可用' }, false));
        await settle();
        assert.equal(h.text.value, validText);
        assert.equal(h.copy.disabled, false);
        assert.equal(h.revoke.disabled, false);
        assert.equal(h.status.dataset.error, 'true');
        h.revoke.click();
        h.requests[2].resolve(shareResponse({ ok: true }));
        await settle();
        assert.equal(h.text.value, '');
        assert.equal(h.revoke.hidden, true);
        assert.equal(h.copy.disabled, true);
        assert.match(h.status.textContent, /以前发出的链接已失效/);
    });

    it('restores sharing after BFCache navigation and aborts every later page departure', async (t) => {
        const h = actions(t);
        h.share[0].click();
        h.window.dispatchEvent(new h.window.Event('pagehide'));
        assert.equal(h.requests[0].options.signal.aborted, true);
        assert.equal(h.shareDialog.open, false);
        h.window.dispatchEvent(new h.window.PageTransitionEvent('pageshow', { persisted: true }));
        h.share[1].click();
        h.requests[0].resolve(shareResponse({ ok: true, title: '旧请求', url: '/d/art/scratch/share/old' }));
        h.requests[1].resolve(shareResponse({ ok: true, title: '恢复后的作品', url: '/d/art/scratch/share/restored' }));
        await settle();
        assert(h.text.value.includes('恢复后的作品'));
        assert(!h.text.value.includes('旧请求'));
        assert.equal(h.copy.disabled, false);
        h.shareDialog.close();
        h.share[0].click();
        h.window.dispatchEvent(new h.window.Event('pagehide'));
        assert.equal(h.requests[2].options.signal.aborted, true, 'pagehide listener must remain active after the first visit');
        assert.equal(h.shareDialog.open, false);
    });
});
