const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const ReactDOM = require('react-dom/client');

const directory = path.resolve(__dirname, '../packages/ui-default/components/scratchpad');
const sources = Object.fromEntries([
    ['ScratchpadControlArt', 'tsx'], ['ScratchpadSkin', 'tsx'],
    ['ToolbarComponent', 'jsx'], ['DataInputComponent', 'jsx'],
].map(([name, extension]) => [name, esbuild.transformSync(fs.readFileSync(path.join(directory, `${name}.${extension}`), 'utf8'), {
    loader: extension, format: 'cjs', target: 'es2020',
}).code]));

function skin(version = 'v1', video = false) {
    return {
        id: 'badge:7', badgeId: 7, version,
        assets: [
            ...['base', 'hover', 'active', 'poster'].map((id) => ({ id, type: 'image/png', url: `/${version}/${id}.png` })),
            ...(video ? [{ id: 'movie', type: 'video/mp4', url: `/${version}/movie.mp4` }] : []),
        ],
        controls: Object.fromEntries(['run', 'inputTitle', 'inputPlaceholder'].map((id) => [id, {
            assetId: 'base', hoverAssetId: 'hover', activeAssetId: 'active', width: 118, height: 40,
        }])),
        ...(video ? { slots: { background: { assetId: 'movie', fit: 'cover', position: 'top center' } }, posterAssetId: 'poster' } : {}),
    };
}

