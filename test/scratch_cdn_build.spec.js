const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const buildFile = path.join(root, 'build/scratch/build.mjs');
const upstream = require('../build/scratch/upstream.json');
const localeDetector = fs.readFileSync(path.join(__dirname, 'fixtures/scratch_detect_locale_upstream.txt'), 'utf8');
const buildSource = transformSync(fs.readFileSync(buildFile, 'utf8'), {
    format: 'cjs', platform: 'node', define: { 'import.meta.url': JSON.stringify(pathToFileURL(buildFile).href) },
}).code;

// Exercise the complete build orchestration without invoking git/npm/webpack,
// writing files, touching the installed upstream checkout or replacing assets.
function runBuild(assetBase) {
    const calls = [];
    const writes = new Map();
    const sources = {
        'src/containers/extension-library.jsx': 'const fetchLibrary = async () => {\n}\ncomponentDidMount () {\n}',
        'src/reducers/mode.js': '    switch (action.type) {\n}',
        'src/lib/detect-locale.js': localeDetector,
        'src/components/menu-bar/menu-bar.jsx': [
            '<MenuItem isRtl={this.props.isRtl} onClick={this.handleClickNew}>New</MenuItem>',
            '<ChangeUsername>Username</ChangeUsername>',
            '<CloudVariablesToggler>Cloud</CloudVariablesToggler>',
            '<MenuSection><MenuItem onClick={this.handleClickRestorePoints}>Restore</MenuItem></MenuSection>',
            '<MenuSection><MenuItem onClick={this.props.onClickSettingsModal}>Settings</MenuItem></MenuSection>',
            '{this.props.onClickSettingsModal && (\n                        )}',
        ].join('\n'),
        'src/lib/sb-file-uploader-hoc.jsx': [
            'if (this.props.showOpenFilePicker) {', 'handleChange (e) {',
            'if (userOwnsProject || (projectChanged && isShowingWithoutId)) {',
            'uploadAllowed = confirm( // eslint-disable-line no-alert',
        ].join('\n'),
        'src/containers/sb3-downloader.jsx': 'this.props.showSaveFilePicker ? {',
    };
    const fakeFs = {
        existsSync: () => true,
        mkdirSync: () => {}, rmSync: () => {}, copyFileSync: () => {}, cpSync: () => {},
        writeFileSync: (name, value) => writes.set(name, value),
        readFileSync: (name) => name.endsWith('/upstream.json') ? JSON.stringify(upstream) : Buffer.from('mock build asset'),
        readdirSync: () => ['editor.html', 'source.tar.gz'].map((name) => ({ name, isDirectory: () => false })),
    };
    const env = { SCRATCH_BUILD_DIR: '/isolated-test-upstream', SCRATCH_SKIP_INSTALL: '1' };
    if (assetBase !== undefined) env.SCRATCH_ASSET_BASE = assetBase;
    const execFileSync = (exe, args, options) => {
        calls.push({ exe, args, options });
        if (exe === 'git' && args[0] === 'rev-parse') return upstream.commit;
        if (exe === 'git' && args[0] === 'show') {
            const file = args[1].slice(upstream.commit.length + 1);
            if (/^src\/(lib\/storage\.js|containers\/(?:library-item|(?:costume|sprite|backdrop|sound)-library)\.jsx|components\/library\/library\.jsx)$/.test(file)) return 'mock library source';
            assert(file in sources, `Unexpected upstream source read: ${file}`);
            return sources[file];
        }
        return '';
    };
    const run = () => vm.runInNewContext(buildSource, {
        require: (name) => name === './patch-libraries.cjs' ? (_file, source) => source
            : name === './patch-locale.cjs' ? require('../build/scratch/patch-locale.cjs')
                : name === 'node:fs' ? fakeFs
            : name === 'node:child_process' ? { execFileSync } : require(name),
        process: { env, execPath: process.execPath, version: process.version },
        URL, console: { log: () => {} },
    }, { filename: buildFile });
    return { run, calls, writes };
}

function configureWebpack(assetBase) {
    class HtmlWebpackPlugin {
        constructor(options) { this.options = options; }
        static getHooks(compilation) { return compilation; }
    }
    class NormalModuleReplacementPlugin {
        constructor(pattern, replacement) { this.pattern = pattern; this.replacement = replacement; }
    }
    const base = { output: { publicPath: 'incorrect-upstream-value/' },
        plugins: [new HtmlWebpackPlugin({ filename: 'upstream.html' })], module: { rules: [] } };
    const result = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'build/scratch/webpack.cjs'), 'utf8'), {
        require: (name) => ({ path, webpack: { NormalModuleReplacementPlugin },
            'html-webpack-plugin': HtmlWebpackPlugin, './webpack.config.js': [base] })[name],
        __dirname: '/isolated-test-upstream', module: result, process: { env: { ROOT: assetBase } },
    });
    return { config: result.exports, HtmlWebpackPlugin };
}

