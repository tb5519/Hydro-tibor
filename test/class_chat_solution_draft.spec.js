const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const esbuild = require('esbuild');

const bundle = esbuild.buildSync({ entryPoints: [path.resolve(__dirname,
  '../packages/ui-default/components/class_chat/solution_draft.ts')], bundle: true, write: false,
format: 'cjs', platform: 'node' }).outputFiles[0].text;
const mod = { exports: {} };
vm.runInNewContext(bundle, { module: mod, exports: mod.exports });
const { recoverSolutionDraft } = mod.exports;
const content = (code) => ({ code, lang: 'cc.cc14', annotations: { version: 1, text: [], code: [], ink: [] } });
const base = content('cout << 1;');

it('restores the last edit when navigating before the autosave debounce', () => {
  const latest = content('cout << 2; // latest');
  const raw = JSON.stringify({ version: 1, revision: 3, base: JSON.stringify(base), content: latest });
  assert.equal(recoverSolutionDraft(raw, 3, base).code, latest.code);
});

it('recovers edits after an in-flight save even if navigation loses the server response', () => {
  const pending = content('cout << 2;'); const latest = content('cout << 3;');
  const raw = JSON.stringify({ version: 1, revision: 3, base: JSON.stringify(base),
    pending: JSON.stringify(pending), content: latest });
  assert.equal(recoverSolutionDraft(raw, 4, pending).code, latest.code);
});

it('never replaces a newer other-tab server revision or unrelated content with a stale local copy', () => {
  const raw = JSON.stringify({ version: 1, revision: 3, base: JSON.stringify(base),
    pending: JSON.stringify(content('pending')), content: content('local') });
  assert.equal(recoverSolutionDraft(raw, 4, content('other tab')), null);
  assert.equal(recoverSolutionDraft(raw, 5, base), null);
  assert.equal(recoverSolutionDraft(raw, 3, content('different source')), null);
  assert.equal(recoverSolutionDraft('{broken', 3, base), null);
});
