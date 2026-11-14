const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const filename = path.join(__dirname, '../packages/ui-default/components/live_share/broadcast_controller.ts');
const code = transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function fixture(t, options = {}) {
    const dom = new JSDOM('<!doctype html><html><body><main>老师原页面</main></body></html>', { url: 'https://school.test/d/python/p/1' });
    const { window } = dom;
    let now = Date.now(); let nextTimer = 0;
    const timers = new Map();
    const schedule = (callback, milliseconds = 0, repeat = false) => {
        const id = ++nextTimer;
        timers.set(id, { callback, at: now + milliseconds, repeat: repeat ? milliseconds : 0 }); return id;
    };
    window.setTimeout = (callback, delay) => schedule(callback, delay);
    window.setInterval = (callback, delay) => schedule(callback, delay, true);
    window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
    class Clock extends Date { static now() { return now; } }
    const sent = []; const states = []; const cleared = []; const sources = []; const viewers = [];
    let ready = options.ready ?? true; let sharing = options.sharing ?? false;
    let sourceReady = options.sourceReady ?? true; let connects = 0;
    const bridge = {
        send: (message) => { sent.push(JSON.parse(JSON.stringify(message))); return true; },
        connect: () => { connects++; }, reconnect: () => { connects++; }, pageId: () => 'teacher-page-123',
        ready: () => ready, sharing: () => sharing, sourceReady: () => sourceReady, onActiveChange() {},
    };
    const adapter = () => ({ receive() {}, snapshot() {}, setConnected() {}, dispose() {} });
    const adapters = {
        attachBroadcastSource(settings) { sources.push(settings); return adapter(); },
        attachBroadcastViewer(settings) { viewers.push(settings); return adapter(); },
    };
    const module = { exports: {} };
    vm.runInNewContext(code, {
        module, exports: module.exports,
        require(name) {
            if (name === './annotation_cache') return { clearSessionAnnotations: (id) => cleared.push(id) };
            if (name === './broadcast_presence') return { createBroadcastPresence: () => ({
                active: () => false, start() {}, pause() {}, end() {}, dispose() {},
            }) };
            throw new Error(`Unexpected dependency ${name}`);
        },
        window, document: window.document, location: window.location,
        localStorage: window.localStorage, sessionStorage: window.sessionStorage,
        HTMLElement: window.HTMLElement, Element: window.Element, MutationObserver: window.MutationObserver,
        CustomEvent: window.CustomEvent, Date: Clock, console,
        setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
        setInterval: window.setInterval, clearInterval: window.clearInterval,
    }, { filename });
    const controller = module.exports.installBroadcastController({ uid: 2, canTeach: options.canTeach ?? true,
        enabled: true, pageGrant: 'teacher-page-grant' }, bridge, {
        loadAdapters: async () => adapters,
        loadSourceAdapters: async () => { if (options.loadGate) await options.loadGate.promise; return adapters; },
    });
    window.addEventListener('onebyone:lesson-share-state', (event) => states.push({ ...event.detail }));
    const dispatch = (name, lessonId = 'lesson-one', studentUid = 10, detail = {}) => {
        window.dispatchEvent(new window.CustomEvent(`onebyone:lesson-share-${name}`, { detail: { lessonId, studentUid, ...detail } }));
    };
    const started = (sessionId = 'own-broadcast-123', studentUids = [10]) => controller.receive({ type: 'broadcast:started',
        sessionId, pageId: 'teacher-page-123', teacherUid: 2, teacherName: '唐老师', studentUids });
    t.after(() => { controller.dispose(); timers.clear(); window.close(); });
    return {
        controller, dispatch, started, sent, states, cleared, sources, viewers, timers,
        setReady(value) { ready = value; }, setSourceReady(value) { sourceReady = value; },
        get connects() { return connects; },
        async advance(milliseconds) {
            const end = now + milliseconds;
            for (let count = 0; count < 100; count++) {
                const entry = [...timers].sort((left, right) => left[1].at - right[1].at).find(([, timer]) => timer.at <= end);
                if (!entry) break;
                const [id, timer] = entry; now = timer.at; timers.delete(id);
                if (timer.repeat) timers.set(id, { ...timer, at: now + timer.repeat });
                timer.callback(); await flush();
            }
            now = end; await flush();
        },
    };
}

