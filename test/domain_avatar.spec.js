const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { PNG } = require('pngjs');
const pngCrc = require('pngjs/lib/crc');

const project = path.resolve(__dirname, '..');
class ValidationError extends Error {}
const helpers = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(project, 'packages/hydrooj/src/lib/domain_avatar.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, {
    module: helpers, exports: helpers.exports, Buffer,
    require: (name) => name === '../error' ? { ValidationError } : require(name),
});
const avatar = helpers.exports;
const makePng = () => PNG.sync.write({ width: 2, height: 2, data: Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
]) });
const oldFilename = 'avatar-00000000-0000-4000-8000-000000000001.png';

function handlers(options = {}) {
    const source = fs.readFileSync(path.join(project, 'packages/hydrooj/src/handler/domain.ts'), 'utf8');
    const code = source.slice(source.indexOf('class DomainAvatarUploadHandler'), source.indexOf('class DomainDashboardHandler'));
    const calls = { put: [], del: [], edit: [], get: [], permission: [] };
    class ManageHandler {}
    class Handler {}
    class NotFoundError extends Error {}
    const storage = {
        put: async (...args) => { calls.put.push(args); },
        del: async (...args) => { calls.del.push(args); },
        getMeta: async () => options.missingImage ? null : { 'Content-Type': 'image/png' },
        get: async (target) => { calls.get.push(target); return makePng(); },
    };
    const mod = { exports: {} };
    vm.runInNewContext(transformSync(`${code}\nexport { DomainAvatarUploadHandler, DomainAvatarImageHandler };`, {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, {
        module: mod, exports: mod.exports, ManageHandler, Handler, ...avatar,
        ValidationError, NotFoundError, PERM: { PERM_EDIT_DOMAIN: 128n },
        param: () => () => {}, Types: { String: 'string' }, storage,
        readFile: async () => options.image || makePng(),
        domain: { edit: async (...args) => { calls.edit.push(args); if (options.editFails) throw new Error('Database unavailable'); } },
    });
    const instance = new mod.exports.DomainAvatarUploadHandler();
    instance.domain = { _id: 'allowed-class', avatarStoragePath: options.oldPath || `domain/allowed-class/${oldFilename}` };
    instance.user = { _id: 18 };
    instance.request = { files: options.noFile ? {} : { file: {
        size: options.size ?? makePng().length, filepath: '/tmp/image-upload', originalFilename: '../../forged.svg',
    } } };
    instance.response = {};
    instance.checkPerm = (perm) => {
        calls.permission.push(perm);
        if (options.denied) throw new Error('Permission denied');
    };
    const image = new mod.exports.DomainAvatarImageHandler();
    image.domain = { _id: 'allowed-class' };
    image.response = { addHeader: () => {} };
    return { upload: instance, image, calls };
}

describe('domain avatar image validation', () => {
    it('fully decodes valid PNG content and returns a clean raster image', () => {
        const data = makePng();
        const result = avatar.normalizeDomainAvatar(data);
        const decoded = PNG.sync.read(result);
        assert.equal(decoded.width, 2);
        assert.deepEqual(decoded.data, PNG.sync.read(data).data);
    });

    it('rejects arbitrary content, truncated images and invalid PNG checksums', () => {
        const data = makePng();
        const corrupted = Buffer.from(data);
        corrupted[30] ^= 1;
        for (const invalid of [Buffer.from('<svg><script>bad()</script></svg>'), data.subarray(0, 40), corrupted]) {
            assert.throws(() => avatar.normalizeDomainAvatar(invalid), ValidationError);
        }
    });

    it('rejects every truncation boundary including missing IEND and partial PNG chunks', () => {
        const data = makePng();
        for (let end = 1; end < data.length; end++) {
            assert.throws(() => avatar.normalizeDomainAvatar(data.subarray(0, end)), ValidationError, `Accepted truncation at ${end}`);
        }
        assert.throws(() => avatar.normalizeDomainAvatar(Buffer.concat([data, Buffer.from('trailing bytes')])), ValidationError);
    });

    it('rejects incomplete compressed pixel data even when the chunk length and CRC are valid', () => {
        const data = makePng();
        const parts = [data.subarray(0, 8)];
        let offset = 8;
        while (offset < data.length) {
            const length = data.readUInt32BE(offset);
            const end = offset + length + 12;
            const type = data.subarray(offset + 4, offset + 8).toString();
            if (type === 'IDAT') {
                const chunk = Buffer.from(data.subarray(offset, end - 2));
                chunk.writeUInt32BE(length - 2, 0);
                chunk.writeInt32BE(pngCrc.crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4);
                parts.push(chunk);
            } else parts.push(data.subarray(offset, end));
            offset = end;
        }
        assert.throws(() => avatar.normalizeDomainAvatar(Buffer.concat(parts)), ValidationError);
    });

    it('rejects oversized files and dimensions before pixel allocation', () => {
        assert.throws(() => avatar.normalizeDomainAvatar(Buffer.alloc(8 * 1024 * 1024 + 1)), ValidationError);
        const huge = makePng();
        huge.writeUInt32BE(50000, 16);
        assert.throws(() => avatar.normalizeDomainAvatar(huge), ValidationError);
        huge.writeUInt32BE(0, 16);
        assert.throws(() => avatar.normalizeDomainAvatar(huge), ValidationError);
    });

    it('creates unique domain-scoped paths and rejects traversal or unrelated filenames', () => {
        const first = avatar.createDomainAvatarTarget('课堂 A');
        const second = avatar.createDomainAvatarTarget('课堂 A');
        assert.notEqual(first.storagePath, second.storagePath);
        assert.ok(first.storagePath.startsWith('domain/课堂 A/avatar-'));
        assert.ok(first.avatarUrl.startsWith('/d/%E8%AF%BE%E5%A0%82%20A/domain/avatar/avatar-'));
        for (const invalid of ['../user/1/avatar.png', 'home-poster.png', `../${oldFilename}`, `${oldFilename}/extra`]) {
            assert.throws(() => avatar.domainAvatarPath('class-a', invalid), ValidationError);
        }
        assert.equal(avatar.isOwnedDomainAvatarPath('class-a', `domain/class-b/${oldFilename}`), false);
        assert.equal(avatar.isOwnedDomainAvatarPath('class-a', `domain/class-a/${oldFilename}`), true);
    });
});

describe('domain avatar upload and serving handlers', () => {
    it('requires domain editing permission before upload', async () => {
        const h = handlers({ denied: true });
        await assert.rejects(h.upload.prepare(), /Permission denied/);
        assert.deepEqual(h.calls.permission, [128n]);
        assert.deepEqual(h.calls.put, []);
        assert.deepEqual(h.calls.edit, []);
    });

    it('updates only the authorized domain, ignores supplied domainId and filename, and returns the saved field value', async () => {
        const h = handlers();
        await h.upload.prepare();
        await h.upload.post({ domainId: 'attacker-target' });
        assert.equal(h.calls.edit[0][0], 'allowed-class');
        assert.match(h.calls.put[0][0], /^domain\/allowed-class\/avatar-[\da-f-]+\.png$/);
        assert.equal(h.calls.put[0][2], 18);
        assert.equal(h.upload.response.body.avatar, h.calls.edit[0][1].avatar);
        assert.equal(h.upload.response.body.avatar, `url:${h.upload.response.body.avatarUrl}`);
        assert.equal(h.calls.del[0][0][0], `domain/allowed-class/${oldFilename}`);
    });

    it('does not write invalid images, missing files or oversized uploads', async () => {
        for (const options of [{ image: Buffer.from('not-an-image') }, { noFile: true }, { size: 8 * 1024 * 1024 + 1 }]) {
            const h = handlers(options);
            await assert.rejects(h.upload.post(), ValidationError);
            assert.deepEqual(h.calls.put, []);
            assert.deepEqual(h.calls.edit, []);
        }
    });

    it('cleans the new upload after a failed database write and keeps the previous avatar', async () => {
        const h = handlers({ editFails: true });
        await assert.rejects(h.upload.post(), /Database unavailable/);
        assert.equal(h.calls.del[0][0][0], h.calls.put[0][0]);
        assert.notEqual(h.calls.del[0][0][0], `domain/allowed-class/${oldFilename}`);
        assert.equal(h.upload.response.body, undefined);
    });

    it('never cleans an avatar path belonging to another domain', async () => {
        const h = handlers({ oldPath: `domain/other-domain/${oldFilename}` });
        await h.upload.post();
        assert.deepEqual(h.calls.del, []);
    });

    it('public image reads stay within the current domain and reject arbitrary paths', async () => {
        const h = handlers();
        assert.equal(h.image.noCheckPermView, true);
        await h.image.get({ domainId: 'other-domain' }, oldFilename);
        assert.equal(h.calls.get[0], `domain/allowed-class/${oldFilename}`);
        assert.equal(h.image.response.type, 'image/png');
        await assert.rejects(h.image.get({}, '../private-file'), ValidationError);
        const missing = handlers({ missingImage: true });
        await assert.rejects(missing.image.get({}, oldFilename));
    });
});
