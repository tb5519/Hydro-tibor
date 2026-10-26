const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const source = buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/components/daily_quiz_gate.ts')],
    bundle: true, write: false, platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const required = { state: { enabled: true, required: true, day: '2026-10-27' } };
const completed = { state: { enabled: true, required: false, day: '2026-10-26' } };
function deferred() {
    let resolve; let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function fixture({ href = 'https://oj.test/d/school/p/123?tid=contest#submit', now = Date.parse('2026-10-26T12:00:00+08:00'), hidden = false } = {}) {
    const dom = new JSDOM('<main><textarea>unfinished code</textarea></main>', { url: href });
    let current = new URL(href);
    let visibility = hidden ? 'hidden' : 'visible';
    let time = now; let nextTimer = 0;
    const timers = new Map(); const calls = []; const navigations = []; const responses = [];
    Object.defineProperty(dom.window.document, 'visibilityState', { get: () => visibility });
    const location = {
        get href() { return current.href; }, get origin() { return current.origin; },
        get pathname() { return current.pathname; }, get search() { return current.search; }, get hash() { return current.hash; },
        assign(url) { navigations.push(url); current = new URL(url); },
    };
    const win = {
        document: dom.window.document, location, navigator: { onLine: true },
        Date: { now: () => time }, CustomEvent: dom.window.CustomEvent, AbortController,
        addEventListener: dom.window.addEventListener.bind(dom.window),
        removeEventListener: dom.window.removeEventListener.bind(dom.window),
        dispatchEvent: dom.window.dispatchEvent.bind(dom.window),
        setTimeout(callback, delay = 0) { timers.set(++nextTimer, { callback, at: time + delay }); return nextTimer; },
        clearTimeout(id) { timers.delete(id); },
        fetch(url, options) {
            calls.push({ url, options });
            const reply = responses.shift() || completed;
            if (reply instanceof Error) return Promise.reject(reply);
            return Promise.resolve(reply).then((value) => ({
                ok: value.status ? value.status >= 200 && value.status < 300 : true,
                json: () => value.parseError ? Promise.reject(new Error('invalid json')) : Promise.resolve(value),
            }));
        },
    };
    const module = { exports: {} };
    vm.runInNewContext(source, { module, exports: module.exports, URL, Promise });
    const context = { dailyQuizGate: { statusUrl: '/daily-quiz/status', serverNow: now } };
    return {
        win, dom, calls, timers, navigations, responses, context,
        start: (config = context) => module.exports.startDailyQuizGate(config, win),
        redirect: (url) => module.exports.redirectToDailyQuiz(url, win),
        event(name, persisted = false) { win.dispatchEvent(new dom.window.PageTransitionEvent(name, { persisted })); },
        visibility(value) { visibility = value; win.document.dispatchEvent(new dom.window.Event('visibilitychange')); },
        navigate(url) { current = new URL(url, current); },
        async advance(ms) {
            const until = time + ms;
            for (;;) {
                const next = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                time = next[1].at; timers.delete(next[0]); next[1].callback(); await flush();
            }
            time = until; await flush();
        },
        close() { win.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); dom.window.close(); },
    };
}

