#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../../packages/ui-default/public/scratch-editor');
const upstream = JSON.parse(fs.readFileSync(path.join(here, 'upstream.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(output, 'build-manifest.json')));
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
if (manifest.commit !== upstream.commit) throw new Error('The editor build does not match the pinned source. Rebuild locally.');
if (manifest.lockSHA256 !== sha256(fs.readFileSync(path.join(here, 'package-lock.upstream.json')))) {
    throw new Error('The editor dependency lock does not match the prepared build.');
}
for (const [relative, digest] of Object.entries(manifest.files)) {
    const absolute = path.resolve(output, relative);
    if (!absolute.startsWith(`${output}${path.sep}`)) throw new Error('Invalid asset path in manifest.');
    if (sha256(fs.readFileSync(absolute)) !== digest) throw new Error(`Editor asset changed or incomplete: ${relative}`);
}
for (const file of ['editor.html', 'source.tar.gz', 'UPSTREAM-LICENSE']) {
    if (!manifest.files[file]) throw new Error(`Required release asset missing: ${file}`);
}
console.log(`Verified ${Object.keys(manifest.files).length} prepared Scratch editor files (${upstream.commit}).`);
