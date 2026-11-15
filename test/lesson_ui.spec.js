const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const stylus = require('stylus');

const source = path.join(__dirname, '../packages/ui-default/components/lesson/controller.ts');
const code = transformSync(fs.readFileSync(source, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const initialNow = Date.parse('2026-11-15T10:00:00+08:00');
const makeLesson = (changes = {}) => ({ _id: 'lesson-abcdefghijklmnop', domainId: 'C0001', workspaceId: 'legacy', teacherUid: 2,
    studentUid: 5, teacherName: '唐老师', studentName: '橙子', title: 'Python 一对一',
    startAt: new Date(initialNow + 10 * 60000).toISOString(), endAt: new Date(initialNow + 70 * 60000).toISOString(),
    status: 'scheduled', teacherJoined: false, studentJoined: false, ...changes });
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const html = '<main class="ui-v2-home"><section class="ui-pinned-contest"><h2>周赛</h2><a class="ui-pinned-contest__action">进入比赛</a></section><div class="ui-v2-home__body">练习计划</div></main><button data-lesson-open>上课模式</button>';

async function fixture(t, options = {}) {
    const dom = new JSDOM(html, { url: 'https://onebyone.test/d/C0001/', pretendToBeVisual: true });
    const { window } = dom;
    const { document } = window;
    window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
    window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
    const confirmations = [];
    window.confirm = message => { confirmations.push(message); return options.confirmExit !== false; };
    let clockNow = options.now ?? initialNow;
    let timerId = 0;
    const timers = new Map(); const intervals = new Map(); const frames = [];
    window.setTimeout = (callback, delay = 0) => { const id = ++timerId; timers.set(id, { callback, at: clockNow + delay }); return id; };
    window.clearTimeout = id => timers.delete(id);
    window.setInterval = (callback, delay) => { const id = ++timerId; intervals.set(id, { callback, delay, at: clockNow + delay }); return id; };
    window.clearInterval = id => intervals.delete(id);
    const uid = options.student ? 5 : 2;
    const accepted = new Set(options.resumeLessonId ? [options.resumeLessonId] : []);
    if (options.savedHint) window.localStorage.setItem(`onebyone.lesson.recovery:${uid}`, JSON.stringify(options.savedHint));
    if (options.copiedTabId) window.sessionStorage.setItem(`onebyone.lesson.tab:${uid}`, options.copiedTabId);
    const rows = structuredClone([...new Map([...(options.lessons || []), ...(options.history || [])].map(row => [row._id, row])).values()]);
    const requests = []; const messages = []; const shareEvents = []; const mediaReceives = []; const mediaConnections = [];
    const desktopEvents = []; const desktopReservations = []; const mediaStartArgs = [];
    let mediaStarts = 0; let mediaStops = 0; let mediaDisposes = 0; let mediaCallbacks;
    const sockets = [];
    let delayRead = false; let heldRead; let heldMutation; let heldResume; let heldExit;
    const roster = [{ uid: 5, name: '橙子', online: true }, { uid: 7, name: '睿睿', online: false }];
    const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => structuredClone(data) });
    async function fakeFetch(url, init) {
        const body = init.body ? JSON.parse(init.body) : null; requests.push({ url, body });
        if (options.offline) throw new Error('network offline');
        if (url.endsWith('/resume')) {
            if (options.holdResume) return new Promise(resolve => { heldResume = data => resolve(response(data)); });
            if (options.resumeFailureCount > 0) { options.resumeFailureCount--; return response({ code: 'UNAVAILABLE' }, 503); }
            if (options.resumeResponse) return response({ uid, ...options.resumeResponse }, options.resumeStatus || 200);
            const lesson = rows.find(row => accepted.has(row._id) && row.status === 'active');
            if (!lesson) return response({ uid, lesson: null, serverNow: new Date(clockNow).toISOString() });
            lesson[uid === lesson.teacherUid ? 'teacherJoined' : 'studentJoined'] = true;
            return response({ uid, lesson, apiUrl: `/d/${lesson.domainId}/lesson`, socketUrl: `/d/${lesson.domainId}/lesson/conn`,
                canTeach: uid === lesson.teacherUid, serverNow: new Date(clockNow).toISOString() });
        }
        if (body?.operation) desktopEvents.push(`request:${body.operation}`);
        if (!body) {
            const data = structuredClone({ lessons: rows.filter(row => url.startsWith('/d/C0002') ? row.domainId === 'C0002' : row.domainId === 'C0001'),
                history: options.student ? [] : rows.filter(row => row.teacherUid === uid).map(row => ({ ...row,
                    apiUrl: options.historyApiUrls?.[row._id] || `/d/${row.domainId}/lesson`, domainName: row.domainName || `课堂 ${row.domainId}` })),
                historyHasMore: !!options.historyHasMore, students: roster, serverNow: new Date(clockNow).toISOString() });
            if (delayRead) { delayRead = false; return new Promise(resolve => { heldRead = () => resolve(response(data)); }); }
            return response(data);
        }
        if (['join', 'create'].includes(body.operation)) {
            if (options.holdMutation) return new Promise(resolve => { heldMutation = data => resolve(response(data)); });
            if (options.mutationResponse) return response(options.mutationResponse, options.mutationStatus || 200);
        }
        if (body.operation === 'create') {
            const row = makeLesson({ _id: 'lesson-created-abcdefghijkl', studentUid: body.studentUid,
                studentName: roster.find(item => item.uid === body.studentUid).name, title: body.title,
                startAt: body.startAt || new Date(clockNow).toISOString(),
                endAt: new Date((body.startAt ? Date.parse(body.startAt) : clockNow) + body.durationMinutes * 60000).toISOString(),
                status: body.startAt ? 'scheduled' : 'active', teacherJoined: !body.startAt });
            rows.push(row); if (!body.startAt) accepted.add(row._id); return response({ lesson: row });
        }
        const row = rows.find(item => item._id === body.lessonId);
        if (!row) return response({ error: 'NOT_FOUND', message: '没有这节课' }, 404);
        if (options.holdExit && ['end', 'leave'].includes(body.operation)) return new Promise(resolve => { heldExit = data => resolve(response(data)); });
        if (body.operation === 'join') { row.status = 'active'; row[uid === row.teacherUid ? 'teacherJoined' : 'studentJoined'] = true; accepted.add(row._id); }
        if (body.operation === 'leave') { row[uid === row.teacherUid ? 'teacherJoined' : 'studentJoined'] = false; accepted.delete(row._id); }
        if (body.operation === 'cancel') row.status = 'cancelled';
        if (body.operation === 'end') { row.status = 'ended'; accepted.delete(row._id); }
        return response({ lesson: row });
    }
    const media = { prepareDesktop() {
        const reservation = { id: desktopReservations.length + 1, cancelled: false };
        desktopReservations.push(reservation); desktopEvents.push('prepare'); return reservation;
    }, cancelDesktop(reservation) { reservation.cancelled = true; desktopEvents.push('cancel'); },
        start: async (lesson, reservation) => { mediaStarts++; mediaStartArgs.push({ lesson, reservation }); desktopEvents.push('start'); },
        receive: message => mediaReceives.push(message),
        setConnected: value => mediaConnections.push(value), stop: () => { mediaStops++; }, dispose: () => { mediaDisposes++; } };
    function socketFactory(url) {
        const socket = { url, readyState: 0, bufferedAmount: 0, onopen: null, onmessage: null, onclose: null, onerror: null,
            send(data) { const message = JSON.parse(data); messages.push(message);
                if (message.type === 'join' && !options.noReady) this.deliver({ type: 'ready', lesson: rows.find(row => row._id === message.lessonId), peerOnline: !!options.peerOnline });
                if (message.type === 'pulse' && !options.noAck) this.deliver({ type: 'pulse' }); },
            deliver(message) { this.onmessage?.({ data: JSON.stringify(structuredClone(message)) }); },
            close() { this.readyState = 3; },
        };
        sockets.push(socket); window.setTimeout(() => { socket.readyState = 1; socket.onopen?.({}); }); return socket;
    }
    for (const type of ['onebyone:lesson-share-start', 'onebyone:lesson-share-stop']) window.addEventListener(type, event => shareEvents.push({ type, detail: event.detail }));
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, window, document, URL: window.URL,
        sessionStorage: window.sessionStorage, AbortController: window.AbortController,
        CustomEvent: window.CustomEvent, Date, Intl,
        setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, setInterval: window.setInterval, clearInterval: window.clearInterval,
        require(name) { if (name === './media') return { mountLessonMedia() { throw Error('A media factory is required in this test'); } }; throw Error(`Unexpected import ${name}`); },
    });
    const pageDomain = options.pageDomain || 'C0001';
    const config = { enabled: true, uid, canTeach: !options.student, apiUrl: `/d/${pageDomain}/lesson`, socketUrl: `/d/${pageDomain}/lesson/conn` };
    const cleanup = module.exports.installLesson(config, { now: () => clockNow, fetch: fakeFetch,
        pollIntervalMs: 1000000, socketFactory, mediaFactory: (_config, callbacks) => { mediaCallbacks = callbacks; return media; } });
    t.after(() => { cleanup(); for (const frame of frames) frame.window.close(); window.close(); });
    await settle();
    async function advance(milliseconds = 0) {
        clockNow += milliseconds;
        for (const [id, timer] of [...timers]) if (timer.at <= clockNow) { timers.delete(id); timer.callback(); }
        for (const interval of intervals.values()) if (interval.at <= clockNow) { interval.at = clockNow + interval.delay; interval.callback(); }
        await settle();
    }
    async function refresh() { document.dispatchEvent(new window.Event('visibilitychange')); await settle(); }
    async function navigate(nextConfig = {}) {
        const frame = new JSDOM(html, { url: 'https://onebyone.test/d/C0002/', pretendToBeVisual: true }); frames.push(frame);
        window.__onebyonePlatformShell = { contentWindow: () => frame.window };
        window.dispatchEvent(new window.CustomEvent('onebyone:page-change', { detail: { window: frame.window,
            context: { lesson: { ...config, apiUrl: '/d/C0002/lesson', socketUrl: '/d/C0002/lesson/conn', ...nextConfig } } } }));
        await settle(); return frame.window;
    }
    const click = async selector => { const node = document.querySelector(selector); assert(node, `Missing ${selector}`); node.click(); await settle(); };
    return { window, document, rows, requests, messages, sockets, shareEvents, mediaReceives, mediaConnections,
        desktopEvents, desktopReservations, mediaStartArgs, confirmations, options, accepted, releaseMutation: data => heldMutation?.(data),
        releaseResume: data => heldResume?.(data),
        releaseExit: data => heldExit?.(data),
        get hint() { return JSON.parse(window.localStorage.getItem(`onebyone.lesson.recovery:${uid}`)); },
        click, refresh, advance, navigate, exports: module.exports, cleanup, leaveMedia: () => mediaCallbacks.onLeave(),
        holdNextRead: () => { delayRead = true; }, releaseRead: () => heldRead?.(),
        get mediaStarts() { return mediaStarts; }, get mediaStops() { return mediaStops; }, get mediaDisposes() { return mediaDisposes; } };
}

