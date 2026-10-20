const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../packages/ui-default/components/scratchpad');
const compile = (file) => esbuild.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
    loader: file.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs',
}).code;
const themeSource = compile('themes.ts');
const editorSource = compile('ScratchpadEditorContainer.tsx');
function harness(options = {}) {
    const dom = new JSDOM('', { url: 'https://example.test/p/P1000' });
    const user = { _id: 11, scratchpadTheme: 'cloud', ...options.user };
    const requests = [];
    const gets = [];
    const errors = [];
    const preparations = [];
    const transitions = [];
    const endpoint = '/d/class-a/home/settings/preference';
    const ui = {
        scratchpadThemePreferenceUrl: endpoint,
        ...(options.workspace ? { codeEditorThemesUrl: '/d/class-a/code-editor/themes' } : {}),
        ...options.ui,
    };
    const mod = { exports: {} };
    const context = {
        require(id) {
            if (id === 'vj/components/notification') return { error: (...args) => errors.push(args) };
            if (id === './themeAssets') return { prepareScratchpadThemeAssets: (theme) => {
                preparations.push(theme);
                return options.prepare ? options.prepare(theme) : Promise.resolve(true);
            } };
            if (id === './themeTransition') return { transitionScratchpadTheme: (commit, isCurrent, settings) => {
                transitions.push(settings || {});
                if (options.transition) return options.transition(commit, isCurrent, settings);
                const ready = isCurrent();
                if (ready) commit();
                return Promise.resolve(ready);
            } };
            if (id === 'vj/utils') {
                return { request: { get: async (...args) => {
                    gets.push(args);
                    return options.get ? options.get(...args) : {};
                }, post: async (...args) => {
                    requests.push(args);
                    return options.post ? options.post(...args) : {};
                } } };
            }
            return require(id);
        },
        window: dom.window, Event: dom.window.Event, URL: dom.window.URL, Date: options.Date || Date, UserContext: user,
        UiContext: ui,
        module: mod, exports: mod.exports,
    };
    vm.runInNewContext(themeSource, context);
    return { dom, user, ui, themes: mod.exports, requests, gets, errors, preparations, transitions, endpoint };
}

function badgeSkin(overrides = {}) {
    return {
        id: 'badge:7', badgeId: 7, badgeTitle: '疾风剑客', name: '疾风图片主题', base: 'ocean', version: 'revision-1',
        overlay: 0.82, expiresAt: null,
        slots: {
            background: { assetId: 'landscape', fit: 'cover', position: 'right center' },
            editor: { assetId: 'panel', fit: 'tile' },
            submitButton: { assetId: 'button', fit: 'stretch' },
        },
        assets: [
            { id: 'landscape', name: '背景.jpg', type: 'image/jpeg', url: '/d/class-a/code-editor/theme-asset/v1/background.jpg' },
            { id: 'panel', name: '面板.png', type: 'image/png', url: '/d/class-a/code-editor/theme-asset/v1/panel.png' },
            { id: 'button', name: '按钮.webp', type: 'image/webp', url: '/d/class-a/code-editor/theme-asset/v1/button.webp' },
        ],
        ...overrides,
    };
}

function catalog(overrides = {}) {
    return { themes: [badgeSkin()], selectedId: 'badge:7', fallback: 'ocean', serverNow: new Date().toISOString(), ...overrides };
}
function deferred() {
    let resolve;
    const promise = new Promise((accept) => { resolve = accept; });
    return { promise, resolve };
}
function contrast(first, second) {
    const luminance = (hex) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, index) => sum + v * [0.2126, 0.7152, 0.0722][index], 0);
    const [low, high] = [luminance(first), luminance(second)].sort((a, b) => a - b);
    return (high + 0.05) / (low + 0.05);
}

