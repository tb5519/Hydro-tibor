const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const root = path.resolve(__dirname, '..');

function render(canViewTestcaseData) {
    const env = new nunjucks.Environment(
        new nunjucks.FileSystemLoader(path.join(root, 'packages/ui-default/templates')),
        { autoescape: true, throwOnUndefined: true },
    );
    env.addGlobal('_', (value) => value);
    env.addGlobal('typeof', (value) => typeof value);
    env.addGlobal('formatJudgeTexts', (value) => value.join('\n'));
    env.addGlobal('size', (value) => `${value} B`);
    env.addFilter('ansi', (value) => value);
    const html = env.render('record_detail_status.html', {
        canViewTestcaseData,
        testcaseData: {
            7: {
                1: {
                    input: { name: 'case<script>.in', content: '<script>input-secret</script>\n1 2', size: 38 },
                    output: { name: 'case1.out', content: '3\n', size: 2, truncated: true },
                },
            },
        },
        rdoc: {
            _id: 'record-1', status: 2, score: 50, progress: null,
            compilerTexts: [], judgeTexts: [],
            subtasks: { 7: { status: 2, score: 50, type: 'min' } },
            testCases: [
                { id: 1, subtaskId: 7, status: 2, score: 0, time: 12, memory: 1024, message: '' },
                { id: 2, subtaskId: 7, status: 1, score: 50, time: 8, memory: 1024, message: '' },
            ],
        },
        model: {
            builtin: {
                STATUS_CODES: { 1: 'pass', 2: 'fail' },
                STATUS_TEXTS: { 1: 'Accepted', 2: 'Wrong Answer' },
            },
        },
        STATUS: {
            STATUS_ACCEPTED: 1,
            STATUS_TIME_LIMIT_EXCEEDED: 3,
            STATUS_MEMORY_LIMIT_EXCEEDED: 4,
            STATUS_OUTPUT_LIMIT_EXCEEDED: 5,
        },
        Object,
        utils: { status: { getScoreColor: () => '#f00' } },
    });
    return new JSDOM(html).window.document;
}

describe('record detail testcase presentation', () => {
    it('does not render admin controls, filenames or testcase contents for students', () => {
        const document = render(false);
        assert.equal(document.querySelector('[data-testcase-controls]'), null);
        assert.equal(document.querySelector('[data-testcase-toggle]'), null);
        assert.equal(document.querySelector('[data-testcase-detail]'), null);
        assert.doesNotMatch(document.body.textContent, /input-secret|case1\.out|当前测试数据/);
        assert.equal(document.querySelectorAll('.record-detail__case-row').length, 2);
    });

    it('maps admin data by the recorded subtask and case ids with accessible accordions', () => {
        const document = render(true);
        const toggles = [...document.querySelectorAll('[data-testcase-toggle]')];
        assert.equal(toggles.length, 2);
        assert.equal(toggles[0].dataset.testcaseState, 'fail');
        assert.equal(toggles[0].getAttribute('aria-expanded'), 'false');
        const firstDetail = document.getElementById(toggles[0].getAttribute('aria-controls'));
        assert.ok(firstDetail.hidden);
        assert.match(firstDetail.textContent, /case<script>\.in/);
        assert.match(firstDetail.textContent, /input-secret/);
        assert.match(firstDetail.textContent, /标准输出/);
        assert.ok(firstDetail.querySelector('[data-testcase-copy][aria-controls]'));
        assert.equal(firstDetail.querySelectorAll('script, [onerror], [onclick]').length, 0);

        const missingDetail = document.getElementById(toggles[1].getAttribute('aria-controls'));
        assert.match(missingDetail.textContent, /测试点数据暂不可用/);
        assert.match(document.querySelector('[data-testcase-controls]').textContent, /仅老师与管理员可见/);
    });

    it('keeps the implementation page-scoped, responsive, dark-mode aware and live-update safe', () => {
        const style = fs.readFileSync(path.join(root, 'packages/ui-default/pages/record_detail.page.styl'), 'utf8');
        const script = fs.readFileSync(path.join(root, 'packages/ui-default/pages/record_detail.page.tsx'), 'utf8');
        assert.ok(style.startsWith('.page--record_detail\n'));
        assert.match(style, /\.record-testdata__grid[\s\S]*grid-template-columns: repeat\(2/);
        assert.match(style, /\+mobile\(\)[\s\S]*\.record-testdata__grid[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
        assert.match(style, /\.theme--dark\.page--record_detail/);
        assert.match(style, /\.record-testdata__detail\[hidden\][\s\S]*display: none !important/);
        const tableWrapStyle = style.slice(
            style.indexOf('  .record-detail__table-wrap'),
            style.indexOf('  .record_detail__table'),
        );
        assert.match(tableWrapStyle, /overflow: visible/);
        assert.match(style, /\.record-detail \.record-detail__status-card[\s\S]*?overflow: visible/);
        assert.match(style, /> body > #panel > \.main/);
        assert.match(script, /\.off\('click\.recordTestdataToggle'/);
        assert.match(script, /data-testcase-state="fail"/);
        assert.match(script, /expandedTestcases/);
    });
});
