const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const stylus = require('stylus');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const templates = path.join(root, 'packages/ui-default/templates');
const source = ts.transpileModule(fs.readFileSync(path.join(root, 'packages/ui-default/pages/achievement_manage.page.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const wallSource = ts.transpileModule(fs.readFileSync(path.join(root, 'packages/ui-default/components/achievement_wall.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const catalogueExports = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/achievement_catalog.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(catalogueExports);
class LayoutLoader extends nunjucks.Loader {
    getSource(name) {
        if (name === 'manage_base.html') return { src: '{% block manage_content %}{% endblock %}', path: name };
        if (name === 'domain_base.html') return { src: '{% block domain_content %}{% endblock %}', path: name };
        return null;
    }
}
const env = new nunjucks.Environment([new LayoutLoader(), new nunjucks.FileSystemLoader(templates)], { autoescape: true });
const items = [
    { id: 'difficulty-1', name: '初战告捷', description: '首次AC难度1的题目', category: '初次突破', imageUrl: '', thumbnailUrl: '' },
    { id: 'library-10', name: '十题斩', description: '题库累计AC10道题', category: '题库里程碑', imageUrl: 'https://images.test/full.png', thumbnailUrl: 'https://images.test/thumb.webp' },
    { id: 'library-100', name: '百题斩', description: '题库累计AC100道题', category: '题库里程碑', imageUrl: '', thumbnailUrl: '' },
];
const context = {
    achievements: items, manageRoute: 'achievement_manage', badgeManageRoute: 'badge_manage',
    url: (route) => `/${route}`, maxImageSize: 8388608,
    achievementSound: { soundUrl: '', filename: '', volume: 70, enabled: true }, maxSoundSize: 8388608,
};
function fixture({ wall = false, readyWall = true, overrides = {}, onReload } = {}) {
    const wallItems = items.map((item, index) => ({ ...item, thumbnailUrl: item.thumbnailUrl || `https://images.test/thumb-${index}.webp` }));
    const html = env.render(wall ? 'partials/achievement_wall.html' : 'achievement_manage.html', {
        ...context, achievementWall: { items: wallItems, unlocked: items.length, total: 64 }, ...overrides,
    });
    const dom = new JSDOM(html, { url: 'https://school.test/achievement_manage', runScripts: 'outside-only', pretendToBeVisual: true });
    const requests = [];
    const audio = [];
    let rejectAudio = false;
    dom.window.Audio = class {
        constructor(url) { this.src = url; this.paused = true; audio.push(this); }
        play() { this.paused = false; return rejectAudio ? Promise.reject(new Error('media unavailable')) : Promise.resolve(); }
        pause() { this.paused = true; }
        removeAttribute(name) { if (name === 'src') this.src = ''; }
        load() { this.loaded = true; }
    };
    let respond = async (body) => ({ ok: true, achievement: { ...items.find((item) => item.id === body.get('id')), imageUrl: 'https://images.test/new.png', thumbnailUrl: 'https://images.test/new-thumb.webp' } });
    dom.window.fetch = async (url, options) => {
        requests.push({ url, ...options });
        const result = await respond(options.body);
        return { ok: true, json: async () => result };
    };
    dom.window.confirm = () => true;
    dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
    dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
    if (wall && readyWall) dom.window.document.querySelectorAll('[data-achievement-tile] img').forEach((image) => {
        Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 384 } });
    });
    const wallExports = {};
    new dom.window.Function('exports', wallSource)(wallExports);
    const jquery = require('jquery')(dom.window);
    dom.window.exports = {};
    dom.window.require = (name) => {
        if (name === 'jquery') return { default: jquery };
        if (name === 'vj/components/achievement_wall') return wallExports;
        if (name === 'vj/misc/Page') return { NamedPage: class { constructor(names, callback) { this.names = names; this.callback = callback; } } };
        throw new Error(`Unexpected module: ${name}`);
    };
    dom.window.eval(source);
    if (onReload) dom.window.exports.bindAchievementManage(onReload);
    else dom.window.exports.default.callback();
    return {
        dom, document: dom.window.document, requests, audio, exports: dom.window.exports, jquery,
        rejectAudio: () => { rejectAudio = true; },
        setResponse: (fn) => { respond = fn; },
        flush: () => new Promise((resolve) => setImmediate(resolve)),
        input: (selector, value, type = 'input') => {
            const input = dom.window.document.querySelector(selector); input.value = value;
            input.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
        },
        selectFile: (id, file) => {
            const input = dom.window.document.querySelector(`[data-id="${id}"] [data-achievement-file]`);
            Object.defineProperty(input, 'files', { configurable: true, value: [file] });
            input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        },
        selectSound: (file) => {
            const input = dom.window.document.querySelector('[data-achievement-sound-file]');
            Object.defineProperty(input, 'files', { configurable: true, value: [file] });
            input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        },
        close: () => { dom.window.dispatchEvent(new dom.window.Event('pagehide')); dom.window.close(); },
    };
}

