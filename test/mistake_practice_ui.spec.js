const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const uiRoot = path.resolve(__dirname, '../packages/ui-default');
function moduleExports(relative, globals = {}) {
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(uiRoot, relative), 'utf8');
    const code = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
    vm.runInNewContext(code, { module, exports: module.exports, ...globals });
    return module.exports;
}

const TOKEN1 = '6aaff1110000000000000001';
const TOKEN2 = '6aaff1110000000000000002';
const cacheKey = '2/system/1000';

function editorHarness(overrides = {}, saved = {}) {
    const memory = new Map(Object.entries(saved));
    const localStorage = {
        getItem: (key) => memory.has(key) ? memory.get(key) : null,
        setItem: (key, value) => memory.set(key, String(value)),
    };
    const context = {
        pdoc: { domainId: 'system', docId: 1000 },
        codeLang: 'py.py3',
        codeTemplate: 'print("profile template")',
        canUseMistake: true,
        mistakePractice: { token: TOKEN1 },
        ...overrides,
    };
    const reducer = moduleExports('components/scratchpad/reducers/editor.ts', {
        UiContext: context,
        UserContext: { _id: 2 },
        localStorage,
        window: { LANGS: { 'py.py3': { monaco: 'python' }, 'cc.cc17o2': { monaco: 'cpp' } } },
    }).default;
    return { reducer, memory, context };
}

describe('mistake practice draft reset', () => {
    it('clears only this problem draft and retains the chosen language', () => {
        const h = editorHarness({}, {
            [cacheKey]: 'old answer',
            [`${cacheKey}#lang`]: 'cc.cc17o2',
            '2/system/1001': 'another problem',
            '3/system/1000': 'another student',
            '2/python/1000': 'another domain',
        });
        const state = h.reducer();
        assert.equal(state.code, '');
        assert.equal(state.lang, 'cc.cc17o2');
        assert.equal(h.memory.get(cacheKey), '');
        assert.equal(h.memory.get('2/system/1001'), 'another problem');
        assert.equal(h.memory.get('3/system/1000'), 'another student');
        assert.equal(h.memory.get('2/python/1000'), 'another domain');
    });
    it('preserves work on reload, re-entry and another initialization of the same round', () => {
        const h = editorHarness({}, { [cacheKey]: 'old answer' });
        const state = h.reducer();
        h.reducer(state, { type: 'SCRATCHPAD_EDITOR_UPDATE_CODE', payload: 'new attempt' });
        assert.equal(h.reducer().code, 'new attempt');
        assert.equal(h.reducer().code, 'new attempt');
    });
    it('clears again only for a newly started round and does not reconsume an old token', () => {
        const h = editorHarness();
        h.reducer();
        h.memory.set(cacheKey, 'attempt one');
        h.context.mistakePractice.token = TOKEN2;
        assert.equal(h.reducer().code, '');
        h.memory.set(cacheKey, 'attempt two');
        h.context.mistakePractice.token = TOKEN1;
        assert.equal(h.reducer().code, 'attempt two');
    });
    it('does not seed profile or C++ templates into an explicitly empty practice draft', () => {
        const h = editorHarness({ cppEditorMode: 'preset', cppStarterTemplate: '#include <iostream>\nint main() {}' });
        const initial = h.reducer();
        const switched = h.reducer(initial, { type: 'SCRATCHPAD_EDITOR_SET_LANG', payload: 'cc.cc17o2' });
        assert.equal(initial.code, '');
        assert.equal(switched.code, '');
        assert.equal(h.reducer().code, '');
    });
    it('leaves normal entry, invalid tokens, unsupported problems and contests untouched', () => {
        for (const override of [
            { mistakePractice: null },
            { mistakePractice: { token: 'not-a-server-token' } },
            { canUseMistake: false },
            { tdoc: { _id: 'contest-id' } },
        ]) {
            const contestKey = `${cacheKey}@contest-id`;
            const h = editorHarness(override, { [cacheKey]: 'regular work', [contestKey]: 'contest work' });
            assert.equal(h.reducer().code, override.tdoc ? 'contest work' : 'regular work');
            assert.equal(h.memory.get(cacheKey), 'regular work');
            assert.equal(h.memory.get(contestKey), 'contest work');
        }
    });
    it('keeps ordinary editor starter-template behavior when no practice was requested', () => {
        const h = editorHarness({ mistakePractice: null });
        assert.equal(h.reducer().code, 'print("profile template")');
    });
});

