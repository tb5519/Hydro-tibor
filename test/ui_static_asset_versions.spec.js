const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const jsesc = require('jsesc');
const nunjucks = require('nunjucks');
const { getStaticAssetVersions } = require('../packages/ui-default/backendlib/static_asset_versions');

const uiVersion = '4.58.0-beta.21';
const runtimeKey = `hydro-${uiVersion}.js`;
const manifest = (overrides = {}) => ({
    [runtimeKey]: `/${runtimeKey}?123abc`,
    'theme.css': `/theme-${uiVersion}.css?456def`,
    'default.theme.js': '/default.theme.js?789abc',
    ...overrides,
});
const emptyVersions = { staticVersion: undefined, themeVersion: undefined, defaultThemeVersion: undefined };

describe('independent static asset content versions', () => {
    it('reads the runtime, CSS, and development theme hashes from their own manifest entries', () => {
        assert.deepEqual(getStaticAssetVersions(manifest(), uiVersion), {
            staticVersion: '123abc', themeVersion: '456def', defaultThemeVersion: '789abc',
        });
    });

    it('updates only the CSS key when only the stylesheet changes', () => {
        assert.deepEqual(getStaticAssetVersions(manifest({ 'theme.css': '/theme.css?abcdef' }), uiVersion), {
            staticVersion: '123abc', themeVersion: 'abcdef', defaultThemeVersion: '789abc',
        });
    });

    it('updates only the development theme key when only that script changes', () => {
        assert.deepEqual(getStaticAssetVersions(manifest({ 'default.theme.js': '/default.theme.js?fedcba' }), uiVersion), {
            staticVersion: '123abc', themeVersion: '456def', defaultThemeVersion: 'fedcba',
        });
    });

    it('accepts full hexadecimal hashes between six and sixty-four characters', () => {
        for (const hash of ['ABC123', 'f'.repeat(32), 'a'.repeat(64)]) {
            assert.equal(getStaticAssetVersions(manifest({ 'theme.css': `/theme.css?${hash}` }), uiVersion).themeVersion, hash);
        }
    });

    it('treats missing, primitive, and array manifests as having no content versions', () => {
        for (const value of [undefined, null, false, 0, 'invalid JSON', [], {}]) {
            assert.deepEqual(getStaticAssetVersions(value, uiVersion), emptyVersions);
        }
        assert.deepEqual(getStaticAssetVersions({ 'theme.css': '/theme.css?abcdef' }, uiVersion), {
            ...emptyVersions, themeVersion: 'abcdef',
        });
    });

    it('rejects malformed hashes without affecting the other asset versions', () => {
        const invalidAssets = [
            undefined, null, 123456, {}, ['/theme.css?abcdef'], '/theme.css', '/theme.css?',
            '/theme.css?abcde', `/theme.css?${'a'.repeat(65)}`, '/theme.css?zzzzzz',
            '/theme.css?abcdef&other=1', '/theme.css?abcdef#fragment', '/theme.css?abcdef?extra',
            '/theme.css?%61bcdef', '/theme.css?version=abcdef', '/theme.css?abcdef\n',
            '/theme.css?\"><script>alert(1)</script>',
        ];
        for (const asset of invalidAssets) {
            assert.deepEqual(getStaticAssetVersions(manifest({ 'theme.css': asset }), uiVersion), {
                staticVersion: '123abc', themeVersion: undefined, defaultThemeVersion: '789abc',
            }, `Unexpected accepted asset: ${JSON.stringify(asset)}`);
        }
    });

    it('looks up the installed UI runtime version and leaves the input manifest unchanged', () => {
        const value = Object.freeze(manifest({ 'hydro-other.js': '/hydro-other.js?bbbbbb' }));
        const snapshot = { ...value };
        assert.equal(getStaticAssetVersions(value, 'other').staticVersion, 'bbbbbb');
        assert.equal(getStaticAssetVersions(value, 'missing').staticVersion, undefined);
        assert.deepEqual(value, snapshot);
    });
});

// Render the real page layout, including its real imported component templates.
// No local service, browser cache, or fixture-only HTML can hide an unversioned URL.
const templateRoot = path.join(__dirname, '../packages/ui-default/templates');
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templateRoot, { noCache: true }), { autoescape: true });
env.addFilter('json', JSON.stringify);
env.addFilter('jsesc', (value) => jsesc(value, { isScriptContext: true }));

