const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { it } = require('node:test');
const nunjucks = require('nunjucks');

const html5 = fs.readFileSync(path.resolve(__dirname, '../packages/ui-default/templates/layout/html5.html'), 'utf8');
// Render the real shared layout with a page that has stateful inline scripts.
// Only unrelated component partials are stubbed; inheritance and its conditionals are real.
const loader = new (nunjucks.Loader.extend({
  getSource(name) {
    let src = '';
    if (name === 'layout/html5.html') src = html5;
    else if (name === 'fixture.html') src = `{% extends "layout/html5.html" %}
      {% block body %}<main data-page-content>Actual application</main><script>window.pageSideEffect = true;</script>{% endblock %}
      {% block script %}<script>window.pageScriptSideEffect = true;</script>{% endblock %}`;
    else if (name === 'partials/broadcast_dialog.html') src = '<dialog data-broadcast></dialog><script>window.broadcastSideEffect = true;</script>';
    else if (name === 'partials/teacher_assistant.html') src = '<button data-teacher-assistant>Assistant</button>';
    return { src, path: name, noCache: true };
  },
}))();
const environment = new nunjucks.Environment(loader, { autoescape: true });
environment.addFilter('json', JSON.stringify);
environment.addFilter('jsesc', value => value.replace(/'/g, "\\'"));

function render({ method = 'get', destination = 'document', legacy = false, ie = false, page = 'main' } = {}) {
  return environment.render('fixture.html', {
    handler: {
      user: {}, session: { legacy },
      request: { method, path: '/d/C0001/', headers: { 'sec-fetch-dest': destination, 'user-agent': 'test' } },
      context: { request: { url: '/d/C0001/' } }, renderTitle: () => 'Application',
    },
    page_name: page, layout_name: 'basic',
    UiContext: { cdn_prefix: '/', constantVersion: 'test', domainId: 'C0001' },
    UserContext: { _id: 2, viewLang: 'zh', fontFamily: 'Arial', codeFontFamily: 'monospace' },
    model: { system: { get: () => 'http://localhost/' } }, global: { Hydro: { version: { 'ui-default': 'test' } } },
    process: { env: {} }, Object, isIE: () => ie, assetUrl: value => value, _: value => value,
  });
}

it('top-level GET contains only the persistent host and one shared assistant', () => {
  const output = render();
  assert.match(output, /data-platform-shell="host"/);
  assert.doesNotMatch(output, /data-page-content|pageSideEffect|pageScriptSideEffect|data-broadcast|broadcastSideEffect/);
  assert.equal((output.match(/data-teacher-assistant/g) || []).length, 1);
  assert.match(output, /window\.UiContextNew/);
  assert.match(output, /<noscript><iframe src="\/d\/C0001\/"/);
  assert.match(render({ method: 'GET' }), /data-platform-shell="host"/);
});

it('iframe GET renders the full page and its scripts and broadcast exactly once', () => {
  const output = render({ destination: 'iframe' });
  assert.match(output, /data-platform-shell="page"/);
  for (const marker of ['data-page-content', 'pageSideEffect', 'pageScriptSideEffect', 'broadcastSideEffect']) {
    assert.equal((output.match(new RegExp(marker, 'g')) || []).length, 1, marker);
  }
});

it('POST, legacy, unsupported headers and one-shot authentication redirects remain full documents', () => {
  for (const options of [
    { method: 'post' }, { method: 'POST' }, { legacy: true }, { ie: true }, { destination: '' }, { destination: 'empty' },
    { page: 'user_sudo_redirect' },
  ]) {
    const output = render(options);
    assert.match(output, /data-platform-shell="page"/, JSON.stringify(options));
    assert.match(output, /data-page-content/, JSON.stringify(options));
    assert.match(output, /pageScriptSideEffect/, JSON.stringify(options));
  }
});