test('a lesson starts sharing only with its selected learner and stops only its own acknowledged room', async (t) => {
    const h = fixture(t);
    h.dispatch('start', 'lesson-one', 23); await flush();
    assert.deepEqual(h.sent, [{ type: 'broadcast:start', studentUids: [23] }]);
    assert.equal(h.sources.length, 0, 'the recorder waits for server acknowledgement');
    h.started('own-broadcast-123', [23]); await flush();
    assert.equal(h.sources.length, 1);
    assert.equal(h.controller.teacherRoom.sessionId, 'own-broadcast-123');
    h.dispatch('stop', 'a-different-lesson');
    assert.equal(h.sent.filter((message) => message.type === 'broadcast:stop').length, 0);
    h.dispatch('stop');
    assert.deepEqual(h.sent.at(-1), { type: 'broadcast:stop', sessionId: 'own-broadcast-123' });
    assert.equal(h.controller.currentRoom, null);
    assert.deepEqual(h.cleared, ['own-broadcast-123']);
});

test('a lesson waits for the authenticated handshake and page grant before its bounded retry starts sharing', async (t) => {
    const h = fixture(t, { ready: false, sourceReady: false });
    h.dispatch('start'); await flush();
    assert.equal(h.sent.length, 0); assert.equal(h.connects, 1);
    h.setReady(true); h.controller.receive({ type: 'ready' });
    await h.advance(400);
    assert.equal(h.sent.length, 0, 'a ready socket cannot bypass source-page readiness');
    h.setSourceReady(true); await h.advance(400);
    assert.deepEqual(h.sent, [{ type: 'broadcast:start', studentUids: [10] }]);
    h.dispatch('start'); await flush();
    assert.equal(h.sent.length, 1, 'repeated current-lesson events do not create duplicate rooms');
});

test('leaving before a late start acknowledgement stops that session without recording or creating a mirror', async (t) => {
    const h = fixture(t);
    h.dispatch('start'); await flush();
    assert.equal(h.sent[0].type, 'broadcast:start');
    h.dispatch('stop');
    h.started('late-broadcast-123'); await flush();
    assert.deepEqual(h.sent.at(-1), { type: 'broadcast:stop', sessionId: 'late-broadcast-123' });
    assert.equal(h.sources.length, 0); assert.equal(h.viewers.length, 0); assert.equal(h.controller.currentRoom, null);
    assert.equal(h.states.filter((state) => state.state === 'active').length, 0);
    h.dispatch('start', 'lesson-two', 11); await flush();
    assert.deepEqual(h.sent.at(-1), { type: 'broadcast:start', studentUids: [11] }, 'the next lesson remains usable');
});

test('cancelling while adapters are loading never sends an invitation and does not block the next lesson', async (t) => {
    const gate = deferred(); const h = fixture(t, { loadGate: gate });
    h.dispatch('start'); await flush();
    assert.equal(h.sent.length, 0);
    h.dispatch('stop'); gate.resolve(); await flush();
    assert.equal(h.sent.length, 0);
    h.dispatch('start', 'lesson-two', 11); await flush();
    assert.deepEqual(h.sent, [{ type: 'broadcast:start', studentUids: [11] }]);
});

test('timing out an in-flight invitation still retires a late room acknowledgement', async (t) => {
    const h = fixture(t);
    h.dispatch('start'); await flush();
    await h.advance(15001);
    assert(h.states.some((state) => state.state === 'error'));
    h.started('timed-out-broadcast-123'); await flush();
    assert.deepEqual(h.sent.at(-1), { type: 'broadcast:stop', sessionId: 'timed-out-broadcast-123' });
    assert.equal(h.sources.length, 0); assert.equal(h.controller.currentRoom, null);
});

test('a pending lesson does not take ownership of another learner room announced during recovery', async (t) => {
    const h = fixture(t);
    h.dispatch('start'); await flush();
    h.started('unrelated-broadcast-123', [11]); await flush();
    assert.equal(h.controller.teacherRoom.sessionId, 'unrelated-broadcast-123');
    assert.equal(h.states.filter((state) => state.state === 'active').length, 0);
    h.dispatch('stop');
    assert(!h.sent.some((message) => message.type === 'broadcast:stop' && message.sessionId === 'unrelated-broadcast-123'));
    h.started('own-late-broadcast-123', [10]); await flush();
    assert.deepEqual(h.sent.at(-1), { type: 'broadcast:stop', sessionId: 'own-late-broadcast-123' });
    assert.equal(h.controller.teacherRoom.sessionId, 'unrelated-broadcast-123', 'retiring the late own room leaves the unrelated room intact');
});

