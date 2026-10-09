/* eslint-disable no-await-in-loop -- Fixture changes and HTTP scenarios deliberately run in order. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const supertest = require('supertest');

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
        version: 1, kind: 'single', stem: '下面代码会输出什么？\n\n```python\nprint(2 + 3)\n```',
        options: ['5', '23', '2 + 3', '没有输出'], answers: ['A'], analysis: '两个整数相加得到 5，`print` 会将结果输出。',
    };
    const sourceId = await problems.add(python, 'DASHBOARD1', '变量与输出', objectiveContent(sourceQuestion), teacherId,
        ['基础运算'], { hidden: true, objectiveKind: 'single', objective: sourceQuestion, config: objectiveConfig(sourceQuestion) });
    const privatePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2XkAAAAASUVORK5CYII=', 'base64');
    const originalFile = `problem/${python}/${sourceId}/additional_file/trace.png`;
    const snapshotFile = `daily-quiz/dashboard-fixture/${roster.completed.uid}/trace.png`;
    await storage.put(originalFile, privatePng, teacherId);
    await storage.copy(originalFile, snapshotFile);

    function question(index, domainId, result, day = today, extra = {}) {
        const objective = index % 3 === 2 ? {
            version: 1, kind: 'judge', stem: '循环结构可以让一段代码重复执行。',
            options: ['正确', '错误'], answers: ['A'], analysis: '循环会根据条件重复执行代码。',
        } : index % 3 === 0 ? {
            version: 1, kind: 'multiple', stem: '哪些写法可以让变量 `x` 增加 1？',
            options: ['`x = x + 1`', '`x = 1`', '`x += 1`', '`x = x - 1`'], answers: ['A', 'C'],
            analysis: '第一项和第三项都是在原来数值的基础上增加 1。',
        } : { ...sourceQuestion };
        const answer = result === null ? {} : { answer: {
            selected: result ? objective.answers : ['B'], correct: result, earnedPoints: result ? 3 : 0,
            answeredAt: timestamp(day, index * 7),
        } };
        return {
            id: index, domainId, domainName: domainId === python ? 'Python 思维进阶' : 'C++ 算法启航',
            sourceId, title: ['变量与输出', '循环的作用', '认识自增运算'][(index - 1) % 3],
            tags: index % 3 === 2 ? ['循环', '条件判断'] : ['变量', '基础运算'], points: 3,
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
    let dashboard;
    await check('Overview classifies completed, partial, unstarted, disabled and empty sessions without leaking answers', async () => {
        const response = await get();
        status(response, 200);
        dashboard = response.body.dashboard;
        assert.equal(dashboard.day, today);
        assert.equal(dashboard.today, today);
        assert.equal(dashboard.classroom, '');
        assert.equal(dashboard.rows.length, definitions.length);
        assert.deepEqual(Object.fromEntries(dashboard.rows.map((row) => [row.name, row.status])), {
            林小禾: 'completed', 陈星宇: 'inProgress', 周沐辰: 'notStarted', 许朵朵: 'disabled',
            王乐言: 'noQuestions', 张一诺: 'notStarted', 李知远: 'completed', 苏安安: 'completed',
        });
        assert.deepEqual(dashboard.stats, {
            assigned: 6, completed: 3, inProgress: 1, notStarted: 2, noQuestions: 1, disabled: 1, unrecorded: 0,
            answered: 9, correctCount: 5, wrongCount: 4, earnedPoints: 15, accuracy: 5 / 9 * 100,
        });
        const row = dashboard.rows.find((item) => item.uid === roster.notStarted.uid);
        assert.equal(row.total, 3);
        assert.equal(row.answered, 0);
        assert.equal(row.accuracy, null);
        assert.equal(row.lastAnsweredAt, null);
        assert(dashboard.rows.every((item) => item.detailUrl.includes(`${base}/student/${item.uid}`)));
        assert(dashboard.rows.every((item) => item.settingsUrl.includes(`/manage/users?uid=${item.uid}`)));
        assert(!JSON.stringify(dashboard.rows).includes('objective'));
        assert(!JSON.stringify(dashboard.rows).includes('analysis'));
        assert(!JSON.stringify(dashboard).includes('不可见的其他工作区学员'));
    });
    await check('Read-only dashboard and details never create, settle or mutate a daily session or policy', async () => {
        const beforeSessions = await daily.sessionColl.find().sort({ _id: 1 }).toArray();
        const beforePolicies = await daily.configColl.find().sort({ _id: 1 }).toArray();
        for (const url of [base, `${base}?day=${yesterday}`, detail(roster.notStarted.uid), detail(roster.empty.uid),
            detail(roster.completed.uid), detail(roster.notStarted.uid, `?day=${yesterday}`)]) status(await get(url), 200);
        assert.deepEqual(await daily.sessionColl.find().sort({ _id: 1 }).toArray(), beforeSessions);
        assert.deepEqual(await daily.configColl.find().sort({ _id: 1 }).toArray(), beforePolicies);
        assert.equal(await daily.sessionColl.countDocuments({ uid: roster.notStarted.uid }), 0);
    });
    await check('Classroom filtering scopes both roster and question counts, including cross-classroom completion', async () => {
        const response = await get(`${base}?classroom=${cpp}`);
        status(response, 200);
        const filtered = response.body.dashboard;
        assert.deepEqual(filtered.rows.map((row) => row.uid).sort(), [roster.completed.uid, roster.partial.uid].sort());
        assert.equal(filtered.classroom, cpp);
        assert.equal(filtered.stats.assigned, 2);
        assert.equal(filtered.stats.completed, 2);
        assert.equal(filtered.stats.answered, 2);
        assert.equal(filtered.stats.correctCount, 1);
        assert.equal(filtered.stats.wrongCount, 1);
        assert.equal(filtered.stats.earnedPoints, 3);
        assert.equal(filtered.stats.accuracy, 50);
        for (const row of filtered.rows) {
            assert.equal(row.total, 1);
            assert.equal(row.answered, 1);
            const detailResponse = await get(row.detailUrl);
            status(detailResponse, 200);
            assert.equal(detailResponse.body.report.items.length, 1);
            assert.equal(detailResponse.body.report.items[0].domainId, cpp);
        }
        denied(await get(detail(roster.empty.uid, `?classroom=${cpp}`)));
    });
    await check('Historical absence means unrecorded instead of missed, and the seven-day trend uses answer-weighted accuracy', async () => {
        const response = await get(`${base}?day=${yesterday}`);
        status(response, 200);
        const historical = response.body.dashboard;
        assert.equal(historical.stats.unrecorded, 6);
        assert.equal(historical.stats.notStarted, 0);
        assert.equal(historical.stats.disabled, 0);
        assert.equal(historical.stats.assigned, 2);
        assert.equal(historical.stats.completed, 1);
        assert.equal(historical.stats.inProgress, 1);
        assert.equal(historical.stats.answered, 4);
        assert.equal(historical.stats.accuracy, 50);
        const absent = historical.rows.find((row) => row.uid === roster.disabled.uid);
        assert.equal(absent.status, 'unrecorded');
        assert.equal(absent.total, 0);
        const noRecord = (await get(detail(roster.notStarted.uid, `?day=${yesterday}`))).body.report;
        assert.equal(noRecord.total, 0);
        assert.equal(noRecord.answered, 0);
        assert.equal(noRecord.completed, false);
        assert.equal(dashboard.trend.length, 7);
        assert.equal(dashboard.trend[0].day, offsetDay(-6));
        assert.equal(dashboard.trend.at(-1).day, today);
        assert.deepEqual(dashboard.trend.at(-1), { day: today, answered: 9, correctCount: 5, accuracy: 5 / 9 * 100, participants: 4, completed: 3 });
        assert.deepEqual(dashboard.trend.at(-2), { day: yesterday, answered: 4, correctCount: 2, accuracy: 50, participants: 2, completed: 1 });
        assert.equal(dashboard.trend[0].accuracy, null);
        assert.equal(historical.trend.at(-1).day, yesterday);
    });
    await check('A session containing only another classroom never implies an empty assignment in the selected classroom', async () => {
        const { uid, policy } = roster.zeroAnswered;
        await domains.setUserInDomain(cpp, uid, { join: true, role: 'default' });
        await daily.savePolicy(uid, { ...policy, domains: [...policy.domains,
            { domainId: cpp, enabled: true, count: 1, tags: [], points: [3] }] }, teacherId);
        await session(uid, [question(1, python, true, yesterday)], yesterday);
        try {
            const current = (await get(`${base}?classroom=${cpp}`)).body.dashboard;
            const row = current.rows.find((item) => item.uid === uid);
            assert.equal(row.status, 'notStarted');
            assert.equal(row.total, 1);
            assert.equal(row.answered, 0);
            const historical = (await get(`${base}?classroom=${cpp}&day=${yesterday}`)).body.dashboard;
            assert.equal(historical.rows.find((item) => item.uid === uid).status, 'unrecorded');
            const report = (await get(detail(uid, `?classroom=${cpp}`))).body.report;
            assert.equal(report.total, 0);
            assert.equal(report.completed, false);
        } finally {
            await daily.sessionColl.deleteOne({ _id: `${uid}-${yesterday}` });
            await daily.savePolicy(uid, policy, teacherId);
            await domains.setUserInDomain(cpp, uid, { join: false, role: 'guest' });
        }
    });
    await check('Detail returns only the requested authorized learner and preserves correct, wrong and unanswered snapshots', async () => {
        const response = await get(detail(roster.partial.uid));
        status(response, 200);
        assert.deepEqual(response.body.student, { uid: roster.partial.uid, name: roster.partial.name, uname: roster.partial.uname });
        const report = response.body.report;
        assert.equal(report.total, 3);
        assert.equal(report.answered, 2);
        assert.equal(report.completed, false);
        assert.deepEqual(report.items.map((item) => item.correct), [true, false, null]);
        assert.deepEqual(report.items.map((item) => item.selected), [['A'], ['B'], null]);
        assert.deepEqual(report.items[2].answers, ['A', 'C']);
        assert(report.items.every((item) => item.stem && item.analysis && item.options.length));
        const cancelled = (await get(detail(roster.cancelled.uid))).body.report;
        assert.deepEqual(cancelled.items.map((item) => item.id), [1, 3]);
        assert.equal(cancelled.correctCount, 1);
        assert.equal(cancelled.wrongCount, 1);
        const retained = dashboard.rows.find((row) => row.uid === roster.disabledDone.uid);
        assert.equal(retained.enabled, false);
        assert.equal(retained.status, 'completed');
        assert.equal(retained.answered, 2);
        for (const uid of [teacherId, foreignUid, 999999]) denied(await get(detail(uid)));
    });
    await check('Private attachment references are rewritten, protected and independent of source edits or deletion', async () => {
        const report = (await get(detail(roster.completed.uid))).body.report;
        const item = report.items[0];
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
        denied(await get(fileUrl.replace(`/daily-quiz/${roster.completed.uid}/`, `/daily-quiz/${foreignUid}/`)));
        denied(await get(fileUrl.replace('/file/1/', '/file/999/')));
        denied(await get(fileUrl.replace('trace.png', 'unknown.png')));
        await problems.edit(python, sourceId, { objective: { ...sourceQuestion, stem: '已修改的题面' } });
        assert.equal((await get(detail(roster.completed.uid))).body.report.items[0].stem, item.stem);
        await problems.del(python, sourceId);
        assert.equal(await storage.getMeta(originalFile), null);
        assert.deepEqual((await teacher.get(fileUrl)).body, privatePng);
        assert.equal((await get(detail(roster.completed.uid))).body.report.items[0].stem, item.stem);
    });
    await check('Malformed, impossible or future dates and foreign classrooms are rejected by both read routes', async () => {
        for (const query of ['day=not-a-day', 'day=2026-02-30', 'day=2026-2-03', `day=${offsetDay(1)}`,
            'classroom=does-not-exist', `classroom=${foreignDomain}`, 'classroom=%3Cscript%3E']) {
            denied(await get(`${base}?${query}`));
            denied(await get(detail(roster.completed.uid, `?${query}`)));
        }
        for (const uid of ['abc', '-1', '1.5']) denied(await get(detail(uid)));
    });
    await check('Changing workspace or blocked classroom membership immediately removes report and image access', async () => {
        await workspace.addStudent(foreignWorkspace._id, roster.completed.uid, teacherId);
        try {
            assert(!(await get()).body.dashboard.rows.some((row) => row.uid === roster.completed.uid));
            denied(await get(detail(roster.completed.uid)));
            denied(await get(`/manage/users/daily-quiz/${roster.completed.uid}/${today}/file/1/trace.png`));
        } finally {
            await workspace.disableStudent(foreignWorkspace._id, roster.completed.uid);
        }
        await domains.setUserInDomain(python, roster.zeroAnswered.uid, { blockedByStudentManagement: true });
        try {
            assert(!(await get()).body.dashboard.rows.some((row) => row.uid === roster.zeroAnswered.uid));
            denied(await get(detail(roster.zeroAnswered.uid)));
        } finally {
            await domains.setUserInDomain(python, roster.zeroAnswered.uid, { blockedByStudentManagement: false });
        }
    });
    await check('Actual dashboard HTML renders the selected date and Chinese learners with a working management navigation entry', async () => {
        const page = await teacher.get(base).set('Accept', 'text/html');
        status(page, 200);
        assert(page.text.includes('每日问答'));
        assert(page.text.includes(today));
        assert(page.text.includes(roster.completed.name));
        assert(!page.text.includes('不可见的其他工作区学员'));
        const management = await teacher.get('/manage/users').set('Accept', 'text/html');
        status(management, 200);
        assert(management.text.includes('/manage/daily-quiz'));
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
