const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/lib/rp_award.ts'), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module: mod, exports: mod.exports,
});
const { normalizeRpDifficulty, getRpDifficultyMultiplier, calculateProblemRpAward } = mod.exports;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${actual} != ${expected}`);
const calculate = (extra = {}) => calculateProblemRpAward({ solvedBefore: 0, previousValue: 0, nextValue: 1, ...extra });

describe('new earned RP increments', () => {
    it('uses exactly the original formula for the first difficulty-1 question', () => {
        const result = calculate({ difficulty: 1 });
        near(result.baseAward, 52 * Math.log(2));
        near(result.award, 52 * Math.log(2));
        assert.equal(result.delta, 1);
        assert.equal(result.solvedAfter, 1);
        assert.equal(result.multiplier, 1);
    });

    it('telescopes to 52 ln(1 + S) for a long sequence of lowest-difficulty questions', () => {
        let solved = 0;
        let earned = 0;
        for (let question = 0; question < 1_000; question++) {
            const result = calculate({ solvedBefore: solved, difficulty: 1 });
            solved = result.solvedAfter;
            earned += result.award;
        }
        near(earned, 52 * Math.log(1 + solved));
    });

    it('credits partial-score increases using the same lowest-difficulty marginal formula', () => {
        let solved = 0;
        let previous = 0;
        let earned = 0;
        for (const next of [0.13, 0.27, 0.59, 0.83, 1]) {
            const result = calculate({ solvedBefore: solved, previousValue: previous, nextValue: next, difficulty: 1 });
            solved = result.solvedAfter;
            previous = next;
            earned += result.award;
        }
        near(solved, 1);
        near(earned, 52 * Math.log(2));
    });

    it('uses a 10% per explicit difficulty level, capped at a 90% bonus', () => {
        const base = calculate({ difficulty: 1 }).award;
        for (let difficulty = 1; difficulty <= 10; difficulty++) {
            near(calculate({ difficulty }).award, base * (1 + (difficulty - 1) * 0.1));
        }
        near(calculate({ difficulty: 10 }).award, base * 1.9);
        near(calculate({ difficulty: 1000 }).award, base * 1.9);
    });

    it('keeps unmarked and invalid difficulty on the original formula', () => {
        const base = calculate({ difficulty: 1 }).award;
        for (const difficulty of [undefined, null, '', 0, -1, Number.NaN, Infinity, -Infinity, 'unmarked', {}, true]) {
            assert.equal(normalizeRpDifficulty(difficulty), 1);
            assert.equal(getRpDifficultyMultiplier(difficulty), 1);
            near(calculate({ difficulty }).award, base);
        }
    });

    it('normalizes numeric stored difficulty without losing a fractional explicit value', () => {
        assert.equal(normalizeRpDifficulty('7'), 7);
        assert.equal(normalizeRpDifficulty(4.5), 4.5);
        near(getRpDifficultyMultiplier(4.5), 1.35);
    });

    it('never awards the same completed question again in a contest', () => {
        const result = calculate({ solvedBefore: 7, previousValue: 1, nextValue: 1, difficulty: 10, contestMultiplier: 2 });
        assert.equal(result.delta, 0);
        assert.equal(result.award, 0);
        assert.equal(result.solvedAfter, 7);
    });

    it('does not claw back earned RP when a later result or rejudge has a lower score', () => {
        for (const nextValue of [0, 0.15, 0.49]) {
            const result = calculate({ solvedBefore: 3.5, previousValue: 0.5, nextValue, difficulty: 8, contestMultiplier: 2 });
            assert.equal(result.delta, 0);
            assert.equal(result.award, 0);
            assert.equal(result.solvedAfter, 3.5);
        }
    });

    it('cannot farm RP by alternating lower scores and an already credited score', () => {
        const creditedValue = 0.8;
        for (const nextValue of [0, 0.4, 0.79, 0.8, 0.2, 0.8]) {
            assert.equal(calculate({ solvedBefore: 4.8, previousValue: creditedValue, nextValue, contestMultiplier: 2 }).award, 0);
        }
    });

    it('doubles only a newly earned contest increment, including its difficulty bonus', () => {
        const input = { solvedBefore: 12.4, previousValue: 0.4, nextValue: 1, difficulty: 6 };
        const ordinary = calculate(input);
        const contest = calculate({ ...input, contestMultiplier: 2 });
        near(contest.delta, 0.6);
        near(contest.award, ordinary.award * 2);
        near(contest.multiplier, 3);
    });

    it('does not retroactively double an earlier ordinary partial score', () => {
        const ordinary = calculate({ previousValue: 0, nextValue: 0.4 });
        const contest = calculate({ solvedBefore: ordinary.solvedAfter, previousValue: 0.4, nextValue: 1, contestMultiplier: 2 });
        const expected = 52 * Math.log(1.4) + 2 * 52 * Math.log(2 / 1.4);
        near(ordinary.award + contest.award, expected);
        assert.ok(ordinary.award + contest.award < 2 * 52 * Math.log(2));
    });

    it('does not double a later ordinary increment after a contest partial score', () => {
        const contest = calculate({ previousValue: 0, nextValue: 0.4, contestMultiplier: 2 });
        const ordinary = calculate({ solvedBefore: contest.solvedAfter, previousValue: 0.4, nextValue: 1 });
        near(contest.award + ordinary.award, 2 * 52 * Math.log(1.4) + 52 * Math.log(2 / 1.4));
        assert.equal(ordinary.multiplier, 1);
    });

    it('calculates independent local and shared marginal awards', () => {
        const local = calculate({ solvedBefore: 0, difficulty: 4, contestMultiplier: 2 });
        const shared = calculate({ solvedBefore: 19, difficulty: 4, contestMultiplier: 2 });
        near(local.award, 52 * Math.log(2) * 1.3 * 2);
        near(shared.award, 52 * Math.log(21 / 20) * 1.3 * 2);
        assert.ok(local.award > shared.award);
    });

    it('preserves a small positive increment even with a very large solved count', () => {
        const result = calculate({ solvedBefore: 1e12, previousValue: 0.8, nextValue: 0.800001 });
        assert.ok(result.award > 0);
        near(result.award, 52 * Math.log1p((0.800001 - 0.8) / (1 + 1e12)));
    });

    it('does not round away legitimate small fractional credits', () => {
        const result = calculate({ solvedBefore: 1000, previousValue: 0.9999, nextValue: 1 });
        assert.ok(result.award > 0);
        assert.ok(result.award < 0.01);
    });

    it('caps score ratios and accepts only the verified 2x contest multiplier', () => {
        near(calculate({ previousValue: -10, nextValue: 10 }).award, 52 * Math.log(2));
        assert.equal(calculate({ previousValue: 10, nextValue: 100, contestMultiplier: 2 }).award, 0);
        for (const contestMultiplier of [undefined, 0, -2, 3, '2', Number.NaN]) {
            near(calculate({ contestMultiplier }).award, 52 * Math.log(2));
        }
    });

    it('uses independent value results so later difficulty edits cannot reprice an earlier award', () => {
        const input = { solvedBefore: 6, previousValue: 0, nextValue: 1, difficulty: 3 };
        const earned = calculateProblemRpAward(input);
        const frozenAmount = earned.award;
        input.difficulty = 10;
        assert.equal(earned.award, frozenAmount);
        near(earned.difficultyMultiplier, 1.2);
        near(calculateProblemRpAward(input).difficultyMultiplier, 1.9);
    });
});
