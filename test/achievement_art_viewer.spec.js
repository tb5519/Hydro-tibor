const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/components/achievement_art_viewer.ts'), 'utf8');
const compiled = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
const art = { imageUrl: '/d/source/achievement/weekly-ac-50/image?v=17', name: '七日封神', description: '连续7天内累计AC50道不同题目' };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function fixture({ native = false, reducedMotion = false } = {}) {
    const dom = new JSDOM('<!doctype html><body><main aria-hidden="false"><button id="tile">七日封神</button><input id="editor"></main></body>', {
        url: 'https://school.test/d/class/u/11', pretendToBeVisual: true,
    });
    const { window: win } = dom;
    const doc = win.document;
    const timers = new Map();
    const images = [];
    let nextId = 0; let now = 0; let nativeOpens = 0; let nativeCloses = 0; let sideEffects = 0;
    win.setTimeout = (callback, delay = 0) => { timers.set(++nextId, { callback, at: now + delay }); return nextId; };
    win.clearTimeout = (id) => timers.delete(id);
    win.requestAnimationFrame = (callback) => win.setTimeout(callback, 16);
    win.cancelAnimationFrame = win.clearTimeout;
    win.matchMedia = () => ({ matches: reducedMotion });
    win.fetch = win.Audio = win.XMLHttpRequest = () => { sideEffects++; throw new Error('Manual artwork must not trigger achievement effects or API calls'); };
    if (native) {
        win.HTMLDialogElement.prototype.showModal = function showModal() { nativeOpens++; this.setAttribute('open', ''); };
        win.HTMLDialogElement.prototype.close = function close() { nativeCloses++; this.removeAttribute('open'); this.dispatchEvent(new win.Event('close')); };
    }
    const createElement = doc.createElement.bind(doc);
    doc.createElement = (tag, ...args) => {
        const node = createElement(tag, ...args);
        if (tag.toLowerCase() !== 'img') return node;
        let complete = false; let width = 0; let resolve; let reject;
        const decoded = new Promise((yes, no) => { resolve = yes; reject = no; });
        Object.defineProperties(node, {
            complete: { get: () => complete }, naturalWidth: { get: () => width }, naturalHeight: { get: () => width },
        });
        node.decode = () => decoded;
        const picture = {
            node, decode: resolve, rejectDecode: reject,
            load() { complete = true; width = 2000; node.onload?.(new win.Event('load')); },
            fail() { complete = true; width = 0; node.onerror?.(new win.Event('error')); },
            ready() { this.load(); resolve(); },
        };
        images.push(picture);
        return node;
    };
    const mod = { exports: {} };
    vm.runInNewContext(compiled, { module: mod, exports: mod.exports, document: doc, URL: win.URL, Date: win.Date });
    const create = () => mod.exports.createAchievementArtworkViewer(doc);
    const fire = (type, props = {}, target = doc) => {
        const event = type.startsWith('key') ? new win.KeyboardEvent(type, { bubbles: true, cancelable: true, ...props })
            : new win.MouseEvent(type, { bubbles: true, cancelable: true, ...props });
        target.dispatchEvent(event);
        return event;
    };
    const tick = async (ms) => {
        await settle();
        const until = now + ms;
        for (;;) {
            const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            now = next[1].at; timers.delete(next[0]); next[1].callback(); await settle();
        }
        now = until; await settle();
    };
    return { win, doc, images, timers, create, fire, tick, dialog: () => doc.querySelector('.achievement-art-viewer'),
        stats: () => ({ nativeOpens, nativeCloses, sideEffects }), close: () => win.close() };
}

