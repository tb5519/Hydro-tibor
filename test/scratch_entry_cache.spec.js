const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { buildSync } = require('esbuild');

const code = buildSync({
    entryPoints: [path.join(__dirname, '../packages/ui-default/service-worker.ts')],
    bundle: true, write: false, format: 'cjs', define: { 'process.env.NODE_ENV': '"production"' },
}).outputFiles[0].text;

function setup(options = {}) {
    const stores = new Map();
    const listeners = new Map();
    const requests = [];
    const rawRequests = [];
    const intercepted = [];
    let claimed = false;
    const urlOf = (request) => typeof request === 'string' ? request : request.url;
    const caches = {
        keys: async () => [...stores.keys()],
        delete: async (name) => stores.delete(name),
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Map());
            const entries = stores.get(name);
            return {
                keys: async () => [...entries.keys()].map((url) => new Request(url)),
                delete: async (request) => entries.delete(urlOf(request)),
                put: async (request, response) => entries.set(urlOf(request), response.clone()),
            };
        },
        async match(request) {
            for (const entries of stores.values()) {
                if (entries.has(urlOf(request))) return entries.get(urlOf(request)).clone();
            }
            return undefined;
        },
    };
    const location = new URL('https://classroom.test/service-worker.js');
    const network = async (request, init) => {
        requests.push(urlOf(request));
        rawRequests.push({ request, init });
        if (options.fetch) return options.fetch(request, init);
        return new Response('current editor', { headers: { 'Cache-Control': 'no-cache' } });
    };
    vm.runInNewContext(code, {
        module: { exports: {} }, exports: {}, URL, Request, Response, Headers, location, caches,
        console: { log() {}, debug() {}, warn() {} },
        self: { location, clients: { claim: async () => { claimed = true; } },
            addEventListener: (type, callback) => listeners.set(type, callback) },
        fetch: network,
    });
    const cfg = { hosts: ['https://classroom.test/'], assets: ['https://cdn.test/'], domains: [], ...options.config };
    listeners.get('fetch')({ request: new Request('https://classroom.test/service-worker-config', {
        method: 'POST', body: JSON.stringify(cfg),
    }), respondWith() {} });
    return { stores, caches, requests, rawRequests, intercepted, get claimed() { return claimed; },
        async fetch(url) {
            // Allow the real config message's async JSON parsing to finish.
            await new Promise(setImmediate);
            let response;
            const request = url instanceof Request ? url : new Request(url);
            listeners.get('fetch')({ request, respondWith: (value) => { response = value; intercepted.push(request); } });
            return response || network(request); // An unintercepted request proceeds through the browser normally.
        },
        async activate() {
            let pending;
            listeners.get('activate')({ waitUntil: (promise) => { pending = promise; } });
            await pending;
        },
    };
}

test('old Scratch HTML never wins over the deployed entry, including signed-out share players', async () => {
    const sw = setup();
    const cache = await sw.caches.open('ui-resources-cache');
    for (const url of [
        'https://classroom.test/scratch-editor/editor.html?lang=zh-cn',
        'https://classroom.test/scratch-editor/editor.html?v=build2&lang=zh-cn',
        'https://cdn.test/static/release/scratch-editor/editor.html',
    ]) {
        await cache.put(url, new Response('broken old editor'));
        assert.equal(await (await sw.fetch(url)).text(), 'current editor');
        assert.equal(sw.requests.at(-1), url);
        assert.equal(await (await sw.caches.match(url)).text(), 'broken old editor', 'HTML must not be written back to CacheStorage');
    }
});

test('document and iframe navigations preserve the original Request and never read or populate asset caches', async () => {
    const sw = setup({ config: { domains: ['mirror.test'] } });
    const cache = await sw.caches.open('ui-resources-cache');
    for (const destination of ['document', 'iframe']) {
        const url = `https://classroom.test/page-${destination}.html`;
        await cache.put(url, new Response('stale HTML'));
        const request = new Request(url, { credentials: 'include', redirect: 'manual' });
        Object.defineProperties(request, { mode: { value: 'navigate' }, destination: { value: destination } });
        assert.equal(await (await sw.fetch(request)).text(), 'current editor');
        assert.equal(sw.rawRequests.at(-1).request, request);
        assert.equal(sw.intercepted.includes(request), false, 'even forwarding fetch(request) loses browser navigation destination');
        assert.equal(sw.rawRequests.at(-1).init, undefined, 'browser-managed navigation metadata must be preserved');
        assert.equal(await (await sw.caches.match(url)).text(), 'stale HTML');
    }
});

