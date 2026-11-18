const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { test } = require('node:test');
const { transformSync } = require('esbuild');
const moment = require('moment-timezone');
const Koa = require('koa');
const { JSDOM } = require('jsdom');
const { fixture, studentDetail, render } = require('./fixtures/training_dashboard');
const { IncomingMessage, ServerResponse } = require('node:http');
const { Socket } = require('node:net');

class CsrfTokenError extends Error {}
class ValidationError extends Error {}
const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/handler/manage.ts'), 'utf8');
const klass = source.slice(source.indexOf('class SystemTrainingDashboardHandler'), source.indexOf('class SystemScriptHandler'));
const scope = { workspaceId: 'school', domains: [{ id: 'python', name: 'Python 训练' }, { id: 'cpp', name: 'C++ 训练' }] };
function setup(body = {}, origin = 'https://school.test', load = async () => ({ rows: [] })) {
    const calls = [];
    const scopeLookups = [];
    const classTime = {
        tokenStatus: async () => ({ active: false, domainIds: [] }),
        issueToken: async (configured, uid) => {
            calls.push({ operation: 'issue', scope: configured, uid });
            return { token: 'one-time-secret', status: { active: true, domainIds: configured.domains.map((item) => item.id) } };
        },
        revokeToken: async (uid, workspaceId) => { calls.push({ operation: 'revoke', uid, workspaceId }); },
    };
    const module = { exports: {} };
    vm.runInNewContext(transformSync(`${klass}\nmodule.exports = SystemTrainingDashboardHandler;`, { loader: 'ts', format: 'cjs' }).code, {
        module, URL, moment, Handler: class {}, CsrfTokenError, ValidationError, classTime,
        trainingDashboardScope: async (h) => { scopeLookups.push(h.user._id); return scope; }, loadTrainingDashboard: load,
        trainingDomainSelection: (raw, available) => {
            const ids = Array.isArray(raw) ? raw : [raw];
            if (ids.some((id) => !available.includes(id))) throw new Error('domains');
            return { ids };
        },
    });
    const handler = Object.assign(new module.exports(), {
        user: { _id: 10 }, domain: { _id: 'python' }, context: { protocol: 'https', origin: 'https://school.test' },
        request: { body, query: {}, host: 'school.test', headers: { origin } },
        response: { addHeader() {} }, limitRate: async () => {},
        url: (name, { query = {} } = {}) => {
            const route = name === 'training_time_classes' ? '/d/python/training-time/classes' : '/d/python/manage/training-dashboard';
            const params = new URLSearchParams(query).toString();
            return params ? `${route}?${params}` : route;
        },
    });
    return { handler, calls, scopeLookups };
}

test('teacher token creation uses server-resolved scope and exposes the full token only in the one-time response', async () => {
    const { handler, calls } = setup({ domains: ['python'], workspaceId: 'forged', uid: 999 });
    await handler.postIssueClassToken();
    assert.equal(calls[0].uid, 10);
    assert.equal(calls[0].scope.workspaceId, 'school');
    assert.deepEqual(Array.from(calls[0].scope.domains, (item) => item.id), ['python']);
    assert.equal(handler.response.body.dashboard.integration.url, 'https://school.test/d/python/training-time/classes');
    assert.equal(handler.response.body.dashboard.integration.token, 'one-time-secret');
    await handler.get();
    assert.equal(handler.response.body.dashboard.integration.token, '');
});

test('cross-origin, missing-origin and forged-classroom requests cannot rotate tokens', async () => {
    for (const origin of [undefined, 'https://evil.test', 'null']) {
        const { handler, calls } = setup({ domains: ['python'] });
        handler.request.headers.origin = origin;
        await assert.rejects(() => handler.postIssueClassToken(), CsrfTokenError);
        assert.equal(calls.length, 0);
    }
    const { handler, calls } = setup({ domains: ['another-school'] });
    await assert.rejects(() => handler.postIssueClassToken(), ValidationError);
    assert.equal(calls.length, 0);
    handler.request.body = {};
    await assert.rejects(() => handler.postIssueClassToken(), ValidationError);
});

test('revocation uses current teacher and workspace and blocks cross-origin requests', async () => {
    const { handler, calls } = setup({ workspaceId: 'forged', uid: 999 });
    await handler.postRevokeClassToken();
    assert.deepEqual(calls, [{ operation: 'revoke', uid: 10, workspaceId: 'school' }]);
    handler.request.headers.origin = 'https://evil.test';
    await assert.rejects(() => handler.postRevokeClassToken(), CsrfTokenError);
    assert.equal(calls.length, 1);
});

function koaContext(headers, proxy = false) {
    const app = new Koa({ proxy });
    const request = new IncomingMessage(new Socket());
    request.method = 'GET';
    request.url = '/manage/training-dashboard';
    request.headers = headers;
    return app.createContext(request, new ServerResponse(request));
}

