const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const { beforeEach, describe, it } = require('node:test');
const esbuild = require('esbuild');
const { ObjectId } = require('mongodb');

let docs = [];
const calls = [];
const clone = (value) => value && { ...value };

function matches(doc, filter) {
    return Object.entries(filter).every(([key, expected]) => {
        if (expected && typeof expected === 'object' && '$ne' in expected) return doc[key] !== expected.$ne;
        return doc[key] === expected;
    });
}

function expression(value, doc) {
    if (typeof value === 'string' && value.startsWith('$')) return doc[value.slice(1)];
    if (value && typeof value === 'object' && '$ifNull' in value) {
        return expression(value.$ifNull[0], doc) ?? expression(value.$ifNull[1], doc);
    }
    if (value && typeof value === 'object' && '$add' in value) {
        return value.$add.reduce((sum, item) => sum + expression(item, doc), 0);
    }
    return value;
}

function applyUpdate(doc, update, inserting = false) {
    if (Array.isArray(update)) {
        for (const stage of update) {
            if (stage.$set) {
                Object.assign(doc, Object.fromEntries(Object.entries(stage.$set)
                    .map(([key, value]) => [key, expression(value, doc)])));
            }
            if (stage.$unset) delete doc[stage.$unset];
        }
    } else {
        Object.assign(doc, update.$set || {}, inserting ? update.$setOnInsert || {} : {});
        for (const key of Object.keys(update.$unset || {})) delete doc[key];
    }
}

// The operation applies the matched update before resolving its promise, just
// like a single-document MongoDB findOneAndUpdate; tests never touch user data.
const collection = {
    async findOne(filter) {
        return clone(docs.find((doc) => matches(doc, filter)) || null);
    },
    find(filter) {
        calls.push({ method: 'find', filter });
        return { async toArray() { return docs.filter((doc) => matches(doc, filter)).map(clone); } };
    },
    async countDocuments(filter) {
        return docs.filter((doc) => matches(doc, filter)).length;
    },
    async updateOne(filter, update, options = {}) {
        calls.push({ method: 'updateOne', filter, update, options });
        let doc = docs.find((item) => matches(item, filter));
        const inserting = !doc;
        if (!doc && options.upsert) {
            doc = { ...filter };
            docs.push(doc);
        }
        if (doc) applyUpdate(doc, update, inserting);
        return { matchedCount: Number(!!doc && !inserting), upsertedCount: Number(!!doc && inserting) };
    },
    async findOneAndUpdate(filter, update, options) {
        calls.push({ method: 'findOneAndUpdate', filter, update, options });
        const doc = docs.find((item) => matches(item, filter));
        if (!doc) return null;
        assert.equal(options.returnDocument, 'after');
        assert.notEqual(options.upsert, true);
        applyUpdate(doc, update);
        return clone(doc);
    },
    aggregate(pipeline) {
        calls.push({ method: 'aggregate', pipeline });
        let rows = docs.map(clone);
        for (const stage of pipeline) {
            if (stage.$match) rows = rows.filter((doc) => matches(doc, stage.$match));
            if (stage.$set) rows.forEach((doc) => applyUpdate(doc, [stage]));
            if (stage.$sort) rows.sort((a, b) => {
                for (const [key, direction] of Object.entries(stage.$sort)) {
                    if (a[key] > b[key]) return direction;
                    if (a[key] < b[key]) return -direction;
                }
                return 0;
            });
            if (stage.$skip) rows = rows.slice(stage.$skip);
            if (stage.$limit) rows = rows.slice(0, stage.$limit);
        }
        return { async toArray() { return rows; } };
    },
};

let mistake;
const originalLoad = Module._load;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === '../service/db' && parent?.filename?.endsWith('/model/mistake.ts')) {
            return { collection: (name) => { assert.equal(name, 'mistake'); return collection; } };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    mistake = require('../packages/hydrooj/src/model/mistake');
} finally {
    Module._load = originalLoad;
}

function entry(overrides = {}) {
    return {
        _id: new ObjectId(), domainId: 'Python', uid: 12, pid: 1000,
        status: 'review', source: 'manual', createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-01T00:00:00Z'), ...overrides,
    };
}

beforeEach(() => { docs = []; calls.length = 0; });

