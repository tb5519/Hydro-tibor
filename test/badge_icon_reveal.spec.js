const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const stylus = require('stylus');
const postcss = require('postcss');
const compile = (file) => transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const binder = compile('packages/ui-default/components/badge_icon.ts');
const uploader = compile('addons/badge-for-hydrooj/frontend/badge_icon_upload.ts');
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function state(image, complete, valid = complete) {
    Object.defineProperties(image, {
        complete: { configurable: true, value: complete },
        naturalWidth: { configurable: true, value: valid ? 480 : 0 },
        naturalHeight: { configurable: true, value: valid ? 160 : 0 },
    });
}
function api(code, win) {
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, document: win.document,
        HTMLImageElement: win.HTMLImageElement, Element: win.Element, MutationObserver: win.MutationObserver, URL: win.URL });
    return module.exports;
}
function fixture(cached = false, html = '') {
    const dom = new JSDOM(html || '<a class="user-profile-badge" data-badge-icon-state="loading" href="/badge/1" aria-label="王者" aria-busy="true"><span data-badge-icon-fallback aria-hidden="true">王者</span><img data-badge-icon src="/badge/1/icon-image?v=1" hidden></a>', {
        url: 'https://onebyone.test/ranking', pretendToBeVisual: true,
    });
    const doc = dom.window.document;
    const image = doc.querySelector('[data-badge-icon]');
    if (image) state(image, cached);
    const module = api(binder, dom.window);
    const dispose = module.installBadgeIcons(doc);
    return { dom, doc, win: dom.window, image, badge: image?.parentElement, dispose,
        close() { dispose(); dom.window.close(); } };
}
function deferredDecode(image) {
    let resolve; let reject; let calls = 0;
    image.decode = () => { calls++; return new Promise((yes, no) => { resolve = yes; reject = no; }); };
    return { resolve() { resolve(); }, reject() { reject(new Error('decode')); }, get calls() { return calls; } };
}

