const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { before, after, describe, it } = require('node:test');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const esbuild = require('esbuild');

global.Hydro ||= { model: {} };
const { PERM, PRIV } = require('../packages/hydrooj/src/model/builtin');
const { contestLevelQuery, canManageContestAudience } = require('../packages/hydrooj/src/lib/contest_access');
const viewer = (perm = 0n) => ({
    _id: 10, studentLevel: 1, scope: PERM.PERM_ALL,
    hasPerm: (mask) => (perm & mask) === mask,
    hasPriv: () => false,
    own: (doc) => doc.owner === 10 || doc.maintainer?.includes(10),
});
let server;
let client;
let coll;
before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    coll = client.db('shared-admin-test').collection('document');
    const fixture = (id, domainId, extra = {}) => ({
        _id: id, domainId, owner: 99, docType: 30, rule: 'ioi', workspaceId: 'teacher-a',
        targetStudentLevels: [9], beginAt: new Date('2026-09-20'), ...extra,
    });
    await coll.insertMany([
        fixture('local', 'bank-b'),
        fixture('source-admin', 'bank-a', { allDomains: true }),
        fixture('source-student', 'bank-c', { allDomains: true }),
        fixture('foreign', 'bank-foreign', { allDomains: true, workspaceId: 'teacher-other' }),
        fixture('level1', 'bank-a', { allDomains: true, targetStudentLevels: [1] }),
    ]);
});
after(async () => { await client?.close(); await server?.stop(); });

function compile(file, start, end, globals) {
    const source = fs.readFileSync(require.resolve(file), 'utf8');
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from);
    const sandbox = { module: { exports: {} }, ...globals };
    vm.runInNewContext(esbuild.transformSync(source.slice(from, to), {
        loader: 'ts', format: 'cjs', target: 'es2022', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, sandbox);
    return sandbox.module.exports;
}

describe('shared contest visibility for source administrators', () => {
    it('includes only the shared banks the teacher actually administers, before pagination', async () => {
        const checked = [];
        const { getMultiVisibleInDomain } = compile(
            '../packages/hydrooj/src/model/contest.ts', 'export async function getMultiVisibleInDomain', 'export async function getListStatusAcrossDomains', {
                PRIV, canManageContestAudience, contestLevelQuery,
                document: { coll, TYPE_CONTEST: 30 },
                DomainModel: { get: async () => ({ _id: 'bank-b', workspaceId: 'teacher-a' }) },
                UserModel: { getById: async (domainId, uid, scope) => {
                    checked.push(domainId);
                    assert.equal(uid, 10);
                    assert.equal(scope, PERM.PERM_ALL);
                    return viewer(domainId === 'bank-a' ? PERM.PERM_EDIT_CONTEST : 0n);
                } },
            },
        );
        const rows = await (await getMultiVisibleInDomain('bank-b', {}, viewer(PERM.PERM_EDIT_DOMAIN))).sort({ _id: 1 }).toArray();
        assert.deepEqual(rows.map((row) => row._id), ['level1', 'local', 'source-admin']);
        assert.deepEqual(checked.sort(), ['bank-a', 'bank-c']);
        const page = await (await getMultiVisibleInDomain('bank-b', {}, viewer(PERM.PERM_EDIT_DOMAIN))).sort({ _id: 1 }).skip(1).limit(2).toArray();
        assert.deepEqual(page.map((row) => row._id), ['local', 'source-admin']);
    });

    it('keeps an entry-only administrator out of other banks and avoids permission lookups for students', async () => {
        let checked = 0;
        const { getMultiVisibleInDomain } = compile(
            '../packages/hydrooj/src/model/contest.ts', 'export async function getMultiVisibleInDomain', 'export async function getListStatusAcrossDomains', {
                PRIV, canManageContestAudience, contestLevelQuery,
                document: { coll, TYPE_CONTEST: 30 },
                DomainModel: { get: async () => ({ _id: 'bank-b', workspaceId: 'teacher-a' }) },
                UserModel: { getById: async () => { checked++; return viewer(); } },
            },
        );
        const adminRows = await (await getMultiVisibleInDomain('bank-b', {}, viewer(PERM.PERM_EDIT_DOMAIN))).sort({ _id: 1 }).toArray();
        assert.deepEqual(adminRows.map((row) => row._id), ['level1', 'local']);
        const previousLookups = checked;
        const studentRows = await (await getMultiVisibleInDomain('bank-b', {}, viewer())).toArray();
        assert.deepEqual(studentRows.map((row) => row._id), ['level1']);
        assert.equal(checked, previousLookups);
    });
});

class ContestNotLiveError extends Error {}
class ContestScoreboardHiddenError extends Error {}
class Handler {}
const renderReached = new Error('scoreboard rendering reached');
const doc = { owner: 99, rule: 'ioi', hideScoreboard: true, pids: [] };
const routeGlobals = {
    PERM, canManageContestAudience, ContestNotLiveError, ContestScoreboardHiddenError,
    ContestDetailBaseHandler: Handler, Types: {}, param: () => () => {},
    contest: {
        RULES: { ioi: {} }, isNotStarted: () => true,
        canShowScoreboard(tdoc) { return !tdoc.hideScoreboard || canManageContestAudience(this.user, tdoc); },
    },
    problem: { getList: async () => { throw renderReached; } },
    user: { getList: async () => ({}) },
};

describe('before-start hidden scoreboard access', () => {
    it('allows the real source administrator through the embedded scoreboard while keeping problem access closed', async () => {
        const { ContestProblemListHandler } = compile(
            '../packages/hydrooj/src/handler/contest.ts', 'export class ContestProblemListHandler', 'export class ContestEditHandler', routeGlobals,
        );
        const handler = new ContestProblemListHandler();
        handler.user = viewer(PERM.PERM_EDIT_CONTEST | PERM.PERM_VIEW_CONTEST_SCOREBOARD);
        handler.tdoc = doc;
        handler.request = { query: { view: 'scoreboard' } };
        await assert.rejects(handler.get('bank-a', 'tid'), (error) => error === renderReached);
        handler.request.query.view = '';
        await assert.rejects(handler.get('bank-a', 'tid'), ContestNotLiveError);
        handler.request.query.view = 'scoreboard';
        handler.user = viewer(PERM.PERM_VIEW_CONTEST_SCOREBOARD);
        await assert.rejects(handler.get('bank-a', 'tid'), ContestNotLiveError);
    });

    it('allows the same admin on the direct scoreboard/export route while refusing students', async () => {
        const { ContestScoreboardHandler } = compile(
            '../packages/hydrooj/src/handler/contest.ts', 'export class ContestScoreboardHandler', 'class ScoreboardService', routeGlobals,
        );
        const handler = new ContestScoreboardHandler();
        handler.user = viewer(PERM.PERM_EDIT_CONTEST);
        handler.tdoc = doc;
        handler.ctx = { scoreboard: { getView: () => ({ args: {}, display: async () => { throw renderReached; } }) } };
        await assert.rejects(handler.get('bank-a', 'tid', 'csv'), (error) => error === renderReached);
        handler.user = viewer(PERM.PERM_VIEW_CONTEST_SCOREBOARD);
        await assert.rejects(handler.get('bank-a', 'tid', 'csv'), ContestScoreboardHiddenError);
        handler.user = viewer(PERM.PERM_EDIT_CONTEST);
        handler.tdoc = { ...doc, hideScoreboard: false };
        await assert.rejects(handler.get('bank-a', 'tid'), ContestNotLiveError);
    });
});
