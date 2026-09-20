const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../packages/ui-default/pages/user_login.page.js'), 'utf8');
const code = transformSync(source, { loader: 'js', format: 'cjs' }).code;
const names = ['blue', 'navy', 'peach', 'yellow'];
function fixture(t, options = {}) {
    const scene = `<div data-login-scene aria-hidden="true">${names.map((name) => `
      <div data-character="${name}"><div data-face><i data-eye><span data-pupil></span></i><i data-eye><span data-pupil></span></i></div></div>`).join('')}</div>`;
    const form = options.oauthOnly ? '' : `<form class="one-login__form" method="post">
      <input name="uname" autocomplete="username webauthn"><input id="one-login-password" name="password" type="password" placeholder="请输入密码">
      <input type="checkbox" name="rememberme"><input type="hidden" name="tfa"><input type="hidden" name="authnChallenge">
      <button type="button" data-password-toggle aria-controls="one-login-password" hidden><svg data-eye-open></svg><svg data-eye-closed hidden></svg></button>
      <input type="submit" name="login_submit"></form>`;
    const dom = new JSDOM(scene + form, { url: 'https://onebyone.test/login?redirect=%2Fd%2Fclassroom', runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const { window } = dom;
    const doc = window.document;
    const sceneElement = doc.querySelector('[data-login-scene]');
    const characters = Object.fromEntries(names.map((name) => [name, doc.querySelector(`[data-character="${name}"]`)]));
    let sceneVisible = options.visible !== false;
    let hidden = false;
    let reduced = options.reduced === true;
    let now = 0;
    let nextId = 0;
    const timers = new Map();
    const frames = new Map();
    const motionListeners = new Set();
    window.Math.random = () => 0.5;
    Object.defineProperty(doc, 'hidden', { get: () => hidden });
    window.matchMedia = (query) => {
        assert.equal(query, '(prefers-reduced-motion: reduce)');
        return { get matches() { return reduced; }, addEventListener: (_, callback) => motionListeners.add(callback) };
    };
    window.setTimeout = (callback, delay) => { const id = ++nextId; timers.set(id, { callback, due: now + delay }); return id; };
    window.clearTimeout = (id) => timers.delete(id);
    window.requestAnimationFrame = (callback) => { const id = ++nextId; frames.set(id, callback); return id; };
    window.cancelAnimationFrame = (id) => frames.delete(id);
    const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
    sceneElement.getBoundingClientRect = () => rect(0, 0, sceneVisible ? 550 : 0, sceneVisible ? 400 : 0);
    names.forEach((name, i) => {
        characters[name].getBoundingClientRect = () => rect(i * 100, 0, 100, 300);
        [...characters[name].querySelectorAll('[data-eye]')].forEach((eye, j) => { eye.getBoundingClientRect = () => rect(i * 100 + j * 20, 50, 18, 18); });
    });
    const requests = [];
    window.fetch = (...args) => { requests.push(args); throw new Error('Login decoration must not send requests.'); };
    const module = { exports: {} };
    new window.Function('require', 'module', 'exports', code)((name) => {
        assert.equal(name, 'vj/misc/Page');
        return { NamedPage: class { constructor(page, callback) { assert.equal(page, 'user_login'); callback(); } } };
    }, module, module.exports);
    const flushFrames = () => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(now));
    };
    flushFrames();
    const advance = (ms) => {
        const target = now + ms;
        while (true) {
            const next = [...timers.entries()].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
            if (!next) break;
            const [id, timer] = next;
            now = timer.due;
            timers.delete(id);
            timer.callback();
        }
        now = target;
        flushFrames();
    };
    return {
        window, doc, scene: sceneElement, characters, timers, frames, requests, advance, flushFrames,
        form: doc.querySelector('form'), username: doc.querySelector('[name=uname]'), password: doc.querySelector('[name=password]'), toggle: doc.querySelector('[data-password-toggle]'),
        mouse(x, y) { window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: x, clientY: y })); },
        setPassword(value) { const input = doc.querySelector('[name=password]'); input.value = value; input.dispatchEvent(new window.Event('input')); flushFrames(); },
        reduce(value) { reduced = value; motionListeners.forEach((callback) => callback({ matches: value })); flushFrames(); },
        hide(value) { hidden = value; doc.dispatchEvent(new window.Event('visibilitychange')); flushFrames(); },
        visible(value) { sceneVisible = value; window.dispatchEvent(new window.Event('resize')); flushFrames(); },
    };
}