describe('daily quiz gate in pages left open', () => {
    it('checks immediately without the main UI chunk and redirects with a clear notice and the whole current problem URL', async (t) => {
        const h = fixture(); t.after(h.close);
        h.responses.push(required);
        h.start(); await flush();
        assert.equal(h.calls.length, 1);
        assert.equal(h.calls[0].options.credentials, 'same-origin');
        assert.equal(h.calls[0].options.cache, 'no-store');
        assert.match(h.win.document.getElementById('hydro-daily-quiz-gate-notice').textContent, /今天的每日一练还没完成/);
        assert.equal(h.navigations.length, 0);
        await h.advance(650);
        assert.equal(h.navigations.length, 1);
        const target = new URL(h.navigations[0]);
        assert.equal(target.pathname, '/daily-quiz');
        assert.equal(target.searchParams.get('return'), '/d/school/p/123?tid=contest#submit');
    });

    it('uses server time to check at Beijing midnight even when the computer clock is wrong', async (t) => {
        const h = fixture({ now: Date.parse('2026-10-01T01:00:00Z') }); t.after(h.close);
        h.context.dailyQuizGate.serverNow = Date.parse('2026-10-26T23:59:59+08:00');
        h.responses.push({ ...completed, serverNow: h.context.dailyQuizGate.serverNow }, required);
        h.start(); await flush();
        await h.advance(1049); assert.equal(h.calls.length, 1);
        await h.advance(1); assert.equal(h.calls.length, 2);
        await h.advance(650); assert.equal(h.navigations.length, 1);
    });

    it('does not redirect completed students or disabled policies and notices a policy enabled later', async (t) => {
        const h = fixture(); t.after(h.close);
        h.responses.push(completed, { state: { enabled: false, required: false } }, required);
        h.start(); await flush();
        await h.advance(60_000); assert.equal(h.navigations.length, 0);
        await h.advance(60_000); await h.advance(650);
        assert.equal(h.navigations.length, 1);
    });

    it('does not install for absent or unsafe configuration and never redirects teacher preview or the practice page', async (t) => {
        const h = fixture(); t.after(h.close);
        assert.equal(h.start({}), undefined);
        assert.equal(h.start({ dailyQuizGate: { statusUrl: 'https://evil.test/daily-quiz/status' } }), undefined);
        h.responses.push({ state: { teacherPreview: true, required: true } });
        h.start(); await flush(); await h.advance(300_000);
        assert.equal(h.calls.length, 1); assert.equal(h.navigations.length, 0);
        h.navigate('/daily-quiz?return=%2Fp%2F1');
        assert.equal(h.redirect('/daily-quiz'), false);
    });

    it('pauses while hidden and checks an old tab when it becomes visible on a new day', async (t) => {
        const h = fixture(); t.after(h.close);
        h.start(); await flush();
        h.visibility('hidden'); await h.advance(86_400_000);
        assert.equal(h.calls.length, 1);
        h.responses.push(required);
        h.visibility('visible'); await flush(); await h.advance(650);
        assert.equal(h.calls.length, 2); assert.equal(h.navigations.length, 1);
    });

    it('deduplicates focus, online, pageshow and repeated initialization while the request is pending', async (t) => {
        const h = fixture(); t.after(h.close);
        const pending = deferred(); h.responses.push(pending.promise);
        const binding = h.start();
        h.event('focus'); h.event('online'); h.event('pageshow');
        assert.equal(h.start(), binding);
        assert.equal(h.calls.length, 1);
        pending.resolve(required); await flush();
        h.event('focus'); h.redirect('/daily-quiz?return=/wrong');
        await h.advance(650); assert.equal(h.navigations.length, 1);
    });

    it('leaves work intact on network errors, expired login, malformed JSON and timeout, then retries', async (t) => {
        const h = fixture(); t.after(h.close);
        h.responses.push(new Error('offline'), { status: 401 }, { parseError: true }, deferred().promise, required);
        h.start(); await flush();
        await h.advance(180_000); await h.advance(10_000);
        assert.equal(h.calls.length, 4);
        assert.equal(h.calls[3].options.signal.aborted, true);
        assert.equal(h.navigations.length, 0);
        assert.equal(h.win.document.querySelector('textarea').value, 'unfinished code');
        await h.advance(60_000); await h.advance(650);
        assert.equal(h.navigations.length, 1);
    });

    it('does not let a late response redirect a hidden page, and resumes from BFCache without stale timestamps', async (t) => {
        const h = fixture(); t.after(h.close);
        const pending = deferred(); h.responses.push(pending.promise);
        h.start(); h.event('pagehide', true);
        pending.resolve(required); await flush(); await h.advance(86_400_000);
        assert.equal(h.navigations.length, 0); assert.equal(h.calls.length, 1);
        h.responses.push(required); h.event('pageshow', true); await flush();
        await h.advance(650); assert.equal(h.navigations.length, 1);
    });

    it('resumes checks when offline returns online and cleans up on real navigation', async (t) => {
        const h = fixture(); t.after(h.close);
        h.win.navigator.onLine = false;
        h.start(); await h.advance(60_000); assert.equal(h.calls.length, 0);
        h.win.navigator.onLine = true; h.responses.push(required); h.event('online'); await flush();
        h.event('pagehide'); await h.advance(1_000);
        assert.equal(h.navigations.length, 0);
        assert.equal(h.timers.size, 0);
        h.event('focus'); assert.equal(h.calls.length, 1);
    });

    it('reuses PJAX bindings without resetting the server clock and returns to the current page', async (t) => {
        const h = fixture({ now: Date.parse('2026-10-26T23:59:58+08:00') }); t.after(h.close);
        h.start(); await flush(); await h.advance(1_000);
        h.navigate('/p/999?tid=new#editor'); h.start();
        h.responses.push(required); await h.advance(1_050);
        assert.equal(h.calls.length, 2, 'old bootstrap serverNow must not push midnight back on PJAX');
        await h.advance(650);
        assert.equal(new URL(h.navigations[0]).searchParams.get('return'), '/p/999?tid=new#editor');
    });

    it('rejects unsafe and unrelated redirect targets and ignores server-supplied return URLs', async (t) => {
        const h = fixture(); t.after(h.close);
        for (const url of ['https://evil.test/daily-quiz', '//evil.test/daily-quiz', 'javascript:alert(1)',
            'https://user:pass@oj.test/daily-quiz', '/daily-quiz/status', '/daily-quiz/../logout', '/login']) {
            assert.equal(h.redirect(url), false, url);
        }
        assert.equal(h.redirect('/d/school/daily-quiz?return=https://evil.test/#bad'), true);
        await flush(); await h.advance(650);
        const target = new URL(h.navigations[0]);
        assert.equal(target.origin, 'https://oj.test');
        assert.equal(target.pathname, '/d/school/daily-quiz');
        assert.equal(target.hash, '');
        assert.equal(target.searchParams.get('return'), '/d/school/p/123?tid=contest#submit');
    });

    it('waits for draft saves and can be cancelled so failed storage never discards code', async (t) => {
        const h = fixture(); t.after(h.close);
        const saved = deferred();
        const handler = (event) => event.detail.waitUntil(saved.promise);
        h.win.addEventListener('hydro:daily-quiz-redirect', handler);
        h.redirect(); await flush(); await h.advance(1_000);
        assert.equal(h.navigations.length, 0);
        saved.reject(new Error('quota')); await flush(); await h.advance(1_000);
        assert.equal(h.navigations.length, 0);
        assert.match(h.win.document.getElementById('hydro-daily-quiz-gate-notice').textContent, /先保存当前作品/);
        const link = h.win.document.querySelector('#hydro-daily-quiz-gate-notice a');
        assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener');
        assert.equal(new URL(link.href).origin, 'https://oj.test');
        h.win.removeEventListener('hydro:daily-quiz-redirect', handler);
        h.win.addEventListener('hydro:daily-quiz-redirect', (event) => event.preventDefault(), { once: true });
        assert.equal(h.redirect(), true); await h.advance(650);
        assert.equal(h.navigations.length, 0);
        assert.equal(h.redirect(), true); await flush(); await h.advance(650);
        assert.equal(h.navigations.length, 1);
    });

    it('shows the explanation before collecting drafts, then navigates immediately after the final save', async (t) => {
        const h = fixture(); t.after(h.close);
        const saved = deferred(); let captured;
        h.win.addEventListener('hydro:daily-quiz-redirect', (event) => {
            captured = h.win.document.querySelector('textarea').value;
            event.detail.waitUntil(saved.promise);
        });
        h.redirect();
        await h.advance(649); assert.equal(captured, undefined);
        h.win.document.querySelector('textarea').value = 'latest keystroke';
        await h.advance(1); assert.equal(captured, 'latest keystroke');
        assert.equal(h.navigations.length, 0);
        saved.resolve(); await flush();
        assert.equal(h.navigations.length, 1, 'no post-save timer can discard a newly typed answer');
    });

    it('never follows a stale redirect after PJAX reaches login or the practice page', async (t) => {
        const h = fixture(); t.after(h.close);
        h.redirect(); h.navigate('/login?return=%2Fp%2F1'); await h.advance(650);
        assert.equal(h.navigations.length, 0);
        assert.equal(h.win.document.getElementById('hydro-daily-quiz-gate-notice'), null);
        h.navigate('/p/456#answer'); h.redirect(); await h.advance(650);
        assert.equal(new URL(h.navigations[0]).searchParams.get('return'), '/p/456#answer');
    });
});