function pageAssets({ dev = false, cdnPrefix = '/', assets = manifest() } = {}) {
    const html = env.render('layout/html5.html', {
        page_name: 'main', layout_name: 'basic',
        process: { env: { DEV: dev } },
        global: { Hydro: { version: { 'ui-default': uiVersion } } },
        Object,
        _: (key) => (key === '__id' ? 'zh' : key),
        isIE: () => false,
        handler: {
            user: { theme: 'default' }, domain: { ui: { name: 'OneByOne' } },
            context: { request: { url: '/' } }, request: { path: '/', headers: {} }, session: {},
            renderTitle: () => 'OneByOne',
        },
        model: { system: { get: (key) => (key === 'server.url' ? 'http://localhost/' : 'OneByOne') } },
        UiContext: { cdn_prefix: cdnPrefix, constantVersion: 'entry-version', ...getStaticAssetVersions(assets, uiVersion) },
        UserContext: { viewLang: 'zh', fontFamily: 'sans-serif', codeFontFamily: 'monospace' },
    });
    const dom = new JSDOM(html);
    try {
        const { document } = dom.window;
        return {
            html,
            css: document.querySelector('link[rel="stylesheet"]').getAttribute('href'),
            runtime: [...document.querySelectorAll('script[src]')]
                .find((node) => node.getAttribute('src').includes(runtimeKey)).getAttribute('src'),
            defaultTheme: document.querySelector('script[src*="default.theme.js"]')?.getAttribute('src'),
        };
    } finally { dom.window.close(); }
}

describe('page layout cache-busting URLs', () => {
    for (const dev of [true, false]) {
        const mode = dev ? 'development' : 'production';

        it(`renders independent stylesheet and runtime content versions in ${mode}`, () => {
            const assets = pageAssets({ dev });
            assert.equal(assets.css, `/theme-${uiVersion}.css?456def`);
            assert.equal(assets.runtime, `/${runtimeKey}?version=123abc`);
            assert.equal(assets.defaultTheme, dev ? '/default.theme.js?version=789abc' : undefined);
        });

        it(`changes the stylesheet URL even if the package and JavaScript are unchanged in ${mode}`, () => {
            const before = pageAssets({ dev });
            const after = pageAssets({ dev, assets: manifest({ 'theme.css': '/theme.css?ffffff' }) });
            assert.notEqual(after.css, before.css);
            assert.equal(after.css, `/theme-${uiVersion}.css?ffffff`);
            assert.equal(after.runtime, before.runtime);
            assert.equal(after.defaultTheme, before.defaultTheme);
        });

        it(`preserves the configured CDN prefix without coupling content versions in ${mode}`, () => {
            const assets = pageAssets({ dev, cdnPrefix: 'https://cdn.example.com/static/' });
            assert.equal(assets.css, `${dev ? '/' : 'https://cdn.example.com/static/'}theme-${uiVersion}.css?456def`);
            assert.equal(assets.runtime, `https://cdn.example.com/static/${runtimeKey}?version=123abc`);
            assert.equal(assets.defaultTheme, dev ? '/default.theme.js?version=789abc' : undefined);
        });

        it(`falls back to the software version when manifest hashes are absent or unsafe in ${mode}`, () => {
            for (const assets of [undefined, null, {}, manifest({
                'theme.css': '/theme.css?\"><img src=x onerror=alert(1)>',
                'default.theme.js': '/default.theme.js?javascript:alert(1)',
            })]) {
                // Passing null also exercises the absent-manifest path rather than
                // activating pageAssets' default test data through undefined.
                const result = pageAssets({ dev, assets: assets ?? null });
                assert.equal(result.css, `/theme-${uiVersion}.css?${uiVersion}`);
                assert.equal(result.defaultTheme, dev ? `/default.theme.js?version=${uiVersion}` : undefined);
                assert.doesNotMatch(result.html, /onerror|javascript:alert|undefined|null/);
            }
        });
    }

    it('changes the development theme script URL independently of runtime and stylesheet URLs', () => {
        const before = pageAssets({ dev: true });
        const after = pageAssets({ dev: true, assets: manifest({ 'default.theme.js': '/default.theme.js?dddddd' }) });
        assert.equal(after.defaultTheme, '/default.theme.js?version=dddddd');
        assert.notEqual(after.defaultTheme, before.defaultTheme);
        assert.equal(after.css, before.css);
        assert.equal(after.runtime, before.runtime);
    });
});