it('an offline learner can be booked in Beijing wall-clock time with no device or socket activity', async t => {
    const f = await fixture(t);
    await f.click('[data-lesson-open]');
    const modes = f.document.querySelectorAll('.lesson-mode'); modes[1].click();
    await f.click('[data-lesson-student="7"]');
    f.document.querySelector('input[type="datetime-local"]').value = '2026-11-16T19:30';
    f.document.querySelector('input[placeholder="例如：Python 一对一"]').value = 'C++ 递归课';
    await f.click('[data-lesson-create]');
    const created = f.requests.find(item => item.body?.operation === 'create');
    assert.equal(created.body.studentUid, 7); assert.equal(created.body.startAt, '2026-11-16T11:30:00.000Z');
    assert.equal(created.body.durationMinutes, 60); assert.match(created.body.tabId, /^[a-f0-9]{32}$/);
    assert.equal(f.mediaStarts, 0); assert.equal(f.sockets.length, 0);
    assert.equal(f.desktopReservations.length, 0, 'booking never opens a desktop window');
    assert.match(f.document.querySelector('[data-lesson-home]').textContent, /19:30/);
    assert.match(f.document.querySelector('[data-lesson-home]').textContent, /睿睿/);
    assert(f.document.querySelector('.ui-pinned-contest__action'), 'the competition entry remains available');
    assert.equal(f.document.querySelector('.lesson-picker').open, false);
});

it('an accepted unfinished lesson resumes on another classroom page without a new invitation or desktop reservation', async t => {
    const row = makeLesson({ status: 'active', teacherJoined: false, studentJoined: false, startAt: new Date(initialNow - 60000).toISOString() });
    const copiedTabId = 'a'.repeat(32);
    const f = await fixture(t, { lessons: [row], resumeLessonId: row._id, pageDomain: 'C0002', copiedTabId, peerOnline: true,
        savedHint: { lessonId: row._id, apiUrl: '/d/C0001/lesson', socketUrl: '/d/C0001/lesson/conn', mode: 'assist' } });
    await f.advance();
    assert.equal(f.mediaStarts, 1); assert.equal(f.desktopReservations.length, 0);
    assert.equal(f.sockets[0].url, 'wss://onebyone.test/d/C0001/lesson/conn');
    assert(f.requests.some(item => item.url === '/d/C0002/lesson/resume'));
    assert.notEqual(f.requests.find(item => item.url.endsWith('/resume')).body.tabId, copiedTabId, 'a copied session tab must get a fresh owner identity');
    assert.equal(f.requests.some(item => ['create', 'join'].includes(item.body?.operation)), false);
    assert.equal(f.document.querySelectorAll('.lesson-mode-button')[1].getAttribute('aria-pressed'), 'true');
    assert.equal(f.shareEvents.at(-1).detail.mode, 'assist');
    f.window.dispatchEvent(new f.window.Event('onebyone:lesson-share-ready'));
    assert.equal(f.shareEvents.at(-1).detail.mode, 'assist', 'late-loaded sharing receives an idempotent start');
    assert.equal(f.mediaStarts, 1);
});

