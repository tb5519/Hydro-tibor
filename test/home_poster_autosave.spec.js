const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'packages/ui-default/templates/domain_home_poster.html'), 'utf8').replace('{% extends "domain_base.html" %}', '');
const templates = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(root, 'packages/ui-default/templates')), { autoescape: true });
const moduleUnderTest = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, 'packages/ui-default/components/home_poster_autosave.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
    { module: moduleUnderTest, exports: moduleUnderTest.exports, URL });
const { bindHomePosterAutosave } = moduleUnderTest.exports;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
function fixture(fetcher = async () => ({ ok: true, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => ({ success: true, url: '/domain/home-poster?saved=1' }) })) {
    const dom = new JSDOM(templates.renderString(template, { config: { image: '/old.png', mobileImage: '/old-mobile.png', layout: 'banner' }, videoMaxSizeMb: 40, _: (text) => text }), { url: 'https://onebyone.test/domain/home-poster' });
    const doc = dom.window.document;
    const calls = []; const navigations = [];
    const env = { location: { href: dom.window.location.href, origin: dom.window.location.origin, assign: (url) => navigations.push(url) },
        AbortController, setTimeout, clearTimeout, fetch: async (...args) => { calls.push(args); return fetcher(...args); },
        FormData: class extends dom.window.FormData {
            constructor(form) {
                super(form);
                // JSDOM lacks DataTransfer: emulate native successful file controls using the selected File.
                for (const input of form.querySelectorAll('input[type="file"]')) if (!input.disabled && input.files[0]) this.set(input.name, input.files[0]);
            }
        } };
    const panel = doc.querySelector('[data-poster-settings]');
    bindHomePosterAutosave(panel, env);
    const choose = (kind, name, size = 128, type = 'image/png') => {
        const input = doc.querySelector(`[data-poster-autosave="${kind}"] input[type="file"]`);
        Object.defineProperty(input, 'files', { configurable: true, value: [new dom.window.File([new Uint8Array(size)], name, { type })] });
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        return input;
    };
    return { dom, doc, env, panel, calls, navigations, choose };
}

it('one mode selection saves immediately with the chosen layout and refreshes the preview once', async () => {
    const f = fixture();
    const input = f.doc.querySelector('input[value="popout"]');
    input.checked = true; input.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0][1].body.get('operation'), 'save_layout');
    assert.equal(f.calls[0][1].body.get('layout'), 'popout', 'selected input must be captured before locking controls');
    assert.equal(f.doc.querySelector('[data-poster-layout="popout"]').hidden, false);
    assert.equal(f.doc.querySelector('[data-poster-layout="banner"]').hidden, true);
    await settle();
    assert.deepEqual(f.navigations, ['https://onebyone.test/domain/home-poster?saved=1']);
    assert.match(f.doc.querySelector('[data-poster-autosave="layout"] [data-poster-status]').textContent, /已保存/);
    f.dom.window.close();
});

it('selecting desktop or mobile artwork uploads immediately without a second button click', async () => {
    for (const kind of ['image', 'mobile']) {
        const f = fixture();
        f.choose(kind, 'new-poster.webp', 128, 'image/webp');
        assert.equal(f.calls.length, 1);
        const body = f.calls[0][1].body;
        assert.equal(body.get('operation'), kind === 'image' ? 'upload' : 'upload_mobile');
        assert.equal(body.get('file').name, 'new-poster.webp');
        assert.equal(body.get('file').size, 128);
        await settle(); assert.equal(f.navigations.length, 1); f.dom.window.close();
    }
});

it('invalid extension, MIME, empty and oversized images never upload or replace the existing preview', async () => {
    for (const [name, size, type] of [['bad.svg', 128, 'image/svg+xml'], ['bad.png', 128, 'text/html'], ['empty.png', 0, 'image/png'], ['large.png', 8 * 1024 * 1024 + 1, 'image/png']]) {
        const f = fixture(); f.choose('image', name, size, type); await settle();
        assert.equal(f.calls.length, 0); assert.equal(f.navigations.length, 0);
        assert.equal(f.doc.querySelector('.domain-poster__preview img').getAttribute('src'), '/old.png');
        assert.equal(f.doc.querySelector('[data-poster-autosave="image"] [data-poster-status]').dataset.state, 'error');
        assert.equal(f.doc.querySelector('input[type="file"]').disabled, false); f.dom.window.close();
    }
});