describe('badge image loading and reveal', () => {
    it('shows an already complete bitmap immediately and gives the actual image high priority', () => {
        const f = fixture(true);
        try {
            assert.equal(f.badge.dataset.badgeIconState, 'ready');
            assert.equal(f.badge.dataset.badgeIconReveal, undefined);
            assert.equal(f.badge.hasAttribute('aria-busy'), false);
            assert.equal(f.image.hidden, false);
            assert.equal(f.image.loading, 'eager');
            assert.equal(f.image.getAttribute('fetchpriority'), 'high');
        } finally { f.close(); }
    });
    it('keeps text and artwork hidden while downloading/decoding, then fades the whole badge just once', async () => {
        const f = fixture();
        try {
            const decode = deferredDecode(f.image);
            assert.equal(f.badge.dataset.badgeIconState, 'loading');
            assert.equal(f.image.hidden, true);
            assert.equal(f.badge.querySelector('[data-badge-icon-fallback]').getAttribute('aria-hidden'), 'true');
            state(f.image, true); f.image.dispatchEvent(new f.win.Event('load'));
            assert.equal(decode.calls, 1);
            assert.equal(f.badge.dataset.badgeIconState, 'loading');
            f.image.dispatchEvent(new f.win.Event('load'));
            assert.equal(decode.calls, 1, 'duplicate loads share the pending decode');
            decode.resolve(); await tick();
            assert.equal(f.badge.dataset.badgeIconState, 'ready');
            assert.equal(f.badge.dataset.badgeIconReveal, 'fade');
            assert.equal(f.image.hidden, false);
            const shine = f.badge.querySelector('[data-badge-icon-shine]'); assert.ok(shine);
            const mutations = [];
            const observer = new f.win.MutationObserver((records) => mutations.push(...records));
            observer.observe(f.badge, { attributes: true, attributeFilter: ['data-badge-icon-reveal'] });
            f.image.dispatchEvent(new f.win.Event('load')); await tick();
            assert.equal(mutations.length, 0, 'repeat load does not restart the reveal');
            assert.equal(f.badge.querySelector('[data-badge-icon-shine]'), shine);
            observer.disconnect();
        } finally { f.close(); }
    });
    it('does not replay a reveal when a live ranking creates another node for already loaded artwork', async () => {
        const f = fixture(true);
        try {
            const row = f.doc.createElement('div'); row.innerHTML = f.badge.outerHTML;
            const next = row.querySelector('[data-badge-icon]');
            row.querySelector('[data-badge-icon-shine]').remove();
            state(next, false); f.doc.body.append(row); await tick();
            assert.equal(next.parentElement.dataset.badgeIconState, 'loading');
            let decodeCalls = 0; next.decode = () => { decodeCalls++; return Promise.resolve(); };
            state(next, true); next.dispatchEvent(new f.win.Event('load')); await tick();
            assert.equal(next.hidden, false);
            assert.equal(next.parentElement.dataset.badgeIconReveal, undefined);
            assert.equal(decodeCalls, 0, 'known ready resource is immediately reusable');
        } finally { f.close(); }
    });
    it('preserves the explicit lower priority of badges beyond the first screen', () => {
        const f = fixture(false, '<a class="user-profile-badge" data-badge-icon-state="loading"><span data-badge-icon-fallback>王者</span><img data-badge-icon fetchpriority="auto" src="/badge/1/icon-image?v=1" hidden></a>');
        try { assert.equal(f.image.getAttribute('fetchpriority'), 'auto'); }
        finally { f.close(); }
    });
    it('only restores the text after a real error, never while an image is still loading', () => {
        const f = fixture();
        try {
            f.image.dispatchEvent(new f.win.Event('load'));
            assert.equal(f.badge.dataset.badgeIconState, 'loading');
            state(f.image, true, false); f.image.dispatchEvent(new f.win.Event('error'));
            assert.equal(f.badge.dataset.badgeIconState, 'fallback');
            assert.equal(f.badge.querySelector('span').getAttribute('aria-hidden'), 'false');
            assert.equal(f.badge.hasAttribute('aria-busy'), false);
        } finally { f.close(); }
    });
    it('ignores the old decode after a source change and fades only the replacement', async () => {
        const f = fixture();
        try {
            const first = deferredDecode(f.image);
            state(f.image, true); f.image.dispatchEvent(new f.win.Event('load'));
            state(f.image, false); f.image.src = '/badge/1/icon-image?v=2'; await tick();
            first.resolve(); await tick();
            assert.equal(f.badge.dataset.badgeIconState, 'loading');
            assert.equal(f.image.hidden, true);
            const second = deferredDecode(f.image);
            state(f.image, true); f.image.dispatchEvent(new f.win.Event('load'));
            second.resolve(); await tick();
            assert.equal(f.badge.dataset.badgeIconState, 'ready');
            assert.equal(f.badge.dataset.badgeIconReveal, 'fade');
            assert.match(f.badge.querySelector('[data-badge-icon-shine]').src, /v=2$/);
        } finally { f.close(); }
    });
    it('never reveals removed icons or completes a reveal after disposal', async () => {
        for (const remove of [true, false]) {
            const f = fixture();
            try {
                const decode = deferredDecode(f.image);
                state(f.image, true); f.image.dispatchEvent(new f.win.Event('load'));
                if (remove) f.badge.remove(); else f.dispose();
                await tick(); decode.resolve(); await tick();
                assert.equal(f.badge.dataset.badgeIconState, 'loading');
                assert.equal(f.image.hidden, true);
            } finally { f.close(); }
        }
    });
    it('accepts Safari decode rejection only while the bitmap is still valid', async () => {
        const f = fixture();
        try {
            const decode = deferredDecode(f.image);
            state(f.image, true); f.image.dispatchEvent(new f.win.Event('load'));
            decode.reject(); await tick();
            assert.equal(f.badge.dataset.badgeIconState, 'ready');
            assert.equal(f.badge.dataset.badgeIconReveal, 'fade');
        } finally { f.close(); }
    });
    it('keeps the upload preview from bypassing the shared decoding/reveal lifecycle', async () => {
        const f = fixture(false, '<form><input name="title" value="王者"><section data-badge-icon-upload data-saved-icon="/saved.png"><input type="file" name="iconImage"><span class="user-profile-badge" data-badge-icon-preview></span><p data-badge-icon-upload-status></p></section></form>');
        const stop = api(uploader, f.win).bindBadgeIconUpload(f.doc);
        try {
            await tick();
            const image = f.doc.querySelector('[data-badge-icon]'); const badge = image.parentElement;
            const decode = deferredDecode(image);
            state(image, true); image.dispatchEvent(new f.win.Event('load'));
            assert.equal(badge.dataset.badgeIconState, 'loading', 'local preview handler must not show an undecoded bitmap');
            decode.resolve(); await tick();
            assert.equal(badge.dataset.badgeIconState, 'ready');
            assert.equal(badge.dataset.badgeIconReveal, 'fade');
        } finally { stop(); f.close(); }
    });
});

it('hides the entire pending badge from the first paint and applies one reduced-motion-aware parent fade', () => {
    const source = fs.readFileSync('packages/ui-default/components/profile/profile.page.styl', 'utf8');
    const css = postcss.parse(stylus(source.slice(source.indexOf('// Display the uploaded badge artwork'))).render());
    const rules = []; css.walkRules((rule) => rules.push(rule));
    const declarations = (rule) => Object.fromEntries(rule.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value]));
    assert.equal(declarations(rules.find((rule) => rule.selector === ".user-profile-badge[data-badge-icon-state='loading']")).visibility, 'hidden');
    const reveal = rules.find((rule) => rule.selector.includes("[data-badge-icon-state='ready'][data-badge-icon-reveal='fade']"));
    assert.match(declarations(reveal).animation, /badge-icon-reveal 260ms/);
    const reduced = rules.find((rule) => rule.selector === ".user-profile-badge[data-badge-icon-reveal='fade']" && rule.parent.name === 'media');
    assert.equal(declarations(reduced).animation, 'none');
});
