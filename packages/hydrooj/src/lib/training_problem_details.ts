import type { Handler } from '../service/server';
import problem from '../model/problem';
import user from '../model/user';
import type { mergeLearningTime } from './learning_time';
import { trainingDurationEstimate } from './training_dashboard';

type LearningTime = ReturnType<typeof mergeLearningTime>;
export interface ProblemRecord {
    _id: { domainId: string, pid: number };
    submits: number;
    accepted: number | boolean;
}
interface Question {
    domainId: string; docId: number; seconds: number; autonomousSeconds: number; classSeconds: number;
    hasEstimate: boolean; submits: number; accepted: boolean;
}

export async function loadTrainingProblemDetails(
    handler: Handler, times: LearningTime, records: ProblemRecord[], domains: { id: string, name: string }[],
) {
    const names = new Map(domains.map(({ id, name }) => [id, name]));
    const questions = new Map<string, Question>();
    function question(domainId: string, docId: number) {
        const key = JSON.stringify([domainId, docId]);
        let row = questions.get(key);
        if (!row) {
            row = { domainId, docId, seconds: 0, autonomousSeconds: 0, classSeconds: 0,
                hasEstimate: false, submits: 0, accepted: false };
            questions.set(key, row);
        }
        return row;
    }
    let otherPracticeSeconds = 0;
    let otherEstimated = false;
    for (const classroom of times.domains) {
        const unassigned = classroom.unattributedEstimatedSeconds + classroom.unattributedClassTrainingEstimatedSeconds;
        otherPracticeSeconds += unassigned;
        otherEstimated ||= unassigned > 0;
    }
    for (const source of times.sources) {
        const bank = source.problemDomainId || source.domainId;
        const seconds = source.estimatedSeconds + source.classTrainingEstimatedSeconds;
        if (!names.has(bank) || !['problem', 'daily'].includes(source.kind) || !(source.pid > 0)) {
            otherPracticeSeconds += seconds;
            otherEstimated ||= source.hasEstimate;
            continue;
        }
        // Daily quiz and shared-contest sources carry the original problem's
        // numeric document id. A question can be visited via different classrooms.
        const item = question(bank, source.pid);
        item.seconds += source.seconds;
        item.autonomousSeconds += source.estimatedSeconds;
        item.classSeconds += source.classTrainingEstimatedSeconds;
        item.hasEstimate ||= source.hasEstimate || source.classTrainingUpperSeconds - source.classTrainingSeconds > 0.001;
    }
    for (const record of records) {
        if (!names.has(record._id.domainId)) continue;
        const item = question(record._id.domainId, record._id.pid);
        item.submits += record.submits;
        item.accepted ||= !!record.accepted;
    }

    const total = (item: Question) => item.autonomousSeconds + item.classSeconds;
    const ordered = [...questions.values()].sort((a, b) => total(b) - total(a) || b.submits - a.submits
        || a.domainId.localeCompare(b.domainId) || a.docId - b.docId);
    const visible = ordered.slice(0, 50);
    const byBank = new Map<string, number[]>();
    for (const item of visible) {
        if (!byBank.has(item.domainId)) byBank.set(item.domainId, []);
        byBank.get(item.domainId).push(item.docId);
    }
    const banks = new Map(await Promise.all([...byBank].map(async ([id, pids]) => {
        const [viewer, docs] = await Promise.all([
            user.getById(id, handler.user._id),
            problem.getList(id, pids, true, false, ['docId', 'pid', 'title', 'hidden', 'owner', 'maintainer', 'objectiveKind'], true, true),
        ]);
        return [id, { viewer, docs }] as const;
    })));
    const problems = visible.map((row) => {
        const { docs, viewer } = banks.get(row.domainId);
        const found = docs[row.docId];
        const canView = found && viewer && problem.canViewBy(found, viewer);
        const estimatedSeconds = total(row);
        return {
            kind: 'problem', domainId: row.domainId, domainName: names.get(row.domainId),
            pid: canView ? (found.pid || row.docId) : null,
            title: canView ? found.title : (found ? '暂不可查看的题目' : '题目已移除'),
            url: canView ? handler.url('problem_detail', { domainId: row.domainId, pid: found.pid || row.docId }) : '',
            seconds: row.seconds, estimatedSeconds, hasEstimate: row.hasEstimate,
            autonomousSeconds: row.autonomousSeconds, classTrainingSeconds: row.classSeconds,
            timeLabel: trainingDurationEstimate(estimatedSeconds, row.hasEstimate),
            autonomousLabel: trainingDurationEstimate(row.autonomousSeconds, row.hasEstimate),
            classTrainingLabel: row.classSeconds ? trainingDurationEstimate(row.classSeconds, row.hasEstimate) : '',
            submits: row.submits, accepted: row.accepted,
        };
    });
    return { problems, problemLimit: ordered.length > visible.length ? visible.length : null, otherPracticeSeconds,
        otherPracticeLabel: otherPracticeSeconds ? trainingDurationEstimate(otherPracticeSeconds, otherEstimated) : '' };
}
