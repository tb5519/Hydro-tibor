/* eslint-disable no-await-in-loop -- HTTP scenarios mutate shared fixtures and must run in order. */
/* Runs real HTTP handlers against an isolated memory database, never the application database. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ObjectId } = require('mongodb');
const supertest = require('supertest');

process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-homework-mistake-test-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
process.argv.push('--port', process.env.HOMEWORK_MISTAKE_TEST_PORT || '18893', '--host', '127.0.0.1');
const timeout = setTimeout(() => {
    console.error('Homework mistake integration timed out');
    process.exit(1);
}, 120000);
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
function denied(res) {
    assert(res.status >= 400 && res.status < 500, `${res.status}: ${res.text?.slice(0, 500)}`);
}

async function run() {
    const {
        UserModel: users, DomainModel: domains, ProblemModel: problems, ContestModel: contests,
        RecordModel: records, httpServer, PERM, STATUS,
    } = require('hydrooj');
    const mistakes = require('../packages/hydrooj/src/model/mistake');
    const workspaces = require('../packages/hydrooj/src/model/workspace').default;
    const domainId = `homework-mistakes-${Date.now()}`;
    const prefix = `/d/${domainId}`;
    const teacherId = await users.create('hm-teacher@example.test', 'hm_teacher', 'LocalTest123!');
    await users.setSuperAdmin(teacherId);
    const studentId = await users.create('hm-student@example.test', 'hm_student', 'LocalTest123!');
    const otherId = await users.create('hm-other@example.test', 'hm_other', 'LocalTest123!');
    const reviewerId = await users.create('hm-reviewer@example.test', 'hm_reviewer', 'LocalTest123!');
    const noReviewId = await users.create('hm-no-review@example.test', 'hm_no_review', 'LocalTest123!');
    await domains.add(domainId, teacherId, 'Homework mistakes integration', 'Isolated memory database');
    await domains.addRole(domainId, 'student', PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM | PERM.PERM_SUBMIT_PROBLEM
    | PERM.PERM_VIEW_CONTEST | PERM.PERM_ATTEND_CONTEST | PERM.PERM_VIEW_RECORD
    | PERM.PERM_VIEW_HOMEWORK | PERM.PERM_ATTEND_HOMEWORK);
    await domains.setUserRole(domainId, studentId, 'student', true);
    await domains.setUserRole(domainId, otherId, 'student', true);
    await domains.addRole(domainId, 'reviewer', PERM.PERM_DEFAULT | PERM.PERM_EDIT_HOMEWORK | PERM.PERM_VIEW_PROBLEM_HIDDEN);
    await domains.addRole(domainId, 'teacher_no_review', PERM.PERM_DEFAULT | PERM.PERM_CREATE_PROBLEM | PERM.PERM_VIEW_PROBLEM_HIDDEN);
    await domains.setUserRole(domainId, reviewerId, 'reviewer', true);
    await domains.setUserRole(domainId, noReviewId, 'teacher_no_review', true);
    const teacher = supertest.agent(httpServer);
    const student = supertest.agent(httpServer);
    const other = supertest.agent(httpServer);
    const reviewer = supertest.agent(httpServer);
    const noReview = supertest.agent(httpServer);
    for (const [agent, uname] of [[teacher, 'hm_teacher'], [student, 'hm_student'], [other, 'hm_other'],
        [reviewer, 'hm_reviewer'], [noReview, 'hm_no_review']]) {
        status(await agent.post('/login').send({ uname, password: 'LocalTest123!' }), 302);
    }

    async function programming(pid, hidden = false) {
        const id = await problems.add(domainId, pid, `Mistake fixture ${pid}`, 'Print 1.', teacherId, ['循环'], { hidden });
        await problems.edit(domainId, id, { config: 'type: default\ntime: 1s\nmemory: 256m\n' });
        return id;
    }
    const publicId = await programming('HMPUBLIC');
    const hiddenId = await programming('HMHIDDEN', true);
    const unrelatedId = await programming('HMUNRELATED', true);
    const reviewId = await programming('HMREVIEW', true);
    const objectiveId = await problems.add(domainId, 'HMOBJECTIVE', 'Objective paper', '{{ select(1) }}\n\n- A\n- B', teacherId);
    await problems.edit(domainId, objectiveId, { config: 'type: objective\nanswers:\n  1: [A, 100]\n' });
    const beginAt = new Date(Date.now() - 60000);
    const endAt = new Date(Date.now() + 3600000);
    const homeworkFields = {
        assignedUsers: [studentId], penaltySince: endAt, penaltyRules: {}, homeworkNoDeadline: false,
        homeworkCategory: '', maintainer: [], langs: [],
    };
    const homeworkId = await contests.add(domainId, 'Assigned homework', '', teacherId, 'homework', beginAt, endAt,
        [publicId, hiddenId, objectiveId, reviewId], false, homeworkFields);
    const contestId = await contests.add(domainId, 'Formal contest', '', teacherId, 'ioi', beginAt, endAt,
        [publicId, hiddenId], false);
    await contests.setStatus(domainId, homeworkId, studentId, { attend: 1, startAt: beginAt });
    await contests.setStatus(domainId, contestId, studentId, { attend: 1, startAt: beginAt });
    const url = (pid, tid) => `${prefix}/p/${pid}${tid ? `?tid=${tid}` : ''}`;
    const jsonGet = (agent, target) => agent.get(target).set('Accept', 'application/json');
    const action = (agent, pid, operation, tid, body = {}) => agent.post(url(pid, tid)).send({ operation, ...body });
    const getList = () => jsonGet(student, `${prefix}/mistakes`);
    const listed = (body, pid) => body.mdocs.some((doc) => doc.pid === pid);

    await check('Public and hidden assigned homework expose learner mistake actions', async () => {
        for (const pid of [publicId, hiddenId]) {
            const res = await jsonGet(student, url(pid, homeworkId));
            status(res, 200);
            assert.equal(res.body.canUseMistake, true);
        }
        denied(await jsonGet(student, url(hiddenId)));
    });

    await check('Homework HTML renders learner mistake actions and the teacher review action', async () => {
        for (const pid of [publicId, hiddenId]) {
            const page = await student.get(url(pid, homeworkId)).set('Accept', 'text/html');
            status(page, 200);
            assert(page.text.includes('id="problem-mistake-prompt"'));
            assert(page.text.includes('name="operation" value="add_mistake"'));
            assert.match(page.text, new RegExp(`action="[^"]*tid=${homeworkId}[^\"]*" data-mistake-action`));
        }
        const review = await reviewer.get(`${url(reviewId, homeworkId)}&reviewUid=${studentId}`).set('Accept', 'text/html');
        status(review, 200);
        assert(review.text.includes('data-homework-review-mistake-form'));
        assert(review.text.includes('name="operation" value="add_review_mistake"'));
        assert(review.text.includes('加入学员错题集'));
    });

    await check('Wrong-then-accepted homework attempts trigger the add-to-mistakes prompt', async () => {
        const first = new ObjectId();
        const latest = new ObjectId();
        await records.coll.insertMany([
            { _id: first, domainId, pid: hiddenId, uid: studentId, contest: homeworkId, status: STATUS.STATUS_WRONG_ANSWER,
                lang: 'py.py3', code: 'print(0)', score: 0, time: 0, memory: 0, testCases: [] },
            { _id: latest, domainId, pid: hiddenId, uid: studentId, contest: homeworkId, status: STATUS.STATUS_ACCEPTED,
                lang: 'py.py3', code: 'print(1)', score: 100, time: 0, memory: 0, testCases: [] },
        ]);
        const detail = await jsonGet(student, url(hiddenId, homeworkId));
        status(detail, 200);
        assert.equal(detail.body.showMistakePrompt, true);
        const page = await student.get(url(hiddenId, homeworkId)).set('Accept', 'text/html');
        status(page, 200);
        assert.match(page.text, /id="problem-mistake-prompt"[^>]*class="problem-mistake-float"/);
        const prompt = await action(student, hiddenId, 'mistake_prompt', homeworkId, { rid: latest.toString() })
            .set('Accept', 'application/json');
        status(prompt, 200);
        assert.equal(prompt.body.showMistakePrompt, true);
        const stale = await action(student, hiddenId, 'mistake_prompt', homeworkId, { rid: first.toString() })
            .set('Accept', 'application/json');
        status(stale, 200);
        assert.equal(stale.body.showMistakePrompt, false);
    });

    await check('Public and hidden homework add entries only for the acting learner', async () => {
        for (const pid of [publicId, hiddenId]) {
            status(await action(student, pid, 'add_mistake', homeworkId, { uid: otherId }), 302);
            const doc = await mistakes.get(domainId, studentId, pid);
            assert(doc);
            assert.equal(doc.homeworkId?.toString(), homeworkId.toString());
            assert.equal(await mistakes.get(domainId, otherId, pid), null);
        }
        const detail = await jsonGet(student, url(hiddenId, homeworkId));
        assert.equal(detail.body.showMistakePrompt, false);
    });

    await check('Mistake list includes hidden homework and generates homework-scoped practice links', async () => {
        const res = await getList();
        status(res, 200);
        assert(listed(res.body, hiddenId));
        assert(listed(res.body, publicId));
        const problemUrl = res.body.problemUrls[hiddenId];
        assert(problemUrl.includes(`tid=${homeworkId}`));
        const html = await student.get(`${prefix}/mistakes`).set('Accept', 'text/html');
        status(html, 200);
        assert(html.text.includes(`data-mistake-pid="${hiddenId}"`));
        assert(html.text.includes(`tid=${homeworkId}`));
        const deniedList = await jsonGet(other, `${prefix}/mistakes`);
        status(deniedList, 200);
        assert.equal(deniedList.body.mdocs.length, 0);
    });

    let practiceToken;
    await check('Hidden homework practice keeps authorization and starts a fresh private token', async () => {
        const res = await action(student, hiddenId, 'start_mistake_practice', homeworkId);
        status(res, 302);
        const target = new URL(res.headers.location, 'http://localhost');
        assert.equal(target.searchParams.get('tid'), homeworkId.toString());
        assert.equal(target.searchParams.get('scratchpad'), '1');
        practiceToken = target.searchParams.get('mistakePractice');
        assert.match(practiceToken, /^[a-f0-9]{24}$/);
        const detail = await jsonGet(student, `${target.pathname}${target.search}`);
        status(detail, 200);
        assert.equal(detail.body.mistakePractice.token, practiceToken);
        denied(await jsonGet(other, `${target.pathname}${target.search}`));
        denied(await jsonGet(student, `${target.pathname}?mistakePractice=${practiceToken}`));
    });

    await check('Practice can deepen once, then master without releasing the hidden problem', async () => {
        assert(practiceToken);
        const deepen = await action(student, hiddenId, 'deepen_mistake', homeworkId, { practiceToken });
        status(deepen, 302);
        assert.equal((await mistakes.get(domainId, studentId, hiddenId)).importance, 2);
        denied(await action(student, hiddenId, 'deepen_mistake', homeworkId, { practiceToken }));
        status(await action(student, hiddenId, 'master_mistake', homeworkId), 302);
        const doc = await mistakes.get(domainId, studentId, hiddenId);
        assert.equal(doc.status, 'mastered');
        assert.equal(doc.practiceToken, undefined);
        denied(await jsonGet(student, url(hiddenId)));
        const mastered = await jsonGet(student, `${prefix}/mistakes?status=mastered`);
        assert(listed(mastered.body, hiddenId));
        status(await action(student, hiddenId, 'add_mistake', homeworkId), 302);
    });

    await check('Formal contest cannot add or manipulate mistake entries', async () => {
        const before = await mistakes.get(domainId, studentId, publicId);
        const detail = await jsonGet(student, url(publicId, contestId));
        status(detail, 200);
        assert.equal(detail.body.canUseMistake, false);
        for (const operation of ['add_mistake', 'start_mistake_practice', 'deepen_mistake', 'master_mistake']) {
            denied(await action(student, publicId, operation, contestId, { practiceToken: new ObjectId().toString() }));
        }
        assert.deepEqual(await mistakes.get(domainId, studentId, publicId), before);
    });

    await check('Review and record-replay contexts remain read-only for teachers and learners', async () => {
        const before = await mistakes.coll.countDocuments({ domainId });
        for (const actor of [teacher, student]) {
            for (const query of [`reviewUid=${studentId}`, `mergedUid=${studentId}`, `fromRecord=${new ObjectId()}`]) {
                const res = await actor.post(`${url(publicId, homeworkId)}&${query}`).send({ operation: 'add_mistake' });
                denied(res);
            }
        }
        assert.equal(await mistakes.coll.countDocuments({ domainId }), before);
    });

    const reviewAction = (agent, pid = reviewId, targetId = studentId, tid = homeworkId, body = {}, extraQuery = '') =>
        agent.post(`${url(pid, tid)}${tid ? '&' : '?'}reviewUid=${targetId}${extraQuery}`)
            .set('Accept', 'application/json').send({ operation: 'add_review_mistake', ...body });

    await check('Authorized teacher adds a review question to the selected learner only', async () => {
        assert.equal(await mistakes.get(domainId, studentId, reviewId), null);
        const res = await reviewAction(reviewer);
        status(res, 200);
        assert.equal(res.body.reviewMistakeAdded, true);
        const doc = await mistakes.get(domainId, studentId, reviewId);
        assert(doc);
        assert.equal(doc.homeworkId.toString(), homeworkId.toString());
        assert.equal(await mistakes.get(domainId, reviewerId, reviewId), null);
        assert.equal(await mistakes.get(domainId, teacherId, reviewId), null);
        assert.equal(await mistakes.get(domainId, otherId, reviewId), null);
        status(await reviewAction(reviewer), 200);
        assert.equal(await mistakes.coll.countDocuments({ domainId, uid: studentId, pid: reviewId }), 1);
    });

    await check('Learners and teachers without homework-review permission cannot add for a learner', async () => {
        const before = await mistakes.get(domainId, studentId, reviewId);
        denied(await reviewAction(student));
        denied(await reviewAction(other));
        denied(await reviewAction(noReview));
        assert.deepEqual(await mistakes.get(domainId, studentId, reviewId), before);
    });

    await check('Teacher review addition rejects wrong homework, question, target and request context', async () => {
        const before = await mistakes.coll.countDocuments({ domainId });
        for (const [pid, uid, tid, body, extra] of [
            [reviewId, otherId, homeworkId, {}, ''],
            [unrelatedId, studentId, homeworkId, {}, ''],
            [publicId, studentId, contestId, {}, ''],
            [reviewId, studentId, null, {}, ''],
            [reviewId, studentId, homeworkId, { reviewUid: otherId }, ''],
            [reviewId, studentId, homeworkId, { uid: otherId }, ''],
            [reviewId, studentId, homeworkId, { tid: contestId.toString() }, ''],
            [reviewId, studentId, homeworkId, {}, `&mergedUid=${studentId}`],
            [reviewId, studentId, homeworkId, {}, `&fromRecord=${new ObjectId()}`],
        ]) denied(await reviewAction(reviewer, pid, uid, tid, body, extra));
        assert.equal(await mistakes.coll.countDocuments({ domainId }), before);
    });

    await check('Teacher review authorization rejects a target assigned to another workspace', async () => {
        const foreign = await workspaces.create(`hm-foreign-${Date.now()}`, 'Foreign test workspace', noReviewId);
        await workspaces.addStudent(foreign._id, otherId, noReviewId);
        await contests.edit(domainId, homeworkId, { assignedUsers: [studentId, otherId] });
        try {
            denied(await reviewAction(reviewer, reviewId, otherId));
            denied(await reviewAction(teacher, reviewId, otherId));
            assert.equal(await mistakes.get(domainId, otherId, reviewId), null);
        } finally {
            await contests.edit(domainId, homeworkId, { assignedUsers: [studentId] });
        }
    });

    await check('Unassigned or unrelated homework links cannot grant mistake access', async () => {
        await contests.setStatus(domainId, homeworkId, otherId, { attend: 1, startAt: beginAt });
        denied(await action(other, hiddenId, 'add_mistake', homeworkId));
        denied(await action(student, unrelatedId, 'add_mistake', homeworkId));
        assert.equal(await mistakes.get(domainId, otherId, hiddenId), null);
        assert.equal(await mistakes.get(domainId, studentId, unrelatedId), null);
    });

    await check('Objective homework remains outside the programming mistake workflow', async () => {
        const res = await jsonGet(student, url(objectiveId, homeworkId));
        status(res, 200);
        assert.equal(res.body.canUseMistake, false);
        denied(await action(student, objectiveId, 'add_mistake', homeworkId));
        assert.equal(await mistakes.get(domainId, studentId, objectiveId), null);
    });

    await check('Removing a learner assignment revokes hidden list and practice access immediately', async () => {
        await contests.edit(domainId, homeworkId, { assignedUsers: [] });
        try {
            const list = await getList();
            status(list, 200);
            assert(!listed(list.body, hiddenId));
            assert(listed(list.body, publicId));
            denied(await action(student, hiddenId, 'start_mistake_practice', homeworkId));
            denied(await action(student, hiddenId, 'add_mistake', homeworkId));
            status(await action(student, publicId, 'start_mistake_practice'), 302);
        } finally {
            await contests.edit(domainId, homeworkId, { assignedUsers: [studentId] });
        }
    });

    await check('Removing a question from homework revokes old hidden material access without deleting the entry', async () => {
        await contests.edit(domainId, homeworkId, { pids: [publicId, objectiveId] });
        try {
            const list = await getList();
            assert(!listed(list.body, hiddenId));
            denied(await action(student, hiddenId, 'start_mistake_practice', homeworkId));
            assert(await mistakes.get(domainId, studentId, hiddenId));
        } finally {
            await contests.edit(domainId, homeworkId, { pids: [publicId, hiddenId, objectiveId] });
        }
    });

    await check('Future homework cannot be used as a hidden-problem access grant', async () => {
        await contests.edit(domainId, homeworkId, { beginAt: new Date(Date.now() + 3600000) });
        try {
            const list = await getList();
            assert(!listed(list.body, hiddenId));
            denied(await action(student, hiddenId, 'start_mistake_practice', homeworkId));
        } finally {
            await contests.edit(domainId, homeworkId, { beginAt });
        }
    });

    await check('Ended homework still permits authorized review and mistake management', async () => {
        await contests.edit(domainId, homeworkId, { endAt: new Date(Date.now() - 1000) });
        try {
            const list = await getList();
            assert(listed(list.body, hiddenId));
            status(await action(student, hiddenId, 'master_mistake', homeworkId), 302);
            denied(await student.post(`${prefix}/p/${hiddenId}/submit?tid=${homeworkId}`).send({ lang: 'py.py3', code: 'print(1)' }));
        } finally {
            await contests.edit(domainId, homeworkId, { endAt });
            await mistakes.add(domainId, studentId, hiddenId, 'manual', homeworkId);
        }
    });

    await check('Deleted homework cannot revive an existing hidden mistake entry', async () => {
        await contests.del(domainId, homeworkId);
        const list = await getList();
        status(list, 200);
        assert(!listed(list.body, hiddenId));
        denied(await action(student, hiddenId, 'start_mistake_practice', homeworkId));
        assert(await mistakes.get(domainId, studentId, hiddenId));
    });

    console.log(`RESULT ${results.filter(Boolean).length}/${results.length} homework mistake checks passed`);
    clearTimeout(timeout);
    if (process.env.HOMEWORK_MISTAKE_SERVE === '1' && results.every(Boolean)) {
        const smokePublicId = await programming('HMSMOKEPUBLIC');
        const smokeHiddenId = await programming('HMSMOKEHIDDEN', true);
        const smokeTid = await contests.add(domainId, 'Browser smoke homework', '', teacherId, 'homework', beginAt, endAt,
            [smokePublicId, smokeHiddenId], false, homeworkFields);
        await contests.setStatus(domainId, smokeTid, studentId, { attend: 1, startAt: beginAt });
        for (const pid of [smokePublicId, smokeHiddenId]) {
            await records.coll.insertMany([
                { _id: new ObjectId(), domainId, pid, uid: studentId, contest: smokeTid, status: STATUS.STATUS_WRONG_ANSWER,
                    lang: 'py.py3', code: 'print(0)', score: 0, time: 0, memory: 0, testCases: [] },
                { _id: new ObjectId(), domainId, pid, uid: studentId, contest: smokeTid, status: STATUS.STATUS_ACCEPTED,
                    lang: 'py.py3', code: 'print(1)', score: 100, time: 0, memory: 0, testCases: [] },
            ]);
        }
        const origin = `http://127.0.0.1:${process.env.HOMEWORK_MISTAKE_TEST_PORT || '18893'}`;
        console.log(`SMOKE ${JSON.stringify({
            login: `${origin}/login`, domainId, studentId, teacher: 'hm_reviewer', student: 'hm_student', password: 'LocalTest123!',
            publicUrl: `${origin}${url(smokePublicId, smokeTid)}&scratchpad=1`,
            hiddenUrl: `${origin}${url(smokeHiddenId, smokeTid)}&scratchpad=1`,
            reviewUrl: `${origin}${url(smokeHiddenId, smokeTid)}&reviewUid=${studentId}&scratchpad=1`,
            mistakesUrl: `${origin}${prefix}/mistakes`,
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
