export type AchievementCategory = 'difficulty' | 'solved' | 'contest_ak' | 'contest_ac' | 'points' | 'mastery' | 'streak' | 'weekly_ac';

export interface AchievementDefinition {
    id: string;
    name: string;
    description: string;
    category: AchievementCategory;
    target: number;
    difficulty?: number;
}

export const ACHIEVEMENT_CATEGORIES: Record<AchievementCategory, string> = {
    difficulty: '初越山海', solved: '题库征途', contest_ak: '赛场称冠',
    contest_ac: '竞赛锋芒', points: '星河成长', mastery: '难度精通', streak: '连续 AC', weekly_ac: '七日冲刺',
};

const firstNames = ['初战告捷', '渐入佳境', '锋芒初露', '势如破竹', '强者进阶',
    '烈火淬锋', '破境而上', '登峰造极', '傲视群雄', '巅峰封神'];
const masteryTargets = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const masteryNames = [
    ['破竹先锋', '破竹新锐', '破竹锐士', '破竹铁骑', '破竹战将',
        '破竹猛将', '破竹战侯', '破竹统领', '破竹大将', '破竹统帅'],
    ['进阶猎手', '进阶锐士', '进阶勇者', '进阶战锋', '进阶斗魂',
        '进阶战魄', '进阶狂锋', '进阶贤者', '进阶大师', '进阶宗师'],
    ['烈焰行者', '烈焰先锋', '烈焰斗士', '烈焰狂战士', '赤焰战王',
        '赤焰统领', '焚天战神', '炼狱裁决者', '炼狱君王', '炼狱之主'],
    ['破境游侠', '破境行者', '破境先锋', '破境斗士', '破境裁决者',
        '破境审判者', '破境尊者', '破境圣者', '破境圣君', '破境天尊'],
    ['云巅挑战者', '云巅行者', '云巅猎鹰', '云巅战将', '云巅征服者',
        '云巅凌霄者', '云巅掌控者', '云巅君王', '天穹征服者', '天穹霸主'],
    ['无双斗士', '无双先锋', '无双猎手', '无双破阵者', '群雄克星',
        '群雄征服者', '无双霸者', '无双裁决者', '无双君临者', '天下无双'],
    ['神域开拓者', '神域征战者', '神域破阵者', '神域圣骑士', '神域裁决者',
        '神域执行官', '神域统领', '神域战皇', '神域至尊', '神域之主'],
];

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
    ...firstNames.map((name, index) => ({
        id: `difficulty-${index + 1}`, name, description: `首次AC难度${index + 1}的题目`,
        category: 'difficulty' as const, target: 1, difficulty: index + 1,
    })),
    ...([
        [10, '十题斩'], [30, '破题先锋'], [60, '解题猎手'], [100, '百题斩'], [150, '百炼锋芒'],
        [200, '破题战将'], [250, '题库猛将'], [300, '破阵统帅'], [350, '解题宗师'],
        [400, '题海征服者'], [450, '题海领主'], [500, '题海霸主'], [1000, '千题封神'],
    ] as const).map(([target, name]) => ({
        id: `solved-${target}`, name,
        description: `题库累计AC${target}道题`, category: 'solved' as const, target,
    })),
    ...[1, 5, 10, 50, 100].map((target, index) => ({
        id: `contest-ak-${target}`, name: ['首次制霸', '五冠猎手', '十冠战神', '赛场霸主', '百冠传奇'][index],
        description: `累计AK${target}场比赛`, category: 'contest_ak' as const, target,
    })),
    ...([
        [1, '赛场首杀'], [5, '赛场新锐'], [10, '竞赛先锋'], [20, '竞技猎手'], [30, '赛场悍将'],
        [40, '竞赛锋刃'], [50, '赛场收割者'], [80, '赛场统帅'], [100, '百题战神'], [300, '竞技主宰'], [500, '竞赛传说'],
    ] as const).map(([target, name]) => ({
        id: `contest-ac-${target}`, name,
        description: `比赛累计AC${target}道题`, category: 'contest_ac' as const, target,
    })),
    ...[1000, 3000, 5000, 10000, 100000].map((target, index) => ({
        id: `points-${target}`, name: ['星火觉醒', '星芒使者', '星耀骑士', '星河领主', '星穹至尊'][index],
        description: `累计获得${target}积分`, category: 'points' as const, target,
    })),
    ...masteryNames.flatMap((names, index) => masteryTargets.map((target, tier) => ({
        id: `mastery-${index + 4}-${target}`, name: names[tier],
        description: `累计AC难度${index + 4}题目${target}道`,
        category: 'mastery' as const, target, difficulty: index + 4,
    }))),
    ...[3, 7, 10, 14, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100].map((target, index) => ({
        id: `streak-${target}`,
        name: ['锋芒初燃', '持之以恒', '十日磨剑', '意志如铁', '破晓行者', '不屈斗魂', '月度战神',
            '百炼成钢', '永恒之刃', '不灭战魂', '传奇征途', '超凡入圣', '九十日神话', '百日封神'][index],
        description: `连续${target}天AC题目`, category: 'streak' as const, target,
    })),
    ...[5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100].map((target, index) => ({
        id: `weekly-ac-${target}`,
        name: ['七日新锐', '七日疾锋', '七日破阵', '七日狂刃', '七日战魂', '七日统帅', '七日霸主', '七日封神',
            '七日战神', '七日至尊', '七日无双', '七日神话', '七日创世神'][index],
        description: `连续7天内累计AC${target}道不同题目`, category: 'weekly_ac' as const, target,
    })),
];

