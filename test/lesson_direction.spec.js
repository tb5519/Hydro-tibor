const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const source = (name) => transformSync(fs.readFileSync(path.join(root,
    `packages/ui-default/components/live_share/${name}.ts`), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const broadcastCode = source('broadcast_controller'); const controllerCode = source('controller');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

async function fixture(t) {
    const dom = new JSDOM('<!doctype html><html><body><main>老师原页面</main><aside data-teacher-assistant><button data-live-share-open>共享模式</button></aside></body></html>', { url: 'https://school.test/d/python/p/1' });
    const { window } = dom; window.scrollTo = () => {};
    let now = Date.now(); let timerId = 0;
    const timers = new Map(); const sent = []; const states = []; const controls = []; const warnings = [];
    const mirrors = []; const sources = []; const sockets = [];
    const setTimer = (callback, delay = 0, repeat = false) => {
        const id = ++timerId; timers.set(id, { callback, at: now + delay, repeat: repeat ? delay : 0 }); return id;
    };
    window.setTimeout = (callback, delay) => setTimer(callback, delay);
    window.setInterval = (callback, delay) => setTimer(callback, delay, true);
    window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
    class Clock extends Date { static now() { return now; } }
    class Socket extends window.EventTarget {
        static OPEN = 1; static CLOSING = 2;
        constructor() { super(); this.readyState = 0; this.bufferedAmount = 0; sockets.push(this); }
        send(data) { sent.push(data === 'ping' ? data : JSON.parse(data)); }
        open() { this.readyState = 1; this.dispatchEvent(new window.Event('open')); }
        deliver(message) { this.dispatchEvent(new window.MessageEvent('message', { data: JSON.stringify(message) })); }
        close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new window.CloseEvent('close')); }
    }
    const adapter = (collection, options) => {
        const result = { options, disposed: false, dispose() { this.disposed = true; }, setConnected() {}, receive() {},
            snapshot() {}, getPendingDrafts: () => [] };
        collection.push(result); return result;
    };
    const adapters = {
        attachViewerMirror: (options) => adapter(mirrors, options),
        attachViewerEditors: (options) => adapter([], options),
        attachSourceMirror: (options) => adapter([], options), attachSourceEditors: (options) => adapter([], options),
    };
    const broadcastAdapters = {
        attachBroadcastSource: (options) => adapter(sources, options),
        attachBroadcastViewer: () => { throw new Error('a teacher must never attach a broadcast viewer'); },
    };
    const globals = {
        window, document: window.document, location: window.location, localStorage: window.localStorage, sessionStorage: window.sessionStorage,
        URL, Uint8Array, WebSocket: Socket, HTMLElement: window.HTMLElement, Element: window.Element,
        Event: window.Event, CustomEvent: window.CustomEvent, MutationObserver: window.MutationObserver,
        Date: Clock, queueMicrotask, console: { ...console, warn: (...args) => warnings.push(args.map(String).join(' ')) },
        setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, setInterval: window.setInterval, clearInterval: window.clearInterval,
    };
    const dependencies = {
        './annotation_cache': { clearSessionAnnotations() {} },
        './broadcast_presence': { createBroadcastPresence: () => ({ active: () => false, start() {}, pause() {}, end() {}, dispose() {} }) },
        './share_controls': { createTeacherShareControls: () => ({ update: (state) => controls.push(state), dispose() {} }) },
    };
    const evaluate = (code) => {
        const module = { exports: {} };
        vm.runInNewContext(code, { ...globals, module, exports: module.exports,
            require: (name) => { if (dependencies[name]) return dependencies[name]; throw new Error(`Unexpected import ${name}`); } });
        return module.exports;
    };
    dependencies['./broadcast_controller'] = evaluate(broadcastCode);
    const cleanup = evaluate(controllerCode).installLiveShare({ enabled: true, canTeach: true, uid: 2,
        socketUrl: '/d/python/live-share/conn', pageGrant: 'page-grant' }, {
        socketFactory: () => new Socket(), loadAdapters: async () => adapters, loadBroadcastAdapters: async () => broadcastAdapters,
    });
    const advance = async (milliseconds) => {
        const end = now + milliseconds;
        for (let i = 0; i < 100; i++) {
            const entry = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= end);
            if (!entry) break;
            const [id, timer] = entry; now = timer.at; timers.delete(id);
            if (timer.repeat) timers.set(id, { ...timer, at: now + timer.repeat });
            timer.callback(); await flush();
        }
        now = end; await flush();
    };
    window.addEventListener('onebyone:lesson-share-state', (event) => states.push({ ...event.detail }));
    const dispatch = (kind, mode = 'broadcast', lessonId = 'lesson-one', studentUid = 10) => {
        window.dispatchEvent(new window.CustomEvent(`onebyone:lesson-share-${kind}`, { detail: { lessonId, studentUid, mode } }));
    };
    t.after(() => { cleanup(); timers.clear(); window.close(); });
    await advance(0);
    return {
        sent, states, controls, warnings, mirrors, sources, sockets, dispatch, advance,
        openManual() { window.document.querySelector('[data-live-share-open]').click(); },
        deliver(message) { sockets.at(-1).deliver(message); },
        async connect() { sockets.at(-1).open(); sockets.at(-1).deliver({ type: 'ready' }); await advance(400); },
        broadcast(sessionId, version = 1, studentUid = 10) {
            sockets.at(-1).deliver({ type: 'broadcast:started', sessionId, connectionId: 'lesson-connection-123', connectionVersion: version,
                teacherUid: 2, teacherName: '唐老师', pageId: sent.find((message) => message.type === 'hello').pageId,
                studentUids: [studentUid], viewers: [{ uid: studentUid, name: '学员', online: true }] });
        },
        assist(sessionId, version = 2, studentUid = 10, connectionId = 'lesson-connection-123') {
            sockets.at(-1).deliver({ type: 'started', sessionId, connectionId, connectionVersion: version,
                teacherUid: 2, teacherName: '唐老师', studentUid, studentName: '学员', pageId: 'learner-page-123' });
        },
        ended(type, sessionId, version) {
            sockets.at(-1).deliver({ type, sessionId, connectionId: 'lesson-connection-123', connectionVersion: version, switched: true });
        },
        get overlay() { return !!window.document.querySelector('.live-share-overlay'); },
    };
}