it('a stored lesson hint cannot auto-join a learner who has never accepted the invitation', async t => {
    const row = makeLesson({ status: 'active', teacherJoined: true, startAt: new Date(initialNow - 60000).toISOString() });
    const f = await fixture(t, { student: true, lessons: [row],
        savedHint: { lessonId: row._id, apiUrl: '/d/C0001/lesson', socketUrl: '/d/C0001/lesson/conn', mode: 'broadcast' } });
    assert.equal(f.mediaStarts, 0); assert.equal(f.desktopReservations.length, 0); assert.equal(f.sockets.length, 0);
    assert.equal(f.document.querySelector('.lesson-reminder').open, true);
});

it('a connection recovers after more than six transient failures without reopening devices or clearing sharing', async t => {
    const f = await fixture(t, { peerOnline: true });
    await f.click('[data-lesson-open]'); await f.click('[data-lesson-student="5"]'); await f.click('[data-lesson-create]'); await f.advance();
    const original = f.sockets[0];
    f.options.resumeFailureCount = 8; f.rows[0].teacherJoined = false;
    original.onclose({});
    assert.equal(f.mediaConnections.at(-1), false); assert.equal(f.mediaStops, 0);
    for (let index = 0; index < 10; index++) await f.advance(20000);
    await f.advance();
    assert(f.requests.filter(item => item.url.endsWith('/resume')).length >= 10);
    assert(f.sockets.length >= 2); assert.equal(f.mediaStarts, 1); assert.equal(f.mediaStops, 0);
    assert.equal(f.mediaConnections.at(-1), true);
    assert.equal(f.shareEvents.filter(event => event.type.endsWith('share-stop')).length, 0);
});

it('handshake and heartbeat silence recover half-open sockets, while pulse acknowledgements keep healthy ones', async t => {
    const row = makeLesson({ status: 'active', startAt: new Date(initialNow - 60000).toISOString() });
    for (const failure of ['noReady', 'noAck']) {
        const f = await fixture(t, { lessons: [row], resumeLessonId: row._id, [failure]: true });
        await f.advance();
        await f.advance(failure === 'noReady' ? 16000 : 31000);
        f.options[failure] = false;
        await f.advance(20000); await f.advance();
        assert(f.sockets.length >= 2, `${failure} must release the stale socket`);
        assert.equal(f.mediaStarts, 1); assert.equal(f.mediaStops, 0);
        assert.equal(f.mediaConnections.at(-1), true);
        for (let index = 0; index < 10; index++) await f.advance(5000);
        assert.equal(f.sockets.length, 2, 'acknowledged heartbeat does not create reconnect churn');
        f.cleanup();
    }
});

it('a replaced tab releases its devices and never steals recovery ownership back', async t => {
    const row = makeLesson({ status: 'active', startAt: new Date(initialNow - 60000).toISOString() });
    const f = await fixture(t, { lessons: [row], resumeLessonId: row._id }); await f.advance();
    const before = f.requests.length;
    f.sockets[0].deliver({ type: 'error', code: 'REPLACED', message: '另一页面继续上课' });
    assert.equal(f.mediaStops, 1); assert(f.hint, 'the old tab does not erase shared recovery details');
    f.window.dispatchEvent(new f.window.Event('online')); await f.refresh(); await f.advance(60000);
    assert.equal(f.requests.length, before, 'visibility, online and polling do not reclaim the new owner');
    assert.equal(f.mediaStarts, 1);
});

it('REST ownership replacement also gives way and a cached document restores only the same authenticated account', async t => {
    const row = makeLesson({ status: 'active', startAt: new Date(initialNow - 60000).toISOString() });
    const replaced = await fixture(t, { lessons: [row], resumeResponse: { code: 'REPLACED', error: 'REPLACED' }, resumeStatus: 409 });
    const requests = replaced.requests.length;
    replaced.window.dispatchEvent(new replaced.window.Event('online')); await replaced.advance(120000);
    assert.equal(replaced.requests.length, requests); assert.equal(replaced.mediaStarts, 0);
    replaced.cleanup();
    const wrongAccount = await fixture(t, { lessons: [row], resumeResponse: { uid: 5, lesson: row,
        apiUrl: '/d/C0001/lesson', socketUrl: '/d/C0001/lesson/conn' } });
    assert.equal(wrongAccount.requests.find(item => item.url.endsWith('/resume')).body.expectedUid, 2);
    assert.equal(wrongAccount.mediaStarts, 0); assert.equal(wrongAccount.mediaDisposes, 1);
});

it('back-forward cache restores the classroom without ending the existing sharing session or clearing editor content', async t => {
    const row = makeLesson({ status: 'active', studentJoined: true, startAt: new Date(initialNow - 60000).toISOString() });
    const f = await fixture(t, { lessons: [row], resumeLessonId: row._id, peerOnline: true }); await f.advance();
    const editor = f.document.createElement('textarea'); editor.value = 'unsaved lesson code'; f.document.body.append(editor);
    f.window.dispatchEvent(new f.window.Event('pagehide'));
    assert.equal(f.mediaDisposes, 1);
    assert.equal(f.shareEvents.some(event => event.type.endsWith('share-stop')), false);
    f.window.dispatchEvent(new f.window.PageTransitionEvent('pageshow', { persisted: true })); await settle(); await f.advance();
    assert.equal(f.mediaStarts, 2); assert.equal(editor.value, 'unsaved lesson code');
    assert.equal(f.desktopReservations.length, 0);
    assert.equal(f.requests.filter(item => item.url.endsWith('/resume')).length, 2);
    f.window.dispatchEvent(new f.window.Event('onebyone:session-ended'));
});

