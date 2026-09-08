const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const postcss = require('postcss');
const stylus = require('stylus');

const root = path.resolve(__dirname, '..');

class LayoutLoader extends nunjucks.Loader {
    getSource(name) {
        if (name !== 'layout/basic.html') return null;
        return {
            src: '<!doctype html><html><body>{% block content %}{% endblock %}</body></html>',
            path: 'test/layout/basic.html',
            noCache: true,
        };
    }
}

function environment(plugin = false) {
    const templates = [path.join(root, 'packages/ui-default/templates')];
    if (plugin) templates.unshift(path.join(root, 'addons/badge-for-hydrooj/templates'));
    const env = new nunjucks.Environment([new LayoutLoader(), new nunjucks.FileSystemLoader(templates)], {
        autoescape: true,
        throwOnUndefined: true,
    });
    env.addGlobal('_', (value) => value);
    env.addGlobal('typeof', (value) => typeof value);
    env.addGlobal('set', (target, key, value) => {
        target[key] = value;
        return '';
    });
    env.addGlobal('eval', (source) => {
        assert.equal(source, 'rdoc=>rdoc._id.toString()');
        return (rdoc) => rdoc._id.toString();
    });
    env.addGlobal('datetimeSpan', () => '<time datetime="2026-09-08T12:00:00Z">刚刚</time>');
    env.addGlobal('size', (value) => `${value / 1024} KiB`);
    env.addGlobal('url', (route, options = {}) => {
        const routes = {
            record_main: '/d/python/record',
            record_detail: `/d/python/record/${encodeURIComponent(options.rid)}`,
            problem_detail: `/d/python/p/${encodeURIComponent(options.pid)}`,
            problem_main: '/d/python/p',
            user_detail: `/d/python/user/${encodeURIComponent(options.uid)}`,
            contest_detail: `/d/python/contest/${options.tid}`,
            homework_detail: `/d/python/homework/${options.tid}`,
        };
        const query = new URLSearchParams(options.query || {}).toString();
        return `${routes[route]}${query ? `?${query}` : ''}`;
    });
    return env;
}

function oid(value) {
    return { toString: () => value, toHexString: () => value };
}

function fixture(overrides = {}) {
    return {
        UiContext: { domainId: 'python' },
        handler: {
            args: { domainId: 'python' },
            entryDomainId: '',
            contestEntryQuery: {},
            user: { hasPerm: () => false, own: () => false },
        },
        canManageRecords: true,
        recordListPageSize: 25,
        rdocs: [{ _id: 'rec-1', domainId: 'python', uid: 7, pid: 1001, files: {}, lang: 'py', status: 1, score: 100, time: 42, memory: 2048 }],
        udict: { 7: { _id: 7, uname: 'student-seven', level: 0 } },
        pdict: { 1001: { docId: 1001, pid: 'P1001', title: '求两个数的和', tag: [] } },
        model: {
            builtin: { STATUS_CODES: { 0: 'pending', 1: 'pass' }, STATUS_TEXTS: { 0: 'Waiting', 1: 'Accepted' } },
            setting: { langs: { py: { display: 'Python 3' } } },
        },
        perm: { PERM_REJUDGE: 'rejudge', PERM_VIEW_PROBLEM_HIDDEN: 'hidden', PERM_VIEW_USER_PRIVATE_INFO: 'private' },
        STATUS: { STATUS_JUDGING: 20, STATUS_TIME_LIMIT_EXCEEDED: 2, STATUS_MEMORY_LIMIT_EXCEEDED: 3, STATUS_OUTPUT_LIMIT_EXCEEDED: 4 },
        utils: {
            status: { STATUS_TEXTS: { 0: 'Waiting', 1: 'Accepted' }, getScoreColor: () => '#00aa00' },
            // Match the application's truthy-value helper to prove explicit string "0" survives.
            buildQueryString: (query) => Object.entries(query).filter(([, value]) => value)
                .map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&'),
        },
        tdoc: null,
        homeworkTdocs: {},
        statistics: null,
        filterUidOrName: '',
        filterPid: '',
        filterTid: '',
        filterLang: '',
        filterStatus: undefined,
        filterIncludePretest: false,
        all: false,
        allDomain: false,
        page: 1,
        ...overrides,
    };
}

function render(overrides, plugin) {
    const context = fixture(overrides);
    const html = environment(plugin).render('record_main.html', context);
    return { context, document: new JSDOM(html, { url: 'http://localhost/d/python/record' }).window.document };
}

