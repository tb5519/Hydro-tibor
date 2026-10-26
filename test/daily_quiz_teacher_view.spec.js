const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const PRIV = { PRIV_USER_PROFILE: 1, PRIV_EDIT_SYSTEM: 2, PRIV_JUDGE: 4 };
class ForbiddenError extends Error {}
class ValidationError extends Error {}

function loadSource(filename, imports) {
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src', filename), 'utf8');
    const code = transformSync(source, {
        loader: 'ts', format: 'cjs', target: 'es2022',
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    vm.runInNewContext(code, {
        module, exports: module.exports, URL,
        require(name) {
            if (Object.hasOwn(imports, name)) return imports[name];
            throw new Error(`Unexpected dependency ${name} in ${filename}`);
        },
    }, { filename });
    return module.exports;
}

async function fixture({ teacherView = false, json = false, required = true, spoofMarker = false } = {}) {
    const reads = [];
    const events = new Map();
    const quiz = {
        async getSession(uid) {
            reads.push(uid);
            return { policy: {}, session: { required } };
        },
        presentSession(_policy, session) { return session; },
    };
    const helpers = loadSource('lib/daily_quiz.ts', {
        crypto: require('node:crypto'), '../error': { ValidationError },
    });
    const handlers = loadSource('handler/daily_quiz.ts', {
        'mime-types': { lookup: () => 'image/png' },
        '../error': { ForbiddenError },
        '../lib/daily_quiz': helpers,
        '../model/builtin': { PRIV },
        '../model/daily_quiz': quiz,
        '../model/storage': {},
        '../service/server': { Handler: class {}, param: () => () => {}, Types: {} },
    });
    await handlers.apply({ Route() {}, on(name, callback) { events.set(name, callback); } });
    const headers = {};
    const handler = {
        user: { _id: 24, hasPriv: (priv) => priv === PRIV.PRIV_USER_PROFILE },
        session: { uid: 24, sudoUid: teacherView ? 2 : null },
        UiContext: {}, args: {},
        request: {
            method: 'GET', path: '/p', originalPath: '/d/python/p', json,
            querystring: 'page=2', host: 'onebyone.run', headers: {},
            query: spoofMarker ? { sudoUid: 2, teacherPreview: true } : {},
            body: spoofMarker ? { sudoUid: 2, teacherPreview: true } : {},
        },
        response: { addHeader(name, value) { headers[name] = value; } },
    };
    return { events, handler, reads, handlers, headers };
}

describe('daily quiz entry is isolated from teacher account inspection', () => {
    it('does not create, settle or read a learner quiz through the HTTP gate in a switched teacher session', async () => {
        const { events, handler, reads } = await fixture({ teacherView: true });
        assert.equal(await events.get('handler/before-prepare')(handler), undefined);
        assert.equal(reads.length, 0);
        assert.equal(handler.response.redirect, undefined);
        assert.equal(handler.response.status, undefined);
    });

    it('does not create, settle or read a learner quiz through the websocket gate in a switched teacher session', async () => {
        const { events, handler, reads } = await fixture({ teacherView: true });
        await events.get('handler/create/ws')(handler);
        assert.equal(reads.length, 0);
    });

    it('allows read-only avatar appearance on the quiz screen without creating or settling a quiz', async () => {
        const { events, handler, reads } = await fixture({ json: true });
        handler.request.path = '/user/avatar-effects';
        assert.equal(await events.get('handler/before-prepare')(handler), undefined);
        assert.equal(reads.length, 0);
        assert.equal(handler.response.status, undefined);
    });

    it('allows only decorative GET/HEAD requests during the quiz; mutations and learning pages remain gated', async () => {
        const paths = ['/image-warmup', '/background-video-warmup', '/learning-media-warmup', '/code-editor/themes',
            '/code-editor/theme-asset/' + 'a'.repeat(32) + '/' + 'b'.repeat(24),
            '/home/poster', '/home/video', '/home/video-poster',
            ...['background', 'ac-image', 'background-video', 'background-video-poster', 'theme-sound', 'icon-image'].map((kind) => `/badge/7/${kind}`)];
        for (const path of paths) {
            for (const method of ['GET', 'HEAD']) {
                const f = await fixture({ json: true });
                Object.assign(f.handler.request, { path, method });
                assert.equal(await f.events.get('handler/before-prepare')(f.handler), undefined, `${method} ${path}`);
                assert.equal(f.reads.length, 0, 'asset warming must not create/advance a quiz session');
            }
            const f = await fixture({ json: true });
            Object.assign(f.handler.request, { path, method: 'POST' });
            assert.equal(await f.events.get('handler/before-prepare')(f.handler), 'cleanup', `POST ${path}`);
            assert.equal(f.handler.response.status, 403);
        }
        for (const path of ['/code-editor/themes/select', '/code-editor/theme-asset/private', '/badge/7/edit', '/badge/7', '/home', '/p/1/submit']) {
            const f = await fixture({ json: true });
            f.handler.request.path = path;
            assert.equal(await f.events.get('handler/before-prepare')(f.handler), 'cleanup', path);
        }
    });

    it('still redirects the same learner using their own login before a normal HTML page', async () => {
        const { events, handler, reads } = await fixture();
        assert.equal(await events.get('handler/before-prepare')(handler), 'cleanup');
        assert.deepEqual(reads, [24]);
        assert.equal(handler.response.redirect, '/daily-quiz?return=%2Fd%2Fpython%2Fp%3Fpage%3D2');
    });

    it('still blocks learner JSON requests and ignores spoofed teacher-view query or body fields', async () => {
        const { events, handler, reads } = await fixture({ json: true, spoofMarker: true });
        assert.equal(await events.get('handler/before-prepare')(handler), 'cleanup');
        assert.deepEqual(reads, [24]);
        assert.equal(handler.response.status, 403);
        assert.equal(handler.response.body.error.code, 'daily_quiz_required');
        assert.equal(handler.response.body.error.message, handler.response.body.message);
        assert(handler.response.body.error.message.includes('每日一练'));
    });

    it('still rejects learner websocket connections until their actual quiz is complete', async () => {
        const { events, handler, reads } = await fixture();
        await assert.rejects(events.get('handler/create/ws')(handler), ForbiddenError);
        assert.deepEqual(reads, [24]);
    });

    it('permits completed genuine learners through both entry paths without teacher-view markers', async () => {
        const { events, handler, reads } = await fixture({ required: false });
        assert.equal(await events.get('handler/before-prepare')(handler), undefined);
        await events.get('handler/create/ws')(handler);
        assert.deepEqual(reads, [24, 24]);
        assert.equal(handler.response.redirect, undefined);
        assert.equal(handler.response.status, undefined);
    });

    it('exposes no-store, server-timed status only for the currently authenticated learner', async () => {
        const f = await fixture();
        const before = Date.now();
        await f.handlers.DailyQuizStatusHandler.prototype.get.call(f.handler);
        assert.deepEqual(f.reads, [24]);
        assert.equal(f.handler.response.body.state.required, true);
        assert(f.handler.response.body.serverNow >= before && f.handler.response.body.serverNow <= Date.now());
        assert.equal(f.headers['Cache-Control'], 'private, no-store');
    });

    it('does not create or advance practice when checking status as a teacher, administrator or judge', async () => {
        for (const mode of ['teacher', 'admin', 'judge']) {
            const f = await fixture({ teacherView: mode === 'teacher' });
            if (mode !== 'teacher') f.handler.user.hasPriv = (priv) => priv === PRIV.PRIV_USER_PROFILE
                || priv === PRIV[mode === 'admin' ? 'PRIV_EDIT_SYSTEM' : 'PRIV_JUDGE'];
            await f.handlers.DailyQuizStatusHandler.prototype.get.call(f.handler);
            assert.equal(f.handler.response.body.state.required, false);
            assert.equal(f.handler.response.body.state.teacherPreview, mode === 'teacher' ? true : undefined);
            assert.equal(f.reads.length, 0);
            assert.equal(await f.events.get('handler/before-prepare')(f.handler), undefined);
            await f.events.get('handler/create/ws')(f.handler);
            assert.equal(f.reads.length, 0);
        }
    });

    it('adds the cross-day watcher to successful student pages without reading or starting a practice session', async () => {
        const f = await fixture({ required: false });
        f.handler.response.template = 'problem_detail.html';
        f.handlers.injectDailyQuizGate(f.handler);
        assert.equal(f.handler.UiContext.dailyQuizGate.statusUrl, '/daily-quiz/status');
        assert.equal(typeof f.handler.UiContext.dailyQuizGate.serverNow, 'number');
        assert.equal(f.headers['Cache-Control'], 'private, no-store');
        assert.equal(f.reads.length, 0, 'a currently disabled learner still needs the watcher if a teacher later enables practice');
    });

    it('does not inject the cross-day watcher into exempt identities, quiz pages, JSON, errors or redirects', async () => {
        const cases = [
            (f) => { f.handler.session.sudoUid = 2; },
            (f) => { f.handler.user.hasPriv = () => false; },
            (f) => { f.handler.user.hasPriv = (priv) => priv === PRIV.PRIV_USER_PROFILE || priv === PRIV.PRIV_EDIT_SYSTEM; },
            (f) => { f.handler.user.hasPriv = (priv) => priv === PRIV.PRIV_USER_PROFILE || priv === PRIV.PRIV_JUDGE; },
            (f) => { f.handler.request.path = '/daily-quiz'; },
            (f) => { f.handler.request.path = '/login'; },
            (f) => { f.handler.response.template = 'daily_quiz.html'; },
            (f) => { f.handler.request.json = true; },
            (f) => { f.handler.request.websocket = true; },
            (f) => { f.handler.request.method = 'POST'; },
            (f) => { f.handler.response.status = 403; },
            (f) => { f.handler.response.redirect = '/login'; },
            (f) => { f.handler.request.query.noTemplate = true; },
            (f) => { f.handler.args.pjax = 'content'; },
        ];
        for (const change of cases) {
            const f = await fixture();
            f.handler.response.template = 'problem_detail.html';
            change(f);
            f.handlers.injectDailyQuizGate(f.handler);
            assert.equal(f.handler.UiContext.dailyQuizGate, undefined);
            assert.equal(f.reads.length, 0);
        }
    });

    it('redirects stale native form submissions to practice and returns to the same-domain source page', async () => {
        const f = await fixture();
        Object.assign(f.handler.request, {
            method: 'POST', path: '/p/12/submit', originalPath: '/d/python/p/12/submit',
            referer: 'https://onebyone.run/d/python/p/12?tid=contest',
            headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' },
        });
        assert.equal(await f.events.get('handler/before-prepare')(f.handler), 'cleanup');
        assert.equal(f.handler.response.redirect, '/daily-quiz?return=%2Fd%2Fpython%2Fp%2F12%3Ftid%3Dcontest');
        assert.equal(f.headers['Cache-Control'], 'private, no-store');
        assert.equal(f.handler.response.status, undefined);
    });

    it('never uses an external or unsafe referrer, nor a POST action endpoint, as the return destination', async () => {
        for (const referer of ['https://evil.example/p', '//evil.example/p', 'https://onebyone.run.evil.example/p',
            'javascript:alert(1)', 'https://onebyone.run@evil.example/p', '/daily-quiz', '']) {
            const f = await fixture();
            Object.assign(f.handler.request, { method: 'POST', path: '/p/12/submit', originalPath: '/d/python/p/12/submit', referer });
            await f.events.get('handler/before-prepare')(f.handler);
            const actual = new URL(f.handler.response.redirect, 'https://onebyone.run').searchParams.get('return');
            assert(['/', '/d/python/p/12'].includes(actual), referer);
        }
    });

    it('keeps AJAX and JSON form requests machine-readable even without an Accept header', async () => {
        for (const headers of [{ 'x-requested-with': 'XMLHttpRequest' }, { 'content-type': 'application/json' },
            { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }, { 'sec-fetch-mode': 'same-origin', 'sec-fetch-dest': 'empty' }]) {
            const f = await fixture();
            Object.assign(f.handler.request, { method: 'POST', path: '/p/12/submit', originalPath: '/d/python/p/12/submit', headers });
            await f.events.get('handler/before-prepare')(f.handler);
            assert.equal(f.handler.response.status, 403);
            assert.equal(f.handler.response.body.error.code, 'daily_quiz_required');
            assert.equal(f.handler.response.body.code, 'daily_quiz_required');
            assert.equal(f.handler.response.redirect, undefined);
            assert.equal(f.handler.response.body.dailyQuizUrl, '/daily-quiz?return=%2Fd%2Fpython%2Fp%2F12');
        }
    });
});