it('offline end and leave are replayed before any recovery after a full reload, using their original owner identity', async t => {
  for (const operation of ['end', 'leave']) {
    const f = await fixture(t);
    await f.click('[data-lesson-open]'); await f.click('[data-lesson-student="5"]'); await f.click('[data-lesson-create]'); await f.advance();
    f.options.offline = true;
    f.document.querySelector(operation === 'end' ? '.lesson-session .is-danger' : '.lesson-session .lesson-button').click(); await settle();
    const savedHint = f.hint;
    assert.equal(savedHint.pending, operation); assert.equal(f.mediaStops, 1);
    const lesson = structuredClone(f.rows[0]); f.cleanup();
    const restored = await fixture(t, { lessons: [lesson], resumeLessonId: lesson._id, savedHint });
    const ending = restored.requests.find(item => item.body?.operation === operation);
    assert.equal(ending.body.tabId, savedHint.tabId);
    assert.equal(restored.requests.some(item => item.url.endsWith('/resume')), false);
    assert.equal(restored.mediaStarts, 0); assert.equal(restored.desktopReservations.length, 0); assert.equal(restored.hint, null);
  }
});

it('a failed storage write cannot turn an offline ending back into automatic camera recovery in the same page', async t => {
    const f = await fixture(t);
    await f.click('[data-lesson-open]'); await f.click('[data-lesson-student="5"]'); await f.click('[data-lesson-create]'); await f.advance();
    const prototype = Object.getPrototypeOf(f.window.localStorage); const setItem = prototype.setItem;
    prototype.setItem = () => { throw new Error('quota exceeded'); };
    f.options.offline = true; f.document.querySelector('.lesson-session .is-danger').click(); await settle();
    assert.equal(f.hint.pending, undefined, 'the old storage snapshot is intentionally stale');
    const resumes = f.requests.filter(item => item.url.endsWith('/resume')).length;
    prototype.setItem = setItem; f.options.offline = false;
    f.window.dispatchEvent(new f.window.Event('online')); await f.advance();
    assert.equal(f.requests.filter(item => item.url.endsWith('/resume')).length, resumes);
    assert(f.requests.filter(item => item.body?.operation === 'end').length >= 2);
    assert.equal(f.mediaStarts, 1); assert.equal(f.mediaStops, 1);
});

it('late recovery and late end responses cannot replace a newer lesson or erase its pending end action', async t => {
    const old = makeLesson({ status: 'active', startAt: new Date(initialNow - 60000).toISOString() });
    const f = await fixture(t, { holdResume: true, lessons: [old] });
    await f.click('[data-lesson-open]'); await f.click('[data-lesson-student="7"]'); await f.click('[data-lesson-create]'); await f.advance();
    f.releaseResume({ lesson: old, apiUrl: '/d/C0001/lesson', socketUrl: '/d/C0001/lesson/conn' }); await settle();
    assert.equal(f.mediaStarts, 1); assert.equal(f.mediaStartArgs[0].lesson._id, 'lesson-created-abcdefghijkl');
    f.options.holdExit = true; f.document.querySelector('.lesson-session .is-danger').click(); await settle();
    const newer = { ...f.hint, lessonId: 'a-newer-lesson-record', pending: 'end' };
    f.window.localStorage.setItem('onebyone.lesson.recovery:2', JSON.stringify(newer));
    f.releaseExit({ lesson: { ...f.rows.at(-1), status: 'ended' } }); await settle();
    assert.deepEqual(f.hint, newer);
});

it('a stale initial recovery reply is retried after an overlapping explicit join fails', async t => {
    const row = makeLesson({ status: 'active', startAt: new Date(initialNow - 60000).toISOString() });
    const f = await fixture(t, { lessons: [row], resumeLessonId: row._id, holdResume: true,
        mutationResponse: { code: 'BUSY', error: 'BUSY' }, mutationStatus: 409 });
    await f.click('[data-lesson-home] [data-lesson-join]');
    assert.equal(f.mediaStarts, 0);
    f.options.holdResume = false;
    f.releaseResume({ uid: 2, lesson: row, apiUrl: '/d/C0001/lesson', socketUrl: '/d/C0001/lesson/conn' }); await settle();
    await f.advance(20000); await f.advance();
    assert.equal(f.mediaStarts, 1); assert.equal(f.mediaConnections.at(-1), true);
    assert(f.requests.filter(item => item.url.endsWith('/resume')).length >= 2);
});

it('invalid recovery URLs are never fetched and an authoritative no-lesson reply ends a disconnected class', async t => {
    const row = makeLesson({ status: 'active', startAt: new Date(initialNow - 60000).toISOString() });
    const invalid = await fixture(t, { lessons: [row], resumeResponse: { lesson: row, apiUrl: 'https://foreign.test/lesson', socketUrl: 'https://foreign.test/lesson/conn' } });
    assert.equal(invalid.mediaStarts, 0); assert.equal(invalid.requests.some(item => String(item.url).includes('foreign')), false);
    invalid.cleanup();
    const f = await fixture(t, { lessons: [row], resumeLessonId: row._id }); await f.advance();
    f.accepted.clear(); f.sockets[0].onclose({}); await f.advance(20000);
    assert.equal(f.mediaStops, 1); assert.equal(f.document.querySelector('.lesson-session').hidden, true);
});

it('a scheduled lesson becomes a centered reminder at its time but captures only after the learner clicks', async t => {
    const f = await fixture(t, { student: true, lessons: [makeLesson()] });
    const reminder = f.document.querySelector('.lesson-reminder');
    assert.equal(reminder.open, false); assert.equal(f.mediaStarts, 0);
    assert.equal(f.document.querySelector('[data-lesson-home] [data-lesson-join]').disabled, true);
    await f.advance(11 * 60000);
    assert.equal(reminder.open, true); assert.match(reminder.textContent, /上课时间到了/);
    assert.equal(f.mediaStarts, 0); assert.equal(f.sockets.length, 0);
    assert.equal(f.desktopReservations.length, 0, 'a due reminder alone never opens a desktop window');
    await f.click('[data-lesson-reminder-join]'); await f.advance();
    assert.equal(f.mediaStarts, 1); assert.equal(f.sockets.length, 1); assert.equal(reminder.open, false);
    assert(f.messages.some(item => item.type === 'join'));
    assert(f.mediaConnections.includes(true));
    assert.deepEqual(f.desktopEvents.slice(0, 3), ['prepare', 'request:join', 'start']);
    assert.equal(f.mediaStartArgs[0].reservation, f.desktopReservations[0]);
    assert.equal(f.desktopReservations[0].cancelled, false);
});

it('immediate teaching reserves desktop floating in the click before the REST request and transfers that exact window', async t => {
    const f = await fixture(t);
    assert.equal(f.desktopReservations.length, 0);
    await f.click('[data-lesson-open]'); await f.click('[data-lesson-student="5"]');
    await f.click('[data-lesson-create]'); await f.advance();
    assert.deepEqual(f.desktopEvents.slice(0, 3), ['prepare', 'request:create', 'start']);
    assert.equal(f.desktopReservations.length, 1);
    assert.equal(f.mediaStartArgs[0].reservation, f.desktopReservations[0]);
    assert.equal(f.desktopReservations[0].cancelled, false);
});

