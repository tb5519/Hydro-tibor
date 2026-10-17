/* eslint-disable no-await-in-loop -- Keep isolated HTTP lifecycle scenarios ordered. */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Zip = require('adm-zip');
const supertest = require('supertest');

process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-project-assignment-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.SCRATCH_PROJECT_ASSIGNMENT_PORT || '18908';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => { console.error('Scratch project assignment integration timed out'); process.exit(1); }, 150000);
const checks = [];
async function check(name, fn) {
    try { await fn(); checks.push(true); console.log(`PASS ${name}`); }
    catch (error) { checks.push(false); console.error(`FAIL ${name}\n${error.stack}`); }
}
function status(res, expected) { assert.equal(res.status, expected, `${res.status}: ${res.text?.slice(0, 700)}`); }
function denied(res) { assert(res.status >= 400 && res.status < 500, `${res.status}: ${res.text?.slice(0, 500)}`); }
async function bytes(stream) {
    if (Buffer.isBuffer(stream)) return stream;
    const parts = [];
    for await (const part of stream) parts.push(Buffer.from(part));
    return Buffer.concat(parts);
}
function uiContext(html) {
    const match = html.match(/window\.UiContext = ('(?:\\.|[^'\\])*');/);
    assert(match, 'Editor must expose its UI contract');
    return JSON.parse(vm.runInNewContext(match[1], {}, { timeout: 100 }));
}
function projectArchive(color = '#ffb344') {
    const zip = new Zip();
    const costume = (name, svg, cx, cy) => {
        const body = Buffer.from(svg);
        const assetId = createHash('md5').update(body).digest('hex');
        zip.addFile(`${assetId}.svg`, body);
        return { name, assetId, dataFormat: 'svg', md5ext: `${assetId}.svg`, bitmapResolution: 1, rotationCenterX: cx, rotationCenterY: cy };
    };
    const backdrop = costume('背景', '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#f2f7ff"/></svg>', 240, 180);
    const sprite = costume('小角色', `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><circle cx="48" cy="48" r="40" fill="${color}"/><circle cx="34" cy="40" r="5" fill="#26334d"/><circle cx="62" cy="40" r="5" fill="#26334d"/><path d="M30 58Q48 74 66 58" fill="none" stroke="#26334d" stroke-width="4"/></svg>`, 48, 48);
    zip.addFile('project.json', Buffer.from(JSON.stringify({ targets: [{ isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {},
        blocks: {}, comments: {}, currentCostume: 0, costumes: [backdrop], sounds: [], volume: 100, layerOrder: 0,
        tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null,
    }, { isStage: false, name: '小角色', variables: {}, lists: {}, broadcasts: {}, comments: {},
        blocks: { flag: { opcode: 'event_whenflagclicked', next: 'move', parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 40, y: 40 },
            move: { opcode: 'motion_movesteps', next: null, parent: 'flag', inputs: { STEPS: [1, [4, '10']] }, fields: {}, shadow: false, topLevel: false } },
        currentCostume: 0, costumes: [sprite], sounds: [], volume: 100, layerOrder: 1, visible: true,
        x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around',
    }], monitors: [], extensions: [], meta: { semver: '3.0.0', vm: '0.2.0' } })));
    return zip.toBuffer();
}

