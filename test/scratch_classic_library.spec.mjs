import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {classicLibrary, restorationSHA256, restoreCatalog, restoreWorkspace} from '../build/scratch/restore-catalogs.mjs';
import {collectAssetNames, verifyAsset} from '../build/scratch/library-assets.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstream = JSON.parse(fs.readFileSync(path.join(repo, 'build/scratch/upstream.json')));
const workspace = [process.env.SCRATCH_BUILD_DIR, path.join(repo, '.cache/scratch-player-build'),
    path.join(os.tmpdir(), `onebyone-turbowarp-${upstream.commit}`),
    path.join(os.homedir(), 'Desktop/hydro-tibor/.cache/scratch-player-build')].filter(Boolean)
    .find(candidate => fs.existsSync(path.join(candidate, '.git')));
if (!workspace) throw new Error('Classic library tests require the pinned Scratch checkout. Set SCRATCH_BUILD_DIR to its local path.');
const kinds = ['costumes', 'sprites', 'sounds', 'backdrops'];
const readCatalog = (commit, name) => execFileSync('git', ['show', `${commit}:src/lib/libraries/${name}.json`], {
    cwd: workspace, maxBuffer: 10 * 1024 * 1024,
});
const originalBytes = Object.fromEntries(kinds.map(name => [name, readCatalog(upstream.commit, name)]));
const original = Object.fromEntries(kinds.map(name => [name, JSON.parse(originalBytes[name])]));
const restoredBytes = Object.fromEntries(kinds.map(name => [name, restoreCatalog(name, originalBytes[name])]));
const restored = Object.fromEntries(kinds.map(name => [name, JSON.parse(restoredBytes[name])]));
const spriteNames = ['Cat', 'Cat Flying', 'Giga', 'Giga Walking', 'Gobo', 'Nano', 'Pico', 'Pico Walking', 'Tera'];
const costumeNames = ['Cat Flying-a', 'Cat Flying-b', 'Cat-a', 'Cat-b', 'Giga Walk1', 'Giga Walk2', 'Giga Walk3',
    'Giga-a', 'Giga-b', 'Giga-c', 'Giga-d', 'Gobo-a', 'Gobo-b', 'Gobo-c', 'Nano-a', 'Nano-b', 'Nano-c', 'Nano-d',
    'Pico Walk1', 'Pico Walk2', 'Pico Walk3', 'Pico Walk4', 'Pico-a', 'Pico-b', 'Pico-c', 'Pico-d',
    'Tera-a', 'Tera-b', 'Tera-c', 'Tera-d'];
const assetNames = collectAssetNames(Object.values(restored));
const lock = JSON.parse(fs.readFileSync(path.join(repo, 'build/scratch/library-assets.lock.json')));

test('restores nine sprites and thirty costumes in native catalogs without changing existing entries', () => {
    for (const [kind, addedNames] of [['sprites', spriteNames], ['costumes', costumeNames]]) {
        const byName = new Map(restored[kind].map(item => [item.name, item]));
        assert.equal(byName.size, restored[kind].length, `${kind} must have no duplicate names`);
        assert.equal(restored[kind].length, original[kind].length + addedNames.length);
        for (const item of original[kind]) assert.deepEqual(byName.get(item.name), item, `Existing ${kind}: ${item.name}`);
        const originalNames = new Set(original[kind].map(item => item.name));
        assert.deepEqual(restored[kind].filter(item => !originalNames.has(item.name)).map(item => item.name).sort(), addedNames);
    }
    assert(restored.sprites.some(item => item.name === 'Turbo Robot'), 'The existing Turbo Robot sprite remains available');
    for (const kind of ['sounds', 'backdrops']) assert.deepEqual(restoredBytes[kind], originalBytes[kind]);
});

test('classic cats have native searchable names and animal category tags', () => {
    for (const name of ['Cat', 'Cat Flying']) {
        const sprite = restored.sprites.find(item => item.name === name);
        assert(sprite.name.toLowerCase().includes('cat'));
        assert(sprite.tags.includes('cat'));
        assert(sprite.tags.includes('animals'));
    }
});

