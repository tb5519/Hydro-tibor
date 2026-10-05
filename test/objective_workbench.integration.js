/* Starts an isolated memory database; never connects to the configured application database. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const supertest = require('supertest');
const yaml = require('js-yaml');

process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-objective-test-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
process.argv.push('--port', process.env.OBJECTIVE_TEST_PORT || '18889', '--host', '127.0.0.1');
const timeout = setTimeout(() => { console.error('Objective integration timed out'); process.exit(1); }, 120000);
const results = [];
async function check(name, fn) {
    try { await fn(); results.push(true); console.log(`PASS ${name}`); }
    catch (error) { results.push(false); console.error(`FAIL ${name}\n${error.stack}`); }
}
function status(res, expected) {
    assert.equal(res.status, expected, `${res.status}: ${res.text?.slice(0, 600)}`);
}
function privateAbsent(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    assert(!text.includes('PRIVATE_TEACHING_NOTE'));
    assert(!/"objective(?:Paper)?"\s*:/.test(text));
    assert(!/"answers"\s*:/.test(text));
}

async function run() {
    const {
        UserModel: users, DomainModel: domains, ProblemModel: problems, DocumentModel: documents,
        ContestModel: contests, StorageModel: storage, httpServer, PERM,
    } = require('hydrooj');
    const { streamToBuffer } = require('@hydrooj/utils');
    const domainId = `objective-${Date.now()}`;
    const prefix = `/d/${domainId}`;
    const teacherId = await users.create('teacher@example.test', 'objective_teacher', 'LocalTest123!');
    await users.setSuperAdmin(teacherId);
    const studentId = await users.create('student@example.test', 'objective_student', 'LocalTest123!');
    await domains.add(domainId, teacherId, 'Objective integration', 'Isolated test domain');
    await domains.addRole(domainId, 'student', PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM | PERM.PERM_SUBMIT_PROBLEM
        | PERM.PERM_VIEW_CONTEST | PERM.PERM_ATTEND_CONTEST | PERM.PERM_VIEW_RECORD);
    await domains.setUserRole(domainId, studentId, 'student', true);
    const teacher = supertest.agent(httpServer);
    const student = supertest.agent(httpServer);
    status(await teacher.post('/login').send({ uname: 'objective_teacher', password: 'LocalTest123!' }), 302);
    status(await student.post('/login').send({ uname: 'objective_student', password: 'LocalTest123!' }), 302);
    const base = {
        version: 1, kind: 'single', stem: '素材题干：哪一个正确？', options: ['甲', '乙', '丙'],
        answers: ['A'], analysis: 'PRIVATE_TEACHING_NOTE',
    };
    const sourceIds = [];
    for (const kind of ['single', 'multiple', 'judge']) {
        await check(`Create ${kind} as teacher-only material`, async () => {
            const objective = { ...base, kind, answers: kind === 'multiple' ? ['A', 'C'] : ['A'] };
            const res = await teacher.post(`${prefix}/problem/create/objective`).send({
                title: `素材-${kind}`, objective: JSON.stringify(objective), tag: '循环,基础', hidden: false,
            });
            status(res, 302);
            assert(res.headers.location.startsWith(`${prefix}/problem/objective`));
            const doc = await problems.getMulti(domainId, { objectiveKind: kind }, [...problems.PROJECTION_PUBLIC, 'objective'], true).next();
            assert(doc?.hidden);
            assert.equal(doc.objective.kind, kind);
            sourceIds.push(doc.docId);
        });
    }
    assert.equal(sourceIds.length, 3);
    const legacyPaper = await problems.add(domainId, 'OLDPAPER', 'Existing complete paper', 'Legacy whole exam', teacherId);
    await problems.addTestdata(domainId, legacyPaper, 'config.yaml', Buffer.from('type: objective\nanswers:\n  1: [A, 100]\n'), teacherId);
    // Simulate a material published by the previous release, including a student owner.
    await documents.coll.updateOne({ domainId, docType: 10, docId: sourceIds[0] }, { $set: { hidden: false, owner: studentId } });

    await check('Existing public materials disappear from all regular catalog reads', async () => {
        assert.deepEqual((await problems.getMulti(domainId, {}).toArray()).map((p) => p.docId), [legacyPaper]);
        assert.equal(await problems.count(domainId, {}), 1);
        const acrossDomains = { domainId: { $in: [domainId] }, $or: [{ hidden: false }], $and: [{ nAccept: { $gte: 0 } }] };
        const querySnapshot = JSON.stringify(acrossDomains);
        assert.equal((await problems.getMulti('', acrossDomains).toArray()).length, 1);
        assert.equal(JSON.stringify(acrossDomains), querySnapshot);
        assert.equal((await problems.list(domainId, {}, 1, 20))[0].length, 1);
        assert.equal(await problems.random(domainId, {}), 'OLDPAPER');
        assert.deepEqual(await problems.getList(domainId, sourceIds, true, false, ['docId', 'title'], true), {});
        for (const agent of [teacher, student]) {
            for (const query of [{}, { quick: true }, { q: '素材' }, { sort: 'recent' }]) {
                const res = await agent.get(`${prefix}/p`).query(query).set('Accept', 'application/json');
                status(res, 200);
                assert(!res.text.includes('素材-single'));
                assert(!res.text.includes('素材-multiple'));
            }
        }
    });

    await check('Student cannot view source even when owner, hidden=false or known URL', async () => {
        for (const suffix of ['', '/edit', '/solution', '/stat', '/file/config.yaml?type=testdata']) {
            const res = await student.get(`${prefix}/p/${sourceIds[0]}${suffix}`).set('Accept', 'application/json');
            assert([401, 403, 404].includes(res.status), `${suffix}: ${res.status}`);
            privateAbsent(res.body);
        }
        const res = await student.post(`${prefix}/p/${sourceIds[0]}/submit`).send({ lang: '_', code: '1: A' });
        assert([401, 403, 404].includes(res.status));
    });

    await check('Student cannot access teacher workspace, inventory or publish endpoint', async () => {
        for (const route of ['/problem/objective', '/problem/objective/items', '/problem/create/objective']) {
            const res = await student.get(`${prefix}${route}`).set('Accept', 'application/json');
            assert([401, 403].includes(res.status), `${route}: ${res.status}`);
        }
        const res = await student.post(`${prefix}/problem/objective`).send({ title: 'No', paper: '{}' });
        assert([401, 403].includes(res.status));
    });

    await check('Public APIs never return materials or private snapshots', async () => {
        const projection = JSON.stringify({ docId: 1, title: 1, objective: 1, objectivePaper: 1, config: 1 });
        const one = await student.get(`${prefix}/api/problem`).query({ args: JSON.stringify({ domainId, id: sourceIds[0] }), projection });
        assert([401, 403, 404].includes(one.status) || !one.body);
        const many = await student.get(`${prefix}/api/problems`).query({ args: JSON.stringify({ domainId, ids: sourceIds }), projection });
        status(many, 200);
        assert.deepEqual(many.body, []);
    });

    await check('Teacher inventory supports filters and editing data', async () => {
        const res = await teacher.get(`${prefix}/problem/objective/items`).query({ kind: 'multiple', tag: '循环', q: '素材' });
        status(res, 200);
        assert.equal(res.body.total, 1);
        assert.equal(res.body.items[0].objective.kind, 'multiple');
        assert.equal(res.body.items[0].objective.analysis, base.analysis);
        assert(res.body.items[0].editUrl.includes('/edit'));
        const literal = await teacher.get(`${prefix}/problem/objective/items`).query({ q: '.*' });
        status(literal, 200);
        assert.equal(literal.body.total, 0);
    });

    await check('Unhiding source through model cannot publish it', async () => {
        await problems.edit(domainId, sourceIds[0], { hidden: false });
        assert.equal((await problems.get(domainId, sourceIds[0])).hidden, true);
        await assert.rejects(problems.copy(domainId, sourceIds[0], domainId));
    });

    await check('Contest attendance cannot bypass material isolation', async () => {
        const tid = await contests.add(domainId, 'Legacy source reference', '', teacherId, 'ioi',
            new Date(Date.now() - 60000), new Date(Date.now() + 3600000), [sourceIds[0]]);
        await contests.setStatus(domainId, tid, studentId, { attend: 1, startAt: new Date(Date.now() - 30000) });
        const res = await student.get(`${prefix}/p/${sourceIds[0]}`).query({ tid: tid.toString() }).set('Accept', 'application/json');
        assert([401, 403, 404].includes(res.status), `contest bypass ${res.status}`);
        privateAbsent(res.body);
    });

    const selection = { version: 1, items: [{ id: sourceIds[1], score: 30 }, { id: sourceIds[0], score: 20 }, { id: sourceIds[2], score: 50 }] };
    let published;
    await check('Publish ordered multi-kind paper with score config ready before response', async () => {
        const res = await teacher.post(`${prefix}/problem/objective`).send({
            title: '循环知识练习', pid: 'COMPOSED', content: '请认真作答。', paper: JSON.stringify(selection),
        });
        status(res, 302);
        published = await problems.get(domainId, 'COMPOSED', [...problems.PROJECTION_PUBLIC, 'objectivePaper'], true);
        assert(published && !published.hidden && !published.objectiveKind);
        assert.equal(published.objectivePaper.items.length, 3);
        assert.match(published.content, /multiselect\(1\)/);
        assert.match(published.content, /select\(2\)/);
        assert.match(published.content, /select\(3\)/);
        assert(!published.content.includes(base.analysis));
        assert.deepEqual(yaml.load(published.config).answers, { 1: [['A', 'C'], 30], 2: ['A', 20], 3: ['A', 50] });
        const stored = await streamToBuffer(await storage.get(`problem/${domainId}/${published.docId}/testdata/config.yaml`));
        assert.deepEqual(yaml.load(stored.toString()), yaml.load(published.config));
    });

    await check('Students can read assembled paper without private source snapshots or answers', async () => {
        assert(published);
        const html = await student.get(`${prefix}/p/COMPOSED`).set('Accept', 'text/html');
        status(html, 200);
        privateAbsent(html.text);
        assert(html.text.includes('循环知识练习'));
        const res = await student.get(`${prefix}/api/problem`).query({
            args: JSON.stringify({ domainId, id: published.docId }),
            projection: JSON.stringify({ title: 1, content: 1, objectivePaper: 1, objective: 1, config: 1 }),
        });
        status(res, 200);
        privateAbsent(res.body);
        assert.equal(res.body.title, '循环知识练习');
    });

    await check('Editing source preserves the published snapshot and grading configuration', async () => {
        assert(published);
        const res = await teacher.post(`${prefix}/p/${sourceIds[1]}/edit`).send({
            title: 'Changed material', objective: JSON.stringify({ ...base, kind: 'multiple', answers: ['A', 'B'] }),
            tag: '新标签', hidden: false,
        });
        status(res, 302);
        const unchanged = await problems.get(domainId, published.docId, [...problems.PROJECTION_PUBLIC, 'objectivePaper'], true);
        assert.equal(unchanged.content, published.content);
        assert.equal(unchanged.config, published.config);
        assert.deepEqual(unchanged.objectivePaper, published.objectivePaper);
    });

    await check('Invalid selections do not create partially published problems', async () => {
        const count = await problems.count(domainId, {}, true);
        for (const items of [[], [{ id: sourceIds[0], score: 0 }], [{ id: sourceIds[0], score: 1.5 }],
            [{ id: sourceIds[0], score: 10 }, { id: sourceIds[0], score: 10 }], [{ id: legacyPaper, score: 10 }],
            [{ id: 999999, score: 10 }]]) {
            const res = await teacher.post(`${prefix}/problem/objective`).send({ title: 'Invalid', paper: JSON.stringify({ version: 1, items }) });
            assert(res.status >= 400 && res.status < 500, `${JSON.stringify(items)}: ${res.status}`);
        }
        assert.equal(await problems.count(domainId, {}, true), count);
    });

    await check('Source IDs cannot select material from a different classroom', async () => {
        const foreignDomain = `${domainId}-foreign`;
        await domains.add(foreignDomain, teacherId, 'Other classroom', 'Isolated foreign test domain');
        await problems.addWithId(foreignDomain, 1000, 'FOREIGN', 'Foreign material', '', teacherId, ['Other'], {
            objectiveKind: 'single', objective: base, hidden: true,
        });
        const count = await problems.count(domainId, {}, true);
        const res = await teacher.post(`${prefix}/problem/objective`).send({
            title: 'Invalid cross-classroom selection', paper: JSON.stringify({ version: 1, items: [{ id: 1000, score: 10 }] }),
        });
        assert(res.status >= 400 && res.status < 500);
        assert.equal(await problems.count(domainId, {}, true), count);
    });

    await check('Published statement attachments are independent copies', async () => {
        const bytes = Buffer.from('test attachment content');
        await problems.addAdditionalFile(domainId, sourceIds[2], 'diagram.png', bytes, teacherId);
        const material = { ...base, kind: 'judge', stem: '![图示](file://diagram.png)' };
        const edit = await teacher.post(`${prefix}/p/${sourceIds[2]}/edit`).send({
            title: '带附件的素材', objective: JSON.stringify(material), tag: '附件',
        });
        status(edit, 302);
        const res = await teacher.post(`${prefix}/problem/objective`).send({
            title: '附件快照', pid: 'ATTACHMENTS', paper: JSON.stringify({ version: 1, items: [{ id: sourceIds[2], score: 100 }] }),
        });
        status(res, 302);
        const paper = await problems.get(domainId, 'ATTACHMENTS');
        assert.equal(paper.additional_file.length, 1);
        const name = paper.additional_file[0].name;
        assert.notEqual(name, 'diagram.png');
        assert(paper.content.includes(`file://${name}`));
        await problems.delAdditionalFile(domainId, sourceIds[2], 'diagram.png', teacherId);
        const copied = await streamToBuffer(await storage.get(`problem/${domainId}/${paper.docId}/additional_file/${name}`));
        assert(copied.equals(bytes));
        const count = await problems.count(domainId, {}, true);
        const missing = await teacher.post(`${prefix}/problem/objective`).send({
            title: 'Missing attachment', paper: JSON.stringify({ version: 1, items: [{ id: sourceIds[2], score: 100 }] }),
        });
        assert(missing.status >= 400 && missing.status < 500);
        assert.equal(await problems.count(domainId, {}, true), count);
    });

    await check('Traditional creation remains in published catalog', async () => {
        const res = await teacher.post(`${prefix}/problem/create`).send({ title: 'Programming', pid: 'PROGRAMMING', content: 'Print hello', hidden: false });
        status(res, 302);
        assert.equal(res.headers.location, `${prefix}/p/PROGRAMMING/files`);
        const pdocs = await problems.getMulti(domainId, {}).toArray();
        assert(pdocs.some((p) => p.pid === 'PROGRAMMING'));
        assert(pdocs.some((p) => p.pid === 'OLDPAPER'));
        assert(pdocs.some((p) => p.pid === 'COMPOSED'));
        assert(!pdocs.some((p) => p.objectiveKind));
    });
    console.log(`RESULT ${results.filter(Boolean).length}/${results.length} objective workbench checks passed`);
    clearTimeout(timeout);
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
