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
const compile = (file, loader) => esbuild.transformSync(fs.readFileSync(path.join(directory, file), 'utf8'), { loader, format: 'cjs', target: 'es2020' }).code;
const pickerSource = compile('ScratchpadThemePicker.tsx', 'tsx');
const themesSource = compile('themes.ts', 'ts');
const runtime = { exports: {} };
vm.runInNewContext(themesSource, {
    module: runtime, exports: runtime.exports, require(id) {
        if (id === 'react') return React;
        if (id === 'vj/components/notification' || id === 'vj/utils' || id.startsWith('./')) return {};
        return require(id);
    },
});
const builtins = runtime.exports.SCRATCHPAD_THEMES;
const badge = (id = 7, preferredBase = null) => ({
    ...builtins.find((item) => item.id === (preferredBase || 'ocean')), id: `badge:${id}`, badgeId: id,
    name: id === 7 ? '幸运女神 · 一星祈愿' : '疾风剑客', badgeTitle: id === 7 ? '幸运女神' : '疾风剑客',
    thumbnailUrl: `/theme-${id}.webp`, preferredBase, base: preferredBase || 'ocean', defaultBase: 'ocean',
});

async function harness(options = {}) {
    const dom = new JSDOM('<div id="root"></div><button id="outside">下一步</button>', { url: 'https://school.example/p/1' });
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = dom.window;
    global.document = dom.window.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    dom.window.HTMLElement.prototype.getClientRects = () => [{ x: 0 }];
    dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 900, right: 1040, top: 46, bottom: 80, width: 140, height: 34 });
    const catalogListeners = new Set();
    const themeListeners = new Set();
    const requests = [];
    let choices = [...builtins, badge(), badge(8, 'mist')];
    let theme = choices.find((item) => item.id === (options.current || 'badge:7'));
    const mockedThemes = {
        SCRATCHPAD_THEMES: builtins,
        SCRATCHPAD_THEME_PICKER_EVENT: 'scratchpad:theme-picker',
        scratchpadThemeVariables: runtime.exports.scratchpadThemeVariables,
        hasScratchpadAdministratorThemeAccess: () => false,
        refreshScratchpadThemes: async () => true,
        useScratchpadTheme: () => React.useSyncExternalStore((listener) => { themeListeners.add(listener); return () => themeListeners.delete(listener); }, () => theme),
        useScratchpadThemes: () => React.useSyncExternalStore((listener) => { catalogListeners.add(listener); return () => catalogListeners.delete(listener); }, () => choices),
        selectScratchpadTheme: async (id, base) => {
            requests.push({ id, base });
            const success = options.select ? await options.select(id, base) : true;
            if (!success) return false;
            let selected = choices.find((item) => item.id === id);
            if (base !== undefined) {
                selected = badge(selected.badgeId, base === 'default' ? null : base);
                choices = choices.map((item) => item.id === id ? selected : item);
            }
            theme = selected;
            for (const listener of [...catalogListeners, ...themeListeners]) listener();
            dom.window.dispatchEvent(new dom.window.Event('scratchpad:theme-ready'));
            return true;
        },
    };
    const mod = { exports: {} };
    vm.runInNewContext(pickerSource, {
        module: mod, exports: mod.exports, window: dom.window, document: dom.window.document,
        UiContext: { codeEditorThemesUrl: '/editor-themes' }, UserContext: { _id: 7 },
        require(id) {
            if (id === './themes') return mockedThemes;
            if (id === './ScratchpadControlArt') return { useScratchpadControlArt: () => ({ ready: false, art: null }) };
            return require(id);
        },
    });
    const root = ReactDOM.createRoot(dom.window.document.getElementById('root'));
    await React.act(async () => root.render(React.createElement(mod.exports.default)));
    const get = (selector) => dom.window.document.querySelector(selector);
    const click = async (selector) => React.act(async () => (typeof selector === 'string' ? get(selector) : selector).click());
    return {
        window: dom.window, document: dom.window.document, requests, get, click,
        theme: () => theme,
        async updateCatalogPreference(id, base) {
            await React.act(async () => {
                choices = choices.map((item) => item.id === id ? badge(item.badgeId, base) : item);
                for (const listener of catalogListeners) listener();
            });
        },
        open: () => click('.scratchpad__theme-trigger'),
        key: async (key) => React.act(async () => dom.window.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }))),
        async close() {
            await React.act(async () => root.unmount());
            dom.window.close();
            global.window = previous.window;
            global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        },
    };
}

