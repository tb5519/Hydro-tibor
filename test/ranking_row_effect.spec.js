const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'packages/ui-default/components/table/ranking_row_effect.ts'), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2020' }).code, { module: mod, exports: mod.exports });
const { measureRankingRowEffects, installRankingRowEffects } = mod.exports;

function setup(tableClass = 'ranking-badge-effects') {
    const dom = new JSDOM(`<table class="${tableClass}"><tbody><tr class="ranking-row--badge ranking-row--badge-5"><td>1</td><td>Student</td><td data-scoreboard-cell-style style="background:#dcfce7">300</td><td>Long multiline description</td></tr></tbody></table>`);
    const { window: win } = dom;
    const doc = win.document;
    const row = doc.querySelector('tr');
    let left = 21.5;
    let width = 701.75;
    let offsets = [0, 55.25, 318.5, 424.75];
    row.getBoundingClientRect = () => ({ left, width });
    [...row.cells].forEach((cell, index) => { cell.getBoundingClientRect = () => ({ left: left + offsets[index] }); });
    let resize;
    const observed = new Set();
    win.ResizeObserver = class {
        constructor(callback) { resize = callback; }
        observe(node) { observed.add(node); }
        unobserve(node) { observed.delete(node); }
        disconnect() { observed.clear(); }
    };
    let nextFrame = 0;
    const frames = new Map();
    win.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
    win.cancelAnimationFrame = (id) => frames.delete(id);
    const flush = async () => {
        await new Promise((resolve) => setImmediate(resolve));
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback());
        await new Promise((resolve) => setImmediate(resolve));
    };
    return {
        doc, win, row, observed, frames, flush,
        resize: () => resize(),
        geometry: (newWidth, newOffsets = offsets, newLeft = left) => { width = newWidth; offsets = newOffsets; left = newLeft; },
    };
}

for (const tableClass of ['ranking-badge-effects', 'homepage-ranking-table', 'contest-scoreboard-table ranking-badge-effects']) {
    describe(`continuous table coordinates: ${tableClass}`, () => {
        it('shares the exact fractional row width and offsets without changing table cells or result colors', () => {
            const h = setup(tableClass);
            measureRankingRowEffects(h.doc);
            assert.equal(h.row.style.getPropertyValue('--badge-row-width'), '701.75px');
            assert.deepEqual([...h.row.cells].map((cell) => cell.style.getPropertyValue('--badge-cell-x')), ['0px', '-55.25px', '-318.5px', '-424.75px']);
            assert(h.row.hasAttribute('data-ranking-effect-ready'));
            assert.equal(h.row.cells.length, 4);
            assert.equal(h.doc.querySelectorAll('td').length, 4);
            assert.equal(h.row.cells[2].style.background, 'rgb(220, 252, 231)');
            h.win.close();
        });
    });
}

