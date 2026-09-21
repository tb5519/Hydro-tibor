const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const jquery = require('jquery');
const nunjucks = require('nunjucks');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '../packages/ui-default');
class FixtureLoader extends nunjucks.Loader {
    getSource(name) {
        const fixtures = {
            'layout/html5.html': '<!doctype html><html><body>{% block body %}{% endblock %}</body></html>',
            'partials/nav.html': '<nav data-test-desktop-nav></nav>',
            'partials/header_mobile.html': '<nav data-test-mobile-nav></nav>',
            'partials/footer.html': '<footer class="footer"></footer>',
        };
        return { src: fixtures[name] ?? fs.readFileSync(path.join(root, 'templates', name), 'utf8'), path: name, noCache: true };
    }
}
const env = new nunjucks.Environment(new FixtureLoader(), { autoescape: true });
env.addGlobal('assetUrl', (value, fallback = value) => fallback);
const translations = {
    Username: '用户名', Password: '密码', Login: '登录', 'Remember me': '记住我',
    'Forgot password or username?': '忘记密码或用户名？',
};
function render(t, options = {}) {
    const context = {
        page_name: 'user_login',
        _: (text) => translations[text] || text,
        handler: { domain: { ui: { name: options.brand || 'OneByOne' } }, loginMethods: options.methods || [] },
        model: { system: { get: (key) => key === 'server.name' ? 'OneByOne' : key === 'server.login' ? options.localLogin !== false : true } },
        url: (name, args) => name === 'user_oauth' ? `/d/classroom/oauth/${args.type}/login` : `/d/classroom/${name === 'user_login' ? 'login' : 'lostpass'}`,
        ...options.context,
    };
    const dom = new JSDOM(env.render(options.template || 'user_login.html', context), {
        url: 'https://onebyone.test/d/classroom/login?redirect=%2Fd%2Fclassroom%2Fscratch', runScripts: 'outside-only',
    });
    t.after(() => dom.window.close());
    return { dom, doc: dom.window.document, form: dom.window.document.querySelector('.one-login__form') };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
const verifyCode = transformSync(fs.readFileSync(path.join(root, 'pages/user_verify.page.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
function attachVerification(h, options = {}) {
    const { window } = h.dom;
    Object.defineProperty(window, 'isSecureContext', { value: true });
    Object.defineProperty(window.navigator, 'credentials', { value: {} });
    for (const input of h.form.elements) {
        if (input.name) Object.defineProperty(h.form, input.name, { value: input, configurable: true });
    }
    const requests = [];
    const submitted = [];
    h.form.submit = () => submitted.push(Object.fromEntries(new window.FormData(h.form)));
    const module = { exports: {} };
    new window.Function('require', 'module', 'exports', verifyCode)((name) => {
        if (name === 'jquery') return jquery(window);
        if (name === '@simplewebauthn/browser') return { startAuthentication: async () => ({ id: 'verified-passkey' }) };
        if (name === 'vj/components/dialog') return { ActionDialog: class {
            async open() {
                const input = window.document.createElement('input');
                input.name = 'tfa_code'; input.value = '123456';
                window.document.body.append(input);
                return 'tfa';
            }
        } };
        if (name === 'vj/components/notification') return { info() {}, error(message) { throw new Error(message); } };
        if (name === 'vj/misc/Page') return { AutoloadPage: class { constructor(_, callback) { callback(); } } };
        if (name === 'vj/utils') return {
            i18n: (text) => text,
            tpl: (strings, ...values) => strings.reduce((text, segment, i) => text + segment + (values[i] ?? ''), ''),
            request: {
                get: async (url, data) => {
                    requests.push({ method: 'get', url, data });
                    return url === '/user/tfa' ? { authn: options.passkey || false, tfa: options.tfa || false }
                        : { authOptions: { challenge: 'onebyone-passkey-challenge' } };
                },
                post: async (url, data) => { requests.push({ method: 'post', url, data }); return {}; },
            },
        };
        throw new Error(`Unexpected verification dependency ${name}`);
    }, module, module.exports);
    return { requests, submitted };
}

describe('standalone OneByOne login presentation', () => {
    it('omits desktop/mobile navigation only on login and keeps the shared authentication dialog available', (t) => {
        const login = render(t);
        assert.equal(login.doc.querySelector('[data-test-desktop-nav], [data-test-mobile-nav], .nav--placeholder'), null);
        assert(login.doc.querySelector('.dialog--signin'));
        assert.equal(login.doc.getElementById('one-login-title').textContent, '打开编程世界的大门');
        assert.equal(login.doc.getElementById('one-login-card-title').textContent, '欢迎回来！');
        assert.equal(login.doc.querySelector('.one-login__card-heading p').textContent, '登录账号，开始今天的编程之旅。');
        assert.equal(login.doc.querySelector('.one-login__welcome-footer').textContent.trim(), '一步一步，让想象发生。');
        for (const removed of ['eyebrow', 'intro', 'greeting', 'card-note', 'languages']) {
            assert.equal(login.doc.querySelector(`.one-login__${removed}`), null, `${removed} should be removed from the login page`);
        }
        const other = render(t, { template: 'layout/immersive.html', context: { page_name: 'user_register' } });
        assert(other.doc.querySelector('[data-test-desktop-nav]'));
        assert(other.doc.querySelector('[data-test-mobile-nav]'));
        assert(other.doc.querySelector('.nav--placeholder'));
    });

    it('preserves the current domain and redirect query as the login POST target and retains all authentication fields', (t) => {
        const h = render(t, { methods: [{ id: 'example', text: '课堂账号登录' }] });
        assert.equal(h.form.method, 'post');
        assert.equal(h.form.getAttribute('action'), null);
        assert.equal(h.form.action, h.dom.window.location.href);
        for (const name of ['uname', 'password', 'rememberme', 'tfa', 'authnChallenge', 'login_submit']) assert(h.form.elements.namedItem(name));
        assert.equal(h.form.elements.namedItem('uname').autocomplete, 'username webauthn');
        assert.equal(h.form.elements.namedItem('password').autocomplete, 'current-password');
        assert.equal(h.form.querySelector('.one-login__oauth-button').getAttribute('href'), '/d/classroom/oauth/example/login');
        assert.equal(h.form.querySelector('.one-login__lostpass').getAttribute('href'), '/d/classroom/lostpass');
        assert.equal(h.doc.querySelector('form form'), null);
    });

    it('respects OAuth-only configurations and escapes configurable brand and provider labels', (t) => {
        const unsafe = '<img src=x onerror=alert(1)>';
        const h = render(t, { localLogin: false, brand: unsafe, methods: [{ id: 'example', text: unsafe }] });
        assert.equal(h.form.querySelector('input[name=uname], input[name=password], [name=login_submit]'), null);
        assert.equal(h.form.querySelectorAll('.one-login__oauth-button').length, 1);
        assert.equal(h.form.querySelector('.one-login__oauth-button').textContent, unsafe);
        assert.equal(h.doc.querySelector('.one-login__brand > span').textContent, unsafe);
        assert.equal(h.doc.querySelector('[onerror]'), null);
    });

    for (const options of [{}, { tfa: true }, { passkey: true }]) {
        const mode = options.tfa ? 'two-factor code' : options.passkey ? 'passkey verification' : 'password login';
        it(`continues to work with the existing ${mode} handler`, async (t) => {
            const h = render(t);
            const flow = attachVerification(h, options);
            h.form.elements.namedItem('uname').value = 'learner';
            h.form.elements.namedItem('password').value = 'classroom-password';
            h.form.elements.namedItem('rememberme').checked = true;
            h.form.elements.namedItem('login_submit').click();
            await settle();
            await settle();
            assert.equal(flow.submitted.length, 1);
            assert.equal(flow.submitted[0].uname, 'learner');
            assert.equal(flow.submitted[0].password, 'classroom-password');
            assert.equal(flow.submitted[0].rememberme, 'on');
            assert.equal(flow.submitted[0].tfa, options.tfa ? '123456' : '');
            assert.equal(flow.submitted[0].authnChallenge, options.passkey ? 'onebyone-passkey-challenge' : '');
            assert.equal(flow.requests[0].method, 'get');
            assert.equal(flow.requests[0].url, '/user/tfa');
            assert.equal(flow.requests[0].data.q, 'learner');
        });
    }
});
