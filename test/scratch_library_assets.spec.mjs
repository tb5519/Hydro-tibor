import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {collectAssetNames, verifyAsset} from '../build/scratch/library-assets.mjs';
const data = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
const name = `${createHash('md5').update(data).digest('hex')}.svg`;
assert.deepEqual(collectAssetNames([[{md5ext: name}, {costumes: [{md5ext: name}], sounds: []}]]), [name]);
for (const unsafe of ['../../private.svg', 'https://example.com/a.svg', `${'0'.repeat(32)}.html`]) {
    assert.throws(() => collectAssetNames([[{md5ext: unsafe}]]));
}
const verified = verifyAsset(name, data);
assert.equal(verified.contentType, 'image/svg+xml');
assert.throws(() => verifyAsset(name, Buffer.from('changed')));
assert.throws(() => verifyAsset(name, data, {...verified, sha256: '0'.repeat(64)}));
assert.throws(() => verifyAsset(name, data, {...verified, size: data.length + 1}));
assert.throws(() => verifyAsset(name, data, {...verified, contentType: 'text/html'}));
console.log('Scratch library: deduplication, unsafe paths, content hashes and pinned metadata passed.');