describe('achievement management and profile wall', () => {
    it('renders scoped navigation, complete requirements, and escaped names with thumbnail sources', (t) => {
        const malicious = { ...items[0], name: '<img src=x onerror=alert(1)>' };
        const h = fixture({ overrides: { achievementBaseTemplate: 'domain_base.html', manageRoute: 'domain_achievement_manage', badgeManageRoute: 'domain_badge_manage', achievements: [malicious, items[1]] } });
        t.after(h.close);
        assert.equal(h.document.querySelector('.achievement-manage__back').getAttribute('href'), '/domain_badge_manage');
        assert.equal(h.document.querySelectorAll('[data-achievement-card]').length, 2);
        assert.equal(h.document.querySelector('[data-achievement-card] h3').textContent, malicious.name);
        assert.equal(h.document.querySelector('[onerror]'), null);
        assert.equal(h.document.querySelector('[data-id="library-10"] img').src, items[1].thumbnailUrl);
        assert.equal(h.document.querySelector('form').action, 'https://school.test/domain_achievement_manage');
        assert.match(h.document.body.textContent, /首次AC难度1的题目/);
    });

    it('combines category, text and image filters and restores them with one reset', (t) => {
        const h = fixture(); t.after(h.close);
        h.document.querySelector('[data-achievement-category="题库里程碑"]').click();
        h.input('[data-achievement-image-filter]', 'missing', 'change');
        h.input('[data-achievement-search]', '百题');
        assert.deepEqual(Array.from(h.document.querySelectorAll('[data-achievement-card]:not([hidden])'), (card) => card.dataset.id), ['library-100']);
        h.input('[data-achievement-search]', '不存在');
        assert.equal(h.document.querySelector('[data-achievement-empty]').hidden, false);
        h.document.querySelector('[data-achievement-reset]').click();
        assert.equal(h.document.querySelectorAll('[data-achievement-card]:not([hidden])').length, 3);
        assert.equal(h.document.querySelector('[data-achievement-search]'), h.document.activeElement);
    });

    it('offers all fourteen continuous-AC achievements among the 64 cards with category, search and upload controls', async (t) => {
        const catalogue = catalogueExports.ACHIEVEMENT_CATALOG.map((item) => ({
            ...item, categoryLabel: item.category === 'streak' ? '连续 AC' : item.category, imageUrl: '', thumbnailUrl: '',
        }));
        const streaks = catalogue.filter((item) => item.category === 'streak');
        const h = fixture({ overrides: { achievements: catalogue } }); t.after(h.close);
        assert.equal(catalogue.length, 64);
        assert.equal(streaks.length, 14);
        assert.equal(h.document.querySelector('h1 span').textContent, '64');
        assert.equal(h.document.querySelectorAll('[data-achievement-card]').length, 64);
        const category = h.document.querySelector('[data-achievement-category="streak"]');
        assert.match(category.textContent, /连续 AC\s+14/);
        assert.match(h.document.querySelector('[data-achievement-group="streak"] h2').textContent, /连续 AC.*14 项/);
        category.click();
        assert.equal(h.document.querySelectorAll('[data-achievement-card]:not([hidden])').length, 14);
        for (const item of streaks) {
            const card = h.document.querySelector(`[data-id="${item.id}"]`);
            assert.equal(card.querySelector('h3').textContent, item.name);
            assert.equal(card.querySelector('p').textContent, item.description);
            assert.ok(card.querySelector('[data-achievement-file]'));
        }
        const selected = streaks.at(-1);
        h.input('[data-achievement-search]', selected.description);
        assert.deepEqual(Array.from(h.document.querySelectorAll('[data-achievement-card]:not([hidden])'), (card) => card.dataset.id), [selected.id]);
        h.setResponse(async () => ({ ok: true, achievement: { ...selected, imageUrl: 'https://images.test/streak.png', thumbnailUrl: 'https://images.test/streak-thumb.webp' } }));
        h.selectFile(selected.id, new h.dom.window.File(['png'], '连续AC.png', { type: 'image/png' }));
        await h.flush();
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].body.get('id'), selected.id);
        assert.equal(h.requests[0].body.get('operation'), 'upload');
        assert.equal(h.document.querySelector(`[data-id="${selected.id}"] img`).src, 'https://images.test/streak-thumb.webp');
        assert.match(h.document.querySelector('[data-achievement-ready-count]').textContent, /1 \/ 64/);
        h.input('[data-achievement-search]', '');
        h.input('[data-achievement-image-filter]', 'missing', 'change');
        assert.equal(h.document.querySelectorAll('[data-achievement-card]:not([hidden])').length, 13);
        h.input('[data-achievement-image-filter]', 'ready', 'change');
        assert.deepEqual(Array.from(h.document.querySelectorAll('[data-achievement-card]:not([hidden])'), (card) => card.dataset.id), [selected.id]);
        h.document.querySelector('[data-achievement-reset]').click();
        assert.equal(h.document.querySelectorAll('[data-achievement-card]:not([hidden])').length, 64);
    });

    it('uploads the selected PNG to its scoped form and updates art only after success', async (t) => {
        const h = fixture(); t.after(h.close);
        h.selectFile('difficulty-1', new h.dom.window.File(['png'], '成就.png', { type: 'image/png' }));
        await h.flush();
        assert.equal(h.requests.length, 1);
        const request = h.requests[0];
        assert.equal(request.body.get('operation'), 'upload');
        assert.equal(request.body.get('id'), 'difficulty-1');
        assert.equal(request.body.get('image').name, '成就.png');
        assert.equal(request.credentials, 'same-origin');
        const card = h.document.querySelector('[data-id="difficulty-1"]');
        assert.equal(card.querySelector('img').src, 'https://images.test/new-thumb.webp');
        assert.equal(card.querySelector('[data-achievement-placeholder]').hidden, true);
        assert.equal(card.querySelector('[data-achievement-remove-form]').hidden, false);
        assert.equal(card.getAttribute('aria-busy'), 'false');
        assert.match(h.document.querySelector('[data-achievement-ready-count]').textContent, /2 \/ 3/);
    });

    it('rejects wrong file formats and excessive sizes before sending a request', async (t) => {
        const h = fixture(); t.after(h.close);
        h.selectFile('difficulty-1', new h.dom.window.File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' }));
        await h.flush();
        assert.equal(h.requests.length, 0);
        const status = h.document.querySelector('[data-id="difficulty-1"] [data-achievement-card-status]');
        assert.equal(status.getAttribute('role'), 'alert');
        assert.match(status.textContent, /PNG/);
        h.selectFile('difficulty-1', new h.dom.window.File([new Uint8Array(8388609)], 'big.png', { type: 'image/png' }));
        await h.flush();
        assert.equal(h.requests.length, 0);
        assert.match(status.textContent, /8 MB/);
    });

    it('retains the previous art and enables retry when saving fails', async (t) => {
        const h = fixture(); t.after(h.close);
        h.setResponse(async () => ({ error: { message: '存储暂时不可用' } }));
        h.selectFile('library-10', new h.dom.window.File(['png'], 'new.png', { type: 'image/png' }));
        await h.flush();
        const card = h.document.querySelector('[data-id="library-10"]');
        assert.equal(card.querySelector('img').src, items[1].thumbnailUrl);
        assert.equal(card.querySelector('[data-achievement-file]').disabled, false);
        assert.match(card.querySelector('[data-achievement-card-status]').textContent, /存储暂时不可用/);
    });

    it('previews full-size art without stretching and removes image without removing the achievement', async (t) => {
        const h = fixture(); t.after(h.close);
        const card = h.document.querySelector('[data-id="library-10"]');
        card.querySelector('[data-achievement-preview]').click();
        assert.equal(h.document.querySelector('dialog').open, true);
        assert.equal(h.document.querySelector('[data-achievement-preview-image]').src, items[1].imageUrl);
        assert.equal(h.document.querySelector('[data-achievement-preview-title]').textContent, '十题斩');
        h.document.querySelector('[data-achievement-preview-close]').click();
        assert.equal(h.document.querySelector('dialog').open, false);
        h.setResponse(async () => ({ ok: true, achievement: { ...items[1], imageUrl: '', thumbnailUrl: '' } }));
        card.querySelector('[data-achievement-remove-form]').dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await h.flush();
        assert.equal(h.requests[0].body.get('operation'), 'remove_image');
        assert.equal(card.querySelector('[data-achievement-placeholder]').hidden, false);
        assert.equal(card.querySelector('[data-achievement-remove-form]').hidden, true);
        assert.equal(h.document.querySelectorAll('[data-achievement-card]').length, 3);
    });

    it('makes earned thumbnail explanations available to keyboard and touch and dismisses with Escape', (t) => {
        const h = fixture({ wall: true }); t.after(h.close);
        const tile = h.document.querySelector('[data-achievement-tile]');
        const tooltip = h.document.querySelector('[data-achievement-tooltip]');
        assert.equal(tooltip.hidden, true);
        tile.focus();
        assert.equal(tooltip.hidden, false);
        assert.equal(tooltip.querySelector('strong').textContent, '初战告捷');
        assert.equal(tile.getAttribute('aria-describedby'), tooltip.id);
        h.document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
        assert.equal(tooltip.hidden, true);
        tile.click();
        assert.equal(tooltip.hidden, false);
        assert.match(tooltip.textContent, /首次AC难度1/);
        assert.equal(h.document.querySelectorAll('img')[1].src, items[1].thumbnailUrl);
        assert.equal(h.document.querySelectorAll('[data-achievement-tile]').length, 3);
        assert.equal(h.document.querySelector('[data-achievement-count]').textContent, '3');
        assert.equal(h.document.querySelector('[data-achievement-pending]'), null);
    });

    it('keeps failed thumbnails hidden without stars while preserving the heading and a friendly empty wall', (t) => {
        const h = fixture({ wall: true, readyWall: false }); t.after(h.close);
        const image = h.document.querySelector('img');
        image.dispatchEvent(new h.dom.window.Event('error'));
        assert.ok(image.parentElement.hasAttribute('data-achievement-pending'));
        assert.equal(h.document.querySelector('[data-achievement-count]').textContent, '0');
        assert.equal(h.document.querySelector('[data-achievement-wall] header').hidden, false);
        assert.equal(h.document.querySelector('.achievement-wall__placeholder'), null);
        assert.equal(h.document.querySelector('.achievement-wall__fallback-name'), null);
        const empty = fixture({ wall: true, overrides: { achievementWall: { items: [], unlocked: 0, total: 64 }, isSelfProfile: true } });
        t.after(empty.close);
        assert.equal(empty.document.querySelectorAll('[data-achievement-tile]').length, 0);
        assert.match(empty.document.querySelector('.achievement-wall__empty').textContent, /开启属于你的成就之旅/);
    });

    it('shows cached profile artwork while keeping unconfigured streaks hidden and never downloading originals', (t) => {
        const earned = [
            { ...items[1], thumbnailUrl: '' },
            { ...catalogueExports.ACHIEVEMENT_CATALOG.find((item) => item.category === 'streak'), thumbnailUrl: '' },
            { ...items[0], thumbnailUrl: 'https://images.test/ready.webp' },
        ];
        const h = fixture({ wall: true, overrides: { achievementWall: { items: earned, unlocked: 3, total: 64 } } });
        t.after(h.close);
        assert.equal(h.document.querySelectorAll('img').length, 1);
        assert.equal(h.document.querySelector('img').src, earned[2].thumbnailUrl);
        assert.equal(h.document.querySelector('.achievement-wall__fallback-name'), null);
        assert.equal(h.document.querySelector('.achievement-wall__placeholder'), null);
        assert.equal(h.document.querySelector('[data-achievement-count]').textContent, '1');
        assert.equal(h.document.querySelector('.achievement-wall__count').getAttribute('aria-label'), '已解锁 3 / 64 项成就');
        assert.equal(h.document.querySelectorAll('[data-achievement-tile][hidden][data-achievement-pending]').length, 2);
        assert.equal(h.document.querySelector('[data-achievement-tile]:not([hidden])').hasAttribute('data-achievement-pending'), false);
        assert.equal(h.document.querySelector('.is-entering'), null);
        assert.doesNotMatch(h.document.documentElement.innerHTML, /https:\/\/images\.test\/full\.png/);
    });

    it('binds homepage walls and restores bindings after content replacement without duplicate tooltips', (t) => {
        const h = fixture({ wall: true }); t.after(h.close);
        assert.ok(h.exports.default.names.includes('homepage'));
        const wall = h.document.querySelector('[data-achievement-wall]');
        const tile = wall.querySelector('[data-achievement-tile]');
        const tooltip = wall.querySelector('[data-achievement-tooltip]');
        tile.click();
        assert.equal(tooltip.hidden, false);
        h.jquery(wall).trigger('vjContentRemove');
        assert.equal(tooltip.hidden, true);
        assert.equal(wall.dataset.bound, undefined);
        tile.click();
        assert.equal(tooltip.hidden, true);
        h.jquery(wall).trigger('vjContentNew');
        h.jquery(wall).trigger('vjContentNew');
        tile.click();
        assert.equal(tooltip.hidden, false);
        assert.equal(wall.dataset.bound, 'true');
    });

    it('compiles responsive styles with dark-theme, reduced-motion and aspect-preserving artwork rules', () => {
        const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/pages/achievement_manage.page.styl'), 'utf8'));
        assert.match(css, /\.theme--dark \.achievement-wall/);
        assert.match(css, /prefers-reduced-motion/);
        assert.match(css, /object-fit: contain/);
        assert.match(css, /\.achievement-wall__tooltip[\s\S]*?position: fixed/);
        assert.match(css, /max-width: 640px/);
        assert.match(css, /\.hasjs \.achievement-wall \[data-achievement-pending\]\s*\{\s*display: none;/);
        assert.doesNotMatch(css, /\[data-achievement-wall-loading\]/);
    });
});