it('the homepage join entry also reserves desktop floating before joining', async t => {
    const f = await fixture(t, { lessons: [makeLesson()] });
    await f.click('[data-lesson-home] [data-lesson-join]');
    assert.deepEqual(f.desktopEvents.slice(0, 3), ['prepare', 'request:join', 'start']);
    assert.equal(f.mediaStartArgs[0].reservation, f.desktopReservations[0]);
});

it('failed and malformed entry replies close their reserved desktop window without starting media', async t => {
    for (const operation of ['join', 'create']) {
        for (const reply of [{ mutationResponse: { error: 'FORBIDDEN', message: '没有课堂权限' }, mutationStatus: 403 },
            { mutationResponse: {} }]) {
            const f = await fixture(t, { ...reply, lessons: [makeLesson()] });
            if (operation === 'join') await f.click('[data-lesson-home] [data-lesson-join]');
            else {
                await f.click('[data-lesson-open]'); await f.click('[data-lesson-student="5"]'); await f.click('[data-lesson-create]');
            }
            assert.equal(f.desktopReservations.length, 1);
            assert.equal(f.desktopReservations[0].cancelled, true, `${operation} must release a failed reservation`);
            assert.equal(f.mediaStarts, 0); assert.equal(f.sockets.length, 0);
            assert.deepEqual(f.desktopEvents.slice(0, 3), ['prepare', `request:${operation}`, 'cancel']);
            f.cleanup();
        }
    }
});

it('ending the session closes a pending entry window immediately and a late reply cannot start devices', async t => {
    for (const operation of ['join', 'create']) {
        const f = await fixture(t, { holdMutation: true, lessons: [makeLesson()] });
        if (operation === 'join') await f.click('[data-lesson-home] [data-lesson-join]');
        else {
            await f.click('[data-lesson-open]'); await f.click('[data-lesson-student="5"]'); await f.click('[data-lesson-create]');
        }
        assert.equal(f.mediaStarts, 0); assert.equal(f.desktopReservations[0].cancelled, false);
        f.window.dispatchEvent(new f.window.Event('onebyone:session-ended'));
        assert.equal(f.desktopReservations[0].cancelled, true, 'disposal does not wait for the network reply');
        f.releaseMutation({ lesson: makeLesson({ status: 'active', teacherJoined: true }) }); await settle();
        assert.equal(f.mediaStarts, 0); assert.equal(f.sockets.length, 0);
    }
});

it('a teacher joining a future booking early never prompts the learner before the booked start', async t => {
    const f = await fixture(t, { student: true, lessons: [makeLesson({ status: 'active', teacherJoined: true })] });
    assert.equal(f.document.querySelector('.lesson-reminder').open, false);
    assert.equal(f.document.querySelector('[data-lesson-home] [data-lesson-join]').disabled, true);
    assert.equal(f.mediaStarts, 0); assert.equal(f.exports.lessonIsDue(f.rows[0], initialNow), false);
    await f.advance(10 * 60000);
    assert.equal(f.document.querySelector('.lesson-reminder').open, true);
    assert.equal(f.document.querySelector('[data-lesson-home] [data-lesson-join]').disabled, false);
    assert.equal(f.mediaStarts, 0);
});

it('an invitation available on login stays opt-in and can be snoozed before opening the camera', async t => {
    const f = await fixture(t, { student: true, lessons: [makeLesson({ status: 'active', teacherJoined: true,
        startAt: new Date(initialNow - 60000).toISOString() })] });
    const reminder = f.document.querySelector('.lesson-reminder');
    assert.equal(reminder.open, true); assert.match(reminder.textContent, /老师邀请你上课/);
    assert.equal(f.mediaStarts, 0);
    f.document.querySelector('.lesson-reminder__actions button').click(); await settle();
    assert.equal(reminder.open, false); await f.refresh();
    assert.equal(reminder.open, false); assert.equal(f.mediaStarts, 0);
    await f.advance(5 * 60000); assert.equal(reminder.open, true);
});

it('sharing waits for the invited learner, switches both directions without media restarts, and retains annotations during peer loss', async t => {
    const f = await fixture(t);
    await f.click('[data-lesson-open]'); await f.click('[data-lesson-student="5"]'); await f.click('[data-lesson-create]'); await f.advance();
    assert.equal(f.mediaStarts, 1); assert.equal(f.shareEvents.length, 0);
    const socket = f.sockets[0];
    f.rows[0].studentJoined = true; socket.deliver({ type: 'lesson', lesson: f.rows[0] }); socket.deliver({ type: 'peer', online: true });
    assert.equal(f.shareEvents.at(-1).detail.mode, 'broadcast');
    const [broadcast, assist] = f.document.querySelectorAll('.lesson-mode-button');
    assist.click(); await settle();
    assert.equal(f.shareEvents.at(-1).detail.mode, 'assist');
    await f.refresh();
    assert.equal(assist.getAttribute('aria-pressed'), 'true');
    assert.equal(f.shareEvents.filter(event => event.type.endsWith('share-start')).length, 2, 'polling never switches the chosen mode');
    broadcast.click(); await settle(); assert.equal(f.shareEvents.at(-1).detail.mode, 'broadcast');
    assert.equal(f.mediaStarts, 1); assert.equal(f.mediaStops, 0);
    socket.deliver({ type: 'peer', online: false });
    assert.equal(f.shareEvents.filter(event => event.type.endsWith('share-stop')).length, 0);
    assert.equal(f.mediaStops, 0); assert.deepEqual(JSON.parse(JSON.stringify(f.mediaReceives.at(-1))), { type: 'peer', online: false });
    await f.advance(5000); assert.deepEqual(f.messages.at(-1), { type: 'pulse' });
    f.document.querySelector('.lesson-session .is-danger').click(); await settle();
    assert(f.requests.some(item => item.body?.operation === 'end'));
    assert.equal(f.mediaStops, 1); assert.equal(f.document.querySelector('.lesson-session').hidden, true);
});

it('active media survives navigation and leave uses its original classroom before adopting the next scope', async t => {
    const f = await fixture(t, { peerOnline: true, lessons: [makeLesson({ status: 'active', teacherJoined: true,
        studentJoined: true, startAt: new Date(initialNow - 60000).toISOString() }),
    makeLesson({ _id: 'lesson-next-classroom', domainId: 'C0002', title: '下一课堂课程' })] });
    await f.click('[data-lesson-home] [data-lesson-join]'); await f.advance();
    const next = await f.navigate();
    assert.equal(f.mediaStarts, 1); assert.equal(f.mediaStops, 0); assert.equal(f.sockets.length, 1);
    assert.equal(f.requests.some(item => item.url.startsWith('/d/C0002')), false);
    f.document.querySelector('.lesson-session .lesson-button').click(); await settle(); await f.advance();
    assert.equal(f.requests.find(item => item.body?.operation === 'leave').url, '/d/C0001/lesson');
    assert(f.requests.some(item => item.url === '/d/C0002/lesson'));
    assert.match(next.document.querySelector('[data-lesson-home]').textContent, /下一课堂课程/);
    assert.equal(f.mediaStarts, 1); assert.equal(f.mediaStops, 1);
    f.window.dispatchEvent(new f.window.Event('onebyone:session-ended'));
    assert.equal(f.document.querySelector('.lesson-picker'), null); assert.equal(next.document.querySelector('[data-lesson-home]'), null);
    assert.equal(f.mediaDisposes, 1);
});

