/* eslint-disable no-await-in-loop */
// Real HTTP handlers and Mongo atomic updates; isolated ephemeral database only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const supertest = require('supertest');
process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(os.homedir(), '.cache/mongodb-binaries');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-daily-quiz-'));
os.homedir = () => home;
fs.mkdirSync(path.join(home, '.hydro'));
fs.writeFileSync(path.join(home, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
process.argv.push('--port', '18895', '--host', '127.0.0.1');
const timer = setTimeout(() => process.exit(2), 120000);
const results = [];
async function check(name, fn) {
    try { await fn(); results.push(true); console.log(`PASS ${name}`); }
    catch (e) { results.push(false); console.error(`FAIL ${name}\n${e.stack}`); }
}
function status(res, code) { assert.equal(res.status, code, res.text?.slice(0, 800)); }
async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, httpServer, PERM } = require('hydrooj');
    const quiz = require('../packages/hydrooj/src/model/daily_quiz');
    const lib = require('../packages/hydrooj/src/lib/daily_quiz');
    const workspace = require('../packages/hydrooj/src/model/workspace').default;
    const storage = require('../packages/hydrooj/src/model/storage').default;
    const point = require('../packages/hydrooj/src/lib/point_lottery');
    const db = require('../packages/hydrooj/src/service/db').default;
    const admin = await users.create('dq-admin@test.example', 'dq_admin', 'DailyTest123!');
    await users.setSuperAdmin(admin);
    const uid = await users.create('dq-student@test.example', 'dq_student', 'DailyTest123!');
    const otherUid = await users.create('dq-other@test.example', 'dq_other', 'DailyTest123!');
    const dids = ['daily-a', 'daily-b'];
    for (const did of dids) {
        await domains.add(did, admin, did, 'Daily test');
        await domains.addRole(did, 'student', PERM.PERM_DEFAULT);
        await domains.setUserRole(did, uid, 'student', true);
        await domains.setUserRole(did, otherUid, 'student', true);
    }
    const source = (kind, stem, answers) => ({ version: 1, kind, stem, answers, options: ['First', 'Second', 'Third'], analysis: 'PRIVATE ANALYSIS' });
    const ids = [];
    for (const did of dids) {
        const objective = source(did === dids[0] ? 'single' : 'multiple', 'A question ![stem](file://image.png)', did === dids[0] ? ['A'] : ['A', 'C']);
        objective.analysis += ' ![analysis](file://analysis.png)';
        ids.push(await problems.add(did, 'DQ1', 'Daily source', '', admin, ['循环'], { hidden: true, objectiveKind: objective.kind, objective }));
        await storage.put(`problem/${did}/${ids.at(-1)}/additional_file/image.png`, Buffer.from('fakepng'), admin);
        await storage.put(`problem/${did}/${ids.at(-1)}/additional_file/analysis.png`, Buffer.from('secretimage'), admin);
        await problems.add(did, 'DQJUDGE', 'Excluded judge', '', admin, ['循环'], { hidden: true, objectiveKind: 'judge', objective: { ...source('judge', 'Judge', ['A']), options: ['正确', '错误'] } });
    }
    assert.equal(ids[0], ids[1]);
    const policy = lib.parsePolicy({ version: 1, enabled: true, cooldownRounds: 3, domains: dids.map((did, index) => ({ domainId: did, enabled: true, count: 1, tags: ['循环'], points: [index ? 7 : 5] })) }, dids);
    const student = supertest.agent(httpServer);
    const other = supertest.agent(httpServer);
    status(await student.post('/login').send({ uname: 'dq_student', password: 'DailyTest123!' }), 302);
    status(await other.post('/login').send({ uname: 'dq_other', password: 'DailyTest123!' }), 302);
    const get = (agent = student) => agent.get('/daily-quiz/status').set('Accept', 'application/json');
    const post = (operation, body, agent = student) => agent.post('/daily-quiz').set('Accept', 'application/json').send({ operation, ...body });
    let state;
    await check('Disabled by default; configuration strictly validates domains, limits and rewards', async () => {
        assert.equal((await quiz.getPolicy(uid)).enabled, false);
        assert.throws(() => lib.parsePolicy({ ...policy, domains: [{ ...policy.domains[0], domainId: 'foreign' }] }, dids));
        assert.throws(() => lib.parsePolicy({ ...policy, domains: [{ ...policy.domains[0], points: [-1] }] }, dids));
        assert.throws(() => lib.parsePolicy({ ...policy, domains: [policy.domains[0], policy.domains[0]] }, dids));
        assert.throws(() => lib.parsePolicy({ ...policy, domains: [{ ...policy.domains[0], count: 21 }] }, dids));
        assert.equal(lib.beijingDay(new Date('2026-10-07T16:00:00Z')), '2026-10-08');
        assert.equal(lib.safeReturnUrl('//evil.example'), '/');
        assert.equal(lib.canRepeat({ lastRound: 1, lastDay: '2020-01-01' }, 2, 3), false);
        assert.equal(lib.safeReturnUrl('/daily-quiz?return=/'), '/');
        await quiz.savePolicy(uid, policy, admin);
    });
    await check('Concurrent daily entry creates one combined immutable session with no answer leakage', async () => {
        const responses = await Promise.all([get(), get(), get()]);
        for (const res of responses) status(res, 200);
        state = responses[0].body.state;
        assert.equal(state.total, 2);
        assert.equal(state.current.id, 1);
        assert.equal(state.required, true);
        assert(!JSON.stringify(responses[0].body).includes('PRIVATE ANALYSIS'));
        assert.equal(state.current.answers, undefined);
        assert.equal(state.current.feedback, undefined);
        assert.equal(await quiz.sessionColl.countDocuments({ uid }), 1);
        assert(responses.every((res) => res.body.state.sessionId === state.sessionId));
    });
    await check('Persistent login HTML and JSON entry gates cannot be bypassed by changing domains', async () => {
        for (const did of dids) {
            const html = await student.get(`/d/${did}/p`).set('Accept', 'text/html');
            status(html, 302);
            assert(html.headers.location.startsWith('/daily-quiz?return='));
            const json = await student.get(`/d/${did}/p`).set('Accept', 'application/json');
            status(json, 403);
            assert.equal(json.body.error, 'daily_quiz_required');
        }
        status(await student.get('/daily-quiz').set('Accept', 'text/html'), 200);
        for (const url of ['/resource/test/entry.js', '/lazy/test/lang-zh.js']) {
            const asset = await student.get(url);
            status(asset, 200);
            assert(!asset.headers.location);
        }
        status(await student.post('/service-worker-config'), 204);
        const api = await student.get(`/d/${dids[0]}/api/problems`).set('Accept', 'application/json');
        status(api, 403);
    });
    await check('Session media is copied and restricted to owner/current question/visible statement', async () => {
        const img = state.current.stem.match(/\]\(([^)]+)\)/)[1];
        status(await student.get(img), 200);
        status(await other.get(img), 404);
        status(await student.get(img.replace('image.png', 'analysis.png')), 404);
        status(await student.get(img.replace('/file/1/', '/file/2/')), 404);
        status(await student.get(`/d/${dids[0]}/p/${ids[0]}`).set('Accept', 'application/json'), 403);
        await storage.del([`problem/${dids[0]}/${ids[0]}/additional_file/image.png`]);
        status(await student.get(img), 200);
    });
    await check('Cannot skip, spoof another session, or submit invalid answers', async () => {
        const args = { sessionId: state.sessionId, questionId: 1 };
        status(await post('next', args), 403);
        status(await post('answer', { ...args, questionId: 2, answers: ['A'] }), 403);
        status(await post('answer', { ...args, answers: ['A', 'A'] }), 403);
        status(await post('answer', { ...args, answers: ['A'] }, other), 403);
    });
    await check('First answer wins; concurrent retries award the exact amount once and preserve feedback', async () => {
        const args = { sessionId: state.sessionId, questionId: 1, answers: ['A'] };
        const responses = await Promise.all([post('answer', args), post('answer', args), post('answer', args)]);
        responses.forEach((res) => status(res, 200));
        state = (await get()).body.state;
        assert.equal(state.current.feedback.correct, true);
        assert.deepEqual(state.current.feedback.selectedAnswers, ['A']);
        assert.equal(state.earnedPoints, 5);
        status(await post('answer', { ...args, answers: ['B'] }), 200);
        const balance = await point.pointLotteryUserColl.findOne({ _id: uid });
        assert.equal(balance.lotteryPoints, 5);
        assert.equal(balance.lotteryTotalPoints, 5);
        const img = state.current.feedback.analysis.match(/\]\(([^)]+)\)/)[1];
        status(await student.get(img), 200);
    });
    await check('Next is idempotent and multi-select grades an exact set; completion releases entry', async () => {
        const args = { sessionId: state.sessionId, questionId: 1 };
        const responses = await Promise.all([post('next', args), post('next', args)]);
        responses.forEach((res) => status(res, 200));
        state = (await get()).body.state;
        assert.equal(state.current.id, 2);
        assert.equal(state.current.domainId, dids[1]);
        assert.equal(state.current.feedback, undefined);
        const res = await post('answer', { sessionId: state.sessionId, questionId: 2, answers: ['A'] });
        status(res, 200);
        state = res.body.state;
        assert.equal(state.completed, true);
        assert.equal(state.required, false);
        assert.equal(state.current.feedback.correct, false);
        assert.deepEqual(state.current.feedback.answers, ['A', 'C']);
        status(await student.get(`/d/${dids[0]}/p`).set('Accept', 'application/json'), 200);
        const summary = await quiz.getAdminSummary(uid);
        assert.equal(summary.correctCount, 1);
        assert.equal(summary.wrongCount, 1);
        assert.equal(summary.masteredCount, 1);
        assert.equal(summary.recentMistakes.length, 1);
        status(await student.get(`/d/${dids[0]}/p/${ids[0]}`).set('Accept', 'application/json'), 403);
        assert.equal((await quiz.getAdminDay(uid)).items.length, 2);
    });
    await check('Correct sources stay mastered, wrong sources cool down through empty rounds and return later', async () => {
        const now = new Date();
        for (let d = 1; d <= 4; d++) {
            if (d === 4) {
                for (let i = 0; i < 12; i++) {
                    const objective = source('single', `Fresh question ${i}`, ['A']);
                    await problems.add(dids[1], `NEW${i}`, 'New source', '', admin, ['循环'], {
                        hidden: true, objectiveKind: 'single', objective,
                    });
                }
            }
            const future = new Date(now.getTime() + d * 86400000);
            const result = await quiz.getSession(uid, future);
            const view = quiz.presentSession(result.policy, result.session, future);
            assert.equal(view.total, d < 4 ? 0 : 1);
            assert.equal(view.required, d === 4);
            if (d === 4) {
                assert.equal(view.current.domainId, dids[1]);
                assert.equal(view.current.title, 'Daily source', 'Overdue mistakes precede new questions');
            }
        }
    });
    await check('Revoked memberships and modern workspace reassignment cannot reveal existing snapshots', async () => {
        await quiz.savePolicy(otherUid, policy, admin);
        for (const did of dids) {
            await domains.addRole(did, 'no_problem', PERM.PERM_VIEW);
            await domains.setUserRole(did, otherUid, 'no_problem');
        }
        assert.equal((await get(other)).body.state.total, 0, 'Membership alone does not override problem viewing permission');
        for (const did of dids) await domains.setUserRole(did, otherUid, 'student');
        const before = (await get(other)).body.state;
        assert.equal(before.total, 1); // first source now has a missing required asset
        await domains.setJoin(dids[1], otherUid, false);
        const after = (await get(other)).body.state;
        assert.equal(after.total, 0);
        assert.equal(after.required, false);
        await domains.setUserRole(dids[1], otherUid, 'student', true);
        await workspace.create('daily-modern', 'Modern', admin);
        await workspace.addStudent('daily-modern', otherUid, admin);
        assert.equal((await get(other)).body.state.enabled, false);
    });
    await check('Reward reconciliation repairs interrupted settlement without double credit', async () => {
        const session = await quiz.sessionColl.findOne({ _id: `${uid}-${lib.beijingDay()}` });
        session.items[1].answer.correct = true;
        session.items[1].answer.earnedPoints = 7;
        delete session.settledAnswers;
        await quiz.sessionColl.replaceOne({ _id: session._id }, session);
        await Promise.all([quiz.settleSession(session), quiz.settleSession(session)]);
        const balance = await point.pointLotteryUserColl.findOne({ _id: uid });
        assert.equal(balance.lotteryPoints, 12);
        assert.equal(balance.lotteryTotalPoints, 12);
    });
    clearTimeout(timer);
    console.log(`Daily quiz integration: ${results.filter(Boolean).length}/${results.length} passed`);
    process.exit(results.every(Boolean) ? 0 : 1);
}
let started = false;
process.send = (message) => {
    if (message === 'ready' && !started) { started = true; run().catch((e) => { console.error(e.stack); process.exit(1); }); }
    return true;
};
require('hydrooj/bin/hydrooj');
