export type ObjectiveMergedResult = 'first_correct' | 'correct_after_retry' | 'incorrect' | 'unanswered' | 'pending' | 'error';

export const mergedResultLabel = {
  first_correct: '首次答对', correct_after_retry: '重试后答对', incorrect: '尚未答对',
  unanswered: '未作答', pending: '评测中', error: '评测未完成',
};

export interface ObjectiveMergedAttempt {
  rid: string;
  answer: string | string[];
  result: 'correct' | 'incorrect' | 'pending' | 'error';
  submittedAt: string;
}

export interface ObjectiveMergedQuestion {
  id: string;
  result: ObjectiveMergedResult;
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
  summary: { firstCorrect: number, correctAfterRetry: number, incorrect: number, unanswered: number, pending: number, error: number };
}
