const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { before, beforeEach, after, it } = require('node:test');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { eligibleAsset } = require('../packages/hydrooj/src/lib/asset_storage');

let server; let client; let db; let directory; let sound;
let enabled = true; let fault; let uploads; let deleted; let objects;
const legacy = { _id: 'system' };
const modern = { _id: 'class', workspaceId: 'other' };
const ctx = { db: { collection: (name) => {
    const collection = db.collection(name);
    if (fault === 'metadata-after-commit') {
        const original = collection.findOneAndUpdate.bind(collection);
        collection.findOneAndUpdate = async (...args) => { await original(...args); throw new Error('lost acknowledgement'); };
    } else if (fault === 'metadata-before-commit') collection.findOneAndUpdate = async () => { throw new Error('database unavailable'); };
    return collection;
} } };
class ValidationError extends Error { constructor(field, _, message) { super(message || field); } }
const storage = {
    async put(name, bytes, owner, options) {
        assert.equal(options.remoteOnly, true);
        assert.ok(eligibleAsset(name, 'audio/wav'));
        if (fault === 'upload') throw new Error('upload failed');
        uploads.push({ name, bytes: Buffer.from(bytes), owner }); objects.set(name, bytes);
    },
    async del(names) { deleted.push(...names); names.forEach((name) => objects.delete(name)); },
};
const originalLoad = Module._load;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/lib/achievement_sound.ts')) {
            if (request === '../error') return { ValidationError };
            if (request === '../model/storage') return storage;
            if (request === './asset_storage') return { shouldStore: (name, type) => enabled && eligibleAsset(name, type) };
            if (request === './achievement') return { getAchievementScope: (domain) => domain.workspaceId ? `domain:${domain._id}` : 'legacy' };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    sound = require('../packages/hydrooj/src/lib/achievement_sound');
} finally { Module._load = originalLoad; }

function wav() {
    const bytes = Buffer.alloc(46);
    bytes.write('RIFF'); bytes.writeUInt32LE(38, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(44100, 24);
    bytes.writeUInt32LE(88200, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36); bytes.writeUInt32LE(2, 40); return bytes;
}
function mp3() {
    const frame = Buffer.alloc(417); frame.writeUInt32BE(0xfffb9000); return Buffer.concat([frame, frame]);
}
function ogg() {
    const head = Buffer.alloc(19); head.write('OpusHead'); head[8] = 1; head[9] = 1;
    return Buffer.concat([head, Buffer.from('OpusTags'), Buffer.from([0xf8, 0xff, 0xfe])].map((packet, index) => {
        const page = Buffer.alloc(28); page.write('OggS'); page[5] = index === 0 ? 2 : 0; page[26] = 1; page[27] = packet.length;
        return Buffer.concat([page, packet]);
    }));
}
function box(type, bytes) { const header = Buffer.alloc(8); header.writeUInt32BE(bytes.length + 8); header.write(type, 4); return Buffer.concat([header, bytes]); }
function m4a(type = 'soun') {
    const hdlr = Buffer.alloc(12); hdlr.write(type, 8);
    return Buffer.concat([box('ftyp', Buffer.from('M4A \0\0\0\0')), box('moov', box('trak', box('mdia', box('hdlr', hdlr)))), box('mdat', Buffer.from([1, 2, 3]))]);
}
async function file(bytes = wav(), filename = 'achievement.wav') {
    const filepath = path.join(directory, filename.replaceAll('/', '_'));
    await fs.writeFile(filepath, bytes);
    return { filepath, originalFilename: filename, size: bytes.length };
}

before(async () => {
    server = await MongoMemoryServer.create(); client = await MongoClient.connect(server.getUri()); db = client.db('achievement-sound');
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'achievement-sound-test-'));
});
beforeEach(async () => { await db.dropDatabase(); enabled = true; fault = null; uploads = []; deleted = []; objects = new Map(); });
after(async () => { await client?.close(); await server?.stop(); await fs.rm(directory, { recursive: true, force: true }); });

