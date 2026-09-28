const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '../packages/ui-default');
const actionsCode = transformSync(fs.readFileSync(path.join(root, 'pages/scratch_community.page.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code;
const template = fs.readFileSync(path.join(root, 'templates/scratch_community_detail.html'), 'utf8')
    .replace('{% extends "scratch_base.html" %}', '');
const env = new nunjucks.Environment(null, { autoescape: true });
env.addFilter('json', JSON.stringify);
const settle = () => new Promise((resolve) => setImmediate(resolve));
const response = (result, ok = true) => ({ ok, json: async () => result });

function actions(t, canManage = true) {
    const endpoint = '/d/art/scratch/community/123';
    const html = env.renderString(template, {
        canManage, canEdit: false, communityWork: { title: '星球旅行', instructions: '方向键移动', owner: 10 },
        UiContext: { scratchPlayer: {} }, datetimeSpan: () => '刚刚',
        url: (name) => name === 'scratch_community_work' ? endpoint : '/d/art/scratch/community',
    });
    const dom = new JSDOM(html, { url: `https://onebyone.test${endpoint}`, runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const { window } = dom;
    const { document } = window;
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    window.HTMLDialogElement.prototype.close = function () {
        this.removeAttribute('open');
        this.dispatchEvent(new window.Event('close'));
    };
    const requests = [];
    window.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    const timers = new Map();
    let timerId = 0;
    window.setTimeout = (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; };
    window.clearTimeout = (id) => timers.delete(id);
    const navigations = [];
    const location = { href: window.location.href, origin: window.location.origin, assign: (url) => navigations.push(url) };
    const module = { exports: {} };
    new window.Function('require', 'module', 'exports', 'location', actionsCode)((name) => {
        assert.equal(name, 'vj/misc/Page');
        return { NamedPage: class { constructor(pageName, callback) { assert.equal(pageName, 'scratch_community_work'); callback(); } } };
    }, module, module.exports, location);
    return {
        window, document, requests, navigations, timers,
        trigger: document.querySelector('[data-scratch-community-unpublish]'),
        dialog: document.querySelector('[data-scratch-community-unpublish-dialog]'),
        confirm: document.querySelector('[data-scratch-community-unpublish-confirm]'),
        cancels: [...document.querySelectorAll('[data-scratch-community-unpublish-cancel]')],
        status: document.querySelector('[data-scratch-community-unpublish-status]'),
    };
}

describe('Scratch community withdrawal confirmation', () => {
    it('does not post until explicit confirmation, focuses the safe action, and closes from either cancel control', (t) => {
        const h = actions(t);
        assert.equal(h.requests.length, 0);
        assert.equal(h.cancels.length, 2, 'exercise the real template close and keep buttons');
        for (const cancel of h.cancels) {
            h.trigger.click();
            assert.equal(h.dialog.open, true);
            assert.equal(h.document.activeElement.textContent, '先留着');
            assert.equal(h.requests.length, 0);
            cancel.click();
            assert.equal(h.dialog.open, false);
            assert.equal(h.document.activeElement, h.trigger);
        }
        h.confirm.click();
        assert.equal(h.requests.length, 0, 'a closed dialog cannot withdraw a project');
    });

    it('posts once to the authenticated endpoint and disables all cancel controls while pending', async (t) => {
        const h = actions(t);
        h.trigger.click();
        h.confirm.click();
        assert.equal(h.requests.length, 1);
        const request = h.requests[0];
        assert.equal(request.url, 'https://onebyone.test/d/art/scratch/community/123');
        assert.equal(request.options.method, 'POST');
        assert.equal(request.options.credentials, 'same-origin');
        assert.equal(request.options.body.get('operation'), 'unpublish');
        assert.equal(request.options.headers.Accept, 'application/json');
        assert.equal(h.confirm.disabled, true);
        assert(h.cancels.every((button) => button.disabled));
        h.confirm.click();
        for (const cancel of h.cancels) cancel.click();
        assert.equal(h.requests.length, 1);
        assert.equal(h.dialog.open, true);
        const escape = new h.window.Event('cancel', { cancelable: true });
        h.dialog.dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true);
        request.resolve(response({ ok: false }, false));
        await settle();
        assert.equal(h.dialog.open, true);
        assert.equal(h.confirm.disabled, false);
        assert(h.cancels.every((button) => !button.disabled));
        assert.equal(h.timers.size, 0);
    });

    it('keeps the dialog and a visible plain error after failure, then supports retry', async (t) => {
        const h = actions(t);
        h.trigger.click();
        h.confirm.click();
        h.requests[0].resolve(response({ ok: false, message: '<img src=x onerror=alert(1)>' }));
        await settle();
        assert.equal(h.dialog.open, true);
        assert.equal(h.status.dataset.error, 'true');
        assert.match(h.status.textContent, /暂时无法撤下/);
        assert.equal(h.status.querySelector('img'), null);
        assert.equal(h.navigations.length, 0);
        h.confirm.click();
        assert.equal(h.requests.length, 2);
        assert.equal(h.status.dataset.error, 'false');
        h.requests[1].reject(new h.window.TypeError('Failed to fetch'));
        await settle();
        assert.match(h.status.textContent, /网络有点慢/);
        assert.equal(h.dialog.open, true);
        h.cancels[1].click();
        assert.equal(h.dialog.open, false);
        assert.equal(h.document.activeElement, h.trigger);
    });

    it('navigates back to the same-origin community only after a successful response', async (t) => {
        const h = actions(t);
        h.trigger.click();
        h.confirm.click();
        assert.equal(h.navigations.length, 0);
        h.requests[0].resolve(response({ ok: true, url: '/d/art/scratch/community' }));
        await settle();
        assert.deepEqual(h.navigations, ['https://onebyone.test/d/art/scratch/community']);
        assert.equal(h.timers.size, 0);
    });

    it('rejects foreign POST targets and foreign success destinations', async (t) => {
        for (const target of ['https://evil.test/unpublish', 'javascript:alert(1)']) {
            const h = actions(t);
            h.trigger.dataset.scratchCommunityUnpublish = target;
            h.trigger.click();
            h.confirm.click();
            await settle();
            assert.equal(h.requests.length, 0);
            assert.equal(h.navigations.length, 0);
            assert.equal(h.dialog.open, true);
            assert.match(h.status.textContent, /作品地址无效/);
            assert(h.cancels.every((button) => !button.disabled));
        }
        for (const url of ['https://evil.test/done', 'javascript:alert(1)']) {
            const h = actions(t);
            h.trigger.click();
            h.confirm.click();
            h.requests[0].resolve(response({ ok: true, url }));
            await settle();
            assert.equal(h.navigations.length, 0);
            assert.match(h.status.textContent, /作品已撤下，请返回社区/);
            assert.equal(h.dialog.open, true);
        }
    });

    it('does not require management controls for a classmate viewing a project', (t) => {
        const h = actions(t, false);
        assert.equal(h.trigger, null);
        assert.equal(h.dialog, null);
        assert.equal(h.requests.length, 0);
    });
});
