export type ScratchReviewStatus = 'completed' | 'accepted' | 'changes_requested';

interface ReviewSnapshot { reviewedAt?: unknown, reviewStatus?: unknown, grade?: unknown }

const LEGACY_CHANGES_REQUESTED = new Set(['未完成', '需修改', '需要修改', '待修改', '不合格', '不通过']);
const LEGACY_FULLY_CORRECT = new Set(['ac', 'accepted', '完全正确', '全部正确', '满分', '100', '100分', '100/100']);

// Older reviews only stored a free-text grade. Recognize explicit outcome labels,
// not feedback prose or arbitrary substrings, until those reviews are saved again.
export function submissionReviewStatus(submission?: ReviewSnapshot | null): ScratchReviewStatus | null {
    if (!submission?.reviewedAt) return null;
    if (submission.reviewStatus === 'completed' || submission.reviewStatus === 'accepted' || submission.reviewStatus === 'changes_requested') return submission.reviewStatus;
    const grade = typeof submission.grade === 'string' ? submission.grade.normalize('NFKC').replace(/\s+/g, '').toLowerCase() : '';
    if (LEGACY_CHANGES_REQUESTED.has(grade)) return 'changes_requested';
    return LEGACY_FULLY_CORRECT.has(grade) ? 'accepted' : 'completed';
}

export function submissionFullyCorrect(submission?: ReviewSnapshot | null) {
    return submissionReviewStatus(submission) === 'accepted';
}
