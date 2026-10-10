const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const PRIV = { PRIV_USER_PROFILE: 1, PRIV_EDIT_SYSTEM: 2, PRIV_JUDGE: 4 };
class ForbiddenError extends Error {}
class ValidationError extends Error {}

function loadSource(filename, imports) {
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src', filename), 'utf8');
    const code = transformSync(source, {
        loader: 'ts', format: 'cjs', target: 'es2022',
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    vm.runInNewContext(code, {
        module, exports: module.exports, URL,
        require(name) {
            if (Object.hasOwn(imports, name)) return imports[name];
            throw new Error(`Unexpected dependency ${name} in ${filename}`);
        },
    }, { filename });
    return module.exports;
}

async function fixture({ teacherView = false, json = false, required = true, spoofMarker = false } = {}) {
    const reads = [];
    const events = new Map();
    const quiz = {
        async getSession(uid) {
            reads.push(uid);
            return { policy: {}, session: { required } };
        },
        presentSession(_policy, session) { return session; },
    };
    const helpers = loadSource('lib/daily_quiz.ts', {
        crypto: require('node:crypto'), '../error': { ValidationError },
    });
    const handlers = loadSource('handler/daily_quiz.ts', {
        'mime-types': { lookup: () => 'image/png' },
        '../error': { ForbiddenError },
        '../lib/daily_quiz': helpers,
        '../model/builtin': { PRIV },
        '../model/daily_quiz': quiz,
        '../model/storage': {},
        '../service/server': { Handler: class {}, param: () => () => {}, Types: {} },
    });
    await handlers.apply({ Route() {}, on(name, callback) { events.set(name, callback); } });
    const handler = {
        user: { _id: 24, hasPriv: (priv) => priv === PRIV.PRIV_USER_PROFILE },
        session: { uid: 24, sudoUid: teacherView ? 2 : null },
        request: {
            method: 'GET', path: '/p', originalPath: '/d/python/p', json,
            querystring: 'page=2',
            query: spoofMarker ? { sudoUid: 2, teacherPreview: true } : {},
            body: spoofMarker ? { sudoUid: 2, teacherPreview: true } : {},
        },
        response: {},
    };
    return { events, handler, reads };
}

describe('daily quiz entry is isolated from teacher account inspection', () => {
    it('does not create, settle or read a learner quiz through the HTTP gate in a switched teacher session', async () => {
        const { events, handler, reads } = await fixture({ teacherView: true });
        assert.equal(await events.get('handler/before-prepare')(handler), undefined);
        assert.equal(reads.length, 0);
        assert.equal(handler.response.redirect, undefined);
        assert.equal(handler.response.status, undefined);
    });

    it('does not create, settle or read a learner quiz through the websocket gate in a switched teacher session', async () => {
        const { events, handler, reads } = await fixture({ teacherView: true });
        await events.get('handler/create/ws')(handler);
        assert.equal(reads.length, 0);
    });

    it('still redirects the same learner using their own login before a normal HTML page', async () => {
        const { events, handler, reads } = await fixture();
        assert.equal(await events.get('handler/before-prepare')(handler), 'cleanup');
        assert.deepEqual(reads, [24]);
        assert.equal(handler.response.redirect, '/daily-quiz?return=%2Fd%2Fpython%2Fp%3Fpage%3D2');
    });

    it('still blocks learner JSON requests and ignores spoofed teacher-view query or body fields', async () => {
        const { events, handler, reads } = await fixture({ json: true, spoofMarker: true });
        assert.equal(await events.get('handler/before-prepare')(handler), 'cleanup');
        assert.deepEqual(reads, [24]);
        assert.equal(handler.response.status, 403);
        assert.equal(handler.response.body.error, 'daily_quiz_required');
    });

    it('still rejects learner websocket connections until their actual quiz is complete', async () => {
        const { events, handler, reads } = await fixture();
        await assert.rejects(events.get('handler/create/ws')(handler), ForbiddenError);
        assert.deepEqual(reads, [24]);
    });

    it('permits completed genuine learners through both entry paths without teacher-view markers', async () => {
        const { events, handler, reads } = await fixture({ required: false });
        assert.equal(await events.get('handler/before-prepare')(handler), undefined);
        await events.get('handler/create/ws')(handler);
        assert.deepEqual(reads, [24, 24]);
        assert.equal(handler.response.redirect, undefined);
        assert.equal(handler.response.status, undefined);
    });
});
