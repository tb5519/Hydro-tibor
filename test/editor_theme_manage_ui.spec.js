const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');

const ui = path.resolve(__dirname, '../packages/ui-default');
const source = esbuild.transformSync(fs.readFileSync(path.join(ui, 'pages/editor_theme_manage.page.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const runtimeSource = esbuild.transformSync(fs.readFileSync(path.join(ui, 'components/scratchpad/themes.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const template = fs.readFileSync(path.join(ui, 'templates/editor_theme_manage.html'), 'utf8');
const Loader = nunjucks.Loader.extend({ getSource: () => ({ src: '{% block manage_content %}{% endblock %}', path: 'manage_base.html', noCache: true }) });
const html = new nunjucks.Environment(new Loader(), { autoescape: true }).renderString(template, { editorThemeBaseTemplate: 'manage_base.html' });
const flush = () => new Promise(setImmediate);
const fixture = (id = 'badge:6') => ({
    id, badgeId: 6, name: '疾风剑客', base: 'ocean', overlay: .86, palette: {},
    slots: { background: { assetId: 'bg', fit: 'cover', position: 'right top' }, submitButton: { assetId: 'button', fit: 'stretch' } },
    previewAssetId: 'reference',
    assets: [
        { id: 'bg', name: '我的背景.jpg', type: 'image/jpeg', url: 'https://objects.example/theme/bg.jpg' },
        { id: 'button', name: '按钮.png', type: 'image/png', url: 'https://objects.example/theme/button.png' },
        { id: 'reference', name: '完整效果.png', type: 'image/png', url: 'https://objects.example/theme/reference.png' },
        { id: 'clip', name: '流动背景.mp4', type: 'video/mp4', url: 'https://objects.example/theme/bg.mp4' },
    ],
});
function harness(options = {}) {
    const dom = new JSDOM(html, { url: 'https://school.example/manage/editor-themes' });
    const { window } = dom;
    window.HTMLMediaElement.prototype.pause = () => {};
    window.HTMLMediaElement.prototype.play = () => Promise.resolve();
    window.HTMLMediaElement.prototype.load = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.confirm = () => true;
    const requests = [];
    const uploads = [];
    class FakeXHR {
        upload = {};
        open(method, url) { this.method = method; this.url = url; }
        setRequestHeader() {}
        send(body) { this.body = body; uploads.push(this); }
        abort() { this.onabort?.(); }
        respond(body, status = 200) { this.status = status; this.responseText = JSON.stringify(body); this.onload(); }
    }
    const runtime = { exports: {} };
    vm.runInNewContext(runtimeSource, {
        require(id) {
            if (id === 'react') return { useSyncExternalStore() {} };
            if (id === 'vj/components/notification') return {};
            if (id === 'vj/utils') return {};
            return require(id);
        }, module: runtime, exports: runtime.exports, window,
    });
    const mod = { exports: {} };
    vm.runInNewContext(source, {
        require(id) {
            if (id === 'vj/misc/Page') return { NamedPage: class {} };
            if (id === '../components/scratchpad/themes') return runtime.exports;
            if (id === 'vj/utils') return { request: { post: async (url, body) => {
                requests.push({ url, body });
                return options.post ? options.post(url, body) : { theme: { ...fixture(), name: body.name, palette: JSON.parse(body.palette), slots: JSON.parse(body.slots), posterAssetId: body.posterAssetId, previewAssetId: body.previewAssetId } };
            } } };
            return require(id);
        },
        module: mod, exports: mod.exports, window, document: window.document, URL: window.URL, Option: window.Option,
        FormData: window.FormData, XMLHttpRequest: FakeXHR,
        UiContext: { editorThemeManage: { url: window.location.href, badges: [{ id: 6, title: '疾风剑客' }, { id: 7, title: '幸运女神' }], themes: options.themes ?? [fixture()] } },
    });
    mod.exports.bindEditorThemeManage();
    const get = (selector) => window.document.querySelector(selector);
    const change = (selector, value, event = 'change') => { const input = get(selector); input.value = value; input.dispatchEvent(new window.Event(event, { bubbles: true })); };
    const close = () => { window.dispatchEvent(new window.Event('pagehide')); window.close(); };
    return { dom, window, get, change, requests, uploads, close };
}

describe('teacher badge image theme designer', () => {
    it('restores a published package, its exact placement and complete screenshot without exposing video to image-only slots', () => {
        const h = harness();
        try {
            assert.equal(h.get('[data-theme-form]').hidden, true);
            h.get('[data-theme-id]').click();
            assert.equal(h.get('[data-theme-name]').value, '疾风剑客');
            assert.equal(h.get('[data-theme-badge]').disabled, true);
            assert.equal(h.get('[data-theme-export]').hidden, false);
            assert.equal(new URL(h.get('[data-theme-export]').href).searchParams.get('export'), 'badge:6');
            assert.equal(h.get('[data-theme-position]').value, 'right top');
            assert.equal(h.get('[data-theme-reference]').hidden, false);
            assert.match(h.get('[data-theme-reference-image]').src, /reference\.png$/);
            assert.equal(h.get('[data-theme-reference-asset]').value, 'reference');
            assert.equal(h.get('[data-theme-asset] option[value="clip"]').textContent, '视频 · 流动背景.mp4');
            h.get('[data-theme-slot="submitButton"]').click();
            assert.equal(h.get('[data-theme-asset] option[value="clip"]'), null);
            assert.equal(h.get('[data-theme-fit]').value, 'stretch');
            assert.match(h.get('[data-theme-region="submitButton"]').style.backgroundImage, /button\.png/);
        } finally { h.close(); }
    });

    it('uploads one arbitrary-named ZIP and publishes the mapping, screenshot and poster chosen by the teacher', async () => {
        const h = harness({ themes: [] });
        try {
            const file = new h.window.File(['a zip'], '随意命名的素材.zip', { type: 'application/zip' });
            Object.defineProperty(h.get('[data-theme-upload]'), 'files', { configurable: true, value: [file] });
            h.get('[data-theme-upload]').dispatchEvent(new h.window.Event('change'));
            assert.equal(h.uploads.length, 1);
            assert.equal(h.uploads[0].body.get('operation'), 'upload');
            assert.equal(h.uploads[0].body.get('file').name, file.name);
            const draft = { ...fixture('draft-one'), badgeId: undefined };
            h.uploads[0].respond({ draft });
            await flush();
            assert.equal(h.get('[data-theme-form]').hidden, false);
            assert.equal(h.get('[data-theme-badge]').disabled, false);
            assert.equal(h.get('[data-theme-export]').hidden, true);
            assert.equal(h.get('[data-theme-export]').hasAttribute('href'), false);
            h.change('[data-theme-badge]', '7');
            h.change('[data-theme-name]', '我的全新主题', 'input');
            h.get('[data-theme-slot="toolbar"]').click();
            h.change('[data-theme-asset]', 'button');
            h.change('[data-theme-fit]', 'tile');
            h.change('[data-theme-position]', 'left bottom');
            h.change('[data-theme-reference-asset]', 'bg');
            h.change('[data-theme-poster-asset]', 'reference');
            h.get('[data-theme-form]').dispatchEvent(new h.window.Event('submit', { cancelable: true }));
            await flush();
            const body = h.requests[0].body;
            assert.equal(body.operation, 'publish');
            assert.equal(body.draftId, 'draft-one');
            assert.equal(body.badgeId, 7);
            assert.equal(body.name, '我的全新主题');
            assert.deepEqual(JSON.parse(body.slots).toolbar, { assetId: 'button', fit: 'tile', position: 'left bottom' });
            assert.equal(body.previewAssetId, 'bg');
            assert.equal(body.posterAssetId, 'reference');
            assert.match(h.get('[data-theme-message]').textContent, /已发布/);
            assert.equal(h.get('[data-theme-badge]').disabled, true);
            assert.equal(h.get('[data-theme-export]').hidden, false);
        } finally { h.close(); }
    });

    it('preserves an edited design after publication fails and does not unlock a published badge binding', async () => {
        const h = harness({ post: async () => { throw new Error('对象存储暂不可用'); } });
        try {
            h.get('[data-theme-id]').click();
            h.change('[data-theme-name]', '保留这份设计', 'input');
            h.get('[data-theme-form]').dispatchEvent(new h.window.Event('submit', { cancelable: true }));
            await flush();
            assert.equal(h.get('[data-theme-name]').value, '保留这份设计');
            assert.equal(h.get('[data-theme-badge]').disabled, true);
            assert.match(h.get('[data-theme-message]').textContent, /对象存储暂不可用/);
            assert.equal(h.get('[data-theme-publish]').disabled, false);
            assert.match(h.get('[data-theme-draft-state]').textContent, /未发布的修改/);
        } finally { h.close(); }
    });

    it('unpublishes only after its inline confirmation and sends the original badge binding', async () => {
        const h = harness({ post: async () => ({ removed: true }) });
        try {
            h.get('[data-theme-id]').click();
            h.get('[data-theme-remove]').click();
            assert.equal(h.requests.length, 0);
            assert.equal(h.get('[data-theme-remove-confirm]').hidden, false);
            h.change('[data-theme-badge]', '7'); // A modified disabled field still must not change which publication is removed.
            h.get('[data-theme-remove-apply]').click();
            await flush();
            assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].body)), { operation: 'remove', badgeId: 6 });
            assert.equal(h.get('[data-theme-form]').hidden, true);
            assert.equal(h.get('[data-theme-count]').textContent, '0');
        } finally { h.close(); }
    });

    it('renders uploaded names as text and retains draft when an invalid ZIP is rejected', () => {
        const unsafe = fixture(); unsafe.name = '<img src=x onerror=alert(1)>'; unsafe.assets[0].name = '<script>run()</script>.png';
        const h = harness({ themes: [unsafe] });
        try {
            assert.equal(h.get('[data-theme-list] img'), null);
            assert.equal(h.get('[data-theme-list] strong').textContent, unsafe.name);
            h.get('[data-theme-id]').click();
            assert.equal(h.get('[data-theme-assets] script'), null);
            const file = new h.window.File(['data'], '图片.png', { type: 'image/png' });
            Object.defineProperty(h.get('[data-theme-upload]'), 'files', { configurable: true, value: [file] });
            h.get('[data-theme-upload]').dispatchEvent(new h.window.Event('change'));
            assert.equal(h.uploads.length, 0);
            assert.equal(h.get('[data-theme-name]').value, unsafe.name);
            assert.match(h.get('[data-theme-message]').textContent, /ZIP/);
        } finally { h.close(); }
    });
});