test('an announcement for an old page cannot claim a pending lesson or activate its recorder', async (t) => {
    const h = fixture(t);
    h.dispatch('start'); await flush();
    h.controller.receive({ type: 'broadcast:started', sessionId: 'old-page-broadcast-123', teacherUid: 2,
        teacherName: '唐老师', pageId: 'previous-page-123', studentUids: [10] });
    await flush();
    assert.equal(h.controller.currentRoom, null); assert.equal(h.sources.length, 0);
    assert.equal(h.states.filter((state) => state.state === 'active').length, 0);
    h.dispatch('stop'); h.started('current-page-broadcast-123'); await flush();
    assert.deepEqual(h.sent.at(-1), { type: 'broadcast:stop', sessionId: 'current-page-broadcast-123' });
});

for (const sameLearner of [false, true]) {
    test(`a pre-existing share ${sameLearner ? 'with the same learner' : 'with another learner'} is never owned or stopped by the new lesson`, async (t) => {
        const h = fixture(t);
        h.started('existing-broadcast-123', [sameLearner ? 10 : 11]); await flush();
        h.dispatch('start'); await flush();
        h.dispatch('stop');
        assert.equal(h.sent.length, 0, 'lesson entry/exit cannot stop a manually started share');
        assert.equal(h.sources.length, 1);
        assert.equal(h.controller.teacherRoom.sessionId, 'existing-broadcast-123');
        if (!sameLearner) assert(h.states.some((state) => state.state === 'error'));
    });
}

test('one-to-one assistance is preserved rather than interrupted by a lesson invitation', async (t) => {
    const h = fixture(t, { sharing: true });
    h.dispatch('start'); await flush();
    assert.equal(h.sent.length, 0); assert.equal(h.sources.length, 0);
    assert(h.states.some((state) => state.state === 'error'));
});

test('disposing removes lesson listeners and scheduled retries without starting a new share', async (t) => {
    const h = fixture(t, { ready: false });
    h.dispatch('start'); await flush();
    assert.equal(h.timers.size, 1); const connections = h.connects; const stateCount = h.states.length;
    h.controller.dispose();
    assert.equal(h.timers.size, 0);
    h.setReady(true); h.dispatch('start', 'lesson-after-dispose', 11); h.dispatch('stop');
    h.started('late-after-dispose'); await h.advance(25000);
    assert.equal(h.sent.length, 0); assert.equal(h.sources.length, 0);
    assert.equal(h.connects, connections); assert.equal(h.states.length, stateCount);
});

test('learners and invalid invite targets cannot activate the teacher share bridge', async (t) => {
    const h = fixture(t, { canTeach: false });
    h.dispatch('start'); await flush();
    assert.equal(h.sent.length, 0); assert.equal(h.states.length, 0);
    const teacher = fixture(t);
    teacher.dispatch('start', 'lesson-one', 0); teacher.dispatch('start', 'lesson-one', '10'); await flush();
    assert.equal(teacher.sent.length, 0); assert.equal(teacher.states.length, 0);
});

test('a reconnecting lesson renews its share deadline instead of inheriting an expired attempt', async (t) => {
    const h = fixture(t, { ready: false });
    h.dispatch('start'); await h.advance(18000);
    h.dispatch('start'); await h.advance(3000);
    assert(!h.states.some(state => state.state === 'error'));
    h.setReady(true); await h.advance(400);
    assert.deepEqual(h.sent.at(-1), { type: 'broadcast:start', studentUids: [10] });
});

test('a long classroom share interruption requests automatic repair and retains its lesson annotation scope', async (t) => {
    const h = fixture(t);
    h.dispatch('start'); await flush(); h.started('before-disconnect'); await flush();
    const scope = h.sources[0].annotationScope.sessionId;
    h.controller.setConnected(false); h.setReady(false);
    await h.advance(125001);
    assert.equal(h.controller.currentRoom, null);
    assert(h.states.some(state => state.state === 'ended' && state.lessonId === 'lesson-one'));
    h.setReady(true); h.dispatch('start'); await flush();
    assert.equal(h.sent.at(-1).type, 'broadcast:start');
    h.started('after-disconnect'); await flush();
    assert.equal(h.sources.at(-1).annotationScope.sessionId, scope);
    assert(scope.includes('lesson-one'));
    assert(!h.sent.some(message => message.type === 'broadcast:stop'), 'a network outage is not a classroom hangup');
});

test('only a real classroom end clears the stable classroom annotation drafts after disposing its recorder', async (t) => {
    const h = fixture(t);
    h.dispatch('start'); await flush(); h.started(); await flush();
    h.dispatch('stop', 'lesson-one', 10, { clearAnnotations: true });
    assert(h.cleared.includes('classroom:2:lesson-one'));
    const handover = fixture(t);
    handover.dispatch('start'); await flush(); handover.started(); await flush();
    handover.dispatch('stop', 'lesson-one', 10, { clearAnnotations: false });
    assert(!handover.cleared.includes('classroom:2:lesson-one'));
});
