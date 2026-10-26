const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const code = transformSync(fs.readFileSync(path.join(__dirname, '../packages/ui-default/pages/scratch_editor.page.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
function setup(response = async () => new Response(new Blob(['project'])), config = {}) {
    const dom = new JSDOM(`<div data-scratch-editor><div data-scratch-loading data-step="1"><h1 data-scratch-loading-title></h1><p data-scratch-loading-hint></p><div data-scratch-progress></div><button data-scratch-retry hidden></button></div><span data-scratch-status></span><button data-scratch-save disabled></button><iframe data-scratch-frame></iframe></div>`, { url: 'https://classroom.test/d/art/scratch/editor' });
    const { window } = dom;
    const document = window.document;
    const frame = document.querySelector('iframe');
    const sent = [];
    const requests = [];
    const redirects = [];
    const timers = new Map();
    let presetOptions;
    let callback;
    vm.runInNewContext(code, {
        module: { exports: {} }, exports: {}, window, document, location: window.location,
        UiContext: { scratchEditor: { title: '作品', projectUrl: '/project.sb3', saveUrl: '/save', maxFileSize: 1024, revision: 1, readOnly: false, ...config } },
        crypto: { randomUUID: () => 'channel' }, URL, Blob, FormData, ArrayBuffer, AbortController,
        setTimeout: (fn, ms) => { timers.set(ms, fn); return ms; }, clearTimeout: (ms) => timers.delete(ms),
        fetch: async (...args) => { requests.push(args); return response(...args); },
        require: (id) => {
            if (id.endsWith('/daily_quiz_gate')) return { redirectToDailyQuiz(url) {
                const allowed = window.dispatchEvent(new window.CustomEvent('hydro:daily-quiz-redirect', {
                    cancelable: true, detail: { url: new URL(url, window.location.href).href, waitUntil() {} },
                }));
                redirects.push({ url, allowed });
                return allowed;
            } };
            if (id.endsWith('/scratch-preset-picker')) return { createScratchPresetPicker(options) {
                presetOptions = options; return { receive: () => false };
            } };
            return { NamedPage: class { constructor(_, fn) { callback = fn; } } };
        },
    });
    callback();
    frame.contentWindow.postMessage = (data) => sent.push(data);
    const message = async (type, extra = {}, overrides = {}) => {
        window.dispatchEvent(new window.MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel: 'channel', type, ...extra }, ...overrides }));
        await flush();
    };
    const redirect = () => window.dispatchEvent(new window.CustomEvent('hydro:daily-quiz-redirect', {
        cancelable: true, detail: { url: 'https://classroom.test/daily-quiz', waitUntil() {} },
    }));
    return { document, window, sent, requests, redirects, timers, message, redirect,
        presetBusy: value => presetOptions.onBusy(value),
        get: (name) => document.querySelector(`[data-scratch-${name}]`), close: () => window.close() };
}
test('progress follows real initialization, ignores duplicate ready, enables save only when loaded', async () => {
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    const ui = setup(() => pending);
    try {
        await ui.message('ready', {}, { origin: 'https://untrusted.test' });
        assert.equal(ui.requests.length, 0);
        await ui.message('loaded');
        assert.equal(ui.get('loading').hidden, false);
        await ui.message('ready');
        assert.equal(ui.get('loading').dataset.step, '2');
        assert(ui.get('save').disabled);
        await ui.message('ready');
        assert.equal(ui.requests.length, 1);
        resolve(new Response(new Blob(['project'])));
        await flush();
        assert.equal(ui.get('loading').dataset.step, '3');
        assert.equal(ui.sent[0].type, 'init');
        await ui.message('loaded');
        assert(ui.get('loading').hidden);
        assert(!ui.get('save').disabled);
        assert(!ui.timers.has(180000));
    } finally { ui.close(); }
});
test('load errors offer retry without enabling save or concealing the failure on a late message', async () => {
    const ui = setup(async () => new Response('', { status: 403 }));
    try {
        await ui.message('ready');
        assert.equal(ui.get('loading').dataset.error, 'true');
        assert.match(ui.get('loading-hint').textContent, /访问权限/);
        assert.equal(ui.get('retry').hidden, false);
        assert(ui.get('save').disabled);
        await ui.message('loaded');
        assert.equal(ui.get('loading').hidden, false);
        assert(ui.get('save').disabled);
    } finally { ui.close(); }
});
test('stalled loads abort pending requests and never pretend to be complete', async () => {
    const ui = setup(() => new Promise(() => {}));
    try {
        await ui.message('ready');
        ui.timers.get(25000)();
        assert.match(ui.get('loading-hint').textContent, /第一次打开/);
        ui.timers.get(180000)();
        assert(ui.requests[0][1].signal.aborted);
        assert.equal(ui.get('retry').hidden, false);
        assert(ui.get('progress').hidden);
        assert.equal(ui.sent.length, 0);
    } finally { ui.close(); }
});

test('daily practice leaves clean Scratch pages directly but preserves dirty works with an explicit new-tab entry', async () => {
    const ui = setup();
    try {
        await ui.message('ready');
        await ui.message('loaded');
        assert.equal(ui.redirect(), true);
        await ui.message('dirty');
        assert.equal(ui.redirect(), false);
        const link = ui.get('daily-quiz');
        assert.equal(link.href, 'https://classroom.test/daily-quiz');
        assert.equal(link.target, '_blank');
        assert.equal(link.rel, 'noopener');
        assert.match(ui.get('status').textContent, /作品已保留/);
        assert.match(link.textContent, /每日一练/);
        assert.equal(ui.redirect(), false);
        assert.equal(ui.document.querySelectorAll('[data-scratch-daily-quiz]').length, 1);
        assert.equal(ui.requests.length, 1, 'navigation must not attempt an unauthorized cloud autosave');
    } finally { ui.close(); }
});

test('daily practice does not interrupt a pending Scratch export or asset import', async () => {
    const ui = setup(undefined, { libraryUrl: '/library' });
    try {
        await ui.message('ready');
        await ui.message('loaded');
        ui.presetBusy(true);
        assert.equal(ui.redirect(), false);
        ui.presetBusy(false);
        assert.equal(ui.redirect(), true);
        ui.get('save').click();
        assert.equal(ui.sent.at(-1).type, 'export');
        assert.equal(ui.redirect(), false);
    } finally { ui.close(); }
});

test('blocked Scratch saves use the same daily practice guard for old and new response formats', async () => {
    for (const error of [{ error: 'daily_quiz_required' }, { code: 'daily_quiz_required', error: { message: '请先完成每日一练' } }]) {
        const ui = setup(async url => url.endsWith('/save')
            ? new Response(JSON.stringify({ ...error, dailyQuizUrl: '/daily-quiz' }), { status: 403 })
            : new Response(new Blob(['project'])));
        try {
            await ui.message('ready');
            await ui.message('loaded');
            await ui.message('dirty');
            ui.get('save').click();
            await ui.message('exported', { id: 'channel', file: new ArrayBuffer(2) });
            assert.deepEqual(ui.redirects, [{ url: '/daily-quiz', allowed: false }]);
            assert.match(ui.get('status').textContent, /每日一练.*作品已保留/);
            assert.ok(ui.get('daily-quiz'));
            assert.equal(ui.get('save').disabled, false, 'the rejected request releases its busy state');
            assert.equal(ui.sent.some(message => message.type === 'saved'), false);
        } finally { ui.close(); }
    }
});
