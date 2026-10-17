const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const script = esbuild.transformSync(fs.readFileSync(path.join(root, 'packages/ui-default/common/markdown-image-paste.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs', target: 'es2022',
}).code;

function harness(t, options = {}) {
    const dom = new JSDOM('<form><textarea></textarea><div data-status></div><button type="submit">保存</button></form>', {
        url: 'https://example.test/d/scratch/problem/create', pretendToBeVisual: true,
    });
    const { window } = dom;
    const { document } = window;
    const textarea = document.querySelector('textarea');
    const status = document.querySelector('[data-status]');
    const form = document.querySelector('form');
    const uploads = [];
    const changes = [];
    const pendingChanges = [];
    let saveCount = 0;
    class FakeXHR {
        constructor() { this.upload = new window.EventTarget(); this.aborted = false; }
        abort() { this.aborted = true; if (!options.finishAfterAbort) this.cancel?.(); }
    }
    const request = {
        postFile(url, data, settings) {
            const xhr = settings.xhr();
            const upload = { url, data, settings, xhr, settled: false };
            const promise = new Promise((resolve, reject) => {
                upload.resolve = () => { upload.settled = true; resolve({ url: 'https://temporary.example/image?expires=1' }); };
                upload.reject = (error = new Error('网络中断')) => { upload.settled = true; reject(error); };
                xhr.cancel = () => { if (!upload.settled) upload.reject(new Error('aborted')); };
            });
            uploads.push(upload);
            return promise;
        },
    };
    const mod = { exports: {} };
    vm.runInNewContext(script, {
        module: mod, exports: mod.exports,
        require(name) {
            if (name === '../utils/base') return { request };
            if (name.endsWith('.styl')) return {};
            throw new Error(`Unexpected import: ${name}`);
        },
        window, document, Event: window.Event, FormData: window.FormData, XMLHttpRequest: FakeXHR,
        UiContext: { domainId: options.domainId === undefined ? 'Scratch 课堂' : options.domainId },
        UserContext: { _id: 42 },
    });
    const binding = mod.exports.attachMarkdownImagePaste(textarea, status, {
        onChange(value) { changes.push(value); options.onChange?.(value); },
        onPendingChange(pending) { pendingChanges.push(pending); },
    });
    form.addEventListener('submit', () => { saveCount += 1; });
    t.after(() => { binding.dispose(); window.close(); });
    function file(name = 'screen.png', type = 'image/png', size) {
        const value = new window.File(['image'], name, { type });
        if (size !== undefined) Object.defineProperty(value, 'size', { value: size });
        return value;
    }
    function paste(files = [], { text = '', filesOnly = false, target = textarea } = {}) {
        const event = new window.Event('paste', { bubbles: true, cancelable: true });
        const items = filesOnly ? [] : files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f }));
        if (text) items.push({ kind: 'string', type: 'text/plain', getAsString: (callback) => callback(text) });
        Object.defineProperty(event, 'clipboardData', { value: { items, files, getData: () => text } });
        target.dispatchEvent(event);
        return event;
    }
    function input(value, cursor = value.length) {
        textarea.value = value;
        textarea.setSelectionRange(cursor, cursor);
        textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    }
    function button(label, row = status) {
        return [...row.querySelectorAll('button')].find((item) => item.textContent === label);
    }
    function submit() {
        const event = new window.Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(event);
        return event;
    }
    function waitFor(check, message = 'image upload state') {
        return new Promise((resolve, reject) => {
            let observer;
            let timer;
            const inspect = () => {
                if (!check()) return;
                observer?.disconnect();
                clearTimeout(timer);
                resolve();
            };
            observer = new window.MutationObserver(inspect);
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
            timer = setTimeout(() => { observer.disconnect(); reject(new Error(`Timed out waiting for ${message}`)); }, 5000);
            inspect();
        });
    }
    function progress(index, loaded, total, lengthComputable = true) {
        const event = new window.Event('progress');
        Object.assign(event, { loaded, total, lengthComputable });
        uploads[index].xhr.upload.dispatchEvent(event);
    }
    return { window, document, textarea, status, form, binding, uploads, changes, pendingChanges,
        file, paste, input, button, submit, waitFor, progress, saveCount: () => saveCount,
        attach: mod.exports.attachMarkdownImagePaste };
}

