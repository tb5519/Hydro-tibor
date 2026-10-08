/* eslint-disable no-await-in-loop -- Isolated HTTP scenarios mutate shared fixtures in order. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const supertest = require('supertest');

// CI creates a fresh in-memory MongoDB; never load the developer or production database.
process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-daily-management-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.DAILY_MANAGEMENT_PORT || '18894';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => {
    console.error('Daily management integration timed out');
    process.exit(1);
}, 150000);
const results = [];
async function check(name, fn) {
    try {
        await fn();
        results.push(true);
        console.log(`PASS ${name}`);
    } catch (error) {
        results.push(false); console.error(`FAIL ${name}\n${error.stack}`);
    }
}
function status(res, expected) {
    assert.equal(res.status, expected, `${res.status}: ${res.text?.slice(0, 500)}`);
}
function denied(res) { assert(res.status >= 400 && res.status < 500, `${res.status}: ${res.text?.slice(0, 300)}`); }

async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, httpServer } = require('hydrooj');
    const daily = require('../packages/hydrooj/src/model/daily_quiz');
    const storage = require('../packages/hydrooj/src/model/storage').default;
    const workspace = require('../packages/hydrooj/src/model/workspace').default;
    const { objectiveContent, objectiveConfig } = require('../packages/hydrooj/src/lib/objective');
    const adminId = await users.create('daily-admin@example.test', 'daily_admin', 'LocalTest123!');
    await users.setSuperAdmin(adminId);
    const firstDomain = `daily-python-${Date.now()}`;
    const secondDomain = `daily-cpp-${Date.now()}`;
    const extraDomain = `daily-other-${Date.now()}`;
    for (const [id, name] of [[firstDomain, 'Python 训练'], [secondDomain, 'C++ 训练'], [extraDomain, '未加入的课堂']]) {
        await domains.add(id, adminId, name, 'Isolated daily quiz fixture');
    }
    const studentId = await users.createInDomain(firstDomain, 'daily-student@example.test', 'daily_student', 'LocalTest123!');
    const otherId = await users.createInDomain(firstDomain, 'daily-other@example.test', 'daily_other', 'LocalTest123!');
    for (const uid of [studentId, otherId]) {
        await domains.setUserInDomain(firstDomain, uid, { join: true, role: 'default', displayName: uid === studentId ? '小禾' : '星星' });
        await users.setById(uid, { defaultDomain: firstDomain });
    }
    await domains.setUserInDomain(secondDomain, studentId, { join: true, role: 'default', displayName: '小禾' });
    async function source(domainId, index, kind = 'single') {
        const question = {
            version: 1, kind,
            stem: (index % 2 ? '执行 `print(2 + 3)`，屏幕上会显示什么？' : '下面哪种结构适合重复执行一段代码？')
                + (index === 1 ? '\n\n![私有题干图片](file://private-statement.png)' : ''),
            options: kind === 'judge' ? ['正确', '错误'] : index % 2 ? ['5', '23', '2 + 3', '没有输出'] : ['循环结构', '注释', '变量名', '文件名'],
            answers: ['A'], analysis: index % 2 ? '两个整数相加得到 5，`print` 会把结果显示出来。' : '循环能够按条件重复执行一段代码。',
        };
        return problems.add(domainId, `DQ${index}`, `每日热身素材 ${index}`, objectiveContent(question), adminId,
            kind === 'judge' ? ['判断题知识点'] : index % 2 ? ['基础运算'] : ['循环'],
            { hidden: true, objectiveKind: kind, objective: question, config: objectiveConfig(question) });
    }
    const firstSource = await source(firstDomain, 1);
    const privatePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2XkAAAAASUVORK5CYII=', 'base64');
    await storage.put(`problem/${firstDomain}/${firstSource}/additional_file/private-statement.png`, privatePng, adminId);
    await source(firstDomain, 2);
    await source(firstDomain, 3, 'judge');
    await source(secondDomain, 4);
    const admin = supertest.agent(httpServer);
    const student = supertest.agent(httpServer);
    const freshAdmin = supertest.agent(httpServer);
    for (const [agent, uname] of [[admin, 'daily_admin'], [student, 'daily_student'], [freshAdmin, 'daily_admin']]) {
        status(await agent.post('/login').send({ uname, password: 'LocalTest123!' }), 302);
    }
    const get = (agent, url) => agent.get(url).set('Accept', 'application/json');
    const url = `/manage/users?uid=${studentId}`;
    const save = (agent, uid, policy) => agent.post('/manage/users').set('Accept', 'application/json')
        .send({ operation: 'save_daily_quiz', uid, policy: JSON.stringify(policy) });
    const policy = {
        version: 1, enabled: true, cooldownRounds: 3,
        domains: [
            { domainId: firstDomain, enabled: true, count: 2,
                // Matching tags beyond position 20 must survive saving and daily selection.
                tags: [...Array.from({ length: 24 }, (_, index) => `知识点${index + 1}`), '基础运算', '循环'], points: [0, 3] },
            { domainId: secondDomain, enabled: true, count: 1, tags: ['循环'], points: [2] },
        ],
    };

    await check('A fresh admin session must complete sudo before saving a daily policy', async () => {
        const response = await save(freshAdmin, studentId, policy);
        assert(response.status === 302 || response.body.url?.includes('/user/sudo'));
        assert.equal((await daily.getPolicy(studentId)).enabled, false);
    });
    // Exercise the ordinary sudo flow rather than changing session state directly.
    status(await admin.get('/manage/users'), 302);
    status(await admin.post('/user/sudo').send({ password: 'LocalTest123!' }), 302);

    await check('Management defaults off and includes joined-domain catalog without private answers', async () => {
        const response = await get(admin, url);
        status(response, 200);
        const data = response.body.selectedDailyQuiz;
        assert.equal(data.policy.enabled, false);
        assert.equal(data.domains.length, 2);
        const python = data.domains.find((item) => item.id === firstDomain);
        assert.equal(python.availableCount, 3, 'Single-choice, multiple-choice and judgment material share the daily catalog');
        assert.equal(python.questionTags.length, 3);
        assert(python.tags.some((item) => item.name === '循环' && item.count === 1));
        assert(python.tags.some((item) => item.name === '判断题知识点' && item.count === 1));
        assert(!JSON.stringify(data.domains).includes('answers'));
        const entry = response.body.students.find((item) => item.uid === studentId);
        assert.equal(entry.dailyQuizEnabled, false);
        assert.deepEqual(entry.domainIds.sort(), [firstDomain, secondDomain].sort());
    });
    await check('An authorized admin saves more than 20 knowledge tags without truncating the policy', async () => {
        const response = await save(admin, studentId, policy);
        status(response, 200);
        assert.equal(response.body.saved, true);
        assert.deepEqual(response.body.selectedDailyQuiz.policy, policy);
        const page = await get(admin, url);
        const entry = page.body.students.find((item) => item.uid === studentId);
        assert.equal(entry.dailyQuizEnabled, true);
        assert.equal(entry.dailyQuizDomains, 2);
    });
    await check('Students cannot read another learner configuration or save their own policy', async () => {
        denied(await get(student, `/manage/users?uid=${otherId}`));
        denied(await save(student, studentId, { ...policy, enabled: false }));
        assert.equal((await daily.getPolicy(studentId)).enabled, true);
    });
    await check('Policies cannot target an unjoined or foreign domain', async () => {
        for (const domainId of [extraDomain, 'nonexistent-domain']) {
            denied(await save(admin, studentId, { ...policy, domains: [{ ...policy.domains[0], domainId }] }));
        }
        assert.deepEqual(await daily.getPolicy(studentId), policy);
    });
    await check('Invalid counts, points and duplicate domains are rejected without changing the policy', async () => {
        for (const invalid of [
            { ...policy, domains: [{ ...policy.domains[0], count: 0 }] },
            { ...policy, domains: [{ ...policy.domains[0], points: [3] }] },
            { ...policy, domains: [{ ...policy.domains[0], points: [0, -1] }] },
            { ...policy, domains: [policy.domains[0], policy.domains[0]] },
            { ...policy, cooldownRounds: 0 },
        ]) denied(await save(admin, studentId, invalid));
        assert.deepEqual(await daily.getPolicy(studentId), policy);
    });
    await check('Teachers can inspect each correct, wrong and unanswered item for a chosen day', async () => {
        let state = (await get(student, '/daily-quiz/status')).body.state;
        const day = state.day;
        const initialReport = (await get(admin, `${url}&quizDay=${day}`)).body.selectedDailyQuiz.report;
        assert.equal(initialReport.total, 3);
        assert.equal(initialReport.answered, 0);
        assert(initialReport.items.every((item) => item.correct === null && item.selected === null));
        let answerIndex = 0;
        while (state.current) {
            const answer = await student.post('/daily-quiz').set('Accept', 'application/json').send({
                operation: 'answer', sessionId: state.sessionId, questionId: state.current.id,
                answers: [answerIndex === 1 ? 'B' : 'A'],
            });
            status(answer, 200);
            state = answer.body.state;
            const next = await student.post('/daily-quiz').set('Accept', 'application/json').send({
                operation: 'next', sessionId: state.sessionId, questionId: state.current.id,
            });
            status(next, 200);
            state = next.body.state;
            answerIndex++;
        }
        const response = await get(admin, `${url}&quizDay=${day}`);
        status(response, 200);
        const { report, summary } = response.body.selectedDailyQuiz;
        assert.equal(report.total, 3);
        assert.equal(report.answered, 3);
        assert.equal(report.correctCount, 2);
        assert.equal(report.wrongCount, 1);
        assert.equal(report.completed, true);
        const wrong = report.items.find((item) => item.correct === false);
        assert.deepEqual(wrong.selected, ['B']);
        assert.deepEqual(wrong.answers, ['A']);
        assert(wrong.stem && wrong.analysis && wrong.options.length === 4);
        assert.equal(wrong.earnedPoints, 0);
        assert.equal(summary.answeredCount, 3);
        assert.equal(summary.wrongCount, 1);
        const row = response.body.students.find((item) => item.uid === studentId);
        assert.equal(row.todayDailyQuiz.completed, true);
        assert.equal(row.todayDailyQuiz.correctCount, 2);
        const sourceBefore = report.items.find((item) => item.title === '每日热身素材 1');
        const original = await problems.get(firstDomain, firstSource);
        await problems.edit(firstDomain, firstSource, { objective: { ...original.objective, stem: '老师修改后的新题面' } });
        const unchanged = (await get(admin, `${url}&quizDay=${day}`)).body.selectedDailyQuiz.report;
        assert.equal(unchanged.items.find((item) => item.title === sourceBefore.title).stem, sourceBefore.stem);
        await problems.edit(firstDomain, firstSource, { objective: original.objective });
        const empty = await get(admin, `${url}&quizDay=2000-01-01`);
        status(empty, 200);
        assert.equal(empty.body.selectedDailyQuiz.report.answered, 0);
        assert.equal(empty.body.selectedDailyQuiz.report.completed, false);
        denied(await get(admin, `${url}&quizDay=2026-02-30`));
    });
    await check('Historical private PNG snapshots require teacher scope and survive deleting the original source', async () => {
        const report = (await get(admin, url)).body.selectedDailyQuiz.report;
        const item = report.items.find((question) => question.title === '每日热身素材 1');
        const imageUrl = item.stem.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];
        assert(imageUrl, 'Management report must rewrite the private file reference');
        assert(imageUrl.includes(`/manage/users/daily-quiz/${studentId}/${report.day}/file/${item.id}/`));
        assert(!item.stem.includes('file://'));
        const before = await admin.get(imageUrl);
        status(before, 200);
        assert.match(before.headers['content-type'], /^image\/png/);
        assert.equal(before.headers['cache-control'], 'private, no-store');
        assert.equal(before.headers['x-content-type-options'], 'nosniff');
        assert.deepEqual(before.body, privatePng);
        denied(await get(student, imageUrl));
        const guest = await get(supertest.agent(httpServer), imageUrl);
        assert(guest.status === 302 || guest.body.url?.startsWith('/login?'));
        assert(!guest.headers['content-type']?.startsWith('image/'));
        const withoutSudo = await get(freshAdmin, imageUrl);
        assert(withoutSudo.status === 302 || withoutSudo.body.url?.includes('/user/sudo'));
        assert(!withoutSudo.headers['content-type']?.startsWith('image/'));
        denied(await get(admin, imageUrl.replace(`/daily-quiz/${studentId}/`, `/daily-quiz/${otherId}/`)));
        denied(await get(admin, imageUrl.replace(`/${report.day}/file/`, '/2000-01-01/file/')));
        denied(await get(admin, imageUrl.replace(`/file/${item.id}/`, '/file/999/')));
        denied(await get(admin, imageUrl.replace('private-statement.png', 'unreferenced.png')));

        await problems.del(firstDomain, firstSource);
        assert.equal(await problems.get(firstDomain, firstSource), null);
        assert.equal(await storage.getMeta(`problem/${firstDomain}/${firstSource}/additional_file/private-statement.png`), null);
        const after = await admin.get(imageUrl);
        status(after, 200);
        assert.deepEqual(after.body, privatePng, 'The historical image must use its independent session snapshot');
        const preserved = (await get(admin, `${url}&quizDay=${report.day}`)).body.selectedDailyQuiz.report;
        assert.equal(preserved.items.find((question) => question.id === item.id).stem, item.stem);

        // Keep the optional browser fixture's original question pool available.
        const restored = await source(firstDomain, 1);
        await storage.put(`problem/${firstDomain}/${restored}/additional_file/private-statement.png`, privatePng, adminId);
    });
    await check('Legacy management cannot configure students in a modern workspace', async () => {
        const foreign = await workspace.create(`daily-foreign-${Date.now()}`, 'Modern workspace', adminId);
        await workspace.addStudent(foreign._id, otherId, adminId);
        denied(await save(admin, otherId, policy));
        denied(await get(admin, `/manage/users?uid=${otherId}`));
        assert.equal((await daily.getPolicy(otherId)).enabled, false);
    });
    await check('Removing classroom membership removes it from editable policy and blocks stale saves', async () => {
        await domains.setUserInDomain(secondDomain, studentId, { join: false, role: 'guest' });
        const response = await get(admin, url);
        status(response, 200);
        assert.equal(response.body.selectedDailyQuiz.domains.length, 1);
        assert.equal(response.body.selectedDailyQuiz.policy.domains.length, 1);
        denied(await save(admin, studentId, policy));
        await domains.setUserInDomain(secondDomain, studentId, { join: true, role: 'default' });
    });
    await check('Disabling daily quiz retains the teacher settings and clears roster enabled state', async () => {
        const disabled = { ...policy, enabled: false };
        status(await save(admin, studentId, disabled), 200);
        assert.deepEqual(await daily.getPolicy(studentId), disabled);
        const response = await get(admin, url);
        assert.equal(response.body.students.find((item) => item.uid === studentId).dailyQuizEnabled, false);
    });
    await check('The real management template renders the learner details and daily quiz settings', async () => {
        const response = await admin.get(url).set('Accept', 'text/html');
        status(response, 200);
        assert(response.text.includes('每日问答'));
        assert(response.text.includes('小禾'));
        assert(response.text.includes('data-student-search'));
    });
    await check('Reopening settings includes new hidden choice and judgment tags in OJ and Scratch, but excludes whole-paper tags', async () => {
        const scratchDomain = `daily-scratch-${Date.now()}`;
        await domains.add(scratchDomain, adminId, 'Scratch 知识课堂', 'Daily catalog regression', undefined, 'scratch');
        await domains.setUserInDomain(scratchDomain, studentId, { join: true, role: 'default' });
        const before = await get(admin, url);
        assert.equal(before.body.selectedDailyQuiz.domains.find((item) => item.id === scratchDomain).availableCount, 0);
        const saved = await daily.getPolicy(studentId);
        async function newSource(domainId, pid, tags, kind = 'single') {
            const question = { version: 1, kind, stem: 'Which choices are correct?', options: ['First', 'Second', 'Third'],
                answers: kind === 'multiple' ? ['A', 'C'] : ['A'], analysis: 'PRIVATE_CATALOG_ANALYSIS' };
            return problems.add(domainId, pid, 'New tagged material', objectiveContent(question), adminId, tags,
                { hidden: true, objectiveKind: kind, objective: question });
        }
        await newSource(firstDomain, 'NEWTAG1', ['新增单选标签']);
        await newSource(firstDomain, 'NEWTAG2', ['新增多选标签'], 'multiple');
        await newSource(scratchDomain, 'SCRATCHTAG', ['角色与舞台']);
        await newSource(scratchDomain, 'SCRATCHJUDGE', ['只有判断题'], 'judge');
        await problems.add(scratchDomain, 'WHOLEPAPER', 'Existing whole paper', 'Legacy question paper', adminId, ['整卷标签'], { hidden: false });
        const after = await get(admin, url);
        status(after, 200);
        const catalog = after.body.selectedDailyQuiz.domains;
        const oj = catalog.find((item) => item.id === firstDomain);
        assert(oj.tags.some((item) => item.name === '新增单选标签' && item.count === 1));
        assert(oj.tags.some((item) => item.name === '新增多选标签' && item.count === 1));
        const scratch = catalog.find((item) => item.id === scratchDomain);
        assert.equal(scratch.availableCount, 2);
        assert.equal(scratch.tags.length, 2);
        assert(scratch.tags.some((item) => item.name === '角色与舞台' && item.count === 1));
        assert(scratch.tags.some((item) => item.name === '只有判断题' && item.count === 1));
        assert.deepEqual(scratch.questionTags.flat().sort(), ['角色与舞台', '只有判断题'].sort());
        const judgementPolicy = { ...saved, enabled: true,
            domains: [{ domainId: scratchDomain, enabled: true, count: 1, tags: ['只有判断题'], points: [2] }] };
        const configured = await save(admin, studentId, judgementPolicy);
        status(configured, 200);
        assert.deepEqual(configured.body.selectedDailyQuiz.policy.domains[0].tags, ['只有判断题']);
        await daily.savePolicy(studentId, saved, adminId);
        assert(!JSON.stringify(catalog).includes('PRIVATE_CATALOG_ANALYSIS'));
        assert.deepEqual(await daily.getPolicy(studentId), saved, 'Refreshing the source catalog cannot mutate teacher settings');
    });
    console.log(`RESULT ${results.filter(Boolean).length}/${results.length} daily management checks passed`);
    clearTimeout(timeout);
    if (process.env.DAILY_MANAGEMENT_SERVE === '1' && results.every(Boolean)) {
        const demoId = await users.createInDomain(firstDomain, 'daily-demo@example.test', 'daily_demo', 'LocalTest123!');
        for (const domainId of [firstDomain, secondDomain]) {
            await domains.setUserInDomain(domainId, demoId, { join: true, role: 'default', displayName: '晨晨' });
        }
        await users.setById(demoId, { defaultDomain: firstDomain });
        await daily.savePolicy(demoId, policy, adminId);
        const judgeDemoId = await users.createInDomain(firstDomain, 'daily-judge-demo@example.test', 'daily_judge_demo', 'LocalTest123!');
        await domains.setUserInDomain(firstDomain, judgeDemoId, { join: true, role: 'default', displayName: '小禾' });
        await users.setById(judgeDemoId, { defaultDomain: firstDomain });
        await daily.savePolicy(judgeDemoId, {
            version: 1, enabled: true, cooldownRounds: 3,
            domains: [{ domainId: firstDomain, enabled: true, count: 1, tags: ['判断题知识点'], points: [2] }],
        }, adminId);
        console.log(`SMOKE ${JSON.stringify({
            origin: `http://127.0.0.1:${port}`, admin: 'daily_admin', student: 'daily_demo', password: 'LocalTest123!',
            studentId, demoId, firstDomain, secondDomain, manageUrl: `http://127.0.0.1:${port}${url}`,
            judgeStudent: 'daily_judge_demo', judgeDemoId, judgeDomain: firstDomain,
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
