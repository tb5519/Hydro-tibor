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

function setup(items = [fixture()], response) {
    const dom = new JSDOM('<body></body>', { url: 'https://school.test/d/art/scratch/editor' });
    const { window } = dom;
    window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
    window.HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new window.Event('close')); };
    const module = { exports: {} };
    const requests = [];
    const sent = [];
    const busy = [];
    const statuses = [];
    let id = 0;
    vm.runInNewContext(code, {
        module, exports: module.exports, document: window.document, location: window.location, URL, Blob,
        AbortController, crypto: { randomUUID: () => `import-${++id}` },
        setTimeout: () => ++id, clearTimeout() {},
        fetch: async (url, options) => {
            requests.push({ url, options });
            if (response) return response(url, options);
            return url.endsWith('/library') ? new Response(JSON.stringify({ items })) : new Response('file');
        },
    });
    const picker = module.exports.createScratchPresetPicker({ libraryUrl: '/d/art/scratch/library',
        send: (...args) => sent.push(args), onBusy: (value) => busy.push(value), onStatus: (...args) => statuses.push(args) });
    return { window, document: window.document, picker, requests, sent, busy, statuses,
        get dialog() { return window.document.querySelector('dialog'); },
        async open(kind = 'sprite') {
            picker.receive({ type: 'openPresetLibrary', kind, targetId: 'original-sprite' });
            await flush();
        },
        close: () => window.close(),
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
