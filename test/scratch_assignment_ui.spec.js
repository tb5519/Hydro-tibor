const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');

const ui = path.resolve(__dirname, '../packages/ui-default');
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(ui, 'templates')), { autoescape: true });
const state = {
    url: (name, params = {}) => `/${name}${params.assignmentId ? `/${params.assignmentId}` : ''}`,
    datetimeSpan: (date) => String(date),
    isTeacher: true,
    objectivePapers: [
        { docId: 11, pid: 'P11', title: '小猫的方向挑战', questionCount: 3, totalScore: 30, tags: ['运动', '方向'] },
        { docId: 12, pid: 'P12', title: '循环小练习', questionCount: 2, totalScore: 20, tags: ['循环'] },
        { docId: 13, pid: 'P13', title: '<img src=x onerror=alert(1)>', questionCount: 96, totalScore: 960, tags: ['事件'] },
    ],
    deadlineInput: '',
    udict: {}, works: [], submissions: [], materials: [],
};
function render(name, overrides = {}) {
    const source = fs.readFileSync(path.join(ui, 'templates', name), 'utf8').replace(/\{% extends "[^"]+" %\}/, '');
    return new JSDOM(env.renderString(source, { ...state, ...overrides }), { url: 'https://class.test/scratch/assignments/new' });
}
function editor(assignment, overrides = {}) {
    const dom = render('scratch_assignment_edit.html', { assignment, ...overrides });
    const code = transformSync(fs.readFileSync(path.join(ui, 'pages/scratch_assignment_edit.page.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
    const mod = { exports: {} };
    vm.runInNewContext(code, {
        document: dom.window.document, window: dom.window, module: mod, exports: mod.exports,
        location: dom.window.location, DOMParser: dom.window.DOMParser, AbortController, setTimeout, clearTimeout,
        fetch: overrides.fetch || (() => { throw new Error('Unexpected fetch'); }),
        require: (name) => {
            assert.equal(name, 'vj/misc/Page');
            return { NamedPage: class { constructor(names, callback) { this.names = names; this.run = callback; } } };
        },
    });
    mod.exports.default.run();
    const doc = dom.window.document;
    const form = doc.querySelector('form');
    const mode = (value) => doc.querySelector(`input[name=assignmentMode][value=${value}]`).click();
    const paper = (id) => doc.querySelector(`input[type=checkbox][value="${id}"]`);
    const submit = () => {
        const event = new dom.window.Event('submit', { cancelable: true, bubbles: true });
        form.dispatchEvent(event);
        return !event.defaultPrevented;
    };
    return { dom, doc, form, mode, paper, submit };
}

describe('Scratch assignment content selection', () => {
    it('keeps legacy project assignments compatible and excludes hidden quiz/template fields from form submissions', () => {
        const view = editor({ title: '已有作业', templateFileId: 'template' });
        assert.equal(view.doc.querySelector('input[name=assignmentMode]:checked').value, 'project');
        assert.equal(view.doc.querySelector('[data-assignment-project]').hidden, false);
        assert.equal(view.doc.querySelector('[data-assignment-objective]').hidden, true);
        assert.equal(view.submit(), true);
        view.mode('mixed');
        view.paper(11).click();
        assert.equal(view.submit(), true);
        assert.deepEqual(new view.dom.window.FormData(view.form).getAll('objectivePaperIds'), ['', '11']);
        view.mode('project');
        assert.deepEqual(new view.dom.window.FormData(view.form).getAll('objectivePaperIds'), ['']);
        view.mode('objective');
        assert.equal(view.doc.querySelector('input[name=template]').disabled, true);
        assert.equal(view.doc.querySelector('[data-assignment-project]').hidden, true);
        assert.equal(new view.dom.window.FormData(view.form).has('template'), false);
        assert.equal(view.paper(11).checked, true, 'switching modes retains unsaved choices');
        view.dom.window.close();
    });

    it('opens a newly assembled paper directly as preselected objective homework', () => {
        const view = editor(null, { selectedObjectivePaperIds: [12] });
        assert.equal(view.doc.querySelector('input[name=assignmentMode]:checked').value, 'objective');
        assert.equal(view.paper(12).checked, true);
        assert.equal(view.doc.querySelector('[data-assignment-project]').hidden, true);
        assert.equal(view.submit(), true);
        view.dom.window.close();
    });

    it('preselects objective-only edits, searches safely, and summarizes hidden selected rows', () => {
        const view = editor({ title: '已有练习', projectRequired: false, objectiveQuiz: { paperIds: [11, 12], total: 5 } });
        assert.equal(view.doc.querySelector('input[name=assignmentMode]:checked').value, 'objective');
        assert.match(view.doc.querySelector('[data-assignment-selection-summary]').textContent, /2 份 · 5 题 · 50 分/);
        const search = view.doc.querySelector('[data-assignment-search]');
        search.value = '循环';
        search.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }));
        const visible = [...view.doc.querySelectorAll('[data-assignment-paper]')].filter((row) => !row.hidden);
        assert.equal(visible.length, 1);
        assert.equal(visible[0].querySelector('input').value, '12');
        assert.equal(view.paper(11).checked, true);
        search.value = '不存在的题卷';
        search.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }));
        assert.equal(view.doc.querySelector('[data-assignment-no-results]').hidden, false);
        assert.equal(view.doc.querySelector('[data-assignment-papers] img'), null, 'titles and search metadata are escaped');
        view.dom.window.close();
    });

    it('requires a quiz for objective/mixed work and prevents oversized homework without losing selections', () => {
        const view = editor();
        view.mode('objective');
        assert.equal(view.submit(), false);
        assert.match(view.doc.querySelector('[data-assignment-validation]').textContent, /至少选择/);
        assert.equal(view.doc.activeElement, view.doc.querySelector('[data-assignment-validation]'));
        view.paper(11).click();
        view.paper(12).click();
        assert.equal(view.submit(), true);
        view.paper(13).click();
        assert.equal(view.submit(), false);
        assert.match(view.doc.querySelector('[data-assignment-validation]').textContent, /100 道题/);
        view.paper(13).click();
        assert.equal(view.doc.querySelector('[data-assignment-validation]').hidden, true);
        view.mode('mixed');
        assert.match(view.doc.querySelector('[data-assignment-publish-summary]').textContent, /一份 Scratch 作品 \+ 5 道客观题/);
        view.dom.window.close();
    });

    it('refreshes newly assembled quizzes without losing the assignment draft or existing choices', async () => {
        const next = render('scratch_assignment_edit.html', { objectivePapers: [...state.objectivePapers,
            { docId: 14, title: '新组的题卷', questionCount: 2, totalScore: 20, tags: [] }] });
        const view = editor(null, { fetch: async () => ({ ok: true, text: async () => next.serialize() }) });
        view.mode('mixed');
        view.paper(11).click();
        view.doc.querySelector('input[name=title]').value = '正在编写的作业';
        view.doc.querySelector('textarea[name=description]').value = '保持这段说明';
        view.doc.querySelector('[data-assignment-refresh]').click();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(view.doc.querySelector('input[name=title]').value, '正在编写的作业');
        assert.equal(view.doc.querySelector('textarea[name=description]').value, '保持这段说明');
        assert.equal(view.paper(11).checked, true);
        assert(view.paper(14));
        view.paper(14).click();
        assert.match(view.doc.querySelector('[data-assignment-selection-summary]').textContent, /2 份 · 5 题/);
        assert.match(view.doc.querySelector('[data-assignment-refresh-status]').textContent, /内容已保留/);
        view.dom.window.close();
        next.window.close();
    });

    it('retains unavailable selected quizzes and requires explicit removal after refresh', async () => {
        const next = render('scratch_assignment_edit.html', { objectivePapers: [] });
        const view = editor(null, { fetch: async () => ({ ok: true, text: async () => next.serialize() }) });
        view.mode('objective');
        view.paper(11).click();
        view.doc.querySelector('[data-assignment-refresh]').click();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(view.paper(11).checked, true);
        assert.equal(view.paper(11).dataset.unavailable, 'true');
        assert.equal(view.submit(), false);
        assert.match(view.doc.querySelector('[data-assignment-validation]').textContent, /不再可用/);
        assert.match(view.doc.querySelector('[data-assignment-refresh-status]').textContent, /已保留在列表/);
        view.dom.window.close();
        next.window.close();
    });

    it('keeps the full draft and chosen quizzes when refresh fails', async () => {
        const view = editor(null, { fetch: async () => { throw new Error('offline'); } });
        view.mode('mixed');
        view.paper(11).click();
        view.doc.querySelector('input[name=title]').value = '保留的标题';
        view.doc.querySelector('[data-assignment-refresh]').click();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(view.doc.querySelector('input[name=title]').value, '保留的标题');
        assert.equal(view.paper(11).checked, true);
        assert.equal(view.submit(), true);
        assert.match(view.doc.querySelector('[data-assignment-refresh-status]').textContent, /重试/);
        view.dom.window.close();
    });

    it('enforces the ten-paper limit and presents an actionable empty library', () => {
        const papers = Array.from({ length: 11 }, (_, index) => ({ docId: index + 1, title: `题卷 ${index + 1}`, questionCount: 1, totalScore: 10, tags: [] }));
        const view = editor(null, { objectivePapers: papers });
        view.mode('objective');
        papers.forEach((item) => view.paper(item.docId).click());
        assert.equal(view.submit(), false);
        assert.match(view.doc.querySelector('[data-assignment-validation]').textContent, /最多选择 10/);
        view.dom.window.close();
        const empty = editor(null, { objectivePapers: [] });
        empty.mode('objective');
        assert.equal(empty.submit(), false);
        assert(empty.doc.querySelector('.sc-assignment-no-papers a[href="/problem_objective"]'));
        empty.dom.window.close();
    });
});

