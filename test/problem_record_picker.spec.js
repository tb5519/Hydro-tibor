const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const jqueryFactory = require('jquery');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const React = require('react');
const ReactDOM = require('react-dom/client');

const uiRoot = path.resolve(__dirname, '../packages/ui-default');
const compiled = esbuild.buildSync({
    entryPoints: [path.join(uiRoot, 'components/problem_record_picker.tsx')],
    write: false, bundle: true, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const rid = '6aa000000000000000000001';
const record = (overrides = {}) => ({
    rid, uid: 8, name: '小林', status: 1, score: 100, lang: 'py.py3', langName: 'Python 3',
    submittedAt: '2026-09-09T10:15:00.000Z', canImport: true,
    importUrl: `/p/P1000?fromRecord=${rid}`, ...overrides,
});
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
};

async function harness(options = {}) {
    const dom = new JSDOM(`<!doctype html><html><body>
      <a href="/record?pid=1" data-problem-record-picker="all">尝试: 14</a>
      <a href="/record?pid=1&status=1" data-problem-record-picker="accepted">已通过: 1</a>
    </body></html>`, { url: 'https://example.test/p/P1000', pretendToBeVisual: true });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window;
    global.document = dom.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const $ = jqueryFactory(dom.window);
    const calls = { get: [], dialogs: [], navigate: [] };
    class InfoDialog {
        constructor(config) {
            this.$dom = $('<div class="dialog"><div class="dialog__content"></div></div>');
            this.$dom.find('.dialog__content').append(config.$body);
            this.$dom.on('click', '[data-action="cancel"]', () => this.close());
            this.$dom.on('keyup', (event) => { if (event.key === 'Escape') this.close(); });
            calls.dialogs.push(this);
        }

        open() {
            $('body').append(this.$dom);
            return new Promise((resolve) => { this.resolve = resolve; });
        }

        close() {
            this.$dom.trigger('vjDomDialogHidden').remove();
            this.resolve?.('cancel');
        }
    }
    const mocks = {
        jquery: $,
        'react-dom/client': ReactDOM,
        'vj/components/dialog': { InfoDialog },
        'vj/constant/record': {
            STATUS: { STATUS_COMPILE_ERROR: 7 },
            STATUS_CODES: { 1: 'pass', 2: 'fail', 7: 'fail', 0: 'pending' },
            STATUS_SCRATCHPAD_SHORT_TEXTS: { 1: 'AC', 2: 'WA' },
            STATUS_TEXTS: { 0: 'Waiting' },
        },
        'vj/utils': {
            i18n: (text) => text,
            secureRandomString: () => 'fallback-token',
            request: { get: async (...args) => {
                calls.get.push(args);
                return options.get ? options.get(...args) : { records: [record()], nextCursor: null };
            } },
        },
    };
    const mod = { exports: {} };
    vm.runInNewContext(compiled, {
        module: mod, exports: mod.exports,
        require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id),
        document: dom.window.document, URL, setTimeout, clearTimeout,
        window: {
            location: { href: dom.window.location.href, origin: dom.window.location.origin, assign: (url) => calls.navigate.push(url) },
            crypto: { randomUUID: () => 'draft-token' },
        },
        UiContext: options.noPermission ? {} : { problemRecordPicker: { url: '/p/P1000/submissions', ownUrl: '/p/P1000' } },
    });
    mod.exports.bindProblemRecordPicker();
    const flush = () => React.act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    const click = async (selector) => {
        const element = dom.window.document.querySelector(selector);
        assert.ok(element, `Missing element: ${selector}`);
        await React.act(async () => { element.click(); });
        await flush();
    };
    const cleanup = async () => {
        await React.act(async () => { for (const dialog of calls.dialogs) if (dialog.$dom[0].isConnected) dialog.close(); });
        dom.window.close();
        global.window = previous.window;
        global.document = previous.document;
        global.IS_REACT_ACT_ENVIRONMENT = previous.act;
    };
    return { dom, $, calls, click, flush, cleanup };
}