describe('mistake importance and isolated practice sessions', () => {
    it('creates an importance-1 entry and keeps an existing importance on repeated add', async () => {
        assert.equal((await mistake.add('Python', 12, 1000)).importance, 1);
        assert.equal(docs.length, 1);
        docs[0].importance = 8;
        docs[0].status = 'mastered';
        docs[0].masteredAt = new Date();
        const again = await mistake.add('Python', 12, 1000, 'wrong_submit');
        assert.equal(docs.length, 1);
        assert.equal(again.importance, 8);
        assert.equal(again.status, 'review');
        assert.equal(again.masteredAt, undefined);
    });

    it('normalizes old entries on reads without modifying stored data', async () => {
        docs.push(entry());
        assert.equal((await mistake.get('Python', 12, 1000)).importance, 1);
        assert.equal(docs[0].importance, undefined);
        assert.equal(await mistake.get('Other', 12, 1000), null);
    });

    it('sorts importance first, then recency and id, with legacy entries equal to importance 1', async () => {
        const timestamp = new Date('2026-09-06T00:00:00Z');
        docs.push(
            entry({ pid: 1, importance: 1, updatedAt: new Date('2026-09-03T00:00:00Z') }),
            entry({ pid: 2, updatedAt: new Date('2026-09-07T00:00:00Z') }),
            entry({ pid: 3, importance: 5 }),
            entry({ pid: 4, importance: 3, updatedAt: timestamp, _id: new ObjectId('111111111111111111111111') }),
            entry({ pid: 5, importance: 3, updatedAt: timestamp, _id: new ObjectId('222222222222222222222222') }),
            entry({ pid: 6, importance: 999, uid: 13 }),
            entry({ pid: 7, importance: 999, domainId: 'Other' }),
        );
        const [first, pages, count] = await mistake.getPage('Python', { uid: 12 }, 1, 3);
        assert.deepEqual(first.map((doc) => doc.pid), [3, 5, 4]);
        assert.equal(pages, 2);
        assert.equal(count, 5);
        const [second] = await mistake.getPage('Python', { uid: 12 }, 2, 3);
        assert.deepEqual(second.map((doc) => [doc.pid, doc.importance]), [[2, 1], [1, 1]]);
        const [none] = await mistake.getPage('Python', { uid: 12 }, 3, 3);
        assert.deepEqual(none, []);
        assert.equal(docs[1].importance, undefined);
    });

    it('filters review/mastered independently and never permits a query to override the domain', async () => {
        docs.push(entry(), entry({ pid: 1001, status: 'mastered' }), entry({ domainId: 'Other' }));
        const [review] = await mistake.getPage('Python', { uid: 12, status: 'review', domainId: 'Other' }, 1, 20);
        assert.equal(review.length, 1);
        assert.equal(review[0].domainId, 'Python');
        const [mastered] = await mistake.getPage('Python', { uid: 12, status: 'mastered' }, 1, 20);
        assert.equal(mastered[0].pid, 1001);
        assert.equal((await mistake.getMulti('Python', { domainId: 'Other' }).toArray()).length, 2);
    });

    it('issues a new server token for every practice and does not change importance or mastery', async () => {
        docs.push(entry({ importance: 3, status: 'mastered' }));
        const first = await mistake.startPractice('Python', 12, 1000);
        assert.match(first.practiceToken, /^[a-f0-9]{24}$/);
        assert.equal(first.importance, 3);
        assert.equal(first.status, 'mastered');
        const next = await mistake.startPractice('Python', 12, 1000);
        assert.notEqual(next.practiceToken, first.practiceToken);
        assert.ok(next.practiceStartedAt instanceof Date);
        assert.equal(await mistake.startPractice('Python', 99, 1000), null);
        assert.equal(docs.length, 1);
    });

    it('allows one atomic deepen per session even for concurrent double-clicks', async () => {
        docs.push(entry());
        const active = await mistake.startPractice('Python', 12, 1000);
        const results = await Promise.all(Array.from({ length: 15 }, () =>
            mistake.deepen('Python', 12, 1000, active.practiceToken)));
        assert.equal(results.filter(Boolean).length, 1);
        assert.equal(docs[0].importance, 2);
        assert.equal(docs[0].deepenedPracticeToken, active.practiceToken);
        assert.deepEqual(mistake.getPracticeState(docs[0], active.practiceToken), {
            token: active.practiceToken, importance: 2, canDeepen: false,
        });
        const update = calls.find((call) => call.method === 'findOneAndUpdate' && Array.isArray(call.update));
        assert.deepEqual(update.filter, {
            domainId: 'Python', uid: 12, pid: 1000, practiceToken: active.practiceToken,
            deepenedPracticeToken: { $ne: active.practiceToken },
        });
    });

    it('adds again on the next practice, not from any earlier practice token', async () => {
        docs.push(entry({ importance: 1 }));
        const first = await mistake.startPractice('Python', 12, 1000);
        await mistake.deepen('Python', 12, 1000, first.practiceToken);
        const second = await mistake.startPractice('Python', 12, 1000);
        assert.equal(mistake.getPracticeState(docs[0], first.practiceToken), null);
        assert.equal(await mistake.deepen('Python', 12, 1000, first.practiceToken), null);
        assert.equal((await mistake.deepen('Python', 12, 1000, second.practiceToken)).importance, 3);
    });

    it('rejects a token from a different account, domain or problem, and malformed tokens', async () => {
        docs.push(entry());
        const active = await mistake.startPractice('Python', 12, 1000);
        assert.equal(await mistake.deepen('Python', 13, 1000, active.practiceToken), null);
        assert.equal(await mistake.deepen('Other', 12, 1000, active.practiceToken), null);
        assert.equal(await mistake.deepen('Python', 12, 1001, active.practiceToken), null);
        assert.equal(await mistake.deepen('Python', 12, 1000, '$importance'), null);
        assert.equal(await mistake.deepen('Python', 12, 1000, 'f'.repeat(24)), null);
        assert.equal(mistake.getPracticeState(docs[0], [active.practiceToken]), null);
        assert.equal(mistake.getPracticeState(null, active.practiceToken), null);
        assert.equal(docs[0].importance, undefined);
    });

    it('invalidates old practice on mastery but permits a new session to return to review', async () => {
        docs.push(entry({ importance: 6 }));
        const first = await mistake.startPractice('Python', 12, 1000);
        const mastered = await mistake.master('Python', 12, 1000);
        assert.equal(mastered.status, 'mastered');
        assert.equal(mastered.practiceToken, undefined);
        assert.equal(mastered.deepenedPracticeToken, undefined);
        assert.equal(mastered.importance, 6);
        assert.equal(await mistake.deepen('Python', 12, 1000, first.practiceToken), null);
        const next = await mistake.startPractice('Python', 12, 1000);
        assert.equal(next.status, 'mastered');
        assert.equal(mistake.getPracticeState(next, next.practiceToken).canDeepen, true);
        const deepened = await mistake.deepen('Python', 12, 1000, next.practiceToken);
        assert.equal(deepened.status, 'review');
        assert.equal(deepened.importance, 7);
        assert.equal(deepened.masteredAt, undefined);
    });

    it('does not create a mistake entry when deepening or mastering a missing entry', async () => {
        assert.equal(await mistake.deepen('Python', 12, 1000, 'a'.repeat(24)), null);
        assert.equal(await mistake.master('Python', 12, 1000), null);
        assert.equal(docs.length, 0);
    });
});