test('navigation POSTs and mutation requests pass through once with their bodies and failed responses intact', async () => {
    const sw = setup({ config: { domains: ['mirror.test', 'second-mirror.test'] },
        fetch: async () => new Response('do not submit twice', { status: 500, headers: { Vary: 'Sec-Fetch-Dest' } }) });
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const request = new Request('https://classroom.test/save', { method, body: 'answer=123', credentials: 'include', redirect: 'follow' });
        if (method === 'POST') Object.defineProperties(request, { mode: { value: 'navigate' }, destination: { value: 'iframe' } });
        const before = sw.requests.length;
        const response = await sw.fetch(request);
        assert.equal(response.status, 500);
        assert.equal(response.headers.get('Vary'), 'Sec-Fetch-Dest');
        assert.equal(await response.text(), 'do not submit twice');
        assert.equal(sw.requests.length, before + 1);
        assert.equal(sw.rawRequests.at(-1).request, request);
        assert.equal(sw.intercepted.includes(request), false);
        assert.equal(sw.rawRequests.at(-1).init, undefined);
        assert.equal(await request.text(), 'answer=123');
    }
});

test('activation removes obsolete editor entries in both owned caches but keeps reusable hashed assets', async () => {
    const sw = setup();
    const oldEntry = 'https://classroom.test/scratch-editor/editor.html?lang=zh-cn';
    const editorJs = 'https://cdn.test/static/release/scratch-editor/js/editor.abc123.js';
    for (const name of ['ui-resources-cache', 'assets']) {
        const cache = await sw.caches.open(name);
        await cache.put(oldEntry, new Response('old'));
        await cache.put(editorJs, new Response('hashed bundle'));
    }
    const other = await sw.caches.open('another-app');
    await other.put(oldEntry, new Response('not ours'));
    await sw.caches.open('precache-obsolete');
    await sw.activate();
    assert(sw.claimed);
    assert(!sw.stores.has('precache-obsolete'));
    for (const name of ['ui-resources-cache', 'assets']) {
        assert(!sw.stores.get(name).has(oldEntry));
        assert(sw.stores.get(name).has(editorJs));
    }
    assert(sw.stores.get('another-app').has(oldEntry));
    assert.equal(await (await sw.fetch(editorJs)).text(), 'hashed bundle');
    assert.equal(sw.requests.length, 0, 'Existing hashed JS still loads without another network download');
});

test('legacy cached media cannot hide the current version selected by its HTTP redirect', async () => {
    const sw = setup();
    const urls = [
        'https://classroom.test/scratch-editor/static/assets/backdrop.png',
        'https://classroom.test/scratch-editor/library-assets/cat.svg',
        'https://classroom.test/scratch-editor/blocks-media/click.mp3',
        'https://classroom.test/components/profile/backgrounds/1.jpg',
        'https://cdn.test/static/release/movie.mp4?version=first',
    ];
    const cache = await sw.caches.open('ui-resources-cache');
    for (const url of urls) {
        await cache.put(url, new Response('obsolete media from old redirect'));
        assert.equal(await (await sw.fetch(url)).text(), 'current editor');
        assert.equal(sw.requests.at(-1), url);
        assert.equal(await (await sw.caches.match(url)).text(), 'obsolete media from old redirect',
            'HTTP response is not stored under its original mutable URL');
    }
});

test('activation deletes old public media only from owned generic caches', async () => {
    const sw = setup();
    const media = 'https://classroom.test/scratch-editor/library-assets/cat.svg';
    const chunk = 'https://classroom.test/scratch-editor/js/editor.aabbcc.js';
    for (const name of ['ui-resources-cache', 'assets', 'another-app', 'onebyone-media-v1']) {
        const cache = await sw.caches.open(name);
        await cache.put(media, new Response('image'));
        await cache.put(chunk, new Response('code'));
    }
    await sw.activate();
    for (const name of ['ui-resources-cache', 'assets']) {
        assert(!sw.stores.get(name).has(media));
        assert(sw.stores.get(name).has(chunk));
    }
    assert(sw.stores.get('another-app').has(media));
    assert(sw.stores.get('onebyone-media-v1').has(media));
});
