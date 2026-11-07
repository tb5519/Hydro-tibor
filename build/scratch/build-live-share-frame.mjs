#!/usr/bin/env node
// Local-only supplemental build. Production consumes these committed assets.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const output = path.join(repo, 'packages/ui-default/public/scratch-editor');
const components = path.join(repo, 'packages/ui-default/components/live_share');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const manifestPath = path.join(output, 'build-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const result = await build({
    absWorkingDir: repo,
    entryPoints: [path.join(components, 'frame_capture.ts')],
    bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
    minify: true, write: false, legalComments: 'inline',
    plugins: [{ name: 'capture-only-vendor', setup(builder) {
        builder.onResolve({ filter: /^\.\/vendor$/ }, (args) => args.importer === path.join(components, 'mirror.ts')
            ? { path: path.join(components, 'capture_vendor.js') } : undefined);
    } }],
});
const bytes = result.outputFiles[0].contents;
const filename = `js/live-share-frame.${digest(bytes).slice(0,20)}.js`;
fs.mkdirSync(path.join(output, 'js'), { recursive: true });
fs.writeFileSync(path.join(output, filename), bytes);
const htmlPath = path.join(output, 'editor.html');
const html = fs.readFileSync(htmlPath, 'utf8').replace(/<script\b[^>]*\bdata-live-share-capture\b[^>]*>\s*<\/script>/g, '');
if (!html.includes('</body>')) throw new Error('The prepared Scratch entry has no body.');
// Always served from the application origin, including when other Scratch
// assets use a CDN. Do not change the opaque iframe sandbox or its permissions.
fs.writeFileSync(htmlPath, html.replace('</body>',
    `<script defer crossorigin="anonymous" data-live-share-capture src="/scratch-editor/${filename}"></script></body>`));

// Include the exact bridge sources next to the existing corresponding GUI
// source. This does not rebuild or modify any upstream editor code.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'onebyone-frame-source-'));
try {
    execFileSync('tar', ['-xzf', path.join(output, 'source.tar.gz'), '-C', temp]);
    const source = path.join(temp, 'onebyone-live-share');
    fs.mkdirSync(source, { recursive: true });
    for (const name of ['frame_capture.ts', 'mirror.ts', 'annotation.ts', 'annotation_arrow.ts', 'splitter.ts', 'capture_vendor.js', 'vendor.LICENSE.txt']) {
        fs.copyFileSync(path.join(components, name), path.join(source, name));
    }
    fs.writeFileSync(path.join(source, 'mirror.ts'), fs.readFileSync(path.join(source, 'mirror.ts'), 'utf8')
        .replace("from './vendor'", "from './capture_vendor'"));
    fs.copyFileSync(path.join(here, 'build-live-share-frame.mjs'), path.join(source, 'build-live-share-frame.mjs'));
    fs.copyFileSync(path.join(repo, 'LICENSE'), path.join(source, 'LICENSE'));
    fs.writeFileSync(path.join(source, 'README.md'), `# Classroom view bridge\n\n`
        + `This optional bridge keeps the Scratch iframe's opaque sandbox. It only starts recording after a verified parent handshake and stops when the connection lease expires.\n\n`
        + `Corresponding source: https://github.com/tb5519/Hydro-tibor/tree/master/packages/ui-default/components/live_share\n\n`
        + `Build using esbuild 0.25.2 from this directory:\n\n`
        + `\`esbuild frame_capture.ts --bundle --format=iife --platform=browser --target=es2020 --minify --legal-comments=inline --outfile=live-share-frame.js\`\n\n`
        + `The repository's build/scratch/build-live-share-frame.mjs hashes the output, updates editor.html and the release manifest. Vendored licenses are in vendor.LICENSE.txt.\n`);
    execFileSync('tar', ['-czf', path.join(output, 'source.tar.gz'), '-C', temp, ...fs.readdirSync(temp).sort()]);
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}
for (const name of [filename, 'editor.html', 'source.tar.gz']) {
    manifest.files[name] = digest(fs.readFileSync(path.join(output, name)));
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Prepared the isolated classroom capture bridge: ${filename}`);
