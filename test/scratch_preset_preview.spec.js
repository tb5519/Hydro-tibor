const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { deflateRawSync, crc32 } = require('node:zlib');
const { test } = require('node:test');
const { transformSync } = require('esbuild');

const source = transformSync(fs.readFileSync(path.resolve(__dirname,
    '../packages/ui-default/utils/scratch-preset-preview.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const MB = 1024 * 1024;
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><path d="M0 0h20v10H0z"/></svg>');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA4sAAAAASUVORK5CYII=', 'base64');
const asset = (data, format) => ({ data, name: `${createHash('md5').update(data).digest('hex')}.${format}`, format });
const first = asset(svg, 'svg');
const second = asset(png, 'png');
const costume = (entry) => ({ assetId: entry.name.split('.')[0], dataFormat: entry.format, md5ext: entry.name });
const sprite = (costumes = [costume(first), costume(second)], override = {}) => ({
    isStage: false, name: '预览测试', costumes, sounds: [], ...override,
});

// Construct ZIP records ourselves so directory, local-header and inflater
// failures are exercised independently of any third-party ZIP writer.
function zip(entries, comment = '') {
    const locals = [];
    const directory = [];
    let offset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.name);
        const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
        const method = entry.method ?? 0;
        const packed = method === 8 ? deflateRawSync(data) : data;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(method, 8);
        local.writeUInt32LE(crc32(data), 14);
        local.writeUInt32LE(packed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        locals.push(local, name, packed);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(method, 10);
        central.writeUInt32LE(crc32(data), 16);
        central.writeUInt32LE(packed.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        directory.push(central, name);
        offset += local.length + name.length + packed.length;
    }
    const central = Buffer.concat(directory);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(central.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(Buffer.byteLength(comment), 20);
    return Buffer.concat([...locals, central, end, Buffer.from(comment)]);
}

function archive(method = 0, doc = sprite(), media = [first, second]) {
    return zip([{ name: 'sprite.json', data: JSON.stringify(doc), method },
        ...media.map((entry) => ({ ...entry, method }))]);
}

function locations(buffer) {
    const end = buffer.length - 22;
    const count = buffer.readUInt16LE(end + 10);
    let at = buffer.readUInt32LE(end + 16);
    const entries = [];
    for (let index = 0; index < count; index++) {
        entries.push({ central: at, local: buffer.readUInt32LE(at + 42) });
        at += 46 + buffer.readUInt16LE(at + 28) + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
    }
    return { end, entries };
}

function harness(options = {}) {
    const created = [];
    const revoked = [];
    const active = new Map();
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module, exports: module.exports, Blob, DOMException, TextDecoder, DataView, Uint8Array,
        DecompressionStream, ...options.globals,
        URL: {
            createObjectURL(blob) {
                if (options.failAt === created.length + 1) throw new Error('Object URL unavailable');
                const url = `blob:preview-${created.length + 1}`;
                created.push({ url, blob });
                active.set(url, blob);
                options.onCreate?.(created.length);
                return url;
            },
            revokeObjectURL(url) { revoked.push(url); active.delete(url); },
        },
    });
    return { load: module.exports.loadScratchSpritePreview, created, revoked, active };
}

test('STORE ZIP preserves costume order and repeated asset frames without creating duplicate object URLs', async () => {
    const h = harness();
    const data = zip([{ ...second }, { name: 'sprite.json', data: JSON.stringify(sprite([
        costume(first), costume(second), costume(first),
    ])) }, { ...first }], 'ZIP comment');
    const preview = await h.load(new Blob([data]));
    assert.deepEqual([...preview.frames], ['blob:preview-1', 'blob:preview-2', 'blob:preview-1']);
    assert.deepEqual(h.created.map(({ blob }) => blob.type), ['image/svg+xml', 'image/png']);
    assert.deepEqual(Buffer.from(await h.created[0].blob.arrayBuffer()), svg);
    assert.deepEqual(Buffer.from(await h.created[1].blob.arrayBuffer()), png);
    preview.dispose();
    preview.dispose();
    assert.equal(h.active.size, 0);
    assert.deepEqual(h.revoked, ['blob:preview-1', 'blob:preview-2']);
});

test('real raw-DEFLATE sprite JSON and image entries decode with exact bytes and MIME types', async () => {
    const h = harness();
    const preview = await h.load(new Blob([archive(8)]));
    assert.equal(preview.frames.length, 2);
    assert.deepEqual(Buffer.from(await h.created[0].blob.arrayBuffer()), svg);
    assert.deepEqual(Buffer.from(await h.created[1].blob.arrayBuffer()), png);
    preview.dispose();
    assert.equal(h.active.size, 0);
});

test('frame cap limits animation work while mixed compression and repeated costumes reuse the same image', async () => {
    const h = harness();
    const doc = sprite(Array.from({ length: 101 }, () => costume(first)));
    const data = zip([{ name: 'sprite.json', data: JSON.stringify(doc), method: 8 }, { ...first, method: 0 }]);
    const preview = await h.load(new Blob([data]));
    assert.equal(preview.frames.length, 100);
    assert.equal(new Set(preview.frames).size, 1);
    assert.equal(h.created.length, 1);
    preview.dispose();
});

test('invalid ZIP directories, flags and local-header boundaries are rejected before exposing images', async () => {
    const fixtures = [];
    const corrupt = (name, change) => {
        const data = archive();
        change(data, locations(data));
        fixtures.push([name, data]);
    };
    corrupt('missing EOCD', (data, { end }) => data.writeUInt32LE(0, end));
    corrupt('multiple disks', (data, { end }) => data.writeUInt16LE(1, end + 4));
    corrupt('inconsistent count', (data, { end }) => data.writeUInt16LE(1, end + 8));
    corrupt('too many entries', (data, { end }) => { data.writeUInt16LE(3001, end + 8); data.writeUInt16LE(3001, end + 10); });
    corrupt('directory outside file', (data, { end }) => data.writeUInt32LE(0xffffffff, end + 16));
    corrupt('directory record truncated', (data, { end }) => data.writeUInt32LE(45, end + 12));
    corrupt('encrypted entry', (data, { entries }) => data.writeUInt16LE(1, entries[0].central + 8));
    corrupt('unsupported compression', (data, { entries }) => data.writeUInt16LE(99, entries[0].central + 10));
    corrupt('entry on another disk', (data, { entries }) => data.writeUInt16LE(1, entries[0].central + 34));
    corrupt('invalid UTF-8 name', (data, { entries }) => { data[entries[0].central + 46] = 255; });
    corrupt('local header in directory', (data, { entries }) => data.writeUInt32LE(entries[0].central, entries[0].central + 42));
    corrupt('local filename mismatch', (data, { entries }) => { data[entries[0].local + 30] = 120; });
    corrupt('local compression mismatch', (data, { entries }) => data.writeUInt16LE(8, entries[0].local + 8));
    corrupt('local extra data crosses directory', (data, { entries }) => data.writeUInt16LE(65535, entries[0].local + 28));
    fixtures.push(['duplicate entry', zip([{ name: 'sprite.json', data: '{}' }, { name: 'sprite.json', data: '{}' }])]);
    fixtures.push(['path traversal', zip([{ name: '../sprite.json', data: '{}' }])]);
    fixtures.push(['unsupported asset type', zip([{ name: `${'a'.repeat(32)}.html`, data: '<script/>' }])]);
    for (const [name, data] of fixtures) {
        const h = harness();
        await assert.rejects(h.load(new Blob([data])), undefined, name);
        assert.equal(h.created.length, 0, name);
        assert.equal(h.active.size, 0, name);
    }
});

test('archive, JSON and expanded-size limits reject oversized input and dishonest compressed entries', async () => {
    const h = harness();
    await assert.rejects(h.load(new Blob([Buffer.alloc(21)])));
    let read = false;
    await assert.rejects(h.load({ size: 20 * MB + 1, arrayBuffer() { read = true; } }));
    assert.equal(read, false, 'Known oversized archives are rejected before reading their bytes');
    for (const [entryIndex, claimedSize] of [[0, 4 * MB + 1], [1, 20 * MB]]) {
        const data = archive(8);
        data.writeUInt32LE(claimedSize, locations(data).entries[entryIndex].central + 24);
        await assert.rejects(h.load(new Blob([data])));
    }
    const inflated = asset(Buffer.alloc(128 * 1024, 65), 'svg');
    const data = archive(8, sprite([costume(inflated)]), [inflated]);
    data.writeUInt32LE(1, locations(data).entries[1].central + 24);
    await assert.rejects(h.load(new Blob([data])), /角色预览/);
    assert.equal(h.created.length, 0, 'The inflater stops before publishing an over-expanded image');
});

test('CRC failure or a missing later costume revokes all earlier object URLs', async () => {
    for (const method of [0, 8]) {
        const h = harness();
        const data = archive(method);
        data.writeUInt32LE(0, locations(data).entries[2].central + 16);
        await assert.rejects(h.load(new Blob([data])), /角色预览/);
        assert.equal(h.created.length, 1);
        assert.deepEqual(h.revoked, ['blob:preview-1']);
        assert.equal(h.active.size, 0);
    }
    const h = harness();
    await assert.rejects(h.load(new Blob([archive(8, sprite(), [first])])), /角色预览/);
    assert.equal(h.created.length, 1);
    assert.equal(h.active.size, 0);
});

test('invalid sprite descriptions and incompatible costume names cannot leave live resources', async () => {
    for (const doc of [null, sprite([], {}), sprite(undefined, { isStage: true }),
        sprite([costume(first), { ...costume(second), dataFormat: 'webp' }])]) {
        const h = harness();
        await assert.rejects(h.load(new Blob([archive(0, doc)])));
        assert.equal(h.active.size, 0);
    }
    const h = harness();
    await assert.rejects(h.load(new Blob([zip([{ name: 'sprite.json', data: '{broken' }])])));
    assert.equal(h.created.length, 0);
});

test('object URL allocation failure cleans up images that were already allocated', async () => {
    const h = harness({ failAt: 2 });
    await assert.rejects(h.load(new Blob([archive(8)])), /Object URL unavailable/);
    assert.equal(h.created.length, 1);
    assert.deepEqual(h.revoked, ['blob:preview-1']);
    assert.equal(h.active.size, 0);
});

test('abort before reading or between costume frames rejects with AbortError and releases images', async () => {
    const early = new AbortController();
    early.abort();
    const h = harness();
    await assert.rejects(h.load(new Blob([archive()]), early.signal), { name: 'AbortError' });
    assert.equal(h.created.length, 0);
    const midway = new AbortController();
    const secondHarness = harness({ onCreate: () => midway.abort() });
    await assert.rejects(secondHarness.load(new Blob([archive(8)]), midway.signal), { name: 'AbortError' });
    assert.equal(secondHarness.created.length, 1);
    assert.deepEqual(secondHarness.revoked, ['blob:preview-1']);
    assert.equal(secondHarness.active.size, 0);
});

test('abort cancels an in-flight raw-DEFLATE stream instead of retaining a blocked reader', async () => {
    const data = new Blob([archive(8)]);
    const controller = new AbortController();
    let cancelled = false;
    const delayed = {
        size: data.size,
        arrayBuffer: () => data.arrayBuffer(),
        slice: () => ({ stream: () => new ReadableStream({
            start(stream) {
                stream.enqueue(new Uint8Array([0x03]));
                setImmediate(() => controller.abort());
            },
            cancel() { cancelled = true; },
        }) }),
    };
    const h = harness();
    await assert.rejects(h.load(delayed, controller.signal), { name: 'AbortError' });
    await new Promise(setImmediate);
    assert.equal(cancelled, true);
    assert.equal(h.created.length, 0);
    assert.equal(h.active.size, 0);
});

test('STORE previews work without DecompressionStream and unsupported DEFLATE fails without allocating resources', async () => {
    const h = harness({ globals: { DecompressionStream: undefined } });
    const preview = await h.load(new Blob([archive()]));
    assert.equal(preview.frames.length, 2);
    preview.dispose();
    await assert.rejects(h.load(new Blob([archive(8)])));
    assert.equal(h.active.size, 0);
});
