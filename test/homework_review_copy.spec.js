const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const source = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/components/homework_review_copy.ts')],
    bundle: true, write: false, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const teacherKey = '10/class-a/1002';
const studentKey = '20/class-a/1002';
const homeworkKey = `${teacherKey}@6aa000000000000000000001`;
const reviewUrl = 'https://example.test/d/class-a/p/P1002?tid=6aa000000000000000000001&reviewUid=20';

function harness(options = {}) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: reviewUrl });
    const values = new Map(options.values || [
        [teacherKey, 'old teacher code'], [`${teacherKey}#lang`, 'cpp'],
        [studentKey, 'student draft'], [`${studentKey}#lang`, 'java'],
        [homeworkKey, 'homework draft'], [`${homeworkKey}#lang`, 'go'],
    ]);
    const solutions = new Map([
        [`${teacherKey}#objective`, '{"1":"old teacher answer"}'],
        [`${studentKey}#objective`, '{"1":"student draft answer"}'],
        [`${homeworkKey}#objective`, '{"1":"homework answer"}'],
    ]);
    const writes = [];
    const dbWrites = [];
    const localStorage = {
        getItem: (key) => {
            if (options.failRead) throw new Error('Storage unavailable');
            return values.get(key) ?? null;
        },
        setItem: (key, value) => {
            writes.push({ key, value });
            if (options.failWrite?.(key, value, writes)) throw new Error('Storage unavailable');
            values.set(key, String(value));
        },
        removeItem: (key) => { writes.push({ key, remove: true }); values.delete(key); },
    };
    const context = {
        pdoc: { domainId: 'class-a', docId: 1002, config: { type: options.objective ? 'objective' : 'default' } },
        codeLang: 'python3',
        homeworkReview: {
            uid: 20, name: '学员', rid: '6aa000000000000000000002',
            code: 'print("submitted student code")', lang: 'python3', ownAnswerUrl: '/d/class-a/p/P1002',
            ...options.review,
        },
        objectiveInitialSubmission: options.initialSubmission || {
            answers: { 1: 'A', 2: ['B', 'C'], 3: '' },
            feedback: { score: 30, totalScore: 50, questions: [{ id: '1', result: 'correct' }] },
        },
    };
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module, exports: module.exports, UiContext: context, UserContext: { _id: options.uid ?? 10 },
        window: dom.window, URL: dom.window.URL, localStorage,
        require(name) {
            if (name === 'vj/utils/db') {
                return { openDB: Promise.resolve({
                    put: async (store, entry) => {
                        dbWrites.push({ store, ...entry });
                        if (options.failDatabase) throw new Error('Database unavailable');
                        solutions.set(entry.id, entry.value);
                    },
                }) };
            }
            return require(name);
        },
    });
    return {
        copy: module.exports.copyHomeworkReviewToOwnDraft, values, writes, solutions, dbWrites, context,
        location: dom.window.location, close: () => dom.window.close(),
    };
}