describe('record list presentation', () => {
    it('gives students a clean self view with no filter controls but unchanged live row structure', () => {
        const { context, document } = render({ canManageRecords: false, filterUidOrName: '7' });
        assert.equal(document.querySelector('.record-list__heading h1').textContent, '评测记录');
        assert.equal(document.querySelector('.record-list__scope').textContent, '我的提交');
        assert.ok(document.querySelector('.record-list--self'));
        assert.equal(document.querySelectorAll('.record-list__filters, input, select').length, 0);
        const row = document.querySelector('.record_main__table tbody tr');
        assert.equal(row.dataset.rid, 'rec-1');
        assert.equal(row.dataset.recordStatus, '1');
        assert.equal(row.dataset.recordLang, 'py');
        assert.equal(row.children.length, 7);
        assert.ok(row.querySelector('.col--submit-by'));
        assert.equal(context.UiContext.recordListPageSize, 25);
        assert.deepEqual(context.UiContext.rids, ['rec-1']);
    });

    it('shows managers a compact filter bar, with empty user selection meaning all students', () => {
        const { document } = render();
        const form = document.querySelector('.record-list__filters');
        assert.equal(form.method, 'get');
        assert.equal(document.querySelector('.record-list__scope').textContent, '全部学员');
        assert.equal(form.querySelector('[name="uidOrName"]').value, '');
        assert.deepEqual([...form.querySelectorAll('input, select')].map((node) => node.name), [
            'uidOrName', 'pid', 'tid', 'lang', 'status', 'includePretest',
        ]);
        assert.equal(form.querySelector('[name="includePretest"]').value, '0');
        assert.equal(form.querySelector('button[type="submit"]').textContent.trim(), '筛选');
    });

    it('keeps zero-valued status/pretest filters, encoded names, pagination and entry domain context', () => {
        const original = fixture({
            filterStatus: 0, filterUidOrName: '孩子 & A', filterLang: 'py+3', filterPid: 'P1&A',
            filterTid: oid('contest-1'), all: true, allDomain: true, page: 3,
        });
        original.handler.entryDomainId = 'cpp';
        original.handler.contestEntryContext = {};
        original.handler.contestEntryQuery = { entryDomainId: 'cpp' };
        const { context, document } = render(original);
        assert.equal(document.querySelector('[name="status"]').value, '0');
        assert.equal(document.querySelector('[name="includePretest"]').value, '0');
        assert.equal(document.querySelector('[name="entryDomainId"]').value, 'cpp');
        for (const [selector, page] of [['.next', '4'], ['.previous', '2']]) {
            const query = new URL(document.querySelector(`.record-list__pagination ${selector}`).href).searchParams;
            assert.equal(query.get('page'), page);
            assert.equal(query.get('status'), '0');
            assert.equal(query.get('includePretest'), '0');
            assert.equal(query.get('entryDomainId'), 'cpp');
            assert.equal(query.get('uidOrName'), '孩子 & A');
            assert.equal(query.get('lang'), 'py+3');
            assert.equal(query.get('pid'), 'P1&A');
            assert.equal(query.get('all'), '1');
            assert.equal(query.get('allDomain'), '1');
        }
        assert.ok(context.UiContext.socketUrl.startsWith('d/python/record-conn?'));
        const socketQuery = new URL(context.UiContext.socketUrl, 'http://localhost/').searchParams;
        assert.equal(socketQuery.get('status'), '0');
        assert.equal(socketQuery.get('includePretest'), '0');
        assert.equal(socketQuery.get('uidOrName'), '孩子 & A');
        assert.equal(socketQuery.get('lang'), 'py+3');
        assert.equal(socketQuery.get('entryDomainId'), 'cpp');
        assert.equal(socketQuery.has('page'), false);
    });

    it('retains an empty table and tbody for the first WebSocket insertion and offers a previous page', () => {
        const { document } = render({ canManageRecords: false, rdocs: [], page: 2 });
        assert.ok(document.querySelector('.record-list__table-wrap').hidden);
        assert.ok(document.querySelector('.record_main__table tbody'));
        assert.equal(document.querySelectorAll('.record_main__table tbody tr').length, 0);
        assert.equal(document.querySelector('.record-list__empty').hidden, false);
        assert.match(document.querySelector('.record-list__empty').textContent, /提交后/);
        assert.ok(document.querySelector('.record-list__pagination .previous'));
        assert.equal(document.querySelector('.record-list__pagination .next'), null);
        const populated = render().document;
        assert.equal(populated.querySelector('.record-list__table-wrap').hidden, false);
        assert.equal(populated.querySelector('.record-list__empty').hidden, true);
    });

    it('preserves record details, problem/user links, runtime, memory and current language for both user component variants', () => {
        for (const plugin of [false, true]) {
            const { document } = render(undefined, plugin);
            const row = document.querySelector('tr[data-rid="rec-1"]');
            assert.equal(row.querySelector('.record-status--text').getAttribute('href'), '/d/python/record/rec-1');
            assert.match(row.querySelector('.record-status--text').textContent, /100\s+Accepted/);
            assert.equal(row.querySelector('.col--problem a').getAttribute('href'), '/d/python/p/P1001');
            assert.equal(row.querySelector('.user-profile-name').getAttribute('href'), '/d/python/user/7');
            assert.equal(row.querySelector('.col--time').textContent, '42ms');
            assert.equal(row.querySelector('.col--memory').textContent, '2 KiB');
            assert.equal(row.querySelector('.col--lang').textContent, 'Python 3');
            assert.ok(row.querySelector('.col--submit-at time'));
        }
    });

    it('keeps manager rejudge/cancel operations and original form actions without changing their availability', () => {
        const original = fixture();
        original.handler.user.hasPerm = (permission) => permission === 'rejudge';
        const { document } = render(original);
        const form = document.querySelector('form.form--inline');
        assert.equal(form.method, 'post');
        assert.equal(form.getAttribute('action'), '/d/python/record/rec-1');
        assert.equal(form.querySelector('[name="operation"][value="rejudge"]').type, 'submit');
        assert.equal(form.querySelector('[name="operation"][value="cancel"]').type, 'submit');
        assert.equal(render().document.querySelector('form.form--inline'), null);
    });

    it('preserves homework/contest links and does not discard the entry domain when clearing filters', () => {
        const original = fixture({ filterTid: oid('homework-1') });
        original.tdoc = { docId: 'homework-1', title: '循环练习', rule: 'homework' };
        original.rdocs[0].contest = oid('homework-1');
        original.handler.entryDomainId = 'cpp';
        original.handler.contestEntryQuery = { entryDomainId: 'cpp' };
        const { document } = render(original);
        assert.equal(document.querySelector('.record-list__context').textContent, '作业 · 循环练习');
        assert.equal(new URL(document.querySelector('.record-list__context').href).searchParams.get('entryDomainId'), 'cpp');
        const resetQuery = new URL(document.querySelector('.record-list__reset').href).searchParams;
        assert.equal(resetQuery.get('tid'), 'homework-1');
        assert.equal(resetQuery.get('entryDomainId'), 'cpp');
        assert.equal(new URL(document.querySelector('.col--problem a').href).searchParams.get('tid'), 'homework-1');
    });

    it('escapes row data attributes, problem titles and filter values', () => {
        const original = fixture({ filterUidOrName: '"><img src=x onerror=bad()>' });
        original.pdict[1001].title = '<script>bad()</script>';
        original.rdocs[0].lang = 'py" onclick="bad()';
        original.model.setting.langs[original.rdocs[0].lang] = { display: 'Custom language' };
        const { document } = render(original);
        assert.equal(document.querySelectorAll('script, img, [onclick], [onerror]').length, 0);
        assert.equal(document.querySelector('[name="uidOrName"]').value, original.filterUidOrName);
        assert.equal(document.querySelector('tr[data-rid]').dataset.recordLang, original.rdocs[0].lang);
        assert.match(document.querySelector('.col--problem-name').textContent, /<script>bad\(\)<\/script>/);
    });

    it('keeps styling page-scoped, light and responsive without hiding record data on mobile', () => {
        const style = fs.readFileSync(path.join(root, 'packages/ui-default/pages/record_main.page.styl'), 'utf8');
        assert.ok(style.startsWith('.page--record_main\n'));
        assert.match(style, /\.record-list--self[\s\S]*?\.col--submit-by\n\s+display: none/);
        assert.match(style, /\.record-list__table-wrap\n\s+overflow-x: auto/);
        assert.match(style, /\.record-list \[hidden\]\n\s+display: none !important/);
        assert.match(style, /\.form--inline[\s\S]*?font-size: 0/);
        assert.doesNotMatch(style, /url\(|animation:|@keyframes/);
        const mobile = style.slice(style.lastIndexOf('+mobile()'));
        assert.doesNotMatch(mobile, /\.col--time|\.col--memory|\.col--lang/);
    });

    it('aligns rendered autocomplete fields with normal inputs and overrides component inline spacing', () => {
        const style = fs.readFileSync(path.join(root, 'packages/ui-default/pages/record_main.page.styl'), 'utf8');
        const rem = fs.readFileSync(path.join(root, 'packages/ui-default/common/rem.inc.styl'), 'utf8');
        const css = postcss.parse(stylus.render(`$font-size = 16px\n${rem}\nmobile()\n  @media (max-width: 640px)\n    {block}\n${style}`));
        const rules = new Map();
        css.walkRules((rule) => {
            for (const selector of rule.selectors) {
                rules.set(selector.trim(), new Map(rule.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node])));
            }
        });
        const prefix = '.page--record_main .record-list__field ';
        const container = rules.get(`${prefix}.autocomplete-container`);
        assert.equal(container.get('display').value, 'block');
        assert.equal(container.get('display').important, true);
        assert.equal(container.get('margin').value, '0');
        assert.equal(container.get('margin').important, true);
        const wrapper = rules.get(`${prefix}.autocomplete-wrapper`);
        const input = rules.get(`${prefix}.autocomplete-wrapper input`);
        const textbox = rules.get(`${prefix}.textbox`);
        assert.equal(wrapper.get('height').value, textbox.get('height').value);
        assert.equal(wrapper.get('height').important, true);
        assert.equal(wrapper.get('border-radius').value, textbox.get('border-radius').value);
        assert.equal(wrapper.get('box-sizing').value, 'border-box');
        assert.equal(wrapper.get('padding').value, '0');
        assert.equal(input.get('height').value, '100%');
        assert.equal(input.get('font-size').value, textbox.get('font-size').value);
        assert.equal(input.get('padding').value, textbox.get('padding').value);
        assert.ok(rules.has(`${prefix}.autocomplete-wrapper.focused`));
        assert.ok(rules.has(`${prefix}.autocomplete-wrapper:focus-within`));
    });
});
