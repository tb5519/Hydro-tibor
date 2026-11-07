const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/components/live_share/annotation.ts'), 'utf8');
const moduleObject = { exports: {} };
vm.runInNewContext(transformSync(`${source}\nexport { selectionOutline };`, { loader: 'ts', format: 'cjs' }).code,
    { module: moduleObject, exports: moduleObject.exports, require: (name) => {
        assert.equal(name, './annotation_arrow', 'geometry tests isolate only the unused arrow helper');
        return { placeAnnotationArrow() { throw new Error('Outline tests must not draw arrows'); } };
    } });
const outline = moduleObject.exports.selectionOutline;

function polygon(lines) {
    const d = outline(lines);
    assert.equal((d.match(/M/g) || []).length, 1, 'one selected region has a single outside contour');
    assert.equal((d.match(/Z/g) || []).length, 1, 'the outside contour closes exactly once');
    return d.slice(2, -2).split(' L ').map((part) => part.trim().split(/\s+/).map(Number));
}

function crossings(points, y) {
    const xs = [];
    points.forEach((a, index) => {
        const b = points[(index + 1) % points.length];
        if ((a[1] <= y && y < b[1]) || (b[1] <= y && y < a[1])) {
            xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
        }
    });
    return xs.sort((a, b) => a - b);
}

function assertOutsideOnly(lines) {
    const points = polygon(lines);
    const levels = [...new Set(lines.flatMap((line) => [line.y - 3, line.y + line.height + 3]))].sort((a, b) => a - b);
    for (let index = 1; index < levels.length; index++) {
        const y = (levels[index - 1] + levels[index]) / 2;
        const selected = lines.filter((line) => line.y - 3 < y && line.y + line.height + 3 > y);
        const edges = crossings(points, y);
        assert.equal(edges.length, 2, `only two outside edges at y=${y}; internal seams or folded corridors are forbidden`);
        if (selected.length) {
            assert.equal(edges[0], Math.min(...selected.map((line) => line.x - 4)));
            assert.equal(edges[1], Math.max(...selected.map((line) => line.x + line.width + 4)));
        }
    }
    // Every edge must be on the outside: a hairpin/retraced seam has interior
    // on both sides (or no interior on either side), unlike a real boundary.
    const inside = (x, y) => {
        const edges = crossings(points, y);
        return edges.filter((edge) => edge > x).length % 2 === 1;
    };
    points.forEach((a, index) => {
        const b = points[(index + 1) % points.length];
        const dx = b[0] - a[0]; const dy = b[1] - a[1]; const length = Math.hypot(dx, dy);
        assert(length > 0, 'there are no zero-length contour edges');
        const x = (a[0] + b[0]) / 2; const y = (a[1] + b[1]) / 2;
        const nx = -dy / length * .001; const ny = dx / length * .001;
        assert.notEqual(inside(x + nx, y + ny), inside(x - nx, y - ny),
            `edge ${a} -> ${b} must separate inside from outside, not cut through the selected region`);
    });
    return points;
}

it('selected bullet rows with padded inline code have no internal seams when their padded line boxes overlap', () => {
    assertOutsideOnly([
        { x: 190, y: 250, width: 280, height: 43 },
        { x: 202, y: 294, width: 182, height: 44 },
        { x: 401, y: 294, width: 276, height: 44 },
        { x: 202, y: 337, width: 26, height: 43 },
        { x: 246, y: 337, width: 232, height: 43 },
    ]);
});

it('list fragments and a following heading form one broad block without the long return corridor', () => {
    const points = assertOutsideOnly([
        { x: 160, y: 270, width: 100, height: 56 },
        { x: 202, y: 337, width: 946, height: 43 },
        { x: 202, y: 383, width: 522, height: 43 },
        { x: 202, y: 431, width: 920, height: 43 },
        { x: 1137, y: 431, width: 42, height: 43 },
        { x: 160, y: 550, width: 204, height: 58 },
    ]);
    const gapY = (477 + 547) / 2;
    const edges = crossings(points, gapY);
    assert(edges[0] < 190 && edges[1] > 700, 'the paragraph gap follows a broad diagonal bridge, not a thin elbow');
});

it('short final lines keep their own ends and clipping bounds while paragraph whitespace is connected', () => {
    const points = assertOutsideOnly([
        { x: 85, y: 100, width: 650, height: 24 },
        { x: 85, y: 140, width: 250, height: 24 },
        { x: 110, y: 190, width: 180, height: 24 },
    ]);
    assert.deepEqual(crossings(points, 152), [81, 339]);
    assert.deepEqual(crossings(points, 202), [106, 294]);
});

it('fractional mixed-font rows remain a single outside silhouette across overlap and gaps', () => {
    let seed = 7031;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let sample = 0; sample < 70; sample++) {
        let y = 0;
        const lines = Array.from({ length: 8 }, () => {
            y += 15 + random() * 35;
            return { x: 100 + random() * 90, y, width: 20 + random() * 800, height: 16 + random() * 25 };
        });
        assertOutsideOnly(lines);
    }
});