const problemSource = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/handler/problem.ts'), 'utf8');
const methodStart = problemSource.indexOf('    private checkMistakePractice()');
const methodEnd = problemSource.indexOf('    async postMasterMistake()', methodStart);
assert.ok(methodStart > 0 && methodEnd > methodStart);
const classSource = `class PracticeHandler {\n${problemSource.slice(methodStart, methodEnd)}\n}\nmodule.exports = PracticeHandler;`;
const compiled = esbuild.transformSync(classSource, {
    loader: 'ts', target: 'es2022', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).code;
class ValidationError extends Error { }
const sandbox = {
    module: { exports: {} }, exports: {}, mistake,
    PERM: { PERM_SUBMIT_PROBLEM: 1 }, ValidationError,
    param: () => () => {}, Types: { String: null },
};
vm.runInNewContext(compiled, sandbox);
const PracticeHandler = sandbox.module.exports;

function handler(overrides = {}) {
    const instance = new PracticeHandler();
    Object.assign(instance, {
        args: { domainId: 'Python' }, user: { _id: 12 },
        pdoc: { docId: 1000, pid: 'P1000', config: { type: 'default' } }, response: {},
        checkPerm: (value) => { assert.equal(value, 1); },
        url: (name, options) => { assert.equal(name, 'problem_detail'); return { name, ...options }; },
        back: (body) => { instance.response.body = body; instance.response.redirect = '/mistakes'; },
        ...overrides,
    });
    return instance;
}

describe('problem retry/deepen request protections', () => {
    it('uses the authenticated user and resolved problem then redirects to an empty-editor practice session', async () => {
        docs.push(entry());
        const request = handler();
        await request.postStartMistakePractice();
        const destination = request.response.redirect;
        assert.equal(destination.domainId, 'Python');
        assert.equal(destination.pid, 'P1000');
        assert.equal(destination.query.scratchpad, '1');
        assert.equal(destination.query.mistakePractice, docs[0].practiceToken);
        assert.equal(docs[0].importance, undefined);
    });

    it('requires submission permission for both retry and deepen', async () => {
        const request = handler({ checkPerm: () => { throw new Error('permission denied'); } });
        await assert.rejects(request.postStartMistakePractice(), /permission denied/);
        await assert.rejects(request.postDeepenMistake('Python', 'a'.repeat(24)), /permission denied/);
        assert.equal(calls.length, 0);
    });

    it('rejects contest context and non-programming problems before touching stored mistakes', async () => {
        const cases = [
            { tdoc: { _id: 'contest' } }, { args: { domainId: 'Python', tid: 'contest' } },
            ...[null, 'invalid config', { type: 'objective' }, { type: 'submit_answer' }]
                .map((config) => ({ pdoc: { docId: 1000, config } })),
        ];
        for (const overrides of cases) {
            const request = handler(overrides);
            await assert.rejects(request.postStartMistakePractice(), ValidationError);
            await assert.rejects(request.postDeepenMistake('Python', 'a'.repeat(24)), ValidationError);
        }
        assert.equal(calls.length, 0);
    });

    it('rejects retrying a problem not in the current user/domain mistake book', async () => {
        docs.push(entry({ uid: 13 }), entry({ domainId: 'Other' }));
        await assert.rejects(handler().postStartMistakePractice(), /mistake/);
        assert.equal(docs.every((doc) => !doc.practiceToken), true);
    });

    it('returns the new importance and rejects duplicate submissions', async () => {
        docs.push(entry());
        const active = await mistake.startPractice('Python', 12, 1000);
        const request = handler();
        await request.postDeepenMistake('Python', active.practiceToken);
        assert.equal(request.response.body.importance, 2);
        assert.equal(request.response.body.deepened, true);
        assert.equal(request.response.redirect, '/mistakes');
        await assert.rejects(request.postDeepenMistake('Python', active.practiceToken), /practiceToken/);
    });

    it('wires only a validated practice state to detail and normalized importance sorting to the list', () => {
        assert.match(problemSource, /mistakePractice: mistake\.getPracticeState\(mistakeDoc, this\.request\.query\.mistakePractice\)/);
        const listStart = problemSource.indexOf('export class ProblemMistakeHandler');
        const listEnd = problemSource.indexOf('export class ProblemRandomHandler', listStart);
        const list = problemSource.slice(listStart, listEnd);
        assert.match(list, /const mistakeQuery[^\n]*uid: this\.user\._id/);
        assert.match(list, /await mistake\.getPage\(/);
        assert.match(list, /domainId, mistakeQuery, page, this\.ctx\.setting\.get\('pagination\.problem'\)/);
    });

    it('uses the same importance ordering and legacy defaults for the home-page review list', () => {
        const home = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/handler/home.ts'), 'utf8');
        const start = home.indexOf('    async getPersonalMistakes(');
        const end = home.indexOf('\n    }', start);
        assert.ok(start > 0 && end > start);
        const method = home.slice(start, end);
        assert.match(method, /const \[mdocs\] = await mistake\.getPage\(domainId,/);
        assert.match(method, /uid: this\.user\._id,[\s\S]*status: 'review',[\s\S]*}, 1, limit\)/);
        assert.doesNotMatch(method, /sort\(\{ updatedAt/);
    });
});
