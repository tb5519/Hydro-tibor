const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const patch = require('../build/scratch/patch-libraries.cjs');
const root = path.resolve(__dirname, '..');
const workspace = [process.env.SCRATCH_BUILD_DIR, path.join(root, '.cache/scratch-player-build'),
    path.join(os.homedir(), 'Desktop/hydro-tibor/.cache/scratch-player-build')].filter(Boolean)
    .find((dir) => fs.existsSync(path.join(dir, 'src/components/library/library.jsx')));
const filename = `${'a'.repeat(32)}.svg`;
function helpers(fetch, timers = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, 'build/scratch/library-loader.js'), 'utf8'),
        { format: 'cjs' }).code, { module, exports: module.exports, Uint8Array, Set, AbortController,
        setTimeout, clearTimeout, ...timers, fetch, process: { env: { ROOT: 'https://static.example.test/v2/scratch-editor/' } } });
    return module.exports;
}
function fakeVM() {
    const cache = new Map();
    return { runtime: { storage: { AssetType: { Sound: 'sound', ImageVector: 'svg', ImageBitmap: 'png' },
        get: (id) => cache.get(id), cache(type, extension, data, id) { cache.set(id, { type, extension, data }); } } }, cache };
}
const success = () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
const component = () => ({ state: {}, setState(update) { Object.assign(this.state, update); } });

it('preloads each selected asset once into VM storage using the fixed CDN and no credentials', async () => {
    const calls = [];
    const h = helpers(async (url, options) => { calls.push({ url, options }); return success(); });
    const machine = fakeVM();
    await h.prepareAssets(machine, [filename, filename]);
    await h.prepareAssets(machine, [filename]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://static.example.test/v2/scratch-editor/library-assets/${filename}`);
    assert.equal(calls[0].options.credentials, 'omit');
    assert(calls[0].options.signal instanceof AbortSignal);
    assert.equal(machine.cache.get('a'.repeat(32)).type, 'svg');
    for (const input of ['../private.svg', 'https://other.test/file.svg', `${'a'.repeat(32)}.svg?token=x`, 'abc.svg']) {
        assert.throws(() => h.assetURL(input), /Invalid library asset/);
    }
});

it('failed, empty and aborted downloads do not publish cache entries or pretend a selection succeeded', async () => {
    for (const response of [{ ok: false }, { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }]) {
        const machine = fakeVM();
        await assert.rejects(helpers(async () => response).prepareAssets(machine, [filename]));
        assert.equal(machine.cache.size, 0);
    }
    const machine = fakeVM(); let aborted = false;
    const h = helpers((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
    }), { setTimeout: (fn) => setTimeout(fn, 1) });
    await assert.rejects(h.prepareAssets(machine, [filename]), /aborted/);
    assert.equal(aborted, true);
    assert.equal(machine.cache.size, 0);
});

it('catalog failure shows a retry state and stale or unmounted results never overwrite newer data', async () => {
    const h = helpers(); const c = component();
    await h.loadLibrary(c, () => Promise.reject(new Error('chunk unavailable')));
    assert.match(c.state.libraryError, /重试/);
    let finish;
    const old = h.loadLibrary(c, () => new Promise((resolve) => { finish = resolve; }));
    await Promise.resolve();
    await h.loadLibrary(c, () => ['new']);
    finish(['old']); await old;
    assert.deepEqual(c.state.data, ['new']);
    assert.equal(c.state.libraryError, null);
    const late = h.loadLibrary(c, () => new Promise((resolve) => { finish = resolve; }));
    await Promise.resolve(); c.onebyoneLoadToken = null; finish(['unmounted']); await late;
    assert.equal(c.state.data, null);
});

