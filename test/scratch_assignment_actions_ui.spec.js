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
env.addFilter('markdown', (value) => new MarkdownIt({ html: false }).render(String(value || '')));
env.addFilter('json', (value) => JSON.stringify(value));
const assignment = { _id: 'task', title: '小猫的方向挑战', audience: 'selected', recipientIds: [42, 51], projectRequired: true };
const state = {
    url: (name, params = {}) => `/${name}${params.assignmentId ? `/${params.assignmentId}` : ''}${params.query ? `?${new URLSearchParams(params.query)}` : ''}`,
    datetimeSpan: (value) => String(value),
    isTeacher: true, assignments: [assignment], assignment, showDeleted: false, page: 1, numPages: 1,
    utils: { buildQueryString: (params) => new URLSearchParams(params).toString() },
    paginator: { render: (page, numPages, kwargs) => new nunjucks.runtime.SafeString(`<a data-next-page href="?page=2&${kwargs.add_qs}">下一页</a>`) },
    udict: {}, works: [], submissions: [], materials: [], handler: { user: { _id: 7 } },
};
function render(name, overrides = {}) {
    const source = fs.readFileSync(path.join(ui, 'templates', name), 'utf8').replace(/\{% extends "[^"]+" %\}/, '');
    return new JSDOM(env.renderString(source, { ...state, ...overrides }), { url: 'https://class.test/scratch/assignments' });
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function actions(t, overrides = {}) {
    const dom = render('scratch_assignments.html', overrides);
    t.after(() => dom.window.close());
    const { window } = dom;
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    window.HTMLDialogElement.prototype.close = function () {
        this.removeAttribute('open');
        this.dispatchEvent(new window.Event('close'));
    };
    const requests = [];
    const navigations = [];
    const timers = new Map();
    let timerId = 0;
    const code = transformSync(fs.readFileSync(path.join(ui, 'pages/scratch_assignment_actions.page.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
    const mod = { exports: {} };
    vm.runInNewContext(code, {
        document: window.document, window, module: mod, exports: mod.exports, AbortController, URL, URLSearchParams,
        location: { href: window.location.href, origin: window.location.origin, assign: (url) => navigations.push(url) },
        setTimeout: (callback) => { const id = ++timerId; timers.set(id, callback); return id; },
        clearTimeout: (id) => timers.delete(id),
        fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
        require: (name) => {
            assert.equal(name, 'vj/misc/Page');
            return { NamedPage: class { constructor(names, callback) { this.names = names; this.run = callback; } } };
        },
    });
    assert.deepEqual(Array.from(mod.exports.default.names), ['scratch_assignments', 'scratch_assignment']);
    mod.exports.default.run();
    const doc = window.document;
    return { dom, window, doc, requests, navigations, timers,
        button: doc.querySelector('[data-assignment-action]'),
        dialog: doc.querySelector('dialog'), confirm: doc.querySelector('[data-assignment-delete-confirm]'),
        cancel: [...doc.querySelectorAll('[data-assignment-delete-cancel]')].at(-1),
        status: doc.querySelector('[data-assignment-delete-status]'),
    };
}

describe('Scratch assignment audience and archived views', () => {
    it('gives teachers clear recipient scope and findable delete actions without exposing them to learners', (t) => {
        for (const isTeacher of [true, false]) {
            const dom = render('scratch_assignments.html', { isTeacher });
            t.after(() => dom.window.close());
            const doc = dom.window.document;
            assert.equal(!!doc.querySelector('[data-assignment-action=delete]'), isTeacher);
            assert.equal(!!doc.querySelector('[data-assignment-delete-dialog]'), isTeacher);
            assert.equal(!!doc.querySelector('.sc-assignment-list-tabs'), isTeacher);
            if (isTeacher) assert.match(doc.querySelector('.sc-assignment-audience-label').textContent, /指定 2 位学员/);
            else assert.equal(doc.querySelector('.sc-assignment-audience-label'), null);
        }
    });

    it('preserves the deleted filter while paging and shows only restore actions', (t) => {
        const dom = render('scratch_assignments.html', { showDeleted: true, numPages: 3,
            assignments: [{ ...assignment, deletedAt: '2026-10-18' }] });
        t.after(() => dom.window.close());
        const doc = dom.window.document;
        assert.equal(new URL(doc.querySelector('[data-next-page]').href).searchParams.get('status'), 'deleted');
        assert.match(doc.querySelector('.sc-assignment-list-tabs [aria-current=page]').textContent, /已删除/);
        assert(doc.querySelector('[data-assignment-action=restore]'));
        assert.equal(doc.querySelector('[data-assignment-action=delete]'), null);
        assert.match(doc.querySelector('.sc-assignment-archive-note').textContent, /原发送范围/);
        assert.match(doc.querySelector('.sc-list-item').textContent, /查看记录/);
    });

    it('keeps deleted assignment detail read only while retaining all submission records', (t) => {
        const dom = render('scratch_assignment.html', { assignment: { ...assignment, deletedAt: '2026-10-18' },
            submissions: [{ _id: 's1', owner: 42, revision: 1, createdAt: '2026-10-17' }] });
        t.after(() => dom.window.close());
        const doc = dom.window.document;
        assert.equal(doc.querySelector('a[href^="/scratch_assignment_edit"]'), null);
        assert(doc.querySelector('[data-assignment-action=restore]'));
        assert.equal(doc.querySelector('form'), null);
        assert.match(doc.querySelector('.sc-assignment-archive-note').textContent, /仅供查看/);
        assert.match(doc.querySelector('.sc-table tbody').textContent, /查看记录/);
        assert.doesNotMatch(doc.querySelector('.sc-table tbody').textContent, /批改 \/ 查看/);
    });

    it('does not offer teacher editing or owner uploading in works attached to deleted assignments', (t) => {
        for (const owner of [7, 42]) {
            const dom = render('scratch_work.html', { assignment: { ...assignment, deletedAt: '2026-10-18' },
                work: { _id: 'work', owner, assignmentId: 'task', title: '作品', currentFileId: 'file' } });
            t.after(() => dom.window.close());
            const doc = dom.window.document;
            assert.match(doc.body.textContent, /目前仅供查看和下载/);
            assert.doesNotMatch(doc.body.textContent, /代学员编辑|继续创作|上传并保存/);
            assert.equal(doc.querySelector('input[type=file]'), null);
            assert.match(doc.body.textContent, /运行作品|下载当前作品/);
        }
    });

    it('explains the empty deleted list and does not display delete controls in a reused list partial', (t) => {
        const empty = render('scratch_assignments.html', { assignments: [], showDeleted: true });
        const partial = render('partials/scratch_assignment_list.html');
        t.after(() => { empty.window.close(); partial.window.close(); });
        assert.match(empty.window.document.querySelector('.sc-empty').textContent, /没有已删除/);
        assert.equal(partial.window.document.querySelector('[data-assignment-action]'), null);
    });
});

describe('Scratch assignment delete and restore interaction', () => {
    it('does not delete before confirmation and restores focus after cancellation', (t) => {
        const h = actions(t);
        h.button.click();
        assert.equal(h.dialog.open, true);
        assert.equal(h.doc.activeElement, h.cancel);
        assert.match(h.dialog.textContent, /记录会保留/);
        assert.match(h.dialog.textContent, /小猫的方向挑战/);
        assert.equal(h.requests.length, 0);
        h.cancel.click();
        assert.equal(h.dialog.open, false);
        assert.equal(h.doc.activeElement, h.button);
        assert.equal(h.requests.length, 0);
    });

    it('posts a deletion only once, blocks dismissal while pending, then follows the server destination', async (t) => {
        const h = actions(t);
        h.button.click();
        h.confirm.click();
        h.confirm.click();
        assert.equal(h.requests.length, 1);
        const request = h.requests[0];
        assert.equal(request.url, 'https://class.test/scratch_assignment/task');
        assert.equal(request.options.method, 'POST');
        assert.equal(request.options.credentials, 'same-origin');
        assert.equal(request.options.body.get('operation'), 'delete');
        assert.equal(h.button.disabled, true);
        const escape = new h.window.Event('cancel', { cancelable: true });
        h.dialog.dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true);
        h.cancel.click();
        assert.equal(h.dialog.open, true);
        request.resolve({ ok: true, json: async () => ({ ok: true, url: '/scratch/assignments?status=deleted' }) });
        await tick();
        assert.deepEqual(h.navigations, ['https://class.test/scratch/assignments?status=deleted']);
        assert.equal(h.timers.size, 0);
    });

    it('keeps the assignment and dialog on failure and supports a deliberate retry', async (t) => {
        const h = actions(t);
        h.button.click();
        h.confirm.click();
        h.requests[0].resolve({ ok: false, json: async () => ({ error: { message: '请重试删除' } }) });
        await tick();
        assert.equal(h.dialog.open, true);
        assert.equal(h.confirm.disabled, false);
        assert.equal(h.button.disabled, false);
        assert.match(h.status.textContent, /请重试/);
        assert.equal(h.status.dataset.error, 'true');
        assert.equal(h.doc.querySelectorAll('.sc-list-item').length, 1);
        assert.equal(h.navigations.length, 0);
        h.confirm.click();
        assert.equal(h.requests.length, 2);
        h.requests[1].reject(new Error('offline'));
        await tick();
    });

    it('restores an archived assignment directly without changing its selected audience', async (t) => {
        const h = actions(t, { showDeleted: true, assignments: [{ ...assignment, deletedAt: '2026-10-18' }] });
        h.button.click();
        assert.equal(h.dialog.open, false);
        assert.equal(h.requests.length, 1);
        assert.deepEqual([...h.requests[0].options.body.entries()], [['operation', 'restore']]);
        assert.match(h.doc.querySelector('[data-assignment-action-status]').textContent, /正在恢复/);
        h.requests[0].resolve({ ok: true, json: async () => ({ ok: true, url: '/scratch/assignments/task' }) });
        await tick();
        assert.deepEqual(h.navigations, ['https://class.test/scratch/assignments/task']);
        assert.match(h.doc.querySelector('.sc-assignment-audience-label').textContent, /指定 2 位学员/);
    });

    it('renders names as text and rejects cross-origin action or response addresses', async (t) => {
        const h = actions(t, { assignments: [{ ...assignment, title: '<img src=x onerror=alert(1)>' }] });
        h.button.click();
        assert.equal(h.dialog.querySelector('img'), null);
        assert.match(h.doc.querySelector('[data-assignment-delete-name]').textContent, /<img/);
        h.button.dataset.assignmentUrl = 'https://foreign.test/task';
        h.confirm.click();
        await tick();
        assert.equal(h.requests.length, 0);
        assert.match(h.status.textContent, /地址无效/);
        h.button.dataset.assignmentUrl = '/scratch_assignment/task';
        h.confirm.click();
        h.requests[0].resolve({ ok: true, json: async () => ({ ok: true, url: 'https://foreign.test/destination' }) });
        await tick();
        assert.equal(h.navigations.length, 0);
        assert.match(h.status.textContent, /地址无效/);
    });
});
