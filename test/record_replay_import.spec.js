const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const source = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/components/record_replay_import.ts')],
    bundle: true, write: false, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const key = '10/class-a/1002';
const rid = '6aa000000000000000000002';
function harness(options = {}) {
    const dom = new JSDOM('', { url: `https://example.test/d/class-a/p/P1002?fromRecord=${rid}&draftImport=00000000-0000-4000-8000-000000000001` });
    const context = {
        pdoc: { domainId: 'class-a', docId: 1002, config: { type: options.objective ? 'objective' : 'default' } },
        recordReplay: { rid, code: 'print("source")', lang: 'py.py3', objective: options.objective ? {
            answers: { 1: 'A', 2: ['B', 'C'] }, feedback: { complete: true, score: 30, totalScore: 50 },
        } : undefined },
    };
    const solutions = new Map([[`${key}#objective`, '{"1":"old"}'], ['20/class-a/1002#objective', 'student']]);
    const local = dom.window.localStorage;
    local.setItem(key, 'teacher'); local.setItem(`${key}#lang`, 'cc'); local.setItem('20/class-a/1002', 'student');
    const writes = [];
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module, exports: module.exports, URL: dom.window.URL, window: dom.window,
        UiContext: context, UserContext: { _id: 10 },
        sessionStorage: options.failSession ? { getItem: () => null, setItem() { throw new Error('unavailable'); } } : dom.window.sessionStorage,
        localStorage: { getItem: (k) => local.getItem(k), removeItem: (k) => local.removeItem(k), setItem(k, v) {
            writes.push(k);
            if (options.failCode && k === key && v === 'print("source")') throw new Error('unavailable');
            local.setItem(k, v);
        } },
        require(name) {
            if (name === 'vj/utils/db') return { openDB: Promise.resolve({ put: async (_, entry) => {
                if (options.failDatabase) throw new Error('unavailable');
                solutions.set(entry.id, entry.value);
            } }) };
            return require(name);
        },
    });
    return { ...module.exports, dom, context, local, solutions, writes, close: () => dom.window.close() };
}
it('imports exact source code to teacher only, then refresh preserves edits and language', async (t) => {
    const h = harness(); t.after(h.close);
    await h.prepareRecordReplayDraft();
    assert.equal(h.local.getItem(key), 'print("source")');
    assert.equal(h.local.getItem(`${key}#lang`), 'py.py3');
    assert.equal(h.local.getItem('20/class-a/1002'), 'student');
    h.local.setItem(key, 'teacher edit'); h.local.setItem(`${key}#lang`, 'java');
    await h.prepareRecordReplayDraft();
    assert.equal(h.local.getItem(key), 'teacher edit');
    assert.equal(h.local.getItem(`${key}#lang`), 'java');
    assert.equal(h.writes.length, 2);
});
it('never imports or remembers a replay while viewing merged objective answers', async (t) => {
    const h = harness({ objective: true }); t.after(h.close);
    h.context.objectiveMergedReview = { uid: 20, questions: [] };
    await h.prepareRecordReplayDraft();
    h.rememberRecordReplaySubmission({ 1: 'A' }, { state: 'complete' });
    assert.equal(h.solutions.get(`${key}#objective`), '{"1":"old"}');
    assert.equal(h.dom.window.sessionStorage.length, 0);
    assert.equal(h.context.objectiveInitialSubmission, undefined);
    assert.deepEqual(h.writes, []);
});
it('each explicit new selection token permits a fresh import', async (t) => {
    const h = harness(); t.after(h.close);
    await h.prepareRecordReplayDraft(); h.local.setItem(key, 'teacher edit');
    h.dom.window.history.replaceState(null, '', `?fromRecord=${rid}&draftImport=00000000-0000-4000-8000-000000000002`);
    await h.prepareRecordReplayDraft(); assert.equal(h.local.getItem(key), 'print("source")');
});
it('objective import preserves source grade and subsequent edits across reload', async (t) => {
    const h = harness({ objective: true }); t.after(h.close);
    await h.prepareRecordReplayDraft();
    assert.deepEqual(JSON.parse(h.solutions.get(`${key}#objective`)), { 1: 'A', 2: ['B', 'C'] });
    assert.equal(h.context.recordReplayResultActive, true);
    assert.equal(h.context.objectiveInitialSubmission.feedback.score, 30);
    assert.equal(h.solutions.get('20/class-a/1002#objective'), 'student');
    h.solutions.set(`${key}#objective`, '{}'); await h.prepareRecordReplayDraft();
    assert.equal(h.solutions.get(`${key}#objective`), '{}');
});
it('teacher pending and completed results replace source grade on reload', async (t) => {
    const h = harness({ objective: true }); t.after(h.close);
    await h.prepareRecordReplayDraft();
    h.rememberRecordReplaySubmission({ 1: 'C' }, { rid: 'new-record', state: 'pending' });
    await h.prepareRecordReplayDraft();
    assert.equal(h.context.recordReplayResultActive, false);
    assert.equal(h.context.objectiveInitialSubmission.feedback.state, 'pending');
    h.rememberRecordReplaySubmission({ 1: 'C' }, { rid: 'new-record', complete: true, score: 50 });
    await h.prepareRecordReplayDraft();
    assert.equal(h.context.objectiveInitialSubmission.feedback.score, 50);
    assert.equal(h.context.objectiveInitialSubmission.answers[1], 'C');
});
it('disabled session storage cannot overwrite existing drafts', async (t) => {
    const h = harness({ failSession: true }); t.after(h.close);
    await assert.rejects(h.prepareRecordReplayDraft(), /unavailable/);
    assert.equal(h.local.getItem(key), 'teacher'); assert.equal(h.writes.length, 0);
});
it('partial local storage failure rolls back both code and language and releases token', async (t) => {
    const h = harness({ failCode: true }); t.after(h.close);
    await assert.rejects(h.prepareRecordReplayDraft(), /unavailable/);
    assert.equal(h.local.getItem(key), 'teacher'); assert.equal(h.local.getItem(`${key}#lang`), 'cc');
    assert.equal(h.dom.window.sessionStorage.length, 0);
});
it('database failure retains objective draft and releases token for retry', async (t) => {
    const h = harness({ objective: true, failDatabase: true }); t.after(h.close);
    await assert.rejects(h.prepareRecordReplayDraft(), /unavailable/);
    assert.equal(h.solutions.get(`${key}#objective`), '{"1":"old"}');
    assert.equal(h.dom.window.sessionStorage.length, 0);
});
it('direct or mismatched replay URLs cannot import or write a draft', async (t) => {
    const h = harness(); t.after(h.close);
    h.dom.window.history.replaceState(null, '', '?fromRecord=different&draftImport=00000000-0000-4000-8000-000000000001');
    await assert.rejects(h.prepareRecordReplayDraft(), /请选择/);
    h.dom.window.history.replaceState(null, '', `?fromRecord=${rid}`);
    await assert.rejects(h.prepareRecordReplayDraft(), /请选择/);
    assert.equal(h.writes.length, 0);
});
