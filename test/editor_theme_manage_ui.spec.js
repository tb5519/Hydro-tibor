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
                return options.post ? options.post(url, body) : { theme: { ...fixture(), name: body.name, palette: JSON.parse(body.palette), slots: JSON.parse(body.slots), controls: JSON.parse(body.controls || '{}'), posterAssetId: body.posterAssetId, previewAssetId: body.previewAssetId } };
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

    it('designs full image controls with dimensions and interaction states without changing an old package’s placements', async () => {
        const h = harness();
        try {
            h.get('[data-theme-id]').click();
            assert.equal(h.get('[data-theme-control-asset]').value, '');
            assert.equal(h.get('[data-theme-control-asset] option[value="clip"]'), null);
            assert.equal(h.get('[data-theme-control-width]').disabled, true);
            assert.equal(h.get('[data-theme-control-select] option[value="settingsTab"]').textContent, '设置入口');
            h.change('[data-theme-control-asset]', 'button');
            h.change('[data-theme-control-width]', '210');
            h.change('[data-theme-control-height]', '72');
            h.change('[data-theme-control-hover]', 'bg');
            h.change('[data-theme-control-active]', 'reference');
            h.change('[data-theme-control-select]', 'recordsTitle');
            h.change('[data-theme-control-asset]', 'reference');
            h.change('[data-theme-control-select]', 'settingsTab');
            h.change('[data-theme-control-asset]', 'button');
            h.change('[data-theme-control-width]', '32');
            h.change('[data-theme-control-height]', '32');
            const settingsImage = h.get('[data-theme-control="settingsTab"] img');
            settingsImage.dispatchEvent(new h.window.Event('load'));
            assert.equal(h.get('[data-theme-control="settingsTab"]').classList.contains('has-control-image'), true);
            assert.equal(h.get('[data-theme-control-count]').textContent, '3 处已定制');
            assert.match(h.get('[data-theme-draft-state]').textContent, /未发布的修改/);
            h.get('[data-theme-form]').dispatchEvent(new h.window.Event('submit', { cancelable: true }));
            await flush();
            const body = h.requests[0].body;
            assert.equal(body.operation, 'publish');
            assert.equal(body.themeId, 'badge:6');
            assert.deepEqual(JSON.parse(body.controls).run, { assetId: 'button', width: 210, height: 72, hoverAssetId: 'bg', activeAssetId: 'reference' });
            assert.deepEqual(JSON.parse(body.controls).recordsTitle, { assetId: 'reference', width: 120, height: 40 });
            assert.deepEqual(JSON.parse(body.controls).settingsTab, { assetId: 'button', width: 32, height: 32 });
            assert.deepEqual(JSON.parse(body.slots), { ...fixture().slots, submitButton: { ...fixture().slots.submitButton, position: 'center' } });
            h.change('[data-theme-control-select]', 'run');
            assert.equal(h.get('[data-theme-control-width]').value, '210');
            assert.equal(h.get('[data-theme-control-hover]').value, 'bg');
            h.change('[data-theme-control-asset]', '');
            assert.equal(h.get('[data-theme-control-width]').disabled, true);
            assert.equal(h.get('[data-theme-control-count]').textContent, '2 处已定制');
            h.get('[data-theme-form]').dispatchEvent(new h.window.Event('submit', { cancelable: true }));
            await flush();
            assert.equal(JSON.parse(h.requests[1].body.controls).run, undefined);
        } finally { h.close(); }
    });

    it('keeps a working text fallback until the PNG loads, previews hover and press artwork, and retains dynamic language/data', () => {
        const theme = fixture();
        theme.controls = {
            run: { assetId: 'button', width: 180, height: 64, hoverAssetId: 'bg', activeAssetId: 'reference' },
            language: { assetId: 'button', width: 32, height: 32 },
            emptyOutput: { assetId: 'reference', width: 200, height: 40 },
        };
        const h = harness({ themes: [theme] });
        try {
            h.get('[data-theme-id]').click();
            const run = h.get('[data-theme-control="run"]');
            const image = run.querySelector('img');
            assert.equal(run.classList.contains('has-control-image'), false);
            assert.match(run.querySelector('.etm__control-fallback').textContent, /运行自测/);
            image.dispatchEvent(new h.window.Event('load'));
            assert.equal(run.classList.contains('has-control-image'), true);
            assert.equal(run.style.getPropertyValue('--etm-control-width'), '180px');
            run.dispatchEvent(new h.window.Event('pointerenter'));
            assert.match(image.src, /bg\.jpg$/);
            run.dispatchEvent(new h.window.Event('pointerdown'));
            assert.match(image.src, /reference\.png$/);
            run.dispatchEvent(new h.window.Event('pointerleave'));
            assert.match(image.src, /button\.png$/);
            image.dispatchEvent(new h.window.Event('error'));
            assert.equal(run.classList.contains('has-control-image'), false);
            assert.equal(h.get('[data-theme-dynamic-language]').textContent, 'C++14');
            assert.equal(h.get('[data-theme-control="language"]').classList.contains('etm__preview-language'), true);
            assert.equal(h.get('[data-theme-preview-output]').hidden, true);
            h.get('[data-theme-preview-state="result"]').click();
            assert.equal(h.get('[data-theme-preview-output]').hidden, false);
            assert.equal(h.get('[data-theme-preview-output]').textContent, 'Hello, World!');
            assert.equal(h.get('[data-theme-control="emptyOutput"]').parentElement.hidden, true);
            assert.match(h.get('.etm__preview-record-row').textContent, /3 MB/);
        } finally { h.close(); }
    });

    it('normalizes relative protected media URLs before first image load and interaction state changes', () => {
        const theme = fixture();
        theme.assets = theme.assets.map((asset) => ({ ...asset, url: `/d/S0001/code-editor/theme-asset/version/${asset.id}` }));
        theme.controls = { pretestTitle: { assetId: 'button', width: 120, height: 40, hoverAssetId: 'bg', activeAssetId: 'reference' } };
        const h = harness({ themes: [theme] });
        try {
            h.get('[data-theme-id]').click();
            const title = h.get('[data-theme-control="pretestTitle"]');
            const image = title.querySelector('img');
            assert.equal(image.src, 'https://school.example/d/S0001/code-editor/theme-asset/version/button');
            assert.equal(title.dataset.controlSource, image.src);
            image.dispatchEvent(new h.window.Event('load'));
            assert.equal(title.classList.contains('has-control-image'), true);
            title.dispatchEvent(new h.window.Event('pointerenter'));
            assert.equal(title.dataset.controlSource, image.src);
            assert.match(image.src, /\/bg$/);
            image.dispatchEvent(new h.window.Event('load'));
            assert.equal(title.classList.contains('has-control-image'), true);
            title.dispatchEvent(new h.window.Event('pointerdown'));
            assert.match(image.src, /\/reference$/);
            title.dispatchEvent(new h.window.Event('pointerleave'));
            assert.match(image.src, /\/button$/);
        } finally { h.close(); }
    });

    it('previews the same strong reading veil and readable syntax colors used by the actual image theme', () => {
        const theme = { ...fixture(), base: 'cloud', overlay: 0.35, palette: {
            surface: '#f4f8fc', text: '#d0ddeb', comment: '#dce8f4', keyword: '#b2a2ed', string: '#b6dfcd', number: '#ecc597',
        } };
        const h = harness({ themes: [theme] });
        try {
            h.get('[data-theme-id]').click();
            assert.equal(h.get('[data-theme-preview-veil]').style.opacity, '0.94');
            assert.equal(h.get('[data-theme-overlay-value]').textContent, '94%');
            assert.equal(h.get('[data-theme-overlay]').min, '0.94');
            assert.equal(h.get('[data-theme-preview]').style.getPropertyValue('--etm-surface'), '#f4f8fc');
            assert.notEqual(h.get('[data-theme-preview]').style.getPropertyValue('--etm-text'), theme.palette.text);
            assert.notEqual(h.get('[data-theme-preview]').style.getPropertyValue('--etm-keyword'), theme.palette.keyword);
            assert.match(h.get('[data-theme-region="panel"]').style.backgroundImage, /0\.94/);
            h.change('[data-theme-overlay]', '0.98', 'input');
            assert.equal(h.get('[data-theme-preview-veil]').style.opacity, '0.98');
            h.change('[data-theme-base]', 'ocean');
            assert.equal(h.get('[data-theme-overlay]').min, '0.92');
            assert.equal(h.get('[data-theme-preview]').style.getPropertyValue('--etm-surface'), '#182332');
        } finally { h.close(); }
    });

    it('normalizes optional control artwork, excludes videos, and bounds visible dimensions', () => {
        const theme = fixture();
        theme.controls = {
            run: { assetId: 'clip', width: 120, height: 40 },
            submit: { assetId: 'button', width: 99999, height: 1, hoverAssetId: 'clip', activeAssetId: 'missing' },
            recordsTitle: { assetId: 'reference' },
            unknownControl: { assetId: 'button' },
        };
        const h = harness({ themes: [theme] });
        try {
            h.get('[data-theme-id]').click();
            assert.equal(h.get('[data-theme-control-count]').textContent, '2 处已定制');
            assert.equal(h.get('[data-theme-control-asset]').value, '');
            h.change('[data-theme-control-select]', 'submit');
            assert.equal(h.get('[data-theme-control-width]').value, '320');
            assert.equal(h.get('[data-theme-control-height]').value, '16');
            assert.equal(h.get('[data-theme-control-hover]').value, '');
            assert.equal(h.get('[data-theme-control-active]').value, '');
            h.change('[data-theme-control-select]', 'recordsTitle');
            assert.equal(h.get('[data-theme-control-width]').value, '120');
            assert.equal(h.get('[data-theme-control-height]').value, '40');
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