describe('Scratch CDN build configuration', () => {
    for (const [name, value, expected] of [
        ['default local assets', undefined, '/scratch-editor/'],
        ['same-site version directory', '/releases/classroom-v2/scratch-editor', '/releases/classroom-v2/scratch-editor/'],
        ['CDN version directory', 'https://cdn.example.test/releases/classroom-v2/scratch-editor/',
            'https://cdn.example.test/releases/classroom-v2/scratch-editor/'],
        ['CDN directory without trailing slash', 'https://cdn.example.test/scratch-editor',
            'https://cdn.example.test/scratch-editor/'],
        ['HTTPS root', 'https://cdn.example.test', 'https://cdn.example.test/'],
    ]) {
        it(`uses ${name} consistently for compilation, chunks and the release manifest`, () => {
            const build = runBuild(value);
            build.run();
            const invocation = build.calls.find((call) => call.args[0] === 'node_modules/webpack/bin/webpack.js');
            assert.equal(invocation.options.env.ROOT, expected);
            const manifest = JSON.parse([...build.writes].find(([file]) => file.endsWith('/build-manifest.json'))[1]);
            assert.equal(manifest.assetBase, expected);
            assert.equal(manifest.publicPath, expected);
            assert.equal(manifest.commit, upstream.commit);
            assert(manifest.files['editor.html']);
            assert(manifest.files['source.tar.gz']);
            assert(build.writes.get('/isolated-test-upstream/src/lib/detect-locale.js')
                .includes('const supported = supportedLocales.find('));
            const { config, HtmlWebpackPlugin } = configureWebpack(invocation.options.env.ROOT);
            assert.equal(config.output.publicPath, expected);
            assert.equal(config.output.crossOriginLoading, 'anonymous');
            const html = config.plugins.find((plugin) => plugin instanceof HtmlWebpackPlugin);
            assert.equal(html.options.filename, 'editor.html', 'the same-site HTML entry must remain available');
        });
    }

    it('rejects unsafe asset bases before any checkout, package installation or filesystem mutation', () => {
        for (const value of [
            '', 'scratch-editor/', '//cdn.example.test/scratch-editor/', 'http://cdn.example.test/',
            'javascript:alert(1)', 'https:cdn.example.test/', 'https:///cdn.example.test/',
            'https://user:secret@cdn.example.test/', 'https://@cdn.example.test/',
            'https://cdn.example.test/?token=private', 'https://cdn.example.test/?',
            'https://cdn.example.test/#fragment', 'https://cdn.example.test/#',
            '/scratch-editor/?x=1', '/scratch-editor/#x', '/scratch-editor/../private/',
            'https://cdn.example.test/a/../b/', '/a/./b/', '/%2e%2e/private/', '/a%2fb/',
            'https://cdn.example.test/%252fprivate/', '/a//b/', '/\\cdn.example.test/',
            'https://cdn.example.test\\other.test/', ' https://cdn.example.test/',
            'https://cdn.example.test/\n', '/a b/', '/a\u0000b/',
        ]) {
            const build = runBuild(value);
            assert.throws(build.run, /SCRATCH_ASSET_BASE/, `Unsafe value was accepted: ${JSON.stringify(value)}`);
            assert.equal(build.calls.length, 0);
            assert.equal(build.writes.size, 0);
        }
    });

    it('marks every HTML entry script anonymous while keeping the pinned isolation patches', () => {
        const { config } = configureWebpack('https://cdn.example.test/releases/v2/scratch-editor/');
        const tags = { assetTags: { scripts: [
            { attributes: { src: 'https://cdn.example.test/editor.abc.js' } },
            { attributes: { src: 'https://cdn.example.test/runtime.def.js', defer: true } },
        ] } };
        let invoked = false;
        const compiler = { hooks: { compilation: { tap(_name, callback) {
            callback({ alterAssetTags: { tap(_hookName, mutate) {
                assert.equal(mutate(tags), tags);
                invoked = true;
            } } });
        } } } };
        config.plugins.filter((plugin) => typeof plugin.apply === 'function').forEach((plugin) => plugin.apply(compiler));
        assert.equal(invoked, true);
        assert(tags.assetTags.scripts.every((script) => script.attributes.crossorigin === 'anonymous'));
        assert.equal(tags.assetTags.scripts[1].attributes.defer, true);
        assert(config.module.rules.some((rule) => rule.test.test('/upstream/node_modules/@turbowarp/paper/dist/paper-full.js')
            && rule.loader.endsWith('/src/playground/onebyone-paper-sandbox-loader.cjs')));
        const replacements = config.plugins.filter((plugin) => plugin.pattern);
        assert(replacements.some((plugin) => plugin.pattern.test('containers/tw-restore-point-manager.jsx')));
        assert(replacements.some((plugin) => plugin.pattern.test('lib/libraries/extensions/index.jsx')));
    });
});