describe('scratchpad workspace themes', () => {
    it('keeps code, comments and primary button labels readable in all four palettes', () => {
        const { themes, dom } = harness();
        try {
            assert.equal(themes.SCRATCHPAD_THEMES.length, 4);
            for (const theme of themes.SCRATCHPAD_THEMES) {
                for (const key of ['text', 'textMuted', 'comment', 'keyword', 'string', 'number']) {
                    assert.ok(contrast(theme.palette.surface, theme.palette[key]) >= 4.5, `${theme.id} ${key}`);
                }
                const variables = themes.scratchpadThemeVariables(theme);
                assert.ok(contrast(theme.palette.accent, variables['--scratchpad-on-accent']) >= 4.5, `${theme.id} submit`);
                const monaco = themes.scratchpadMonacoTheme(theme);
                assert.equal(monaco.colors['editor.background'], variables['--ui-v2-surface']);
                assert.equal(monaco.colors['editorOverviewRuler.background'], variables['--ui-v2-surface']);
                assert.equal(monaco.colors['editorWidget.background'], variables['--ui-v2-surface-muted']);
            }
        } finally { dom.window.close(); }
    });

    it('persists choices per student and ignores unknown stored values', () => {
        const { themes, dom, user } = harness();
        try {
            themes.selectScratchpadTheme('ocean');
            assert.equal(dom.window.localStorage.getItem(themes.scratchpadThemeStorageKey(11)), 'ocean');
            user._id = 22;
            assert.equal(themes.currentScratchpadTheme().id, 'cloud');
            dom.window.localStorage.setItem(themes.scratchpadThemeStorageKey(22), 'obsolete');
            assert.equal(themes.currentScratchpadTheme().id, 'cloud');
            themes.selectScratchpadTheme('sand');
            user._id = 11;
            assert.equal(themes.currentScratchpadTheme().id, 'ocean');
        } finally { dom.window.close(); }
    });

    it('restores the saved account preference after logout and in another browser, ahead of stale local storage', async () => {
        const first = harness();
        let second;
        try {
            assert.equal(await first.themes.selectScratchpadTheme('ocean'), true);
            assert.equal(first.user.scratchpadTheme, 'ocean');
            assert.equal(first.requests[0][0], first.endpoint);
            assert.equal(first.requests[0][1].scratchpadTheme, 'ocean');
            second = harness({ user: { scratchpadTheme: first.user.scratchpadTheme } });
            second.dom.window.localStorage.setItem(second.themes.scratchpadThemeStorageKey(11), 'sand');
            assert.equal(second.themes.currentScratchpadTheme().id, 'ocean');
            assert.equal(second.requests.length, 0);
        } finally {
            first.dom.window.close();
            second?.dom.window.close();
        }
    });

    it('uses browser storage for guests without sending account preference writes', async () => {
        const { themes, dom, requests } = harness({ user: { _id: 0 } });
        try {
            dom.window.localStorage.setItem(themes.scratchpadThemeStorageKey(0), 'mist');
            assert.equal(themes.currentScratchpadTheme().id, 'mist');
            assert.equal(await themes.selectScratchpadTheme('sand'), true);
            assert.equal(dom.window.localStorage.getItem(themes.scratchpadThemeStorageKey(0)), 'sand');
            assert.equal(requests.length, 0);
        } finally { dom.window.close(); }
    });

    it('serializes account writes and skips superseded choices while preserving the latest visible theme', async () => {
        let releaseFirst;
        const firstResponse = new Promise((resolve) => { releaseFirst = resolve; });
        const h = harness({ post: (url, data) => (data.scratchpadTheme === 'mist' ? firstResponse : {}) });
        try {
            const first = h.themes.selectScratchpadTheme('mist');
            await Promise.resolve();
            const second = h.themes.selectScratchpadTheme('sand');
            const third = h.themes.selectScratchpadTheme('ocean');
            assert.equal(h.themes.currentScratchpadTheme().id, 'ocean');
            assert.equal(h.requests.length, 1);
            releaseFirst({});
            await Promise.all([first, second, third]);
            assert.deepEqual(h.requests.map(([, data]) => data.scratchpadTheme), ['mist', 'ocean']);
            assert.equal(h.user.scratchpadTheme, 'ocean');
            assert.equal(h.errors.length, 0);
        } finally { h.dom.window.close(); }
    });

    it('reports a failed account save and retries when selecting the same theme again', async () => {
        let fail = true;
        const h = harness({ post: () => {
            if (fail) throw new Error('offline');
            return {};
        } });
        try {
            assert.equal(await h.themes.selectScratchpadTheme('ocean'), false);
            assert.equal(h.themes.currentScratchpadTheme().id, 'ocean');
            assert.equal(h.user.scratchpadTheme, 'cloud');
            assert.equal(h.errors.length, 1);
            assert.match(h.errors[0][0], /未能保存到账号.*重试/);
            fail = false;
            assert.equal(await h.themes.selectScratchpadTheme('ocean'), true);
            assert.equal(h.user.scratchpadTheme, 'ocean');
            assert.equal(h.requests.length, 2);
        } finally { h.dom.window.close(); }
    });

    it('changes only the Monaco theme, follows storage changes, and restores the outside editor on exit', () => {
        const { themes, dom } = harness();
        try {
            const calls = [];
            const monaco = { editor: {
                defineTheme: (id) => calls.push(['define', id]),
                setTheme: (id) => calls.push(['apply', id]),
            } };
            let savedEditorTheme = 'github-light';
            const release = themes.attachScratchpadMonacoTheme(monaco, () => savedEditorTheme);
            themes.selectScratchpadTheme('mist');
            assert.equal(calls.at(-1)[1], 'hydro-scratchpad-mist');
            const key = themes.scratchpadThemeStorageKey(11);
            dom.window.localStorage.setItem(key, 'ocean');
            dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key, newValue: 'ocean' }));
            assert.equal(calls.at(-1)[1], 'hydro-scratchpad-ocean');
            savedEditorTheme = 'github-dark';
            release();
            assert.equal(calls.at(-1)[1], 'github-dark');
            const count = calls.length;
            themes.selectScratchpadTheme('sand');
            assert.equal(calls.length, count);
        } finally { dom.window.close(); }
    });

    it('still changes colors when browser storage is unavailable', () => {
        const { themes, dom } = harness();
        try {
            Object.defineProperty(dom.window, 'localStorage', { get() { throw new Error('blocked'); } });
            assert.equal(themes.currentScratchpadTheme().id, 'cloud');
            themes.selectScratchpadTheme('ocean');
            assert.equal(themes.currentScratchpadTheme().id, 'ocean');
        } finally { dom.window.close(); }
    });

    it('wins over the saved Monaco theme after async action initialization without changing code', async () => {
        const { themes, dom, user } = harness();
        try {
            themes.selectScratchpadTheme('sand');
            let currentTheme;
            let disposed = false;
            const draft = 'print("keep my draft")';
            const model = { dispose() {}, getValue: () => draft };
            const editor = {
                onDidChangeModelContent: () => ({ dispose() {} }),
                updateOptions: ({ theme }) => { currentTheme = theme; },
                dispose: () => { disposed = true; },
            };
            const monaco = {
                Uri: { parse: (value) => value },
                editor: {
                    defineTheme() {}, setTheme: (value) => { currentTheme = value; },
                    getModel: () => model, create: (element, config) => { currentTheme = config.theme; return editor; },
                    ShowLightbulbIconMode: { On: 'on' },
                },
            };
            const mod = { exports: {} };
            vm.runInNewContext(editorSource, {
                module: mod, exports: mod.exports, window: dom.window, UserContext: user,
                UiContext: { pdoc: { pid: 'P1000' } },
                require(id) {
                    if (id === 'react-redux') return { connect: () => (component) => component };
                    if (id === './themes') return themes;
                    if (id === 'vj/context') return { ctx: { scratchpad: { init() {} } } };
                    if (id === 'vj/components/monaco/loader') {
                        return { load: async () => ({
                            monaco, customOptions: { theme: 'github-dark' },
                            registerAction: () => Promise.resolve().then(() => editor.updateOptions({ theme: 'github-dark' })),
                        }) };
                    }
                    return require(id);
                },
            });
            const Editor = mod.exports.default;
            const component = new Editor({ value: draft, language: 'python' });
            component.containerElement = dom.window.document.createElement('div');
            assert.equal(component.containerElement.hasAttribute('data-editor-ready'), false);
            await component.componentDidMount();
            assert.equal(component.containerElement.getAttribute('data-editor-ready'), 'true');
            assert.equal(currentTheme, 'hydro-scratchpad-sand');
            assert.equal(component.model.getValue(), draft);
            themes.selectScratchpadTheme('ocean');
            assert.equal(currentTheme, 'hydro-scratchpad-ocean');
            assert.equal(component.model.getValue(), draft);
            component.componentWillUnmount();
            assert.equal(disposed, true);
            assert.equal(currentTheme, 'github-dark');
        } finally { dom.window.close(); }
    });

    it('requires a fresh server catalog before restoring any saved badge artwork', async () => {
        let verify;
        const h = harness({ workspace: true, get: () => new Promise((resolve) => { verify = resolve; }) });
        try {
            const key = h.themes.scratchpadThemeStorageKey(11, h.ui.codeEditorThemesUrl);
            h.dom.window.localStorage.setItem(key, 'badge:7');
            assert.equal(h.themes.currentScratchpadTheme().id, 'cloud');
            assert.equal(await h.themes.selectScratchpadTheme('badge:7'), false);
            assert.equal(h.requests.length, 0);
            const loading = h.themes.refreshScratchpadThemes();
            await Promise.resolve();
            assert.equal(h.themes.currentScratchpadTheme().id, 'cloud');
            verify(catalog());
            assert.equal(await loading, true);
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            assert.equal(h.themes.availableScratchpadThemes().length, 5);
            assert.equal(h.gets[0][0], '/d/class-a/code-editor/themes');
        } finally { h.dom.window.close(); }
    });

    it('maps uploaded artwork and fit modes while protecting code from low scrims and rejecting unsafe assets', async () => {
        const h = harness({ workspace: true, get: () => catalog({ themes: [badgeSkin({
            overlay: 0.35, thumbnailUrl: 'javascript:alert(1)',
            assets: [
                ...badgeSkin().assets,
                { id: 'script', type: 'image/png', url: 'javascript:alert(1)' },
                { id: 'svg', type: 'image/svg+xml', url: '/x.svg' },
            ],
        })] }) });
        try {
            await h.themes.refreshScratchpadThemes();
            const theme = h.themes.currentScratchpadTheme();
            const variables = h.themes.scratchpadThemeVariables(theme);
            assert.equal(theme.assets.length, 3);
            assert.equal(theme.thumbnailUrl, undefined);
            assert.equal(variables['--scratchpad-skin-veil'], 'rgba(24,35,50,0.92)');
            assert.equal(variables['--scratchpad-skin-editor-repeat'], 'repeat');
            assert.equal(variables['--scratchpad-skin-submitButton-size'], '100% 100%');
            assert.match(variables['--scratchpad-skin-editor-image'], /panel\.png/);
            assert.equal(h.themes.scratchpadMonacoTheme(theme).colors['editor.background'], '#00000000');
            assert.equal(h.themes.scratchpadMonacoThemeName(theme), 'hydro-scratchpad-badge-7-revision-1');
            assert.match(h.themes.scratchpadMonacoThemeName(theme), /^[a-z0-9-]+$/i);
        } finally { h.dom.window.close(); }
    });

    it('protects every syntax color against the brightest and darkest artwork and restrained current-line/selection fills', () => {
        const h = harness();
        try {
            const samples = [
                { ...h.themes.SCRATCHPAD_THEMES[0], badgeId: 7, overlay: 0.35, palette: {
                    ...h.themes.SCRATCHPAD_THEMES[0].palette, surface: '#f4f8fc', muted: '#e6eef6', text: '#142c42', textMuted: '#50677b',
                    comment: '#50677b', keyword: '#593981', string: '#14624e', number: '#923c1e', accent: '#23679e',
                } },
                { ...h.themes.SCRATCHPAD_THEMES[3], badgeId: 7, overlay: 0.35 },
                { ...h.themes.SCRATCHPAD_THEMES[0], badgeId: 7, overlay: 0.4, palette: {
                    ...h.themes.SCRATCHPAD_THEMES[0].palette, text: '#e9eff6', textMuted: '#d1dce9', comment: '#e6eff5', keyword: '#b8a4f2',
                    string: '#a4d7bd', number: '#edbd8b', accent: '#b9d8ec', muted: '#000000', selection: '#ff0099',
                } },
                { ...h.themes.SCRATCHPAD_THEMES[3], badgeId: 7, overlay: 0.35, palette: {
                    ...h.themes.SCRATCHPAD_THEMES[3].palette, surface: '#777777', text: '#777777', comment: '#777777', accent: '#777777',
                } },
            ];
            for (const theme of samples) {
                const reading = h.themes.scratchpadReadingStyle(theme);
                assert.ok(reading.overlay >= 0.92);
                const composite = (underlay) => `#${[1, 3, 5].map((offset) => Math.round(
                    parseInt(theme.palette.surface.slice(offset, offset + 2), 16) * reading.overlay
                    + underlay * (1 - reading.overlay),
                ).toString(16).padStart(2, '0')).join('')}`;
                const backgrounds = [composite(0), composite(255), reading.lineHighlight, reading.selection, theme.palette.surface];
                for (const key of ['text', 'textMuted', 'comment', 'keyword', 'string', 'number', 'accent']) {
                    for (const background of backgrounds) {
                        assert.ok(contrast(reading.palette[key], background) >= 4.5, `${theme.palette.surface} ${key}: ${reading.palette[key]} on ${background}`);
                    }
                }
                const monaco = h.themes.scratchpadMonacoTheme(theme);
                assert.equal(monaco.inherit, false, 'specific inherited tokens cannot bypass contrast protection');
                assert.equal(monaco.colors['editor.background'], '#00000000');
                assert.equal(monaco.colors['editorGutter.background'], '#00000000');
                assert.equal(monaco.colors['editor.lineHighlightBackground'], reading.lineHighlight);
                assert.equal(monaco.colors['editor.selectionBackground'], reading.selection);
                assert.equal(monaco.colors['editorLineNumber.foreground'], reading.palette.comment);
                for (const token of ['identifier', 'delimiter', 'operator', 'variable', 'comment', 'keyword', 'string', 'number', 'type']) {
                    const rule = monaco.rules.find((item) => item.token === token);
                    assert.ok(rule, `explicit ${token} token avoids inherited low contrast colors`);
                    for (const background of backgrounds) assert.ok(contrast(`#${rule.foreground}`, background) >= 4.5);
                }
                for (let i = 1; i <= 6; i++) {
                    for (const background of backgrounds) assert.ok(contrast(monaco.colors[`editorBracketHighlight.foreground${i}`], background) >= 4.5);
                }
                const vars = h.themes.scratchpadThemeVariables(theme);
                assert.equal(vars['--scratchpad-reading-surface'], theme.palette.surface);
                assert.equal(vars['--scratchpad-reading-text'], reading.palette.text);
                assert.equal(vars['--scratchpad-reading-muted'], reading.palette.textMuted);
            }
            const high = h.themes.scratchpadReadingStyle({ ...samples[0], overlay: 0.98 });
            assert.equal(high.overlay, 0.98);
            for (const builtin of h.themes.SCRATCHPAD_THEMES) {
                const reading = h.themes.scratchpadReadingStyle(builtin);
                assert.deepEqual(JSON.parse(JSON.stringify(reading.palette)), JSON.parse(JSON.stringify(builtin.palette)));
                assert.equal(reading.lineHighlight, builtin.palette.muted);
                assert.equal(reading.selection, builtin.palette.selection);
                assert.equal(h.themes.scratchpadMonacoTheme(builtin).inherit, true);
                assert.equal(h.themes.scratchpadThemeVariables(builtin)['--scratchpad-reading-surface'], undefined);
            }
        } finally { h.dom.window.close(); }
    });

    it('keeps the minimap and overview-ruler canvas transparent for badge backgrounds', async () => {
        const h = harness({ workspace: true, get: () => catalog() });
        try {
            await h.themes.refreshScratchpadThemes();
            const colors = h.themes.scratchpadMonacoTheme(h.themes.currentScratchpadTheme()).colors;
            assert.equal(colors['minimap.background'], '#00000000');
            assert.equal(colors['editorOverviewRuler.background'], '#00000000');
            assert.ok(colors['scrollbarSlider.background']);
        } finally { h.dom.window.close(); }
    });

    it('keeps pinned scope lines opaque and readable above scrolling code in default and image themes', () => {
        const h = harness();
        try {
            for (const builtin of h.themes.SCRATCHPAD_THEMES) {
                for (const theme of [builtin, { ...builtin, badgeId: 7, overlay: 0.35 }]) {
                    const monaco = h.themes.scratchpadMonacoTheme(theme);
                    const reading = h.themes.scratchpadReadingStyle(theme);
                    const background = monaco.colors['editorStickyScroll.background'];
                    const hovered = monaco.colors['editorStickyScrollHover.background'];
                    assert.match(background, /^#[a-f\d]{6}$/i, `${theme.id} pinned rows must fully hide the code beneath`);
                    assert.match(hovered, /^#[a-f\d]{6}$/i, `${theme.id} hover cannot make pinned rows translucent`);
                    assert.equal(background, theme.palette.surface);
                    assert.equal(monaco.colors['peekViewEditorStickyScroll.background'], background);
                    assert.equal(monaco.colors['editorStickyScroll.border'], theme.palette.border);
                    assert.equal(monaco.colors['editorStickyScroll.shadow'], '#00000000', 'avoid the bright doubled seam around pinned code');
                    for (const key of ['text', 'keyword', 'string', 'number']) {
                        assert.ok(contrast(reading.palette[key], background) >= 4.5, `${theme.id} ${key} pinned text`);
                        assert.ok(contrast(reading.palette[key], hovered) >= 4.5, `${theme.id} ${key} pinned hover`);
                    }
                    if (theme.badgeId) {
                        assert.equal(monaco.colors['editor.background'], '#00000000', 'the image canvas itself remains transparent');
                        assert.notEqual(background, monaco.colors['editor.background']);
                    }
                }
            }
        } finally { h.dom.window.close(); }
    });

    it('accepts only bounded raster control artwork from the verified theme catalog', async () => {
        const controls = {
            run: { assetId: 'button', width: 999, height: 2, hoverAssetId: 'panel', activeAssetId: 'movie' },
            submit: { assetId: 'movie', width: 120, height: 40 },
            emptyOutput: { assetId: 'panel' },
            settingsTab: { assetId: 'button', width: 40, height: 40, hoverAssetId: 'panel' },
            unknownControl: { assetId: 'button' },
        };
        const skin = badgeSkin({ controls });
        skin.assets.push({ id: 'movie', type: 'video/mp4', url: '/video.mp4' });
        const h = harness({ workspace: true, get: () => catalog({ themes: [skin] }) });
        try {
            await h.themes.refreshScratchpadThemes();
            const result = h.themes.currentScratchpadTheme().controls;
            assert.equal(result.run.width, 320);
            assert.equal(result.run.height, 16);
            assert.equal(result.run.hoverAssetId, 'panel');
            assert.equal(result.run.activeAssetId, undefined);
            assert.equal(result.submit, undefined);
            assert.equal(result.unknownControl, undefined);
            assert.equal(result.emptyOutput.width, 120);
            assert.equal(result.emptyOutput.height, 40);
            assert.equal(result.settingsTab.assetId, 'button');
            assert.equal(result.settingsTab.width, 40);
            assert.equal(result.settingsTab.hoverAssetId, 'panel');
        } finally { h.dom.window.close(); }
    });

    it('uses a verified administrator catalog and drops its theme when administrator access is revoked', async () => {
        let response = catalog({ administratorAccess: true, themes: [badgeSkin({ administratorAccess: true })] });
        const h = harness({ workspace: true, get: () => response });
        try {
            await h.themes.refreshScratchpadThemes();
            assert.equal(h.themes.currentScratchpadTheme().administratorAccess, true);
            assert.equal(h.themes.hasScratchpadAdministratorThemeAccess(), true);
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            response = catalog({ themes: [], selectedId: 'ocean' });
            await h.themes.refreshScratchpadThemes();
            assert.equal(h.themes.currentScratchpadTheme().id, 'ocean');
            assert.equal(h.themes.hasScratchpadAdministratorThemeAccess(), false);
            assert.equal(await h.themes.selectScratchpadTheme('badge:7'), false);
            response = catalog({ administratorAccess: true, themes: [], selectedId: 'ocean' });
            await h.themes.refreshScratchpadThemes();
            assert.equal(h.themes.hasScratchpadAdministratorThemeAccess(), true, 'An empty admin catalog keeps its accurate empty state');
        } finally { h.dom.window.close(); }
    });

    it('falls back when ownership is revoked without recreating or editing the Monaco model', async () => {
        let response = catalog();
        const h = harness({ workspace: true, get: () => response });
        let release;
        try {
            const calls = [];
            const monaco = { editor: {
                defineTheme: (id) => calls.push(['define', id]),
                setTheme: (id) => calls.push(['apply', id]),
            } };
            release = h.themes.attachScratchpadMonacoTheme(monaco, () => 'github-light');
            await h.themes.refreshScratchpadThemes();
            assert.equal(calls.at(-1)[1], 'hydro-scratchpad-badge-7-revision-1');
            response = catalog({ themes: [], selectedId: 'ocean' });
            await h.themes.refreshScratchpadThemes();
            assert.equal(h.themes.currentScratchpadTheme().id, 'ocean');
            assert.equal(calls.at(-1)[1], 'hydro-scratchpad-ocean');
            assert.equal(h.themes.availableScratchpadThemes().length, 4);
            assert.ok(calls.every(([operation]) => ['define', 'apply'].includes(operation)));
        } finally { release?.(); h.dom.window.close(); }
    });

    it('expires against the server clock even when the device clock is an hour behind', async () => {
        let deviceClock = Date.now();
        const serverClock = deviceClock + 3600000;
        class DeviceDate extends Date {
            static now() { return deviceClock; }
        }
        const h = harness({ workspace: true, get: () => catalog({
            serverNow: deviceClock + 3600000,
            themes: [badgeSkin({ expiresAt: new Date(serverClock + 15).toISOString() })],
        }), Date: DeviceDate });
        try {
            await h.themes.refreshScratchpadThemes();
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            deviceClock += 100;
            await new Promise((resolve) => setTimeout(resolve, 50));
            assert.equal(h.themes.currentScratchpadTheme().id, 'ocean');
            assert.equal(h.themes.availableScratchpadThemes().length, 4);
        } finally { h.dom.window.close(); }
    });

    it('does not allow badge selections or artwork to leak across students or domains', async () => {
        const h = harness({ workspace: true, get: () => catalog() });
        try {
            await h.themes.refreshScratchpadThemes();
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            h.ui.codeEditorThemesUrl = '/d/class-b/code-editor/themes';
            assert.equal(h.themes.currentScratchpadTheme().id, 'cloud');
            assert.equal(h.themes.availableScratchpadThemes().length, 4);
            assert.equal(await h.themes.selectScratchpadTheme('badge:7'), false);
            h.ui.codeEditorThemesUrl = '/d/class-a/code-editor/themes';
            h.user._id = 22;
            assert.equal(h.themes.currentScratchpadTheme().id, 'cloud');
            assert.equal(h.themes.availableScratchpadThemes().length, 4);
        } finally { h.dom.window.close(); }
    });

    it('ignores an old catalog response after a newer verified selection', async () => {
        let oldResponse;
        let loads = 0;
        const h = harness({
            workspace: true,
            get: () => (++loads === 1 ? catalog({ selectedId: 'cloud' }) : new Promise((resolve) => { oldResponse = resolve; })),
            post: () => catalog({ selectedId: 'badge:7', themes: [badgeSkin({ version: 'revision-2' })] }),
        });
        try {
            await h.themes.refreshScratchpadThemes();
            const old = h.themes.refreshScratchpadThemes();
            await Promise.resolve();
            assert.equal(await h.themes.selectScratchpadTheme('badge:7'), true);
            oldResponse(catalog({ selectedId: 'cloud', themes: [badgeSkin({ version: 'revision-1' })] }));
            assert.equal(await old, false);
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            assert.equal(h.themes.currentScratchpadTheme().version, 'revision-2');
            assert.equal(h.requests[0][1].operation, 'select');
        } finally { h.dom.window.close(); }
    });

    it('waits for badge selection verification and lets a later builtin choice win', async () => {
        let accept;
        const h = harness({
            workspace: true, get: () => catalog({ selectedId: 'cloud' }),
            post: (url, data) => (data.id === 'badge:7' ? new Promise((resolve) => { accept = resolve; })
                : catalog({ selectedId: data.id, fallback: data.id })),
        });
        try {
            await h.themes.refreshScratchpadThemes();
            const badge = h.themes.selectScratchpadTheme('badge:7');
            await Promise.resolve();
            assert.equal(h.themes.currentScratchpadTheme().id, 'cloud');
            const builtin = h.themes.selectScratchpadTheme('mist');
            assert.equal(h.themes.currentScratchpadTheme().id, 'mist');
            accept(catalog());
            await Promise.all([badge, builtin]);
            assert.equal(h.themes.currentScratchpadTheme().id, 'mist');
            assert.deepEqual(h.requests.map(([, data]) => data.id), ['badge:7', 'mist']);
        } finally { h.dom.window.close(); }
    });

    it('keeps the displayed palette, artwork and Monaco together until every prepared asset is ready', async () => {
        const lastAsset = deferred();
        const started = deferred();
        const h = harness({
            workspace: true, get: () => catalog({ selectedId: 'cloud' }),
            post: () => catalog(),
            prepare: () => { started.resolve(); return lastAsset.promise; },
        });
        let release;
        try {
            await h.themes.refreshScratchpadThemes();
            const displayed = h.themes.currentScratchpadTheme();
            const variables = JSON.parse(JSON.stringify(h.themes.scratchpadThemeVariables(displayed)));
            const applied = [];
            release = h.themes.attachScratchpadMonacoTheme({ editor: {
                defineTheme() {}, setTheme: (name) => applied.push(name),
            } }, () => 'outside-theme');
            const selecting = h.themes.selectScratchpadTheme('badge:7');
            await started.promise;
            assert.strictEqual(h.themes.currentScratchpadTheme(), displayed);
            assert.deepEqual(JSON.parse(JSON.stringify(h.themes.scratchpadThemeVariables(h.themes.currentScratchpadTheme()))), variables);
            assert.equal(applied.at(-1), 'hydro-scratchpad-cloud');
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 0);
            lastAsset.resolve(true);
            assert.equal(await selecting, true);
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            assert.match(h.themes.scratchpadThemeVariables(h.themes.currentScratchpadTheme())['--scratchpad-skin-editor-image'], /panel\.png/);
            assert.equal(applied.at(-1), 'hydro-scratchpad-badge-7-revision-1');
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 1);
        } finally { lastAsset.resolve(false); release?.(); h.dom.window.close(); }
    });

    it('retains the old complete theme after a media failure and permits the same choice to retry', async () => {
        let available = false;
        const h = harness({
            workspace: true, get: () => catalog({ selectedId: 'cloud' }), post: () => catalog(),
            prepare: () => Promise.resolve(available),
        });
        try {
            await h.themes.refreshScratchpadThemes();
            const displayed = h.themes.currentScratchpadTheme();
            assert.equal(await h.themes.selectScratchpadTheme('badge:7'), false);
            assert.strictEqual(h.themes.currentScratchpadTheme(), displayed);
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 0);
            assert.ok(h.errors.some(([message]) => /素材.*保留原主题/.test(message)));
            available = true;
            assert.equal(await h.themes.selectScratchpadTheme('badge:7'), true);
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            assert.equal(h.preparations.length, 2, 'a failed preparation must not poison the next attempt');
        } finally { h.dom.window.close(); }
    });

    it('lets a newer prepared badge win while an older selection is still downloading', async () => {
        const firstAssets = deferred();
        const firstStarted = deferred();
        const second = badgeSkin({ id: 'badge:8', badgeId: 8, name: '新徽章主题' });
        const both = [badgeSkin(), second];
        const h = harness({
            workspace: true, get: () => catalog({ themes: both, selectedId: 'cloud' }),
            post: (url, data) => catalog({ themes: both, selectedId: data.id }),
            prepare: (theme) => {
                if (theme.id === 'badge:7') { firstStarted.resolve(); return firstAssets.promise; }
                return Promise.resolve(true);
            },
        });
        try {
            await h.themes.refreshScratchpadThemes();
            const first = h.themes.selectScratchpadTheme('badge:7');
            await firstStarted.promise;
            assert.equal(h.themes.currentScratchpadTheme().id, 'cloud');
            assert.equal(await h.themes.selectScratchpadTheme('badge:8'), true);
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:8');
            firstAssets.resolve(true);
            assert.equal(await first, false);
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:8');
            assert.deepEqual(h.requests.map(([, data]) => data.id), ['badge:7', 'badge:8']);
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 1);
        } finally { firstAssets.resolve(false); h.dom.window.close(); }
    });

    it('cannot apply a downloaded theme after the active student account changes', async () => {
        const assets = deferred();
        const started = deferred();
        const h = harness({
            workspace: true, get: () => catalog({ selectedId: 'cloud' }), post: () => catalog(),
            prepare: () => { started.resolve(); return assets.promise; },
        });
        try {
            await h.themes.refreshScratchpadThemes();
            const selecting = h.themes.selectScratchpadTheme('badge:7');
            await started.promise;
            h.user._id = 22;
            assert.equal(h.themes.currentScratchpadTheme().id, 'cloud');
            assets.resolve(true);
            assert.equal(await selecting, false);
            assert.equal(h.themes.currentScratchpadTheme().id, 'cloud');
            assert.equal(h.themes.availableScratchpadThemes().length, 4);
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 0);
        } finally { assets.resolve(false); h.dom.window.close(); }
    });

    it('rechecks expiry when the last artwork finishes rather than revealing an expired badge', async () => {
        const assets = deferred();
        const started = deferred();
        let deviceClock = Date.now();
        class DeviceDate extends Date { static now() { return deviceClock; } }
        const skin = badgeSkin({ expiresAt: new Date(deviceClock + 600000).toISOString() });
        const response = (selectedId) => catalog({ selectedId, themes: [skin], serverNow: deviceClock });
        const h = harness({
            workspace: true, Date: DeviceDate, get: () => response('cloud'), post: () => response('badge:7'),
            prepare: () => { started.resolve(); return assets.promise; },
        });
        try {
            await h.themes.refreshScratchpadThemes();
            const selecting = h.themes.selectScratchpadTheme('badge:7');
            await started.promise;
            deviceClock += 600001;
            assets.resolve(true);
            assert.equal(await selecting, false);
            assert.notEqual(h.themes.currentScratchpadTheme().id, 'badge:7');
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 0);
        } finally { assets.resolve(false); h.dom.window.close(); }
    });

    it('rejects a pending theme when a fresh catalog revokes ownership during its download', async () => {
        const assets = deferred();
        const started = deferred();
        let response = catalog({ selectedId: 'cloud' });
        const h = harness({
            workspace: true, get: () => response, post: () => catalog(),
            prepare: () => { started.resolve(); return assets.promise; },
        });
        try {
            await h.themes.refreshScratchpadThemes();
            const selecting = h.themes.selectScratchpadTheme('badge:7');
            await started.promise;
            response = catalog({ themes: [], selectedId: 'ocean' });
            assert.equal(await h.themes.refreshScratchpadThemes(), true);
            assert.equal(h.themes.currentScratchpadTheme().id, 'ocean');
            assets.resolve(true);
            assert.equal(await selecting, false);
            assert.equal(h.themes.currentScratchpadTheme().id, 'ocean');
            assert.equal(h.themes.availableScratchpadThemes().length, 4);
        } finally { assets.resolve(false); h.dom.window.close(); }
    });

    it('refreshes matching permission metadata without reloading or animating unchanged artwork', async () => {
        let response = catalog();
        const h = harness({ workspace: true, get: () => response });
        try {
            await h.themes.refreshScratchpadThemes();
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            const preparations = h.preparations.length;
            const animated = h.transitions.filter((settings) => !settings.immediate).length;
            const expiresAt = new Date(Date.now() + 600000).toISOString();
            response = catalog({ administratorAccess: true, themes: [badgeSkin({ expiresAt, administratorAccess: true })] });
            await h.themes.refreshScratchpadThemes();
            await h.themes.refreshScratchpadThemes();
            assert.equal(h.preparations.length, preparations);
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, animated);
            assert.equal(h.themes.currentScratchpadTheme().expiresAt, expiresAt);
            assert.equal(h.themes.currentScratchpadTheme().administratorAccess, true);
        } finally { h.dom.window.close(); }
    });

    it('prepares server-restored artwork before the first visual application', async () => {
        const assets = deferred();
        const started = deferred();
        const h = harness({
            workspace: true, get: () => catalog(),
            prepare: () => { started.resolve(); return assets.promise; },
        });
        try {
            assert.equal(h.themes.currentScratchpadTheme().id, 'cloud');
            const restoring = h.themes.refreshScratchpadThemes();
            await started.promise;
            assert.equal(h.themes.currentScratchpadTheme().id, 'cloud');
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 0);
            assets.resolve(true);
            assert.equal(await restoring, true);
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            assert.equal(h.preparations.length, 1);
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 0,
                'restoring a saved theme must not replay a manual theme-switch animation');
        } finally { assets.resolve(false); h.dom.window.close(); }
    });


    it('applies automatic catalog version updates atomically without replaying the user switch animation', async () => {
        let response = catalog();
        const nextAssets = deferred();
        const started = deferred();
        const h = harness({
            workspace: true, get: () => response,
            prepare: (theme) => {
                if (theme.version === 'revision-2') { started.resolve(); return nextAssets.promise; }
                return Promise.resolve(true);
            },
        });
        try {
            await h.themes.refreshScratchpadThemes();
            const displayed = h.themes.currentScratchpadTheme();
            response = catalog({ themes: [badgeSkin({ version: 'revision-2' })] });
            const refreshing = h.themes.refreshScratchpadThemes();
            await started.promise;
            assert.strictEqual(h.themes.currentScratchpadTheme(), displayed);
            nextAssets.resolve(true);
            assert.equal(await refreshing, true);
            assert.equal(h.themes.currentScratchpadTheme().version, 'revision-2');
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 0);
        } finally { nextAssets.resolve(false); h.dom.window.close(); }
    });

    it('keeps a deliberate theme switch animated when a passive refresh arrives while its assets load', async () => {
        const assets = deferred();
        const started = deferred();
        let response = catalog({ selectedId: 'cloud' });
        let refreshRequested;
        const h = harness({
            workspace: true, get: () => { refreshRequested?.resolve(); return response; }, post: () => catalog(),
            prepare: () => { started.resolve(); return assets.promise; },
        });
        try {
            await h.themes.refreshScratchpadThemes();
            const selecting = h.themes.selectScratchpadTheme('badge:7');
            await started.promise;
            response = catalog();
            refreshRequested = deferred();
            const refreshing = h.themes.refreshScratchpadThemes();
            await refreshRequested.promise;
            await Promise.resolve();
            assert.equal(h.themes.currentScratchpadTheme().id, 'cloud');
            assets.resolve(true);
            assert.equal(await selecting, true);
            assert.equal(await refreshing, true);
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 1);
        } finally { assets.resolve(false); h.dom.window.close(); }
    });

    it("restores another tab's builtin choice directly without replaying a theme-switch fade", async () => {
        const h = harness({ workspace: true, get: () => catalog({ selectedId: 'cloud' }) });
        let release;
        try {
            await h.themes.refreshScratchpadThemes();
            release = h.themes.subscribeScratchpadTheme(() => {});
            const key = h.themes.scratchpadThemeStorageKey(11, h.ui.codeEditorThemesUrl);
            h.dom.window.dispatchEvent(new h.dom.window.StorageEvent('storage', { key, newValue: 'mist' }));
            assert.equal(h.themes.currentScratchpadTheme().id, 'mist');
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 0);
        } finally { release?.(); h.dom.window.close(); }
    });


    it('mounts with the complete page-verified theme after bootstrap preparation, without a fallback frame or duplicate initial GET', async () => {
        const assets = deferred();
        const started = deferred();
        const h = harness({
            workspace: true,
            ui: { codeEditorThemeCatalog: { ...catalog(), accountId: 11, scope: '/d/class-a/code-editor/themes' } },
            get: () => catalog(),
            prepare: () => { started.resolve(); return assets.promise; },
        });
        let release;
        try {
            const first = h.themes.initializeScratchpadTheme();
            const second = h.themes.initializeScratchpadTheme();
            assert.strictEqual(first, second, 'module preloading and opening the editor share one initialization');
            await started.promise;
            assert.equal(h.gets.length, 0, 'the current page already contains a server-verified catalog');
            assets.resolve(true);
            assert.equal(await first, true);
            // No theme consumer has rendered yet: its first snapshot is the
            // prepared badge, not the temporary builtin used during fetching.
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            assert.equal(h.preparations.length, 1);
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 0);
            release = h.themes.subscribeScratchpadTheme(() => {});
            await Promise.resolve();
            assert.equal(h.gets.length, 0, 'mounting consumers must not repeat the initial verification');
            assert.equal(await h.themes.initializeScratchpadTheme(), true);
            assert.equal(h.preparations.length, 1);
        } finally { assets.resolve(false); release?.(); h.dom.window.close(); }
    });

    it('rejects page bootstrap catalogs belonging to another account or domain and verifies the active context instead', async () => {
        for (const mismatch of [
            { accountId: 22, scope: '/d/class-a/code-editor/themes' },
            { accountId: 11, scope: '/d/class-b/code-editor/themes' },
            { accountId: '11', scope: '/d/class-a/code-editor/themes' },
            { accountId: 11 },
        ]) {
            const h = harness({
                workspace: true,
                ui: { codeEditorThemeCatalog: { ...catalog(), ...mismatch } },
                get: () => catalog({ themes: [], selectedId: 'ocean' }),
            });
            try {
                assert.equal(await h.themes.initializeScratchpadTheme(), true);
                assert.equal(h.gets.length, 1);
                assert.equal(h.themes.currentScratchpadTheme().id, 'ocean');
                assert.equal(h.themes.availableScratchpadThemes().length, 4);
                assert.equal(h.preparations.length, 0);
            } finally { h.dom.window.close(); }
        }
    });

    it('does not restore expired badge ownership from a page bootstrap, even when its selected ID and artwork are cached', async () => {
        const now = Date.now();
        const h = harness({
            workspace: true,
            ui: { codeEditorThemeCatalog: {
                ...catalog({ serverNow: now, themes: [badgeSkin({ expiresAt: new Date(now - 1000).toISOString() })] }),
                accountId: 11, scope: '/d/class-a/code-editor/themes',
            } },
        });
        try {
            const key = h.themes.scratchpadThemeStorageKey(11, h.ui.codeEditorThemesUrl);
            h.dom.window.localStorage.setItem(key, 'badge:7');
            assert.equal(await h.themes.initializeScratchpadTheme(), true);
            assert.equal(h.themes.currentScratchpadTheme().id, 'ocean');
            assert.equal(h.themes.availableScratchpadThemes().length, 4);
            assert.equal(h.preparations.length, 0);
            assert.equal(h.gets.length, 0);
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 0);
        } finally { h.dom.window.close(); }
    });

    it('retries initialization after a failed preload and keeps focus-triggered permission checks active after successful bootstrap', async () => {
        let available = false;
        let focusRequested;
        const h = harness({
            workspace: true,
            ui: { codeEditorThemeCatalog: { ...catalog(), accountId: 11, scope: '/d/class-a/code-editor/themes' } },
            get: () => { focusRequested?.resolve(); return catalog(); },
            prepare: () => Promise.resolve(available),
        });
        let release;
        try {
            assert.equal(await h.themes.initializeScratchpadTheme(), false);
            assert.notEqual(h.themes.currentScratchpadTheme().id, 'badge:7');
            available = true;
            assert.equal(await h.themes.initializeScratchpadTheme(), true);
            assert.equal(h.gets.length, 1, 'retry obtains current permissions instead of replaying stale page payload');
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            release = h.themes.subscribeScratchpadTheme(() => {});
            const count = h.gets.length;
            focusRequested = deferred();
            h.dom.window.dispatchEvent(new h.dom.window.Event('focus'));
            await focusRequested.promise;
            assert.equal(h.gets.length, count + 1);
        } finally { release?.(); h.dom.window.close(); }
    });

    it('verifies a normal catalog before first mount when the page has no bootstrap', async () => {
        const h = harness({ workspace: true, get: () => catalog() });
        let release;
        try {
            assert.equal(await h.themes.initializeScratchpadTheme(), true);
            assert.equal(h.gets.length, 1);
            assert.equal(h.themes.currentScratchpadTheme().id, 'badge:7');
            assert.equal(h.transitions.filter((settings) => !settings.immediate).length, 0);
            release = h.themes.subscribeScratchpadTheme(() => {});
            await Promise.resolve();
            assert.equal(h.gets.length, 1);
        } finally { release?.(); h.dom.window.close(); }
    });

});