it('cancelled lessons disappear, stale responses cannot restore the previous classroom, and calendar dates are validated', async t => {
    const f = await fixture(t, { lessons: [makeLesson(), makeLesson({ _id: 'lesson-next-classroom', domainId: 'C0002', title: '下一课堂课程' })] });
    await f.click('[data-lesson-home] [data-lesson-cancel]');
    assert.equal(f.document.querySelector('[data-lesson-home]'), null); assert.equal(f.mediaStarts, 0);
    f.rows[0].status = 'scheduled';
    f.holdNextRead(); await f.refresh();
    const next = await f.navigate(); f.releaseRead(); await settle(); await f.advance();
    assert.match(next.document.querySelector('[data-lesson-home]').textContent, /下一课堂课程/);
    assert.doesNotMatch(next.document.querySelector('[data-lesson-home]').textContent, /Python 一对一/);
    for (const value of ['2026-02-30T12:00', '2026-11-15T25:00', 'not a date']) assert.throws(() => f.exports.lessonStartIso(value));
    assert.equal(f.exports.lessonStartIso('2026-11-16T19:30'), '2026-11-16T11:30:00.000Z');
});

it('the planned end time does not interrupt an active class and the teacher camera control ends the lesson', async t => {
    const f = await fixture(t, { peerOnline: true, lessons: [makeLesson({ status: 'active', teacherJoined: true,
        studentJoined: true, startAt: new Date(initialNow - 60000).toISOString() })] });
    await f.click('[data-lesson-home] [data-lesson-join]'); await f.advance();
    await f.advance(80 * 60000); await f.refresh();
    assert.equal(f.mediaStops, 0); assert.equal(f.document.querySelector('.lesson-session').hidden, false);
    assert(f.document.querySelector('[data-lesson-home]'), 'the active class remains reachable after its planned end');
    f.leaveMedia(); await settle();
    assert(f.requests.some(item => item.body?.operation === 'end'));
    assert.equal(f.mediaStops, 1);
});

it('a GET captured before joining cannot undo the accepted membership; later valid polls still apply', async t => {
    const f = await fixture(t, { student: true, peerOnline: true, lessons: [makeLesson({ status: 'active', teacherJoined: true,
        startAt: new Date(initialNow - 60000).toISOString() })] });
    f.holdNextRead(); await f.refresh();
    await f.click('[data-lesson-reminder-join]'); await f.advance();
    assert.equal(f.mediaStarts, 1); assert.equal(f.mediaStops, 0);
    f.releaseRead(); await settle();
    assert.equal(f.mediaStops, 0); assert.equal(f.document.querySelector('.lesson-session').hidden, false);
    await f.advance();
    assert.equal(f.mediaStops, 0, 'a fresh poll sees the accepted server membership');
    f.rows[0].studentJoined = false; await f.refresh();
    assert.equal(f.mediaStops, 0, 'an expired online lease is not a lesson ending');
    f.rows[0].status = 'ended'; await f.refresh();
    assert.equal(f.mediaStops, 1, 'an authoritative server ending must still stop an active lesson');
});

it('a GET captured before immediate creation cannot replace the newly joined lesson with an empty list', async t => {
    const f = await fixture(t);
    await f.click('[data-lesson-open]'); await f.click('[data-lesson-student="5"]');
    f.holdNextRead(); await f.refresh();
    await f.click('[data-lesson-create]'); await f.advance();
    assert.equal(f.mediaStarts, 1); assert.equal(f.mediaStops, 0);
    f.releaseRead(); await settle();
    assert.equal(f.mediaStops, 0); assert.equal(f.document.querySelector('.lesson-session').hidden, false);
    await f.advance(); assert.equal(f.mediaStops, 0);
    assert.match(f.document.querySelector('[data-lesson-home]').textContent, /一对一课堂/);
});

it('a delayed pre-cancellation GET never revives the cancelled booking or its join button', async t => {
    const f = await fixture(t, { lessons: [makeLesson()] });
    f.holdNextRead(); await f.refresh();
    await f.click('[data-lesson-home] [data-lesson-cancel]');
    assert.equal(f.document.querySelector('[data-lesson-home]'), null);
    f.releaseRead(); await settle();
    assert.equal(f.document.querySelector('[data-lesson-home]'), null);
    assert.equal(f.document.querySelector('.lesson-reminder').open, false);
    await f.advance();
    assert.equal(f.document.querySelector('[data-lesson-home]'), null); assert.equal(f.mediaStarts, 0);
});

it('socket membership updates supersede in-flight list snapshots without suppressing future lists', async t => {
    const f = await fixture(t, { peerOnline: true, lessons: [makeLesson({ status: 'active', teacherJoined: true,
        studentJoined: true, startAt: new Date(initialNow - 60000).toISOString() })] });
    await f.click('[data-lesson-home] [data-lesson-join]'); await f.advance();
    f.holdNextRead(); await f.refresh();
    f.rows[0].studentJoined = false;
    f.sockets[0].deliver({ type: 'lesson', lesson: f.rows[0] });
    assert.equal(f.shareEvents.filter(event => event.type.endsWith('share-stop')).length, 0);
    const events = f.shareEvents.length;
    f.releaseRead(); await settle();
    assert.equal(f.shareEvents.length, events, 'an old joined snapshot must not restart sharing');
    await f.advance();
    assert.equal(f.shareEvents.length, events); assert.equal(f.mediaStops, 0);
});

it('lesson styling compiles with the camera panel and keeps responsive sizing as CSS expressions', () => {
    const file = path.join(__dirname, '../packages/ui-default/components/lesson.page.styl');
    const css = stylus.render(fs.readFileSync(file, 'utf8'), { filename: file });
    assert.match(css, /width: min\(620px, calc\(100vw - 32px\)\)/);
    assert.match(css, /\.lesson-media/);
});

