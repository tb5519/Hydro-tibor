/* eslint-disable no-await-in-loop -- Snapshot files and answers are committed in order. */
import { ObjectId } from 'mongodb';
import { Context } from '../context';
import { NotFoundError, PermissionError, ValidationError } from '../error';
import { gradeAnswer, parseAnswers } from '../lib/daily_quiz';
import { ObjectiveQuestion, parseObjective, rewriteObjectiveFiles } from '../lib/objective';
import db from '../service/db';
import { PERM, PRIV } from './builtin';
import * as document from './document';
import domain from './domain';
import type { ScratchActor, ScratchAssignment } from './scratch';
import storage from './storage';
import user from './user';

export interface ScratchAssignmentQuiz {
    revision: string;
    paperIds: number[];
    files: Record<string, string>;
    statementFiles: string[];
    items: { id: number, paperId: number, paperTitle: string, score: number, objective: ObjectiveQuestion }[];
}
interface ScratchQuizAnswer { selected: string[], correct: boolean, answeredAt: Date }
interface ScratchQuizResult {
    _id: string;
    domainId: string;
    assignmentId: ObjectId;
    revision: string;
    owner: number;
    answers: Record<string, ScratchQuizAnswer>;
    createdAt: Date;
    updatedAt: Date;
}
declare module '../service/db' {
    interface Collections { 'scratch.objective.result': ScratchQuizResult }
}
export const results = db.collection('scratch.objective.result');
const assignments = db.collection('scratch.assignment');

export function parsePaperIds(value: unknown): number[] {
    const parts = Array.isArray(value) ? value : `${value ?? ''}`.split(/[\s,，]+/).filter(Boolean);
    const ids = parts.filter((part) => part !== '').map(Number);
    if (ids.length > 10 || new Set(ids).size !== ids.length || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
        throw new ValidationError('objectivePaperIds', null, '请选择最多 10 套客观题');
    }
    return ids;
}

export async function listPapers(actor: ScratchActor) {
    if (!actor.isTeacher) throw new PermissionError('Scratch 教学管理');
    const docs = await document.getMulti(actor.domainId, document.TYPE_PROBLEM, {
        objectivePaper: { $exists: true }, objectiveKind: { $exists: false }, hidden: false, reference: { $exists: false },
    }, ['docId', 'pid', 'title', 'tag', 'objectivePaper']).sort({ docId: -1 }).limit(500).toArray();
    return docs.filter((doc) => doc.objectivePaper?.items?.length).map((doc) => ({
        docId: doc.docId, pid: doc.pid, title: doc.title, tags: doc.tag,
        questionCount: doc.objectivePaper.items.length,
        totalScore: doc.objectivePaper.items.reduce((sum, item) => sum + item.score, 0),
    }));
}

