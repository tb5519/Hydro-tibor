const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const jqueryFactory = require('jquery');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../packages/ui-default');
const compile = (file) => transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const component = compile('components/profile_badge_sound.ts');
const page = compile('pages/user_detail.page.ts');
const control = '<span hidden data-profile-badge-sound="/badge/9/theme-sound?v=2" data-profile-badge-sound-name="幸运女神"></span>';
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const deferred = () => {
    let resolve; let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

function fixture(options = {}) {
    const dom = new JSDOM(`<section id="profile">${options.markup ?? control}</section><div id="unrelated"></div>`, {
        url: 'https://onebyone.example/user/28', pretendToBeVisual: true,
    });
    const { window } = dom;
    const { document } = window;
    const $ = jqueryFactory(window);
    let hidden = !!options.hidden;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const sounds = [];
    class Audio extends window.EventTarget {
        constructor(source) {
            super();
            this.src = source;
            this.paused = true;
            this.ended = false;
            this.currentTime = 0;
            this.playCalls = 0;
            this.pauseCalls = 0;
            this.loadCalls = 0;
            sounds.push(this);
        }
        play() {
            this.playCalls++;
            this.paused = false;
            this.ended = false;
            return options.play?.(this.playCalls) || Promise.resolve();
        }
        pause() { this.pauseCalls++; this.paused = true; this.dispatchEvent(new window.Event('pause')); }
        load() { this.loadCalls++; }
        removeAttribute(name) { if (name === 'src') this.src = ''; }
        finish() { this.ended = true; this.paused = true; this.dispatchEvent(new window.Event('ended')); }
    }
    const componentModule = { exports: {} };
    vm.runInNewContext(component, { module: componentModule, exports: componentModule.exports, document, window, Audio });
    const pageModule = { exports: {} };
    vm.runInNewContext(page, {
        module: pageModule, exports: pageModule.exports, document, window,
        require: (name) => {
            if (name === 'jquery') return $;
            if (name === 'vj/components/profile_badge_sound') return componentModule.exports;
            if (name === 'vj/misc/Page') return { NamedPage: class { constructor(name, afterLoading) { this.afterLoading = afterLoading; } } };
            throw Error(`Unexpected dependency: ${name}`);
        },
    });
    return {
        window, document, sounds, $, Audio,
        bind: () => componentModule.exports.bindProfileBadgeSound(document),
        initPage: () => pageModule.exports.default.afterLoading(),
        source: () => document.querySelector('[data-profile-badge-sound]'),
        hide: (value) => { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
        cleanup() {
            componentModule.exports.disposeProfileBadgeSound(document);
            $(document).off('.profileBadgeSound');
            window.close();
        },
    };
}

describe('profile badge sound', () => {
    it('tries the supplied sound once at a moderate volume without adding visible controls', async () => {
        const f = fixture();
        try {
            f.bind(); f.bind(); await settle();
            assert.equal(f.sounds.length, 1);
            assert.equal(f.sounds[0].playCalls, 1);
            assert.equal(f.sounds[0].src, '/badge/9/theme-sound?v=2');
            assert.equal(f.sounds[0].volume, 0.25);
            assert.equal(f.sounds[0].loop, false);
            assert.equal(f.source().dataset.soundState, 'playing');
            assert.equal(f.source().hidden, true);
            assert.equal(f.document.querySelector('button'), null);
        } finally { f.cleanup(); }
    });

    it('retries blocked autoplay on one ordinary click or key gesture without interfering with its action', async () => {
        for (const eventName of ['click', 'keydown']) {
            const blocked = Object.assign(Error('autoplay blocked'), { name: 'NotAllowedError' });
            const f = fixture({ play: (count) => (count === 1 ? Promise.reject(blocked) : Promise.resolve()) });
            try {
                f.bind(); await settle();
                assert.equal(f.source().dataset.soundState, 'blocked');
                assert.equal(f.source().textContent, '');
                const target = f.document.getElementById('unrelated');
                let actions = 0;
                target.addEventListener(eventName, () => { actions++; });
                const gesture = eventName === 'keydown'
                    ? new f.window.KeyboardEvent(eventName, { key: 'a', bubbles: true, cancelable: true })
                    : new f.window.Event(eventName, { bubbles: true, cancelable: true });
                assert.equal(target.dispatchEvent(gesture), true);
                await settle();
                assert.equal(actions, 1);
                assert.equal(gesture.defaultPrevented, false);
                assert.equal(f.sounds[0].playCalls, 2);
                assert.equal(f.source().dataset.soundState, 'playing');
                f.document.dispatchEvent(new f.window.Event('click'));
                f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'b' }));
                await settle();
                assert.equal(f.sounds[0].playCalls, 2, 'both gesture retry listeners must be removed after success');
            } finally { f.cleanup(); }
        }
    });

    it('silently stops retrying if the one allowed gesture retry is also blocked', async () => {
        const blocked = Object.assign(Error('autoplay blocked'), { name: 'NotAllowedError' });
        const f = fixture({ play: () => Promise.reject(blocked) });
        try {
            f.bind(); await settle();
            f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Shift' }));
            f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'a', repeat: true }));
            assert.equal(f.sounds[0].playCalls, 1, 'modifier and repeated keys are not the retry gesture');
            f.document.dispatchEvent(new f.window.Event('click')); await settle();
            assert.equal(f.sounds[0].playCalls, 2);
            f.document.dispatchEvent(new f.window.Event('click'));
            f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'a' }));
            await settle();
            assert.equal(f.sounds[0].playCalls, 2);
            assert.equal(f.source().dataset.soundState, 'blocked');
            assert.equal(f.source().textContent, '');
        } finally { f.cleanup(); }
    });

    it('does not loop or restart a finished greeting on later interactions', async () => {
        const f = fixture();
        try {
            f.bind(); await settle();
            f.sounds[0].finish();
            assert.equal(f.source().dataset.soundState, 'ended');
            f.document.dispatchEvent(new f.window.Event('click'));
            await settle();
            assert.equal(f.sounds[0].playCalls, 1);
        } finally { f.cleanup(); }
    });

    it('stops when hidden and clears any blocked-autoplay retry before returning', async () => {
        for (const block of [false, true]) {
            const f = fixture({ play: () => (block ? Promise.reject(Object.assign(Error('blocked'), { name: 'NotAllowedError' })) : Promise.resolve()) });
            try {
                f.bind(); await settle();
                const sound = f.sounds[0];
                sound.currentTime = 4;
                f.hide(true);
                assert.equal(sound.paused, true);
                assert.equal(sound.currentTime, 0);
                f.hide(false);
                f.document.dispatchEvent(new f.window.Event('click'));
                await settle();
                assert.equal(sound.playCalls, 1);
            } finally { f.cleanup(); }
        }
    });

    it('waits for a background tab to become visible before its first automatic attempt', async () => {
        const f = fixture({ hidden: true });
        try {
            f.bind(); await settle();
            assert.equal(f.sounds.length, 0);
            f.hide(false); await settle();
            assert.equal(f.sounds.length, 1);
            assert.equal(f.sounds[0].playCalls, 1);
            f.hide(true); f.hide(false); await settle();
            assert.equal(f.sounds[0].playCalls, 1);
        } finally { f.cleanup(); }
    });

    it('stops bfcache pages without replay on restore and releases media on ordinary page exits', async () => {
        const f = fixture();
        try {
            f.bind(); await settle();
            const sound = f.sounds[0];
            f.window.dispatchEvent(new f.window.PageTransitionEvent('pagehide', { persisted: true }));
            assert.equal(sound.paused, true);
            f.window.dispatchEvent(new f.window.PageTransitionEvent('pageshow', { persisted: true }));
            f.document.dispatchEvent(new f.window.Event('click'));
            await settle();
            assert.equal(sound.playCalls, 1);
            f.window.dispatchEvent(new f.window.PageTransitionEvent('pagehide', { persisted: false }));
            assert.equal(sound.src, '');
            assert.equal(sound.loadCalls, 1);
        } finally { f.cleanup(); }
    });

    it('uses real PJAX lifecycle events to dispose only the removed profile and bind its replacement once', async () => {
        const f = fixture();
        try {
            f.initPage(); f.initPage(); await settle();
            assert.equal(f.sounds.length, 1);
            const first = f.sounds[0];
            f.$(f.document.getElementById('unrelated')).trigger('vjContentRemove');
            assert.equal(first.paused, false);
            const section = f.document.getElementById('profile');
            f.$(section).trigger('vjContentRemove');
            assert.equal(first.paused, true);
            assert.equal(first.src, '');
            section.innerHTML = control;
            f.$(section).trigger('vjContentNew');
            f.$(section).trigger('vjContentNew');
            await settle();
            assert.equal(f.sounds.length, 2);
            assert.equal(f.sounds[1].playCalls, 1);
        } finally { f.cleanup(); }
    });

    it('does not revive a disposed player or install gesture retries after a pending play settles late', async () => {
        for (const fail of [false, true]) {
            const pending = deferred();
            const f = fixture({ play: () => pending.promise });
            try {
                const dispose = f.bind();
                assert.equal(f.source().dataset.soundState, 'loading');
                dispose();
                if (fail) pending.reject(Object.assign(Error('blocked'), { name: 'NotAllowedError' }));
                else pending.resolve();
                await settle();
                f.document.dispatchEvent(new f.window.Event('click'));
                await settle();
                assert.equal(f.sounds[0].playCalls, 1);
                assert.equal(f.sounds[0].paused, true);
                assert.equal(f.sounds[0].src, '');
                assert.equal(f.source().dataset.soundState, 'disposed');
            } finally { f.cleanup(); }
        }
    });

    it('pauses audio again if a pending play resolves after the page was hidden', async () => {
        const pending = deferred();
        const f = fixture({ play: () => pending.promise });
        try {
            f.bind();
            f.hide(true);
            f.sounds[0].paused = false;
            pending.resolve(); await settle();
            assert.equal(f.sounds[0].paused, true);
            assert.equal(f.source().dataset.soundState, 'stopped');
            f.hide(false); await settle();
            assert.equal(f.sounds[0].playCalls, 1);
        } finally { f.cleanup(); }
    });

    it('handles an unavailable media file silently without repeated attempts', async () => {
        const f = fixture();
        try {
            f.bind(); await settle();
            f.sounds[0].dispatchEvent(new f.window.Event('error'));
            assert.equal(f.source().dataset.soundState, 'error');
            assert.equal(f.source().textContent, '');
            f.document.dispatchEvent(new f.window.Event('click'));
            await settle();
            assert.equal(f.sounds[0].playCalls, 1);
        } finally { f.cleanup(); }
    });

    it('creates no player when there is no sound source or it is empty', async () => {
        for (const markup of ['', '<span hidden data-profile-badge-sound=""></span>']) {
            const f = fixture({ markup });
            try { f.initPage(); await settle(); assert.equal(f.sounds.length, 0); } finally { f.cleanup(); }
        }
    });
});
