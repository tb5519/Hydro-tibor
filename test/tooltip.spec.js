const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const stylus = require('stylus');
const { JSDOM } = require('jsdom');

const ui = path.resolve(__dirname, '../packages/ui-default');
const read = (file) => fs.readFileSync(path.join(ui, file), 'utf8');
const css = stylus(`$font-size-small = 14px\n${read('components/drop/drop.page.styl')}\n${read('components/tooltip/tooltip.page.styl')}`)
    .define('rem', (value) => value).render();
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

function harness(options = {}) {
    const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body>
        <button data-tooltip="Quit Scratchpad (Alt+Q)"><div><span><span><svg><g><path></path></g></svg></span></span></div></button>
    </body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://school.example/p/1' });
    const { window } = dom;
    const viewport = { width: 1512, height: 900, scrollbar: 0, scrollX: 0, scrollY: 0, ...options };
    const document = window.document;
    const target = document.querySelector('button');
    let targetBox = options.target || rect(viewport.width - 46, 90, 32, 34);
    const visibleWidth = () => viewport.width - viewport.scrollbar;
    for (const [key, get] of Object.entries({ innerWidth: () => viewport.width, innerHeight: () => viewport.height,
        pageXOffset: () => viewport.scrollX, pageYOffset: () => viewport.scrollY })) {
        Object.defineProperty(window, key, { configurable: true, get });
    }
    for (const element of [document.documentElement, document.body]) {
        Object.defineProperty(element, 'clientWidth', { configurable: true, get: visibleWidth });
        Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => viewport.height });
    }
    // jsdom has no layout engine. Supply deterministic text metrics/DOM geometry;
    // the production CSS, Drop lifecycle and full Tether positioning code run unchanged.
    const px = (value, base) => {
        if (value.endsWith('em')) return parseFloat(value) * 14;
        if (value.endsWith('%')) return parseFloat(value) / 100 * base;
        if (value.endsWith('vh')) return parseFloat(value) / 100 * viewport.height;
        if (value.startsWith('calc(')) return viewport.height - 20;
        return parseFloat(value) || 0;
    };
    function tooltipSize(element) {
        const outer = window.getComputedStyle(element);
        if (outer.display === 'none') return [0, 0];
        const content = element.querySelector('.drop-content');
        const style = window.getComputedStyle(content);
        const padding = px(outer.paddingLeft, visibleWidth()) + px(outer.paddingRight, visibleWidth());
        const innerPadding = px(style.paddingLeft, 0) + px(style.paddingRight, 0);
        const available = Math.min(px(outer.maxWidth, visibleWidth()) || Infinity, visibleWidth()) - padding;
        const textWidth = content.textContent.length * 7;
        const contentWidth = Math.min(textWidth + innerPadding, px(style.maxWidth, 0) || Infinity, available);
        const wraps = style.whiteSpace !== 'nowrap' && style.overflowWrap === 'anywhere';
        const lines = wraps ? Math.ceil(textWidth / Math.max(1, contentWidth - innerPadding)) : 1;
        const height = Math.min(lines * 14 + px(style.paddingTop, 0) + px(style.paddingBottom, 0),
            px(style.maxHeight, viewport.height) || Infinity);
        return [contentWidth + padding, height + padding];
    }
    window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
        if (this === target) return targetBox;
        if (this.hasAttribute('data-tether-id')) return rect(-viewport.scrollX, -viewport.scrollY, 0, 0);
        if (this.classList.contains('drop-element')) {
            const [width, height] = tooltipSize(this);
            const x = Number(this.style.transform.match(/translateX\(([-\d.]+)px\)/)?.[1] || 0);
            const y = Number(this.style.transform.match(/translateY\(([-\d.]+)px\)/)?.[1] || 0);
            const fixed = this.style.position === 'fixed';
            const left = this.style.right === '0px' ? visibleWidth() - width + x : x;
            const top = this.style.bottom === '0px' ? viewport.height - height + y : y;
            return rect(left - (fixed ? 0 : viewport.scrollX), top - (fixed ? 0 : viewport.scrollY), width, height);
        }
        return rect(0, 0, visibleWidth(), viewport.height);
    };
    window.eval(fs.readFileSync(require.resolve('tether'), 'utf8'));
    window.eval(fs.readFileSync(require.resolve('tether-drop'), 'utf8'));
    const $ = require('jquery')(window);
    const modules = { jquery: $, lodash: require('lodash'), 'tether-drop': window.Drop,
        'vj/misc/Page': { AutoloadPage: class { constructor(name, load) { this.load = load; } } } };
    function load(file) {
        const mod = { exports: {} };
        const source = esbuild.transformSync(read(file), { loader: file.endsWith('.ts') ? 'ts' : 'js', format: 'cjs' }).code;
        window.Function('require', 'module', 'exports', source)((id) => {
            assert(id in modules, `Unexpected import: ${id}`);
            return modules[id];
        }, mod, mod.exports);
        return mod.exports;
    }
    modules['vj/components/DOMAttachedObject'] = load('components/DOMAttachedObject.ts');
    modules['./Tooltip'] = load('components/tooltip/Tooltip.js');
    const Tooltip = modules['./Tooltip'].default;
    const page = load('components/tooltip/tooltip.page.js');
    page.default.load();
    const instances = [];
    return { window, document, viewport, target, page, Tooltip,
        moveTarget(next) { targetBox = next; },
        create(position = 'top center', text = 'Quit Scratchpad (Alt+Q)') {
            target.setAttribute('data-tooltip', text);
            const tooltip = Tooltip.getOrConstruct($(target), { position });
            instances.push(tooltip);
            tooltip.open();
            return tooltip;
        },
        close() {
            const delegated = Tooltip.get($(target));
            if (delegated && !instances.includes(delegated)) instances.push(delegated);
            for (const tooltip of instances) { tooltip.delayDetach.cancel(); tooltip.detach(); }
            dom.window.close();
        },
    };
}

