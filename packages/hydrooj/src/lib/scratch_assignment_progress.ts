import type { ScratchAssignment, ScratchSubmission, ScratchWork } from '../model/scratch';
import { ScratchReviewStatus, submissionFullyCorrect, submissionReviewStatus } from './scratch_review';

interface QuizResult {
    assignmentId: unknown; owner: number; revision: string; updatedAt?: Date;
    answers?: Record<string, { correct?: boolean }>;
}
export interface AssignmentLearnerState {
    owner: number; uid: number; status: 'new' | 'draft' | 'submitted' | 'reviewed' | 'completed' | 'changes_requested';
    completed: boolean; hasFeedback: boolean; workId: unknown; hasSavedWork: boolean;
    changesRequested: boolean; fullyCorrect: boolean; reviewStatus: ScratchReviewStatus | null; feedbackReviewStatus: ScratchReviewStatus | null;
    submissionId: unknown; reviewed: boolean; grade: string | null; feedback: string;
    feedbackSubmissionId: unknown; submittedAt: Date | null; reviewedAt: Date | null; latestRevision: number | null; feedbackRevision: number | null;
    objectiveAnswered: number; objectiveTotal: number; objectiveCorrect: number; objectiveCompleted: boolean;
    objectiveScore: number; objectiveTotalScore: number; objectiveUpdatedAt: Date | null; projectSubmitted: boolean; projectRequired: boolean; overdue: boolean; deadlinePassed: boolean; hasUnsubmittedChanges: boolean;
    historical?: boolean;
}
export function learnerAssignmentState(
    assignment: ScratchAssignment, uid: number, work?: Partial<ScratchWork>, latest?: Partial<ScratchSubmission>,
    feedback?: Partial<ScratchSubmission>, result?: QuizResult, now = Date.now(),
): AssignmentLearnerState {
    const items = assignment.objectiveQuiz?.items || [];
    const answers = result?.revision === assignment.objectiveQuiz?.revision ? result?.answers || {} : {};
    const answered = items.filter((item) => answers[item.id]);
    const correct = answered.filter((item) => answers[item.id].correct);
    const projectRequired = assignment.projectRequired !== false;
    const objectiveCompleted = answered.length === items.length;
    const reviewStatus = submissionReviewStatus(latest);
    const changesRequested = projectRequired && reviewStatus === 'changes_requested';
    const projectCompleted = reviewStatus === 'completed' || reviewStatus === 'accepted';
    const completed = objectiveCompleted && (!projectRequired || projectCompleted);
    const status = changesRequested ? 'changes_requested'
        : projectRequired && latest && objectiveCompleted ? (latest.reviewedAt ? 'reviewed' : 'submitted')
            : completed ? 'completed' : work?.currentFileId || latest || answered.length ? 'draft' : 'new';
    return {
        owner: uid, uid, status, completed, hasFeedback: !!feedback?.reviewedAt,
        changesRequested, fullyCorrect: projectRequired && submissionFullyCorrect(latest), reviewStatus, feedbackReviewStatus: submissionReviewStatus(feedback),
        workId: work?._id || null, hasSavedWork: !!work?.currentFileId,
        submissionId: latest?._id || null, reviewed: !!latest?.reviewedAt,
        grade: feedback?.grade ?? null, feedback: feedback?.feedback || '', feedbackSubmissionId: feedback?._id || null,
        submittedAt: latest?.createdAt || null, reviewedAt: feedback?.reviewedAt || null,
        latestRevision: latest?.revision ?? null, feedbackRevision: feedback?.revision ?? null,
        objectiveAnswered: answered.length, objectiveTotal: items.length, objectiveCorrect: correct.length, objectiveCompleted,
        objectiveUpdatedAt: result?.revision === assignment.objectiveQuiz?.revision ? result?.updatedAt || null : null,
        objectiveScore: correct.reduce((sum, item) => sum + item.score, 0),
        objectiveTotalScore: items.reduce((sum, item) => sum + item.score, 0),
        projectSubmitted: !!latest, projectRequired,
        hasUnsubmittedChanges: !!work?.currentFileId && !!latest && work.revision > latest.revision,
        deadlinePassed: !!assignment.deadline && assignment.deadline.getTime() < now,
        overdue: !completed && !!assignment.deadline && assignment.deadline.getTime() < now,
    };
}
export function teacherAssignmentSummary(rows: AssignmentLearnerState[]) {
    const current = rows.filter((row) => !row.historical);
    const completed = current.filter((row) => row.completed).length;
    return {
        total: current.length, completed,
        notStarted: current.filter((row) => row.status === 'new').length,
        inProgress: current.filter((row) => !row.completed && row.status !== 'new').length,
        pendingReview: current.filter((row) => row.projectSubmitted && !row.reviewed).length,
        changesRequested: current.filter((row) => row.changesRequested).length,
        reviewed: current.filter((row) => row.reviewed).length,
        submitted: current.filter((row) => row.projectSubmitted).length,
        completionPercent: current.length ? Math.round(completed / current.length * 100) : 0,
    };
}
export function sortAssignmentLearners(rows: AssignmentLearnerState[]) {
    const priority = (row: AssignmentLearnerState) => row.projectSubmitted && !row.reviewed ? 0 : row.changesRequested ? 1 : !row.completed ? 2 : 3;
    return rows.sort((a, b) => Number(!!a.historical) - Number(!!b.historical) || priority(a) - priority(b)
        || (a.submittedAt?.getTime() || 0) - (b.submittedAt?.getTime() || 0) || a.uid - b.uid);
}
