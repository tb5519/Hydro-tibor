const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'packages/ui-default/components/badge_ac_effect.ts'), 'utf8');
const compiled = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
const deferred = () => {
    let resolve; let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture(options = {}) {
    const images = []; const sounds = []; const timers = new Map(); const listeners = new Map(); let nextId = 0;
    class Element {
        constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.classes = new Set();
            this.classList = { add: (value) => this.classes.add(value), remove: (value) => this.classes.delete(value) }; }
        appendChild(child) { child.remove(); this.children.push(child); child.parent = this; }
        remove() { if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this); this.parent = null; }
        setAttribute(name, value) { this.attributes[name] = value; }
        removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this._src = ''; }
    }
    class Image extends Element {
        constructor() { super('img'); this.complete = false; this.naturalWidth = 0; this.decoded = deferred(); images.push(this); }
        set src(value) { this._src = value; if (options.cached) { this.complete = true; this.naturalWidth = 384; } }
        get src() { return this._src; }
        load() { this.complete = true; this.naturalWidth = 384; this.onload?.(); }
        decode() { this.decodeCalls = (this.decodeCalls || 0) + 1; return this.decoded.promise; }
    }
    class Audio extends Element {
        constructor(src) { super('audio'); this.src = src; this.calls = []; this.pauseCalls = 0; sounds.push(this); }
        load() {}
        play() { this.calls.push({ volume: this.volume, visibleEffects: document.body.children.length });
            if (options.delayedPrime && this.calls.length === 1) return options.delayedPrime.promise;
            return options.audioBlocked ? Promise.reject(Error('autoplay blocked')) : Promise.resolve(); }
        pause() { this.pauseCalls++; }
    }
    const events = {
        addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
        removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    };
    const document = { ...events, body: new Element('body'), createElement: (tag) => new Element(tag) };
    const window = { ...events,
        setTimeout(fn, delay) { timers.set(++nextId, { fn, delay }); return nextId; },
        clearTimeout(id) { timers.delete(id); }, requestAnimationFrame: (fn) => window.setTimeout(fn, 16),
    };
    const module = { exports: {} };
    vm.runInNewContext(compiled, { module, exports: module.exports, document, window, Image, Audio,
        navigator: { connection: { saveData: !!options.saveData } } });
    const create = module.exports.createBadgeAcThemePlayer;
    return { create, images, sounds, timers, document, listeners,
        fire(name, event = { persisted: false }) { for (const fn of [...(listeners.get(name) || [])]) fn(event); },
        run(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } },
    };
}
const theme = { acImage: '/d/Python/badge/7/ac-image?size=384&v=version-1', name: '勇者', themeSound: '/sound?v=1' };
it('prepares the exact image immediately and waits for full decode before attaching it or playing audible sound', async () => {
    const f = fixture(); const player = f.create(theme);
    assert.equal(f.images.length, 1, 'cold page starts image download before any AC');
    const image = f.images[0]; assert.equal(image.src, theme.acImage);
    const playback = player.play(); assert.strictEqual(player.play(), playback, 'one effect for overlapping result messages');
    await settle(); assert.equal(f.document.body.children.length, 0);
    assert.equal(f.sounds[0].calls.filter((call) => call.volume > 0).length, 0);
    image.load(); await settle();
    assert.equal(image.decodeCalls, 1);
    assert.equal(f.document.body.children.length, 0, 'load alone cannot expose partially decoded pixels');
    image.decoded.resolve(); await settle();
    const frame = f.document.body.children[0].children[0];
    assert.strictEqual(frame.children[1], image, 'the decoded image is inserted without a second image request');
    assert.equal(f.images.length, 1);
    assert.deepEqual(f.sounds[0].calls.filter((call) => call.volume > 0), [{ volume: 0.25, visibleEffects: 1 }]);
    f.run(16); assert.equal(f.document.body.children[0].classes.has('is-visible'), true);
    f.sounds[0].onended(); f.run(340); await playback;
    assert.equal(f.document.body.children.length, 0); player.dispose();
});
it('uses a cached, decoded image immediately and preserves the full celebration duration', async () => {
    const f = fixture({ cached: true }); const player = f.create({ acImage: theme.acImage });
    assert.equal(f.images[0].decodeCalls, 1); f.images[0].decoded.resolve(); await settle();
    const playback = player.play(); await settle();
    assert.equal(f.document.body.children.length, 1);
    assert.equal([...f.timers.values()].some((timer) => timer.delay === 4000), false);
    f.run(2200); assert.equal(f.document.body.children.length, 1);
    f.run(340); await playback; assert.equal(f.document.body.children.length, 0); player.dispose();
});
it('uses a text celebration on failed or excessively slow images instead of showing partial or broken pixels', async () => {
    for (const failure of ['network', 'decode', 'timeout']) {
        const f = fixture(); const player = f.create({ acImage: theme.acImage, name: theme.name }); const playback = player.play();
        if (failure === 'network') f.images[0].onerror();
        if (failure === 'decode') { f.images[0].load(); f.images[0].decoded.reject(Error('decode failed')); }
        if (failure === 'timeout') f.run(4000);
        await settle();
        const frame = f.document.body.children[0].children[0];
        assert.equal(frame.children.some((child) => child.tag === 'img'), false);
        assert.equal(frame.children[1].textContent, '勇者 · 满分 AC');
        if (failure === 'timeout') { f.images[0].load(); f.images[0].decoded.resolve(); await settle();
            assert.equal(frame.children.some((child) => child.tag === 'img'), false, 'late pixels do not replace an active celebration'); }
        f.run(2200); f.run(340); await playback; player.dispose();
    }
});
it('cancels pending decode on navigation or disposal and never displays the old badge afterward', async () => {
    for (const navigate of [false, true]) {
        const f = fixture(); const player = f.create(theme); const playback = player.play();
        f.images[0].load();
        if (navigate) f.fire('pagehide'); else player.dispose();
        await playback; f.images[0].decoded.resolve(); await settle();
        assert.equal(f.document.body.children.length, 0); assert.equal(f.images[0].src, '');
        assert.equal(f.listeners.get('pointerdown').size, 0); assert.equal(f.listeners.get('keydown').size, 0);
        assert.equal(f.listeners.get('pagehide').size, 0); assert.equal(f.timers.size, 0);
    }
});
it('keeps a restored back/forward-cache page usable without resuming an old effect', async () => {
    const f = fixture({ cached: true }); const player = f.create(theme); const first = player.play();
    f.fire('pagehide', { persisted: true }); await first;
    f.images[0].decoded.resolve(); await settle();
    assert.equal(f.document.body.children.length, 0);
    const second = player.play(); await settle();
    assert.equal(f.document.body.children.length, 1); assert.equal(f.images.length, 1);
    f.fire('pagehide', { persisted: true }); await second; assert.equal(f.document.body.children.length, 0);
    player.dispose();
});
it('cancels a visible effect and its completion promise when its owner is disposed', async () => {
    const f = fixture({ cached: true }); const player = f.create(theme); f.images[0].decoded.resolve();
    const playback = player.play(); await settle(); assert.equal(f.document.body.children.length, 1);
    player.dispose(); await playback; f.run(16); assert.equal(f.document.body.children.length, 0);
    assert.equal(f.sounds[0].onended, null);
});
it('late audio priming cannot pause or reset the real celebration', async () => {
    const prime = deferred(); const f = fixture({ delayedPrime: prime, cached: true }); const player = f.create(theme);
    f.images[0].decoded.resolve(); const playback = player.play(); await settle();
    const pauses = f.sounds[0].pauseCalls; prime.resolve(); await settle();
    assert.equal(f.sounds[0].pauseCalls, pauses); assert.equal(f.sounds[0].volume, 0.25);
    player.dispose(); await playback;
});
it('supports sound-only themes, blocked audio and Save-Data without fetching optional images early', async () => {
    const f = fixture({ saveData: true, audioBlocked: true }); const player = f.create(theme);
    assert.equal(f.images.length, 0); const playback = player.play(); assert.equal(f.images.length, 1);
    f.images[0].load(); f.images[0].decoded.resolve(); await settle();
    f.run(2200); f.run(340); await playback; player.dispose();
    const g = fixture(); const sound = g.create({ themeSound: '/sound', name: '勇者' }); const soundPlayback = sound.play(); await settle();
    assert.equal(g.images.length, 0); assert.equal(g.document.body.children.length, 1);
    g.sounds[0].onended(); g.run(340); await soundPlayback; sound.dispose();
});
it('starts HTML preload during parsing on both entry pages, deduplicates by version and keeps audio idle', () => {
    const partial = fs.readFileSync(path.join(root, 'packages/ui-default/templates/partials/badge_ac_preload.html'), 'utf8');
    const script = partial.match(/<script>([\s\S]*?)<\/script>/)[1].replace("{{ badgeAcTheme|json|jsesc|safe }}", JSON.stringify(theme));
    const links = []; const events = {}; const idle = [];
    const context = { document: { readyState: 'loading', head: { appendChild: (link) => links.push(link) },
        createElement: () => ({ setAttribute() {} }) }, navigator: { connection: {} },
    window: { addEventListener: (name, fn) => { events[name] = fn; }, requestIdleCallback: (fn) => idle.push(fn) } };
    vm.runInNewContext(script, context);
    assert.equal(links.length, 1); assert.equal(links[0].href, theme.acImage); assert.equal(links[0].rel, 'preload');
    vm.runInNewContext(script, context); assert.equal(links.length, 1);
    events.load(); assert.equal(links.length, 1); idle[0](); assert.equal(links.length, 2); assert.equal(links[1].as, 'audio');
    vm.runInNewContext(script.replace('version-1', 'version-2'), context); assert.equal(links.length, 3);
    for (const filename of ['problem_detail.html', 'record_detail.html']) {
        const template = fs.readFileSync(path.join(root, 'packages/ui-default/templates', filename), 'utf8');
        assert.match(template, /include 'partials\/badge_ac_preload.html'/);
    }
    const privatePage = { ...context, navigator: { connection: { saveData: true } } };
    vm.runInNewContext(script.replace('version-1', 'version-3'), privatePage); assert.equal(links.length, 3);
});
