const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const { transformSync } = require('esbuild');

const ui = path.resolve(__dirname, '../packages/ui-default');
const source = transformSync(fs.readFileSync(path.join(ui, 'pages/scratch_library_manage.page.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const template = fs.readFileSync(path.join(ui, 'templates/scratch_library_manage.html'), 'utf8');
const env = new nunjucks.Environment(new (nunjucks.Loader.extend({ getSource(name) {
    return { src: name === 'domain_base.html' ? '{% block domain_content %}{% endblock %}' : template, path: name };
} }))(), { autoescape: true });
const urls = { domain_scratch_library: '/d/art/domain/scratch-library', scratch_library: '/d/art/scratch/library', scratch_main: '/d/art/scratch' };
const preset = (id, kind = 'sprite', overrides = {}) => ({
    id, title: `素材 ${id}`, kind, filename: `${id}.${kind === 'sound' ? 'wav' : 'png'}`,
    size: 200, mime: kind === 'sound' ? 'audio/wav' : 'image/png', fileUrl: `/d/art/scratch/file/${id}`, ...overrides,
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
const response = (body, ok = true) => ({ ok, json: async () => body });

function setup(t, presets = [], loadSpritePreview = async () => { throw new Error('unexpected sprite preview'); }) {
    const html = env.render('scratch_library_manage.html', { presets, maxFileSize: 20971520, url: (name) => urls[name] });
    const dom = new JSDOM(html, { url: 'https://onebyone.test/d/art/domain/scratch-library', runScripts: 'outside-only' });
    t.after(() => dom.window.close());
    const { window } = dom;
    const requests = [];
    const xhrs = [];
    const observers = [];
    const objects = new Map();
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
    window.HTMLMediaElement.prototype.pause = function () {};
    window.URL.createObjectURL = (blob) => { const url = `blob:test-${objects.size}`; objects.set(url, blob); return url; };
    window.URL.revokeObjectURL = (url) => objects.delete(url);
    window.IntersectionObserver = class {
        constructor(callback) { this.callback = callback; this.nodes = new Set(); observers.push(this); }
        observe(node) { this.nodes.add(node); }
        unobserve(node) { this.nodes.delete(node); }
        disconnect() { this.nodes.clear(); }
        visible(node) { this.callback([{ target: node, isIntersecting: true }]); }
    };
    window.fetch = (url, options = {}) => new Promise((resolve, reject) => {
        requests.push({ url, options, resolve, reject });
        options.signal?.addEventListener('abort', () => reject(new window.DOMException('Aborted', 'AbortError')));
    });
    window.XMLHttpRequest = class {
        constructor() { this.upload = {}; this.headers = {}; xhrs.push(this); }
        open(method, url) { this.method = method; this.url = url; }
        setRequestHeader(name, value) { this.headers[name] = value; }
        send(body) { this.body = body; }
        abort() { this.onabort?.(); }
        reply(status, body) { this.status = status; this.responseText = typeof body === 'string' ? body : JSON.stringify(body); this.onload(); }
    };
    const module = { exports: {} };
    let initialize;
    new window.Function('require', 'module', 'exports', source)((name) => {
        if (name === '../utils/scratch-preset-preview') return { loadScratchSpritePreview: loadSpritePreview };
        assert.equal(name, 'vj/misc/Page');
        return { NamedPage: class { constructor(pageName, callback) {
            assert.equal(pageName, 'scratch_library_manage', 'NamedPage must match the template filename');
            initialize = callback;
            callback();
        } } };
    }, module, module.exports);
    const query = (selector) => window.document.querySelector(selector);
    const all = (selector) => [...window.document.querySelectorAll(selector)];
    const selectFiles = (files, kind = 'sprite') => {
        query('[data-library-upload-kind]').value = kind;
        query('[data-library-upload-kind]').dispatchEvent(new window.Event('change'));
        const picker = query('[data-library-files]');
        Object.defineProperty(picker, 'files', { configurable: true, value: files });
        picker.dispatchEvent(new window.Event('change'));
    };
    const file = (name, content = 'bytes') => new window.File([content], name);
    return { window, query, all, requests, xhrs, observers, objects, initialize, selectFiles, file, html };
}

test('teacher template escapes filenames and titles, counts each category, and filters without removing other categories', (t) => {
    const title = '<img src=x onerror=alert(1)> & 小猫';
    const h = setup(t, [preset('a', 'sprite', { title }), preset('b', 'costume'), preset('c', 'sound'), preset('d', 'backdrop')]);
    assert.equal(h.query('[data-library-title]').textContent, title);
    assert.equal(h.query('[onerror]'), null);
    for (const node of h.all('[data-library-count]')) assert.equal(node.textContent, '1');
    assert.equal(h.all('[data-library-grid] [data-library-card]:not([hidden])').length, 1);
    h.query('[data-library-kind=sound]').click();
    assert.equal(h.query('[data-library-grid] [data-library-card]:not([hidden])').dataset.id, 'c');
    assert.equal(h.query('[data-library-kind=sound]').getAttribute('aria-pressed'), 'true');
    const search = h.query('[data-library-search]');
    search.value = 'not found'; search.dispatchEvent(new h.window.Event('input'));
    assert.equal(h.query('[data-library-empty]').hidden, false);
    assert.match(h.query('[data-library-empty-title]').textContent, /没有找到/);
    h.query('[data-library-clear-search]').click();
    assert.equal(h.query('[data-library-empty]').hidden, true);
    assert.equal(h.requests.length, 0, 'browsing categories must not download audio or hidden previews');
});

test('multi-file uploads are sequential; names are editable and only the explicitly failed item is retried', async (t) => {
    const h = setup(t);
    h.selectFiles([h.file('小猫.png'), h.file('小狗.png')]);
    const rows = h.all('[data-library-queue] li');
    assert.equal(rows[0].querySelector('input').value, '小猫');
    rows[0].querySelector('input').value = '  我的角色  ';
    h.query('[data-library-upload-start]').click();
    assert.equal(h.xhrs.length, 1);
    assert.equal(h.xhrs[0].body.get('title'), '我的角色');
    assert.equal(h.xhrs[0].body.get('kind'), 'sprite');
    assert.equal(h.xhrs[0].body.get('file').name, '小猫.png');
    h.xhrs[0].upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 });
    assert.equal(rows[0].querySelector('progress').value, 50);
    h.xhrs[0].reply(200, { ok: true, item: preset('saved-cat', 'sprite', { title: '我的角色' }) });
    await settle();
    assert.equal(h.xhrs.length, 2);
    h.xhrs[1].reply(403, { error: { name: 'ValidationError', message: 'Field {0} validation failed. ({2})', params: ['file', null, '图片内容无效'] } });
    await settle();
    assert.equal(rows[0].dataset.state, 'success');
    assert.equal(rows[1].dataset.state, 'error');
    assert.equal(rows[1].querySelector('[data-upload-result]').textContent, '图片内容无效');
    assert.equal(h.query('[data-library-count=sprite]').textContent, '1');
    assert.equal(h.query('[data-library-upload-start]').disabled, true);
    rows[1].querySelector('[data-upload-retry]').click();
    assert.equal(h.xhrs.length, 3);
    assert.equal(h.xhrs[2].body.get('file').name, '小狗.png');
    h.xhrs[2].reply(200, { ok: true, item: preset('saved-dog') });
    await settle();
    assert.equal(h.query('[data-library-count=sprite]').textContent, '2');
    assert.equal(h.xhrs.filter((xhr) => xhr.body.get('file').name === '小猫.png').length, 1);
    h.initialize();
    h.query('[data-library-upload-open]').click();
    assert.equal(h.query('[data-library-upload-dialog]').open, true);
    h.query('[data-library-clear-completed]').click();
    assert.equal(h.all('[data-library-queue] li').length, 0);
});

test('invalid files never upload and unknown network outcomes cannot be silently repeated', async (t) => {
    const h = setup(t);
    const large = h.file('large.png');
    Object.defineProperty(large, 'size', { value: 20971521 });
    h.selectFiles([large, h.file('wrong.mp3'), h.file('empty.png', ''), h.file('maybe.png')]);
    const rows = h.all('[data-library-queue] li');
    assert.deepEqual(rows.map((row) => row.dataset.state), ['invalid', 'invalid', 'invalid', 'pending']);
    h.query('[data-library-upload-start]').click();
    assert.equal(h.xhrs.length, 1);
    h.xhrs[0].onerror();
    await settle();
    assert.equal(rows[3].dataset.state, 'unknown');
    assert.match(rows[3].textContent, /刷新素材库核实/);
    assert.equal(rows[3].querySelector('[data-upload-retry]').hidden, true);
    h.query('[data-library-upload-start]').click();
    assert.equal(h.xhrs.length, 1, 'unknown outcome must not be re-posted');
});

test('rename is escaped and deletion requires explicit confirmation while preserving counts', async (t) => {
    const h = setup(t, [preset('first')]);
    let legacySubmitting = false;
    h.window.document.addEventListener('click', (event) => {
        if (!event.target.matches('[type=submit]')) return;
        if (legacySubmitting) event.preventDefault();
        legacySubmitting = true;
    });
    h.query('[data-library-action=delete]').click();
    assert.equal(h.requests.length, 0);
    assert.equal(h.query('[data-library-edit-dialog]').open, true);
    h.query('[data-library-edit-dialog] [data-library-dialog-close]').click();
    assert.equal(h.requests.length, 0);
    h.query('[data-library-action=rename]').click();
    const title = '  <svg/onload=alert(1)>  ';
    h.query('[data-library-edit-name]').value = title;
    h.query('[data-library-edit-submit]').click();
    assert.equal(h.requests[0].url, 'https://onebyone.test/d/art/domain/scratch-library/first');
    assert.equal(h.requests[0].options.body.get('operation'), 'rename');
    assert.equal(h.requests[0].options.body.get('title'), title.trim());
    h.requests[0].resolve(response({ ok: true, item: preset('first', 'sprite', { title: title.trim() }) }));
    await settle();
    assert.equal(h.query('[data-library-title]').textContent, title.trim());
    assert.equal(h.query('[onload]'), null);
    h.query('[data-library-action=delete]').click();
    h.query('[data-library-edit-submit]').click();
    assert.equal(h.requests[1].options.body.get('operation'), 'delete');
    h.requests[1].resolve(response({ ok: true }));
    await settle();
    assert.equal(h.all('[data-library-grid] [data-library-card]').length, 0);
    assert.equal(h.query('[data-library-count=sprite]').textContent, '0');
    assert.equal(h.window.document.activeElement, h.query('[data-library-search]'));
});

test('previews reject foreign source URLs, load at most two visible images and release blob URLs on page exit', async (t) => {
    const h = setup(t, [preset('a'), preset('b'), preset('c'), preset('foreign', 'sprite', { fileUrl: 'https://untrusted.test/image.png' })]);
    assert.equal(h.all('[data-library-grid] [data-library-card]').length, 3);
    assert.equal(h.requests.length, 0);
    const observer = h.observers[0];
    for (const card of observer.nodes) observer.visible(card);
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[0].options.credentials, 'same-origin');
    h.requests[0].resolve({ ok: true, headers: { get: () => 'image/png' }, blob: async () => new h.window.Blob(['image']) });
    await settle();
    assert.equal(h.objects.size, 1);
    assert.equal(h.requests.length, 3);
    const image = h.query('[data-library-card][data-id=a] img');
    assert.equal(image.hidden, false);
    assert.equal([...h.objects.values()][0].type, 'image/png');
    h.window.dispatchEvent(new h.window.Event('pagehide'));
    await settle();
    assert.equal(h.objects.size, 0);
    assert.equal(h.requests[1].options.signal.aborted, true);
    assert.equal(h.requests[2].options.signal.aborted, true);
    assert.equal(image.hasAttribute('src'), false);
});

test('sound is fetched only after a click and requires another explicit play action', async (t) => {
    const h = setup(t, [preset('voice', 'sound')]);
    h.query('[data-library-kind=sound]').click();
    assert.equal(h.requests.length, 0);
    h.query('[data-library-card][data-id=voice] [data-library-action=preview]').click();
    assert.equal(h.requests.length, 1);
    h.requests[0].resolve({ ok: true, headers: { get: () => 'audio/wav' }, blob: async () => new h.window.Blob(['wave']) });
    await settle();
    const audio = h.query('[data-library-card][data-id=voice] audio');
    assert.equal(audio.hidden, false);
    assert.equal(audio.autoplay, false);
    assert.equal([...h.objects.values()][0].type, 'audio/wav');
});

test('a stale refresh response cannot remove a newly uploaded asset', async (t) => {
    const h = setup(t);
    h.query('[data-library-refresh]').click();
    h.selectFiles([h.file('new.png')]);
    h.query('[data-library-upload-start]').click();
    h.xhrs[0].reply(200, { ok: true, item: preset('new') });
    await settle();
    h.requests[0].resolve(response({ items: [] }));
    await settle();
    assert.equal(h.query('[data-library-count=sprite]').textContent, '1');
    assert(h.query('[data-library-card][data-id=new]'));
});

test('role package preview shows costume frames, animates only while visible, and releases frames on category changes', async (t) => {
    let disposed = 0;
    const h = setup(t, [preset('role', 'sprite', { filename: 'role.sprite3', mime: 'application/x.scratch.sprite3' })],
        async () => ({ frames: ['blob:costume-red', 'blob:costume-blue'], dispose: () => { disposed++; } }));
    Object.defineProperty(h.window.document, 'hidden', { configurable: true, value: false });
    const intervals = new Map();
    let id = 0;
    h.window.setInterval = (callback) => { intervals.set(++id, callback); return id; };
    h.window.clearInterval = (key) => intervals.delete(key);
    const card = h.query('[data-library-card]');
    h.observers[0].visible(card);
    h.requests[0].resolve({ ok: true, headers: { get: () => 'application/x.scratch.sprite3' }, blob: async () => new h.window.Blob(['sprite']) });
    await settle();
    const image = card.querySelector('img');
    assert.equal(image.src, 'blob:costume-red');
    assert.equal(image.hidden, false);
    assert.equal(intervals.size, 1);
    [...intervals.values()][0]();
    assert.equal(image.src, 'blob:costume-blue');
    Object.defineProperty(h.window.document, 'hidden', { configurable: true, value: true });
    h.window.document.dispatchEvent(new h.window.Event('visibilitychange'));
    assert.equal(intervals.size, 0);
    h.query('[data-library-kind=sound]').click();
    assert.equal(disposed, 1);
    assert.equal(image.hasAttribute('src'), false);
});
