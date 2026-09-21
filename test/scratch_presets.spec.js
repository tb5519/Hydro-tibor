const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { before, after, describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const AdmZip = require('adm-zip');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
class PermissionError extends Error {}
class NotFoundError extends Error {}
class ValidationError extends Error {}
class CsrfTokenError extends Error {}
const errors = { PermissionError, NotFoundError, ValidationError, CsrfTokenError };
function load(relative, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, relative), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
        { module, exports: module.exports, Buffer, URL, Date, setTimeout,
            require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name) });
    return module.exports;
}
const teacher = { domainId: 'presets-a', uid: 10, isTeacher: true };
const student = { domainId: 'presets-a', uid: 20, isTeacher: false };
const foreign = { domainId: 'presets-b', uid: 10, isTeacher: true };
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><defs><linearGradient id="paint"><stop offset="0" stop-color="#08f"/></linearGradient></defs><path d="M0 0h40v40H0z" xml:space="preserve" data-paper-data="{&quot;index&quot;:null,&quot;isPaintingLayer&quot;:true}" style="fill:url(#paint);stroke:#fff;mix-blend-mode: normal"/></svg>');
const png = PNG.sync.write(new PNG({ width: 2, height: 2 }));
const assetId = 'a'.repeat(32);
let temp; let counter = 0; let mongod; let client; let db; let model; let files; let handlers; let library; let deleteDomain;
const blobs = new Map(); const mirror = [];
const upload = (buffer, filename = '造型.png') => {
    const filepath = path.join(temp, `${counter++}-${filename}`);
    fs.writeFileSync(filepath, buffer);
    return { filepath, originalFilename: filename, size: buffer.length };
};
function spriteUpload(data, extra = {}, description = 'sprite.json') {
    const zip = new AdmZip();
    zip.addFile(description, Buffer.from(JSON.stringify(data || {
        isStage: false, name: '角色', variables: {}, lists: {}, broadcasts: {},
        blocks: { start: { opcode: 'event_whenflagclicked' }, say: { opcode: 'looks_say' } },
        costumes: [{ name: '造型', assetId, dataFormat: 'svg', md5ext: `${assetId}.svg` }], sounds: [],
    })));
    zip.addFile(`${assetId}.svg`, svg);
    for (const [name, bytes] of Object.entries(extra)) zip.addFile(name, bytes);
    return upload(zip.toBuffer(), '角色.sprite3');
}
function handler(Type, actor = teacher, method = 'get') {
    const instance = new Type();
    const headers = {};
    Object.assign(instance, {
        actor, domain: { _id: actor.domainId, domainType: 'scratch' }, UiContext: {},
        user: { _id: actor.uid, hasPerm: () => actor.isTeacher },
        request: { method, host: 'localhost', headers: { origin: 'http://localhost' }, params: {}, body: {}, query: {}, files: {} },
        response: { addHeader: (name, value) => { headers[name] = value; }, attachment: (name, bytes) => { instance.response.body = bytes; } },
        checkPriv: () => { if (!actor.uid) throw new PermissionError(); }, limitRate: async () => {},
        url: (name, args = {}) => `/${actor.domainId}/${name}/${args.fileId || ''}`, headers,
    });
    return instance;
}
before(async () => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scratch-presets-'));
    mongod = await MongoMemoryServer.create();
    client = await MongoClient.connect(mongod.getUri());
    db = client.db('presets_test');
    const storage = {
        put: async (key, filepath) => blobs.set(key, Buffer.isBuffer(filepath) ? filepath : fs.readFileSync(filepath)),
        get: async (key) => blobs.get(key), getMeta: async () => ({}),
        del: async (keys) => keys.forEach((key) => blobs.delete(key)),
    };
    const delivery = { queueAssetMirror: (source) => mirror.push(source), tryRedirectAsset: () => false };
    files = load('packages/hydrooj/src/lib/scratch_files.ts', { '../error': errors });
    model = load('packages/hydrooj/src/model/scratch.ts', {
        '../error': errors, '../lib/scratch_files': files, '../lib/asset_delivery': delivery,
        '../logger': { Logger: class { warn() {} } }, './storage': storage,
        '../service/db': { collection: (name) => db.collection(name), ensureIndexes: (coll, ...indexes) => coll.createIndexes(indexes) },
    });
    await model.apply({ on: (event, callback) => { if (event === 'domain/delete') deleteDomain = callback; } });
    const builtin = { PERM: { PERM_EDIT_DOMAIN: 1n, PERM_VIEW_USER_PRIVATE_INFO: 2n }, PRIV: { PRIV_USER_PROFILE: 1 } };
    const domainType = { isScratchDomain: (domain) => domain?.domainType === 'scratch' };
    handlers = load('packages/hydrooj/src/handler/scratch.ts', {
        '../error': errors, '../lib/scratch_files': files, '../model/builtin': builtin,
        '../model/domain': { collUser: db.collection('domain.user') }, '../model/scratch': model,
        '../model/storage': storage, '../model/user': { getListForRender: async () => ({}) },
        '../lib/asset_delivery': delivery, '../lib/domain_type': domainType,
        '../lib/scratch_editor_assets': { getScratchEditorVersion: () => 'v1' }, '../service/server': { Handler: class {} },
    });
    library = load('packages/hydrooj/src/handler/scratch_library.ts', {
        '../error': errors, '../lib/scratch_files': files, '../model/builtin': builtin,
        '../model/scratch': model, './scratch': handlers, '../lib/domain_type': domainType,
    });
    await db.collection('domain.user').insertOne({ domainId: student.domainId, uid: student.uid, join: true });
});
after(async () => { await client?.close(); await mongod?.stop(); fs.rmSync(temp, { recursive: true, force: true }); });