describe('screenshot paste into Markdown editors', () => {
    it('leaves ordinary text, non-image files, and disabled/read-only editors untouched', (t) => {
        const h = harness(t);
        h.input('任务说明', 2);
        assert.equal(h.paste([], { text: '继续输入' }).defaultPrevented, false);
        assert.equal(h.paste([h.file('notes.txt', 'text/plain')]).defaultPrevented, false);
        assert.equal(h.textarea.value, '任务说明');
        assert.equal(h.textarea.selectionStart, 2);
        h.textarea.disabled = true;
        assert.equal(h.paste([h.file()]).defaultPrevented, false);
        h.textarea.disabled = false;
        h.textarea.readOnly = true;
        assert.equal(h.paste([h.file()]).defaultPrevented, false);
        assert.equal(h.uploads.length, 0);
        assert.deepEqual(h.changes, []);
    });

    it('inserts at the selected position, preserves later typing/selection and uses a durable current-domain file URL', async (t) => {
        const h = harness(t);
        h.input('前面的说明|被替换|后面的内容');
        h.textarea.setSelectionRange(6, 9);
        const event = h.paste([h.file()]);
        assert.equal(event.defaultPrevented, true);
        assert.equal(h.uploads.length, 1);
        const marker = h.textarea.value.match(/【待插入图片·[^】]+】/)[0];
        assert.equal(h.textarea.value, `前面的说明|\n${marker}\n|后面的内容`);
        assert.equal(h.uploads[0].url, '/d/Scratch%20%E8%AF%BE%E5%A0%82/file');
        assert.equal(h.uploads[0].data.get('operation'), 'upload_file');
        assert.equal(h.uploads[0].data.get('file').type, 'image/png');
        const filename = h.uploads[0].data.get('filename');
        const next = `${h.textarea.value}，补充细节`;
        h.input(next);
        h.textarea.setSelectionRange(next.length - 4, next.length, 'backward');
        h.textarea.scrollTop = 45;
        const ready = h.waitFor(() => !h.binding.hasPending() && !!h.status.querySelector('img'));
        h.uploads[0].resolve();
        await ready;
        const link = `![截图](/d/Scratch%20%E8%AF%BE%E5%A0%82/file/42/${filename}?noDisposition=1)`;
        assert.equal(h.textarea.value, next.replace(marker, link));
        assert.equal(h.textarea.value.slice(h.textarea.selectionStart, h.textarea.selectionEnd), '补充细节');
        assert.equal(h.textarea.selectionDirection, 'backward');
        assert.equal(h.textarea.scrollTop, 45);
        assert.equal(h.changes.at(-1), h.textarea.value);
        assert.equal(h.textarea.getAttribute('aria-busy'), 'false');
        assert.ok(h.pendingChanges.includes(true));
        assert.equal(h.pendingChanges.at(-1), false);
        assert.doesNotMatch(h.textarea.value, /temporary\.example|待插入图片/);
    });

    it('keeps multiple images in clipboard order while uploading sequentially and reports real progress', async (t) => {
        const h = harness(t);
        h.paste([h.file('first.png'), h.file('second.jpg', 'image/jpeg'), h.file('third.webp', 'image/webp')]);
        assert.equal(h.uploads.length, 1);
        assert.equal(h.status.querySelectorAll('progress').length, 3);
        h.button('移除').focus();
        const focusedAction = h.document.activeElement.dataset.imageAction;
        h.progress(0, 3, 4);
        assert.match(h.status.textContent, /75%/);
        assert.equal(h.status.querySelector('progress').value, 75);
        assert.equal(h.document.activeElement.dataset.imageAction, focusedAction);
        h.progress(0, 0, 0, false);
        assert.equal(h.status.querySelector('progress').value, 75);
        for (let i = 0; i < 3; i += 1) {
            const ready = h.waitFor(() => i === 2 ? !h.binding.hasPending() : h.uploads.length === i + 2);
            h.uploads[i].resolve();
            await ready;
        }
        const filenames = h.uploads.map((upload) => upload.data.get('filename'));
        assert.match(filenames[0], /\.png$/);
        assert.match(filenames[1], /\.jpg$/);
        assert.match(filenames[2], /\.webp$/);
        assert.equal(new Set(filenames).size, 3);
        assert.ok(h.textarea.value.indexOf(filenames[0]) < h.textarea.value.indexOf(filenames[1]));
        assert.ok(h.textarea.value.indexOf(filenames[1]) < h.textarea.value.indexOf(filenames[2]));
        assert.equal(h.status.querySelectorAll('img').length, 3);
        assert.equal(h.submit().defaultPrevented, false);
    });

    it('supports browsers that expose clipboard files without file items', async (t) => {
        const h = harness(t, { domainId: '' });
        h.paste([h.file('screen.gif', 'image/gif')], { filesOnly: true });
        assert.equal(h.uploads.length, 1);
        assert.equal(h.uploads[0].url, '/file');
        const ready = h.waitFor(() => !h.binding.hasPending());
        h.uploads[0].resolve();
        await ready;
        assert.match(h.textarea.value, /!\[截图\]\(\/file\/42\/pasted-.*\.gif\?noDisposition=1\)/);
    });

    it('preserves content after upload failure, blocks saving and retries in the same position', async (t) => {
        const h = harness(t);
        h.input('题干');
        h.paste([h.file()]);
        h.input(`${h.textarea.value}继续编写的说明`);
        const before = h.textarea.value;
        const failed = h.waitFor(() => !!h.button('重试'));
        h.uploads[0].reject(new Error('<网络错误>'));
        await failed;
        assert.equal(h.textarea.value, before);
        assert.equal(h.status.querySelector('网络错误'), null);
        assert.match(h.status.textContent, /<网络错误>/);
        assert.equal(h.submit().defaultPrevented, true);
        assert.equal(h.saveCount(), 0);
        h.button('重试').click();
        assert.equal(h.uploads.length, 2);
        assert.equal(h.uploads[1].data.get('filename'), h.uploads[0].data.get('filename'));
        const ready = h.waitFor(() => !h.binding.hasPending() && !!h.status.querySelector('img'));
        h.uploads[1].resolve();
        await ready;
        assert.match(h.textarea.value, /^题干\n!\[截图\].*\n继续编写的说明$/);
        assert.equal(h.submit().defaultPrevented, false);
        assert.equal(h.saveCount(), 1);
    });

    it('rejects oversized/unsupported/many images before changing any content or uploading', (t) => {
        const h = harness(t);
        h.input('原有内容', 2);
        for (const [files, message] of [
            [[h.file('huge.png', 'image/png', 10 * 1024 * 1024 + 1)], /超过 10 MB/],
            [[h.file('unsafe.svg', 'image/svg+xml')], /PNG、JPG、GIF 或 WebP/],
            [[h.file(), h.file('unknown.bmp', 'image/bmp')], /PNG、JPG、GIF 或 WebP/],
            [Array.from({ length: 11 }, () => h.file()), /最多粘贴 10 张/],
        ]) {
            assert.equal(h.paste(files).defaultPrevented, true);
            assert.match(h.status.textContent, message);
            assert.equal(h.textarea.value, '原有内容');
            assert.equal(h.textarea.selectionStart, 2);
            assert.equal(h.uploads.length, 0);
            assert.equal(h.binding.hasPending(), false);
        }
        assert.equal(h.submit().defaultPrevented, false);
    });

    it('reserves room for the final image link when the editor approaches its character limit', (t) => {
        const h = harness(t);
        h.textarea.maxLength = 200;
        h.input('x'.repeat(190));
        h.paste([h.file()]);
        assert.equal(h.textarea.value, 'x'.repeat(190));
        assert.equal(h.uploads.length, 0);
        assert.match(h.status.textContent, /长度上限/);
    });

    it('never restores an upload marker that the teacher deletes while the request is in flight', async (t) => {
        const h = harness(t, { finishAfterAbort: true });
        h.input('开头');
        h.paste([h.file()]);
        h.input('开头\n只保留这段文字');
        assert.equal(h.uploads[0].xhr.aborted, true);
        assert.equal(h.binding.hasPending(), false);
        // The remote upload may already have finished when cancellation arrives.
        h.uploads[0].resolve();
        await Promise.resolve();
        assert.equal(h.textarea.value, '开头\n只保留这段文字');
        assert.equal(h.status.querySelector('img'), null);
        assert.equal(h.submit().defaultPrevented, false);
    });

    it('removes active and queued images independently without uploading or reinserting a removed image', async (t) => {
        const h = harness(t);
        h.paste([h.file('first.png'), h.file('second.png'), h.file('third.png')]);
        const markers = h.textarea.value.match(/【待插入图片·[^】]+】/g);
        h.button('移除', h.status.querySelectorAll('.markdown-image-paste__row')[1]).click();
        assert.equal(h.textarea.value.includes(markers[1]), false);
        const next = h.waitFor(() => h.uploads.length === 2);
        h.button('移除', h.status.querySelector('.markdown-image-paste__row')).click();
        await next;
        assert.equal(h.uploads[0].xhr.aborted, true);
        assert.equal(h.textarea.value.includes(markers[0]), false);
        assert.match(h.uploads[1].data.get('filename'), /-3\.png$/);
        const ready = h.waitFor(() => !h.binding.hasPending() && !!h.status.querySelector('img'));
        h.uploads[1].resolve();
        await ready;
        assert.equal((h.textarea.value.match(/!\[截图\]/g) || []).length, 1);
        assert.doesNotMatch(h.textarea.value, /待插入图片/);
    });

    it('does not resurrect a failed image after its marker has been removed', async (t) => {
        const h = harness(t);
        h.paste([h.file()]);
        const failed = h.waitFor(() => !!h.button('重试'));
        h.uploads[0].reject();
        await failed;
        // A controlled editor may replace its value before dispatching its next input event.
        h.textarea.value = '用文字说明即可';
        h.button('重试').click();
        assert.equal(h.uploads.length, 1);
        assert.equal(h.textarea.value, '用文字说明即可');
        assert.equal(h.binding.hasPending(), false);
        assert.equal(h.button('重试'), undefined);
        assert.equal(h.submit().defaultPrevented, false);
    });

    it('blocks save and navigation while uploading, then permits a save once all images finish', async (t) => {
        const h = harness(t);
        h.paste([h.file()]);
        assert.equal(h.submit().defaultPrevented, true);
        assert.equal(h.saveCount(), 0);
        assert.match(h.status.textContent, /图片还在上传/);
        const beforeUnload = new h.window.Event('beforeunload', { cancelable: true });
        h.window.dispatchEvent(beforeUnload);
        assert.equal(beforeUnload.defaultPrevented, true);
        const ready = h.waitFor(() => !h.binding.hasPending() && !!h.status.querySelector('img'));
        h.uploads[0].resolve();
        await ready;
        assert.equal(h.submit().defaultPrevented, false);
        assert.equal(h.saveCount(), 1);
        assert.doesNotMatch(h.status.textContent, /图片还在上传/);
        const afterUpload = new h.window.Event('beforeunload', { cancelable: true });
        h.window.dispatchEvent(afterUpload);
        assert.equal(afterUpload.defaultPrevented, false);
    });

    it('intercepts save button clicks before delegated legacy save hooks while uploads are pending or failed', async (t) => {
        const h = harness(t);
        const saveButton = h.form.querySelector('button[type=submit]');
        saveButton.innerHTML = '<span>保存</span>';
        let delegatedSaves = 0;
        h.document.addEventListener('click', (event) => {
            if (event.target.closest('button') === saveButton) delegatedSaves += 1;
        });
        const click = () => {
            const event = new h.window.Event('click', { bubbles: true, cancelable: true });
            saveButton.firstChild.dispatchEvent(event);
            return event;
        };
        h.paste([h.file()]);
        assert.equal(click().defaultPrevented, true);
        assert.equal(delegatedSaves, 0);
        const failed = h.waitFor(() => !!h.button('重试'));
        h.uploads[0].reject();
        await failed;
        assert.equal(click().defaultPrevented, true);
        assert.equal(delegatedSaves, 0);
        h.button('移除').click();
        assert.equal(click().defaultPrevented, false);
        assert.equal(delegatedSaves, 1);
        assert.doesNotMatch(h.status.textContent, /还在上传|尚未上传成功/);
    });

    it('aborts and detaches on editor disposal without changing content after an upload settles', async (t) => {
        const h = harness(t);
        h.paste([h.file()]);
        const before = h.textarea.value;
        const changeCount = h.changes.length;
        h.binding.dispose();
        assert.equal(h.uploads[0].xhr.aborted, true);
        h.uploads[0].resolve();
        await Promise.resolve();
        assert.equal(h.textarea.value, before);
        assert.equal(h.changes.length, changeCount);
        assert.equal(h.paste([h.file()]).defaultPrevented, false);
        assert.equal(h.submit().defaultPrevented, false);
    });
});

