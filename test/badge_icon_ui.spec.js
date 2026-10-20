const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const root = path.resolve(__dirname, '..');
const compile = (file) => transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const binder = compile('packages/ui-default/components/badge_icon.ts');
const uploader = compile('addons/badge-for-hydrooj/frontend/badge_icon_upload.ts');
const badge = { id: 7, href: '/badge/7', displayName: '夏日剑客', backgroundColor: '#123456', fontColor: '#abcdef', tooltip: '夏天的专属徽章' };
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function moduleFor(source, window, globals = {}) {
    const module = { exports: {} };
    vm.runInNewContext(source, { module, exports: module.exports, document: window.document,
        HTMLImageElement: window.HTMLImageElement, Element: window.Element, MutationObserver: window.MutationObserver,
        URL: window.URL, ...globals });
    return module.exports;
}
function imageState(image, valid, complete = true) {
    Object.defineProperties(image, { complete: { value: complete, configurable: true },
        naturalWidth: { value: valid ? 500 : 0, configurable: true }, naturalHeight: { value: valid ? 80 : 0, configurable: true } });
}
function renderMacro(templateRoot, macro, data) {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(root, templateRoot)), { autoescape: true });
    return env.renderString(`{% import 'components/user.html' as user with context %}{{ user.${macro} }}`, {
        ...data, handler: { user: { hasPerm: () => false } }, perm: {}, PRIV: {},
        url: (_, opts) => `/user/${opts.uid}`, avatarUrl: () => '/avatar.png', _: (s) => s,
    });
}

describe('custom badge image presentation', () => {
    for (const templates of ['packages/ui-default/templates', 'addons/badge-for-hydrooj/templates']) {
        it(`keeps the original label and colors without an icon in ${templates}`, () => {
            const dom = new JSDOM(renderMacro(templates, 'render_custom_badge_item(badge)', { badge }));
            try {
                const pill = dom.window.document.querySelector('.user-profile-badge');
                assert.equal(pill.textContent.trim(), badge.displayName);
                assert.equal(pill.querySelector('img'), null);
                assert.equal(pill.style.backgroundColor, 'rgb(18, 52, 86)');
                assert.equal(pill.getAttribute('href'), badge.href);
            } finally { dom.window.close(); }
        });
        it(`uses a full artwork replacement and keeps its accessible name in ${templates}`, () => {
            const iconBadge = { ...badge, iconUrl: '/badge/7/icon-image?v=2' };
            const dom = new JSDOM(renderMacro(templates, "render_custom_badges(udoc, 4, 'ranking-user__badge')", { udoc: { ownedBadges: [iconBadge] } }));
            try {
                const pill = dom.window.document.querySelector('.ranking-user__badge');
                assert.equal(pill.querySelector('img').getAttribute('src'), iconBadge.iconUrl);
                assert.equal(pill.querySelector('img').alt, badge.displayName);
                assert.equal(pill.querySelector('[data-badge-icon-fallback]').textContent, badge.displayName);
                assert.equal(pill.title, badge.tooltip);
                assert.equal(pill.querySelector('img').hidden, true, 'broken images never appear before enhancement');
            } finally { dom.window.close(); }
        });
        it(`resolves the selected legacy badge through verified server presentation in ${templates}`, () => {
            const dom = new JSDOM(renderMacro(templates, 'render_selected_custom_badge(udoc)', {
                udoc: { badge: '7#旧名称#000000#ffffff', selectedBadgePresentation: { ...badge, iconUrl: '/badge/7/icon-image' } },
            }));
            try {
                assert.equal(dom.window.document.querySelector('img').alt, badge.displayName);
                assert.equal(dom.window.document.querySelector('a').getAttribute('href'), '/badge/7');
                assert.doesNotMatch(dom.window.document.body.textContent, /旧名称/);
            } finally { dom.window.close(); }
        });
    }
    it('reveals cached artwork, falls back safely on errors, and handles live inserted ranking rows', async () => {
        const html = '<a class="user-profile-badge"><span data-badge-icon-fallback>剑客</span><img data-badge-icon src="/icon.png" alt="剑客" hidden></a>';
        const dom = new JSDOM(html);
        const api = moduleFor(binder, dom.window);
        const image = dom.window.document.querySelector('img');
        imageState(image, true);
        const dispose = api.installBadgeIcons(dom.window.document);
        try {
            assert.equal(image.hidden, false);
            assert.equal(image.parentElement.dataset.badgeIconState, 'ready');
            assert.equal(image.previousElementSibling.getAttribute('aria-hidden'), 'true');
            imageState(image, false);
            image.dispatchEvent(new dom.window.Event('error'));
            assert.equal(image.hidden, true);
            assert.equal(image.parentElement.dataset.badgeIconState, 'fallback');
            assert.equal(image.previousElementSibling.getAttribute('aria-hidden'), 'false');
            const holder = dom.window.document.createElement('div');
            holder.innerHTML = html;
            const next = holder.querySelector('img');
            imageState(next, true);
            dom.window.document.body.appendChild(holder);
            await settle();
            assert.equal(next.hidden, false);
            assert.equal(next.parentElement.dataset.badgeIconState, 'ready');
            dispose();
            imageState(next, false);
            next.dispatchEvent(new dom.window.Event('error'));
            assert.equal(next.hidden, false, 'disposal removes global listeners');
        } finally { dispose(); dom.window.close(); }
    });
    it('ignores unrelated images and never shows an invalid loading image', () => {
        const dom = new JSDOM('<a><span data-badge-icon-fallback>原徽章</span><img data-badge-icon src="/missing.png" hidden></a><img id="other">');
        const api = moduleFor(binder, dom.window);
        const dispose = api.installBadgeIcons(dom.window.document);
        try {
            const image = dom.window.document.querySelector('[data-badge-icon]');
            imageState(image, false, false);
            image.dispatchEvent(new dom.window.Event('load'));
            assert.equal(image.hidden, true);
            dom.window.document.getElementById('other').dispatchEvent(new dom.window.Event('load'));
            assert.equal(dom.window.document.getElementById('other').parentElement.dataset.badgeIconState, undefined);
        } finally { dispose(); dom.window.close(); }
    });
});

