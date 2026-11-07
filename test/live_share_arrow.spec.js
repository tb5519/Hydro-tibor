const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

const moduleValue = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname,
    '../packages/ui-default/components/live_share/annotation_arrow.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code,
{ module: moduleValue, exports: moduleValue.exports });
const { placeAnnotationArrow } = moduleValue.exports;

function safe(arrow, lines, width, height) {
    assert(arrow && /^M .+ Z$/.test(arrow.d));
    assert(!/NaN|Infinity/.test(arrow.d));
    const b = arrow.bounds;
    assert(b.left >= 2 && b.top >= 2 && b.right <= width - 2 && b.bottom <= height - 2,
        'the whole arrow, including its shadow, fits inside the visible pane');
    const focus = { left: Math.min(...lines.map((line) => line.x)) - 6,
        right: Math.max(...lines.map((line) => line.x + line.width)) + 6,
        top: Math.min(...lines.map((line) => line.y)) - 5,
        bottom: Math.max(...lines.map((line) => line.y + line.height)) + 5 };
    assert(b.right <= focus.left || b.left >= focus.right || b.bottom <= focus.top || b.top >= focus.bottom,
        'the arrow cannot cover any selected text or the space inside its merged outline');
}

it('a selection against the editor top moves the arrow outside the entire multiline block', () => {
    const lines = [{ x: 145, y: 29, width: 240, height: 28 }, { x: 70, y: 58, width: 150, height: 28 },
        { x: 70, y: 116, width: 190, height: 28 }, { x: 70, y: 145, width: 15, height: 28 }];
    safe(placeAnnotationArrow(lines, 550, 400), lines, 550, 400);
});

it('picks a clear side at all viewport edges while preserving a large arrow when space exists', () => {
    for (const rect of [{ x: 0, y: 0, width: 280, height: 150 }, { x: 320, y: 0, width: 280, height: 150 },
        { x: 0, y: 250, width: 280, height: 150 }, { x: 320, y: 250, width: 280, height: 150 },
        { x: 0, y: 120, width: 600, height: 100 }, { x: 220, y: 0, width: 120, height: 400 }]) {
        const arrow = placeAnnotationArrow([rect], 600, 400);
        safe(arrow, [rect], 600, 400);
        assert(Math.max(arrow.bounds.right - arrow.bounds.left, arrow.bounds.bottom - arrow.bounds.top) > 65,
            'do not shrink to a tiny icon when a different exterior side has enough room');
    }
});

it('shrinks only in narrow margins and hides instead of covering a viewport-filling selection', () => {
    const line = { x: 0, y: 0, width: 260, height: 200 };
    safe(placeAnnotationArrow([line], 300, 200), [line], 300, 200);
    assert.equal(placeAnnotationArrow([{ x: 0, y: 0, width: 300, height: 200 }], 300, 200), null);
});

it('never intersects selected regions over fractional responsive viewport layouts', () => {
    let visible = 0;
    for (let index = 1; index <= 150; index++) {
        const width = 210 + (index * 73 % 900); const height = 150 + (index * 31 % 600);
        const x = (index * 17 % Math.floor(width * .5)) + .25;
        const y = (index * 13 % Math.floor(height * .5)) + .5;
        const lines = [{ x, y, width: Math.max(5, width * .4), height: 24.5 },
            { x: Math.max(0, x - 17), y: y + 25, width: Math.max(5, width * .2), height: 24.5 }];
        const arrow = placeAnnotationArrow(lines, width, height);
        if (arrow) { visible++; safe(arrow, lines, width, height); }
    }
    assert(visible >= 145, 'normal responsive selections keep a visible arrow');
});