describe('copying reviewed answers into the teacher’s own draft', () => {
    it('rejects copying merged objective history before touching the teacher draft', async (t) => {
        const h = harness({ objective: true }); t.after(h.close);
        h.context.objectiveMergedReview = { uid: 20, questions: [] };
        await assert.rejects(h.copy(), /合并作答仅供查看/);
        assert.deepEqual(h.dbWrites, []);
        assert.deepEqual(h.writes, []);
        assert.equal(h.solutions.get(`${teacherKey}#objective`), '{"1":"old teacher answer"}');
    });

    it('copies code and language only to the current teacher’s ordinary problem key', async (t) => {
        const h = harness();
        t.after(h.close);
        const target = new URL(await h.copy());
        assert.equal(h.values.get(teacherKey), 'print("submitted student code")');
        assert.equal(h.values.get(`${teacherKey}#lang`), 'python3');
        assert.equal(h.values.get(studentKey), 'student draft');
        assert.equal(h.values.get(`${studentKey}#lang`), 'java');
        assert.equal(h.values.get(homeworkKey), 'homework draft');
        assert.equal(h.values.get(`${homeworkKey}#lang`), 'go');
        assert.deepEqual(h.writes.map((entry) => entry.key).sort(), [teacherKey, `${teacherKey}#lang`].sort());
        assert.equal(h.dbWrites.length, 0);
        assert.equal(target.pathname, '/d/class-a/p/P1002');
        assert.equal(target.searchParams.get('scratchpad'), '1');
        assert.equal(target.searchParams.has('tid'), false);
        assert.equal(target.searchParams.has('reviewUid'), false);
        assert.equal(h.location.href, reviewUrl);
    });

    it('uses the teacher’s current language fallback when the record has no language', async (t) => {
        const h = harness({ review: { lang: '' } });
        t.after(h.close);
        h.context.codeLang = 'cpp';
        await h.copy();
        assert.equal(h.values.get(`${teacherKey}#lang`), 'cpp');
    });

    it('copies objective answer values only, excluding grades and invalid values', async (t) => {
        const h = harness({ objective: true, initialSubmission: {
            answers: { 1: 'A', '2-1': ['B', 'C'], 3: '', 4: [], 5: { nested: true }, 6: ['A', 9], unknown: 'D' },
            feedback: { score: 50, totalScore: 50, questions: [{ id: '1', result: 'correct' }] },
        } });
        t.after(h.close);
        const target = new URL(await h.copy());
        assert.equal(h.dbWrites.length, 1);
        assert.equal(h.dbWrites[0].store, 'solutions');
        assert.equal(h.dbWrites[0].id, `${teacherKey}#objective`);
        assert.deepEqual(JSON.parse(h.solutions.get(`${teacherKey}#objective`)), { 1: 'A', '2-1': ['B', 'C'], 3: '', 4: [] });
        assert.equal(h.solutions.get(`${studentKey}#objective`), '{"1":"student draft answer"}');
        assert.equal(h.solutions.get(`${homeworkKey}#objective`), '{"1":"homework answer"}');
        assert.equal(h.writes.length, 0);
        assert.equal(h.values.get(teacherKey), 'old teacher code');
        assert.equal(target.toString(), 'https://example.test/d/class-a/p/P1002');
        assert.equal(h.location.href, reviewUrl);
    });

    it('allows an intentionally empty objective submission but rejects a missing snapshot', async (t) => {
        const empty = harness({ objective: true, initialSubmission: { answers: {} } });
        const missing = harness({ objective: true, initialSubmission: { feedback: { score: 0 } } });
        t.after(empty.close);
        t.after(missing.close);
        await empty.copy();
        assert.equal(empty.solutions.get(`${teacherKey}#objective`), '{}');
        await assert.rejects(missing.copy(), /暂未获取到该学员的答案/);
        assert.equal(missing.dbWrites.length, 0);
    });

    it('refuses to save when no record, no signed-in teacher or no ordinary problem permission exists', async () => {
        await Promise.all([
            { review: { rid: '' } }, { uid: 0 }, { review: { ownAnswerUrl: '' } },
        ].map(async (options) => {
            const h = harness(options);
            try {
                await assert.rejects(h.copy(), /暂无可复制|没有这道题/);
                assert.equal(h.writes.length, 0);
                assert.equal(h.dbWrites.length, 0);
                assert.equal(h.location.href, reviewUrl);
            } finally { h.close(); }
        }));
    });

    it('rejects cross-origin and review or homework targets before writing any draft', async () => {
        await Promise.all([
            'https://elsewhere.test/p/P1002', '/d/class-a/p/P1002?tid=123', '/d/class-a/p/P1002?reviewUid=20',
        ].map(async (ownAnswerUrl) => {
            const h = harness({ review: { ownAnswerUrl } });
            try {
                await assert.rejects(h.copy(), /作答入口无效/);
                assert.equal(h.writes.length, 0);
                assert.equal(h.dbWrites.length, 0);
            } finally { h.close(); }
        }));
    });

    it('restores both previous code and language after a one-time save failure', async (t) => {
        const h = harness({ failWrite: (key, _value, writes) => key === teacherKey && writes.length === 2 });
        t.after(h.close);
        await assert.rejects(h.copy(), /Storage unavailable/);
        assert.equal(h.values.get(teacherKey), 'old teacher code');
        assert.equal(h.values.get(`${teacherKey}#lang`), 'cpp');
        assert.equal(h.location.href, reviewUrl);
    });

    it('removes a newly created language value if code saving fails without an existing draft', async (t) => {
        const h = harness({ values: [], failWrite: (key) => key === teacherKey });
        t.after(h.close);
        await assert.rejects(h.copy(), /Storage unavailable/);
        assert.equal(h.values.has(teacherKey), false);
        assert.equal(h.values.has(`${teacherKey}#lang`), false);
        assert.equal(h.location.href, reviewUrl);
    });

    it('restores the previous language even when the code key remains unwritable', async (t) => {
        const h = harness({ failWrite: (key) => key === teacherKey });
        t.after(h.close);
        await assert.rejects(h.copy(), /Storage unavailable/);
        assert.equal(h.values.get(teacherKey), 'old teacher code');
        assert.equal(h.values.get(`${teacherKey}#lang`), 'cpp');
        assert.equal(h.location.href, reviewUrl);
    });

    it('keeps the review page and previous objective draft when browser storage fails', async (t) => {
        const readFailure = harness({ failRead: true });
        const databaseFailure = harness({ objective: true, failDatabase: true });
        t.after(readFailure.close);
        t.after(databaseFailure.close);
        await assert.rejects(readFailure.copy(), /Storage unavailable/);
        assert.equal(readFailure.writes.length, 0);
        await assert.rejects(databaseFailure.copy(), /Database unavailable/);
        assert.equal(databaseFailure.solutions.get(`${teacherKey}#objective`), '{"1":"old teacher answer"}');
        assert.equal(readFailure.location.href, reviewUrl);
        assert.equal(databaseFailure.location.href, reviewUrl);
    });
});