describe('Scratch assignment learner and teacher views', () => {
    const assignment = { _id: 'assignment', title: '方向小练习', projectRequired: false, objectiveQuiz: { paperIds: [11], total: 3 }, templateFileId: 'old-template' };
    const quiz = { total: 3, answered: 1, correct: 1, score: 10, totalScore: 30, completed: false, url: '/scratch/assignments/assignment/quiz' };
    it('shows quiz progress and removes all project actions for objective-only homework', () => {
        const dom = render('scratch_assignment.html', { assignment, isTeacher: false, objectiveQuiz: quiz });
        const doc = dom.window.document;
        assert.equal(doc.querySelector('progress').value, 1);
        assert.equal(doc.querySelector('progress').max, 3);
        assert.equal(doc.querySelector(`a[href="${quiz.url}"]`).textContent.trim(), '继续答题');
        assert.equal(doc.querySelector('form'), null);
        assert.equal(doc.querySelector('.sc-steps'), null);
        assert.doesNotMatch(doc.body.textContent, /提交作业|下载起始项目|交给老师的作品/);
        dom.window.close();
    });
    it('retains both independent tasks in mixed homework and gives completed learners a result link', () => {
        const dom = render('scratch_assignment.html', { assignment: { ...assignment, projectRequired: true }, isTeacher: false,
            objectiveQuiz: { ...quiz, answered: 3, correct: 2, completed: true } });
        const doc = dom.window.document;
        assert.equal(doc.querySelector(`a[href="${quiz.url}"]`).textContent.trim(), '查看答题结果');
        assert(doc.querySelector('form button[type=submit]'));
        assert(doc.querySelector('.sc-steps'));
        assert.match(doc.body.textContent, /答对 2 题/);
        dom.window.close();
    });
    it('shows teacher progress, marks, and per-learner review without exposing project placeholders', () => {
        const dom = render('scratch_assignment.html', { assignment, objectiveQuiz: quiz,
            objectiveResults: [{ ...quiz, uid: 42, url: '/scratch/review/42', updatedAt: '2026-10-08' }],
            udict: { 42: { uname: 'student42', displayName: '小猫' } } });
        const doc = dom.window.document;
        const row = doc.querySelector('.sc-assignment-results tbody tr');
        assert.match(row.textContent, /小猫/);
        assert.match(row.textContent, /1 \/ 3/);
        assert(row.querySelector('a[href="/scratch/review/42"]'));
        assert.doesNotMatch(doc.body.textContent, /学生作品|提交与批改/);
        dom.window.close();
    });
    it('labels enrolled learners without answers as not started', () => {
        const dom = render('scratch_assignment.html', { assignment, objectiveQuiz: quiz,
            objectiveResults: [{ ...quiz, uid: 42, answered: 0, correct: 0, score: 0, url: '/scratch/review/42' }],
            udict: { 42: { uname: 'student42' } } });
        assert.match(dom.window.document.querySelector('.sc-assignment-results').textContent, /未开始/);
        assert.doesNotMatch(dom.window.document.querySelector('.sc-assignment-results').textContent, /答题中/);
        dom.window.close();
    });

    it('routes mixed homework from the classroom homepage through the full task even when a project is saved', () => {
        const dom = render('scratch_main.html', { assignments: [{ ...assignment, projectRequired: true }], isTeacher: false,
            assignmentStates: { assignment: { hasSavedWork: true, workId: 'work' } }, works: [], submissions: [] });
        const actions = dom.window.document.querySelector('.sc-featured-task .sc-actions');
        assert(actions.querySelector('a[href="/scratch_assignment/assignment"]'));
        assert.equal(actions.querySelector('a[data-no-instant]'), null);
        dom.window.close();
    });
});
