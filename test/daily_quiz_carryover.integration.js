/* eslint-disable no-await-in-loop -- Real persisted day changes and learner answers are deliberately ordered. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const supertest = require('supertest');

// Isolated ephemeral MongoDB and local storage; never load production credentials.
process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(os.homedir(), '.cache/mongodb-binaries');
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-daily-carryover-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.DAILY_CARRYOVER_PORT || '18899';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => { console.error('Daily quiz carryover integration timed out'); process.exit(2); }, 180000);
const results = [];
async function check(name, fn) {
    try { await fn(); results.push(true); console.log(`PASS ${name}`); }
    catch (error) { results.push(false); console.error(`FAIL ${name}\n${error.stack}`); }
}
function status(response, expected) {
    assert.equal(response.status, expected, `${response.status}: ${response.text?.slice(0, 800)}`);
}
function selection(items) {
    return items.map((item) => [item.id, item.domainId, item.sourceId, item.points]);
}
function unique(items) {
    assert.equal(new Set(items.map((item) => `${item.domainId}:${item.sourceId}`)).size, items.length);
    assert.equal(new Set(items.map((item) => item.id)).size, items.length);
}
function preserved(actual, previous) {
    const snapshot = (item) => ({ ...item, files: Object.keys(item.files).sort() });
    assert.deepEqual(actual.map(snapshot), previous.map(snapshot), 'Only the owned attachment paths may change when snapshots carry over');
}

async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, httpServer } = require('hydrooj');
    const daily = require('../packages/hydrooj/src/model/daily_quiz');
    const { beijingDay } = require('../packages/hydrooj/src/lib/daily_quiz');
    const point = require('../packages/hydrooj/src/lib/point_lottery');
    const storage = require('../packages/hydrooj/src/model/storage').default;
    const { objectiveContent, objectiveConfig } = require('../packages/hydrooj/src/lib/objective');
    const password = 'CarryoverLocal123!';
    const teacherName = 'carryover_teacher';
    const teacherId = await users.create('carryover-teacher@example.test', teacherName, password);
    await users.setSuperAdmin(teacherId);
    const python = 'carryover-python';
    const scratch = 'carryover-scratch';
    for (const [did, name, kind] of [[python, 'Python 练习', 'oj'], [scratch, 'Scratch 创作', 'scratch']]) {
        await domains.add(did, teacherId, name, 'Isolated carryover fixture', undefined, kind);
    }
    const today = beijingDay();
    const day = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const when = (offset, hour = 1) => new Date(`${day(offset)}T${String(hour).padStart(2, '0')}:00:00Z`);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2XkAAAAASUVORK5CYII=', 'base64');
    for (const did of [python, scratch]) {
        for (let index = 0; index < 18; index++) {
            const kind = ['single', 'judge', 'multiple'][index % 3];
            const objective = {
                version: 1, kind, stem: `第 ${index + 1} 道题：当 $N=2$ 时，正确的说法是？\n\n![题目配图](file://trace.png)`,
                options: kind === 'judge' ? ['正确', '错误'] : ['$N+3=5$', '$N+3=23$', '`N += 1`', '没有输出'],
                answers: kind === 'multiple' ? ['A', 'C'] : ['A'],
                analysis: '观察变量和执行顺序即可得到结果。\n\n![解析配图](file://analysis.png)',
            };
            const id = await problems.add(did, `CARRY${index + 1}`, `每日思考 ${index + 1}`, objectiveContent(objective), teacherId,
                ['稳定练习'], { hidden: true, objectiveKind: kind, objective, config: objectiveConfig(objective) });
            await storage.put(`problem/${did}/${id}/additional_file/trace.png`, png, teacherId);
            await storage.put(`problem/${did}/${id}/additional_file/analysis.png`, Buffer.from(`analysis-${did}-${index}`), teacherId);
        }
    }
    let counter = 0;
    const oneDomain = [{ domainId: python, count: 5, points: [2, 3, 5, 7, 11] }];
    const multiDomain = [{ domainId: python, count: 3, points: [2, 3, 5] }, { domainId: scratch, count: 2, points: [7, 11] }];
    async function student(label, rules = oneDomain) {
        const uname = `carryover_student_${++counter}`;
        const uid = await users.createInDomain(rules[0].domainId, `${uname}@example.test`, uname, password);
        for (const rule of rules) await domains.setUserInDomain(rule.domainId, uid, { join: true, role: 'default', displayName: label });
        await users.setById(uid, { defaultDomain: rules[0].domainId, lotteryPoints: 17, lotteryTotalPoints: 29 });
        const policy = { version: 1, enabled: true, cooldownRounds: 3,
            domains: rules.map((rule) => ({ enabled: true, tags: ['稳定练习'], ...rule })) };
        await daily.savePolicy(uid, policy, teacherId);
        return { uid, uname, label, policy };
    }
    const preview = (target, offset = 0, classroom = '') => daily.getAdminUpcoming(target.uid, classroom, when(offset));
    const enter = (target, offset = 0) => daily.getSession(target.uid, when(offset));
    const swap = (target, upcoming, item, offset = 0, classroom = '') => daily.replaceAdminUpcoming(
        target.uid, upcoming.day, item.id, item.domainId, item.sourceId, classroom, when(offset),
    );
    const balance = (target) => point.pointLotteryUserColl.findOne({ _id: target.uid }, {
        projection: { lotteryPoints: 1, lotteryTotalPoints: 1, dailyQuizPointAwards: 1 },
    });
    const effects = async (target) => ({
        sessions: await daily.sessionColl.find({ uid: target.uid }).sort({ _id: 1 }).toArray(),
        progress: await daily.progressColl.find({ uid: target.uid }).sort({ _id: 1 }).toArray(),
        balance: await balance(target),
        storage: await storage.coll.find().sort({ _id: 1 }).toArray(),
    });
    const learning = async (target) => (await daily.getAdminLearningBatch(
        [{ uid: target.uid, domainIds: target.policy.domains.map((rule) => rule.domainId) }],
        [{ id: python, name: 'Python 练习' }, { id: scratch, name: 'Scratch 创作' }],
    )).byUid.get(target.uid);
    async function answerPrefix(target, session, answers, offset) {
        for (const [index, correct] of answers.entries()) {
            const item = session.items[index];
            await daily.answerQuestion(target.uid, session._id, item.id, correct ? item.objective.answers : ['B'], when(offset));
            // Deliberately leave the final wrong-answer explanation unacknowledged.
            if (index + 1 < answers.length || correct) await daily.nextQuestion(target.uid, session._id, item.id, when(offset));
        }
    }
    const teacher = supertest.agent(httpServer);
    status(await teacher.post('/login').send({ uname: teacherName, password }), 302);
    status(await teacher.get('/manage/daily-quiz').set('Accept', 'text/html'), 302);
    status(await teacher.post('/user/sudo').send({ password }), 302);
    const teacherRead = async (target, classroom = '') => {
        const response = await teacher.get(`/manage/daily-quiz/student/${target.uid}?upcoming=1${classroom ? `&classroom=${classroom}` : ''}`)
            .set('Accept', 'application/json');
        status(response, 200);
        assert.equal(response.headers['cache-control'], 'private, no-store');
        return response.body.upcoming;
    };

    await check('An untouched teacher preview retains all five slots through multiple unvisited Beijing days', async () => {
        const target = await student('从未登录的学员');
        const before = await effects(target);
        const first = await preview(target, -12);
        assert.equal(first.items.length, 5);
        unique(first.items);
        for (const offset of [-11, -4, -1, 0]) {
            const next = await preview(target, offset);
            assert.deepEqual(selection(next.items), selection(first.items));
            assert.equal(next.total, 5);
            assert.equal(next.remaining, 5);
        }
        assert.deepEqual(await effects(target), before, 'Preview persistence must not create sessions, progress, points or attachment copies');
        assert.equal((await learning(target)).summary.participationCount, 0);
        assert.deepEqual(selection((await teacherRead(target)).items), selection(first.items));
        assert.deepEqual(selection((await enter(target)).session.items), selection(first.items));
    });

    await check('A teacher random replacement before first login survives an unvisited day and a long absence', async () => {
        const target = await student('老师已调整的待练习');
        const first = await preview(target, -12);
        const before = await effects(target);
        const changed = await swap(target, first, first.items[3], -12);
        assert.notEqual(changed.items[3].sourceId, first.items[3].sourceId);
        assert.notEqual(changed.items[3].id, first.items[3].id);
        assert.deepEqual(selection(changed.items.slice(0, 3)), selection(first.items.slice(0, 3)));
        assert.deepEqual(selection(changed.items.slice(4)), selection(first.items.slice(4)));
        assert.deepEqual(await effects(target), before);
        for (const offset of [-11, -3, 0]) assert.deepEqual(selection((await preview(target, offset)).items), selection(changed.items));
        assert.deepEqual(selection((await teacherRead(target)).items), selection(changed.items));
        const actual = await enter(target);
        assert.deepEqual(selection(actual.session.items), selection(changed.items));
        assert.equal(actual.session.items[3].points, 7);
        unique(actual.session.items);
    });

    await check('A learner who answers none keeps all immutable snapshots and earns no participation or points', async () => {
        const target = await student('每天只打开没有答题');
        const first = (await enter(target, -3)).session;
        const initialBalance = await balance(target);
        for (const offset of [-2, -1, 0]) {
            const projected = await preview(target, offset);
            assert.deepEqual(selection(projected.items), selection(first.items));
            const actual = (await enter(target, offset)).session;
            preserved(actual.items, first.items);
            assert.equal(actual.items.length, 5);
            assert.equal(actual.cursor, 0);
            assert.equal(daily.presentSession(target.policy, actual, when(offset)).answered, 0);
        }
        assert.deepEqual(await balance(target), initialBalance);
        assert.equal(await daily.progressColl.countDocuments({ uid: target.uid }), 0);
        const data = await learning(target);
        assert.equal(data.summary.participationCount, 0);
        assert.equal(data.summary.answered, 0);
    });

    await check('Two answers out of five replace exactly those two slots; the three unanswered slots stay in place', async () => {
        const target = await student('昨天答了两道');
        const previous = (await enter(target, -1)).session;
        await answerPrefix(target, previous, [true, false], -1);
        const original = await daily.sessionColl.findOne({ _id: previous._id });
        assert.equal(original.items.filter((item) => item.answer).length, 2);
        assert.equal(original.cursor, 1, 'The wrong-answer feedback has not been acknowledged');
        const before = await effects(target);
        const nextPreview = await preview(target);
        assert.equal(nextPreview.total, 5);
        assert.equal(nextPreview.remaining, 5);
        for (const index of [0, 1]) assert(!previous.items.some((item) => item.domainId === nextPreview.items[index].domainId
            && item.sourceId === nextPreview.items[index].sourceId));
        assert.deepEqual(selection(nextPreview.items.slice(2)), selection(previous.items.slice(2)));
        assert.deepEqual(await effects(target), before, 'Teacher rollover preview only changes selection plans');
        const actual = (await enter(target)).session;
        assert.deepEqual(selection(actual.items), selection(nextPreview.items));
        preserved(actual.items.slice(2), previous.items.slice(2));
        assert.equal(actual.items.filter((item) => item.answer).length, 0);
        assert.equal(actual.cursor, 0);
        assert.equal(actual.requested, 5);
        assert.deepEqual(await balance(target), before.balance);
        const frozenPrevious = await daily.sessionColl.findOne({ _id: previous._id });
        assert.deepEqual(frozenPrevious.items, original.items);
        assert.deepEqual([frozenPrevious.cursor, frozenPrevious.round, frozenPrevious.requested],
            [original.cursor, original.round, original.requested]);
        const data = await learning(target);
        assert.deepEqual([data.summary.answered, data.summary.correctCount, data.summary.wrongCount, data.summary.participationCount], [2, 1, 1, 1]);
        unique(actual.items);
    });

    await check('Teacher replacements in an active mixed-domain batch remain fixed while only answered slots refresh', async () => {
        const target = await student('跨课堂老师换过题', multiDomain);
        const previous = (await enter(target, -2)).session;
        const firstPreview = await preview(target, -2);
        const changed = await swap(target, firstPreview, firstPreview.items[4], -2);
        const revised = await daily.sessionColl.findOne({ _id: previous._id });
        assert.notEqual(revised.items[4].sourceId, previous.items[4].sourceId);
        assert.equal(changed.items[4].points, 11);
        await answerPrefix(target, revised, [true, true], -2);
        const next = (await enter(target, -1)).session;
        preserved(next.items.slice(2), revised.items.slice(2));
        assert.deepEqual(next.items.map((item) => item.domainId), [python, python, python, scratch, scratch]);
        assert.deepEqual(next.items.map((item) => item.points), [2, 3, 5, 7, 11]);
        const afterNoAnswers = await preview(target);
        assert.deepEqual(selection(afterNoAnswers.items), selection(next.items));
        const todaySession = (await enter(target)).session;
        preserved(todaySession.items, next.items);
        assert.equal(todaySession.items[4].id, revised.items[4].id);
        assert.equal(todaySession.items[4].sourceId, revised.items[4].sourceId);
        unique(todaySession.items);
    });

    await check('A prepared next batch after completion survives a skipped login day, including its teacher replacement', async () => {
        const target = await student('完成后老师提前换题');
        const completed = (await enter(target, -2)).session;
        await answerPrefix(target, completed, [true, true, true, true, true], -2);
        const firstPreview = await preview(target, -2);
        assert.equal(firstPreview.status, 'completed');
        assert.equal(firstPreview.next.day, day(-1));
        const changed = await swap(target, firstPreview.next, firstPreview.next.items[2], -2);
        assert.equal(changed.status, 'completed');
        assert.notEqual(changed.next.items[2].sourceId, firstPreview.next.items[2].sourceId);
        const before = await effects(target);
        const currentPreview = await preview(target);
        assert.deepEqual(selection(currentPreview.items), selection(changed.next.items));
        assert.deepEqual(await effects(target), before);
        const actual = (await enter(target)).session;
        assert.deepEqual(selection(actual.items), selection(changed.next.items));
        assert.equal(actual.items.length, 5);
        assert.deepEqual(await balance(target), before.balance);
        assert.equal((await learning(target)).summary.participationCount, 1);
    });

    await check('Concurrent next-day entry produces one identical five-slot allocation without double points or history', async () => {
        const target = await student('跨天并发进入');
        const previous = (await enter(target, -1)).session;
        await answerPrefix(target, previous, [true, false], -1);
        const expected = await preview(target);
        const beforeBalance = await balance(target);
        const sessions = await Promise.all(Array.from({ length: 8 }, () => enter(target)));
        assert.equal(await daily.sessionColl.countDocuments({ uid: target.uid, day: today }), 1);
        for (const value of sessions) {
            assert.deepEqual(selection(value.session.items), selection(expected.items));
            preserved(value.session.items.slice(2), previous.items.slice(2));
            assert.equal(value.session.items.length, 5);
            unique(value.session.items);
        }
        assert.deepEqual(await balance(target), beforeBalance);
        assert.equal(await daily.progressColl.countDocuments({ uid: target.uid }), 2);
        assert.equal((await learning(target)).summary.participationCount, 1);
    });

    await check('A stale prior-day submission cannot grade a carried question in the new session', async () => {
        const target = await student('旧页面提交保护');
        const previous = (await enter(target, -1)).session;
        const actual = (await enter(target)).session;
        assert.equal(actual.items[0].sourceId, previous.items[0].sourceId);
        const before = await effects(target);
        await assert.rejects(daily.answerQuestion(target.uid, previous._id, previous.items[0].id,
            previous.items[0].objective.answers, when(0)), (error) => error.name === 'ForbiddenError');
        assert.deepEqual(await effects(target), before);
        assert(!((await daily.sessionColl.findOne({ _id: actual._id })).items[0].answer));
    });

    await check('A prior-day answer paused before its atomic write cannot race a rollover and double-grade the carried source', async () => {
        const target = await student('午夜提交竞争保护');
        const previous = (await enter(target, -1)).session;
        const item = previous.items[0];
        const beforeBalance = await balance(target);
        const originalUpdate = daily.sessionColl.updateOne;
        let release;
        let reached;
        const paused = new Promise((resolve) => { reached = resolve; });
        const unblock = new Promise((resolve) => { release = resolve; });
        daily.sessionColl.updateOne = async function pauseOldAnswer(filter, update, ...args) {
            if (filter._id === previous._id && update.$set?.['items.0.answer']) {
                reached();
                await unblock;
            }
            return originalUpdate.call(this, filter, update, ...args);
        };
        const oldAnswer = daily.answerQuestion(target.uid, previous._id, item.id, item.objective.answers, when(-1));
        const settled = oldAnswer.then((value) => ({ value }), (error) => ({ error }));
        try {
            await Promise.race([paused, new Promise((_, reject) => setTimeout(() => reject(new Error('Midnight answer hook did not pause')), 5000))]);
            const current = (await enter(target)).session;
            assert.deepEqual(selection(current.items), selection(previous.items));
            release();
            const outcome = await settled;
            if (!outcome.error) assert(!outcome.value.session.items[0].answer);
            assert(!((await daily.sessionColl.findOne({ _id: previous._id })).items[0].answer));
            assert(!((await daily.sessionColl.findOne({ _id: current._id })).items[0].answer));
            assert.equal(await daily.progressColl.countDocuments({ uid: target.uid }), 0);
            assert.deepEqual(await balance(target), beforeBalance);
            assert.equal((await learning(target)).summary.participationCount, 0);
        } finally {
            release();
            daily.sessionColl.updateOne = originalUpdate;
            await settled;
        }
    });

    await check('An answer committed after teacher preview preserves the independent teacher swap when the next batch is allocated', async () => {
        const target = await student('老师换题与前一天答题交错');
        const previous = (await enter(target, -1)).session;
        const first = previous.items[0];
        const originalTracePath = `problem/${previous.items[2].domainId}/${previous.items[2].sourceId}/additional_file/trace.png`;
        const originalUpdate = daily.sessionColl.updateOne;
        let release;
        let reached;
        const paused = new Promise((resolve) => { reached = resolve; });
        const unblock = new Promise((resolve) => { release = resolve; });
        daily.sessionColl.updateOne = async function pauseInterleavedAnswer(filter, update, ...args) {
            if (filter._id === previous._id && update.$set?.['items.0.answer']) {
                reached();
                await unblock;
            }
            return originalUpdate.call(this, filter, update, ...args);
        };
        const oldAnswer = daily.answerQuestion(target.uid, previous._id, first.id, first.objective.answers, when(-1));
        const settled = oldAnswer.then((value) => ({ value }), (error) => ({ error }));
        try {
            await Promise.race([paused, new Promise((_, reject) => setTimeout(() => reject(new Error('Preview/answer interleave hook did not pause')), 5000))]);
            await storage.put(originalTracePath, Buffer.from('source image changed after the learner snapshot'), teacherId);
            const upcoming = await preview(target);
            assert.deepEqual(selection(upcoming.items), selection(previous.items));
            const changed = await swap(target, upcoming, upcoming.items[4]);
            assert.notEqual(changed.items[4].sourceId, previous.items[4].sourceId);
            assert.notEqual(changed.items[4].id, previous.items[4].id);
            // The old answer wins before actual allocation; it changes the preview baseline.
            release();
            const outcome = await settled;
            assert.equal(outcome.error, undefined);
            assert.equal(outcome.value.session.items[0].answer.correct, true);
            const beforeBalance = await balance(target);
            const current = (await enter(target)).session;
            assert.equal(current.items.length, 5);
            assert.notEqual(current.items[0].sourceId, first.sourceId);
            preserved(current.items.slice(1, 4), previous.items.slice(1, 4));
            assert.deepEqual(selection(current.items.slice(4)), selection(changed.items.slice(4)),
                'Changing the answer baseline must not discard the independent teacher replacement');
            assert.equal(current.items[4].points, 11);
            unique(current.items);
            const carriedImage = await storage.get(current.items[2].files['trace.png']);
            const chunks = [];
            for await (const chunk of carriedImage) chunks.push(chunk);
            assert.deepEqual(Buffer.concat(chunks), png, 'Rebasing a plan retains the immutable carried attachment rather than copying an edited source');
            assert.deepEqual(await balance(target), beforeBalance);
            assert.equal(await daily.progressColl.countDocuments({ uid: target.uid }), 1);
            assert.equal((await learning(target)).summary.participationCount, 1);
            assert.deepEqual(selection((await preview(target)).items), selection(current.items));
        } finally {
            release();
            daily.sessionColl.updateOne = originalUpdate;
            await settled;
            await storage.put(originalTracePath, png, teacherId);
        }
    });

    await check('Carried statement and analysis attachments retain their original immutable contents', async () => {
        const target = await student('跨天配图保护');
        const previous = (await enter(target, -1)).session;
        const item = previous.items[0];
        const originalAnalysisPath = `problem/${item.domainId}/${item.sourceId}/additional_file/analysis.png`;
        const originalAnalysis = await storage.get(originalAnalysisPath);
        const chunks = [];
        for await (const chunk of originalAnalysis) chunks.push(chunk);
        const originalAnalysisBytes = Buffer.concat(chunks);
        await storage.put(originalAnalysisPath, Buffer.from('new original analysis attachment'), teacherId);
        try {
            const actual = (await enter(target)).session;
            preserved([actual.items[0]], [item]);
            const stream = await storage.get(actual.items[0].files['analysis.png']);
            const carriedChunks = [];
            for await (const chunk of stream) carriedChunks.push(chunk);
            assert.deepEqual(Buffer.concat(carriedChunks), originalAnalysisBytes);
            const learner = supertest.agent(httpServer);
            status(await learner.post('/login').send({ uname: target.uname, password }), 302);
            const state = await learner.get('/daily-quiz/status').set('Accept', 'application/json');
            status(state, 200);
            assert.equal(state.body.state.current.id, item.id);
            assert.equal(state.body.state.current.feedback, undefined);
            const statementUrl = state.body.state.current.stem.match(/!\[[^\]]*\]\(([^)]+)\)/)[1];
            status(await learner.get(statementUrl), 200);
            status(await learner.get(statementUrl.replace('trace.png', 'analysis.png')), 404);
            const answered = await learner.post('/daily-quiz').set('Accept', 'application/json').send({
                operation: 'answer', sessionId: actual._id, questionId: item.id, answers: ['B'],
            });
            status(answered, 200);
            const feedback = (await learner.get('/daily-quiz/status').set('Accept', 'application/json')).body.state.current.feedback;
            const analysisUrl = feedback.analysis.match(/!\[[^\]]*\]\(([^)]+)\)/)[1];
            const response = await learner.get(analysisUrl);
            status(response, 200);
            assert.deepEqual(response.body, originalAnalysisBytes);
        } finally { await storage.put(originalAnalysisPath, originalAnalysisBytes, teacherId); }
    });

    await check('Replacing a carried question retires only its current copy and leaves prior history attachments intact', async () => {
        const target = await student('老师换题不破坏历史配图');
        const previous = (await enter(target, -1)).session;
        const current = (await enter(target)).session;
        const oldItem = previous.items[0];
        const carriedItem = current.items[0];
        preserved([carriedItem], [oldItem]);
        assert.notEqual(carriedItem.files['trace.png'], oldItem.files['trace.png']);
        assert.notEqual(carriedItem.files['analysis.png'], oldItem.files['analysis.png']);
        const before = await daily.sessionColl.findOne({ _id: previous._id });
        const upcoming = await preview(target);
        const changed = await swap(target, upcoming, upcoming.items[0]);
        assert.notEqual(changed.items[0].sourceId, oldItem.sourceId);
        assert.equal(await storage.exists(carriedItem.files['trace.png']), false);
        assert.equal(await storage.exists(carriedItem.files['analysis.png']), false);
        assert.equal(await storage.exists(oldItem.files['trace.png']), true);
        assert.equal(await storage.exists(oldItem.files['analysis.png']), true);
        assert.deepEqual(await daily.sessionColl.findOne({ _id: previous._id }), before);
        const protectedHistoryFile = await daily.getAdminFile(target.uid, previous.day, oldItem.id, 'trace.png', [python]);
        assert.equal(protectedHistoryFile, oldItem.files['trace.png']);
        const image = await storage.get(protectedHistoryFile);
        const chunks = [];
        for await (const chunk of image) chunks.push(chunk);
        assert.deepEqual(Buffer.concat(chunks), png);
        assert.equal(await daily.progressColl.countDocuments({ uid: target.uid }), 0);
        assert.equal((await learning(target)).summary.participationCount, 0);
    });

    await check('Teacher HTTP preview and real student login agree on the carried and newly filled slots', async () => {
        const target = await student('师生一致的即将练习');
        const previous = (await enter(target, -1)).session;
        await answerPrefix(target, previous, [true, false], -1);
        const next = await teacherRead(target);
        assert.deepEqual(selection(next.items.slice(2)), selection(previous.items.slice(2)));
        const response = await teacher.post(`/manage/daily-quiz/student/${target.uid}`).set('Accept', 'application/json').send({
            operation: 'replace_upcoming', day: next.day, questionId: next.items[3].id,
            sourceDomain: next.items[3].domainId, sourceId: next.items[3].sourceId,
        });
        status(response, 200);
        const changed = response.body.upcoming;
        assert.notEqual(changed.items[3].sourceId, next.items[3].sourceId);
        const learner = supertest.agent(httpServer);
        status(await learner.post('/login').send({ uname: target.uname, password }), 302);
        const state = await learner.get('/daily-quiz/status').set('Accept', 'application/json');
        status(state, 200);
        const session = await daily.sessionColl.findOne({ _id: state.body.state.sessionId });
        assert.deepEqual(selection(session.items), selection(changed.items));
        assert.deepEqual(selection((await teacherRead(target)).items), selection(changed.items));
        assert.equal(state.body.state.total, 5);
        assert.equal(state.body.state.answered, 0);
        assert.equal(state.body.state.required, true);
        assert.equal(state.body.state.current.id, changed.items[0].id);
        unique(session.items);
    });

    console.log(`RESULT ${results.filter(Boolean).length}/${results.length} daily carryover checks passed`);
    clearTimeout(timeout);
    if (process.env.DAILY_CARRYOVER_SERVE === '1' && results.every(Boolean)) {
        const demo = await student('周沐辰 · 保留未答题');
        const previous = (await enter(demo, -1)).session;
        await answerPrefix(demo, previous, [true, false], -1);
        const upcoming = await preview(demo);
        await swap(demo, upcoming, upcoming.items[4]);
        console.log(`SMOKE ${JSON.stringify({ origin: `http://localhost:${port}`, username: teacherName, password,
            dashboardUrl: `http://localhost:${port}/manage/daily-quiz`,
            studentManagementUrl: `http://localhost:${port}/manage/users?uid=${demo.uid}`, student: demo, today, python, scratch })}`);
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