it('opens a native welcome layer without visible loading copy and reveals only the decoded canonical original', async () => {
    const f = fixture({ native: true });
    const viewer = f.create();
    viewer.open({ ...art, unlockedAt: '2026-10-26T16:00:00Z' }, f.doc.querySelector('#tile'));
    assert.equal(f.stats().nativeOpens, 1);
    assert.equal(f.dialog().hasAttribute('open'), true);
    assert.equal(f.dialog().querySelector('button'), null);
    assert.equal(f.dialog().querySelector('img'), null);
    assert.equal(f.dialog().querySelector('[role=status]').hidden, false, 'the pending status remains available to screen readers');
    assert.equal(f.dialog().querySelector('.achievement-art-viewer__welcome').getAttribute('aria-hidden'), 'true');
    assert.equal(f.dialog().querySelectorAll('.achievement-art-viewer__spark').length, 6);
    assert.equal(f.images[0].node.src, 'https://school.test/d/source/achievement/weekly-ac-50/image?v=17');
    await f.tick(180);
    assert.equal(f.dialog().querySelector('[role=status]').textContent, '正在迎接成就…');
    assert.equal(f.dialog().textContent.includes('正在载入高清原图'), false);
    f.images[0].load(); await settle();
    assert.equal(f.dialog().querySelector('img'), null, 'download completion is not decoding completion');
    f.images[0].decode(); await settle();
    assert.equal(f.dialog().querySelector('img'), f.images[0].node);
    assert.equal(f.dialog().classList.contains('is-ready'), false, 'a newly inserted image retains its initial opacity/transform');
    await f.tick(16);
    assert.equal(f.dialog().classList.contains('is-ready'), false, 'the initial state gets a paint before the transition');
    await f.tick(16);
    assert.ok(f.dialog().classList.contains('is-ready'));
    assert.equal(f.dialog().getAttribute('aria-busy'), 'false');
    assert.ok(f.dialog().querySelector('.achievement-art-viewer__date').textContent.includes('2026年10月27日'));
    assert.equal(f.stats().sideEffects, 0);
    f.fire('click'); await f.tick(280);
    assert.equal(f.dialog(), null);
    assert.equal(f.stats().nativeCloses, 1);
    viewer.dispose(); f.close();
});

it('requests originals only on open, reuses clicked versions and bounds the decoded cache', async () => {
    const f = fixture(); const viewer = f.create();
    assert.equal(viewer.preload, undefined, 'hover/focus cannot request an original through this API');
    assert.equal(f.images.length, 0);
    viewer.open(art); viewer.open(art);
    assert.equal(f.images.length, 1);
    f.images[0].ready(); await f.tick(32);
    f.fire('click'); await f.tick(280);
    viewer.open(art); await f.tick(32);
    assert.ok(f.dialog().classList.contains('is-ready'));
    assert.equal(f.dialog().querySelector('[role=status]').hidden, true);
    assert.equal(f.images.length, 1);
    f.fire('click'); await f.tick(280);
    viewer.open({ ...art, imageUrl: `${art.imageUrl}8` });
    assert.equal(f.images.length, 2, 'a new asset version never reuses the old decoded artwork');
    await settle(); f.fire('click'); await f.tick(280);
    for (let i = 0; i < 8; i++) viewer.open({ ...art, imageUrl: `/image/${i}?v=1` });
    assert.equal(f.images.filter(({ node }) => node.hasAttribute('src')).length, 6);
    viewer.dispose(); assert.equal(f.timers.size, 0); f.close();
});

it('uses a decoded thumbnail only as a welcome silhouette and reveals HD without waiting for the welcome loop', async () => {
    const f = fixture(); const viewer = f.create();
    viewer.open({ ...art, thumbnailUrl: '/thumb.webp?v=17' });
    assert.equal(f.images.length, 2);
    assert.equal(f.images[1].node.src, 'https://school.test/thumb.webp?v=17');
    f.images[1].load(); await settle();
    assert.equal(f.dialog().querySelector('img'), null, 'an undecoded thumbnail never becomes a visible broken preview');
    f.images[1].decode(); await settle();
    const welcome = f.dialog().querySelector('.achievement-art-viewer__welcome');
    assert.equal(welcome.querySelector('.achievement-art-viewer__silhouette'), f.images[1].node);
    assert.equal(f.images[1].node.alt, '');
    assert.equal(f.dialog().classList.contains('is-ready'), false, 'a clear thumbnail cannot stand in for the original');
    f.images[0].load(); await settle();
    assert.equal(f.dialog().querySelector('.achievement-art-viewer__image'), null);
    f.images[0].decode(); await f.tick(32);
    assert.ok(f.dialog().classList.contains('is-ready'), 'HD starts revealing as soon as its two paint frames finish');
    assert.equal(f.dialog().querySelector('.achievement-art-viewer__image'), f.images[0].node);
    assert.ok(welcome.isConnected, 'the decoded silhouette survives the transition instead of popping out');
    assert.ok(f.images[1].node.hasAttribute('src'));
    await f.tick(479); assert.ok(welcome.isConnected);
    await f.tick(1); assert.equal(welcome.isConnected, false, 'all looping welcome elements are removed after the reveal');
    assert.equal(f.images[1].node.hasAttribute('src'), false);
    assert.equal(f.timers.size, 0);
    viewer.dispose(); f.close();
});

