const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');

const source = path.resolve(__dirname, '../packages/hydrooj/src/lib/scratch_editor_assets.ts');
const code = transformSync(fs.readFileSync(source, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
function reader(readFileSync) {
    const module = { exports: {} };
    vm.runInNewContext(code, {
        module, exports: module.exports, __dirname: path.dirname(source),
        require: (name) => name === 'fs' ? { readFileSync } : require(name),
    });
    return module.exports.getScratchEditorVersion;
}

test('entry content determines a stable version and changing the runtime reference changes it', () => {
    let reads = 0;
    const old = Buffer.from('<script src="/editor.oldhash.js"></script>');
    const version = reader((file) => {
        reads++;
        assert.equal(file, path.resolve(__dirname, '../packages/ui-default/public/scratch-editor/editor.html'));
        return old;
    });
    const expected = crypto.createHash('sha256').update(old).digest('hex');
    assert.equal(version(), expected);
    assert.equal(version(), expected);
    assert.equal(reads, 1, 'do not scan the prepared bundle on each page request');
    assert.notEqual(reader(() => Buffer.from('<script src="/editor.newhash.js"></script>'))(), expected);
});

test('a temporarily missing local build does not permanently cache an unavailable version', () => {
    let ready = false;
    const version = reader(() => {
        if (!ready) throw new Error('ENOENT');
        return Buffer.from('prepared entry');
    });
    assert.equal(version(), 'unavailable');
    ready = true;
    assert.match(version(), /^[a-f0-9]{64}$/);
});

test('the release version matches the prepared entry digest in the Scratch build manifest', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/public/scratch-editor/build-manifest.json')));
    assert.equal(reader(fs.readFileSync)(), manifest.files['editor.html']);
});
