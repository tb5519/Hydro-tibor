const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');
const code = transformSync(fs.readFileSync(path.join(__dirname, '../packages/ui-default/utils/scratch-preset-picker.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
const fixture = (override = {}) => ({ id: 'asset-1', title: '<b>小飞船</b>', kind: 'sprite', filename: '小飞船.sprite3',
    mime: 'application/x.scratch.sprite3', size: 4, fileUrl: '/d/art/scratch/file/asset-1', ...override });

function setup(items = [fixture()], response, settings = {}) {
    const dom = new JSDOM('<body></body>', { url: 'https://school.test/d/art/scratch/editor', pretendToBeVisual: true });
    const { window } = dom;
    window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
    window.HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new window.Event('close')); };
    const module = { exports: {} };
    const requests = [];
    const sent = [];
    const busy = [];
    const statuses = [];
    const intervals = new Map();
    const observers = [];
    const previews = [];
    const audios = [];
    const urls = new Map();
    const motion = { matches: !!settings.reducedMotion, listeners: [], addEventListener(type, callback) { this.listeners.push(callback); } };
    window.matchMedia = () => motion;
    class TestURL extends URL {
        static createObjectURL(blob) { const url = `blob:test-${++id}`; urls.set(url, blob); return url; }
        static revokeObjectURL(url) { urls.delete(url); }
    }
    class Observer {
        constructor(callback) { this.callback = callback; this.nodes = new Set(); observers.push(this); }
        observe(node) { this.nodes.add(node); }
        disconnect() { this.nodes.clear(); }
    }
    class Audio {
        constructor(url) { this.src = url; this.paused = true; this.playCount = 0; this.currentTime = 0; audios.push(this); }
        async play() { this.paused = false; this.playCount++; }
        pause() { this.paused = true; }
        removeAttribute(name) { if (name === 'src') this.src = ''; }
    }
    let id = 0;
    vm.runInNewContext(code, {
        module, exports: module.exports, window, document: window.document, location: window.location, URL: TestURL, Blob,
        AbortController, crypto: { randomUUID: () => `import-${++id}` },
        setTimeout: () => ++id, clearTimeout() {},
        setInterval: (callback, delay) => { const timer = ++id; intervals.set(timer, { callback, delay }); return timer; },
        clearInterval: (timer) => intervals.delete(timer), IntersectionObserver: Observer, Audio,
        require: (name) => {
            assert.equal(name, './scratch-preset-preview');
            return { loadScratchSpritePreview: async (blob, signal) => {
                const entry = { blob, signal, disposed: false, frames: settings.frames || ['blob:costume-1', 'blob:costume-2'] };
                previews.push(entry);
                if (settings.preview) return settings.preview(entry);
                return { frames: entry.frames, dispose() { entry.disposed = true; } };
            } };
        },
        fetch: async (url, options) => {
            requests.push({ url, options });
            if (response) return response(url, options);
            return url.endsWith('/library') ? new Response(JSON.stringify({ items })) : new Response('file');
        },
    });
    const picker = module.exports.createScratchPresetPicker({ libraryUrl: '/d/art/scratch/library',
        send: (...args) => sent.push(args), onBusy: (value) => busy.push(value), onStatus: (...args) => statuses.push(args) });
    return { window, document: window.document, picker, requests, sent, busy, statuses, intervals, previews, audios, urls, motion,
        visible(id, visible = true) {
            const card = window.document.querySelector(`[data-preset-id="${id}"]`);
            observers.at(-1).callback([{ target: card, isIntersecting: visible }]);
        },
        tick() { for (const { callback } of [...intervals.values()]) callback(); },
        hide(hidden) { Object.defineProperty(window.document, 'hidden', { configurable: true, value: hidden }); window.document.dispatchEvent(new window.Event('visibilitychange')); },
        get dialog() { return window.document.querySelector('dialog'); },
        async open(kind = 'sprite') {
            picker.receive({ type: 'openPresetLibrary', kind, targetId: 'original-sprite' });
            await flush();
        },
        close: () => { window.dispatchEvent(new window.Event('pagehide')); window.close(); },
    };
}

test('loads only on opening, safely displays titles, and transfers one authenticated selection into its original target', async () => {
    const ui = setup();
    try {
        assert.equal(ui.requests.length, 0);
        await ui.open();
        assert.equal(ui.requests.length, 1);
        assert.equal(ui.document.querySelector('strong').textContent, '<b>小飞船</b>');
        assert.equal(ui.document.querySelector('strong b'), null);
        const add = ui.document.querySelector('.scratch-preset-add');
        add.click(); add.click();
        await flush();
        assert.equal(ui.sent.length, 1);
        const [type, message, transfer] = ui.sent[0];
        assert.equal(type, 'importPreset');
        assert.equal(message.targetId, 'original-sprite');
        assert.equal(message.kind, 'sprite');
        assert.equal(Buffer.from(message.file).toString(), 'file');
        assert.equal(transfer[0], message.file);
        assert(ui.requests.every(({ options }) => options.credentials === 'same-origin'));
        assert(ui.busy.at(-1));
        assert(ui.document.querySelector('[data-close]').disabled);
        ui.picker.receive({ type: 'presetImported', id: 'wrong-response' });
        assert(ui.dialog.open);
        ui.picker.receive({ type: 'presetImported', id: message.id });
        assert(!ui.dialog.open);
        assert.equal(ui.busy.at(-1), false);
        assert.match(ui.statuses[0][0], /已加入.*保存/);
    } finally { ui.close(); }
});

test('a failed VM insertion preserves the picker and offers a fresh request without reloading the whole editor', async () => {
    const ui = setup();
    try {
        await ui.open();
        const add = ui.document.querySelector('.scratch-preset-add');
        add.click(); await flush();
        const id = ui.sent[0][1].id;
        ui.picker.receive({ type: 'presetImportError', id, message: '请先选择一个角色' });
        assert(ui.dialog.open);
        assert.match(ui.document.querySelector('[role=status]').textContent, /请先选择/);
        assert(!add.disabled);
        add.click(); await flush();
        assert.equal(ui.sent.length, 2);
        assert.notEqual(ui.sent[1][1].id, id);
    } finally { ui.close(); }
});

test('cross-origin file addresses are rejected before any download or iframe message', async () => {
    const ui = setup([fixture({ fileUrl: 'https://other.test/secret' })]);
    try {
        await ui.open();
        ui.document.querySelector('.scratch-preset-add').click(); await flush();
        assert.equal(ui.sent.length, 0);
        assert.equal(ui.requests.length, 1);
        assert.match(ui.document.querySelector('[role=status]').textContent, /素材地址无效/);
        assert.equal(ui.busy.at(-1), false);
    } finally { ui.close(); }
});

test('switching kinds and searching needs no extra list or sound download; empty state keeps original Scratch materials available', async () => {
    const ui = setup([fixture(), fixture({ id: 'sound1', title: '小铃铛', kind: 'sound', mime: 'audio/wav', filename: '铃铛.wav' })]);
    try {
        await ui.open();
        const sound = [...ui.document.querySelectorAll('.scratch-preset-tabs button')].find((button) => button.textContent === '声音');
        sound.click();
        assert.equal(ui.document.querySelector('strong').textContent, '小铃铛');
        assert.equal(ui.requests.length, 1, 'Sound bytes are not downloaded until listening or inserting');
        const search = ui.document.querySelector('input');
        search.value = 'not here'; search.dispatchEvent(new ui.window.Event('input'));
        assert.match(ui.document.querySelector('.scratch-preset-empty').textContent, /没有找到/);
        assert.equal(ui.requests.length, 1);
        ui.document.querySelector('[data-close]').click();
        assert(!ui.dialog.open);
    } finally { ui.close(); }
});

test('expired membership and oversized download fail locally without mutating the work', async () => {
    for (const result of [new Response('', { status: 403 }), new Response('file', { headers: { 'content-length': String(21 * 1024 * 1024) } })]) {
        const ui = setup([], async (url) => url.endsWith('/library') ? new Response(JSON.stringify({ items: [fixture()] })) : result);
        try {
            await ui.open(); ui.document.querySelector('.scratch-preset-add').click(); await flush();
            assert.equal(ui.sent.length, 0);
            assert(ui.dialog.open);
            assert.equal(ui.busy.at(-1), false);
            assert.equal(ui.document.querySelector('[role=status]').dataset.error, 'true');
        } finally { ui.close(); }
    }
});

test('visible sprite packages show costumes in order at 250ms and dispose frames when scrolled away', async () => {
    const ui = setup([fixture(), fixture({ id: 'offscreen' })]);
    try {
        await ui.open();
        assert.equal(ui.requests.length, 1, 'offscreen sprites must not be downloaded');
        ui.visible('asset-1'); await flush();
        assert.equal(ui.requests.length, 2);
        assert.equal(ui.previews.length, 1);
        const image = ui.document.querySelector('[data-preset-id="asset-1"] img');
        assert.equal(image.src, 'blob:costume-1');
        assert.equal(ui.intervals.size, 1);
        assert.equal([...ui.intervals.values()][0].delay, 250);
        ui.tick(); assert.equal(image.src, 'blob:costume-2');
        ui.tick(); assert.equal(image.src, 'blob:costume-1');
        ui.visible('asset-1', false);
        assert.equal(ui.intervals.size, 0);
        assert.equal(ui.previews[0].disposed, true);
        assert.equal(image.hasAttribute('src'), false);
        ui.tick(); assert.equal(image.hasAttribute('src'), false);
    } finally { ui.close(); }
});

test('import reuses the visible sprite download and releases preview frames after a matching VM response', async () => {
    const ui = setup();
    try {
        await ui.open(); ui.visible('asset-1'); await flush();
        assert.equal(ui.requests.length, 2);
        ui.document.querySelector('.scratch-preset-add').click(); await flush();
        assert.equal(ui.requests.length, 2, 'previewed sprite package should not download twice');
        assert.equal(ui.sent.length, 1);
        assert.equal(ui.intervals.size, 0, 'pause preview animation while importing');
        ui.picker.receive({ type: 'presetImported', id: ui.sent[0][1].id });
        assert.equal(ui.previews[0].disposed, true);
        assert.equal(ui.intervals.size, 0);
        await ui.open(); ui.visible('asset-1'); await flush();
        assert.equal(ui.requests.filter(({ url }) => url.endsWith('/asset-1')).length, 2, 'closing the picker releases its raw-file cache');
    } finally { ui.close(); }
});

test('reduced-motion stays on the first costume, while tab/search/page visibility changes release animations', async () => {
    const ui = setup(undefined, undefined, { reducedMotion: true });
    try {
        await ui.open(); ui.visible('asset-1'); await flush();
        const image = ui.document.querySelector('img');
        assert.equal(ui.intervals.size, 0);
        assert.equal(image.src, 'blob:costume-1');
        ui.motion.matches = false; ui.motion.listeners.forEach((callback) => callback());
        assert.equal(ui.intervals.size, 1);
        ui.tick(); assert.equal(image.src, 'blob:costume-2');
        ui.motion.matches = true; ui.motion.listeners.forEach((callback) => callback());
        assert.equal(ui.intervals.size, 0); assert.equal(image.src, 'blob:costume-1');
        ui.hide(true);
        assert.equal(ui.previews[0].disposed, true);
        assert.equal(image.hasAttribute('src'), false);
        ui.hide(false); ui.visible('asset-1'); await flush();
        const input = ui.document.querySelector('input'); input.value = '小飞船'; input.dispatchEvent(new ui.window.Event('input'));
        assert.equal(ui.previews[1].disposed, true);
        ui.visible('asset-1'); await flush();
        [...ui.document.querySelectorAll('.scratch-preset-tabs button')].find((button) => button.textContent === '声音').click();
        assert.equal(ui.previews[2].disposed, true);
        assert.equal(ui.intervals.size, 0);
    } finally { ui.close(); }
});

test('a sound picture plays and pauses without adding; the separate add button alone imports it', async () => {
    const ui = setup([fixture({ kind: 'sound', mime: 'audio/wav', filename: '铃铛.wav' })]);
    try {
        await ui.open('sound');
        const listen = ui.document.querySelector('.scratch-preset-picture');
        const add = ui.document.querySelector('.scratch-preset-add');
        assert.equal(listen.tagName, 'BUTTON');
        assert.equal(add.contains(listen), false);
        assert.equal(ui.requests.length, 1);
        listen.click(); await flush();
        assert.equal(ui.requests.length, 2);
        assert.equal(ui.sent.length, 0, 'clicking the sound picture must not import');
        assert.equal(ui.audios.length, 1); assert.equal(ui.audios[0].paused, false);
        assert.equal(listen.getAttribute('aria-pressed'), 'true');
        ui.audios[0].currentTime = 2.5;
        listen.click(); await flush();
        assert.equal(ui.audios[0].paused, true);
        assert.equal(listen.getAttribute('aria-pressed'), 'false');
        listen.click(); await flush();
        assert.equal(ui.audios[0].currentTime, 2.5, 'pause/resume preserves the playback position');
        assert.equal(ui.audios[0].playCount, 2);
        assert.equal(ui.requests.length, 2, 'resuming must not re-download the sound');
        add.click(); await flush();
        assert.equal(ui.sent.length, 1);
        assert.equal(ui.sent[0][1].kind, 'sound');
        assert.equal(ui.audios[0].paused, true);
    } finally { ui.close(); }
});

test('closing cancels pending previews and ignores late downloads, but an in-flight import can reuse its preview request', async () => {
    let resolveFile;
    const response = async (url) => url.endsWith('/library') ? new Response(JSON.stringify({ items: [fixture()] }))
        : new Promise((resolve) => { resolveFile = resolve; });
    const closed = setup(undefined, response);
    try {
        await closed.open(); closed.visible('asset-1');
        closed.document.querySelector('[data-close]').click();
        assert.equal(closed.requests[1].options.signal.aborted, true);
        resolveFile(new Response('file')); await flush();
        assert.equal(closed.previews.length, 0);
        assert.equal(closed.intervals.size, 0);
    } finally { closed.close(); }
    const importing = setup(undefined, response);
    try {
        await importing.open(); importing.visible('asset-1');
        importing.document.querySelector('.scratch-preset-add').click();
        assert.equal(importing.requests.length, 2, 'preview and import share one pending package request');
        importing.hide(true);
        assert.equal(importing.requests[1].options.signal.aborted, false, 'a pending user import owns its download after previews stop');
        resolveFile(new Response('file')); await flush();
        assert.equal(importing.sent.length, 1);
        assert.equal(importing.previews.length, 0);
    } finally { importing.close(); }
});

test('lazy image previews keep three-request concurrency and hide/close revokes audio object URLs', async () => {
    const pending = [];
    const images = Array.from({ length: 5 }, (_, index) => fixture({ id: `image-${index}`, filename: 'image.png', mime: 'image/png', fileUrl: `/d/art/scratch/file/image-${index}` }));
    const ui = setup(images, async (url) => url.endsWith('/library') ? new Response(JSON.stringify({ items: images }))
        : new Promise((resolve) => pending.push(resolve)));
    try {
        await ui.open(); for (const item of images) ui.visible(item.id);
        assert.equal(pending.length, 3);
        pending[0](new Response('png')); await flush();
        assert.equal(pending.length, 4);
        assert.equal(ui.urls.size, 1);
        ui.hide(true); assert.equal(ui.urls.size, 0);
    } finally { ui.close(); }
    const sound = setup([fixture({ kind: 'sound', filename: 'bell.wav', mime: 'audio/wav' })]);
    try {
        await sound.open('sound'); sound.document.querySelector('[data-listen]').click(); await flush();
        assert.equal(sound.urls.size, 1);
        sound.hide(true); assert.equal(sound.audios[0].paused, true); assert.equal(sound.urls.size, 0);
    } finally { sound.close(); }
});

test('BFCache navigation releases a cancelled download but preserves an already dispatched VM import lock until acknowledgement', async () => {
    let resolveFile;
    const downloading = setup(undefined, async (url) => url.endsWith('/library')
        ? new Response(JSON.stringify({ items: [fixture()] })) : new Promise((resolve) => { resolveFile = resolve; }));
    try {
        await downloading.open(); downloading.document.querySelector('.scratch-preset-add').click();
        assert.equal(downloading.busy.at(-1), true);
        downloading.window.dispatchEvent(new downloading.window.Event('pagehide'));
        assert.equal(downloading.requests[1].options.signal.aborted, true);
        assert.equal(downloading.busy.at(-1), false, 'the parent save controls must be unlocked after cancelling the download');
        downloading.window.dispatchEvent(new downloading.window.Event('pageshow'));
        resolveFile(new Response('file')); await flush();
        assert.equal(downloading.sent.length, 0);
    } finally { downloading.close(); }
    const sent = setup();
    try {
        await sent.open(); sent.document.querySelector('.scratch-preset-add').click(); await flush();
        const id = sent.sent[0][1].id;
        sent.window.dispatchEvent(new sent.window.Event('pagehide'));
        assert.equal(sent.busy.at(-1), true, 'do not unlock saving while the VM is still changing its project');
        sent.window.dispatchEvent(new sent.window.Event('pageshow'));
        assert.equal(sent.dialog.open, true);
        assert.equal(sent.document.querySelector('[data-close]').disabled, true);
        sent.picker.receive({ type: 'presetImported', id: 'wrong-id' });
        assert.equal(sent.busy.at(-1), true);
        sent.picker.receive({ type: 'presetImported', id });
        assert.equal(sent.busy.at(-1), false);
        assert.equal(sent.dialog.open, false);
    } finally { sent.close(); }
});
