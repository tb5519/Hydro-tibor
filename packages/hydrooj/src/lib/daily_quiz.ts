import { createHash } from 'crypto';
import { ValidationError } from '../error';
import type { ObjectiveKind, ObjectiveQuestion } from './objective';

/** Keep the teacher catalog, daily selection and immutable snapshots on the same question types. */
export const DAILY_QUIZ_KINDS: ObjectiveKind[] = ['single', 'multiple', 'judge'];

export interface DailyQuizDomainPolicy {
    domainId: string;
    enabled: boolean;
    count: number;
    tags: string[];
    points: number[];
}

export interface DailyQuizPolicy {
    version: 1;
    enabled: boolean;
    cooldownRounds: number;
    domains: DailyQuizDomainPolicy[];
}

export function defaultPolicy(): DailyQuizPolicy {
    return { version: 1, enabled: false, cooldownRounds: 3, domains: [] };
}

function invalid(message: string): never {
    throw new ValidationError('policy', null, message);
}

export function parsePolicy(input: unknown, allowedDomainIds: string[]): DailyQuizPolicy {
    let value: any = input;
    if (typeof input === 'string') {
        if (input.length > 30000) invalid('每日问答配置过长');
        try {
            value = JSON.parse(input);
        } catch { invalid('每日问答配置格式错误'); }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || (value.version !== undefined && value.version !== 1) || typeof value.enabled !== 'boolean'
        || !Array.isArray(value.domains) || value.domains.length > 100) invalid('每日问答配置格式错误');
    const cooldownRounds = value.cooldownRounds ?? 3;
    if (!Number.isInteger(cooldownRounds) || cooldownRounds < 1 || cooldownRounds > 30) invalid('复习间隔须为 1 至 30 轮');
    const ids = new Set<string>();
    const domains = value.domains.map((item: any) => {
        if (!item || typeof item.domainId !== 'string' || !allowedDomainIds.includes(item.domainId)
            || ids.has(item.domainId) || typeof item.enabled !== 'boolean') invalid('请选择学员已加入的域，且不能重复');
        ids.add(item.domainId);
        if (!Number.isInteger(item.count) || item.count < 1 || item.count > 20) invalid('每个域每天可设置 1 至 20 题');
        if (!Array.isArray(item.tags)
            || item.tags.some((tag: unknown) => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 40)) {
            invalid('知识点名称不能为空，每个不超过 40 字');
        }
        if (!Array.isArray(item.points) || item.points.length !== item.count
            || item.points.some((points: unknown) => !Number.isInteger(points) || Number(points) < 0 || Number(points) > 100)) {
            invalid('请为每题设置 0 至 100 的整数积分');
        }
        return {
            domainId: item.domainId, enabled: item.enabled, count: item.count,
            tags: [...new Set<string>(item.tags.map((tag: string) => tag.trim()))], points: [...item.points],
        };
    });
    const enabled = domains.filter((item) => item.enabled);
    if (enabled.length > 10 || enabled.reduce((sum, item) => sum + item.count, 0) > 50) invalid('最多开启 10 个域，每天合计最多 50 题');
    return { version: 1, enabled: value.enabled, cooldownRounds, domains };
}

export function beijingDay(now = new Date()) {
    return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

export function canRepeat(progress: { mastered?: boolean, lastRound?: number, lastDay?: string } | undefined,
    round: number, cooldown: number) {
    if (!progress) return true;
    if (progress.mastered) return false;
    // Empty daily rounds are recorded too, so small pools can cool down safely.
    return round - (progress.lastRound || 0) > cooldown;
}

export function selectionRank(seed: string, sourceId: number) {
    return createHash('sha256').update(`${seed}:${sourceId}`).digest('hex');
}

export function parseAnswers(input: unknown, objective: ObjectiveQuestion): string[] {
    let value: any = input;
    if (typeof input === 'string') {
        try {
            value = JSON.parse(input);
        } catch { throw new ValidationError('answers'); }
    }
    if (!Array.isArray(value) || !value.length || value.length > objective.options.length
        || value.some((item) => typeof item !== 'string' || !/^[A-H]$/.test(item)
            || item.charCodeAt(0) - 65 >= objective.options.length)
        || new Set(value).size !== value.length || (objective.kind !== 'multiple' && value.length !== 1)) {
        throw new ValidationError('answers', null, '请选择有效的答案');
    }
    return [...value].sort();
}

export function gradeAnswer(objective: ObjectiveQuestion, selected: string[]) {
    return selected.length === objective.answers.length && selected.every((answer, index) => answer === [...objective.answers].sort()[index]);
}

export function safeReturnUrl(value: unknown, fallback = '/') {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
        || /[\\\r\n]/.test(value) || value.length > 2000) return fallback;
    try {
        const parsed = new URL(value, 'https://daily.invalid');
        if (parsed.origin !== 'https://daily.invalid' || /(?:^|\/)daily-quiz(?:\/|$)/.test(parsed.pathname)) return fallback;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch { return fallback; }
}
