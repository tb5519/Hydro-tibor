const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const Y = require('../build/live-share/node_modules/yjs');

const file = path.join(__dirname, '../packages/ui-default/components/live_share/editor.ts');
const source = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
function load(extra = {}) {
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module, exports: module.exports, btoa, atob, Uint8Array, setTimeout, clearTimeout, queueMicrotask,
        require(name) {
            if (name === './vendor') return { Y, MonacoBinding: class { constructor() { throw Error('Unexpected Monaco in textarea test'); } } };
            // Selection geometry is exercised with the actual surface in live_share_code_focus.browser.spec.js.
            if (name === './annotation') return { attachAnnotationSurface: () => ({ render() {}, dispose() {} }) };
            return require(name);
        },
        ...extra,
    }, { filename: file });
    return module.exports;
}
const { CollaborativeText } = load();
function pair(t, value = 'print("hello")', sourceOptions = {}) {
    const events = [];
    const status = [];
    const common = { pageId: 'page-1', editorId: 'editor-1' };
    const student = new CollaborativeText({ ...common, role: 'source', value, send: (data) => events.push(['teacher', data]), ...sourceOptions });
    const teacher = new CollaborativeText({ ...common, role: 'viewer', send: (data) => events.push(['student', data]), onStatus: (data) => status.push(data) });
    const init = () => teacher.receive({ ...common, type: 'edit:init', state: student.snapshot });
    const flush = () => {
        let iterations = 0;
        student.flushOutgoing(); teacher.flushOutgoing();
        while (events.length) {
            assert.ok(++iterations < 1000, 'sync must not echo indefinitely');
            const [recipient, data] = events.shift();
            (recipient === 'teacher' ? teacher : student).receive(data);
            student.flushOutgoing(); teacher.flushOutgoing();
        }
    };
    init();
    t.after(() => { student.dispose(); teacher.dispose(); });
    return { student, teacher, events, status, init, flush, common };
}

it('source seeds the document exactly once; reconnect snapshots never duplicate text', (t) => {
    const p = pair(t);
    p.init(); p.init();
    assert.equal(p.teacher.value, 'print("hello")');
    assert.equal(p.teacher.pendingCount, 0);
    assert.equal(p.events.length, 0);
});

it('simultaneous student code and teacher comments converge without replacing each other', (t) => {
    const p = pair(t);
    p.student.replace('a = 1\nprint("hello")');
    p.teacher.replace('print("hello")\n# 老师：这里还可以改进');
    assert.equal(p.teacher.pendingCount, 1);
    p.events.reverse(); // Exercise a delivery order different from the local edit order.
    p.flush();
    assert.equal(p.student.value, 'a = 1\nprint("hello")\n# 老师：这里还可以改进');
    assert.equal(p.teacher.value, p.student.value);
    assert.equal(p.teacher.pendingCount, 0);
});

it('concurrent inserts at the same position retain both contributions', (t) => {
    const p = pair(t, 'xy');
    p.student.replace('x学生y');
    p.teacher.replace('x老师y');
    p.flush();
    assert.equal(p.student.value, p.teacher.value);
    assert.match(p.student.value, /^x(?:学生老师|老师学生)y$/);
});

it('each participant can undo and redo only their own contribution', (t) => {
    const p = pair(t, 'base');
    p.student.replace('student\nbase');
    p.teacher.replace('base\nteacher');
    p.flush();
    p.teacher.undo(); p.flush();
    assert.equal(p.student.value, 'student\nbase');
    p.teacher.redo(); p.flush();
    assert.equal(p.student.value, 'student\nbase\nteacher');
    p.student.undo(); p.flush();
    assert.equal(p.teacher.value, 'base\nteacher');
});

it('teacher changes remain pending until the student applies and acknowledges them', (t) => {
    const p = pair(t, 'base');
    p.teacher.replace('base\nnote');
    p.teacher.flushOutgoing();
    const operation = p.events.shift()[1];
    assert.equal(p.teacher.pendingCount, 1);
    p.student.receive(operation);
    assert.equal(p.student.value, 'base\nnote');
    assert.equal(p.teacher.pendingCount, 1, 'relay acceptance alone is not an acknowledgement');
    const acknowledgement = p.events.shift()[1];
    assert.equal(acknowledgement.type, 'edit:ack');
    p.teacher.receive(acknowledgement);
    assert.equal(p.teacher.pendingCount, 0);
});

