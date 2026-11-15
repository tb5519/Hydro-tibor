const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '../packages/ui-default');
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(root, 'templates')), { autoescape: true });
env.addFilter('markdown', (value) => String(value || '').replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
const url = (name, args = {}) => `/${name}${args.problemId ? `/${args.problemId}` : args.submissionId ? `/${args.submissionId}` : args.fileId ? `/${args.fileId}` : ''}${args.query ? `?${new URLSearchParams(args.query)}` : ''}`;
const base = { url, datetimeSpan: String, isTeacher: false, page: 1, numPages: 1, count: 2, q: '', kind: '',
    _: (value) => value,
    paginate: (page, total) => [['current', page], ...(page < total ? [['next', page + 1]] : [])],
    utils: { buildQueryString: (values) => Object.entries(values)
        .filter(([key, value]) => value && !key.startsWith('__'))
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&') },
    stats: { total: 2, pendingReview: 3 }, handler: { user: { _id: 9 } }, UiContext: { scratchEditor: {} },
    udict: {}, problems: [
        { id: 'p1', kind: 'project', title: '小猫的星空冒险', tags: ['事件', '运动'], status: 'new', url: '/question/1', editUrl: '/edit/1' },
        { id: 'p2', kind: 'objective', title: '循环小挑战', tags: ['循环'], status: 'draft', questionCount: 5, total: 5, answered: 2, url: '/question/2', editUrl: '/edit/2' },
    ] };
function render(name, data = {}) {
    const source = fs.readFileSync(path.join(root, 'templates', name), 'utf8').replace(/\{% extends "[^"]+" %\}/, '');
    const dom = new JSDOM(env.renderString('{% import "components/paginator.html" as paginator with context %}' + source,
        { ...base, ...data }), { url: 'https://class.test/scratch/problems' });
    return dom;
}
test('fully correct Scratch challenges receive a flag AC badge, while ordinary reviews and requested changes do not', () => {
    const problems = [
        { ...base.problems[0], id: 'ac-project', status: 'ac' },
        { ...base.problems[1], id: 'ac-quiz', status: 'ac' },
        { ...base.problems[0], id: 'ordinary', status: 'reviewed' },
        { ...base.problems[0], id: 'redo', status: 'changes_requested' },
    ];
    const dom = render('scratch_problem_main.html', { problems, count: 4 });
    const rows = dom.window.document.querySelectorAll('.scb-problem-row');
    assert.equal(dom.window.document.querySelectorAll('.scb-status-ac').length, 2);
    assert(rows[0].querySelector('.scb-status-ac svg'));
    assert.match(rows[0].querySelector('.scb-status-ac').textContent, /AC.*通过/);
    assert.match(rows[1].textContent, /全部答对/);
    assert.match(rows[0].querySelector('.scb-row-open').textContent, /查看结果/);
    assert.equal(rows[2].querySelector('.scb-status-ac'), null);
    assert.match(rows[2].textContent, /已批改/);
    assert.equal(rows[3].querySelector('.scb-status-ac'), null);
    assert.match(rows[3].textContent, /需修改[\s\S]*按建议修改/);
    dom.window.close();
});
test('students receive clear progress and next actions, without authoring or review controls', () => {
    const dom = render('scratch_problem_main.html');
    const doc = dom.window.document;
    assert.equal(doc.querySelector('a[href="/scratch_problem_create"]'), null);
    assert.equal(doc.querySelector('a[href="/scratch_problem_review"]'), null);
    assert.equal(doc.querySelector('.scb-edit-link'), null);
    assert.equal(doc.querySelectorAll('.scb-problem-row').length, 2);
    assert.equal(doc.querySelector('.scb-row-open').textContent.trim(), '开始挑战→');
    assert.match(doc.querySelectorAll('.scb-problem-row')[1].textContent, /进行中[\s\S]*2 \/ 5 题[\s\S]*继续挑战/);
    assert.equal(doc.querySelector('[name=kind] option[value=project]').textContent, 'Scratch 创作');
    dom.window.close();
});
test('teacher list exposes creation and pending review without learner completion badges', () => {
    const dom = render('scratch_problem_main.html', { isTeacher: true });
    const doc = dom.window.document;
    assert(doc.querySelector('a[href="/scratch_problem_create"]'));
    assert.equal(doc.querySelector('a[href="/scratch_problem_review"] .scb-dot-count').textContent, '3');
    assert.equal(doc.querySelectorAll('.scb-edit-link').length, 2);
    assert.equal(doc.querySelectorAll('.scb-problem-state').length, 0);
    dom.window.close();
});
test('search values persist, hidden authoring labels and titles are safely escaped', () => {
    const title = '<img src=x onerror=alert(1)>';
    const dom = render('scratch_problem_main.html', { q: title, kind: 'project', isTeacher: true,
        problems: [{ ...base.problems[0], title, tags: [title, 'a', 'b', 'c'], hidden: true }] });
    assert.equal(dom.window.document.querySelector('[name=q]').value, title);
    assert.equal(dom.window.document.querySelector('[name=kind]').value, 'project');
    assert.equal(dom.window.document.querySelector('.scb-problem-info h2').textContent, title);
    assert.equal(dom.window.document.querySelector('img'), null);
    assert.match(dom.window.document.querySelector('.scb-private').textContent, /仅老师可见/);
    assert.match(dom.window.document.querySelector('.scb-problem-tags').textContent, /＋1/);
    dom.window.close();
});
test('empty student bank and filtered empty bank offer honest next steps', () => {
    for (const q of ['', '不存在']) {
        const dom = render('scratch_problem_main.html', { problems: [], count: 0, q });
        assert.match(dom.window.document.querySelector('.scb-empty').textContent, q ? /没有找到匹配/ : /新的挑战/);
        assert.equal(dom.window.document.querySelector('a[href="/scratch_problem_create"]'), null);
        dom.window.close();
    }
});
test('create choices route to Scratch project authoring and existing objective workbench', () => {
    const dom = render('scratch_problem_create.html');
    assert.equal(dom.window.document.querySelectorAll('.scb-create-card').length, 2);
    assert(dom.window.document.querySelector('a[href="/scratch_problem_project_create"]'));
    assert(dom.window.document.querySelector('a[href="/problem_objective"]'));
    assert.match(dom.window.document.querySelector('.scb-footnote').textContent, /单题素材仅老师可见/);
    dom.window.close();
});
test('project editor posts required content and optional SB3 with explicit visibility', () => {
    const dom = render('scratch_problem_edit.html', { problem: { _id: 'p1', title: '作品题', description: '任务', hidden: true, templateFileId: 'f1' }, tagInput: '事件, 运动' });
    const doc = dom.window.document;
    assert.equal(doc.querySelector('form').enctype, 'multipart/form-data');
    assert.equal(doc.querySelector('[name=title]').required, true);
    assert.equal(doc.querySelector('[name=description]').required, true);
    assert.equal(doc.querySelector('[name=template]').accept, '.sb3');
    assert.equal(doc.querySelector('[name=hidden]').value, 'true');
    assert.equal(doc.querySelector('[name=tag]').value, '事件, 运动');
    assert(doc.querySelector('a[href="/scratch_file/f1"]'));
    dom.window.close();
});
test('project detail allows continuation and shows immutable submission feedback links', () => {
    const dom = render('scratch_problem_detail.html', { problem: { _id: 'p1', kind: 'project', title: '小猫冒险', tags: [], description: '向右移动' },
        work: { _id: 'w1' }, submissions: [{ _id: 's1', revision: 2, owner: 9, createdAt: '2026-10-15', grade: '95', reviewedAt: '2026-10-15' }] });
    const doc = dom.window.document;
    assert.match(doc.querySelector('form button').textContent, /继续创作/);
    assert.equal(doc.querySelector('.scb-grade').textContent, '95');
    assert.match(doc.querySelector('a[href="/scratch_submission/s1"]').textContent, /查看反馈/);
    dom.window.close();
});
test('review queue preserves student, exact version, state and grading destination', () => {
    const dom = render('scratch_problem_review.html', { status: 'pending', q: '小明', count: 1,
        submissions: [{ _id: 's1', revision: 3, studentName: '小明', assignmentTitle: '小猫冒险', createdAt: '2026-10-15', problemUrl: '/question/1', url: '/review/s1' }] });
    const doc = dom.window.document;
    assert.equal(doc.querySelector('[name=status]').value, 'pending');
    assert.match(doc.querySelector('.scb-review-person').textContent, /小明[\s\S]*第 3 版/);
    assert.equal(doc.querySelector('a[href="/review/s1"]').textContent.trim(), '开始批改 →');
    dom.window.close();
});
test('review detail offers read-only code inspection and returns to the right context', () => {
    const data = { isTeacher: true, assignment: { _id: 'p1', title: '小猫冒险', kind: 'problem' }, work: { owner: 9 },
        submission: { _id: 's1', owner: 8, revision: 2, fileId: 'f1', createdAt: '2026-10-15' } };
    const dom = render('scratch_submission.html', data);
    const doc = dom.window.document;
    assert(doc.querySelector('a[href="/scratch_problem_review"]'));
    assert(doc.querySelector('a[href*="inspect=true"]'));
    assert.equal(new URL(doc.querySelector('a[href*="inspect=true"]').href).searchParams.get('submissionId'), 's1');
    assert(doc.querySelector('a[href="/scratch_editor?submissionId=s1"]'));
    assert.equal(doc.querySelector('[name=feedback]').maxLength, 20000);
    const student = render('scratch_submission.html', { ...data, isTeacher: false });
    assert.equal(student.window.document.querySelector('a[href*="inspect=true"]'), null);
    assert.equal(student.window.document.querySelector('form'), null);
    assert(student.window.document.querySelector('a[href="/scratch_problem_detail/p1"]'));
    dom.window.close(); student.window.close();
});
test('deleted homework retains readable submissions and feedback without grading or continuation controls', () => {
    const data = { isTeacher: true, assignment: { _id: 'a1', title: '课堂作业', deletedAt: '2026-10-18' }, work: { _id: 'w1', owner: 9 },
        submission: { _id: 's1', owner: 9, revision: 2, fileId: 'f1', createdAt: '2026-10-15' } };
    for (const reviewed of [false, true]) {
        const dom = render('scratch_submission.html', { ...data, submission: { ...data.submission,
            ...(reviewed ? { reviewedAt: '2026-10-16', grade: '优秀', feedback: '动作很流畅' } : {}) } });
        const doc = dom.window.document;
        assert.equal(doc.querySelector('form'), null);
        assert.equal(doc.querySelector('[name=grade]'), null);
        assert.equal(doc.querySelector('a[href="/scratch_editor?workId=w1"]'), null);
        assert(![...doc.querySelectorAll('a')].some((link) => link.textContent.includes('继续创作')));
        assert.match(doc.querySelector('[role=status]').textContent, /已删除[\s\S]*恢复作业/);
        assert(doc.querySelector('a[href="/scratch_file/f1"]'));
        assert(doc.querySelector('a[href*="inspect=true"]'));
        assert.match(doc.querySelector('.sc-panel:last-child').textContent,
            reviewed ? /优秀[\s\S]*动作很流畅/ : /尚未批改/);
        dom.window.close();
    }
});
test('problem workspace always includes the task, an accessible mobile switch and proper read-only controls', () => {
    const config = { problemMode: true, title: '小猫', backUrl: '/question/1', readOnly: false, canSubmit: true, submitLabel: '提交作品' };
    const dom = render('scratch_editor.html', { problem: { title: '小猫冒险', description: '<script>attack</script>' }, UiContext: { scratchEditor: config } });
    const doc = dom.window.document;
    assert(doc.querySelector('.scratch-problem-question'));
    assert.equal(doc.querySelectorAll('[data-scratch-panel]').length, 2);
    assert.equal(doc.querySelector('[data-scratch-panel=question]').getAttribute('aria-pressed'), 'true');
    assert.equal(doc.querySelector('[data-scratch-submit] span').textContent, '提交作品');
    assert.equal(doc.querySelector('.scratch-problem-description script'), null);
    const inspect = render('scratch_editor.html', { problem: { title: '小猫冒险' }, UiContext: { scratchEditor: { ...config, readOnly: true, inspectCode: true } } });
    assert.equal(inspect.window.document.querySelector('[data-scratch-save]'), null);
    assert.equal(inspect.window.document.querySelector('.scratch-editor-player'), null);
    assert.equal(inspect.window.document.querySelector('iframe').title, 'Scratch 提交积木查看');
    dom.window.close(); inspect.window.close();
});
test('completed quizzes show results and teachers can assign the paper as homework', () => {
    const data = { problem: { id: 12, kind: 'objective', title: '知识小挑战', tags: [], questionCount: 5, totalScore: 100,
        editUrl: '/edit/12', assignmentUrl: '/homework/new?paper=12' }, objectiveQuiz: { total: 5, answered: 5, correct: 4, completed: true, score: 80 } };
    const dom = render('scratch_problem_detail.html', data);
    assert.match(dom.window.document.querySelector('form button').textContent, /查看答题结果/);
    assert.match(dom.window.document.querySelector('.scb-quiz-progress').textContent, /答对 4 题/);
    const teacher = render('scratch_problem_detail.html', { ...data, isTeacher: true });
    assert.equal(teacher.window.document.querySelector('a[href="/homework/new?paper=12"]').textContent, '布置为作业');
    assert(teacher.window.document.querySelector('a[href="/edit/12"]'));
    dom.window.close(); teacher.window.close();
});
test('teachers can assign a project from its detail page while students never see assignment controls', () => {
    const data = { problem: { id: 'p1', kind: 'project', title: '小猫冒险', tags: [], description: '任务',
        editUrl: '/edit/p1', assignmentUrl: '/homework/new?projectProblemId=p1' } };
    const teacher = render('scratch_problem_detail.html', { ...data, isTeacher: true });
    assert.equal(teacher.window.document.querySelector('a[href="/homework/new?projectProblemId=p1"]').textContent, '布置为作业');
    assert(teacher.window.document.querySelector('a[href="/scratch_problem_review"]'));
    const student = render('scratch_problem_detail.html', data);
    assert.equal(student.window.document.querySelector('a[href*="projectProblemId"]'), null);
    teacher.window.close(); student.window.close();
});
test('imported homework keeps the split workspace but labels its back link and submission as homework', () => {
    const config = { problemMode: true, title: '小猫', backUrl: '/homework/a1', readOnly: false, canSubmit: true, submitLabel: '提交作业' };
    const dom = render('scratch_editor.html', { problem: { sourceProblemId: 'p1', title: '小猫冒险', description: '向右移动' },
        UiContext: { scratchEditor: config } });
    assert(dom.window.document.querySelector('.scratch-problem-workspace'));
    assert.match(dom.window.document.querySelector('[data-scratch-back]').textContent, /返回作业/);
    assert.equal(dom.window.document.querySelector('[data-scratch-back]').getAttribute('href'), '/homework/a1');
    assert.match(dom.window.document.querySelector('.scratch-problem-hint').textContent, /提交作业/);
    assert.equal(dom.window.document.querySelector('[data-scratch-submit] span').textContent, '提交作业');
    const problem = render('scratch_editor.html', { problem: { kind: 'problem', title: '小猫冒险', description: '向右移动' },
        UiContext: { scratchEditor: { ...config, submitLabel: '提交作品', backUrl: '/question/p1' } } });
    assert.match(problem.window.document.querySelector('[data-scratch-back]').textContent, /返回题目/);
    assert.match(problem.window.document.querySelector('.scratch-problem-hint').textContent, /提交作品/);
    dom.window.close(); problem.window.close();
});
test('mobile question tabs work and code inspection requests a non-saving inspect bridge', async () => {
    const config = { problemMode: true, title: '小猫', projectUrl: null, maxFileSize: 1024, revision: 2,
        backUrl: '/review/s1', readOnly: true, canSubmit: false, inspectCode: true };
    const dom = render('scratch_editor.html', { problem: { title: '小猫冒险', description: '向右移动' }, UiContext: { scratchEditor: config } });
    const { window } = dom;
    const sent = [];
    let callback;
    const frame = window.document.querySelector('iframe');
    const code = transformSync(fs.readFileSync(path.join(root, 'pages/scratch_editor.page.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
    vm.runInNewContext(code, {
        module: { exports: {} }, exports: {}, window, document: window.document, location: window.location,
        UiContext: { scratchEditor: config }, Event: window.Event,
        crypto: { randomUUID: () => 'channel' }, URL, Blob, ArrayBuffer, AbortController,
        setTimeout: () => 1, clearTimeout: () => {},
        fetch: () => { throw Error('Read-only inspection must not write'); },
        require: () => ({ NamedPage: class { constructor(_, fn) { callback = fn; } } }),
    });
    callback();
    frame.contentWindow.postMessage = (data) => sent.push(data);
    window.document.querySelector('[data-scratch-panel=editor]').click();
    assert.equal(window.document.querySelector('[data-scratch-problem-workspace]').dataset.panel, 'editor');
    assert.equal(window.document.querySelector('[data-scratch-panel=question]').getAttribute('aria-pressed'), 'false');
    window.dispatchEvent(new window.MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel: 'channel', type: 'ready' } }));
    await new Promise(setImmediate);
    assert.equal(sent[0].mode, 'inspect');
    assert.equal(sent[0].readOnly, true);
    assert.equal(window.document.querySelector('[data-scratch-save]'), null);
    window.close();
});
test('problem bank pagination keeps the searched title and selected kind', () => {
    const query = '循环 & 判断 + 创作';
    const dom = render('scratch_problem_main.html', { q: query, kind: 'objective', numPages: 3 });
    const next = new URL(dom.window.document.querySelector('.pager__item.next').href);
    assert.equal(next.searchParams.get('page'), '2');
    assert.equal(next.searchParams.get('q'), query);
    assert.equal(next.searchParams.get('kind'), 'objective');
    assert.equal(next.searchParams.get('__keywords'), null);
    dom.window.close();
});
test('review queue pagination never resets reviewed or all submissions to pending', () => {
    for (const status of ['reviewed', 'all', 'pending']) {
        const dom = render('scratch_problem_review.html', { q: '小明 & 小猫', status, submissions: [], page: 2, numPages: 4 });
        const next = new URL(dom.window.document.querySelector('.pager__item.next').href);
        assert.equal(next.searchParams.get('page'), '3');
        assert.equal(next.searchParams.get('q'), '小明 & 小猫');
        assert.equal(next.searchParams.get('status'), status);
        dom.window.close();
    }
});
test('all Scratch problem routes have readable Chinese and English document titles', () => {
    const YAML = require('yaml');
    const chinese = YAML.parse(fs.readFileSync(path.join(root, 'locales/zh.yaml'), 'utf8'));
    const english = YAML.parse(fs.readFileSync(path.join(root, 'locales/en.yaml'), 'utf8'));
    for (const key of ['scratch_problem_main', 'scratch_problem_create', 'scratch_problem_project_create',
        'scratch_problem_edit', 'scratch_problem_detail', 'scratch_problem_paper', 'scratch_problem_paper_edit', 'scratch_problem_review']) {
        assert.match(chinese[key], /[\u4e00-\u9fff]/, `${key} needs a Chinese title`);
        assert.match(english[key], /^Scratch |^Create Scratch |^Edit Scratch |^Review Scratch /);
    }
});
test('paper metadata editing posts the display ID, title, tags and explicit publication visibility', () => {
    for (const hidden of [false, true]) {
        const dom = render('scratch_problem_paper_edit.html', {
            problem: { paperId: 12, title: '方向 <小挑战>', tags: ['运动', '坐标'], hidden }, tagInput: '运动, 坐标',
        });
        const doc = dom.window.document;
        assert.equal(doc.querySelector('form').method, 'post');
        assert.deepEqual([...doc.querySelectorAll('form [name]')].map((element) => element.name), ['title', 'problemCode', 'tag', 'hidden']);
        assert.equal(doc.querySelector('[name=title]').value, '方向 <小挑战>');
        assert.equal(doc.querySelector('[name=title]').required, true);
        assert.equal(doc.querySelector('[name=tag]').value, '运动, 坐标');
        assert.equal(doc.querySelector('[name=hidden]').value, String(hidden));
        assert.equal(doc.querySelector('textarea'), null, 'there is no misleading paper-body editor');
        assert.match(doc.querySelector('.scb-form-note').textContent, /题目、答案或分值.*重新组卷/);
        assert(doc.querySelector('a[href="/problem_objective"]'));
        dom.window.close();
    }
});
test('unpublished papers offer only editing and a static publishing state while hidden projects remain viewable', () => {
    const dom = render('scratch_problem_main.html', { isTeacher: true,
        problems: base.problems.map((item) => ({ ...item, hidden: true })) });
    const rows = dom.window.document.querySelectorAll('.scb-problem-row');
    assert(rows[0].querySelector('h2 a[href="/question/1"]'));
    assert(rows[0].querySelector('.scb-row-open[href="/question/1"]'));
    const paper = rows[1];
    assert.equal(paper.querySelector('h2 a'), null);
    assert.equal(paper.querySelector('.scb-row-open'), null);
    assert.equal(paper.querySelectorAll('a').length, 1);
    assert.equal(paper.querySelector('a').getAttribute('href'), '/edit/2');
    assert.equal(paper.querySelector('.scb-row-actions .scb-status').textContent, '待发布');
    dom.window.close();
});

test('Scratch bank and detail show escaped display IDs without changing their links', () => {
    const problemCode = 'S12<unsafe>';
    const bank = render('scratch_problem_main.html', { problems: [{ ...base.problems[0], problemCode }] });
    assert.equal(bank.window.document.querySelector('[data-scratch-problem-code]').textContent, problemCode);
    assert.equal(bank.window.document.querySelector('unsafe'), null);
    assert.equal(bank.window.document.querySelector('h2 a').getAttribute('href'), '/question/1');
    assert.match(bank.window.document.querySelector('.scb-list-heading').textContent, /按题目 ID 排序/);
    assert.match(bank.window.document.querySelector('[name=q]').placeholder, /ID/);
    const detail = render('scratch_problem_detail.html', { problem: { ...base.problems[0], problemCode } });
    assert.equal(detail.window.document.querySelector('[data-scratch-problem-code]').textContent, problemCode);
    bank.window.close(); detail.window.close();
});

test('project and paper editors expose optional IDs with distinct new and existing hints', () => {
    const created = render('scratch_problem_edit.html');
    assert.equal(created.window.document.querySelector('[name=problemCode]').required, false);
    assert.match(created.window.document.querySelector('#scratch-problem-code-help').textContent, /留空自动分配 S1、S2/);
    for (const name of ['scratch_problem_edit.html', 'scratch_problem_paper_edit.html']) {
        const dom = render(name, { problem: { title: '题目', problemCode: 'S14' } });
        const input = dom.window.document.querySelector('[name=problemCode]');
        assert.equal(input.value, 'S14'); assert.equal(input.maxLength, 32);
        assert.match(dom.window.document.querySelector('#scratch-problem-code-help').textContent, /留空保留当前 ID/);
        assert(dom.window.document.querySelector('form[data-scratch-problem-form]'));
        dom.window.close();
    }
    created.window.close();
});

const editorScript = transformSync(fs.readFileSync(path.join(root, 'pages/scratch_problem_edit.page.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code;
const editorFlush = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
function editorHarness(template = 'scratch_problem_edit.html', fetchHandler = async () => ({ ok: true, json: async () => ({ url: '/saved' }) })) {
    const dom = render(template, { problem: { title: '已有题目', description: '已有任务', problemCode: 'S1', hidden: false } });
    const { window } = dom; const form = window.document.querySelector('form');
    const calls = []; const navigations = [];
    const location = { href: window.location.href, origin: window.location.origin };
    const fakeWindow = { location: { assign: (url) => navigations.push(url) },
        setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
        addEventListener: window.addEventListener.bind(window) };
    const mod = { exports: {} };
    vm.runInNewContext(editorScript, {
        module: mod, exports: mod.exports, document: window.document, window: fakeWindow, location,
        URL: window.URL, FormData: window.FormData, AbortController: window.AbortController,
        fetch: async (url, options) => { calls.push({ url, options }); return fetchHandler(url, options); },
        require(name) {
            if (name === 'vj/misc/Page') return { NamedPage: class { constructor(names, callback) { this.names = names; this.callback = callback; } } };
            if (name.includes('markdown-image-paste')) return { attachMarkdownImagePaste() {} };
            throw new Error(`Unexpected import ${name}`);
        },
    });
    mod.exports.default.callback();
    return { dom, window, form, calls, navigations, page: mod.exports.default,
        submit: async () => { form.dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true })); await editorFlush(); },
        close: () => dom.window.close() };
}

for (const template of ['scratch_problem_edit.html', 'scratch_problem_paper_edit.html']) {
    test(`${template} normalizes display IDs and posts the original form before navigating`, async () => {
        const h = editorHarness(template);
        assert(h.page.names.includes('scratch_problem_paper_edit'));
        h.form.querySelector('[name=problemCode]').value = ' s12 ';
        await h.submit();
        assert.equal(h.calls.length, 1);
        assert.equal(h.calls[0].options.body.get('problemCode'), 'S12');
        assert.equal(h.calls[0].options.body.get('title'), '已有题目');
        assert.equal(h.calls[0].options.credentials, 'same-origin');
        assert.equal(h.calls[0].options.headers.Accept, 'application/json');
        assert.deepEqual(h.navigations, ['https://class.test/saved']);
        h.close();
    });
}

test('invalid IDs block requests without discarding the title, description or selected file', async () => {
    const h = editorHarness(); const input = h.form.querySelector('[name=problemCode]');
    const selected = [new h.window.File(['project'], 'start.sb3')];
    Object.defineProperty(h.form.querySelector('[name=template]'), 'files', { value: selected });
    for (const code of ['0', '01', 'bad code', 'S'.repeat(33)]) {
        input.value = code; await h.submit();
        assert.equal(h.calls.length, 0); assert.equal(input.value, code);
        assert.equal(h.form.querySelector('[data-scratch-problem-error]').hidden, false);
    }
    assert.equal(h.form.querySelector('[name=title]').value, '已有题目');
    assert.equal(h.form.querySelector('[name=description]').value, '已有任务');
    assert.equal(h.form.querySelector('[name=template]').files, selected);
    h.close();
});

test('a duplicate response preserves the edited form and file and permits a corrected retry', async () => {
    let attempt = 0;
    const h = editorHarness('scratch_problem_edit.html', async () => ++attempt === 1
        ? { ok: false, json: async () => ({ error: { params: ['problemCode', '题目ID已被使用'] } }) }
        : { ok: true, json: async () => ({ url: '/saved' }) });
    const selected = [new h.window.File(['project'], 'start.sb3')];
    Object.defineProperty(h.form.querySelector('[name=template]'), 'files', { value: selected });
    h.form.querySelector('[name=problemCode]').value = 'S2'; await h.submit();
    assert.match(h.form.querySelector('[data-scratch-problem-error]').textContent, /已被使用.*内容和文件已保留/);
    assert.equal(h.form.querySelector('[name=template]').files, selected);
    assert.equal(h.form.querySelector('[name=problemCode]').value, 'S2');
    assert.equal(h.form.querySelector('button[type=submit]').disabled, false);
    h.form.querySelector('[name=problemCode]').value = 'S3'; await h.submit();
    assert.equal(h.calls.length, 2); assert.equal(h.navigations.length, 1); h.close();
});

test('duplicate clicks and late responses after leaving the page cannot submit or navigate twice', async () => {
    let finish;
    const h = editorHarness('scratch_problem_paper_edit.html', () => new Promise(resolve => { finish = resolve; }));
    await h.submit(); await h.submit();
    assert.equal(h.calls.length, 1);
    assert.equal(h.form.querySelector('button[type=submit]').disabled, true);
    h.window.dispatchEvent(new h.window.Event('pagehide'));
    assert.equal(h.calls[0].options.signal.aborted, true);
    finish({ ok: true, json: async () => ({ url: '/late' }) }); await editorFlush();
    assert.deepEqual(h.navigations, []);
    h.window.dispatchEvent(new h.window.Event('pageshow'));
    assert.equal(h.form.querySelector('button[type=submit]').disabled, false);
    h.close();
});