describe('student badge theme colour picker', () => {
    it('opens the current badge directly with four clear swatches and the original design, without rewriting preferences', async () => {
        const h = await harness();
        try {
            await h.open();
            assert.match(h.get('[role="dialog"]').getAttribute('aria-label'), /幸运女神.*选择配色/);
            assert.equal(h.document.querySelectorAll('[data-theme-palette]').length, 5);
            assert.equal(h.get('[data-theme-palette="default"]').getAttribute('aria-checked'), 'true');
            assert.equal(h.document.activeElement, h.get('[data-theme-palette="default"]'));
            assert.equal(h.requests.length, 0);
            assert.match(h.get('.scratchpad__theme-detail-title img').src, /theme-7.webp$/);
        } finally { await h.close(); }
    });

    it('keeps the same badge and artwork when changing colour, remains open, and restores the choice on reopening', async () => {
        const h = await harness();
        try {
            await h.open();
            await h.click('[data-theme-palette="mist"]');
            assert.deepEqual(h.requests, [{ id: 'badge:7', base: 'mist' }]);
            assert.equal(h.theme().id, 'badge:7');
            assert.equal(h.get('[data-theme-palette="mist"]').getAttribute('aria-checked'), 'true');
            assert.match(h.get('[role="status"]').textContent, /已记住/);
            assert.match(h.get('.scratchpad__theme-detail-title img').src, /theme-7.webp$/);
            await h.key('Escape');
            assert.equal(h.get('[role="dialog"]'), null);
            await h.open();
            assert.equal(h.get('[data-theme-palette="mist"]').getAttribute('aria-checked'), 'true');
        } finally { await h.close(); }
    });

    it('marks the actual displayed palette when a refreshed catalog is ahead of a failed visual change', async () => {
        for (const [id, displayed] of [['badge:7', 'default'], ['badge:8', 'mist']]) {
            const h = await harness({ current: id });
            try {
                await h.open();
                // A save can reach the server before its response fails. A later
                // catalog refresh must not claim a new palette is on screen.
                await h.updateCatalogPreference(id, 'cloud');
                assert.equal(h.theme().preferredBase, displayed === 'default' ? null : displayed);
                assert.equal(h.get(`[data-theme-palette="${displayed}"]`).getAttribute('aria-checked'), 'true');
                assert.equal(h.get('[data-theme-palette="cloud"]').getAttribute('aria-checked'), 'false');
                assert.equal(h.document.querySelectorAll('[data-theme-palette][aria-checked="true"]').length, 1);
                if (displayed === 'default') assert.equal(h.get('[data-theme-palette="default"] .scratchpad__theme-check').textContent, '✓');
            } finally { await h.close(); }
        }
    });

    it('uses an explicit default action to restore the original theme instead of losing the badge', async () => {
        const h = await harness({ current: 'badge:8' });
        try {
            await h.open();
            assert.equal(h.get('[data-theme-palette="mist"]').getAttribute('aria-checked'), 'true');
            await h.click('[data-theme-palette="default"]');
            assert.deepEqual(h.requests, [{ id: 'badge:8', base: 'default' }]);
            assert.equal(h.theme().preferredBase, null);
            assert.equal(h.theme().id, 'badge:8');
            assert.equal(h.get('[data-theme-palette="default"]').getAttribute('aria-checked'), 'true');
        } finally { await h.close(); }
    });

    it('shows saving and prevents duplicate writes until the new colour is confirmed', async () => {
        let finish;
        const h = await harness({ select: () => new Promise((resolve) => { finish = resolve; }) });
        try {
            await h.open();
            h.get('[data-theme-palette="sand"]').focus();
            await h.click('[data-theme-palette="sand"]');
            h.get('[data-theme-palette="sand"]').blur();
            assert.match(h.get('[role="status"]').textContent, /正在保存/);
            assert.equal(h.get('[data-theme-palette="sand"]').disabled, true);
            assert.equal(h.get('[data-theme-palette="default"]').getAttribute('aria-checked'), 'true');
            await h.click('[data-theme-palette="mist"]');
            assert.equal(h.requests.length, 1);
            await React.act(async () => finish(true));
            assert.equal(h.get('[data-theme-palette="sand"]').getAttribute('aria-checked'), 'true');
            assert.equal(h.document.activeElement, h.get('[data-theme-palette="sand"]'));
            assert.equal(h.get('[data-theme-palette="mist"]').disabled, false);
        } finally { await h.close(); }
    });

    it('retains the previous selection after a failed save and lets the student retry in place', async () => {
        let success = false;
        const h = await harness({ select: async () => success });
        try {
            await h.open();
            await h.click('[data-theme-palette="ocean"]');
            assert.match(h.get('[role="status"]').textContent, /没有保存成功/);
            assert.equal(h.get('[data-theme-palette="default"]').getAttribute('aria-checked'), 'true');
            assert.equal(h.theme().preferredBase, null);
            success = true;
            await h.click('[data-theme-palette="ocean"]');
            assert.equal(h.get('[data-theme-palette="ocean"]').getAttribute('aria-checked'), 'true');
            assert.match(h.get('[role="status"]').textContent, /已记住/);
        } finally { await h.close(); }
    });

    it('offers all themes through a back button, then opens a chosen badge with its own remembered colour', async () => {
        const h = await harness();
        try {
            await h.open();
            await h.click('.scratchpad__theme-back');
            assert.equal(h.get('[data-theme-palette]'), null);
            assert.equal(h.document.querySelectorAll('.scratchpad__theme-badge-option').length, 2);
            await h.click([...h.document.querySelectorAll('.scratchpad__theme-badge-option')].find((node) => node.textContent.includes('疾风剑客')));
            assert.deepEqual(h.requests, [{ id: 'badge:8', base: undefined }]);
            assert.equal(h.get('[data-theme-palette="mist"]').getAttribute('aria-checked'), 'true');
            assert.match(h.get('.scratchpad__theme-detail-title').textContent, /疾风剑客/);
        } finally { await h.close(); }
    });

    it('keeps the original one-click basic-theme selection and returns focus to the trigger', async () => {
        const h = await harness({ current: 'cloud' });
        try {
            await h.open();
            await h.click([...h.document.querySelectorAll('.scratchpad__theme-builtins button')].find((node) => node.textContent.includes('暖砂')));
            assert.deepEqual(h.requests, [{ id: 'sand', base: undefined }]);
            assert.equal(h.get('[role="dialog"]'), null);
            assert.equal(h.document.activeElement, h.get('.scratchpad__theme-trigger'));
        } finally { await h.close(); }
    });

    it('supports keyboard movement without accidental changes, Escape to close, and outside focus dismissal', async () => {
        const h = await harness();
        try {
            await h.open();
            await h.key('Home');
            assert.equal(h.document.activeElement, h.get('[data-theme-palette="cloud"]'));
            await h.key('ArrowRight');
            assert.equal(h.document.activeElement, h.get('[data-theme-palette="mist"]'));
            assert.equal(h.requests.length, 0);
            await h.key('Escape');
            assert.equal(h.get('[role="dialog"]'), null);
            assert.equal(h.document.activeElement, h.get('.scratchpad__theme-trigger'));
            await h.open();
            await React.act(async () => h.get('#outside').focus());
            assert.equal(h.get('[role="dialog"]'), null);
        } finally { await h.close(); }
    });

    it('clamps the portalled panel inside a narrow viewport', async () => {
        const h = await harness();
        try {
            Object.defineProperty(h.window, 'innerWidth', { value: 320 });
            Object.defineProperty(h.window, 'innerHeight', { value: 380 });
            await h.open();
            const panel = h.get('[role="dialog"]');
            assert.equal(panel.style.left, '12px');
            assert.equal(panel.style.top, '12px');
        } finally { await h.close(); }
    });
});
