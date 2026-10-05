import { dump } from 'js-yaml';
import { ValidationError } from '../error';

export type ObjectiveKind = 'single' | 'multiple' | 'judge';

/** Kept outside public problem projections: includes the answer key and teaching notes. */
export interface ObjectiveQuestion {
    version: 1;
    kind: ObjectiveKind;
    stem: string;
    options: string[];
    answers: string[];
    analysis: string;
}

function invalid(field: string, message: string): never {
    throw new ValidationError(field, null, message);
}

function text(value: unknown, field: string, max: number, optional = false): string {
    if (typeof value !== 'string') invalid(field, '请填写文字内容');
    const result = value.trim().replace(/\r\n?/g, '\n');
    if ((!optional && !result) || result.length > max) invalid(field, `内容不能为空且不能超过 ${max} 字`);
    return result;
}

export function parseObjective(source: string): ObjectiveQuestion {
    if (typeof source !== 'string' || source.length > 65535) invalid('objective', '客观题内容过长或格式错误');
    let value: any;
    try {
        value = JSON.parse(source);
    } catch {
        invalid('objective', '客观题数据格式错误，请刷新后重试');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1
        || !['single', 'multiple', 'judge'].includes(value.kind)) invalid('objective', '请选择有效的题型');
    const stem = text(value.stem, 'stem', 20000);
    const analysis = text(value.analysis ?? '', 'analysis', 20000, true);
    // The statement renderer interprets these markers as additional answer inputs.
    if (/\{\{\s*(?:input|select|multiselect|textarea)\(/.test(stem)) invalid('stem', '题干不能包含答题控件标记');
    if (!Array.isArray(value.options)) invalid('options', '请填写选项');
    const options = value.kind === 'judge'
        ? ['正确', '错误']
        : value.options.map((item: unknown) => text(item, 'options', 4000));
    if (options.length < 2 || options.length > 8) invalid('options', '选择题需要 2 至 8 个选项');
    if (new Set(options).size !== options.length) invalid('options', '选项内容不能重复');
    if (options.some((item) => /\{\{\s*(?:input|select|multiselect|textarea)\(/.test(item))) {
        invalid('options', '选项不能包含答题控件标记');
    }
    if (!Array.isArray(value.answers) || value.answers.some((answer: unknown) =>
        typeof answer !== 'string' || !/^[A-H]$/.test(answer) || answer.charCodeAt(0) - 65 >= options.length)) {
        invalid('answers', '请选择有效的正确答案');
    }
    const answers = [...new Set<string>(value.answers)].sort();
    if (answers.length !== value.answers.length
        || (value.kind === 'multiple' ? answers.length < 2 : answers.length !== 1)) {
        invalid('answers', value.kind === 'multiple' ? '多选题至少需要 2 个正确答案' : '请选择 1 个正确答案');
    }
    return { version: 1, kind: value.kind, stem, options, answers, analysis };
}

export function parseObjectiveTags(tags: string[]): string[] {
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) invalid('tag', '请填写知识点标签');
    const result = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
    if (!result.length || result.length > 20 || result.some((tag) => tag.length > 40)) {
        invalid('tag', '请添加 1 至 20 个知识点标签，每个不超过 40 字');
    }
    return result;
}

export function objectiveContent(objective: ObjectiveQuestion): string {
    const marker = objective.kind === 'multiple' ? 'multiselect' : 'select';
    // Indent continuation lines so every authored option remains exactly one list item.
    const options = objective.options.map((option) => `- ${option.replace(/\n/g, '\n  ')}`).join('\n');
    return `${objective.stem}\n\n{{ ${marker}(1) }}\n\n${options}\n`;
}

export function objectiveConfig(objective: ObjectiveQuestion): string {
    return dump({
        type: 'objective',
        answers: { 1: [objective.kind === 'multiple' ? objective.answers : objective.answers[0], 100] },
    });
}
