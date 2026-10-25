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
};
function fixture({ wall = false, overrides = {} } = {}) {
    const html = env.render(wall ? 'partials/achievement_wall.html' : 'achievement_manage.html', {
        ...context, achievementWall: { items, unlocked: items.length, total: 50 }, ...overrides,
    });
    const dom = new JSDOM(html, { url: 'https://school.test/achievement_manage', runScripts: 'outside-only', pretendToBeVisual: true });
    const requests = [];
    let respond = async (body) => ({ ok: true, achievement: { ...items.find((item) => item.id === body.get('id')), imageUrl: 'https://images.test/new.png', thumbnailUrl: 'https://images.test/new-thumb.webp' } });
    dom.window.fetch = async (url, options) => {
        requests.push({ url, ...options });
        const result = await respond(options.body);
        return { ok: true, json: async () => result };
    };
    dom.window.confirm = () => true;
    dom.window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
    dom.window.HTMLDialogElement.prototype.close = function close() { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
    dom.window.exports = {};
    dom.window.require = () => ({ NamedPage: class { constructor(names, callback) { this.names = names; this.callback = callback; } } });
    dom.window.eval(source);
    dom.window.exports.default.callback();
    return {
        dom, document: dom.window.document, requests, exports: dom.window.exports,
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
        assert.equal(h.document.querySelector('img').src, items[1].thumbnailUrl);
        assert.equal(h.document.querySelectorAll('[data-achievement-tile]').length, 3);
    });

    it('keeps earned titles visible if thumbnail loading fails and shows a friendly empty wall', (t) => {
        const h = fixture({ wall: true }); t.after(h.close);
        const image = h.document.querySelector('img');
        image.dispatchEvent(new h.dom.window.Event('error'));
        assert.equal(image.hidden, true);
        assert.equal(image.parentElement.querySelector('.achievement-wall__fallback-name').textContent, '十题斩');
        const empty = fixture({ wall: true, overrides: { achievementWall: { items: [], unlocked: 0, total: 50 }, isSelfProfile: true } });
        t.after(empty.close);
        assert.equal(empty.document.querySelectorAll('[data-achievement-tile]').length, 0);
        assert.match(empty.document.querySelector('.achievement-wall__empty').textContent, /开启属于你的成就之旅/);
    });

    it('never downloads original artwork when a wall thumbnail is missing', (t) => {
        const h = fixture({ wall: true, overrides: { achievementWall: { items: [{ ...items[1], thumbnailUrl: '' }], unlocked: 1, total: 50 } } });
        t.after(h.close);
        assert.equal(h.document.querySelector('img'), null);
        assert.equal(h.document.querySelector('.achievement-wall__fallback-name').textContent, '十题斩');
        assert.doesNotMatch(h.document.documentElement.innerHTML, /https:\/\/images\.test\/full\.png/);
    });

    it('compiles responsive styles with dark-theme, reduced-motion and aspect-preserving artwork rules', () => {
        const css = stylus.render(fs.readFileSync(path.join(root, 'packages/ui-default/pages/achievement_manage.page.styl'), 'utf8'));
        assert.match(css, /\.theme--dark \.achievement-wall/);
        assert.match(css, /prefers-reduced-motion/);
        assert.match(css, /object-fit: contain/);
        assert.match(css, /\.achievement-wall__tooltip[\s\S]*?position: fixed/);
        assert.match(css, /max-width: 640px/);
    });
});
