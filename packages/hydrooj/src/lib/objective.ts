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

export interface ObjectivePaperInput {
    version: 1;
    items: { id: number, score: number }[];
}

/** A private snapshot: subsequent source edits must not change a published paper. */
export interface ObjectivePaper {
    version: 1;
    items: {
        sourceId: number;
        score: number;
        title: string;
        tags: string[];
        objective: ObjectiveQuestion;
    }[];
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

export function objectiveContent(objective: ObjectiveQuestion, index = 1): string {
    const marker = objective.kind === 'multiple' ? 'multiselect' : 'select';
    // Indent continuation lines so every authored option remains exactly one list item.
    const options = objective.options.map((option) => `- ${option.replace(/\n/g, '\n  ')}`).join('\n');
    return `${objective.stem}\n\n{{ ${marker}(${index}) }}\n\n${options}\n`;
}

export function objectiveConfig(objective: ObjectiveQuestion): string {
    return dump({
        type: 'objective',
        answers: { 1: [objective.kind === 'multiple' ? objective.answers : objective.answers[0], 100] },
    });
}

export function parseObjectivePaper(source: string): ObjectivePaperInput {
    if (typeof source !== 'string' || source.length > 20000) invalid('paper', '组题内容过长或格式错误');
    let value: any;
    try {
        value = JSON.parse(source);
    } catch {
        invalid('paper', '组题数据格式错误，请刷新后重试');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1
        || !Array.isArray(value.items) || !value.items.length || value.items.length > 100) {
        invalid('paper', '请为这套题选择 1 至 100 道客观题');
    }
    const ids = new Set<number>();
    let total = 0;
    const items = value.items.map((item: any) => {
        if (!item || typeof item !== 'object' || !Number.isSafeInteger(item.id) || item.id <= 0) {
            invalid('paper', '请选择有效的客观题');
        }
        if (ids.has(item.id)) invalid('paper', '同一道客观题不能重复加入');
        if (!Number.isSafeInteger(item.score) || item.score < 1 || item.score > 100) {
            invalid('paper', '每题分值须为 1 至 100 的整数');
        }
        ids.add(item.id);
        total += item.score;
        return { id: item.id as number, score: item.score as number };
    });
    if (total > 1000) invalid('paper', '整套题的总分不能超过 1000 分');
    return { version: 1, items };
}

export function buildObjectivePaper(paper: ObjectivePaper, introduction = ''): { content: string, config: string } {
    const intro = text(introduction, 'content', 20000, true);
    if (/\{\{\s*(?:input|select|multiselect|textarea)\(/.test(intro)) invalid('content', '说明不能包含答题控件标记');
    const names: Record<ObjectiveKind, string> = { single: '单选题', multiple: '多选题', judge: '判断题' };
    const content = paper.items.map(({ objective, score }, index) =>
        `### 第 ${index + 1} 题 · ${names[objective.kind]}（${score} 分）\n\n${objectiveContent(objective, index + 1)}`);
    return {
        content: [intro, ...content].filter(Boolean).join('\n\n---\n\n'),
        config: dump({
            type: 'objective',
            answers: Object.fromEntries(paper.items.map(({ objective, score }, index) => [
                index + 1, [objective.kind === 'multiple' ? objective.answers : objective.answers[0], score],
            ])),
        }),
    };
}

/** Rewrite only statement assets; private analysis never becomes a public attachment. */
export function rewriteObjectiveFiles(objective: ObjectiveQuestion, rename: (filename: string) => string): ObjectiveQuestion {
    const rewrite = (value: string) => value.replace(/file:\/\/([^\s<>"')\]]+)/g, (_, reference: string) => {
        const suffixIndex = reference.search(/[?#]/);
        const encoded = suffixIndex < 0 ? reference : reference.slice(0, suffixIndex);
        const suffix = suffixIndex < 0 ? '' : reference.slice(suffixIndex);
        let filename: string;
        try {
            filename = decodeURIComponent(encoded);
        } catch {
            invalid('paper', '题目中有无效的附件地址，请先编辑原题');
        }
        if (!filename || /[/\\]/.test(filename) || filename.includes('\0')) invalid('paper', '题目中有无效的附件名称，请先编辑原题');
        return `file://${encodeURIComponent(rename(filename))}${suffix}`;
    });
    return { ...objective, stem: rewrite(objective.stem), options: objective.options.map(rewrite) };
}
