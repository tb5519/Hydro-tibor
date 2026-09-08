const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');
const esbuild = require('esbuild');

function loadSection(file, start, end, exports, globals = {}) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const startAt = source.indexOf(start);
    const endAt = source.indexOf(end, startAt);
    assert.ok(startAt >= 0 && endAt > startAt);
    const compiled = esbuild.transformSync(`${source.slice(startAt, endAt)}\nmodule.exports = ${exports};`, {
        loader: 'ts', format: 'cjs', target: 'es2022',
    }).code;
    const sandbox = { module: { exports: {} }, ...globals };
    vm.runInNewContext(compiled, sandbox);
    return sandbox.module.exports;
}

function loadHistory() {
    const values = new Map();
    const context = {
        UserContext: { _id: 90 },
        UiContext: { domainId: 'class-a' },
        localStorage: {
            getItem: (key) => values.get(key),
            setItem: (key, value) => values.set(key, value),
        },
    };
    const history = loadSection(
        'packages/ui-default/components/problem/StudentUnacceptedDialog.tsx',
        'interface StudentFilterHistory',
        'const studentKey',
        '{ readHistory, rememberStudent, historyKey }',
        context,
    );
    return { ...history, values, context };
}

describe('frequent student filters', () => {
    it('orders confirmed selections by frequency and stores no names', () => {
        const history = loadHistory();
        history.rememberStudent(11);
        history.rememberStudent(12);
        history.rememberStudent(12);
        const saved = JSON.parse(history.values.get(history.historyKey()));
        assert.deepEqual(saved.map(({ uid, count }) => ({ uid, count })), [
            { uid: 12, count: 2 }, { uid: 11, count: 1 },
        ]);
        assert.deepEqual(Object.keys(saved[0]).sort(), ['count', 'lastUsed', 'uid']);
    });

    it('isolates each teacher and domain on shared browsers', () => {
        const history = loadHistory();
        history.rememberStudent(11);
        history.context.UiContext.domainId = 'class-b';
        assert.equal(history.readHistory().length, 0);
        history.context.UiContext.domainId = 'class-a';
        history.context.UserContext._id = 91;
        assert.equal(history.readHistory().length, 0);
        history.context.UserContext._id = 90;
        assert.equal(history.readHistory()[0].uid, 11);
    });

    it('handles corrupt or unavailable browser storage without blocking filtering', () => {
        const history = loadHistory();
        history.values.set(history.historyKey(), '{broken');
        assert.equal(history.readHistory().length, 0);
        history.values.set(history.historyKey(), JSON.stringify([
            { uid: 1, count: 10, lastUsed: 1 },
            { uid: 5, count: -1, lastUsed: 1 },
            { uid: 6, count: 3, lastUsed: 1 },
            null,
        ]));
        assert.equal(history.readHistory().length, 1);
        assert.equal(history.readHistory()[0].uid, 6);
        history.context.localStorage.getItem = () => { throw new Error('blocked'); };
        history.context.localStorage.setItem = () => { throw new Error('blocked'); };
        assert.doesNotThrow(() => history.rememberStudent(7));
    });
});

function cursor(items) {
    let offset = 0;
    let limit = Infinity;
    return {
        sort() { return this; },
        skip(value) { offset = value; return this; },
        limit(value) { limit = value; return this; },
        project() { return this; },
        async toArray() { return items.slice(offset, offset + limit); },
    };
}

function loadStudentApi() {
    class UserNotFoundError extends Error {}
    const checked = [];
    const students = Array.from({ length: 64 }, (_, index) => ({
        _id: index + 2, uname: `student${index + 2}`, unameLower: `student${index + 2}`, avatar: 'avatar',
    }));
    const schema = new Proxy(() => {}, { get: () => schema, apply: () => schema });
    const api = loadSection(
        'packages/hydrooj/src/handler/problem.ts',
        'export const ProblemApi =',
        "declare module '@hydrooj/framework'",
        'ProblemApi.problemFilterStudents',
        {
            Schema: schema,
            Query: (_schema, callback) => callback,
            PERM: { PERM_EDIT_DOMAIN: 123 },
            avatar: () => '/avatar.png',
            escapeRegExp: (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            UserNotFoundError,
            prepareProblemFilterScope: async () => ({
                scopeDomainIds: ['class-a'], memberUids: new Set([2]), excludedLegacyUids: new Set([4]),
            }),
            resolveProblemFilterStudent: async (_domain, _actor, uid) => {
                checked.push(uid);
                if (uid <= 61) throw new UserNotFoundError();
                return students.find((student) => student._id === uid);
            },
            domain: { collUser: {
                distinct: async () => students.map((student) => student._id),
                find: () => cursor([]),
            } },
            user: {
                getById: async (_domain, uid) => students.find((student) => student._id === uid),
                getByUname: async (_domain, uname) => students.find((student) => student.uname === uname),
                coll: { find: (filter) => cursor(students.filter((student) => filter._id.$in.includes(student._id)
                    && filter.unameLower.$regex.test(student.unameLower))) },
            },
        },
    );
    const ctx = { domain: { _id: 'class-a' }, user: { _id: 3 }, checkPerm: (perm) => assert.equal(perm, 123) };
    return { api, ctx, checked };
}

describe('student filter quick choices', () => {
    it('returns default students and scans past inaccessible accounts', async () => {
        const { api, ctx, checked } = loadStudentApi();
        const students = await api(ctx, {});
        assert.deepEqual(Array.from(students, (student) => student._id), [62, 63, 64, 65]);
        assert.ok(checked.includes(62));
        assert.ok(!checked.includes(2) && !checked.includes(3) && !checked.includes(4));
    });

    it('revalidates historical students, discards inaccessible IDs, and preserves frequency order', async () => {
        const { api, ctx } = loadStudentApi();
        const students = await api(ctx, { auto: ['65', '2', '63', '1', 'invalid', '65'] });
        assert.deepEqual(Array.from(students, (student) => student._id), [65, 63]);
    });

    it('requires teacher permissions before returning either default or historical students', async () => {
        const { api, ctx, checked } = loadStudentApi();
        ctx.checkPerm = () => { throw new Error('permission denied'); };
        await assert.rejects(api(ctx, {}), /permission denied/);
        await assert.rejects(api(ctx, { auto: ['65'] }), /permission denied/);
        assert.equal(checked.length, 0);
    });

    it('preserves searching by student name', async () => {
        const { api, ctx } = loadStudentApi();
        const students = await api(ctx, { search: 'student63' });
        assert.deepEqual(Array.from(students, (student) => student._id), [63]);
    });
});
