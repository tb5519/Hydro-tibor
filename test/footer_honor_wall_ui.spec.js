const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');
const nunjucks = require('nunjucks');
const postcss = require('postcss');
const stylus = require('stylus');

// Run the actual component, not a test-only rendering implementation. Browser
// checks additionally cover the real footer template, stylesheet, and layout.
const source = esbuild.buildSync({
    entryPoints: [path.join(__dirname, '../packages/ui-default/components/footer/honor-wall.ts')],
    bundle: true, write: false, format: 'iife', globalName: 'HonorWall', platform: 'browser', target: 'es2020',
}).outputFiles[0].text;

const student = (uid, overrides = {}) => ({
    uid, displayName: `学员 ${uid}`, avatar: `/avatar/${uid}.png`, href: `/user/${uid}`, ...overrides,
});
const badge = (id, overrides = {}) => ({
    id, name: `荣誉勋章 ${id}`, acImage: `/badge/${id}/ac.png`, badgeHref: `/badge/${id}`,
    backgroundColor: '#302365', fontColor: '#fff5bc', students: [student(id)], ...overrides,
});

function fixture({ observer = true, reducedMotion = false, viewportWidth = 1200, imageDecode = 'auto' } = {}) {
    const dom = new JSDOM('<!doctype html><body><section data-honor-wall data-honor-wall-url="/honor-wall">'
        + '<span data-honor-wall-count></span><p data-honor-wall-status role="status">等待展示荣誉</p>'
        + '<button data-honor-wall-motion hidden>暂停动画</button>'
        + '<button data-honor-wall-retry hidden>重新加载</button>'
        + '<div class="honor-wall__viewport" data-honor-wall-viewport><div data-honor-wall-grid></div></div></section></body>',
    { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;
    const requests = [];
    const observers = [];
    const resizeObservers = [];
    const intervals = new Map();
    const frames = new Map();
    const motionListeners = new Set();
    const decodes = [];
    const imageTimeouts = new Map();
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => {
        const id = nativeSetTimeout(callback, delay, ...args);
        if (delay === 10000) imageTimeouts.set(id, callback);
        return id;
    };
    window.clearTimeout = (id) => {
        imageTimeouts.delete(id);
        nativeClearTimeout(id);
    };
    if (imageDecode !== 'unsupported') {
        window.HTMLImageElement.prototype.decode = function decode() {
            if (imageDecode === 'auto') return Promise.resolve();
            return new Promise((resolve, reject) => decodes.push({ image: this, resolve, reject }));
        };
    }
    let intervalId = 0;
    let frameId = 0;
    let frameTime = 0;
    let width = viewportWidth;
    window.requestAnimationFrame = (callback) => {
        frameId += 1;
        frames.set(frameId, callback);
        return frameId;
    };
    window.cancelAnimationFrame = (id) => frames.delete(id);
    window.performance.now = () => frameTime;
    window.ResizeObserver = class {
        constructor(callback) {
            this.callback = callback;
            this.disconnected = false;
            resizeObservers.push(this);
        }

        observe(node) { this.node = node; }
        disconnect() { this.disconnected = true; }
    };
    const isCard = (node) => node.hasAttribute('data-honor-wall-badge');
    const cardWidth = () => width / 6;
    const translate = (node) => {
        const transform = node.style.transform || '';
        return Number(transform.match(/translate(?:3d|X)?\(\s*(-?[\d.]+)/)?.[1] || 0);
    };
    Object.defineProperties(window.HTMLElement.prototype, {
        clientWidth: { configurable: true, get() { return isCard(this) ? cardWidth() : width; } },
        offsetWidth: { configurable: true, get() { return isCard(this) ? cardWidth() : width; } },
        offsetLeft: { configurable: true, get() { return isCard(this) ? [...this.parentElement.children].indexOf(this) * cardWidth() : 0; } },
        scrollWidth: { configurable: true, get() {
            const grid = this.matches('[data-honor-wall-grid]') ? this : this.querySelector('[data-honor-wall-grid]');
            return grid ? Math.max(width, grid.children.length * cardWidth()) : width;
        } },
    });
    window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
        const grid = this.closest('[data-honor-wall-grid]');
        const viewport = this.parentElement?.closest('[data-honor-wall-viewport]');
        const left = (isCard(this) ? this.offsetLeft : 0) + (grid ? translate(grid) : 0) - (viewport?.scrollLeft || 0);
        const rectWidth = isCard(this) ? cardWidth() : width;
        return { x: left, y: 0, left, right: left + rectWidth, top: 0, bottom: 300, width: rectWidth, height: 300 };
    };
    window.HTMLElement.prototype.scrollTo = function scrollTo(options) { this.scrollLeft = options.left || 0; };
    window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
        const viewport = this.closest('[data-honor-wall-viewport]');
        const card = this.closest('[data-honor-wall-badge]');
        if (!viewport || !card) return;
        const rect = card.getBoundingClientRect();
        if (rect.left < 0) viewport.scrollLeft += rect.left;
        else if (rect.right > width) viewport.scrollLeft += rect.right - width;
    };
    window.setInterval = (callback, delay) => {
        intervalId += 1;
        intervals.set(intervalId, { callback, delay });
        return intervalId;
    };
    window.clearInterval = (id) => intervals.delete(id);
    const media = {
        matches: reducedMotion,
        addEventListener: (_type, callback) => motionListeners.add(callback),
        removeEventListener: (_type, callback) => motionListeners.delete(callback),
    };
    window.matchMedia = () => media;
    if (observer) {
        window.IntersectionObserver = class {
            constructor(callback) {
                this.callback = callback;
                this.disconnected = false;
                observers.push(this);
            }

            observe(node) { this.node = node; }
            disconnect() { this.disconnected = true; }
            unobserve() { this.disconnected = true; }
        };
    }
    window.fetch = (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    window.eval(source);
    const get = (selector) => window.document.querySelector(selector);
    const wall = get('[data-honor-wall]');
    const cleanup = window.HonorWall.initHonorWall(wall);
    return {
        window, requests, observers, resizeObservers, wall, cleanup, get, intervals, motionListeners, frames, decodes,
        viewport: get('[data-honor-wall-viewport]'),
        grid: get('[data-honor-wall-grid]'),
        intersect() {
            for (const item of observers) item.callback([{ target: wall, isIntersecting: true, intersectionRatio: 1 }], item);
        },
        expireImages() {
            for (const [id, callback] of [...imageTimeouts]) {
                nativeClearTimeout(id);
                callback();
            }
        },
        tickIntervals() {
            for (const interval of intervals.values()) interval.callback();
        },
        frame(delta = 16) {
            frameTime += delta;
            const callbacks = [...frames.values()];
            frames.clear();
            for (const callback of callbacks) callback(frameTime);
        },
        resize(nextWidth) {
            width = nextWidth;
            for (const item of resizeObservers) {
                if (!item.disconnected) item.callback([{ target: item.node, contentRect: item.node.getBoundingClientRect() }]);
            }
            window.dispatchEvent(new window.Event('resize'));
        },
        setHidden(value) {
            Object.defineProperty(window.document, 'hidden', { configurable: true, value });
            window.document.dispatchEvent(new window.Event('visibilitychange'));
        },
        setReducedMotion(value) {
            media.matches = value;
            for (const callback of motionListeners) callback();
        },
        finish(data, status = 200) { requests.at(-1).resolve({ ok: status >= 200 && status < 300, status, json: async () => data }); },
        dispose() { cleanup(); window.close(); },
    };
}

async function eventually(predicate) {
    for (let attempt = 0; attempt < 30; attempt++) {
        if (predicate()) return;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(predicate(), 'Honor wall did not reach the expected settled state');
}

const trackOffset = (ui) => Number(ui.grid.style.transform.match(/translate(?:3d|X)?\(\s*(-?[\d.]+)/)?.[1] || 0);
const visibleOffset = (ui) => trackOffset(ui) - ui.viewport.scrollLeft;
const cardIds = (ui) => Array.from(ui.grid.children, (card) => Number(card.dataset.honorWallBadge));
const advanceFrames = (ui, milliseconds) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 20) ui.frame(Math.min(20, milliseconds - elapsed));
};

async function loadBadges(ui, count) {
    ui.intersect();
    ui.finish({ badges: Array.from({ length: count }, (_, index) => badge(index + 1)) });
    await eventually(() => ui.grid.children.length === count);
    ui.frame(0);
}

describe('footer honor wall single-row marquee', () => {
    it('does not start a horizontal loop for six or fewer badges', async () => {
        for (const count of [1, 6]) {
            const ui = fixture();
            try {
                // eslint-disable-next-line no-await-in-loop
                await loadBadges(ui, count);
                advanceFrames(ui, 4000);
                assert.equal(trackOffset(ui), 0);
                assert.deepEqual(cardIds(ui), Array.from({ length: count }, (_, index) => index + 1));
                assert.equal(ui.frames.size, 0, 'A static row should not schedule an idle animation loop');
            } finally { ui.dispose(); }
        }
    });

    it('moves more than six badges left slowly at eight pixels per second', async () => {
        const ui = fixture();
        try {
            await loadBadges(ui, 7);
            advanceFrames(ui, 1000);
            assert.ok(Math.abs(trackOffset(ui) + 8) < 0.01, 'One second should move only eight pixels');
            assert.deepEqual(cardIds(ui), [1, 2, 3, 4, 5, 6, 7]);
        } finally { ui.dispose(); }
    });

    it('recycles the same badge elements from the left to the right with no duplicate identities or students', async () => {
        for (const count of [7, 12]) {
            const ui = fixture({ viewportWidth: 60 });
            try {
                // eslint-disable-next-line no-await-in-loop
                await loadBadges(ui, count);
                const originals = Array.from(ui.grid.children);
                const originalStudents = Array.from(ui.grid.querySelectorAll('[data-honor-wall-student]'));
                const leadingBadges = new Set();
                for (let elapsed = 0; elapsed < (count * 10 + 5) / 8 * 1000; elapsed += 20) {
                    ui.frame(20);
                    leadingBadges.add(Number(ui.grid.firstElementChild.dataset.honorWallBadge));
                    assert.equal(ui.grid.children.length, count);
                    assert.ok(trackOffset(ui) <= 0 && trackOffset(ui) > -10.001, 'Recycling should retain less than one card of travel');
                }
                assert.equal(leadingBadges.size, count, 'Every badge must pass through the first position');
                assert.deepEqual(cardIds(ui), Array.from({ length: count }, (_, index) => index + 1));
                assert.ok(originals.every((card) => card.isConnected && ui.grid.contains(card)));
                const currentStudents = Array.from(ui.grid.querySelectorAll('[data-honor-wall-student]'));
                assert.equal(currentStudents.length, count);
                assert.equal(new Set(currentStudents).size, count);
                assert.ok(originalStudents.every((holder) => currentStudents.includes(holder)), 'Recycling must not rebuild or clone profile links');
            } finally { ui.dispose(); }
        }
    });

    it('preserves fractional-pixel remainder at the seamless recycling boundary', async () => {
        const ui = fixture({ viewportWidth: 1201.5 });
        try {
            await loadBadges(ui, 7);
            const firstCard = ui.grid.firstElementChild;
            advanceFrames(ui, 25040);
            assert.equal(ui.grid.lastElementChild, firstCard);
            assert.deepEqual(cardIds(ui), [2, 3, 4, 5, 6, 7, 1]);
            assert.ok(Math.abs(trackOffset(ui) + 0.07) < 0.01, '200.32px travel minus a 200.25px card must retain 0.07px');
        } finally { ui.dispose(); }
    });

    it('pauses horizontal travel on hover, focus, and the shared pause control, then resumes without a jump', async () => {
        const ui = fixture();
        try {
            await loadBadges(ui, 7);
            advanceFrames(ui, 1000);
            const pauseAndCheck = (pause, resume) => {
                pause();
                const before = visibleOffset(ui);
                advanceFrames(ui, 600);
                assert.equal(visibleOffset(ui), before);
                resume();
                ui.frame(20);
                const resumed = visibleOffset(ui);
                assert.ok(Math.abs(resumed - before) <= 0.17, 'Resuming must not accumulate paused elapsed time');
                advanceFrames(ui, 200);
                assert.ok(visibleOffset(ui) < resumed, 'Normal travel must continue after resuming');
            };
            pauseAndCheck(
                () => ui.viewport.dispatchEvent(new ui.window.MouseEvent('mouseenter')),
                () => ui.viewport.dispatchEvent(new ui.window.MouseEvent('mouseleave')),
            );
            const profile = ui.grid.querySelector('[data-honor-wall-student]');
            pauseAndCheck(() => profile.focus(), () => profile.blur());
            const toggle = ui.get('[data-honor-wall-motion]');
            pauseAndCheck(() => toggle.click(), () => toggle.click());
        } finally { ui.dispose(); }
    });

    it('does not accumulate background-tab time or jump after the document becomes visible again', async () => {
        const ui = fixture();
        try {
            await loadBadges(ui, 7);
            advanceFrames(ui, 1000);
            const before = trackOffset(ui);
            ui.setHidden(true);
            ui.frame(120000);
            assert.equal(trackOffset(ui), before);
            ui.setHidden(false);
            ui.frame(20);
            assert.ok(Math.abs(trackOffset(ui) - before) <= 0.17);
            advanceFrames(ui, 200);
            assert.ok(trackOffset(ui) < before);
        } finally { ui.dispose(); }
    });

    it('keeps all badges reachable without animation when reduced motion is requested', async () => {
        const ui = fixture({ reducedMotion: true });
        try {
            await loadBadges(ui, 12);
            advanceFrames(ui, 3000);
            assert.equal(trackOffset(ui), 0);
            assert.deepEqual(cardIds(ui), Array.from({ length: 12 }, (_, index) => index + 1));
            ui.viewport.scrollLeft = 1000;
            assert.equal(ui.viewport.scrollLeft, 1000);
            ui.setReducedMotion(false);
            ui.frame(0);
            advanceFrames(ui, 1000);
            assert.ok(trackOffset(ui) < 0);
            ui.setReducedMotion(true);
            const paused = visibleOffset(ui);
            advanceFrames(ui, 1000);
            assert.equal(visibleOffset(ui), paused);
            assert.equal(ui.grid.querySelectorAll('[data-honor-wall-student]').length, 12);
        } finally { ui.dispose(); }
    });

    it('transfers reduced-motion offsets to manual scrolling without clipping badges or jumping on resume', async () => {
        const ui = fixture();
        try {
            await loadBadges(ui, 12);
            advanceFrames(ui, 1000);
            const before = visibleOffset(ui);
            const first = ui.grid.firstElementChild;
            const firstPosition = first.getBoundingClientRect().left;
            ui.setReducedMotion(true);
            ui.frame(20);
            assert.equal(trackOffset(ui), 0, 'Reduced motion should leave no transformed sliver outside the scrollable range');
            assert.equal(ui.viewport.scrollLeft, -before);
            assert.equal(first.getBoundingClientRect().left, firstPosition,
                'Transferring to native scrolling must preserve the current visual position');
            ui.viewport.scrollLeft = 0;
            assert.equal(first.getBoundingClientRect().left, 0, 'Manual scrolling can reveal the complete first badge');
            const target = ui.grid.children[2];
            ui.viewport.scrollLeft = 400;
            const manualPosition = target.getBoundingClientRect().left;
            ui.setReducedMotion(false);
            ui.frame(20);
            assert.equal(ui.viewport.scrollLeft, 0);
            assert.ok(Math.abs(target.getBoundingClientRect().left - manualPosition) <= 0.17,
                'Resuming must absorb manual scroll into the loop without jumping to a different badge');
            assert.equal(ui.grid.children.length, 12);
        } finally { ui.dispose(); }
    });

    it('re-measures resized cards and preserves identities and bounded offsets after shrink and growth', async () => {
        const ui = fixture();
        try {
            await loadBadges(ui, 12);
            advanceFrames(ui, 20000);
            const originals = Array.from(ui.grid.children);
            ui.resize(300);
            ui.frame(20);
            assert.ok(trackOffset(ui) <= 0 && trackOffset(ui) > -50.001);
            ui.resize(1500);
            advanceFrames(ui, 1000);
            assert.ok(trackOffset(ui) <= 0 && trackOffset(ui) > -250.001);
            assert.equal(new Set(cardIds(ui)).size, 12);
            assert.ok(originals.every((card) => card.isConnected && ui.grid.contains(card)));
        } finally { ui.dispose(); }
    });

    it('brings a keyboard-focused off-screen badge into view without replacing its focused link', async () => {
        const ui = fixture();
        try {
            await loadBadges(ui, 12);
            advanceFrames(ui, 1000);
            const target = ui.grid.children[9];
            const link = target.querySelector('a');
            link.focus();
            const rect = target.getBoundingClientRect();
            const bounds = ui.viewport.getBoundingClientRect();
            assert.equal(ui.window.document.activeElement, link);
            assert.ok(rect.left >= bounds.left - 0.01 && rect.right <= bounds.right + 0.01,
                'Tabbing to an off-screen badge should reveal the whole card');
            const focusedOffset = trackOffset(ui);
            advanceFrames(ui, 1000);
            assert.equal(trackOffset(ui), focusedOffset);
            assert.equal(ui.grid.children.length, 12);
        } finally { ui.dispose(); }
    });

    it('cancels its animation frame and resize observers when disposed and ignores stale callbacks', async () => {
        const ui = fixture();
        try {
            await loadBadges(ui, 7);
            advanceFrames(ui, 1000);
            const stale = [...ui.frames.values()];
            assert.ok(stale.length > 0);
            ui.cleanup();
            const afterCleanup = trackOffset(ui);
            assert.equal(ui.frames.size, 0);
            assert.ok(ui.resizeObservers.every((observer) => observer.disconnected));
            for (const callback of stale) callback(100000);
            ui.resize(300);
            assert.equal(trackOffset(ui), afterCleanup);
            assert.equal(ui.frames.size, 0, 'Stale callbacks may not schedule a new animation after cleanup');
        } finally { ui.dispose(); }
    });

    it('ignores an already queued ResizeObserver callback after disposal without restoring removed transforms', async () => {
        const ui = fixture();
        try {
            await loadBadges(ui, 7);
            advanceFrames(ui, 1000);
            const queuedObservers = [...ui.resizeObservers];
            assert.ok(queuedObservers.length > 0);
            ui.cleanup();
            ui.resize(600);
            for (const observer of queuedObservers) observer.callback([{ target: observer.node }]);
            assert.equal(ui.grid.style.transform, '');
            assert.equal(ui.viewport.classList.contains('is-looping'), false);
            assert.equal(ui.frames.size, 0);
        } finally { ui.dispose(); }
    });
});

describe('footer honor wall UI', () => {
    it('does not let decoration images hold up the original page load event', async () => {
        const ui = fixture();
        try {
            Object.defineProperty(ui.window.document, 'readyState', { configurable: true, value: 'loading' });
            ui.intersect();
            ui.finish({ badges: [badge(1)] });
            await eventually(() => ui.grid.children.length === 1);
            assert.equal(ui.grid.querySelectorAll('img[src]').length, 0);
            Object.defineProperty(ui.window.document, 'readyState', { configurable: true, value: 'complete' });
            ui.window.dispatchEvent(new ui.window.Event('load'));
            assert.equal(ui.grid.querySelectorAll('img[src]').length, 2);
        } finally { ui.dispose(); }
    });

    it('keeps input and buttons usable while a slow honor response is pending', () => {
        const ui = fixture();
        try {
            const input = ui.window.document.createElement('textarea');
            const submit = ui.window.document.createElement('button');
            let submitted = '';
            submit.addEventListener('click', () => { submitted = input.value; });
            ui.window.document.body.prepend(input, submit);
            ui.intersect();
            assert.equal(ui.requests.length, 1);
            input.value = 'print(42)';
            submit.click();
            assert.equal(submitted, 'print(42)');
            assert.equal(ui.wall.getAttribute('aria-busy'), 'true');
            assert.equal(submit.disabled, false);
        } finally { ui.dispose(); }
    });

    it('yields to page interaction between batches of a large recipient list', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(1, { students: Array.from({ length: 160 }, (_, i) => student(i + 1)) })] });
            const counts = [];
            const pulse = () => {
                counts.push(ui.grid.querySelectorAll('[data-honor-wall-student]').length);
                if (ui.wall.getAttribute('aria-busy') === 'true') ui.window.setTimeout(pulse, 0);
            };
            ui.window.setTimeout(pulse, 0);
            await eventually(() => ui.grid.querySelectorAll('[data-honor-wall-student]').length === 160);
            assert.ok(counts.length > 2, 'Other page tasks must get turns before decoration creation completes');
        } finally { ui.dispose(); }
    });

    it('preloads every AC image before avatars, with only two low-priority requests at a time and no scrolling', async () => {
        const ui = fixture();
        try {
            await loadBadges(ui, 12);
            assert.equal(ui.grid.querySelectorAll('img[src]').length, 2, 'Only two requests may occupy connection slots');
            const offscreen = ui.grid.querySelector('[data-honor-wall-badge="12"]');
            assert.equal(offscreen.querySelectorAll('img[src]').length, 0);
            assert.equal(ui.observers.length, 0, 'Preloading cannot depend on any footer/card IntersectionObserver');
            assert.equal(ui.grid.querySelectorAll('.honor-wall__ac-image[src]').length, 2,
                'Both initial slots should load medal artwork, not the first avatar');
            for (const image of ui.grid.querySelectorAll('img')) {
                assert.equal(image.decoding, 'async');
                assert.equal(image.getAttribute('fetchpriority'), 'low');
            }
            const started = ui.grid.querySelector('img[src]');
            started.dispatchEvent(new ui.window.Event('load'));
            assert.equal(ui.grid.querySelectorAll('img[src]').length, 3, 'Completion releases exactly one slot');
            assert.equal(offscreen.querySelectorAll('img[src]').length, 0);
            const completed = new Set([started]);
            while (!offscreen.querySelector('.honor-wall__ac-image[src]')) {
                const next = [...ui.grid.querySelectorAll('.honor-wall__ac-image[src]')].find((image) => !completed.has(image));
                assert.ok(next, 'Off-screen medal artwork must already be queued without scrolling or intersections');
                completed.add(next);
                next.dispatchEvent(new ui.window.Event('load'));
                assert.ok(ui.grid.querySelectorAll('.honor-wall__ac-image[src]').length - completed.size <= 2,
                    'Completing images must never increase parallel requests beyond two');
            }
            assert.equal(ui.grid.querySelectorAll('.honor-wall__avatar-image[src]').length, 0,
                'Every medal AC image should enter the request queue ahead of avatars');
            assert.equal(ui.viewport.scrollLeft, 0);
            ui.cleanup();
            const after = ui.grid.querySelectorAll('img[src]').length;
            started.dispatchEvent(new ui.window.Event('load'));
            assert.equal(ui.grid.querySelectorAll('img[src]').length, after, 'Cleanup cannot start queued image requests');
        } finally { ui.dispose(); }
    });

    it('keeps the entire card hidden without a yellow placeholder until both image load and decoding complete', async () => {
        const ui = fixture({ imageDecode: 'manual' });
        try {
            await loadBadges(ui, 1);
            const image = ui.grid.querySelector('.honor-wall__ac-image');
            const card = ui.grid.firstElementChild;
            assert.equal(ui.grid.querySelector('.honor-wall__art-fallback'), null);
            assert.equal(card.classList.contains('is-art-ready'), false);
            assert.equal(ui.wall.getAttribute('aria-busy'), 'false', 'Image completion is not part of page readiness');
            ui.get('[data-honor-wall-motion]').click();
            assert.equal(ui.wall.classList.contains('is-motion-paused'), true);
            image.dispatchEvent(new ui.window.Event('load'));
            assert.equal(ui.decodes.length, 1);
            assert.equal(ui.decodes[0].image, image);
            assert.equal(card.classList.contains('is-art-ready'), false, 'A load event alone must not reveal a still-decoding image');
            ui.decodes[0].resolve();
            await eventually(() => card.classList.contains('is-art-ready'));
            assert.equal(ui.grid.querySelector('.honor-wall__art-fallback'), null);
        } finally { ui.dispose(); }
    });

    it('starts its background JSON request immediately without intersections and does not request twice', async () => {
        const ui = fixture();
        try {
            assert.equal(ui.requests.length, 1);
            assert.equal(ui.observers.length, 0);
            ui.intersect();
            ui.intersect();
            ui.window.HonorWall.initHonorWall(ui.wall);
            assert.equal(ui.requests.length, 1);
            assert.equal(new URL(ui.requests[0].url, 'http://localhost/').pathname, '/honor-wall');
            assert.ok(ui.get('[data-honor-wall-status]').textContent.trim());
            ui.finish({ badges: [badge(1)] });
            await eventually(() => ui.grid.children.length === 1);
            assert.equal(ui.observers.length, 0);
        } finally { ui.dispose(); }
    });

    it('loads immediately when IntersectionObserver is unavailable', async () => {
        const ui = fixture({ observer: false });
        try {
            assert.equal(ui.requests.length, 1);
            ui.finish({ badges: [badge(1)] });
            await eventually(() => ui.grid.children.length === 1);
        } finally { ui.dispose(); }
    });

    it('keeps server badge order and omits badges without a recipient', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(21, { name: '最强王者' }), badge(3, { students: [] }), badge(8, { name: '暗影骑士' }), badge(40)] });
            await eventually(() => ui.grid.children.length === 3);
            const cards = Array.from(ui.grid.children);
            assert.equal(cards[0].querySelector('.honor-wall__art').title, '最强王者');
            assert.equal(cards[1].querySelector('.honor-wall__art').title, '暗影骑士');
            assert.equal(cards[2].querySelector('.honor-wall__art').title, '荣誉勋章 40');
            assert.equal(ui.grid.querySelector('[data-honor-wall-badge="3"]'), null);
        } finally { ui.dispose(); }
    });

    it('uses each badge AC image, preserves the source, and renders recipients without duplication', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(7, { students: [student(1), student(1), student(2)] })] });
            await eventually(() => ui.grid.children.length === 1);
            assert.equal(new URL(ui.grid.querySelector('.honor-wall__ac-image').src).pathname, '/badge/7/ac.png');
            assert.equal(ui.grid.querySelectorAll('[data-honor-wall-student="1"]').length, 1);
            assert.equal(ui.grid.querySelectorAll('[data-honor-wall-student="2"]').length, 1);
        } finally { ui.dispose(); }
    });

    it('shows only medal art and holders, with the badge name available through hover and an accessible label', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(7, { name: '最强王者', students: [student(1)] })] });
            await eventually(() => ui.grid.children.length === 1);
            const card = ui.grid.firstElementChild;
            const art = card.querySelector('.honor-wall__art');
            assert.equal(art.title, '最强王者');
            assert.match(art.getAttribute('aria-label'), /最强王者/);
            assert.equal(card.querySelector('h3, .honor-wall__badge-title, .honor-wall__badge, .user-profile-badge'), null);
            assert.equal(card.children.length, 1, 'Removing the title should leave no empty row or placeholder below the constellation');
            assert.ok(card.firstElementChild.classList.contains('honor-wall__constellation'));
            assert.doesNotMatch(card.textContent, /最强王者/);
            assert.equal(card.querySelectorAll('[data-honor-wall-student]').length, 1);
        } finally { ui.dispose(); }
    });

    it('uses the same 3D orbit for one recipient and one valid recipient remaining after deduplication', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [
                badge(7, { students: [student(11)] }),
                badge(8, { students: [null, student(0), student(12), student(12)] }),
            ] });
            await eventually(() => ui.grid.children.length === 2);
            const holders = Array.from(ui.grid.querySelectorAll('[data-honor-wall-student]'));
            assert.equal(holders.length, 2);
            for (const card of ui.grid.children) {
                const scene = card.querySelector('.honor-wall__constellation');
                const orbit = scene.querySelector('.honor-wall__orbit');
                const slot = orbit?.querySelector('.honor-wall__orbit-slot');
                const person = slot?.querySelector('.honor-wall__orbit-person');
                const holder = person?.querySelector('[data-honor-wall-student]');
                assert.ok(holder, 'Even one real holder should orbit instead of staying fixed in front of the medal');
                assert.ok(orbit.classList.contains('honor-wall__orbit--single'), 'A single holder should use the faster-return orbit timing');
                assert.equal(holder.parentElement, person);
                assert.equal(card.querySelectorAll('.honor-wall__orbit').length, 1);
                assert.equal(card.querySelectorAll('.honor-wall__orbit-slot').length, 1);
                assert.equal(card.querySelectorAll('.honor-wall__orbit-person').length, 1);
                assert.equal(card.querySelectorAll('[data-honor-wall-student]').length, 1);
                assert.equal(scene.style.getPropertyValue('--orbit-rows'), '1');
                assert.equal(slot.style.getPropertyValue('--orbit-angle'), '0deg');
                assert.equal(slot.style.getPropertyValue('--orbit-y'), '0rem');
                assert.equal(card.querySelector('.honor-wall__solo, .honor-wall__constellation--solo'), null);
                assert.equal(card.querySelector('h3, .honor-wall__badge-title, .honor-wall__badge'), null);
            }
            const toggle = ui.get('[data-honor-wall-motion]');
            toggle.click();
            assert.equal(ui.wall.classList.contains('is-motion-paused'), true);
            assert.deepEqual(Array.from(ui.grid.querySelectorAll('[data-honor-wall-student]')), holders,
                'Pausing must not replace or remove a single holder');
            toggle.click();
            ui.setReducedMotion(true);
            assert.equal(toggle.disabled, true);
            assert.deepEqual(Array.from(ui.grid.querySelectorAll('[data-honor-wall-student]')), holders);
        } finally { ui.dispose(); }
    });

    it('continues to use the readable 3D orbit for two or more distinct recipients', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(7, { students: [student(11), student(11), student(12)] })] });
            await eventually(() => ui.grid.children.length === 1);
            const card = ui.grid.firstElementChild;
            assert.equal(card.querySelector('.honor-wall__solo, .honor-wall__constellation--solo, .honor-wall__orbit--single'), null);
            assert.equal(card.querySelectorAll('.honor-wall__orbit').length, 1);
            assert.equal(card.querySelectorAll('.honor-wall__orbit-slot').length, 2);
            assert.equal(card.querySelectorAll('.honor-wall__orbit-person [data-honor-wall-student]').length, 2);
            const angles = Array.from(card.querySelectorAll('.honor-wall__orbit-slot'), (slot) => slot.style.getPropertyValue('--orbit-angle'));
            assert.equal(new Set(angles).size, 2);
        } finally { ui.dispose(); }
    });

    it('preserves complete, safely escaped recipient names in both the single-holder and multi-holder layouts', async () => {
        const ui = fixture();
        try {
            const name = '宇智波佐助·很长的学员姓名 <img src=x onerror="window.injected=true">';
            ui.intersect();
            ui.finish({ badges: [
                badge(7, { students: [student(11, { displayName: name })] }),
                badge(8, { students: [student(12, { displayName: name }), student(13)] }),
            ] });
            await eventually(() => ui.grid.children.length === 2);
            for (const uid of [11, 12]) {
                const holder = ui.grid.querySelector(`[data-honor-wall-student="${uid}"]`);
                assert.equal(holder.title, name);
                assert.equal(holder.querySelector('.honor-wall__student-name').textContent, name);
                assert.ok(holder.getAttribute('aria-label')?.includes(name), 'The full name should remain available to assistive technology');
                assert.equal(holder.querySelector('script, [onerror]'), null);
            }
            assert.equal(ui.window.injected, undefined);
        } finally { ui.dispose(); }
    });

    it('ignores duplicate badges and invalid recipient identities without creating an empty card', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [
                badge(7, { students: [null, student(0), student(-1), student('1'), student(1)] }),
                badge(7, { name: '重复勋章不应重复渲染' }),
                badge(8, { students: [null, student(0)] }),
            ] });
            await eventually(() => ui.grid.children.length === 1);
            assert.equal(ui.grid.querySelectorAll('[data-honor-wall-student]').length, 1);
            assert.doesNotMatch(ui.grid.textContent, /重复勋章不应重复渲染/);
        } finally { ui.dispose(); }
    });

    it('does not reveal a yellow placeholder or an incomplete card if the AC image fails', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(1)] });
            await eventually(() => ui.grid.children.length === 1);
            const picture = ui.grid.querySelector('.honor-wall__ac-image');
            const avatar = ui.grid.querySelector('.honor-wall__avatar-image');
            picture.dispatchEvent(new ui.window.Event('error'));
            avatar.dispatchEvent(new ui.window.Event('error'));
            assert.equal(ui.grid.querySelector('.honor-wall__ac-image'), null);
            assert.equal(ui.grid.querySelector('.honor-wall__art-fallback'), null);
            assert.equal(ui.grid.firstElementChild.classList.contains('is-art-ready'), false);
            assert.equal(ui.grid.querySelector('.honor-wall__avatar-image'), null);
            assert.match(ui.grid.textContent, /学员 1/);
        } finally { ui.dispose(); }
    });

    it('falls back to the load event in browsers without image.decode', async () => {
        const ui = fixture({ imageDecode: 'unsupported' });
        try {
            await loadBadges(ui, 1);
            const card = ui.grid.firstElementChild;
            assert.equal(card.classList.contains('is-art-ready'), false);
            ui.grid.querySelector('.honor-wall__ac-image').dispatchEvent(new ui.window.Event('load'));
            await eventually(() => card.classList.contains('is-art-ready'));
            assert.equal(ui.grid.querySelector('.honor-wall__art-fallback'), null);
        } finally { ui.dispose(); }
    });

    it('keeps a failed decode invisible instead of showing a fallback medal', async () => {
        const ui = fixture({ imageDecode: 'manual' });
        try {
            await loadBadges(ui, 1);
            const image = ui.grid.querySelector('.honor-wall__ac-image');
            image.dispatchEvent(new ui.window.Event('load'));
            ui.decodes[0].reject(new Error('Unsupported image data'));
            await new Promise((resolve) => setTimeout(resolve, 5));
            assert.equal(ui.grid.firstElementChild.classList.contains('is-art-ready'), false);
            assert.equal(ui.grid.querySelector('.honor-wall__art-fallback'), null);
            assert.equal(ui.wall.getAttribute('aria-busy'), 'false');
        } finally { ui.dispose(); }
    });

    it('never creates a yellow fallback for a badge with no AC image', async () => {
        const ui = fixture();
        try {
            ui.finish({ badges: [badge(1, { acImage: '' })] });
            await eventually(() => ui.grid.children.length === 1);
            assert.equal(ui.grid.querySelector('.honor-wall__ac-image, .honor-wall__art-fallback'), null);
            assert.equal(ui.grid.firstElementChild.classList.contains('is-art-ready'), false);
            assert.match(ui.grid.textContent, /学员 1/);
        } finally { ui.dispose(); }
    });

    it('removes timed-out AC images without revealing a fallback and continues the background queue', async () => {
        const ui = fixture();
        try {
            await loadBadges(ui, 3);
            const first = ui.grid.children[0];
            const second = ui.grid.children[1];
            assert.equal(ui.grid.querySelectorAll('.honor-wall__ac-image[src]').length, 2);
            ui.expireImages();
            assert.equal(first.querySelector('.honor-wall__ac-image'), null);
            assert.equal(second.querySelector('.honor-wall__ac-image'), null);
            assert.equal(first.classList.contains('is-art-ready'), false);
            assert.equal(second.classList.contains('is-art-ready'), false);
            assert.ok(ui.grid.children[2].querySelector('.honor-wall__ac-image[src]'));
            assert.equal(ui.grid.querySelector('.honor-wall__art-fallback'), null);
        } finally { ui.dispose(); }
    });

    it('keeps names visible after the card is revealed even if a student avatar fails', async () => {
        const ui = fixture();
        try {
            await loadBadges(ui, 1);
            const card = ui.grid.firstElementChild;
            ui.grid.querySelector('.honor-wall__ac-image').dispatchEvent(new ui.window.Event('load'));
            await eventually(() => card.classList.contains('is-art-ready'));
            ui.grid.querySelector('.honor-wall__avatar-image').dispatchEvent(new ui.window.Event('error'));
            assert.equal(card.querySelector('.honor-wall__avatar-image'), null);
            assert.equal(card.classList.contains('is-art-ready'), true);
            assert.equal(card.querySelector('.honor-wall__student-name').textContent, '学员 1');
        } finally { ui.dispose(); }
    });

    it('renders all recipients in balanced 3D layers without pagination, summary text, or grouping timers', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(7, { students: Array.from({ length: 35 }, (_, i) => student(i + 1)) })] });
            await eventually(() => ui.grid.children.length === 1);
            const card = ui.grid.firstElementChild;
            const holders = Array.from(card.querySelectorAll('[data-honor-wall-student]'));
            const slots = Array.from(card.querySelectorAll('.honor-wall__orbit-slot'));
            const rows = new Map();
            assert.equal(holders.length, 35);
            assert.equal(slots.length, 35);
            assert.deepEqual(holders.map((holder) => Number(holder.dataset.honorWallStudent)).sort((a, b) => a - b),
                Array.from({ length: 35 }, (_, i) => i + 1));
            for (const slot of slots) {
                assert.equal(slot.querySelectorAll('.honor-wall__orbit-person [data-honor-wall-student]').length, 1);
                const angle = slot.style.getPropertyValue('--orbit-angle');
                const y = slot.style.getPropertyValue('--orbit-y');
                assert.match(angle, /^-?[\d.]+deg$/);
                assert.ok(y.trim(), 'Each holder must receive a vertical coordinate');
                const angles = rows.get(y) || [];
                angles.push(angle);
                rows.set(y, angles);
            }
            assert.equal(rows.size, 5);
            const verticalPositions = [...rows.keys()].map(Number.parseFloat).sort((a, b) => a - b);
            assert.ok(verticalPositions.slice(1).every((position, index) => position - verticalPositions[index] >= 3),
                'Larger name labels need additional space between 3D layers');
            assert.equal(card.querySelector('.honor-wall__constellation').style.getPropertyValue('--orbit-rows'), '5');
            const sizes = [...rows.values()].map((angles) => angles.length);
            assert.ok(sizes.every((size) => size <= 8));
            assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'Holder counts should be balanced between layers');
            for (const angles of rows.values()) assert.equal(new Set(angles).size, angles.length, 'Same-layer holders cannot overlap at one angle');
            assert.equal(card.querySelector('.honor-wall__holders-heading, .honor-wall__holders-count, '
                + '.honor-wall__orbit-pager, .honor-wall__orbit-page, .honor-wall__orbit-next'), null);
            assert.doesNotMatch(card.textContent, /荣誉获得者|位学员|第\s*\d+\s*\/\s*\d+\s*组|换一组/);
            assert.equal(ui.intervals.size, 0);
        } finally { ui.dispose(); }
    });

    it('keeps every holder present and profile links accessible after any attempted timer tick', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(7, { students: Array.from({ length: 11 }, (_, i) => student(i + 1)) })] });
            await eventually(() => ui.grid.children.length === 1);
            const card = ui.grid.firstElementChild;
            const holders = Array.from(card.querySelectorAll('[data-honor-wall-student]'));
            assert.equal(holders.length, 11);
            ui.tickIntervals();
            assert.deepEqual(Array.from(card.querySelectorAll('[data-honor-wall-student]')), holders);
            for (const holder of holders) {
                assert.equal(holder.tagName, 'A');
                assert.equal(new URL(holder.href).pathname, `/user/${holder.dataset.honorWallStudent}`);
                assert.ok(holder.title.includes(holder.dataset.honorWallStudent));
            }
        } finally { ui.dispose(); }
    });

    it('balances non-multiple recipient totals instead of putting one student in a sparse final layer', async () => {
        const ui = fixture();
        const counts = [9, 33, 65];
        try {
            ui.intersect();
            ui.finish({ badges: counts.map((count, index) => badge(index + 1, {
                students: Array.from({ length: count }, (_, i) => student(i + 1)),
            })) });
            await eventually(() => ui.grid.children.length === counts.length);
            for (const [index, card] of Array.from(ui.grid.children).entries()) {
                const rows = new Map();
                const slots = card.querySelectorAll('.honor-wall__orbit-slot');
                assert.equal(slots.length, counts[index]);
                for (const slot of slots) {
                    const y = slot.style.getPropertyValue('--orbit-y');
                    rows.set(y, (rows.get(y) || 0) + 1);
                }
                assert.equal(rows.size, Math.ceil(counts[index] / 8));
                const sizes = [...rows.values()];
                assert.ok(sizes.every((size) => size <= 8));
                assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${counts[index]} holders should be balanced across layers`);
            }
        } finally { ui.dispose(); }
    });

    it('lets users pause and resume animation without hiding or replacing recipients', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(7, { students: Array.from({ length: 11 }, (_, i) => student(i + 1)) })] });
            await eventually(() => ui.grid.children.length === 1);
            const toggle = ui.get('[data-honor-wall-motion]');
            const holders = Array.from(ui.grid.querySelectorAll('[data-honor-wall-student]'));
            assert.equal(toggle.hidden, false);
            toggle.click();
            assert.equal(toggle.getAttribute('aria-pressed'), 'true');
            assert.equal(ui.wall.classList.contains('is-motion-paused'), true);
            assert.deepEqual(Array.from(ui.grid.querySelectorAll('[data-honor-wall-student]')), holders);
            toggle.click();
            assert.equal(toggle.getAttribute('aria-pressed'), 'false');
            assert.equal(ui.wall.classList.contains('is-motion-paused'), false);
            assert.deepEqual(Array.from(ui.grid.querySelectorAll('[data-honor-wall-student]')), holders);
            assert.equal(ui.intervals.size, 0);
        } finally { ui.dispose(); }
    });

    it('respects reduced-motion preferences at initialization and when preferences change', async () => {
        const ui = fixture({ reducedMotion: true });
        try {
            ui.intersect();
            ui.finish({ badges: [badge(7, { students: Array.from({ length: 11 }, (_, i) => student(i + 1)) })] });
            await eventually(() => ui.grid.children.length === 1);
            const toggle = ui.get('[data-honor-wall-motion]');
            assert.equal(toggle.disabled, true);
            assert.equal(ui.wall.classList.contains('is-motion-paused'), true);
            assert.equal(ui.grid.querySelectorAll('[data-honor-wall-student]').length, 11);
            ui.setReducedMotion(false);
            assert.equal(toggle.disabled, false);
            assert.equal(ui.wall.classList.contains('is-motion-paused'), false);
            assert.equal(ui.grid.querySelectorAll('[data-honor-wall-student]').length, 11);
            ui.setReducedMotion(true);
            assert.equal(toggle.disabled, true);
            assert.equal(ui.wall.classList.contains('is-motion-paused'), true);
            assert.equal(ui.grid.querySelectorAll('[data-honor-wall-student]').length, 11);
            assert.equal(ui.intervals.size, 0);
        } finally { ui.dispose(); }
    });

    it('removes motion listeners during cleanup without leaving any grouping timers', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(7, { students: Array.from({ length: 11 }, (_, i) => student(i + 1)) })] });
            await eventually(() => ui.grid.children.length === 1);
            assert.equal(ui.intervals.size, 0);
            assert.equal(ui.motionListeners.size, 1);
            ui.cleanup();
            assert.equal(ui.intervals.size, 0);
            assert.equal(ui.motionListeners.size, 0);
            ui.get('[data-honor-wall-motion]').click();
            assert.equal(ui.wall.classList.contains('is-motion-paused'), false);
        } finally { ui.dispose(); }
    });

    it('uses text nodes and rejects script URLs or CSS injection in badge and student metadata', async () => {
        const ui = fixture();
        try {
            const name = '<img src=x onerror="window.injected=true">';
            ui.intersect();
            ui.finish({ badges: [badge(7, {
                name, acImage: 'javascript:alert(1)', badgeHref: 'javascript:alert(2)',
                backgroundColor: '#fff;background-image:url(https://untrusted.invalid/track)', fontColor: 'red;position:fixed',
                students: [student(1, {
                    displayName: '<script>window.injected=true</script>', avatar: 'data:text/html,attack', href: 'javascript:alert(3)',
                })],
            })] });
            await eventually(() => ui.grid.children.length === 1);
            assert.equal(ui.grid.querySelector('.honor-wall__art').title, name,
                'Untrusted badge names must remain literal tooltip text, not parsed HTML');
            assert.ok(ui.grid.textContent.includes('<script>window.injected=true</script>'));
            assert.equal(ui.grid.querySelector('script, [onerror]'), null);
            for (const node of ui.grid.querySelectorAll('[src], [href]')) {
                assert.doesNotMatch(node.getAttribute('src') || node.getAttribute('href'), /^\s*(?:javascript:|data:text\/html)/i);
            }
            for (const node of ui.grid.querySelectorAll('[style]')) {
                assert.equal(node.style.backgroundImage, '');
                assert.equal(node.style.position, '');
            }
            assert.equal(ui.window.injected, undefined);
        } finally { ui.dispose(); }
    });

    it('handles an empty wall without showing any unearned badge', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(1, { students: [] })] });
            await eventually(() => !ui.wall.getAttribute('aria-busy') || ui.wall.getAttribute('aria-busy') === 'false');
            await new Promise((resolve) => setTimeout(resolve, 5));
            assert.equal(ui.grid.children.length, 0);
            assert.ok(ui.get('[data-honor-wall-status]').textContent.trim());
            assert.equal(ui.get('[data-honor-wall-retry]').hidden, true);
        } finally { ui.dispose(); }
    });

    it('hides forbidden data and never renders a response body from a 403', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: [badge(8, { name: '其他域的私人勋章', students: [student(99, { displayName: '不应泄漏的学员' })] })] }, 403);
            await eventually(() => ui.wall.hidden);
            assert.equal(ui.grid.children.length, 0);
            assert.doesNotMatch(ui.wall.textContent, /其他域|不应泄漏/);
        } finally { ui.dispose(); }
    });

    it('offers an explicit retry after a failed load without duplicating cards', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ error: 'temporarily unavailable' }, 503);
            await eventually(() => !ui.get('[data-honor-wall-retry]').hidden);
            assert.equal(ui.grid.children.length, 0);
            ui.get('[data-honor-wall-retry]').click();
            assert.equal(ui.requests.length, 2);
            ui.finish({ badges: [badge(1)] });
            await eventually(() => ui.grid.children.length === 1);
            assert.equal(ui.get('[data-honor-wall-retry]').hidden, true);
        } finally { ui.dispose(); }
    });

    it('treats malformed JSON data as a retryable failure instead of an empty success', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            ui.finish({ badges: 'not an array' });
            await eventually(() => !ui.get('[data-honor-wall-retry]').hidden);
            assert.equal(ui.grid.children.length, 0);
        } finally { ui.dispose(); }
    });

    it('aborts an in-flight load and ignores late results after cleanup', async () => {
        const ui = fixture();
        try {
            ui.intersect();
            const request = ui.requests[0];
            assert.ok(request.options.signal, 'Requests should be cancellable on page navigation');
            ui.cleanup();
            assert.equal(request.options.signal.aborted, true);
            ui.finish({ badges: [badge(1)] });
            await new Promise((resolve) => setTimeout(resolve, 15));
            assert.equal(ui.grid.children.length, 0);
            ui.get('[data-honor-wall-retry]').click();
            assert.equal(ui.requests.length, 1);
        } finally { ui.dispose(); }
    });

    it('does not delete a newly initialized instance when an old cleanup is invoked twice', () => {
        const ui = fixture({ observer: false });
        let newCleanup;
        try {
            ui.cleanup();
            newCleanup = ui.window.HonorWall.initHonorWall(ui.wall);
            assert.equal(ui.requests.length, 2);
            ui.cleanup();
            assert.equal(ui.window.HonorWall.initHonorWall(ui.wall), newCleanup);
            assert.equal(ui.requests.length, 2);
        } finally {
            newCleanup?.();
            ui.dispose();
        }
    });

    it('does not let an old request clear the busy state of a newly initialized instance', async () => {
        const ui = fixture({ observer: false });
        let newCleanup;
        try {
            const oldRequest = ui.requests[0];
            ui.cleanup();
            newCleanup = ui.window.HonorWall.initHonorWall(ui.wall);
            assert.equal(ui.wall.getAttribute('aria-busy'), 'true');
            oldRequest.resolve({ ok: true, status: 200, json: async () => ({ badges: [badge(1)] }) });
            await new Promise((resolve) => setTimeout(resolve, 5));
            assert.equal(ui.wall.getAttribute('aria-busy'), 'true');
            assert.equal(ui.grid.children.length, 0);
            ui.finish({ badges: [badge(2)] });
            await eventually(() => ui.grid.children.length === 1);
            assert.equal(ui.wall.getAttribute('aria-busy'), 'false');
            assert.equal(ui.grid.firstElementChild.dataset.honorWallBadge, '2');
        } finally {
            newCleanup?.();
            ui.dispose();
        }
    });
});

describe('footer background bootstrap', () => {
    // Keep the real bootstrap control flow; only substitute its module loader
    // and AutoloadPage dependency so neither can hide a page-readiness wait.
    const filename = path.join(__dirname, '../packages/ui-default/components/footer/footer.page.ts');
    const bootstrapText = fs.readFileSync(filename, 'utf8')
        .replace("import { AutoloadPage } from 'vj/misc/Page';", 'const AutoloadPage = window.TestAutoloadPage;')
        .replace("import('./honor-wall')", 'window.loadHonorModule()');
    const bootstrapSource = esbuild.transformSync(bootstrapText, { loader: 'ts', format: 'iife', target: 'es2020' }).code;

    function bootstrapFixture(readyState) {
        const dom = new JSDOM('<!doctype html><body><textarea></textarea><button id="submit">提交</button>'
            + '<section data-honor-wall><p data-honor-wall-status></p><button data-honor-wall-retry hidden>重试</button></section></body>',
        { url: 'http://localhost/', runScripts: 'outside-only' });
        const { window } = dom;
        const modules = [];
        const initializedWalls = [];
        let pageCallback;
        let observerCount = 0;
        Object.defineProperty(window.document, 'readyState', { configurable: true, value: readyState });
        window.TestAutoloadPage = class {
            constructor(name, callback) { pageCallback = callback; }
        };
        window.IntersectionObserver = class {
            constructor() { observerCount++; }
            observe() {}
        };
        window.loadHonorModule = () => new Promise((resolve, reject) => modules.push({ resolve, reject }));
        window.eval(bootstrapSource);
        return {
            window, modules, initializedWalls,
            initialize: () => pageCallback(),
            observers: () => observerCount,
            complete() {
                Object.defineProperty(window.document, 'readyState', { configurable: true, value: 'complete' });
                window.dispatchEvent(new window.Event('load'));
            },
            finishModule() { modules.at(-1).resolve({ initHonorWall: (wall) => initializedWalls.push(wall) }); },
            close: () => window.close(),
        };
    }

    it('preloads just after window.load without scrolling and never returns a pending decoration promise to the page loader', async () => {
        const ui = bootstrapFixture('loading');
        try {
            assert.equal(ui.initialize(), undefined, 'The main page loader must not await honor-wall JavaScript');
            assert.equal(ui.modules.length, 0, 'Decoration imports must not extend the original window.load');
            assert.equal(ui.observers(), 0, 'No viewport intersection may gate background preloading');
            ui.complete();
            assert.equal(ui.modules.length, 1);
            let submitted = '';
            const editor = ui.window.document.querySelector('textarea');
            const submit = ui.window.document.querySelector('#submit');
            submit.addEventListener('click', () => { submitted = editor.value; });
            editor.value = 'print(42)';
            submit.click();
            assert.equal(submitted, 'print(42)', 'The user may submit while the decoration module is still pending');
            ui.initialize();
            ui.complete();
            assert.equal(ui.modules.length, 1, 'Repeated page initialization/load events must not duplicate requests');
            ui.finishModule();
            await eventually(() => ui.initializedWalls.length === 1);
            assert.equal(ui.observers(), 0);
        } finally { ui.close(); }
    });

    it('starts immediately if the page is already loaded, with a retry if the optional module fails', async () => {
        const ui = bootstrapFixture('complete');
        try {
            assert.equal(ui.initialize(), undefined);
            assert.equal(ui.modules.length, 1);
            assert.equal(ui.observers(), 0);
            ui.modules[0].reject(new Error('Optional bundle unavailable'));
            const retry = ui.window.document.querySelector('[data-honor-wall-retry]');
            await eventually(() => !retry.hidden);
            assert.match(ui.window.document.querySelector('[data-honor-wall-status]').textContent, /不影响做题/);
            retry.click();
            assert.equal(ui.modules.length, 2);
            ui.finishModule();
            await eventually(() => ui.initializedWalls.length === 1);
        } finally { ui.close(); }
    });
});

describe('footer honor wall template', () => {
    const template = fs.readFileSync(path.join(__dirname, '../packages/ui-default/templates/partials/footer.html'), 'utf8');
    const env = new nunjucks.Environment(null, { autoescape: true });
    env.addGlobal('perm', { PERM_VIEW_RANKING: 4 });
    env.addGlobal('url', (route) => `/${route}`);
    const render = (allow, showTopics = true) => env.renderString(template, {
        show_topics: showTopics,
        handler: { user: { hasPerm: (permission) => permission === 4 && allow } },
        model: { setting: { SETTINGS_BY_KEY: { viewLang: { range: { zh: '简体中文', en: 'English' } } } } },
    });

    it('only embeds the honor-wall endpoint when the current page and user may display the wall', () => {
        assert.match(render(true), /data-honor-wall-url/);
        assert.doesNotMatch(render(false), /data-honor-wall-url/);
        assert.doesNotMatch(render(true, false), /data-honor-wall-url/);
        const dom = new JSDOM(render(true));
        try {
            const grid = dom.window.document.querySelector('[data-honor-wall-grid]');
            assert.ok(grid?.parentElement.matches('.honor-wall__viewport[data-honor-wall-viewport]'),
                'The actual template must place the single row inside its scrollable viewport');
        } finally { dom.window.close(); }
    });

    it('retains Language while removing the displayed attribution and old navigation or settings', () => {
        const html = render(true);
        assert.match(html, /menu-footer-lang/);
        assert.match(html, /简体中文/);
        assert.match(html, /English/);
        assert.doesNotMatch(html, /Powered by|Modified by|footer__attribution|hydro\.js\.org/);
        assert.doesNotMatch(html, /menu-footer-theme|footer__category|\/legacy|Worker/);
        assert.doesNotMatch(render(false), /Powered by|Modified by|footer__attribution/);
        assert.doesNotMatch(render(true, false), /Powered by|Modified by|footer__attribution/);
    });

    it('places the English eyebrow beside the honor-wall title in one compact title row', () => {
        const dom = new JSDOM(render(true));
        try {
            const heading = dom.window.document.querySelector('.honor-wall__heading');
            const row = heading.querySelector('.honor-wall__title-row');
            const title = row?.querySelector('h2#honor-wall-title');
            const eyebrow = row?.querySelector('.honor-wall__eyebrow');
            assert.ok(title, 'The accessible title must remain present inside the compact title row');
            assert.ok(eyebrow, 'The English eyebrow should share the title row instead of adding a separate heading line');
            assert.equal(title.parentElement, eyebrow.parentElement);
            assert.equal(title.textContent.trim(), '荣誉墙');
            assert.match(eyebrow.textContent, /HALL OF HONOR/);
            assert.ok(heading.querySelector('.honor-wall__subtitle'));
            assert.ok(heading.querySelector('[data-honor-wall-motion]'), 'Compacting the heading must not remove animation controls');
        } finally { dom.window.close(); }
    });
});

describe('compiled footer honor wall CSS', () => {
    // Test after Stylus processing: the source-level min(21rem, 100%) expression
    // previously became a fixed 21rem width and clipped avatars on small screens.
    const filename = path.join(__dirname, '../packages/ui-default/components/footer/footer.page.styl');
    const stylesheet = postcss.parse(stylus.render(fs.readFileSync(filename, 'utf8'), { filename }));
    const rule = (parent, selector) => parent.nodes.find((node) => node.type === 'rule' && node.selector === selector);
    const value = (node, property) => node?.nodes.find((item) => item.type === 'decl' && item.prop === property)?.value;

    it('reserves quiet space while loading and fades in the complete decoded card without flattening its 3D children', () => {
        const card = rule(stylesheet, '.honor-wall__card');
        const ready = rule(stylesheet, '.honor-wall__card.is-art-ready');
        assert.equal(value(card, 'visibility'), 'hidden');
        assert.equal(value(card, 'opacity'), '0');
        assert.notEqual(value(card, 'display'), 'none', 'Loading must preserve the wall layout without an image placeholder');
        assert.match(value(card, 'transition'), /opacity (?:0?\.6s|600ms)/);
        assert.equal(value(ready, 'visibility'), 'visible');
        assert.equal(value(ready, 'opacity'), '1');
        for (const selector of ['.honor-wall__constellation', '.honor-wall__orbit', '.honor-wall__orbit-slot']) {
            assert.equal(value(rule(stylesheet, selector), 'opacity'), undefined,
                'Fading an inner 3D grouping element would flatten the student orbit');
        }
        assert.equal(rule(stylesheet, '.honor-wall__art-fallback'), undefined, 'The yellow substitute medal must not remain in the display design');
    });

    it('reduces header height with compact spacing on desktop and narrow screens', () => {
        const footer = rule(stylesheet, '.footer--honors');
        const wall = rule(stylesheet, '.honor-wall');
        const heading = rule(stylesheet, '.honor-wall__heading');
        const title = rule(stylesheet, '.honor-wall__heading h2');
        const subtitle = rule(stylesheet, '.honor-wall__subtitle');
        const titleRow = rule(stylesheet, '.honor-wall__title-row');
        assert.equal(Number.parseFloat(value(footer, 'padding')), 0.75);
        assert.deepEqual(value(wall, 'padding').split(/\s+/).map(Number.parseFloat), [0.5, 2, 0.25]);
        assert.equal(Number.parseFloat(value(heading, 'margin-bottom')), 0.25);
        assert.equal(Number.parseFloat(value(title, 'font-size')), 1.35);
        assert.equal(Number.parseFloat(value(subtitle, 'font-size')), 0.72);
        assert.equal(value(titleRow, 'display'), 'flex');
        assert.equal(value(titleRow, 'align-items'), 'center');
        for (const selector of ['.footer--honors', '.honor-wall', '.honor-wall__heading']) {
            stylesheet.walkRules(selector, (node) => {
                const topPadding = value(node, 'padding-top') ?? value(node, 'padding');
                const headingGap = value(node, 'margin-bottom');
                if (topPadding !== undefined) assert.ok(Number.parseFloat(topPadding) <= 0.75, `${selector} should not regain tall top spacing`);
                if (selector === '.honor-wall__heading' && headingGap !== undefined) {
                    assert.ok(Number.parseFloat(headingGap) <= 0.5, 'Responsive headings should remain close to the badges');
                }
            });
        }
    });

    it('fades both ends of the looping row without dimming a static six-badge row or masking keyboard focus', () => {
        const looping = rule(stylesheet, '.honor-wall__viewport.is-looping');
        const mask = value(looping, 'mask-image');
        assert.ok(mask, 'Looping badges need a gradual edge fade instead of hard clipping');
        assert.equal(value(looping, '-webkit-mask-image'), mask, 'Safari should receive the same gradual fade');
        assert.match(mask, /^linear-gradient\((?:to right|90deg),/);
        assert.equal((mask.match(/transparent/g) || []).length, 2, 'Both outer edges should fade to transparent');
        assert.match(mask, /2\.25rem/);
        assert.match(mask, /calc\(100% - 2\.25rem\)/);
        assert.equal(value(rule(stylesheet, '.honor-wall__viewport'), 'mask-image'), undefined,
            'The static row should keep all six badges fully visible');
        const focused = stylesheet.nodes.find((node) => node.type === 'rule'
            && node.selector.split(/,\s*/).includes('.honor-wall__viewport.is-looping:focus-within')
            && value(node, 'mask-image') !== undefined);
        assert.ok(focused, 'Focused profile links near the edge must not disappear into the fade');
        assert.equal(value(focused, 'mask-image'), 'none');
        assert.equal(value(focused, '-webkit-mask-image'), 'none');
        for (const selector of ['.honor-wall__constellation', '.honor-wall__orbit', '.honor-wall__orbit-slot']) {
            assert.equal(value(rule(stylesheet, selector), 'mask-image'), undefined,
                'The mask belongs outside the nested 3D orbit to preserve perspective');
        }
    });

    it('enlarges medal art within a fluid, shallower 3D constellation without stretching the source image', () => {
        const desktop = rule(stylesheet, '.honor-wall__constellation');
        const art = rule(stylesheet, '.honor-wall__art');
        const picture = rule(stylesheet, '.honor-wall__ac-image');
        assert.equal(value(desktop, 'width'), '100%');
        assert.equal(value(desktop, 'max-width'), '16rem');
        assert.equal(value(desktop, 'aspect-ratio').replace(/\s/g, ''), '3/2');
        assert.equal(value(desktop, 'transform-style'), 'preserve-3d');
        assert.equal(value(art, 'width'), '64%');
        assert.equal(value(art, 'left'), '18%');
        assert.equal(value(art, 'aspect-ratio').replace(/\s/g, ''), '1/1',
            'The wider scene must not change the medal image frame into a rectangle');
        assert.equal(value(picture, 'object-fit'), 'contain');
        assert.equal(value(picture, 'width'), '100%');
        assert.equal(value(picture, 'height'), '100%');
        assert.deepEqual(value(rule(stylesheet, '.honor-wall__card'), 'padding').split(/\s+/).map(Number.parseFloat), [0.4, 0.25]);
        const mobileMedia = stylesheet.nodes.find((node) => node.type === 'atrule'
            && node.name === 'media' && node.params === '(max-width: 40em)');
        assert.ok(mobileMedia, 'Mobile layout breakpoint should be present in compiled CSS');
        stylesheet.walkRules('.honor-wall__constellation', (node) => {
            const width = value(node, 'width');
            if (width !== undefined) assert.equal(width, '100%', 'No fixed-width override may clip the student orbit');
        });
    });

    it('shares spare desktop width between earned badges without changing the six-badge loop or enlarging mobile cards', () => {
        const selector = '.honor-wall__viewport:not(.is-looping) .honor-wall__card';
        const card = rule(stylesheet, '.honor-wall__card');
        const staticCard = rule(stylesheet, selector);
        assert.equal(value(card, 'flex'), '0 0 calc(100% / 6)', 'Looping rows must keep each card exactly one-sixth of the viewport');
        assert.equal(value(staticCard, 'flex-grow'), '1', 'One to five earned badges should share all remaining desktop width');
        assert.equal(value(staticCard, 'flex-shrink'), undefined);
        assert.equal(value(staticCard, 'flex-basis'), undefined, 'Six static badges retain the existing one-sixth basis without extra spacing');
        const mobileMedia = stylesheet.nodes.find((node) => node.type === 'atrule'
            && node.name === 'media' && node.params === '(max-width: 40em)');
        assert.equal(value(rule(mobileMedia, '.honor-wall__card'), 'flex-basis'), '50%');
        assert.equal(value(rule(mobileMedia, selector), 'flex-grow'), '0', 'Few badges must not grow into oversized cards on phones');
        const viewport = new JSDOM('<div class="honor-wall__viewport"><article class="honor-wall__card"></article></div>');
        try {
            const node = viewport.window.document.querySelector('.honor-wall__viewport');
            assert.equal(viewport.window.document.querySelectorAll(selector).length, 1);
            node.classList.add('is-looping');
            assert.equal(viewport.window.document.querySelectorAll(selector).length, 0,
                'The spare-width rule must never apply to a moving row of more than six badges');
        } finally { viewport.window.close(); }
    });

    it('keeps a single non-wrapping six-badge row on desktop and scrollable cards on narrow screens', () => {
        const grid = rule(stylesheet, '.honor-wall__grid');
        const card = rule(stylesheet, '.honor-wall__card');
        const viewport = rule(stylesheet, '.honor-wall__viewport');
        assert.equal(value(grid, 'display'), 'flex');
        assert.equal(value(grid, 'flex-wrap'), 'nowrap');
        assert.equal(value(grid, 'gap'), '0');
        assert.equal(value(card, 'flex'), '0 0 calc(100% / 6)');
        assert.equal(value(card, 'box-sizing'), 'border-box');
        assert.equal(value(viewport, 'overflow-x'), 'auto');
        const mobileMedia = stylesheet.nodes.find((node) => node.type === 'atrule'
            && node.name === 'media' && node.params === '(max-width: 40em)');
        assert.equal(value(rule(mobileMedia, '.honor-wall__card'), 'flex-basis'), '50%');
        stylesheet.walkRules('.honor-wall__grid', (node) => {
            assert.notEqual(value(node, 'display'), 'grid');
            assert.notEqual(value(node, 'flex-wrap'), 'wrap');
        });
        const pausedViewport = stylesheet.nodes.find((node) => node.type === 'rule'
            && node.selector.split(/,\s*/).includes('.honor-wall.is-motion-paused .honor-wall__viewport'));
        assert.equal(value(pausedViewport, 'overflow-x'), 'auto', 'Reduced motion and manual pause must retain access to off-screen cards');
    });

    it('uses a perspective-preserving Y-axis orbit and a synchronized inverse rotation for readable names', () => {
        const constellation = rule(stylesheet, '.honor-wall__constellation');
        const orbit = rule(stylesheet, '.honor-wall__orbit');
        const slot = rule(stylesheet, '.honor-wall__orbit-slot');
        const person = rule(stylesheet, '.honor-wall__orbit-person');
        assert.match(value(constellation, 'perspective'), /^[1-9]\d*px$/);
        for (const node of [constellation, orbit, slot]) {
            assert.equal(value(node, 'transform-style'), 'preserve-3d');
            assert.notEqual(value(node, 'overflow'), 'hidden', '3D ancestors must not flatten the orbit with overflow clipping');
            assert.notEqual(value(node, 'isolation'), 'isolate', '3D ancestors must not flatten the orbit via isolation');
        }
        assert.equal(value(orbit, 'transform'), 'rotateX(-16deg)');
        assert.equal(orbit.nodes.some((node) => node.type === 'decl' && node.prop.startsWith('animation')), false);
        assert.match(value(slot, 'animation'), /^honor-orbit [\d.]+s linear infinite$/);
        assert.equal(value(person, 'animation'), value(slot, 'animation').replace('honor-orbit ', 'honor-orbit-upright '));
        assert.equal(value(slot, 'width'), '100%');
        assert.equal(value(slot, 'top'), 'calc(50% + var(--orbit-y))');
        const keyframes = (name) => stylesheet.nodes.find((node) => node.type === 'atrule'
            && node.name === 'keyframes' && node.params === name);
        const forwards = keyframes('honor-orbit');
        const backwards = keyframes('honor-orbit-upright');
        assert.equal(value(rule(forwards, 'from'), 'transform'), 'rotateY(var(--orbit-angle)) translateX(32%)');
        assert.equal(value(rule(forwards, 'to'), 'transform'), 'rotateY(calc(360deg + var(--orbit-angle))) translateX(32%)');
        assert.equal(value(rule(backwards, 'from'), 'transform'), 'rotateY(calc(0deg - var(--orbit-angle))) rotateX(16deg)');
        assert.equal(value(rule(backwards, 'to'), 'transform'), 'rotateY(calc(-360deg - var(--orbit-angle))) rotateX(16deg)');
    });

    it('has no fixed-front single-holder style that could override the shared orbit animation', () => {
        stylesheet.walkRules((node) => {
            assert.doesNotMatch(node.selector, /honor-wall__(?:solo|constellation--solo)/,
                'Single holders must not retain a separate foreground position or floating animation');
        });
        const floating = stylesheet.nodes.find((node) => node.type === 'atrule'
            && node.name === 'keyframes' && node.params === 'honor-student-float');
        assert.equal(floating, undefined, 'The obsolete single-holder float must be removed');
        assert.match(value(rule(stylesheet, '.honor-wall__orbit-slot'), 'animation'), /^honor-orbit [\d.]+s linear infinite$/);
        assert.match(value(rule(stylesheet, '.honor-wall__orbit-person'), 'animation'), /^honor-orbit-upright [\d.]+s linear infinite$/);
        const reduced = stylesheet.nodes.find((node) => node.type === 'atrule'
            && node.name === 'media' && node.params === '(prefers-reduced-motion: reduce)');
        assert.equal(value(rule(reduced, '.honor-wall__orbit'), 'position'), 'relative');
        assert.equal(value(rule(reduced, '.honor-wall__orbit-person'), 'transform'), 'none');
    });

    it('returns single holders faster behind the medal while matching inverse rotation and keeping normal speed in front', () => {
        const singleSlot = rule(stylesheet, '.honor-wall__orbit--single .honor-wall__orbit-slot');
        const singlePerson = rule(stylesheet, '.honor-wall__orbit--single .honor-wall__orbit-person');
        assert.equal(value(singleSlot, 'animation-name'), 'honor-orbit-single');
        assert.equal(value(singlePerson, 'animation-name'), 'honor-orbit-single-upright');
        assert.equal(value(singleSlot, 'animation-duration'), '20s');
        assert.equal(value(singlePerson, 'animation-duration'), '20s');
        assert.equal(value(rule(stylesheet, '.honor-wall__orbit-slot'), 'animation'), 'honor-orbit 36s linear infinite');
        assert.equal(value(rule(stylesheet, '.honor-wall__orbit-person'), 'animation'), 'honor-orbit-upright 36s linear infinite');
        const keyframes = (name) => stylesheet.nodes.find((node) => node.type === 'atrule'
            && node.name === 'keyframes' && node.params === name);
        const forwards = keyframes('honor-orbit-single');
        const backwards = keyframes('honor-orbit-single-upright');
        const stops = [[0, 0], [2.5, 30], [7.5, 150], [10, 180], [100, 360]];
        assert.deepEqual(forwards.nodes.filter((node) => node.type === 'rule').map((node) => node.selector), stops.map(([time]) => `${time}%`));
        assert.deepEqual(backwards.nodes.filter((node) => node.type === 'rule').map((node) => node.selector), stops.map(([time]) => `${time}%`));
        for (const [time, angle] of stops) {
            const forward = rule(forwards, `${time}%`);
            const backward = rule(backwards, `${time}%`);
            const forwardTransform = value(forward, 'transform');
            const backwardTransform = value(backward, 'transform');
            const forwardAngle = Number(forwardTransform.match(/(-?\d+)deg/)?.[1] || 0);
            const backwardAngle = Number(backwardTransform.match(/(-?\d+)deg/)?.[1] || 0);
            assert.equal(forwardAngle, angle);
            assert.equal(backwardAngle + angle, 0, 'Inverse rotation must precisely cancel the angle at every speed change');
            assert.match(forwardTransform, /translateX\(32%\)/);
            assert.match(backwardTransform, /rotateX\(16deg\)/);
            assert.equal(value(forward, 'animation-timing-function'), value(backward, 'animation-timing-function'),
                'Parent and child easing curves must match so names never tilt during acceleration');
        }
        assert.ok(Math.abs(20 * 0.1 - 2) < 0.001, 'The hidden half-turn should take only two seconds');
        assert.ok(Math.abs(20 * (1 - 0.1) - 18) < 0.001, 'The visible half-turn should retain eighteen seconds');
        assert.equal(180 / 18, 360 / 36, 'Front-facing speed should match the normal multi-holder orbit');
    });

    it('smoothly joins each single-holder acceleration segment and the loop boundary without backward motion', () => {
        const frames = stylesheet.nodes.find((node) => node.type === 'atrule'
            && node.name === 'keyframes' && node.params === 'honor-orbit-single');
        const stops = [[0, 0], [2.5, 30], [7.5, 150], [10, 180], [100, 360]];
        const velocities = stops.slice(0, -1).map(([time, angle], index) => {
            const [nextTime, nextAngle] = stops[index + 1];
            const average = (nextAngle - angle) / ((nextTime - time) / 100 * 20);
            const easing = value(rule(frames, `${time}%`), 'animation-timing-function');
            if (easing === 'linear') return { start: average, end: average };
            const numbers = easing.match(/^cubic-bezier\((.+)\)$/)?.[1].split(',').map(Number);
            assert.equal(numbers?.length, 4);
            const [x1, y1, x2, y2] = numbers;
            const derivative = (t, p1, p2) => 3 * (1 - t) ** 2 * p1 + 6 * (1 - t) * t * (p2 - p1) + 3 * t ** 2 * (1 - p2);
            for (let sample = 0; sample <= 20; sample++) {
                const speed = average * derivative(sample / 20, y1, y2) / derivative(sample / 20, x1, x2);
                assert.ok(speed > 0, 'A smooth return should never stop abruptly or move backward');
            }
            return { start: average * y1 / x1, end: average * (1 - y2) / (1 - x2) };
        });
        for (const [index, velocity] of velocities.entries()) {
            const next = velocities[(index + 1) % velocities.length];
            assert.ok(Math.abs(velocity.end - next.start) < 0.001,
                'The angular velocity should stay continuous at every easing boundary, including the next loop');
        }
        assert.ok(Math.abs(velocities[0].start - 10) < 0.001);
        assert.equal(velocities.at(-1).start, 10);
    });

    it('uses larger readable name labels with a nearly opaque contrasting background for both holder layouts', () => {
        const name = rule(stylesheet, '.honor-wall__student-name');
        const studentStyle = stylesheet.nodes.find((node) => node.type === 'rule' && node.selector.split(/,\s*/).includes('.honor-wall__student'));
        const avatar = rule(stylesheet, '.honor-wall__avatar');
        const person = rule(stylesheet, '.honor-wall__orbit-person');
        assert.ok(Number.parseFloat(value(name, 'font-size') || value(studentStyle, 'font-size')) >= 11,
            'Names must remain readable beside the badge art');
        assert.ok(Number.parseFloat(value(name, 'font-weight')) >= 600);
        assert.ok(Number.parseFloat(value(name, 'max-width')) >= 64, 'Long names should have more room than the old tiny labels');
        assert.equal(value(name, 'text-overflow'), 'ellipsis');
        assert.equal(value(name, 'white-space'), 'nowrap');
        assert.equal(value(avatar, 'width'), '24px');
        assert.equal(value(avatar, 'height'), '24px');
        assert.equal(value(person, 'width'), '72px');
        assert.equal(value(person, 'height'), '50px');
        const background = value(name, 'background-color') || value(name, 'background');
        const foreground = value(name, 'color');
        const luminance = (color, base = 0) => {
            const rgba = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
            if (!rgba) assert.match(color, /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i);
            const alpha = rgba ? Number(rgba[4] ?? 1) : color.length === 9 ? Number.parseInt(color.slice(7, 9), 16) / 255 : 1;
            assert.ok(alpha >= 0.9, 'The label background must remain nearly opaque over moving badge artwork');
            const digits = color.length === 4 ? [...color.slice(1)].map((digit) => digit + digit).join('') : color.slice(1);
            const rgb = rgba ? rgba.slice(1, 4).map(Number) : [0, 2, 4].map((start) => Number.parseInt(digits.slice(start, start + 2), 16));
            const channels = rgb.map((channel) => (channel * alpha + base * (1 - alpha)) / 255)
                .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        for (const badgeBackground of [0, 255]) {
            const lights = [luminance(background, badgeBackground), luminance(foreground)].sort((a, b) => a - b);
            assert.ok((lights[1] + 0.05) / (lights[0] + 0.05) >= 4.5,
                'Name labels should have sufficient contrast over both dark and light badge images');
        }
    });

    it('clips invisible orbit geometry at the card boundary without flattening the nested 3D scene', () => {
        const card = rule(stylesheet, '.honor-wall__card');
        assert.equal(value(card, 'overflow'), 'clip', 'Invisible rotating slot bounds must not cause page-level horizontal scrolling');
        assert.equal(value(card, 'min-width'), '0');
        for (const selector of ['.honor-wall__constellation', '.honor-wall__orbit', '.honor-wall__orbit-slot']) {
            const node = rule(stylesheet, selector);
            assert.equal(value(node, 'transform-style'), 'preserve-3d');
            assert.notEqual(value(node, 'overflow'), 'hidden', 'Clipping belongs outside the nested 3D scene');
        }
    });

    it('removes decorative frames and rings while preserving a keyboard-only focus indicator', () => {
        stylesheet.walkDecls(/^border(?:-(?:top|right|bottom|left)(?:-(?:width|style|color))?|-(?:width|style|color))?$/, (decl) => {
            assert.match(decl.value, /^(?:0(?:px)?|none)$/, `${decl.parent.selector}: ${decl.prop} must not draw a frame`);
        });
        for (const selector of ['.honor-wall', '.honor-wall__card']) {
            const node = rule(stylesheet, selector);
            assert.equal(value(node, 'border'), '0');
            assert.equal(value(node, 'box-shadow'), 'none');
        }
        const focus = rule(stylesheet, '.honor-wall a:focus-visible,\n.honor-wall button:focus-visible');
        assert.ok(focus, 'Keyboard navigation should retain a visible focus style');
        assert.match(value(focus, 'outline'), /^[1-9]\d*px solid /);
    });

    it('pauses the entire orbit and badge effect on hover, keyboard focus, and the motion control', () => {
        for (const selector of ['.honor-wall__card:hover *', '.honor-wall__card:focus-within *', '.honor-wall.is-motion-paused *']) {
            const paused = stylesheet.nodes.find((node) => node.type === 'rule' && node.selector.split(/,\s*/).includes(selector));
            assert.ok(paused, `${selector} must pause all moving descendants`);
            assert.equal(value(paused, 'animation-play-state'), 'paused');
            assert.equal(paused.nodes.find((node) => node.prop === 'animation-play-state').important, true);
        }
    });

    it('replaces the 3D orbit with a fully visible wrapping list when reduced motion is requested', () => {
        const reduced = stylesheet.nodes.find((node) => node.type === 'atrule'
            && node.name === 'media' && node.params === '(prefers-reduced-motion: reduce)');
        assert.ok(reduced);
        const scene = rule(reduced, '.honor-wall__constellation');
        const orbit = rule(reduced, '.honor-wall__orbit');
        const slot = rule(reduced, '.honor-wall__orbit-slot');
        const person = rule(reduced, '.honor-wall__orbit-person');
        assert.equal(value(scene, 'perspective'), 'none');
        assert.equal(value(scene, 'min-height'), '0');
        assert.equal(value(orbit, 'display'), 'flex');
        assert.equal(value(orbit, 'flex-wrap'), 'wrap');
        for (const node of [orbit, slot, person]) {
            assert.equal(value(node, 'position'), 'relative');
            assert.equal(value(node, 'transform'), 'none');
        }
        assert.equal(value(slot, 'top'), 'auto');
        const stopMotion = reduced.nodes.find((node) => node.type === 'rule' && node.selector.split(/,\s*/).includes('.honor-wall *'));
        assert.equal(value(stopMotion, 'animation'), 'none');
        assert.equal(stopMotion.nodes.find((node) => node.prop === 'animation').important, true);
    });
});
