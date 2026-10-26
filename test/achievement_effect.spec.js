const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/components/achievement_effect.ts'), 'utf8');
const compiled = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
const award = { id: 'first-difficulty-1', name: '初战告捷', description: '首次 AC 难度 1 的题目' };
const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function fixture(options = {}) {
    const dom = new JSDOM('<!doctype html><body><main><button id="submit">递交</button><input id="editor"></main></body>', {
        url: 'https://oj.example/d/course/p/P1', pretendToBeVisual: true,
    });
    const { window } = dom;
    const { document } = window;
    const timers = new Map();
    const images = [];
    const audios = [];
    const audioPlays = [];
    const acknowledgements = [];
    const requests = [];
    let now = 0;
    let nextId = 0;
    window.setTimeout = (fn, ms = 0) => {
        timers.set(++nextId, { fn, time: now + ms });
        return nextId;
    };
    window.clearTimeout = (id) => timers.delete(id);
    window.requestAnimationFrame = (fn) => window.setTimeout(fn, 16);
    window.cancelAnimationFrame = window.clearTimeout;
    window.matchMedia = () => ({ matches: !!options.reducedMotion });
    if (options.locks) Object.defineProperty(window.navigator, 'locks', { value: options.locks });
    function Image() {
        const image = document.createElement('img');
        const decoded = deferred();
        let loaded = false;
        Object.defineProperties(image, {
            complete: { get: () => loaded },
            naturalWidth: { get: () => loaded ? 1600 : 0 },
            naturalHeight: { get: () => loaded ? 1200 : 0 },
        });
        image.decode = () => decoded.promise;
        image.load = () => { loaded = true; image.onload?.(new window.Event('load')); };
        image.ready = () => { image.load(); decoded.resolve(); };
        images.push(image);
        return image;
    }
    function Audio(src) {
        if (options.audioConstructorThrows) throw new Error('Audio unavailable');
        const audio = {
            src, paused: true, volume: 1, muted: false, loop: false, currentTime: 0, pauseCount: 0, loadCount: 0,
            play() {
                this.paused = false;
                audioPlays.push({ player: this, muted: this.muted, volume: this.volume, loop: this.loop });
                return options.audioPlay ? options.audioPlay(this, audioPlays.length) : Promise.resolve();
            },
            pause() { this.paused = true; this.pauseCount++; },
            load() { this.loadCount++; },
            removeAttribute(name) { if (name === 'src') this.src = ''; },
        };
        if (options.audioVolumeReadOnly) Object.defineProperty(audio, 'volume', { get: () => 1, set() {} });
        audios.push(audio);
        return audio;
    }
    const mod = { exports: {} };
    vm.runInNewContext(compiled, {
        module: mod, exports: mod.exports, window, document, Image, Audio,
        Event: window.Event, URL: window.URL,
    });
    const create = (overrides = {}) => mod.exports.createAchievementCelebration({
        fetchPending: async (rid) => {
            requests.push(rid);
            return options.fetchPending ? options.fetchPending(rid) : { achievements: options.awards || [award], settled: true };
        },
        acknowledge: async (ids) => {
            acknowledgements.push(Array.from(ids));
            if (options.acknowledge) await options.acknowledge(ids);
        },
        ...overrides,
    });
    const fire = (type, props = {}, target = document) => {
        let event;
        if (type.startsWith('key')) event = new window.KeyboardEvent(type, { bubbles: true, cancelable: true, ...props });
        else event = new window.MouseEvent(type, { bubbles: true, cancelable: true, ...props });
        for (const [key, value] of Object.entries(props)) {
            if (!(key in event) || event[key] !== value) Object.defineProperty(event, key, { value });
        }
        target.dispatchEvent(event);
        return event;
    };
    const tick = async (ms) => {
        await settle();
        const until = now + ms;
        for (;;) {
            const next = [...timers].filter(([, timer]) => timer.time <= until).sort((a, b) => a[1].time - b[1].time)[0];
            if (!next) break;
            const [id, timer] = next;
            timers.delete(id);
            now = timer.time;
            timer.fn();
            await settle();
        }
        now = until;
        await settle();
    };
    const tap = (props = {}) => {
        fire('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'mouse', ...props });
        fire('pointerup', { pointerId: 1, clientX: 10, clientY: 10, pointerType: 'mouse', ...props });
        fire('click', { detail: 1 });
    };
    return { dom, window, document, images, audios, audioPlays, timers, acknowledgements, requests, create, fire, tick, tap,
        client: mod.exports.createAchievementClient,
        dialog: () => document.querySelector('.achievement-reveal'),
    };
}

it('prepares artwork during AC, waits for its full exit, and remains visible until an intentional dismissal', async () => {
    const f = fixture({ awards: [{ ...award, imageUrl: '/achievement/1/original?v=2', thumbnailUrl: '/achievement/1/thumb?v=2' }] });
    const player = f.create();
    const ac = deferred();
    const result = player.afterResult('record-1', ac.promise);
    await settle();
    assert.equal(f.requests.length, 1);
    assert.equal(f.images[0].src, 'https://oj.example/achievement/1/original?v=2');
    f.images[0].ready();
    await f.tick(5000);
    assert.equal(f.dialog(), null, 'the achievement cannot overlap the AC effect or its exit');
    ac.resolve();
    await settle();
    assert.equal(f.dialog().querySelector('img'), f.images[0]);
    await f.tick(60000);
    assert.ok(f.dialog(), 'there is no automatic dismissal timeout');
    assert.deepEqual(f.acknowledgements, []);
    f.fire('keydown', { key: 'Enter' });
    assert.ok(f.dialog().classList.contains('is-leaving'));
    assert.deepEqual(f.acknowledgements, [], 'exit must complete before acknowledgement');
    await f.tick(360);
    await result;
    assert.equal(f.dialog(), null);
    assert.deepEqual(f.acknowledgements, [[award.id]]);
    player.dispose();
    f.dom.window.close();
});

it('polls delayed processing, deduplicates repeated result messages and suppresses already shown awards', async () => {
    let responses = 0;
    const f = fixture({ fetchPending: async () => ++responses === 1
        ? { achievements: [], settled: false } : { achievements: [award], settled: true } });
    const player = f.create();
    const first = player.afterResult('record-1');
    assert.equal(player.afterResult('record-1'), first);
    await f.tick(699);
    assert.equal(f.dialog(), null);
    await f.tick(1);
    assert.ok(f.dialog());
    await f.tick(700);
    f.tap();
    await f.tick(360);
    await first;
    await player.afterResult('record-2');
    assert.equal(f.dialog(), null);
    assert.equal(f.acknowledgements.length, 1);
    player.dispose();
    f.dom.window.close();
});

it('groups simultaneous awards, escapes their text, guards entrance input and prevents click-through', async () => {
    const evilName = '<img src=x onerror=alert(1)>';
    const awards = [award, { ...award, id: 'ten', name: '十题斩' }, { ...award, id: 'hundred', name: evilName }, award];
    const f = fixture({ awards });
    const player = f.create();
    let submitted = 0;
    const submit = f.document.querySelector('#submit');
    submit.addEventListener('click', () => submitted++);
    const task = player.afterResult('record');
    await settle();
    assert.equal(f.dialog().querySelectorAll('.achievement-reveal__tile').length, 3);
    assert.ok(f.dialog().textContent.includes(evilName));
    assert.equal(f.dialog().querySelector('[onerror]'), null);
    f.fire('pointerdown', { pointerId: 1, pointerType: 'mouse' });
    await f.tick(700);
    f.fire('pointerup', { pointerId: 1, pointerType: 'mouse' });
    assert.equal(f.dialog().classList.contains('is-leaving'), false, 'a click begun before entrance finished cannot dismiss');
    f.tap();
    f.fire('click', { detail: 1 }, submit);
    assert.equal(submitted, 0);
    await f.tick(360);
    await task;
    assert.deepEqual(f.acknowledgements, [[award.id, 'ten', 'hundred']]);
    player.dispose();
    f.dom.window.close();
});

it('ignores held keys and composition, traps focus, and restores the editor after reduced-motion dismissal', async () => {
    const f = fixture({ reducedMotion: true });
    const main = f.document.querySelector('main');
    main.inert = false;
    const editor = f.document.querySelector('#editor');
    editor.focus();
    f.document.body.style.overflow = 'scroll';
    const player = f.create();
    const task = player.showPending();
    await f.tick(700);
    assert.equal(main.inert, true);
    assert.equal(f.document.activeElement, f.dialog());
    editor.focus();
    assert.equal(f.document.activeElement, f.dialog());
    assert.equal(f.dialog().querySelector('button'), null, 'there is no close or continue button');
    for (const props of [{ key: 'a', repeat: true }, { key: 'a', isComposing: true }]) f.fire('keydown', props);
    assert.equal(f.dialog().classList.contains('is-leaving'), false);
    const event = f.fire('keydown', { key: 'Control' });
    assert.equal(event.defaultPrevented, true);
    await f.tick(80);
    await task;
    assert.equal(f.document.activeElement, editor);
    assert.equal(main.inert, false);
    assert.equal(f.document.body.style.overflow, 'scroll');
    player.dispose();
    f.dom.window.close();
});

it('allows touch scrolling in the award collection, then dismisses on a tap', async () => {
    const f = fixture();
    const player = f.create();
    const task = player.showPending();
    await f.tick(700);
    f.fire('pointerdown', { pointerId: 2, pointerType: 'touch', clientY: 100 });
    f.fire('pointerup', { pointerId: 2, pointerType: 'touch', clientY: 30 });
    assert.equal(f.dialog().classList.contains('is-leaving'), false);
    f.tap({ pointerType: 'touch' });
    await f.tick(360);
    await task;
    assert.equal(f.acknowledgements.length, 1);
    player.dispose();
    f.dom.window.close();
});

it('also dismisses on a right mouse click without leaving a browser context menu over the page', async () => {
    const f = fixture();
    const player = f.create();
    const task = player.showPending();
    await f.tick(700);
    const context = f.fire('contextmenu', { button: 2 });
    assert.equal(context.defaultPrevented, true);
    assert.ok(f.dialog().classList.contains('is-leaving'));
    await f.tick(360);
    await task;
    assert.equal(f.acknowledgements.length, 1);
    player.dispose();
    f.dom.window.close();
});

it('uses the text and emblem fallback for absent, failed, slow or unsafe artwork', async () => {
    for (const imageUrl of ['', '/unavailable.png', '/slow.png', 'javascript:alert(1)']) {
        const f = fixture({ awards: [{ ...award, imageUrl }] });
        const player = f.create();
        const task = player.showPending();
        await settle();
        if (imageUrl === '/unavailable.png') f.images[0].onerror();
        if (imageUrl === '/slow.png') await f.tick(3000);
        await settle();
        assert.ok(f.dialog().textContent.includes(award.name));
        assert.equal(f.dialog().querySelectorAll('img').length, 0);
        assert.ok(f.dialog().querySelector('.achievement-reveal__fallback'));
        player.dispose();
        await task;
        assert.deepEqual(f.acknowledgements, []);
        assert.equal(f.timers.size, 0);
        f.dom.window.close();
    }
});

it('never acknowledges navigation and can resume new results after back-forward-cache restoration', async () => {
    const f = fixture();
    const player = f.create();
    const first = player.afterResult('record');
    await settle();
    f.window.dispatchEvent(new f.window.PageTransitionEvent('pagehide', { persisted: true }));
    await first;
    assert.equal(f.dialog(), null);
    assert.deepEqual(f.acknowledgements, []);
    assert.equal(f.timers.size, 0);
    f.window.dispatchEvent(new f.window.PageTransitionEvent('pageshow', { persisted: true }));
    const second = player.afterResult('record');
    await f.tick(700);
    assert.ok(f.dialog());
    f.fire('click', { detail: 0 }, f.dialog());
    await f.tick(360);
    await second;
    assert.equal(f.acknowledgements.length, 1);
    player.dispose();
    f.dom.window.close();
});

it('drops a late network response after dispose without mounting or acknowledging anything', async () => {
    const response = deferred();
    const f = fixture({ fetchPending: () => response.promise });
    const player = f.create();
    const task = player.afterResult('record');
    await settle();
    player.dispose();
    response.resolve({ achievements: [award], settled: true });
    await task;
    assert.equal(f.dialog(), null);
    assert.deepEqual(f.acknowledgements, []);
    assert.equal(f.timers.size, 0);
    f.dom.window.close();
});

it('bounds retries and leaves server pending awards untouched on network failure', async () => {
    const f = fixture({ fetchPending: async () => { throw new Error('offline'); } });
    const player = f.create();
    const task = player.afterResult('record');
    await f.tick(16000);
    await task;
    assert.equal(f.requests.length, 6);
    assert.equal(f.dialog(), null);
    assert.deepEqual(f.acknowledgements, []);
    player.dispose();
    f.dom.window.close();
});

it('holds a shared browser lock through fetching, presentation and acknowledgement to avoid duplicate tabs', async () => {
    let held = false;
    const locks = { async request(name, options, run) {
        assert.equal(name, 'classroom:11');
        assert.equal(options.ifAvailable, true);
        if (held) return run(null);
        held = true;
        try { return await run({ name }); } finally { held = false; }
    } };
    const first = fixture({ locks });
    const second = fixture({ locks });
    const a = first.create({ lockName: 'classroom:11' });
    const b = second.create({ lockName: 'classroom:11' });
    const task = a.showPending();
    await settle();
    await b.showPending();
    assert.ok(first.dialog());
    assert.equal(second.dialog(), null);
    assert.equal(second.requests.length, 0, 'a competing tab cannot fetch stale pending data');
    assert.equal(held, true);
    await first.tick(700);
    first.tap();
    await first.tick(360);
    await task;
    assert.equal(held, false);
    a.dispose(); b.dispose();
    first.dom.window.close(); second.dom.window.close();
});

it('uses authenticated endpoint helpers and makes no request when achievement URLs are absent', async () => {
    const f = fixture();
    const calls = [];
    const request = {
        get: async (...args) => { calls.push(['get', ...args]); return { achievements: [award], settled: true }; },
        post: async (...args) => calls.push(['post', ...args]),
    };
    const disabled = f.client({}, request);
    await disabled.afterResult('historical-record');
    assert.equal(calls.length, 0);
    disabled.dispose();
    const player = f.client({ achievementPendingUrl: '/d/class/achievement/pending', achievementAckUrl: '/d/class/achievement/ack' }, request);
    const task = player.afterResult('self-record');
    await f.tick(700);
    assert.equal(calls[0][1], '/d/class/achievement/pending');
    assert.equal(calls[0][2].rid, 'self-record');
    assert.equal(calls.length, 1);
    f.tap();
    await f.tick(360);
    await task;
    assert.equal(calls[1][0], 'post');
    assert.equal(calls[1][1], '/d/class/achievement/ack');
    assert.deepEqual(Array.from(calls[1][2].ids), [award.id]);
    player.dispose();
    f.dom.window.close();
});

it('record detail passes its AC completion barrier only for an eligible live self record, including non-AC point awards', async () => {
    const recordSource = fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/pages/record_detail.page.tsx'), 'utf8');
    const recordCode = transformSync(recordSource, { loader: 'tsx', format: 'cjs' }).code;
    for (const options of [
        { live: true, rid: 'own-live-record', status: 1, expected: 1 },
        { live: false, rid: 'historical-record', status: 1, expected: 0 },
        { live: false, rid: 'another-user-record', status: 1, expected: 0 },
        { live: true, rid: '', status: 1, expected: 0 },
        { live: true, rid: 'points-awarded-on-partial', status: 2, expected: 1 },
    ]) {
        const f = fixture();
        const ac = deferred();
        const calls = [];
        let played = 0;
        const chain = new Proxy({}, { get: () => () => chain });
        const dependencies = {
            '@hydrooj/common': { STATUS: { STATUS_ACCEPTED: 1 }, NORMAL_STATUS: [1, 2, 3] },
            clipboard: class { on() {} destroy() {} },
            jquery: () => chain,
            react: {},
            'vj/components/dialog': {},
            'vj/components/notification': {},
            'vj/misc/Page': { NamedPage: class { constructor(name, initialize) { this.initialize = initialize; } } },
            'vj/utils': {},
            '../components/badge_ac_effect': { createBadgeAcThemePlayer: () => ({ play: () => { played++; return ac.promise; } }) },
            '../components/achievement_effect': { createAchievementClient: () => ({ afterResult: (...args) => { calls.push(args); return Promise.resolve(); } }) },
            '../components/contest_practice_result': {
                createContestPracticeFeedback: () => ({ afterResult: async () => {} }),
                isContestPracticeResultReady: () => false,
            },
        };
        const mod = { exports: {} };
        vm.runInNewContext(recordCode, {
            module: mod, exports: mod.exports,
            require: (name) => {
                assert.ok(name in dependencies, name);
                return dependencies[name];
            },
            window: f.window, document: f.document,
            UiContext: { badgeAcEffect: true, achievementLive: options.live, achievementRecordId: options.rid, recordStatus: options.status },
        });
        await mod.exports.default.initialize();
        assert.equal(calls.length, options.expected);
        assert.equal(played, options.status === 1 ? 1 : 0);
        if (calls.length) {
            assert.equal(calls[0][0], options.rid);
            if (options.status === 1) assert.equal(calls[0][1], ac.promise);
        }
        ac.resolve();
        f.dom.window.close();
    }
});

it('refreshes pending awards after successive points events without redisplaying old ones', async () => {
    let response = [award];
    const f = fixture({ fetchPending: async () => ({ achievements: response, settled: true }) });
    const player = f.create();
    const first = player.showPending();
    await f.tick(700);
    f.tap();
    await f.tick(360);
    await first;
    response = [award, { ...award, id: 'points-3000', name: '星芒使者' }];
    const second = player.showPending();
    await f.tick(700);
    assert.ok(f.dialog().textContent.includes('星芒使者'));
    assert.equal(f.dialog().textContent.includes(award.name), false);
    f.tap();
    await f.tick(360);
    await second;
    assert.deepEqual(f.acknowledgements, [[award.id], ['points-3000']]);
    player.dispose();
    f.dom.window.close();
});

it('waits for the record settlement marker even when its first achievement is already visible to the server', async () => {
    let reads = 0;
    const points = { ...award, id: 'points-1000', name: '星火觉醒' };
    const f = fixture({ fetchPending: async () => ++reads === 1
        ? { achievements: [award], settled: false }
        : { achievements: [award, points], settled: true } });
    const player = f.create();
    const task = player.afterResult('record');
    await f.tick(699);
    assert.equal(f.dialog(), null, 'a partial worker update cannot omit the points award by ending polling early');
    await f.tick(1);
    assert.equal(f.dialog().querySelectorAll('.achievement-reveal__tile').length, 2);
    player.dispose();
    await task;
    f.dom.window.close();
});

it('shares the canonical award scope across different legacy domain URLs and waits for lottery result dismissal', async () => {
    let held = false;
    const lockNames = [];
    const locks = { async request(name, options, run) {
        lockNames.push(name);
        if (held) return run(null);
        held = true;
        try { return await run({ name }); } finally { held = false; }
    } };
    const f = fixture({ locks });
    const request = { get: async () => ({ achievements: [award], settled: true }), post: async () => {} };
    const a = f.client({ achievementPendingUrl: '/d/python/achievement/pending', achievementAckUrl: '/d/python/achievement/ack', achievementScope: 'legacy/11' }, request);
    const b = f.client({ achievementPendingUrl: '/d/cpp/achievement/pending', achievementAckUrl: '/d/cpp/achievement/ack', achievementScope: 'legacy/11' }, request);
    const lottery = f.document.createElement('div');
    lottery.setAttribute('data-point-lottery', '');
    lottery.innerHTML = '<div data-point-lottery-chest-stage aria-busy="true"></div><div data-point-lottery-result hidden></div>';
    f.document.body.appendChild(lottery);
    const task = a.showPending();
    await f.tick(500);
    assert.equal(f.dialog(), null);
    lottery.querySelector('[data-point-lottery-chest-stage]').setAttribute('aria-busy', 'false');
    lottery.querySelector('[data-point-lottery-result]').hidden = false;
    await f.tick(500);
    assert.equal(f.dialog(), null, 'the lottery prize result keeps its turn before achievements');
    await b.showPending();
    assert.deepEqual(lockNames, ['hydro:achievements:legacy/11', 'hydro:achievements:legacy/11']);
    lottery.querySelector('[data-point-lottery-result]').hidden = true;
    await f.tick(150);
    assert.ok(f.dialog());
    a.dispose();
    await task;
    b.dispose();
    f.dom.window.close();
});

it('uses full original artwork for every image in a grouped celebration', async () => {
    const f = fixture({ awards: [
        { ...award, imageUrl: '/original-1.png', thumbnailUrl: '/thumb-1.webp' },
        { ...award, id: 'second', imageUrl: '/original-2.png', thumbnailUrl: '/thumb-2.webp' },
    ] });
    const player = f.create();
    const task = player.showPending();
    await settle();
    f.images[0].ready();
    await settle();
    const sources = [...f.dialog().querySelectorAll('img')].map((image) => image.src);
    assert.equal(sources.length, 3);
    assert.ok(sources.every((src) => src.includes('/original-')));
    assert.ok(sources.includes('https://oj.example/original-2.png'));
    player.dispose();
    await task;
    f.dom.window.close();
});

it('page-scoped points events queue a fresh pending read behind the initial celebration', async () => {
    const pageSource = fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/components/achievement_effect.page.ts'), 'utf8');
    const pageCode = transformSync(pageSource, { loader: 'ts', format: 'cjs' }).code;
    for (const autoShow of [true, false]) {
        const f = fixture();
        const work = [];
        const mod = { exports: {} };
        const dependencies = {
            'vj/misc/Page': { AutoloadPage: class { constructor(name, initialize) { this.initialize = initialize; } } },
            'vj/utils': { request: {} },
            './achievement_effect': { createAchievementClient: () => ({
                dispose() {},
                showPending() { const next = deferred(); work.push(next); return next.promise; },
            }) },
        };
        vm.runInNewContext(pageCode, {
            module: mod, exports: mod.exports, require: (name) => dependencies[name], window: f.window,
            UiContext: { achievementPendingUrl: '/achievement/pending', achievementAutoShow: autoShow },
        });
        mod.exports.default.initialize();
        assert.equal(work.length, autoShow ? 1 : 0);
        f.window.dispatchEvent(new f.window.CustomEvent('hydro:points-earned'));
        await settle();
        assert.equal(work.length, 1, 'an active initial popup must not overlap a points popup');
        if (autoShow) {
            work[0].resolve();
            await settle();
            assert.equal(work.length, 2, 'the live event gets a fresh server read after the initial popup');
        }
        work.at(-1).resolve();
        await settle();
        f.dom.window.close();
    }
});

const sound = { enabled: true, soundUrl: '/achievement/sound?v=1', volume: 37, filename: 'unlock.mp3' };

it('silently primes on an early gesture and starts sound only when the artwork enters after AC', async () => {
    const f = fixture();
    const player = f.create({ sound });
    const ac = deferred();
    f.fire('pointerdown');
    await settle();
    assert.equal(f.audios.length, 1);
    assert.equal(f.audios[0].src, 'https://oj.example/achievement/sound?v=1');
    assert.equal(f.audioPlays.length, 1);
    assert.equal(f.audioPlays[0].muted, false, 'unlock the unmuted element inside the original user gesture');
    assert.equal(f.audioPlays[0].volume, 0);
    assert.equal(f.audios[0].paused, true);
    assert.equal(f.audios[0].muted, true, 'the completed warmup stays muted until the reveal');
    const task = player.afterResult('with-ac', ac.promise);
    await f.tick(5000);
    assert.equal(f.dialog(), null);
    assert.equal(f.audioPlays.length, 1, 'AC keeps the achievement sound silent');
    ac.resolve();
    await f.tick(15);
    assert.equal(f.dialog().classList.contains('is-visible'), false);
    assert.equal(f.audioPlays.length, 1);
    await f.tick(1);
    assert.equal(f.audioPlays.length, 2);
    assert.equal(f.audioPlays[1].muted, false);
    assert.equal(f.audioPlays[1].volume, 0.37);
    assert.equal(f.audioPlays[1].loop, false);
    assert.equal(f.dialog().classList.contains('is-visible'), true);
    player.dispose();
    await task;
    f.dom.window.close();
});

it('passes configured sound through the client and waits for the lottery result to close', async () => {
    const f = fixture();
    const lottery = f.document.createElement('div');
    lottery.setAttribute('data-point-lottery', '');
    lottery.innerHTML = '<div data-point-lottery-result></div>';
    f.document.body.appendChild(lottery);
    const player = f.client({
        achievementPendingUrl: '/achievement/pending', achievementAckUrl: '/achievement/ack', achievementSound: sound,
    }, { get: async () => ({ achievements: [award], settled: true }), post: async () => {} });
    const task = player.showPending();
    await f.tick(1000);
    assert.equal(f.dialog(), null);
    assert.equal(f.audioPlays.length, 0);
    lottery.querySelector('[data-point-lottery-result]').hidden = true;
    await f.tick(166);
    assert.equal(f.audioPlays.length, 1);
    assert.equal(f.audioPlays[0].volume, 0.37);
    player.dispose();
    await task;
    f.dom.window.close();
});

it('keeps gesture warmup muted when the browser ignores a zero-volume setting', async () => {
    const f = fixture({ audioVolumeReadOnly: true });
    const player = f.create({ sound });
    f.fire('pointerdown');
    await settle();
    assert.equal(f.audioPlays.length, 1);
    assert.equal(f.audioPlays[0].volume, 1);
    assert.equal(f.audioPlays[0].muted, true, 'a system-controlled volume must not leak sound during warmup');
    assert.equal(f.audios[0].paused, true);
    player.dispose();
    f.dom.window.close();
});

it('never initializes or plays sound when disabled, muted, missing or unsafe', async () => {
    for (const settings of [undefined, { ...sound, enabled: false }, { ...sound, volume: 0 },
        { ...sound, soundUrl: '' }, { ...sound, soundUrl: 'javascript:alert(1)' }]) {
        const f = fixture();
        const player = f.create({ sound: settings });
        f.fire('keydown', { key: 'a' });
        const task = player.showPending();
        await f.tick(700);
        assert.equal(f.audios.length, 0);
        assert.ok(f.dialog().classList.contains('is-visible'));
        f.tap();
        await f.tick(360);
        await task;
        assert.equal(f.audioPlays.length, 0);
        player.dispose();
        f.dom.window.close();
    }
});

it('plays once for grouped awards and never replays on guarded or dismissal gestures', async () => {
    for (const input of ['keyboard', 'mouse']) {
        const f = fixture({ awards: [award, { ...award, id: 'ten', name: '十题斩' }] });
        const idlePageClient = f.create({ sound });
        const player = f.create({ sound });
        const task = player.showPending();
        await f.tick(16);
        assert.equal(f.audioPlays.length, 1);
        assert.equal(f.dialog().querySelectorAll('.achievement-reveal__tile').length, 2);
        // Even if the short clip has already ended, the next gesture belongs
        // to the open achievement rather than an audio-unlocking retry.
        f.audios[0].paused = true;
        f.fire('keydown', { key: 'a' });
        f.tap();
        assert.equal(f.audioPlays.length, 1);
        assert.equal(f.audios.length, 1, 'another page client must not prime during an active celebration');
        assert.equal(f.dialog().classList.contains('is-leaving'), false);
        await f.tick(684);
        f.audios[0].paused = false;
        if (input === 'keyboard') f.fire('keydown', { key: 'Enter' });
        else f.tap();
        assert.equal(f.audioPlays.length, 1);
        assert.ok(f.dialog().classList.contains('is-leaving'));
        assert.equal(f.audios[0].paused, true, 'audio stops at exit start, without waiting for its animation');
        assert.equal(f.audios[0].muted, true);
        await f.tick(360);
        await task;
        assert.equal(f.acknowledgements.length, 1);
        player.dispose();
        idlePageClient.dispose();
        f.dom.window.close();
    }
});

it('keeps artwork and dismissal working when the browser denies or cannot create audio', async () => {
    for (const options of [
        { audioPlay: () => Promise.reject(new Error('NotAllowedError')) },
        { audioPlay: () => { throw new Error('Media failure'); } },
        { audioConstructorThrows: true },
    ]) {
        const f = fixture(options);
        const player = f.create({ sound });
        const task = player.showPending();
        await f.tick(700);
        assert.ok(f.dialog().classList.contains('is-visible'));
        f.tap();
        await f.tick(360);
        await task;
        assert.equal(f.acknowledgements.length, 1);
        assert.equal(f.dialog(), null);
        player.dispose();
        f.dom.window.close();
    }
});

it('a delayed silent warmup cannot pause or change the volume of the actual reveal', async () => {
    const prime = deferred();
    const f = fixture({ audioPlay: (_, count) => count === 1 ? prime.promise : Promise.resolve() });
    const player = f.create({ sound });
    f.fire('pointerdown');
    const task = player.showPending();
    await f.tick(16);
    assert.equal(f.audioPlays.length, 2);
    const pauses = f.audios[0].pauseCount;
    prime.resolve();
    await settle();
    assert.equal(f.audios[0].pauseCount, pauses);
    assert.equal(f.audios[0].muted, false);
    assert.equal(f.audios[0].volume, 0.37);
    assert.equal(f.audios[0].paused, false);
    player.dispose();
    await task;
    f.dom.window.close();
});

it('stops and releases sound on disposal or navigation without reviving from a late play promise', async () => {
    for (const mode of ['dispose', 'navigate', 'bfcache']) {
        const playback = deferred();
        const f = fixture({ audioPlay: () => playback.promise });
        const player = f.create({ sound });
        const task = player.afterResult('record');
        await f.tick(16);
        const audio = f.audios[0];
        assert.equal(audio.paused, false);
        if (mode === 'dispose') player.dispose();
        else f.window.dispatchEvent(new f.window.PageTransitionEvent('pagehide', { persisted: mode === 'bfcache' }));
        assert.equal(audio.paused, true);
        assert.equal(audio.muted, true);
        assert.equal(audio.src, '');
        assert.equal(f.dialog(), null);
        // Emulate a late media completion after the page has stopped its
        // playback. The stale callback must mute and stop that element again.
        audio.paused = false;
        playback.resolve();
        await task;
        await settle();
        assert.equal(audio.paused, true);
        assert.equal(audio.muted, true);
        assert.equal(f.timers.size, 0);
        assert.deepEqual(f.acknowledgements, []);
        f.fire('pointerdown');
        assert.equal(f.audios.length, 1, 'a hidden or disposed page cannot prime another element');
        if (mode === 'bfcache') {
            f.window.dispatchEvent(new f.window.PageTransitionEvent('pageshow', { persisted: true }));
            await f.tick(1000);
            assert.equal(f.audios.length, 1, 'restoring the page does not replay a past sound');
            const next = player.afterResult('record');
            await f.tick(16);
            assert.equal(f.audios.length, 2);
            assert.equal(f.audioPlays.length, 2);
            assert.equal(f.audios[1].paused, false);
            player.dispose();
            await next;
        }
        f.dom.window.close();
    }
});

it('a pending play completion after an intentional dismissal stays silent through exit', async () => {
    const playback = deferred();
    const f = fixture({ audioPlay: () => playback.promise });
    const player = f.create({ sound });
    const task = player.showPending();
    await f.tick(700);
    f.tap();
    f.audios[0].paused = false;
    playback.resolve();
    await settle();
    assert.equal(f.audios[0].paused, true);
    assert.equal(f.audios[0].muted, true);
    assert.ok(f.dialog().classList.contains('is-leaving'));
    assert.equal(f.audioPlays.length, 1);
    await f.tick(360);
    await task;
    player.dispose();
    f.dom.window.close();
});
