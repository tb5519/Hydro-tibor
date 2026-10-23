/** Award policy snapshots must be stored with the earned-RP ledger. These
 * helpers calculate a new increment only; they never reprice earlier awards. */
export const PROBLEM_RP_LOG_WEIGHT = 52;
export const PROBLEM_RP_DIFFICULTY_STEP = 0.1;

function finiteNumber(value: unknown, fallback: number) {
    if (typeof value !== 'number' && typeof value !== 'string') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

/** Unmarked difficulty keeps the original RP formula. Explicit difficulty is
 * bounded to 1–10; fractional difficulty retains the same linear scale. */
export function normalizeRpDifficulty(difficulty?: unknown) {
    return Math.min(10, Math.max(1, finiteNumber(difficulty, 1)));
}

export function getRpDifficultyMultiplier(difficulty?: unknown) {
    return 1 + (normalizeRpDifficulty(difficulty) - 1) * PROBLEM_RP_DIFFICULTY_STEP;
}

function scoreRatio(value: unknown) {
    return Math.min(1, Math.max(0, finiteNumber(value, 0)));
}

export interface ProblemRpAwardInput {
    /** The scope's credited score-ratio sum before this award. Local and shared
     * ledgers must call this separately with their own sums. */
    solvedBefore: number;
    /** This question's previously credited high-water score ratio, in [0, 1]. */
    previousValue: number;
    /** The new eligible result's score ratio, in [0, 1]. */
    nextValue: number;
    /** Use the immutable explicit difficulty snapshot from the source event. */
    difficulty?: unknown;
    /** Set 2 only after verifying a real contest; all other contexts use 1. */
    contestMultiplier?: 1 | 2;
}

export interface ProblemRpAward {
    delta: number;
    solvedAfter: number;
    baseAward: number;
    difficultyMultiplier: number;
    multiplier: number;
    award: number;
}

/** Positive high-water increments telescope to the original 52·ln(1 + S)
 * formula at difficulty 1. A lower score, rejudge or duplicate AC earns zero.
 * `log1p` preserves small increments for students with a large solved count. */
export function calculateProblemRpAward(input: ProblemRpAwardInput): ProblemRpAward {
    const solvedBefore = Math.max(0, finiteNumber(input.solvedBefore, 0));
    const previousValue = scoreRatio(input.previousValue);
    const nextValue = scoreRatio(input.nextValue);
    const delta = Math.max(0, nextValue - previousValue);
    const baseAward = PROBLEM_RP_LOG_WEIGHT * Math.log1p(delta / (1 + solvedBefore));
    const difficultyMultiplier = getRpDifficultyMultiplier(input.difficulty);
    const multiplier = difficultyMultiplier * (input.contestMultiplier === 2 ? 2 : 1);
    return {
        delta,
        solvedAfter: solvedBefore + delta,
        baseAward,
        difficultyMultiplier,
        multiplier,
        award: baseAward * multiplier,
    };
}