async function objectiveEditorHarness(t) {
    const h = harness(t);
    const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT };
    global.window = h.window;
    global.document = h.document;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const React = require('react');
    const ReactDOM = require('react-dom/client');
    const container = h.document.createElement('div');
    container.dataset.objectiveEditor = '';
    container.dataset.initial = JSON.stringify({ editing: false, cancelUrl: '/p', title: '截图判断题', tags: ['Scratch 基础'],
        objective: { kind: 'judge', stem: '观察下面的积木', answers: ['A'] } });
    h.document.body.append(container);
    let reactRoot;
    const calls = [];
    const mod = { exports: {} };
    const page = esbuild.transformSync(fs.readFileSync(path.join(root, 'packages/ui-default/pages/problem_objective_edit.page.tsx'), 'utf8'), {
        loader: 'tsx', format: 'cjs', target: 'es2022',
    }).code;
    vm.runInNewContext(page, {
        module: mod, exports: mod.exports, window: h.window, document: h.document,
        requestAnimationFrame: (callback) => callback(),
        require(name) {
            if (name === 'react') return React;
            if (name === 'react-dom/client') return { createRoot(element) { reactRoot = ReactDOM.createRoot(element); return reactRoot; } };
            if (name === 'vj/misc/Page') return { NamedPage: class { constructor(name, callback) { this.callback = callback; } } };
            if (name === 'vj/utils') return { request: { post(url, body) { calls.push({ url, body }); return Promise.resolve({ url: '#saved' }); } } };
            if (name === '../common/markdown-image-paste') return { attachMarkdownImagePaste: h.attach };
            if (name === '../common/objective-markdown') return { createObjectiveMarkdown: () => require('markdown-it')({ html: false }) };
            throw new Error(`Unexpected import: ${name}`);
        },
    });
    await React.act(async () => mod.exports.default.callback());
    const query = (selector) => container.querySelector(selector);
    const paste = async () => React.act(async () => h.paste([h.file()], { target: query('#objective-stem') }));
    const submit = async () => React.act(async () => query('form').dispatchEvent(new h.window.Event('submit', { bubbles: true, cancelable: true })));
    return { ...h, query, calls, paste, submit, act: React.act,
        async cleanup() {
            await React.act(async () => reactRoot.unmount());
            global.window = previous.window;
            global.document = previous.document;
            global.IS_REACT_ACT_ENVIRONMENT = previous.act;
        } };
}

