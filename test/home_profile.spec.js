const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { buildSync, transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const root = path.resolve(__dirname, '..');
const ui = path.join(root, 'packages/ui-default');
const template = fs.readFileSync(path.join(ui, 'templates/home_profile.html'), 'utf8');
const env = new nunjucks.Environment({ getSource(name) {
    return { src: name === 'home_profile.html' ? template : '{% block home_content %}{% endblock %}', path: name };
} }, { autoescape: true });
const code = buildSync({
    entryPoints: [path.join(ui, 'pages/home_profile.page.ts')], bundle: true, write: false,
    packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const settle = () => new Promise((resolve) => setImmediate(resolve));

function harness(t, beforeBind = () => {}) {
    const dom = new JSDOM(env.render('home_profile.html', {
        current: { _id: 4, gender: 0, bio: '我喜欢编程。', avatar: 'old' },
        avatarUrl: () => '/avatar-old.png',
        url: (name) => ({ home_profile: '/d/scratch/home/profile', home_profile_password: '/d/scratch/home/profile/password',
            home_security: '/d/scratch/home/security', user_login: '/d/scratch/login' })[name] || '/d/scratch/user/4',
    }), { url: 'https://example.test/d/scratch/home/profile' });
    t.after(() => dom.window.close());
    const calls = [];
    const passwordCalls = [];
    const accessCalls = [];
    let confirm = async () => 'no';
    let access = async () => ({ sessions: [] });
    let passwordPost = async () => ({ passwordChanged: true });
    let post = async () => ({ saved: true, avatarUrl: '/avatar-saved.png?v=2' });
    let prepare = async () => new dom.window.Blob(['png'], { type: 'image/png' });
    const revoked = [];
    dom.window.URL.createObjectURL = () => 'blob:new-avatar';
    dom.window.URL.revokeObjectURL = (url) => revoked.push(url);
    const mod = { exports: {} };
    vm.runInNewContext(code, {
        window: dom.window, document: dom.window.document, URL: dom.window.URL, FormData: dom.window.FormData,
        module: mod, exports: mod.exports,
        require(name) {
            if (name === 'vj/misc/Page') {
                return { NamedPage: class { constructor(pageName, callback) { this.callback = callback; } } };
            }
            if (name === 'vj/components/dialog') return { ConfirmDialog: class { open() { return confirm(); } } };
            if (name === 'vj/utils') {
                return { tpl: { typoMsg: (text) => text }, request: { postFile(url, data, options) {
                    calls.push({ url, data, options });
                    return post(url, data);
                }, get(url) {
                    accessCalls.push(url);
                    return access();
                }, post(url, data) {
                    passwordCalls.push({ url, data });
                    return passwordPost();
                } } };
            }
            if (name === 'vj/utils/domain_avatar') return { prepareDomainAvatar: (...args) => prepare(...args) };
            throw new Error(name);
        },
    });
    beforeBind(dom.window.document);
    mod.exports.default.callback();
    const $ = (selector) => dom.window.document.querySelector(selector);
    const change = (selector, value) => {
        const input = $(selector);
        input.value = value;
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    };
    const submit = async () => {
        $('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await settle();
    };
    const selectFile = async () => {
        Object.defineProperty($('[data-profile-file]'), 'files', { configurable: true, value: [new dom.window.File(['file'], 'avatar.jpg')] });
        $('[data-profile-file]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        await settle();
    };
    const submitPassword = async () => {
        $('[data-profile-password-form]').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await settle();
    };
    const fillPassword = (current = 'OldPass123!', password = 'NewPass456!', verify = password) => {
        change('[name=current]', current);
        change('[name=password]', password);
        change('[name=verifyPassword]', verify);
    };
    return {
        dom, $, change, submit, selectFile, calls, revoked, passwordCalls, accessCalls, submitPassword, fillPassword,
        setPost: (fn) => { post = fn; }, setPrepare: (fn) => { prepare = fn; },
        setConfirm: (fn) => { confirm = fn; }, setAccess: (fn) => { access = fn; },
        setPasswordPost: (fn) => { passwordPost = fn; },
    };
}

describe('personal profile editor', () => {
    it('offers only avatar, gender and biography, preserves male gender and escapes saved content', (t) => {
        const { $ } = harness(t);
        assert.equal($('[name="gender"]:checked').value, '0');
        assert.equal($('[name="bio"]').value, '我喜欢编程。');
        assert.equal($('[name="backgroundImage"]'), null);
        assert.equal($('[name="qq"]'), null);
        const html = env.render('home_profile.html', {
            current: { bio: '</textarea><script>alert(1)</script>' }, avatarUrl: () => '/avatar', url: () => '/',
        });
        assert.equal(new JSDOM(html).window.document.querySelector('script'), null);
    });

    it('saves within the current domain and allows an intentionally empty biography', async (t) => {
        const h = harness(t);
        h.change('[name=bio]', '');
        await h.submit();
        assert.equal(h.calls.length, 1);
        assert.equal(h.calls[0].url, 'https://example.test/d/scratch/home/profile');
        assert.equal(h.calls[0].data.get('bio'), '');
        assert.equal(h.calls[0].data.get('gender'), '0');
        assert.equal(h.calls[0].data.get('file'), null);
        assert.match(h.$('[data-profile-status]').textContent, /资料已保存/);
        assert.equal(h.$('[data-profile-cancel]').textContent, '返回主页');
    });

    it('previews a prepared avatar without uploading until save, and supports undo', async (t) => {
        const h = harness(t);
        await h.selectFile();
        assert.equal(h.calls.length, 0);
        assert.equal(h.$('[data-profile-avatar]').src, 'blob:new-avatar');
        assert.equal(h.$('[data-profile-avatar-undo]').hidden, false);
        h.$('[data-profile-avatar-undo]').click();
        assert.equal(h.$('[data-profile-avatar]').src, 'https://example.test/avatar-old.png');
        assert.equal(h.revoked.length, 1);
        await h.submit();
        assert.equal(h.calls[0].data.get('file'), null);
    });

    it('uploads the prepared avatar with the other fields and replaces the preview with the saved URL', async (t) => {
        const h = harness(t);
        await h.selectFile();
        h.change('[name=bio]', '新的简介');
        await h.submit();
        const file = h.calls[0].data.get('file');
        assert.equal(file.name, 'avatar.png');
        assert.equal(file.type, 'image/png');
        assert.equal(h.calls[0].data.get('bio'), '新的简介');
        assert.equal(h.$('[data-profile-avatar]').src, 'https://example.test/avatar-saved.png?v=2');
        assert.equal(h.$('[data-profile-avatar-undo]').hidden, true);
        assert.equal(h.revoked.length, 1);
    });

    it('keeps edits and pending avatar when saving fails, then retries successfully', async (t) => {
        const h = harness(t);
        await h.selectFile();
        h.change('[name=bio]', '保留这段简介');
        h.setPost(async () => { throw new Error('连接中断，请重试。'); });
        await h.submit();
        assert.equal(h.$('[name=bio]').value, '保留这段简介');
        assert.equal(h.$('[data-profile-avatar]').src, 'blob:new-avatar');
        assert.equal(h.$('[data-profile-save]').disabled, false);
        assert.match(h.$('[data-profile-status]').textContent, /连接中断/);
        h.setPost(async () => ({ saved: true, avatarUrl: '/avatar-saved.png' }));
        await h.submit();
        assert.equal(h.calls[1].data.get('file').name, 'avatar.png');
        assert.match(h.$('[data-profile-status]').textContent, /资料已保存/);
    });

    it('prevents duplicate saves and blocks navigation during saving', async (t) => {
        const h = harness(t);
        let resolve;
        h.setPost(() => new Promise((done) => { resolve = done; }));
        h.change('[name=bio]', '更新');
        await h.submit();
        await h.submit();
        assert.equal(h.calls.length, 1);
        assert.equal(h.$('[data-profile-save]').disabled, true);
        const event = new h.dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
        h.$('[data-profile-cancel]').dispatchEvent(event);
        assert.equal(event.defaultPrevented, true);
        resolve({ saved: true, avatarUrl: '/new.png' });
        await settle();
    });

    it('blocks leaving unsaved work, and reports invalid avatar without losing the current preview', async (t) => {
        const h = harness(t);
        h.change('[name=bio]', '未保存');
        h.dom.window.confirm = () => false;
        const event = new h.dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
        h.$('[data-profile-cancel]').dispatchEvent(event);
        assert.equal(event.defaultPrevented, true);
        h.setPrepare(async () => { throw new Error('请选择完整有效的图片。'); });
        await h.selectFile();
        assert.match(h.$('[data-profile-avatar-status]').textContent, /有效的图片/);
        assert.equal(h.$('[data-profile-avatar]').src, 'https://example.test/avatar-old.png');
        assert.equal(h.$('[data-profile-save]').disabled, false);
    });
});

describe('independent profile password form', () => {
    it('starts collapsed and keeps profile and password controls in separate forms', (t) => {
        const h = harness(t);
        assert.equal(h.$('[data-profile-password-panel]').open, false);
        assert.equal(h.$('[data-profile-editor] [name=password]'), null);
        assert.equal(h.$('[data-profile-password-form] [name=bio]'), null);
        assert.match(h.$('[data-profile-password-form]').textContent, /所有设备将退出登录/);
    });
    it('rejects inconsistent new passwords before requesting authorization', async (t) => {
        const h = harness(t);
        h.fillPassword('OldPass123!', 'NewPass456!', 'Different789!');
        await h.submitPassword();
        assert.equal(h.accessCalls.length, 0);
        assert.equal(h.passwordCalls.length, 0);
        assert.match(h.$('[data-profile-password-status]').textContent, /不一致/);
        assert.equal(h.$('[name=verifyPassword]').value, 'Different789!');
    });
    it('asks to save a dirty profile first without silently saving it', async (t) => {
        const h = harness(t);
        h.change('[name=bio]', '未保存简介');
        h.fillPassword();
        await h.submitPassword();
        assert.equal(h.calls.length, 0);
        assert.equal(h.passwordCalls.length, 0);
        assert.match(h.$('[data-profile-password-status]').textContent, /先保存资料/);
    });
    it('uses only a nonsensitive GET before prompting for verification in a separate window', async (t) => {
        const h = harness(t);
        h.fillPassword();
        h.setAccess(async () => ({ url: '/d/scratch/user/sudo' }));
        await h.submitPassword();
        assert.deepEqual(h.accessCalls, ['/d/scratch/home/security']);
        assert.equal(h.passwordCalls.length, 0);
        assert.equal(h.$('[data-profile-password-verify]').hidden, false);
        assert.equal(h.$('[data-profile-password-verify]').target, '_blank');
        assert.equal(h.$('[data-profile-password-verify]').getAttribute('href'), '/d/scratch/home/security');
        assert.equal(h.$('[name=current]').value, 'OldPass123!');
        assert.equal(h.$('[name=password]').value, 'NewPass456!');
    });
    it('preserves sensitive drafts on failure and clears every field only on confirmed success', async (t) => {
        const h = harness(t);
        h.fillPassword();
        h.setPasswordPost(async () => { throw new Error('当前密码不正确'); });
        await h.submitPassword();
        assert.match(h.$('[data-profile-password-status]').textContent, /当前密码不正确/);
        assert.equal(h.$('[name=current]').value, 'OldPass123!');
        assert.equal(h.$('[name=password]').value, 'NewPass456!');
        assert.equal(h.$('[data-profile-password-save]').disabled, false);
        h.setPasswordPost(async () => ({ passwordChanged: true }));
        await h.submitPassword();
        assert.equal(h.calls.length, 0, 'Changing a password must never save profile fields');
        assert.equal(h.passwordCalls[1].url, 'https://example.test/d/scratch/home/profile/password');
        assert.deepEqual(Object.keys(h.passwordCalls[1].data), ['current', 'password', 'verifyPassword']);
        for (const name of ['current', 'password', 'verifyPassword']) assert.equal(h.$(`[name=${name}]`).value, '');
        assert.match(h.$('[data-profile-password-status]').textContent, /所有设备已退出登录/);
        assert.equal(h.$('[data-profile-password-login]').hidden, false);
        assert.equal(h.$('[data-profile-password-save]').hidden, true);
        assert.equal(h.$('[data-profile-save]').disabled, true);
    });
    it('keeps drafts and asks for verification if authorization expires after the preflight', async (t) => {
        const h = harness(t);
        h.fillPassword();
        h.setPasswordPost(async () => ({ verificationRequired: true }));
        await h.submitPassword();
        assert.equal(h.accessCalls.length, 1, 'No compensating GET may be necessary to remove stored passwords');
        assert.equal(h.$('[data-profile-password-verify]').hidden, false);
        assert.equal(h.$('[name=password]').value, 'NewPass456!');
        assert.equal(h.$('[data-profile-password-login]').hidden, true);
    });
    it('deduplicates submissions and blocks profile changes and logout while changing the password', async (t) => {
        let logoutCalls = 0;
        const h = harness(t, (doc) => {
            doc.body.insertAdjacentHTML('beforeend', '<a href="/logout" name="nav_logout">退出登录</a>');
            doc.addEventListener('click', (event) => { if (event.target.matches('[name=nav_logout]')) logoutCalls++; });
        });
        let resolve;
        h.setPasswordPost(() => new Promise((done) => { resolve = done; }));
        h.fillPassword();
        await h.submitPassword();
        await h.submitPassword();
        await h.submit();
        h.$('[name=nav_logout]').click();
        assert.equal(logoutCalls, 0);
        assert.equal(h.passwordCalls.length, 1);
        assert.equal(h.calls.length, 0);
        assert.equal(h.$('[name=bio]').disabled, true);
        resolve({ passwordChanged: true });
        await settle();
    });
    it('clears sensitive fields when explicitly cancelling, without affecting profile fields', (t) => {
        const h = harness(t);
        h.fillPassword();
        h.$('[data-profile-password-panel]').open = true;
        h.$('[data-profile-password-cancel]').click();
        assert.equal(h.$('[data-profile-password-panel]').open, false);
        assert.equal(h.$('[name=current]').value, '');
        assert.equal(h.$('[name=bio]').value, '我喜欢编程。');
    });
    for (const name of ['nav_logout', 'nav_switch_account']) {
        it(`guards ${name} before delegated actions and replays its existing action exactly once after confirmation`, async (t) => {
            let actions = 0;
            const h = harness(t, (doc) => {
                doc.body.insertAdjacentHTML('beforeend', `<a href="${name === 'nav_logout' ? '/logout' : '#'}" name="${name}">离开</a>`);
                doc.addEventListener('click', (event) => {
                    if (event.target.matches(`[name=${name}]`)) {
                        event.preventDefault();
                        actions++;
                    }
                });
            });
            h.change('[name=bio]', '保护草稿');
            h.$(`[name=${name}]`).click();
            await settle();
            assert.equal(actions, 0, 'Capture guard must stop even previously registered bubble listeners');
            h.setConfirm(async () => 'yes');
            h.$(`[name=${name}]`).click();
            await settle();
            assert.equal(actions, 1, 'Use the existing POST/action listener, never navigate directly to its href');
        });
    }
});

describe('profile save boundary', () => {
    function backend() {
        const source = fs.readFileSync(path.join(root, 'packages/hydrooj/src/handler/home.ts'), 'utf8');
        const section = source.slice(source.indexOf('class HomeProfileHandler'), source.indexOf('class HomeSettingsHandler'));
        const handlerCode = transformSync(`${section}\nmodule.exports = HomeProfileHandler;`, {
            loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
        }).code;
        const writes = [];
        const uploads = [];
        const mod = { exports: {} };
        vm.runInNewContext(handlerCode, {
            module: mod, exports: mod.exports, Handler: class {}, Types: {}, param: () => () => {},
            ValidationError: Error, DOMAIN_AVATAR_MAX_SIZE: 8 * 1024 * 1024,
            readFile: async () => Buffer.from('valid image'),
            normalizeDomainAvatar: (bytes) => bytes,
            user: { setById: async (uid, fields) => writes.push({ uid, fields: JSON.parse(JSON.stringify(fields)) }) },
            storage: { put: async (...args) => uploads.push(args) },
            ObjectId: class { toHexString() { return 'version'; } },
            avatar: (value) => value,
        });
        const HomeProfileHandler = mod.exports;
        const handler = new HomeProfileHandler();
        Object.assign(handler, { user: { _id: 4, avatar: 'old' }, request: { files: {} }, response: {} });
        return { handler, writes, uploads };
    }

    it('updates only the authenticated account and ignores forged IDs, roles, avatars and backgrounds', async () => {
        const h = backend();
        await h.handler.post({ uid: 1, priv: -1, avatar: 'url:evil', backgroundImage: 'evil' }, '', 0);
        assert.deepEqual(h.writes, [{ uid: 4, fields: { bio: '', gender: 0 } }]);
        assert.equal(h.handler.response.body.saved, true);
    });

    it('validates before persisting any profile or image data', async () => {
        const h = backend();
        await assert.rejects(h.handler.post({}, 'bio', 9));
        await assert.rejects(h.handler.post({}, 'x'.repeat(10001), 0));
        h.handler.request.files.file = { size: 9 * 1024 * 1024 };
        await assert.rejects(h.handler.post({}, 'bio', 0));
        assert.equal(h.writes.length, 0);
        assert.equal(h.uploads.length, 0);
    });

    it('stores a normalized avatar owned by the signed-in account and returns a fresh preview URL', async () => {
        const h = backend();
        h.handler.request.files.file = { size: 10, filepath: '/tmp/upload' };
        await h.handler.post({ uid: 1 }, 'bio', 1);
        assert.equal(h.uploads[0][0], 'user/4/.avatar.png');
        assert.equal(h.uploads[0][2], 4);
        assert.equal(h.writes[0].fields.avatar, 'url:/file/4/.avatar.png?v=version');
        assert.equal(h.handler.response.body.avatarUrl, 'url:/file/4/.avatar.png?v=version');
    });
});
