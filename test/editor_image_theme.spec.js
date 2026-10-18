const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { Readable } = require('node:stream');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const appRequire = createRequire(path.join(root, 'packages/hydrooj/package.json'));
function load(filename, dependencies = {}) {
    const module = { exports: {} };
    const code = transformSync(fs.readFileSync(path.join(root, filename), 'utf8'), {
        loader: 'ts', format: 'cjs', target: 'node20', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    new Function('require', 'module', 'exports', code)(
        (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : appRequire(name), module, module.exports,
    );
    return module.exports;
}
const lib = load('packages/hydrooj/src/lib/editor_image_theme.ts');
const AdmZip = appRequire('adm-zip');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6R0sAAAAASUVORK5CYII=', 'base64');
function archive(files, modify) {
    const zip = new AdmZip();
    for (const [name, value] of Object.entries(files)) zip.addFile(name, Buffer.isBuffer(value) ? value : Buffer.from(value));
    if (modify) modify(zip);
    return zip.toBuffer();
}
function parse(files, modify) { return lib.parseEditorThemeZip(archive(files, modify), '我的主题.zip'); }

it('accepts a folder of arbitrary-named artwork without configuration, keeping screenshot out of the background', () => {
    const result = parse({ '我的素材/星空.png': image, 'preview.png': image, 'README.txt': '上传后给图片选择区域。' });
    assert.equal(result.design.name, '我的主题');
    assert.equal(result.files.length, 2);
    const names = new Map(result.files.map((file) => [file.id, file.name]));
    assert.equal(names.get(result.design.slots.background.assetId), '我的素材/星空.png');
    assert.equal(names.get(result.design.previewAssetId), 'preview.png');
    assert.equal(result.design.base, 'ocean');
    assert.equal(result.design.overlay, 0.86);
});

it('does not turn a full-interface screenshot into a live skin if the package has only a preview', () => {
    const result = parse({ 'preview.png': image });
    assert.deepEqual(result.design.slots, {});
    assert.equal(result.design.previewAssetId, result.files[0].id);
});

it('imports a complete simple manifest by filenames, including preview, thumbnail, poster and independent image slots', () => {
    const result = parse({ 'main.png': image, 'panel.png': image, 'preview.png': image, 'thumb.png': image,
        'theme.json': JSON.stringify({ version: 1, name: '星海', base: 'mist', overlay: 0.71,
            palette: { text: '#F8FAFC', accent: '#2563eb' }, preview: 'preview.png', thumbnail: 'thumb.png', poster: 'main.png',
            slots: { background: { file: 'main.png', position: 'right top' }, editor: 'panel.png',
                submitButton: { asset: 'panel.png', fit: 'stretch' } } }) });
    assert.equal(result.design.name, '星海');
    assert.equal(result.design.overlay, 0.71);
    assert.equal(result.design.slots.background.position, 'right top');
    assert.equal(result.design.slots.submitButton.fit, 'stretch');
    assert.equal(result.files.find((file) => file.id === result.design.thumbnailAssetId).name, 'thumb.png');
    assert.equal(result.files.find((file) => file.id === result.design.posterAssetId).name, 'main.png');
});

it('rejects path traversal, platform separators and symlink ZIP entries', () => {
    for (const name of ['../escape.png', '/absolute.png', 'C:/windows.png', 'folder\\escape.png', 'x/%2e%2e.png']) {
        assert.throws(() => parse({ 'safe.png': image }, (zip) => { zip.getEntry('safe.png').entryName = name; }), /路径/);
    }
    assert.throws(() => parse({ 'safe.png': image }, (zip) => { zip.getEntry('safe.png').attr = 0xa1ff0000; }), /符号链接/);
});

it('rejects duplicate names across case and Unicode normalization, plus encrypted files', () => {
    assert.throws(() => parse({ 'cat.png': image, 'CAT.png': image }), /重复/);
    assert.throws(() => parse({ 'é.png': image, 'é.png': image }), /重复/);
    assert.throws(() => parse({ 'safe.png': image }, (zip) => { zip.getEntry('safe.png').header.flags |= 1; }), /加密/);
});

it('rejects executable styles/scripts/SVG, malformed media and unexpected binary files', () => {
    for (const name of ['main.js', 'theme.css', 'button.svg', 'secret.html', 'notes.pdf']) {
        assert.throws(() => parse({ [name]: '<svg onload="alert(1)"></svg>' }), /不支持/);
    }
    assert.throws(() => parse({ 'main.png': Buffer.from('<html>disguised media</html>') }), /不支持/);
    assert.throws(() => lib.parseEditorThemeZip(Buffer.from('not a zip')), /ZIP/);
});

it('bounds expanded count and size before extracting media', () => {
    const files = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`${index}.png`, image]));
    assert.throws(() => parse(files), /64/);
    assert.throws(() => parse({ 'huge.png': image }, (zip) => { zip.getEntry('huge.png').header.size = 121 * 1024 * 1024; }), /过大/);
    assert.throws(() => parse({ 'main.png': image, 'theme.json': ' '.repeat(65537) }), /过大/);
});

