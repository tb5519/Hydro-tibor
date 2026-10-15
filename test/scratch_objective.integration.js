/* eslint-disable no-await-in-loop -- Isolated HTTP scenarios keep fixture mutations ordered. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const supertest = require('supertest');

process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-scratch-objective-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.SCRATCH_OBJECTIVE_PORT || '18895';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => { console.error('Scratch objective integration timed out'); process.exit(1); }, 150000);
const checks = [];
async function check(name, fn) {
    try { await fn(); checks.push(true); console.log(`PASS ${name}`); }
    catch (error) { checks.push(false); console.error(`FAIL ${name}\n${error.stack}`); }
}
function status(res, expected) { assert.equal(res.status, expected, `${res.status}: ${res.text?.slice(0, 700)}`); }
function denied(res) {
    assert((res.status >= 400 && res.status < 500) || res.body.url?.includes('/domain/join'), `${res.status}: ${res.text?.slice(0, 300)}`);
}

async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, httpServer, PERM } = require('hydrooj');
    const scratch = require('../packages/hydrooj/src/model/scratch');
    const quiz = require('../packages/hydrooj/src/model/scratch_objective');
    const daily = require('../packages/hydrooj/src/model/daily_quiz');
    const storage = require('../packages/hydrooj/src/model/storage').default;
    const teacherId = await users.create('scratch-teacher@example.test', 'scratch_teacher', 'LocalTest123!');
    await users.setSuperAdmin(teacherId);
    const domainId = `scratch-quiz-${Date.now()}`;
    const ojId = `python-quiz-${Date.now()}`;
    await domains.add(domainId, teacherId, 'Scratch 创作课堂', 'Isolated Scratch objective test', undefined, 'scratch');
    await domains.add(ojId, teacherId, 'Python 训练', 'Isolated mixed daily quiz');
    const studentId = await users.create('scratch-student@example.test', 'scratch_student', 'LocalTest123!');
    const demoId = await users.create('scratch-demo@example.test', 'scratch_demo', 'LocalTest123!');
    const outsiderId = await users.create('scratch-other@example.test', 'scratch_other', 'LocalTest123!');
    const limitedTeacherId = await users.create('scratch-coach@example.test', 'scratch_coach', 'LocalTest123!');
    await domains.addRole(domainId, 'coach', PERM.PERM_VIEW | PERM.PERM_EDIT_DOMAIN);
    await domains.setUserRole(domainId, limitedTeacherId, 'coach', true);
    await domains.addRole(domainId, 'learner', PERM.PERM_VIEW);
    for (const uid of [studentId, demoId]) {
        await domains.setUserRole(domainId, uid, 'learner', true);
        await users.setById(uid, { defaultDomain: domainId });
    }
    await domains.setUserInDomain(domainId, demoId, { displayName: '小禾' });
    await domains.setUserRole(ojId, studentId, 'default', true);
    const teacher = supertest.agent(httpServer);
    const student = supertest.agent(httpServer);
    const outsider = supertest.agent(httpServer);
    const coach = supertest.agent(httpServer);
    for (const [agent, uname] of [[teacher, 'scratch_teacher'], [student, 'scratch_student'], [outsider, 'scratch_other'], [coach, 'scratch_coach']]) {
        status(await agent.post('/login').send({ uname, password: 'LocalTest123!' }), 302);
    }
    const prefix = `/d/${domainId}`;
    const get = (agent, url) => agent.get(url).set('Accept', 'application/json');
    const post = (agent, url, body) => agent.post(url).set('Origin', `http://127.0.0.1:${port}`).set('Accept', 'application/json').send(body);
    const sources = [];
    await check('Scratch teachers create and search private single, multiple and judgment sources', async () => {
        for (const [index, kind] of ['single', 'multiple', 'judge'].entries()) {
            const objective = { version: 1, kind,
                stem: ['点击绿旗后，下面哪块积木会让角色向前移动？', '想让角色动起来，可以使用哪些积木？', '重复执行积木能让同一段程序运行多次。'][index],
                options: kind === 'judge' ? ['正确', '错误'] : ['移动 10 步', '说你好', '右转 15 度'],
                answers: kind === 'multiple' ? ['A', 'C'] : ['A'], analysis: `PRIVATE_NOTE_${index}：移动积木会改变角色的位置。`,
            };
            const res = await post(teacher, `${prefix}/problem/create/objective`, {
                title: `积木基础 ${index + 1}`, objective: JSON.stringify(objective), tag: '积木基础,动作',
            });
            status(res, 200);
            const doc = await problems.getMulti(domainId, { objectiveKind: kind }, [...problems.PROJECTION_PUBLIC, 'objective'], true).next();
            sources.push(doc.docId);
            assert.equal(doc.hidden, true);
        }
        const list = await get(teacher, `${prefix}/problem/objective/items?tag=积木基础`);
        status(list, 200);
        assert.equal(list.body.items.length, 3);
    });
    let paperId;
    let secondPaperId;
    await check('Teacher composes a real paper while OJ programming routes remain unavailable', async () => {
        const res = await post(teacher, `${prefix}/problem/objective`, { title: '积木小侦探', pid: 'SCRATCHQUIZ',
            paper: JSON.stringify({ version: 1, items: sources.map((id, index) => ({ id, score: index ? 30 : 40 })) }) });
        status(res, 200);
        paperId = (await problems.get(domainId, 'SCRATCHQUIZ')).docId;
        assert(res.body.url.includes(`/scratch/problem/paper/${paperId}`));
        denied(await get(teacher, `${prefix}/p`));
        denied(await post(teacher, `${prefix}/problem/create`, { title: 'Blocked', content: 'Hello' }));
        denied(await post(teacher, `${prefix}/p/${paperId}/submit`, { lang: '_', code: '1: A' }));
        for (const suffix of ['/problem/objective', '/problem/objective/items', `/p/${sources[0]}`, `/p/${sources[0]}/edit`, `/p/${paperId}`]) {
            denied(await get(student, `${prefix}${suffix}`));
        }
    });
    await check('A domain teacher with only VIEW and EDIT_DOMAIN can author, edit, upload and publish; cross-domain student APIs stay private', async () => {
        const objective = { version: 1, kind: 'single', stem: '哪种积木能够移动角色？', options: ['移动', '等待'], answers: ['A'], analysis: '' };
        status(await post(coach, `${prefix}/problem/create/objective`, { title: '教师创建', objective: JSON.stringify(objective), tag: '教师素材' }), 200);
        status(await get(coach, `${prefix}/p/${sources[0]}/edit`), 200);
        const original = await problems.get(domainId, sources[0], ['objective', 'title']);
        status(await post(coach, `${prefix}/p/${sources[0]}/edit`, { title: original.title, objective: JSON.stringify(original.objective), tag: '积木基础,动作' }), 200);
        status(await coach.post(`${prefix}/p/${sources[0]}/files`).set('Origin', `http://127.0.0.1:${port}`).set('Accept', 'application/json')
            .field('operation', 'upload_file').field('type', 'additional_file').attach('file', Buffer.from('image'), 'coach.png'), 200);
        denied(await post(coach, `${prefix}/p/${sources[0]}/files`, { operation: 'generate_testdata', std: 'x', gen: 'y' }));
        const paper = await post(coach, `${prefix}/problem/objective`, { title: '老师的第二套题', pid: 'COACHPAPER',
            paper: JSON.stringify({ version: 1, items: [{ id: sources[0], score: 100 }] }) });
        status(paper, 200);
        secondPaperId = (await problems.get(domainId, 'COACHPAPER')).docId;
        const preselected = await get(coach, `${prefix}/scratch/assignment/create?objectivePaperId=${secondPaperId}`);
        status(preselected, 200);
        assert.deepEqual(preselected.body.selectedObjectivePaperIds, [secondPaperId]);
        status(await post(coach, `${prefix}/scratch/assignment/create`, { title: '普通老师发布', assignmentMode: 'mixed', objectivePaperIds: [secondPaperId] }), 200);
        for (const [name, args] of [['problem', { domainId, id: paperId }], ['problems', { domainId, ids: [paperId] }]]) {
            const response = await get(student, `/d/${ojId}/api/${name}`).query({ args: JSON.stringify(args) });
            assert(!response.text.includes('积木小侦探'));
        }
    });
    let assignment;
    await check('Publish pure-objective Scratch homework from composed papers and keep keys private', async () => {
        const res = await post(teacher, `${prefix}/scratch/assignment/create`, {
            title: '今天的积木小挑战', description: '观察积木，想一想，再选出你的答案。',
            assignmentMode: 'objective', objectivePaperIds: ['', `${paperId}`],
        });
        status(res, 200);
        assignment = await scratch.assignments.findOne({ domainId, title: '今天的积木小挑战' });
        assert.equal(assignment.projectRequired, false);
        assert.equal(assignment.objectiveQuiz.items.length, 3);
        for (const suffix of ['/scratch', '/scratch/assignments', `/scratch/assignment/${assignment._id}`]) {
            const page = await get(student, `${prefix}${suffix}`);
            status(page, 200);
            assert(!page.text.includes('PRIVATE_NOTE'));
            assert(!page.text.includes('"answers"'));
        }
        denied(await post(student, `${prefix}/scratch/assignment/${assignment._id}`, {}));
        const state = await get(student, `${prefix}/scratch/assignment/${assignment._id}/quiz`);
        status(state, 200);
        assert.equal(state.body.scratchObjectiveQuiz.items.length, 3);
        assert(!state.text.includes('PRIVATE_NOTE'));
        assert(!state.body.scratchObjectiveQuiz.items[0].answers);
    });
    const quizUrl = () => `${prefix}/scratch/assignment/${assignment._id}/quiz`;
    await check('Scratch answers are graded once, wrong explanations appear, and teacher sees exact results', async () => {
        const first = await post(student, quizUrl(), { operation: 'answer', revision: assignment.objectiveQuiz.revision, questionId: 1, answers: ['B'] });
        status(first, 200);
        assert.equal(first.body.state.items[0].correct, false);
        assert(first.body.state.items[0].analysis.includes('PRIVATE_NOTE_0'));
        assert.equal(first.body.state.items[1].answers, undefined);
        const duplicate = await post(student, quizUrl(), { operation: 'answer', revision: assignment.objectiveQuiz.revision, questionId: 1, answers: ['A'] });
        status(duplicate, 200);
        assert.deepEqual(duplicate.body.state.items[0].selected, ['B']);
        status(await post(student, quizUrl(), { operation: 'answer', revision: assignment.objectiveQuiz.revision, questionId: 2, answers: ['A', 'C'] }), 200);
        const done = await post(student, quizUrl(), { operation: 'answer', revision: assignment.objectiveQuiz.revision, questionId: 3, answers: ['A'] });
        status(done, 200);
        assert.equal(done.body.state.completed, true);
        assert.equal(done.body.state.score, 60);
        const teacherView = await get(teacher, `${quizUrl()}?uid=${studentId}`);
        status(teacherView, 200);
        assert.equal(teacherView.body.scratchObjectiveQuiz.readOnly, true);
        assert.deepEqual(teacherView.body.scratchObjectiveQuiz.items.map((item) => item.correct), [false, true, true]);
        const detail = await get(teacher, `${prefix}/scratch/assignment/${assignment._id}`);
        assert.equal(detail.body.objectiveResults[0].score, 60);
        assert(detail.body.objectiveResults[0].url.includes(`?uid=${studentId}`));
        assert(detail.body.objectiveResults.some((item) => item.uid === demoId && item.answered === 0));
        assert(!detail.body.objectiveResults.some((item) => item.uid === limitedTeacherId));
        denied(await get(student, `${quizUrl()}?uid=${demoId}`));
        denied(await get(outsider, quizUrl()));
        denied(await post(teacher, quizUrl(), { operation: 'answer', revision: assignment.objectiveQuiz.revision, questionId: 1, answers: ['A'] }));
        denied(await post(teacher, `${prefix}/scratch/assignment/${assignment._id}/edit`, {
            title: assignment.title, assignmentMode: 'project', objectivePaperIds: [],
        }));
    });
    await check('Concurrent metadata edits cannot restore an old paper after replacement and the first student answer', async () => {
        const actor = { domainId, uid: teacherId, isTeacher: true };
        const initial = await scratch.writeAssignment(actor, {
            title: '交错保存测试', description: '', deadline: null, projectRequired: false, objectivePaperIds: [paperId],
        });
        let release;
        let reached;
        const gate = new Promise((resolve) => { release = resolve; });
        const ready = new Promise((resolve) => { reached = resolve; });
        const originalUpdate = scratch.assignments.updateOne;
        scratch.assignments.updateOne = async function pausedUpdate(filter, update, ...rest) {
            if (update.$set?.title === '延迟保存') { reached(); await gate; }
            return originalUpdate.call(this, filter, update, ...rest);
        };
        let pending;
        try {
            pending = scratch.writeAssignment(actor, { title: '延迟保存', description: '', deadline: null, objectivePaperIds: [paperId] }, initial._id);
            // Attach a rejection listener immediately while the deliberate concurrency gate is pending.
            const rejected = assert.rejects(pending);
            await ready;
            const changed = await scratch.writeAssignment(actor, {
                title: '新题卷', description: '', deadline: null, projectRequired: false, objectivePaperIds: [secondPaperId],
            }, initial._id);
            await quiz.answer({ domainId, uid: studentId, isTeacher: false }, changed, 1, ['A']);
            release();
            await rejected;
            const latest = await scratch.getAssignment(actor, initial._id);
            assert.equal(latest.objectiveQuiz.revision, changed.objectiveQuiz.revision);
            assert.equal((await quiz.getState(actor, latest, studentId)).score, 100);
        } finally {
            release();
            await pending?.catch(() => {});
            scratch.assignments.updateOne = originalUpdate;
        }
    });
    await check('Assignment snapshots survive later source and paper edits; old Scratch projects remain compatible', async () => {
        await problems.edit(domainId, paperId, { title: '被编辑的题卷' });
        await problems.edit(domainId, sources[0], { title: '被编辑的素材' });
        const state = await get(student, quizUrl());
        assert.equal(state.body.scratchObjectiveQuiz.items[0].paperTitle, '积木小侦探');
        const project = await scratch.writeAssignment({ domainId, uid: teacherId, isTeacher: true }, { title: '创作小猫', description: '', deadline: null });
        assert.equal(project.projectRequired, true);
        const work = await scratch.createWork({ domainId, uid: studentId, isTeacher: false }, '创作小猫', project._id);
        assert(work._id);
        denied(await post(teacher, `${prefix}/scratch/assignment/create`, { title: '空作业', assignmentMode: 'objective', objectivePaperIds: [] }));
        denied(await post(teacher, `${prefix}/scratch/assignment/create`, { title: '不能使用单题素材', assignmentMode: 'objective', objectivePaperIds: [sources[0]] }));
    });
    await check('Statement and analysis files are independently snapshotted and analysis is gated until answered', async () => {
        const doc = await problems.get(domainId, paperId, ['objectivePaper']);
        const originalPaper = JSON.parse(JSON.stringify(doc.objectivePaper));
        const image = Buffer.from('fixture-image');
        await problems.addAdditionalFile(domainId, paperId, 'statement.png', image, teacherId);
        await problems.addAdditionalFile(domainId, paperId, 'analysis.png', image, teacherId);
        doc.objectivePaper.items[0].objective.stem += '\n![图](file://statement.png)';
        doc.objectivePaper.items[0].objective.analysis += '\n![解析图](file://analysis.png)';
        await problems.edit(domainId, paperId, { objectivePaper: doc.objectivePaper });
        const withFiles = await scratch.writeAssignment({ domainId, uid: teacherId, isTeacher: true }, {
            title: '图片快照', description: '', deadline: null, projectRequired: false, objectivePaperIds: [paperId],
        });
        const actor = { domainId, uid: studentId, isTeacher: false };
        const [statementName, analysisName] = Object.keys(withFiles.objectiveQuiz.files);
        assert(await quiz.getFile(actor, withFiles, statementName));
        await assert.rejects(quiz.getFile(actor, withFiles, analysisName));
        await problems.delAdditionalFile(domainId, paperId, 'statement.png', teacherId);
        await problems.delAdditionalFile(domainId, paperId, 'analysis.png', teacherId);
        assert(await storage.getMeta(await quiz.getFile(actor, withFiles, statementName)));
        await quiz.answer(actor, withFiles, 1, ['B']);
        assert(await quiz.getFile(actor, withFiles, analysisName));
        await problems.edit(domainId, paperId, { objectivePaper: originalPaper, title: '积木小侦探' });
    });
    let libraryProject;
    let libraryWork;
    let librarySubmission;
    let libraryPaper;
    await check('Learner-visible Scratch bank exposes published papers and creative challenges, never private sources or answer keys', async () => {
        status(await post(coach, `${prefix}/scratch/problem/create/project`, {
            title: '会跳舞的小猫', description: '点击绿旗，小猫走 10 步。', tag: '动作,事件', hidden: false,
        }), 200);
        libraryProject = await scratch.assignments.findOne({ domainId, kind: 'problem', title: '会跳舞的小猫' });
        assert(libraryProject);
        assert.equal(libraryProject.projectRequired, true);
        status(await post(coach, `${prefix}/scratch/problem/create/project`, {
            title: '还没发布的挑战', description: '暂不展示', tag: '动作', hidden: true,
        }), 200);
        const hidden = await scratch.assignments.findOne({ domainId, title: '还没发布的挑战' });
        const page = await get(student, `${prefix}/scratch/problems`);
        status(page, 200);
        assert(page.body.problems.some((item) => item.id === String(libraryProject._id) && item.kind === 'project'));
        assert(page.body.problems.some((item) => item.id === String(paperId) && item.kind === 'objective'));
        assert(!page.text.includes('还没发布的挑战'));
        assert(!page.text.includes('PRIVATE_NOTE'));
        assert(!page.text.includes('"answers"'));
        assert(!page.body.problems.some((item) => item.kind === 'objective' && sources.includes(+item.id)));
        const filtered = await get(student, `${prefix}/scratch/problems?type=project&q=动作`);
        assert.equal(filtered.body.count, 1);
        assert.equal(filtered.body.problems[0].title, '会跳舞的小猫');
        const homework = await get(student, `${prefix}/scratch/assignments`);
        assert(!homework.body.assignments.some((item) => item.kind === 'problem'));
        denied(await get(student, `${prefix}/scratch/problem/${hidden._id}`));
        denied(await post(student, `${prefix}/scratch/problem/${hidden._id}`, {}));
        denied(await post(student, `${prefix}/scratch/problem/create/project`, { title: 'Not allowed' }));
        denied(await get(student, `${prefix}/scratch/problem/${libraryProject._id}/edit`));
        denied(await get(outsider, `${prefix}/scratch/problems`));
        denied(await get(student, `/d/${ojId}/scratch/problems`));
        denied(await get(student, `${prefix}/scratch/problem/paper/${sources[0]}`));
    });
    await check('Starting the same creative problem concurrently reuses one private work, submissions are immutable and teacher-reviewable', async () => {
        const starts = await Promise.all([1, 2, 3].map(() => post(student, `${prefix}/scratch/problem/${libraryProject._id}`, {})));
        starts.forEach((res) => status(res, 200));
        assert.equal(new Set(starts.map((res) => res.body.url)).size, 1);
        libraryWork = await scratch.works.findOne({ domainId, assignmentId: libraryProject._id, owner: studentId });
        assert.equal(await scratch.works.countDocuments({ domainId, assignmentId: libraryProject._id, owner: studentId }), 1);
        const editor = await get(student, `${prefix}/scratch/editor?workId=${libraryWork._id}`);
        status(editor, 200);
        assert.equal(editor.body.problem._id, String(libraryProject._id));
        const zip = new (require('adm-zip'))();
        const backdrop = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="#fff"/></svg>');
        const backdropId = require('node:crypto').createHash('md5').update(backdrop).digest('hex');
        zip.addFile(`${backdropId}.svg`, backdrop);
        zip.addFile('project.json', Buffer.from(JSON.stringify({ targets: [{ isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {},
            blocks: {}, comments: {}, currentCostume: 0,
            costumes: [{ name: '背景1', assetId: backdropId, dataFormat: 'svg', md5ext: `${backdropId}.svg`,
                bitmapResolution: 1, rotationCenterX: 240, rotationCenterY: 180 }],
            sounds: [], volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null,
        }], monitors: [], extensions: [], meta: { semver: '3.0.0', vm: '0.2.0' } })));
        const submitted = await student.post(`${prefix}/scratch/work/${libraryWork._id}/save`)
            .set('Origin', `http://127.0.0.1:${port}`).set('Accept', 'application/json')
            .field('revision', '0').field('submit', 'true').attach('file', zip.toBuffer(), 'dance.sb3');
        status(submitted, 200);
        librarySubmission = await scratch.submissions.findOne({ domainId, workId: libraryWork._id });
        assert(librarySubmission && librarySubmission.fileId);
        const queue = await get(teacher, `${prefix}/scratch/problems/review?q=会跳舞`);
        status(queue, 200);
        assert.equal(queue.body.count, 1);
        assert.equal(queue.body.submissions[0].assignmentTitle, '会跳舞的小猫');
        assert(queue.body.submissions[0].editorUrl.includes('inspect=true'));
        for (const [agent, expected] of [[coach, true], [student, false]]) {
            const inspectPage = await agent.get(`${prefix}/scratch/editor?submissionId=${librarySubmission._id}&inspect=true`);
            status(inspectPage, 200);
            const serialized = inspectPage.text.match(/window\.UiContext = ('(?:\\.|[^'\\])*');/);
            assert(serialized, 'Editor HTML must include its serialized UI configuration');
            const ui = JSON.parse(require('node:vm').runInNewContext(serialized[1], {}, { timeout: 100 }));
            assert.equal(ui.scratchEditor.inspectCode, expected);
            assert.equal(ui.scratchEditor.readOnly, true);
            assert.equal(ui.scratchEditor.saveUrl, null);
        }
        denied(await get(student, `${prefix}/scratch/problems/review`));
        denied(await get(outsider, `${prefix}/scratch/submission/${librarySubmission._id}`));
        status(await post(coach, `${prefix}/scratch/submission/${librarySubmission._id}`, { grade: '优秀', feedback: '事件积木用得很好！' }), 200);
        const feedback = await get(student, `${prefix}/scratch/submission/${librarySubmission._id}`);
        assert.equal(feedback.body.submission.grade, '优秀');
        assert.equal(feedback.body.submission.feedback, '事件积木用得很好！');
        const reviewed = await get(coach, `${prefix}/scratch/problems/review?status=reviewed`);
        assert.equal(reviewed.body.count, 1);
        assert.equal((await get(student, `${prefix}/scratch/problems?type=project`)).body.problems[0].status, 'reviewed');
        denied(await post(student, `${prefix}/scratch/submission/${librarySubmission._id}`, { grade: '满分' }));
        denied(await post(coach, `${prefix}/scratch/assignment/${libraryProject._id}/edit`, { title: 'wrong editor' }));
    });
    await check('Public objective practice starts concurrently without duplicate snapshots, homework pollution or answer leakage', async () => {
        const detail = await get(student, `${prefix}/scratch/problem/paper/${paperId}`);
        status(detail, 200);
        assert.equal(detail.body.problem.kind, 'objective');
        assert(!detail.text.includes('PRIVATE_NOTE'));
        assert.equal(await scratch.assignments.countDocuments({ domainId, problemPaperId: paperId }), 0);
        const starts = await Promise.all([1, 2, 3].map(() => post(student, `${prefix}/scratch/problem/paper/${paperId}`, {})));
        starts.forEach((res) => status(res, 200));
        assert.equal(new Set(starts.map((res) => res.body.url)).size, 1);
        assert.equal(await scratch.assignments.countDocuments({ domainId, problemPaperId: paperId }), 1);
        libraryPaper = await scratch.assignments.findOne({ domainId, problemPaperId: paperId });
        const page = await get(student, `${prefix}/scratch/assignment/${libraryPaper._id}/quiz`);
        status(page, 200);
        assert.equal(page.body.scratchObjectiveQuiz.readOnly, false);
        assert(!page.text.includes('PRIVATE_NOTE'));
        assert(!page.body.scratchObjectiveQuiz.items[0].answers);
        assert(page.body.scratchObjectiveQuiz.backUrl.endsWith(`/scratch/problem/paper/${paperId}`));
        const answers = await Promise.all([['A'], ['B']].map((selected) => post(student, `${prefix}/scratch/assignment/${libraryPaper._id}/quiz`, {
            operation: 'answer', revision: libraryPaper.objectiveQuiz.revision, questionId: 1, answers: selected,
        })));
        answers.forEach((res) => status(res, 200));
        assert.deepEqual(answers[0].body.state.items[0].selected, answers[1].body.state.items[0].selected);
        assert.equal(await quiz.results.countDocuments({ domainId, assignmentId: libraryPaper._id, owner: studentId }), 1);
        assert.equal((await get(student, `${prefix}/scratch/problem/paper/${paperId}`)).body.objectiveQuiz.answered, 1);
        assert(!(await get(student, `${prefix}/scratch/assignments`)).body.assignments.some((entry) => entry.kind === 'problem'));
        const foreignActor = { domainId: ojId, uid: studentId, isTeacher: false };
        await assert.rejects(quiz.getState(foreignActor, libraryPaper));
        await assert.rejects(quiz.answer(foreignActor, libraryPaper, 2, ['A']));
        await assert.rejects(quiz.getFile(foreignActor, libraryPaper, 'file.png'));
        denied(await get(student, `${prefix}/scratch/assignment/${libraryPaper._id}/quiz?uid=${demoId}`));
    });
    await check('Bank metadata edits preserve attempts; progress listing does not load quiz answer snapshots or submission feedback', async () => {
        const before = (await get(student, `${prefix}/scratch/problems`)).body.problems.find((item) => item.kind === 'objective' && item.id === String(paperId));
        assert.equal(before.answered, 1);
        const beforePaper = await problems.get(domainId, paperId, ['objectivePaperRevision', 'objectivePaper', 'content']);
        const editUrl = `${prefix}/scratch/problem/paper/${paperId}/edit`;
        const editPage = await get(coach, editUrl);
        status(editPage, 200);
        assert(!editPage.text.includes('PRIVATE_NOTE'));
        denied(await get(student, editUrl));
        denied(await post(student, editUrl, { title: 'Unauthorized', tag: '', hidden: false }));
        denied(await get(coach, `${prefix}/scratch/problem/paper/${sources[0]}/edit`));
        status(await post(coach, editUrl, { title: '重命名后的积木练习', tag: '新的课堂标签', hidden: false,
            content: 'MUST_NOT_REPLACE', objectivePaper: { items: [] } }), 200);
        const editedPaper = await problems.get(domainId, paperId, ['objectivePaperRevision', 'objectivePaper', 'content']);
        assert.equal(editedPaper.objectivePaperRevision, beforePaper.objectivePaperRevision);
        assert.deepEqual(editedPaper.objectivePaper, beforePaper.objectivePaper);
        assert.equal(editedPaper.content, beforePaper.content);
        const renamed = (await get(student, `${prefix}/scratch/problems?q=新的课堂标签`)).body;
        assert.equal(renamed.count, 1);
        assert.equal(renamed.problems[0].title, '重命名后的积木练习');
        assert.equal(renamed.problems[0].answered, 1);
        assert.equal((await quiz.getPracticeAssignment({ domainId, uid: studentId, isTeacher: false }, paperId))._id.toString(), libraryPaper._id.toString());
        const detail = (await get(student, `${prefix}/scratch/problem/paper/${paperId}`)).body;
        assert.equal(detail.problem.title, '重命名后的积木练习');
        assert.equal(detail.objectiveQuiz.answered, 1);
        assert.equal((await get(student, `${prefix}/scratch/assignment/${libraryPaper._id}/quiz`)).body.scratchObjectiveQuiz.title, '重命名后的积木练习');
        const queue = (await get(coach, `${prefix}/scratch/problems/review?status=all&q=scratch_student`)).body;
        assert.equal(queue.count, 1);
        assert.equal(queue.submissions[0].feedback, undefined);
        assert.equal(queue.submissions[0].fileId, undefined);
        assert.equal((await get(coach, `${prefix}/scratch/problems/review?status=all&q=${studentId}`)).body.count, 1);
        assert.equal((await get(coach, `${prefix}/scratch/problems/review?status=all&page=2`)).body.submissions.length, 0);
        await problems.edit(domainId, paperId, { title: '积木小侦探', tag: ['积木基础', '动作'] });
    });
    await check('Review pagination and owner search stay bounded while aggregated bank counts cover all submitted revisions', async () => {
        const docs = Array.from({ length: 31 }, (_, index) => ({
            ...librarySubmission, _id: new (require('mongodb').ObjectId)(), revision: index + 2,
            grade: null, reviewedAt: null, reviewer: null, feedback: 'DO_NOT_LOAD_HISTORY_BODY'.repeat(300),
            createdAt: new Date(Date.now() + index + 1),
        }));
        await scratch.submissions.insertMany(docs);
        await domains.setUserInDomain(domainId, studentId, { displayName: '编程小猫' });
        try {
            const first = (await get(coach, `${prefix}/scratch/problems/review?status=all`)).body;
            const second = (await get(coach, `${prefix}/scratch/problems/review?status=all&page=2`)).body;
            assert.equal(first.count, 32);
            assert.equal(first.submissions.length, 30);
            assert.equal(second.submissions.length, 2);
            assert.equal(first.numPages, 2);
            assert(!JSON.stringify(first).includes('DO_NOT_LOAD_HISTORY_BODY'));
            assert(!first.submissions.some((entry) => entry.fileId || entry.feedback !== undefined));
            assert.equal((await get(coach, `${prefix}/scratch/problems/review?status=pending&q=编程`)).body.count, 31);
            assert.equal((await get(coach, `${prefix}/scratch/problems/review?status=reviewed&q=scratch_student`)).body.count, 1);
            const bank = (await get(coach, `${prefix}/scratch/problems`)).body;
            const creative = bank.problems.find((entry) => entry.id === String(libraryProject._id));
            assert.equal(creative.submissionCount, 32);
            assert.equal(creative.pendingCount, 31);
            assert.equal(bank.stats.pendingReview, 31);
            assert.equal((await get(student, `${prefix}/scratch/problems?type=project`)).body.problems[0].status, 'submitted');
        } finally {
            await scratch.submissions.deleteMany({ _id: { $in: docs.map((entry) => entry._id) } });
            await domains.setUserInDomain(domainId, studentId, { displayName: '' });
        }
    });
    await check('Withdrawn papers cannot be reached through saved quiz URLs; changing papers preserves the old attempt snapshot', async () => {
        status(await post(coach, `${prefix}/scratch/problem/paper/${paperId}/edit`, { title: '积木小侦探', tag: '积木基础,动作', hidden: true }), 200);
        const teacherBank = (await get(coach, `${prefix}/scratch/problems`)).body;
        const hiddenPaper = teacherBank.problems.find((entry) => entry.kind === 'objective' && entry.id === String(paperId));
        assert.equal(hiddenPaper.hidden, true);
        assert(hiddenPaper.url.endsWith(`/scratch/problem/paper/${paperId}/edit`));
        status(await get(coach, hiddenPaper.url), 200);
        denied(await get(student, `${prefix}/scratch/problem/paper/${paperId}`));
        denied(await get(student, `${prefix}/scratch/assignment/${libraryPaper._id}/quiz`));
        assert(!(await get(student, `${prefix}/scratch/problems`)).body.problems.some((entry) => entry.kind === 'objective' && entry.id === String(paperId)));
        await problems.edit(domainId, paperId, { hidden: false });
        const paper = await problems.get(domainId, paperId, ['objectivePaper']);
        const original = JSON.parse(JSON.stringify(paper.objectivePaper));
        paper.objectivePaper.items[0].objective.stem = '老师更新后的新题干';
        await problems.edit(domainId, paperId, { objectivePaper: paper.objectivePaper });
        status(await post(student, `${prefix}/scratch/problem/paper/${paperId}`, {}), 200);
        assert.equal(await scratch.assignments.countDocuments({ domainId, problemPaperId: paperId }), 2);
        const originalQuiz = await get(student, `${prefix}/scratch/assignment/${libraryPaper._id}/quiz`);
        assert(!originalQuiz.body.scratchObjectiveQuiz.items[0].stem.includes('老师更新后的新题干'));
        assert.equal(originalQuiz.body.scratchObjectiveQuiz.answered, 1);
        await problems.edit(domainId, paperId, { objectivePaper: original });
    });
    await check('A paper withdrawn during snapshot copying leaves no accessible practice or orphan copies', async () => {
        const paper = await problems.get(domainId, secondPaperId, ['objectivePaper']);
        const originalPaper = JSON.parse(JSON.stringify(paper.objectivePaper));
        await problems.addAdditionalFile(domainId, secondPaperId, 'bank-safe.png', Buffer.from('bank-image'), teacherId);
        paper.objectivePaper.items[0].objective.stem += '\n![图](file://bank-safe.png)';
        await problems.edit(domainId, secondPaperId, { objectivePaper: paper.objectivePaper });
        const copies = [];
        const originalCopy = storage.copy;
        let release;
        let reached;
        const gate = new Promise((resolve) => { release = resolve; });
        const ready = new Promise((resolve) => { reached = resolve; });
        storage.copy = async function pausedCopy(source, target, ...args) {
            const value = await originalCopy.call(this, source, target, ...args);
            if (target.startsWith(`scratch-objective/${domainId}/`)) { copies.push(target); reached(); await gate; }
            return value;
        };
        let pending;
        try {
            pending = quiz.getPracticeAssignment({ domainId, uid: studentId, isTeacher: false }, secondPaperId, true);
            const rejected = assert.rejects(pending);
            await ready;
            await problems.edit(domainId, secondPaperId, { hidden: true });
            release();
            await rejected;
            assert.equal(await scratch.assignments.countDocuments({ domainId, problemPaperId: secondPaperId }), 0);
            assert(copies.length > 0);
            for (const target of copies) assert.equal(await storage.getMeta(target), null);
        } finally {
            release();
            await pending?.catch(() => {});
            storage.copy = originalCopy;
            await problems.edit(domainId, secondPaperId, { hidden: false, objectivePaper: originalPaper });
            await problems.delAdditionalFile(domainId, secondPaperId, 'bank-safe.png', teacherId);
        }
    });
    await check('Daily quiz merges Scratch-only-permission and OJ classrooms and returns to Scratch after completion', async () => {
        const original = await problems.get(domainId, sources[0], ['objective', 'tag', 'content']);
        await problems.add(ojId, 'PYDAILY', 'Python 热身', original.content, teacherId, ['积木基础'], {
            hidden: true, objectiveKind: 'single', objective: original.objective,
        });
        await daily.savePolicy(studentId, { version: 1, enabled: true, cooldownRounds: 3, domains: [
            { domainId, enabled: true, count: 1, tags: ['积木基础'], points: [0] },
            { domainId: ojId, enabled: true, count: 1, tags: ['积木基础'], points: [0] },
        ] }, teacherId);
        const entered = await student.get(`${prefix}/scratch`).set('Accept', 'text/html');
        status(entered, 302);
        assert(entered.headers.location.includes('/daily-quiz?return='));
        assert(decodeURIComponent(entered.headers.location).includes(`${prefix}/scratch`));
        let state = (await get(student, '/daily-quiz/status')).body.state;
        assert.equal(state.total, 2);
        const session = await daily.sessionColl.findOne({ _id: state.sessionId });
        assert.deepEqual([...new Set(session.items.map((item) => item.domainId))].sort(), [domainId, ojId].sort());
        for (const item of session.items) {
            status(await post(student, '/daily-quiz', { operation: 'answer', sessionId: state.sessionId, questionId: item.id, answers: item.objective.answers }), 200);
            status(await post(student, '/daily-quiz', { operation: 'next', sessionId: state.sessionId, questionId: item.id }), 200);
        }
        state = (await get(student, '/daily-quiz/status')).body.state;
        assert.equal(state.required, false);
        status(await get(student, `${prefix}/scratch`), 200);
        await daily.savePolicy(studentId, { version: 1, enabled: false, cooldownRounds: 3, domains: [] }, teacherId);
    });
    console.log(`RESULT ${checks.filter(Boolean).length}/${checks.length} Scratch objective checks passed`);
    clearTimeout(timeout);
    if (process.env.SCRATCH_OBJECTIVE_SERVE === '1' && checks.every(Boolean)) {
        console.log(`SMOKE ${JSON.stringify({ origin: `http://localhost:${port}`, teacher: 'scratch_teacher', student: 'scratch_demo',
            password: 'LocalTest123!', domainId, studentId, demoId, assignmentUrl: `${prefix}/scratch/assignment/${assignment._id}`, quizUrl: quizUrl(),
            problemUrl: `${prefix}/scratch/problem/${libraryProject._id}`,
            paperEditUrl: `${prefix}/scratch/problem/paper/${paperId}/edit`,
            inspectUrl: `${prefix}/scratch/editor?submissionId=${librarySubmission._id}&inspect=true` })}`);
        return;
    }
    process.exit(checks.every(Boolean) ? 0 : 1);
}
let started = false;
process.send = (message) => {
    if (message === 'ready' && !started) { started = true; run().catch((error) => { console.error(error.stack); process.exit(1); }); }
    return true;
};
require('hydrooj/bin/hydrooj');
