const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const { Types: realTypes } = require('../framework/framework/validator');
const { normalizeStudentLevel, isStudentLevel, STUDENT_LEVELS } = require('../packages/hydrooj/src/lib/student_level');

function loadClass(file, start, end, className, globals) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from);
    const declarations = new Map();
    const param = (...definition) => (target, method) => {
        const fields = declarations.get(method) || [];
        fields.unshift(definition);
        declarations.set(method, fields);
    };
    const compiled = esbuild.transformSync(`${source.slice(from, to)}\nmodule.exports = ${className};`, {
        loader: 'ts', format: 'cjs', target: 'es2022', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code;
    const sandbox = {
        module: { exports: {} },
        param, post: param, route: param, requireSudo: () => {},
        Types: { ...realTypes, Range: (values) => realTypes.Range(Array.from(values)) },
        STUDENT_LEVELS, normalizeStudentLevel, ...globals,
    };
    vm.runInNewContext(compiled, sandbox);
    return { Constructor: sandbox.module.exports, declarations };
}

function validateLevel(declarations, method, value) {
    const [, [convert, validate], optional] = declarations.get(method).find(([name]) => name === 'studentLevel');
    if (value === undefined && optional) return value;
    const converted = convert(value);
    if (!validate(converted)) throw new Error('invalid studentLevel');
    return converted;
}

const PRIV = { PRIV_USER_PROFILE: 1, PRIV_EDIT_SYSTEM: 2, PRIV_JUDGE: 4, PRIV_ALL: -1 };
class ValidationError extends Error {}
class ForbiddenError extends Error {}
class UserNotFoundError extends Error {}
class Handler {
    constructor() {
        this.response = {};
        this.workspaceDoc = { _id: 'teacher-a', code: 'teacher-a' };
        this.allowed = true;
    }
    canManageStudents() { return this.allowed; }
    url(route, args) { return { route, args }; }
}

function workspaceHarness() {
    const state = { joined: true, staff: false, otherWorkspace: false, priv: PRIV.PRIV_USER_PROFILE, writes: [], logs: [] };
    const { Constructor, declarations } = loadClass(
        'packages/hydrooj/src/handler/workspace.ts', 'class WorkspaceStudentsHandler', 'class DomainWorkspaceEntryHandler',
        'WorkspaceStudentsHandler', {
            WorkspaceScopedHandler: Handler, PRIV, ValidationError, ForbiddenError,
            user: {
                getById: async (_, uid) => ({ _id: uid, hasPriv: (priv) => !!(state.priv & priv) }),
                setById: async (uid, fields) => state.writes.push({ uid, ...fields }),
            },
            workspace: {
                getMember: async () => state.staff,
                isAssignedToOtherWorkspace: async () => state.otherWorkspace,
                getDomains: async () => [{ _id: 'class-a' }],
            },
            domain: { collUser: { countDocuments: async (query) => {
                assert.deepEqual(Array.from(query.domainId.$in), ['class-a']);
                return Number(state.joined);
            } } },
            oplog: { log: async (_, operation, detail) => state.logs.push({ operation, ...detail }) },
        },
    );
    return { handler: new Constructor(), declarations, state };
}

describe('teacher-managed student learning levels', () => {
    it('provides nine choices and defaults legacy or invalid values to level 1', () => {
        assert.deepEqual(STUDENT_LEVELS.map(({ value }) => value), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.equal(STUDENT_LEVELS[8].label, 'MAX');
        for (let level = 1; level <= 9; level++) {
            assert.equal(normalizeStudentLevel(level), level);
            assert.equal(normalizeStudentLevel(String(level)), level);
            assert.ok(isStudentLevel(level));
        }
        for (const invalid of [undefined, null, 0, -1, 10, 1.5, NaN, Infinity, '', 'MAX', [], {}, true]) {
            assert.equal(normalizeStudentLevel(invalid), 1);
            assert.equal(isStudentLevel(invalid), false);
        }
    });

    it('accepts only levels 1–9 in management forms, including MAX as numeric 9', () => {
        const { declarations } = workspaceHarness();
        for (const method of ['postUpdateLevel', 'postCreateStudent']) {
            assert.equal(validateLevel(declarations, method, '9'), 9);
            assert.equal(validateLevel(declarations, method, '1'), 1);
            for (const invalid of [0, 10, -1, 1.5, 'MAX', 'not-a-level']) {
                assert.throws(() => validateLevel(declarations, method, invalid), /invalid studentLevel/);
            }
        }
        assert.equal(validateLevel(declarations, 'postCreateStudent', undefined), undefined);
    });

    it('persists a scoped level change to the account and records the managing workspace', async () => {
        const { handler, state } = workspaceHarness();
        await handler.postUpdateLevel('forged-domain', 21, 9);
        assert.deepEqual(state.writes, [{ uid: 21, studentLevel: 9 }]);
        assert.deepEqual(state.logs, [{ operation: 'workspace.updateStudentLevel', workspaceId: 'teacher-a', uid: 21, studentLevel: 9 }]);
        assert.equal(handler.response.redirect.args.query.updated, 21);
    });

    it('rejects read-only teachers, unrelated students, staff, administrators and judge accounts before mutation', async () => {
        for (const patch of [
            { joined: false }, { otherWorkspace: true }, { staff: true },
            { priv: PRIV.PRIV_USER_PROFILE | PRIV.PRIV_EDIT_SYSTEM },
            { priv: PRIV.PRIV_USER_PROFILE | PRIV.PRIV_JUDGE }, { priv: 0 },
        ]) {
            const { handler, state } = workspaceHarness();
            Object.assign(state, patch);
            await assert.rejects(handler.postUpdateLevel('class-a', 21, 4), ValidationError);
            assert.equal(state.writes.length, 0);
            assert.equal(state.logs.length, 0);
        }
        const { handler, state } = workspaceHarness();
        handler.allowed = false;
        await assert.rejects(handler.postUpdateLevel('class-a', 21, 4), ForbiddenError);
        assert.equal(state.writes.length, 0);
    });

    it('updates levels from the control panel while preserving the level on older forms', async () => {
        const writes = [];
        let available = true;
        const target = { _id: 21, uname: 'student', mail: 'student@example.test', studentLevel: 7 };
        const { Constructor, declarations } = loadClass(
            'packages/hydrooj/src/handler/manage.ts', 'class SystemUserManagementHandler', 'class SystemLotteryHandler',
            'SystemUserManagementHandler', {
                SystemHandler: Handler, PRIV, ValidationError, UserNotFoundError,
                MANAGED_STUDENT_SORTS: ['submit', 'login', 'practice'], MANAGED_STUDENT_SORT_DIRECTIONS: ['desc', 'asc'],
                CPP_EDITOR_MODES: ['beginner', 'preset', 'proficient'],
                getManagedDomains: async () => [{ id: 'class-a', name: 'Class A' }],
                getManagedStudent: async () => (available ? target : null),
                getManagedStudentDomains: async () => ({ domains: [{ id: 'class-a' }], selectedDefaultDomain: 'class-a' }),
                normalizeManagedStudentText: (value) => value.trim(), handleMailLower: (value) => value.toLowerCase(),
                user: { setById: async (uid, fields) => writes.push({ uid, ...fields }) },
                domain: { updateUserInDomain: async () => {} },
            },
        );
        const handler = new Constructor();
        const args = ['system', 21, 'student', 'student@example.test', 'Student', '', '', 'class-a', 'proficient', 'submit', 'desc'];
        await handler.postEditStudent(...args, validateLevel(declarations, 'postEditStudent', '9'));
        assert.equal(writes[0].studentLevel, 9);
        await handler.postEditStudent(...args);
        assert.equal(writes[1].studentLevel, 7);
        available = false;
        await assert.rejects(handler.postEditStudent(...args, 3), UserNotFoundError);
        assert.equal(writes.length, 2);
    });

    it('keeps teacher-managed levels independent of domain RP levels and user preferences', () => {
        const { Constructor } = loadClass(
            'packages/hydrooj/src/model/user.ts', 'export class User {', 'declare module', 'User', {
                PERM: { PERM_ALL: 0xffffn },
                setting: { SETTINGS_BY_KEY: { studentLevel: { value: 2, flag: 0 } }, DOMAIN_USER_SETTINGS_BY_KEY: { studentLevel: { value: 6, flag: 0 } } },
                system: { get: () => 1 },
            },
        );
        assert.equal(new Constructor({ _id: 21, studentLevel: 9 }, { studentLevel: 4, level: 2 }).studentLevel, 9);
        assert.equal(new Constructor({ _id: 21 }, { studentLevel: 4, level: 9 }).studentLevel, 1);
    });
});
