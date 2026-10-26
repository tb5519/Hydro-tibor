const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const root = path.resolve(__dirname, '..');
const source = transformSync(fs.readFileSync(path.join(root, 'packages/ui-default/components/badge_sound_volume.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const template = fs.readFileSync(path.join(root, 'addons/badge-for-hydrooj/templates/badge_edit.html'), 'utf8');
const section = template.slice(template.indexOf('<div class="badge-sound-volume"'), template.indexOf('<div class="badge-ac-preview"'));
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function fixture(badge = { themeSound: '/saved.mp3', themeSoundVolume: 25 }, blocked = false) {
    const html = new nunjucks.Environment().renderString(section, { badge });
    const dom = new JSDOM(`<form><input type="file" name="themeSound"><input type="checkbox" name="removeThemeSound">${html}</form>`);
    const { document } = dom.window;
    const sounds = []; const revoked = [];
    class Audio {
        constructor(url) { this.src = url; sounds.push(this); }
        pause() { this.paused = true; }
        removeAttribute(name) { if (name === 'src') this.src = ''; }
        play() { this.paused = false; return blocked ? Promise.reject(new Error('blocked')) : Promise.resolve(); }
    }
    const module = { exports: {} };
    vm.runInNewContext(source, { module, exports: module.exports, document, Audio,
        URL: { createObjectURL: () => 'blob:chosen-sound', revokeObjectURL: url => revoked.push(url) } });
    const dispose = module.exports.bindBadgeSoundVolume(document);
    const volume = document.querySelector('[name="themeSoundVolume"]');
    const preview = document.querySelector('[data-badge-sound-preview]');
    const output = document.querySelector('output');
    const status = document.querySelector('[data-badge-sound-status]');
    const file = document.querySelector('[name="themeSound"]');
    const remove = document.querySelector('[name="removeThemeSound"]');
    return { dom, document, volume, preview, output, status, file, remove, sounds, revoked,
        bind: module.exports.bindBadgeSoundVolume,
        adjust(value) { volume.value = value; volume.dispatchEvent(new dom.window.Event('input')); },
        choose(value) { Object.defineProperty(file, 'files', { configurable: true, value: value ? [value] : [] }); file.dispatchEvent(new dom.window.Event('change')); },
        close() { dispose(); dom.window.close(); } };
}

it('edits and submits an independent badge volume and auditions at exactly that volume', async () => {
    const f = fixture();
    try {
        assert.equal(f.volume.value, '25');
        assert.equal(f.volume.disabled, false);
        f.adjust('73');
        assert.equal(f.output.value, '73%');
        assert.match(f.status.textContent, /点击下方「更新」保存/);
        assert.equal(new f.dom.window.FormData(f.document.querySelector('form')).get('themeSoundVolume'), '73');
        f.preview.click(); await settle();
        assert.equal(f.sounds[0].src, '/saved.mp3');
        assert.equal(f.sounds[0].volume, 0.73);
        assert.equal(f.preview.textContent, '停止试听');
        f.adjust('40');
        assert.equal(f.sounds[0].volume, 0.4, 'slider applies immediately during audition');
        f.adjust('0');
        assert.equal(f.sounds[0].paused, true);
        assert.equal(f.preview.disabled, true);
        assert.match(f.output.value, /0%.*静音/);
        assert.equal(new f.dom.window.FormData(f.document.querySelector('form')).get('themeSoundVolume'), '0');
    } finally { f.close(); }
});

it('disables missing or removed sound, previews newly chosen files, and cleans their object URLs', async () => {
    const f = fixture({ themeSound: '', themeSoundVolume: 60 });
    try {
        assert.equal(f.volume.disabled, true);
        assert.equal(f.preview.disabled, true);
        assert.equal(new f.dom.window.FormData(f.document.querySelector('form')).get('themeSoundVolume'), null);
        f.choose(new f.dom.window.File(['sound'], 'test.mp3', { type: 'audio/mpeg' }));
        assert.equal(f.volume.disabled, false);
        f.preview.click(); await settle();
        assert.equal(f.sounds[0].src, 'blob:chosen-sound');
        assert.equal(f.sounds[0].volume, 0.6);
        f.choose(null);
        assert.deepEqual(f.revoked, ['blob:chosen-sound']);
        assert.equal(f.preview.disabled, true);
    } finally { f.close(); }
    const saved = fixture();
    try {
        saved.remove.checked = true;
        saved.remove.dispatchEvent(new saved.dom.window.Event('change'));
        assert.equal(saved.volume.disabled, true);
        saved.choose(new saved.dom.window.File(['sound'], 'new.mp3'));
        assert.equal(saved.volume.disabled, false, 'a replacement wins over the remove flag, as on the server');
    } finally { saved.close(); }
});

it('renders saved mute without reverting to the default and reports failed previews without changing the setting', async () => {
    const muted = fixture({ themeSound: '/saved.mp3', themeSoundVolume: 0 });
    try { assert.equal(muted.volume.value, '0'); assert.match(muted.output.value, /静音/); } finally { muted.close(); }
    const f = fixture(undefined, true);
    try {
        f.preview.click(); await settle();
        assert.match(f.status.textContent, /暂时无法播放/);
        assert.equal(f.volume.value, '25');
        assert.equal(f.preview.textContent, '试听音效');
    } finally { f.close(); }
});

it('prebuilt badge editing works without addon code, reuses bindings, and overrides cached legacy preview handlers', async () => {
    const f = fixture();
    const previews = []; let disposed = 0; let legacyPlays = 0;
    const button = f.document.createElement('button');
    button.type = 'button'; button.dataset.badgeAcPreview = ''; button.dataset.themeSound = '/saved.mp3';
    f.document.querySelector('form').appendChild(button);
    button.addEventListener('click', () => { legacyPlays++; }); // Last release's addon may still be cached.
    const globals = { document: f.document, window: f.dom.window, URL: f.dom.window.URL };
    function load(relative, require) {
        const module = { exports: {} };
        const compiled = transformSync(fs.readFileSync(path.join(root, relative), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
        vm.runInNewContext(compiled, { ...globals, module, exports: module.exports, require });
        return module.exports;
    }
    const corePreview = load('packages/ui-default/components/badge_ac_preview.ts', name => {
        if (name === './badge_ac_effect') return { createBadgeAcThemePlayer(theme) {
            previews.push(theme); return { play: async () => {}, dispose() { disposed++; } };
        } };
        assert.equal(name, './notification');
        return { __esModule: true, default: { info: () => assert.fail('sound is present') } };
    });
    const api = { bindBadgeAcPreview: corePreview.bindBadgeAcPreview, bindBadgeSoundVolume: f.bind,
        NamedPage: class { constructor(names, initialize) { this.names = names; this.initialize = initialize; } } };
    const corePage = load('packages/ui-default/pages/badge_edit.page.ts', name => {
        if (name === '../components/badge_ac_preview') return corePreview;
        if (name === '../components/badge_sound_volume') return { bindBadgeSoundVolume: f.bind };
        assert.equal(name, '../misc/Page'); return api;
    }).default;
    try {
        assert.equal(corePage.names, 'badge_edit');
        corePage.initialize(); // No addon bundle needed for volume or full AC simulation.
        f.adjust('62'); button.click(); await settle();
        assert.equal(previews.length, 1);
        assert.equal(previews[0].themeSoundVolume, 62);
        assert.equal(previews[0].themeSound, '/saved.mp3');
        assert.equal(button.disabled, false);
        assert.equal(legacyPlays, 0);
        load('addons/badge-for-hydrooj/frontend/badge.page.ts', name => {
            if (name === './badge_icon_upload') return { bindBadgeIconUpload: () => () => {} };
            assert.equal(name, '@hydrooj/ui-default');
            return { ...api, $: () => ({}), UserSelectAutoComplete: { getOrConstruct() {} }, addPage: page => page.initialize() };
        });
        f.preview.click(); await settle();
        assert.equal(f.sounds.length, 1, 'new addon and prebuilt page must share the sound binding');
        assert.equal(f.sounds[0].paused, false, 'a duplicate handler would immediately stop the same audition');
        f.adjust('0'); button.click(); await settle();
        assert.equal(previews.length, 2, 'new addon must not bind a second AC simulation');
        assert.equal(previews[1].themeSoundVolume, 0, 'unsaved mute also applies to the full effect');
        assert.equal(legacyPlays, 0);
        assert.equal(disposed, 2);
    } finally { f.close(); }
});

it('the production page loader discovers badge editing and the core API exposes the shared binders', () => {
    const loader = fs.readFileSync(path.join(root, 'packages/ui-default/misc/PageLoader.js'), 'utf8');
    const context = loader.match(/require\.context\('\.\.\/pages\/', true, (\/.*?\/[a-z]*)\)/);
    assert.ok(context, 'production page discovery must include this module');
    assert.ok(vm.runInNewContext(context[1]).test('./badge_edit.page.ts'));
    const api = fs.readFileSync(path.join(root, 'packages/ui-default/api.ts'), 'utf8');
    assert.match(api, /export \{ bindBadgeAcPreview \} from '\.\/components\/badge_ac_preview'/);
    assert.match(api, /export \{ bindBadgeSoundVolume \} from '\.\/components\/badge_sound_volume'/);
});
