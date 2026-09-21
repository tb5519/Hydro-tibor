#!/usr/bin/env node
// Upload only the prepared public release allowlist. No build, package install, or storage traversal.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appRequire = createRequire(path.join(root, 'packages/hydrooj/package.json'));
const { S3Client, PutObjectCommand, HeadObjectCommand } = appRequire('@aws-sdk/client-s3');
const { lookup } = appRequire('mime-types');
const extras = ['favicon.ico', 'favicon.svg', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-96x96.png',
    'apple-touch-icon-180x180.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png',
    'img/avatar.png', 'img/team_avatar.png'];

function safeRelative(value) {
    return typeof value === 'string' && value && !path.isAbsolute(value) && !/[\\\u0000-\u001f?#]/.test(value)
        && value.split('/').every((part) => part && part !== '.' && part !== '..');
}

export async function digest(filename, algorithm = 'sha256') {
    const hash = createHash(algorithm);
    for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
    return hash.digest('hex');
}

export async function collectRelease(publicRoot, version, repository = root) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(version)) throw new Error('Invalid release version');
    const directory = path.resolve(publicRoot);
    if (directory !== path.join(path.resolve(repository), 'packages/ui-default/public')
        || fs.realpathSync(directory) !== directory) throw new Error('Source must be this release checkout packages/ui-default/public');
    const git = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (git(['status', '--porcelain', '--untracked-files=no', '--', 'packages/ui-default/public']).trim()) {
        throw new Error('Commit the prepared public assets before uploading');
    }
    const tracked = new Set(git(['ls-files', '-z', '--', 'packages/ui-default/public']).split('\0'));
    const names = new Set();
    const add = (relative, required = true) => {
        if (!safeRelative(relative) || relative.endsWith('.map')) throw new Error('Unsafe release asset path');
        const filename = path.join(directory, relative);
        if (!required && !fs.existsSync(filename)) return;
        if (!tracked.has(`packages/ui-default/public/${relative}`)) throw new Error(`Uncommitted release asset: ${relative}`);
        const stat = fs.lstatSync(filename);
        if (!stat.isFile() || !stat.size || !fs.realpathSync(filename).startsWith(`${directory}${path.sep}`)) {
            throw new Error(`Invalid release file: ${relative}`);
        }
        names.add(relative);
    };
    const manifest = JSON.parse(await fsp.readFile(path.join(directory, 'manifest.json'), 'utf8'));
    if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object' || !Object.keys(manifest).length) throw new Error('Invalid UI manifest');
    add('manifest.json');
    for (const value of Object.values(manifest)) {
        if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) throw new Error('Invalid UI manifest asset');
        const relative = decodeURIComponent(value.split(/[?#]/, 1)[0].slice(1));
        if (!relative.endsWith('.map')) add(relative);
    }
    const scratchFile = path.join(directory, 'scratch-editor/build-manifest.json');
    let scratch;
    if (fs.existsSync(scratchFile)) {
        scratch = JSON.parse(await fsp.readFile(scratchFile, 'utf8'));
        if (!scratch.files || Array.isArray(scratch.files) || !Object.keys(scratch.files).length) throw new Error('Invalid Scratch manifest');
        add('scratch-editor/build-manifest.json');
        for (const required of ['editor.html', 'source.tar.gz', 'UPSTREAM-LICENSE']) {
            if (!Object.hasOwn(scratch.files, required)) throw new Error(`Scratch manifest is missing: ${required}`);
        }
        for (const relative of Object.keys(scratch.files)) {
            if (!safeRelative(relative)) throw new Error('Unsafe Scratch asset');
            add(`scratch-editor/${relative}`);
        }
        if (scratch.files['library-assets/manifest.json']) {
            const library = JSON.parse(await fsp.readFile(path.join(directory, 'scratch-editor/library-assets/manifest.json'), 'utf8'));
            if (library.commit !== scratch.commit || !library.files || Array.isArray(library.files)) throw new Error('Invalid Scratch library manifest');
            for (const [name, info] of Object.entries(library.files)) {
                if (!/^[a-f0-9]{32}\.(svg|png|wav)$/.test(name)
                    || scratch.files[`library-assets/${name}`] !== info.sha256
                    || fs.statSync(path.join(directory, 'scratch-editor/library-assets', name)).size !== info.size) {
                    throw new Error('Scratch library manifest does not match release');
                }
            }
        }
    }
    extras.forEach((file) => add(file, false));
    const files = [];
    for (const relative of [...names].sort()) {
        const filename = path.join(directory, relative);
        const hash = await digest(filename);
        const expected = relative.startsWith('scratch-editor/') ? scratch?.files[relative.slice('scratch-editor/'.length)] : null;
        if (expected && expected !== hash) throw new Error(`Scratch asset hash mismatch: ${relative}`);
        files.push({ path: relative, key: `static/${version}/${relative}`, size: fs.statSync(filename).size, sha256: hash,
            contentType: lookup(relative) || 'application/octet-stream',
            cacheControl: relative.endsWith('.html') ? 'public, max-age=300' : 'public, max-age=31536000, immutable' });
    }
    return { version: 1, release: version, commit: git(['rev-parse', 'HEAD']).trim(), files };
}

function readConfig(override) {
    const filename = override || process.env.HYDRO_ASSET_CONFIG_PATH || path.join(os.homedir(), '.hydro/assets.json');
    if (!path.isAbsolute(filename)) throw new Error('Asset configuration path must be absolute');
    let config;
    try { config = JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { throw new Error('Cannot read asset configuration'); }
    if (![config.bucket, config.region, config.endpoint, config.accessKeyId, config.secretAccessKey].every((item) => typeof item === 'string' && item)) {
        throw new Error('Incomplete asset upload configuration');
    }
    const endpoint = new URL(config.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
        throw new Error('Invalid asset endpoint');
    }
    return config;
}

export function createUploadClient(config) {
    return new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: false,
        // OSS accepts Content-MD5 but not SDK 3.726.1's automatic aws-chunked CRC32 stream encoding.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        maxAttempts: 3, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, sessionToken: config.sessionToken } });
}

/** Only bounded diagnostic fields; never provider messages, request headers, URLs, credentials or stack traces. */
export function safeFailure(error) {
    const output = { name: typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(error.name) ? error.name : 'Error' };
    const status = error?.$metadata?.httpStatusCode;
    if (Number.isInteger(status) && status >= 100 && status <= 599) output.httpStatus = status;
    if (['head-existing', 'upload', 'head-verify'].includes(error?.assetPhase)) output.phase = error.assetPhase;
    return output;
}

function requestFailure(error, phase) {
    const details = safeFailure(error);
    const failure = new Error('Asset request failed');
    failure.name = details.name;
    failure.$metadata = { httpStatusCode: details.httpStatus };
    failure.assetPhase = phase;
    return failure;
}

function matchesRelease(file, response) {
    return response.ContentLength === file.size && response.Metadata?.sha256 === file.sha256
        && response.ContentType === file.contentType && response.CacheControl === file.cacheControl;
}

async function existingObject(client, args) {
    try { return await client.send(new HeadObjectCommand(args), { abortSignal: AbortSignal.timeout(30_000) }); } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || ['NotFound', 'NoSuchKey'].includes(error?.name)) return null;
        throw requestFailure(error, 'head-existing');
    }
}

