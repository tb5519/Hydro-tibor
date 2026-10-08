/* eslint-disable no-await-in-loop -- Isolated HTTP scenarios mutate shared fixtures in order. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PNG } = require('pngjs');
const { JSDOM } = require('jsdom');
const supertest = require('supertest');

// Always boot a disposable server and in-memory database, never a local account.
process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-profile-editor-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.PROFILE_TEST_PORT || '18896';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => {
    console.error('Profile editor integration timed out');
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
function status(res, expected) {
    assert.equal(res.status, expected, `${res.status}: ${res.text?.slice(0, 500)}`);
}
function denied(res) { assert(res.status >= 400 && res.status < 500, `${res.status}: ${res.text?.slice(0, 300)}`); }

async function run() {
    const { UserModel: users, DomainModel: domains, httpServer } = require('hydrooj');
    const storage = require('../packages/hydrooj/src/model/storage').default;
    const { streamToBuffer } = require('@hydrooj/utils');
    const adminId = await users.create('profile-teacher@example.test', 'profile_teacher', 'LocalTest123!');
    await users.setSuperAdmin(adminId);
    const domainId = `profile-${Date.now()}`;
    const scratchId = `profile-scratch-${Date.now()}`;
    await domains.add(domainId, adminId, 'Python 训练', 'Isolated profile fixture');
    await domains.add(scratchId, adminId, 'Scratch 创作', 'Isolated profile fixture', undefined, 'scratch');
    const studentId = await users.createInDomain(domainId, 'profile-student@example.test', 'profile_student', 'LocalTest123!');
    const otherId = await users.createInDomain(domainId, 'profile-other@example.test', 'profile_other', 'LocalTest123!');
    await domains.setUserInDomain(scratchId, studentId, { join: true, role: 'default' });
    await users.setById(studentId, { defaultDomain: domainId, bio: '我喜欢编程，也喜欢探索新的世界。', gender: 0 });
    await users.setById(otherId, { bio: '另一个人的简介', gender: 2 });
    const admin = supertest.agent(httpServer);
    const student = supertest.agent(httpServer);
    for (const [agent, uname] of [[admin, 'profile_teacher'], [student, 'profile_student']]) {
        status(await agent.post('/login').send({ uname, password: 'LocalTest123!' }), 302);
    }
    const url = `/d/${domainId}/home/profile`;
    const save = (body) => student.post(url).set('Accept', 'application/json').send(body);
    const account = () => users.getById(domainId, studentId);

    await check('The dedicated profile form works in both OJ and Scratch classrooms', async () => {
        for (const id of [domainId, scratchId]) {
            const response = await student.get(`/d/${id}/home/profile`).set('Accept', 'text/html');
            status(response, 200);
            const dom = new JSDOM(response.text);
            const doc = dom.window.document;
            assert(doc.querySelector('[data-profile-editor]'));
            assert.equal(doc.querySelector('[name="gender"]:checked').value, '0');
            assert.equal(doc.querySelector('[name="backgroundImage"]'), null);
            assert.equal(doc.querySelector('[name="qq"]'), null);
            assert(doc.querySelector('a[href*="/home/security"]'), 'Keep the account sidebar');
            dom.window.close();
        }
    });
    await check('Own profile exposes only the edit action while preserving the teacher SU badge', async () => {
        for (const [agent, uid, teacher] of [[student, studentId, false], [admin, adminId, true]]) {
            const response = await agent.get(`/d/${domainId}/user/${uid}`).set('Accept', 'text/html');
            status(response, 200);
            const dom = new JSDOM(response.text);
            const actions = dom.window.document.querySelector('.profile-header__contact-bar');
            assert.equal(actions.querySelectorAll('a').length, 1);
            assert(actions.querySelector('a[href$="/home/profile"]'));
            assert.equal(!!actions.querySelector('.badge--su'), teacher);
            dom.window.close();
        }
    });
    await check('Guests cannot modify an account and forged user IDs cannot target someone else', async () => {
        const guest = await supertest.agent(httpServer).post(url).set('Accept', 'application/json').send({ bio: 'guest', gender: 1 });
        assert(guest.status === 302 || guest.status === 403 || guest.body.url?.includes('/login'));
        const before = await account();
        const response = await save({ bio: '新的简介', gender: 1, uid: otherId, _id: otherId, priv: -1, avatar: 'url:evil', backgroundImage: 'evil' });
        status(response, 200);
        assert.equal(response.body.saved, true);
        const after = await account();
        assert.equal(after.bio, '新的简介');
        assert.equal(after.gender, 1);
        assert.equal(after.priv, before.priv);
        assert.equal(after.avatar, before.avatar);
        assert.equal(after.backgroundImage, before.backgroundImage);
        assert.equal((await users.getById(domainId, otherId)).bio, '另一个人的简介');
    });
    await check('Invalid gender, excessive biography and malformed image are rejected without partial changes', async () => {
        const before = await account();
        for (const gender of [-1, 3, 'not-a-gender']) denied(await save({ bio: '不能保存', gender }));
        denied(await save({ bio: 'x'.repeat(10001), gender: 0 }));
        denied(await student.post(url).set('Accept', 'application/json').field('bio', '不能保存').field('gender', '0')
            .attach('file', Buffer.from('not a png'), 'avatar.png'));
        const after = await account();
        assert.equal(after.bio, before.bio);
        assert.equal(after.gender, before.gender);
        assert.equal(after.avatar, before.avatar);
    });
    await check('A normalized image is uploaded and persisted together with biography and gender', async () => {
        const image = PNG.sync.write({ width: 2, height: 2, data: Buffer.alloc(16, 200) });
        const response = await student.post(url).set('Accept', 'application/json').field('bio', '头像保存成功').field('gender', '2')
            .attach('file', image, 'avatar.png');
        status(response, 200);
        assert.equal(response.body.saved, true);
        assert.match(response.body.avatarUrl, new RegExp(`/file/${studentId}/\\.avatar\\.png\\?v=[a-f0-9]+$`));
        const saved = await account();
        assert.equal(saved.bio, '头像保存成功');
        assert.equal(saved.gender, 2);
        assert.equal(saved.avatar, `url:${response.body.avatarUrl}`);
        const stored = await streamToBuffer(await storage.get(`user/${studentId}/.avatar.png`));
        assert.equal(PNG.sync.read(stored).width, 2);
        const page = await student.get(url).set('Accept', 'text/html');
        assert(page.text.includes(response.body.avatarUrl));
        const served = await student.get(response.body.avatarUrl).redirects(4);
        status(served, 200);
        assert.match(served.headers['content-type'], /^image\/png/);
    });
    await check('An empty biography intentionally clears it without replacing the saved avatar', async () => {
        const avatar = (await account()).avatar;
        status(await save({ bio: '', gender: 0 }), 200);
        assert.equal((await account()).bio, '');
        assert.equal((await account()).gender, 0);
        assert.equal((await account()).avatar, avatar);
    });
    await check('Legacy account settings do not display or accept background-image changes', async () => {
        const settingsUrl = `/d/${domainId}/home/settings/account`;
        const page = await student.get(settingsUrl).set('Accept', 'text/html');
        status(page, 200);
        const dom = new JSDOM(page.text);
        assert.equal(dom.window.document.querySelector('[name="backgroundImage"]'), null);
        dom.window.close();
        const before = (await account()).backgroundImage;
        for (const body of [{ backgroundImage: '/evil.png' }, { booleanKeys: { backgroundImage: true } }]) {
            const response = await student.post(settingsUrl).set('Accept', 'application/json').send(body);
            assert(response.status === 200 || response.status === 302);
            assert.equal((await account()).backgroundImage, before);
        }
    });
    console.log(`RESULT ${results.filter(Boolean).length}/${results.length} profile editor checks passed`);
    clearTimeout(timeout);
    if (process.env.PROFILE_TEST_SERVE === '1' && results.every(Boolean)) {
        await users.setById(studentId, { bio: '我喜欢编程，也喜欢探索新的世界。' });
        console.log(`SMOKE ${JSON.stringify({
            origin: `http://localhost:${port}`, student: 'profile_student', admin: 'profile_teacher', password: 'LocalTest123!',
            studentId, adminId, domainId, scratchId, editUrl: `http://localhost:${port}${url}`,
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
