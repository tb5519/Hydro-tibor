const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const stylus = require('stylus');
const postcss = require('postcss');
const source = transformSync(fs.readFileSync('packages/ui-default/components/badge_icon.ts', 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code;
const label = '<a href="/badge/7" class="user-profile-badge user-profile-badge--custom"><span data-badge-icon-fallback>剑客</span><img data-badge-icon src="/badge/7/icon-image?v=1" alt="剑客" hidden></a>';
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function loaded(image, valid = true, complete = true) {
    Object.defineProperties(image, {
        complete: { configurable: true, value: complete },
        naturalWidth: { configurable: true, value: valid ? 480 : 0 },
        naturalHeight: { configurable: true, value: valid ? 128 : 0 },
    });
}
function fixture({ observed = true } = {}) {
    const dom = new JSDOM(label + '<img id="ac" src="/badge/7/ac-image"><img id="honor" class="honor-wall__ac-image" src="/badge/7/ac-image?size=384">', {
        url: 'https://onebyone.test/ranking', pretendToBeVisual: true,
    });
    const win = dom.window;
    const observations = new Set();
    let notify;
    if (observed) win.IntersectionObserver = class {
        constructor(callback) { notify = callback; }
        observe(image) { observations.add(image); }
        unobserve(image) { observations.delete(image); }
        disconnect() { observations.clear(); }
    };
    const module = { exports: {} };
    vm.runInNewContext(source, { module, exports: module.exports, document: win.document,
        HTMLImageElement: win.HTMLImageElement, Element: win.Element, MutationObserver: win.MutationObserver });
    const image = win.document.querySelector('[data-badge-icon]');
    loaded(image);
    const dispose = module.exports.installBadgeIcons(win.document);
    const glow = () => win.document.querySelector('[data-badge-icon-shine]');
    return { dom, win, doc: win.document, image, dispose, glow, observations,
        intersect(image, value = true) { notify([{ target: image, isIntersecting: value }]); },
        close() { dispose(); dom.window.close(); } };
}

describe('alpha-preserving image badge sweep', () => {
    it('uses the exact cached bitmap in a decorative layer without changing the real badge, label or AC artwork', async () => {
        const f = fixture();
        try {
            const glow = f.glow();
            assert.equal(glow.src, f.image.src);
            assert.equal(glow.alt, ''); assert.equal(glow.getAttribute('aria-hidden'), 'true');
            assert.equal(glow.hasAttribute('data-badge-icon'), false);
            assert.equal(glow.hasAttribute('crossorigin'), false, 'ordinary CDN image delivery needs no CORS mask request');
            assert.equal(glow.getAttribute('fetchpriority'), 'low');
            assert.equal(f.image.hidden, false);
            assert.equal(f.image.alt, '剑客');
            assert.equal(f.image.parentElement.getAttribute('href'), '/badge/7');
            assert.equal(f.doc.querySelectorAll('[data-badge-icon]').length, 1);
            assert.equal(f.doc.querySelector('#ac').getAttribute('src'), '/badge/7/ac-image');
            assert.equal(f.doc.querySelector('#honor').getAttribute('src'), '/badge/7/ac-image?size=384');
            f.image.dispatchEvent(new f.win.Event('load')); f.image.dispatchEvent(new f.win.Event('load')); await tick();
            assert.equal(f.doc.querySelectorAll('[data-badge-icon-shine]').length, 1, 'repeat/cached loads never add duplicate layers');
        } finally { f.close(); }
    });
    it('pauses offscreen or hidden-tab sweeps and resumes only visible image badges', () => {
        const f = fixture();
        try {
            assert.equal(f.glow().style.animationPlayState, 'paused');
            f.intersect(f.image); assert.equal(f.glow().style.animationPlayState, 'running');
            Object.defineProperty(f.doc, 'hidden', { configurable: true, value: true });
            f.doc.dispatchEvent(new f.win.Event('visibilitychange'));
            assert.equal(f.glow().style.animationPlayState, 'paused');
            Object.defineProperty(f.doc, 'hidden', { configurable: true, value: false });
            f.doc.dispatchEvent(new f.win.Event('visibilitychange'));
            assert.equal(f.glow().style.animationPlayState, 'running');
            f.intersect(f.image, false); assert.equal(f.glow().style.animationPlayState, 'paused');
        } finally { f.close(); }
    });
    it('runs safely without IntersectionObserver and keeps the original bitmap if only the shine layer fails', () => {
        const f = fixture({ observed: false });
        try {
            assert.equal(f.glow().style.animationPlayState, 'running');
            f.glow().dispatchEvent(new f.win.Event('error'));
            assert.equal(f.glow(), null);
            assert.equal(f.image.hidden, false);
            assert.equal(f.image.parentElement.dataset.badgeIconState, 'ready');
        } finally { f.close(); }
    });
    it('removes old-version shine while replacement art loads and restores the original text on failure', async () => {
        const f = fixture();
        try {
            const old = f.glow();
            loaded(f.image, false, false); f.image.src = '/badge/7/icon-image?v=2'; await tick();
            assert.equal(old.isConnected, false); assert.equal(f.glow(), null); assert.equal(f.image.hidden, true);
            loaded(f.image); f.image.dispatchEvent(new f.win.Event('load'));
            assert.equal(f.glow().src, 'https://onebyone.test/badge/7/icon-image?v=2');
            loaded(f.image, false); f.image.dispatchEvent(new f.win.Event('error'));
            assert.equal(f.glow(), null);
            assert.equal(f.image.parentElement.dataset.badgeIconState, 'fallback');
            assert.equal(f.doc.querySelector('[data-badge-icon-fallback]').getAttribute('aria-hidden'), 'false');
        } finally { f.close(); }
    });
    it('follows the selected responsive image source and keeps its request policy', async () => {
        const f = fixture();
        try {
            f.image.crossOrigin = 'anonymous'; f.image.referrerPolicy = 'no-referrer';
            Object.defineProperty(f.image, 'currentSrc', { configurable: true, value: 'https://cdn.test/icon@2x.png' });
            f.image.dispatchEvent(new f.win.Event('load'));
            assert.equal(f.glow().src, 'https://cdn.test/icon@2x.png');
            assert.equal(f.glow().crossOrigin, 'anonymous'); assert.equal(f.glow().referrerPolicy, 'no-referrer');
        } finally { f.close(); }
    });
    it('enhances live ranking insertions, preserves layers on DOM moves and releases removed or disposed badges', async () => {
        const f = fixture();
        try {
            const holder = f.doc.createElement('div'); holder.innerHTML = label;
            const image = holder.querySelector('img'); loaded(image); f.doc.body.append(holder); await tick();
            const glow = holder.querySelector('[data-badge-icon-shine]'); assert.ok(glow);
            f.doc.body.prepend(holder); await tick();
            assert.equal(holder.querySelector('[data-badge-icon-shine]'), glow, 'moving a row preserves its animation phase');
            holder.remove(); await tick();
            assert.equal(glow.isConnected, false); assert.equal(f.observations.has(image), false);
            f.dispose(); assert.equal(f.glow(), null); assert.equal(f.observations.size, 0);
            f.image.dispatchEvent(new f.win.Event('load')); await tick(); assert.equal(f.glow(), null);
        } finally { f.close(); }
    });
});

it('builds a feathered Safari-compatible local gradient mask, retaining alpha, hit targets and the profile selector indicator', () => {
    const styles = fs.readFileSync('packages/ui-default/components/profile/profile.page.styl', 'utf8');
    const css = postcss.parse(stylus(styles.slice(styles.indexOf('// Display the uploaded badge artwork'))).render());
    const rules = []; css.walkRules((rule) => rules.push(rule));
    const style = (rule) => Object.fromEntries((rule.nodes || []).filter((node) => node.type === 'decl').map((node) => [node.prop, node.value]));
    const base = rules.find((rule) => rule.selector === '.user-profile-badge > img[data-badge-icon-shine]' && rule.parent.type === 'root');
    assert.equal(style(base).display, 'none'); assert.equal(style(base)['pointer-events'], 'none');
    assert.equal(style(base).position, 'absolute'); assert.equal(style(base)['object-fit'], 'contain');
    const active = rules.find((rule) => rule.selector.includes("[data-badge-icon-state='ready'] > img[data-badge-icon-shine]"));
    assert.equal(active.parent.name, 'supports');
    const activeStyle = style(active);
    assert.equal(activeStyle.filter, 'brightness(0) invert(1)');
    assert.match(activeStyle['mask-image'], /^linear-gradient/);
    assert.equal(activeStyle['mask-image'], activeStyle['-webkit-mask-image']);
    assert.doesNotMatch(activeStyle['mask-image'], /url\(/);
    assert.equal(activeStyle['mask-size'], '300% 100%');
    assert.match(activeStyle.animation, /badge-icon-sweep 4\.8s/);
    const frames = []; css.walkAtRules('keyframes', (node) => frames.push(node));
    const sweep = frames.find((node) => node.params === 'badge-icon-sweep'); assert.ok(sweep);
    assert.equal(style(sweep.nodes[0])['mask-position'], '150% 0');
    assert.equal(style(sweep.nodes[1])['-webkit-mask-position'], '-50% 0');
    const reduced = rules.find((rule) => rule.selector === '.user-profile-badge > img[data-badge-icon-shine]' && rule.parent.name === 'media');
    assert.equal(reduced.parent.params, '(prefers-reduced-motion: reduce)');
    assert.equal(style(reduced).display, 'none'); assert.equal(style(reduced).animation, 'none');
    assert.ok(rules.some((rule) => rule.selector.includes(':not(.ui-v2-user-detail-badge-row__selector)::after')));
});
