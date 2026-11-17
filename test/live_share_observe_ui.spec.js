const assert = require('node:assert/strict');
const path = require('node:path');
const { it } = require('node:test');
const { JSDOM } = require('jsdom');
const { buildSync } = require('esbuild');
const repo = path.resolve(__dirname, '..');
const bundle = buildSync({ absWorkingDir: repo, entryPoints: ['packages/ui-default/components/live_share/controller.ts'],
    bundle: true, write: false, format: 'iife', globalName: 'ObserveController',
    external: ['./mirror', './editor', './frames', './drawing', './ide', './broadcast_adapters'],
}).outputFiles[0].text;
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

async function fixture(t, { student = false, platform = false, storage = {} } = {}) {
    const dom = new JSDOM('<!doctype html><html><body><main id="original"><textarea id="code">student draft</textarea></main><button data-live-share-open>共享模式</button><button data-live-observe-open>学员画面</button><iframe id="content"></iframe></body></html>', {
        url: 'https://observe.test/p/1', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    const w = dom.window; const sockets = []; const made = {}; let now = Date.now(); let captures = 0;
    w.scrollTo = () => {}; w.BroadcastChannel = undefined; w.Date.now = () => now;
    const nativeTimeout = w.setTimeout.bind(w);
    w.setTimeout = (callback, delay, ...args) => nativeTimeout(callback, delay >= 700 ? 5 : delay, ...args);
    Object.defineProperty(w.navigator, 'mediaDevices', { value: {
        getDisplayMedia() { captures++; throw new Error('A page observation must not capture the desktop'); },
        getUserMedia() { captures++; throw new Error('A page observation must not open devices'); },
    } });
    for (const [key, value] of Object.entries(storage)) w.sessionStorage.setItem(key, value);
    class Socket extends w.EventTarget {
        constructor() { super(); this.readyState = 0; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
        send(raw) { this.sent.push(raw === 'ping' ? raw : JSON.parse(raw)); }
        open() { this.readyState = 1; this.dispatchEvent(new w.Event('open')); }
        deliver(data) { this.dispatchEvent(new w.MessageEvent('message', { data: JSON.stringify(data) })); }
        close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new w.CloseEvent('close', { code })); }
    }
    const make = (kind, options) => {
        const adapter = { kind, options, connected: true, disposed: false, received: [], snapshots: 0,
            dispose() { this.disposed = true; },
            setConnected(value) {
                this.connected = value;
                if (value && kind === 'viewerEditors') options.send({ type: 'edit:sync', pageId: options.pageId, editorId: '' });
            },
            receive(value) { this.received.push(value); }, receiveCommand(value) { this.received.push(value); },
            snapshot() { this.snapshots++; }, getPendingDrafts() { return []; },
        };
        (made[kind] ||= []).push(adapter); return adapter;
    };
    const adapters = {
        attachViewerMirror(options) { const a = make('viewerMirror', options); options.onViewport({ width: 1000, height: 700 }); return a; },
        attachViewerEditors: (o) => make('viewerEditors', o), attachViewerFrames: (o) => make('viewerFrames', o),
        attachViewerIde: (o) => make('viewerIde', o), attachSourceMirror: (o) => make('sourceMirror', o),
        attachSourceEditors: (o) => make('sourceEditors', o), attachSourceFrames: (o) => make('sourceFrames', o),
        attachSourceIde: (o) => make('sourceIde', o), attachTemporaryDrawing: (o) => make('drawing', o),
    };
    const child = w.document.querySelector('iframe').contentWindow;
    child.__onebyoneLiveShareSources = { loadAdapters: async () => adapters, loadBroadcastAdapters: async () => ({}), loadDrawing: async () => ({}) };
    if (platform) w.__onebyonePlatformShell = { contentWindow: () => child };
    w.eval(bundle);
    const uid = student ? 5 : 2;
    const config = { enabled: true, uid, canTeach: !student, domainId: 'python', socketUrl: '/live-share/conn', pageGrant: 'initial-grant' };
    const cleanup = w.ObserveController.installLiveShare(config, { socketFactory: () => new Socket(), loadAdapters: async () => adapters });
    t.after(() => { cleanup(); dom.window.close(); });
    const pageReady = () => w.dispatchEvent(new w.CustomEvent('onebyone:page-change', { detail: {
        window: child, context: { liveShare: { ...config, pageGrant: `grant-${now}` } }, url: 'https://observe.test/p/2', title: '新页面',
    } }));
    if (platform) pageReady();
    await settle();
    const connect = async (entry = 'observe') => {
        if (!sockets.length) w.document.querySelector(entry === 'observe' ? '[data-live-observe-open]' : '[data-live-share-open]').click();
        await settle(); const socket = sockets.at(-1); socket.open(); socket.deliver({ type: 'ready' }); await settle(); return socket;
    };
    const allSent = () => sockets.flatMap((socket) => socket.sent);
    const saveStorage = () => Object.fromEntries([...Array(w.sessionStorage.length)].map((_, i) => {
        const key = w.sessionStorage.key(i); return [key, w.sessionStorage.getItem(key)];
    }));
    return { w, made, sockets, connect, allSent, pageReady, saveStorage, advance(ms) { now += ms; }, get captures() { return captures; } };
}
const teacherView = { type: 'started', sessionId: 'observe-room-1', connectionId: 'observe-connection-1',
    pageId: 'learner-page-1', studentUid: 5, studentName: '学员5', teacherName: '唐老师', mode: 'observe' };

it('the observation entry starts an explicitly read-only request while the existing share entry keeps assistance', async (t) => {
    for (const mode of ['observe', 'assist']) {
        const f = await fixture(t); const socket = await f.connect(mode);
        socket.deliver({ type: 'students', students: [{ uid: 5, name: '学员5', online: true }] });
        f.w.document.querySelector('.live-share-student').click(); await settle();
        assert.equal(f.allSent().filter((x) => x.type === 'start').at(-1).mode, mode);
    }
});

it('observation uses all four read-only renderers and sends no teacher editor, command, pointer, pen or IDE relay', async (t) => {
    const f = await fixture(t); const socket = await f.connect(); const drawings = f.made.drawing?.length || 0;
    socket.deliver(teacherView); await settle();
    for (const kind of ['viewerMirror', 'viewerEditors', 'viewerFrames', 'viewerIde']) assert.equal(f.made[kind][0].options.readOnly, true);
    assert.equal(f.made.drawing?.length || 0, drawings, 'there is no remote annotation/drawing adapter');
    f.made.viewerMirror[0].options.sendCommand({ action: 'click' });
    f.made.viewerFrames[0].options.sendCommand({ action: 'frame' });
    f.made.viewerEditors[0].options.send({ type: 'edit:update' });
    f.made.viewerIde[0].options.sendCommand({ action: 'ide' });
    assert.equal(f.allSent().filter((x) => x.type === 'relay').length, 0);
    assert.equal(f.allSent().filter((x) => x.type === 'observe:sync').length, 1, 'initial and editor sync recovery requests coalesce');
    assert.equal(f.w.document.querySelector('[data-share-switch-mode]').hidden, true);
    f.w.document.querySelector('[data-share-switch-mode]').click();
    assert.equal(f.allSent().filter((x) => x.type === 'switch').length, 0);
    assert.equal(f.w.document.querySelector('.teacher-share-controls__mode').textContent, '正在查看');
    assert.equal(f.w.document.querySelector('[data-share-end]').getAttribute('aria-label'), '停止查看');
    assert.equal(f.captures, 0);
});

it('the read-only viewer still receives complete initial code and current page updates', async (t) => {
    const f = await fixture(t); const socket = await f.connect(); socket.deliver(teacherView); await settle();
    const initial = { type: 'edit:init', pageId: teacherView.pageId, editorId: 'code-1', state: 'complete-yjs-state' };
    socket.deliver({ type: 'relay', sessionId: teacherView.sessionId, pageId: teacherView.pageId, kind: 'editor', data: initial });
    assert.equal(f.made.viewerEditors[0].received[0].state, initial.state);
    socket.deliver({ ...teacherView, pageId: 'learner-next-page' }); await settle();
    assert.equal(f.made.viewerEditors[0].disposed, true); assert.equal(f.made.viewerEditors[1].options.readOnly, true);
    socket.deliver({ type: 'relay', sessionId: teacherView.sessionId, pageId: teacherView.pageId, kind: 'editor', data: initial });
    assert.equal(f.made.viewerEditors[1].received.length, 0, 'the old page cannot write into the current replica');
});

it('observation mode survives teacher refresh and old stored sessions still default to assistance', async (t) => {
    const first = await fixture(t); const socket = await first.connect(); socket.deliver(teacherView); await settle();
    const storage = first.saveStorage(); assert.equal(JSON.parse(storage['onebyone.live-share.resume:2']).mode, 'observe');
    const refreshed = await fixture(t, { storage }); const recovered = await refreshed.connect(); recovered.deliver(teacherView); await settle();
    assert.equal(refreshed.made.viewerEditors[0].options.readOnly, true);
    for (const mode of ['observe', undefined]) {
        const legacy = await fixture(t, { storage: { 'onebyone.live-share.resume:2': JSON.stringify({ studentUid: 5, mode }) } });
        await legacy.connect();
        assert.equal(legacy.allSent().filter((x) => x.type === 'start').at(-1).mode, mode || 'assist');
    }
});

it('teacher reconnect retains read-only adapters and asks only for a safe fresh snapshot', async (t) => {
    const f = await fixture(t); let socket = await f.connect(); socket.deliver(teacherView); await settle();
    socket.close(); await settle(); socket = f.sockets.at(-1); socket.open(); socket.deliver({ type: 'ready' }); socket.deliver(teacherView); await settle();
    assert.equal(f.made.viewerEditors.length, 1); assert.equal(f.made.viewerEditors[0].connected, true);
    assert.equal(f.allSent().filter((x) => x.type === 'relay').length, 0);
    assert.equal(f.allSent().filter((x) => x.type === 'observe:sync').length, 2);
});

it('a pending read-only start never silently turns into an assistance session', async (t) => {
    const f = await fixture(t); const socket = await f.connect();
    socket.deliver({ type: 'students', students: [{ uid: 5, name: '学员5', online: true }] });
    f.w.document.querySelector('.live-share-student').click(); await settle();
    socket.deliver({ ...teacherView, mode: undefined }); await settle();
    assert.equal(f.made.viewerEditors?.length || 0, 0);
    assert.ok(f.allSent().some((x) => x.type === 'stop' && x.sessionId === teacherView.sessionId));
});

it('a teacher stop cannot be undone by a late started packet after its ended acknowledgment', async (t) => {
    const f = await fixture(t); const socket = await f.connect(); socket.deliver(teacherView); await settle();
    f.w.document.querySelector('[data-share-end]').click();
    socket.deliver({ type: 'ended', sessionId: teacherView.sessionId, connectionId: teacherView.connectionId });
    socket.deliver(teacherView); await settle();
    assert.equal(f.made.viewerEditors.length, 1); assert.equal(f.made.viewerEditors[0].disposed, true);
    assert.equal(f.w.document.querySelector('.live-share-overlay'), null);
    assert.equal(f.w.document.querySelector('[data-teacher-share-controls]').hidden, true);
});

it('a student keeps focus, sees an honest observation notice, and accepts only snapshot requests', async (t) => {
    const f = await fixture(t, { student: true }); const socket = await f.connect();
    const pageId = socket.sent.find((x) => x.type === 'hello').pageId;
    f.w.document.querySelector('#code').focus();
    const source = { ...teacherView, type: 'share-start', pageId };
    socket.deliver(source); await settle();
    assert.equal(f.w.document.activeElement.id, 'code');
    assert.match(f.w.document.querySelector('.live-share-notice').textContent, /唐老师正在查看.*停止查看/);
    assert.equal(f.made.drawing?.length || 0, 0);
    socket.deliver({ type: 'relay', sessionId: source.sessionId, pageId, kind: 'command', data: { action: 'click' } });
    socket.deliver({ type: 'relay', sessionId: source.sessionId, pageId, kind: 'editor', data: { type: 'edit:update' } });
    assert.equal(f.made.sourceMirror[0].received.length, 0); assert.equal(f.made.sourceEditors[0].received.length, 0);
    socket.deliver({ type: 'observe:sync', sessionId: source.sessionId, pageId });
    for (const kind of ['sourceMirror', 'sourceEditors', 'sourceFrames', 'sourceIde']) assert.equal(f.made[kind][0].snapshots, 1);
    assert.equal(f.w.document.activeElement.id, 'code'); assert.equal(f.captures, 0);
});

it('student stop during a disconnected observation stops capture immediately and survives refresh', async (t) => {
    const f = await fixture(t, { student: true }); let socket = await f.connect(); const pageId = socket.sent.find((x) => x.type === 'hello').pageId;
    socket.deliver({ ...teacherView, type: 'share-start', pageId }); await settle(); socket.close();
    f.w.document.querySelector('[data-live-observe-stop]').click();
    assert.equal(f.made.sourceMirror[0].disposed, true); assert.equal(f.w.document.querySelector('.live-share-notice'), null);
    const stored = f.saveStorage(); await settle(); socket = f.sockets.at(-1); socket.open(); socket.deliver({ type: 'ready' });
    socket.deliver({ ...teacherView, type: 'share-start', pageId }); await settle();
    assert.equal(f.made.sourceMirror.length, 1, 'a late share-start cannot revive stopped capture');
    assert.ok(f.allSent().some((x) => x.type === 'stop' && x.sessionId === teacherView.sessionId));
    const refreshed = await fixture(t, { student: true, storage: stored }); const recovered = await refreshed.connect();
    const freshPageId = recovered.sent.find((x) => x.type === 'hello').pageId;
    recovered.deliver({ ...teacherView, type: 'share-start', sessionId: 'later-page-room', pageId: freshPageId }); await settle();
    assert.equal(refreshed.made.sourceMirror?.length || 0, 0, 'the cancelled connection also stays stopped after full reload');
});

it('a paused or private student page keeps a stop button and never restarts after that button is clicked', async (t) => {
    const f = await fixture(t, { student: true, platform: true }); const socket = await f.connect(); const pageId = socket.sent.find((x) => x.type === 'hello').pageId;
    socket.deliver({ ...teacherView, type: 'share-start', pageId }); await settle();
    f.w.dispatchEvent(new f.w.CustomEvent('onebyone:page-loading'));
    assert.equal(f.made.sourceMirror[0].disposed, true);
    assert.match(f.w.document.querySelector('.live-share-notice').textContent, /查看已暂停.*停止查看/);
    f.w.document.querySelector('[data-live-observe-stop]').click();
    f.advance(1000); f.pageReady(); const next = socket.sent.filter((x) => x.type === 'page').at(-1);
    socket.deliver({ ...teacherView, type: 'share-start', pageId: next.pageId }); await settle();
    assert.equal(f.made.sourceMirror.length, 1); assert.equal(f.w.document.querySelector('[data-live-observe-stop]'), null);
});
