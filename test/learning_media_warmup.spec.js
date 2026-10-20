const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
function load(file, deps) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, { module, exports: module.exports, URL, console, require: (name) => {
        if (!(name in deps)) throw Error(name); return deps[name];
    } });
    return module.exports;
}
const settle = () => new Promise((done) => setTimeout(done, 15));
function browser(options = {}) {
    const dom = new JSDOM('', { url: 'https://onebyone.test/d/class-a/daily-quiz' });
    const win = dom.window;
    const calls = []; const prepared = []; const media = [];
    Object.defineProperty(win.document, 'readyState', { configurable: true, value: options.loading ? 'loading' : 'complete' });
    Object.defineProperty(win.document, 'hidden', { configurable: true, value: !!options.hidden });
    win.navigator.connection = options.connection || {};
    win.requestIdleCallback = (callback) => win.setTimeout(callback, 0);
    win.cancelIdleCallback = win.clearTimeout.bind(win);
    win.matchMedia = () => ({ matches: !!options.reduced });
    win.Image = function () { const image = win.document.createElement('img'); media.push(image); return image; };
    win.Audio = function () { const audio = win.document.createElement('audio'); audio.load = () => calls.push('audio.load'); audio.pause = () => calls.push('audio.pause'); audio.play = () => { throw Error('Must never play sound'); }; media.push(audio); return audio; };
    const theme = { id: 'badge:7', badgeId: 7, version: 'v1', slots: { background: { assetId: 'one' } }, assets: [
        { id: 'one', type: 'image/png', url: '/code-editor/theme-asset/v1/image' },
        { id: 'unused', type: 'image/png', url: '/code-editor/theme-asset/v1/preview' },
    ] };
    win.fetch = async (url, settings) => {
        calls.push({ url, settings });
        return { ok: true, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => ({
            scope: options.scope || '42:class-a', editorTheme: options.theme ?? theme,
            acTheme: { acImage: '/badge/7/ac-image?v=original', themeSound: '/badge/7/theme-sound?v=2' },
        }) };
    };
    const { startLearningMediaWarmup } = load('packages/ui-default/utils/learning-media-warmup.ts', {
        '../components/scratchpad/themeAssets': { prepareScratchpadThemeAssets: async (value) => { prepared.push(value); return true; } },
    });
    const start = (config = { url: '/d/class-a/learning-media-warmup', scope: '42:class-a' }) => startLearningMediaWarmup(config, win);
    return { win, dom, calls, prepared, media, theme, start };
}
it('daily practice warms the exact original AC artwork, silent audio and selected theme once during idle', async () => {
    const f = browser();
    const binding = f.start(); assert.equal(f.start(), binding);
    assert.equal(f.calls.length, 0, 'does not compete with initial quiz rendering');
    await settle();
    assert.equal(f.calls.filter((call) => typeof call === 'object').length, 1);
    assert.equal(f.calls[0].settings.priority, 'low');
    assert.equal(f.calls[0].settings.cache, 'no-store');
    assert.equal(f.media[0].src, 'https://onebyone.test/badge/7/ac-image?v=original');
    assert.equal(f.media[1].autoplay, false);
    assert.equal(f.media[1].preload, 'auto');
    assert.equal(f.prepared.length, 1);
    assert.equal(f.prepared[0].id, 'badge:7');
    binding.dispose();
    assert.equal(f.calls[0].settings.signal.aborted, true);
    assert.equal(f.media[0].hasAttribute('src'), false);
    f.dom.window.close();
});
it('respects data saving, slow connections, hidden tabs, page load and navigation', async () => {
    for (const options of [{ connection: { saveData: true } }, { connection: { effectiveType: '3g' } }, { hidden: true }]) {
        const f = browser(options); f.start(); await settle(); assert.equal(f.calls.length, 0); f.dom.window.close();
    }
    const f = browser({ loading: true }); f.start(); await settle(); assert.equal(f.calls.length, 0);
    Object.defineProperty(f.win.document, 'readyState', { value: 'complete' });
    f.win.dispatchEvent(new f.win.Event('load')); await settle(); assert.equal(f.prepared.length, 1); f.dom.window.close();
    const g = browser(); g.start(); g.win.dispatchEvent(new g.win.Event('pagehide')); await settle(); assert.equal(g.calls.length, 0); g.dom.window.close();
});
it('resumes a catalog interrupted by a hidden tab and restarts after browser history restoration', async () => {
    const f = browser();
    let release;
    f.win.fetch = async () => ({ ok: true, headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => new Promise((resolve) => { release = () => resolve({ scope: '42:class-a', editorTheme: f.theme }); }) });
    f.start(); await settle();
    Object.defineProperty(f.win.document, 'hidden', { value: true });
    release(); await settle(); assert.equal(f.prepared.length, 0);
    Object.defineProperty(f.win.document, 'hidden', { value: false });
    f.win.document.dispatchEvent(new f.win.Event('visibilitychange')); await settle();
    release(); await settle(); assert.equal(f.prepared.length, 1);
    const hide = new f.win.Event('pagehide'); Object.defineProperty(hide, 'persisted', { value: true }); f.win.dispatchEvent(hide);
    const show = new f.win.Event('pageshow'); Object.defineProperty(show, 'persisted', { value: true }); f.win.dispatchEvent(show);
    await settle(); release(); await settle(); assert.equal(f.prepared.length, 2);
    f.dom.window.close();
});
it('rejects account/domain mismatch, foreign endpoints and foreign theme asset sources', async () => {
    for (const options of [{ scope: '99:class-b' }, { theme: { badgeId: 7, assets: [{ type: 'image/png', url: 'https://other.test/image.png' }] } }]) {
        const f = browser(options); f.start(); await settle(); assert.equal(f.prepared.length, 0); f.dom.window.close();
    }
    const f = browser(); f.start({ url: 'https://other.test/catalog', scope: '42:class-a' }); await settle(); assert.equal(f.calls.length, 0); f.dom.window.close();
});
it('still prepares static art when reduced motion disables background video warming', async () => {
    const f = browser({ reduced: true, theme: { badgeId: 7, assets: [{ type: 'video/mp4', url: '/movie.mp4' }] } });
    f.start(); await settle(); assert.equal(f.prepared.length, 1); f.dom.window.close();
});
it('the catalog enforces the current account/domain permissions and returns only the selected editor theme', async () => {
    const calls = [];
    class Handler {}
    const { LearningMediaWarmupHandler } = load('packages/hydrooj/src/handler/learning_media_warmup.ts', {
        '../lib/badge_ac_theme': { getActiveBadgeAcTheme: async (_ctx, user, _url, domain) => { calls.push([user._id, domain._id]); return { acImage: '/original' }; } },
        '../model/builtin': { PERM: { PERM_VIEW: 1n }, PRIV: { PRIV_USER_PROFILE: 1 } },
        '../service/server': { Handler },
        './editor_theme': { getEditorThemeCatalog: async () => ({ selectedId: 'badge:7', themes: [{ id: 'badge:6' }, { id: 'badge:7' }] }) },
    });
    const create = (deny) => Object.assign(new LearningMediaWarmupHandler(), {
        user: { _id: 42 }, domain: { _id: 'class-a' }, ctx: {}, url: () => '',
        request: { query: { uid: 99, domain: 'class-b' } }, response: { headers: {}, addHeader(key, value) { this.headers[key] = value; } },
        checkPriv() { if (deny === 'priv') throw Error('auth'); }, checkPerm() { if (deny === 'perm') throw Error('domain'); },
    });
    await assert.rejects(create('priv').get()); await assert.rejects(create('perm').get()); assert.equal(calls.length, 0);
    const f = create(); await f.get();
    assert.deepEqual(calls, [[42, 'class-a']]);
    assert.equal(f.response.body.scope, '42:class-a');
    assert.equal(f.response.body.editorTheme.id, 'badge:7');
    assert.equal(f.response.headers['Cache-Control'], 'private, no-store');
});