it('rejects broken manifest version, syntax, missing asset references and script-like colors or positions', () => {
    for (const data of [
        { version: 2 },
        { version: 1, slots: { background: 'no.png' } },
        { version: 1, slots: { bogus: 'main.png' } },
        { version: 1, slots: { background: { file: 'main.png', position: 'url(https://evil.test)' } } },
        { version: 1, palette: { text: 'url(https://evil.test)' } },
        { version: 1, palette: { stylesheet: '#FFFFFF' } },
        { version: 1, palette: { text: '#FFFFFF00' } },
        { version: 1, preview: 'https://evil.test/preview.png' },
        { version: 1, overlay: 0.01 },
        { version: 1, base: 'unregistered' },
    ]) assert.throws(() => parse({ 'main.png': image, 'theme.json': JSON.stringify(data) }));
    assert.throws(() => parse({ 'main.png': image, 'theme.json': '{malformed' }), /JSON/);
});

it('permits passive background videos, requiring images for buttons, corners and preview', () => {
    const mp4 = Buffer.from('000000206674797069736f6d0000020069736f6d69736f32617663316d703431', 'hex');
    const result = parse({ 'loop.mp4': mp4, 'poster.png': image, 'theme.json': JSON.stringify({
        version: 1, slots: { background: 'loop.mp4' }, poster: 'poster.png',
    }) });
    assert.equal(result.files.find((file) => file.name === 'loop.mp4').type, 'video/mp4');
    for (const slot of ['toolbar', 'editor', 'panel', 'runButton', 'submitButton', 'corner']) {
        assert.throws(() => parse({ 'loop.mp4': mp4, 'theme.json': JSON.stringify({ version: 1, slots: { [slot]: 'loop.mp4' } }) }), /视频只能/);
    }
});

it('uses hashed object-storage paths rather than uploading user filenames as storage paths', () => {
    const asset = { id: 'b'.repeat(24), name: '我的素材/风景.PNG' };
    const target = lib.editorThemeStoragePath('domain:child', 'a'.repeat(32), asset);
    assert.match(target, /^editor-theme\/[a-f\d]{24}\/[a-f\d]{32}\/[a-f\d]{24}\.png$/);
    assert(!target.includes('child'));
    assert(!target.includes('风景'));
    assert.notEqual(target, lib.editorThemeStoragePath('domain:another', 'a'.repeat(32), asset));
});

it('exports reusable artwork and a portable manifest that roundtrips without badge or classroom bindings', async () => {
    const source = parse({ '素材/星海.png': image, 'preview.png': image, 'theme.json': JSON.stringify({
        version: 1, name: '可复用设计', base: 'ocean', overlay: 0.82, preview: 'preview.png',
        slots: { background: { asset: '素材/星海.png', fit: 'cover', position: 'right top' }, submitButton: '素材/星海.png' },
    }) });
    const zip = await lib.exportEditorThemeZip(source.design, source.files, async (asset) => Readable.from([asset.data]));
    const exported = new AdmZip(zip);
    const manifest = JSON.parse(exported.readAsText('theme.json'));
    assert.equal(manifest.preview, 'preview.png');
    assert.equal(manifest.slots.background.asset, '素材/星海.png');
    assert.equal(manifest.slots.background.position, 'right top');
    assert(!Object.hasOwn(manifest, 'badgeId'));
    assert(!Object.hasOwn(manifest, 'domainId'));
    const reimported = lib.parseEditorThemeZip(zip, '可复用设计.zip');
    assert.deepEqual(reimported.design, source.design);
    assert.deepEqual(reimported.files.map((asset) => asset.name), source.files.map((asset) => asset.name));
});