it('accepts MP3, WAV, OGG and M4A byte structures and preserves original sound quality', async () => {
    for (const [ext, bytes] of [['.mp3', mp3()], ['.wav', wav()], ['.ogg', ogg()], ['.m4a', m4a()]]) {
        const result = await sound.prepareAchievementSound(await file(bytes, `sample${ext}`));
        assert.deepEqual(result.bytes, bytes); assert.equal(result.ext, ext);
    }
});

it('accepts a real AAC M4A file exported by the system audio encoder', async () => {
    // 100 ms of generated 880 Hz PCM, encoded with: afconvert tone.wav tone.m4a -f m4af -d aac -b 32000.
    const bytes = await fs.readFile(path.join(__dirname, 'fixtures/achievement_tone.m4a'));
    const prepared = await sound.prepareAchievementSound(await file(bytes, 'encoded.m4a'));
    assert.equal(prepared.contentType, 'audio/mp4');
    assert.deepEqual(prepared.bytes, bytes);
});

it('rejects spoofed files, empty or oversized uploads, incomplete audio and video-only MP4', async () => {
    const valid = await file();
    for (const candidate of [undefined, { ...valid, size: 0 }, { ...valid, size: NaN }, { ...valid, size: 9 * 1024 * 1024 }, { ...valid, originalFilename: 'sound.svg' }]) {
        await assert.rejects(sound.prepareAchievementSound(candidate), ValidationError);
    }
    for (const ext of ['mp3', 'ogg', 'wav', 'm4a']) {
        await assert.rejects(sound.prepareAchievementSound(await file(Buffer.from('<script>bad()</script>'), `fake.${ext}`)), ValidationError);
    }
    for (const [ext, bytes] of [['.mp3', Buffer.from('ID3\x04\0\0\0\0\0\0')], ['.wav', wav().subarray(0, 45)], ['.ogg', ogg().subarray(0, 47)], ['.m4a', m4a('vide')]]) {
        assert.throws(() => sound.validateAchievementSound(bytes, ext), ValidationError);
    }
    assert.equal(uploads.length, 0);
});

it('uses one default sound configuration per scope and presents a versioned protected URL', async () => {
    assert.deepEqual(await sound.presentAchievementSound(ctx, legacy), { soundUrl: '', filename: '', volume: 70, enabled: true });
    await sound.setAchievementSound(ctx, legacy, await file(), 2);
    const presented = await sound.presentAchievementSound(ctx, legacy);
    assert.match(presented.soundUrl, /^\/d\/system\/achievement\/sound\?v=[a-f0-9]{32}$/);
    assert.equal(presented.volume, 70); assert.equal(presented.enabled, true); assert.equal(presented.filename, 'achievement.wav');
    assert.deepEqual(await sound.presentAchievementSound(ctx, modern), { soundUrl: '', filename: '', volume: 70, enabled: true });
    const otherLegacy = await sound.presentAchievementSound(ctx, { _id: 'python' });
    assert.equal(otherLegacy.soundUrl.replace('/python/', '/system/'), presented.soundUrl);
    assert.equal(uploads.length, 1); assert.deepEqual(uploads[0].bytes, wav()); assert.equal(uploads[0].owner, 2);
});

it('requires object storage and only admits scoped sound paths with matching MIME types', async () => {
    enabled = false;
    await assert.rejects(sound.setAchievementSound(ctx, legacy, await file(), 2), /对象存储/);
    assert.equal(uploads.length, 0); assert.equal(await db.collection('achievement.sound').countDocuments(), 0);
    const prefix = `achievement/${'a'.repeat(32)}/sound/${'b'.repeat(32)}`;
    assert.equal(eligibleAsset(`${prefix}.wav`, 'audio/wav'), true);
    assert.equal(eligibleAsset(`${prefix}.wav`, 'text/html'), false);
    assert.equal(eligibleAsset(`${prefix}.mp3`, 'audio/mpeg'), true);
    assert.equal(eligibleAsset(`${prefix}.ogg`, 'audio/ogg'), true);
    assert.equal(eligibleAsset(`${prefix}.m4a`, 'audio/mp4'), true);
    assert.equal(eligibleAsset(`${prefix}.svg`, 'image/svg+xml'), false);
    assert.equal(eligibleAsset(`achievement/../sound/${'b'.repeat(32)}.mp3`, 'audio/mpeg'), false);
});