it('never lets a late thumbnail revive a completed original and skips thumbnail work for decoded HD cache hits', async () => {
    const f = fixture(); const viewer = f.create();
    const selected = { ...art, thumbnailUrl: '/thumb.webp?v=17' };
    viewer.open(selected); f.images[1].load();
    f.images[0].ready(); await f.tick(32);
    assert.ok(f.dialog().classList.contains('is-ready'));
    f.images[1].decode(); await settle();
    assert.equal(f.dialog().querySelector('.achievement-art-viewer__silhouette'), null);
    assert.equal(f.images[1].node.hasAttribute('src'), false);
    f.fire('click'); await f.tick(280);
    viewer.open(selected); await f.tick(32);
    assert.equal(f.images.length, 2, 'a decoded original immediately reopens without even starting another thumbnail');
    assert.ok(f.dialog().classList.contains('is-ready'));
    const welcome = f.dialog().querySelector('.achievement-art-viewer__welcome');
    const ended = new f.win.Event('transitionend', { bubbles: true });
    Object.defineProperty(ended, 'propertyName', { value: 'opacity' });
    welcome.dispatchEvent(ended);
    assert.equal(welcome.isConnected, false, 'a real transition end cleans up before the fallback timer');
    assert.equal(f.timers.size, 0);
    viewer.dispose(); f.close();
});

it('keeps the atmosphere when the thumbnail fails, but ends it on HD failure and rejects late thumbnail callbacks', async () => {
    for (const failure of ['thumbnail', 'original']) {
        const f = fixture(); const viewer = f.create();
        viewer.open({ ...art, thumbnailUrl: '/thumb.webp' });
        if (failure === 'thumbnail') {
            f.images[1].fail(); await settle();
            assert.ok(f.dialog().querySelector('.achievement-art-viewer__welcome'));
            assert.equal(f.dialog().querySelector('img'), null);
            assert.equal(f.dialog().classList.contains('is-error'), false);
            f.images[0].ready(); await f.tick(32);
            assert.ok(f.dialog().classList.contains('is-ready'));
        } else {
            f.images[1].load(); f.images[0].fail(); await settle();
            f.images[1].decode(); await settle();
            assert.equal(f.dialog().querySelector('.achievement-art-viewer__welcome'), null);
            assert.equal(f.dialog().querySelector('img'), null);
            assert.ok(f.dialog().classList.contains('is-error'));
            assert.equal(f.dialog().querySelector('[role=status]').hidden, false);
            assert.equal(f.dialog().querySelector('[role=status]').textContent, '高清图片暂时无法加载');
        }
        f.fire('click'); await f.tick(280); assert.equal(f.dialog(), null);
        viewer.dispose(); f.close();
    }
});

it('can close a welcoming layer immediately and cancels its thumbnail through replacement, navigation and reduced motion', async () => {
    const f = fixture({ reducedMotion: true }); const viewer = f.create();
    viewer.open({ ...art, thumbnailUrl: '/thumb.webp' }); f.images[1].load(); await settle();
    const closed = f.dialog();
    f.fire('keydown', { key: 'Escape' }); await f.tick(60);
    f.images[1].decode(); await settle();
    assert.equal(closed.querySelector('.achievement-art-viewer__welcome'), null);
    assert.equal(f.dialog(), null);
    viewer.open({ ...art, imageUrl: '/next', thumbnailUrl: '/next-thumb' });
    f.images[3].load();
    viewer.open({ ...art, imageUrl: '/last', thumbnailUrl: '/last-thumb' });
    f.images[3].decode(); await settle();
    assert.equal(f.dialog().querySelector('.achievement-art-viewer__silhouette'), null);
    f.images[4].ready(); await f.tick(32);
    await f.tick(59); assert.ok(f.dialog().querySelector('.achievement-art-viewer__welcome'));
    await f.tick(1); assert.equal(f.dialog().querySelector('.achievement-art-viewer__welcome'), null);
    f.win.dispatchEvent(new f.win.PageTransitionEvent('pagehide', { persisted: true }));
    f.images[5].ready(); await settle();
    assert.equal(f.dialog(), null); assert.equal(f.timers.size, 0);
    viewer.dispose(); f.close();
});

