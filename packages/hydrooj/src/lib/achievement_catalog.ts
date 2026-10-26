export type AchievementCategory = 'difficulty' | 'solved' | 'contest_ak' | 'contest_ac' | 'points' | 'mastery' | 'streak';

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
    contest_ac: '竞赛锋芒', points: '星河成长', mastery: '难度精通', streak: '连续 AC',
};

const firstNames = ['初战告捷', '渐入佳境', '锋芒初露', '势如破竹', '强者进阶',
    '烈火淬锋', '破境而上', '登峰造极', '傲视群雄', '巅峰封神'];
const masteryNames = [
    ['破竹先锋', '破竹战将', '破竹统帅'], ['进阶猎手', '进阶斗魂', '进阶宗师'],
    ['烈焰行者', '赤焰战王', '炼狱之主'], ['破境游侠', '破境裁决者', '破境天尊'],
    ['云巅挑战者', '云巅征服者', '天穹霸主'], ['无双斗士', '群雄克星', '天下无双'],
    ['神域开拓者', '神域裁决者', '神域之主'],
];

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
    ...firstNames.map((name, index) => ({
        id: `difficulty-${index + 1}`, name, description: `首次AC难度${index + 1}的题目`,
        category: 'difficulty' as const, target: 1, difficulty: index + 1,
    })),
    ...[10, 100, 500, 1000].map((target, index) => ({
        id: `solved-${target}`, name: ['十题斩', '百题斩', '题海霸主', '千题封神'][index],
        description: `题库累计AC${target}道题`, category: 'solved' as const, target,
    })),
    ...[1, 5, 10, 50, 100].map((target, index) => ({
        id: `contest-ak-${target}`, name: ['首次制霸', '五冠猎手', '十冠战神', '赛场霸主', '百冠传奇'][index],
        description: `累计AK${target}场比赛`, category: 'contest_ak' as const, target,
    })),
    ...[1, 10, 50, 100, 500].map((target, index) => ({
        id: `contest-ac-${target}`, name: ['赛场首杀', '竞赛先锋', '赛场收割者', '百题战神', '竞赛传说'][index],
        description: `比赛累计AC${target}道题`, category: 'contest_ac' as const, target,
    })),
    ...[1000, 3000, 5000, 10000, 100000].map((target, index) => ({
        id: `points-${target}`, name: ['星火觉醒', '星芒使者', '星耀骑士', '星河领主', '星穹至尊'][index],
        description: `累计获得${target}积分`, category: 'points' as const, target,
    })),
    ...masteryNames.flatMap((names, index) => [10, 50, 100].map((target, tier) => ({
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
];

export interface AchievementMetrics {
    solved: number;
    difficulties: Record<number, number>;
    contestAc: number;
    contestAk: number;
    points: number;
    streakBest?: number;
    streakNextAc?: number;
}

export function evaluateAchievementProgress(metrics: AchievementMetrics) {
    return ACHIEVEMENT_CATALOG.map((achievement) => {
        const value = achievement.difficulty ? metrics.difficulties[achievement.difficulty] || 0
            : ({
                solved: metrics.solved, contest_ac: metrics.contestAc, contest_ak: metrics.contestAk, points: metrics.points,
                streak: metrics.streakBest,
            })[achievement.category];
        const progress = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
        return {
            ...achievement, progress: Math.min(progress, achievement.target), achieved: progress >= achievement.target,
            ...(achievement.category === 'streak' ? { nextAcProgress: Math.max(0, Math.floor(metrics.streakNextAc || 0)) } : {}),
        };
    });
}
