const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/handler/home.ts'), 'utf8');
const methodStart = source.indexOf('    async getPersonalStats(');
const methodEnd = source.indexOf('\n    async get({ domainId })', methodStart);
assert.ok(methodStart >= 0 && methodEnd > methodStart, 'personal dashboard method must be present');
const method = transformSync(`class PersonalDashboard {\n${source.slice(methodStart, methodEnd)}\n}\nmodule.exports = PersonalDashboard;`, {
    loader: 'ts', format: 'cjs',
}).code;
const difficultyModule = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/lib/profile_ac_difficulty.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: difficultyModule, exports: difficultyModule.exports });

function fixture({ uid = 27, permitted = true, rankingMode = 'all', problems = [], timezone = 'Asia/Shanghai' } = {}) {
    const calls = { statistics: [], growth: [], collect: [] };
    const currentDomain = { _id: 'python', rankingMode };
    const currentUser = { _id: uid, hasPriv: (privilege) => privilege === 7 && permitted };
    const growth = { newAc7: 4, newAc30: 12, weeklyAc: { eligible: false, topCount: 5, gap: 1 } };
    const context = { db: {} };
    const mod = { exports: {} };
    vm.runInNewContext(method, {
        module: mod,
        PRIV: { PRIV_USER_PROFILE: 7 },
        getProfileStatistics: async (...args) => {
            calls.statistics.push(args);
            return {
                rankingMode,
                stats: { rp: 278.39, rank: 3, nAccept: problems.length, nSubmit: 80, nLiked: 2 },
                acceptedProblems: problems,
            };
        },
        getPersonalAcGrowth: async (...args) => {
            calls.growth.push(args);
            return growth;
        },
        getProfileAcDifficulty: difficultyModule.exports.getProfileAcDifficulty,
        system: { get: (key) => key === 'timeZone' ? timezone : null },
    });
    const instance = new mod.exports();
    Object.assign(instance, {
        user: currentUser,
        domain: currentDomain,
        ctx: context,
        collectUser: (uids) => calls.collect.push([...uids]),
        getPersonalMistakes: () => { throw new Error('the private dashboard must no longer query mistakes'); },
    });
    return { instance, calls, currentDomain, currentUser, context, growth };
}

describe('private home accepted difficulty distribution', () => {
    it('does not load personal information for an anonymous or profile-disabled visitor', async () => {
        for (const options of [{ uid: 1 }, { permitted: false }]) {
            const { instance, calls } = fixture(options);
            assert.equal(await instance.getPersonalStats('python'), null);
            assert.equal(calls.statistics.length, 0);
            assert.equal(calls.growth.length, 0);
            assert.equal(calls.collect.length, 0);
        }
    });

    it('requests the authenticated owner statistics and carries the all-domain scope to the card', async () => {
        const input = fixture({ problems: [
            { domainId: 'python', docId: 1, difficulty: 2 },
            { domainId: 'cpp', docId: 1, difficulty: 9 },
            { domainId: 'python', docId: 1, difficulty: 2 },
        ] });
        const result = await input.instance.getPersonalStats('python');
        assert.deepEqual(input.calls.statistics, [[input.currentDomain, input.currentUser, input.currentUser]]);
        assert.deepEqual(input.calls.collect, [[27]]);
        assert.equal(result.rankingMode, 'all');
        assert.equal(result.rp, 278);
        assert.equal(result.rank, 3);
        assert.equal(result.acDifficulty.total, 2);
        assert.equal(result.acDifficulty.highestLevel, 9);
        assert.equal(result.acDifficulty.levels[1].count, 1);
        assert.equal(result.acDifficulty.levels[8].count, 1);
        assert.equal('mistakes' in result, false);
    });

    it('uses only the accepted problems supplied by the current-domain statistics', async () => {
        const { instance } = fixture({ rankingMode: 'single', problems: [
            { domainId: 'python', docId: 2, difficulty: 4 },
            { domainId: 'python', docId: 3 },
        ] });
        const result = await instance.getPersonalStats('python');
        assert.equal(result.rankingMode, 'single');
        assert.equal(result.acDifficulty.total, 2);
        assert.equal(result.acDifficulty.unrated, 1);
        assert.equal(result.acDifficulty.levels[3].count, 1);
        assert.equal(result.acDifficulty.highestLevel, 4);
    });

    it('retains the existing AC growth result and timezone input', async () => {
        const input = fixture({ timezone: 'Asia/Tokyo' });
        const result = await input.instance.getPersonalStats('python');
        assert.deepEqual(input.calls.growth, [[input.context, input.currentDomain, 27, 'Asia/Tokyo']]);
        assert.equal(result.newAc7, input.growth.newAc7);
        assert.equal(result.newAc30, input.growth.newAc30);
        assert.deepEqual(result.weeklyAc, input.growth.weeklyAc);
    });

    it('renders a zero-safe distribution and retains the fallback timezone', async () => {
        const input = fixture({ timezone: null });
        const result = await input.instance.getPersonalStats('python');
        assert.equal(input.calls.growth[0][3], 'Asia/Shanghai');
        assert.equal(result.acDifficulty.total, 0);
        assert.equal(result.acDifficulty.highestLevel, null);
        assert.equal(result.acDifficulty.levels.length, 10);
        assert.ok(result.acDifficulty.levels.every((level) => level.count === 0));
    });
});