it('lost acknowledgements retry idempotently after a reconnect and preserve offline student edits', (t) => {
    const p = pair(t, 'base');
    p.teacher.replace('base\nnote');
    p.teacher.flushOutgoing();
    p.student.receive(p.events.shift()[1]);
    p.events.length = 0; // Simulate an acknowledgement lost on the wire.
    p.teacher.setConnected(false); p.student.setConnected(false);
    assert.equal(p.teacher.replace('should not write'), false);
    p.student.replace('offline\nbase\nnote');
    assert.equal(p.teacher.pendingCount, 1);
    p.teacher.setConnected(true); p.student.setConnected(true);
    assert.equal(p.teacher.editable, false, 'teacher waits for source snapshot');
    p.init(); p.flush();
    assert.equal(p.teacher.value, 'offline\nbase\nnote');
    assert.equal(p.teacher.value, p.student.value);
    assert.equal(p.teacher.pendingCount, 0);
    assert.equal(p.teacher.editable, true);
});

it('old page/editor operations and teacher init attempts cannot overwrite source code', (t) => {
    const p = pair(t, 'base');
    p.teacher.replace('changed');
    p.teacher.flushOutgoing();
    const operation = p.events.shift()[1];
    assert.equal(p.student.receive({ ...operation, pageId: 'previous-page' }), false);
    assert.equal(p.student.receive({ ...operation, editorId: 'another-editor' }), false);
    assert.equal(p.student.receive({ ...p.common, type: 'edit:init', state: p.teacher.snapshot }), false);
    assert.equal(p.student.value, 'base');
});

it('invalid updates are rejected without acknowledgement or modifying the current code', (t) => {
    const p = pair(t, 'base');
    assert.equal(p.student.receive({ ...p.common, type: 'edit:update', opId: 'invalid', update: '!bad' }), false);
    assert.equal(p.student.value, 'base');
    assert.equal(p.events.length, 0);
});

it('textarea IME commits before queued remote edits, preserving both changes', (t) => {
    const p = pair(t, 'base');
    p.student.pauseIncoming(true);
    p.teacher.replace('base\nteacher');
    p.teacher.flushOutgoing();
    p.student.receive(p.events.shift()[1]);
    assert.equal(p.student.value, 'base');
    p.student.replace('中文\nbase');
    p.student.pauseIncoming(false);
    p.flush();
    assert.equal(p.student.value, '中文\nbase\nteacher');
    assert.equal(p.teacher.value, p.student.value);
});

it('a hidden source rejects late teacher operations without ACK while preserving its own local input', (t) => {
    let foreground = true;
    const p = pair(t, 'base', { canWrite: () => foreground, localWritable: () => true });
    foreground = false;
    p.teacher.replace('base\nteacher');
    p.teacher.flushOutgoing();
    const pending = p.events.shift()[1];
    assert.equal(p.student.receive(pending), false);
    assert.equal(p.events.length, 0, 'a rejected edit must not be acknowledged');
    assert.equal(p.teacher.pendingCount, 1);
    assert.equal(p.student.replace('student\nbase'), true);
    foreground = true;
    p.init(); p.flush();
    assert.equal(p.student.value, 'student\nbase\nteacher');
    assert.equal(p.teacher.value, p.student.value);
    assert.equal(p.teacher.pendingCount, 0);
});

it('readonly source rejects teacher writes, and too-large textarea edits are not silently sent', (t) => {
    const messages = [];
    const shared = new CollaborativeText({ role: 'source', value: 'locked', pageId: 'p', editorId: 'e', canWrite: () => false, send: (message) => messages.push(message) });
    t.after(() => shared.dispose());
    assert.equal(shared.replace('overwrite'), false);
    const p = pair(t, 'small');
    assert.equal(p.teacher.replace('x'.repeat(64 * 1024 + 1)), false);
    assert.equal(p.teacher.value, 'small');
    assert.match(p.status.at(-1).error, /尚未同步/);
});

