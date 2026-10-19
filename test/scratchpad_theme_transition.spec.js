const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const source = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/components/scratchpad/themeTransition.ts')],
    bundle: true, write: false, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const tick = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

function harness({ reduced = false, hidden = false, supported = true, visible = true } = {}) {
    const dom = new JSDOM(`<div id="scratchpad">
        <div class="scratchpad__tablist"><button>题目</button></div>
        <div class="scratchpad__coding-area"><textarea>saved code</textarea><button>运行自测</button></div>
    </div>`, { pretendToBeVisual: true });
    const { window } = dom;
    const { document } = window;
    Object.defineProperty(document, 'hidden', { value: hidden });
    Object.defineProperty(document, 'timeline', { value: { currentTime: 1234 } });
    window.matchMedia = () => ({ matches: reduced });
    const animations = [];
    const timers = new Map();
    const frames = new Map();
    let nextId = 0;
    let flushes = 0;
    window.requestAnimationFrame = (callback) => { nextId += 1; frames.set(nextId, callback); return nextId; };
    window.cancelAnimationFrame = (id) => frames.delete(id);
    const surfaces = [...document.querySelectorAll('.scratchpad__coding-area, .scratchpad__tablist')];
    for (const surface of surfaces) {
        surface.getClientRects = () => (visible ? [{ width: 640, height: 480 }] : []);
        if (!supported) continue;
        surface.animate = (keyframes, options) => {
            let finish;
            let reject;
            const finished = new Promise((resolve, rejectPromise) => { finish = resolve; reject = rejectPromise; });
            const animation = {
                surface, keyframes, options, finished, finish, cancelled: false, cancelCount: 0,
                cancel() { this.cancelled = true; this.cancelCount += 1; reject(new Error('cancelled')); },
            };
            animations.push(animation);
            return animation;
        };
    }
    const mod = { exports: {} };
    vm.runInNewContext(source, {
        require(name) {
            if (name === 'react-dom') return { flushSync(callback) { flushes += 1; callback(); } };
            return require(name);
        },
        module: mod, exports: mod.exports, window, document,
        setTimeout(callback, delay) { nextId += 1; timers.set(nextId, { callback, delay }); return nextId; },
        clearTimeout(id) { timers.delete(id); },
    });
    return {
        transition: mod.exports.transitionScratchpadTheme, document, window, surfaces, animations, timers, frames,
        get flushes() { return flushes; },
        async finish(group) { for (const animation of group) animation.finish(); await tick(); },
        async frame() {
            const callbacks = [...frames.values()];
            frames.clear();
            for (const callback of callbacks) callback(1234);
            await tick();
        },
        async timeOut() {
            const callbacks = [...timers.values()];
            timers.clear();
            for (const { callback } of callbacks) callback();
            await tick();
        },
        close() { dom.window.close(); },
    };
}

