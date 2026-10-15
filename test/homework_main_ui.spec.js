const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const esbuild = require('esbuild');
const stylus = require('stylus');

const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'packages/ui-default/templates/homework_main.html'), 'utf8')
    .replace('{% extends "layout/basic.html" %}', '');
const env = new nunjucks.Environment(null, { autoescape: true });
const script = esbuild.buildSync({
    entryPoints: [path.join(root, 'packages/ui-default/pages/homework_main.page.js')],
    bundle: true, write: false, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const assignments = [
    { id: 'one', title: '循环练习', acceptedProblems: 2, totalProblems: 5, percent: 40 },
    { id: 'two', title: '变量练习', acceptedProblems: 3, totalProblems: 3, percent: 100 },
];
const students = [
    { uid: 7, totalHomeworks: 2, completedHomeworks: 1, totalProblems: 8, acceptedProblems: 5, percent: 63, done: false, incompleteAssignments: [assignments[0]], completedAssignments: [assignments[1]] },
    { uid: 8, totalHomeworks: 1, completedHomeworks: 1, totalProblems: 3, acceptedProblems: 3, percent: 100, done: true, incompleteAssignments: [], completedAssignments: [assignments[1]] },
];
const pendingDoc = { docId: 'one', title: '循环练习', pids: [1, 2, 3, 4, 5], homeworkProgress: { acceptedProblems: 2, totalProblems: 5, percent: 40, started: true } };
const completedDoc = { docId: 'two', title: '变量练习', pids: [6, 7, 8], homeworkProgress: { acceptedProblems: 3, totalProblems: 3, percent: 100, done: true } };
function render(overrides = {}) {
    return env.renderString(template, {
        canManageHomework: true, canCreateHomework: true, view: 'students',
        homeworkStudentProgress: {
            students, totalHomeworks: 2,
            udict: { 7: { _id: 7, displayName: '小明', uname: 'ming' }, 8: { _id: 8, displayName: '小红', uname: 'hong' } },
        },
        tdocs: [], completedTdocs: [], homeworkCategories: [], homeworkStudentOptions: [],
        category: '__all__', tpcount: 1,
        avatarUrl: () => '/avatar.png',
        handler: { user: { own: () => true, hasPerm: () => true } },
        perm: { PERM_EDIT_HOMEWORK: 1 },
        paginator: { render: () => new nunjucks.runtime.SafeString('<nav class="pager">翻页</nav>') },
        url(name, options = {}) {
            const prefix = { homework_main: '/homework', homework_create: '/homework/create', homework_detail: `/homework/${options.tid}`, homework_edit: `/homework/${options.tid}/edit` }[name];
            return `${prefix}${options.query ? `?${new URLSearchParams(options.query)}` : ''}`;
        },
        ...overrides,
    });
}
function harness(t, overrides = {}) {
    const dom = new JSDOM(`<body class="page--homework_main">${render(overrides)}</body>`, { url: 'https://example.test/d/class-a/homework', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const $ = require('jquery')(dom.window);
    dom.window.matchMedia = () => ({ matches: true });
    let init;
    const mod = { exports: {} };
    vm.runInNewContext(script, {
        module: mod, exports: mod.exports,
        require: (name) => {
            if (name === 'jquery') return $;
            if (name === 'vj/misc/Page') return { NamedPage: class { constructor(_name, callback) { init = callback; } } };
            return require(name);
        },
        document: dom.window.document, window: dom.window, URL: dom.window.URL,
        DOMParser: dom.window.DOMParser, AbortController: dom.window.AbortController,
        fetch: (...args) => dom.window.fetch(...args),
    });
    init();
    const doc = dom.window.document;
    const find = (selector) => doc.querySelector(selector);
    const input = (selector, value) => { const el = find(selector); el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
    return { dom, doc, find, input };
}
function waitForHomeworkView(dom, view) {
    const admin = dom.window.document.querySelector('[data-homework-admin]');
    return new Promise((resolve, reject) => {
        const finish = (error) => {
            observer.disconnect();
            clearTimeout(timeout);
            if (error) reject(error);
            else resolve();
        };
        const check = () => {
            if (admin.dataset.homeworkView === view && admin.getAttribute('aria-busy') === 'false') finish();
        };
        const observer = new dom.window.MutationObserver(check);
        const timeout = setTimeout(() => finish(new Error(`Homework view ${view} did not finish loading`)), 5000);
        observer.observe(admin, { attributes: true, attributeFilter: ['data-homework-view', 'aria-busy'] });
        check();
    });
}

describe('homework workspace experience', () => {
    it('keeps student rows collapsed and completed homework hidden until explicitly expanded', (t) => {
        const { find } = harness(t);
        assert.equal(find('[data-homework-student-toggle]').getAttribute('aria-expanded'), 'false');
        assert.equal(find('#homework-student-7').hidden, true);
        find('[data-homework-student-toggle]').click();
        assert.equal(find('#homework-student-7').hidden, false);
        assert.equal(find('.homework-completed-fold').open, false);
        assert.equal(find('.homework-roster__assignment').getAttribute('href'), '/homework/one?uid=7');
        assert.equal(find('.homework-completed-fold a').getAttribute('href'), '/homework/two?uid=7');
        find('[data-homework-student-toggle]').click();
        assert.equal(find('#homework-student-7').hidden, true);
    });

    it('combines status and name/account/UID search without losing expanded rows', (t) => {
        const { find, input } = harness(t);
        find('[data-homework-student-toggle]').click();
        find('[data-homework-roster-filter="pending"]').click();
        assert.equal(find('[data-homework-visible-count]').textContent, '1 位学员');
        assert.equal(find('[data-homework-filter-count="pending"]').textContent, '1');
        input('[data-homework-roster-search]', 'ＭＩＮＧ');
        assert.equal(find('[data-homework-visible-count]').textContent, '1 位学员');
        input('[data-homework-roster-search]', '8');
        assert.equal(find('[data-homework-filter-empty]').hidden, false);
        find('[data-homework-clear-filters]').click();
        assert.equal(find('[data-homework-visible-count]').textContent, '2 位学员');
        assert.equal(find('#homework-student-7').hidden, false);
        assert.equal(find('[data-homework-roster-search]').value, '');
        assert.equal(find('[data-homework-roster-filter="all"]').getAttribute('aria-pressed'), 'true');
    });

    it('makes creation available from either teacher view but respects create permission', (t) => {
        const { find } = harness(t);
        assert.equal(find('.homework-hub__create').getAttribute('href'), '/homework/create');
        assert.equal(find('[data-homework-admin-view-link]:last-child').getAttribute('href'), '/homework?view=assignments&category=__all__');
        const denied = new JSDOM(render({ canCreateHomework: false }));
        t.after(() => denied.window.close());
        assert.equal(denied.window.document.querySelector('.homework-hub__create'), null);
    });

    it('uses compact assignment summaries with actionable learner and edit links in details', (t) => {
        const { find } = harness(t, {
            view: 'assignments', tdocs: [{ ...pendingDoc, content: 'A very long description', homeworkAssignmentSummary: {
                assignedCount: 2, completedCount: 1,
                assignedStudents: [{ uid: 7, name: '小明' }, { uid: 8, name: '小红' }], completedStudents: [{ uid: 8, name: '小红' }],
            } }],
        });
        const trigger = find('[data-homework-assignment-toggle]');
        assert.doesNotMatch(trigger.textContent, /小明|小红|very long/);
        assert.match(trigger.textContent, /5 道题/);
        assert.equal(find('#homework-assignment-one').hidden, true);
        trigger.click();
        assert.equal(find('#homework-assignment-one').hidden, false);
        assert.equal(find('.homework-student-chips a').getAttribute('href'), '/homework/one?uid=7');
        assert.equal(find('.homework-assignment__quick-add').getAttribute('action'), '/homework/one/edit');
        assert.equal(find('[name="operation"]').value, 'add_students');
        assert.equal(find('.homework-assignment__completion [role="progressbar"]').getAttribute('aria-valuenow'), '50');
    });

    it('switches teacher views without losing roster search/filter state or the creation action', async (t) => {
        const { dom, find, input } = harness(t);
        input('[data-homework-roster-search]', 'ming');
        find('[data-homework-roster-filter="pending"]').click();
        const create = find('.homework-hub__create');
        let releaseResponse;
        dom.window.fetch = (href) => new Promise((resolve) => {
            releaseResponse = () => resolve({ ok: true, redirected: false,
                text: async () => render({ view: new URL(href).searchParams.get('view') || 'students' }) });
        });
        const assignmentsReady = waitForHomeworkView(dom, 'assignments');
        find('[data-homework-admin-view-link]:last-child').click();
        assert.equal(find('[data-homework-admin]').getAttribute('aria-busy'), 'true');
        assert.equal(find('[data-homework-admin]').dataset.homeworkView, 'students');
        releaseResponse();
        await assignmentsReady;
        assert.equal(find('[data-homework-admin]').dataset.homeworkView, 'assignments');
        assert.equal(find('.homework-hub__create'), create);
        const studentsReady = waitForHomeworkView(dom, 'students');
        find('[data-homework-admin-view-link]').click();
        assert.equal(find('[data-homework-roster-search]'), null);
        assert.equal(find('[data-homework-admin]').getAttribute('aria-busy'), 'true');
        releaseResponse();
        await studentsReady;
        assert.equal(find('[data-homework-roster-search]').value, 'ming');
        assert.equal(find('[data-homework-roster-filter="pending"]').getAttribute('aria-pressed'), 'true');
        assert.equal(find('[data-homework-visible-count]').textContent, '1 位学员');
    });

    it('gives learners separate pending/completed views, search, and continuing/reviewing actions', (t) => {
        const { find, input } = harness(t, { canManageHomework: false, tdocs: [pendingDoc], completedTdocs: [completedDoc] });
        assert.equal(find('[data-homework-admin]'), null);
        assert.equal(find('.homework-hub__create'), null);
        assert.equal(find('[data-homework-student-panel="completed"]').hidden, true);
        assert.match(find('.homework-hub__continue').textContent, /继续练习/);
        input('[data-homework-student-search]', '变量');
        assert.equal(find('[data-homework-student-filter-empty]').hidden, false);
        find('[data-homework-student-view="completed"]').click();
        assert.equal(find('[data-homework-student-panel="pending"]').hidden, true);
        assert.equal(find('[data-homework-student-panel="completed"]').hidden, false);
        assert.equal(find('[data-homework-student-filter-empty]').hidden, true);
        assert.match(find('[data-homework-student-panel="completed"] .homework-hub__continue').textContent, /回顾练习/);
        input('[data-homework-student-search]', 'none');
        find('[data-homework-student-clear]').click();
        assert.equal(find('[data-homework-student-search]').value, '');
        assert.equal(find('[data-homework-student-filter-empty]').hidden, true);
    });

    it('distinguishes unstarted tasks and keeps a zero-question progress safe', (t) => {
        const { find } = harness(t, { canManageHomework: false, tdocs: [{ ...pendingDoc, homeworkProgress: { acceptedProblems: 0, totalProblems: 0, percent: 0, started: false } }] });
        assert.match(find('.homework-hub__continue').textContent, /开始练习/);
        assert.equal(find('[role="progressbar"]').getAttribute('aria-valuenow'), '0');
        assert.doesNotMatch(find('.homework-hub').textContent, /NaN|Infinity/);
    });

    it('does not claim all assignments are completed when only the current paginated page is empty', (t) => {
        const { find } = harness(t, { canManageHomework: false, tpcount: 3, tdocs: [], completedTdocs: [completedDoc] });
        assert.match(find('.homework-list-note').textContent, /本页作业/);
        assert.match(find('[data-homework-student-panel="pending"]').textContent, /这一页的作业都完成了/);
        assert.ok(find('.pager'));
    });

    it('escapes names and titles rather than inserting teacher-entered HTML', (t) => {
        const { find } = harness(t, { canManageHomework: false, tdocs: [{ ...pendingDoc, title: '<img src=x onerror=alert(1)>' }] });
        assert.equal(find('.homework-hub__title').textContent, '<img src=x onerror=alert(1)>');
        assert.equal(find('.homework-hub__title img'), null);
    });

    it('compiles responsive styles and preserves hidden semantics and reduced motion', () => {
        const css = stylus(fs.readFileSync(path.join(root, 'packages/ui-default/pages/homework_main.page.styl'), 'utf8')).render();
        assert.match(css, /\[hidden\][^{]*\{\s*display: none !important/);
        assert.match(css, /max-width: 640px/);
        assert.match(css, /prefers-reduced-motion: reduce/);
        assert.match(css, /grid-template-columns: 42px minmax\(120px, 1fr\)/);
    });
});
