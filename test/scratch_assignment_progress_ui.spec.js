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
env.addFilter('markdown', (value) => value);
env.addFilter('json', JSON.stringify);
const assignment = { _id: 'task', title: '星光之旅', projectRequired: true };
const base = {
    url: (name, params = {}) => `/${name}/${params.assignmentId || params.submissionId || params.workId || ''}${params.query ? `?${new URLSearchParams(params.query)}` : ''}`,
    datetimeSpan: String, assignments: [assignment], assignment,
    isTeacher: false, udict: {}, works: [], submissions: [], materials: [],
    assignmentStates: {}, studentProgress: [], assignmentSummary: {}, page: 1, numPages: 1,
    handler: { user: { _id: 42 } },
};
function render(name, extra = {}) {
    const source = fs.readFileSync(path.join(ui, 'templates', name), 'utf8').replace(/\{% extends "[^"]+" %\}/, '');
    return new JSDOM(env.renderString(source, { ...base, ...extra }), { url: 'https://class.test/scratch/assignments' });
}
function progress(extra = {}) {
    return { uid: 42, owner: 42, status: 'new', completed: false, projectRequired: true,
        projectSubmitted: false, objectiveAnswered: 0, objectiveTotal: 0, ...extra };
}
describe('Scratch assignment progress experience', () => {
    it('makes unsaved, saved, submitted and reviewed work distinguishable in the list', (t) => {
        const states = [
            ['new', '未开始', '开始作业', {}],
            ['draft', '进行中', '继续完成', { hasSavedWork: true }],
            ['submitted', '已提交 · 待批改', '查看结果', { completed: true, projectSubmitted: true }],
            ['reviewed', '已批改', '查看批改', { completed: true, projectSubmitted: true, reviewed: true, hasFeedback: true, feedbackSubmissionId: 'feedback' }],
        ];
        for (const [status, label, action, extra] of states) {
            const dom = render('scratch_assignments.html', { assignmentStates: { task: progress({ status, ...extra }) } });
            t.after(() => dom.window.close());
            const card = dom.window.document.querySelector('.sct-assignment-card');
            assert.match(card.querySelector('.sct-status').textContent, new RegExp(label));
            assert.match(card.querySelector('.sct-card-actions').textContent, new RegExp(action));
            if (status === 'draft') assert.match(card.textContent, /已保存 · 未提交/);
        }
    });
    it('keeps older feedback visible and escaped while a resubmission waits for a new review', (t) => {
        const state = progress({ status: 'submitted', projectSubmitted: true, completed: true, hasFeedback: true,
            submissionId: 'new-version', feedbackSubmissionId: 'old-reviewed', grade: '<img src=x>', feedback: '<script>unsafe()</script>' });
        const dom = render('scratch_assignments.html', { assignmentStates: { task: state } });
        t.after(() => dom.window.close());
        const doc = dom.window.document;
        assert.equal(doc.querySelector('.sct-feedback-preview').getAttribute('href'), '/scratch_submission/old-reviewed');
        assert.match(doc.querySelector('.sct-version-note').textContent, /上一次批改/);
        assert.equal(doc.querySelector('.sct-feedback-preview script, .sct-feedback-preview img'), null);
        assert.match(doc.querySelector('.sct-feedback-text').textContent, /<script>/);
        assert.match(doc.querySelector('.sct-status').textContent, /待批改/);
    });
    it('shows both requirements of mixed homework and objective-only completion without project actions', (t) => {
        const mixed = { ...assignment, objectiveQuiz: { total: 3 } };
        const state = progress({ status: 'draft', projectSubmitted: true, objectiveAnswered: 1, objectiveTotal: 3 });
        const dom = render('scratch_assignments.html', { assignments: [mixed], assignmentStates: { task: state } });
        const quiz = render('scratch_assignments.html', { assignments: [{ ...mixed, projectRequired: false }],
            assignmentStates: { task: progress({ status: 'completed', completed: true, objectiveCompleted: true, objectiveAnswered: 3 }) } });
        t.after(() => { dom.window.close(); quiz.window.close(); });
        assert.match(dom.window.document.querySelector('.sct-requirements').textContent, /知识练习\s+1 \/ 3/);
        assert.match(dom.window.document.querySelector('.sct-requirements').textContent, /作品\s+已提交/);
        assert.match(dom.window.document.querySelector('.sct-card-actions').textContent, /继续完成/);
        assert.doesNotMatch(quiz.window.document.querySelector('.sct-requirements').textContent, /作品/);
        assert.match(quiz.window.document.querySelector('.sct-status').textContent, /已完成/);
    });
    it('puts teacher feedback ahead of task description and preserves the existing editing form', (t) => {
        const dom = render('scratch_assignment.html', { assignmentProgress: progress({ hasFeedback: true, reviewed: true,
            feedbackSubmissionId: 'feedback', grade: '优秀', feedback: '试试添加声音', completed: true, projectSubmitted: true }) });
        t.after(() => dom.window.close());
        const doc = dom.window.document;
        const panel = doc.querySelector('.sct-feedback-panel');
        assert(panel.compareDocumentPosition(doc.querySelector('.sc-assignment-markdown')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
        assert.match(panel.textContent, /优秀/);
        assert.match(doc.querySelector('form[method=post]').textContent, /继续修改作品/);
    });
    it('filters latest-version teacher rows, combines name/UID search and exposes empty state accessibly', (t) => {
        const rows = [progress({ status: 'new', uid: 42 }), progress({ uid: 51, status: 'submitted', completed: true,
            projectSubmitted: true, submissionId: 'pending' }), progress({ uid: 65, status: 'reviewed', completed: true,
            projectSubmitted: true, reviewed: true, submissionId: 'reviewed', grade: '优秀' }),
            progress({ uid: 99, historical: true, projectSubmitted: true, submissionId: 'historical' })];
        const dom = render('scratch_assignment.html', { isTeacher: true, studentProgress: rows,
            assignmentProgress: { total: 3, completed: 2, pendingReview: 1 }, udict: { 42: { uname: 'alice', displayName: '小雨' }, 51: { uname: 'star' } } });
        t.after(() => dom.window.close());
        const doc = dom.window.document;
        const mod = { exports: {} };
        vm.runInNewContext(transformSync(fs.readFileSync(path.join(ui, 'pages/scratch_assignment_progress.page.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
            document: doc, module: mod, exports: mod.exports,
            require: () => ({ NamedPage: class { constructor(name, run) { this.run = run; } } }),
        });
        mod.exports.default.run();
        const visible = () => [...doc.querySelectorAll('[data-progress-row]')].filter((row) => !row.hidden);
        assert.equal(visible().length, 3);
        doc.querySelector('[data-progress-filter=pending]').click();
        assert.equal(visible().length, 1);
        assert.equal(visible()[0].querySelector('.sc-button').getAttribute('href'), '/scratch_submission/pending');
        const input = doc.querySelector('[data-progress-search]');
        input.value = '小雨'; input.dispatchEvent(new dom.window.Event('input'));
        assert.equal(visible().length, 0);
        assert.equal(doc.querySelector('[data-progress-empty]').hidden, false);
        doc.querySelector('[data-progress-quick=incomplete]').click();
        assert.equal(input.value, '');
        assert.equal(visible().length, 1);
        assert.match(visible()[0].textContent, /小雨/);
        assert.match(visible()[0].textContent, /未开始/);
        doc.querySelector('[data-progress-filter=all]').click();
        input.value = '65'; input.dispatchEvent(new dom.window.Event('input'));
        assert.equal(visible().length, 1);
        assert.match(visible()[0].textContent, /优秀/);
        assert.match(doc.querySelector('[data-progress-count]').textContent, /1 位学员/);
        input.value = ''; input.dispatchEvent(new dom.window.Event('input'));
        doc.querySelector('[data-progress-filter=history]').click();
        assert.equal(visible().length, 1);
        assert.match(visible()[0].textContent, /历史记录/);
        assert.equal(visible()[0].querySelector('.sc-button').getAttribute('href'), '/scratch_submission/historical');
    });
});
