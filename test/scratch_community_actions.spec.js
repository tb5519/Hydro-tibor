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
const pageCode = transformSync(fs.readFileSync(path.join(root, 'misc/Page.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code;
const templateName = 'scratch_community_detail.html';
const template = fs.readFileSync(path.join(root, 'templates', templateName), 'utf8')
    .replace('{% extends "scratch_base.html" %}', '');
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(root, 'templates')), { autoescape: true });
env.addFilter('json', JSON.stringify);
const settle = () => new Promise((resolve) => setImmediate(resolve));
const response = (result, ok = true) => ({ ok, json: async () => result });

function actions(t, canManage = true, isTeacher = false) {
    const endpoint = '/d/art/scratch/community/123';
    const body = env.renderString(template, {
        canManage, canEdit: false, communityMetrics: { likes: 3, runtimeSeconds: 65, likedToday: false, canLike: true, isTeacher }, communityWork: { title: '星球旅行', instructions: '方向键移动', owner: 10 },
        UiContext: { scratchPlayer: {} }, datetimeSpan: () => '刚刚',
        url: (name) => ({ scratch_community_work: endpoint, scratch_community_metrics: `${endpoint}/metrics`, scratch_community_analytics: `${endpoint}/analytics` }[name] || '/d/art/scratch/community'),
    });
    const html = `<html data-page="${templateName.split('.')[0]}"><body>${body}</body></html>`;
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
    const pages = { exports: {} };
    window.Hydro = {};
    new window.Function('module', 'exports', 'process', pageCode)(pages, pages.exports, { env: { NODE_ENV: 'test' } });
    const module = { exports: {} };
    new window.Function('require', 'module', 'exports', 'location', actionsCode)((name) => {
        assert.equal(name, 'vj/misc/Page');
        return pages.exports;
    }, module, module.exports, location);
    // The real loader matches the rendered template name, not the route name.
    const pageName = document.documentElement.dataset.page;
    const page = module.exports.default;
    if (page.isNameMatch(pageName)) page.afterLoading(pageName);
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

const summary = (extra = {}) => ({ ok: true, likes: 4, runtimeSeconds: 125, likedToday: true, canLike: false, isTeacher: false, ...extra });
const analytics = (extra = {}) => ({ ok: true, likes: 14, runtimeSeconds: 425, actualRuntimeSeconds: 125,
    manualRuntimeSeconds: 300, studentLikes: 4, teacherLikes: 10, participants: [], ...extra });
const select = (h, name) => h.document.querySelector(`[data-${name}]`);

describe('Scratch community encouragement and private analytics', () => {
    it('sends one authenticated daily like, locks repeated clicks, and reflects the returned limit', async (t) => {
        const h = actions(t, false);
        const button = select(h, 'community-like');
        button.click();
        button.click();
        assert.equal(h.requests.length, 1);
        const request = h.requests[0];
        assert.equal(request.url, 'https://onebyone.test/d/art/scratch/community/123/metrics');
        assert.equal(request.options.body.get('operation'), 'like');
        assert.match(request.options.body.get('requestId'), /^[a-f\d-]{36}$/);
        assert.equal(request.options.credentials, 'same-origin');
        assert.equal(request.options.headers['X-Requested-With'], 'XMLHttpRequest');
        assert.equal(button.disabled, true);
        request.resolve(response(summary()));
        await settle();
        assert.equal(button.disabled, true);
        assert.equal(button.getAttribute('aria-pressed'), 'true');
        assert.equal(select(h, 'community-like-count').textContent, '4');
        assert.equal(select(h, 'community-runtime').textContent, '2 分 5 秒');
        assert.match(select(h, 'community-like-label').textContent, /今天已点赞/);
        assert.match(select(h, 'community-like-status').textContent, /鼓励已送达/);
        assert.equal(select(h, 'community-analytics-dialog'), null);
    });

    it('retries ambiguous like requests with the same id and teachers can send another like after success', async (t) => {
        const h = actions(t, true, true);
        const button = select(h, 'community-like');
        button.click();
        const firstId = h.requests[0].options.body.get('requestId');
        h.requests[0].reject(new h.window.TypeError('Network failed'));
        await settle();
        assert.equal(button.disabled, false);
        assert.match(select(h, 'community-like-status').textContent, /不会重复计数/);
        button.click();
        assert.equal(h.requests[1].options.body.get('requestId'), firstId);
        h.requests[1].resolve(response(summary({ canLike: true, isTeacher: true })));
        await settle();
        assert.equal(button.disabled, false);
        assert.match(select(h, 'community-like-hint').textContent, /多次/);
        button.click();
        assert.notEqual(h.requests[2].options.body.get('requestId'), firstId);
        h.requests[2].resolve(response(summary({ likes: 5, canLike: true, isTeacher: true })));
        await settle();
        assert.equal(select(h, 'community-like-count').textContent, '5');
    });

    it('updates total runtime from player events without revealing participants or resetting the daily limit', async (t) => {
        const h = actions(t, false);
        select(h, 'community-like').click();
        h.requests[0].resolve(response(summary()));
        await settle();
        h.window.dispatchEvent(new h.window.CustomEvent('scratch-community-metrics', { detail: { runtimeSeconds: 3725, likes: 7 } }));
        assert.equal(select(h, 'community-runtime').textContent, '1 小时 2 分');
        assert.equal(select(h, 'community-like-count').textContent, '7');
        h.window.dispatchEvent(new h.window.CustomEvent('scratch-community-metrics', { detail: summary({ likes: 3, runtimeSeconds: 66, canLike: true, likedToday: false }) }));
        assert.equal(select(h, 'community-runtime').textContent, '1 小时 2 分');
        assert.equal(select(h, 'community-like-count').textContent, '7');
        assert.equal(select(h, 'community-like').disabled, true);
        assert.equal(select(h, 'community-participants'), null);
    });

    it('loads teacher-only analytics on demand and escapes participant names using DOM text', async (t) => {
        const h = actions(t, true, true);
        assert.equal(h.requests.length, 0, 'private data is not preloaded');
        const trigger = select(h, 'community-analytics');
        trigger.click();
        assert.equal(select(h, 'community-analytics-dialog').open, true);
        assert.equal(h.document.activeElement.getAttribute('aria-label'), '关闭作品数据管理');
        assert.equal(h.requests[0].options.method, 'GET');
        assert.equal(h.requests[0].url, 'https://onebyone.test/d/art/scratch/community/123/analytics');
        const name = '<img src=x onerror=alert(1)>';
        h.requests[0].resolve(response(analytics({ participants: [{ uid: 11, name, isTeacher: false, likes: 4, runtimeSeconds: 125 },
            { uid: 2, name: '唐老师', isTeacher: true, likes: 10, runtimeSeconds: 0 }] })));
        await settle();
        assert.equal(select(h, 'community-analytics-content').hidden, false);
        assert.equal(select(h, 'analytics-likes').textContent, '14');
        assert.equal(select(h, 'analytics-manual-runtime').textContent, '5 分');
        assert.equal(select(h, 'analytics-actual-runtime').textContent, '2 分 5 秒');
        const rows = [...select(h, 'community-participants').children];
        assert.equal(rows.length, 2);
        assert.equal(rows[0].children[0].textContent, name);
        assert.equal(rows[0].querySelector('img'), null);
        assert.equal(rows[0].children[2].textContent, '2 分 5 秒');
        assert.match(rows[1].textContent, /老师/);
        select(h, 'community-analytics-close').click();
        assert.equal(select(h, 'community-analytics-dialog').open, false);
        assert.equal(h.document.activeElement, trigger);
    });

    it('supports loading failure retry and aborts a closed private dialog without showing stale results', async (t) => {
        const h = actions(t, true, true);
        select(h, 'community-analytics').click();
        h.requests[0].reject(new h.window.TypeError('Network failed'));
        await settle();
        assert.equal(select(h, 'community-analytics-retry').hidden, false);
        assert.match(select(h, 'community-analytics-status').textContent, /网络/);
        select(h, 'community-analytics-retry').click();
        assert.equal(h.requests.length, 2);
        select(h, 'community-analytics-close').click();
        assert.equal(h.requests[1].options.signal.aborted, true);
        h.requests[1].resolve(response(analytics()));
        await settle();
        assert.equal(select(h, 'community-analytics-content').hidden, true);
        select(h, 'community-analytics').click();
        h.requests[2].resolve(response(analytics()));
        await settle();
        assert.equal(select(h, 'community-participants-empty').hidden, false);
        assert.equal(select(h, 'community-participants-table').hidden, true);
    });

    it('validates adjustments, protects retries against duplicate counts and updates all totals on success', async (t) => {
        const h = actions(t, true, true);
        select(h, 'community-analytics').click();
        h.requests[0].resolve(response(analytics()));
        await settle();
        const form = select(h, 'community-adjust-form');
        const submit = () => form.dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true }));
        select(h, 'community-adjust-likes').value = '0';
        submit();
        assert.equal(h.requests.length, 1);
        assert.match(select(h, 'community-adjust-status').textContent, /至少有一项/);
        select(h, 'community-adjust-likes').value = '5';
        select(h, 'community-adjust-minutes').value = '2';
        select(h, 'community-adjust-seconds').value = '30';
        submit();
        submit();
        assert.equal(h.requests.length, 2);
        const body = h.requests[1].options.body;
        assert.equal(body.get('operation'), 'adjust');
        assert.equal(body.get('likes'), '5');
        assert.equal(body.get('runtimeSeconds'), '150');
        assert.equal(select(h, 'community-adjust-likes').disabled, true);
        assert.equal(select(h, 'community-adjust-submit').disabled, true);
        assert.equal(select(h, 'community-analytics-close').disabled, true);
        const escape = new h.window.Event('cancel', { cancelable: true });
        select(h, 'community-analytics-dialog').dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true);
        h.requests[1].reject(new h.window.TypeError('Network failed'));
        await settle();
        assert.equal(select(h, 'community-adjust-submit').disabled, false);
        assert.equal(select(h, 'community-adjust-likes').disabled, true, 'ambiguous result keeps the original retry payload');
        assert.match(select(h, 'community-adjust-submit').textContent, /重试/);
        submit();
        assert.equal(h.requests[2].options.body.toString(), body.toString());
        h.requests[2].resolve(response(analytics({ likes: 19, runtimeSeconds: 575, manualRuntimeSeconds: 450, teacherLikes: 15 })));
        await settle();
        assert.equal(select(h, 'community-like-count').textContent, '19');
        assert.equal(select(h, 'community-runtime').textContent, '9 分 35 秒');
        assert.equal(select(h, 'analytics-teacher-likes').textContent, '15');
        assert.equal(select(h, 'community-adjust-likes').disabled, false);
        assert.equal(select(h, 'community-adjust-likes').value, '0');
        assert.equal(select(h, 'community-adjust-minutes').value, '0');
        assert.match(select(h, 'community-adjust-status').textContent, /已增加/);
    });

    it('rejects foreign metrics endpoints and aborts requests when leaving the page', async (t) => {
        const h = actions(t, false);
        select(h, 'community-metrics').dataset.metricsUrl = 'https://evil.test/like';
        select(h, 'community-like').click();
        await settle();
        assert.equal(h.requests.length, 0);
        assert.match(select(h, 'community-like-status').textContent, /地址无效/);
        select(h, 'community-metrics').dataset.metricsUrl = '/d/art/scratch/community/123/metrics';
        select(h, 'community-like').click();
        assert.equal(h.requests.length, 1);
        h.window.dispatchEvent(new h.window.Event('pagehide'));
        assert.equal(h.requests[0].options.signal.aborted, true);
        h.requests[0].reject(new h.window.DOMException('Aborted', 'AbortError'));
        await settle();
        assert.equal(h.timers.size, 0);
    });
});