describe('Scratch preset file validation', () => {
    it('accepts safe SVG, PNG, WAV/MP3 and a bounded genuine sprite3 ZIP', async () => {
        for (const [kind, data, name, mime] of [
            ['sprite', svg, '角色.svg', 'image/svg+xml'], ['costume', png, '造型.png', 'image/png'],
            ['backdrop', svg, '背景.SVG', 'image/svg+xml'],
            ['sound', Buffer.from('RIFF0000WAVEfmt 00000000'), '声音.wav', 'audio/wav'],
            ['sound', Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00'), '声音.mp3', 'audio/mpeg'],
        ]) {
            const file = upload(data, name);
            assert.equal((await files.validateScratchPreset(file.filepath, name, kind)).mime, mime);
        }
        const file = spriteUpload();
        assert.equal((await files.validateScratchPreset(file.filepath, file.originalFilename, 'sprite')).mime, 'application/x.scratch.sprite3');
    });
    it('accepts standalone WebP images but rejects WebP inside sprite3 before students import it', async () => {
        const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
        const image = upload(webp, '图片.webp');
        for (const kind of ['sprite', 'costume', 'backdrop']) {
            assert.equal((await files.validateScratchPreset(image.filepath, image.originalFilename, kind)).mime, 'image/webp');
        }
        const zip = new AdmZip();
        zip.addFile('sprite.json', Buffer.from(JSON.stringify({
            isStage: false, name: 'WebP 角色', blocks: {},
            costumes: [{ assetId, dataFormat: 'webp', md5ext: `${assetId}.webp` }], sounds: [],
        })));
        zip.addFile(`${assetId}.webp`, webp);
        const archive = upload(zip.toBuffer(), 'WebP角色.sprite3');
        await assert.rejects(files.validateScratchPreset(archive.filepath, archive.originalFilename, 'sprite'), ValidationError);
    });
    it('accepts all bundled official Scratch SVGs without changing their bytes', () => {
        const directory = path.join(root, 'packages/ui-default/public/scratch-editor/library-assets');
        const names = fs.readdirSync(directory).filter((name) => name.endsWith('.svg'));
        assert(names.length >= 750);
        for (const name of names) {
            const data = fs.readFileSync(path.join(directory, name));
            const before = Buffer.from(data);
            assert.doesNotThrow(() => files.validateScratchSvg(data), name);
            assert(data.equals(before), name);
        }
    });
    it('rejects executable or external SVG constructs including entity/CSS obfuscation', () => {
        for (const source of [
            '<svg><script>alert(1)</script></svg>', '<svg onload="alert(1)"/>',
            '<svg><foreignObject/></svg>', '<svg><image href="https://evil.test/a.png"/></svg>',
            '<svg><style>path {fill:red}</style></svg>', '<svg><path fill="url(https://evil.test/x)"/></svg>',
            '<svg><path style="fill:URL(&#104;ttps://evil.test/x)"/></svg>',
            '<svg><path style="fill:u\\72l(#x)"/></svg>', '<svg><path fill="url(/*x*/#x)"/></svg>',
            '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
            '<svg><path data-paper-data="{&quot;__proto__&quot;:{}}"/></svg>',
            '<svg><path data-paper-data="{&quot;origItem&quot;:[&quot;Raster&quot;,{}]}"/></svg>',
            '<svg><path data-paper-data="{&quot;origItem&quot;:[&quot;Path&quot;,{&quot;segments&quot;:[&quot;https://evil.test&quot;]}]}"/></svg>',
            '<svg><image href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>',
            '<svg><path data-paper-data="{&quot;index&quot;:{&quot;x&quot;:1}}"/></svg>',
            '<svg><path style="mix-blend-mode:url(#x)"/></svg>', '<svg xml:space="javascript:alert(1)"/>',
            '<svg xmlns="http://www.w3.org/1999/xhtml"/>', '<svg><g></svg>',
            '<svg/><svg/>', '<svg><use href="#x" id="x"/></svg>', '<svg><path href="data:abc"/></svg>',
        ]) assert.throws(() => files.validateScratchSvg(Buffer.from(source)), ValidationError, source);
    });
    it('rejects wrong category, filename and content before accepting data', async () => {
        for (const [kind, name, data] of [
            ['sound', '声音.svg', svg], ['backdrop', '背景.mp3', Buffer.from('ID3abc')],
            ['costume', '造型.png', svg], ['sprite', '角色.sb3', Buffer.from('zip')],
            ['invalid', '角色.png', png], ['sprite', '角色.html', Buffer.from('<script/>')],
        ]) {
            const file = upload(data, name);
            await assert.rejects(files.validateScratchPreset(file.filepath, name, kind), ValidationError);
        }
        const large = upload(Buffer.alloc(20 * 1024 * 1024 + 1), '大图.png');
        await assert.rejects(files.validateScratchPreset(large.filepath, large.originalFilename, 'costume'), ValidationError);
    });
    it('rejects sprite projects, missing or unused assets, scripts and corrupt CRC', async () => {
        const cases = [spriteUpload(undefined, {}, 'project.json'), spriteUpload(undefined, { 'evil.js': Buffer.from('alert(1)') }),
            spriteUpload(undefined, { [`${'b'.repeat(32)}.png`]: png }),
            spriteUpload({ isStage: false, name: 'x', blocks: {}, costumes: [{ assetId: 'b'.repeat(32), dataFormat: 'svg' }], sounds: [] }),
            spriteUpload({ isStage: false, name: 'x', blocks: {}, costumes: [], sounds: [], extensionURLs: { evil: 'https://evil.test' } }),
        ];
        for (const extra of [{ blocks: { malicious: { opcode: 'https://evil.test/extension.js_run' } } },
            { blocks: { malicious: { opcode: 'unknownextension_run' } } }, { fonts: ['https://evil.test/font.woff'] },
            { extensionURLs: { custom: 'https://evil.test/extension.js' } }]) {
            cases.push(spriteUpload({ isStage: false, name: 'x', blocks: {},
                costumes: [{ assetId, dataFormat: 'svg' }], sounds: [], ...extra }));
        }
        const badSvg = spriteUpload();
        const zip = new AdmZip(badSvg.filepath);
        zip.updateFile(`${assetId}.svg`, Buffer.from('<svg><script/></svg>'));
        zip.writeZip(badSvg.filepath); cases.push(badSvg);
        const corrupt = spriteUpload(); const bytes = fs.readFileSync(corrupt.filepath);
        const directory = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        bytes.writeUInt32LE((bytes.readUInt32LE(directory + 16) ^ 1) >>> 0, directory + 16); fs.writeFileSync(corrupt.filepath, bytes); cases.push(corrupt);
        for (const item of cases) await assert.rejects(files.validateScratchPreset(item.filepath, item.originalFilename, 'sprite'), ValidationError);
    });
});

describe('Scratch preset domain isolation and lifecycle (real Mongo)', () => {
    it('only teachers create/rename/delete; current members read exact preset and file', async () => {
        const image = upload(png);
        await assert.rejects(model.createPreset(student, { title: 'x', kind: 'costume' }, image), PermissionError);
        const doc = await model.createPreset(teacher, { title: '  蓝色造型  ', kind: 'costume' }, image);
        assert.equal(doc.title, '蓝色造型'); assert.equal((await model.getPreset(student, doc._id)).kind, 'costume');
        const file = await model.getFile(student, doc.fileId); assert(file.presetId.equals(doc._id)); assert.equal(file.workId, undefined);
        assert.equal(mirror.at(-1).meta['Content-Type'], 'image/png');
        await assert.rejects(model.getFile(foreign, doc.fileId), NotFoundError);
        await assert.rejects(model.renamePreset(student, doc._id, '不能改'), PermissionError);
        await assert.rejects(model.deletePreset(student, doc._id), PermissionError);
        await assert.rejects(model.renamePreset(foreign, doc._id, '跨域'), NotFoundError);
        assert.equal((await model.renamePreset(teacher, doc._id, '新名称')).title, '新名称');
        const usage = (await model.quotas.findOne({ _id: teacher.domainId })).bytes;
        await Promise.all([model.deletePreset(teacher, doc._id), model.deletePreset(teacher, doc._id)]);
        assert.equal((await model.quotas.findOne({ _id: teacher.domainId })).bytes, usage - file.size);
        assert(!blobs.has(file.path)); await assert.rejects(model.getFile(student, doc.fileId), NotFoundError);
    });
    it('stale/orphan preset file relations fail closed', async () => {
        const doc = await model.createPreset(teacher, { title: '删除素材', kind: 'backdrop' }, upload(svg, '背景.svg'));
        await model.presets.updateOne({ _id: doc._id }, { $set: { fileId: new ObjectId() } });
        await assert.rejects(model.getFile(student, doc.fileId), NotFoundError);
        await model.presets.deleteOne({ _id: doc._id });
        await assert.rejects(model.getFile(student, doc.fileId), NotFoundError);
    });
    it('shares existing domain quota and rolls file bytes back if preset insert fails', async () => {
        const actor = { ...teacher, domainId: 'quota' };
        await model.quotas.insertOne({ _id: actor.domainId, bytes: 2 * 1024 ** 3 - png.length + 1 });
        await assert.rejects(model.createPreset(actor, { title: '超额', kind: 'costume' }, upload(png)), ValidationError);
        assert.equal(await model.files.countDocuments({ domainId: actor.domainId }), 0);
        const original = model.presets.insertOne;
        const before = (await model.quotas.findOne({ _id: teacher.domainId })).bytes;
        model.presets.insertOne = async () => { throw new Error('database unavailable'); };
        try { await assert.rejects(model.createPreset(teacher, { title: '回滚', kind: 'costume' }, upload(png)), /database unavailable/); }
        finally { model.presets.insertOne = original; }
        assert.equal((await model.quotas.findOne({ _id: teacher.domainId })).bytes, before);
    });
    it('anonymous/nonmembers/OJ domains cannot list; student cannot use management page; CSRF still enforced', async () => {
        const joined = handler(library.ScratchLibraryHandler, student); await joined.prepare(); await joined.get();
        assert.equal(joined.response.type, 'application/json'); assert(Array.isArray(joined.response.body.items));
        const anonymous = handler(library.ScratchLibraryHandler, { ...student, uid: 0 });
        await assert.rejects(anonymous.prepare(), PermissionError);
        const nonmember = handler(library.ScratchLibraryHandler, { ...student, uid: 99 });
        await assert.rejects(nonmember.prepare(), PermissionError);
        const foreignStudent = handler(library.ScratchLibraryHandler, { ...student, domainId: 'presets-b' });
        await assert.rejects(foreignStudent.prepare(), PermissionError);
        const oj = handler(library.ScratchLibraryHandler); oj.domain.domainType = 'oj'; await assert.rejects(oj.prepare(), NotFoundError);
        const manage = handler(library.ScratchLibraryManageHandler, student); await assert.rejects(manage.prepare(), PermissionError);
        const csrf = handler(library.ScratchLibraryManageHandler, teacher, 'post'); csrf.request.headers.origin = 'https://evil.test';
        await assert.rejects(csrf.prepare(), CsrfTokenError);
    });
    it('metadata contract omits account/storage info and file download retains safe headers', async () => {
        const create = handler(library.ScratchLibraryManageHandler, teacher, 'post');
        create.request.body = { kind: 'sprite', title: '预制角色' }; create.request.files.file = spriteUpload();
        await create.prepare(); await create.post(); const item = create.response.body.item;
        assert.deepEqual(Object.keys(item).sort(), ['fileUrl', 'filename', 'id', 'kind', 'mime', 'size', 'title'].sort());
        assert.equal(item.previewUrl, undefined); assert.equal(item.mime, 'application/x.scratch.sprite3');
        const doc = await model.getPreset(teacher, new ObjectId(item.id));
        const download = handler(handlers.ScratchFileHandler, student); download.request.params.fileId = doc.fileId.toHexString();
        await download.prepare(); await download.get();
        assert.equal(download.response.type, 'application/octet-stream'); assert(Buffer.isBuffer(download.response.body));
        assert.equal(download.headers['X-Content-Type-Options'], 'nosniff');
        assert.equal(download.headers['Content-Security-Policy'], "default-src 'none'; sandbox");
        const config = handler(library.ScratchLibraryManageHandler); await config.prepare(); await config.get();
        assert.equal(config.response.template, 'scratch_library_manage.html'); assert.equal(config.response.body.maxFileSize, 20 * 1024 * 1024);
    });
    it('management routes and menu require the right domain and permission', () => {
        const routes = []; let menu;
        library.apply({ Route: (...args) => routes.push(args), injectUI: (...args) => { menu = args; } });
        assert.deepEqual(routes.map((route) => route[0]), ['scratch_library', 'domain_scratch_library', 'domain_scratch_library_item']);
        for (const route of routes) assert.equal(route[3], 1);
        assert.equal(menu[3](handler(library.ScratchLibraryHandler)), true);
        assert.equal(menu[3](handler(library.ScratchLibraryHandler, student)), false);
        const oj = handler(library.ScratchLibraryHandler); oj.domain.domainType = 'oj'; assert.equal(menu[3](oj), false);
    });
    it('rejects extra multipart files, overlong titles and libraries beyond the bounded list limit', async () => {
        const request = handler(library.ScratchLibraryManageHandler, teacher, 'post');
        request.request.body = { kind: 'costume', title: 'x' }; request.request.files.file = [upload(png), upload(png)];
        await request.prepare(); await assert.rejects(request.post(), ValidationError);
        await assert.rejects(model.createPreset(teacher, { title: 'x'.repeat(121), kind: 'costume' }, upload(png)), ValidationError);
        const actor = { ...teacher, domainId: 'full-library' };
        await model.presets.insertMany(Array.from({ length: 500 }, (_, i) => ({
            _id: new ObjectId(), domainId: actor.domainId, owner: actor.uid, createdAt: new Date(), updatedAt: new Date(),
            title: `素材${i}`, kind: 'costume', fileId: new ObjectId(), filename: 'x.png', mime: 'image/png', size: 1,
        })));
        await assert.rejects(model.createPreset(actor, { title: '超限', kind: 'costume' }, upload(png)), ValidationError);
        assert.equal((await model.listPresets(actor).toArray()).length, 500);
        assert.equal(await model.files.countDocuments({ domainId: actor.domainId }), 0);
    });
    it('CDN classification preserves old project checks and rejects mismatched preset MIME or paths', async () => {
        const doc = await model.createPreset(teacher, { title: '严格图片', kind: 'costume' }, upload(png));
        const file = await model.getFile(student, doc.fileId);
        assert(model.fileAssetSource(file));
        assert.equal(model.fileAssetSource({ ...file, mime: 'application/octet-stream' }), null);
        assert.equal(model.fileAssetSource({ ...file, path: file.path.replace('.png', '.sprite3') }), null);
        assert.equal(model.fileAssetSource({ ...file, path: 'user/1/image.png' }), null);
        assert.equal(model.fileAssetSource({ ...file, presetId: undefined, purpose: 'thumbnail', mime: 'image/svg+xml' }), null);
    });
    it('domain deletion removes preset records and stored files without touching other domains', async () => {
        const actor = { ...teacher, domainId: 'delete-me' };
        const doc = await model.createPreset(actor, { title: '临时', kind: 'costume' }, upload(png));
        const stored = await model.getFile(actor, doc.fileId);
        const otherCount = await model.presets.countDocuments({ domainId: teacher.domainId });
        await deleteDomain(actor.domainId);
        assert.equal(await model.presets.countDocuments({ domainId: actor.domainId }), 0); assert(!blobs.has(stored.path));
        assert.equal(await model.quotas.findOne({ _id: actor.domainId }), null);
        assert.equal(await model.presets.countDocuments({ domainId: teacher.domainId }), otherCount);
    });
});
