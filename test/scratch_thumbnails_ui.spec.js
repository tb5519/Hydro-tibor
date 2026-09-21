const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const pageSource = fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/pages/scratch_thumbnails.page.ts'), 'utf8');
const compiled = transformSync(pageSource, { loader: 'ts', format: 'cjs' }).code;
const origin = 'https://classroom.example';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
const card = (id) => `<div id="${id}" data-scratch-thumbnail="/d/art/scratch/work/${id}/thumbnail">
  <img data-scratch-thumbnail-image hidden><span data-scratch-thumbnail-placeholder>正在准备封面</span></div>`;
const config = (extra = {}) => ({ title: '学生的作品', revision: 7, thumbnailUrl: null,
    projectUrl: '/d/art/scratch/file/project', canCache: true, maxFileSize: 20 * 1024 * 1024, ...extra });
const flush = async () => {
    for (let i = 0; i < 4; i++) await new Promise(setImmediate);
};
const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};

function setup(html, handler = () => config(), project = () => new Blob(['saved project'])) {
    const dom = new JSDOM(html, { url: `${origin}/d/art/scratch` });
    const { window } = dom;
    const requests = [];
    const frames = [];
    const sent = [];
    const timers = new Map();
    const observers = [];
    let nextId = 0;
    let page;
    const realAppend = window.document.body.appendChild.bind(window.document.body);
    window.document.body.appendChild = (element) => {
        const result = realAppend(element);
        if (element.tagName === 'IFRAME') {
            frames.push(element);
            element.contentWindow.postMessage = (data, targetOrigin, transfer) => {
                sent.push({ frame: element, data, targetOrigin, transfer });
            };
        }
        return result;
    };
    class Observer {
        constructor(callback) {
            this.callback = callback;
            this.targets = new Set();
            this.disconnected = false;
            observers.push(this);
        }

        observe(target) { this.targets.add(target); }
        unobserve(target) { this.targets.delete(target); }
        disconnect() { this.disconnected = true; this.targets.clear(); }
        enter(...ids) {
            this.callback(ids.map((id) => ({ target: window.document.getElementById(id), isIntersecting: true })));
        }
    }
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module, exports: module.exports, document: window.document, window, location: window.location,
        UiContext: { scratch: { editorVersion: 'a'.repeat(64) } },
        URL, URLSearchParams, AbortController, Blob, ArrayBuffer,
        crypto: { randomUUID: () => `request-${++nextId}` },
        IntersectionObserver: Observer,
        setTimeout: (callback, duration) => {
            const id = ++nextId;
            timers.set(id, { callback, duration });
            return id;
        },
        clearTimeout: (id) => timers.delete(id),
        fetch: async (url, options = {}) => {
            const request = { url, options };
            requests.push(request);
            if (options.method === 'POST') return { ok: true, json: async () => ({ ok: true }) };
            if (url.includes('/scratch/file/')) return { ok: true, blob: () => project(request) };
            return { ok: true, json: () => handler(request) };
        },
        require: (name) => {
            assert.equal(name, 'vj/misc/Page');
            return { NamedPage: class {
                constructor(names, callback) { page = { names, callback }; }
            } };
        },
    });
    page.callback();
    const message = (frame, data, overrides = {}) => {
        const channel = new URLSearchParams(new URL(frame.src).hash.slice(1)).get('channel');
        window.dispatchEvent(new window.MessageEvent('message', {
            source: frame.contentWindow, origin: 'null', data: { channel, ...data }, ...overrides,
        }));
    };
    return {
        window, requests, frames, sent, timers, observers,
        get: (id) => window.document.getElementById(id),
        visible: (...ids) => observers[0].enter(...ids),
        message,
        async ready(frame = frames.at(-1)) { message(frame, { type: 'ready' }); await flush(); },
        async complete(index = sent.length - 1, thumbnail = png) {
            const request = sent[index];
            message(request.frame, { type: 'thumbnail', id: request.data.id, thumbnail });
            await flush();
        },
        async timeout(duration) {
            const matches = [...timers].filter(([, timer]) => timer.duration === duration);
            assert.ok(matches.length, `Expected pending ${duration}ms timer`);
            for (const [id, timer] of matches) { timers.delete(id); timer.callback(); }
            await flush();
        },
        leave() { window.dispatchEvent(new window.Event('pagehide')); },
        dispose() { this.leave(); window.close(); },
    };
}