test('the classic Cat retains both original vector costumes, centers and Meow sound', () => {
    const cat = restored.sprites.find(item => item.name === 'Cat');
    assert.deepEqual(cat.costumes, [
        {assetId: 'bcf454acf82e4504149f7ffe07081dbc', name: 'cat-a', bitmapResolution: 1,
            md5ext: 'bcf454acf82e4504149f7ffe07081dbc.svg', dataFormat: 'svg', rotationCenterX: 48, rotationCenterY: 50},
        {assetId: '0fb9be3e8397c983338cb71dc84d0b25', name: 'cat-b', bitmapResolution: 1,
            md5ext: '0fb9be3e8397c983338cb71dc84d0b25.svg', dataFormat: 'svg', rotationCenterX: 46, rotationCenterY: 53},
    ]);
    assert.deepEqual(cat.sounds, [{assetId: '83c36d806dc92327b9e7049a565c6bff', name: 'Meow', dataFormat: 'wav',
        format: '', rate: 44100, sampleCount: 37376, md5ext: '83c36d806dc92327b9e7049a565c6bff.wav'}]);
    for (const costume of cat.costumes) {
        const standalone = restored.costumes.find(item => item.md5ext === costume.md5ext);
        assert(standalone, `${costume.name} must also appear in the native costume picker`);
        assert.equal(standalone.rotationCenterX, costume.rotationCenterX);
        assert.equal(standalone.rotationCenterY, costume.rotationCenterY);
    }
});

test('all restored assets are included in the pinned local library lock', () => {
    const before = new Set(collectAssetNames(Object.values(original)));
    const added = assetNames.filter(name => !before.has(name));
    const expectedAdded = collectAssetNames(Object.values(classicLibrary.catalogs)).filter(name => !before.has(name));
    assert.equal(before.size, 1304);
    assert.equal(assetNames.length, 1334);
    assert.equal(added.length, 30);
    assert.deepEqual(added, expectedAdded);
    assert.equal(lock.version, 2);
    assert.equal(lock.commit, upstream.commit);
    assert.equal(lock.restorationSHA256, restorationSHA256);
    assert.deepEqual(Object.keys(lock.files).sort(), assetNames);
    for (const name of kinds) {
        assert.equal(lock.catalogHashes[name], createHash('sha256').update(restoredBytes[name]).digest('hex'));
    }
});

test('unexpected catalog contents and attempts to restore already restored bytes are rejected', () => {
    for (const kind of kinds) {
        assert.throws(() => restoreCatalog(kind, Buffer.concat([originalBytes[kind], Buffer.from('\n')])), /Unexpected upstream/);
    }
    for (const kind of ['sprites', 'costumes']) {
        assert.throws(() => restoreCatalog(kind, restoredBytes[kind]), /Unexpected upstream/);
    }
});

test('workspace restoration is repeatable and rejects unrecognized local catalog edits', () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'scratch-classic-test-'));
    try {
        // A local object-sharing clone exercises real Git provenance without modifying the build checkout.
        execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', workspace, temporary]);
        execFileSync('git', ['update-ref', 'HEAD', upstream.commit], {cwd: temporary});
        execFileSync('git', ['checkout', upstream.commit, '--', 'src/lib/libraries/sprites.json', 'src/lib/libraries/costumes.json'],
            {cwd: temporary});
        restoreWorkspace(temporary);
        restoreWorkspace(temporary);
        for (const kind of ['sprites', 'costumes']) {
            assert.deepEqual(fs.readFileSync(path.join(temporary, `src/lib/libraries/${kind}.json`)), restoredBytes[kind]);
        }
        fs.appendFileSync(path.join(temporary, 'src/lib/libraries/sprites.json'), '\n');
        assert.throws(() => restoreWorkspace(temporary), /Modified library catalog: sprites/);
    } finally {
        fs.rmSync(temporary, {recursive: true, force: true});
    }
});

// Opt in when the historical catalogs are available; normal builds use only the shallow pinned checkout.
test('restored records exactly match the historical source before removal',
    {skip: process.env.SCRATCH_VERIFY_CLASSIC_SOURCE !== '1'}, () => {
    for (const kind of ['sprites', 'costumes']) {
        const sourceBytes = readCatalog(classicLibrary.sourceCommit, kind);
        assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), classicLibrary.sourceCatalogHashes[kind]);
        const historical = new Map(JSON.parse(sourceBytes).map(item => [item.name, item]));
        for (const item of classicLibrary.catalogs[kind]) assert.deepEqual(item, historical.get(item.name));
    }
});

// Run after the local build with SCRATCH_VERIFY_PREPARED=1 to check shipped bytes as well as source catalogs.
test('prepared release includes every verified stock asset and the restored library manifest',
    {skip: process.env.SCRATCH_VERIFY_PREPARED !== '1'}, () => {
        const output = path.join(repo, 'packages/ui-default/public/scratch-editor/library-assets');
        const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')));
        assert.deepEqual(manifest, lock);
        for (const name of assetNames) verifyAsset(name, fs.readFileSync(path.join(output, name)), lock.files[name]);
    });