function renderPanel(canDeepen = true) {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(uiRoot, 'templates')), { autoescape: true });
    env.addGlobal('url', (name) => name === 'problem_detail' ? '/d/system/p/1000' : '/d/system/mistakes');
    return env.render('partials/mistake_practice.html', {
        canUseMistake: true,
        pdoc: { docId: 1000 },
        mistakePractice: { token: TOKEN1, importance: 1, canDeepen },
    });
}

describe('mistake practice actions', () => {
    it('renders a compact reusable panel inside the statement, not over the editor', () => {
        const html = renderPanel();
        const dom = new JSDOM(html);
        assert.equal(dom.window.document.querySelector('[name="practiceToken"]').value, TOKEN1);
        assert.equal(dom.window.document.querySelector('button').textContent, '加深标记');
        const detail = fs.readFileSync(path.join(uiRoot, 'templates/problem_detail.html'), 'utf8');
        assert.match(detail, /<div class="problem-content"[^>]*>\s*{% include "partials\/mistake_practice.html" %}/);
        assert.match(detail, /mistakePractice: mistakePractice/);
    });
    it('saves once on double click, updates importance and prevents another increase this round', async () => {
        const dom = new JSDOM(renderPanel(), { url: 'http://localhost/d/system/p/1000' });
        const { document, Event } = dom.window;
        let resolve;
        const calls = [];
        const { bindMistakePracticeActions } = moduleExports('components/mistake_practice.ts');
        bindMistakePracticeActions(document, (url, data) => {
            calls.push({ url, data });
            return new Promise((done) => { resolve = done; });
        });
        const submit = () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        submit();
        submit();
        assert.equal(calls.length, 1);
        assert.equal(calls[0].data.practiceToken, TOKEN1);
        assert.equal(calls[0].data.operation, 'deepen_mistake');
        assert.equal(document.querySelector('button').disabled, true);
        resolve({ importance: 2 });
        await new Promise((done) => setImmediate(done));
        assert.equal(document.querySelector('[data-mistake-importance]').textContent, '2');
        assert.equal(document.querySelector('button').textContent, '本轮已加深');
        submit();
        assert.equal(calls.length, 1);
    });
    it('leaves code/editor DOM intact and reports failed saves without raising importance', async () => {
        const dom = new JSDOM(`${renderPanel()}<textarea>new attempt</textarea>`, { url: 'http://localhost' });
        const { document, Event } = dom.window;
        const { bindMistakePracticeActions } = moduleExports('components/mistake_practice.ts');
        const dispose = bindMistakePracticeActions(document, async () => { throw new Error('<retry>'); });
        document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((done) => setImmediate(done));
        assert.equal(document.querySelector('[data-mistake-importance]').textContent, '1');
        assert.equal(document.querySelector('button').disabled, false);
        assert.equal(document.querySelector('textarea').value, 'new attempt');
        assert.equal(document.querySelector('[role="status"]').textContent, '<retry>');
        assert.equal(document.querySelector('[role="status"]').children.length, 0);
        dispose();
    });
    it('keeps an already deepened round disabled after refresh', () => {
        const dom = new JSDOM(renderPanel(false));
        assert.equal(dom.window.document.querySelector('button').disabled, true);
        assert.match(dom.window.document.querySelector('button').textContent, /本轮已加深/);
    });
});
