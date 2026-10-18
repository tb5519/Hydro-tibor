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
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-assignment-audience-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.SCRATCH_ASSIGNMENT_AUDIENCE_PORT || '18908';
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
    const objective = require('../packages/hydrooj/src/model/scratch_objective');
    const adminId = await users.create('audience-admin@example.test', 'audience_admin', 'LocalTest123!');
    await users.setSuperAdmin(adminId);
    const teacherId = await users.create('audience-teacher@example.test', 'audience_teacher', 'LocalTest123!');
    const aliceId = await users.create('audience-alice@example.test', 'audience_alice', 'LocalTest123!');
    const bobId = await users.create('audience-bob@example.test', 'audience_bob', 'LocalTest123!');
    const foreignId = await users.create('audience-foreign@example.test', 'audience_foreign', 'LocalTest123!');
    const domainId = `scratch-audience-${Date.now()}`;
    const otherId = `scratch-foreign-${Date.now()}`;
    await domains.add(domainId, adminId, 'Scratch 创作课堂', 'Isolated audience fixture', undefined, 'scratch');
    await domains.add(otherId, adminId, '其他课堂', 'Cross-domain fixture', undefined, 'scratch');
    await domains.addRole(domainId, 'coach', PERM.PERM_VIEW | PERM.PERM_EDIT_DOMAIN);
    await domains.addRole(otherId, 'coach', PERM.PERM_VIEW | PERM.PERM_EDIT_DOMAIN);
    for (const [uid, role] of [[teacherId, 'coach'], [aliceId, 'default'], [bobId, 'default']]) {
        await domains.setUserRole(domainId, uid, role, true);
        await users.setById(uid, { defaultDomain: domainId });
    }
    await domains.setUserRole(otherId, foreignId, 'coach', true);
    const teacher = supertest.agent(httpServer);
    const alice = supertest.agent(httpServer);
    const bob = supertest.agent(httpServer);
    const foreign = supertest.agent(httpServer);
    for (const [agent, uname] of [[teacher, 'audience_teacher'], [alice, 'audience_alice'], [bob, 'audience_bob'], [foreign, 'audience_foreign']]) {
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
    const actor = { domainId, uid: teacherId, isTeacher: true };
    let assignment, aliceWork, bobWork, submission, share, publication, paperId;
    const details = () => `${prefix}/scratch/assignment/${assignment._id}`;
    const edit = () => `${details()}/edit`;
    const input = (audience = 'all', recipientIds = []) => ({
        title: '角色探险任务', description: '## 任务目标\n\n点击绿旗，让角色移动 **10 步**。', assignmentMode: 'mixed',
        objectivePaperIds: [paperId], audience, recipientIds: JSON.stringify(recipientIds),
    });
    await check('Only a teacher can publish; recipients must be nonempty, unique, current classroom members', async () => {
        const roster = await get(teacher, createUrl);
        status(roster, 200);
        assert(roster.body.assignmentStudents.some((member) => member.uid === aliceId));
        assert(!roster.body.assignmentStudents.some((member) => member.uid === foreignId));
        for (const fields of [ { audience: 'bogus', recipientIds: [] }, { audience: 'selected', recipientIds: [] },
            { audience: 'selected', recipientIds: [foreignId] }, { audience: 'selected', recipientIds: [aliceId, aliceId] },
            { audience: 'selected', recipientIds: ['1'] }, { audience: 'selected', recipientIds: 'invalid' }]) {
            denied(await post(teacher, createUrl, { title: '拒绝无效范围', description: '', assignmentMode: 'project', ...fields }));
        }
        denied(await post(alice, createUrl, { title: '学员不能发布', description: '', assignmentMode: 'project' }));
        assert.equal(await scratch.assignments.countDocuments({ domainId }), 0);
    });
    await check('Legacy/all homework is available to both joined students, including objective state and real project submit', async () => {
        status(await post(teacher, `${prefix}/problem/create/objective`, { title: '移动积木', tag: '动作',
            objective: JSON.stringify({ version: 1, kind: 'single', stem: '哪块积木能移动角色？', options: ['移动', '等待'], answers: ['A'], analysis: '移动会改变角色位置。' }) }), 200);
        const item = await problems.getMulti(domainId, { objectiveKind: 'single' }, ['docId'], true).next();
        status(await post(teacher, `${prefix}/problem/objective`, { title: '动作小练习', pid: 'AUDIENCEQUIZ',
            paper: JSON.stringify({ version: 1, items: [{ id: item.docId, score: 100 }] }) }), 200);
        paperId = (await problems.get(domainId, 'AUDIENCEQUIZ')).docId;
        status(await form(teacher, createUrl, { ...input(), objectivePaperIds: `${paperId}` }).attach('template', original, 'starter.sb3'), 200);
        assignment = await scratch.assignments.findOne({ domainId, title: '角色探险任务' });
        for (const agent of [alice, bob]) {
            const page = await get(agent, details()); status(page, 200); assert(page.body.assignment);
            status(await post(agent, details(), {}), 200);
        }
        aliceWork = await scratch.works.findOne({ domainId, owner: aliceId, assignmentId: assignment._id });
        bobWork = await scratch.works.findOne({ domainId, owner: bobId, assignmentId: assignment._id });
        for (const [agent, work] of [[alice, aliceWork], [bob, bobWork]]) {
            status(await form(agent, `${prefix}/scratch/work/${work._id}/save`, { revision: 0, submit: true }).attach('file', original, 'project.sb3'), 200);
        }
        submission = await scratch.submissions.findOne({ domainId, owner: aliceId, assignmentId: assignment._id });
        share = await scratch.shareWork({ domainId, uid: bobId, isTeacher: false }, bobWork._id);
        publication = (await scratch.publishCommunityWork({ domainId, uid: bobId, isTeacher: false }, bobWork._id)).publication;
        const gallery = await get(bob, `${prefix}/scratch/works`); status(gallery, 200);
        assert(gallery.body.works.some((work) => work._id === `${bobWork._id}`));
    });
    await check('Selected recipients see the same homework; removed recipients lose all lists, direct links, editor, files, saves and objective answers', async () => {
        status(await post(teacher, edit(), input('selected', [aliceId])), 200);
        assignment = await scratch.getAssignment(actor, assignment._id);
        for (const route of [details(), `${prefix}/scratch/work/${bobWork._id}`, `${prefix}/scratch/editor?workId=${bobWork._id}`,
            `${prefix}/scratch/file/${assignment.templateFileId}`, `${prefix}/scratch/work/${bobWork._id}/thumbnail`,
            `${prefix}/scratch/assignment/${assignment._id}/quiz`]) denied(await get(bob, route));
        denied(await post(bob, details(), {}));
        denied(await form(bob, `${prefix}/scratch/work/${bobWork._id}/save`, { revision: 1, submit: true }).attach('file', original, 'project.sb3'));
        denied(await post(bob, `${prefix}/scratch/assignment/${assignment._id}/quiz`, { operation: 'answer', revision: assignment.objectiveQuiz.revision, questionId: 1, answers: ['A'] }));
        for (const [url, field] of [[`${prefix}/scratch/assignments`, 'assignments'], [`${prefix}/scratch/works`, 'works']]) {
            const page = await get(bob, url); status(page, 200); assert.equal(page.body[field].length, 0);
        }
        const home = await get(bob, `${prefix}/scratch`); status(home, 200);
        assert.equal(home.body.continuationWork, null);
        assert.equal(home.body.assignments.length, 0);
        assert.equal(home.body.submissions.length, 0);
        status(await get(alice, details()), 200);
        denied(await get(foreign, `/d/${otherId}/scratch/assignment/${assignment._id}`));
    });
    await check('Old anonymous share tokens are revoked, community is filtered by recipient, and the chosen student may answer', async () => {
        await assert.rejects(scratch.getPublicShare(domainId, share._id));
        await assert.rejects(scratch.shareWork({ domainId, uid: aliceId, isTeacher: false }, aliceWork._id));
        status(await get(alice, `${prefix}/scratch/community/${publication._id}`), 200);
        denied(await get(bob, `${prefix}/scratch/community/${publication._id}`));
        assert.equal((await scratch.pageCommunityWorks({ domainId, uid: bobId, isTeacher: false })).count, 0);
        const quiz = await get(alice, `${details()}/quiz`); status(quiz, 200);
        assert(!quiz.body.scratchObjectiveQuiz.items[0].answers, 'unanswered answer keys stay private');
        status(await post(alice, `${details()}/quiz`, { operation: 'answer', revision: assignment.objectiveQuiz.revision,
            questionId: 1, answers: ['A'] }), 200);
        const answer = await objective.results.findOne({ domainId, owner: aliceId, assignmentId: assignment._id });
        assert(answer.answers['1'].correct);
        assert.equal(await objective.results.countDocuments({ domainId, owner: bobId }), 0);
    });
    await check('Delete is teacher-only, keeps snapshots and answers, and permits only read-only teacher inspection', async () => {
        denied(await post(alice, details(), { operation: 'delete' }));
        denied(await post(foreign, `/d/${otherId}/scratch/assignment/${assignment._id}`, { operation: 'delete' }));
        const deletion = await post(teacher, details(), { operation: 'delete' }); status(deletion, 200);
        assert.equal(deletion.body.ok, true); assert.match(deletion.body.url, /status=deleted/);
        const list = await get(teacher, deletion.body.url); status(list, 200); assert.equal(list.body.showDeleted, true);
        assert(list.body.assignments.some((doc) => doc._id === `${assignment._id}`));
        denied(await get(alice, `${prefix}/scratch/assignments?status=deleted`));
        denied(await get(alice, details())); denied(await get(alice, `${details()}/quiz`));
        denied(await get(teacher, edit())); denied(await post(teacher, edit(), input()));
        denied(await post(teacher, `${prefix}/scratch/submission/${submission._id}`, { grade: '优秀', feedback: '已删除不能批改' }));
        const review = await get(teacher, `${prefix}/scratch/submission/${submission._id}`); status(review, 200);
        assert(review.body.assignment.deletedAt);
        const editor = await teacher.get(`${prefix}/scratch/editor?workId=${aliceWork._id}`); status(editor, 200);
        const config = uiContext(editor.text).scratchEditor;
        assert.equal(config.readOnly, true); assert.equal(config.saveForStudent, false); assert.equal(config.saveUrl, null);
        status(await get(teacher, `${prefix}/scratch/file/${submission.fileId}`), 200);
        assert.equal(await scratch.submissions.countDocuments({ domainId, assignmentId: assignment._id }), 2);
        assert.equal(await objective.results.countDocuments({ domainId, assignmentId: assignment._id }), 1);
    });
    await check('Restore preserves audience, snapshots, answers and permission checks', async () => {
        denied(await post(bob, details(), { operation: 'restore' }));
        const restoration = await post(teacher, details(), { operation: 'restore' }); status(restoration, 200);
        assert.equal(restoration.body.ok, true); assert(restoration.body.url.endsWith(`${assignment._id}`));
        status(await get(alice, details()), 200); denied(await get(bob, details()));
        assert.equal((await get(alice, `${details()}/quiz`)).body.scratchObjectiveQuiz.correct, 1);
        status(await post(teacher, `${prefix}/scratch/submission/${submission._id}`, { grade: '优秀', feedback: '恢复后正常批改' }), 200);
        assert.equal((await get(alice, `${prefix}/scratch/submission/${submission._id}`)).body.submission.grade, '优秀');
        status(await post(teacher, edit(), input()), 200);
        status(await get(bob, details()), 200);
        assert((await scratch.getPublicShare(domainId, share._id)).file);
    });
    await check('Deleted homework remains independent of library challenges and a real student can create and edit a fresh assignment', async () => {
        status(await post(teacher, `${prefix}/scratch/problem/create/project`, { title: '公开创作题', description: '题库内容保留', tag: '创作', hidden: false }), 200);
        const source = await scratch.assignments.findOne({ domainId, kind: 'problem', title: '公开创作题' });
        status(await post(teacher, createUrl, { title: '仅小雨的创作作业', description: '尝试给角色加一句问候。', assignmentMode: 'project',
            projectProblemId: `${source._id}`, audience: 'selected', recipientIds: JSON.stringify([aliceId]) }), 200);
        const second = await scratch.assignments.findOne({ domainId, title: '仅小雨的创作作业' });
        denied(await post(teacher, `${prefix}/scratch/assignment/${source._id}`, { operation: 'delete' }));
        status(await get(bob, `${prefix}/scratch/problem/${source._id}`), 200);
        denied(await get(bob, `${prefix}/scratch/assignment/${second._id}`));
        await domains.collUser.updateOne({ domainId, uid: bobId }, { $set: { join: false } });
        denied(await post(teacher, `${prefix}/scratch/assignment/${second._id}/edit`, { ...input('selected', [bobId]), assignmentMode: 'project' }));
        await domains.collUser.updateOne({ domainId, uid: bobId }, { $set: { join: true } });
    });
    console.log(`RESULT ${checks.filter(Boolean).length}/${checks.length} Scratch assignment audience checks passed`);
    clearTimeout(timeout);
    if (process.env.KEEP_QA === '1' && checks.every(Boolean)) {
        await users.setById(aliceId, { displayName: '小雨' }); await users.setById(bobId, { displayName: '小辰' });
        const archivePath = path.resolve(__dirname, '../.cache/scratch-assignment-audience-source.sb3');
        fs.writeFileSync(archivePath, original);
        fs.writeFileSync(path.resolve(__dirname, '../.cache/scratch-assignment-audience-qa.json'), JSON.stringify({
            origin: `http://localhost:${port}`, teacher: 'audience_teacher', student: 'audience_alice', excluded: 'audience_bob',
            password: 'LocalTest123!', domainId, teacherId, aliceId, bobId, assignmentId: `${assignment._id}`,
            createUrl, assignmentUrl: details(), listUrl: `${prefix}/scratch/assignments`, editorUrl: `${prefix}/scratch/editor?workId=${aliceWork._id}`, archivePath,
        }, null, 2), { mode: 0o600 });
        console.log('QA ready; local fixture: .cache/scratch-assignment-audience-qa.json');
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
