const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const jqueryFactory = require('jquery');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');

const uiRoot = path.resolve(__dirname, '../packages/ui-default');
const source = fs.readFileSync(path.join(uiRoot, 'pages/training_detail.page.ts'), 'utf8');
const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
const template = fs.readFileSync(path.join(uiRoot, 'templates/training_detail.html'), 'utf8')
    .replace('{% extends "layout/basic.html" %}', '')
    .replace('{% include "partials/training_detail.html" %}', '');
const env = new nunjucks.Environment(null, { autoescape: true });
env.addGlobal('Object', Object);
env.addFilter('markdown', (value) => value);
const translate = (message, ...params) => message.replace(/\{(\d+)\}/g, (match, index) => params[Number(index)] ?? match);
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
};
function render(options = {}) {
    const users = options.users || {
        24: { _id: 24, uname: 'dangdang', displayName: '当当' },
        25: { _id: 25, uname: 'student-two', displayName: '小禾' },
    };
    return env.renderString(template, {
        _: options.translate || translate, url: (name) => `/${name}`, avatarUrl: () => '/avatar.png',
        user: { render_inline: () => 'Teacher' },
        handler: { user: { hasPriv: () => true, hasPerm: () => options.privateNames !== false } },
        PRIV: { PRIV_USER_PROFILE: 1 }, perm: { PERM_VIEW_USER_PRIVATE_INFO: 1 },
        pids: [10], tsdoc: { enroll: 1, donePids: [] },
        tdoc: { _id: 'plan-a', docId: 'plan-a', dag: [], title: 'Arrays', attend: Object.keys(users).length },
        udoc: {}, udict: users, groups: [], viewingUid: 24,
        canManageTraining: options.teacher !== false, canEditTraining: options.teacher !== false,
        trainingDirectProblemLinks: true, missing: [],
        model: { training: { getDisplayAttend: (doc) => doc.attend, canSelfEnroll: () => false } },
    });
}
function harness(t, options = {}) {
    const href = options.url || 'https://onebyone.test/d/cpp/training/plan-a?uid=25#node-2';
    const dom = new JSDOM(`<!doctype html><html><body>${render(options)}</body></html>`, { url: href });
    t.after(() => dom.window.close());
    const $ = jqueryFactory(dom.window);
    const calls = { dialogs: [], dialogInstances: [], requests: [], success: [], error: [], navigation: [], reloads: 0 };
    $.expr.pseudos.visible = (element) => !element.hidden && !$(element).parents('[hidden]').length && $(element).css('display') !== 'none';
    const location = {
        href, pathname: new URL(href).pathname, search: new URL(href).search, hash: new URL(href).hash,
        assign: (value) => calls.navigation.push(value), reload: () => { calls.reloads += 1; },
    };
    const browser = { location, matchMedia: () => ({ matches: true }), setTimeout: dom.window.setTimeout.bind(dom.window) };
    let init;
    const dependencies = {
        jquery: $, lodash: { debounce: (fn) => fn },
        'vj/components/autocomplete/UserSelectAutoComplete': { getOrConstruct: () => ({ value: () => [], focus() {} }) },
        'vj/components/dialog': { ConfirmDialog: class {
            constructor(config) {
                this.options = config;
                this.$dom = $('<div class=dialog><div class=dialog__content><div class=dialog__body></div><div class=dialog__action></div></div></div>');
                this.$dom.find('.dialog__body').append(config.$body);
                this.$dom.find('.dialog__action').append(config.$action || '<button data-action=cancel>Cancel</button><button data-action=yes>Yes</button>');
                calls.dialogs.push(config);
                calls.dialogInstances.push(this);
            }
            open() {
                this.$dom.appendTo(dom.window.document.body);
                this.$dom.find('[data-autofocus]').get(0)?.focus();
                let result;
                if (options.manualDialog) {
                    const pending = deferred();
                    this.$dom.on('click', '[data-action]', (event) => pending.resolve($(event.currentTarget).attr('data-action')));
                    $(dom.window.document).on('keyup.testDialog', (event) => {
                        if (event.key === 'Escape' || event.keyCode === 27) pending.resolve('cancel');
                    });
                    result = pending.promise;
                } else result = options.confirm ? options.confirm() : Promise.resolve('yes');
                return Promise.resolve(result).finally(() => {
                    this.$dom.remove();
                    $(dom.window.document).off('.testDialog');
                });
            }
        } },
        'vj/components/notification': {
            success: (value) => calls.success.push(value), error: (value) => calls.error.push(value),
        },
        'vj/misc/Page': { NamedPage: class { constructor(name, callback) { init = callback; } } },
        'vj/utils': { i18n: translate, request: { post: async (url, body) => {
            calls.requests.push([url, JSON.parse(JSON.stringify(body))]);
            return options.post ? options.post(url, body) : { displayAttend: 1 };
        } } },
        'vj/utils/slide': { slideDown: async () => {}, slideUp: async () => {} },
    };
    const mod = { exports: {} };
    vm.runInNewContext(code, {
        module: mod, exports: mod.exports,
        require: (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
        window: browser, document: dom.window.document, URL, Element: dom.window.Element,
    });
    init();
    const click = (uid = 24) => {
        const button = $(`[data-training-remove-user][data-uid="${uid}"]`);
        const event = $.Event('click', { button: 0 });
        button.trigger(event);
        return event;
    };
    return { dom, $, calls, click, flush: () => new Promise((resolve) => setImmediate(resolve)) };
}

test('remove controls are teacher-only, independent of roster links and safely escape student names', (t) => {
    const student = harness(t, { teacher: false });
    assert.equal(student.$('[data-training-remove-user]').length, 0);
    assert.equal(student.$('[data-training-user-drawer]').length, 0);
    const unsafe = '<img src=x onerror=alert(1)>"';
    const teacher = harness(t, { users: { 24: { _id: 24, uname: 'learner', displayName: unsafe } } });
    const button = teacher.$('[data-training-remove-user]');
    assert.equal(button.attr('type'), 'button');
    assert.equal(button.attr('data-name'), unsafe);
    assert.equal(button.closest('a').length, 0);
    assert.equal(teacher.$('[onerror]').length, 0);
    teacher.click();
    assert.equal(teacher.calls.dialogs[0].$body.find('img').length, 0);
    assert.ok(teacher.calls.dialogs[0].$body.text().includes(unsafe));
});

test('cancel keeps the enrollment and blocks repeated clicks while the confirmation is open', async (t) => {
    const dialog = deferred();
    const app = harness(t, { confirm: () => dialog.promise });
    const event = app.click();
    assert.equal(event.isDefaultPrevented(), true);
    assert.equal(event.isPropagationStopped(), true);
    assert.equal(app.$('[data-training-remove-user][data-uid=24]').prop('disabled'), true);
    app.click();
    assert.equal(app.calls.dialogs.length, 1);
    assert.match(app.calls.dialogs[0].$body.text(), /当当/);
    assert.match(app.calls.dialogs[0].$body.text(), /submissions, accepted problems and RP will be kept/);
    assert.match(app.calls.dialogs[0].$body.text(), /Adding them again restores their progress/);
    assert.equal(app.calls.dialogs[0].canCancel, true);
    dialog.resolve('cancel'); await app.flush();
    assert.equal(app.calls.requests.length, 0);
    assert.equal(app.$('.enroll_user_menu_item').length, 2);
    assert.equal(app.$('[data-training-remove-user][data-uid=24]').prop('disabled'), false);
    assert.equal(app.calls.navigation.length, 0);
});

test('successful removal sends the current-plan operation once and updates the roster without closing search', async (t) => {
    const request = deferred();
    const app = harness(t, { post: () => request.promise });
    app.$('[data-training-user-drawer]').addClass('is-open');
    app.$('[name=uid]').val('dangdang');
    app.click(); await app.flush();
    assert.deepEqual(app.calls.requests, [['', { operation: 'remove_user', uids: '24' }]]);
    assert.equal(app.$('[data-training-remove-user][data-uid=24]').prop('disabled'), true);
    app.click(); await app.flush();
    assert.equal(app.calls.requests.length, 1);
    request.resolve({ displayAttend: 1 }); await app.flush();
    assert.equal(app.$('.enroll_user_menu_item[data-uid=24]').length, 0);
    assert.equal(app.$('.enroll_user_menu_item[data-uid=25]').length, 1);
    assert.deepEqual(app.$('[data-training-participant-count]').map((index, node) => node.textContent).get(), ['1', '1']);
    assert.equal(app.$('[data-training-user-drawer]').hasClass('is-open'), true);
    assert.equal(app.$('[name=uid]').val(), 'dangdang');
    assert.equal(app.$('[data-training-roster-empty]').prop('hidden'), true);
    assert.equal(app.calls.success.length, 1);
    assert.equal(app.calls.error.length, 0);
    assert.equal(app.calls.navigation.length, 0);
    assert.equal(app.calls.reloads, 0);
});

test('a failed request retains enrollment, explains the error and allows a retry', async (t) => {
    let attempts = 0;
    const app = harness(t, { post: async () => {
        if (++attempts === 1) throw Object.assign(new Error('Permission denied'), { params: ['please retry'] });
        return { displayAttend: 1 };
    } });
    app.click(); await app.flush();
    assert.equal(app.$('.enroll_user_menu_item[data-uid=24]').length, 1);
    assert.equal(app.$('[data-training-remove-user][data-uid=24]').prop('disabled'), false);
    assert.deepEqual(app.calls.error, ['Permission denied please retry']);
    assert.equal(app.calls.success.length, 0);
    app.click(); await app.flush();
    assert.equal(app.calls.requests.length, 2);
    assert.equal(app.$('.enroll_user_menu_item[data-uid=24]').length, 0);
    assert.equal(app.calls.success.length, 1);
});

test('removing the learner whose progress is being viewed clears only that selected uid', async (t) => {
    const app = harness(t, { url: 'https://onebyone.test/d/cpp/training/plan-a?uid=24&source=class#node-7' });
    app.click(); await app.flush();
    assert.deepEqual(app.calls.navigation, ['https://onebyone.test/d/cpp/training/plan-a?source=class#node-7']);
    assert.equal(app.calls.reloads, 0);
    assert.equal(app.calls.success.length, 1);
});

test('removing the final enrolled learner shows a useful empty state and authoritative participant count', async (t) => {
    const app = harness(t, {
        users: { 24: { _id: 24, uname: 'dangdang', displayName: '当当' } },
        post: async () => ({ displayAttend: 0 }),
    });
    app.click(); await app.flush();
    assert.equal(app.$('.enroll_user_menu_item').length, 0);
    assert.equal(app.$('[data-training-roster-empty]').prop('hidden'), false);
    assert.match(app.$('[data-training-roster-empty]').text(), /No students enrolled yet/);
    assert.equal(app.$('[data-training-roster-search]').prop('hidden'), true);
    assert.equal(app.$('.enroll_user_menu').prop('hidden'), true);
    assert.deepEqual(app.$('[data-training-participant-count]').map((index, node) => node.textContent).get(), ['0', '0']);
});

test('invalid student identifiers cannot open a dialog or send enrollment mutations', async (t) => {
    const app = harness(t);
    for (const uid of ['1', '0', 'NaN', '24.5', '9007199254740992']) {
        app.$('[data-training-remove-user]').first().attr('data-uid', uid);
        app.click(uid);
    }
    await app.flush();
    assert.equal(app.calls.dialogs.length, 0);
    assert.equal(app.calls.requests.length, 0);
    assert.equal(app.$('.enroll_user_menu_item').length, 2);
});

test('roster styles compile with keyboard, pending and empty-state behavior at desktop and mobile sizes', () => {
    const stylus = require('stylus');
    const postcss = require('postcss');
    const common = fs.readFileSync(path.join(uiRoot, 'common/rem.inc.styl'), 'utf8');
    const styles = fs.readFileSync(path.join(uiRoot, 'pages/training_detail.page.styl'), 'utf8');
    const css = stylus(`$font-size = 16px\n$nav-item-height = 45px\n${common}\n${styles}`).render();
    const tree = postcss.parse(css);
    function declaration(selector, property) {
        let value;
        tree.walkRules((rule) => {
            if (rule.selector.split(',').map((item) => item.trim()).includes(selector)) {
                rule.walkDecls(property, (decl) => { value = decl.value; });
            }
        });
        return value;
    }
    const scope = '.page--training_detail';
    assert.equal(declaration(`${scope} .enroll_user_menu_item`, 'display'), 'flex');
    assert.equal(declaration(`${scope} .enroll_user_menu_item > a`, 'min-width'), '0');
    assert.equal(declaration(`${scope} .ui-v2-training-detail__remove-user`, 'flex'), '0 0 auto');
    assert.equal(declaration(`${scope} .ui-v2-training-detail__remove-user:disabled`, 'cursor'), 'wait');
    assert.equal(declaration(`${scope} .ui-v2-training-detail__remove-user:focus-visible`, 'outline'), 'none');
    assert.equal(declaration(`${scope} .ui-v2-training-detail__roster-empty[hidden]`, 'display'), 'none');
    assert.equal(declaration(`${scope} .enroll_user_menu[hidden]`, 'display'), 'none');
    assert.equal(declaration(`${scope} .ui-v2-training-detail__user-search[hidden]`, 'display'), 'none');
    assert.match(css, /@media \(max-width: 720px\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.equal(declaration(`${scope} .ui-v2-training-detail__drawer-panel`, 'max-width'), '23.75rem');
    assert.doesNotMatch(css, /\$nav-item-height/);
});


test('confirmation owns keyboard focus and Escape cancels only removal before returning focus to the roster', async (t) => {
    const app = harness(t, { manualDialog: true });
    const doc = app.dom.window.document;
    app.$('[data-training-user-drawer-open]').trigger('click');
    await new Promise((resolve) => app.dom.window.setTimeout(resolve, 0));
    const remove = app.$('[data-training-remove-user][data-uid=24]').get(0);
    remove.focus();
    app.click();
    const dialog = app.calls.dialogInstances[0].$dom;
    assert.equal(dialog.attr('role'), 'alertdialog');
    assert.equal(dialog.attr('aria-modal'), 'true');
    assert.ok(dialog.attr('aria-label'));
    const actions = dialog.find('button').get();
    assert.equal(actions.length, 2);
    assert.equal(actions[0].getAttribute('data-action'), 'cancel');
    assert.equal(actions[0].hasAttribute('data-autofocus'), true);
    assert.equal(actions[1].getAttribute('data-action'), 'yes');
    assert.equal(doc.activeElement, actions[0]);
    actions.at(-1).focus();
    const forward = app.$.Event('keydown', { key: 'Tab' });
    app.$(doc).trigger(forward);
    assert.equal(forward.isDefaultPrevented(), true);
    assert.equal(doc.activeElement, actions[0]);
    const backward = app.$.Event('keydown', { key: 'Tab', shiftKey: true });
    app.$(doc).trigger(backward);
    assert.equal(backward.isDefaultPrevented(), true);
    assert.equal(doc.activeElement, actions.at(-1));
    app.$(doc).trigger(app.$.Event('keydown', { key: 'Escape', keyCode: 27 }));
    assert.equal(app.$('[data-training-user-drawer]').hasClass('is-open'), true);
    app.$(doc).trigger(app.$.Event('keyup', { key: 'Escape', keyCode: 27 }));
    await app.flush();
    assert.equal(app.calls.requests.length, 0);
    assert.equal(app.$('.dialog').length, 0);
    assert.equal(app.$('[data-training-user-drawer]').hasClass('is-open'), true);
    assert.equal(remove.disabled, false);
    assert.equal(doc.activeElement, remove);
});
