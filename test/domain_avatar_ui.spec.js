const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const jqueryFactory = require('jquery');
const { JSDOM } = require('jsdom');

const uiRoot = path.resolve(__dirname, '../packages/ui-default');
const compile = (entry) => esbuild.buildSync({
    entryPoints: [path.join(uiRoot, entry)], write: false, bundle: true, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const pageCode = compile('pages/domain_edit.page.tsx');
const imageCode = compile('utils/domain_avatar.ts');
const templateFile = fs.readFileSync(path.join(uiRoot, 'templates/domain_edit.html'), 'utf8');
const template = templateFile.slice(templateFile.indexOf('<template'), templateFile.indexOf('</template>') + '</template>'.length)
    .replace(/\{\{ url\('domain_avatar_upload'\) \}\}/, '/d/class-a/domain/avatar')
    .replace(/\{\{ avatarUrl\(current.avatar\).*?\}\}/, '/old-avatar.png');
const pending = () => {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
};

function harness(options = {}) {
    const dom = new JSDOM(`<!doctype html><html><body><form>
      <div class="form__item"><label>头像<div class="textbox-container"><input name="avatar" value="url:/old-avatar.png"></div></label></div>
      <input name="langs"><input type="submit" value="保存全部">
    </form>${template}</body></html>`, { url: 'https://example.test/d/class-a/domain/edit' });
    const $ = jqueryFactory(dom.window);
    const calls = { uploads: [], success: [], error: [], revoked: [], prepare: [] };
    let objectId = 0;
    const dependencies = {
        jquery: $,
        'vj/components/autocomplete/LanguageSelectAutoComplete': { getOrConstruct: () => {} },
        'vj/components/notification': { success: (message) => calls.success.push(message), error: (message) => calls.error.push(message) },
        'vj/misc/Page': { NamedPage: class {} },
        'vj/utils': { request: { postFile: async (...args) => {
            calls.uploads.push(args);
            return options.upload ? options.upload(...args) : { avatar: 'url:/new-avatar.png', avatarUrl: '/new-avatar.png' };
        } } },
        'vj/utils/domain_avatar': { prepareDomainAvatar: async (file) => {
            calls.prepare.push(file);
            if (options.prepare) return options.prepare(file);
            return new dom.window.Blob(['normalized-image'], { type: 'image/png' });
        } },
    };
    const mod = { exports: {} };
    vm.runInNewContext(pageCode, {
        module: mod, exports: mod.exports, document: dom.window.document, FormData: dom.window.FormData,
        URL: { createObjectURL: () => `blob:test-${++objectId}`, revokeObjectURL: (url) => calls.revoked.push(url) },
        require: (name) => dependencies[name] || require(name),
    });
    mod.exports.bindDomainAvatarUpload();
    const select = () => {
        const file = new dom.window.File(['image'], 'my-photo.jpg', { type: 'image/jpeg' });
        const input = dom.window.document.querySelector('.domain-avatar-control__file');
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });
        $(input).trigger('change');
    };
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    return { dom, $, calls, select, flush, bind: mod.exports.bindDomainAvatarUpload, cleanup: () => dom.window.close() };
}

