#!/usr/bin/env node
// Run only on a development machine. Production consumes these prepared assets.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import patchLibraries from './patch-libraries.cjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const upstream = JSON.parse(fs.readFileSync(path.join(here, 'upstream.json')));
// Keep this a build-time value: no request or project data may select a script host.
const resolveAssetBase = value => {
    const fail = () => { throw new Error('SCRATCH_ASSET_BASE must be an HTTPS URL or a safe absolute path without credentials, query or fragment.'); };
    if (typeof value !== 'string' || !value || /[\s\\?#]/.test(value)) return fail();
    const absolute = /^(https:\/\/[^/?#]+)(\/[^?#]*)?$/i.exec(value);
    let url;
    if (absolute) {
        try { url = new URL(value); } catch { return fail(); }
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || absolute[1].includes('@')) return fail();
    } else if (!value.startsWith('/') || value.startsWith('//')) return fail();
    // URL parsing normalizes dot segments; reject them before parsing can hide them.
    // Simple URL-safe segments also exclude encoded separators and traversal.
    const pathname = absolute ? absolute[2] || '/' : value;
    if (!/^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*)?\/?$/.test(pathname)
        || pathname.startsWith('//') || pathname.split('/').some(segment => segment === '.' || segment === '..')) return fail();
    const base = url ? url.href : pathname;
    return base.endsWith('/') ? base : `${base}/`;
};
const assetBase = resolveAssetBase(process.env.SCRATCH_ASSET_BASE ?? upstream.publicPath);
const workspace = process.env.SCRATCH_BUILD_DIR || path.join(os.tmpdir(), `onebyone-turbowarp-${upstream.commit}`);
const target = path.join(repo, 'packages/ui-default/public/scratch-editor');
const run = (exe, args, cwd = workspace, extra = {}) => execFileSync(exe, args, {
    cwd, stdio: 'inherit', env: {...process.env, ...extra}
});
if (!fs.existsSync(path.join(workspace, '.git'))) {
    fs.mkdirSync(workspace, {recursive: true});
    run('git', ['init']);
    run('git', ['remote', 'add', 'origin', upstream.repository]);
    run('git', ['fetch', '--depth', '1', 'origin', upstream.commit]);
    run('git', ['checkout', '--detach', upstream.commit]);
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: workspace, encoding: 'utf8'}).trim();
if (commit !== upstream.commit) throw new Error(`Unexpected upstream checkout ${commit}`);
const npmArgs = process.env.SCRATCH_NPM_CLI ? [process.env.SCRATCH_NPM_CLI] : [];
const npmExe = process.env.SCRATCH_NPM_CLI ? process.execPath : 'npm';
if (!process.env.SCRATCH_SKIP_INSTALL) run(npmExe, [...npmArgs, 'ci', '--ignore-scripts', '--no-audit', '--no-fund']);
// The upstream prepublish step only prepares hardware firmware, not used here.
fs.mkdirSync(path.join(workspace, 'src/generated'), {recursive: true});
fs.writeFileSync(path.join(workspace, 'src/generated/microbit-hex-url.cjs'), "module.exports = '';\n");
for (const [source, dest] of [
    ['editor.jsx', 'src/playground/editor.jsx'],
    ['editor.ejs', 'src/playground/onebyone.ejs'],
    ['webpack.cjs', 'onebyone.webpack.cjs'],
    ['paper-sandbox-loader.cjs', 'src/playground/onebyone-paper-sandbox-loader.cjs'],
    ['svg-sandbox.js', 'src/playground/onebyone-svg-sandbox.js'],
    ['library-loader.js', 'src/lib/onebyone-library-loader.js'],
    ['noop.jsx', 'src/playground/onebyone-noop.jsx'],
    ['storage.js', 'src/lib/tw-persistent-storage.js'],
    ['extensions.jsx', 'src/lib/libraries/extensions/onebyone.jsx']
]) fs.copyFileSync(path.join(here, source), path.join(workspace, dest));
for (const source of ['src/lib/storage.js', 'src/containers/library-item.jsx', 'src/components/library/library.jsx',
    ...['costume', 'sprite', 'backdrop', 'sound'].map(kind => `src/containers/${kind}-library.jsx`)]) {
    const original = execFileSync('git', ['show', `${upstream.commit}:${source}`], {cwd: workspace, encoding: 'utf8'});
    fs.writeFileSync(path.join(workspace, source), patchLibraries(source, original));
}
const extensionPath = path.join(workspace, 'src/containers/extension-library.jsx');
// Preserve the official selector UI but never request the external extension gallery.
let extensionSource = execFileSync('git', ['show', `${upstream.commit}:src/containers/extension-library.jsx`], {
    cwd: workspace, encoding: 'utf8'
});
extensionSource = extensionSource.replace(
    "const fetchLibrary = async () => {",
    "const fetchLibrary = async () => { return []; /* OneByOne: external extension gallery disabled. */"
);
extensionSource = extensionSource.replace('componentDidMount () {', 'componentDidMount () { return;');
extensionSource = extensionSource.replace(
    /let library = null;[\s\S]*?\n\n        return \(/,
    'const library = extensionLibraryContent.map(toLibraryItem);\n\n        return ('
);
fs.writeFileSync(extensionPath, extensionSource);
// Start in a quiet stage-only view, then select the parent's requested mode.
// Upstream supports embedded mode at construction but not an update action.
const modePath = path.join(workspace, 'src/reducers/mode.js');
const modeSource = execFileSync('git', ['show', `${upstream.commit}:src/reducers/mode.js`], {
    cwd: workspace, encoding: 'utf8'
}).replace('    switch (action.type) {', `    switch (action.type) {
    case 'onebyone/SET_EMBEDDED':
        return Object.assign({}, state, {isEmbedded: action.isEmbedded});`);
fs.writeFileSync(modePath, modeSource);
// Preserve native local file/edit controls without account, cloud, remote
// feedback or a nonfunctional restore-point menu in the isolated classroom.
const menuPath = path.join(workspace, 'src/components/menu-bar/menu-bar.jsx');
let menuSource = execFileSync('git', ['show', `${upstream.commit}:src/components/menu-bar/menu-bar.jsx`], {
    cwd: workspace, encoding: 'utf8'
});
for (const pattern of [
    /<MenuItem\s+isRtl=\{this.props.isRtl\}\s+onClick=\{this.handleClickNew\}\s*>[\s\S]*?<\/MenuItem>/,
    /<ChangeUsername>[\s\S]*?<\/ChangeUsername>/,
    /<CloudVariablesToggler>[\s\S]*?<\/CloudVariablesToggler>/,
    /<MenuSection>\s*<MenuItem onClick=\{this.handleClickRestorePoints\}>[\s\S]*?<\/MenuSection>/,
    /<MenuSection>\s*<MenuItem onClick=\{this.props.onClickSettingsModal\}>[\s\S]*?<\/MenuSection>/,
    /\{this.props.onClickSettingsModal && \([\s\S]*?\n                        \)\}/
]) {
    if (!pattern.test(menuSource)) throw new Error(`Pinned menu patch no longer matches: ${pattern}`);
    menuSource = menuSource.replace(pattern, '');
}
fs.writeFileSync(menuPath, menuSource);
// Native imports replace the currently edited work. Use an in-frame dialog:
// opaque-origin sandboxes deliberately cannot use browser confirm().
const uploaderPath = path.join(workspace, 'src/lib/sb-file-uploader-hoc.jsx');
let uploaderSource = execFileSync('git', ['show', `${upstream.commit}:src/lib/sb-file-uploader-hoc.jsx`], {
    cwd: workspace, encoding: 'utf8'
});
for (const [before, after] of [
    ['if (this.props.showOpenFilePicker) {', 'if (false) { // OneByOne: an opaque sandbox always uses a file input.'],
    ['handleChange (e) {', 'async handleChange (e) {'],
    ['if (userOwnsProject || (projectChanged && isShowingWithoutId)) {', 'if (true) { // OneByOne: every import replaces the current work.'],
    ['uploadAllowed = confirm( // eslint-disable-line no-alert', 'uploadAllowed = await window.onebyoneConfirmProjectReplacement(']
]) {
    if (!uploaderSource.includes(before)) throw new Error(`Pinned local-import patch no longer matches: ${before}`);
    uploaderSource = uploaderSource.replace(before, after);
}
uploaderSource = uploaderSource.replace(
    /showOpenFilePicker: typeof showOpenFilePicker === 'function'[\s\S]*?\n            null/,
    'showOpenFilePicker: null'
);
fs.writeFileSync(uploaderPath, uploaderSource);
const downloaderPath = path.join(workspace, 'src/containers/sb3-downloader.jsx');
let downloaderSource = execFileSync('git', ['show', `${upstream.commit}:src/containers/sb3-downloader.jsx`], {
    cwd: workspace, encoding: 'utf8'
});
if (!downloaderSource.includes('this.props.showSaveFilePicker ? {')) {
    throw new Error('Pinned local-download patch no longer matches.');
}
downloaderSource = downloaderSource.replace('this.props.showSaveFilePicker ? {', 'false ? {');
downloaderSource = downloaderSource.replace(
    /showSaveFilePicker: typeof showSaveFilePicker === 'function'[\s\S]*?\n        null/,
    'showSaveFilePicker: null'
);
fs.writeFileSync(downloaderPath, downloaderSource);
fs.rmSync(path.join(workspace, 'build'), {recursive: true, force: true});
run(process.execPath, ['node_modules/webpack/bin/webpack.js', '--config', 'onebyone.webpack.cjs', '--bail'], workspace, {
    NODE_ENV: 'production', ROOT: assetBase, CI: '1', NODE_OPTIONS: '--max-old-space-size=8192'
});
fs.rmSync(target, {recursive: true, force: true});
fs.mkdirSync(target, {recursive: true});
fs.cpSync(path.join(workspace, 'build'), target, {recursive: true});
// Prepare all four pinned stock libraries locally, before computing the release
// manifest. Production never fetches upstream libraries or builds this bundle.
run(process.execPath, [path.join(here, 'library-assets.mjs'), '--workspace', workspace,
    '--output', path.join(target, 'library-assets')], repo);
for (const name of ['LICENSE', 'README.md', 'TRADEMARK']) {
    fs.copyFileSync(path.join(workspace, name), path.join(target, `UPSTREAM-${name}`));
}
fs.copyFileSync(path.join(here, 'LIBRARY-CREDITS.md'), path.join(target, 'LIBRARY-CREDITS.md'));
const lock = fs.readFileSync(path.join(workspace, 'package-lock.json'));
fs.writeFileSync(path.join(here, 'package-lock.upstream.json'), lock);
// Retain the corresponding GUI source, build configuration and lock with the binary.
fs.copyFileSync(path.join(here, 'README.md'), path.join(workspace, 'ONEBYONE-README.md'));
fs.mkdirSync(path.join(workspace, 'onebyone-library'), {recursive: true});
for (const name of ['library-assets.mjs', 'library-assets.lock.json', 'upstream.json', 'patch-libraries.cjs', 'LIBRARY-CREDITS.md']) {
    fs.copyFileSync(path.join(here, name), path.join(workspace, 'onebyone-library', name));
}
run('tar', ['-czf', path.join(target, 'source.tar.gz'),
    'src', 'static', 'scripts', 'package.json', 'package-lock.json', 'webpack.config.js',
    'onebyone.webpack.cjs', '.babelrc', '.browserslistrc', 'LICENSE', 'README.md', 'TRADEMARK', 'ONEBYONE-README.md',
    'onebyone-library']);
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
});
const files = Object.fromEntries(walk(target).filter(file => !file.endsWith('/build-manifest.json')).sort().map(file => [
    path.relative(target, file), sha256(fs.readFileSync(file))
]));
fs.writeFileSync(path.join(target, 'build-manifest.json'), `${JSON.stringify({
    ...upstream,
    publicPath: assetBase,
    assetBase,
    lockSHA256: sha256(lock),
    node: process.version,
    source: `${upstream.repository.replace(/\.git$/, '')}/tree/${upstream.commit}`,
    files
}, null, 2)}\n`);
console.log(`Prepared ${Object.keys(files).length} editor assets in ${target}`);
