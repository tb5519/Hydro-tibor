const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { before, beforeEach, after, it } = require('node:test');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { PNG } = require('pngjs');
const { eligibleAsset } = require('../packages/hydrooj/src/lib/asset_storage');
const { ACHIEVEMENT_CATALOG } = require('../packages/hydrooj/src/lib/achievement_catalog');

let server; let client; let db; let directory;
let bytes; let file; let art;
let enabled = true; let fault; let uploads; let deleted; let objects;
const legacy = { _id: 'system' };
const modern = { _id: 'class', workspaceId: 'other' };
const ctx = { db: { collection: (name) => {
    const collection = db.collection(name);
    if (fault === 'metadata-after-commit') {
        const original = collection.findOneAndUpdate.bind(collection);
        collection.findOneAndUpdate = async (...args) => { await original(...args); throw new Error('lost acknowledgement'); };
    }
    return collection;
} } };
class ValidationError extends Error { constructor(field, _, message) { super(message || field); } }
const storage = {
    async put(name, buffer, owner, options) {
        assert.equal(options.remoteOnly, true);
        assert.ok(eligibleAsset(name, 'image/png'));
        if (fault === 'thumbnail' && name.endsWith('-384.png')) throw new Error('upload failed');
        uploads.push({ name, buffer: Buffer.from(buffer), owner }); objects.set(name, buffer);
    },
    async del(names) { deleted.push(...names); names.forEach((name) => objects.delete(name)); },
};
const originalLoad = Module._load;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/lib/achievement_image.ts')) {
            if (request === '../error') return { ValidationError };
            if (request === '../model/storage') return storage;
            if (request === './asset_storage') return { shouldStore: (name, type) => enabled && eligibleAsset(name, type) };
            if (request === './achievement') return { getAchievementScope: (domain) => domain.workspaceId ? `domain:${domain._id}` : 'legacy' };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    art = require('../packages/hydrooj/src/lib/achievement_image');
} finally { Module._load = originalLoad; }

before(async () => {
    server = await MongoMemoryServer.create(); client = await MongoClient.connect(server.getUri()); db = client.db('achievement-artwork');
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'achievement-artwork-test-'));
    const data = Buffer.alloc(960 * 480 * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = 245; data[i + 1] = 190; data[i + 2] = 90; data[i + 3] = i < 960 * 4 ? 0 : 128; }
    bytes = PNG.sync.write({ width: 960, height: 480, data });
    file = { filepath: path.join(directory, 'achievement.png'), size: bytes.length, originalFilename: 'achievement.png' };
    await fs.writeFile(file.filepath, bytes);
});
beforeEach(async () => {
    await db.dropDatabase(); enabled = true; fault = null; uploads = []; deleted = []; objects = new Map();
});
after(async () => { await client?.close(); await server?.stop(); await fs.rm(directory, { recursive: true, force: true }); });

it('preserves high resolution original bytes and creates a small transparent proportional thumbnail', async () => {
    const prepared = await art.prepareAchievementImage(file);
    assert.deepEqual(prepared.original, bytes);
    const thumbnail = PNG.sync.read(prepared.thumbnail);
    assert.equal(thumbnail.width, 384); assert.equal(thumbnail.height, 192);
    assert.ok(thumbnail.data[3] < 128); assert.equal(thumbnail.data.at(-1), 128);
    assert.ok(prepared.thumbnail.length < prepared.original.length);
});

it('rejects missing, oversized, falsely labelled and corrupt images before storage', async () => {
    for (const candidate of [undefined, { ...file, size: 9 * 1024 * 1024 }, { ...file, originalFilename: 'x.svg' }]) {
        await assert.rejects(art.prepareAchievementImage(candidate), ValidationError);
    }
    const corrupt = path.join(directory, 'corrupt.png'); await fs.writeFile(corrupt, '<svg>not a PNG</svg>');
    await assert.rejects(art.prepareAchievementImage({ ...file, filepath: corrupt }), ValidationError);
    assert.equal(uploads.length, 0);
});

it('stores originals and thumbnails as separate objects with independent versioned scoped URLs', async () => {
    await art.setAchievementImage(ctx, legacy, 'difficulty-1', file, 2);
    assert.equal(uploads.length, 2); assert.deepEqual(uploads[0].buffer, bytes);
    const artwork = await art.getAchievementArtwork(ctx, legacy, 'difficulty-1');
    const [card] = await art.presentAchievements(ctx, legacy, [{ id: 'difficulty-1', category: 'difficulty' }]);
    assert.match(card.imageUrl, /^\/d\/system\/achievement\/difficulty-1\/image\?v=[a-f0-9]{32}$/);
    assert.match(card.thumbnailUrl, /\?size=384&v=/); assert.equal(card.categoryLabel, '初次突破');
    assert.ok(objects.has(artwork.imagePath)); assert.ok(objects.has(artwork.thumbnailPath));
    const [other] = await art.presentAchievements(ctx, modern, [{ id: 'difficulty-1', category: 'difficulty' }]);
    assert.equal(other.imageUrl, ''); assert.equal(other.thumbnailUrl, '');
});

