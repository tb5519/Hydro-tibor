const assert = require('node:assert/strict');
const { it } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const source = transformSync(fs.readFileSync(require('node:path').join(__dirname, '../packages/ui-default/components/voice_call/position.ts'), 'utf8'), {
    loader: 'ts', format: 'iife', globalName: 'VoicePosition',
}).code;
const context = vm.createContext({}); vm.runInContext(source, context);
const place = context.VoicePosition.voicePosition;
function clear(box, obstacle) {
    return box.left + box.width <= obstacle.left || box.left >= obstacle.left + obstacle.width
        || box.top + box.height <= obstacle.top || box.top >= obstacle.top + obstacle.height;
}
it('voice avoids the actual default assistant and open menu without leaving the viewport', () => {
    const view = { left: 0, top: 0, width: 1360, height: 900 }; const size = { width: 310, height: 130 };
    const toggle = { left: 1260, top: 760, width: 88, height: 44 };
    const menu = { left: 1060, top: 400, width: 288, height: 348 };
    for (const obstacles of [[toggle], [toggle, menu]]) {
        const position = place(view, size, obstacles);
        const box = { ...position, ...size };
        assert.ok(obstacles.every((obstacle) => clear(box, obstacle)));
        assert.ok(box.left >= 24 && box.top >= 24 && box.left + box.width <= 1336 && box.top + box.height <= 876);
        assert.deepEqual(place(view, size, obstacles), position, 'same obstacles do not cause oscillating placement');
    }
});
it('voice finds clear space around a moved assistant on mobile and returns to its default after closure', () => {
    const view = { left: 0, top: 0, width: 375, height: 667 }; const size = { width: 310, height: 130 };
    const obstacle = { left: 260, top: 490, width: 88, height: 44 };
    const moved = { ...place(view, size, [obstacle], 16), ...size };
    assert.ok(clear(moved, obstacle)); assert.ok(moved.top >= 16 && moved.left >= 16);
    const free = place(view, size, [], 16);
    assert.equal(free.left, 49); assert.equal(free.top, 521);
});