describe('achievement sound management', () => {
    const configured = { soundUrl: 'https://images.test/unlock.mp3', filename: '解锁.mp3', volume: 60, enabled: true };
    const submit = (h, selector) => h.document.querySelector(selector).dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true }));

    it('keeps one shared sound panel and requires an explicit save for volume and enable changes', async (t) => {
        const h = fixture({ overrides: { achievementSound: configured } }); t.after(h.close);
        assert.equal(h.document.querySelectorAll('[data-achievement-sound]').length, 1);
        assert.equal(h.document.querySelector('[data-achievement-sound-save]').disabled, true);
        h.input('[data-achievement-sound-volume]', '35');
        h.document.querySelector('[data-achievement-sound-enabled]').click();
        assert.equal(h.requests.length, 0);
        assert.equal(h.document.querySelector('[data-achievement-sound-volume-value]').textContent, '35%');
        assert.match(h.document.querySelector('[data-achievement-sound-save-state]').textContent, /未保存/);
        h.setResponse(async () => ({ ok: true, achievementSound: { ...configured, enabled: false, volume: 35 } }));
        submit(h, '[data-achievement-sound-settings]'); await h.flush();
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].body.get('operation'), 'save_sound');
        assert.equal(h.requests[0].body.get('enabled'), 'false');
        assert.equal(h.requests[0].body.get('volume'), '35');
        assert.equal(h.document.querySelector('[data-achievement-sound-save]').disabled, true);
        assert.equal(h.document.querySelector('[data-achievement-sound-enabled]').checked, false);
    });

    it('uploads immediately to the scoped endpoint while preserving unsaved settings', async (t) => {
        const h = fixture({ overrides: { manageRoute: 'domain_achievement_manage' } }); t.after(h.close);
        h.input('[data-achievement-sound-volume]', '25');
        h.setResponse(async () => ({ ok: true, achievementSound: { ...configured, volume: 70 } }));
        h.selectSound(new h.dom.window.File(['audio'], '解锁.mp3', { type: 'audio/mpeg' })); await h.flush();
        assert.equal(h.requests[0].url, 'https://school.test/domain_achievement_manage');
        assert.equal(h.requests[0].credentials, 'same-origin');
        assert.equal(h.requests[0].body.get('operation'), 'upload_sound');
        assert.equal(h.requests[0].body.get('sound').name, '解锁.mp3');
        assert.equal(h.document.querySelector('[data-achievement-sound-filename]').textContent, '解锁.mp3');
        assert.equal(h.document.querySelector('[data-achievement-sound-upload-label]').textContent, '替换音效');
        assert.equal(h.document.querySelector('[data-achievement-sound-volume]').value, '25');
        assert.equal(h.document.querySelector('[data-achievement-sound-save]').disabled, false);
        assert.match(h.document.querySelector('[data-achievement-sound-status]').textContent, /尚未保存/);
        assert.equal(h.document.querySelector('[data-achievement-sound-preview]').disabled, false);
    });

    it('rejects unsupported and oversized files before uploading and accepts supported audio', async (t) => {
        const h = fixture(); t.after(h.close);
        h.selectSound(new h.dom.window.File(['script'], 'sound.svg', { type: 'image/svg+xml' }));
        h.selectSound(new h.dom.window.File([new Uint8Array(8388609)], 'big.wav', { type: 'audio/wav' }));
        h.selectSound(new h.dom.window.File([], 'empty.mp3', { type: 'audio/mpeg' }));
        await h.flush();
        assert.equal(h.requests.length, 0);
        assert.match(h.document.querySelector('[data-achievement-sound-status]').textContent, /8 MB/);
        h.setResponse(async () => ({ ok: true, achievementSound: configured }));
        for (const [name, type] of [['sound.OGG', 'audio/ogg'], ['sound.wav', 'audio/x-wav'], ['sound.m4a', 'audio/mp4']]) {
            h.selectSound(new h.dom.window.File(['audio'], name, { type })); await h.flush();
        }
        assert.equal(h.requests.length, 3);
    });

    it('preserves the previous sound and draft after a failed save and exposes retry', async (t) => {
        const h = fixture({ overrides: { achievementSound: configured } }); t.after(h.close);
        h.input('[data-achievement-sound-volume]', '42');
        h.setResponse(async () => ({ error: { message: '存储暂时不可用' } }));
        submit(h, '[data-achievement-sound-settings]'); await h.flush();
        assert.equal(h.document.querySelector('[data-achievement-sound]').dataset.soundUrl, configured.soundUrl);
        assert.equal(h.document.querySelector('[data-achievement-sound-volume]').value, '42');
        assert.equal(h.document.querySelector('[data-achievement-sound-save]').disabled, false);
        assert.equal(h.document.querySelector('[data-achievement-sound-status]').getAttribute('role'), 'alert');
        assert.match(h.document.querySelector('[data-achievement-sound-status]').textContent, /存储暂时不可用/);
    });

    it('previews the draft volume, adjusts live, stops on demand and cleans up when navigating', (t) => {
        const h = fixture({ overrides: { achievementSound: configured } }); t.after(h.close);
        const preview = h.document.querySelector('[data-achievement-sound-preview]');
        assert.equal(h.audio.length, 0);
        h.input('[data-achievement-sound-volume]', '30'); preview.click();
        assert.equal(h.audio[0].src, configured.soundUrl);
        assert.equal(h.audio[0].volume, .3);
        assert.equal(h.audio[0].loop, false);
        assert.equal(preview.textContent, '停止试听');
        h.input('[data-achievement-sound-volume]', '45');
        assert.equal(h.audio[0].volume, .45);
        preview.click();
        assert.equal(h.audio[0].paused, true);
        assert.equal(h.audio[0].src, '');
        preview.click();
        h.dom.window.dispatchEvent(new h.dom.window.Event('pagehide'));
        assert.equal(h.audio[1].paused, true);
        assert.equal(h.audio[1].src, '');
        assert.equal(h.requests.length, 0);
    });

    it('reports unavailable playback and restores preview after the audio ends', async (t) => {
        const h = fixture({ overrides: { achievementSound: configured } }); t.after(h.close);
        const preview = h.document.querySelector('[data-achievement-sound-preview]');
        preview.click(); h.audio[0].onended();
        assert.equal(preview.getAttribute('aria-pressed'), 'false');
        assert.match(h.document.querySelector('[data-achievement-sound-status]').textContent, /试听结束/);
        h.rejectAudio(); preview.click(); await h.flush();
        assert.equal(preview.textContent, '试听');
        assert.equal(h.audio[1].paused, true);
        assert.match(h.document.querySelector('[data-achievement-sound-status]').textContent, /暂时无法播放/);
    });

    it('removes audio independently from achievement artwork and stops any preview', async (t) => {
        const h = fixture({ overrides: { achievementSound: configured } }); t.after(h.close);
        h.document.querySelector('[data-achievement-sound-preview]').click();
        h.setResponse(async () => ({ ok: true, achievementSound: { ...configured, soundUrl: '', filename: '' } }));
        submit(h, '[data-achievement-sound-remove-form]'); await h.flush();
        assert.equal(h.requests[0].body.get('operation'), 'remove_sound');
        assert.equal(h.audio[0].paused, true);
        assert.equal(h.document.querySelector('[data-achievement-sound-preview]').disabled, true);
        assert.equal(h.document.querySelector('[data-achievement-sound-remove-form]').hidden, true);
        assert.equal(h.document.querySelector('[data-achievement-sound-filename]').textContent, '还未上传音效');
        assert.equal(h.document.querySelector('[data-id="library-10"] img').src, items[1].thumbnailUrl);
    });

    it('aborts pending sound updates on navigation without overwriting the removed view', async (t) => {
        const h = fixture({ overrides: { achievementSound: configured } }); t.after(h.close);
        let finish;
        h.setResponse(() => new Promise((resolve) => { finish = resolve; }));
        h.input('[data-achievement-sound-volume]', '20');
        submit(h, '[data-achievement-sound-settings]');
        h.dom.window.dispatchEvent(new h.dom.window.Event('pagehide'));
        assert.equal(h.requests[0].signal.aborted, true);
        finish({ ok: true, achievementSound: { ...configured, volume: 20 } }); await h.flush();
        assert.equal(h.document.querySelector('[data-achievement-sound-volume]').value, '20');
        assert.match(h.document.querySelector('[data-achievement-sound-save-state]').textContent, /未保存/);
    });

    it('reloads cached management pages to reconcile interrupted saves and ignores late responses', async (t) => {
        let reloads = 0;
        const h = fixture({ overrides: { achievementSound: configured }, onReload: () => { reloads++; } }); t.after(h.close);
        let finish;
        h.setResponse(() => new Promise((resolve) => { finish = resolve; }));
        h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pageshow', { persisted: true }));
        assert.equal(reloads, 0);
        h.input('[data-achievement-sound-volume]', '20');
        submit(h, '[data-achievement-sound-settings]');
        h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pagehide', { persisted: true }));
        assert.equal(h.requests[0].signal.aborted, true);
        h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pageshow', { persisted: false }));
        assert.equal(reloads, 0);
        h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pageshow', { persisted: true }));
        assert.equal(reloads, 1);
        finish({ ok: true, achievementSound: { ...configured, volume: 20 } }); await h.flush();
        assert.match(h.document.querySelector('[data-achievement-sound-save-state]').textContent, /未保存/);
        h.document.querySelector('[data-achievement-manage]').remove();
        h.dom.window.dispatchEvent(new h.dom.window.PageTransitionEvent('pageshow', { persisted: true }));
        assert.equal(reloads, 1);
    });
});