describe('domain avatar upload controls', () => {
    it('shows only the preview and upload control, keeps the field hidden and avoids duplicate controls', () => {
        const app = harness();
        try {
            assert.ok(app.dom.window.document.querySelector('.domain-avatar-control input[name="avatar"]'));
            assert.equal(app.dom.window.document.querySelector('label').hasAttribute('for'), false);
            assert.equal(app.dom.window.document.querySelector('label').textContent, '域头像');
            assert.equal(app.dom.window.document.querySelector('[name="avatar"]').type, 'hidden');
            assert.equal(app.dom.window.document.querySelectorAll('[name="avatar"]:not([type="hidden"])').length, 0);
            assert.equal(app.dom.window.document.querySelector('.domain-avatar-control').getAttribute('aria-labelledby'), 'domain-avatar-label');
            assert.equal(app.dom.window.document.querySelector('.domain-avatar-control').getAttribute('role'), 'group');
            assert.equal(app.dom.window.document.querySelector('label input'), null);
            assert.equal(app.dom.window.document.querySelector('.domain-avatar-control__preview').getAttribute('src'), '/old-avatar.png');
            app.bind();
            assert.equal(app.dom.window.document.querySelectorAll('.domain-avatar-control__button').length, 1);
        } finally { app.cleanup(); }
    });

    it('uploads only to the current domain and syncs the saved field, preview and success message', async () => {
        const app = harness();
        try {
            app.select();
            await app.flush();
            assert.equal(app.calls.uploads[0][0], '/d/class-a/domain/avatar');
            const file = app.calls.uploads[0][1].get('file');
            assert.equal(file.name, 'avatar.png');
            assert.equal(file.type, 'image/png');
            assert.equal(app.$('[name="avatar"]').val(), 'url:/new-avatar.png');
            assert.equal(app.$('.domain-avatar-control__preview').attr('src'), '/new-avatar.png');
            assert.match(app.$('.domain-avatar-control__status').text(), /已更新并生效/);
            assert.equal(app.$(':submit').prop('disabled'), false);
            assert.equal(app.$('[name="avatar"]').prop('disabled'), false);
            assert.ok(app.$('form').serialize().includes('avatar=url%3A%2Fnew-avatar.png'));
            assert.equal(app.calls.revoked.length, 1);
        } finally { app.cleanup(); }
    });

    it('blocks saving and duplicate uploads while processing the new image', async () => {
        const gate = pending();
        const app = harness({ upload: () => gate.promise });
        try {
            app.select();
            await app.flush();
            assert.equal(app.$(':submit').prop('disabled'), true);
            assert.equal(app.$('[name="avatar"]').prop('disabled'), true);
            assert.equal(app.$('.domain-avatar-control__button').prop('disabled'), true);
            const event = app.$.Event('submit');
            app.$('form').triggerHandler(event);
            assert.equal(event.isDefaultPrevented(), true);
            app.select();
            assert.equal(app.calls.uploads.length, 1);
            gate.resolve({ avatar: 'url:/saved.png', avatarUrl: '/saved.png' });
            await app.flush();
            assert.equal(app.$(':submit').prop('disabled'), false);
        } finally { app.cleanup(); }
    });

    it('keeps the old field and preview after failures, restores controls and gives a clear retry message', async () => {
        const app = harness({ upload: async () => { throw new Error('上传失败，请稍后重试。'); } });
        try {
            app.select();
            await app.flush();
            assert.equal(app.$('[name="avatar"]').val(), 'url:/old-avatar.png');
            assert.equal(app.$('.domain-avatar-control__preview').attr('src'), '/old-avatar.png');
            assert.match(app.$('.domain-avatar-control__status.is-error').text(), /上传失败/);
            assert.equal(app.$('.domain-avatar-control__button').prop('disabled'), false);
            assert.equal(app.$(':submit').prop('disabled'), false);
            assert.equal(app.calls.success.length, 0);
            assert.equal(app.calls.revoked.length, 1);
        } finally { app.cleanup(); }
    });

    it('does not send a request when the selected image fails local validation', async () => {
        const app = harness({ prepare: async () => { throw new Error('图片不能超过 8 MB'); } });
        try {
            app.select();
            await app.flush();
            assert.equal(app.calls.uploads.length, 0);
            assert.match(app.calls.error[0], /8 MB/);
        } finally { app.cleanup(); }
    });
});

function imageHarness(options = {}) {
    const calls = { draws: [], revoked: [], decoded: 0 };
    const result = new Blob(['normalized'], { type: 'image/png' });
    const canvas = {
        getContext: () => ({ drawImage: (...args) => calls.draws.push(args) }),
        toBlob: (callback, type) => { assert.equal(type, 'image/png'); callback(result); },
    };
    class Image {
        naturalWidth = options.width || 1200;
        naturalHeight = options.height || 800;
        async decode() {
            calls.decoded += 1;
            if (options.corrupt) {
                const error = new Error('Bad image');
                error.name = 'EncodingError';
                throw error;
            }
        }
    }
    const mod = { exports: {} };
    vm.runInNewContext(imageCode, {
        module: mod, exports: mod.exports, require, Image,
        document: { createElement: (name) => { assert.equal(name, 'canvas'); return canvas; } },
        URL: { createObjectURL: () => 'blob:source', revokeObjectURL: (url) => calls.revoked.push(url) },
    });
    return { ...mod.exports, calls, canvas, result };
}

describe('domain avatar image preparation', () => {
    it('decodes, crops and scales a valid image to a square PNG and releases the temporary URL', async () => {
        const h = imageHarness();
        const result = await h.prepareDomainAvatar({ size: 3000, type: 'image/jpeg' });
        assert.equal(result, h.result);
        assert.equal(h.canvas.width, 512);
        assert.equal(h.canvas.height, 512);
        assert.deepEqual(h.calls.draws[0].slice(1), [200, 0, 800, 800, 0, 0, 512, 512]);
        assert.deepEqual(h.calls.revoked, ['blob:source']);
    });

    it('rejects unsupported, oversized or corrupt images before uploading', async () => {
        const h = imageHarness();
        await assert.rejects(h.prepareDomainAvatar({ size: 9 * 1024 * 1024, type: 'image/png' }), /8 MB/);
        await assert.rejects(h.prepareDomainAvatar({ size: 200, type: 'image/svg\+xml' }), /JPG、PNG 或 WebP/);
        assert.equal(h.calls.decoded, 0);
        const bad = imageHarness({ corrupt: true });
        await assert.rejects(bad.prepareDomainAvatar({ size: 300, type: 'image/png' }), /完整有效的图片/);
        assert.deepEqual(bad.calls.revoked, ['blob:source']);
    });
});