it('duplicate changes/submits cannot race an in-flight upload; failure unlocks controls and permits retry', async () => {
    let rejectUpload;
    const f = fixture(() => new Promise((resolve, reject) => { rejectUpload = reject; }));
    const input = f.choose('image', 'retry.png');
    const form = input.form;
    form.dispatchEvent(new f.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
    assert.equal(f.calls.length, 1);
    assert.equal(f.doc.querySelector('input[value="popout"]').disabled, true);
    rejectUpload(new Error('offline')); await settle();
    assert.equal(f.doc.querySelector('input[value="popout"]').disabled, false);
    assert.equal(form.querySelector('[data-poster-submit]').hasAttribute('data-retry'), true);
    assert.equal(f.doc.querySelector('.domain-poster__preview img').getAttribute('src'), '/old.png');
    form.dispatchEvent(new f.dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(f.calls.length, 2);
    rejectUpload(new Error('offline')); await settle(); f.dom.window.close();
});

it('HTML login redirects or foreign success destinations are not treated as successful saves', async () => {
    for (const result of [
        { ok: true, headers: new Headers({ 'Content-Type': 'text/html' }) },
        { ok: true, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => ({ success: true, url: 'https://other.test/' }) },
    ]) {
        const f = fixture(async () => result); f.choose('mobile', 'phone.png'); await settle();
        assert.equal(f.navigations.length, 0);
        assert.equal(f.doc.querySelector('[data-poster-autosave="mobile"] [data-poster-status]').dataset.state, 'error');
        f.dom.window.close();
    }
});

it('ordinary forms and save buttons stay available without enhancement; binding twice does not duplicate requests', async () => {
    const f = fixture();
    bindHomePosterAutosave(f.panel, f.env);
    f.choose('image', 'once.png'); await settle(); assert.equal(f.calls.length, 1);
    for (const kind of ['layout', 'image', 'mobile']) {
        const form = f.doc.querySelector(`[data-poster-autosave="${kind}"]`);
        assert.equal(form.method, 'post'); assert(form.querySelector('[data-poster-submit]'));
    }
    const doc = new JSDOM(templates.renderString(template, { config: {}, videoMaxSizeMb: 40, _: (text) => text })).window.document;
    const panel = doc.querySelector('[data-poster-settings]'); bindHomePosterAutosave(panel, {});
    assert.equal(panel.classList.contains('is-enhanced'), false);
    assert.equal(doc.querySelectorAll('[data-poster-submit]').length, 3);
    f.dom.window.close();
});

it('successful saves remember the edited card and restore its viewport position once after refresh', async () => {
    const f = fixture(); const stored = new Map();
    f.env.sessionStorage = { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) };
    const form = f.doc.querySelector('[data-poster-autosave="mobile"]');
    form.getBoundingClientRect = () => ({ top: 240 });
    f.choose('mobile', 'phone.png'); await settle();
    const key = 'onebyone-home-poster-scroll:/domain/home-poster';
    assert.equal(JSON.parse(stored.get(key)).kind, 'mobile');
    assert.equal(JSON.parse(stored.get(key)).top, 240);
    const next = fixture();
    delete next.panel.dataset.posterBound;
    next.env.sessionStorage = f.env.sessionStorage;
    next.env.scrollY = 100;
    let scrolled;
    next.env.scrollTo = (value) => { scrolled = value.top; };
    next.env.requestAnimationFrame = (callback) => callback();
    next.doc.querySelector('[data-poster-autosave="mobile"]').getBoundingClientRect = () => ({ top: 540 });
    bindHomePosterAutosave(next.panel, next.env);
    assert.equal(scrolled, 400);
    assert.equal(stored.has(key), false, 'restore marker is single-use');
    f.dom.window.close(); next.dom.window.close();
});
