const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const code = transformSync(fs.readFileSync(path.join(__dirname, '../build/scratch/player-activity.js'), 'utf8'), {
    format: 'cjs', loader: 'js',
}).code;

function harness() {
    const sent = [];
    const listeners = new Map();
    let now = 0;
    let allowed = false;
    const removed = [];
    const module = { exports: {} };
    const env = {
        performance: { now: () => now },
        document: {
            addEventListener(name, listener, options) {
                assert.equal(options.capture, true);
                assert.equal(options.passive, true);
                listeners.set(name, listener);
            },
            removeEventListener(name, listener, options) {
                assert.equal(options.capture, true);
                assert.equal(listeners.get(name), listener);
                listeners.delete(name);
                removed.push(name);
            },
        },
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener(name, listener) {
            assert.equal(listeners.get(name), listener);
            listeners.delete(name);
            removed.push(name);
        },
    };
    vm.runInNewContext(code, { module, exports: module.exports });
    const bridge = module.exports.createPlayerActivityBridge(() => allowed, (...args) => sent.push(args), env);
    return { sent, listeners, removed, bridge,
        allow(value = true) { allowed = value; },
        advance(ms) { now += ms; },
        emit(name, data = { isTrusted: true }) { listeners.get(name)?.(data); },
    };
}

describe('isolated player user activity', () => {
    it('reports only trusted keyboard, mouse, pointer, touch and wheel input without disclosing its contents', () => {
        const h = harness();
        h.allow();
        const events = ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup',
            'mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'wheel'];
        for (const name of events) {
            h.emit(name, { isTrusted: false, key: 'secret' });
            h.emit(name, { key: 'secret' });
        }
        assert.equal(h.sent.length, 0);
        for (const name of events) {
            h.emit(name, { isTrusted: true, key: 'secret', clientX: 123, clientY: 456 });
            h.advance(500);
        }
        assert.deepEqual(h.sent, events.map(() => ['userActivity']));
    });

    it('does not report activity while the player is not initialized and loaded, nor consume its first reporting slot', () => {
        const h = harness();
        h.emit('pointerdown');
        h.allow();
        h.emit('pointerdown');
        assert.deepEqual(h.sent, [['userActivity']]);
        h.allow(false);
        h.advance(1000);
        h.emit('keydown');
        assert.equal(h.sent.length, 1);
    });

    it('throttles compatibility events using monotonic time and resumes immediately after inactivity', () => {
        const h = harness();
        h.allow();
        h.emit('pointerdown');
        h.emit('mousedown');
        h.advance(499);
        h.emit('mousemove');
        assert.equal(h.sent.length, 1);
        h.advance(1);
        h.emit('mousemove');
        assert.equal(h.sent.length, 2);
        h.advance(61000);
        h.emit('keydown');
        assert.equal(h.sent.length, 3);
    });

    it('does not treat VM activity, focus, load or visibility changes as human input', () => {
        const h = harness();
        h.allow();
        for (const name of ['PROJECT_RUN_START', 'PROJECT_CHANGED', 'focus', 'visibilitychange', 'load', 'message']) {
            assert.equal(h.listeners.has(name), false);
            h.emit(name);
        }
        assert.deepEqual(h.sent, []);
    });

    it('removes all listeners on page exit or disposal, including already retained event callbacks', () => {
        for (const pageExit of [false, true]) {
            const h = harness();
            h.allow();
            const staleListener = h.listeners.get('keydown');
            const count = h.listeners.size;
            if (pageExit) h.emit('pagehide', { persisted: true });
            else h.bridge.dispose();
            h.bridge.dispose();
            assert.equal(h.listeners.size, 0);
            assert.equal(h.removed.length, count);
            staleListener({ isTrusted: true });
            assert.deepEqual(h.sent, []);
        }
    });
});
