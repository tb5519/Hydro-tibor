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
process.argv.push('--port', process.env.DAILY_QUIZ_PORT || '18895', '--host', '127.0.0.1');
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
        await problems.add(did, 'DQJUDGE', 'Judgment outside selected tags', '', admin, ['判断题'],
            { hidden: true, objectiveKind: 'judge', objective: { ...source('judge', 'Judge', ['A']), options: ['正确', '错误'] } });
    }
    assert.equal(ids[0], ids[1]);
    const policy = lib.parsePolicy({ version: 1, enabled: true, cooldownRounds: 3, domains: dids.map((did, index) => ({ domainId: did, enabled: true, count: 1, tags: ['循环'], points: [index ? 7 : 5] })) }, dids);
    const student = supertest.agent(httpServer);
    const other = supertest.agent(httpServer);
    status(await student.post('/login').send({ uname: 'dq_student', password: 'DailyTest123!' }), 302);
    status(await other.post('/login').send({ uname: 'dq_other', password: 'DailyTest123!' }), 302);
    const get = (agent = student) => agent.get('/daily-quiz/status').set('Accept', 'application/json');
    const post = (operation, body, agent = student) => agent.post('/daily-quiz').set('Accept', 'application/json').send({ operation, ...body });
    const teacherPreview = supertest.agent(httpServer);
    const quizSnapshot = async (targetUid) => ({
        config: await quiz.configColl.findOne({ _id: targetUid }),
        sessions: await quiz.sessionColl.find({ uid: targetUid }).sort({ _id: 1 }).toArray(),
        progress: await quiz.progressColl.find({ uid: targetUid }).sort({ _id: 1 }).toArray(),
        points: await point.pointLotteryUserColl.findOne({ _id: targetUid }, {
            projection: { lotteryPoints: 1, lotteryTotalPoints: 1, dailyQuizPointAwards: 1 },
        }),
        assets: await storage.coll.find({ path: /^(?:daily-quiz\/|problem\/daily-[ab]\/)/ }).sort({ _id: 1 }).toArray(),
    });
    const enterTeacherPreview = async (agent, targetUid) => {
        status(await agent.post('/login').send({ uname: 'dq_admin', password: 'DailyTest123!' }), 302);
        const prompt = await agent.get(`/account/${targetUid}`).set('Referer', '/').set('Accept', 'text/html');
        status(prompt, 302);
        assert.equal(prompt.headers.location, '/user/sudo');
        const sudo = await agent.post('/user/sudo').send({ password: 'DailyTest123!' });
        status(sudo, 302);
        assert.equal(sudo.headers.location, `/account/${targetUid}`);
        status(await agent.get(sudo.headers.location).set('Accept', 'text/html'), 302);
    };
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
    await check('Real administrator account switch bypasses HTML and JSON quiz gates without generating a student session', async () => {
        const before = await quizSnapshot(uid);
        await enterTeacherPreview(teacherPreview, uid);
        for (const did of dids) {
            for (const accept of ['text/html', 'application/json']) {
                const response = await teacherPreview.get(`/d/${did}/p`).set('Accept', accept);
                status(response, 200);
                assert(!response.headers.location);
                assert.notEqual(response.body.error, 'daily_quiz_required');
            }
        }
        const response = await get(teacherPreview);
        status(response, 200);
        assert.equal(response.body.state.required, false);
        assert.equal(response.body.state.teacherPreview, true);
        assert.notEqual(response.body.state.completed, true, 'Teacher browsing must not claim that the learner completed the quiz');
        assert.equal(response.headers['cache-control'], 'private, no-store');
        for (const accept of ['text/html', 'application/json']) {
            const page = await teacherPreview.get('/daily-quiz?return=/d/daily-a/p').set('Accept', accept);
            status(page, accept === 'text/html' ? 302 : 200);
            assert.equal(accept === 'text/html' ? page.headers.location : page.body.url, '/d/daily-a/p');
        }
        const unsafe = await teacherPreview.get('/daily-quiz?return=//evil.example').set('Accept', 'text/html');
        status(unsafe, 302);
        assert.equal(unsafe.headers.location, '/');
        assert.deepEqual(await quizSnapshot(uid), before, 'Teacher preview must leave policies, sessions, progress, points and attachments untouched');
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
    await check('Teacher preview cannot answer, advance or read an existing learner quiz while the real learner still sees it', async () => {
        const before = await quizSnapshot(uid);
        const args = { sessionId: state.sessionId, questionId: 1 };
        status(await post('answer', { ...args, answers: ['A'] }, teacherPreview), 403);
        status(await post('next', args, teacherPreview), 403);
        const image = state.current.stem.match(/\]\(([^)]+)\)/)[1];
        status(await teacherPreview.get(image), 403);
        assert.equal((await get(teacherPreview)).body.state.teacherPreview, true);
        assert.deepEqual(await quizSnapshot(uid), before);
        const learner = await get();
        status(learner, 200);
        assert.equal(learner.body.state.required, true);
        assert.equal(learner.body.state.sessionId, state.sessionId);
        assert.equal(learner.body.state.answered, 0);
        assert.equal(learner.body.state.current.id, 1);
        assert.equal(learner.body.state.teacherPreview, undefined);
    });
    await check('A genuine student login clears teacher preview and forged request flags cannot bypass the quiz', async () => {
        status(await teacherPreview.post('/login').send({ uname: 'dq_student', password: 'DailyTest123!' }), 302);
        const response = await get(teacherPreview);
        status(response, 200);
        assert.equal(response.body.state.required, true);
        assert.equal(response.body.state.sessionId, state.sessionId);
        assert.equal(response.body.state.teacherPreview, undefined);
        const html = await teacherPreview.get(`/d/${dids[0]}/p`).set('Accept', 'text/html');
        status(html, 302);
        assert(html.headers.location.startsWith('/daily-quiz?return='));
        const query = await teacherPreview.get(`/d/${dids[0]}/p?sudoUid=${admin}&teacherPreview=true&skipDailyQuiz=true`)
            .set('Accept', 'application/json');
        status(query, 403);
        assert.equal(query.body.error, 'daily_quiz_required');
        const body = await teacherPreview.post('/home/profile').set('Accept', 'application/json')
            .send({ bio: 'Must not be saved through forged preview flags', gender: 0, sudoUid: admin, teacherPreview: true, skipDailyQuiz: true });
        status(body, 403);
        assert.equal(body.body.error, 'daily_quiz_required');
        assert.equal((await get(teacherPreview)).body.state.answered, 0);
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
    let judgeUid;
    let judgeState;
    let judgeAgent;
    const judgeDomains = ['daily-judge-scratch', 'daily-judge-oj'];
    await check('Judge-only tags select real questions in Scratch and OJ without exposing answers or teaching notes', async () => {
        judgeUid = await users.create('dq-judge@test.example', 'dq_judge', 'DailyTest123!');
        for (const [index, did] of judgeDomains.entries()) {
            await domains.add(did, admin, index ? '判断题训练' : 'Scratch 判断课堂', '', undefined, index ? 'oj' : 'scratch');
            await domains.addRole(did, 'learner', index ? PERM.PERM_DEFAULT : PERM.PERM_VIEW);
            await domains.setUserRole(did, judgeUid, 'learner', true);
            await problems.add(did, 'JUDGEONLY', index ? '循环可以重复执行' : '等待积木会让角色移动', '', admin, ['判断题独有标签'], {
                hidden: true, objectiveKind: 'judge', objective: {
                    ...source('judge', index ? '循环可以重复执行一段程序。' : '等待积木会让角色向前移动。', [index ? 'A' : 'B']),
                    options: ['正确', '错误'], analysis: 'PRIVATE JUDGMENT ANALYSIS',
                },
            });
        }
        await quiz.savePolicy(judgeUid, {
            version: 1, enabled: true, cooldownRounds: 3,
            domains: judgeDomains.map((did, index) => ({ domainId: did, enabled: true, count: 1, tags: ['判断题独有标签'], points: [index ? 4 : 6] })),
        }, admin);
        judgeAgent = supertest.agent(httpServer);
        status(await judgeAgent.post('/login').send({ uname: 'dq_judge', password: 'DailyTest123!' }), 302);
        const response = await get(judgeAgent);
        status(response, 200);
        judgeState = response.body.state;
        assert.equal(judgeState.total, 2);
        assert.equal(judgeState.current.kind, 'judge');
        assert.equal(judgeState.current.domainId, judgeDomains[0]);
        assert.deepEqual(judgeState.current.options, ['正确', '错误']);
        assert.equal(judgeState.current.answers, undefined);
        assert.equal(judgeState.current.feedback, undefined);
        assert(!response.text.includes('PRIVATE JUDGMENT ANALYSIS'));
        const snapshot = await quiz.sessionColl.findOne({ _id: judgeState.sessionId });
        assert(snapshot.items.every((item) => item.objective.kind === 'judge'));
    });
    await check('Judgments accept exactly one boolean option and award configured points once for a correct answer', async () => {
        const args = { sessionId: judgeState.sessionId, questionId: judgeState.current.id };
        for (const answers of [[], ['A', 'B'], ['A', 'A'], ['C']]) {
            status(await post('answer', { ...args, answers }, judgeAgent), 403);
        }
        assert.equal((await get(judgeAgent)).body.state.answered, 0);
        const wrong = await post('answer', { ...args, answers: ['A'] }, judgeAgent);
        status(wrong, 200);
        assert.equal(wrong.body.state.current.feedback.correct, false);
        assert.deepEqual(wrong.body.state.current.feedback.answers, ['B']);
        assert.equal(wrong.body.state.earnedPoints, 0);
        assert.equal(wrong.body.state.current.feedback.analysis, 'PRIVATE JUDGMENT ANALYSIS');
        status(await post('next', args, judgeAgent), 200);
        judgeState = (await get(judgeAgent)).body.state;
        assert.equal(judgeState.current.domainId, judgeDomains[1]);
        assert.equal(judgeState.current.kind, 'judge');
        assert.equal(judgeState.current.feedback, undefined);
        const correctArgs = { sessionId: judgeState.sessionId, questionId: judgeState.current.id, answers: ['A'] };
        const attempts = await Promise.all([post('answer', correctArgs, judgeAgent), post('answer', correctArgs, judgeAgent)]);
        attempts.forEach((response) => status(response, 200));
        assert.equal(attempts[0].body.state.current.feedback.correct, true);
        assert.equal(attempts[0].body.state.earnedPoints, 4);
        const balance = await point.pointLotteryUserColl.findOne({ _id: judgeUid });
        assert.equal(balance.lotteryPoints, 4);
        assert.equal(balance.lotteryTotalPoints, 4);
        const report = await quiz.getAdminDay(judgeUid);
        assert.deepEqual(report.items.map((item) => item.kind), ['judge', 'judge']);
        assert.deepEqual(report.items.map((item) => item.correct), [false, true]);
    });
    await check('Wrong judgments return only after the configured review rounds; mastering them retires them permanently', async () => {
        const now = new Date();
        for (let day = 1; day <= 4; day++) {
            const future = new Date(now.getTime() + day * 86400000);
            const result = await quiz.getSession(judgeUid, future);
            const view = quiz.presentSession(result.policy, result.session, future);
            assert.equal(view.total, day < 4 ? 0 : 1);
            if (day === 4) {
                assert.equal(view.current.kind, 'judge');
                assert.equal(view.current.domainId, judgeDomains[0]);
                assert.equal(view.current.feedback, undefined);
                const correct = await quiz.answerQuestion(judgeUid, view.sessionId, view.current.id, ['B'], future);
                assert.equal(quiz.presentSession(correct.policy, correct.session, future).earnedPoints, 6);
                const retry = await quiz.answerQuestion(judgeUid, view.sessionId, view.current.id, ['A'], future);
                assert.equal(quiz.presentSession(retry.policy, retry.session, future).current.feedback.correct, true);
            }
        }
        for (const days of [5, 8, 40]) {
            const future = new Date(now.getTime() + days * 86400000);
            const result = await quiz.getSession(judgeUid, future);
            assert.equal(quiz.presentSession(result.policy, result.session, future).total, 0);
        }
        const balance = await point.pointLotteryUserColl.findOne({ _id: judgeUid });
        assert.equal(balance.lotteryPoints, 10);
        assert.equal(balance.lotteryTotalPoints, 10);
        assert.equal((await quiz.getAdminSummary(judgeUid)).masteredCount, 2);
    });
    await check('Teacher browsing cannot reconcile a pending answer or award points; the genuine learner still reconciles normally', async () => {
        const pendingUid = await users.create('dq-pending@test.example', 'dq_pending', 'DailyTest123!');
        for (const did of dids) await domains.setUserRole(did, pendingUid, 'student', true);
        const objective = source('single', 'Unsettled preview question ![stem](file://image.png)', ['A']);
        const sourceId = await problems.add(dids[1], 'PENDING', 'Pending settlement fixture', '', admin, ['preview-regression'], {
            hidden: true, objectiveKind: 'single', objective,
        });
        await storage.put(`problem/${dids[1]}/${sourceId}/additional_file/image.png`, Buffer.from('fakepng'), admin);
        await quiz.savePolicy(pendingUid, {
            ...policy, domains: [{ domainId: dids[1], enabled: true, count: 1, tags: ['preview-regression'], points: [7] }],
        }, admin);
        const pendingLearner = supertest.agent(httpServer);
        status(await pendingLearner.post('/login').send({ uname: 'dq_pending', password: 'DailyTest123!' }), 302);
        const initial = await get(pendingLearner);
        status(initial, 200);
        const snapshot = await quiz.sessionColl.findOne({ _id: initial.body.state.sessionId });
        assert(snapshot.items.length > 0);
        const current = snapshot.items[snapshot.cursor];
        current.answer = {
            selected: current.objective.answers, correct: true, earnedPoints: current.points, answeredAt: new Date(),
        };
        snapshot.settledAnswers = 0;
        await quiz.sessionColl.replaceOne({ _id: snapshot._id }, snapshot);
        const preview = supertest.agent(httpServer);
        await enterTeacherPreview(preview, pendingUid);
        const before = await quizSnapshot(pendingUid);
        status(await preview.get(`/d/${dids[1]}/p`).set('Accept', 'text/html'), 200);
        status(await preview.get(`/d/${dids[1]}/p`).set('Accept', 'application/json'), 200);
        assert.equal((await get(preview)).body.state.teacherPreview, true);
        const page = await preview.get('/daily-quiz?return=/d/daily-b/p').set('Accept', 'text/html');
        status(page, 302);
        assert.equal(page.headers.location, '/d/daily-b/p');
        const args = { sessionId: snapshot._id, questionId: current.id };
        status(await post('answer', { ...args, answers: current.objective.answers }, preview), 403);
        status(await post('next', args, preview), 403);
        const image = initial.body.state.current.stem.match(/\]\(([^)]+)\)/)[1];
        status(await preview.get(image), 403);
        assert.deepEqual(await quizSnapshot(pendingUid), before);
        const genuine = await get(pendingLearner);
        status(genuine, 200);
        assert.equal(genuine.body.state.teacherPreview, undefined);
        assert.equal(genuine.body.state.current.feedback.correct, true);
        assert.equal(genuine.body.state.earnedPoints, current.points);
        const balance = await point.pointLotteryUserColl.findOne({ _id: pendingUid });
        assert.equal(balance.lotteryPoints, current.points);
        assert.equal(balance.lotteryTotalPoints, current.points);
        assert.equal(await quiz.progressColl.countDocuments({ uid: pendingUid, mastered: true }), 1);
    });
    clearTimeout(timer);
    console.log(`Daily quiz integration: ${results.filter(Boolean).length}/${results.length} passed`);
    if (process.env.DAILY_QUIZ_SERVE === '1' && results.every(Boolean)) {
        const previewUid = await users.create('dq-ui-preview@test.example', 'dq_ui_preview', 'DailyTest123!');
        for (const did of dids) await domains.setUserRole(did, previewUid, 'student', true);
        await quiz.savePolicy(previewUid, policy, admin);
        console.log(`SMOKE ${JSON.stringify({
            origin: `http://localhost:${process.env.DAILY_QUIZ_PORT || '18895'}`, username: 'dq_admin', password: 'DailyTest123!',
            studentUsername: 'dq_ui_preview', studentUid: previewUid, switchUrl: `/account/${previewUid}`,
            studentPage: '/d/daily-b/p',
        })}`);
        return;
    }
    process.exit(results.every(Boolean) ? 0 : 1);
}
let started = false;
process.send = (message) => {
    if (message === 'ready' && !started) { started = true; run().catch((e) => { console.error(e.stack); process.exit(1); }); }
    return true;
};
require('hydrooj/bin/hydrooj');
