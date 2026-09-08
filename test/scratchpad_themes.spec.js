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
    const errors = [];
    const endpoint = '/d/class-a/home/settings/preference';
    const mod = { exports: {} };
    const context = {
        require(id) {
            if (id === 'vj/components/notification') return { error: (...args) => errors.push(args) };
            if (id === 'vj/utils') {
                return { request: { post: async (...args) => {
                    requests.push(args);
                    return options.post ? options.post(...args) : {};
                } } };
            }
            return require(id);
        },
        window: dom.window, Event: dom.window.Event, UserContext: user,
        UiContext: { scratchpadThemePreferenceUrl: endpoint },
        module: mod, exports: mod.exports,
    };
    vm.runInNewContext(themeSource, context);
    return { dom, user, themes: mod.exports, requests, errors, endpoint };
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
            component.containerElement = {};
            await component.componentDidMount();
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
});
