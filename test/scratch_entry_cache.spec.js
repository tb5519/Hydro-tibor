const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');

const code = transformSync(fs.readFileSync(path.join(__dirname, '../packages/ui-default/service-worker.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs', define: { 'process.env.NODE_ENV': '"production"' },
}).code;

function setup() {
    const stores = new Map();
    const listeners = new Map();
    const requests = [];
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
    vm.runInNewContext(code, {
        module: { exports: {} }, exports: {}, URL, Request, Response, Headers, location, caches,
        console: { log() {}, debug() {}, warn() {} },
        self: { location, clients: { claim: async () => { claimed = true; } },
            addEventListener: (type, callback) => listeners.set(type, callback) },
        fetch: async (request) => {
            requests.push(urlOf(request));
            return new Response('current editor', { headers: { 'Cache-Control': 'no-cache' } });
        },
    });
    const cfg = { hosts: ['https://classroom.test/'], assets: ['https://cdn.test/'], domains: [] };
    listeners.get('fetch')({ request: new Request('https://classroom.test/service-worker-config', {
        method: 'POST', body: JSON.stringify(cfg),
    }), respondWith() {} });
    return { stores, caches, requests, get claimed() { return claimed; },
        async fetch(url) {
            // Allow the real config message's async JSON parsing to finish.
            await new Promise(setImmediate);
            let response;
            listeners.get('fetch')({ request: new Request(url), respondWith: (value) => { response = value; } });
            assert(response, 'Expected this resource to be handled by the service worker');
            return response;
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