it('ignores its opening click, captures dismissal through exit, and restores focus and fallback background state', async () => {
    const f = fixture(); const viewer = f.create();
    const tile = f.doc.querySelector('#tile'); const main = f.doc.querySelector('main');
    main.inert = false; f.doc.body.style.overflow = 'scroll'; f.doc.documentElement.style.overflow = 'auto';
    let opens = 0;
    tile.addEventListener('click', () => { opens++; viewer.open(art, tile); });
    tile.focus(); tile.click();
    assert.ok(f.dialog()); assert.equal(f.dialog().classList.contains('is-leaving'), false);
    assert.equal(main.inert, true); assert.equal(main.getAttribute('aria-hidden'), 'true');
    assert.equal(f.doc.activeElement, f.dialog());
    f.doc.querySelector('#editor').focus(); assert.equal(f.doc.activeElement, f.dialog());
    await settle();
    f.fire('click', {}, tile);
    assert.equal(opens, 1, 'closing input cannot reactivate the underlying achievement tile');
    assert.ok(f.dialog().classList.contains('is-leaving'));
    f.fire('click', {}, tile); assert.equal(opens, 1);
    await f.tick(279); assert.ok(f.dialog());
    await f.tick(1);
    assert.equal(f.dialog(), null); assert.equal(f.doc.activeElement, tile);
    assert.equal(main.inert, false); assert.equal(main.getAttribute('aria-hidden'), 'false');
    assert.equal(f.doc.body.style.overflow, 'scroll'); assert.equal(f.doc.documentElement.style.overflow, 'auto');
    viewer.dispose(); f.close();
});

it('keeps failure and timeout states closable, retries on reopen, and never renders a broken or unsafe image', async () => {
    for (const failure of ['download', 'decode', 'timeout', 'unsafe']) {
        const f = fixture(); const viewer = f.create();
        const selected = failure === 'unsafe' ? { ...art, imageUrl: 'javascript:alert(1)' } : art;
        viewer.open(selected);
        if (failure === 'download') f.images[0].fail();
        if (failure === 'decode') { f.images[0].load(); f.images[0].rejectDecode(new Error('corrupt')); }
        await f.tick(failure === 'timeout' ? 20000 : 0);
        assert.ok(f.dialog().classList.contains('is-error'), failure);
        assert.equal(f.dialog().querySelector('img'), null);
        assert.ok(f.dialog().textContent.includes('重新点开即可重试'));
        f.fire('keydown', { key: 'Escape' }); await f.tick(280);
        viewer.open(art); await settle();
        f.images.at(-1).ready(); await f.tick(32);
        assert.ok(f.dialog().classList.contains('is-ready'));
        viewer.dispose(); f.close();
    }
});

it('ignores stale decode callbacks after rapid replacement and coordinates one viewer per document', async () => {
    const f = fixture(); const a = f.create(); const b = f.create();
    a.open(art); a.open(art);
    assert.equal(f.images.length, 1, 'repeated opens of the current artwork share one load');
    f.images[0].load();
    a.open({ ...art, imageUrl: '/next?v=2', name: '题海霸主' });
    f.images[0].decode(); await settle();
    assert.equal(f.dialog().querySelector('img'), null);
    assert.equal(f.dialog().querySelector('h2').textContent, '题海霸主');
    b.open({ ...art, imageUrl: '/third?v=3', name: '巅峰封神' });
    f.images[1].ready(); await settle();
    assert.equal(f.doc.querySelectorAll('.achievement-art-viewer').length, 1);
    assert.equal(f.dialog().querySelector('img'), null);
    f.images[2].ready(); await settle();
    assert.equal(f.dialog().querySelector('img'), f.images[2].node);
    assert.equal(f.dialog().querySelector('h2').textContent, '巅峰封神');
    f.fire('click'); await f.tick(280);
    assert.equal(f.doc.body.style.overflow, '');
    a.dispose(); b.dispose(); f.close();
});