it('the teacher can find every unfinished historical lesson and see ended and cancelled records below the arranged list', async t => {
    const old = Array.from({ length: 24 }, (_, index) => makeLesson({ _id: `old-unfinished-${String(index).padStart(3, '0')}`, status: 'active',
        title: `旧课 ${index + 1}`, startAt: new Date(initialNow - (index + 3) * 86400000).toISOString(), endAt: new Date(initialNow - (index + 2) * 86400000).toISOString() }));
    const closed = makeLesson({ _id: 'ended-course-record', status: 'ended', title: '已结束的递归课', startAt: new Date(initialNow - 86400000).toISOString() });
    const cancelled = makeLesson({ _id: 'cancelled-course-record', status: 'cancelled', title: '已取消的预约课' });
    const f = await fixture(t, { lessons: [makeLesson()], history: [...old, closed, cancelled], historyHasMore: true });
    await f.click('[data-lesson-open]');
    const section = f.document.querySelector('[data-lesson-history]');
    assert.match(section.textContent, /历史课程/); assert.match(section.textContent, /已结束/); assert.match(section.textContent, /已取消/);
    assert.match(section.textContent, /老师尚未下课/); assert.match(section.textContent, /课堂 C0001/);
    assert.equal(section.querySelectorAll('[data-lesson-end]').length, old.length, 'unfinished records have no twenty-row cutoff');
    assert.equal(section.querySelectorAll('[data-lesson-history-id="ended-course-record"] button').length, 0);
    assert.equal(section.querySelectorAll('[data-lesson-history-id="cancelled-course-record"] button').length, 0);
    assert.equal(f.document.querySelector('.lesson-picker__scheduled').nextElementSibling, section);
    assert.match(f.document.querySelector('.lesson-history-note').textContent, /未结束课程全部显示/);
});

it('ending an old lesson in its original classroom does not stop a different current class or erase its recovery details', async t => {
    const current = makeLesson({ status: 'active', teacherJoined: true, studentJoined: true, title: '正在上的新课', startAt: new Date(initialNow - 60000).toISOString() });
    const old = makeLesson({ _id: 'old-cross-domain-class', domainId: 'C0002', status: 'active', title: '另一个课堂旧课',
        startAt: new Date(initialNow - 3 * 86400000).toISOString(), endAt: new Date(initialNow - 2 * 86400000).toISOString() });
    const f = await fixture(t, { lessons: [current], history: [old], resumeLessonId: current._id, peerOnline: true }); await f.advance();
    const hint = structuredClone(f.hint); const stops = f.mediaStops; const sharing = f.shareEvents.length;
    await f.click('[data-lesson-open]');
    assert.equal(f.document.querySelector('.lesson-picker').open, true, 'history remains accessible while teaching');
    await f.click('[data-lesson-end="old-cross-domain-class"]');
    assert.equal(f.requests.find(item => item.body?.operation === 'end').url, '/d/C0002/lesson');
    assert.equal(f.mediaStops, stops); assert.equal(f.mediaStarts, 1); assert.deepEqual(f.hint, hint);
    assert.equal(f.shareEvents.length, sharing); assert.equal(f.document.querySelector('.lesson-session').hidden, false);
    assert.match(f.document.querySelector('[data-lesson-history-id="old-cross-domain-class"]').textContent, /已结束/);
    assert.equal(f.document.querySelector('[data-lesson-end="old-cross-domain-class"]'), null);
});

it('an unfinished cross-domain historical lesson can be continued through its own join and socket routes', async t => {
    const old = makeLesson({ _id: 'old-lesson-to-continue', domainId: 'C0002', status: 'active', title: '未结束的旧课堂',
        startAt: new Date(initialNow - 3 * 86400000).toISOString(), endAt: new Date(initialNow - 2 * 86400000).toISOString() });
    const f = await fixture(t, { history: [old] });
    await f.click('[data-lesson-open]');
    await f.click('[data-lesson-history-id="old-lesson-to-continue"] [data-lesson-join]'); await f.advance();
    assert.equal(f.requests.find(item => item.body?.operation === 'join').url, '/d/C0002/lesson');
    assert.equal(f.sockets[0].url, 'wss://onebyone.test/d/C0002/lesson/conn');
    assert.equal(f.mediaStarts, 1); assert.equal(f.mediaStartArgs[0].lesson._id, old._id);
});

it('a failed historical end remains visible and retryable, and a stale list cannot revive a confirmed ending', async t => {
    const old = makeLesson({ _id: 'old-lesson-end-retry', status: 'active', title: '需要清理的旧课',
        startAt: new Date(initialNow - 3 * 86400000).toISOString(), endAt: new Date(initialNow - 2 * 86400000).toISOString() });
    const f = await fixture(t, { history: [old] });
    await f.click('[data-lesson-open]'); f.options.offline = true;
    await f.click('[data-lesson-end="old-lesson-end-retry"]');
    assert.match(f.document.querySelector('[data-lesson-history] .lesson-error').textContent, /未能结束/);
    assert.equal(f.document.querySelector('[data-lesson-end="old-lesson-end-retry"]').disabled, false);
    f.options.offline = false; f.holdNextRead(); await f.refresh();
    await f.click('[data-lesson-end="old-lesson-end-retry"]');
    f.releaseRead(); await settle();
    assert.equal(f.document.querySelector('[data-lesson-end="old-lesson-end-retry"]'), null);
    assert.match(f.document.querySelector('[data-lesson-history-id="old-lesson-end-retry"]').textContent, /已结束/);
    assert.equal(f.mediaStarts, 0); assert.equal(f.hint, null);
});

it('learners have no historical ending controls and foreign historical action URLs stay disabled', async t => {
    const old = makeLesson({ _id: 'old-hidden-teacher-controls', status: 'active', startAt: new Date(initialNow - 86400000).toISOString() });
    const learner = await fixture(t, { student: true, history: [old] });
    assert.equal(learner.document.querySelector('[data-lesson-history]').hidden, true);
    assert.equal(learner.document.querySelector('[data-lesson-end]'), null); learner.cleanup();
    const f = await fixture(t, { history: [old], historyApiUrls: { [old._id]: 'https://foreign.test/lesson' } });
    await f.click('[data-lesson-open]');
    assert.equal(f.document.querySelector(`[data-lesson-end="${old._id}"]`).disabled, true);
    assert.equal(f.requests.some(item => String(item.url).includes('foreign')), false);
});

it('teachers and learners can cancel every explicit classroom exit before any state or request changes', async t => {
    for (const action of ['teacher-end', 'teacher-leave', 'teacher-media', 'student-leave', 'student-media']) {
        const row = makeLesson({ status: 'active', teacherJoined: true, studentJoined: true, startAt: new Date(initialNow - 60000).toISOString() });
        const f = await fixture(t, { student: action.startsWith('student'), lessons: [row], resumeLessonId: row._id, peerOnline: true, confirmExit: false });
        await f.advance();
        const hint = structuredClone(f.hint); const requests = f.requests.length; const sharing = f.shareEvents.length;
        if (action.endsWith('media')) f.leaveMedia();
        else f.document.querySelector(action.endsWith('end') ? '.lesson-session .is-danger' : '.lesson-session .lesson-button').click();
        await settle();
        assert.equal(f.confirmations.length, 1, action);
        assert.equal(f.requests.length, requests, `${action}: cancellation sends no request`);
        assert.equal(f.mediaStops, 0, `${action}: camera continues`);
        assert.equal(f.shareEvents.length, sharing, `${action}: sharing continues`);
        assert.deepEqual(f.hint, hint, `${action}: no pending exit is written`);
        assert.equal(f.document.querySelector('.lesson-session').hidden, false);
        f.cleanup();
    }
});