it('bounds export reads by saved sizes and destroys malformed remote streams instead of returning corrupt packages', async () => {
    const source = parse({ 'image.png': image });
    let stream;
    await assert.rejects(lib.exportEditorThemeZip(source.design, source.files, async () => {
        stream = Readable.from([image, Buffer.from('unexpected extra bytes')]);
        return stream;
    }), /大小/);
    assert.equal(stream.destroyed, true);
    await assert.rejects(lib.exportEditorThemeZip(source.design, source.files, async () => Readable.from([image.subarray(0, 12)])), /完整/);
    let loaded = false;
    await assert.rejects(lib.exportEditorThemeZip(source.design, [{ ...source.files[0], size: 121 * 1024 * 1024 }], async () => {
        loaded = true;
        return image;
    }), /大小/);
    assert.equal(loaded, false);
});

const { eligibleAsset } = load('packages/hydrooj/src/lib/asset_storage.ts', {
    './background_video_path': load('packages/hydrooj/src/lib/background_video_path.ts'),
});
it('extends primary object storage only for exact editor-theme passive-media paths and matching content types', () => {
    const prefix = `editor-theme/${'a'.repeat(24)}/${'b'.repeat(32)}/${'c'.repeat(24)}`;
    assert.equal(eligibleAsset(`${prefix}.png`, 'image/png'), true);
    assert.equal(eligibleAsset(`${prefix}.mp4`, 'video/mp4'), true);
    assert.equal(eligibleAsset(`${prefix}.webm`, 'video/webm'), true);
    for (const [name, type] of [[`${prefix}.svg`, 'image/svg+xml'], [`${prefix}.png`, 'text/html'],
        [`${prefix}.mp4`, 'image/png'], ['editor-theme/arbitrary/file.png', 'image/png'],
        ['submission/a/movie.mp4', 'video/mp4']]) assert.equal(eligibleAsset(name, type), false);
});

let retired = [];
let retireFailure;
const workspace = { LEGACY_WORKSPACE_ID: 'tang', resolveDomainWorkspaceId: (domain) => domain.workspaceId || 'tang',
    getLegacyWorkspace: async () => ({ ownerUid: 2 }) };
const handlerModule = load('packages/hydrooj/src/handler/editor_theme.ts', {
    '../error': { NotFoundError: Error, PermissionError: Error, ValidationError: Error },
    '../lib/asset_delivery': { tryRedirectAsset: () => false }, '../lib/asset_storage': {},
    '../lib/editor_image_theme': lib, '../lib/user_badge_gallery': {},
    '../model/builtin': { PERM: { PERM_EDIT_DOMAIN: 1n }, PRIV: { PRIV_USER_PROFILE: 1 } },
    '../model/storage': { del: async (paths) => {
        if (retireFailure?.(paths)) throw new Error('Storage retirement interrupted');
        retired.push(...paths);
    } },
    '../model/user': {}, '../model/workspace': workspace,
    '../service/server': { Handler: class {}, param: () => () => {}, Types: { String: {} } },
});

