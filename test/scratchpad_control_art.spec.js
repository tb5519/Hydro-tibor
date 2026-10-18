const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const React = require('react');
const ReactDOM = require('react-dom/client');
const stylus = require('stylus');
const controlStyles = stylus.render(fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/components/scratchpad/ControlArt.page.styl'), 'utf8'));
// jsdom does not yet parse container queries; compile them above, then use the
// real base CSS for native focus/disabled/selected image-state assertions.
const domStyles = controlStyles.slice(0, controlStyles.indexOf('@container'));

const source = esbuild.buildSync({
    stdin: { contents: `
        export { ToolbarButtonComponent as Button } from './ToolbarComponent';
        export { default as DataInput } from './DataInputComponent';
        export { ScratchpadArtThemeContext, ScratchpadControlLabel, ScratchpadLanguageArt } from './ScratchpadControlArt';
    `, resolveDir: path.resolve(__dirname, '../packages/ui-default/components/scratchpad'), loader: 'tsx' },
    bundle: true, write: false, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;

const skin = (version = 'v1') => ({
    id: 'badge:7', badgeId: 7, version,
    controls: Object.fromEntries(['run', 'language', 'problemTab', 'settingsTab', 'inputTitle', 'inputPlaceholder', 'emptyOutput', 'emptyRecords'].map((key) => [key, {
        assetId: 'main', width: 180, height: 60, hoverAssetId: 'hover', activeAssetId: 'pressed',
    }])),
    assets: ['main', 'hover', 'pressed'].map((id) => ({ id, type: 'image/png', url: `/${version}/${id}.png` })),
});

async function harness() {
    const dom = new JSDOM('<div id="scratchpad"><div id="root"></div></div>', { url: 'https://example.test/p/1' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window;
    global.document = dom.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const mod = { exports: {} };
    vm.runInNewContext(source, { require, module: mod, exports: mod.exports, React });
    const style = dom.window.document.createElement('style');
    style.textContent = domStyles;
    dom.window.document.head.appendChild(style);
    const components = mod.exports;
    const root = ReactDOM.createRoot(dom.window.document.getElementById('root'));
    return {
        ...components, document: dom.window.document,
        opacity(selector) { return dom.window.getComputedStyle(dom.window.document.querySelector(selector)).opacity; },
        async render(theme, child) {
            await React.act(async () => root.render(React.createElement(components.ScratchpadArtThemeContext.Provider, { value: theme }, child)));
        },
        async imageEvent(selector, type = 'load') {
            const image = dom.window.document.querySelector(selector);
            assert.ok(image, selector);
            await React.act(async () => image.dispatchEvent(new dom.window.Event(type)));
        },
        async click(element) { await React.act(async () => element.click()); },
        async close() {
            await React.act(async () => root.unmount());
            dom.window.close();
            global.window = previous.window;
            global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        },
    };
}

describe('transparent scratchpad control artwork', () => {
    it('keeps a real labelled button, reveals art after load and preserves disabled/busy/toggle states', async () => {
        const h = await harness();
        let clicks = 0;
        const button = (props = {}) => React.createElement(h.Button, {
            controlArt: 'run', artLabel: '运行自测', onClick: () => { clicks += 1; }, ...props,
        }, '运行自测');
        try {
            await h.render(skin(), button());
            const node = h.document.querySelector('button');
            assert.equal(node.classList.contains('scratchpad__image-control'), false);
            assert.equal(node.querySelector('.scratchpad__control-fallback').textContent, '运行自测');
            await h.imageEvent('[data-art-variant="base"]');
            assert.equal(node.classList.contains('scratchpad__image-control'), true);
            assert.equal(node.getAttribute('aria-label'), '运行自测');
            assert.equal(node.querySelector('img').getAttribute('alt'), '');
            assert.ok(node.querySelector('.scratchpad__art-sr-only'));
            await h.click(node);
            assert.equal(clicks, 1);
            await h.imageEvent('[data-art-variant="hover"]');
            await h.imageEvent('[data-art-variant="active"]');
            assert.equal(node.querySelector('.scratchpad__control-art').dataset.hover, 'true');
            assert.equal(node.querySelector('.scratchpad__control-art').dataset.active, 'true');
            await h.render(skin(), button({ disabled: true, activated: true, artStatus: '运行中…', 'aria-busy': true }));
            assert.strictEqual(h.document.querySelector('button'), node);
            assert.equal(node.disabled, true);
            assert.equal(node.getAttribute('aria-pressed'), 'true');
            assert.equal(node.getAttribute('aria-busy'), 'true');
            assert.equal(node.querySelector('[role="status"]').textContent, '运行中…');
            await h.click(node);
            assert.equal(clicks, 1);
        } finally { await h.close(); }
    });

    it('falls back on failure and new versions without replacing adjacent code or changing input', async () => {
        const h = await harness();
        const children = React.createElement(React.Fragment, null,
            React.createElement(h.Button, { controlArt: 'run', artLabel: '运行自测' }, '运行自测'),
            React.createElement('textarea', { defaultValue: 'print("saved")', 'aria-label': '代码' }));
        try {
            await h.render(skin(), children);
            const textarea = h.document.querySelector('textarea');
            textarea.value = 'print("changed")';
            await h.imageEvent('[data-art-variant="base"]', 'error');
            assert.equal(h.document.querySelector('button').classList.contains('scratchpad__image-control'), false);
            await h.render(skin('v2'), children);
            await h.imageEvent('[data-art-variant="base"]');
            assert.equal(h.document.querySelector('button').classList.contains('scratchpad__image-control'), true);
            await h.imageEvent('[data-art-variant="hover"]', 'error');
            assert.equal(h.document.querySelector('button').classList.contains('scratchpad__image-control'), true);
            await h.render(skin('v3'), children);
            assert.equal(h.document.querySelector('button').classList.contains('scratchpad__image-control'), false);
            await h.render({ id: 'ocean' }, children);
            assert.equal(h.document.querySelectorAll('img').length, 0);
            assert.strictEqual(h.document.querySelector('textarea'), textarea);
            assert.equal(textarea.value, 'print("changed")');
            assert.equal(h.document.querySelector('.scratchpad__control-fallback').textContent, '运行自测');
        } finally { await h.close(); }
    });

    it('decorates a native language selector without hiding its current value or disabled state', async () => {
        const h = await harness();
        try {
            await h.render(skin(), React.createElement(h.ScratchpadLanguageArt, null,
                React.createElement('select', { 'aria-label': 'Language', defaultValue: 'cpp', disabled: true },
                    React.createElement('option', { value: 'cpp' }, 'C++14'),
                    React.createElement('option', { value: 'python' }, 'Python 3'))));
            const select = h.document.querySelector('select');
            await h.imageEvent('[data-art-variant="base"]');
            assert.ok(select.parentElement.classList.contains('scratchpad__language-art--ready'));
            assert.equal(select.value, 'cpp');
            assert.equal(select.selectedOptions[0].textContent, 'C++14');
            assert.equal(select.disabled, true);
            assert.equal(select.classList.contains('scratchpad__art-sr-only'), false);
            await h.imageEvent('[data-art-variant="base"]', 'error');
            assert.equal(select.parentElement.classList.contains('scratchpad__language-art--ready'), false);
            assert.strictEqual(h.document.querySelector('select'), select);
        } finally { await h.close(); }
    });

    it('compiles responsive image sizes and applies real language focus and sidebar selected artwork', async () => {
        assert.match(controlStyles, /@container scratchpad-editor \(max-width: 480px\)/);
        assert.doesNotMatch(controlStyles, /max-width: 740px/);
        assert.match(controlStyles, /max-width: min\(320px, calc\(100vw - 48px\)\)/);
        assert.match(controlStyles, /width: min\(var\(--scratchpad-art-width\), 160px\)/);
        const h = await harness();
        const controls = (disabled = false) => React.createElement(React.Fragment, null,
            React.createElement(h.ScratchpadLanguageArt, null,
                React.createElement('select', { disabled, 'aria-label': 'Language', defaultValue: 'cpp' },
                    React.createElement('option', { value: 'cpp' }, 'C++14'))),
            React.createElement('div', { className: 'scratchpad__tablist' },
                React.createElement('button', { type: 'button', 'aria-pressed': true, 'aria-label': '题目' },
                    React.createElement(h.ScratchpadControlLabel, { control: 'problemTab' }, '题目'))));
        try {
            await h.render(skin(), controls());
            for (const scope of ['.scratchpad__language-art', '[data-control-art="problemTab"]']) {
                for (const variant of ['base', 'hover', 'active']) await h.imageEvent(`${scope} [data-art-variant="${variant}"]`);
            }
            assert.equal(h.opacity('[data-control-art="problemTab"] [data-art-variant="active"]'), '1');
            assert.equal(h.opacity('[data-control-art="problemTab"] [data-art-variant="base"]'), '0');
            const select = h.document.querySelector('select');
            await React.act(async () => select.focus());
            assert.equal(h.opacity('.scratchpad__language-art [data-art-variant="hover"]'), '1');
            assert.equal(h.opacity('.scratchpad__language-art [data-art-variant="base"]'), '0');
            await h.render(skin(), controls(true));
            assert.equal(h.opacity('.scratchpad__language-art [data-art-variant="base"]'), '1');
            assert.equal(h.opacity('.scratchpad__language-art [data-art-variant="hover"]'), '0');
            assert.equal(h.document.querySelector('.scratchpad__image-label').getAttribute('role'), null);
            assert.equal(h.document.querySelector('.scratchpad__image-label').tabIndex, -1);
        } finally { await h.close(); }
    });

    it('switches the native settings sidebar button with loaded and selected PNG artwork', async () => {
        const h = await harness();
        function Sidebar() {
            const [active, setActive] = React.useState('problem');
            return React.createElement('div', { className: 'scratchpad__tablist' },
                ...['problem', 'settings'].map((key) => React.createElement('button', {
                    key, type: 'button', 'aria-label': key === 'problem' ? '题目' : '设置',
                    'aria-pressed': active === key, onClick: () => setActive(key),
                }, React.createElement(h.ScratchpadControlLabel, { control: `${key}Tab` }, key))));
        }
        try {
            await h.render(skin(), React.createElement(Sidebar));
            const button = h.document.querySelector('button[aria-label="设置"]');
            for (const variant of ['base', 'hover', 'active']) await h.imageEvent(`[data-control-art="settingsTab"] [data-art-variant="${variant}"]`);
            assert.equal(h.opacity('[data-control-art="settingsTab"] [data-art-variant="base"]'), '1');
            await React.act(async () => button.focus());
            assert.equal(h.opacity('[data-control-art="settingsTab"] [data-art-variant="hover"]'), '1');
            await h.click(button);
            assert.equal(button.getAttribute('aria-pressed'), 'true');
            assert.equal(h.document.querySelector('button[aria-label="题目"]').getAttribute('aria-pressed'), 'false');
            assert.equal(h.opacity('[data-control-art="settingsTab"] [data-art-variant="active"]'), '1');
            await h.imageEvent('[data-control-art="settingsTab"] [data-art-variant="base"]', 'error');
            assert.equal(button.querySelector('.scratchpad__art-sr-only'), null);
            assert.equal(button.getAttribute('aria-label'), '设置');
        } finally { await h.close(); }
    });

    it('hides the default empty-state decoration only after artwork loads and restores it on image failure', async () => {
        const h = await harness();
        try {
            await h.render(skin(), React.createElement(h.ScratchpadControlLabel, {
                control: 'emptyRecords', fallbackDecoration: React.createElement('i', { 'data-icon': 'flag' }),
            }, '暂无评测记录'));
            assert.ok(h.document.querySelector('[data-icon="flag"]'));
            await h.imageEvent('[data-art-variant="base"]');
            assert.equal(h.document.querySelector('[data-icon="flag"]'), null);
            assert.equal(h.document.querySelector('.scratchpad__art-sr-only').textContent, '暂无评测记录');
            await h.imageEvent('[data-art-variant="base"]', 'error');
            assert.ok(h.document.querySelector('[data-icon="flag"]'));
            assert.equal(h.document.querySelector('.scratchpad__art-sr-only'), null);
        } finally { await h.close(); }
    });

    it('replaces static input labels and empty artwork while preserving editable input and actual output text', async () => {
        const h = await harness();
        const pane = (value = '') => React.createElement(h.DataInput, { title: '输入', titleArt: 'inputTitle', value, onChange() {} });
        try {
            await h.render(skin(), pane());
            const input = h.document.querySelector('textarea');
            assert.equal(input.getAttribute('placeholder'), '在这里输入测试数据');
            await h.imageEvent('[data-control-art="inputTitle"] [data-art-variant="base"]');
            await h.imageEvent('.scratchpad__input-art-placeholder [data-art-variant="base"]');
            assert.equal(input.getAttribute('placeholder'), '');
            assert.equal(input.getAttribute('aria-label'), '输入');
            assert.ok(h.document.querySelector('[data-control-art="inputTitle"] .scratchpad__art-sr-only'));
            await h.render(skin(), pane('1 2 3'));
            assert.strictEqual(h.document.querySelector('textarea'), input);
            assert.equal(input.value, '1 2 3');
            assert.equal(h.document.querySelector('.scratchpad__input-art-placeholder'), null);
            await h.render(skin(), React.createElement(h.DataInput, { html: true, title: '输出', value: '<b>result</b>', hasResult: true }));
            assert.equal(h.document.querySelector('[role="log"]').textContent, 'result');
            assert.equal(h.document.querySelector('[data-control-art="emptyOutput"]'), null);
        } finally { await h.close(); }
    });
});