it('rapid typing is merged into one update and outstanding unacknowledged writes pause editing', (t) => {
    const p = pair(t, '');
    for (let index = 1; index <= 100; index++) p.teacher.replace('x'.repeat(index));
    assert.equal(p.events.length, 0);
    assert.equal(p.teacher.pendingCount, 1);
    p.teacher.flushOutgoing();
    assert.equal(p.events.length, 1);
    p.flush();
    assert.equal(p.student.value, 'x'.repeat(100));
    for (let index = 1; index <= 128; index++) {
        p.teacher.replace('x'.repeat(100 + index));
        p.teacher.flushOutgoing();
    }
    assert.equal(p.teacher.pendingCount, 128);
    assert.equal(p.teacher.editable, false);
    p.flush();
    assert.equal(p.teacher.editable, true);
    assert.equal(p.teacher.pendingCount, 0);
});

it('editor removal retains unacknowledged teacher work for recovery instead of silently discarding it', async (t) => {
    const dom = new JSDOM('<div id="viewer"></div>', { url: 'https://example.test/p/1' });
    t.after(() => dom.window.close());
    const { window } = dom;
    const api = load({ window, document: window.document, Event: window.Event, getComputedStyle: window.getComputedStyle });
    const p = pair(t, 'base');
    const viewer = api.attachViewerEditors({ pageId: 'page-1', container: window.document.getElementById('viewer'), send() {} });
    t.after(() => viewer.dispose());
    viewer.receive({ ...p.common, type: 'edit:init', state: p.student.snapshot, kind: 'textarea' });
    const textarea = window.document.querySelector('textarea');
    textarea.value = 'base\n# 尚未确认';
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(viewer.getPendingDrafts()[0].value, textarea.value);
    viewer.receive({ ...p.common, type: 'edit:remove' });
    assert.equal(window.document.querySelector('textarea'), null);
    assert.equal(viewer.getPendingDrafts()[0].value, 'base\n# 尚未确认');
    viewer.dispose();
    assert.equal(viewer.getPendingDrafts()[0].value, 'base\n# 尚未确认');
});

