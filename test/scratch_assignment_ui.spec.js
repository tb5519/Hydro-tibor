const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');
const MarkdownIt = require('markdown-it');

const ui = path.resolve(__dirname, '../packages/ui-default');
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(ui, 'templates')), { autoescape: true });
const markdown = new MarkdownIt({ html: false });
env.addFilter('markdown', (value) => markdown.render(String(value || '')));
env.addFilter('json', (value) => value ? JSON.stringify(value) : '');
const projects = [
    { id: 'project-1', title: '小猫的星空冒险', description: '点击绿旗。\n\n![积木截图](/file/2/blocks.png)', tags: ['事件'], templateFileId: 'starting-project', url: '/problem/project-1', previewUrl: '/preview/project-1' },
    { id: 'project-2', title: '循环画花朵', description: '重复画一朵花。', tags: ['循环'], url: '/problem/project-2', previewUrl: '/preview/project-2' },
    { id: 'project-3', title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>\n\n![示例](/file/2/example.png)', tags: ['<script>'], url: '/problem/project-3', previewUrl: '/preview/project-3' },
];
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
    projectProblems: projects.map(({ description, ...metadata }) => metadata),
    assignmentStudents: [
        { uid: 42, uname: 'kitten', displayName: '小猫', avatarUrl: '/avatars/42.png' },
        { uid: 51, uname: 'StarOne', displayName: '星星' },
        { uid: 52, uname: 'StarTwo', displayName: '月亮' },
        { uid: 65, uname: 'safe', displayName: '<img src=x onerror=alert(1)>' },
    ],
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
    const imageBindings = [];
    const requests = [];
    vm.runInNewContext(code, {
        document: dom.window.document, window: dom.window, module: mod, exports: mod.exports,
        location: dom.window.location, DOMParser: dom.window.DOMParser, Event: dom.window.Event, AbortController, setTimeout, clearTimeout,
        fetch: (url, options) => {
            requests.push(url);
            if (overrides.fetch) return overrides.fetch(url, options);
            const item = projects.find((project) => project.previewUrl === url);
            if (!item) throw new Error(`Unexpected fetch ${url}`);
            return Promise.resolve({ ok: true, json: async () => ({ projectProblem: item }) });
        },
        require: (name) => {
            if (name.endsWith('markdown-image-paste')) return { attachMarkdownImagePaste: (textarea, status) => { imageBindings.push({ textarea, status }); } };
            if (name.endsWith('objective-markdown')) return { createObjectiveMarkdown: () => markdown };
            assert.equal(name, 'vj/misc/Page');
            return { NamedPage: class { constructor(names, callback) { this.names = names; this.run = callback; } } };
        },
    });
    mod.exports.default.run();
    const doc = dom.window.document;
    const form = doc.querySelector('form');
    const mode = (value) => doc.querySelector(`input[name=assignmentMode][value=${value}]`).click();
    const paper = (id) => doc.querySelector(`input[type=checkbox][name=objectivePaperIds][value="${id}"]`);
    const submit = () => {
        const event = new dom.window.Event('submit', { cancelable: true, bubbles: true });
        form.dispatchEvent(event);
        return !event.defaultPrevented;
    };
    const chooseProject = (id) => doc.querySelector(`[data-assignment-project-item][data-id="${id}"] [data-assignment-project-select]`).click();
    return { dom, doc, form, mode, paper, submit, chooseProject, requests, imageBindings };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('Scratch assignment recipients', () => {
    const selectedMode = (view) => view.doc.querySelector('input[name=audience][value=selected]').click();
    const recipient = (view, id) => view.doc.querySelector(`[data-assignment-recipient][value="${id}"]`);
    const ids = (view) => JSON.parse(new view.dom.window.FormData(view.form).get('recipientIds'));
    const search = (view, value) => {
        const input = view.doc.querySelector('[data-assignment-recipient-search]');
        input.value = value;
        input.dispatchEvent(new view.dom.window.Event('input'));
        return [...view.doc.querySelectorAll('[data-assignment-recipient-row]')].filter((row) => !row.hidden)
            .map((row) => Number(row.querySelector('input').value));
    };

    it('defaults legacy and new assignments to all classroom learners, with no selected recipients', () => {
        for (const assignment of [null, { _id: 'old', title: '旧作业' }]) {
            const view = editor(assignment);
            const data = new view.dom.window.FormData(view.form);
            assert.equal(data.get('audience'), 'all');
            assert.deepEqual(ids(view), []);
            assert.equal(view.doc.querySelector('[data-assignment-recipient-picker]').hidden, true);
            assert.match(view.doc.querySelector('.sc-assignment-audience').textContent, /本课堂的所有学员/);
            assert.equal(view.submit(), true);
            view.dom.window.close();
        }
    });

    it('blocks an empty selected audience and immediately allows a single learner after choosing', () => {
        const view = editor();
        selectedMode(view);
        assert.equal(view.doc.querySelector('[data-assignment-recipient-picker]').hidden, false);
        assert.equal(view.submit(), false);
        assert.match(view.doc.querySelector('[data-assignment-audience-error]').textContent, /至少选择一位/);
        assert.equal(view.doc.activeElement, view.doc.querySelector('[data-assignment-audience-error]'));
        recipient(view, 42).click();
        assert.deepEqual(ids(view), [42]);
        assert.equal(view.doc.querySelector('[data-assignment-audience-error]').hidden, true);
        assert.equal(view.submit(), true);
        view.dom.window.close();
    });

    it('searches nickname, account without case sensitivity and UID while retaining hidden selections', () => {
        const view = editor();
        selectedMode(view);
        const originalOrder = [...view.doc.querySelectorAll('[data-assignment-recipient]')].map((input) => input.value);
        recipient(view, 42).click();
        assert.deepEqual(search(view, '星星'), [51]);
        assert.deepEqual(search(view, 'STAR'), [51, 52]);
        assert.match(view.doc.querySelector('[data-assignment-recipient-select-all]').textContent, /搜索结果/);
        view.doc.querySelector('[data-assignment-recipient-select-all]').click();
        assert.deepEqual(ids(view), [42, 51, 52]);
        assert.equal(view.doc.querySelectorAll('.sc-assignment-recipient-chip').length, 3);
        assert.deepEqual(search(view, '65'), [65]);
        assert.deepEqual([...view.doc.querySelectorAll('[data-assignment-recipient]')].map((input) => input.value), originalOrder);
        assert.deepEqual(search(view, 'missing'), []);
        assert.equal(view.doc.querySelector('[data-assignment-recipient-empty]').hidden, false);
        assert.equal(view.doc.querySelector('[data-assignment-recipient-select-all]').disabled, true);
        assert.match(view.doc.querySelector('[data-assignment-recipient-count]').textContent, /3/);
        view.dom.window.close();
    });

    it('retains the draft selection when switching audience and serializes only the active mode', () => {
        const view = editor({ _id: 'saved', audience: 'selected', recipientIds: [42, 52] });
        assert.deepEqual(ids(view), [42, 52]);
        view.doc.querySelector('input[name=audience][value=all]').click();
        assert.deepEqual(ids(view), []);
        assert.equal(recipient(view, 42).checked, true);
        selectedMode(view);
        assert.deepEqual(ids(view), [42, 52]);
        view.doc.querySelector('[aria-label="移除学员 小猫"]').click();
        assert.deepEqual(ids(view), [52]);
        assert.equal(recipient(view, 42).checked, false);
        view.doc.querySelector('[data-assignment-recipient-clear]').click();
        assert.deepEqual(ids(view), []);
        assert.equal(view.submit(), false);
        view.dom.window.close();
    });

    it('requires explicit removal of a departed learner without silently dropping the saved recipient', () => {
        const departed = { uid: 99, uname: 'left', displayName: '离开的学员', unavailable: true };
        const view = editor({ _id: 'saved', audience: 'selected', recipientIds: [42, 99] }, {
            assignmentStudents: [...state.assignmentStudents, departed],
        });
        assert.deepEqual(ids(view), [42, 99]);
        assert.equal(view.submit(), false);
        assert.match(view.doc.querySelector('[data-assignment-audience-error]').textContent, /离开课堂/);
        view.doc.querySelector('[aria-label="移除学员 离开的学员"]').click();
        assert.equal(recipient(view, 99).disabled, true);
        view.doc.querySelector('[data-assignment-recipient-select-all]').click();
        assert.deepEqual(ids(view), [42, 51, 52, 65]);
        assert.equal(view.submit(), true);
        view.dom.window.close();
    });

    it('escapes roster names and selected chips, and does not erase content choices', () => {
        const view = editor();
        selectedMode(view);
        recipient(view, 65).click();
        assert.equal(view.doc.querySelector('[data-assignment-recipient-chips] img'), null);
        assert.equal(view.doc.querySelector('[data-assignment-recipient-row] img[onerror]'), null);
        view.mode('mixed');
        view.paper(11).click();
        const data = new view.dom.window.FormData(view.form);
        assert.deepEqual(JSON.parse(data.get('recipientIds')), [65]);
        assert.deepEqual(data.getAll('objectivePaperIds'), ['', '11']);
        assert.equal(view.submit(), true);
        view.dom.window.close();
    });

    it('explains an empty classroom and still blocks accidental empty specific assignments', () => {
        const view = editor(null, { assignmentStudents: [] });
        selectedMode(view);
        assert.match(view.doc.querySelector('[data-assignment-recipient-empty]').textContent, /还没有学员/);
        assert.equal(view.doc.querySelector('[data-assignment-recipient-select-all]').disabled, true);
        assert.equal(view.submit(), false);
        view.dom.window.close();
    });
});

describe('Scratch question-bank project assignment', () => {
    it('uses only metadata in the chooser and fills the explicitly preselected project including images', () => {
        const view = editor(null, { selectedProjectProblemId: 'project-1', selectedProjectProblem: projects[0] });
        assert.equal(view.requests.length, 0);
        assert.equal(view.doc.querySelector('input[name=title]').value, projects[0].title);
        assert.equal(view.doc.querySelector('textarea[name=description]').value, projects[0].description);
        assert.equal(view.doc.querySelector('[name=projectProblemId]').value, 'project-1');
        assert.match(view.doc.querySelector('[data-assignment-project-template-hint]').textContent, /沿用/);
        assert.match(view.doc.querySelector('[data-assignment-project-notice]').textContent, /标题、任务说明（含图片）.*带入上方/);
        assert.equal(view.doc.querySelectorAll('[data-assignment-project-item] img').length, 0, 'preview images load only on demand');
        assert.equal(view.doc.querySelector('[data-assignment-project-item]').hasAttribute('data-description'), false);
        assert.equal(view.imageBindings.length, 1);
        assert.equal(view.imageBindings[0].textarea.name, 'description');
        assert(view.imageBindings[0].status.matches('[data-assignment-description-image-status]'));
        view.dom.window.close();
    });

    it('searches project metadata and lazily previews safe Markdown and images', async () => {
        const view = editor();
        view.doc.querySelector('[data-assignment-project-toggle]').click();
        assert.equal(view.doc.querySelector('[data-assignment-project-picker]').hidden, false);
        assert.equal(view.requests.length, 0);
        const search = view.doc.querySelector('[data-assignment-project-search]');
        search.value = '循环';
        search.dispatchEvent(new view.dom.window.Event('input'));
        const visible = [...view.doc.querySelectorAll('[data-assignment-project-item]')].filter((row) => !row.hidden);
        assert.equal(visible.length, 1);
        assert.equal(visible[0].dataset.id, 'project-2');
        const row = view.doc.querySelector('[data-id="project-3"]');
        const detail = row.querySelector('details');
        detail.open = true;
        detail.dispatchEvent(new view.dom.window.Event('toggle'));
        await tick();
        assert.equal(view.requests[0], '/preview/project-3');
        assert.equal(row.querySelector('script'), null);
        assert.equal(row.querySelector('[data-assignment-project-row-preview] img').getAttribute('src'), '/file/2/example.png');
        assert.equal(row.querySelector('h4 img'), null);
        view.dom.window.close();
    });

    it('preserves handwritten fields and offers an explicit way to apply the selected question', async () => {
        const view = editor();
        const title = view.doc.querySelector('input[name=title]');
        const description = view.doc.querySelector('textarea[name=description]');
        title.value = '老师已经写好的标题';
        view.chooseProject('project-1');
        await tick();
        assert.equal(title.value, '老师已经写好的标题');
        assert.equal(description.value, projects[0].description);
        assert.match(view.doc.querySelector('[data-assignment-project-notice]').textContent, /已保留你填写的标题/);
        assert.equal(view.doc.querySelector('[data-assignment-project-apply]').hidden, false);
        view.doc.querySelector('[data-assignment-project-apply]').click();
        assert.equal(title.value, projects[0].title);
        assert.equal(view.doc.querySelector('[data-assignment-project-apply]').hidden, true);
        description.value += '\n老师追加的要求';
        description.dispatchEvent(new view.dom.window.Event('input'));
        view.chooseProject('project-2');
        await tick();
        assert.equal(title.value, projects[1].title, 'untouched auto-filled title follows the new selection');
        assert.match(description.value, /老师追加的要求/);
        assert.match(view.doc.querySelector('[data-assignment-project-template-hint]').textContent, /空白作品/);
        view.dom.window.close();
    });

    it('blocks publishing while loading and ignores stale results when A resolves after B', async () => {
        const completions = {};
        const view = editor(null, { fetch: (url) => new Promise((resolve) => { completions[url] = resolve; }) });
        view.chooseProject('project-1');
        assert.equal(view.submit(), false);
        assert.equal(view.doc.querySelector('button[type=submit]').disabled, true);
        view.chooseProject('project-2');
        completions['/preview/project-2']({ ok: true, json: async () => ({ projectProblem: projects[1] }) });
        await tick();
        assert.equal(view.doc.querySelector('[name=projectProblemId]').value, 'project-2');
        completions['/preview/project-1']({ ok: true, json: async () => ({ projectProblem: projects[0] }) });
        await tick();
        assert.equal(view.doc.querySelector('[name=projectProblemId]').value, 'project-2');
        assert.equal(view.doc.querySelector('input[name=title]').value, projects[1].title);
        assert.equal(view.doc.querySelector('button[type=submit]').disabled, false);
        assert.equal(view.submit(), true);
        view.dom.window.close();
    });

    it('keeps the previous draft on failed selection and lets a retry succeed', async () => {
        let calls = 0;
        const view = editor(null, { fetch: async () => {
            calls++;
            if (calls === 1) throw new Error('offline');
            return { ok: true, json: async () => ({ projectProblem: projects[0] }) };
        } });
        view.doc.querySelector('input[name=title]').value = '保留的标题';
        view.chooseProject('project-1');
        await tick();
        assert.equal(view.doc.querySelector('[name=projectProblemId]').value, '');
        assert.equal(view.doc.querySelector('input[name=title]').value, '保留的标题');
        assert.match(view.doc.querySelector('[data-assignment-project-notice]').textContent, /已保留原来的任务/);
        view.chooseProject('project-1');
        await tick();
        assert.equal(view.doc.querySelector('[name=projectProblemId]').value, 'project-1');
        assert.equal(view.doc.querySelector('input[name=title]').value, '保留的标题');
        view.dom.window.close();
    });

    it('does not reload an existing assignment from its source and clears only its association on request', () => {
        const view = editor({ title: '已发布时的标题', description: '已布置的说明', templateFileId: 'snapshot-template', sourceProblemId: 'project-1' }, { selectedProjectProblemId: 'project-1' });
        assert.equal(view.requests.length, 0);
        assert.equal(view.doc.querySelector('input[name=title]').value, '已发布时的标题');
        assert.equal(view.doc.querySelector('textarea[name=description]').value, '已布置的说明');
        view.doc.querySelector('[data-assignment-project-clear]').click();
        assert.equal(new view.dom.window.FormData(view.form).get('projectProblemId'), '');
        assert.equal(view.doc.querySelector('textarea[name=description]').value, '已布置的说明');
        assert.equal(view.doc.querySelector('[data-assignment-original-template]').hidden, true);
        assert.match(view.doc.querySelector('[data-assignment-project-template-hint]').textContent, /空白作品/);
        view.dom.window.close();
    });

    it('keeps the chosen project in mixed work and excludes it from objective-only submissions', async () => {
        const view = editor();
        view.chooseProject('project-1');
        await tick();
        view.mode('mixed');
        view.paper(12).click();
        assert.equal(new view.dom.window.FormData(view.form).get('projectProblemId'), 'project-1');
        assert.equal(view.submit(), true);
        view.mode('objective');
        assert.equal(new view.dom.window.FormData(view.form).has('projectProblemId'), false);
        view.mode('mixed');
        assert.equal(view.doc.querySelector('[name=projectProblemId]').value, 'project-1');
        const upload = view.doc.querySelector('[name=template]');
        Object.defineProperty(upload, 'files', { value: [new view.dom.window.File(['file'], 'custom.sb3')], configurable: true });
        upload.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }));
        assert.match(view.doc.querySelector('[data-assignment-project-template-hint]').textContent, /优先于题库/);
        view.dom.window.close();
    });

    it('does not apply a late selection after switching to objective-only work', async () => {
        let complete;
        const view = editor(null, { fetch: () => new Promise((resolve) => { complete = resolve; }) });
        view.chooseProject('project-1');
        view.mode('objective');
        view.paper(11).click();
        complete({ ok: true, json: async () => ({ projectProblem: projects[0] }) });
        await tick();
        assert.equal(view.doc.querySelector('input[name=title]').value, '');
        assert.equal(new view.dom.window.FormData(view.form).has('projectProblemId'), false);
        assert.equal(view.submit(), true);
        view.dom.window.close();
    });
});

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
    it('renders imported task images and formatting in the learner assignment page without raw markup', () => {
        const dom = render('scratch_assignment.html', { assignment: { ...assignment, projectRequired: true,
            description: '**完成目标**\n\n![积木截图](/file/2/blocks.png)\n\n<script>attack()</script>' }, isTeacher: false });
        const description = dom.window.document.querySelector('.sc-assignment-markdown');
        assert.equal(description.querySelector('strong').textContent, '完成目标');
        assert.equal(description.querySelector('img').getAttribute('src'), '/file/2/blocks.png');
        assert.equal(description.querySelector('script'), null);
        assert.doesNotMatch(description.textContent, /!\[积木截图\]/);
        dom.window.close();
    });
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
