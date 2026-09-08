const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const vm = require('node:vm');
const esbuild = require('esbuild');

const source = fs.readFileSync(
    path.join(__dirname, '../packages/hydrooj/src/handler/contest.ts'),
    'utf8',
);

function between(start, end) {
    const startAt = source.indexOf(start);
    const endAt = source.indexOf(end, startAt + start.length);
    assert.ok(startAt >= 0, `Missing start marker: ${start}`);
    assert.ok(endAt > startAt, `Missing end marker: ${end}`);
    return source.slice(startAt, endAt);
}

function loadScopeHelper(onAttach) {
    const helperSource = between(
        'async function attachContestScoreboardOwnedBadges',
        'export class ContestListHandler',
    );
    const compiled = esbuild.transformSync(
        `${helperSource}\nmodule.exports = attachContestScoreboardOwnedBadges;`,
        { loader: 'ts', format: 'cjs', target: 'es2022' },
    ).code;
    const sandbox = {
        module: { exports: {} },
        exports: {},
        attachContestOwnedBadges: onAttach,
        workspace: {
            LEGACY_WORKSPACE_ID: 'tang',
            resolveDomainWorkspaceId: (domain) => domain.workspaceId,
        },
    };
    vm.runInNewContext(compiled, sandbox);
    return sandbox.module.exports;
}

async function resolveAttachArguments({ sourceDomain, entryDomain }) {
    const calls = [];
    const attach = loadScopeHelper((...args) => calls.push(args));
    const ctx = { marker: 'ctx' };
    const udict = { 7: { _id: 7, score: 100, rank: 1 } };
    const before = structuredClone(udict);
    await attach({ ctx, domain: sourceDomain, entryDomain }, udict);
    assert.deepEqual(udict, before);
    assert.equal(calls.length, 1);
    assert.strictEqual(calls[0][0], ctx);
    assert.strictEqual(calls[0][1], udict);
    return calls[0].slice(2);
}

describe('contest scoreboard badge data', () => {
    it('hydrates every HTML scoreboard with the complete owned badge list', () => {
        const embedded = between(
            'export class ContestProblemListHandler',
            'interface BuiltinInput',
        );
        const standalone = between(
            "scoreboard.addView('default'",
            "scoreboard.addView('ghost'",
        );

        assert.match(embedded, /await attachContestScoreboardOwnedBadges\(this, contestScoreboardUdict\);/);
        assert.match(standalone, /const \[, rows, udict, pdict\] = await contest\.getScoreboard[\s\S]*await attachContestScoreboardOwnedBadges\(this, udict\);/);
    });

    it('uses a different modern entry domain for badge isolation and links', async () => {
        assert.deepEqual(await resolveAttachArguments({
            sourceDomain: { _id: 'system', workspaceId: 'tang' },
            entryDomain: { _id: 'TEACHER', workspaceId: 'teacher-workspace' },
        }), ['TEACHER', 'TEACHER']);
    });

    it('uses a different legacy entry domain while keeping badges global', async () => {
        assert.deepEqual(await resolveAttachArguments({
            sourceDomain: { _id: 'TEACHER', workspaceId: 'teacher-workspace' },
            entryDomain: { _id: 'Python', workspaceId: 'tang' },
        }), ['Python', undefined]);
    });

    it('falls back to the source domain when there is no separate entry', async () => {
        assert.deepEqual(await resolveAttachArguments({
            sourceDomain: { _id: 'SOURCE', workspaceId: 'source-workspace' },
        }), ['SOURCE', 'SOURCE']);
    });

    it('does not add presentation-only badge data to export views', () => {
        const exports = between(
            "scoreboard.addView('ghost'",
            '\n    });\n}',
        );
        assert.doesNotMatch(exports, /attachContestScoreboardOwnedBadges/);
    });
});
