import type { RecordDoc } from '../interface';
import { parseObjectiveConfig } from './objective_feedback';
import { buildObjectiveInitialSubmission } from './objective_submission';

export interface ObjectiveMergedAttempt {
    rid: string;
    answer: string | string[];
    result: 'correct' | 'incorrect' | 'pending' | 'error';
    submittedAt: string;
}

export interface ObjectiveMergedQuestion {
    id: string;
    result: 'first_correct' | 'correct_after_retry' | 'incorrect' | 'unanswered' | 'pending' | 'error';
    answer?: string | string[];
    attempts: ObjectiveMergedAttempt[];
}

export interface ObjectiveMergedReview {
    uid: number;
    name: string;
    submissionCount: number;
    firstSubmittedAt?: string;
    lastSubmittedAt?: string;
    questions: ObjectiveMergedQuestion[];
    summary: Record<'firstCorrect' | 'correctAfterRetry' | 'incorrect' | 'unanswered' | 'pending' | 'error', number>;
}

function nonempty(answer: string | string[]) {
    return Array.isArray(answer) ? answer.some((value) => value.trim()) : !!answer.trim();
}

function questionResult(attempts: ObjectiveMergedAttempt[]): ObjectiveMergedQuestion['result'] {
    if (!attempts.length) return 'unanswered';
    if (attempts[0].result === 'correct') return 'first_correct';
    const correctIndex = attempts.findIndex((attempt) => attempt.result === 'correct');
    if (correctIndex > 0) {
        if (attempts[0].result === 'incorrect') return 'correct_after_retry';
        // Unknown earlier grades cannot establish whether this was a first-time success.
        return attempts[0].result === 'pending' ? 'pending' : 'error';
    }
    if (attempts.some((attempt) => attempt.result === 'incorrect')) return 'incorrect';
    return attempts.some((attempt) => attempt.result === 'pending') ? 'pending' : 'error';
}

/** Aggregate only authorized records. Standard answers and judge messages are never copied. */
export function buildObjectiveMergedReview(
    records: RecordDoc[], config: unknown, student: { uid: number, name: string },
): ObjectiveMergedReview {
    const parsed = parseObjectiveConfig(config);
    const grading = parsed?.answers;
    const ids = grading && typeof grading === 'object' && !Array.isArray(grading) ? Object.keys(grading) : [];
    const questions: ObjectiveMergedQuestion[] = ids.map((id) => ({ id, result: 'unanswered', attempts: [] }));
    const docs = [...new Map(records.filter((rdoc) => rdoc.uid === student.uid && typeof rdoc.code === 'string'
        && !rdoc.files?.code).map((rdoc) => [rdoc._id.toString(), rdoc])).values()]
        .sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
    for (const rdoc of docs) {
        const { answers, feedback } = buildObjectiveInitialSubmission(rdoc, parsed);
        const marks = new Map((feedback.questions || []).map((question) => [question.id, question]));
        for (const question of questions) {
            const answer = answers[question.id];
            if (answer === undefined || !nonempty(answer)) continue;
            const mark = marks.get(question.id);
            const result = feedback.state === 'complete' && mark?.answered && mark.result !== 'unanswered'
                ? mark.result : feedback.state === 'pending' ? 'pending' : 'error';
            question.attempts.push({
                rid: rdoc._id.toString(), answer, result, submittedAt: rdoc._id.getTimestamp().toISOString(),
            });
        }
    }
    const summary: ObjectiveMergedReview['summary'] = {
        firstCorrect: 0, correctAfterRetry: 0, incorrect: 0, unanswered: 0, pending: 0, error: 0,
    };
    for (const question of questions) {
        question.result = questionResult(question.attempts);
        const latestCorrect = [...question.attempts].reverse().find((attempt) => attempt.result === 'correct');
        const displayed = latestCorrect || question.attempts[question.attempts.length - 1];
        if (displayed) question.answer = displayed.answer;
        const key = question.result === 'first_correct' ? 'firstCorrect'
            : question.result === 'correct_after_retry' ? 'correctAfterRetry' : question.result;
        summary[key]++;
    }
    return {
        ...student,
        submissionCount: docs.length,
        ...(docs.length ? {
            firstSubmittedAt: docs[0]._id.getTimestamp().toISOString(),
            lastSubmittedAt: docs[docs.length - 1]._id.getTimestamp().toISOString(),
        } : {}),
        questions,
        summary,
    };
}