it('an old historical course ending requires confirmation and cannot affect a different current class when cancelled', async t => {
    const row = makeLesson({ status: 'active', teacherJoined: true, studentJoined: true, startAt: new Date(initialNow - 60000).toISOString() });
    const old = makeLesson({ _id: 'old-confirm-before-ending', domainId: 'C0002', status: 'active', title: '确认要结束的旧课', startAt: new Date(initialNow - 86400000).toISOString() });
    const f = await fixture(t, { lessons: [row], history: [old], resumeLessonId: row._id, peerOnline: true, confirmExit: false }); await f.advance();
    await f.click('[data-lesson-open]'); const hint = structuredClone(f.hint); const before = f.requests.length;
    await f.click('[data-lesson-end="old-confirm-before-ending"]');
    assert.match(f.confirmations[0], /确认要结束的旧课/);
    assert.equal(f.requests.length, before); assert.equal(f.mediaStops, 0); assert.deepEqual(f.hint, hint);
    assert(f.document.querySelector('[data-lesson-end="old-confirm-before-ending"]'));
    f.options.confirmExit = true; await f.click('[data-lesson-end="old-confirm-before-ending"]');
    assert.equal(f.requests.find(item => item.body?.operation === 'end').url, '/d/C0002/lesson');
    assert.equal(f.mediaStops, 0); assert.deepEqual(f.hint, hint);
});

it('account exit guards run before mutations and the native unload allowance is once-only and reset on failure', async t => {
    const row = makeLesson({ status: 'active', startAt: new Date(initialNow - 60000).toISOString() });
    const f = await fixture(t, { lessons: [row], resumeLessonId: row._id, confirmExit: false }); await f.advance();
    const hint = structuredClone(f.hint); const before = f.requests.length;
    const denied = new f.window.CustomEvent('onebyone:lesson-before-exit', { cancelable: true, detail: { reason: 'logout' } });
    assert.equal(f.window.dispatchEvent(denied), false); assert.equal(denied.defaultPrevented, true);
    const reload = new f.window.Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(reload);
    assert.equal(reload.defaultPrevented, true); assert.equal(f.requests.length, before); assert.deepEqual(f.hint, hint); assert.equal(f.mediaStops, 0);
    f.options.confirmExit = true;
    const approved = new f.window.CustomEvent('onebyone:lesson-before-exit', { cancelable: true, detail: { reason: 'switch-account' } });
    assert.equal(f.window.dispatchEvent(approved), true);
    const first = new f.window.Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(first); assert.equal(first.defaultPrevented, false);
    const second = new f.window.Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(second); assert.equal(second.defaultPrevented, true);
    f.window.dispatchEvent(new f.window.CustomEvent('onebyone:lesson-before-exit', { cancelable: true, detail: { reason: 'logout' } }));
    f.window.dispatchEvent(new f.window.Event('onebyone:lesson-exit-failed'));
    const failed = new f.window.Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(failed); assert.equal(failed.defaultPrevented, true);
    const passwordForm = f.document.createElement('form'); passwordForm.dataset.profilePasswordForm = ''; f.document.body.append(passwordForm);
    const submit = new f.window.Event('submit', { bubbles: true, cancelable: true }); passwordForm.dispatchEvent(submit);
    assert.equal(submit.defaultPrevented, false, 'confirming the form allows its own validation and request');
    const laterReload = new f.window.Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(laterReload);
    assert.equal(laterReload.defaultPrevented, true, 'form confirmation never grants an unrelated refresh a bypass window');
    f.sockets[0].deliver({ type: 'ended', lessonId: row._id });
    const ended = new f.window.Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(ended); assert.equal(ended.defaultPrevented, false);
});

it('plain logout links and session-ending forms are guarded in both host and content documents without blocking normal saves', async t => {
    const row = makeLesson({ status: 'active', startAt: new Date(initialNow - 60000).toISOString() });
    const f = await fixture(t, { lessons: [row], resumeLessonId: row._id, confirmExit: false }); await f.advance();
    const content = await f.navigate();
    for (const doc of [f.document, content.document]) {
        const win = doc.defaultView;
        for (const path of ['/logout', '/account/5']) {
            const link = doc.createElement('a'); link.href = path; doc.body.append(link);
            const event = new win.MouseEvent('click', { bubbles: true, cancelable: true }); link.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
        }
        for (const operation of ['delete_all_tokens', 'change_password']) {
            const form = doc.createElement('form'); const field = doc.createElement('input'); field.name = 'operation'; field.value = operation; form.append(field); doc.body.append(form);
            const event = new win.Event('submit', { bubbles: true, cancelable: true }); form.dispatchEvent(event); assert.equal(event.defaultPrevented, true);
        }
        const password = doc.createElement('form'); password.dataset.profilePasswordForm = ''; doc.body.append(password);
        const change = new win.Event('submit', { bubbles: true, cancelable: true }); password.dispatchEvent(change); assert.equal(change.defaultPrevented, true);
        const save = doc.createElement('form'); const field = doc.createElement('input'); field.name = 'operation'; field.value = 'delete_token'; save.append(field); doc.body.append(save);
        const unaffected = new win.Event('submit', { bubbles: true, cancelable: true }); save.dispatchEvent(unaffected); assert.equal(unaffected.defaultPrevented, false);
    }
    assert.equal(f.confirmations.length, 10); assert.equal(f.mediaStops, 0);
});

it('expired never-started bookings can be ended but are not offered as resumable active lessons', async t => {
    const old = makeLesson({ _id: 'expired-unstarted-booking', status: 'scheduled', startAt: new Date(initialNow - 5 * 86400000).toISOString(), endAt: new Date(initialNow - 4 * 86400000).toISOString() });
    const f = await fixture(t, { history: [old] }); await f.click('[data-lesson-open]');
    const row = f.document.querySelector('[data-lesson-history-id="expired-unstarted-booking"]');
    assert.equal(row.querySelector('[data-lesson-join]').disabled, true); assert.match(row.textContent, /预约已过期/);
    assert.equal(row.querySelector('[data-lesson-end]').disabled, false);
    await f.click('[data-lesson-end="expired-unstarted-booking"]');
    assert(f.requests.some(item => item.body?.operation === 'end')); assert.equal(f.mediaStarts, 0);
});