function matches(document, query) {
    return Object.entries(query).every(([key, condition]) => {
        if (key === '$or') return condition.some((item) => matches(document, item));
        if (key === '$and') return condition.every((item) => matches(document, item));
        const value = key === 'assets.path' ? document.assets?.map((asset) => asset.path) : document[key];
        if (!condition || typeof condition !== 'object' || condition instanceof Date) {
            return Array.isArray(value) ? value.includes(condition) : +value === +condition || value === condition;
        }
        return Object.entries(condition).every(([operator, operand]) => {
            if (operator === '$exists') return (value !== undefined) === operand;
            if (operator === '$lte') return value !== undefined && value <= operand;
            if (operator === '$gt') return value !== undefined && value > operand;
            if (operator === '$in') return Array.isArray(value) ? value.some((item) => operand.includes(item)) : operand.includes(value);
            throw new Error(`Unexpected operator ${operator}`);
        });
    });
}
function draftDatabase(fixtures) {
    return { collection(name) {
        const rows = fixtures[name] || (fixtures[name] = []);
        return {
            find(query) { return { limit() { return this; }, async toArray() { return rows.filter((row) => matches(row, query)).map((row) => ({ ...row })); } }; },
            async findOne(query) { return rows.find((row) => matches(row, query)); },
            async findOneAndUpdate(query, update) {
                const row = rows.find((item) => matches(item, query));
                if (!row) return null;
                const before = { ...row };
                Object.assign(row, update.$set);
                for (const [key, value] of Object.entries(update.$max || {})) if (row[key] === undefined || row[key] < value) row[key] = value;
                return before;
            },
            async updateOne(query, update) {
                const row = rows.find((item) => matches(item, query));
                if (!row) return { matchedCount: 0 };
                Object.assign(row, update.$set);
                for (const key of Object.keys(update.$unset || {})) delete row[key];
                for (const [key, value] of Object.entries(update.$max || {})) if (row[key] === undefined || row[key] < value) row[key] = value;
                return { matchedCount: 1 };
            },
            async deleteOne(query) { const index = rows.findIndex((row) => matches(row, query)); if (index >= 0) rows.splice(index, 1); },
        };
    } };
}
it('keeps legacy teacher ownership and modern classroom administrator permissions scoped independently', async () => {
    assert.equal(handlerModule.editorThemeScope({ _id: 'system' }), 'global');
    assert.equal(handlerModule.editorThemeScope({ _id: 'A', workspaceId: 'school' }), 'domain:A');
    const teacher = { user: { _id: 2, hasPerm: () => false }, domain: { _id: 'system' } };
    assert.equal(await handlerModule.canManageEditorThemes(teacher), true);
    assert.equal(await handlerModule.canManageEditorThemes({ ...teacher, user: { _id: 3, hasPerm: () => true } }), false);
    assert.equal(await handlerModule.canManageEditorThemes({ ...teacher, domain: { _id: 'A', workspaceId: 'school' } }), false);
    assert.equal(await handlerModule.canManageEditorThemes({ user: { _id: 9, hasPerm: () => true }, domain: { _id: 'A', workspaceId: 'school' } }), true);
});

it('retires only abandoned draft objects, preserving published versions and uploads that are still being published', async () => {
    retired = [];
    const now = new Date('2026-10-18T08:00:00Z');
    const expired = new Date(now.getTime() - 1000);
    const future = new Date(now.getTime() + 1000);
    const fixtures = { 'editor.themeDraft': [
        { _id: 'abandoned', expiresAt: expired, assets: [{ path: 'old.png' }] },
        { _id: 'published', expiresAt: expired, assets: [{ path: 'keep.png' }] },
        { _id: 'version', expiresAt: expired, assets: [{ path: 'version.png' }] },
        { _id: 'in-use', expiresAt: expired, publishLeaseUntil: future, assets: [{ path: 'in-use.png' }] },
        { _id: 'new', expiresAt: future, assets: [{ path: 'new.png' }] },
    ], 'editor.theme': [{ assets: [{ path: 'keep.png' }] }], 'editor.themeVersion': [{ assets: [{ path: 'version.png' }] }] };
    await handlerModule.cleanEditorThemeDrafts({ db: draftDatabase(fixtures) }, now);
    assert.deepEqual(retired, ['old.png']);
    assert.deepEqual(fixtures['editor.themeDraft'].map((row) => row._id), ['in-use', 'new']);
});

it('allows cleanup to recover a crashed worker lease but prevents concurrent workers from retiring the same draft twice', async () => {
    retired = [];
    const now = new Date('2026-10-18T08:00:00Z');
    const old = new Date(now.getTime() - 10 * 60 * 1000);
    const fixtures = { 'editor.themeDraft': [{ _id: 'crashed', expiresAt: old, cleanupStartedAt: old, assets: [{ path: 'crashed.png' }] }] };
    const ctx = { db: draftDatabase(fixtures) };
    await Promise.all([handlerModule.cleanEditorThemeDrafts(ctx, now), handlerModule.cleanEditorThemeDrafts(ctx, now)]);
    assert.deepEqual(retired, ['crashed.png']);
    assert.equal(fixtures['editor.themeDraft'].length, 0);
});