describe('coordinated scratchpad theme transition', () => {
    it('hides every old surface before a single commit, then reveals the prepared theme together without replacing editor state', async () => {
        const h = harness();
        const textarea = h.document.querySelector('textarea');
        const button = h.document.querySelector('.scratchpad__coding-area button');
        textarea.value = 'print("unsaved draft")';
        textarea.focus();
        textarea.setSelectionRange(2, 8);
        let clicks = 0;
        let commits = 0;
        button.addEventListener('click', () => { clicks += 1; });
        try {
            const result = h.transition(() => {
                commits += 1;
                assert.equal(h.animations.length, 2);
                assert.ok(h.animations.every((animation) => !animation.cancelled));
                h.document.querySelector('.scratchpad__coding-area').dataset.theme = 'new-theme';
            }, () => true);
            const outgoing = h.animations.slice();
            assert.equal(commits, 0);
            assert.equal(outgoing.length, 2);
            for (const animation of outgoing) {
                assert.deepEqual(JSON.parse(JSON.stringify(animation.keyframes)), [{ opacity: 1 }, { opacity: 0 }]);
                assert.equal(animation.options.duration, 110);
                assert.equal(animation.options.fill, 'both');
                assert.equal(animation.startTime, 1234);
            }
            await h.finish([outgoing[0]]);
            assert.equal(commits, 0, 'the faster surface must not reveal the new theme on its own');
            await h.finish([outgoing[1]]);
            assert.equal(commits, 1);
            assert.equal(h.flushes, 1);
            assert.equal(h.animations.length, 2, 'hold the new theme hidden until its next frame');
            await h.frame();
            const incoming = h.animations.slice(2);
            assert.equal(incoming.length, 2);
            for (const animation of incoming) {
                assert.deepEqual(JSON.parse(JSON.stringify(animation.keyframes)), [{ opacity: 0 }, { opacity: 1 }]);
                assert.equal(animation.options.duration, 220);
                assert.equal(animation.startTime, 1234);
            }
            await h.finish(incoming);
            assert.equal(await result, true);
            assert.ok(h.animations.every((animation) => animation.cancelled));
            assert.strictEqual(h.document.querySelector('textarea'), textarea);
            assert.strictEqual(h.document.activeElement, textarea);
            assert.equal(textarea.value, 'print("unsaved draft")');
            assert.equal(textarea.selectionStart, 2);
            assert.equal(textarea.selectionEnd, 8);
            button.click();
            assert.equal(clicks, 1);
            assert.ok(h.surfaces.every((surface) => !surface.hasAttribute('style')));
            assert.equal(h.timers.size, 0);
            assert.equal(h.frames.size, 0);
        } finally { h.close(); }
    });

    it('cancels a superseded theme before commit and never lets its cleanup cancel the new transition', async () => {
        const h = harness();
        let revision = 1;
        const commits = [];
        try {
            const old = h.transition(() => commits.push('old'), () => revision === 1);
            const oldAnimations = h.animations.slice();
            revision = 2;
            const latest = h.transition(() => commits.push('latest'), () => revision === 2);
            const latestOutgoing = h.animations.slice(2);
            assert.ok(oldAnimations.every((animation) => animation.cancelled));
            assert.equal(await old, false);
            assert.ok(latestOutgoing.every((animation) => !animation.cancelled));
            await h.finish(oldAnimations);
            assert.deepEqual(commits, []);
            await h.finish(latestOutgoing);
            assert.deepEqual(commits, ['latest']);
            await h.frame();
            await h.finish(h.animations.slice(4));
            assert.equal(await latest, true);
            assert.equal(h.timers.size, 0);
        } finally { h.close(); }
    });

    it('allows a new choice during the reveal while preserving the newer animation and final theme', async () => {
        const h = harness();
        let revision = 1;
        const commits = [];
        try {
            const first = h.transition(() => commits.push(1), () => revision === 1);
            await h.finish(h.animations.slice());
            await h.frame();
            revision = 2;
            const second = h.transition(() => commits.push(2), () => revision === 2);
            const secondOutgoing = h.animations.slice(4);
            assert.equal(await first, true, 'the first theme was already committed before the next choice');
            assert.ok(secondOutgoing.every((animation) => !animation.cancelled));
            await h.finish(secondOutgoing);
            await h.frame();
            await h.finish(h.animations.slice(6));
            assert.equal(await second, true);
            assert.deepEqual(commits, [1, 2]);
        } finally { h.close(); }
    });

    it('does not commit an invalidated request and restores the original surface opacity', async () => {
        const h = harness();
        let current = true;
        let commits = 0;
        try {
            const result = h.transition(() => { commits += 1; }, () => current);
            current = false;
            await h.finish(h.animations.slice());
            assert.equal(await result, false);
            assert.equal(commits, 0);
            assert.ok(h.animations.every((animation) => animation.cancelled));
            assert.ok(h.surfaces.every((surface) => surface.style.opacity === ''));
            assert.equal(h.frames.size, 0);
        } finally { h.close(); }
    });

    for (const [name, setup, options] of [
        ['reduced motion', { reduced: true }],
        ['hidden documents', { hidden: true }],
        ['unsupported Web Animations', { supported: false }],
        ['invisible editor surfaces', { visible: false }],
        ['immediate expiry/revocation', {}, { immediate: true }],
    ]) {
        it(`commits synchronously for ${name}`, async () => {
            const h = harness(setup);
            let commits = 0;
            try {
                const result = h.transition(() => { commits += 1; }, () => true, options);
                assert.equal(commits, 1);
                assert.equal(h.animations.length, 0);
                assert.equal(await result, true);
            } finally { h.close(); }
        });
    }

    it('commits synchronously when the scratchpad is not mounted and skips stale immediate choices', async () => {
        const h = harness();
        let commits = 0;
        try {
            h.document.getElementById('scratchpad').remove();
            const result = h.transition(() => { commits += 1; }, () => true);
            assert.equal(commits, 1);
            assert.equal(await result, true);
            assert.equal(await h.transition(() => { commits += 1; }, () => false), false);
            assert.equal(commits, 1);
        } finally { h.close(); }
    });

    it('bounds waits when animation completion or the next frame is suspended', async () => {
        const h = harness();
        let commits = 0;
        try {
            const result = h.transition(() => { commits += 1; }, () => true);
            assert.equal(commits, 0);
            await h.timeOut();
            assert.equal(commits, 1);
            await h.timeOut();
            assert.equal(h.animations.length, 4);
            await h.timeOut();
            assert.equal(await result, true);
            assert.equal(h.timers.size, 0);
            assert.equal(h.frames.size, 0);
            assert.ok(h.animations.every((animation) => animation.cancelled));
        } finally { h.close(); }
    });

    it('falls back to a single commit and cleans up a partially supported animation API', async () => {
        const h = harness();
        let commits = 0;
        try {
            h.surfaces[1].animate = () => { throw new Error('unsupported animation'); };
            const result = h.transition(() => { commits += 1; }, () => true);
            assert.equal(commits, 1);
            assert.equal(await result, true);
            await tick();
            assert.equal(h.animations.length, 1);
            assert.equal(h.animations[0].cancelled, true);
            assert.equal(h.timers.size, 0);
        } finally { h.close(); }
    });

    it('cleans up every animation when the theme commit throws', async () => {
        const h = harness();
        const error = new Error('theme commit failed');
        try {
            const result = h.transition(() => { throw error; }, () => true);
            const rejected = assert.rejects(result, error);
            await h.finish(h.animations.slice());
            await rejected;
            assert.ok(h.animations.every((animation) => animation.cancelled));
            assert.equal(h.timers.size, 0);
            assert.equal(h.frames.size, 0);
        } finally { h.close(); }
    });
});