function uploadFixture() {
    const dom = new JSDOM(`<form><input name="title" value="夏日剑客"><input name="short" value="剑客"><input name="backgroundColor" value="123456"><input name="fontColor" value="ffffff">
<section data-badge-icon-upload data-saved-icon="/saved-icon.png"><input type="file" name="iconImage"><input type="checkbox" name="removeIconImage"><span data-badge-icon-preview></span><p data-badge-icon-upload-status></p></section></form>`);
    const urls = []; const revoked = [];
    dom.window.URL.createObjectURL = (file) => { const url = `blob:test-${urls.length}`; urls.push([url, file]); return url; };
    dom.window.URL.revokeObjectURL = (url) => revoked.push(url);
    const api = moduleFor(uploader, dom.window);
    const dispose = api.bindBadgeIconUpload(dom.window.document);
    const input = dom.window.document.querySelector('[name="iconImage"]');
    const remove = dom.window.document.querySelector('[name="removeIconImage"]');
    const preview = dom.window.document.querySelector('[data-badge-icon-preview]');
    const status = dom.window.document.querySelector('[data-badge-icon-upload-status]');
    return { dom, input, remove, preview, status, urls, revoked,
        select(file) { Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] }); input.dispatchEvent(new dom.window.Event('change')); },
        dispose() { dispose(); dom.window.close(); } };
}
describe('badge artwork upload preview', () => {
    it('keeps saved art until a valid file is selected, preserves the AC image, and releases preview URLs', () => {
        const f = uploadFixture();
        try {
            assert.equal(f.preview.querySelector('img').getAttribute('src'), '/saved-icon.png');
            const file = new f.dom.window.File(['fake png'], '剑客.png', { type: 'image/png' });
            f.select(file);
            assert.equal(f.preview.querySelector('img').getAttribute('src'), 'blob:test-0');
            assert.equal(f.preview.dataset.badgeIconState, 'fallback');
            const image = f.preview.querySelector('img');
            imageState(image, true);
            image.dispatchEvent(new f.dom.window.Event('load'));
            assert.equal(f.preview.dataset.badgeIconState, 'ready');
            assert.equal(image.hidden, false);
            assert.equal(f.dom.window.document.querySelector('[name="acImage"]'), null);
            f.select(null);
            assert.ok(f.revoked.includes('blob:test-0'));
            assert.equal(f.preview.querySelector('img').getAttribute('src'), '/saved-icon.png');
        } finally { f.dispose(); }
    });
    it('restores text on removal, gives an editable label preview, and never treats the clear checkbox as a submit', () => {
        const f = uploadFixture();
        try {
            f.remove.checked = true;
            f.remove.dispatchEvent(new f.dom.window.Event('change'));
            assert.equal(f.preview.querySelector('img'), null);
            assert.match(f.status.textContent, /恢复/);
            const short = f.dom.window.document.querySelector('[name="short"]');
            short.value = '新名字';
            short.dispatchEvent(new f.dom.window.Event('input'));
            assert.equal(f.preview.textContent, '新名字');
            assert.equal(f.preview.style.backgroundColor, 'rgb(18, 52, 86)');
            assert.equal(f.dom.window.document.querySelector('[type="submit"]'), null);
        } finally { f.dispose(); }
    });
    it('rejects oversized or unsupported previews while retaining the saved badge', () => {
        for (const file of [{ type: 'image/svg+xml', size: 4 }, { type: 'image/png', size: 2 * 1024 * 1024 + 1 }]) {
            const f = uploadFixture();
            try {
                f.select(file);
                assert.equal(f.urls.length, 0);
                assert.equal(f.status.classList.contains('is-error'), true);
                assert.equal(f.preview.querySelector('img').getAttribute('src'), '/saved-icon.png');
            } finally { f.dispose(); }
        }
    });
});
