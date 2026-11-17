const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const controller = buildSync({
    absWorkingDir: root,
    entryPoints: ['packages/ui-default/components/live_share/controller.ts'],
    bundle: true, write: false, format: 'iife', globalName: 'LiveController',
    external: ['./mirror', './editor', './frames', './drawing', './ide', './broadcast_adapters'],
}).outputFiles[0].text;

async function fixture(t) {
    const dom = new JSDOM('<!doctype html><html><body><iframe></iframe></body></html>', {
        url: 'https://school.test/d/class-a/', runScripts: 'outside-only',
    });
    const window = dom.window;
    const sockets = [];
    let activePage = window.document.querySelector('iframe').contentWindow;
    let cleanup;
    t.after(() => { cleanup?.(); dom.window.close(); });
    window.BroadcastChannel = undefined;
    window.__onebyonePlatformShell = { contentWindow: () => activePage };
    class FakeSocket extends window.EventTarget {
        constructor(url) {
            super(); this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.sent = []; this.closed = 0;
            sockets.push(this);
        }
        send(data) { this.sent.push(data === 'ping' ? data : JSON.parse(data)); }
        open() { this.readyState = 1; this.dispatchEvent(new window.Event('open')); }
        deliver(message) { this.dispatchEvent(new window.MessageEvent('message', { data: JSON.stringify(message) })); }
        close() {
            if (this.readyState === 3) return;
            this.closed++; this.readyState = 3; this.dispatchEvent(new window.Event('close'));
        }
    }
    vm.runInContext(controller, dom.getInternalVMContext());
    const config = {
        enabled: true, uid: 10, canTeach: false, domainId: 'class-a',
        socketUrl: '/d/class-a/live-share/conn', pageGrant: 'initial-grant-12345678',
    };
    cleanup = window.LiveController.installLiveShare(config, { socketFactory: (url) => new FakeSocket(url) });
    const tick = () => new Promise((resolve) => window.setTimeout(resolve, 0));
    // No BroadcastChannel means identity settles in this one zero-delay task.
    await tick();
    function pageReady({ grant = 'page-grant-a-12345678', url = '/d/class-a/p/1', replaceDocument = false } = {}) {
        if (replaceDocument) {
            const frame = window.document.createElement('iframe'); window.document.body.append(frame);
            activePage = frame.contentWindow;
        }
        activePage.__onebyoneLiveShareSources = {
            loadAdapters: async () => ({}), loadBroadcastAdapters: async () => ({}),
        };
        window.dispatchEvent(new window.CustomEvent('onebyone:page-change', { detail: {
            window: activePage, context: { liveShare: { ...config, pageGrant: grant } },
            url: new URL(url, window.location.href).href, title: '当前学习页面',
        } }));
    }
    const pageLoading = () => window.dispatchEvent(new window.CustomEvent('onebyone:page-loading'));
    return { window, sockets, pageReady, pageLoading, tick };
}

it('does not send an ungranted student hello if navigation begins while the socket is connecting', async (t) => {
    const f = await fixture(t);
    f.pageReady();
    assert.equal(f.sockets.length, 1); const initial = f.sockets[0];
    f.pageLoading(); initial.open();
    assert.equal(initial.sent.filter((item) => item.type === 'hello').length, 0);
    assert.equal(initial.closed, 1, 'close the stale connecting transport without waiting for the server hello timeout');
    f.pageReady({ grant: 'page-grant-b-12345678', url: '/d/class-a/p/2', replaceDocument: true });
    assert.equal(f.sockets.length, 2);
    const fresh = f.sockets[1]; fresh.open();
    const hello = fresh.sent.find((item) => item.type === 'hello');
    assert.equal(hello.pageGrant, 'page-grant-b-12345678'); assert.equal(hello.url, '/d/class-a/p/2');
    fresh.deliver({ type: 'ready' });
    assert.equal(fresh.closed, 0);
});

for (const code of ['UNSUPPORTED_PAGE', 'INVALID_HELLO']) {
    it(`a rejected ${code} handshake closes its transport and a fresh page can reconnect immediately`, async (t) => {
        const f = await fixture(t); f.pageReady();
        const rejected = f.sockets[0]; rejected.open();
        assert.equal(rejected.sent[0].type, 'hello');
        rejected.deliver({ type: 'error', code, message: '共享页面需要重新确认' });
        // The real server also has a 15-second no-peer hello timeout. Immediate
        // client recovery avoids showing an online learner as unavailable until then.
        assert.equal(rejected.closed, 1);
        f.pageReady({ grant: 'page-grant-fresh-12345678', replaceDocument: true });
        assert.equal(f.sockets.length, 2);
        const fresh = f.sockets[1]; fresh.open(); fresh.deliver({ type: 'ready' });
        assert.equal(fresh.sent.find((item) => item.type === 'hello').pageGrant, 'page-grant-fresh-12345678');
        rejected.deliver({ type: 'error', code, message: '迟到的旧连接错误' });
        assert.equal(fresh.closed, 0, 'a late error from the retired socket cannot close the new owner');
    });
}

it('normal ready-page navigation keeps the healthy student transport and announces the new source grant', async (t) => {
    const f = await fixture(t); f.pageReady();
    const socket = f.sockets[0]; socket.open(); socket.deliver({ type: 'ready' });
    f.pageLoading();
    f.pageReady({ grant: 'page-grant-next-12345678', url: '/d/class-a/p/9', replaceDocument: true });
    assert.equal(f.sockets.length, 1); assert.equal(socket.closed, 0);
    assert.equal(socket.sent.filter((item) => item.type === 'hello').length, 1);
    const updates = socket.sent.filter((item) => item.type === 'page');
    assert.ok(updates.some((item) => item.url === ''), 'capture pauses while the content is loading');
    assert.equal(updates.at(-1).url, '/d/class-a/p/9');
    assert.equal(updates.at(-1).pageGrant, 'page-grant-next-12345678');
});
