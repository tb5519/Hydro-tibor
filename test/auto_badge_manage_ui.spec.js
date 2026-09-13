const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');
const nunjucks = require('nunjucks');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'addons/badge-for-hydrooj/templates/partials/auto_badge_manage.html'), 'utf8');
const frontend = ts.transpileModule(fs.readFileSync(path.join(root, 'packages/ui-default/pages/auto_badge_manage.page.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const env = new nunjucks.Environment(null, { autoescape: true });

const badge = {
    key: 'opaque/record+1', uid: 12, userName: '君豪', userUrl: '/user/12', userAvatar: '/avatar/12.png',
    badgeId: 6, badgeName: '嫦娥奔月', badgeShort: '☾ 嫦娥奔月', backgroundColor: '#264d42', fontColor: '#f7dfa2',
    sourcesText: '积分抽奖', grantedAtText: '2026-09-13 10:00', expiresAtText: '2026-09-14 10:00',
    expiresAtInput: '2026-09-14T10:00', permanent: false, status: 'expiring', statusText: '即将到期', manualOverlap: false,
};

function fixture(overrides = {}) {
    const dom = new JSDOM(env.renderString(template, {
        autoBadgeRows: [badge], autoBadgeTotal: 1, autoBadgePage: 1, autoBadgePageCount: 1,
        autoBadgeQuery: '', autoBadgeStatus: 'active', autoBadgeTimezone: 'Asia/Shanghai', page: 2, ...overrides,
    }), { url: 'https://example.test/domain/badge?page=2&autoStatus=active', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    const $ = require('jquery')(dom.window);
    const dialogs = [];
    const requests = [];
    const notifications = [];
    let post = () => Promise.resolve({ ok: true });
    class ActionDialog {
        constructor(options) {
            this.options = options;
            this.$dom = $('<div class="dialog">').append($('<div class="dialog__content">')
                .append($('<div class="dialog__body">').append(options.$body))
                .append($('<div class="dialog__action">').append(options.$action)));
            this.$dom.on('click', '[data-action]', (event) => this.dispatch(event.currentTarget.dataset.action));
            dialogs.push(this);
        }
        open() {
            $('body').append(this.$dom);
            return new Promise((resolve) => { this.resolve = resolve; });
        }
        dispatch(action) {
            if (this.options.onDispatch(action) === false) return;
            this.$dom.remove();
            this.resolve(action);
        }
    }
    const ui = {
        $, ActionDialog,
        NamedPage: class { constructor(names, callback) { this.names = names; this.callback = callback; } },
        Notification: Object.fromEntries(['success', 'info', 'error'].map((type) => [type, (text) => notifications.push({ type, text })])),
        request: { post: (url, data) => { requests.push({ url, data: JSON.parse(JSON.stringify(data)) }); return post(); } },
    };
    dom.window.exports = {};
    dom.window.require = (name) => {
        if (name === 'jquery') return { default: $ };
        if (name === 'vj/components/notification') return { default: ui.Notification };
        return ui;
    };
    dom.window.eval(frontend);
    const page = dom.window.exports.default;
    page.callback();
    return {
        dom, document: dom.window.document, dialogs, requests, notifications, page,
        setPost: (handler) => { post = handler; },
        close: () => dom.window.close(),
        flush: () => new Promise((resolve) => setImmediate(resolve)),
    };
}

describe('automatic badge management UI', () => {
    it('shows the automatic record, source, expiry and scope timezone without exposing editable raw identifiers', (t) => {
        const h = fixture();
        t.after(h.close);
        const row = h.document.querySelector('[data-auto-badge-row]');
        assert.match(row.textContent, /君豪/);
        assert.match(row.textContent, /积分抽奖/);
        assert.match(row.textContent, /2026-09-14 10:00/);
        assert.match(row.textContent, /即将到期/);
        assert.doesNotMatch(row.textContent, /opaque\/record/);
        assert.match(h.document.querySelector('.auto-badges__footer').textContent, /北京时间/);
        assert.equal(h.document.querySelector('.data-table'), null);
        assert.deepEqual(Array.from(h.page.names), ['badge_manage', 'domain_badge_manage']);
    });

    it('keeps other platform timezone names unchanged in the list and edit dialog', (t) => {
        const h = fixture({ autoBadgeTimezone: 'Europe/London' });
        t.after(h.close);
        assert.match(h.document.querySelector('.auto-badges__footer').textContent, /Europe\/London/);
        h.document.querySelector('[data-auto-badge-edit]').click();
        assert.match(h.dialogs[0].$dom.text(), /Europe\/London/);
        assert.doesNotMatch(h.dialogs[0].$dom.text(), /北京时间/);
    });

    it('keeps query, status and original badge page in pagination, escaping user-provided labels', (t) => {
        const query = '<img src=x onerror=alert(1)> & 月';
        const h = fixture({ autoBadgeQuery: query, autoBadgeStatus: 'all', autoBadgePageCount: 3, autoBadgeRows: [{ ...badge, userName: query }] });
        t.after(h.close);
        assert.equal(h.document.querySelector('[name="autoQuery"]').value, query);
        assert.equal(h.document.querySelector('[name="autoStatus"]').value, 'all');
        assert.equal(h.document.querySelectorAll('img[onerror]').length, 0);
        const next = new URL(h.document.querySelector('.auto-badges__pagination a').href);
        assert.equal(next.searchParams.get('autoQuery'), query);
        assert.equal(next.searchParams.get('autoPage'), '2');
        assert.equal(next.searchParams.get('page'), '2');
        assert.equal(next.searchParams.get('autoStatus'), 'all');
        assert.equal(next.hash, '#auto-badges');
    });

    it('lets teachers renew expired records and set permanent validity, posting only the selected record once', async (t) => {
        const h = fixture({ autoBadgeRows: [{ ...badge, status: 'expired', statusText: '已到期' }] });
        t.after(h.close);
        h.document.querySelector('[data-auto-badge-edit]').click();
        const dialog = h.dialogs[0];
        const expires = dialog.$dom.find('[name="expiresAt"]')[0];
        const permanent = dialog.$dom.find('[name="permanent"]')[0];
        assert.equal(expires.value, badge.expiresAtInput);
        expires.value = '2026-10-01T18:30';
        permanent.checked = true;
        permanent.dispatchEvent(new h.dom.window.Event('change'));
        assert.equal(expires.disabled, true);
        assert.equal(expires.required, false);
        dialog.dispatch('save');
        dialog.dispatch('save');
        assert.deepEqual(h.requests, [{ url: '', data: { operation: 'auto_badge_update', key: badge.key, expiresAt: '', permanent: true } }]);
        await h.flush();
        assert.equal(h.dom.window.location.hash, '#auto-badges');
        assert.equal(h.dom.window.location.search, '?page=2&autoStatus=active');
    });

    it('preserves date input and allows correction after a server validation failure', async (t) => {
        const h = fixture();
        t.after(h.close);
        h.setPost(() => Promise.reject(new Error('到期时间必须晚于当前时间')));
        h.document.querySelector('[data-auto-badge-edit]').click();
        const dialog = h.dialogs[0];
        const expires = dialog.$dom.find('[name="expiresAt"]')[0];
        expires.value = '2026-09-12T10:00';
        dialog.dispatch('save');
        await h.flush();
        assert.equal(expires.value, '2026-09-12T10:00');
        assert.equal(dialog.$dom.find('[data-dialog-error]')[0].hidden, false);
        assert.match(dialog.$dom.text(), /到期时间必须晚于当前时间/);
        assert.equal(dialog.$dom.find('[data-action="save"]')[0].disabled, false);
        h.setPost(() => Promise.resolve({ ok: true }));
        expires.value = '2026-10-01T18:30';
        dialog.dispatch('save');
        assert.deepEqual(h.requests[1].data, { operation: 'auto_badge_update', key: badge.key, expiresAt: '2026-10-01T18:30', permanent: false });
        await h.flush();
    });

    it('requires confirmation for removal and explains a concurrent permanent grant without removing it', async (t) => {
        const h = fixture({ autoBadgeRows: [{ ...badge, manualOverlap: true }] });
        t.after(h.close);
        h.document.querySelector('[data-auto-badge-remove]').click();
        const first = h.dialogs[0];
        assert.equal(h.requests.length, 0);
        assert.equal(first.$dom.find('[data-dialog-overlap]')[0].hidden, false);
        assert.match(first.$dom.text(), /另有永久授予，移除自动记录后仍保留徽章/);
        first.$dom.find('.auto-badge-dialog__close')[0].click();
        await h.flush();
        assert.equal(h.requests.length, 0);
        h.document.querySelector('[data-auto-badge-remove]').click();
        h.dialogs[1].dispatch('save');
        assert.deepEqual(h.requests[0].data, { operation: 'auto_badge_remove', key: badge.key });
        await h.flush();
    });

    it('shows a helpful empty state while leaving search and status controls available', (t) => {
        const h = fixture({ autoBadgeRows: [], autoBadgeTotal: 0, autoBadgeQuery: '不存在的学员' });
        t.after(h.close);
        assert.match(h.document.querySelector('.auto-badges__empty').textContent, /没有找到符合条件/);
        assert.equal(h.document.querySelectorAll('[data-auto-badge-row]').length, 0);
        assert.equal(h.document.querySelector('[name="autoQuery"]').value, '不存在的学员');
        assert.ok(h.document.querySelector('button[type="submit"]'));
    });
});
