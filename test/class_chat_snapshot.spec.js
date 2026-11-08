const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const root = path.resolve(__dirname, '..');
const code = esbuild.buildSync({ entryPoints: [path.join(root, 'packages/ui-default/components/class_chat/snapshot.ts')],
  bundle: true, write: false, format: 'cjs', platform: 'node' }).outputFiles[0].text;
function fixture(html = '<div id="scratchpad"><div id="editor"></div></div>') {
  const dom = new JSDOM(html, { url: 'https://example.test/d/classroom/p/54' });
  dom.window.UiContext = { pdoc: { domainId: 'classroom', docId: 54 }, codeLang: 'cc.cc14',
    classChat: { problem: { pid: 54, domainId: 'classroom', grant: 'server-grant' } } };
  dom.window.UserContext = { _id: 40 };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, TextEncoder });
  return { dom, window: dom.window, ...module.exports };
}

it('sends the live editor version at click time, not an older saved draft or later edits', async (t) => {
  const f = fixture(); t.after(() => f.dom.window.close());
  let live = 'cout << "此刻";';
  f.window.store = { getState: () => ({ editor: { code: 'old', lang: 'cc.cc14' } }) };
  f.window.editor = { getDomNode: () => f.window.document.querySelector('#editor'), getValue: () => live };
  const pending = f.captureProblemSnapshot(); live = 'later';
  const result = await pending;
  assert.equal(result.code, 'cout << "此刻";');
  assert.equal(result.lang, 'cc.cc14'); assert.equal(result.grant, 'server-grant');
});

it('keeps an intentionally empty draft and handles the standard submit textarea', async (t) => {
  const f = fixture('<section name="submit_section"><textarea name="code"></textarea><input name="lang" value="py.py3"></section>');
  t.after(() => f.dom.window.close());
  f.window.localStorage.setItem('40/classroom/54', 'stale');
  const result = await f.captureProblemSnapshot();
  assert.equal(result.code, ''); assert.equal(result.lang, 'py.py3');
});

it('from the statement, uses only the current contest draft and never a chat or mirrored editor', async (t) => {
  const f = fixture('<aside data-live-share-private><textarea>private conversation</textarea><div id="editor"></div></aside>');
  t.after(() => f.dom.window.close());
  f.window.UiContext.tdoc = { _id: 'contest-one' };
  f.window.editor = { getDomNode: () => f.window.document.querySelector('#editor'), getValue: () => 'private conversation' };
  f.window.localStorage.setItem('40/classroom/54', 'not this contest');
  f.window.localStorage.setItem('40/classroom/54@contest-one', 'contest code');
  f.window.localStorage.setItem('40/classroom/54@contest-one#lang', 'py.py3');
  const result = await f.captureProblemSnapshot();
  assert.equal(result.code, 'contest code'); assert.equal(result.lang, 'py.py3');
});

it('does not send IDE/review code or a problem that was not granted on this page', async (t) => {
  const f = fixture(); t.after(() => f.dom.window.close());
  f.window.UiContext.ideMode = true; assert.equal(await f.captureProblemSnapshot(), null);
  f.window.UiContext.ideMode = false; f.window.UiContext.homeworkReview = {};
  assert.equal(f.canCaptureProblemSnapshot(), false);
  delete f.window.UiContext.homeworkReview; delete f.window.UiContext.classChat.problem;
  assert.equal(await f.captureProblemSnapshot(), null);
});

it('refuses an oversized code snapshot rather than silently truncating the student code', async (t) => {
  const f = fixture(); t.after(() => f.dom.window.close());
  f.window.store = { getState: () => ({ editor: { code: '字'.repeat(50000), lang: 'cc.cc14' } }) };
  await assert.rejects(f.captureProblemSnapshot(), /128KB/);
});

it('persistent chat captures the active content document after navigation and never the previous page', async (t) => {
  const f = fixture(); const child = fixture('<section name="submit_section"><textarea name="code">print("current page")</textarea><input name="lang" value="py.py3"></section>');
  t.after(() => { f.dom.window.close(); child.dom.window.close(); });
  f.window.store = { getState: () => ({ editor: { code: 'stale parent code' } }) };
  child.window.UiContext.classChat.problem = { pid: 76, domainId: 'python', grant: 'current-grant' };
  let active = child.window;
  f.window.__onebyonePlatformShell = { contentWindow: () => active };
  assert.deepEqual(JSON.parse(JSON.stringify(await f.captureProblemSnapshot())), {
    pid: 76, domainId: 'python', code: 'print("current page")', lang: 'py.py3', grant: 'current-grant',
  });
  child.window.UiContext = { ideMode: true };
  assert.equal(f.canCaptureProblemSnapshot(), false, 'the IDE does not reuse a previous problem grant');
  active = null;
  assert.equal(await f.captureProblemSnapshot(), null, 'a loading content frame does not fall back to stale parent content');
});

it('persistent chat refuses a newly logged-in account before the host has been replaced', async (t) => {
  const f = fixture(); const child = fixture();
  t.after(() => { f.dom.window.close(); child.dom.window.close(); });
  child.window.UserContext._id = 41;
  f.window.__onebyonePlatformShell = { contentWindow: () => child.window };
  assert.equal(await f.captureProblemSnapshot(), null);
  f.window.__onebyonePlatformShell.contentWindow = () => { throw new Error('frame left the origin'); };
  assert.equal(f.canCaptureProblemSnapshot(), false);
});

it('snapshot page escapes student code and labels, and remains private in shared screens', () => {
  const template = fs.readFileSync(path.join(root, 'packages/ui-default/templates/class_chat_snapshot.html'), 'utf8');
  const env = new nunjucks.Environment({ getSource(name) {
    return { src: name === 'class_chat_snapshot.html' ? template : '{% block content %}{% endblock %}', path: name };
  } }, { autoescape: true });
  env.addGlobal('datetimeSpan', () => '2026-11-08 10:20');
  env.addFilter('content', () => '<p>题目正文</p>');
  const output = env.render('class_chat_snapshot.html', {
    snapshot: { title: '<img src=x onerror=alert(1)>', code: '</code><script>alert(1)</script>',
      lang: 'cc.cc14', pid: 54, content: '', problemUrl: '/d/classroom/p/54' },
    sender: { name: '<script>private</script>' }, message: { createdAt: new Date() }, handler: { user: { viewLang: 'zh' } },
  });
  const dom = new JSDOM(output);
  assert.equal(dom.window.document.querySelectorAll('script,img').length, 0);
  assert.equal(dom.window.document.querySelector('[data-chat-snapshot-code]').textContent, '</code><script>alert(1)</script>');
  assert(dom.window.document.querySelector('main[data-live-share-private]'));
  dom.window.close();
});