it('keeps the current publication indefinitely but bounds unused history to seven days', async () => {
    retired = []; retireFailure = undefined;
    const now = new Date('2026-10-18T08:00:00Z');
    const old = new Date(now.getTime() - 8 * 86400000);
    const recent = new Date(now.getTime() - 6 * 86400000);
    const fixtures = {
        'editor.theme': [{ version: 'current', assets: [{ path: 'current.png' }] }],
        'editor.themeVersion': [
            { _id: 'current', updatedAt: old, assets: [{ path: 'current.png' }] },
            { _id: 'obsolete', updatedAt: old, assets: [{ path: 'obsolete.png' }] },
            { _id: 'recent', updatedAt: recent, assets: [{ path: 'recent.png' }] },
        ],
    };
    await handlerModule.cleanEditorThemeVersions({ db: draftDatabase(fixtures) }, now);
    assert.deepEqual(retired, ['obsolete.png']);
    assert.deepEqual(fixtures['editor.themeVersion'].map((row) => row._id), ['current', 'recent']);
});

it('retains artwork shared with a current theme, retained snapshot, unexpired draft or active publish lease', async () => {
    retired = []; retireFailure = undefined;
    const now = new Date('2026-10-18T08:00:00Z');
    const old = new Date(now.getTime() - 8 * 86400000);
    const future = new Date(now.getTime() + 60000);
    const fixtures = {
        'editor.theme': [{ version: 'current', assets: [{ path: 'shared-current.png' }] }],
        'editor.themeVersion': [
            { _id: 'obsolete', updatedAt: old, assets: ['shared-current.png', 'shared-recent.png', 'draft.png', 'publishing-draft.png', 'orphan.png'].map((path) => ({ path })) },
            { _id: 'recent', updatedAt: now, assets: [{ path: 'shared-recent.png' }] },
            { _id: 'publishing-version', updatedAt: old, publishLeaseUntil: future, assets: [{ path: 'leased.png' }] },
        ],
        'editor.themeDraft': [
            { _id: 'draft', expiresAt: future, assets: [{ path: 'draft.png' }] },
            { _id: 'publishing', expiresAt: old, publishLeaseUntil: future, assets: [{ path: 'publishing-draft.png' }] },
        ],
    };
    await handlerModule.cleanEditorThemeVersions({ db: draftDatabase(fixtures) }, now);
    assert.deepEqual(retired, ['orphan.png']);
    assert.deepEqual(fixtures['editor.themeVersion'].map((row) => row._id), ['recent', 'publishing-version']);
});

it('recovers interrupted version retirement without dropping the only cleanup reference', async () => {
    retired = [];
    const now = new Date('2026-10-18T08:00:00Z');
    const old = new Date(now.getTime() - 8 * 86400000);
    const fixtures = { 'editor.themeVersion': [{ _id: 'interrupted', updatedAt: old, assets: [{ path: 'large-video.mp4' }] }] };
    const ctx = { db: draftDatabase(fixtures) };
    retireFailure = () => true;
    await assert.rejects(handlerModule.cleanEditorThemeVersions(ctx, now), /interrupted/);
    assert.equal(fixtures['editor.themeVersion'].length, 1);
    assert(fixtures['editor.themeVersion'][0].gcClaimedAt);
    retireFailure = undefined;
    await handlerModule.cleanEditorThemeVersions(ctx, new Date(now.getTime() + 6 * 60000));
    assert.deepEqual(retired, ['large-video.mp4']);
    assert.equal(fixtures['editor.themeVersion'].length, 0);
});

it('parallel version collectors cannot mutually retain an orphan shared only by obsolete versions', async () => {
    retired = []; retireFailure = undefined;
    const now = new Date('2026-10-18T08:00:00Z');
    const old = new Date(now.getTime() - 8 * 86400000);
    const fixtures = { 'editor.themeVersion': [
        { _id: 'A', updatedAt: old, assets: [{ path: 'shared-obsolete.mp4' }] },
        { _id: 'B', updatedAt: old, assets: [{ path: 'shared-obsolete.mp4' }] },
    ] };
    const ctx = { db: draftDatabase(fixtures) };
    await Promise.all([handlerModule.cleanEditorThemeVersions(ctx, now), handlerModule.cleanEditorThemeVersions(ctx, now)]);
    assert(retired.includes('shared-obsolete.mp4'));
    assert.equal(fixtures['editor.themeVersion'].length, 0);
});
