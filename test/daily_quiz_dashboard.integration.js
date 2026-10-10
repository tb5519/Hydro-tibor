/* eslint-disable no-await-in-loop -- Fixture changes and HTTP scenarios deliberately run in order. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const supertest = require('supertest');
const { JSDOM } = require('jsdom');

// Never read the developer's database or production credentials.
process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(os.homedir(), '.cache/mongodb-binaries');
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-daily-dashboard-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.DAILY_DASHBOARD_PORT || '18898';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => {
    console.error('Daily dashboard integration timed out');
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
function redirectedTo(response, route) {
    assert(response.status === 302 || response.body.url?.includes(route), `${response.status}: ${response.text?.slice(0, 500)}`);
    assert((response.headers.location || response.body.url || '').includes(route));
}

async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, httpServer } = require('hydrooj');
    const daily = require('../packages/hydrooj/src/model/daily_quiz');
    const { beijingDay } = require('../packages/hydrooj/src/lib/daily_quiz');
    const storage = require('../packages/hydrooj/src/model/storage').default;
    const document = require('../packages/hydrooj/src/model/document');
    const workspace = require('../packages/hydrooj/src/model/workspace').default;
    const { objectiveContent, objectiveConfig } = require('../packages/hydrooj/src/lib/objective');
    const teacherId = await users.create('dashboard-teacher@example.test', 'dashboard_teacher', 'LocalTest123!');
    await users.setSuperAdmin(teacherId);
    const python = 'dashboard-python';
    const cpp = 'dashboard-cpp';
    const foreignDomain = 'dashboard-foreign';
    await domains.add(python, teacherId, 'Python 思维进阶', 'Isolated daily dashboard fixture');
    await domains.add(cpp, teacherId, 'C++ 算法启航', 'Isolated daily dashboard fixture');
    const foreignWorkspace = await workspace.create('dashboard-other', '其他老师工作区', teacherId);
    await domains.add(foreignDomain, teacherId, '其他工作区的课堂', 'Isolated fixture', foreignWorkspace._id);
    const today = beijingDay();
    const offsetDay = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const yesterday = offsetDay(-1);
    const timestamp = (day, minute = 0) => new Date(Date.parse(`${day}T01:00:00Z`) + minute * 60000);
    const definitions = [
        ['completed', '林小禾', 'xiaohe'], ['partial', '陈星宇', 'xingyu'], ['notStarted', '周沐辰', 'muchen'],
        ['disabled', '许朵朵', 'duoduo'], ['empty', '王乐言', 'leyan'], ['zeroAnswered', '张一诺', 'yinuo'],
        ['disabledDone', '李知远', 'zhiyuan'], ['cancelled', '苏安安', 'anan'],
    ];
    const roster = {};
    for (const [key, name, account] of definitions) {
        const uname = `dashboard_${account}`;
        const uid = await users.createInDomain(python, `${uname}@example.test`, uname, 'LocalTest123!');
        await domains.setUserInDomain(python, uid, { join: true, role: 'default', displayName: name });
        await users.setById(uid, { defaultDomain: python });
        const mixed = ['completed', 'partial'].includes(key);
        if (mixed) await domains.setUserInDomain(cpp, uid, { join: true, role: 'default', displayName: name });
        const policy = {
            version: 1, enabled: !['disabled', 'disabledDone'].includes(key), cooldownRounds: 3,
            domains: [{ domainId: python, enabled: true, count: mixed ? 2 : 3, tags: [], points: mixed ? [3, 3] : [3, 3, 3] },
                ...(mixed ? [{ domainId: cpp, enabled: true, count: 1, tags: [], points: [3] }] : [])],
        };
        await daily.savePolicy(uid, policy, teacherId);
        roster[key] = { uid, name, uname, policy };
    }
    const foreignUid = await users.createInDomain(python, 'dashboard-foreign@example.test', 'dashboard_foreign', 'LocalTest123!');
    await domains.setUserInDomain(python, foreignUid, { join: true, role: 'default', displayName: '不可见的其他工作区学员' });
    await workspace.addStudent(foreignWorkspace._id, foreignUid, teacherId);
    const sourceQuestion = {
        version: 1, kind: 'single', stem: '当 $N=2$ 时，下面代码会输出什么？\n\n```python\nprint(N + 3)\n```',
        options: ['$5$', '$23$', '$N+3$', '没有输出'], answers: ['A'], analysis: '因为 $N+3=5$，`print` 会将结果输出。',
    };
    const material = [
        { title: '变量与输出', tags: ['变量', '基础运算'], objective: sourceQuestion },
        { title: '循环的作用', tags: ['循环', '条件判断'], objective: {
            version: 1, kind: 'judge', stem: '循环结构可以让一段代码重复执行。',
            options: ['正确', '错误'], answers: ['A'], analysis: '循环会根据条件重复执行代码。',
        } },
        { title: '认识自增运算', tags: ['变量', '运算'], objective: {
            version: 1, kind: 'multiple', stem: '哪些写法可以让变量 `x` 增加 1？',
            options: ['`x = x + 1`', '`x = 1`', '`x += 1`', '`x = x - 1`'], answers: ['A', 'C'],
            analysis: '第一项和第三项都是在原来数值的基础上增加 1。',
        } },
    ];
    const sourceIds = {};
    for (const domainId of [python, cpp]) {
        sourceIds[domainId] = [];
        for (const [index, item] of material.entries()) {
            sourceIds[domainId].push(await problems.add(domainId, `DASHBOARD${index + 1}`, item.title,
                objectiveContent(item.objective), teacherId, item.tags, {
                    hidden: true, objectiveKind: item.objective.kind, objective: item.objective, config: objectiveConfig(item.objective),
                }));
        }
        assert.equal(new Set(sourceIds[domainId]).size, 3, 'Each material must have a unique source identity for mastery deduplication');
    }
    const sourceId = sourceIds[python][0];
    const privatePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2XkAAAAASUVORK5CYII=', 'base64');
    const originalFile = `problem/${python}/${sourceId}/additional_file/trace.png`;
    const snapshotFile = `daily-quiz/dashboard-fixture/${roster.completed.uid}/trace.png`;
    await storage.put(originalFile, privatePng, teacherId);
    await storage.copy(originalFile, snapshotFile);

    function question(index, domainId, result, day = today, extra = {}) {
        const source = material[(index - 1) % material.length];
        const objective = { ...source.objective };
        const answer = result === null ? {} : { answer: {
            selected: result ? objective.answers : ['B'], correct: result, earnedPoints: result ? 3 : 0,
            answeredAt: timestamp(day, index * 7),
        } };
        return {
            id: index, domainId, domainName: domainId === python ? 'Python 思维进阶' : 'C++ 算法启航',
            sourceId: sourceIds[domainId][(index - 1) % material.length], title: source.title,
            tags: source.tags, points: 3,
            objective, files: {}, statementFiles: [], ...answer, ...extra,
        };
    }
    async function session(key, items, day = today) {
        const uid = roster[key]?.uid || key;
        const document = {
            _id: `${uid}-${day}`, uid, day, round: day === today ? 2 : 1, cooldownRounds: 3,
            items, cursor: items.findIndex((item) => !item.answer), requested: 3, createdAt: timestamp(day),
            settledAnswers: items.filter((item) => item.answer).length,
        };
        if (document.cursor < 0) document.cursor = items.length;
        await daily.sessionColl.insertOne(document);
    }
    const protectedQuestion = question(1, python, true);
    protectedQuestion.objective = {
        ...protectedQuestion.objective,
        stem: `${sourceQuestion.stem}\n\n![题目配图](file://trace.png)`,
        options: ['5 ![选项配图](file://trace.png)', '23', '2 + 3', '没有输出'],
        analysis: `${sourceQuestion.analysis}\n\n![解析配图](file://trace.png)`,
    };
    protectedQuestion.files = { 'trace.png': snapshotFile };
    protectedQuestion.statementFiles = ['trace.png'];
    await session('completed', [protectedQuestion, question(2, python, false), question(3, cpp, true)]);
    await session('partial', [question(1, python, true), question(2, cpp, false), question(3, python, null)]);
    await session('empty', []);
    await session('zeroAnswered', [1, 2, 3].map((id) => question(id, python, null)));
    await session('disabledDone', [question(1, python, true), question(2, python, false)]);
    await session('cancelled', [question(1, python, false, today, { cancelled: true }),
        question(2, python, null, today, { cancelled: true }), question(3, python, true)]);
    await session('completed', [question(1, python, true, yesterday), question(2, python, false, yesterday), question(3, cpp, false, yesterday)], yesterday);
    await session('partial', [question(1, python, true, yesterday), question(2, cpp, null, yesterday)], yesterday);
    await session(foreignUid, [question(1, python, false)]);
    // A deliberately unsettled answer makes accidental teacher-triggered settlement observable.
    await daily.sessionColl.updateOne({ _id: `${roster.completed.uid}-${today}` }, { $set: { settledAnswers: 0 } });
    await users.setById(roster.completed.uid, { lotteryPoints: 41, lotteryTotalPoints: 57 });

    const teacher = supertest.agent(httpServer);
    const withoutSudo = supertest.agent(httpServer);
    const learner = supertest.agent(httpServer);
    for (const [agent, uname] of [[teacher, 'dashboard_teacher'], [withoutSudo, 'dashboard_teacher'], [learner, roster.disabled.uname]]) {
        status(await agent.post('/login').send({ uname, password: 'LocalTest123!' }), 302);
    }
    const base = '/manage/daily-quiz';
    const get = (url = base, agent = teacher) => agent.get(url).set('Accept', 'application/json');
    const detail = (uid, query = '') => `${base}/student/${uid}${query}`;
    await check('Only a fully authorized teacher with recent sudo can view the dashboard or learner detail', async () => {
        for (const url of [base, detail(roster.completed.uid)]) {
            redirectedTo(await get(url, supertest.agent(httpServer)), '/login');
            denied(await get(url, learner));
            redirectedTo(await get(url, withoutSudo), '/user/sudo');
        }
        // Classroom root permissions are insufficient for global student-management data.
        await domains.setUserInDomain(python, roster.disabled.uid, { role: 'root' });
        denied(await get(`/d/${python}${base}`, learner));
        await domains.setUserInDomain(python, roster.disabled.uid, { role: 'default' });
    });
    redirectedTo(await get(), '/user/sudo');
    status(await teacher.post('/user/sudo').send({ password: 'LocalTest123!' }), 302);
    const roundUrl = (uid, day = today, classroom = '') => detail(uid,
        `?session=${encodeURIComponent(`${uid}-${day}`)}${classroom ? `&classroom=${classroom}` : ''}`);
    const readLearning = async (uid, classroom = '') => {
        const response = await get(detail(uid, classroom ? `?classroom=${classroom}` : ''));
        status(response, 200);
        return response.body.learning;
    };
    const summaryFields = ['total', 'answered', 'correctCount', 'wrongCount', 'unseenCount', 'accuracy',
        'participationCount', 'earnedPoints', 'lastAnsweredAt'];
    const rowSummary = (row) => Object.fromEntries(summaryFields.map((key) => [key, row[key]]));
    let dashboard;
    await check('Overview uses each learners current material pool and unique latest answers, with cumulative participation and points', async () => {
        const response = await get();
        status(response, 200);
        assert.equal(response.headers['cache-control'], 'private, no-store');
        dashboard = response.body.dashboard;
        assert.equal(dashboard.classroom, '');
        assert.equal(dashboard.rows.length, definitions.length);
        for (const obsolete of ['day', 'today', 'trend']) assert.equal(Object.hasOwn(dashboard, obsolete), false);
        assert.deepEqual(dashboard.stats, {
            students: 8, participants: 4, total: 30, answered: 9, correctCount: 5, wrongCount: 4, unseenCount: 21,
            participationCount: 6, earnedPoints: 21, accuracy: 5 / 9 * 100,
        });
        const row = dashboard.rows.find((item) => item.uid === roster.notStarted.uid);
        assert.equal(row.total, 3);
        assert.equal(row.answered, 0);
        assert.equal(row.unseenCount, 3);
        assert.equal(row.accuracy, null);
        assert.equal(row.lastAnsweredAt, null);
        assert.equal(row.participationCount, 0);
        assert(dashboard.rows.every((item) => !Object.hasOwn(item, 'status')));
        assert(dashboard.rows.every((item) => item.detailUrl.includes(`${base}/student/${item.uid}`)));
        assert(dashboard.rows.every((item) => item.settingsUrl.includes(`/manage/users?uid=${item.uid}`)));
        assert(!JSON.stringify(dashboard.rows).includes('objective'));
        assert(!JSON.stringify(dashboard.rows).includes('analysis'));
        assert(!JSON.stringify(dashboard).includes('不可见的其他工作区学员'));
    });
    await check('Read-only dashboard, learning detail and round detail never create sessions, settle points, or mutate policies and mastery', async () => {
        const beforeSessions = await daily.sessionColl.find().sort({ _id: 1 }).toArray();
        const beforePolicies = await daily.configColl.find().sort({ _id: 1 }).toArray();
        const beforeProgress = await daily.progressColl.find().sort({ _id: 1 }).toArray();
        const pointFields = { lotteryPoints: 1, lotteryTotalPoints: 1, dailyQuizPointAwards: 1 };
        const beforeAccount = await users.coll.findOne({ _id: roster.completed.uid }, { projection: pointFields });
        assert.equal(beforeSessions.find((item) => item._id === `${roster.completed.uid}-${today}`).settledAnswers, 0);
        assert.equal(beforeAccount.lotteryPoints, 41);
        assert.equal(beforeAccount.lotteryTotalPoints, 57);
        for (const url of [base, `${base}?classroom=${cpp}`, detail(roster.notStarted.uid), detail(roster.empty.uid),
            detail(roster.completed.uid), roundUrl(roster.completed.uid), roundUrl(roster.zeroAnswered.uid),
            `/manage/users?uid=${roster.completed.uid}`]) status(await get(url), 200);
        assert.deepEqual(await daily.sessionColl.find().sort({ _id: 1 }).toArray(), beforeSessions);
        assert.deepEqual(await daily.configColl.find().sort({ _id: 1 }).toArray(), beforePolicies);
        assert.deepEqual(await daily.progressColl.find().sort({ _id: 1 }).toArray(), beforeProgress);
        assert.deepEqual(await users.coll.findOne({ _id: roster.completed.uid }, { projection: pointFields }), beforeAccount);
        assert.equal(await daily.sessionColl.countDocuments({ uid: roster.notStarted.uid }), 0);
    });
    await check('Classroom filtering scopes roster, material pools, unique answers and participation to that classroom', async () => {
        const response = await get(`${base}?classroom=${cpp}`);
        status(response, 200);
        const filtered = response.body.dashboard;
        assert.deepEqual(filtered.rows.map((row) => row.uid).sort(), [roster.completed.uid, roster.partial.uid].sort());
        assert.equal(filtered.classroom, cpp);
        assert.deepEqual(filtered.stats, {
            students: 2, participants: 2, total: 6, answered: 2, correctCount: 1, wrongCount: 1, unseenCount: 4,
            participationCount: 3, earnedPoints: 3, accuracy: 50,
        });
        for (const row of filtered.rows) {
            assert.equal(row.total, 3, 'Full current pool is independent of the daily draw count of one');
            assert.equal(row.answered, 1);
            const detailResponse = await get(row.detailUrl);
            status(detailResponse, 200);
            assert.deepEqual(detailResponse.body.learning.summary, rowSummary(row));
            assert(detailResponse.body.learning.questions.every((item) => item.domainId === cpp));
            for (const round of detailResponse.body.learning.sessions) {
                const roundResponse = await get(round.detailUrl);
                status(roundResponse, 200);
                assert(roundResponse.body.report.items.every((item) => item.domainId === cpp));
            }
        }
        denied(await get(detail(roster.empty.uid, `?classroom=${cpp}`)));
    });
    await check('Wrong-to-right retries replace the question result without duplicating mastery or erasing earlier round snapshots', async () => {
        const learning = await readLearning(roster.completed.uid);
        assert.deepEqual(learning.summary, {
            total: 6, answered: 3, correctCount: 2, wrongCount: 1, unseenCount: 3,
            participationCount: 2, earnedPoints: 9, accuracy: 2 / 3 * 100, lastAnsweredAt: timestamp(today, 21).toISOString(),
        });
        assert.equal(learning.questions.length, 3);
        assert.equal(new Set(learning.questions.map((item) => `${item.domainId}:${item.sourceId}`)).size, 3);
        const retried = learning.questions.find((item) => item.domainId === cpp && item.sourceId === sourceIds[cpp][2]);
        assert.equal(retried.correct, true);
        assert.deepEqual(retried.selected, ['A', 'C']);
        assert.equal(retried.round, 2);
        assert.equal(retried.sessionId, `${roster.completed.uid}-${today}`);
        const priorRound = await get(roundUrl(roster.completed.uid, yesterday));
        status(priorRound, 200);
        assert.equal(priorRound.body.report.items.find((item) => item.domainId === cpp).correct, false);
        assert.deepEqual(learning.sessions.map((item) => item.round), [2, 1]);
    });
    await check('Round details include unanswered items while empty and zero-answer rounds do not count as participation', async () => {
        const { uid, name, uname } = roster.partial;
        const response = await get(detail(uid));
        status(response, 200);
        assert.deepEqual(response.body.student, { uid, name, uname });
        const learning = response.body.learning;
        assert.equal(learning.questions.length, 2, 'Current question results contain answered material only');
        assert.equal(learning.summary.unseenCount, 4);
        const report = (await get(roundUrl(uid))).body.report;
        assert.equal(report.total, 3);
        assert.equal(report.answered, 2);
        assert.equal(report.completed, false);
        assert.deepEqual(report.items.map((item) => item.correct), [true, false, null]);
        assert.deepEqual(report.items.map((item) => item.selected), [['A'], ['B'], null]);
        assert.deepEqual(report.items[2].answers, ['A', 'C']);
        assert(report.items.every((item) => item.stem && item.analysis && item.options.length));
        const zero = await readLearning(roster.zeroAnswered.uid);
        assert.equal(zero.summary.participationCount, 0);
        assert.equal(zero.sessions.length, 1);
        const zeroRound = (await get(zero.sessions[0].detailUrl)).body.report;
        assert.equal(zeroRound.answered, 0);
        assert.equal(zeroRound.items.length, 3);
        assert(zeroRound.items.every((item) => item.correct === null));
        const empty = await readLearning(roster.empty.uid);
        assert.equal(empty.summary.total, 3, 'A previously empty draw does not replace the current material pool');
        assert.equal(empty.summary.participationCount, 0);
        assert.deepEqual(empty.sessions, []);
        const cancelled = (await get(roundUrl(roster.cancelled.uid))).body.report;
        assert.deepEqual(cancelled.items.map((item) => item.id), [1, 3]);
        assert.equal(cancelled.correctCount, 1);
        assert.equal(cancelled.wrongCount, 1);
    });
    await check('Configured tags match with OR, overlapping tags do not duplicate questions, and newly matching material enters immediately', async () => {
        const { uid, policy } = roster.partial;
        const selectedPolicy = { ...policy, domains: policy.domains.map((rule) => rule.domainId === python
            ? { ...rule, tags: ['变量', '基础运算'] } : rule) };
        const extraSources = [];
        await daily.savePolicy(uid, selectedPolicy, teacherId);
        try {
            let learning = await readLearning(uid);
            assert.equal(learning.summary.total, 5, 'Two distinct Python questions match either configured tag, plus three C++ questions');
            assert.equal(learning.summary.answered, 2);
            let tags = learning.tags.filter((item) => item.domainId === python);
            assert.deepEqual(Object.fromEntries(tags.map((item) => [item.name, item.total])), { 变量: 2, 基础运算: 1 });
            const newSourceId = await problems.add(python, 'NEW-MATCHING', '新增算术素材', objectiveContent(sourceQuestion), teacherId,
                ['基础运算', '基础运算', '新知识点'], { hidden: true, objectiveKind: 'single', objective: sourceQuestion });
            extraSources.push(newSourceId);
            extraSources.push(await problems.add(python, 'NEW-UNMATCHED', '范围外素材', objectiveContent(sourceQuestion), teacherId,
                ['其他知识点'], { hidden: true, objectiveKind: 'single', objective: sourceQuestion }));
            learning = await readLearning(uid);
            assert.equal(learning.summary.total, 6, 'A new arithmetic-only question satisfies OR matching automatically');
            assert.equal(learning.summary.answered, 2);
            assert.equal(learning.summary.unseenCount, 4);
            tags = learning.tags.filter((item) => item.domainId === python);
            assert.deepEqual(Object.fromEntries(tags.map((item) => [item.name, item.total])), { 变量: 2, 基础运算: 2 });
            assert.equal(tags.reduce((sum, item) => sum + item.total, 0), 4, 'Overlapping tag totals are independent of the three unique Python materials');
            assert(!learning.questions.some((item) => item.domainId === python && item.sourceId === newSourceId));
            assert.equal((await daily.getPolicy(uid)).domains.find((rule) => rule.domainId === python).count, 2);
            const row = (await get()).body.dashboard.rows.find((item) => item.uid === uid);
            assert.deepEqual(rowSummary(row), learning.summary);
            assert.deepEqual([...row.tags].sort(), ['变量', '基础运算'].sort());
        } finally {
            await daily.savePolicy(uid, policy, teacherId);
            for (const id of extraSources) await problems.del(python, id);
        }
    });
    await check('Pausing the global switch retains configured learning scope; disabling a classroom rule removes its material and history', async () => {
        const { uid, policy } = roster.completed;
        const before = await readLearning(uid);
        try {
            await daily.savePolicy(uid, { ...policy, enabled: false }, teacherId);
            assert.deepEqual(await readLearning(uid), before);
            let row = (await get()).body.dashboard.rows.find((item) => item.uid === uid);
            assert.equal(row.enabled, false);
            assert.deepEqual(rowSummary(row), before.summary);
            await daily.savePolicy(uid, { ...policy, domains: policy.domains.map((rule) => rule.domainId === python ? { ...rule, enabled: false } : rule) }, teacherId);
            const scoped = await readLearning(uid);
            assert.equal(scoped.summary.total, 3);
            assert.equal(scoped.summary.answered, 1);
            assert.equal(scoped.summary.correctCount, 1);
            assert(scoped.questions.every((item) => item.domainId === cpp));
            row = (await get()).body.dashboard.rows.find((item) => item.uid === roster.disabledDone.uid);
            assert.equal(row.enabled, false);
            assert.equal(row.total, 3);
            assert.equal(row.answered, 2);
            assert.equal(row.participationCount, 1);
        } finally { await daily.savePolicy(uid, policy, teacherId); }
    });
    await check('Private attachment references are rewritten and require teacher scope, sudo, the correct student and snapshot identity', async () => {
        const learning = await readLearning(roster.completed.uid);
        const item = learning.questions.find((question) => question.domainId === python && question.sourceId === sourceId);
        for (const text of [item.stem, item.options[0], item.analysis]) {
            assert(!text.includes('file://'));
            assert(text.includes(`/manage/users/daily-quiz/${roster.completed.uid}/${today}/file/1/trace.png`));
        }
        const fileUrl = item.stem.match(/!\[[^\]]*\]\(([^)]+)\)/)[1];
        const image = await teacher.get(fileUrl);
        status(image, 200);
        assert.deepEqual(image.body, privatePng);
        assert.equal(image.headers['cache-control'], 'private, no-store');
        assert.equal(image.headers['x-content-type-options'], 'nosniff');
        denied(await get(fileUrl, learner));
        redirectedTo(await get(fileUrl, withoutSudo), '/user/sudo');
        redirectedTo(await get(fileUrl, supertest.agent(httpServer)), '/login');
        denied(await get(fileUrl.replace(`/daily-quiz/${roster.completed.uid}/`, `/daily-quiz/${foreignUid}/`)));
        denied(await get(fileUrl.replace('/file/1/', '/file/999/')));
        denied(await get(fileUrl.replace('trace.png', 'unknown.png')));
    });
    await check('Editing a valid source preserves answered snapshots; invalid or deleted material leaves scope and loses snapshot-file access', async () => {
        const uid = roster.completed.uid;
        const findSnapshot = (learning) => learning.questions.find((item) => item.domainId === python && item.sourceId === sourceId);
        const originalItem = findSnapshot(await readLearning(uid));
        const fileUrl = originalItem.stem.match(/!\[[^\]]*\]\(([^)]+)\)/)[1];
        const originalSource = await document.coll.findOne({ domainId: python, docType: document.TYPE_PROBLEM, docId: sourceId });
        try {
            await problems.edit(python, sourceId, { objective: { ...sourceQuestion, stem: '已修改的题面' } });
            assert.deepEqual(findSnapshot(await readLearning(uid)), originalItem);
            status(await teacher.get(fileUrl), 200);
            await problems.edit(python, sourceId, { tag: ['重命名变量'] });
            assert.deepEqual(findSnapshot(await readLearning(uid)), { ...originalItem, tags: ['重命名变量'] });
            const oldRoundItem = (await get(roundUrl(uid))).body.report.items.find((item) => item.domainId === python && item.sourceId === sourceId);
            assert.deepEqual(oldRoundItem.tags, originalItem.tags, 'A round keeps the original tag snapshot while current mastery uses current tags');
            await problems.edit(python, sourceId, { tag: originalSource.tag });
            await problems.edit(python, sourceId, { objective: { ...sourceQuestion, answers: ['Z'] } });
            let learning = await readLearning(uid);
            assert.equal(learning.summary.total, 5);
            assert.equal(learning.summary.answered, 2);
            assert.equal(learning.summary.correctCount, 1);
            assert.equal(learning.summary.earnedPoints, 3);
            assert.equal(findSnapshot(learning), undefined);
            denied(await get(fileUrl));
            await problems.edit(python, sourceId, { objective: originalSource.objective });
            assert.deepEqual(findSnapshot(await readLearning(uid)), originalItem);
            const sourceFilter = { domainId: python, docType: document.TYPE_PROBLEM, docId: sourceId };
            const storedSource = await document.coll.findOne(sourceFilter);
            await document.coll.deleteOne(sourceFilter);
            try {
                learning = await readLearning(uid);
                assert.equal(learning.summary.total, 5);
                assert.equal(findSnapshot(learning), undefined);
                denied(await get(fileUrl));
                assert((await get(roundUrl(uid))).body.report.items.every((item) => !(item.domainId === python && item.sourceId === sourceId)));
            } finally { await document.coll.insertOne(storedSource); }
            assert.deepEqual(findSnapshot(await readLearning(uid)), originalItem);
            assert.deepEqual((await teacher.get(fileUrl)).body, privatePng);
        } finally { await problems.edit(python, sourceId, { objective: originalSource.objective, tag: originalSource.tag }); }
    });
    await check('Foreign classrooms, malformed learner ids and forged cross-learner or nonexistent session ids are rejected', async () => {
        for (const query of ['classroom=does-not-exist', `classroom=${foreignDomain}`, 'classroom=%3Cscript%3E']) {
            denied(await get(`${base}?${query}`));
            denied(await get(detail(roster.completed.uid, `?${query}`)));
        }
        for (const uid of ['abc', '-1', '1.5', teacherId, foreignUid, 999999]) denied(await get(detail(uid)));
        for (const sessionId of [`${roster.partial.uid}-${today}`, `${foreignUid}-${today}`, 'not-a-session', '../../private', '{}']) {
            denied(await get(detail(roster.completed.uid, `?session=${encodeURIComponent(sessionId)}`)));
        }
        denied(await get(roundUrl(roster.empty.uid)));
        denied(await get(detail(roster.notStarted.uid, `?session=${roster.completed.uid}-${today}`)));
        const scoped = (await get(roundUrl(roster.completed.uid, today, cpp))).body.report;
        assert.equal(scoped.items.length, 1);
        assert.equal(scoped.items[0].domainId, cpp);
    });
    await check('Workspace or classroom membership changes immediately revoke out-of-scope learning and protected images', async () => {
        const uid = roster.completed.uid;
        const imageUrl = `/manage/users/daily-quiz/${uid}/${today}/file/1/trace.png`;
        await workspace.addStudent(foreignWorkspace._id, uid, teacherId);
        try {
            assert(!(await get()).body.dashboard.rows.some((row) => row.uid === uid));
            denied(await get(detail(uid)));
            denied(await get(imageUrl));
        } finally { await workspace.disableStudent(foreignWorkspace._id, uid); }
        await domains.setUserInDomain(python, uid, { join: false, role: 'guest' });
        try {
            const learning = await readLearning(uid);
            assert.equal(learning.summary.total, 3);
            assert.equal(learning.summary.answered, 1);
            assert(learning.questions.every((item) => item.domainId === cpp));
            denied(await get(imageUrl));
        } finally { await domains.setUserInDomain(python, uid, { join: true, role: 'default' }); }
        await domains.setUserInDomain(python, roster.zeroAnswered.uid, { blockedByStudentManagement: true });
        try {
            assert(!(await get()).body.dashboard.rows.some((row) => row.uid === roster.zeroAnswered.uid));
            denied(await get(detail(roster.zeroAnswered.uid)));
        } finally { await domains.setUserInDomain(python, roster.zeroAnswered.uid, { blockedByStudentManagement: false }); }
    });
    await check('The real dashboard and student management use identical learning data and expose no obsolete calendar or day-status controls', async () => {
        const page = await teacher.get(base).set('Accept', 'text/html');
        status(page, 200);
        assert(page.text.includes('每日问答'));
        assert(page.text.includes(roster.completed.name));
        assert(!page.text.includes('不可见的其他工作区学员'));
        const dom = new JSDOM(page.text);
        try {
            const root = dom.window.document.querySelector('[data-daily-quiz-dashboard]');
            const data = JSON.parse(root.getAttribute('data-initial'));
            assert.deepEqual(data, (await get()).body.dashboard);
            assert.equal(dom.window.document.querySelector('[data-quiz-day], input[type="date"]'), null);
        } finally { dom.window.close(); }
        for (const key of ['completed', 'partial', 'disabledDone', 'zeroAnswered']) {
            const uid = roster[key].uid;
            const management = await get(`/manage/users?uid=${uid}`);
            status(management, 200);
            assert.deepEqual(management.body.selectedDailyQuiz.learning, await readLearning(uid));
            const row = (await get()).body.dashboard.rows.find((item) => item.uid === uid);
            assert.deepEqual(management.body.selectedDailyQuiz.learning.summary, rowSummary(row));
        }
        const managementPage = await teacher.get(`/manage/users?uid=${roster.completed.uid}`).set('Accept', 'text/html');
        status(managementPage, 200);
        assert(managementPage.text.includes('/manage/daily-quiz'));
        const managementDom = new JSDOM(managementPage.text);
        try {
            const initial = JSON.parse(managementDom.window.document.querySelector('[data-student-daily-form]').getAttribute('data-initial'));
            assert.deepEqual(initial.learning, await readLearning(roster.completed.uid));
        } finally { managementDom.window.close(); }
    });

    const upcomingUrl = (uid, classroom = '') => detail(uid, `?upcoming=1${classroom ? `&classroom=${classroom}` : ''}`);
    const readUpcoming = async (uid, classroom = '') => {
        const response = await get(upcomingUrl(uid, classroom));
        status(response, 200);
        assert.equal(response.headers['cache-control'], 'private, no-store');
        return response.body.upcoming;
    };
    const readOnlyState = async () => ({
        sessions: await daily.sessionColl.find().sort({ _id: 1 }).toArray(),
        plans: await daily.planColl.find().sort({ _id: 1 }).toArray(),
        progress: await daily.progressColl.find().sort({ _id: 1 }).toArray(),
        policies: await daily.configColl.find().sort({ _id: 1 }).toArray(),
        storage: await storage.coll.find().sort({ _id: 1 }).toArray(),
        accounts: await users.coll.find().project({ lotteryPoints: 1, lotteryTotalPoints: 1, dailyQuizPointAwards: 1 }).sort({ _id: 1 }).toArray(),
    });
    await check('Upcoming previews are lazy, sudo-protected, student-scoped and strictly read-only even with unsettled answers', async () => {
        const learning = await readLearning(roster.completed.uid);
        assert.equal(learning.upcoming, undefined);
        assert.equal(learning.upcomingUrl, upcomingUrl(roster.completed.uid));
        redirectedTo(await get(learning.upcomingUrl, supertest.agent(httpServer)), '/login');
        redirectedTo(await get(learning.upcomingUrl, withoutSudo), '/user/sudo');
        denied(await get(learning.upcomingUrl, learner));
        for (const uid of [foreignUid, teacherId, 999999]) denied(await get(upcomingUrl(uid)));
        denied(await get(upcomingUrl(roster.completed.uid, foreignDomain)));
        denied(await get(detail(roster.completed.uid, '?upcoming=2')));
        const before = await readOnlyState();
        for (const { uid } of Object.values(roster)) await readUpcoming(uid);
        assert.deepEqual(await readOnlyState(), before, 'Preview cannot create rounds, settle points/progress, or even touch storage lastUsage');
        assert.equal(await daily.sessionColl.countDocuments({ uid: roster.notStarted.uid }), 0);
    });
    await check('Pending previews preserve the real current item, feedback awaiting acknowledgement and original global order', async () => {
        const uid = roster.partial.uid;
        let preview = await readUpcoming(uid);
        assert.equal(preview.status, 'continue');
        assert.equal(preview.projected, false);
        assert.equal(preview.total, 3);
        assert.equal(preview.remaining, 1);
        assert.deepEqual(preview.items.map((item) => item.id), [3]);
        assert.equal(preview.items[0].current, true);
        await daily.sessionColl.updateOne({ _id: `${uid}-${today}` }, { $set: { cursor: 1 } });
        try {
            preview = await readUpcoming(uid);
            assert.deepEqual(preview.items.map((item) => item.id), [2, 3]);
            assert.equal(preview.items[0].awaitingAcknowledgement, true);
            assert.equal(preview.items[0].correct, false);
            assert.equal(preview.remaining, 2);
            const filtered = await readUpcoming(uid, python);
            assert.equal(filtered.remaining, 2);
            assert.deepEqual(filtered.items.map((item) => item.id), [3]);
            assert.equal(filtered.items[0].current, false);
            assert.equal(filtered.items[0].index, 3, 'Classroom filtering must never redraw or renumber the student sequence');
        } finally { await daily.sessionColl.updateOne({ _id: `${uid}-${today}` }, { $set: { cursor: 2 } }); }
    });
    await check('Completed, empty and disabled days explain today accurately; tomorrow excludes unsettled correct answers and cooled-down errors', async () => {
        const uid = roster.completed.uid;
        await daily.sessionColl.updateOne({ _id: `${uid}-${today}` }, { $set: { cursor: 2 } });
        try {
            const preview = await readUpcoming(uid);
            assert.equal(preview.status, 'completed', 'Last answer saved means login no longer gates, even without pressing Next');
            assert.deepEqual(preview.items, []);
            assert.equal(preview.remaining, 0);
            assert.equal(preview.next.day, offsetDay(1));
            assert.equal(preview.next.projected, true);
            assert.equal(preview.next.status, 'ready');
            assert(!preview.next.items.some((item) => item.domainId === python && sourceIds[python].slice(0, 2).includes(item.sourceId)));
            assert(!preview.next.items.some((item) => item.domainId === cpp && item.sourceId === sourceIds[cpp][2]));
            assert.equal((await daily.sessionColl.findOne({ _id: `${uid}-${today}` })).settledAnswers, 0);
        } finally { await daily.sessionColl.updateOne({ _id: `${uid}-${today}` }, { $set: { cursor: 3 } }); }
        const empty = await readUpcoming(roster.empty.uid);
        assert.equal(empty.status, 'empty');
        assert.equal(empty.projected, false);
        assert.equal(empty.next.day, offsetDay(1));
        const disabled = await readUpcoming(roster.disabled.uid);
        assert.equal(disabled.status, 'disabled');
        assert.deepEqual(disabled.items, []);
        assert.equal(disabled.next, undefined);
    });
    await check('Upcoming attachment URLs verify teacher scope and source identity, including source changes after preview', async () => {
        const uid = roster.notStarted.uid;
        const source = await document.coll.findOne({ domainId: python, docType: document.TYPE_PROBLEM, docId: sourceId });
        await problems.edit(python, sourceId, { objective: protectedQuestion.objective });
        try {
            const preview = await readUpcoming(uid);
            assert.equal(preview.status, 'ready');
            const question = preview.items.find((item) => item.sourceId === sourceId);
            const url = question.stem.match(/!\[[^\]]*\]\(([^)]+)\)/)[1];
            assert(url.includes(`/upcoming/${today}/${python}/${sourceId}/file/`));
            for (const text of [question.stem, question.options[0], question.analysis]) assert(!text.includes('file://'));
            assert.deepEqual((await teacher.get(url)).body, privatePng);
            denied(await get(url, learner));
            redirectedTo(await get(url, withoutSudo), '/user/sudo');
            redirectedTo(await get(url, supertest.agent(httpServer)), '/login');
            denied(await get(url.replace(`/${python}/${sourceId}/file/`, `/${python}/999999/file/`)));
            denied(await get(url.replace('trace.png', 'not-referenced.png')));
            const policy = roster.notStarted.policy;
            await daily.savePolicy(uid, { ...policy, domains: policy.domains.map((rule) => ({ ...rule, tags: ['循环'] })) }, teacherId);
            try { denied(await get(url)); } finally { await daily.savePolicy(uid, policy, teacherId); }
            await domains.setUserInDomain(python, uid, { join: false, role: 'guest' });
            try { denied(await get(url)); } finally { await domains.setUserInDomain(python, uid, { join: true, role: 'default' }); }
        } finally { await problems.edit(python, sourceId, { objective: source.objective }); }
    });
    await check('Projected selection exactly matches later login across domains, invalid assets, mastered questions, cooldown and point slots', async () => {
        const uid = await users.createInDomain(python, 'preview-exact@example.test', 'preview_exact', 'LocalTest123!');
        await domains.setUserInDomain(python, uid, { join: true, role: 'default' });
        await domains.setUserInDomain(cpp, uid, { join: true, role: 'default' });
        const policy = { version: 1, enabled: true, cooldownRounds: 3, domains: [
            { domainId: python, enabled: true, count: 3, tags: [], points: [2, 4, 6] },
            { domainId: cpp, enabled: true, count: 2, tags: [], points: [8, 10] },
        ] };
        await daily.savePolicy(uid, policy, teacherId);
        const fixedNow = timestamp(offsetDay(2));
        const priorDay = offsetDay(1);
        const prior = {
            _id: `${uid}-${priorDay}`, uid, day: priorDay, round: 5, cooldownRounds: 3, cursor: 2, requested: 2,
            items: [question(1, python, true, priorDay), question(2, python, false, priorDay)],
            createdAt: timestamp(priorDay), settledAnswers: 0,
        };
        await daily.sessionColl.insertOne(prior);
        await daily.progressColl.insertOne({ _id: `${uid}:${cpp}:${sourceIds[cpp][0]}`, uid, domainId: cpp,
            sourceId: sourceIds[cpp][0], mastered: false, lastRound: 1, lastDay: offsetDay(-3) });
        const brokenSource = await problems.add(python, 'PREVIEW-BROKEN', '缺少图片的素材', '', teacherId, [], {
            hidden: true, objectiveKind: 'single', objective: { ...sourceQuestion, stem: '![图](file://missing.png)' },
        });
        try {
            const before = await readOnlyState();
            const preview = await daily.getAdminUpcoming(uid, '', fixedNow);
            const filtered = await daily.getAdminUpcoming(uid, cpp, fixedNow);
            assert.deepEqual(filtered.items.map((item) => item.sourceId), preview.items.filter((item) => item.domainId === cpp).map((item) => item.sourceId));
            assert.deepEqual(await readOnlyState(), before);
            assert.equal(preview.requested, 5);
            assert.equal(preview.total, 3, 'Only one eligible Python material plus two C++ choices; missing attachment is skipped');
            assert.equal(preview.items.filter((item) => item.domainId === python)[0].sourceId, sourceIds[python][2]);
            assert.equal(preview.items.filter((item) => item.domainId === cpp)[0].sourceId, sourceIds[cpp][0], 'Due error review ranks before unseen choices');
            assert.deepEqual(preview.items.map((item) => item.points), [2, 8, 10]);
            const actual = await daily.getSession(uid, fixedNow);
            const fields = (item) => [item.id, item.domainId, item.sourceId, item.points];
            assert.deepEqual(preview.items.map(fields), actual.session.items.map(fields));
            assert.equal(daily.presentSession(actual.policy, actual.session, fixedNow).current.id, preview.currentQuestionId);
            assert.equal(actual.session.round, 6);
        } finally {
            await problems.del(python, brokenSource);
            for (const did of [python, cpp]) await domains.setUserInDomain(did, uid, { join: false, role: 'guest' });
        }
    });

    console.log(`RESULT ${results.filter(Boolean).length}/${results.length} daily dashboard checks passed`);
    clearTimeout(timeout);
    if (process.env.DAILY_DASHBOARD_SERVE === '1' && results.every(Boolean)) {
        for (const [index, name] of ['谢果果', '周奕凡'].entries()) {
            const uid = await users.createInDomain(python, `dashboard-extra${index}@example.test`, `dashboard_extra${index}`, 'LocalTest123!');
            await domains.setUserInDomain(python, uid, { join: true, role: 'default', displayName: name });
            await users.setById(uid, { defaultDomain: python });
            await daily.savePolicy(uid, roster.notStarted.policy, teacherId);
            if (index) await session(uid, [question(1, python, false), question(2, python, false), question(3, python, null)]);
        }
        console.log(`SMOKE ${JSON.stringify({
            origin: `http://localhost:${port}`, username: 'dashboard_teacher', password: 'LocalTest123!',
            dashboardUrl: `http://localhost:${port}${base}`, today, yesterday, python, cpp,
            students: Object.fromEntries(Object.entries(roster).map(([key, value]) => [key, { uid: value.uid, name: value.name }])),
        })}`);
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
