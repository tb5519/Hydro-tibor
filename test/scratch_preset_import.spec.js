const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const AdmZip = require('adm-zip');
const { createRequire } = require('node:module');

const workspace = process.env.SCRATCH_BUILD_DIR || '/Users/tangbo/Desktop/hydro-tibor/.cache/scratch-player-build';
const upstream = createRequire(path.join(workspace, 'package.json'));
const source = fs.readFileSync(path.resolve(__dirname, '../build/scratch/preset-import.js'), 'utf8');
const code = transformSync(source, { format: 'cjs' }).code;
const data = () => new Uint8Array([1, 2, 3]).buffer;
const message = (kind = 'costume', extra = {}) => ({ type: 'importPreset', id: 'request-1', kind,
    title: '老师的素材', filename: 'teacher.png', mime: 'image/png', file: data(), targetId: 'role', ...extra });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function target(id, isStage = false) {
    const costumes = [{ name: 'existing costume' }];
    const sounds = [{ name: 'existing sound' }];
    return { id, isStage, isOriginal: true, costumes, sounds, sprite: { soundBank: { addSoundPlayer() {} } },
        getCostumes: () => costumes, getSounds: () => sounds,
        addCostume: costume => costumes.push(costume), setCostume() {}, addSound: sound => sounds.push(sound),
        dispose() { this.disposed = true; } };
}
function setup(options = {}) {
    const stage = target('stage', true), role = target('role');
    const calls = [], sent = [], decoded = [];
    const machine = { editingTarget: role, runtime: { targets: [stage, role], origin: 'existing origin',
        storage: { load() { throw new Error('Preset imports must not fetch missing remote assets'); } },
        getTargetForStage: () => stage,
        getTargetById(id) { return this.targets.find(item => item.id === id); },
        renderer: { destroySkin: id => calls.push(['destroySkin', id]) },
        emitProjectChanged: () => calls.push(['changed']),
        audioEngine: { async decodeSoundPlayer() {
            if (options.decodeSound) await options.decodeSound();
            const player = { id: 'decoded-sound', buffer: { sampleRate: 48000, length: 600 }, dispose() { this.disposed = true; } };
            decoded.push(player); return player;
        } },
    }, emitTargetsUpdate: () => calls.push(['targets']), async installTargets(targets) {
        calls.push(['install']); this.runtime.targets.push(...targets); this.editingTarget = targets[0];
    } };
    const dependencies = {
        './file-uploader': {
            costumeUpload(file, mime, _machine, resolve, reject) {
                calls.push(['costumeUpload', mime, file.byteLength]);
                if (options.convert) return options.convert(resolve, reject);
                resolve([{ asset: { data: new Uint8Array(file) }, md5: 'local.svg', name: '' }]);
            },
            soundUpload(file, mime, _storage, resolve) {
                calls.push(['soundUpload', mime, file.byteLength]);
                resolve({ asset: { data: new Uint8Array(file) } });
            },
        },
        'scratch-vm/src/import/load-costume': { async loadCostume(_id, costume) {
            calls.push(['loadCostume']); costume.skinId = 50; if (options.broken) costume.broken = {};
        } },
        'scratch-vm/src/serialization/sb3': { async deserialize(sprite, runtime, zip) {
            calls.push(['deserialize', sprite, zip]);
            if (options.deserialize) return options.deserialize(sprite, runtime, zip);
            const added = target('new-sprite');
            added.costumes[0].broken = options.broken;
            return { targets: [added], extensions: { extensionIDs: new Set(), extensionURLs: new Map() } };
        } },
        'scratch-parser': upstream('scratch-parser'),
    };
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, ArrayBuffer, Uint8Array, Blob, Set, Map,
        require(name) { assert(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
        ...options.globals,
    });
    const api = module.exports;
    let editable = true;
    const bridge = api.createPresetBridge(machine, () => editable, (type, value) => sent.push({ type, ...value }));
    return { ...api, machine, stage, role, calls, sent, decoded, bridge, setEditable: value => { editable = value; } };
}
const filename = `${'a'.repeat(32)}.svg`;
function spriteArchive(extra = {}, includeAsset = true) {
    const sprite = { isStage: false, name: 'Teacher', variables: {}, lists: {}, broadcasts: {}, blocks: {},
        currentCostume: 0, costumes: [{ name: 'teacher', assetId: 'a'.repeat(32), dataFormat: 'svg', md5ext: filename,
            bitmapResolution: 1, rotationCenterX: 10, rotationCenterY: 10 }], sounds: [], x: 0, y: 0,
        size: 100, direction: 90, draggable: false, rotationStyle: 'all around', visible: true, ...extra };
    const zip = new AdmZip();
    zip.addFile('sprite.json', Buffer.from(JSON.stringify(sprite)));
    if (includeAsset) zip.addFile(filename, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20"/></svg>'));
    const bytes = zip.toBuffer();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

test('costume and backdrop append to their intended target and preserve every existing item', async () => {
    for (const kind of ['costume', 'backdrop']) {
        const h = setup();
        await h.importPreset(h.machine, message(kind));
        assert.equal(h.role.costumes.length, kind === 'costume' ? 2 : 1);
        assert.equal(h.stage.costumes.length, kind === 'backdrop' ? 2 : 1);
        assert.equal(h.role.costumes[0].name, 'existing costume');
        assert.equal(h.stage.costumes[0].name, 'existing costume');
        assert.equal(h.machine.runtime.targets.length, 2);
        assert.equal(h.calls.filter(call => call[0] === 'changed').length, 1);
    }
});

test('mismatched types, readonly imports and invalid sizes fail without changing the project', async () => {
    for (const extra of [{ filename: 'teacher.svg' }, { mime: 'text/html' }, { file: 'https://outside.test/image.png' },
        { file: new ArrayBuffer(0) }, { file: new ArrayBuffer(20 * 1024 * 1024 + 1) }, { kind: 'project' },
        { filename: 'teacher.mp3', mime: 'audio/mpeg' }]) {
        const h = setup(); await h.bridge.receive(message('costume', extra));
        assert.equal(h.sent[0].type, 'presetImportError'); assert.equal(h.calls.length, 0);
        assert.equal(h.machine.runtime.targets.length, 2);
    }
    const h = setup(); h.setEditable(false);
    await h.bridge.receive(message());
    await h.bridge.receive({ type: 'requestPresetLibrary' });
    assert.equal(h.sent.length, 1); assert.equal(h.sent[0].type, 'presetImportError'); assert.equal(h.calls.length, 0);
});

test('target deletion during conversion and stage-as-costume never insert into a different role', async () => {
    const conversion = deferred();
    const h = setup({ convert: resolve => conversion.promise.then(() => resolve([{ md5: 'local.svg' }])) });
    const pending = h.bridge.receive(message());
    h.machine.runtime.targets = [h.stage]; conversion.resolve(); await pending;
    assert.equal(h.role.costumes.length, 1); assert.equal(h.stage.costumes.length, 1);
    assert.equal(h.sent[0].type, 'presetImportError');
    assert(h.calls.some(call => call[0] === 'destroySkin'));
    const stage = setup(); await stage.bridge.receive(message('costume', { targetId: 'stage' }));
    assert.match(stage.sent[0].message, /先选择一个角色/); assert.equal(stage.calls.length, 0);
});

test('sounds decode before attaching and allow a stage, while decode failure retains existing sounds', async () => {
    for (const [extension, mime] of [['mp3', 'audio/mpeg'], ['wav', 'audio/wav']]) {
        const h = setup(); await h.importPreset(h.machine, message('sound', { filename: `teacher.${extension}`, mime, targetId: 'stage' }));
        assert.equal(h.role.sounds.length, 1); assert.equal(h.stage.sounds.length, 2);
        assert.equal(h.stage.sounds[1].sampleCount, 600);
    }
    const h = setup({ decodeSound: async () => { throw new Error('bad audio'); } });
    await h.bridge.receive(message('sound', { filename: 'teacher.mp3', mime: 'audio/mpeg' }));
    assert.equal(h.role.sounds.length, 1); assert.equal(h.sent[0].type, 'presetImportError');
});

test('duplicate pending and completed requests never append twice and another id cannot unlock a busy import', async () => {
    const conversion = deferred();
    const h = setup({ convert: resolve => conversion.promise.then(() => resolve([{ md5: 'local.svg' }])) });
    const first = h.bridge.receive(message());
    await h.bridge.receive(message());
    await h.bridge.receive(message('costume', { id: 'request-2' }));
    assert.equal(h.calls.filter(call => call[0] === 'costumeUpload').length, 1);
    assert.equal(h.sent[0].type, 'presetImportError');
    conversion.resolve(); await first;
    await h.bridge.receive(message());
    assert.equal(h.role.costumes.length, 2);
    assert.equal(h.sent.filter(item => item.type === 'presetImported').length, 2);
    await h.bridge.receive({ type: 'requestPresetLibrary' });
    assert.deepEqual(JSON.parse(JSON.stringify(h.sent.at(-1))), { type: 'openPresetLibrary', kind: 'sprite', targetId: 'role' });
});

test('sprite3 is parsed as one sprite with complete local assets, and broken sprites never install', async () => {
    const h = setup(); await h.importPreset(h.machine, message('sprite', {
        filename: 'teacher.sprite3', mime: 'application/octet-stream', file: spriteArchive(),
    }));
    assert.equal(h.machine.runtime.targets.length, 3);
    assert.equal(h.role.costumes.length, 1); assert.equal(h.stage.costumes.length, 1);
    assert.equal(h.machine.runtime.origin, 'existing origin');
    for (const file of [spriteArchive({}, false), spriteArchive({ extensionURLs: { evil: 'https://outside.test/evil.js' } }),
        spriteArchive({ customFonts: [{ family: 'remote', src: 'https://outside.test/font.woff' }] })]) {
        const rejected = setup();
        await rejected.bridge.receive(message('sprite', { filename: 'teacher.sprite3', mime: 'application/zip', file }));
        assert.equal(rejected.sent[0].type, 'presetImportError'); assert.equal(rejected.calls.length, 0);
    }
    const broken = setup({ broken: true });
    await broken.bridge.receive(message('sprite', { filename: 'teacher.sprite3', mime: 'application/zip', file: spriteArchive() }));
    assert.equal(broken.machine.runtime.targets.length, 2); assert.equal(broken.sent[0].type, 'presetImportError');
    const picture = setup(); await picture.importPreset(picture.machine, message('sprite'));
    assert.equal(picture.machine.runtime.targets.length, 3);
    assert.equal(picture.calls.find(call => call[0] === 'deserialize')[1].costumes.length, 1);
});

test('corrupt costumes and webp decode errors report retryable preset errors without default substitutions', async () => {
    const broken = setup({ broken: true }); await broken.bridge.receive(message());
    assert.equal(broken.role.costumes.length, 1); assert.equal(broken.sent[0].type, 'presetImportError');
    const webp = setup({ globals: { createImageBitmap: async () => { throw new Error('bad webp'); } } });
    await webp.bridge.receive(message('costume', { filename: 'teacher.webp', mime: 'image/webp' }));
    assert.equal(webp.sent[0].type, 'presetImportError'); assert.equal(webp.calls.length, 0);
    assert(!webp.sent.some(item => item.type === 'error'));
});