describe('screenshot paste page integration', () => {
    it('keeps the real controlled objective stem, preview and saved payload synchronized', async (t) => {
        const h = await objectiveEditorHarness(t);
        try {
            const stem = h.query('#objective-stem');
            stem.setSelectionRange(stem.value.length, stem.value.length);
            await h.paste();
            assert.equal(h.uploads.length, 1);
            assert.equal(h.query('button[type=submit]').disabled, true);
            await h.submit();
            assert.equal(h.calls.length, 0);
            await h.act(async () => h.uploads[0].resolve());
            assert.equal(h.query('button[type=submit]').disabled, false);
            const image = h.query('.objective-preview .objective-markdown img');
            assert.ok(image, 'the inserted screenshot must render in the teacher preview');
            assert.match(image.getAttribute('src'), /^\/d\/Scratch%20%E8%AF%BE%E5%A0%82\/file\/42\//);
            assert.doesNotMatch(stem.value, /待插入图片/);
            await h.submit();
            assert.equal(h.calls.length, 1);
            assert.equal(JSON.parse(h.calls[0].body.objective).stem, stem.value.trim());
            assert.ok(JSON.parse(h.calls[0].body.objective).stem.includes(image.getAttribute('src')));
        } finally { await h.cleanup(); }
    });

    it('blocks the real objective submit handler on failure and saves only after the failed image is removed', async (t) => {
        const h = await objectiveEditorHarness(t);
        try {
            await h.paste();
            await h.act(async () => h.uploads[0].reject());
            await h.submit();
            assert.equal(h.calls.length, 0);
            assert.match(h.query('[data-objective-stem-image-status]').textContent, /尚未上传成功/);
            const remove = [...h.query('[data-objective-stem-image-status]').querySelectorAll('button')].find((button) => button.textContent === '移除');
            await h.act(async () => remove.click());
            assert.doesNotMatch(h.query('#objective-stem').value, /待插入图片/);
            await h.submit();
            assert.equal(h.calls.length, 1);
            assert.equal(JSON.parse(h.calls[0].body.objective).stem, '观察下面的积木');
        } finally { await h.cleanup(); }
    });

    it('binds the Scratch task description once across repeated page initialization', (t) => {
        const h = harness(t);
        h.form.dataset.scratchProblemForm = '';
        h.textarea.name = 'description';
        h.status.dataset.scratchDescriptionImageStatus = '';
        const calls = [];
        const mod = { exports: {} };
        const page = esbuild.transformSync(fs.readFileSync(path.join(root, 'packages/ui-default/pages/scratch_problem_edit.page.ts'), 'utf8'), {
            loader: 'ts', format: 'cjs', target: 'es2022',
        }).code;
        vm.runInNewContext(page, {
            module: mod, exports: mod.exports, document: h.document,
            require(name) {
                if (name === 'vj/misc/Page') return { NamedPage: class { constructor(names, callback) { this.names = names; this.callback = callback; } } };
                if (name === '../common/markdown-image-paste') return { attachMarkdownImagePaste: (...args) => calls.push(args) };
                throw new Error(`Unexpected import: ${name}`);
            },
        });
        assert.deepEqual(Array.from(mod.exports.default.names), ['scratch_problem_project_create', 'scratch_problem_edit']);
        mod.exports.default.callback();
        mod.exports.default.callback();
        assert.equal(calls.length, 1);
        assert.equal(calls[0][0], h.textarea);
        assert.equal(calls[0][1], h.status);
    });
});