export async function snapshotQuiz(actor: ScratchActor, paperIds: number[], current?: ScratchAssignment): Promise<ScratchAssignmentQuiz | null> {
    if (!actor.isTeacher) throw new PermissionError('Scratch 教学管理');
    if (JSON.stringify(current?.objectiveQuiz?.paperIds || []) === JSON.stringify(paperIds)) return current?.objectiveQuiz || null;
    if (current?.objectiveQuiz && (current.objectiveStarted || await results.findOne({ domainId: actor.domainId, assignmentId: current._id }))) {
        throw new ValidationError('objectivePaperIds', null, '已有学员开始答题，请新建作业调整题目，以保留原有答题记录');
    }
    if (!paperIds.length) return null;
    const sources = await document.getMulti(actor.domainId, document.TYPE_PROBLEM, {
        docId: { $in: paperIds }, objectivePaper: { $exists: true }, objectiveKind: { $exists: false },
        hidden: false, reference: { $exists: false },
    }, ['docId', 'title', 'objectivePaper', 'additional_file']).toArray();
    const quiz: ScratchAssignmentQuiz = { revision: new ObjectId().toHexString(), paperIds, files: {}, statementFiles: [], items: [] };
    try {
        for (const paperId of paperIds) {
            const source = sources.find((doc) => doc.docId === paperId);
            if (!source?.objectivePaper?.items?.length) throw new ValidationError('objectivePaperIds', null, '所选题卷已不可用，请重新选择');
            for (const item of source.objectivePaper.items) {
                if (quiz.items.length >= 100) throw new ValidationError('objectivePaperIds', null, '一次作业最多加入 100 道客观题');
                if (!Number.isFinite(item.score) || item.score <= 0) throw new ValidationError('objectivePaperIds');
                const copies: { source: string, target: string }[] = [];
                const renamed = new Map<string, string>();
                const questionId = quiz.items.length + 1;
                const original = await document.get(actor.domainId, document.TYPE_PROBLEM, item.sourceId, ['additional_file']);
                const rename = (name: string, analysis = false) => {
                    const paperFile = source.additional_file?.some((file) => file.name === name);
                    const analysisFile = analysis && original?.additional_file?.some((file) => file.name === name);
                    const sourceId = analysisFile ? item.sourceId : paperFile ? paperId : null;
                    if (!sourceId) throw new ValidationError('objectivePaperIds', null, '题卷附件不完整，请先修复题卷');
                    const key = `${sourceId}:${name}`;
                    if (!renamed.has(key)) {
                        const filename = `q${questionId}-${renamed.size + 1}-${name}`;
                        const target = `scratch-objective/${actor.domainId}/${quiz.revision}/${filename}`;
                        renamed.set(key, filename);
                        copies.push({ source: `problem/${actor.domainId}/${sourceId}/additional_file/${name}`, target });
                        quiz.files[filename] = target;
                    }
                    return renamed.get(key);
                };
                const objective = rewriteObjectiveFiles(parseObjective(JSON.stringify(item.objective)), rename);
                objective.analysis = rewriteObjectiveFiles({ ...objective, stem: objective.analysis, options: [] },
                    (name) => rename(name, true)).stem;
                for (const copy of copies) await storage.copy(copy.source, copy.target);
                const statements = `${objective.stem}\n${objective.options.join('\n')}`;
                for (const match of statements.matchAll(/file:\/\/([^\s<>"')\]]+)/g)) {
                    quiz.statementFiles.push(decodeURIComponent(match[1].split(/[?#]/)[0]));
                }
                quiz.items.push({ id: questionId, paperId, paperTitle: source.title, score: item.score, objective });
            }
        }
        return quiz;
    } catch (error) {
        await storage.del(Object.values(quiz.files));
        throw error;
    }
}

function resultId(actor: ScratchActor, assignment: ScratchAssignment, uid: number) {
    return `${actor.domainId}:${assignment._id}:${assignment.objectiveQuiz.revision}:${uid}`;
}

export function summarize(quiz: ScratchAssignmentQuiz, result?: ScratchQuizResult | null) {
    const answered = quiz.items.filter((item) => result?.answers?.[item.id]);
    const correct = answered.filter((item) => result.answers[item.id].correct);
    return {
        total: quiz.items.length, answered: answered.length, correct: correct.length,
        score: correct.reduce((sum, item) => sum + item.score, 0), totalScore: quiz.items.reduce((sum, item) => sum + item.score, 0),
        completed: answered.length === quiz.items.length,
    };
}

export async function getState(actor: ScratchActor, assignment: ScratchAssignment, uid = actor.uid, fileUrl = (name: string) => name) {
    if (!assignment.objectiveQuiz) throw new NotFoundError('客观题作业');
    if (uid !== actor.uid && !actor.isTeacher) throw new PermissionError('答题记录');
    const quiz = assignment.objectiveQuiz;
    const result = await results.findOne({ _id: resultId(actor, assignment, uid) });
    const text = (value: string) => value.replace(/file:\/\/([^\s<>"')\]]+)/g, (_, name) => fileUrl(decodeURIComponent(name.split(/[?#]/)[0])));
    return {
        title: assignment.title, deadline: assignment.deadline, uid, revision: quiz.revision, readOnly: actor.isTeacher,
        ...summarize(quiz, result),
        items: quiz.items.map((item) => {
            const submitted = result?.answers?.[item.id];
            return {
                id: item.id, paperTitle: item.paperTitle, kind: item.objective.kind, score: item.score,
                stem: text(item.objective.stem), options: item.objective.options.map(text),
                ...(submitted ? { selected: submitted.selected, correct: submitted.correct, answeredAt: submitted.answeredAt } : {}),
                ...(submitted || actor.isTeacher ? { answers: item.objective.answers, analysis: text(item.objective.analysis) } : {}),
            };
        }),
    };
}

export async function answer(
    actor: ScratchActor, assignment: ScratchAssignment, questionId: unknown, input: unknown, revision = assignment.objectiveQuiz?.revision,
) {
    if (actor.isTeacher) throw new PermissionError('教师预览不能提交学员答案');
    const quiz = assignment.objectiveQuiz;
    if (!quiz) throw new NotFoundError('客观题作业');
    if (revision !== quiz.revision) throw new ValidationError('revision', null, '老师调整了题目，请刷新后重新开始');
    const item = quiz.items.find((entry) => entry.id === Number(questionId));
    if (!item) throw new ValidationError('questionId');
    const _id = resultId(actor, assignment, actor.uid);
    const previous = await results.findOne({ _id });
    if (previous?.answers?.[item.id]) return;
    if (assignment.deadline && assignment.deadline.getTime() < Date.now()) throw new ValidationError('deadline', null, '作业已截止，可以继续查看已答题目');
    if (item.objective.kind === 'judge' && (!Array.isArray(input) || input.length !== 1)) throw new ValidationError('answers');
    const selected = parseAnswers(input, item.objective);
    const locked = await assignments.updateOne({ _id: assignment._id, domainId: actor.domainId, 'objectiveQuiz.revision': quiz.revision }, {
        $set: { objectiveStarted: true },
    });
    if (!locked.matchedCount) throw new ValidationError('revision', null, '老师调整了题目，请刷新后重新开始');
    const now = new Date();
    await results.updateOne({ _id }, { $setOnInsert: {
        domainId: actor.domainId, assignmentId: assignment._id, revision: quiz.revision,
        owner: actor.uid, answers: {}, createdAt: now, updatedAt: now,
    } }, { upsert: true });
    await results.updateOne({ _id, [`answers.${item.id}`]: { $exists: false } }, { $set: {
        [`answers.${item.id}`]: { selected, correct: gradeAnswer(item.objective, selected), answeredAt: now }, updatedAt: now,
    } });
}

export async function getResults(actor: ScratchActor, assignment: ScratchAssignment) {
    if (!actor.isTeacher) throw new PermissionError('Scratch 教学管理');
    if (!assignment.objectiveQuiz) return [];
    const docs = await results.find({ domainId: actor.domainId, assignmentId: assignment._id, revision: assignment.objectiveQuiz.revision })
        .sort({ updatedAt: -1 }).limit(1000).toArray();
    const members = await domain.collUser.find({ domainId: actor.domainId, join: true, blockedByStudentManagement: { $ne: true } })
        .project<{ uid: number }>({ uid: 1 }).limit(1000).toArray();
    const learners = await Promise.all(members.map(async (member) => {
        const account = await user.getById(actor.domainId, member.uid);
        return account?.hasPriv(PRIV.PRIV_USER_PROFILE) && !account.hasPerm(PERM.PERM_EDIT_DOMAIN) ? member.uid : null;
    }));
    return [...new Set([...docs.map((doc) => doc.owner), ...learners.filter((uid) => uid !== null)])].map((uid) => {
        const doc = docs.find((entry) => entry.owner === uid);
        return { uid, owner: uid, updatedAt: doc?.updatedAt || null, ...summarize(assignment.objectiveQuiz, doc) };
    });
}

export async function getFile(actor: ScratchActor, assignment: ScratchAssignment, filename: string) {
    const quiz = assignment.objectiveQuiz;
    if (!quiz || !Object.hasOwn(quiz.files, filename)) throw new NotFoundError('题目附件');
    if (!actor.isTeacher && !quiz.statementFiles.includes(filename)) {
        const result = await results.findOne({ _id: resultId(actor, assignment, actor.uid) });
        const questionId = /^q(\d+)-/.exec(filename)?.[1];
        if (!questionId || !result?.answers?.[questionId]) throw new PermissionError('请先回答这道题');
    }
    return quiz.files[filename];
}

export async function apply(ctx: Context) {
    ctx.on('domain/delete', async (domainId) => {
        await results.deleteMany({ domainId });
    });
    await db.ensureIndexes(results, { key: { domainId: 1, assignmentId: 1, revision: 1, updatedAt: -1 }, name: 'scratch_objective_results' });
}