const retryableUpload = (error) => [429, 500, 502, 503, 504].includes(error?.$metadata?.httpStatusCode)
    || ['TimeoutError', 'RequestTimeout', 'RequestTimeoutException', 'AbortError', 'SlowDown', 'InternalError'].includes(error?.name)
    || ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED'].includes(error?.code);

async function uploadFile(client, args, file, filename) {
    for (let attempt = 0; attempt < 3; attempt++) {
        if (await digest(filename) !== file.sha256) throw new Error('Release files changed after planning');
        const contentMD5 = Buffer.from(await digest(filename, 'md5'), 'hex').toString('base64');
        const stream = fs.createReadStream(filename);
        try {
            // A fresh stream is required on every attempt; the SDK cannot rewind a failed ReadStream itself.
            await client.send(new PutObjectCommand({ ...args, Body: stream, ContentLength: file.size,
                ContentMD5: contentMD5, ContentType: file.contentType, CacheControl: file.cacheControl,
                Metadata: { sha256: file.sha256 } }), { abortSignal: AbortSignal.timeout(10 * 60_000) });
            return;
        } catch (error) {
            if (!retryableUpload(error) || attempt === 2) throw requestFailure(error, 'upload');
            stream.destroy();
            // A timeout can occur after OSS committed the bytes. Verify first and never overwrite a conflicting object.
            const existing = await existingObject(client, args);
            if (existing) {
                if (!matchesRelease(file, existing)) throw new Error(`Release version is already occupied by different content: ${file.path}`);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        } finally { stream.destroy(); }
    }
}

export async function uploadRelease(manifest, directory, config, suppliedClient) {
    const client = suppliedClient || createUploadClient(config);
    let uploaded = 0;
    for (const file of manifest.files) {
        const args = { Bucket: config.bucket, Key: file.key };
        const existing = await existingObject(client, args);
        if (existing && !matchesRelease(file, existing)) {
            throw new Error(`Release version is already occupied by different content: ${file.path}`);
        }
        if (!existing) {
            const filename = path.join(directory, file.path);
            await uploadFile(client, args, file, filename);
            if (await digest(filename) !== file.sha256) throw new Error('Release files changed during upload');
            uploaded++;
        }
        let verified;
        try { verified = await client.send(new HeadObjectCommand(args), { abortSignal: AbortSignal.timeout(30_000) }); } catch (error) {
            throw requestFailure(error, 'head-verify');
        }
        if (!matchesRelease(file, verified)) throw new Error(`Uploaded file verification failed: ${file.path}`);
    }
    return uploaded;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        console.log('Usage: node build/assets/sync.mjs --public-dir <absolute checkout/packages/ui-default/public> --version <release> [--apply] [--config <absolute private file>] [--output <manifest.json>]');
        console.log('Default is dry-run. Apply uploads an additive, committed allowlist and writes a verified manifest only after all HEAD checks pass. No deletion/build/install.');
        return;
    }
    const values = {};
    let apply = false;
    for (let index = 0; index < args.length; index++) {
        if (args[index] === '--apply') { apply = true; continue; }
        if (!['--public-dir', '--version', '--config', '--output'].includes(args[index]) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Invalid arguments; see --help');
        values[args[index].slice(2)] = args[++index];
    }
    if (!values['public-dir'] || !values.version || !path.isAbsolute(values['public-dir'])) throw new Error('Provide absolute --public-dir and --version');
    const manifest = await collectRelease(values['public-dir'], values.version);
    console.log(`${apply ? 'Upload' : 'Dry run'}: ${manifest.files.length} files, ${manifest.files.reduce((sum, file) => sum + file.size, 0)} bytes, release ${manifest.release}.`);
    if (!apply) return;
    const uploaded = await uploadRelease(manifest, values['public-dir'], readConfig(values.config));
    const output = path.resolve(values.output || path.join(root, '.cache/assets', `${manifest.release}.json`));
    await fsp.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
    const temporary = `${output}.${process.pid}.tmp`;
    await fsp.writeFile(temporary, JSON.stringify({ ...manifest, verifiedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    await fsp.rename(temporary, output);
    console.log(`Verified ${manifest.files.length} files; uploaded ${uploaded}. Manifest: ${output}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`Asset synchronization failed: ${JSON.stringify(safeFailure(error))}. No configuration values or signing details are printed.`);
        process.exitCode = 1;
    });
}
