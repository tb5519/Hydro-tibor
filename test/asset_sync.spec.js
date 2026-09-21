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