it('supports keyboard inspection and reduced motion without modifier, held-key or composition dismissal', async () => {
    const f = fixture({ reducedMotion: true }); const viewer = f.create();
    viewer.open({ ...art, name: '<img src=x onerror=alert(1)>', description: '<script>bad()</script>', unlockedAt: 'not-a-date' });
    await settle();
    assert.equal(f.dialog().querySelector('[onerror]'), null);
    assert.equal(f.dialog().querySelector('script'), null);
    assert.equal(f.dialog().querySelector('.achievement-art-viewer__date').hidden, true);
    for (const props of [{ key: 'Shift' }, { key: 'Control' }, { key: 'Meta' }, { key: 'Alt' }, { key: 'a', repeat: true }, { key: 'a', isComposing: true }]) f.fire('keydown', props);
    assert.equal(f.dialog().classList.contains('is-leaving'), false);
    f.fire('keydown', { key: 'Tab' });
    await f.tick(59); assert.ok(f.dialog()); await f.tick(1); assert.equal(f.dialog(), null);
    viewer.dispose(); f.close();
});

it('cleans navigation and late loads, reopens after bfcache, and stays closed after disposal', async () => {
    const f = fixture(); const viewer = f.create();
    viewer.open(art); f.images[0].load();
    f.win.dispatchEvent(new f.win.PageTransitionEvent('pagehide', { persisted: true }));
    assert.equal(f.dialog(), null); assert.equal(f.timers.size, 0);
    f.images[0].decode(); await settle(); assert.equal(f.dialog(), null);
    f.win.dispatchEvent(new f.win.PageTransitionEvent('pageshow', { persisted: true }));
    viewer.open(art); assert.ok(f.dialog()); assert.equal(f.images.length, 2);
    viewer.dispose(); f.images[1].ready(); await settle();
    viewer.open(art);
    assert.equal(f.dialog(), null); assert.equal(f.images.length, 2);
    assert.equal(f.doc.body.style.overflow, ''); assert.equal(f.timers.size, 0);
    f.close();
});

it('cancels queued artwork entrance frames on dismissal and replacement', async () => {
    const f = fixture(); const viewer = f.create();
    viewer.open(art); f.images[0].ready(); await settle();
    const closing = f.dialog();
    f.fire('click'); await f.tick(32);
    assert.ok(closing.classList.contains('is-leaving'));
    assert.equal(closing.classList.contains('is-ready'), false, 'dismissal before the first frame never starts an entrance');
    await f.tick(248);
    viewer.open(art); await f.tick(16);
    const replaced = f.dialog();
    viewer.open({ ...art, imageUrl: '/replacement?v=2' });
    await f.tick(32);
    assert.equal(replaced.isConnected, false);
    assert.equal(replaced.classList.contains('is-ready'), false, 'replacement cancels the second entrance frame');
    assert.equal(f.dialog().classList.contains('is-ready'), false);
    f.images[1].ready(); await f.tick(16);
    const disposed = f.dialog();
    viewer.dispose(); await f.tick(32);
    assert.equal(disposed.classList.contains('is-ready'), false);
    assert.equal(f.timers.size, 0);
    f.close();
});

it('leaves an automatic achievement celebration in control without a request, sound or competing modal', () => {
    const f = fixture(); const viewer = f.create();
    const celebration = f.doc.createElement('div'); celebration.className = 'achievement-reveal'; f.doc.body.append(celebration);
    viewer.open(art);
    assert.equal(f.dialog(), null); assert.equal(f.images.length, 0);
    assert.equal(f.stats().sideEffects, 0);
    viewer.dispose(); f.close();
});
