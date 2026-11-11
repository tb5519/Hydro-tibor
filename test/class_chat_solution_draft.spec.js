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

it('recovers ink drafts after server validation reorders anchor and label object properties', () => {
  const editorVersion = content('cout << 1;');
  editorVersion.annotations.ink = [{ id: 'ink-one',
    anchor: { kind: 'editor', editorId: 'code', offset: 0 }, reference: [1, 0, 0, 1, 0, 0], points: [[10, 20]],
    note: { text: '重点', width: 60, height: 36, x: 50, y: 80 } }];
  const serverVersion = content('cout << 1;');
  serverVersion.annotations.ink = [{ points: [[10, 20]], reference: [1, 0, 0, 1, 0, 0],
    note: { text: '重点', x: 50, y: 80, width: 60, height: 36 },
    anchor: { offset: 0, editorId: 'code', kind: 'editor' }, id: 'ink-one' }];
  const latest = { ...editorVersion, code: 'cout << 2; // latest edit' };
  const raw = JSON.stringify({ version: 1, revision: 4, base: JSON.stringify(editorVersion), content: latest });
  assert.equal(recoverSolutionDraft(raw, 4, serverVersion).code, latest.code);
  const pending = JSON.stringify({ version: 1, revision: 3, base: JSON.stringify(base),
    pending: JSON.stringify(editorVersion), content: latest });
  assert.equal(recoverSolutionDraft(pending, 4, serverVersion).code, latest.code);
  serverVersion.annotations.ink[0].note.text = 'another tab changed the label';
  assert.equal(recoverSolutionDraft(raw, 4, serverVersion), null);
  assert.equal(recoverSolutionDraft(pending, 4, serverVersion), null);
});

it('preserves array order in the recovery comparison so different ink paths cannot match', () => {
  const server = content('cout << 1;');
  server.annotations.ink = [{ points: [[1, 2], [3, 4]] }];
  const changedPath = content('cout << 1;');
  changedPath.annotations.ink = [{ points: [[3, 4], [1, 2]] }];
  const raw = JSON.stringify({ version: 1, revision: 1, base: JSON.stringify(changedPath), content: content('latest') });
  assert.equal(recoverSolutionDraft(raw, 1, server), null);
});
