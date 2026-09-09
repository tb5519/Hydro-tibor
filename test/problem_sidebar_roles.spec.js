const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
function compile(relativePath, dependencies = {}) {
    const mod = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, relativePath), 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, {
        module: mod, exports: mod.exports,
        require: (name) => dependencies[name] || require(name),
    });
    return mod.exports;
}
const { PERM, PRIV } = compile('packages/common/permission.ts');
const { canManageRecordList } = compile('packages/hydrooj/src/lib/record_list_scope.ts', { '../model/builtin': { PERM, PRIV } });

function renderSidebar(kind = 'normal', role = 'student', options = {}) {
    let permissions = PERM.PERM_DEFAULT;
    let privileges = PRIV.PRIV_DEFAULT;
    if (role === 'teacher') permissions |= PERM.PERM_EDIT_HOMEWORK;
    if (role === 'admin') permissions = PERM.PERM_ALL;
    if (role === 'platform') privileges |= PRIV.PRIV_MANAGE_ALL_DOMAIN;
    if (options.canEdit) permissions |= PERM.PERM_EDIT_PROBLEM;
    if (options.canDownload) permissions |= PERM.PERM_READ_PROBLEM_DATA;
    const viewer = {
        _id: 20, _dudoc: { join: true },
        hasPerm: (permission) => (permissions & permission) === permission,
        hasPriv: (privilege) => (privileges & privilege) === privilege,
        own: () => false,
    };
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(root, 'packages/ui-default/templates')), {
        autoescape: true,
    });
    const renderedUrls = [];
    env.addGlobal('_', (value) => value);
    env.addGlobal('url', (route, args) => { renderedUrls.push({ route, args }); return `/${route}`; });
    const html = env.render(`partials/problem_sidebar_${kind}.html`, {
        pdoc: { docId: 1002, pid: 'P1002', title: '题目', config: { type: 'default' } },
        page_name: kind === 'normal' ? 'problem_detail' : kind === 'homework' ? 'homework_detail_problem' : 'contest_detail_problem',
        handler: { user: viewer, entryDomainId: options.entryDomainId, ctx: { setting: { get: () => true } } },
        perm: PERM, PRIV, STATUS: { STATUS_ACCEPTED: 1 }, psdoc: {},
        tdoc: { docId: '6aa000000000000000000001', rule: kind === 'homework' ? 'homework' : 'acm' },
        tsdoc: {}, mode: options.mode || 'contest',
        model: { contest: { isOngoing: () => true, isExtended: () => false, isDone: () => false } },
        UiContext: { canManageProblemSidebar: canManageRecordList(viewer), homeworkReview: {
            name: '学员', rid: '6aa000000000000000000002', ownAnswerUrl: '/p/P1002', returnUrl: '/homework/1?uid=20',
        } },
    });
    const document = new JSDOM(html).window.document;
    document.renderedUrls = renderedUrls;
    return document;
}

describe('problem sidebar administrative entrances', () => {
    it('omits Files, Statistics and problem Copy for ordinary students at template render time', () => {
        const document = renderSidebar();
        assert.equal(document.querySelector('a[href="/problem_files"]'), null);
        assert.equal(document.querySelector('a[href="/problem_statistics"]'), null);
        assert.equal(document.querySelector('[name="problem-sidebar__copy"]'), null);
        assert.ok(document.querySelector('[name="problem-sidebar__open-scratchpad"]'));
        assert.ok(document.querySelector('a[href="/problem_submit"]'));
    });

    it('keeps the three existing entrances for teachers, domain administrators and platform administrators', () => {
        for (const role of ['teacher', 'admin', 'platform']) {
            const document = renderSidebar('normal', role);
            assert.ok(document.querySelector('a[href="/problem_files"]'), role);
            assert.ok(document.querySelector('a[href="/problem_statistics"]'), role);
            assert.ok(document.querySelector('[name="problem-sidebar__copy"]'), role);
        }
    });

    it('changes only those three student entrances while retaining download and ordinary answering links', () => {
        const student = renderSidebar('normal', 'student', { canDownload: true });
        const teacher = renderSidebar('normal', 'teacher', { canDownload: true });
        const remainingLinks = (document) => [...document.querySelectorAll('.menu__link')]
            .filter((link) => !['/problem_files', '/problem_statistics'].includes(link.getAttribute('href'))
                && link.getAttribute('name') !== 'problem-sidebar__copy')
            .map((link) => link.textContent.trim());
        assert.deepEqual(remainingLinks(student), remainingLinks(teacher));
        assert.ok(student.querySelector('[name="problem-sidebar__download"]'));
    });

    it('also hides contest/homework file entrances for students without removing their edit or submit capabilities', () => {
        for (const kind of ['homework', 'contest']) {
            const student = renderSidebar(kind, 'student', { canEdit: true });
            assert.equal(student.querySelector('a[href="/problem_files"]'), null);
            assert.ok(student.querySelector('a[href="/problem_edit"]'));
            assert.ok(student.querySelector('a[href="/problem_submit"]'));
            const teacher = renderSidebar(kind, 'teacher', { canEdit: true });
            assert.ok(teacher.querySelector('a[href="/problem_files"]'));
            const readOnlyTeacher = renderSidebar(kind, 'teacher');
            assert.equal(readOnlyTeacher.querySelector('a[href="/problem_files"]'), null);
        }
    });

    it('leaves the separately authorized copy-student-answer action available in homework review', () => {
        const document = renderSidebar('review', 'teacher');
        assert.ok(document.querySelector('[data-homework-review-copy]'));
        assert.equal(document.querySelector('[name="problem-sidebar__copy"]'), null);
    });

    it('preserves contest and cross-domain submission context while correction returns to ordinary practice', () => {
        for (const [options, expected] of [
            [{}, { tid: '6aa000000000000000000001' }],
            [{ entryDomainId: 'class-b' }, { tid: '6aa000000000000000000001', entryDomainId: 'class-b' }],
            [{ mode: 'correction', entryDomainId: 'class-b' }, {}],
        ]) {
            const document = renderSidebar('contest', 'student', options);
            const submit = document.renderedUrls.find((item) => item.route === 'problem_submit');
            assert.deepEqual(submit.args.query, expected);
        }
    });

    it('sets the display flag from the server-side administrative capability check', () => {
        const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/problem.ts'), 'utf8');
        assert.match(source, /this\.UiContext\.canManageProblemSidebar = canManageRecordList\(this\.user\)/);
    });
});