test('normal dashboard navigation has no Origin header and still generates the public HTTPS endpoint behind a trusted proxy', async () => {
    const { handler } = setup();
    handler.context = koaContext({ host: '127.0.0.1:8888', 'x-forwarded-host': 'onebyone.run', 'x-forwarded-proto': 'https' }, true);
    handler.request.host = handler.context.host;
    assert.equal(handler.context.origin, null);
    await handler.get();
    assert.equal(handler.response.body.dashboard.integration.url, 'https://onebyone.run/d/python/training-time/classes');
});

test('endpoint generation ignores the incoming Origin and preserves the real host and port', async () => {
    const { handler } = setup();
    handler.context = koaContext({ host: 'localhost:18888', origin: 'https://unrelated.test', 'x-forwarded-proto': 'https' });
    handler.request.host = handler.context.host;
    await handler.get();
    assert.equal(handler.response.body.dashboard.integration.url, 'http://localhost:18888/d/python/training-time/classes');
});

test('endpoint generation respects the Hydro host resolved from a configured proxy header', async () => {
    const { handler } = setup();
    handler.context = koaContext({ host: 'internal:8888', 'x-public-host': 'school.example', 'x-forwarded-proto': 'https' }, true);
    handler.request.host = 'school.example';
    await handler.get();
    assert.equal(handler.response.body.dashboard.integration.url, 'https://school.example/d/python/training-time/classes');
});

test('teacher follows a learner and weekly problem filter, opens sync and obtains the one-time token in the same view', async (t) => {
    const dashboards = [];
    const { handler, calls } = setup({}, 'https://school.test', async (h) => {
        const { period = '7d', q = '', student = '12', domains = 'python,cpp', page = '1' } = h.request.query;
        const detail = student === '13' ? studentDetail({ uid: 13, name: '秦济舟', uname: 'qin' }) : studentDetail();
        dashboards.push({ student: detail.uid, period, domains, q });
        return fixture({ period, q, detail, currentQuery: { period, domains, q, page, student: String(detail.uid) } });
    });
    async function get(url) {
        const address = new URL(url, 'https://school.test');
        handler.request.query = Object.fromEntries(address.searchParams);
        await handler.get();
        return documentForResponse(address);
    }
    function documentForResponse(address) {
        assert.equal(handler.response.template, 'manage_training_dashboard.html');
        const dom = new JSDOM(render(handler.response.body.dashboard), { url: address.href });
        t.after(() => dom.window.close());
        return dom.window.document;
    }
    let document = await get('/d/python/manage/training-dashboard?q=1&domains=python');
    const learner = [...document.querySelectorAll('[data-training-student-link]')].find(a => a.textContent.includes('秦济舟'));
    assert.ok(learner);
    document = await get(learner.href);
    assert.equal(document.querySelector('[data-heading-student]').textContent.trim(), '秦济舟');
    const week = [...document.querySelectorAll('[data-problem-period]')].find(a => new URL(a.href).searchParams.get('period') === 'thisWeek');
    assert.ok(week);
    document = await get(week.href);
    assert.equal(document.querySelector('[data-class-integration]').open, false);
    assert.equal(document.querySelector('#training-class-token'), null);
    const form = document.querySelector('[data-class-token-form]');
    const action = new URL(form.action);
    assert.equal(action.pathname, '/d/python/manage/training-dashboard');
    for (const [key, value] of Object.entries({ student: '13', q: '1', period: 'thisWeek', domains: 'python' })) {
        assert.equal(action.searchParams.get(key), value, key);
    }
    assert.equal(action.searchParams.has('token'), false);
    handler.request.query = Object.fromEntries(action.searchParams);
    handler.request.body = { domains: ['python'] };
    await handler.postIssueClassToken();
    document = documentForResponse(action);
    assert.equal(document.querySelector('[data-heading-student]').textContent.trim(), '秦济舟');
    assert.equal(document.querySelector('[data-class-integration]').open, true);
    assert.equal(document.querySelector('#training-class-token').value, 'one-time-secret');
    assert.deepEqual(Array.from(calls[0].scope.domains, x => x.id), ['python']);
    document = await get(action);
    assert.equal(document.querySelector('#training-class-token'), null);
    assert.equal(document.querySelector('[data-class-integration]').open, false);
    assert.deepEqual(dashboards.at(-1), { student: 13, period: 'thisWeek', domains: 'python', q: '1' });
});

test('normal dashboard requests resolve the teacher scope once and keep the learner report out of shared caches', async () => {
    let readScope;
    const { handler, scopeLookups } = setup({}, '', async (_handler, _time, authorizedScope) => {
        readScope = authorizedScope;
        return { rows: [] };
    });
    const headers = new Map();
    handler.response.addHeader = (key, value) => headers.set(key, value);
    await handler.prepare();
    await handler.get();
    assert.deepEqual(scopeLookups, [handler.user._id]);
    assert.equal(readScope, scope);
    assert.match(headers.get('Cache-Control'), /private.*no-store/);
    assert.match(headers.get('Vary'), /Cookie.*Authorization/);
});
