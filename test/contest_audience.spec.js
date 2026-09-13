const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { before, after, describe, it } = require('node:test');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const esbuild = require('esbuild');

global.Hydro ||= { model: {} };
const { PERM, PRIV } = require('../packages/hydrooj/src/model/builtin');
const { canManageContestAudience, canViewContestLevel, contestLevelQuery } = require('../packages/hydrooj/src/lib/contest_access');
const viewer = (studentLevel, perm = 0n, priv = 0, uid = 10) => ({
    _id: uid, studentLevel,
    hasPerm: (mask) => (perm & mask) === mask,
    hasPriv: (mask) => (priv & mask) === mask,
    own: (doc) => doc.owner === uid || !!doc.maintainer?.includes(uid),
});
const contest = (extra = {}) => ({ owner: 99, domainId: 'cpp', rule: 'ioi', ...extra });

let server;
let client;
let coll;
before(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
    coll = client.db('contest-audience-test').collection('document');
    await coll.insertMany([
        contest({ _id: 'legacy' }), contest({ _id: 'all', targetStudentLevels: [] }),
        contest({ _id: 'level1', targetStudentLevels: [1] }), contest({ _id: 'level2', targetStudentLevels: [2] }),
        contest({ _id: 'mixed', targetStudentLevels: [2, 9] }), contest({ _id: 'max', targetStudentLevels: [9] }),
        contest({ _id: 'shared', domainId: 'other', targetStudentLevels: [2], allDomains: true }),
    ]);
});
after(async () => {
    await client?.close();
    await server?.stop();
});

describe('contest student audience', () => {
    it('defaults old accounts to level1, supports MAX and multiple levels, and leaves legacy contests visible', () => {
        assert.equal(canViewContestLevel(viewer(), contest({ targetStudentLevels: [1] })), true);
        assert.equal(canViewContestLevel(viewer(), contest({ targetStudentLevels: [2] })), false);
        assert.equal(canViewContestLevel(viewer(9), contest({ targetStudentLevels: [2, 9] })), true);
        assert.equal(canViewContestLevel(viewer(8), contest({ targetStudentLevels: [2, 9] })), false);
        assert.equal(canViewContestLevel(viewer(2), contest()), true);
        assert.equal(canViewContestLevel(viewer(2), contest({ targetStudentLevels: [] })), true);
        assert.equal(canViewContestLevel(viewer(2, 0n, 0, 0), contest({ targetStudentLevels: [2] })), false);
    });

    it('allows source administrators and contest maintainers while ordinary view permissions never bypass the audience', () => {
        const target = contest({ targetStudentLevels: [9] });
        assert.equal(canViewContestLevel(viewer(1, PERM.PERM_EDIT_CONTEST), target), true);
        assert.equal(canViewContestLevel(viewer(1, PERM.PERM_EDIT_DOMAIN), target), true);
        assert.equal(canViewContestLevel(viewer(1, 0n, PRIV.PRIV_EDIT_SYSTEM), target), true);
        assert.equal(canViewContestLevel(viewer(1), { ...target, maintainer: [10] }), true);
        assert.equal(canViewContestLevel(viewer(1, PERM.PERM_VIEW_HIDDEN_CONTEST), target), false);
        assert.equal(canViewContestLevel(viewer(1), { ...target, rule: 'homework' }), true);
    });

    it('filters in Mongo before pagination and matches the direct access check', async () => {
        for (const level of [undefined, 1, 2, 8, 9]) {
            const account = viewer(level);
            // eslint-disable-next-line no-await-in-loop
            const matches = await coll.find(contestLevelQuery(account, 'cpp')).sort({ _id: 1 }).toArray();
            // eslint-disable-next-line no-await-in-loop
            const expected = (await coll.find().sort({ _id: 1 }).toArray()).filter((doc) => canViewContestLevel(account, doc));
            assert.deepEqual(matches.map((doc) => doc._id), expected.map((doc) => doc._id));
        }
        const page = await coll.find(contestLevelQuery(viewer(2), 'cpp')).sort({ _id: 1 }).skip(2).limit(2).toArray();
        assert.equal(page.length, 2);
        assert.ok(page.every((doc) => canViewContestLevel(viewer(2), doc)));
    });

    it('does not use an entry domain administrator role to expose level-restricted shared contests', async () => {
        const ids = (await coll.find(contestLevelQuery(viewer(1, PERM.PERM_EDIT_CONTEST), 'cpp')).toArray()).map((doc) => doc._id);
        assert.ok(ids.includes('max'));
        assert.ok(!ids.includes('shared'));
        assert.equal(await coll.countDocuments(contestLevelQuery(viewer(1, 0n, PRIV.PRIV_EDIT_SYSTEM), 'cpp')), 7);
    });
});

// Execute the real model decision functions without starting Hydro's database services.
const source = fs.readFileSync(require.resolve('../packages/hydrooj/src/model/contest.ts'), 'utf8');
const start = source.indexOf('export function canViewHiddenScoreboard');
const end = source.indexOf('export async function getScoreboard', start);
const sandbox = {
    module: { exports: {} }, exports: {}, PERM, canViewContestLevel, canManageContestAudience,
    RULES: { ioi: { showRecord: () => true, showSelfRecord: () => true, showScoreboard: () => true } },
};
vm.runInNewContext(esbuild.transformSync(source.slice(start, end), { loader: 'ts', format: 'cjs' }).code, sandbox);
const decisions = sandbox.module.exports;
describe('hidden contest scoreboards', () => {
    it('overrides an otherwise public rule for students, including students allowed to view hidden scoreboards', () => {
        const tdoc = contest({ hideScoreboard: true });
        assert.equal(decisions.canShowScoreboard.call({ user: viewer(1) }, tdoc), false);
        assert.equal(decisions.canShowScoreboard.call({ user: viewer(1, PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD) }, tdoc), false);
        assert.equal(decisions.canShowScoreboard.call({ user: viewer(1) }, contest()), true);
    });
    it('retains source admin scoreboard access in the sidebar and preserves the student own grading feedback', () => {
        const tdoc = contest({ hideScoreboard: true });
        assert.equal(decisions.canShowScoreboard.call({ user: viewer(1, PERM.PERM_EDIT_CONTEST) }, tdoc, false), true);
        assert.equal(decisions.canShowSelfRecord.call({ user: viewer(1) }, tdoc), true);
        assert.equal(decisions.canShowSelfRecord.call({ user: viewer(1) }, { ...tdoc, targetStudentLevels: [2] }), false);
    });
});