describe('OneByOne login character interactions', () => {
    it('batches mouse movement into one requested frame and constrains face, body and pupil movement', (t) => {
        const h = fixture(t);
        assert.equal(h.scene.dataset.loginState, 'idle');
        assert.equal(h.scene.dataset.loginMotion, 'on');
        h.mouse(600, 200);
        h.mouse(1000, 400);
        assert.equal(h.frames.size, 1);
        h.flushFrames();
        assert.equal(h.frames.size, 0, 'there must not be a persistent animation frame loop');
        assert.equal(h.characters.blue.style.getPropertyValue('--face-x'), '15px');
        assert.equal(h.characters.blue.style.getPropertyValue('--face-y'), '10px');
        assert.equal(h.characters.blue.style.getPropertyValue('--body-skew'), '-6deg');
        for (const name of names) {
            for (const eye of h.characters[name].querySelectorAll('[data-eye]')) {
                const distance = Math.hypot(parseFloat(eye.style.getPropertyValue('--pupil-x')), parseFloat(eye.style.getPropertyValue('--pupil-y')));
                assert(distance <= (name === 'navy' ? 4 : 5) + 0.01);
            }
        }
    });

    it('glances briefly on username focus, then retains typing posture until blur', (t) => {
        const h = fixture(t);
        h.username.focus(); h.flushFrames();
        assert.equal(h.scene.dataset.loginState, 'typing');
        assert.equal(h.scene.dataset.loginGlance, 'true');
        assert.equal(h.characters.blue.style.getPropertyValue('--face-y'), '25px');
        h.advance(800);
        assert.equal(h.scene.dataset.loginGlance, 'false');
        assert.equal(h.scene.dataset.loginState, 'typing');
        h.username.blur(); h.flushFrames();
        assert.equal(h.scene.dataset.loginState, 'idle');
    });

    it('reveals passwords without changing their value or submitting, turns away and limits peeking to the blue character', (t) => {
        const h = fixture(t);
        let submissions = 0;
        h.form.addEventListener('submit', (event) => { submissions++; event.preventDefault(); });
        assert.equal(h.toggle.hasAttribute('hidden'), false, 'enhancement should reveal the initially hidden toggle');
        assert(h.toggle.querySelector('[data-eye-open]') instanceof h.window.SVGElement);
        assert.equal(h.toggle.querySelector('[data-eye-open]').hasAttribute('hidden'), false);
        assert.equal(h.toggle.querySelector('[data-eye-closed]').hasAttribute('hidden'), true);
        const secret = 'private-password-not-for-animation';
        h.setPassword(secret);
        assert.equal(h.scene.dataset.loginState, 'password-hidden');
        h.toggle.click(); h.flushFrames();
        assert.equal(h.password.type, 'text');
        assert.equal(h.password.value, secret);
        assert.equal(h.toggle.getAttribute('aria-pressed'), 'true');
        assert.equal(h.toggle.getAttribute('aria-label'), '隐藏密码');
        assert.equal(h.toggle.querySelector('[data-eye-open]').hasAttribute('hidden'), true);
        assert.equal(h.toggle.querySelector('[data-eye-closed]').hasAttribute('hidden'), false);
        assert.equal(h.scene.dataset.loginState, 'password-visible');
        assert.equal(h.characters.blue.querySelector('[data-eye]').style.getPropertyValue('--pupil-x'), '-4px');
        h.advance(3500);
        assert.equal(h.scene.dataset.loginPeek, 'true');
        assert.equal(h.characters.blue.querySelector('[data-eye]').style.getPropertyValue('--pupil-x'), '4px');
        assert.equal(h.characters.navy.querySelector('[data-eye]').style.getPropertyValue('--pupil-x'), '-4px');
        h.advance(800);
        assert.equal(h.scene.dataset.loginPeek, 'false');
        h.toggle.click(); h.flushFrames();
        assert.equal(h.password.type, 'password');
        assert.equal(h.toggle.getAttribute('aria-label'), '显示密码');
        assert.equal(h.toggle.querySelector('[data-eye-open]').hasAttribute('hidden'), false);
        assert.equal(h.toggle.querySelector('[data-eye-closed]').hasAttribute('hidden'), true);
        assert.equal(h.scene.dataset.loginState, 'password-hidden');
        h.setPassword('');
        h.toggle.click(); h.flushFrames();
        assert.equal(h.scene.dataset.loginState, 'idle', 'revealing an empty password must not start peeking');
        assert.equal(submissions, 0);
        assert.equal(h.requests.length, 0);
        assert.equal(h.window.localStorage.length, 0);
        assert(!h.doc.documentElement.outerHTML.includes(secret));
        assert.equal(new h.window.URL(h.form.action).searchParams.get('redirect'), '/d/classroom');
    });

    it('blinks without changing layout dimensions and pauses all timers and mouse tracking for reduced motion', (t) => {
        const h = fixture(t);
        h.advance(5000);
        assert.equal(h.characters.blue.dataset.blink, 'true');
        assert.equal(h.characters.navy.dataset.blink, 'true');
        assert.notEqual(h.characters.peach.dataset.blink, 'true');
        h.advance(150);
        assert.equal(h.characters.blue.dataset.blink, 'false');
        h.reduce(true);
        assert.equal(h.scene.dataset.loginMotion, 'off');
        assert.equal(h.timers.size, 0);
        h.mouse(900, 200);
        assert.equal(h.frames.size, 0);
        h.advance(20000);
        assert.equal(h.characters.blue.dataset.blink, 'false');
        h.setPassword('still-usable'); h.toggle.click(); h.flushFrames();
        assert.equal(h.password.type, 'text');
        assert.equal(h.scene.dataset.loginState, 'password-visible');
        assert.equal(h.timers.size, 0, 'reduced motion disables periodic peeking as well');
        h.reduce(false);
        assert.equal(h.scene.dataset.loginMotion, 'on');
        assert.equal(h.timers.size, 3, 'only two blink timers and one peek timer resume');
    });

    it('cleans up pending frames and timers on visibility changes and repeated BFCache navigation', (t) => {
        const h = fixture(t);
        h.mouse(700, 50);
        assert.equal(h.frames.size, 1);
        h.hide(true);
        assert.equal(h.frames.size, 0);
        assert.equal(h.timers.size, 0);
        h.hide(false);
        assert.equal(h.timers.size, 2);
        for (let i = 0; i < 2; i++) {
            h.window.dispatchEvent(new h.window.PageTransitionEvent('pagehide', { persisted: true }));
            assert.equal(h.timers.size, 0);
            assert.equal(h.frames.size, 0);
            h.mouse(800, 300);
            assert.equal(h.frames.size, 0);
            h.window.dispatchEvent(new h.window.PageTransitionEvent('pageshow', { persisted: true }));
            h.flushFrames();
            assert.equal(h.timers.size, 2, 'BFCache restore must not duplicate animation loops');
        }
    });

    it('keeps a hidden mobile scene idle and supports pages with only external authentication', (t) => {
        const h = fixture(t, { visible: false, oauthOnly: true });
        assert.equal(h.scene.dataset.loginState, 'idle');
        assert.equal(h.scene.dataset.loginMotion, 'off');
        assert.equal(h.frames.size, 0);
        assert.equal(h.timers.size, 0);
        h.visible(true);
        assert.equal(h.scene.dataset.loginMotion, 'on');
        assert.equal(h.timers.size, 2);
        h.visible(false);
        assert.equal(h.timers.size, 0);
        assert.equal(h.frames.size, 0);
    });
});
