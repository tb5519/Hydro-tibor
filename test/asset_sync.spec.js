const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { it } = require('node:test');

const source = pathToFileURL(path.resolve(__dirname, '../build/assets/sync.mjs'));

it('the real static upload SDK disables optional streaming checksums and retains OSS virtual-host addressing', async () => {
    const { createUploadClient } = await import(source);
    const client = createUploadClient({ endpoint: 'https://s3.oss-cn-wulanchabu.aliyuncs.com', region: 'cn-wulanchabu',
        accessKeyId: 'fixture-id', secretAccessKey: 'fixture-secret' });
    try {
        assert.equal(await client.config.requestChecksumCalculation(), 'WHEN_REQUIRED');
        assert.equal(client.config.forcePathStyle, false);
        assert.equal(await client.config.maxAttempts(), 3);
    } finally { client.destroy(); }
});

it('upload errors retain only a safe name, status and phase without provider messages, headers or credentials', async (t) => {
    const { safeFailure, uploadRelease } = await import(source);
    const secret = 'do-not-expose-this-token';
    const error = Object.assign(new Error(`Secret=${secret}`), { name: 'AccessDenied',
        $metadata: { httpStatusCode: 403, headers: { authorization: secret } }, config: { secretAccessKey: secret } });
    assert.deepEqual(safeFailure(error), { name: 'AccessDenied', httpStatus: 403 });
    assert.deepEqual(safeFailure({ name: `https://example.test/?token=${secret}`, $metadata: { httpStatusCode: secret } }), { name: 'Error' });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-sync-safe-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const body = Buffer.from('fixture bytes');
    fs.writeFileSync(path.join(directory, 'app.js'), body);
    const manifest = { files: [{ path: 'app.js', key: 'static/test-v1/app.js', size: body.length,
        sha256: createHash('sha256').update(body).digest('hex'), contentType: 'text/javascript', cacheControl: 'public' }] };
    for (const phase of ['head-existing', 'upload', 'head-verify']) {
        let heads = 0;
        const client = { async send(command) {
            if (command.constructor.name === 'HeadObjectCommand') {
                heads++;
                if (heads === 1 && phase !== 'head-existing') throw Object.assign(new Error(), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
                throw error;
            }
            assert.equal(command.constructor.name, 'PutObjectCommand');
            if (phase === 'upload') throw error;
            for await (const _chunk of command.input.Body) { /* Drain the successful streamed upload. */ }
            return {};
        } };
        await assert.rejects(uploadRelease(manifest, directory, { bucket: 'fixture' }, client), (failure) => {
            assert.deepEqual(safeFailure(failure), { name: 'AccessDenied', httpStatus: 403, phase });
            assert.equal(JSON.stringify(failure).includes(secret), false);
            return true;
        });
    }
});

it('recreates failed streams, checks ambiguous results before retry, and never overwrites conflicts', async (t) => {
    const { uploadRelease } = await import(source);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-sync-retry-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const body = Buffer.from('retryable fixture');
    fs.writeFileSync(path.join(directory, 'app.js'), body);
    const file = { path: 'app.js', key: 'static/test-v1/app.js', size: body.length,
        sha256: createHash('sha256').update(body).digest('hex'), contentType: 'text/javascript', cacheControl: 'public' };
    const metadata = { ContentLength: file.size, Metadata: { sha256: file.sha256 }, ContentType: file.contentType, CacheControl: file.cacheControl };
    for (const outcome of ['not-committed', 'committed', 'conflict', 'always-timeout']) {
        let uploaded = false;
        const streams = [];
        const client = { async send(command) {
            if (command.constructor.name === 'HeadObjectCommand') {
                if (uploaded) return outcome === 'conflict' ? { ...metadata, ContentLength: 1 } : metadata;
                throw Object.assign(new Error(), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
            }
            streams.push(command.input.Body);
            const chunks = [];
            for await (const chunk of command.input.Body) chunks.push(chunk);
            assert.deepEqual(Buffer.concat(chunks), body);
            if (streams.length === 1 || outcome === 'always-timeout') {
                uploaded = outcome === 'committed' || outcome === 'conflict';
                throw Object.assign(new Error('transient socket timeout'), { name: 'TimeoutError' });
            }
            uploaded = true;
            return {};
        } };
        if (outcome === 'conflict') await assert.rejects(uploadRelease({ files: [file] }, directory, { bucket: 'fixture' }, client), /already occupied/);
        else if (outcome === 'always-timeout') await assert.rejects(uploadRelease({ files: [file] }, directory, { bucket: 'fixture' }, client), { name: 'TimeoutError' });
        else assert.equal(await uploadRelease({ files: [file] }, directory, { bucket: 'fixture' }, client), 1);
        assert.equal(streams.length, outcome === 'not-committed' ? 2 : outcome === 'always-timeout' ? 3 : 1);
        assert.equal(new Set(streams).size, streams.length);
        assert.equal(streams.every((stream) => stream.destroyed), true);
    }
});
