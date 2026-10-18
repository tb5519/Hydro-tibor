/* eslint-disable no-await-in-loop -- Ordered HTTP scenarios exercise a disposable classroom. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createHash, randomBytes } = require('node:crypto');
const { Readable } = require('node:stream');
const Zip = require('adm-zip');
const supertest = require('supertest');

process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(os.homedir(), '.cache/mongodb-binaries');
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-editor-theme-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.EDITOR_THEME_PORT || '18919';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => { console.error('Editor theme integration timed out'); process.exit(1); }, 180000);
const checks = [];
async function check(name, fn) {
    try { await fn(); checks.push(true); console.log(`PASS ${name}`); }
    catch (error) { checks.push(false); console.error(`FAIL ${name}\n${error.stack}`); }
}
function status(response, expected) { assert.equal(response.status, expected, `${response.status}: ${response.text?.slice(0, 1000)}`); }
function denied(response) { assert(response.status >= 400 && response.status < 500, `${response.status}: ${response.text?.slice(0, 1000)}`); }
async function buffer(source) {
    if (Buffer.isBuffer(source)) return source;
    if (typeof source === 'string') return fs.readFileSync(source);
    const parts = [];
    for await (const part of source) parts.push(Buffer.from(part));
    return Buffer.concat(parts);
}

async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, httpServer } = require('hydrooj');
    const db = require('../packages/hydrooj/src/service/db').default;
    const workspace = require('../packages/hydrooj/src/model/workspace').default;
    const assetStorage = require('../packages/hydrooj/src/lib/asset_storage').default;
    // Exercise the real remote StorageModel path and DB references. Only the OSS transport is local and disposable.
    const blobs = new Map();
    const media = http.createServer((req, res) => {
        const key = decodeURIComponent(req.url.slice(1).split('?')[0]);
        const value = blobs.get(key);
        if (!value) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': value.type, 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' });
        res.end(value.data);
    });
    await new Promise((resolve) => media.listen(0, '127.0.0.1', resolve));
    const mediaOrigin = `http://127.0.0.1:${media.address().port}`;
    let storageEnabled = true;
    assetStorage.shouldStore = (target, type) => storageEnabled
        && require('../packages/hydrooj/src/lib/asset_storage').eligibleAsset(target, type);
    assetStorage.put = async (target, source, type, prepare) => {
        const data = await buffer(source);
        const sha256 = createHash('sha256').update(data).digest('hex');
        const key = `media/v1/${randomBytes(32).toString('hex')}${path.extname(target).toLowerCase()}`;
        const remote = { key, sha256, size: data.length, bucket: 'theme-qa', region: 'test', contentType: type };
        if (prepare) await prepare(remote);
        blobs.set(key, { data, type });
        return remote;
    };
    assetStorage.signDownloadLink = async (asset) => `${mediaOrigin}/${asset.key}`;
    assetStorage.get = async (asset, savePath) => {
        const bytes = blobs.get(asset.key)?.data;
        if (!bytes) throw new Error('Missing remote fixture');
        if (savePath) { fs.writeFileSync(savePath, bytes); return null; }
        return Readable.from(bytes);
    };
    assetStorage.del = async (asset) => blobs.delete(asset.key);
    assetStorage.verify = async () => true;

    const password = 'ThemeLocal123!';
    const teacherId = await users.create('theme-teacher@example.test', 'theme_teacher', password);
    await users.setSuperAdmin(teacherId);
    const room = await workspace.create('editor-theme-qa', '主题设计课堂', teacherId);
    const domainId = 'editor-theme-qa';
    const otherDomainId = 'editor-theme-other';
    await domains.add(domainId, teacherId, 'C++ 训练', 'Isolated image-theme fixture', room._id);
    await domains.add(otherDomainId, teacherId, '另一课堂', 'Scoped theme fixture', room._id);
    const uid = await users.createInDomain(domainId, 'theme-student@example.test', 'theme_student', password);
    const otherUid = await users.createInDomain(domainId, 'theme-other@example.test', 'theme_other', password);
    for (const id of [uid, otherUid]) {
        await workspace.addStudent(room._id, id, teacherId);
        await domains.setUserInDomain(otherDomainId, id, { join: true, role: 'default' });
        await users.setById(id, { defaultDomain: domainId, scratchpadTheme: 'ocean' });
    }
    await users.setById(uid, { displayName: '主题体验学员' });
    const expires = new Date(Date.now() + 86400000);
    await db.collection('badge').insertMany([
        { _id: 701, domainId, title: '2026 疾风剑客', short: '疾风剑客', users: [] },
        { _id: 702, domainId, title: '月下漫游', short: '月下漫游', users: [] },
        { _id: 703, domainId: otherDomainId, title: '另一课堂徽章', short: '其他', users: [] },
    ]);
    await db.collection('userBadge').insertMany([
        { owner: uid, badgeId: 701, domainId, getAt: new Date() },
        { owner: uid, badgeId: 702, domainId, getAt: new Date() },
    ]);
    await db.collection('lottery.badgeGrant').insertOne({ uid, badgeId: 702, domainId, grantedAt: new Date(), expiresAt: expires });
    const problemId = await problems.add(domainId, 'THEMEDEMO', '你好，编程世界', '输出 `Hello, World!`，开始今天的编程练习。', teacherId);
    const teacher = supertest.agent(httpServer), student = supertest.agent(httpServer), other = supertest.agent(httpServer);
    for (const [agent, uname] of [[teacher, 'theme_teacher'], [student, 'theme_student'], [other, 'theme_other']]) {
        status(await agent.post('/login').send({ uname, password }), 302);
    }
    const prefix = `/d/${domainId}`;
    const managementUrl = `${prefix}/manage/editor-themes`;
    const catalogUrl = `${prefix}/code-editor/themes`;
    const get = (agent, url) => agent.get(url).set('Accept', 'application/json');
    const post = (agent, url, body) => agent.post(url).set('Accept', 'application/json')
        .set('Origin', `http://127.0.0.1:${port}`).send(body);
    const upload = (archive, agent = teacher) => agent.post(managementUrl).set('Accept', 'application/json')
        .set('Origin', `http://127.0.0.1:${port}`).field('operation', 'upload').attach('file', archive, 'demo.zip');
    const archive = new Zip();
    archive.addFile('background.jpg', fs.readFileSync(path.resolve(__dirname, '../examples/editor-themes/wind-demo/background.jpg')));
    archive.addFile('preview.jpg', fs.readFileSync(path.resolve(__dirname, '../examples/editor-themes/wind-demo/preview.jpg')));
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../examples/editor-themes/wind-demo/theme.json'), 'utf8'));
    archive.addFile('theme.json', Buffer.from(JSON.stringify(manifest)));
    let draft, published;
    await check('Only the classroom teacher can inspect or upload themes; scoped badge choices exclude other classrooms', async () => {
        denied(await get(student, managementUrl));
        denied(await upload(archive.toBuffer(), student));
        const response = await get(teacher, `${managementUrl}?data=1`);
        status(response, 200);
        assert(response.body.badges.some((badge) => badge.id === 701));
        assert(!response.body.badges.some((badge) => badge.id === 703));
        const html = await teacher.get(managementUrl).set('Accept', 'text/html');
        status(html, 200);
        assert(html.text.includes('data-editor-theme-manage') && !html.text.includes('Template render error'));
    });
    await check('ZIP upload prepares an unpublished draft in remote storage and auto-restores its image mapping', async () => {
        const response = await upload(archive.toBuffer());
        status(response, 200);
        draft = response.body.draft;
        assert(draft.id && draft.assets.length === 2);
        assert.equal(draft.name, '疾风剑客');
        assert.equal(draft.slots.background.assetId, draft.assets.find((asset) => asset.name === 'background.jpg').id);
        assert(draft.previewAssetId && draft.previewAssetId !== draft.slots.background.assetId);
        assert.equal((await get(student, catalogUrl)).body.themes.length, 0);
        const stored = await db.collection('storage').find({ path: /editor-theme/ }).toArray();
        assert(stored.length > 0 && stored.every((file) => file.remoteAsset), 'Theme media must use remote storage');
    });
    const publish = (badgeId = 701, extra = {}) => post(teacher, managementUrl, { operation: 'publish', draftId: draft.id,
        badgeId, name: draft.name, base: draft.base, overlay: draft.overlay, palette: JSON.stringify(draft.palette || {}),
        slots: JSON.stringify(draft.slots), ...extra });
    await check('Publication and selection require matching scoped badge ownership; wearing is unnecessary', async () => {
        denied(await publish(703));
        status(await publish(), 200);
        const response = await get(student, catalogUrl);
        status(response, 200);
        published = response.body.themes.find((theme) => theme.badgeId === 701);
        assert(published && published.expiresAt === null);
        assert(response.headers['cache-control']?.includes('no-store'));
        denied(await post(other, catalogUrl, { operation: 'select', id: published.id }));
        status(await post(student, catalogUrl, { operation: 'select', id: published.id }), 200);
        assert.equal((await get(student, catalogUrl)).body.selectedId, published.id);
        assert.equal((await get(student, `/d/${otherDomainId}/code-editor/themes`)).body.themes.length, 0);
    });
    await check('Temporary badge expiry is returned accurately and an expired badge cannot select or fetch its theme', async () => {
        status(await publish(702, { name: '限时主题' }), 200);
        const limited = (await get(student, catalogUrl)).body.themes.find((theme) => theme.badgeId === 702);
        assert.equal(limited.expiresAt, expires.toISOString());
        status(await post(student, catalogUrl, { operation: 'select', id: limited.id }), 200);
        await db.collection('lottery.badgeGrant').updateOne({ uid, badgeId: 702, domainId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
        const after = (await get(student, catalogUrl)).body;
        assert.equal(after.selectedId, 'ocean');
        assert(!after.themes.some((theme) => theme.badgeId === 702));
        denied(await get(student, limited.assets[0].url));
        denied(await post(student, catalogUrl, { operation: 'select', id: limited.id }));
        status(await post(student, catalogUrl, { operation: 'select', id: published.id }), 200);
    });
    await check('Media is private to eligible students and a new publication invalidates the old student asset version', async () => {
        const asset = published.assets[0];
        denied(await get(other, asset.url));
        status(await get(student, asset.url), 302);
        status(await publish(701, { name: '疾风剑客' }), 200);
        const updated = (await get(student, catalogUrl)).body.themes.find((theme) => theme.badgeId === 701);
        assert.notEqual(updated.version, published.version);
        denied(await get(student, asset.url));
        status(await get(teacher, asset.url), 302);
        published = updated;
    });
    await check('Teacher downloads a complete reusable package with preview; students and other classrooms cannot export it', async () => {
        const url = `${managementUrl}?export=${encodeURIComponent(published.id)}`;
        denied(await get(student, url));
        denied(await get(teacher, `${managementUrl}?export=badge%3A703`));
        const result = await teacher.get(url).buffer(true).parse((res, done) => {
            const parts = [];
            res.on('data', (part) => parts.push(part));
            res.on('end', () => done(null, Buffer.concat(parts)));
        });
        status(result, 200);
        assert.match(result.headers['content-type'], /application\/zip/);
        assert.match(result.headers['content-disposition'], /attachment/);
        const parsed = require('../packages/hydrooj/src/lib/editor_image_theme').parseEditorThemeZip(result.body);
        assert.equal(parsed.design.name, published.name);
        assert.equal(parsed.files.length, 2);
        assert(parsed.design.previewAssetId && parsed.design.previewAssetId !== parsed.design.slots.background.assetId);
        const configuration = JSON.parse(new Zip(result.body).readAsText('theme.json'));
        assert(!Object.hasOwn(configuration, 'badgeId') && !Object.hasOwn(configuration, 'domainId'));
    });
    await check('Object-storage failure and malformed replacement uploads preserve the published version', async () => {
        storageEnabled = false;
        const fresh = new Zip();
        fresh.addFile('another.jpg', fs.readFileSync(path.resolve(__dirname, '../examples/editor-themes/wind-demo/background.jpg')));
        const disabled = await upload(fresh.toBuffer());
        assert(disabled.status >= 400, 'Missing object storage must reject upload');
        storageEnabled = true;
        const bad = new Zip(); bad.addFile('theme.json', Buffer.from('{broken'));
        denied(await upload(bad.toBuffer()));
        const after = (await get(student, catalogUrl)).body.themes.find((theme) => theme.id === published.id);
        assert.equal(after.version, published.version);
    });
    await check('Revoked and expired badges disappear and restore a safe built-in selection', async () => {
        await db.collection('lottery.badgeGrant').insertOne({ uid, badgeId: 701, domainId, grantedAt: new Date(), revokedAt: new Date() });
        const response = await get(student, catalogUrl);
        assert(!response.body.themes.some((theme) => theme.badgeId === 701));
        assert.equal(response.body.selectedId, 'ocean');
        denied(await post(student, catalogUrl, { operation: 'select', id: published.id }));
        await db.collection('lottery.badgeGrant').deleteMany({ uid, badgeId: 701, domainId });
        status(await post(student, catalogUrl, { operation: 'select', id: published.id }), 200);
    });
    console.log(`RESULT ${checks.filter(Boolean).length}/${checks.length} editor-image-theme integration checks passed`);
    clearTimeout(timeout);
    if (process.env.KEEP_QA === '1' && checks.every(Boolean)) {
        fs.mkdirSync(path.resolve(__dirname, '../.cache/editor-theme'), { recursive: true });
        fs.writeFileSync(path.resolve(__dirname, '../.cache/editor-theme/qa.json'), JSON.stringify({
            origin: `http://localhost:${port}`, teacher: 'theme_teacher', student: 'theme_student', other: 'theme_other',
            password, domainId, teacherId, uid, managementUrl, catalogUrl, problemUrl: `${prefix}/p/${problemId}`, mediaOrigin,
        }, null, 2), { mode: 0o600 });
        console.log('QA ready: .cache/editor-theme/qa.json');
        return;
    }
    media.close();
    process.exit(checks.every(Boolean) ? 0 : 1);
}
let started = false;
process.send = (message) => {
    if (message === 'ready' && !started) { started = true; run().catch((error) => { console.error(error.stack); process.exit(1); }); }
    return true;
};
require('hydrooj/bin/hydrooj');