it('saving preferences changes no stored asset and uploading preserves volume while enabling playback', async () => {
    await sound.setAchievementSound(ctx, legacy, await file(), 2);
    const old = await sound.getAchievementSound(ctx, legacy);
    await sound.saveAchievementSound(ctx, legacy, 25, false, 2);
    assert.equal((await sound.getAchievementSound(ctx, legacy)).soundPath, old.soundPath);
    assert.equal((await sound.presentAchievementSound(ctx, legacy)).enabled, false);
    await sound.setAchievementSound(ctx, legacy, await file(wav(), 'new.wav'), 2);
    const current = await sound.presentAchievementSound(ctx, legacy);
    assert.equal(current.volume, 25); assert.equal(current.enabled, true); assert.equal(current.filename, 'new.wav');
    assert.deepEqual(deleted, [old.soundPath]);
    for (const value of [-1, 101, 1.5, NaN, '40', null]) await assert.rejects(sound.saveAchievementSound(ctx, legacy, value, true, 2), ValidationError);
    await assert.rejects(sound.saveAchievementSound(ctx, legacy, 40, 'false', 2), ValidationError);
});

it('removing sound preserves volume and switch settings and never modifies image metadata', async () => {
    await db.collection('achievement.image').insertOne({ _id: 'legacy/difficulty-1', imagePath: 'original.png', thumbnailPath: 'thumb.png' });
    await sound.setAchievementSound(ctx, legacy, await file(), 2);
    await sound.saveAchievementSound(ctx, legacy, 10, false, 2);
    await sound.removeAchievementSound(ctx, legacy, 2);
    assert.deepEqual(await sound.presentAchievementSound(ctx, legacy), { soundUrl: '', filename: '', volume: 10, enabled: false });
    assert.equal(objects.size, 0);
    assert.equal((await db.collection('achievement.image').findOne()).imagePath, 'original.png');
    await sound.setAchievementSound(ctx, legacy, await file(), 2);
    assert.equal((await sound.presentAchievementSound(ctx, legacy)).volume, 10);
});

it('concurrent uploads and preference changes retain the last committed object without deleting a winner', async () => {
    await sound.saveAchievementSound(ctx, legacy, 15, false, 2);
    const upload = await file();
    await Promise.all([sound.setAchievementSound(ctx, legacy, upload, 2), sound.setAchievementSound(ctx, legacy, upload, 2), sound.saveAchievementSound(ctx, legacy, 35, true, 2)]);
    const stored = await sound.getAchievementSound(ctx, legacy);
    assert.equal(stored.volume, 35); assert.ok(objects.has(stored.soundPath)); assert.equal(objects.size, 1);
    assert.equal(deleted.includes(stored.soundPath), false);
});

it('an upload or metadata failure keeps the previous sound and cleans only the unreferenced replacement', async () => {
    await sound.setAchievementSound(ctx, legacy, await file(), 2);
    const old = await sound.getAchievementSound(ctx, legacy);
    for (const failedAt of ['upload', 'metadata-before-commit']) {
        fault = failedAt;
        await assert.rejects(sound.setAchievementSound(ctx, legacy, await file(), 2));
        fault = null;
        assert.equal((await sound.getAchievementSound(ctx, legacy)).soundPath, old.soundPath);
        assert.equal(objects.size, 1); assert.ok(objects.has(old.soundPath));
    }
});

it('a lost database acknowledgement never deletes the newly committed sound', async () => {
    fault = 'metadata-after-commit';
    await assert.rejects(sound.setAchievementSound(ctx, legacy, await file(), 2), /lost acknowledgement/);
    fault = null;
    const current = await sound.getAchievementSound(ctx, legacy);
    assert.ok(objects.has(current.soundPath)); assert.equal(deleted.length, 0);
});
