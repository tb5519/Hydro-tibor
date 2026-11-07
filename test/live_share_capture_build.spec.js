const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'packages/ui-default/public/scratch-editor');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

test('the prepared opaque-frame bridge uses a content-hashed cache-safe script and ships matching source', () => {
    const html = fs.readFileSync(path.join(assets, 'editor.html'), 'utf8');
    const entries = [...html.matchAll(/<script\b[^>]*\bdata-live-share-capture\b[^>]*><\/script>/g)];
    assert.equal(entries.length, 1, 'only one bridge listener can be installed');
    assert.match(entries[0][0], /crossorigin="anonymous"/);
    const url = /src="([^"]+)"/.exec(entries[0][0])[1];
    assert.match(url, /^\/scratch-editor\/js\/live-share-frame\.[a-f0-9]{20}\.js$/);
    const relative = url.slice('/scratch-editor/'.length);
    const code = fs.readFileSync(path.join(assets, relative));
    assert(url.includes(sha256(code).slice(0, 20)), 'URL changes when the capture code changes');
    assert(code.length < 350 * 1024, 'the display-only child must not include Monaco or the CRDT editor bundle');
    assert.doesNotMatch(code.toString(), /monaco-editor\/esm|MonacoEnvironment|eval\(/);
    const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'build-manifest.json'), 'utf8'));
    for (const name of [relative, 'editor.html', 'source.tar.gz']) {
        assert.equal(manifest.files[name], sha256(fs.readFileSync(path.join(assets, name))));
    }
    const archive = path.join(assets, 'source.tar.gz');
    for (const name of ['frame_capture.ts', 'mirror.ts', 'annotation.ts', 'capture_vendor.js', 'vendor.LICENSE.txt']) {
        let source = fs.readFileSync(path.join(root, 'packages/ui-default/components/live_share', name), 'utf8');
        if (name === 'mirror.ts') source = source.replace("from './vendor'", "from './capture_vendor'");
        assert.equal(execFileSync('tar', ['-xOf', archive, `onebyone-live-share/${name}`], { encoding: 'utf8' }), source);
    }
});
