/* eslint-disable no-await-in-loop -- Ordered isolated HTTP scenarios verify publication and acknowledgement revisions. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const supertest = require('supertest');

// Ephemeral MongoDB and local storage; never use the developer or production database.
process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(os.homedir(), '.cache/mongodb-binaries');
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-opening-message-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.OPENING_MESSAGE_PORT || '18898';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => { console.error('Opening message integration timed out'); process.exit(2); }, 150000);
const results = [];
async function check(name, fn) {
    try { await fn(); results.push(true); console.log(`PASS ${name}`); }
    catch (error) { results.push(false); console.error(`FAIL ${name}\n${error.stack}`); }
}
function status(response, expected) {
    assert.equal(response.status, expected, `${response.status}: ${response.text?.slice(0, 800)}`);
}
function denied(response) {
    assert((response.status >= 400 && response.status < 500)
        || (response.status === 200 && /^\/(?:login|user\/sudo)(?:[/?]|$)/.test(response.body.url || '')),
    `${response.status}: ${response.text?.slice(0, 800)}`);
}
function notices(response) {
    const match = response.text.match(/var items = JSON\.parse\(('(?:\\.|[^'])*')\);/);
    return match ? JSON.parse(vm.runInNewContext(match[1])) : [];
}
function hasPersonal(response, title) {
    return notices(response).some((item) => item.scope === 'student' && item.title === title);
}

async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, httpServer } = require('hydrooj');
    const messages = require('../packages/hydrooj/src/lib/opening_message');
    const daily = require('../packages/hydrooj/src/model/daily_quiz');
    const broadcast = require('../packages/hydrooj/src/lib/broadcast');
    const workspace = require('../packages/hydrooj/src/model/workspace').default;
    const { pointLotteryUserColl } = require('../packages/hydrooj/src/lib/point_lottery');
    const { objectiveContent, objectiveConfig } = require('../packages/hydrooj/src/lib/objective');
    const password = 'OpeningTest123!';
    const teacherName = 'opening_teacher';
    const teacherId = await users.create('opening-teacher@example.test', teacherName, password);
    await users.setSuperAdmin(teacherId);
    const firstDomain = 'opening-python';
    const secondDomain = 'opening-cpp';
    for (const [id, name] of [[firstDomain, 'Python 训练'], [secondDomain, 'C++ 训练']]) {
        await domains.add(id, teacherId, name, 'Isolated opening message fixture');
    }
    async function student(uname, name) {
        const uid = await users.createInDomain(firstDomain, `${uname}@example.test`, uname, password);
        for (const domainId of [firstDomain, secondDomain]) {
            await domains.setUserInDomain(domainId, uid, { join: true, role: 'default', displayName: name });
        }
        await users.setById(uid, { defaultDomain: firstDomain, lotteryPoints: 10, lotteryTotalPoints: 10 });
        return { uid, uname, name };
    }
    const target = await student('opening_student', '秦济舟');
    const other = await student('opening_other', '周沐辰');
    const gated = await student('opening_daily', '林小禾');
    const draft = await student('opening_draft', '草稿测试');
    const foreign = await student('opening_foreign', '其他工作区学员');
    const foreignWorkspace = await workspace.create('opening-foreign', '其他工作区', teacherId);
    await workspace.addStudent(foreignWorkspace._id, foreign.uid, teacherId);
    const teacher = supertest.agent(httpServer);
    const noSudo = supertest.agent(httpServer);
    const learner = supertest.agent(httpServer);
    const anotherLearner = supertest.agent(httpServer);
    const gatedLearner = supertest.agent(httpServer);
    for (const [agent, uname] of [[teacher, teacherName], [noSudo, teacherName], [learner, target.uname],
        [anotherLearner, other.uname], [gatedLearner, gated.uname]]) {
        status(await agent.post('/login').send({ uname, password }), 302);
    }
    const manage = (agent, uid) => agent.get(`/manage/users?uid=${uid}`).set('Accept', 'application/json');
    const save = (agent, uid, value) => agent.post('/manage/users').set('Accept', 'application/json')
        .send({ operation: 'save_opening_message', uid, ...value });
    const page = (agent = learner, domainId = firstDomain) => agent.get(`/d/${domainId}/`).set('Accept', 'text/html');
    const ack = (agent, revision, extra = {}) => agent.post('/student-message/ack').set('Accept', 'application/json')
        .send({ revision, ...extra });
    const value = { title: '本周学习安排', content: '先完成循环练习，再检查错题。\n\n遇到困难可以在课堂上一起讨论。', enabled: '1', revision: '' };
    let first;
    let second;

    await check('Requires teacher privileges and recent sudo before editing; blank initial data has no invented title', async () => {
        denied(await save(learner, target.uid, value));
        denied(await save(supertest.agent(httpServer), target.uid, value));
        const prompt = await save(noSudo, target.uid, value);
        assert(prompt.status === 302 || prompt.body.url?.includes('/user/sudo'));
        assert.equal(await messages.coll.findOne({ _id: target.uid }), null);
        status(await teacher.get(`/manage/users?uid=${target.uid}`).set('Accept', 'text/html'), 302);
        status(await teacher.post('/user/sudo').send({ password }), 302);
        const initial = await manage(teacher, target.uid);
        status(initial, 200);
        assert.equal(initial.body.selectedOpeningMessage.title, '');
        assert.equal(initial.body.selectedOpeningMessage.content, '');
        assert.equal(initial.body.selectedOpeningMessage.enabled, false);
    });
    await check('Target is restricted to managed students and meaningful enabled title/content', async () => {
        denied(await save(teacher, foreign.uid, value));
        denied(await save(teacher, teacherId, value));
        denied(await save(teacher, 999999, value));
        for (const invalid of [{ title: '' }, { content: '  ' }, { title: 'x'.repeat(101) }, { content: 'x'.repeat(10001) },
            { revision: 'invalid' }, { enabled: 'not-a-boolean' }]) denied(await save(teacher, target.uid, { ...value, ...invalid }));
    });
    await check('Disabled drafts may be empty and can be cleared without notifying the learner', async () => {
        const empty = await save(teacher, draft.uid, { title: '', content: '', enabled: '0', revision: '' });
        status(empty, 200);
        let saved = empty.body.selectedOpeningMessage;
        assert.equal(saved.title, '');
        assert.equal(saved.content, '');
        assert.equal(saved.enabled, false);
        const populated = await save(teacher, draft.uid, { ...value, enabled: '0', revision: saved.revision });
        status(populated, 200);
        saved = populated.body.selectedOpeningMessage;
        const cleared = await save(teacher, draft.uid, { title: '', content: '', enabled: '0', revision: saved.revision });
        status(cleared, 200);
        assert.equal(cleared.body.selectedOpeningMessage.title, '');
        assert.equal(cleared.body.selectedOpeningMessage.content, '');
        assert.equal(cleared.body.selectedOpeningMessage.enabled, false);
        assert.equal(await messages.getUnreadOpeningMessage(await users.getById(firstDomain, draft.uid)), null);
    });
    await check('Publishes a private multiline message and injects it only for its intended learner across domains', async () => {
        const response = await save(teacher, target.uid, value);
        status(response, 200);
        assert.equal(response.body.saved, true);
        first = response.body.selectedOpeningMessage;
        assert.equal(first.title, value.title);
        assert.equal(first.content, value.content);
        assert.match(first.revision, /^[a-f0-9]{32}$/);
        assert.equal(first.acknowledgedAt, null);
        for (const domainId of [firstDomain, secondDomain]) {
            const responsePage = await page(learner, domainId);
            status(responsePage, 200);
            assert(hasPersonal(responsePage, value.title));
            assert.match(responsePage.text, /data-student-broadcast/);
        }
        assert(!hasPersonal(await page(anotherLearner), value.title));
        assert(!hasPersonal(await page(teacher), value.title));
        assert.equal(await messages.collAcknowledgement.countDocuments({ uid: target.uid }), 0, 'Reading must not acknowledge');
    });
    await check('Acknowledgement is server-persisted, idempotent and private; it survives another login and another domain', async () => {
        denied(await ack(teacher, first.revision));
        denied(await ack(supertest.agent(httpServer), first.revision));
        denied(await ack(learner, 'invalid'));
        const responses = await Promise.all([ack(learner, first.revision), ack(learner, first.revision)]);
        responses.forEach((response) => { status(response, 200); assert.equal(response.body.acknowledged, true); });
        assert.equal(await messages.collAcknowledgement.countDocuments({ uid: target.uid, revision: first.revision }), 1);
        assert(!hasPersonal(await page(), value.title));
        assert(!hasPersonal(await page(learner, secondDomain), value.title));
        const newSession = supertest.agent(httpServer);
        status(await newSession.post('/login').send({ uname: target.uname, password }), 302);
        assert(!hasPersonal(await page(newSession), value.title));
        const visible = (await manage(teacher, target.uid)).body.selectedOpeningMessage;
        assert(visible.acknowledgedAt);
        assert.equal((await pointLotteryUserColl.findOne({ _id: target.uid })).lotteryPoints, 10);
    });
    await check('Unchanged saves and disable/re-enable preserve the read revision; edits are a new unread message', async () => {
        for (const enabled of ['1', '0', '1']) {
            const response = await save(teacher, target.uid, { ...value, enabled, revision: first.revision });
            status(response, 200);
            assert.equal(response.body.selectedOpeningMessage.revision, first.revision);
            assert(response.body.selectedOpeningMessage.acknowledgedAt);
            assert(!hasPersonal(await page(), value.title));
        }
        const edited = await save(teacher, target.uid, { ...value, title: '下次课堂准备', revision: first.revision });
        status(edited, 200);
        second = edited.body.selectedOpeningMessage;
        assert.notEqual(second.revision, first.revision);
        assert.equal(second.acknowledgedAt, null);
        assert(hasPersonal(await page(), second.title));
        status(await ack(learner, first.revision), 200);
        assert(hasPersonal(await page(), second.title), 'An old browser tab cannot acknowledge the edited message');
        denied(await save(teacher, target.uid, { ...value, revision: first.revision }));
    });
    await check('Two teacher edits cannot silently overwrite each other', async () => {
        const contenders = await Promise.all(['A', 'B'].map((letter) => save(teacher, target.uid, {
            ...value, title: `老师编辑${letter}`, revision: second.revision,
        })));
        assert.equal(contenders.filter((response) => response.status === 200).length, 1);
        assert.equal(contenders.filter((response) => response.status === 409).length, 1);
    });
    await check('Teacher account inspection cannot display or acknowledge the learner message', async () => {
        const current = (await manage(teacher, target.uid)).body.selectedOpeningMessage;
        const inspection = supertest.agent(httpServer);
        status(await inspection.post('/login').send({ uname: teacherName, password }), 302);
        const prompt = await inspection.get(`/account/${target.uid}`).set('Referer', '/').set('Accept', 'text/html');
        status(prompt, 302);
        assert.equal(prompt.headers.location, '/user/sudo');
        const sudo = await inspection.post('/user/sudo').send({ password });
        status(sudo, 302);
        status(await inspection.get(sudo.headers.location).set('Accept', 'text/html'), 302);
        assert(!hasPersonal(await page(inspection), current.title));
        denied(await ack(inspection, current.revision));
        assert(hasPersonal(await page(), current.title));
        assert.equal((await manage(teacher, target.uid)).body.selectedOpeningMessage.acknowledgedAt, null);
    });
    await check('Personal content is escaped and cannot inject HTML, scripts or a generated popup name', async () => {
        const current = (await manage(teacher, target.uid)).body.selectedOpeningMessage;
        const raw = '第一行 <script>alert(1)</script>\n<img src=x onerror=alert(1)>\n& " < >';
        const escaped = await save(teacher, target.uid, { ...value, title: '<测试标题>', content: raw, revision: current.revision });
        status(escaped, 200);
        assert.equal(escaped.body.selectedOpeningMessage.content, raw);
        const unread = await messages.getUnreadOpeningMessage(await users.getById(firstDomain, target.uid));
        assert(!unread.content.includes('<script>'));
        assert(!unread.content.includes('<img'));
        assert(unread.content.includes('&lt;script&gt;'));
        assert.equal(unread.title, '<测试标题>');
    });
    await check('Personal acknowledgement remains reachable before daily quiz completion without answering or awarding points', async () => {
        const objective = { version: 1, kind: 'single', stem: '2 + 3 的结果是？', options: ['5', '23'], answers: ['A'], analysis: '' };
        await problems.add(firstDomain, 'OPENING_GATE', '每日练习', objectiveContent(objective), teacherId, ['开屏测试'],
            { hidden: true, objectiveKind: 'single', objective, config: objectiveConfig(objective) });
        await daily.savePolicy(gated.uid, { version: 1, enabled: true, cooldownRounds: 3,
            domains: [{ domainId: firstDomain, enabled: true, count: 1, tags: ['开屏测试'], points: [3] }] }, teacherId);
        const published = await save(teacher, gated.uid, { ...value, title: '先读这段安排' });
        status(published, 200);
        const redirect = await page(gatedLearner);
        status(redirect, 302);
        assert(redirect.headers.location.includes('/daily-quiz'));
        const quiz = await gatedLearner.get(redirect.headers.location).set('Accept', 'text/html');
        status(quiz, 200);
        assert(hasPersonal(quiz, '先读这段安排'));
        const snapshot = await daily.sessionColl.findOne({ uid: gated.uid });
        status(await ack(gatedLearner, published.body.selectedOpeningMessage.revision), 200);
        assert.deepEqual(await daily.sessionColl.findOne({ uid: gated.uid }), snapshot);
        assert.equal((await pointLotteryUserColl.findOne({ _id: gated.uid })).lotteryPoints, 10);
        status(await page(gatedLearner), 302);
    });
    await check('A personal message joins existing broadcasts in one queue and disabling it hides only the personal message', async () => {
        const current = (await manage(teacher, target.uid)).body.selectedOpeningMessage;
        const personal = await save(teacher, target.uid, { ...value, title: '个人安排测试', revision: current.revision });
        status(personal, 200);
        const global = await broadcast.publishBroadcast('global', '', teacherId, '全域安排测试', '<p>全域内容</p>', '');
        const combined = await page();
        status(combined, 200);
        assert.equal((combined.text.match(/<dialog class="student-broadcast/g) || []).length, 1);
        assert(hasPersonal(combined, '个人安排测试'));
        assert(notices(combined).some((item) => item.scope === 'global' && item.title === '全域安排测试'));
        status(await save(teacher, target.uid, { ...value, title: '个人安排测试', enabled: '0',
            revision: personal.body.selectedOpeningMessage.revision }), 200);
        const after = await page();
        assert(!hasPersonal(after, '个人安排测试'));
        assert(notices(after).some((item) => item.scope === 'global' && item.title === '全域安排测试'));
        await broadcast.disableBroadcast('global', '', global.revision);
    });

    console.log(`RESULT ${results.filter(Boolean).length}/${results.length} opening message checks passed`);
    clearTimeout(timeout);
    if (process.env.OPENING_MESSAGE_SERVE === '1' && results.every(Boolean)) {
        const demo = await student('opening_demo', '秦济舟');
        await messages.updateOpeningMessage(demo.uid, teacherId, value.title, value.content, '', true);
        console.log(`SMOKE ${JSON.stringify({ origin: `http://localhost:${port}`, teacherName, password, demo,
            teacherUrl: `http://localhost:${port}/manage/users?uid=${demo.uid}&tab=message`,
            learnerUrl: `http://localhost:${port}/d/${firstDomain}/` })}`);
        return;
    }
    process.exit(results.every(Boolean) ? 0 : 1);
}
let started = false;
process.send = (message) => {
    if (message === 'ready' && !started) {
        started = true;
        run().catch((error) => { console.error(error.stack); process.exit(1); });
    }
    return true;
};
require('hydrooj/bin/hydrooj');