describe('problem record picker', () => {
    it('loads all submissions with status, score, language and time without exposing student UID', async () => {
        const app = await harness();
        try {
            await app.click('[data-problem-record-picker="all"]');
            assert.equal(app.calls.get[0][1].accepted, false);
            const item = app.dom.window.document.querySelector('.problem-record-picker__record');
            assert.match(item.textContent, /小林/);
            assert.match(item.textContent, /Python 3/);
            assert.match(item.textContent, /AC/);
            assert.match(item.textContent, /100/);
            assert.equal(item.querySelector('time').dateTime, '2026-09-09T10:15:00.000Z');
            assert.equal(item.textContent.includes('UID'), false);
            assert.ok(app.dom.window.document.querySelector('[role="dialog"][aria-modal="true"]'));
        } finally { await app.cleanup(); }
    });

    it('starts with accepted-only filter and can switch to all submissions', async () => {
        const app = await harness();
        try {
            await app.click('[data-problem-record-picker="accepted"]');
            assert.equal(app.calls.get[0][1].accepted, true);
            await app.click('.problem-record-picker__filters button:first-child');
            assert.equal(app.calls.get[1][1].accepted, false);
        } finally { await app.cleanup(); }
    });

    it('imports a selected record into own answer draft while retaining its source parameters', async () => {
        const app = await harness({ get: async () => ({ records: [record({ importUrl: `/p/P1000?fromRecord=${rid}&lang=py.py3` })] }) });
        try {
            await app.click('[data-problem-record-picker="all"]');
            await app.click('.problem-record-picker__record');
            const target = new URL(app.calls.navigate[0]);
            assert.equal(target.pathname, '/p/P1000');
            assert.equal(target.searchParams.get('fromRecord'), rid);
            assert.equal(target.searchParams.get('lang'), 'py.py3');
            assert.equal(target.searchParams.get('draftImport'), 'draft-token');
            assert.equal(app.calls.get.length, 1);
        } finally { await app.cleanup(); }
    });

    it('keeps inaccessible source records disabled and never navigates to an external import URL', async () => {
        const app = await harness({ get: async () => ({ records: [
            record({ canImport: false }), record({ rid: 'external', importUrl: 'https://other.test/p/1' }),
        ] }) });
        try {
            await app.click('[data-problem-record-picker="all"]');
            assert.equal(app.dom.window.document.querySelector('.problem-record-picker__record').disabled, true);
            assert.match(app.dom.window.document.querySelector('.problem-record-picker__record').textContent, /暂无作答查看权限/);
            await app.click('.problem-record-picker__list li:last-child button');
            assert.deepEqual(app.calls.navigate, []);
        } finally { await app.cleanup(); }
    });

    it('appends cursor pages, deduplicates records and preserves already loaded rows on retry', async () => {
        let attempt = 0;
        const app = await harness({ get: async (_, params) => {
            if (!params.cursor) return { records: [record()], nextCursor: 'page-two' };
            if (++attempt === 1) throw new Error('Network unavailable');
            return { records: [record(), record({ rid: 'second', name: '小周', status: 2, score: 12.5 })], nextCursor: null };
        } });
        try {
            await app.click('[data-problem-record-picker="all"]');
            await app.click('.problem-record-picker__more');
            assert.equal(app.dom.window.document.querySelectorAll('.problem-record-picker__record').length, 1);
            assert.ok(app.dom.window.document.querySelector('[role="alert"]'));
            await app.click('.problem-record-picker__retry');
            assert.equal(app.calls.get[2][1].cursor, 'page-two');
            assert.equal(app.dom.window.document.querySelectorAll('.problem-record-picker__record').length, 2);
            assert.match(app.dom.window.document.querySelector('.problem-record-picker__list li:last-child').textContent, /WA12\.5/);
            assert.equal(app.dom.window.document.querySelector('.problem-record-picker__more'), null);
        } finally { await app.cleanup(); }
    });

    it('ignores stale filter responses and shows accepted empty state', async () => {
        const pending = deferred();
        const app = await harness({ get: async (_, params) => params.accepted ? { records: [], nextCursor: null } : pending.promise });
        try {
            await app.click('[data-problem-record-picker="all"]');
            assert.ok(app.dom.window.document.querySelector('[role="status"]'));
            await app.click('.problem-record-picker__filters button:last-child');
            assert.match(app.dom.window.document.querySelector('.problem-record-picker__state').textContent, /暂时还没有通过记录/);
            await React.act(async () => { pending.resolve({ records: [record()], nextCursor: null }); });
            await app.flush();
            assert.equal(app.dom.window.document.querySelectorAll('.problem-record-picker__record').length, 0);
        } finally { await app.cleanup(); }
    });

    it('closes with the X button, returns focus to the trigger and traps Tab within the dialog', async () => {
        const app = await harness();
        try {
            await app.click('[data-problem-record-picker="all"]');
            const close = app.dom.window.document.querySelector('.problem-record-picker__close');
            const row = app.dom.window.document.querySelector('.problem-record-picker__record');
            row.focus();
            app.$(row).trigger(app.$.Event('keydown', { key: 'Tab' }));
            assert.equal(app.dom.window.document.activeElement, close);
            app.$(close).trigger(app.$.Event('keydown', { key: 'Tab', shiftKey: true }));
            assert.equal(app.dom.window.document.activeElement, row);
            await app.click('.problem-record-picker__close');
            assert.equal(app.dom.window.document.querySelector('.dialog'), null);
            assert.equal(app.dom.window.document.activeElement.dataset.problemRecordPicker, 'all');
        } finally { await app.cleanup(); }
    });

    it('does not intercept or load records without permission configuration', async () => {
        const app = await harness({ noPermission: true });
        try {
            const event = app.$.Event('click');
            app.$('[data-problem-record-picker="all"]').triggerHandler(event);
            app.$(app.dom.window.document).trigger(app.$.Event('click', { target: app.dom.window.document.querySelector('a') }));
            assert.equal(app.calls.dialogs.length, 0);
            assert.equal(app.calls.get.length, 0);
        } finally { await app.cleanup(); }
    });

    it('renders plain noninteractive attempt and accepted counts for students', () => {
        const source = fs.readFileSync(path.join(uiRoot, 'templates/problem_detail.html'), 'utf8');
        const start = source.indexOf('{% if UiContext.problemRecordPicker %}');
        const section = source.slice(start, source.indexOf('{% endif %}', start) + '{% endif %}'.length);
        const env = new nunjucks.Environment(null, { autoescape: true });
        const data = { UiContext: {}, pdoc: { docId: 3, nSubmit: 14, nAccept: 1 }, _: (text) => text, url: () => '/record' };
        const student = new JSDOM(env.renderString(section, data));
        assert.equal(student.window.document.querySelectorAll('a, [tabindex], .interactive').length, 0);
        assert.equal(student.window.document.querySelectorAll('span.problem__tag-item').length, 2);
        const teacher = new JSDOM(env.renderString(section, { ...data, UiContext: { problemRecordPicker: { url: '/picker' } } }));
        assert.equal(teacher.window.document.querySelectorAll('a[data-problem-record-picker]').length, 2);
        student.window.close();
        teacher.window.close();
    });
});