describe('table coordinate lifecycle', () => {
    it('updates automatic columns even when the total table width stays fixed, and coalesces observations', async () => {
        const h = setup();
        const stop = installRankingRowEffects(h.doc, h.win);
        assert.equal(h.observed.size, 6, 'table, row, and all four cells are observed');
        h.geometry(701.75, [0, 66, 352, 480]);
        h.resize(); h.resize(); h.resize();
        assert.equal(h.frames.size, 1);
        await h.flush();
        assert.equal(h.row.cells[1].style.getPropertyValue('--badge-cell-x'), '-66px');
        assert.equal(h.row.cells[3].style.getPropertyValue('--badge-cell-x'), '-480px');
        assert.equal(h.frames.size, 0, 'own style writes do not schedule a mutation loop');
        stop(); h.win.close();
    });

    it('handles narrow viewports and hidden filter rows without replacing their saved background coordinates', async () => {
        const h = setup();
        const stop = installRankingRowEffects(h.doc, h.win);
        h.geometry(0, [0, 0, 0, 0]);
        h.resize(); await h.flush();
        assert.equal(h.row.style.getPropertyValue('--badge-row-width'), '701.75px');
        h.geometry(320, [0, 40, 210, 272]);
        h.win.dispatchEvent(new h.win.Event('resize'));
        await h.flush();
        assert.equal(h.row.style.getPropertyValue('--badge-row-width'), '320px');
        assert.equal(h.row.cells[3].style.getPropertyValue('--badge-cell-x'), '-272px');
        stop(); h.win.close();
    });

    it('registers PJAX replacement rows and releases removed cells', async () => {
        const h = setup();
        const stop = installRankingRowEffects(h.doc, h.win);
        const oldCells = [...h.row.cells];
        const fresh = h.row.cloneNode(true);
        fresh.removeAttribute('data-ranking-effect-ready');
        fresh.getBoundingClientRect = () => ({ left: 0, width: 480 });
        [...fresh.cells].forEach((cell, index) => { cell.getBoundingClientRect = () => ({ left: index * 120 }); });
        h.row.replaceWith(fresh);
        await h.flush();
        assert.equal(fresh.style.getPropertyValue('--badge-row-width'), '480px');
        assert.equal(fresh.cells[3].style.getPropertyValue('--badge-cell-x'), '-360px');
        assert(fresh.hasAttribute('data-ranking-effect-ready'));
        oldCells.forEach((cell) => assert(!h.observed.has(cell)));
        assert(h.observed.has(fresh.cells[3]));
        stop(); h.win.close();
    });

    it('ignores unrelated editor DOM, text, and class updates on a page without rankings', async () => {
        const h = setup();
        h.doc.body.innerHTML = '<main class="scratchpad"><span class="view-line">code</span></main>';
        const stop = installRankingRowEffects(h.doc, h.win);
        let queries = 0;
        const query = h.doc.querySelectorAll.bind(h.doc);
        h.doc.querySelectorAll = (...args) => { queries++; return query(...args); };
        const line = h.doc.querySelector('span');
        line.classList.add('active-line');
        line.firstChild.textContent = 'print(42)';
        const glyphs = h.doc.createElement('span');
        glyphs.innerHTML = '<span>another line</span><span>more code</span>';
        h.doc.querySelector('main').append(glyphs);
        await h.flush();
        assert.equal(h.frames.size, 0);
        assert.equal(queries, 0, 'Monaco changes never schedule a document-wide ranking lookup');

        const inserted = h.doc.createElement('section');
        inserted.innerHTML = '<table class="homepage-ranking-table"><tbody><tr class="ranking-row--badge"><td>new student</td></tr></tbody></table>';
        const fresh = inserted.querySelector('tr');
        fresh.getBoundingClientRect = () => ({ left: 0, width: 240 });
        fresh.cells[0].getBoundingClientRect = () => ({ left: 0 });
        h.doc.body.append(inserted);
        await h.flush();
        assert.equal(queries, 1, 'a newly inserted PJAX ranking requires one lookup');
        assert.equal(fresh.style.getPropertyValue('--badge-row-width'), '240px');
        stop(); h.win.close();
    });

    it('ignores unrelated DOM updates even while a ranking is present', async () => {
        const h = setup();
        const stop = installRankingRowEffects(h.doc, h.win);
        const editor = h.doc.createElement('main');
        editor.innerHTML = '<span>code</span>';
        h.doc.body.append(editor);
        await h.flush();
        editor.classList.add('monaco-editor');
        editor.firstChild.firstChild.textContent = 'changed code';
        await h.flush();
        assert.equal(h.frames.size, 0);
        h.row.cells[1].textContent = 'changed student';
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(h.frames.size, 1, 'relevant ranking changes still schedule a measurement');
        await h.flush();
        stop(); h.win.close();
    });

    it('joins restored and replaced cells to the existing row animation without restarting neighbours', async () => {
        const h = setup('homepage-ranking-table');
        let now = 1000;
        Object.defineProperty(h.doc, 'timeline', { value: { get currentTime() { return now; } } });
        function animation() {
            let startTime = null;
            return {
                animationName: 'homepage-ranking-row-flow', writes: 0,
                get startTime() { return startTime; },
                set startTime(value) { startTime = value; this.writes++; },
            };
        }
        const effects = [...h.row.cells].map(() => animation());
        [...h.row.cells].forEach((cell, i) => { cell.getAnimations = () => [effects[i]]; });
        const stop = installRankingRowEffects(h.doc, h.win);
        effects.forEach((effect) => assert.equal(effect.startTime, 1000));
        h.row.cells[3].getAnimations = () => []; // mobile hides the bio column
        now = 3600;
        h.resize(); await h.flush();
        effects.slice(0, 3).forEach((effect) => assert.equal(effect.writes, 1, 'running cells do not restart'));
        const restored = animation();
        h.row.cells[3].getAnimations = () => [restored];
        now = 7200;
        h.resize(); await h.flush();
        assert.equal(restored.startTime, 1000, 'restored CSS animation shares the original sweep phase');
        effects.slice(0, 3).forEach((effect) => assert.equal(effect.writes, 1));
        const replacement = h.doc.createElement('td');
        replacement.textContent = 'updated result';
        replacement.getBoundingClientRect = () => ({ left: 340 });
        const inserted = animation();
        replacement.getAnimations = () => [inserted];
        h.row.cells[2].replaceWith(replacement);
        now = 10000;
        await h.flush();
        assert.equal(inserted.startTime, 1000, 'a single replaced cell joins its neighbours');
        assert.equal(effects[0].writes, 1);
        stop(); h.win.close();
    });

    it('stops resize and mutation updates on disposal', async () => {
        const h = setup();
        const stop = installRankingRowEffects(h.doc, h.win);
        h.resize();
        stop();
        assert.equal(h.frames.size, 0);
        assert.equal(h.observed.size, 0);
        h.win.dispatchEvent(new h.win.Event('resize'));
        h.doc.body.append(h.doc.createElement('p'));
        await h.flush();
        assert.equal(h.frames.size, 0);
        h.win.close();
    });
});

it('uses measured row-sized gradients and the same cell offsets at both ends of the sweep, without table pseudo positioning', () => {
    for (const name of ['partials/ranking_badge_effects.html', 'partials/homepage/ranking.html']) {
        const template = fs.readFileSync(path.join(root, 'packages/ui-default/templates', name), 'utf8');
        assert.match(template, /\[data-ranking-effect-ready\] td:not\(\[data-scoreboard-cell-style\]\)/);
        assert.match(template, /background-origin:\s*border-box;/);
        assert.match(template, /background-size:\s*var\(--badge-sweep-period\) 100%, calc\(var\(--badge-row-width\) \* 1\.8\) 100%, var\(--badge-row-width\) 100%, calc\(var\(--badge-row-width\) \* 3\) 100%/);
        assert.match(template, /background-position:\s*calc\(var\(--badge-sweep-start\) \+ var\(--badge-cell-x\)\) 50%, var\(--badge-cell-x\) 50%, var\(--badge-cell-x\) 0, var\(--badge-cell-x\) 50%/);
        assert.match(template, /background-position:\s*var\(--badge-cell-x\) 50%, var\(--badge-cell-x\) 50%, var\(--badge-cell-x\) 0, var\(--badge-cell-x\) 50%/);
        assert.match(template, /\[data-ranking-effect-ready\]:nth-child\(2n\) td/);
        assert.match(template, /\[data-ranking-effect-ready\]:nth-child\(3n\) td/);
        assert.doesNotMatch(template, /tr\.ranking-row--badge::before/);
    }
});
