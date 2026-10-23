interface AcceptedProfileProblem {
    domainId: string;
    docId: number;
    difficulty?: unknown;
}

export interface ProfileAcDifficultyLevel {
    level: number;
    count: number;
    /** Share of every visible accepted problem, including ungraded problems. */
    percent: number;
    /** Relative bar length; the most populated level occupies the full track. */
    width: number;
}

export interface ProfileAcDifficulty {
    total: number;
    rated: number;
    unrated: number;
    maxCount: number;
    highestLevel: number | null;
    levels: ProfileAcDifficultyLevel[];
}

const percentage = (count: number, total: number) => (total ? Math.round(count * 1000 / total) / 10 : 0);

/** Summarize only the visible AC problem documents already loaded by the profile. */
export function getProfileAcDifficulty(problems: readonly AcceptedProfileProblem[]): ProfileAcDifficulty {
    const counts = Array.from({ length: 10 }, () => 0);
    const seen = new Set<string>();
    let unrated = 0;
    for (const problem of problems) {
        const key = JSON.stringify([problem.domainId, problem.docId]);
        if (seen.has(key)) continue;
        seen.add(key);
        const { difficulty } = problem;
        // Match the explicit integer levels accepted by the problem editor.
        // Missing or malformed ratings must not appear as a level-1 AC.
        if (typeof difficulty !== 'number' || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10) {
            unrated++;
            continue;
        }
        counts[difficulty - 1]++;
    }
    const total = seen.size;
    const maxCount = Math.max(...counts);
    const highestIndex = counts.findLastIndex((count) => count > 0);
    return {
        total,
        rated: total - unrated,
        unrated,
        maxCount,
        highestLevel: highestIndex < 0 ? null : highestIndex + 1,
        levels: counts.map((count, index) => ({
            level: index + 1,
            count,
            percent: percentage(count, total),
            width: percentage(count, maxCount),
        })),
    };
}