function loadComponent(file, libraryHelpers, globals = {}) {
    const raw = execFileSync('git', ['show', `HEAD:${file}`], { cwd: workspace, encoding: 'utf8' });
    class Component { constructor(props) { this.props = props; } setState(update) { Object.assign(this.state, update); } }
    const React = { Component, PureComponent: Component, createElement: (type, props, ...children) => ({ type, props, children }) };
    const type = () => type;
    type.isRequired = type;
    const PropTypes = new Proxy(type, { get: (_target, key) => key === '__esModule' ? false : type });
    const module = { exports: {} };
    const requireMock = (name) => {
        if (name === 'react') return React;
        if (name === 'prop-types') return PropTypes;
        if (name === 'lodash.bindall') return (target, names) => names.forEach((key) => { target[key] = target[key].bind(target); });
        if (name === 'react-intl') return { defineMessages: (value) => value, injectIntl: (value) => value, intlShape: type };
        if (name === 'react-redux') return { connect: () => (value) => value };
        if (name.includes('onebyone-library-loader')) return libraryHelpers;
        if (name.includes('randomize-sprite-position')) return () => {};
        return {};
    };
    vm.runInNewContext(transformSync(patch(file, raw), { format: 'cjs', loader: 'jsx' }).code,
        { module, exports: module.exports, require: requireMock, setTimeout, clearTimeout, Promise, console, ...globals });
    return module.exports.default;
}

it('all four stock selection handlers wait for assets before adding anything, and propagate failures to the chooser',
    { skip: !workspace }, async () => {
        for (const kind of ['costume', 'sprite', 'backdrop', 'sound']) {
            let fail = true; let insertions = 0;
            const h = helpers(async () => { if (fail) throw new Error('offline'); return success(); });
            const machine = fakeVM();
            for (const method of ['addCostumeFromLibrary', 'addSprite', 'addBackdrop', 'addSound']) {
                machine[method] = async () => { insertions++; };
            }
            const C = loadComponent(`src/containers/${kind}-library.jsx`, h);
            const c = new C({ vm: machine, onActivateBlocksTab: () => {}, onNewSound: () => {} });
            const item = { name: 'test', md5ext: filename, _md5: filename,
                costumes: [{ md5ext: filename }], sounds: [] };
            const select = c.handleItemSelected || c.handleItemSelect;
            await assert.rejects(select(item), /offline/);
            assert.equal(insertions, 0, `${kind} mutated the VM before download succeeded`);
            fail = false; await select(item);
            assert.equal(insertions, 1);
        }
    });

it('chooser stays open on failure, prevents duplicate pending inserts and closes only after a successful retry',
    { skip: !workspace }, async () => {
        const C = loadComponent('src/components/library/library.jsx', helpers());
        let close = 0; let calls = 0; let settle;
        const c = new C({ id: 'costumeLibrary', onRequestClose: () => { close++; }, onItemSelected: () => {
            calls++; return new Promise((resolve, reject) => { settle = { resolve, reject }; });
        } });
        c.onebyoneMounted = true; c.getFilteredData = () => [{ name: 'Rocketship' }];
        const pending = c.handleSelect(0);
        await c.handleSelect(0); c.handleClose();
        assert.equal(calls, 1); assert.equal(close, 0);
        settle.reject(new Error('offline')); await pending;
        assert.match(c.state.selectionError, /重试/); assert.equal(close, 0);
        const retry = c.handleSelect(0); settle.resolve(); await retry;
        assert.equal(close, 1); assert.equal(c.state.selecting, false);
    });

it('all four native libraries offer a teacher preset action with the correct kind and close only when accepted',
    { skip: !workspace }, () => {
        for (const kind of ['costume', 'sprite', 'backdrop', 'sound']) {
            const opened = []; let close = 0; let accepted = false;
            const C = loadComponent(`src/containers/${kind}-library.jsx`, helpers(), {
                window: { onebyoneOpenPresetLibrary(value) { opened.push(value); return accepted; } },
            });
            const c = new C({ vm: fakeVM(), intl: { formatMessage: value => value.defaultMessage },
                onRequestClose: () => { close++; } });
            const action = c.render().props.onOpenPresetLibrary;
            assert.equal(typeof action, 'function');
            action(); assert.equal(close, 0);
            accepted = true; action(); assert.equal(close, 1);
            assert.deepEqual(opened, [kind, kind]);
        }
    });

it('the global search autoloader creates no floating button or shortcut on the Scratch editor page', () => {
    const file = path.join(root, 'packages/ui-default/components/omnisearch/index.page.tsx');
    const code = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'tsx', format: 'cjs' }).code;
    const module = { exports: {} }; let initialized;
    vm.runInNewContext(code, { module, exports: module.exports,
        require(name) { if (name === 'vj/misc/Page') return { AutoloadPage: class { constructor(_name, callback) { initialized = callback; } } }; return {}; },
        document: { documentElement: { dataset: { layout: 'basic', page: 'scratch_editor' } } },
        $() { throw new Error('Scratch must not create global search UI'); } });
    initialized();
});
