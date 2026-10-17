/* eslint-disable no-await-in-loop -- Isolated HTTP scenarios keep fixture mutations ordered. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const supertest = require('supertest');

process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-editor-image-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.EDITOR_IMAGE_PORT || '18908';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => { console.error('Editor image integration timed out'); process.exit(1); }, 120000);
const checks = [];
async function check(name, fn) {
    try { await fn(); checks.push(true); console.log(`PASS ${name}`); }
    catch (error) { checks.push(false); console.error(`FAIL ${name}\n${error.stack}`); }
}
function status(res, expected) { assert.equal(res.status, expected, `${res.status}: ${res.text?.slice(0, 700)}`); }
function denied(res) { assert(res.status >= 400 && res.status < 500, `${res.status}: ${res.text?.slice(0, 300)}`); }

async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, httpServer, PERM, PRIV } = require('hydrooj');
    const scratch = require('../packages/hydrooj/src/model/scratch');
    const storage = require('../packages/hydrooj/src/model/storage').default;
    const system = require('../packages/hydrooj/src/model/system').default;
    const adminId = await users.create('image-admin@example.test', 'image_admin', 'LocalTest123!');
    await users.setSuperAdmin(adminId);
    const teacherId = await users.create('image-teacher@example.test', 'image_teacher', 'LocalTest123!');
    const studentId = await users.create('image-student@example.test', 'image_student', 'LocalTest123!');
    const restrictedId = await users.create('image-restricted@example.test', 'image_restricted', 'LocalTest123!');
    await users.setById(restrictedId, { priv: PRIV.PRIV_USER_PROFILE });
    const scratchId = `image-scratch-${Date.now()}`;
    const ojId = `image-python-${Date.now()}`;
    await domains.add(scratchId, adminId, 'Scratch 创作', 'Isolated clipboard image test', undefined, 'scratch');
    await domains.add(ojId, adminId, 'Python 训练', 'Isolated clipboard image test');
    await domains.addRole(scratchId, 'image-coach', PERM.PERM_VIEW | PERM.PERM_EDIT_DOMAIN);
    await domains.addRole(ojId, 'image-coach', PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM | PERM.PERM_CREATE_PROBLEM);
    for (const domainId of [scratchId, ojId]) {
        await domains.setUserRole(domainId, teacherId, 'image-coach', true);
        await domains.setUserRole(domainId, studentId, 'default', true);
        await domains.setUserRole(domainId, restrictedId, 'default', true);
    }
    await users.setById(teacherId, { defaultDomain: scratchId });
    await users.setById(studentId, { defaultDomain: scratchId });
    const teacher = supertest.agent(httpServer);
    const student = supertest.agent(httpServer);
    const restricted = supertest.agent(httpServer);
    for (const [agent, uname] of [[teacher, 'image_teacher'], [student, 'image_student'], [restricted, 'image_restricted']]) {
        status(await agent.post('/login').send({ uname, password: 'LocalTest123!' }), 302);
    }
    const prefix = `/d/${scratchId}`;
    const ojPrefix = `/d/${ojId}`;
    const get = (agent, url) => agent.get(url).set('Accept', 'application/json');
    const post = (agent, url, body) => agent.post(url).set('Origin', `http://127.0.0.1:${port}`).set('Accept', 'application/json').send(body);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ZkAAAAASUVORK5CYII=', 'base64');
    const filename = 'clipboard-image.png';
    const imageUrl = `${prefix}/file/${teacherId}/${filename}?noDisposition=1`;
    const markdown = `观察这张截图，再完成练习。\n\n![题目截图](${imageUrl})`;
    const upload = (agent, domainPrefix, name = filename) => agent.post(`${domainPrefix}/file`)
        .set('Origin', `http://127.0.0.1:${port}`).set('Accept', 'application/json')
        .field('operation', 'upload_file').field('filename', name).attach('file', png, { filename: name, contentType: 'image/png' });
    async function readScreenshot(agent, url) {
        const response = await agent.get(url).redirects(3);
        status(response, 200);
        assert.match(response.headers['content-type'], /^image\/png/);
        assert(!response.headers['content-disposition']?.includes('attachment'));
        assert.deepEqual(response.body, png);
    }
    await check('Ordinary Scratch and OJ teachers upload with the existing file permission and storage path', async () => {
        assert((await users.getById(scratchId, teacherId)).hasPriv(PRIV.PRIV_CREATE_FILE));
        status(await upload(teacher, prefix), 200);
        status(await upload(teacher, ojPrefix, 'objective-image.png'), 200);
        const meta = await storage.getMeta(`user/${teacherId}/${filename}`);
        assert.equal(meta['Content-Type'], 'image/png');
        assert.equal(meta.size, png.length);
        assert((await users.getById(ojId, teacherId))._files.some((file) => file.name === filename));
    });
    await check('Students read teacher images inline across accessible classrooms without author permissions', async () => {
        await readScreenshot(student, imageUrl);
        await readScreenshot(student, `${ojPrefix}/file/${teacherId}/${filename}?noDisposition=1`);
        await readScreenshot(teacher, imageUrl);
    });
    let project;
    await check('Creative task descriptions preserve the stable image URL when published and edited', async () => {
        status(await post(teacher, `${prefix}/scratch/problem/create/project`, {
            title: '看图创作：移动的小猫', description: markdown, tag: '动作,观察', hidden: 'false',
        }), 200);
        project = await scratch.assignments.findOne({ domainId: scratchId, title: '看图创作：移动的小猫' });
        assert.equal(project.description, markdown);
        const detail = await get(student, `${prefix}/scratch/problem/${project._id}`);
        status(detail, 200);
        assert.equal(detail.body.problem.description, markdown);
        const edit = await get(teacher, `${prefix}/scratch/problem/${project._id}/edit`);
        status(edit, 200);
        assert.equal(edit.body.problem.description, markdown);
        const rendered = await student.get(`${prefix}/scratch/problem/${project._id}`);
        status(rendered, 200);
        assert(rendered.text.includes(`file/${teacherId}/${filename}`));
    });
    let paperId;
    let objectiveId;
    await check('Objective screenshots survive authoring, composition, and student snapshots without temporary signed links', async () => {
        for (const domainPrefix of [prefix, ojPrefix]) {
            status(await post(teacher, `${domainPrefix}/problem/create/objective`, { title: '看图选择积木', tag: '观察',
                objective: JSON.stringify({ version: 1, kind: 'single', stem: markdown,
                    options: ['移动积木', '等待积木'], answers: ['A'], analysis: `结合截图看一看。\n${markdown}` }) }), 200);
        }
        const source = await problems.getMulti(scratchId, { objectiveKind: 'single' }, ['docId', 'objective'], true).next();
        objectiveId = source.docId;
        assert.equal(source.objective.stem, markdown);
        status(await post(teacher, `${prefix}/problem/objective`, { title: '截图客观题练习', pid: 'IMAGEQUIZ',
            paper: JSON.stringify({ version: 1, items: [{ id: objectiveId, score: 100 }] }) }), 200);
        paperId = (await problems.get(scratchId, 'IMAGEQUIZ')).docId;
        const page = await get(student, `${prefix}/scratch/problem/paper/${paperId}`);
        status(page, 200);
        const start = await post(student, `${prefix}/scratch/problem/paper/${paperId}`, {});
        status(start, 200);
        const state = await get(student, start.body.url);
        status(state, 200);
        assert(state.text.includes(imageUrl));
        assert(!state.text.includes('X-Amz-Signature'));
        assert(!state.text.includes('auth_key='));
        await readScreenshot(student, imageUrl);
    });
    await check('Missing upload privilege and exhausted quota are rejected without adding files', async () => {
        denied(await upload(restricted, prefix, 'not-permitted.png'));
        assert.equal(await storage.getMeta(`user/${restrictedId}/not-permitted.png`), null);
        const oldCount = system.get('limit.user_files');
        await system.set('limit.user_files', 2);
        try { denied(await upload(teacher, prefix, 'over-quota.png')); }
        finally { await system.set('limit.user_files', oldCount); }
        assert.equal(await storage.getMeta(`user/${teacherId}/over-quota.png`), null);
        await readScreenshot(student, imageUrl);
    });
    console.log(`RESULT ${checks.filter(Boolean).length}/${checks.length} editor image integration checks passed`);
    clearTimeout(timeout);
    if (process.env.EDITOR_IMAGE_SERVE === '1' && checks.every(Boolean)) {
        const fixture = { origin: `http://localhost:${port}`, teacher: 'image_teacher', admin: 'image_admin', student: 'image_student',
            password: 'LocalTest123!', teacherId, studentId, scratchId, ojId, imageUrl,
            projectEditUrl: `${prefix}/scratch/problem/${project._id}/edit`,
            projectCreateUrl: `${prefix}/scratch/problem/create/project`,
            objectiveEditUrl: `${prefix}/p/${objectiveId}/edit`,
            objectiveCreateUrl: `${prefix}/problem/create/objective`,
            ojObjectiveCreateUrl: `${ojPrefix}/problem/create/objective`,
            paperUrl: `${prefix}/scratch/problem/paper/${paperId}` };
        fs.mkdirSync(path.resolve(__dirname, '../.cache'), { recursive: true });
        fs.writeFileSync(path.resolve(__dirname, '../.cache/editor-image-qa.json'), JSON.stringify(fixture, null, 2), { mode: 0o600 });
        console.log('QA ready; local-only fixture: .cache/editor-image-qa.json');
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
