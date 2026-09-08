import { load } from 'js-yaml';
import type { RecordDoc } from '../interface';
import { STATUS } from '../model/builtin';

export interface ObjectiveQuestionFeedback {
    id: string;
    answered: boolean;
    result: 'correct' | 'incorrect' | 'unanswered';
    score: number;
    maxScore: number;
}

export interface ObjectiveFeedback {
    rid: string;
    state: 'pending' | 'complete' | 'hidden' | 'error';
    score?: number;
    totalScore?: number;
    questions?: ObjectiveQuestionFeedback[];
    scorePointAward?: RecordDoc['scorePointAward'];
}

export function parseObjectiveConfig(config: unknown): Record<string, unknown> | null {
    try {
        const parsed = typeof config === 'string' ? load(config) : config;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
            || (parsed as any).type !== 'objective') return null;
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

function finiteScore(value: unknown) {
    const score = Number(value);
    return Number.isFinite(score) ? Math.max(0, score) : 0;
}

function caseKey(subtaskId: number, id?: number) {
    // Judge callbacks normalize a standalone question's absent case id to zero.
    return `${subtaskId || 0}/${id || 0}`;
}

/** Return only the student's marks; grading keys and judge messages never leave the server. */
export function buildObjectiveFeedback(rdoc: RecordDoc, config: Record<string, unknown>): ObjectiveFeedback {
    const base = { rid: rdoc._id.toString() };
    if ([STATUS.STATUS_WAITING, STATUS.STATUS_FETCHED, STATUS.STATUS_COMPILING, STATUS.STATUS_JUDGING].includes(rdoc.status)) {
        return { ...base, state: 'pending' };
    }
    if (![STATUS.STATUS_ACCEPTED, STATUS.STATUS_WRONG_ANSWER].includes(rdoc.status)
        || !Number.isFinite(rdoc.score)) return { ...base, state: 'error' };
    const grading = config.answers;
    if (!grading || typeof grading !== 'object' || Array.isArray(grading) || !Object.keys(grading).length) {
        return { ...base, state: 'error' };
    }
    let submitted: Record<string, unknown>;
    try {
        const parsed = load(rdoc.code || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...base, state: 'error' };
        submitted = parsed as Record<string, unknown>;
    } catch {
        return { ...base, state: 'error' };
    }
    const cases = new Map((rdoc.testCases || []).map((testCase) => [caseKey(testCase.subtaskId, testCase.id), testCase]));
    const questions: ObjectiveQuestionFeedback[] = [];
    for (const [id, gradingInfo] of Object.entries(grading)) {
        const [subtaskId, caseId] = id.split('-').map(Number);
        const testCase = cases.get(caseKey(subtaskId, caseId));
        // A partially persisted or projected record must not become a false wrong answer.
        if (!testCase || ![STATUS.STATUS_ACCEPTED, STATUS.STATUS_WRONG_ANSWER].includes(testCase.status)
            || !Number.isFinite(testCase.score)) {
            return { ...base, state: 'error' };
        }
        const answer = Object.hasOwn(submitted, id) ? submitted[id] : undefined;
        const answered = Array.isArray(answer)
            ? answer.some((value) => String(value ?? '').trim().length > 0)
            : !!answer && String(answer).trim().length > 0;
        const maxScore = Array.isArray(gradingInfo)
            ? finiteScore(gradingInfo[1])
            : Math.max(0, ...Object.values(gradingInfo || {}).map(finiteScore));
        questions.push({
            id,
            answered,
            result: !answered ? 'unanswered' : testCase.status === STATUS.STATUS_ACCEPTED ? 'correct' : 'incorrect',
            score: finiteScore(testCase.score),
            maxScore,
        });
    }
    return {
        ...base,
        state: 'complete',
        score: rdoc.score,
        totalScore: +questions.reduce((total, question) => total + question.maxScore, 0).toFixed(10),
        questions,
        ...(rdoc.scorePointAward ? { scorePointAward: rdoc.scorePointAward } : {}),
    };
}