function assertInViewport(h, tooltip) {
    const bounds = tooltip.drop.drop.getBoundingClientRect();
    assert(bounds.width > 0 && bounds.height > 0);
    assert(bounds.left >= -1, `left overflow: ${JSON.stringify(bounds)}`);
    assert(bounds.top >= -1, `top overflow: ${JSON.stringify(bounds)}`);
    assert(bounds.right <= h.viewport.width - h.viewport.scrollbar + 1, `right overflow: ${JSON.stringify(bounds)}`);
    assert(bounds.bottom <= h.viewport.height + 1, `bottom overflow: ${JSON.stringify(bounds)}`);
    return bounds;
}

describe('global tooltip viewport positioning', () => {
    it('reproduces the legacy right-edge overflow with the real Drop/Tether and keeps the fixed tooltip inside', () => {
        const h = harness();
        try {
            const legacy = new h.window.Drop({ target: h.target, content: h.target.dataset.tooltip, classes: 'tooltip',
                position: 'top center', openOn: false, constrainToWindow: true, constrainToScrollParent: false });
            legacy.open();
            assert(legacy.drop.getBoundingClientRect().right > h.viewport.width + 30);
            legacy.destroy();
            const tooltip = h.create();
            assertInViewport(h, tooltip);
        } finally { h.close(); }
    });

    for (const [position, target] of [
        ['top center', rect(740, 0, 32, 34)], ['bottom center', rect(740, 866, 32, 34)],
        ['left middle', rect(0, 425, 32, 34)], ['right middle', rect(1480, 425, 32, 34)],
        ['top center', rect(0, 0, 32, 34)], ['bottom center', rect(1480, 866, 32, 34)],
    ]) {
        it(`fits ${position} at ${target.left},${target.top} and does not alter the target classes`, () => {
            const h = harness({ target });
            try {
                const classes = h.target.className;
                assertInViewport(h, h.create(position));
                assert.equal(h.target.className, classes);
            } finally { h.close(); }
        });
    }

    it('wraps long English words in a narrow viewport and repositions after resizing', () => {
        const h = harness({ width: 180, height: 300, target: rect(148, 120, 32, 34) });
        try {
            const tooltip = h.create('top center', 'SupercalifragilisticexpialidociousLongUnbrokenTooltip'.repeat(4));
            const initial = assertInViewport(h, tooltip);
            assert(initial.height > 60, 'Long text should wrap into several lines');
            h.viewport.width = 96;
            h.moveTarget(rect(64, 120, 32, 34));
            tooltip.drop.tether.position();
            const narrow = assertInViewport(h, tooltip);
            assert(narrow.width < initial.width);
        } finally { h.close(); }
    });

    it('respects an existing scrollbar and page scroll offsets', () => {
        const h = harness({ scrollbar: 16, scrollX: 60, scrollY: 800, target: rect(1460, 90, 32, 34) });
        try {
            const tooltip = h.create();
            assertInViewport(h, tooltip);
            h.viewport.scrollY = 1200;
            tooltip.drop.tether.position();
            assertInViewport(h, tooltip);
        } finally { h.close(); }
    });

    it('finds nested SVG and text targets without a depth limit and ignores document/empty hints', () => {
        const h = harness();
        try {
            const pathElement = h.target.querySelector('path');
            assert.equal(h.page.getClosestTooltipElement(pathElement), h.target);
            const text = h.document.createTextNode('Exit');
            h.target.querySelector('span span').append(text);
            assert.equal(h.page.getClosestTooltipElement(text), h.target);
            assert.equal(h.page.getClosestTooltipElement(h.document), null);
            assert.equal(h.page.getClosestTooltipElement(null), null);
            pathElement.dispatchEvent(new h.window.MouseEvent('mouseover', { bubbles: true }));
            const tip = h.document.querySelector('.tooltip.drop-element');
            assert(tip?.classList.contains('drop-open'), 'Delegated mouseover should open the real tooltip');
            h.target.dataset.tooltip = '';
            assert.equal(h.page.getClosestTooltipElement(text), null);
        } finally { h.close(); }
    });
});
