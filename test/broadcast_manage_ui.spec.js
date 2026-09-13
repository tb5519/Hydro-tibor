const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');

const uiRoot = path.resolve(__dirname, '../packages/ui-default');
const template = fs.readFileSync(path.join(uiRoot, 'templates/broadcast_manage.html'), 'utf8');
const code = esbuild.buildSync({
    entryPoints: [path.join(uiRoot, 'pages/broadcast_manage.page.ts')], write: false,
    bundle: true, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const env = new nunjucks.Environment({
    getSource(name) {
        return { src: name === 'broadcast_manage.html' ? template : name === 'manage_base.html'
            ? '<html data-page="{{ page_name }}"><body>{% block manage_content %}{% endblock %}</body></html>'
            : '<html data-page="{{ page_name }}"><body>{% block domain_content %}{% endblock %}</body></html>', path: name };
    },
}, { autoescape: true });
const original = { title: '本周课程安排', content: '<p>周五一起学习算法。</p>', revision: 'v1', enabled: true, updatedAt: '2026-09-13T08:00:00Z' };
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(options = {}) {
    const broadcast = { ...original, ...options.broadcast };
    const scope = options.scope || 'global';
    const route = scope === 'global' ? 'manage_broadcast' : 'domain_broadcast';
    const receipts = { revision: broadcast.revision, total: 0, page: 1, pages: 1, rows: [], ...options.receipts };
    const dom = new JSDOM(env.render('broadcast_manage.html', {
        broadcast, broadcastScope: scope, broadcastBaseTemplate: scope === 'global' ? 'manage_base.html' : 'domain_base.html',
        broadcastScopeLabel: scope === 'global' ? '所有域' : '当前教学域', manageRoute: route,
        broadcastReceipts: receipts,
        page_name: 'broadcast_manage', _: (value) => value, url: (value) => `/${value}`,
    }) + '<a id="leave" href="/home">返回首页</a>', { url: `https://example.test/${route}` });
    const requests = [];
    const commands = [];
    let post = (url, data) => Promise.resolve(data.operation === 'receipts' ? { receipts: { ...receipts, revision: data.revision } } : data.operation === 'preview'
        ? { title: data.title, content: '<p>服务器清理后的正文</p>' }
        : { broadcast: { ...broadcast, ...data, revision: 'v2', enabled: data.operation === 'publish' } });
    const pageModule = { exports: {} };
    const dependencies = {
        'vj/misc/Page': { NamedPage: class { constructor(names, callback) { this.names = names; this.callback = callback; } } },
        'vj/utils': { request: { post: (url, data) => {
            requests.push({ url, data: JSON.parse(JSON.stringify(data)) });
            return post(url, data);
        } } },
    };
    dom.window.document.execCommand = (...args) => { commands.push(args); return true; };
    dom.window.document.queryCommandState = () => true;
    dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
    dom.window.HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };
    dom.window.confirm = () => false;
    vm.runInNewContext(code, {
        module: pageModule, exports: pageModule.exports, window: dom.window, document: dom.window.document,
        URL: dom.window.URL, require: (name) => dependencies[name] || require(name),
    });
    // The production loader matches the rendered page name before invoking the callback.
    if (pageModule.exports.default.names.includes(dom.window.document.documentElement.dataset.page)) {
        pageModule.exports.default.callback();
    }
    const query = (selector) => dom.window.document.querySelector(selector);
    const input = (selector, value) => {
        const element = query(selector);
        if ('value' in element) element.value = value;
        else element.innerHTML = value;
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const submit = () => query('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    return {
        dom, requests, commands, query, input, submit, page: pageModule.exports.default,
        setPost: (handler) => { post = handler; }, close: () => dom.window.close(),
        bind: pageModule.exports.bindBroadcastEditor,
    };
}

describe('broadcast teacher editor', () => {
    it('renders confirmation names safely with useful empty and unpublished states', (t) => {
        const h = fixture({ receipts: { total: 1, rows: [{ uid: 24, name: '<img src=x onerror=alert(1)>', uname: 'student24', acknowledgedAt: '2026-09-13T08:15:00Z' }] } });
        const empty = fixture({ broadcast: { revision: '', title: '', content: '', enabled: false } });
        t.after(h.close);
        t.after(empty.close);
        assert.equal(h.query('[data-broadcast-receipts-total]').textContent, '1');
        assert.match(h.query('[data-broadcast-receipts-rows]').textContent, /<img src=x onerror=alert\(1\)>/);
        assert.equal(h.query('[data-broadcast-receipts-rows] img'), null);
        assert.match(h.query('[data-broadcast-confirmed-at]').textContent, /2026/);
        assert.match(h.query('[data-broadcast-receipts-rows]').textContent, /student24 · UID 24/);
        assert.equal(h.query('[data-broadcast-receipts-empty]').hidden, true);
        assert.equal(empty.query('[data-broadcast-receipts-refresh]').disabled, true);
        assert.match(empty.query('[data-broadcast-receipts-empty]').textContent, /发布广播后/);
    });

    it('paginates confirmation rows without losing teacher drafts or issuing duplicate requests', async (t) => {
        const h = fixture({ receipts: { total: 21, page: 1, pages: 2, rows: [{ uid: 24, name: '小明', uname: 'student24', acknowledgedAt: original.updatedAt }] } });
        t.after(h.close);
        let resolve;
        h.setPost(() => new Promise((done) => { resolve = done; }));
        h.input('[name=title]', '老师正在编辑的标题');
        h.input('[data-broadcast-editor]', '<p>需要保留的草稿</p>');
        h.query('[data-broadcast-receipts-next]').click();
        h.query('[data-broadcast-receipts-next]').click();
        assert.deepEqual(h.requests.map((request) => request.data), [{ operation: 'receipts', revision: 'v1', page: 2 }]);
        assert.equal(h.query('[data-broadcast-receipts]').getAttribute('aria-busy'), 'true');
        resolve({ receipts: { revision: 'v1', total: 21, page: 2, pages: 2, rows: [{ uid: 25, name: '<script>alert(1)</script>', uname: 'student25', acknowledgedAt: original.updatedAt }] } });
        await flush();
        assert.equal(h.query('[data-broadcast-receipts-page]').textContent, '第 2 / 2 页');
        assert.equal(h.query('[data-broadcast-receipts-next]').disabled, true);
        assert.equal(h.query('[data-broadcast-receipts-prev]').disabled, false);
        assert.match(h.query('[data-broadcast-receipts-rows]').textContent, /<script>alert\(1\)<\/script>/);
        assert.equal(h.query('[data-broadcast-receipts-rows] script'), null);
        assert.equal(h.query('[name=title]').value, '老师正在编辑的标题');
        assert.equal(h.query('[data-broadcast-editor]').innerHTML, '<p>需要保留的草稿</p>');
        assert.match(h.query('[data-broadcast-draft-state]').textContent, /未发布/);
    });

    it('refreshes statistics on publish and discards in-flight confirmations of the old revision', async (t) => {
        const h = fixture({ receipts: { total: 1, rows: [{ uid: 24, name: '旧版本已确认的同学', uname: 'student24', acknowledgedAt: original.updatedAt }] } });
        t.after(h.close);
        let oldResolve;
        let newResolve;
        h.setPost((url, data) => {
            if (data.operation === 'publish') return Promise.resolve({ broadcast: { ...original, title: data.title, revision: 'v2' } });
            return new Promise((resolve) => {
                if (data.revision === 'v1') oldResolve = resolve;
                else newResolve = resolve;
            });
        });
        h.query('[data-broadcast-receipts-refresh]').click();
        h.input('[name=title]', '新版本消息');
        h.submit();
        await flush();
        assert.equal(h.query('[name=revision]').value, 'v2');
        assert.equal(h.query('[data-broadcast-receipts-total]').textContent, '—');
        oldResolve({ receipts: { revision: 'v1', total: 99, page: 1, pages: 5, rows: [{ uid: 24, name: '过时名单', uname: '', acknowledgedAt: original.updatedAt }] } });
        await flush();
        assert.equal(h.query('[data-broadcast-receipts-total]').textContent, '—');
        assert.doesNotMatch(h.query('[data-broadcast-receipts-rows]').textContent, /过时名单|旧版本/);
        newResolve({ receipts: { revision: 'v2', total: 0, page: 1, pages: 1, rows: [] } });
        await flush();
        assert.equal(h.query('[data-broadcast-receipts-total]').textContent, '0');
        assert.equal(h.query('[data-broadcast-receipts-refresh]').disabled, false);
        assert.match(h.query('[data-broadcast-receipts-empty]').textContent, /还没有同学/);
        assert.equal(h.query('[data-broadcast-publish]').disabled, true);
    });

    it('keeps existing statistics and drafts on refresh failure and allows retry', async (t) => {
        const h = fixture({ receipts: { total: 3 } });
        t.after(h.close);
        h.input('[name=title]', '尚未发布的标题');
        h.setPost(() => Promise.reject(new Error('广播已被其他老师更新，请刷新页面后再试。')));
        h.query('[data-broadcast-receipts-refresh]').click();
        await flush();
        assert.equal(h.query('[data-broadcast-receipts-total]').textContent, '3');
        assert.equal(h.query('[name=title]').value, '尚未发布的标题');
        assert.match(h.query('[data-broadcast-receipts-message]').textContent, /其他老师更新.*编辑内容不会受影响/);
        assert.equal(h.query('[data-broadcast-receipts-refresh]').disabled, false);
        assert.equal(h.query('[data-broadcast-message]').hidden, true);
    });

    it('renders the proper management base and distinguishes global and domain audiences', (t) => {
        const global = fixture();
        const domain = fixture({ scope: 'domain', broadcast: { title: '<img onerror="alert(1)" src=x>' } });
        t.after(global.close);
        t.after(domain.close);
        assert.deepEqual(Array.from(global.page.names), ['manage_broadcast', 'domain_broadcast']);
        assert.equal(global.dom.window.document.documentElement.dataset.page, 'manage_broadcast');
        assert.equal(domain.dom.window.document.documentElement.dataset.page, 'domain_broadcast');
        assert.equal(global.query('[data-broadcast-admin]').dataset.bound, 'true');
        assert.equal(domain.query('[data-broadcast-admin]').dataset.bound, 'true');
        assert.equal(global.query('form').action, 'https://example.test/manage_broadcast');
        assert.equal(domain.query('form').action, 'https://example.test/domain_broadcast');
        assert.match(global.query('.broadcast-admin__hero').textContent, /所有域/);
        assert.match(domain.query('.broadcast-admin__hero').textContent, /本域/);
        assert.equal(domain.query('img[onerror]'), null);
        assert.equal(domain.query('[name=title]').value, '<img onerror="alert(1)" src=x>');
        assert.equal(global.query('[data-broadcast-publish]').disabled, true);
        assert.equal(global.query('[data-broadcast-editor]').getAttribute('role'), 'textbox');
        global.bind();
        assert.equal(global.query('[data-broadcast-admin]').dataset.bound, 'true');
    });

    it('rejects empty rich content before sending any publication request', (t) => {
        const h = fixture();
        t.after(h.close);
        h.input('[data-broadcast-editor]', '<p><br></p>');
        h.submit();
        assert.equal(h.requests.length, 0);
        assert.match(h.query('[data-broadcast-message]').textContent, /正文还是空的/);
        assert.equal(h.query('[data-broadcast-editor]').getAttribute('aria-invalid'), 'true');
    });

    it('posts the expected revision once, disables duplicate actions and replaces the draft with saved safe HTML', async (t) => {
        const h = fixture();
        t.after(h.close);
        let resolve;
        h.setPost(() => new Promise((done) => { resolve = done; }));
        h.input('[name=title]', '新的课程安排');
        h.input('[data-broadcast-editor]', '<p><b>周四上课</b></p>');
        h.submit();
        h.submit();
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].data.revision, 'v1');
        assert.equal(h.requests[0].data.operation, 'publish');
        assert.equal(h.query('[data-broadcast-preview]').disabled, true);
        assert.equal(h.query('[data-broadcast-editor]').contentEditable, 'false');
        resolve({ broadcast: { ...original, revision: 'v2', title: '新的课程安排', content: '<p><strong>周四上课</strong></p>' } });
        await flush();
        assert.equal(h.query('[name=revision]').value, 'v2');
        assert.equal(h.query('[data-broadcast-editor]').innerHTML, '<p><strong>周四上课</strong></p>');
        assert.equal(h.query('[data-broadcast-publish]').disabled, true);
        assert.match(h.query('[data-broadcast-draft-state]').textContent, /已保存/);
        const leave = new h.dom.window.Event('beforeunload', { cancelable: true });
        h.dom.window.dispatchEvent(leave);
        assert.equal(leave.defaultPrevented, false);
    });

    it('preserves an unsaved draft and old revision after a concurrent update error', async (t) => {
        const h = fixture();
        t.after(h.close);
        h.setPost(() => Promise.reject(new Error('广播已被其他老师更新，请刷新页面后再试。')));
        h.input('[data-broadcast-editor]', '<h2>未保存的重要内容</h2>');
        h.submit();
        await flush();
        assert.equal(h.query('[name=revision]').value, 'v1');
        assert.equal(h.query('[data-broadcast-editor]').innerHTML, '<h2>未保存的重要内容</h2>');
        assert.match(h.query('[data-broadcast-message]').textContent, /其他老师更新.*内容已保留/);
        assert.equal(h.query('[data-broadcast-publish]').disabled, false);
        assert.equal(h.query('[data-broadcast-message]').getAttribute('role'), 'alert');
        const leave = new h.dom.window.Event('beforeunload', { cancelable: true });
        h.dom.window.dispatchEvent(leave);
        assert.equal(leave.defaultPrevented, true);
    });

    it('previews the server-sanitized content without publishing or clearing unsaved changes', async (t) => {
        const h = fixture();
        t.after(h.close);
        h.input('[data-broadcast-editor]', '<p>需要预览的正文</p>');
        h.query('[data-broadcast-preview]').click();
        await flush();
        assert.equal(h.requests[0].data.operation, 'preview');
        assert.equal(h.query('[data-broadcast-preview-content]').innerHTML, '<p>服务器清理后的正文</p>');
        assert.equal(h.query('[data-broadcast-preview-dialog]').hasAttribute('open'), true);
        assert.match(h.query('[data-broadcast-draft-state]').textContent, /未发布/);
        assert.equal(h.query('[name=revision]').value, 'v1');
        h.query('[data-broadcast-preview-close]').click();
        assert.equal(h.query('[data-broadcast-preview-dialog]').hasAttribute('open'), false);
        assert.equal(h.requests.length, 1);
    });

    it('requires confirmation to stop a broadcast and retains local draft edits afterward', async (t) => {
        const h = fixture();
        t.after(h.close);
        h.input('[data-broadcast-editor]', '<p>还没有发布的调整</p>');
        h.query('[data-broadcast-disable]').click();
        assert.equal(h.requests.length, 0);
        assert.equal(h.query('[data-broadcast-disable-confirm]').hidden, false);
        h.query('[data-broadcast-disable-cancel]').click();
        assert.equal(h.requests.length, 0);
        h.query('[data-broadcast-disable]').click();
        h.query('[data-broadcast-disable-apply]').click();
        await flush();
        assert.deepEqual(h.requests[0].data, { operation: 'disable', revision: 'v1' });
        assert.equal(h.query('[data-broadcast-pause]').hidden, true);
        assert.equal(h.query('[data-broadcast-editor]').innerHTML, '<p>还没有发布的调整</p>');
        assert.match(h.query('[data-broadcast-publish]').textContent, /重新发布/);
        assert.match(h.query('[data-broadcast-draft-state]').textContent, /未发布/);
    });

    it('keeps clipboard markup out of the editor and rejects unsafe link schemes', (t) => {
        const h = fixture();
        t.after(h.close);
        const paste = new h.dom.window.Event('paste', { cancelable: true });
        Object.defineProperty(paste, 'clipboardData', { value: { getData: (type) => {
            assert.equal(type, 'text/plain');
            return '粘贴的课程安排';
        } } });
        h.query('[data-broadcast-editor]').dispatchEvent(paste);
        assert.equal(paste.defaultPrevented, true);
        assert.deepEqual(h.commands[0], ['insertText', false, '粘贴的课程安排']);
        h.query('[data-editor-link]').click();
        h.input('#broadcast-link-url', 'javascript:alert(1)');
        h.query('[data-editor-link-apply]').click();
        assert.equal(h.commands.length, 1);
        assert.match(h.query('#broadcast-link-url').validationMessage, /https/);
        h.input('#broadcast-link-url', 'https://example.test/course');
        h.query('[data-editor-link-apply]').click();
        assert.equal(h.query('#broadcast-link-panel').hidden, true);
        assert.equal(h.commands.length, 2);
        assert.equal(h.query('#broadcast-link-url').value, '');
        h.query('[data-editor-link]').click();
        h.input('#broadcast-link-url', 'unfinished url');
        h.query('[data-editor-link-cancel]').click();
        assert.equal(h.query('#broadcast-link-url').checkValidity(), true);
    });
});
