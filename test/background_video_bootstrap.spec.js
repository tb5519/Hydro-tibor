const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');
const templateRoot = path.resolve(__dirname, '../packages/ui-default/templates');
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templateRoot), { autoescape: true });
function fixture(reduced = false, source = '/home/video?v=version', warm = false) {
    const html = '<div data-loop-background><img src="/picture.jpg">'
        + env.render('partials/background_video.html', { backgroundVideoSource: source, backgroundVideoPoster: '/home/video-poster?v=version' }) + '</div>';
    const frames = new Map(); let count = 0;
    const dom = new JSDOM(html, { url: 'https://site.test/', runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(win) {
            win.matchMedia = () => ({ matches: reduced });
            win.UiContext = JSON.stringify({ backgroundVideoWarmup: { scope: '9:system' } });
            if (warm) win.sessionStorage.setItem('onebyone-background-video-ready:v1:9:system', JSON.stringify({ 'https://site.test/home/video?v=version': Date.now() }));
            const prototype = win.HTMLMediaElement.prototype;
            Object.defineProperty(prototype, 'readyState', { get() { return this._ready || 0; } });
            Object.defineProperty(prototype, 'paused', { get() { return this._paused !== false; } });
            prototype.pause = function () { this._paused = true; };
            prototype.load = function () {};
            win.HTMLVideoElement.prototype.requestVideoFrameCallback = (callback) => { frames.set(++count, callback); return count; };
            win.HTMLVideoElement.prototype.cancelVideoFrameCallback = (id) => frames.delete(id);
        } });
    return { dom, root: dom.window.document.querySelector('[data-loop-background]'), video: dom.window.document.querySelector('video'),
        frame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); } };
}
test('HTML declares early muted preload and reveals a decoded frame before any application bundle is loaded', () => {
    const f = fixture(); const win = f.dom.window;
    try {
        assert.equal(f.video.getAttribute('src'), '/home/video?v=version');
        for (const name of ['autoplay', 'muted', 'loop', 'playsinline']) assert(f.video.hasAttribute(name));
        assert.equal(f.video.preload, 'auto');
        assert(!f.root.classList.contains('is-video-playing'));
        f.video._ready = 2; f.video._paused = false; f.video.dispatchEvent(new win.Event('playing'));
        assert(!f.root.classList.contains('is-video-playing'));
        f.frame(); assert(f.root.classList.contains('is-video-playing'));
        assert.equal(f.video.dataset.backgroundFrameReady, 'true');
        f.video.dispatchEvent(new win.Event('error')); assert(!f.root.classList.contains('is-video-playing'));
        assert(f.root.querySelector('img'));
    } finally { f.dom.window.close(); }
});
test('the early bootstrap retires without removing an already visible frame when the complete player adopts it', () => {
    const f = fixture(); const win = f.dom.window;
    try {
        f.video._ready = 2; f.video._paused = false; f.video.dispatchEvent(new win.Event('playing'));
        f.video.dispatchEvent(new win.Event('hydro-background-managed')); f.frame();
        assert(!f.root.classList.contains('is-video-playing'), 'stale first paint callback was cancelled');
        f.video.dispatchEvent(new win.Event('playing')); f.frame(); assert(!f.root.classList.contains('is-video-playing'));
    } finally { f.dom.window.close(); }
});
test('reduced motion leaves the image and declines early native autoplay; source remains escaped HTML data', () => {
    const f = fixture(true, '/home/video?v=" onload="alert(1)');
    try {
        assert.equal(f.video.getAttribute('src'), null); assert(!f.video.hasAttribute('autoplay'));
        assert.equal(f.video.getAttribute('onload'), null); assert(f.root.querySelector('img'));
    } finally { f.dom.window.close(); }
});

test('warm re-entry shows the matching video cover while decoding, without pretending the video is already playing', () => {
    const f = fixture(false, '/home/video?v=version', true); const win = f.dom.window;
    try {
        assert(f.root.classList.contains('is-video-restoring'));
        assert(!f.root.classList.contains('is-video-playing'));
        assert.equal(f.video.poster, 'https://site.test/home/video-poster?v=version');
        f.video._ready = 2; f.video._paused = false; f.video.dispatchEvent(new win.Event('playing')); f.frame();
        assert(!f.root.classList.contains('is-video-restoring'));
        assert(f.root.classList.contains('is-video-playing'));
    } finally { f.dom.window.close(); }
    const failed = fixture(false, '/home/video?v=version', true);
    try {
        failed.video.dispatchEvent(new failed.dom.window.Event('error'));
        assert(!failed.root.classList.contains('is-video-restoring')); assert(failed.root.querySelector('img'));
    } finally { failed.dom.window.close(); }
});
