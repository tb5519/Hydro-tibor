#!/usr/bin/env node
// Development-only mirror of the pinned built-in library; never run on production.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const upstream = JSON.parse(await fs.readFile(path.join(here, 'upstream.json'), 'utf8'));
const lockPath = path.join(here, 'library-assets.lock.json');
const assetPattern = /^[a-f0-9]{32}\.(svg|png|wav)$/;
const types = {svg: 'image/svg+xml', png: 'image/png', wav: 'audio/wav'};
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
export function collectAssetNames(catalogs) {
    const names = new Set();
    const visit = value => {
        if (!value || typeof value !== 'object') return;
        if (Object.hasOwn(value, 'md5ext')) {
            if (!assetPattern.test(value.md5ext)) throw new Error('Invalid built-in asset name');
            names.add(value.md5ext);
        }
        for (const child of Object.values(value)) if (typeof child === 'object') visit(child);
    };
    catalogs.forEach(visit);
    return [...names].sort();
}
export function verifyAsset(name, bytes, expected) {
    if (!assetPattern.test(name) || !bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error(`Invalid asset: ${name}`);
    if (hash(bytes, 'md5') !== name.split('.')[0]) throw new Error(`Asset MD5 mismatch: ${name}`);
    const record = {sha256: hash(bytes), size: bytes.length, contentType: types[name.split('.')[1]]};
    if (expected && (expected.sha256 !== record.sha256 || expected.size !== record.size || expected.contentType !== record.contentType)) {
        throw new Error(`Asset lock mismatch: ${name}`);
    }
    return record;
}
export async function prepareLibraryAssets({workspace, outputDir, cacheDir, writeLock = false}) {
    workspace = path.resolve(workspace);
    const hasGit = await fs.stat(path.join(workspace, '.git')).then(() => true, () => false);
    if (!hasGit && writeLock) throw new Error('Lock generation requires the pinned Git checkout');
    const commit = hasGit ? execFileSync('git', ['rev-parse', 'HEAD'], {cwd: workspace, encoding: 'utf8'}).trim() : upstream.commit;
    if (commit !== upstream.commit) throw new Error('Unexpected library checkout');
    const catalogs = []; const catalogHashes = {};
    for (const name of ['costumes', 'sprites', 'sounds', 'backdrops']) {
        const relative = `src/lib/libraries/${name}.json`;
        // Read committed content, never locally edited catalogs.
        const bytes = hasGit
            ? execFileSync('git', ['show', `${commit}:${relative}`], {cwd: workspace, maxBuffer: 10 * 1024 * 1024})
            : await fs.readFile(path.join(workspace, relative));
        catalogHashes[name] = hash(bytes);
        const current = await fs.readFile(path.join(workspace, relative));
        if (hash(current) !== catalogHashes[name]) throw new Error(`Modified library catalog: ${name}`);
        catalogs.push(JSON.parse(bytes));
    }
    const names = collectAssetNames(catalogs);
    let lock;
    if (!writeLock) {
        lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
        if (lock.commit !== commit || JSON.stringify(lock.catalogHashes) !== JSON.stringify(catalogHashes)
            || JSON.stringify(Object.keys(lock.files).sort()) !== JSON.stringify(names)) throw new Error('Library lock does not match pinned catalogs');
    }
    cacheDir = path.resolve(cacheDir || path.join(here, '../../.cache/scratch-library'));
    await fs.mkdir(cacheDir, {recursive: true});
    if (outputDir) await fs.mkdir(outputDir, {recursive: true});
    const files = {}; let cursor = 0; let completed = 0;
    const worker = async () => {
        for (;;) {
            const index = cursor++;
            if (index >= names.length) return;
            const name = names[index]; const cached = path.join(cacheDir, name);
            let bytes;
            try { bytes = await fs.readFile(cached); verifyAsset(name, bytes, lock?.files[name]); } catch { bytes = null; }
            if (!bytes) {
                let failure;
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        const response = await fetch(`https://assets.scratch.mit.edu/internalapi/asset/${name}/get/`, {redirect: 'error', signal: AbortSignal.timeout(45_000)});
                        if (!response.ok) throw new Error(`Asset HTTP ${response.status}: ${name}`);
                        if (Number(response.headers.get('content-length') || 0) > 20 * 1024 * 1024) throw new Error('Asset too large');
                        const chunks = []; let size = 0;
                        for await (const chunk of response.body) {
                            size += chunk.length;
                            if (size > 20 * 1024 * 1024) throw new Error('Asset too large');
                            chunks.push(chunk);
                        }
                        bytes = Buffer.concat(chunks);
                        verifyAsset(name, bytes, lock?.files[name]);
                        const temp = `${cached}.${process.pid}.tmp`;
                        await fs.writeFile(temp, bytes); await fs.rename(temp, cached);
                        failure = null; break;
                    } catch (error) { failure = error; bytes = null; }
                }
                if (failure) throw failure;
            }
            files[name] = verifyAsset(name, bytes, lock?.files[name]);
            if (outputDir) await fs.writeFile(path.join(outputDir, name), bytes);
            completed++;
            if (completed % 100 === 0) console.log(`Verified library assets: ${completed}/${names.length}`);
        }
    };
    await Promise.all(Array.from({length: 6}, worker));
    const manifest = {version: 1, repository: upstream.repository, commit, catalogHashes,
        source: 'https://assets.scratch.mit.edu/internalapi/asset/',
        files: Object.fromEntries(names.map(name => [name, files[name]]))};
    if (writeLock) await fs.writeFile(lockPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (outputDir) await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Prepared ${names.length} verified library assets (${Object.values(files).reduce((n, f) => n + f.size, 0)} bytes)`);
    return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2); const options = {};
    for (let index = 0; index < args.length; index++) {
        if (args[index] === '--write-lock') options.writeLock = true;
        else if (['--workspace', '--output', '--cache'].includes(args[index]) && args[index + 1]) {
            options[{'--workspace': 'workspace', '--output': 'outputDir', '--cache': 'cacheDir'}[args[index]]] = args[++index];
        } else throw new Error('Usage: library-assets.mjs --workspace <pinned checkout> [--output <directory>] [--cache <directory>] [--write-lock]');
    }
    if (!options.workspace) throw new Error('Provide --workspace');
    await prepareLibraryAssets(options);
}
