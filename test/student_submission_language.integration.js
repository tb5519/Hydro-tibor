/* eslint-disable no-await-in-loop -- Isolated HTTP scenarios keep account changes ordered. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const supertest = require('supertest');

process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-student-language-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.STUDENT_LANGUAGE_PORT || '18908';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => { console.error('Student language integration timed out'); process.exit(1); }, 150000);
const checks = [];
async function check(name, fn) {
    try { await fn(); checks.push(true); console.log(`PASS ${name}`); }
    catch (error) { checks.push(false); console.error(`FAIL ${name}\n${error.stack}`); }
}
function status(res, expected) { assert.equal(res.status, expected, `${res.status}: ${res.text?.slice(0, 700)}`); }
function denied(res) { assert(res.status >= 400 && res.status < 500, `${res.status}: ${res.text?.slice(0, 300)}`); }

async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, RecordModel: records, httpServer } = require('hydrooj');
    const workspace = require('../packages/hydrooj/src/model/workspace').default;
    const { langs } = require('../packages/hydrooj/src/model/setting');
    const { getStudentSubmissionLanguages: allowed, defaultStudentSubmissionLanguagePolicy: defaults } = require('../packages/hydrooj/src/lib/student_submission_language');
    const qaLanguageCatalog = { ...langs };
    for (const key of Object.keys(langs)) delete langs[key];
    Object.assign(langs, { 'py.py3': { display: 'Python 3' }, cc: { display: 'C++' }, 'cc.cc14': { display: 'C++14' },
        'cc.cc17': { display: 'C++17' }, java: { display: 'Java' },
        hidden: { hidden: true }, disabled: { disabled: true }, remote: { remote: true }, _: {} });
    const adminId = await users.create('language-admin@example.test', 'language_admin', 'LocalTest123!');
    await users.setSuperAdmin(adminId);
    const firstDomain = `language-a-${Date.now()}`;
    const secondDomain = `language-b-${Date.now()}`;
    const unjoinedDomain = `language-unjoined-${Date.now()}`;
    for (const [id, name] of [[firstDomain, 'Python训练'], [secondDomain, 'C++训练'], [unjoinedDomain, '未加入的课堂']]) {
        await domains.add(id, adminId, name, 'Student language test');
    }
    const studentId = await users.createInDomain(firstDomain, 'language-student@example.test', 'language_student', 'LocalTest123!');
    for (const id of [firstDomain, secondDomain]) await domains.setUserInDomain(id, studentId, { join: true, role: 'default', displayName: '小禾' });
    await users.setById(studentId, { defaultDomain: firstDomain, studentLevel: 4, cppEditorMode: 'beginner' });
    const foreignWorkspace = await workspace.create(`language-foreign-${Date.now()}`, 'Other teacher workspace', adminId);
    const foreignDomain = `language-foreign-domain-${Date.now()}`;
    await domains.add(foreignDomain, adminId, 'Other workspace domain', 'Scope fixture');
    await domains.edit(foreignDomain, { workspaceId: foreignWorkspace._id });
    const admin = supertest.agent(httpServer);
    const student = supertest.agent(httpServer);
    const freshAdmin = supertest.agent(httpServer);
    for (const [agent, uname] of [[admin, 'language_admin'], [student, 'language_student'], [freshAdmin, 'language_admin']]) {
        status(await agent.post('/login').send({ uname, password: 'LocalTest123!' }), 302);
    }
    const get = (agent) => agent.get(`/manage/users?uid=${studentId}`).set('Accept', 'application/json');
    const form = { operation: 'edit_student', uid: studentId, uname: 'language_student', mail: 'language-student@example.test',
        displayName: '小禾', school: '测试学校', studentId: 'L001', defaultDomain: firstDomain, cppEditorMode: 'beginner' };
    const save = (agent, policy, extra = {}) => agent.post('/manage/users').set('Accept', 'application/json')
        .send({ ...form, ...extra, ...(policy === undefined ? {} : { submissionLanguagePolicy: typeof policy === 'string' ? policy : JSON.stringify(policy) }) });
    const globalPolicy = { version: 1, mode: 'global', languages: ['py.py3'], domains: [] };
    const domainPolicy = { version: 1, mode: 'per-domain', languages: [], domains: [{ domainId: secondDomain, languages: ['cc.cc17'] }] };
    const current = () => users.coll.findOne({ _id: studentId });

    await check('Saving requires teacher privileges and an ordinary sudo verification', async () => {
        denied(await save(student, globalPolicy));
        const fresh = await save(freshAdmin, globalPolicy);
        assert(fresh.status === 302 || fresh.body.url?.includes('/user/sudo'));
        assert.equal((await current()).submissionLanguagePolicy, undefined);
        status(await admin.get('/manage/users'), 302);
        status(await admin.post('/user/sudo').send({ password: 'LocalTest123!' }), 302);
    });
    await check('Management exposes unrestricted defaults and only selectable language catalog entries', async () => {
        const page = await get(admin);
        status(page, 200);
        assert.deepEqual(page.body.selectedSubmissionLanguagePolicy, defaults());
        assert.deepEqual(page.body.submissionLanguageOptions, [{ id: 'py.py3', name: 'Python 3' }, { id: 'cc', name: 'C++' },
            { id: 'cc.cc14', name: 'C++14' }, { id: 'cc.cc17', name: 'C++17' }, { id: 'java', name: 'Java' }]);
        assert.deepEqual(page.body.selectedStudentDomains.map((item) => item.id).sort(), [firstDomain, secondDomain].sort());
    });
    await check('Global limits persist on the account and invalidate cached users in every domain', async () => {
        const oldFirst = await users.getById(firstDomain, studentId);
        const oldSecond = await users.getById(secondDomain, studentId);
        assert.equal(allowed(oldFirst, firstDomain), null);
        status(await save(admin, globalPolicy), 200);
        assert.deepEqual((await current()).submissionLanguagePolicy, globalPolicy);
        assert.deepEqual(allowed(await users.getById(firstDomain, studentId), firstDomain), ['py.py3']);
        assert.deepEqual(allowed(await users.getById(secondDomain, studentId), secondDomain), ['py.py3']);
        assert.notEqual(await users.getById(secondDomain, studentId), oldSecond);
        const account = await current();
        assert.equal(account.studentLevel, 4);
        assert.equal(account.cppEditorMode, 'beginner');
        assert.equal(account.defaultDomain, firstDomain);
    });
    await check('Learners cannot remove teacher policy through account, preference or domain settings', async () => {
        for (const category of ['preference', 'account', 'domain']) {
            const response = await student.post(`/d/${firstDomain}/home/settings/${category}`).set('Accept', 'application/json')
                .send({ submissionLanguagePolicy: JSON.stringify(defaults()) });
            assert(response.status < 400, response.text.slice(0, 300));
            assert.deepEqual((await current()).submissionLanguagePolicy, globalPolicy);
        }
    });
    await check('Programming page and real submission endpoint enforce the saved rule for both runs and submissions', async () => {
        const pid = await problems.add(firstDomain, 'LANGUAGECHECK', '语言限制实测', '输出一个整数。', adminId);
        await problems.edit(firstDomain, pid, { config: 'type: default\ntime: 1s\nmemory: 256m\n' });
        const problemUrl = `/d/${firstDomain}/p/${pid}`;
        const page = await student.get(problemUrl).set('Accept', 'application/json');
        status(page, 200);
        assert.deepEqual(page.body.pdoc.config.langs, ['py.py3']);
        const before = await records.coll.countDocuments({ uid: studentId });
        for (const pretest of [false, true]) {
            denied(await student.post(`${problemUrl}/submit`).set('Accept', 'application/json')
                .send({ lang: 'cc.cc17', code: 'int main(){}', pretest, input: ['1'] }));
            assert.equal(await records.coll.countDocuments({ uid: studentId }), before);
        }
        const permitted = await student.post(`${problemUrl}/submit`).set('Accept', 'application/json')
            .send({ lang: 'py.py3', code: 'print(1)', pretest: false });
        status(permitted, 200);
        assert.equal(await records.coll.countDocuments({ uid: studentId }), before + 1);
        assert.equal((await records.coll.findOne({ uid: studentId })).lang, 'py.py3');
    });
    await check('Objective and answer-only submissions remain available under programming language restrictions', async () => {
        for (const type of ['objective', 'submit_answer']) {
            const pid = await problems.add(firstDomain, `LANG-${type}`, '非编程练习', '作答并提交。', adminId);
            await problems.edit(firstDomain, pid, { config: `type: ${type}\n${type === 'objective' ? 'answers:\n  1: [A, 100]\n' : ''}` });
            const response = await student.post(`/d/${firstDomain}/p/${pid}/submit`).set('Accept', 'application/json')
                .send({ lang: 'cc.cc17', code: '1: A', pretest: false });
            status(response, 200);
            assert.equal((await records.coll.findOne({ domainId: firstDomain, uid: studentId, pid })).lang, '_');
        }
    });
    await check('Domain-scoped settings restrict only selected classrooms; account data wins over a membership overlay', async () => {
        status(await save(admin, domainPolicy), 200);
        await domains.setUserInDomain(secondDomain, studentId, { submissionLanguagePolicy: defaults() });
        assert.deepEqual(allowed(await users.getById(secondDomain, studentId), secondDomain), ['cc.cc17']);
        assert.equal(allowed(await users.getById(firstDomain, studentId), firstDomain), null);
        const page = await get(admin);
        assert.deepEqual(page.body.selectedSubmissionLanguagePolicy, domainPolicy);
    });
    await check('Editing current classroom rules preserves server-side rules for classrooms the student left', async () => {
        const previousDomain = `language_previous_${Date.now()}`;
        await domains.add(previousDomain, adminId, '曾经加入的课堂', 'Policy preservation fixture');
        await domains.setUserInDomain(previousDomain, studentId, { join: true, role: 'default', blockedByStudentManagement: false });
        const retained = { domainId: previousDomain, languages: ['java'] };
        status(await save(admin, { ...domainPolicy, domains: [...domainPolicy.domains, retained] }), 200);
        status(await admin.post('/manage/users').set('Accept', 'application/json')
            .send({ operation: 'remove_student_domain', uid: studentId, domainCode: previousDomain }), 200);
        assert(!(await get(admin)).body.selectedStudentDomains.some((item) => item.id === previousDomain));
        const updated = { version: 1, mode: 'per-domain', languages: [], domains: [{ domainId: firstDomain, languages: ['py.py3'] }] };
        status(await save(admin, updated), 200);
        assert.deepEqual((await current()).submissionLanguagePolicy, { ...updated, domains: [...updated.domains, retained] });
        assert.equal(allowed(await users.getById(secondDomain, studentId), secondDomain), null, 'Editable domain rules can be cleared');
        status(await save(admin, { ...updated, domains: [] }), 200);
        assert.deepEqual((await current()).submissionLanguagePolicy.domains, [retained]);
        status(await save(admin, undefined, { school: '修改姓名资料不影响离开域规则' }), 200);
        assert.deepEqual((await current()).submissionLanguagePolicy.domains, [retained]);
        denied(await save(admin, { ...updated, domains: [{ domainId: previousDomain, languages: ['cc.cc17'] }] }));
        assert.deepEqual((await current()).submissionLanguagePolicy.domains, [retained], 'Clients cannot forge changes to inaccessible domains');
        await domains.setUserInDomain(previousDomain, studentId, { join: true, role: 'default', blockedByStudentManagement: false });
        assert.deepEqual(allowed(await users.getById(previousDomain, studentId), previousDomain), ['java']);
        status(await save(admin, { ...updated, domains: [] }), 200);
        assert.deepEqual((await current()).submissionLanguagePolicy.domains, [], 'A rejoined domain is editable again');
        status(await save(admin, { ...updated, domains: [retained] }), 200);
        await domains.setUserInDomain(previousDomain, studentId, { join: false });
        status(await save(admin, globalPolicy), 200);
        assert.deepEqual((await current()).submissionLanguagePolicy, globalPolicy, 'An explicit global change replaces all prior rules');
        await domains.setUserInDomain(previousDomain, studentId, { join: true });
        status(await save(admin, { ...updated, domains: [retained] }), 200);
        await domains.setUserInDomain(previousDomain, studentId, { join: false });
        status(await save(admin, defaults()), 200);
        assert.deepEqual((await current()).submissionLanguagePolicy, defaults(), 'An explicit unrestricted change replaces all prior rules');
        status(await save(admin, domainPolicy), 200);
    });
    await check('Older forms preserve restrictions and invalid policy saves do not change other student fields', async () => {
        status(await save(admin, undefined, { school: '保存其他资料' }), 200);
        assert.deepEqual((await current()).submissionLanguagePolicy, domainPolicy);
        for (const invalid of ['{', {}, { ...globalPolicy, languages: [] },
            ...['disabled', 'hidden', 'remote', '_', 'missing'].map((language) => ({ ...globalPolicy, languages: [language] })),
            ...[unjoinedDomain, foreignDomain, 'unknown'].map((domainId) => ({ ...domainPolicy, domains: [{ domainId, languages: ['py.py3'] }] })),
            { ...domainPolicy, domains: [...domainPolicy.domains, ...domainPolicy.domains] }]) {
            denied(await save(admin, invalid, { school: '不应保存', displayName: '不应修改' }));
            const account = await current();
            assert.equal(account.school, '保存其他资料');
            assert.deepEqual(account.submissionLanguagePolicy, domainPolicy);
            assert.equal((await domains.collUser.findOne({ domainId: firstDomain, uid: studentId })).displayName, '小禾');
            assert.equal(account._domainMembershipLock, undefined);
        }
    });
    await check('Explicit unrestricted settings clear the rule without changing unrelated learning settings', async () => {
        status(await save(admin, { ...domainPolicy, domains: [] }), 200);
        assert.equal(allowed(await users.getById(secondDomain, studentId), secondDomain), null);
        status(await save(admin, defaults()), 200);
        assert.equal(allowed(await users.getById(secondDomain, studentId), secondDomain), null);
        assert.deepEqual((await get(admin)).body.selectedSubmissionLanguagePolicy, defaults());
        assert.equal((await current()).studentLevel, 4);
    });
    await check('A learner assigned to another workspace cannot be changed through legacy management', async () => {
        await domains.setUserInDomain(foreignDomain, studentId, { join: true, role: 'default' });
        denied(await save(admin, globalPolicy));
        denied(await get(admin));
        assert.deepEqual((await current()).submissionLanguagePolicy, defaults());
    });
    console.log(`RESULT ${checks.filter(Boolean).length}/${checks.length} student language management checks passed`);
    clearTimeout(timeout);
    if (process.env.STUDENT_LANGUAGE_SERVE === '1' && checks.every(Boolean)) {
        // Browser settings include every normal compiler; the reduced catalog
        // above is only for deterministic API assertions.
        for (const key of Object.keys(langs)) delete langs[key];
        Object.assign(langs, qaLanguageCatalog);
        await domains.setUserInDomain(foreignDomain, studentId, { join: false });
        await users.setById(studentId, { submissionLanguagePolicy: { ...domainPolicy,
            domains: [{ domainId: firstDomain, languages: ['py.py3'] }, ...domainPolicy.domains] } });
        console.log(`SMOKE ${JSON.stringify({ origin: `http://localhost:${port}`, teacher: 'language_admin', student: 'language_student',
            password: 'LocalTest123!', studentId, firstDomain, secondDomain, manageUrl: `/manage/users?uid=${studentId}` })}`);
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
