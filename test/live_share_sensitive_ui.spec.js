const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const snapshotSource = fs.readFileSync(require.resolve('../build/live-share/node_modules/rrweb-snapshot'), 'utf8');
function capture(document) {
    document.defaultView.eval(snapshotSource);
    return JSON.stringify(document.defaultView.rrwebSnapshot.snapshot(document, {
        blockSelector: '[data-live-share-private]', inlineStylesheet: false,
    }));
}

test('the real authenticator dialog keeps its revealed secret inside a private capture boundary', async () => {
    const dom = new JSDOM('<!doctype html><html><body><h1>安全设置</h1></body></html>', {
        url: 'https://school.test/home/security', runScripts: 'outside-only',
    });
    const $ = require('jquery')(dom.window);
    const dialogs = [];
    const secret = 'TESTSECRETNOTFORSHARING';
    const source = fs.readFileSync(path.join(root, 'packages/ui-default/pages/home_security.page.tsx'), 'utf8');
    const code = esbuild.transformSync(`${source}\nexport { enableTfa };`, { loader: 'tsx', format: 'cjs' }).code;
    const mod = { exports: {} };
    vm.runInNewContext(code, {
        module: mod, exports: mod.exports, document: dom.window.document, window: dom.window,
        UserContext: { uname: 'learner' },
        require(id) {
            if (id === 'jquery') return $;
            if (id === 'qrcode') return { toCanvas: async () => {} };
            if (id === '@simplewebauthn/browser') return {};
            if (id === 'vj/components/notification') return {};
            if (id === 'vj/misc/Page') return { NamedPage: class {} };
            if (id === 'vj/components/dialog') return { ActionDialog: class {
                constructor(options) { this.options = options; dialogs.push(this); }
                open() {
                    dom.window.document.body.insertAdjacentHTML('beforeend', this.options.$body);
                    return new Promise((resolve) => { this.resolve = resolve; });
                }
            } };
            if (id === 'vj/utils') return {
                i18n: (text) => text, secureRandomString: () => secret,
                tpl: (parts, ...values) => parts.map((part, index) => part + (values[index] || '')).join(''),
            };
            return require(id);
        },
    });
    try {
        const pending = mod.exports.enableTfa();
        await Promise.resolve();
        const node = dom.window.document.querySelector('#secret');
        assert.ok(node.closest('[data-live-share-private]'));
        node.click();
        assert.equal(node.textContent, secret, 'the learner can still reveal and copy their own secret');
        const captured = capture(dom.window.document);
        assert.ok(captured.includes('安全设置'));
        assert.ok(!captured.includes(secret));
        assert.ok(!captured.includes('tfa_code'));
        dialogs[0].resolve('cancel');
        await pending;
    } finally { dom.window.close(); }
});

test('password, classroom invitation and generated integration tokens stay private in their real UI templates', () => {
    const cases = [
        ['home_profile.html', '[data-profile-password-form]'],
        ['domain_join_applications.html', '#domain-join-code-settings'],
        ['manage_training_dashboard.html', '.tdash-token-once'],
    ];
    for (const [file, selector] of cases) {
        const html = fs.readFileSync(path.join(root, 'packages/ui-default/templates', file), 'utf8');
        const parsed = new JSDOM(html.replace(/{%[\s\S]*?%}/g, ''));
        const privateSection = parsed.window.document.querySelector(selector);
        assert.ok(privateSection?.hasAttribute('data-live-share-private'), file);
        const dom = new JSDOM('<!doctype html><html><body><p>ordinary visible page</p></body></html>', { runScripts: 'outside-only' });
        const section = dom.window.document.importNode(privateSection, true);
        // Protect even plaintext values or dynamically added confirmation text,
        // instead of relying solely on password-type input masking.
        section.insertAdjacentHTML('beforeend', '<p>private-confirmation-secret-42</p>');
        dom.window.document.body.appendChild(section);
        const captured = capture(dom.window.document);
        assert.ok(captured.includes('ordinary visible page'), file);
        assert.ok(!captured.includes('private-confirmation-secret-42'), file);
        parsed.window.close(); dom.window.close();
    }
});
