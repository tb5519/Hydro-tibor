const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const templates = path.resolve(__dirname, '../packages/ui-default/templates');
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templates), { autoescape: true });
const source = fs.readFileSync(path.join(templates, 'scratch_submission.html'), 'utf8')
    .replace('{% extends "scratch_base.html" %}', '');
const base = {
    assignment: { _id: 'a1', title: '小猫冒险' },
    submission: { _id: 's1', owner: 42, revision: 7, fileId: 'f1', createdAt: '2026-11-01 12:00' },
    work: { _id: 'w1', owner: 42 }, isTeacher: false,
    udict: { 42: { uname: 'student42', displayName: '星星' } }, handler: { user: { _id: 42 } },
    datetimeSpan: String,
    url: (name, values = {}) => `/${name}${values.assignmentId ? `/${values.assignmentId}` : values.problemId ? `/${values.problemId}` : values.fileId ? `/${values.fileId}` : ''}${values.query ? `?${new URLSearchParams(values.query)}` : ''}`,
};
function render(t, values = {}) {
    const dom = new JSDOM(env.renderString(source, { ...base, ...values }), { url: 'https://class.test/scratch/submission/s1' });
    t.after(() => dom.window.close());
    return dom.window.document;
}

describe('Scratch submission feedback experience', () => {
    it('puts the reviewed feedback first for the learner and retains exact submitted-version playback', (t) => {
        const doc = render(t, { submission: { ...base.submission, grade: '优秀', feedback: '动作很流畅\n试试加一个开场。', reviewedAt: '2026-11-01 13:00' } });
        assert(doc.querySelector('.sc-submission-layout').firstElementChild.matches('.sc-submission-feedback'));
        assert.match(doc.querySelector('.sc-submission-message').textContent, /优秀[\s\S]*动作很流畅[\s\S]*试试加一个开场/);
        assert.match(doc.querySelector('.sc-submission-status').textContent, /已批改/);
        assert(doc.querySelector('a[href="/scratch_editor?submissionId=s1"]'));
        assert(doc.querySelector('a[href="/scratch_editor?workId=w1"]'));
        assert.equal(doc.querySelector('form'), null);
        assert.equal(doc.querySelector('a[href*="inspect=true"]'), null);
        assert.equal(doc.querySelector('iframe'), null);
    });

    it('makes waiting distinct from teacher feedback without inventing an evaluation', (t) => {
        const doc = render(t);
        assert.match(doc.querySelector('.sc-submission-status').textContent, /已提交 · 等待批改/);
        assert.match(doc.querySelector('.sc-submission-waiting').textContent, /等待老师批改/);
        assert.equal(doc.querySelector('.sc-submission-message'), null);
        assert.equal(doc.querySelector('form'), null);
    });

    it('keeps teacher inspection and the review form together with existing POST field limits', (t) => {
        const doc = render(t, { isTeacher: true, handler: { user: { _id: 1 } } });
        const layout = doc.querySelector('.sc-submission-layout');
        assert(layout.firstElementChild.matches('.sc-submission-work'));
        assert(layout.lastElementChild.querySelector('form[method="post"]'));
        const inspection = doc.querySelector('a[href*="inspect=true"]');
        assert(inspection, [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href')).join(' | '));
        assert.equal(inspection.target, '_blank');
        assert.equal(inspection.rel, 'noopener');
        assert.equal(doc.querySelector('[name=grade]').maxLength, 40);
        assert.equal(doc.querySelector('[name=feedback]').maxLength, 20000);
        const result = doc.querySelector('[name=reviewStatus]');
        assert.equal(result.required, true);
        assert.equal(result.value, '');
        assert.equal(doc.querySelector('form').checkValidity(), false);
        result.value = 'changes_requested';
        assert.equal(doc.querySelector('form').checkValidity(), true);
        assert.match(doc.querySelector('button[type=submit]').textContent, /完成批改/);
        assert.equal(doc.querySelector('a[href*="workId="]'), null);
    });

    it('preserves saved feedback when updating and renders student comments as text', (t) => {
        const submission = { ...base.submission, grade: '0', feedback: '<script>alert(1)</script>\n继续尝试', reviewedAt: '2026-11-01' };
        const teacher = render(t, { isTeacher: true, submission });
        assert.equal(teacher.querySelector('[name=reviewStatus]').value, 'completed');
        assert.equal(teacher.querySelector('[name=grade]').value, '0');
        assert.equal(teacher.querySelector('[name=feedback]').value, submission.feedback);
        assert.match(teacher.querySelector('button[type=submit]').textContent, /更新批改/);
        const student = render(t, { submission });
        assert.equal(student.querySelector('.sc-submission-message h3').textContent, '0');
        assert.equal(student.querySelector('script'), null);
        assert.equal(student.querySelector('.sc-description').textContent, submission.feedback);
    });

    it('keeps deleted assignments read only and library review navigation in its own context', (t) => {
        const archived = render(t, { isTeacher: true, assignment: { ...base.assignment, deletedAt: '2026-11-01' } });
        assert.equal(archived.querySelector('form'), null);
        assert.equal(archived.querySelector('a[href*="workId="]'), null);
        assert.match(archived.querySelector('[role=status]').textContent, /已删除[\s\S]*恢复作业/);
        assert(archived.querySelector('a[href="/scratch_file/f1"]'));
        const bank = render(t, { isTeacher: true, assignment: { ...base.assignment, kind: 'problem' } });
        assert(bank.querySelector('a[href="/scratch_problem_review"]'));
        assert(bank.querySelector('form'));
    });
    it('does not promise resubmission after the deadline', (t) => {
        const doc = render(t, { deadlinePassed: true, submission: { ...base.submission, reviewedAt: '2026-11-01', grade: '完成' } });
        assert.match(doc.querySelector('.sc-submission-resubmit-note').textContent, /已截止[\s\S]*不能再次提交/);
        assert(doc.querySelector('a[href="/scratch_editor?workId=w1"]'));
    });
    it('shows a requested revision as unfinished and preselects the teacher review outcome', (t) => {
        const submission = { ...base.submission, grade: '未完成', feedback: '按照这次要求重新做一下', reviewedAt: '2026-11-01' };
        const teacher = render(t, { isTeacher: true, reviewStatus: 'changes_requested', submission });
        assert.equal(teacher.querySelector('[name=reviewStatus]').value, 'changes_requested');
        assert.equal(teacher.querySelector('[name=grade]').value, '未完成');
        assert.match(teacher.querySelector('.sc-submission-review-result small').textContent, /待完成[\s\S]*重新提交/);
        const student = render(t, { reviewStatus: 'changes_requested', submission });
        assert.match(student.querySelector('.sc-submission-status').textContent, /需修改[\s\S]*重新提交/);
        assert.equal(student.querySelector('.sc-submission-status').classList.contains('is-reviewed'), false);
        assert.equal(student.querySelector('.sc-submission-feedback').classList.contains('needs-changes'), true);
        assert.equal(student.querySelector('.sc-submission-feedback .sc-badge-success'), null);
        assert.match(student.querySelector('.sc-submission-request-note').textContent, /还未完成[\s\S]*重新提交/);
        assert.match(student.querySelector('.sc-submission-continue').textContent, /按建议修改作品/);
        assert.equal(student.querySelector('.sc-submission-continue').getAttribute('href'), '/scratch_editor?workId=w1');
    });
    it('honors an explicit accepted outcome and preserves revision requests in archived records', (t) => {
        const submission = { ...base.submission, reviewStatus: 'accepted', grade: '未完成', reviewedAt: '2026-11-01' };
        const accepted = render(t, { isTeacher: true, reviewStatus: 'accepted', submission });
        assert.equal(accepted.querySelector('[name=reviewStatus]').value, 'accepted');
        assert.match(accepted.querySelector('.sc-submission-status').textContent, /AC通过[\s\S]*完全正确/);
        assert.match(accepted.querySelector('option[value=accepted]').textContent, /完全正确[\s\S]*AC通过/);
        assert.equal(accepted.querySelector('.sc-submission-status').classList.contains('is-reviewed'), true);
        assert.equal(accepted.querySelector('.sc-submission-request-note'), null);
        const archived = render(t, { isTeacher: true, assignment: { ...base.assignment, deletedAt: '2026-11-01' },
            reviewStatus: 'changes_requested', submission: { ...submission, reviewStatus: 'changes_requested' } });
        assert.equal(archived.querySelector('form'), null);
        assert.equal(archived.querySelector('a[href*="workId="]'), null);
        assert.match(archived.querySelector('.sc-submission-status').textContent, /需修改/);
    });
    it('explains that an expired revision request needs a deadline adjustment before resubmission', (t) => {
        const doc = render(t, { deadlinePassed: true, reviewStatus: 'changes_requested',
            submission: { ...base.submission, reviewedAt: '2026-11-01', grade: '未完成' } });
        assert.match(doc.querySelector('.sc-submission-resubmit-note').textContent, /不能再次提交[\s\S]*联系老师调整截止时间/);
    });
    it('keeps ordinary completion distinct from a fully correct AC outcome', (t) => {
        const submission = { ...base.submission, grade: '95分', reviewStatus: 'completed', reviewedAt: '2026-11-01' };
        const teacher = render(t, { isTeacher: true, reviewStatus: 'completed', submission });
        assert.equal(teacher.querySelector('[name=reviewStatus]').value, 'completed');
        assert.doesNotMatch(teacher.querySelector('.sc-submission-status').textContent, /AC通过/);
        const student = render(t, { reviewStatus: 'completed', submission });
        assert.match(student.querySelector('.sc-submission-status').textContent, /已完成/);
        assert.doesNotMatch(student.querySelector('.sc-submission-status').textContent, /AC通过/);
    });
});
