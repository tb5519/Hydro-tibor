/* eslint-disable no-await-in-loop -- HTTP scenarios intentionally mutate one isolated fixture in order. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PNG } = require('pngjs');
const { JSDOM } = require('jsdom');
const supertest = require('supertest');

// Never use the developer's database, storage directory, or real user account.
process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(os.homedir(), '.cache/mongodb-binaries');
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-badge-gallery-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([
    path.resolve(__dirname, '../packages/ui-default'), path.resolve(__dirname, '../addons/badge-for-hydrooj'),
]));
const port = process.env.BADGE_GALLERY_PORT || '18897';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => {
    console.error('Badge gallery integration timed out');
    process.exit(1);
}, 150000);
const results = [];
async function check(name, fn) {
    try {
        await fn();
        results.push(true);
        console.log(`PASS ${name}`);
    } catch (error) {
        results.push(false);
        console.error(`FAIL ${name}\n${error.stack}`);
    }
}
function status(response, expected) {
    assert.equal(response.status, expected, `${response.status}: ${response.text?.slice(0, 500)}`);
}
function denied(response) {
    assert(response.status >= 400 && response.status < 500, `${response.status}: ${response.text?.slice(0, 500)}`);
}
function fixtureImage(color) {
    // A transparent, colored medallion is sufficient for real image-delivery checks.
    const image = new PNG({ width: 480, height: 320 });
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            const distance = Math.hypot(x - 240, y - 160);
            const offset = (y * image.width + x) * 4;
            if (distance > 125) continue;
            const light = distance > 111 ? 0.68 : 1 - distance / 400;
            image.data[offset] = Math.round(color[0] * light);
            image.data[offset + 1] = Math.round(color[1] * light);
            image.data[offset + 2] = Math.round(color[2] * light);
            image.data[offset + 3] = 255;
        }
    }
    return PNG.sync.write(image);
}
function fixtureSound(frequency) {
    const sampleRate = 8000;
    const samples = sampleRate * 0.6;
    const sound = Buffer.alloc(44 + samples * 2);
    sound.write('RIFF', 0);
    sound.writeUInt32LE(sound.length - 8, 4);
    sound.write('WAVEfmt ', 8);
    sound.writeUInt32LE(16, 16);
    sound.writeUInt16LE(1, 20);
    sound.writeUInt16LE(1, 22);
    sound.writeUInt32LE(sampleRate, 24);
    sound.writeUInt32LE(sampleRate * 2, 28);
    sound.writeUInt16LE(2, 32);
    sound.writeUInt16LE(16, 34);
    sound.write('data', 36);
    sound.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) {
        const amplitude = 5000 * Math.min(i / 100, 1) * (1 - i / samples);
        sound.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * frequency / sampleRate) * amplitude), 44 + i * 2);
    }
    return sound;
}

async function run() {
    const { UserModel: users, DomainModel: domains, httpServer } = require('hydrooj');
    const db = require('../packages/hydrooj/src/service/db').default;
    const storage = require('../packages/hydrooj/src/model/storage').default;
    const adminId = await users.create('badge-teacher@example.test', 'badge_teacher', 'LocalTest123!');
    await users.setSuperAdmin(adminId);
    const legacyId = 'badge-legacy';
    const modernId = 'badge-modern';
    const otherDomainId = 'badge-modern-other';
    await domains.add(legacyId, adminId, 'Python 训练', 'Isolated badge gallery fixture');
    await domains.add(modernId, adminId, 'Scratch 创作', 'Isolated badge gallery fixture', 'badge-workspace', 'scratch');
    await domains.add(otherDomainId, adminId, '其他课堂', 'Isolated badge gallery fixture', 'badge-workspace');
    const uid = await users.createInDomain(legacyId, 'badge-student@example.test', 'badge_student', 'LocalTest123!');
    const otherUid = await users.createInDomain(legacyId, 'badge-other@example.test', 'badge_other', 'LocalTest123!');
    const emptyUid = await users.createInDomain(legacyId, 'badge-empty@example.test', 'badge_empty', 'LocalTest123!');
    for (const domainId of [modernId, otherDomainId]) {
        await domains.setUserInDomain(domainId, uid, { join: true, role: 'default' });
    }
    await users.setById(uid, { defaultDomain: legacyId, badgeId: 101, badgeDomainId: null, badgeProfileBackgroundBadgeId: 102 });
    const now = Date.now();
    const expiry = new Date(now + 86400000);
    const extendedExpiry = new Date(now + 3 * 86400000);
    const records = [
        { _id: 101, title: '星光探索者', short: '✦ 星光探索者', color: [94, 146, 255], sound: 660 },
        { _id: 102, title: '最强王者', short: '🏆 最强王者', color: [246, 188, 64], sound: 880 },
        { _id: 103, title: '已到期的徽章', short: '已过期', sound: 440 },
        { _id: 104, title: '另一个学员的徽章', short: '其他学员', owner: otherUid },
        { _id: 105, title: '幸运女神', short: '★ 幸运女神', color: [180, 113, 244] },
        { _id: 106, title: '持之以恒', short: '持之以恒' },
        { _id: 107, title: '进步之星', short: '✧ 进步之星', users: [uid], color: [88, 191, 158] },
        { _id: 201, title: 'Scratch 创意之星', short: '创意之星', domainId: modernId, color: [255, 166, 71] },
        { _id: 202, title: '其他课堂的徽章', short: '其他课堂', domainId: otherDomainId },
    ];
    for (const record of records) {
        const imagePath = record.color ? `badge-fixture/${record._id}.png` : undefined;
        if (imagePath) {
            const customImage = process.env.BADGE_GALLERY_IMAGE_DIR
                && path.join(process.env.BADGE_GALLERY_IMAGE_DIR, `${record._id}.png`);
            await storage.put(imagePath, customImage && fs.existsSync(customImage)
                ? fs.readFileSync(customImage) : fixtureImage(record.color), adminId);
        }
        const soundPath = record.sound ? `badge-fixture/${record._id}.wav` : undefined;
        if (soundPath) await storage.put(soundPath, fixtureSound(record.sound), adminId);
        const scope = record.domainId ? { domainId: record.domainId } : {};
        await db.collection('badge').insertOne({
            _id: record._id, title: record.title, short: record.short, users: record.users || [], ...scope,
            content: '这是隔离的徽章展示测试素材。', backgroundColor: 'eff6ff', fontColor: '2563eb',
            createAt: new Date(now), ...(imagePath ? { acImagePath: imagePath, acImageUpdatedAt: 'fixture-1' } : {}),
            ...(soundPath ? { themeSoundPath: soundPath, themeSoundUpdatedAt: 'fixture-sound-1' } : {}),
        });
        await db.collection('userBadge').insertOne({
            owner: record.owner || uid, badgeId: record._id, getAt: new Date(now - record._id * 1000), ...scope,
        });
    }
    await db.collection('lottery.badgeGrant').insertMany([
        { uid, badgeId: 102, grantedAt: new Date(now - 10000), expiresAt: expiry },
        { uid, badgeId: 103, grantedAt: new Date(now - 10000), expiresAt: new Date(now - 1000) },
        { uid, badgeId: 105, grantedAt: new Date(now - 10000), expiresAt: new Date(now - 1000) },
        { uid, badgeId: 105, grantedAt: new Date(now - 5000), expiresAt: extendedExpiry },
        { uid, badgeId: 107, grantedAt: new Date(now - 10000), expiresAt: new Date(now - 1000) },
    ]);
    const student = supertest.agent(httpServer);
    const other = supertest.agent(httpServer);
    const empty = supertest.agent(httpServer);
    for (const [agent, uname] of [[student, 'badge_student'], [other, 'badge_other'], [empty, 'badge_empty']]) {
        status(await agent.post('/login').send({ uname, password: 'LocalTest123!' }), 302);
    }
    const url = `/d/${legacyId}/mybadge`;
    const get = (route = url, agent = student) => agent.get(route).set('Accept', 'application/json');
    const post = (operation, body = {}, route = url) => student.post(route).set('Accept', 'application/json').send({ operation, ...body });
    const selectedBadge = () => db.collection('user').findOne({ _id: uid }, { projection: { badgeId: 1, badgeDomainId: 1 } });
    let gallery;

    await check('Gallery requires login and always reads the signed-in learners own collection', async () => {
        const guest = await supertest.agent(httpServer).get(url).set('Accept', 'application/json');
        assert(guest.status === 302 || guest.status === 403 || guest.body.url?.includes('/login'));
        const response = await get(`${url}?uid=${otherUid}&owner=${otherUid}`);
        status(response, 200);
        gallery = response.body;
        assert.deepEqual(gallery.badgeCards.map((card) => card.id), [101, 102, 105, 106, 107]);
        const otherResponse = await get(`${url}?uid=${uid}`, other);
        status(otherResponse, 200);
        assert.deepEqual(otherResponse.body.badgeCards.map((card) => card.id), [104]);
        assert.equal(gallery.badgeCollection.currentName, '星光探索者');
        assert.equal(gallery.badgeCards[0].isCurrent, true);
    });
    await check('Permanent, temporary and renewed badges expose the correct lifetime and exclude expired ownership', async () => {
        assert.deepEqual(gallery.badgeCollection, { total: 5, permanent: 3, temporary: 2, currentName: '星光探索者' });
        const cards = new Map(gallery.badgeCards.map((card) => [card.id, card]));
        for (const id of [101, 106, 107]) {
            assert.equal(cards.get(id).expiresAt, null);
            assert.equal(cards.get(id).expiryLabel, '永久');
        }
        assert.equal(cards.get(102).expiresAt, expiry.toISOString());
        assert.equal(cards.get(105).expiresAt, extendedExpiry.toISOString());
        const expectedLabel = new Date(expiry.getTime() + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
        assert.equal(cards.get(102).expiryLabel, expectedLabel, 'Expiry is shown in Beijing time');
        assert.equal(cards.has(103), false, 'An expired grant is hidden even before the cleanup task runs');
    });
    await check('Modern classroom and Scratch views isolate badge ownership from legacy and sibling classrooms', async () => {
        const response = await get(`/d/${modernId}/mybadge`);
        status(response, 200);
        assert.deepEqual(response.body.badgeCards.map((card) => card.id), [201]);
        assert.equal(response.body.badgeCollection.currentName, '');
        assert.equal(response.body.badgeCards[0].detailUrl, `/d/${modernId}/badge/201`);
        const sibling = await get(`/d/${otherDomainId}/mybadge`);
        assert.deepEqual(sibling.body.badgeCards.map((card) => card.id), [202]);
        const page = await student.get(`/d/${modernId}/mybadge`).set('Accept', 'text/html');
        status(page, 200);
        assert(page.text.includes('Scratch 创意之星'));
        assert(!page.text.includes('其他课堂的徽章'));
    });
    await check('Real gallery HTML renders owned AC images, lifetime labels and a safe no-image fallback', async () => {
        const response = await student.get(url).set('Accept', 'text/html');
        status(response, 200);
        const dom = new JSDOM(response.text);
        const doc = dom.window.document;
        for (const card of gallery.badgeCards) {
            assert(response.text.includes(card.title), 'Badge remains identifiable through its title or accessible image label');
            assert(doc.body.textContent.includes(card.expiryLabel));
            if (card.acImage) {
                assert(card.acImage.includes('size=768'));
                assert([...doc.querySelectorAll('img')].some((image) => image.getAttribute('src') === card.acImage));
            }
        }
        assert(!doc.body.textContent.includes('已到期的徽章'));
        assert.equal(doc.querySelector('img[src=""], img[src="undefined"]'), null);
        assert.equal(doc.querySelector('.badge-gallery form'), null, 'Collection only displays artwork and lifetime');
        dom.window.close();
        const image = await student.get(gallery.badgeCards[0].acImage).redirects(3);
        status(image, 200);
        assert.match(image.headers['content-type'], /^image\/png/);
        assert(PNG.sync.read(image.body).width > 0);
    });
    await check('Empty collection renders a deliberate empty state and no invalid badge actions', async () => {
        const json = await get(url, empty);
        status(json, 200);
        assert.deepEqual(json.body.badgeCards, []);
        assert.equal(json.body.badgeCollection.total, 0);
        const response = await empty.get(url).set('Accept', 'text/html');
        status(response, 200);
        const dom = new JSDOM(response.text);
        assert(dom.window.document.body.textContent.includes('我的徽章'));
        assert.equal(dom.window.document.querySelector('button[name="operation"][value="enable"]'), null);
        dom.window.close();
    });
    await check('Wear checks active ownership and classroom scope; reset still clears the selected badge', async () => {
        for (const badgeId of [103, 104, 201, 202, 999999]) denied(await post('enable', { badgeId, uid: otherUid }));
        assert.equal((await selectedBadge()).badgeId, 101);
        status(await post('enable', { badgeId: 102 }), 200);
        assert.equal((await selectedBadge()).badgeId, 102);
        assert.equal((await get()).body.badgeCards[0].id, 102);
        status(await post('reset'), 200);
        assert.equal((await selectedBadge()).badgeId, undefined);
        assert.equal((await get()).body.badgeCollection.currentName, '');
        status(await post('enable', { badgeId: 201 }, `/d/${modernId}/mybadge`), 200);
        assert.equal((await selectedBadge()).badgeDomainId, modernId);
        status(await post('reset', {}, `/d/${modernId}/mybadge`), 200);
        status(await post('enable', { badgeId: 101 }), 200);
    });
    await check('Pagination shows 24 owned badges per page with full collection totals', async () => {
        for (let id = 300; id < 325; id++) {
            await db.collection('badge').insertOne({ _id: id, title: `分页徽章 ${id}`, short: `${id}`, users: [] });
            await db.collection('userBadge').insertOne({ owner: uid, badgeId: id, getAt: new Date(now) });
        }
        try {
            const first = (await get()).body;
            const second = (await get(`${url}?page=2`)).body;
            assert.equal(first.badgeCards.length, 24);
            assert.equal(second.badgeCards.length, 6);
            assert.equal(first.badgeCollection.total, 30);
            assert.equal(first.dpcount, 2);
            assert.equal(new Set([...first.badgeCards, ...second.badgeCards].map((card) => card.id)).size, 30);
            assert.equal((await get(`${url}?page=999`)).body.page, 2);
        } finally {
            await db.collection('badge').deleteMany({ _id: { $gte: 300, $lt: 325 } });
            await db.collection('userBadge').deleteMany({ owner: uid, badgeId: { $gte: 300, $lt: 325 } });
        }
    });
    const profileUrl = `/d/${legacyId}/user/${uid}`;
    await check('A profile exposes its owners selected theme sound, never the visitors badge, and serves the WAV', async () => {
        const ownProfile = await get(profileUrl);
        const visitedProfile = await get(profileUrl, other);
        status(ownProfile, 200);
        status(visitedProfile, 200);
        const sound = ownProfile.body.profileBadgeSound;
        assert.equal(sound.id, 102, 'Selected profile theme wins over legacy worn badge 101');
        assert.equal(sound.name, '🏆 最强王者');
        assert.equal(sound.themeSound, `/d/${legacyId}/badge/102/theme-sound?v=fixture-sound-1`);
        assert.deepEqual(visitedProfile.body.profileBadgeSound, sound, 'Profile owner determines the sound for visitors');
        const html = await other.get(profileUrl).set('Accept', 'text/html');
        status(html, 200);
        const dom = new JSDOM(html.text);
        assert.equal(dom.window.document.querySelector('[data-profile-badge-sound]').getAttribute('data-profile-badge-sound'), sound.themeSound);
        dom.window.close();
        const audio = await other.get(sound.themeSound).redirects(3).buffer(true).parse((response, callback) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => callback(null, Buffer.concat(chunks)));
        });
        status(audio, 200);
        assert.match(audio.headers['content-type'], /^audio\/(?:wav|x-wav|wave)/);
        assert.equal(audio.body.subarray(0, 4).toString(), 'RIFF');
    });
    const chooseTheme = (badgeId, agent = student) => agent.post(`${profileUrl}/badge-background`)
        .set('Accept', 'application/json').send({ badgeId });
    await check('Own profile theme changes update the sound and a selected theme without audio stays silent', async () => {
        try {
            denied(await chooseTheme(101, other));
            assert.equal((await get(profileUrl)).body.profileBadgeSound.id, 102, 'Visitors cannot change the profile theme');
            status(await chooseTheme(101), 200);
            const changed = (await get(profileUrl)).body.profileBadgeSound;
            assert.equal(changed.id, 101);
            assert.equal(changed.themeSound, `/d/${legacyId}/badge/101/theme-sound?v=fixture-sound-1`);
            status(await chooseTheme(105), 200);
            assert.equal((await get(profileUrl)).body.profileBadgeSound, null);
            status(await post('reset'), 200);
            assert.equal((await get(profileUrl)).body.profileBadgeSound, null);
        } finally {
            status(await chooseTheme(102), 200);
            status(await post('enable', { badgeId: 101 }), 200);
        }
    });
    await check('Expired, foreign classroom and soundless profile badges do not render a playback source or button', async () => {
        try {
            status(await post('reset'), 200);
            await users.setById(uid, { badgeProfileBackgroundBadgeId: 103 });
            assert.equal((await get(profileUrl)).body.profileBadgeSound, null, 'Expired sound remains unavailable before cleanup');
            for (const route of [profileUrl, `/d/${modernId}/user/${uid}`, `/d/${legacyId}/user/${otherUid}`, `/d/${legacyId}/user/${emptyUid}`]) {
                const json = await get(route);
                status(json, 200);
                assert.equal(json.body.profileBadgeSound, null);
                const response = await student.get(route).set('Accept', 'text/html');
                status(response, 200);
                const dom = new JSDOM(response.text);
                assert.equal(dom.window.document.querySelector('[data-profile-badge-sound]'), null);
                dom.window.close();
            }
        } finally {
            await users.setById(uid, { badgeProfileBackgroundBadgeId: 102 });
            status(await post('enable', { badgeId: 101 }), 200);
        }
    });

    console.log(`RESULT ${results.filter(Boolean).length}/${results.length} badge gallery checks passed`);
    clearTimeout(timeout);
    if (process.env.BADGE_GALLERY_SERVE === '1' && results.every(Boolean)) {
        console.log(`SMOKE ${JSON.stringify({
            origin: `http://localhost:${port}`, username: 'badge_student', emptyUsername: 'badge_empty', password: 'LocalTest123!',
            uid, emptyUid, legacyId, modernId, galleryUrl: `http://localhost:${port}${url}`,
            scratchGalleryUrl: `http://localhost:${port}/d/${modernId}/mybadge`, profileUrl: `http://localhost:${port}${profileUrl}`,
        })}`);
        return;
    }
    process.exit(results.every(Boolean) ? 0 : 1);
}
let started = false;
process.send = (message) => {
    if (message === 'ready' && !started) {
        started = true;
        run().catch((error) => {
            console.error(error.stack);
            process.exit(1);
        });
    }
    return true;
};
require('hydrooj/bin/hydrooj');