async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, httpServer, PERM } = require('hydrooj');
    const scratch = require('../packages/hydrooj/src/model/scratch');
    const storage = require('../packages/hydrooj/src/model/storage').default;
    const adminId = await users.create('assignment-admin@example.test', 'assignment_admin', 'LocalTest123!');
    await users.setSuperAdmin(adminId);
    const teacherId = await users.create('assignment-teacher@example.test', 'assignment_teacher', 'LocalTest123!');
    const studentId = await users.create('assignment-student@example.test', 'assignment_student', 'LocalTest123!');
    const outsiderId = await users.create('assignment-outsider@example.test', 'assignment_outsider', 'LocalTest123!');
    const domainId = `project-assignment-${Date.now()}`;
    const otherId = `project-other-${Date.now()}`;
    await domains.add(domainId, adminId, 'Scratch 创作课堂', 'Isolated project assignment fixture', undefined, 'scratch');
    await domains.add(otherId, adminId, '其他 Scratch 课堂', 'Cross-domain test', undefined, 'scratch');
    await domains.addRole(domainId, 'coach', PERM.PERM_VIEW | PERM.PERM_EDIT_DOMAIN);
    await domains.addRole(otherId, 'coach', PERM.PERM_VIEW | PERM.PERM_EDIT_DOMAIN);
    await domains.setUserRole(domainId, teacherId, 'coach', true);
    await domains.setUserRole(domainId, studentId, 'default', true);
    await domains.setUserRole(otherId, outsiderId, 'coach', true);
    await users.setById(teacherId, { defaultDomain: domainId });
    await users.setById(studentId, { defaultDomain: domainId });
    const teacher = supertest.agent(httpServer);
    const student = supertest.agent(httpServer);
    const outsider = supertest.agent(httpServer);
    for (const [agent, uname] of [[teacher, 'assignment_teacher'], [student, 'assignment_student'], [outsider, 'assignment_outsider']]) {
        status(await agent.post('/login').send({ uname, password: 'LocalTest123!' }), 302);
    }
    const prefix = `/d/${domainId}`;
    const get = (agent, url) => agent.get(url).set('Accept', 'application/json');
    const post = (agent, url, body) => agent.post(url).set('Origin', `http://127.0.0.1:${port}`).set('Accept', 'application/json').send(body);
    const form = (agent, url, body) => {
        let request = agent.post(url).set('Origin', `http://127.0.0.1:${port}`).set('Accept', 'application/json');
        for (const [key, value] of Object.entries(body)) request = request.field(key, `${value}`);
        return request;
    };
    const createUrl = `${prefix}/scratch/assignment/create`;
    const original = projectArchive();
    const replacement = projectArchive('#7f75f7');
    const description = '## 创作目标\n\n点击绿旗，让小角色移动 **10 步**。\n\n- 再添加一句问候\n- 保存后提交作品';
    let source;
    let noTemplate;
    let paperId;
    let assigned;
    let mixed;
    let work;
    let submission;
    const fileBytes = async (fileId) => bytes(await storage.get((await scratch.files.findOne({ _id: fileId, domainId })).path));
    await check('Create independent bank challenges and an objective paper as ordinary domain teacher', async () => {
        status(await form(teacher, `${prefix}/scratch/problem/create/project`, {
            title: '会移动的小角色', description, tag: '动作,事件', hidden: 'false',
        }).attach('template', original, 'starter.sb3'), 200);
        source = await scratch.assignments.findOne({ domainId, kind: 'problem', title: '会移动的小角色' });
        assert(source.templateFileId);
        status(await post(teacher, `${prefix}/scratch/problem/create/project`, {
            title: '从空白开始创作', description: '自由设计一个角色。', tag: '创作', hidden: true,
        }), 200);
        noTemplate = await scratch.assignments.findOne({ domainId, title: '从空白开始创作' });
        status(await post(teacher, `${prefix}/problem/create/objective`, { title: '移动积木', tag: '动作',
            objective: JSON.stringify({ version: 1, kind: 'single', stem: '哪块积木能移动角色？', options: ['移动', '等待'], answers: ['A'], analysis: '移动会改变角色位置。' }) }), 200);
        const objective = await problems.getMulti(domainId, { objectiveKind: 'single' }, ['docId'], true).next();
        status(await post(teacher, `${prefix}/problem/objective`, { title: '动作小练习', pid: 'MOVEMENT',
            paper: JSON.stringify({ version: 1, items: [{ id: objective.docId, score: 100 }] }) }), 200);
        paperId = (await problems.get(domainId, 'MOVEMENT')).docId;
    });
    await check('Teacher gets compact project choices, lazy preview and one-click preselection; learners and foreign teachers cannot preview', async () => {
        const listing = await get(teacher, createUrl);
        status(listing, 200);
        assert.equal(listing.body.projectProblems.length, 2);
        assert(listing.body.projectProblems.every((item) => !Object.hasOwn(item, 'description')));
        const choice = listing.body.projectProblems.find((item) => item.id === `${source._id}`);
        const preview = await get(teacher, choice.previewUrl);
        status(preview, 200);
        assert.equal(preview.body.projectProblem.description, description);
        denied(await get(student, choice.previewUrl));
        denied(await get(outsider, `/d/${otherId}/scratch/problem/${source._id}/assignment-preview`));
        const detail = await get(teacher, `${prefix}/scratch/problem/${source._id}`);
        assert(detail.body.problem.assignmentUrl.endsWith(`?projectProblemId=${source._id}`));
        const preselected = await get(teacher, detail.body.problem.assignmentUrl);
        status(preselected, 200);
        assert.equal(preselected.body.assignment, null);
        assert.equal(preselected.body.selectedProjectProblemId, `${source._id}`);
        assert.equal(preselected.body.selectedProjectProblem.description, description);
        assert.equal((await get(student, `${prefix}/scratch/problem/${source._id}`)).body.problem.assignmentUrl, null);
    });
    await check('Publishing a bank challenge snapshots title, description and a separate immutable template in the homework list', async () => {
        const published = await post(teacher, createUrl, { assignmentMode: 'project', projectProblemId: `${source._id}` });
        status(published, 200);
        assigned = await scratch.assignments.findOne({ domainId, sourceProblemId: source._id, kind: { $ne: 'problem' } });
        assert(assigned && !assigned._id.equals(source._id));
        assert.equal(assigned.title, source.title);
        assert.equal(assigned.description, description);
        assert.equal(assigned.kind, undefined);
        assert.equal(assigned.problemPaperId, undefined);
        assert(!assigned.templateFileId.equals(source.templateFileId));
        const file = await scratch.files.findOne({ _id: assigned.templateFileId, domainId });
        assert(file.assignmentId.equals(assigned._id));
        assert.deepEqual(await fileBytes(assigned.templateFileId), original);
        const list = await get(student, `${prefix}/scratch/assignments`);
        assert(list.body.assignments.some((item) => item._id === `${assigned._id}`));
        assert(!list.body.assignments.some((item) => item._id === `${source._id}`));
    });
    await check('Mixed homework accepts a project challenge and objective papers while honoring custom teacher wording', async () => {
        status(await post(teacher, createUrl, { title: '作品加选择题', description: '先完成作品，再做选择题。', assignmentMode: 'mixed',
            projectProblemId: `${source._id}`, objectivePaperIds: [paperId] }), 200);
        mixed = await scratch.assignments.findOne({ domainId, title: '作品加选择题' });
        assert.equal(mixed.projectRequired, true);
        assert.equal(mixed.description, '先完成作品，再做选择题。');
        assert(mixed.sourceProblemId.equals(source._id));
        assert.equal(mixed.objectiveQuiz.items.length, 1);
        const page = await get(student, `${prefix}/scratch/assignment/${mixed._id}`);
        status(page, 200);
        assert(!page.text.includes('"answers"'));
        assert(page.body.objectiveQuiz.url);
    });
    await check('A new upload overrides the source; changing to an empty-template source or clearing it removes the old template', async () => {
        status(await form(teacher, createUrl, { title: '自定义起始作品', assignmentMode: 'project', projectProblemId: `${source._id}` })
            .attach('template', replacement, 'custom.sb3'), 200);
        let custom = await scratch.assignments.findOne({ domainId, title: '自定义起始作品' });
        assert.deepEqual(await fileBytes(custom.templateFileId), replacement);
        const oldFileId = custom.templateFileId;
        status(await post(teacher, `${prefix}/scratch/assignment/${custom._id}/edit`, { title: custom.title, description: custom.description,
            assignmentMode: 'project', projectProblemId: `${noTemplate._id}` }), 200);
        custom = await scratch.assignments.findOne({ _id: custom._id });
        assert.equal(custom.templateFileId, null);
        assert.equal(await scratch.files.findOne({ _id: oldFileId }), null);
        status(await post(teacher, `${prefix}/scratch/assignment/${custom._id}/edit`, { title: custom.title, description: custom.description,
            assignmentMode: 'project', projectProblemId: `${source._id}` }), 200);
        status(await post(teacher, `${prefix}/scratch/assignment/${custom._id}/edit`, { title: custom.title, description: custom.description,
            assignmentMode: 'project', projectProblemId: '' }), 200);
        custom = await scratch.assignments.findOne({ _id: custom._id });
        assert.equal(custom.sourceProblemId, null);
        assert.equal(custom.templateFileId, null);
        assert.equal(custom.description, description);
    });
    await check('Editing and hiding the bank source cannot change or disable the published homework snapshot', async () => {
        const sourceTemplateId = source.templateFileId;
        status(await form(teacher, `${prefix}/scratch/problem/${source._id}/edit`, {
            title: '旋转的小角色（题库最新版）', description: '这是更新后的题库要求。', tag: '旋转', hidden: 'true',
        }).attach('template', replacement, 'new-starter.sb3'), 200);
        denied(await get(student, `${prefix}/scratch/problem/${source._id}`));
        const homework = await get(student, `${prefix}/scratch/assignment/${assigned._id}`);
        status(homework, 200);
        assert.equal(homework.body.assignment.title, '会移动的小角色');
        assert.equal(homework.body.assignment.description, description);
        assert.deepEqual(await fileBytes(assigned.templateFileId), original);
        assert.equal(await scratch.files.findOne({ _id: sourceTemplateId }), null);
        status(await student.get(`${prefix}/scratch/file/${assigned.templateFileId}`).redirects(3), 200);
    });
    await check('Students start a distinct assignment work, see the snapshot beside Scratch, submit and receive teacher review', async () => {
        const started = await post(student, `${prefix}/scratch/assignment/${assigned._id}`, {});
        status(started, 200);
        work = await scratch.works.findOne({ domainId, owner: studentId, assignmentId: assigned._id });
        assert(work);
        assert.equal(await scratch.works.countDocuments({ domainId, owner: studentId, assignmentId: source._id }), 0);
        const editor = await student.get(started.body.url);
        status(editor, 200);
        const config = uiContext(editor.text).scratchEditor;
        assert.equal(config.problemMode, true);
        assert.equal(config.submitLabel, '提交作业');
        assert(config.backUrl.endsWith(`/scratch/assignment/${assigned._id}`));
        assert(config.projectUrl.includes(`${assigned.templateFileId}`));
        const editorJson = await get(student, started.body.url);
        assert.equal(editorJson.body.problem.description, description);
        status(await form(student, `${prefix}/scratch/work/${work._id}/save`, { revision: 0, submit: 'true' })
            .attach('file', original, 'student.sb3'), 200);
        submission = await scratch.submissions.findOne({ domainId, workId: work._id });
        assert(submission.assignmentId.equals(assigned._id));
        const teacherPage = await get(teacher, `${prefix}/scratch/assignment/${assigned._id}`);
        assert(teacherPage.body.submissions.some((item) => item._id === `${submission._id}`));
        denied(await post(student, `${prefix}/scratch/submission/${submission._id}`, { grade: '优秀', feedback: '不应保存' }));
        status(await post(teacher, `${prefix}/scratch/submission/${submission._id}`, { grade: '优秀', feedback: '移动效果完成得很好。' }), 200);
        const reviewed = await get(student, `${prefix}/scratch/submission/${submission._id}`);
        status(reviewed, 200);
        assert.equal(reviewed.body.submission.grade, '优秀');
        assert.equal(reviewed.body.submission.feedback, '移动效果完成得很好。');
    });
    await check('Editing a copied assignment still works after its original challenge is removed', async () => {
        status(await post(teacher, createUrl, { title: '独立副本', description: '保留的作业要求', assignmentMode: 'project', projectProblemId: `${noTemplate._id}` }), 200);
        const copy = await scratch.assignments.findOne({ domainId, title: '独立副本' });
        await scratch.assignments.deleteOne({ domainId, _id: noTemplate._id });
        const edit = await get(teacher, `${prefix}/scratch/assignment/${copy._id}/edit`);
        status(edit, 200);
        assert.equal(edit.body.selectedProjectProblemId, `${noTemplate._id}`);
        for (const sourceField of [{}, { projectProblemId: `${noTemplate._id}` }]) {
            status(await post(teacher, `${prefix}/scratch/assignment/${copy._id}/edit`, { title: copy.title, description: copy.description,
                assignmentMode: 'project', ...sourceField }), 200);
        }
        assert.equal((await scratch.assignments.findOne({ _id: copy._id })).description, copy.description);
    });
    await check('Source selection rejects malformed, unknown, cross-domain, assignment and paper IDs without creating homework', async () => {
        const count = await scratch.assignments.countDocuments({ domainId, kind: { $ne: 'problem' } });
        for (const id of ['bad-id', 'a'.repeat(24), `${assigned._id}`]) {
            denied(await post(teacher, createUrl, { title: '拒绝无效来源', assignmentMode: 'project', projectProblemId: id }));
        }
        const backingStart = await post(student, `${prefix}/scratch/problem/paper/${paperId}`, {});
        status(backingStart, 200);
        const backing = await scratch.assignments.findOne({ domainId, problemPaperId: paperId });
        denied(await post(teacher, createUrl, { title: '拒绝题卷来源', assignmentMode: 'project', projectProblemId: `${backing._id}` }));
        denied(await post(teacher, createUrl, { title: '拒绝混淆模式', assignmentMode: 'objective', projectProblemId: `${source._id}`, objectivePaperIds: [paperId] }));
        denied(await post(student, createUrl, { title: '学员不能发布', projectProblemId: `${source._id}` }));
        denied(await post(outsider, `/d/${otherId}/scratch/assignment/create`, { title: '跨域不能复制', projectProblemId: `${source._id}` }));
        assert.equal(await scratch.assignments.countDocuments({ domainId, kind: { $ne: 'problem' } }), count);
    });
    console.log(`RESULT ${checks.filter(Boolean).length}/${checks.length} Scratch project assignment checks passed`);
    clearTimeout(timeout);
    if (process.env.KEEP_QA === '1' && checks.every(Boolean)) {
        await scratch.assignments.updateOne({ _id: source._id, domainId }, { $set: { hidden: false } });
        fs.mkdirSync(path.resolve(__dirname, '../.cache'), { recursive: true });
        const archivePath = path.resolve(__dirname, '../.cache/scratch-project-assignment-source.sb3');
        fs.writeFileSync(archivePath, original);
        fs.writeFileSync(path.resolve(__dirname, '../.cache/scratch-project-assignment-qa.json'), JSON.stringify({
            origin: `http://localhost:${port}`, teacher: 'assignment_teacher', admin: 'assignment_admin', student: 'assignment_student',
            password: 'LocalTest123!', domainId, teacherId, studentId, sourceId: `${source._id}`, assignmentId: `${assigned._id}`, mixedId: `${mixed._id}`,
            sourceUrl: `${prefix}/scratch/problem/${source._id}`, createUrl: `${createUrl}?projectProblemId=${source._id}`,
            assignmentUrl: `${prefix}/scratch/assignment/${assigned._id}`, editorUrl: `${prefix}/scratch/editor?workId=${work._id}`,
            submissionUrl: `${prefix}/scratch/submission/${submission._id}`, archivePath,
        }, null, 2), { mode: 0o600 });
        console.log('QA ready; local fixture: .cache/scratch-project-assignment-qa.json');
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