/** Newly introduced tiers use their own rollout clock for silent historical grants. */
export const ACHIEVEMENT_EXPANSION_IDS = new Set([
    ...[30, 60, 150, 200, 250, 300, 350, 400, 450].map((target) => `solved-${target}`),
    ...[5, 20, 30, 40, 80, 300].map((target) => `contest-ac-${target}`),
    ...[5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100].map((target) => `weekly-ac-${target}`),
]);

export const ACHIEVEMENT_MASTERY_EXPANSION_IDS = new Set([4, 5, 6, 7, 8, 9, 10].flatMap((difficulty) =>
    [20, 30, 40, 60, 70, 80, 90].map((target) => `mastery-${difficulty}-${target}`)));

export function getAchievementSeriesId(achievement: Pick<AchievementDefinition, 'category' | 'difficulty'>): string {
    return achievement.category === 'mastery' ? `mastery-${achievement.difficulty}` : achievement.category;
}

export function getAchievementSeriesName(achievement: Pick<AchievementDefinition, 'category' | 'difficulty'>): string {
    return achievement.category === 'mastery' ? `难度${achievement.difficulty}精通` : ACHIEVEMENT_CATEGORIES[achievement.category];
}

export function getAchievementTier(achievement: Pick<AchievementDefinition, 'category' | 'difficulty' | 'target'>): number {
    return achievement.category === 'difficulty' ? achievement.difficulty! : achievement.target;
}

const definitionsById = new Map(ACHIEVEMENT_CATALOG.map((achievement) => [achievement.id, achievement]));
export const ACHIEVEMENT_SERIES_COUNT = new Set(ACHIEVEMENT_CATALOG.map(getAchievementSeriesId)).size;

/** The caller supplies earned rows only. Unknown IDs never authorize a series or tier. */
export function selectHighestAchievements<T extends { id: string }>(achievements: readonly T[]): T[] {
    const highest = new Map<string, { row: T; rank: number }>();
    for (const row of achievements) {
        const definition = definitionsById.get(row.id);
        if (!definition) continue;
        const series = getAchievementSeriesId(definition);
        const rank = getAchievementTier(definition);
        if (!highest.has(series) || highest.get(series)!.rank < rank) highest.set(series, { row, rank });
    }
    const winners = new Set([...highest.values()].map((entry) => entry.row));
    // Keep the established wall order or oldest-pending order supplied by the caller.
    return achievements.filter((row) => winners.delete(row));
}

export interface AchievementMetrics {
    solved: number;
    difficulties: Record<number, number>;
    contestAc: number;
    contestAk: number;
    points: number;
    streakBest?: number;
    streakNextAc?: number;
    weeklyAcBest?: number;
    weeklyAcCurrent?: number;
}

export function evaluateAchievementProgress(metrics: AchievementMetrics) {
    return ACHIEVEMENT_CATALOG.map((achievement) => {
        const value = achievement.difficulty ? metrics.difficulties[achievement.difficulty] || 0
            : ({
                solved: metrics.solved, contest_ac: metrics.contestAc, contest_ak: metrics.contestAk, points: metrics.points,
                streak: metrics.streakBest,
                weekly_ac: metrics.weeklyAcBest,
            })[achievement.category];
        const progress = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
        return {
            ...achievement, progress: Math.min(progress, achievement.target), achieved: progress >= achievement.target,
            ...(achievement.category === 'streak' ? { nextAcProgress: Math.max(0, Math.floor(metrics.streakNextAc || 0)) } : {}),
            ...(achievement.category === 'weekly_ac' ? { currentWindowProgress: Math.max(0, Math.floor(metrics.weeklyAcCurrent || 0)) } : {}),
        };
    });
}