it('requires object storage and refuses unknown achievement identifiers', async () => {
    enabled = false;
    await assert.rejects(art.setAchievementImage(ctx, legacy, 'difficulty-1', file, 2), /对象存储/);
    await assert.rejects(art.setAchievementImage(ctx, legacy, '../../user', file, 2), ValidationError);
    assert.equal(uploads.length, 0);
    assert.equal(await db.collection('achievement.image').countDocuments(), 0);
});

it('labels every continuous-AC achievement in Chinese and accepts its original and thumbnail upload', async () => {
    const streaks = ACHIEVEMENT_CATALOG.filter((item) => item.category === 'streak');
    assert.equal(streaks.length, 14);
    const unconfigured = await art.presentAchievements(ctx, legacy, streaks);
    for (const item of unconfigured) {
        assert.equal(item.categoryLabel, '连续 AC');
        assert.equal(item.thumbnailUrl, '');
        assert.equal(art.achievementDefinition(item.id).category, 'streak');
    }
    const selected = streaks.at(-1);
    await art.setAchievementImage(ctx, legacy, selected.id, file, 2);
    const [card] = await art.presentAchievements(ctx, legacy, [selected]);
    assert.equal(card.categoryLabel, '连续 AC');
    assert.match(card.imageUrl, new RegExp(`/achievement/${selected.id}/image\\?v=[a-f0-9]{32}$`));
    assert.match(card.thumbnailUrl, new RegExp(`/achievement/${selected.id}/image\\?size=384&v=[a-f0-9]{32}$`));
    assert.equal(uploads.length, 2);
    assert.ok(uploads.every(({ name }) => name.includes(`/${selected.id}/`)));
});

it('failed thumbnail upload retains prior image and cleans only the new incomplete object', async () => {
    await art.setAchievementImage(ctx, legacy, 'difficulty-1', file, 2);
    const old = await art.getAchievementArtwork(ctx, legacy, 'difficulty-1');
    fault = 'thumbnail';
    await assert.rejects(art.setAchievementImage(ctx, legacy, 'difficulty-1', file, 2), /upload failed/);
    assert.deepEqual(await art.getAchievementArtwork(ctx, legacy, 'difficulty-1'), old);
    assert.ok(objects.has(old.imagePath)); assert.ok(objects.has(old.thumbnailPath));
    assert.equal(deleted.length, 1); assert.equal(objects.size, 2);
});

it('lost metadata acknowledgement never deletes newly referenced artwork', async () => {
    fault = 'metadata-after-commit';
    await assert.rejects(art.setAchievementImage(ctx, legacy, 'difficulty-1', file, 2), /lost acknowledgement/);
    fault = null;
    const current = await art.getAchievementArtwork(ctx, legacy, 'difficulty-1');
    assert.ok(objects.has(current.imagePath)); assert.ok(objects.has(current.thumbnailPath));
    assert.equal(deleted.length, 0);
});

it('replacement and removal retire only superseded objects without changing earned achievements', async () => {
    await db.collection('achievement.unlock').insertOne({ uid: 11, achievementId: 'difficulty-1' });
    await art.setAchievementImage(ctx, legacy, 'difficulty-1', file, 2);
    const old = await art.getAchievementArtwork(ctx, legacy, 'difficulty-1');
    await art.setAchievementImage(ctx, legacy, 'difficulty-1', file, 2);
    const current = await art.getAchievementArtwork(ctx, legacy, 'difficulty-1');
    assert.notEqual(current.version, old.version); assert.ok(deleted.includes(old.imagePath)); assert.ok(deleted.includes(old.thumbnailPath));
    await art.removeAchievementImage(ctx, legacy, 'difficulty-1', 2);
    assert.equal(objects.size, 0); assert.equal(await db.collection('achievement.unlock').countDocuments(), 1);
    const [card] = await art.presentAchievements(ctx, legacy, [{ id: 'difficulty-1' }]);
    assert.equal(card.imageUrl, ''); assert.equal(card.thumbnailUrl, '');
});

it('simultaneous image edits keep both object files of the winning publication', async () => {
    await Promise.all([art.setAchievementImage(ctx, legacy, 'solved-10', file, 2), art.setAchievementImage(ctx, legacy, 'solved-10', file, 2)]);
    const current = await art.getAchievementArtwork(ctx, legacy, 'solved-10');
    assert.ok(objects.has(current.imagePath)); assert.ok(objects.has(current.thumbnailPath)); assert.equal(objects.size, 2);
});

it('object storage allowlist accepts only scoped immutable achievement PNG objects', () => {
    const prefix = `achievement/${'a'.repeat(32)}/difficulty-1/${'b'.repeat(32)}`;
    assert.ok(eligibleAsset(`${prefix}.png`, 'image/png')); assert.ok(eligibleAsset(`${prefix}-384.png`, 'image/png'));
    for (const candidate of [`${prefix}.svg`, `${prefix}.png/extra`, `${prefix}/../a.png`, `${prefix}-768.png`]) {
        assert.equal(eligibleAsset(candidate, 'image/png'), false);
    }
    assert.equal(eligibleAsset(`${prefix}.png`, 'text/html'), false);
});
