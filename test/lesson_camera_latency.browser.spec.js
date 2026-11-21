const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { it } = require('node:test');
const { buildSync } = require('esbuild');
const { WebSocketServer, WebSocket } = require('ws');
const { chromium, webkit } = require('playwright');

const classroom = { _id: 'lesson-camera-latency', domainId: 'class', workspaceId: 'workspace', teacherUid: 2, studentUid: 5,
    teacherName: '老师', studentName: '学员', title: '长连摄像头', startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 3600000).toISOString(), status: 'active', teacherJoined: true, studentJoined: true };
const client = buildSync({ entryPoints: [path.join(__dirname, '../packages/ui-default/components/lesson/controller.ts')],
    bundle: true, write: false, globalName: 'Lesson', format: 'iife' }).outputFiles[0].text;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t, options = {}) {
    const executablePath = [process.env.HERO_CHROMIUM_PATH, chromium.executablePath(),
        path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
        .find(value => value && fs.existsSync(value));
    assert(executablePath, 'Chromium is required to measure displayed camera frames');
    const room = { ...classroom };
    const actions = [];
    const unreachable = new Set();
    const httpServer = http.createServer(async (request, response) => {
        if (request.url === '/classroom.js') {
            response.setHeader('Content-Type', 'text/javascript'); response.end(client); return;
        }
        const uid = Number(request.url.split('/')[2]);
        const apiUrl = `/d/${uid}/lesson`; const socketUrl = `${apiUrl}/conn`;
        if (request.url.startsWith(apiUrl)) {
            if (unreachable.has(uid)) { request.socket.destroy(); return; }
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
            const membership = uid === room.teacherUid ? 'teacherJoined' : 'studentJoined';
            if (body.operation) actions.push({ uid, operation: body.operation, lessonId: body.lessonId });
            if (body.lessonId === room._id) {
                if (body.operation === 'leave') room[membership] = false;
                if (body.operation === 'join' && room.status === 'active') room[membership] = true;
                if (body.operation === 'end' && uid === room.teacherUid) {
                    room.status = 'ended'; room.studentJoined = false; room.teacherJoined = false;
                    for (const peer of peers.values()) send(peer, { type: 'ended', lessonId: room._id });
                }
            }
            const resumable = room.status === 'active' && room[membership];
            const scheduled = { ...room, apiUrl, socketUrl };
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ uid, apiUrl, socketUrl, lesson: request.url.endsWith('/resume') && !resumable ? null : scheduled,
                lessons: room.status === 'active' ? [scheduled] : [], students: [],
                canTeach: uid === 2, serverNow: new Date().toISOString() })); return;
        }
        response.setHeader('Content-Type', 'text/html');
        response.end(`<!doctype html><meta charset="utf-8"><main class="ui-v2-home"><div class="ui-v2-home__body"></div></main>
            <button id="start">Enter classroom</button><script src="/classroom.js"></script><script>
            const expectedImages = new Map(); window.displayed = []; window.audioPackets = 0; window.lastAudioAt = 0;
            window.audioPlayed = 0; window.lastPlayableAt = 0;
            window.AudioWorkletNode = class extends AudioWorkletNode {
                constructor(...args) {
                    super(...args);
                    if (args[1] !== 'onebyone-voice') return;
                    const post = this.port.postMessage.bind(this.port);
                    this.port.postMessage = (message, ...rest) => {
                        if (message.type === 'play') { window.audioPlayed++; window.lastPlayableAt = Date.now(); }
                        return post(message, ...rest);
                    };
                }
            };
            window.deviceTracks = [];
            window.screenCaptureTracks = []; window.audioArrivals = []; window.playedAudio = [];
            if (${!!options.complexScreen}) {
                const postMessage = MessagePort.prototype.postMessage;
                MessagePort.prototype.postMessage = function(message, ...args) {
                    if (message?.type === 'play' && message.bytes && audioArrivals.length)
                        playedAudio.push({ seq: audioArrivals.at(-1).seq, at: Date.now() });
                    return postMessage.call(this, message, ...args);
                };
            }
            if (${!!options.complexScreen}) navigator.mediaDevices.getDisplayMedia = async () => {
                const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
                const ctx = canvas.getContext('2d'); const texture = ctx.createImageData(680, 500);
                let seed = 91;
                for (let i = 0; i < texture.data.length; i += 4) {
                    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                    texture.data[i] = seed >>> 24; texture.data[i + 1] = (seed >>> 16) & 255;
                    texture.data[i + 2] = (seed >>> 8) & 255; texture.data[i + 3] = 255;
                }
                const stream = canvas.captureStream(8); const track = stream.getVideoTracks()[0];
                const originalSettings = track.getSettings.bind(track);
                track.getSettings = () => ({ ...originalSettings(), displaySurface: 'monitor' });
                screenCaptureTracks.push(track);
                function paint() {
                    if (track.readyState === 'ended') return;
                    ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, 0, 1280, 720);
                    ctx.putImageData(texture, 0, 40);
                    ctx.fillStyle = '#172554'; ctx.font = '18px monospace';
                    for (let i = 0; i < 26; i++) ctx.fillText('line ' + i + '   print(score)', 795, 50 + i * 24);
                    ctx.fillText('Shared lesson screen ' + Date.now(), 10, 27);
                    setTimeout(paint, 125);
                }
                paint(); return stream;
            };
            window.lifecycle = [];
            for (const event of ['freeze', 'resume', 'visibilitychange']) {
                document.addEventListener(event, () => lifecycle.push(event + '/' + document.visibilityState));
            }
            const getDevices = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async constraints => {
                const stream = await getDevices(constraints);
                deviceTracks.push(...stream.getTracks()); return stream;
            };
            if (!${!!options.desktopTeacher && uid === 2}) Object.defineProperty(window, 'documentPictureInPicture', { value: undefined });
            document.querySelector('#start').onclick = () => {
                if (${!!options.webkitUid}) {
                    // Exercise each engine's actual canvas/video and Web Audio graphs
                    // without opening the test machine's physical camera or microphone.
                    const tone = new AudioContext(); void tone.resume();
                    const oscillator = tone.createOscillator(); const mic = tone.createMediaStreamDestination();
                    oscillator.connect(mic); oscillator.start();
                    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
                    const ctx = canvas.getContext('2d');
                    const paint = () => { ctx.fillStyle = '#064e3b'; ctx.fillRect(0, 0, 320, 180);
                        ctx.fillStyle = 'white'; ctx.fillText(String(Date.now()), 15, 32); };
                    paint(); setInterval(paint, 100);
                    navigator.mediaDevices.getUserMedia = async constraints => {
                        const stream = constraints.audio ? mic.stream.clone() : canvas.captureStream(10);
                        deviceTracks.push(...stream.getTracks()); return stream;
                    };
                }
                Lesson.installLesson({ enabled: true, uid: ${uid}, canTeach: ${uid === 2}, apiUrl: '${apiUrl}', socketUrl: '${socketUrl}' }, {
                    socketFactory(url) {
                        const socket = new WebSocket(url);
                        socket.addEventListener('message', event => {
                            const m = JSON.parse(event.data);
                            if (m.type === 'video') {
                                expectedImages.set(m.data, m.seq);
                                if (expectedImages.size > 96) expectedImages.delete(expectedImages.keys().next().value);
                            }
                            if (m.type === 'audio') {
                                audioPackets++; window.lastAudioAt = Date.now();
                                if (${!!options.complexScreen}) audioArrivals.push({ seq: m.seq, at: lastAudioAt });
                            }
                        });
                        return socket;
                    }
                });
                const remote = document.querySelector('[data-lesson-remote-video]');
                remote.addEventListener('load', () => {
                    const seq = expectedImages.get(remote.currentSrc);
                    queueMicrotask(() => {
                        if (!remote.hidden && seq !== undefined) displayed.push({ seq, at: Date.now() });
                    });
                }, true);
            };
        </script>`);
    });
    const sockets = new WebSocketServer({ server: httpServer });
    const peers = new Map(); const timers = new Set(); const frames = new Map();
    let serial = 0; let nextArrival = 0;
    const link = { bytesPerMs: 0, pauseCamera: false, blocked: null, maxBacklogMs: 0, audioSent: { 2: 0, 5: 0 } };
    const screenFrames = []; const audioTimes = new Map();
    const send = (peer, packet) => { if (peer?.ws.readyState === WebSocket.OPEN) peer.ws.send(JSON.stringify(packet)); };
    sockets.on('connection', (ws, request) => {
        const uid = Number(request.url.split('/')[2]); const otherUid = uid === 2 ? 5 : 2;
        if (unreachable.has(uid)) { ws.terminate(); return; }
        const self = { ws, id: `socket-${++serial}` };
        ws.on('message', raw => {
            const message = JSON.parse(raw); const other = peers.get(otherUid);
            if (message.type === 'join') {
                if (room.status !== 'active' || !room[uid === room.teacherUid ? 'teacherJoined' : 'studentJoined']) {
                    send(self, { type: 'error', code: 'ENDED' }); return;
                }
                peers.set(uid, self);
                send(self, { type: 'ready', lesson: room, peerOnline: !!other, peerStreamId: other?.id, cameraFlow: true, screenFlow: true });
                send(other, { type: 'peer', online: true, streamId: self.id, cameraFlow: true }); return;
            }
            if (message.type === 'pulse') { send(self, { type: 'pulse' }); return; }
            if (!other || peers.get(uid) !== self) return;
            const packet = { ...message, uid, streamId: self.id };
            if (message.type === 'audio') {
                link.audioSent[uid]++;
                if (uid === 5 && link.pauseAudio) { link.blockedAudio = packet; return; }
            }
            if (uid === 5 && options.complexScreen) {
                if (message.type === 'audio') audioTimes.set(message.seq, Date.now());
                if (message.type === 'screen') {
                    screenFrames.push({ at: Date.now(), bytes: raw.length, ticket: message.ticket });
                    link.lastScreen = packet;
                }
            }
            if (uid === 5 && message.type === 'video') {
                frames.set(message.seq, Date.now());
                if (link.pauseCamera) { link.blocked = packet; return; }
            }
            if (uid !== 5 || !link.bytesPerMs) { send(other, packet); return; }
            // Serialize audio, camera and controls through one ordered downlink.
            nextArrival = Math.max(nextArrival, Date.now()) + raw.length / link.bytesPerMs;
            const delay = Math.max(0, nextArrival - Date.now()) + 35;
            link.maxBacklogMs = Math.max(link.maxBacklogMs, delay);
            const timer = setTimeout(() => { timers.delete(timer); send(other, packet); }, delay);
            timers.add(timer);
        });
        ws.on('close', () => {
            if (peers.get(uid) !== self) return;
            peers.delete(uid); send(peers.get(otherUid), { type: 'peer', online: false, streamId: self.id });
        });
    });
    let browser; let browserServer; let safariEngine;
    t.after(async () => {
        await browser?.close();
        await safariEngine?.close();
        await browserServer?.close();
        for (const timer of timers) clearTimeout(timer);
        for (const peer of peers.values()) peer.ws.terminate();
        await new Promise(resolve => sockets.close(resolve));
        await new Promise(resolve => httpServer.close(resolve));
    });
    await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
    const launch = { executablePath, headless: true,
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] };
    if (options.nativeTabs) {
        // Playwright normally forces every test tab into the foreground. Connect to
        // Chrome's default context without that override to get real hide/freeze events.
        browserServer = await chromium.launchServer({ ...launch, args: [...launch.args, '--headless=new', '--remote-debugging-port=0'] });
        const profile = browserServer.process().spawnargs.find(arg => arg.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
        const [port] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n');
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    } else browser = await chromium.launch(launch);
    const tabs = options.nativeTabs ? browser.contexts()[0] : browser;
    if (options.webkitUid) safariEngine = await webkit.launch();
    const learner = await (options.webkitUid === 5 ? safariEngine : tabs).newPage();
    const teacher = await (options.webkitUid === 2 ? safariEngine : tabs).newPage();
    const errors = [];
    for (const [page, uid] of [[teacher, 2], [learner, 5]]) {
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${httpServer.address().port}/class/${uid}`);
        if (options.nativeTabs) await page.bringToFront();
        await page.locator('#start').click();
    }
    if (safariEngine) {
        // On Mac the first automatic attempt to play sound may need a user gesture.
        const page = options.webkitUid === 5 ? learner : teacher;
        await page.waitForFunction(() => audioPlayed || !document.querySelector('[data-lesson-resume-sound]').hidden
            || !document.querySelector('[data-lesson-device-retry]').hidden);
        for (const control of ['[data-lesson-resume-sound]', '[data-lesson-device-retry]']) {
            if (await page.locator(control).isVisible()) await page.locator(control).click();
        }
    }
    await teacher.waitForFunction(() => displayed.length >= 5 && audioPackets > 0, null, { polling: 50 });
    return { teacher, learner, peers, link, frames, screenFrames, audioTimes, errors, room, actions, unreachable,
        deliver: packet => send(peers.get(2), packet) };
}

if (process.env.LESSON_MAC_BROWSERS === '1') {
    for (const [uid, role] of [[2, 'teacher'], [5, 'learner']]) it(`macOS WebKit ${role} and Chrome exchange camera and speech after reconnect`, async t => {
        const { teacher, learner, peers, errors } = await fixture(t, { webkitUid: uid });
        const bothPlaying = since => Promise.all([teacher, learner].map(page => page.waitForFunction(at =>
            displayed.some(frame => frame.at > at) && lastPlayableAt > at, since, { timeout: 13000 })));
        await bothPlaying(0);
        const oldId = peers.get(uid).id;
        const before = Date.now();
        peers.get(uid).ws.terminate();
        const mac = uid === 2 ? teacher : learner;
        await mac.waitForFunction(() => document.querySelector('[data-lesson-remote-video]').hidden);
        await bothPlaying(before);
        assert.notEqual(peers.get(uid)?.id, oldId);
        for (const page of [teacher, learner]) {
            assert.equal(await page.evaluate(() => deviceTracks.filter(track => track.readyState === 'live').length), 2);
        }
        assert.deepEqual(errors, []);
    });
}

it('recovers both participants three times across real background/frozen tabs, then releases devices on offline leave and end', async t => {
    const { teacher, learner, peers, room, actions, errors, unreachable } = await fixture(t, { nativeTabs: true, complexScreen: true });
    const pages = [teacher, learner]; const context = teacher.context();
    const eventually = { polling: 50, timeout: 12000 };
    const cut = async () => {
        await context.setOffline(true);
        for (const peer of peers.values()) peer.ws.terminate();
        await Promise.all(pages.map(page => page.waitForFunction(() =>
            !navigator.onLine && document.querySelector('[data-lesson-remote-video]').hidden, null, eventually)));
    };
    const freshConversation = time => Promise.all(pages.map(page => page.waitForFunction(start =>
        lastAudioAt > start && lastPlayableAt > start && displayed.some(frame => frame.at > start), time, eventually)));
    const allReleased = page => page.waitForFunction(() => deviceTracks.length >= 2
        && [...deviceTracks, ...(window.screenCaptureTracks || [])].every(track => track.readyState === 'ended'), null, eventually);
    const stop = async page => {
        await page.bringToFront();
        await page.locator('[data-lesson-media-leave]').click();
        await page.locator('[data-lesson-exit-confirm]').click();
        await allReleased(page);
    };
    await freshConversation(Date.now());
    for (const page of pages) await page.evaluate(() => { window.originalTracks = [...deviceTracks]; });
    for (let round = 0; round < 3; round++) {
        const background = pages[round % 2]; const foreground = pages[1 - round % 2];
        await background.bringToFront(); await foreground.bringToFront();
        await background.waitForFunction(() => document.hidden, null, eventually);
        const previous = [peers.get(2).id, peers.get(5).id];
        await cut();
        const session = await context.newCDPSession(background);
        await session.send('Page.enable');
        await session.send('Page.setWebLifecycleState', { state: 'frozen' });
        await wait(200);
        const restart = Date.now();
        await context.setOffline(false);
        await session.send('Page.setWebLifecycleState', { state: 'active' });
        await background.bringToFront(); await session.detach();
        await freshConversation(restart);
        assert.notEqual(peers.get(2).id, previous[0]); assert.notEqual(peers.get(5).id, previous[1]);
        for (const page of pages) {
            assert(await page.evaluate(() => originalTracks.length === 2 && deviceTracks.length === 2
                && originalTracks.every(track => track.readyState === 'live' && deviceTracks.includes(track))),
            'the accepted camera and microphone survive each transport renewal');
        }
        assert(await background.evaluate(() => lifecycle.includes('visibilitychange/hidden') && !document.hidden));
        t.diagnostic(`round ${round + 1} recovered both camera and microphone directions in ${Date.now() - restart} ms`);
    }
    const events = (await Promise.all(pages.map(page => page.evaluate(() => [...lifecycle])))).flat();
    assert(events.includes('freeze/hidden') && events.some(event => event.startsWith('resume/')), events.join(', '));
    await teacher.bringToFront();
    await teacher.locator('[data-lesson-screen-toggle]').click();
    await learner.bringToFront();
    await learner.locator('[data-lesson-screen-share]').click();
    assert(await learner.evaluate(() => screenCaptureTracks.length === 1 && screenCaptureTracks[0].readyState === 'live'));
    await teacher.waitForFunction(start => document.hidden && lastPlayableAt > start, Date.now(), eventually);
    // Chromium can defer image decoding in a background tab. Check a newly
    // decoded desktop when the teacher is actually looking at the lesson again.
    await teacher.bringToFront();
    await teacher.evaluate(() => { window.previousScreen = document.querySelector('[data-lesson-remote-screen]'); });
    await teacher.waitForFunction(() => {
        const screen = document.querySelector('[data-lesson-remote-screen]');
        return !document.hidden && screen !== previousScreen && !screen.hidden && screen.naturalWidth > 0;
    }, null, eventually);
    await learner.bringToFront();
    await cut();
    await teacher.waitForFunction(() => {
        const screen = document.querySelector('[data-lesson-remote-screen]');
        return document.hidden && screen.hidden && !screen.hasAttribute('src');
    }, null, eventually);
    await stop(learner);
    await learner.waitForFunction(() => JSON.parse(localStorage.getItem('onebyone.lesson.recovery:5') || '{}').pending === 'leave', null, eventually);
    await context.setOffline(false);
    await learner.waitForFunction(() => !localStorage.getItem('onebyone.lesson.recovery:5'), null, eventually);
    assert.equal(room.studentJoined, false);
    assert.equal(actions.filter(item => item.operation === 'leave' && item.uid === 5).length, 1);
    assert.equal(peers.has(5), false);
    await allReleased(learner);
    await learner.locator('[data-lesson-home] [data-lesson-join]').click();
    await learner.waitForFunction(() => deviceTracks.filter(track => track.readyState === 'live').length === 2
        && screenCaptureTracks.length === 2 && screenCaptureTracks[1].readyState === 'live', null, eventually);
    assert(await learner.evaluate(() => originalTracks.every(track => track.readyState === 'ended') && screenCaptureTracks[0].readyState === 'ended'));
    assert.equal(actions.filter(item => item.operation === 'join' && item.uid === 5).length, 1);
    await teacher.bringToFront();
    if (await teacher.locator('[data-lesson-screen-toggle]').getAttribute('aria-pressed') === 'true') {
        await teacher.locator('[data-lesson-screen-toggle]').click();
    }
    await freshConversation(Date.now());
    await cut(); await stop(teacher);
    await teacher.waitForFunction(() => JSON.parse(localStorage.getItem('onebyone.lesson.recovery:2') || '{}').pending === 'end', null, eventually);
    unreachable.add(5); // The learner cannot receive the end notification or query the room yet.
    await context.setOffline(false);
    await teacher.waitForFunction(() => !localStorage.getItem('onebyone.lesson.recovery:2'), null, eventually);
    assert.equal(room.status, 'ended');
    assert.equal(actions.filter(item => item.operation === 'end' && item.uid === 2).length, 1);
    assert(!peers.has(5));
    unreachable.delete(5);
    await learner.bringToFront();
    await Promise.all(pages.map(allReleased));
    await teacher.bringToFront();
    await wait(1100);
    assert.equal(peers.size, 0);
    for (const page of pages) {
        assert(await page.evaluate(() => document.querySelector('[data-lesson-media]').hidden && deviceTracks.every(track => track.readyState === 'ended')));
    }
    assert.deepEqual(errors, []);
});

it('bounds decoded camera delay on a 768 kbps link, expires held frames and resumes after reconnect', async t => {
    const { teacher, learner, peers, link, frames, errors, deliver } = await fixture(t);
    const [initial, learnerAudioBefore] = await Promise.all([
        teacher.evaluate(() => ({ at: Date.now(), audio: audioPackets })), learner.evaluate(() => audioPackets),
    ]);
    const audioBefore = { ...link.audioSent };
    link.bytesPerMs = 96;
    const durationMs = Math.max(15000, Number(process.env.LESSON_CAMERA_SLOW_MS) || 15000);
    await wait(durationMs);
    const slow = await teacher.evaluate(({ start, duration }) => ({
        first: displayed.filter(frame => frame.at >= start && frame.at < start + 10000),
        frames: displayed.filter(frame => frame.at >= start + duration - 10000), audio: audioPackets,
    }), { start: initial.at, duration: durationMs });
    const learnerAudioAfter = await learner.evaluate(() => audioPackets);
    assert(slow.frames.length >= 12, `slow link displayed only ${slow.frames.length} frames in its final ten seconds`);
    const frameAges = sample => sample.map(frame => frame.at - frames.get(frame.seq)).sort((a, b) => a - b);
    const ages = frameAges(slow.frames);
    const firstAges = frameAges(slow.first);
    const p95 = ages[Math.floor(ages.length * .95)];
    t.diagnostic(`768 kbps over ${durationMs / 1000} s: first 10 s p95 ${firstAges[Math.floor(firstAges.length * .95)]} ms; final 10 s ${slow.frames.length} decoded frames, p95 ${p95} ms, max ${ages.at(-1)} ms; peak queue ${Math.round(link.maxBacklogMs)} ms`);
    t.diagnostic(`Audio received/sent: learner to teacher ${slow.audio - initial.audio}/${link.audioSent[5] - audioBefore[5]}, teacher to learner ${learnerAudioAfter - learnerAudioBefore}/${link.audioSent[2] - audioBefore[2]}`);
    assert(p95 < 1000, 'a frame delayed by the network cannot restart its lifetime on arrival');
    for (const [uid, received] of [[5, slow.audio - initial.audio], [2, learnerAudioAfter - learnerAudioBefore]]) {
        const sent = link.audioSent[uid] - audioBefore[uid];
        assert(sent > 30 && received >= sent * .85, 'both microphones keep delivering during camera congestion');
    }
    link.bytesPerMs = 0; link.pauseCamera = true;
    await wait(450); const expired = link.blocked; assert(Number.isSafeInteger(expired?.ticket));
    await wait(1800); deliver(expired); await wait(200);
    assert.equal(await teacher.evaluate(seq => displayed.some(frame => frame.seq === seq), expired.seq), false);
    const restart = Date.now(); link.pauseCamera = false;
    await teacher.waitForFunction(time => displayed.some(frame => frame.at > time), restart, { timeout: 4500 });
    const first = await teacher.evaluate(time => displayed.find(frame => frame.at > time), restart);
    assert(first.at - frames.get(first.seq) < 900);
    link.pauseAudio = true;
    await wait(150); const oldVoice = link.blockedAudio;
    assert(Number.isSafeInteger(oldVoice?.ticket), 'negotiated microphone packets carry the listener timestamp ticket');
    await wait(3000);
    const beforeOldVoice = await teacher.evaluate(() => ({ received: audioPackets, played: audioPlayed }));
    deliver(oldVoice);
    await teacher.waitForFunction(count => audioPackets > count, beforeOldVoice.received);
    assert.equal(await teacher.evaluate(() => audioPlayed), beforeOldVoice.played, 'a three-second-old sample never enters the real audio worklet');
    link.pauseAudio = false;
    await teacher.waitForFunction(count => audioPlayed > count, beforeOldVoice.played);
    const previousPeer = peers.get(5); previousPeer.ws.terminate();
    await teacher.waitForFunction(() => document.querySelector('[data-lesson-remote-video]').hidden);
    const rejoin = Date.now();
    await teacher.waitForFunction(time => displayed.some(frame => frame.at > time), rejoin, { timeout: 9000 });
    assert.notEqual(peers.get(5).id, previousPeer.id);
    const recovered = await teacher.evaluate(time => displayed.find(frame => frame.at > time), rejoin);
    await Promise.all([teacher, learner].map(page => page.waitForFunction(time => lastAudioAt > time, rejoin)));
    link.blocked = null; link.pauseCamera = true;
    const deadline = Date.now() + 2000;
    while (!link.blocked && Date.now() < deadline) await wait(20);
    assert(link.blocked, 'new connection has a freshly requested frame');
    const oldOwner = { ...link.blocked, seq: link.blocked.seq + 1000000, streamId: previousPeer.id };
    deliver(oldOwner); await wait(150);
    assert.equal(await teacher.evaluate(seq => displayed.some(frame => frame.seq === seq), oldOwner.seq), false);
    t.diagnostic(`fresh frame after backlog ${first.at - restart} ms; after reconnect ${recovered.at - rejoin} ms`);
    assert.equal(errors.length, 0, errors.join('\n'));
});

it('limits a complex whole-screen stream beside camera and audio on one ordered 768 kbps connection', async t => {
    const { teacher, learner, link, frames, screenFrames, audioTimes, errors, deliver } = await fixture(t, { complexScreen: true });
    await teacher.locator('[data-lesson-screen-toggle]').click();
    await learner.locator('[data-lesson-screen-share]').click();
    await teacher.waitForFunction(() => {
        const screen = document.querySelector('[data-lesson-remote-screen]');
        return !screen.hidden && screen.complete && screen.naturalWidth > 0;
    });
    await teacher.waitForFunction(() => document.querySelector('[data-lesson-remote-screen]').naturalWidth === 1280, undefined, { timeout: 25000 });
    assert(screenFrames.some(frame => frame.bytes >= 32000 && Number.isSafeInteger(frame.ticket)), 'healthy link preserves detail in a complex screenshot');
    link.bytesPerMs = 96; const start = Date.now();
    await wait(14000);
    const observations = await teacher.evaluate(() => ({
        audio: playedAudio, screenVisible: !document.querySelector('[data-lesson-remote-screen]').hidden,
        cameraAlive: !!document.querySelector('[data-lesson-local-video]').srcObject?.active,
    }));
    const since = start + 6500;
    const recent = screenFrames.filter(frame => frame.at >= since);
    const ages = observations.audio.filter(frame => frame.at >= since && audioTimes.has(frame.seq))
        .map(frame => frame.at - audioTimes.get(frame.seq)).sort((a, b) => a - b);
    const p95 = ages[Math.floor(ages.length * .95)];
    const sentAudio = [...audioTimes.values()].filter(at => at >= since && at < Date.now() - 500).length;
    assert(ages.length >= sentAudio * .85 && sentAudio > 90, 'speech continues to reach the teacher');
    assert(p95 < 850, `speech p95 lag was ${p95} ms`);
    assert(recent.length >= 4 && recent.some(frame => frame.bytes < 15000), 'screen adapts to the shared link');
    assert([...frames.values()].filter(at => at >= since).length >= 6, 'camera continues producing fresh frames');
    assert(observations.screenVisible && observations.cameraAlive);
    t.diagnostic(`768 kbps with screen + camera + voice: final ${ages.length} microphone frames, p95 ${p95} ms; screen ${recent.length} packets, median ${recent.map(frame => frame.bytes).sort((a,b) => a-b)[Math.floor(recent.length/2)]} bytes`);
    const held = link.lastScreen;
    await teacher.locator('[data-lesson-screen-toggle]').click();
    await teacher.waitForFunction(() => document.querySelector('[data-lesson-remote-screen]').hidden);
    deliver({ ...held, seq: held.seq + 50 });
    await wait(250);
    assert.equal(await teacher.locator('[data-lesson-remote-screen]').getAttribute('src'), null);
    await learner.locator('[data-lesson-screen-stop]').click();
    assert.equal(await learner.evaluate(() => screenCaptureTracks.at(-1).readyState), 'ended');
    assert(await learner.evaluate(() => document.querySelector('[data-lesson-local-video]').srcObject.active));
    assert.deepEqual(errors, []);
});

for (const desktopTeacher of [false, true]) {
    it(`shows a newly approved learner screen with the teacher tab hidden and real ${desktopTeacher ? 'Document' : 'video'} PiP open`, async t => {
        const { teacher, learner, screenFrames, errors } = await fixture(t, { nativeTabs: true, complexScreen: true, desktopTeacher });
        const until = { polling: 80, timeout: 7000 };
        await teacher.bringToFront();
        const inPip = () => !!(window.documentPictureInPicture?.window || document.pictureInPictureElement);
        if (!await teacher.evaluate(inPip)) await teacher.locator('[data-lesson-desktop]').click();
        await teacher.waitForFunction(inPip, null, until);
        await teacher.evaluate(() => {
            const view = window.documentPictureInPicture?.window;
            const cameraDoc = view?.document || document;
            window.screenDecodeOwners = [];
            for (const host of [window, ...(view ? [view] : [])]) {
                const decode = host.HTMLImageElement.prototype.decode;
                host.HTMLImageElement.prototype.decode = function(...args) {
                    if (this.hasAttribute('data-lesson-remote-screen')) screenDecodeOwners.push(this.ownerDocument === cameraDoc);
                    return decode.apply(this, args);
                };
            }
            cameraDoc.querySelector('[data-lesson-screen-toggle]').click();
        });
        await learner.bringToFront();
        await teacher.waitForFunction(() => document.hidden, null, until);
        await learner.locator('[data-lesson-screen-share]').click();
        try {
            await teacher.waitForFunction(desktop => {
                const view = window.documentPictureInPicture?.window;
                const img = (view?.document || document).querySelector('[data-lesson-remote-screen]');
                if (!document.hidden || img?.hidden || !img.complete || !img.naturalWidth) return false;
                if (desktop) return view && !view.document.hidden;
                const video = document.pictureInPictureElement;
                if (!video || video.videoHeight < 360) return false;
                const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 360;
                const context = canvas.getContext('2d');
                context.drawImage(video, 0, 0, 320, 360);
                return context.getImageData(300, 350, 1, 1).data.slice(0, 3).every(channel => channel > 180);
            }, desktopTeacher, until);
        } catch (error) {
            t.diagnostic(JSON.stringify({ transmitted: screenFrames.length, teacher: await teacher.evaluate(() => {
                const view = window.documentPictureInPicture?.window;
                const doc = view?.document || document; const image = doc.querySelector('[data-lesson-remote-screen]');
                return { hidden: document.hidden, pip: !!view, pipVideo: !!document.pictureInPictureElement,
                    surface: doc.visibilityState, imageHidden: image?.hidden, pixels: image?.naturalWidth,
                    status: doc.querySelector('[data-lesson-screen-status]')?.textContent };
            }) })); throw error;
        }
        assert(screenFrames.some(frame => Number.isSafeInteger(frame.ticket)));
        assert(await teacher.evaluate(() => screenDecodeOwners.length > 0 && screenDecodeOwners.every(Boolean)),
            'screen frames decode in the document presenting the classroom');
        assert.deepEqual(errors, []);
    });
}
