const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { it } = require('node:test');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');

const execute = promisify(execFile);
const root = path.resolve(__dirname, '..');

it('standalone CJS-registered CLI reaches real Mongo and scans a mapped collection without writing or loading credentials', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-backfill-cli-'));
    let mongo;
    let client;
    try {
        mongo = await MongoMemoryServer.create();
        client = await MongoClient.connect(mongo.getUri());
        const db = client.db('asset_backfill_cli_test');
        const collection = db.collection('mapped_storage');
        const storageRoot = path.join(directory, 'files');
        const originalFile = path.join(storageRoot, 'aa', 'original.png');
        fs.mkdirSync(path.dirname(originalFile), { recursive: true });
        fs.writeFileSync(originalFile, 'png');
        const records = [
            { _id: 'aa/original.png', path: 'user/12/photo.png', size: 3, etag: 'fixture-original', meta: { 'Content-Type': 'image/png' } },
            { _id: 'bb/judge.in', path: 'problem/main/1/testdata/input.in', size: 99, meta: { 'Content-Type': 'text/plain' } },
            { _id: 'cc/remote.png', path: 'training/main/2/photo.png', size: 5, meta: { 'Content-Type': 'image/png' },
                remoteAsset: { key: `media/v1/${'a'.repeat(64)}.png`, sha256: 'b'.repeat(64), size: 5,
                    contentType: 'image/png', bucket: 'offline-test', region: 'cn-wulanchabu' } },
        ];
        await collection.insertMany(records);
        const before = await collection.find().sort({ _id: 1 }).toArray();
        const databaseConfig = path.join(directory, 'database.json');
        fs.writeFileSync(databaseConfig, JSON.stringify({ url: mongo.getUri('asset_backfill_cli_test'),
            prefix: 'test', collectionMap: { 'test.storage': 'mapped_storage', 'test.storage.asset': 'mapped_assets' } }), { mode: 0o600 });
        const manifest = path.join(directory, 'should-not-exist.jsonl');
        const args = ['-r', '@hydrooj/register', 'build/assets/backfill.ts', '--database-config', databaseConfig,
            '--storage-root', storageRoot, '--asset-config', path.join(directory, 'deliberately-missing-assets.json'),
            '--manifest', manifest, '--limit', '10'];
        const { stdout, stderr } = await execute(process.execPath, args, { cwd: root, timeout: 30_000,
            env: { ...process.env, HYDRO_ASSET_CONFIG_PATH: path.join(directory, 'never-use-user-config.json') } });
        assert.equal(stderr, '');
        const result = JSON.parse(stdout.trim());
        assert.deepEqual(result, { dryRun: true, scanned: 3, candidates: 2, bytes: 3, migrated: 0,
            alreadyRemote: 1, skipped: 1, localDeleted: 0, localRetained: 0, nextId: 'cc/remote.png', hasMore: false });
        assert.deepEqual(await collection.find().sort({ _id: 1 }).toArray(), before);
        assert.deepEqual((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name), ['mapped_storage']);
        assert.equal(fs.readFileSync(originalFile, 'utf8'), 'png');
        assert.equal(fs.existsSync(manifest), false);
        assert.equal(fs.existsSync(`${manifest}.lock`), false);
        const next = await execute(process.execPath, [...args, '--after-id', 'bb/judge.in'], { cwd: root, timeout: 30_000 });
        const page = JSON.parse(next.stdout.trim());
        assert.equal(page.scanned, 1);
        assert.equal(page.alreadyRemote, 1);
        assert.equal(page.bytes, 0);
        assert.equal(page.nextId, 'cc/remote.png');
    } finally {
        await client?.close();
        await mongo?.stop();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