it('oversized Monaco and textarea drafts report once instead of leaving an unexplained blank mirror', async (t) => {
    const dom = new JSDOM('<div id="monaco"></div><textarea name="code"></textarea>', { url: 'https://example.test/p/1', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const { window } = dom;
    const document = window.document;
    const value = 'x'.repeat(64 * 1024 + 1);
    const textarea = document.querySelector('textarea');
    textarea.value = value;
    Object.defineProperty(textarea, 'getClientRects', { value: () => [{ left: 0, top: 0, width: 300, height: 200 }] });
    const model = { getValueLength: () => value.length, getValue: () => value, isDisposed: () => false };
    window.editor = { getModel: () => model, getDomNode: () => document.getElementById('monaco') };
    const statuses = [];
    const sent = [];
    const api = load({ window, document, Event: window.Event, getComputedStyle: window.getComputedStyle });
    const source = api.attachSourceEditors({ pageId: 'p', send: (message) => sent.push(message), onStatus: (status) => statuses.push(status) });
    t.after(() => source.dispose());
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(statuses.length, 2, 'one warning per oversized editor, not one per scan');
    assert.ok(statuses.every((status) => /原代码已保留/.test(status.error)));
    assert.equal(textarea.value, value);
    assert.equal(model.getValue(), value);
    assert.equal(sent.length, 0);
});

it('textarea adapter synchronizes student input events without touching teacher drafts or private inputs', async (t) => {
    const dom = new JSDOM('<textarea name="code">print(1)</textarea><textarea name="private-note">private</textarea><input type="password" value="secret"><div id="viewer"></div>', { url: 'https://example.test/p/1', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const { window } = dom;
    const document = window.document;
    const code = document.querySelector('[name="code"]');
    Object.defineProperties(code, {
        getClientRects: { value: () => [{ left: 10, top: 20, width: 300, height: 150 }] },
        getBoundingClientRect: { value: () => ({ left: 10, top: 20, width: 300, height: 150 }) },
    });
    const original = { teacherDraft: 'keep this exact code' };
    window.editor = original;
    window.localStorage.setItem('teacher-draft', 'original');
    let studentSaved = '';
    code.addEventListener('input', () => { studentSaved = code.value; });
    const api = load({ window, document, Event: window.Event, getComputedStyle: window.getComputedStyle, HTMLTextAreaElement: window.HTMLTextAreaElement });
    const events = [];
    const student = api.attachSourceEditors({ pageId: 'p', send: (message) => events.push(['teacher', message]) });
    const teacher = api.attachViewerEditors({ pageId: 'p', container: document.getElementById('viewer'), send: (message) => events.push(['student', message]) });
    t.after(() => { teacher.dispose(); student.dispose(); });
    async function flush() {
        for (let tick = 0; tick < 3; tick++) {
            await new Promise((resolve) => setTimeout(resolve, 110));
            while (events.length) {
                const [to, message] = events.shift();
                (to === 'student' ? student : teacher).receive(message);
            }
        }
    }
    await flush();
    const textarea = document.querySelector('#viewer textarea');
    assert.ok(textarea);
    assert.equal(document.querySelector('[name="private-note"]').hasAttribute('data-live-share-editor'), false);
    assert.equal(document.querySelector('[type="password"]').hasAttribute('data-live-share-editor'), false);
    textarea.value = 'print(1)\n# 老师注释';
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    await flush();
    assert.equal(code.value, 'print(1)\n# 老师注释');
    assert.equal(studentSaved, code.value, 'normal source input persistence runs for remote edits');
    assert.equal(window.editor, original);
    assert.equal(window.localStorage.getItem('teacher-draft'), 'original');
    teacher.setConnected(false);
    assert.equal(textarea.readOnly, true);
    teacher.dispose(); student.dispose();
    assert.equal(code.hasAttribute('data-live-share-editor'), false);
    assert.equal(window.editor, original);
    assert.equal(document.getElementById('viewer').children.length, 0);
});

it('annotation documents acknowledge and resume independently without dirtying or unlocking read-only code', (t) => {
    const code = pair(t, 'const unchanged = true;', { canWrite: () => false });
    const events = [];
    const common = { ...code.common, document: 'annotations' };
    const source = new CollaborativeText({ ...common, role: 'source', send: (message) => events.push(message) });
    const viewer = new CollaborativeText({ ...common, role: 'viewer', send: (message) => events.push(message) });
    t.after(() => { source.dispose(); viewer.dispose(); });
    viewer.receive({ ...common, type: 'edit:init', state: source.snapshot });
    viewer.doc.transact(() => viewer.doc.getMap('notes').set('first', { text: '这是批注' }), viewer.localOrigin);
    viewer.flushOutgoing();
    const update = events.shift();
    assert.equal(update.document, 'annotations');
    assert.equal(code.student.receive(update), false, 'annotation packets cannot enter the code document');
    assert.equal(code.teacher.receive(update), false);
    assert.equal(source.receive(update), true);
    const ack = events.shift();
    assert.equal(ack.document, 'annotations');
    assert.equal(source.doc.getMap('notes').get('first').text, '这是批注');
    // Drop the ACK and reconnect: replay must not duplicate or lose notes.
    viewer.setConnected(false); viewer.setConnected(true);
    viewer.receive({ ...common, type: 'edit:init', state: source.snapshot });
    source.receive(events.shift()); viewer.receive(events.shift());
    assert.equal(viewer.pendingCount, 0);
    assert.equal(source.doc.getMap('notes').size, 1);
    assert.equal(code.student.value, 'const unchanged = true;');
    assert.equal(code.student.changed, false);
    assert.equal(code.student.undoManager.undoStack.length, 0);
    assert.equal(code.student.editable, false);
    assert.equal(code.student.doc.getMap('notes').size, 0);
});

it('code geometry revisions detect pure deletions even when the Yjs insertion clock stays unchanged', (t) => {
    const p = pair(t, 'remove\nkeep');
    const previousVector = Y.encodeStateVector(p.student.doc);
    const previousRevision = p.student.revision;
    p.student.replace('keep');
    assert.deepEqual(Y.encodeStateVector(p.student.doc), previousVector, 'this reproduces a delete-only update');
    assert.notEqual(p.student.revision, previousRevision);
    p.flush();
    assert.equal(p.teacher.revision, p.student.revision, 'equal merged code histories produce the same geometry revision');
});