test('a live lesson switches teacher demonstration to learner assistance and back on one stable connection', async (t) => {
    const h = await fixture(t);
    h.dispatch('start'); await h.connect();
    assert.equal(h.sent.filter((message) => message.type === 'broadcast:start').length, 1);
    h.broadcast('teacher-demonstration-123'); await flush();
    assert.equal(h.sources.length, 1); assert.equal(h.overlay, false);
    h.dispatch('start', 'assist'); await flush();
    assert.deepEqual(h.sent.filter((message) => message.type === 'switch').map(({ mode, studentUid }) => ({ mode, studentUid })), [{ mode: 'assist', studentUid: 10 }]);
    h.ended('broadcast:ended', 'teacher-demonstration-123', 2); h.assist('learner-assistance-123'); await flush();
    assert.equal(h.overlay, true); assert.equal(h.mirrors.length, 1);
    assert.equal(h.controls.at(-1).mode, 'assist');
    h.dispatch('start', 'broadcast'); await flush();
    assert.equal(h.sent.filter((message) => message.type === 'switch').at(-1).mode, 'broadcast');
    h.ended('ended', 'learner-assistance-123', 3); h.broadcast('teacher-demonstration-456', 3); await flush();
    assert.equal(h.overlay, false); assert.equal(h.mirrors[0].disposed, true); assert.equal(h.sources.length, 2);
    assert.equal(h.controls.at(-1).mode, 'broadcast');
    h.dispatch('stop');
    assert.deepEqual(h.sent.at(-1), { type: 'broadcast:stop', sessionId: 'teacher-demonstration-456' });
    assert.equal(h.sockets.length, 1); assert.deepEqual(h.warnings, []);
});

test('leaving during a switch to learner assistance stops its late acknowledgement before creating a viewer', async (t) => {
    const h = await fixture(t);
    h.dispatch('start'); await h.connect(); h.broadcast('teacher-demonstration-123'); await flush();
    h.dispatch('start', 'assist'); h.dispatch('stop');
    h.ended('broadcast:ended', 'teacher-demonstration-123', 2); h.assist('late-learner-assistance-123'); await flush();
    assert.equal(h.overlay, false); assert.equal(h.mirrors.length, 0);
    assert(h.sent.some((message) => message.type === 'stop' && message.sessionId === 'late-learner-assistance-123'));
    assert.deepEqual(h.warnings, []);
});

test('leaving during a switch back to teacher demonstration never revives its recorder', async (t) => {
    const h = await fixture(t);
    h.dispatch('start'); await h.connect(); h.broadcast('teacher-demonstration-123'); await flush();
    h.dispatch('start', 'assist'); h.ended('broadcast:ended', 'teacher-demonstration-123', 2); h.assist('learner-assistance-123'); await flush();
    h.dispatch('start', 'broadcast'); h.dispatch('stop');
    h.ended('ended', 'learner-assistance-123', 3); h.broadcast('late-teacher-demonstration-456', 3); await flush();
    assert.equal(h.overlay, false); assert.equal(h.sources.length, 1, JSON.stringify({ sent: h.sent, states: h.states }));
    assert(h.sent.some((message) => message.type === 'broadcast:stop' && message.sessionId === 'late-teacher-demonstration-456'));
    assert.deepEqual(h.warnings, []);
});

test('a lesson can use an existing same-learner connection without gaining permission to stop it', async (t) => {
    const h = await fixture(t);
    h.openManual(); await h.connect(); h.assist('manual-assistance-123', 1, 10, 'manual-connection-123'); await flush();
    const before = h.sent.length;
    h.dispatch('start', 'assist', 'another-lesson'); h.dispatch('stop', 'assist', 'another-lesson');
    assert.equal(h.sent.length, before, 'entry and exit must not stop a pre-existing manual room');
    assert.equal(h.overlay, true); assert.deepEqual(h.warnings, []);
});

test('a cancelled lesson cannot veto a later manually started connection with the same learner', async (t) => {
    const h = await fixture(t);
    h.dispatch('start'); await h.connect(); h.broadcast('teacher-demonstration-123'); await flush();
    h.dispatch('stop');
    h.deliver({ type: 'broadcast:ended', sessionId: 'teacher-demonstration-123', connectionId: 'lesson-connection-123' });
    h.assist('fresh-manual-assistance-123', 1, 10, 'fresh-manual-connection-123'); await flush();
    assert(!h.sent.some((message) => message.type === 'stop' && message.sessionId === 'fresh-manual-assistance-123'));
    assert.equal(h.overlay, true); assert.deepEqual(h.warnings, []);
});
