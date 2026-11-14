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
    let clockNow = options.now ?? initialNow;
    let timerId = 0;
    const timers = new Map(); const intervals = new Map(); const frames = [];
    window.setTimeout = (callback, delay = 0) => { const id = ++timerId; timers.set(id, { callback, at: clockNow + delay }); return id; };
    window.clearTimeout = id => timers.delete(id);
    window.setInterval = (callback, delay) => { const id = ++timerId; intervals.set(id, { callback, delay, at: clockNow + delay }); return id; };
    window.clearInterval = id => intervals.delete(id);
    const uid = options.student ? 5 : 2;
    const rows = structuredClone(options.lessons || []);
    const requests = []; const messages = []; const shareEvents = []; const mediaReceives = []; const mediaConnections = [];
    const desktopEvents = []; const desktopReservations = []; const mediaStartArgs = [];
    let mediaStarts = 0; let mediaStops = 0; let mediaDisposes = 0; let mediaCallbacks;
    const sockets = [];
    let delayRead = false; let heldRead; let heldMutation;
    const roster = [{ uid: 5, name: '橙子', online: true }, { uid: 7, name: '睿睿', online: false }];
    const response = (data, status = 200) => ({ ok: status < 400, json: async () => structuredClone(data) });
    async function fakeFetch(url, init) {
        const body = init.body ? JSON.parse(init.body) : null; requests.push({ url, body });
        if (body) desktopEvents.push(`request:${body.operation}`);
        if (!body) {
            const data = structuredClone({ lessons: rows.filter(row => url.startsWith('/d/C0002') ? row.domainId === 'C0002' : row.domainId === 'C0001'), students: roster, serverNow: new Date(clockNow).toISOString() });
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
            rows.push(row); return response({ lesson: row });
        }
        const row = rows.find(item => item._id === body.lessonId);
        if (!row) return response({ error: 'NOT_FOUND', message: '没有这节课' }, 404);
        if (body.operation === 'join') { row.status = 'active'; row[uid === row.teacherUid ? 'teacherJoined' : 'studentJoined'] = true; }
        if (body.operation === 'leave') row[uid === row.teacherUid ? 'teacherJoined' : 'studentJoined'] = false;
        if (body.operation === 'cancel') row.status = 'cancelled';
        if (body.operation === 'end') row.status = 'ended';
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
                if (message.type === 'join') this.deliver({ type: 'ready', lesson: rows.find(row => row._id === message.lessonId), peerOnline: !!options.peerOnline }); },
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
    const config = { enabled: true, uid, canTeach: !options.student, apiUrl: '/d/C0001/lesson', socketUrl: '/d/C0001/lesson/conn' };
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
        desktopEvents, desktopReservations, mediaStartArgs, releaseMutation: data => heldMutation?.(data),
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

it('sharing waits for the invited learner, switches both directions without media restarts, and pauses when the peer leaves', async t => {
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
    assert.equal(f.shareEvents.at(-1).type, 'onebyone:lesson-share-stop');
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
    assert.equal(f.mediaStops, 1, 'a later server revocation must still stop an active lesson');
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
    assert.equal(f.shareEvents.at(-1).type, 'onebyone:lesson-share-stop');
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