describe('Scratch work cover previews', () => {
    it('does not create an observer, request, or VM when every cover already exists', () => {
        const ui = setup('<article><img loading="lazy" src="/d/art/scratch/file/cover"></article>');
        try {
            assert.equal(ui.observers.length, 0);
            assert.equal(ui.requests.length, 0);
            assert.equal(ui.frames.length, 0);
        } finally { ui.dispose(); }
    });

    it('only loads visible missing covers and uses a newly available cached image without a VM', async () => {
        const ui = setup(card('visible') + card('below-fold'), () => config({ thumbnailUrl: '/d/art/scratch/file/cover' }));
        try {
            assert.equal(ui.requests.length, 0);
            ui.visible('visible');
            await flush();
            assert.equal(ui.requests.length, 1);
            assert.ok(ui.requests[0].url.includes('/visible/thumbnail'));
            assert.equal(ui.frames.length, 0);
            assert.equal(ui.get('visible').querySelector('img').src, `${origin}/d/art/scratch/file/cover`);
            assert.equal(ui.get('visible').querySelector('img').hidden, false);
            assert.equal(ui.get('below-fold').querySelector('img').hidden, true);
        } finally { ui.dispose(); }
    });

    it('rejects messages from another window, non-opaque origin, wrong channel, or another request', async () => {
        const ui = setup(card('first'));
        try {
            ui.visible('first');
            await flush();
            const frame = ui.frames[0];
            assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
            assert(frame.src.startsWith(`${origin}/scratch-editor/editor.html?v=${'a'.repeat(64)}&lang=zh-cn#`));
            ui.message(frame, { type: 'ready' }, { source: ui.window });
            ui.message(frame, { type: 'ready' }, { origin });
            ui.message(frame, { type: 'ready', channel: 'unrelated' });
            await flush();
            assert.equal(ui.sent.length, 0);
            await ui.ready(frame);
            assert.equal(ui.sent.length, 1);
            const request = ui.sent[0];
            for (const overrides of [{ source: ui.window }, { origin }, { data: { channel: 'wrong', type: 'thumbnail', id: request.data.id, thumbnail: png } }]) {
                ui.message(frame, { type: 'thumbnail', id: request.data.id, thumbnail: png }, overrides);
            }
            ui.message(frame, { type: 'thumbnail', id: 'another-work', thumbnail: png });
            await flush();
            assert.equal(ui.get('first').querySelector('img').hidden, true);
            assert.equal(ui.requests.filter(({ options }) => options.method === 'POST').length, 0);
            await ui.complete();
            assert.equal(ui.get('first').querySelector('img').src, png);
        } finally { ui.dispose(); }
    });

    it('serializes multiple cards through one read-only sandbox and caches only the matching revision', async () => {
        const ui = setup(card('first') + card('second'));
        try {
            ui.visible('first', 'second');
            await flush();
            await ui.ready();
            assert.equal(ui.frames.length, 1);
            assert.equal(ui.sent.length, 1);
            assert.equal(ui.sent[0].data.type, 'init');
            assert.equal(ui.sent[0].data.mode, 'thumbnail');
            assert.equal(ui.sent[0].data.readOnly, true);
            assert.ok(!('saveUrl' in ui.sent[0].data));
            assert.equal(ui.requests.filter(({ url }) => url.includes('/second/')).length, 0);
            await ui.complete(0);
            assert.equal(ui.frames.length, 1);
            assert.equal(ui.sent.length, 2);
            assert.equal(ui.sent[1].frame, ui.sent[0].frame);
            assert.equal(ui.sent[1].data.type, 'preview');
            assert.notEqual(ui.sent[1].data.id, ui.sent[0].data.id);
            ui.message(ui.frames[0], { type: 'thumbnail', id: ui.sent[0].data.id, thumbnail: png });
            await flush();
            assert.equal(ui.get('second').querySelector('img').hidden, true);
            await ui.complete(1);
            const writes = ui.requests.filter(({ options }) => options.method === 'POST');
            assert.equal(writes.length, 2);
            for (const { url, options } of writes) {
                assert.ok(url.endsWith('/thumbnail'));
                assert.equal(options.body.get('revision'), '7');
                assert.equal(options.body.get('thumbnail'), png);
                assert.deepEqual([...options.body.keys()].sort(), ['revision', 'thumbnail']);
            }
            await ui.timeout(15000);
            assert.equal(ui.window.document.querySelectorAll('iframe').length, 0);
        } finally { ui.dispose(); }
    });

    it('renders a non-owner preview without making a cache write', async () => {
        const ui = setup(card('student-work'), () => config({ canCache: false }));
        try {
            ui.visible('student-work');
            await flush();
            await ui.ready();
            await ui.complete();
            assert.equal(ui.get('student-work').querySelector('img').hidden, false);
            assert.equal(ui.requests.filter(({ options }) => options.method === 'POST').length, 0);
        } finally { ui.dispose(); }
    });

    it('does not fetch server-provided off-origin project URLs', async () => {
        const ui = setup(card('blocked'), () => config({ projectUrl: 'https://outside.example/private.sb3' }));
        try {
            ui.visible('blocked');
            await flush();
            assert.ok(ui.requests.every(({ url }) => new URL(url).origin === origin));
            assert.equal(ui.window.document.querySelectorAll('iframe').length, 0);
            assert.equal(ui.get('blocked').querySelector('img').hidden, true);
            assert.equal(ui.requests.filter(({ options }) => options.method === 'POST').length, 0);
        } finally { ui.dispose(); }
    });

    it('removes a sandbox when startup or an individual preview times out', async () => {
        for (const ready of [false, true]) {
            const ui = setup(card('slow'));
            try {
                ui.visible('slow');
                await flush();
                if (ready) await ui.ready();
                await ui.timeout(ready ? 30000 : 45000);
                assert.equal(ui.window.document.querySelectorAll('iframe').length, 0);
                assert.equal(ui.get('slow').querySelector('img').hidden, true);
                assert.ok(ui.get('slow').querySelector('span').textContent.includes('打开作品'));
            } finally { ui.dispose(); }
        }
    });

    it('drops the sandbox and ignores further results after leaving the page', async () => {
        const ui = setup(card('first') + card('second'));
        try {
            ui.visible('first', 'second');
            await flush();
            await ui.ready();
            const source = ui.frames[0].contentWindow;
            const message = { ...ui.sent[0].data, type: 'thumbnail', thumbnail: png };
            ui.leave();
            ui.window.dispatchEvent(new ui.window.MessageEvent('message', { source, origin: 'null', data: message }));
            await flush();
            assert.equal(ui.window.document.querySelectorAll('iframe').length, 0);
            assert.equal(ui.observers[0].disconnected, true);
            assert.equal(ui.sent.length, 1);
            assert.equal(ui.get('first').querySelector('img').hidden, true);
            assert.equal(ui.requests.filter(({ options }) => options.method === 'POST').length, 0);
        } finally { ui.dispose(); }
    });

    it('does not create a new sandbox if a configuration finishes parsing after pagehide', async () => {
        const response = deferred();
        const ui = setup(card('late'), () => response.promise);
        try {
            ui.visible('late');
            await flush();
            ui.leave();
            assert.equal(ui.requests[0].options.signal.aborted, true, 'pending configuration read must abort');
            response.resolve(config());
            await flush();
            assert.equal(ui.frames.length, 0);
            assert.equal(ui.window.document.querySelectorAll('iframe').length, 0);
        } finally { ui.dispose(); }
    });

    it('times out a stalled project-body download even when the shared VM is already ready', async () => {
        let downloads = 0;
        let stalled;
        const ui = setup(card('first') + card('second'), () => config(), (request) => {
            if (++downloads === 1) return new Blob(['first project']);
            stalled = request;
            return new Promise((resolve, reject) => request.options.signal.addEventListener('abort', () => {
                reject(new Error('Aborted response body'));
            }, { once: true }));
        });
        try {
            ui.visible('first', 'second');
            await flush();
            await ui.ready();
            await ui.complete(0);
            assert.equal(ui.frames.length, 1);
            assert.equal(ui.sent.length, 1, 'second project must not initialize until its bytes arrive');
            assert.ok(stalled);
            assert.equal(stalled.options.signal.aborted, false);
            await ui.timeout(45000);
            assert.equal(stalled.options.signal.aborted, true);
            assert.equal(ui.window.document.querySelectorAll('iframe').length, 0);
            assert.equal(ui.get('first').querySelector('img').hidden, false);
            assert.equal(ui.get('second').querySelector('img').hidden, true);
            assert.ok(ui.get('second').querySelector('span').textContent.includes('打开作品'));
        } finally { ui.dispose(); }
    });

    it('rejects an SVG or oversized thumbnail instead of displaying or caching sandbox-controlled markup', async () => {
        for (const thumbnail of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024)]) {
            const ui = setup(card('invalid'));
            try {
                ui.visible('invalid');
                await flush();
                await ui.ready();
                await ui.complete(0, thumbnail);
                assert.equal(ui.get('invalid').querySelector('img').hidden, true);
                assert.equal(ui.requests.filter(({ options }) => options.method === 'POST').length, 0);
                assert.equal(ui.window.document.querySelectorAll('iframe').length, 0);
            } finally { ui.dispose(); }
        }
    });
});
