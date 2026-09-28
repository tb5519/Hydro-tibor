#!/usr/bin/env node
// Development-only, deterministic restoration of the original built-in entries.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bytes = fs.readFileSync(path.join(here, 'classic-library.json'));
export const classicLibrary = JSON.parse(bytes);
export const restorationSHA256 = createHash('sha256').update(bytes).digest('hex');
const hash = value => createHash('sha256').update(value).digest('hex');

export function restoreCatalog(name, original) {
    if (hash(original) !== classicLibrary.baseCatalogHashes[name]) {
        throw new Error(`Unexpected upstream ${name} catalog for classic restoration`);
    }
    const additions = classicLibrary.catalogs[name];
    if (!additions?.length) return Buffer.from(original);
    const catalog = JSON.parse(original);
    const names = new Set(catalog.map(item => item.name));
    for (const item of additions) {
        if (names.has(item.name)) throw new Error(`Duplicate built-in ${name} entry: ${item.name}`);
        names.add(item.name);
        catalog.push(item);
    }
    // Match the native library's alphabetical ordering without locale-dependent builds.
    catalog.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    return Buffer.from(`${JSON.stringify(catalog, null, 4)}\n`);
}

export function restoreWorkspace(workspace) {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: workspace, encoding: 'utf8'}).trim();
    if (commit !== classicLibrary.baseCommit) throw new Error('Unexpected classic library checkout');
    for (const name of Object.keys(classicLibrary.catalogs)) {
        const relative = `src/lib/libraries/${name}.json`;
        const original = execFileSync('git', ['show', `${commit}:${relative}`], {cwd: workspace, maxBuffer: 10 * 1024 * 1024});
        const restored = restoreCatalog(name, original);
        const current = fs.readFileSync(path.join(workspace, relative));
        if (!current.equals(original) && !current.equals(restored)) throw new Error(`Modified library catalog: ${name}`);
        fs.writeFileSync(path.join(workspace, relative), restored);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.length !== 4 || process.argv[2] !== '--workspace') {
        throw new Error('Usage: restore-catalogs.mjs --workspace <pinned checkout>');
    }
    restoreWorkspace(path.resolve(process.argv[3]));
    console.log('Restored classic sprites and costumes in the native built-in catalogs.');
}