async function harness() {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/p/1' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window;
    global.document = dom.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    // React was imported outside a browser, so its input-event feature probe
    // takes the legacy path when a real textarea receives focus in jsdom.
    dom.window.HTMLElement.prototype.attachEvent = () => {};
    dom.window.HTMLElement.prototype.detachEvent = () => {};
    const readyImages = new Set();
    const preparedVideos = new Map();
    const claims = [];
    const motionListeners = new Set();
    const motion = {
        matches: false,
        addEventListener(type, callback) { assert.equal(type, 'change'); motionListeners.add(callback); },
        removeEventListener(type, callback) { assert.equal(type, 'change'); motionListeners.delete(callback); },
    };
    dom.window.matchMedia = () => motion;
    let visibility = 'visible';
    Object.defineProperty(dom.window.document, 'visibilityState', { get: () => visibility, configurable: true });
    let createdVideos = 0;
    const createElement = dom.window.document.createElement.bind(dom.window.document);
    dom.window.document.createElement = (tag, ...args) => {
        if (tag === 'video') createdVideos += 1;
        return createElement(tag, ...args);
    };
    const modules = new Map();
    const mockedAssets = {
        isScratchpadThemeImageReady: (url) => readyImages.has(url),
        takePreparedScratchpadVideo(url) {
            claims.push(url);
            const result = preparedVideos.get(url);
            preparedVideos.delete(url);
            return result;
        },
    };
    const mockedThemes = {
        scratchpadSkinAsset(theme, slot) { return theme.assets?.find((asset) => asset.id === theme.slots?.[slot]?.assetId); },
    };
    function load(name) {
        if (modules.has(name)) return modules.get(name).exports;
        const mod = { exports: {} };
        modules.set(name, mod);
        vm.runInNewContext(sources[name], {
            module: mod, exports: mod.exports, React, window: dom.window, document: dom.window.document,
            require(id) {
                if (id === './themeAssets') return mockedAssets;
                if (id === './themes') return mockedThemes;
                if (id.startsWith('./') && sources[id.slice(2)]) return load(id.slice(2));
                return require(id);
            },
        });
        return mod.exports;
    }
    const components = {
        ...load('ScratchpadControlArt'), Skin: load('ScratchpadSkin').default,
        Button: load('ToolbarComponent').ToolbarButtonComponent,
        DataInput: load('DataInputComponent').default,
    };
    const root = ReactDOM.createRoot(dom.window.document.getElementById('root'));
    return {
        ...components, document: dom.window.document, claims, motionListeners,
        get createdVideos() { return createdVideos; },
        prepareImages(theme) { for (const asset of theme.assets) if (asset.type.startsWith('image/')) readyImages.add(asset.url); },
        prepareVideo(url) {
            const video = dom.window.document.createElement('video');
            video.src = url;
            Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
            const calls = { play: 0, pause: 0, load: 0 };
            video.play = () => { calls.play += 1; return Promise.resolve(); };
            video.pause = () => { calls.pause += 1; };
            video.load = () => { calls.load += 1; };
            preparedVideos.set(url, video);
            return { video, calls };
        },
        async render(child) { await React.act(async () => root.render(child)); },
        async event(node, type) { await React.act(async () => node.dispatchEvent(new dom.window.Event(type))); },
        async motion(reduced) {
            motion.matches = reduced;
            await React.act(async () => { for (const callback of motionListeners) callback(); });
        },
        async visibility(value) {
            visibility = value;
            await React.act(async () => dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')));
        },
        async close() {
            await React.act(async () => root.unmount());
            dom.window.close();
            global.window = previous.window;
            global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        },
    };
}

describe('prepared scratchpad artwork and video integration', () => {
    it('renders all prepared PNG states in the first commit and preserves real controls, text and focus across themes', async () => {
        const h = await harness();
        const observations = [];
        function FirstCommit() {
            React.useLayoutEffect(() => {
                observations.push([...h.document.querySelectorAll('.scratchpad__control-art')].map((node) => [node.dataset.ready, node.dataset.hover, node.dataset.active]));
            });
            return null;
        }
        const interfaceFor = (theme) => React.createElement(h.ScratchpadArtThemeContext.Provider, { value: theme },
            React.createElement(h.Button, { controlArt: 'run', artLabel: '运行自测' }, '运行自测'),
            React.createElement(h.DataInput, { title: '输入', titleArt: 'inputTitle', value: 'draft input', onChange() {} }),
            React.createElement(FirstCommit));
        try {
            const first = skin();
            h.prepareImages(first);
            await h.render(interfaceFor(first));
            assert.deepEqual(observations[0], [['true', 'true', 'true'], ['true', 'true', 'true']]);
            const button = h.document.querySelector('button');
            const input = h.document.querySelector('textarea');
            assert.equal(button.classList.contains('scratchpad__image-control'), true);
            assert.equal(button.getAttribute('aria-label'), '运行自测');
            assert.equal(input.placeholder, '');
            input.focus();
            input.setSelectionRange(3, 6);
            const second = skin('v2');
            h.prepareImages(second);
            await h.render(interfaceFor(second));
            assert.deepEqual(observations[1], observations[0]);
            assert.strictEqual(h.document.querySelector('button'), button);
            assert.strictEqual(h.document.querySelector('textarea'), input);
            assert.strictEqual(h.document.activeElement, input);
            assert.equal(input.value, 'draft input');
            assert.equal(input.selectionStart, 3);
            assert.equal(input.selectionEnd, 6);
            assert.equal(button.querySelector('img').getAttribute('src'), '/v2/base.png');
            await h.event(button.querySelector('[data-art-variant="base"]'), 'error');
            assert.equal(button.classList.contains('scratchpad__image-control'), false);
            assert.equal(button.querySelector('.scratchpad__control-fallback').textContent, '运行自测');
            assert.equal(button.getAttribute('aria-label'), '运行自测');
            assert.strictEqual(h.document.querySelector('textarea'), input);
        } finally { await h.close(); }
    });

    it('mounts the decoded video node and its ready frame in the first layout commit without creating another video', async () => {
        const h = await harness();
        const theme = skin('v1', true);
        const { video, calls } = h.prepareVideo('/v1/movie.mp4');
        const snapshots = [];
        function FirstCommit() {
            React.useLayoutEffect(() => {
                const node = h.document.querySelector('.scratchpad__skin-background video');
                snapshots.push({ node, ready: node?.classList.contains('is-ready') });
            });
            return null;
        }
        const interfaceFor = (selected) => React.createElement(React.Fragment, null,
            React.createElement(h.Skin, { theme: selected }), React.createElement(FirstCommit));
        try {
            await h.render(interfaceFor(theme));
            assert.strictEqual(snapshots[0].node, video);
            assert.equal(snapshots[0].ready, true);
            assert.equal(h.createdVideos, 1);
            assert.equal(calls.play, 1);
            assert.equal(video.muted, true);
            assert.equal(video.playsInline, true);
            assert.equal(video.loop, true);
            assert.equal(video.style.objectFit, 'cover');
            assert.equal(video.style.objectPosition, 'top center');
            assert.match(h.document.querySelector('.scratchpad__skin-background').style.backgroundImage, /poster\.png/);
            await h.render(interfaceFor({ ...theme, description: 'another render' }));
            assert.strictEqual(h.document.querySelector('video'), video);
            assert.equal(h.createdVideos, 1);
            assert.deepEqual(h.claims, ['/v1/movie.mp4']);
            assert.equal(calls.pause, 0);
            await h.visibility('hidden');
            assert.equal(calls.pause, 1);
            await h.visibility('visible');
            assert.equal(calls.play, 2);
            await h.motion(true);
            assert.equal(calls.pause, 2);
            assert.equal(video.classList.contains('is-ready'), true);
            await h.motion(false);
            assert.equal(calls.play, 3);
            await h.render(null);
            assert.equal(video.isConnected, false);
            assert.equal(video.getAttribute('src'), null);
            assert.equal(calls.pause, 3);
            assert.equal(calls.load, 1);
            assert.equal(h.motionListeners.size, 0);
            await h.visibility('hidden');
            assert.equal(calls.pause, 3, 'unmounted videos must no longer receive lifecycle events');
        } finally { await h.close(); }
    });

    it('retains the prepared first frame with reduced motion and falls back to the complete poster after a later media error', async () => {
        const h = await harness();
        const { video, calls } = h.prepareVideo('/v1/movie.mp4');
        try {
            await h.motion(true);
            await h.render(React.createElement(h.Skin, { theme: skin('v1', true) }));
            assert.equal(video.classList.contains('is-ready'), true);
            assert.equal(calls.play, 0);
            assert.equal(calls.pause, 1);
            const background = h.document.querySelector('.scratchpad__skin-background');
            assert.match(background.style.backgroundImage, /\/v1\/poster\.png/);
            await h.event(video, 'error');
            assert.equal(h.document.querySelector('video'), null);
            assert.equal(background.isConnected, true);
            assert.match(background.style.backgroundImage, /\/v1\/poster\.png/);
            assert.equal(h.createdVideos, 1, 'media errors must not trigger another separately loading video');
            await h.render(null);
            assert.equal(calls.load, 1);
            assert.equal(h.motionListeners.size, 0);
        } finally { await h.close(); }
    });
});
